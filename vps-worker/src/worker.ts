import { sb, WORKER_ID, emitEvent, maybeFinalizeMission } from "./lib/supabase";
import { executors } from "./executors";
import { pollAndProcessRoundtable } from "./roundtable";
import { pollAndProcessInitiative } from "./initiatives/process";

const MIN_SLEEP = 5_000;
const MAX_SLEEP = 15_000;

function jitterSleep(): Promise<void> {
  const ms = MIN_SLEEP + Math.random() * (MAX_SLEEP - MIN_SLEEP);
  return new Promise((r) => setTimeout(r, ms));
}

async function claimStep() {
  const { data, error } = await sb.rpc("claim_next_step", {
    p_worker_id: WORKER_ID,
  });

  if (error) {
    console.error("[worker] claim error:", error.message);
    return null;
  }

  // RPC returns an array; take the first row
  const rows = Array.isArray(data) ? data : [data];
  return rows[0] ?? null;
}

async function processStep(step: {
  id: string;
  mission_id: string;
  kind: string;
  payload: Record<string, unknown>;
}) {
  const executor = executors[step.kind];

  if (!executor) {
    // Unknown step kind
    await sb
      .from("ops_mission_steps")
      .update({ status: "failed", last_error: `unknown kind: ${step.kind}` })
      .eq("id", step.id);

    await emitEvent("step:failed", ["step", "failed", step.kind], {
      step_id: step.id,
      mission_id: step.mission_id,
      error: `unknown kind: ${step.kind}`,
    });

    await maybeFinalizeMission(step.mission_id);
    return;
  }

  try {
    const result = await executor(sb, { id: step.id, payload: step.payload });

    if (result.ok) {
      await sb
        .from("ops_mission_steps")
        .update({ status: "succeeded", output: result.output ?? {} })
        .eq("id", step.id);

      await emitEvent("step:succeeded", ["step", "succeeded", step.kind], {
        step_id: step.id,
        mission_id: step.mission_id,
        output: result.output,
      });

      // ── Step output chaining: promote next pending step to queued with merged payload ──
      {
        const { data: nextSteps } = await sb
          .from("ops_mission_steps")
          .select("id, payload")
          .eq("mission_id", step.mission_id)
          .in("status", ["pending", "queued"])
          .order("created_at", { ascending: true })
          .limit(1);

        if (nextSteps && nextSteps.length > 0) {
          const next = nextSteps[0];
          const outputData = result.output && typeof result.output === "object" ? result.output : {};
          const merged = { ...outputData, ...next.payload, mission_id: step.mission_id };
          await sb
            .from("ops_mission_steps")
            .update({ payload: merged, status: "queued" })
            .eq("id", next.id);
        }
      }
    } else {
      await sb
        .from("ops_mission_steps")
        .update({ status: "failed", last_error: result.error ?? "unknown" })
        .eq("id", step.id);

      await emitEvent("step:failed", ["step", "failed", step.kind], {
        step_id: step.id,
        mission_id: step.mission_id,
        error: result.error,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb
      .from("ops_mission_steps")
      .update({ status: "failed", last_error: message })
      .eq("id", step.id);

    await emitEvent("step:failed", ["step", "failed", step.kind], {
      step_id: step.id,
      mission_id: step.mission_id,
      error: message,
    });
  }

  await maybeFinalizeMission(step.mission_id);
}

async function main() {
  console.log(`[worker] starting as ${WORKER_ID}`);

  while (true) {
    const step = await claimStep();

    if (!step) {
      // No steps to process — try roundtable, then initiatives
      const didRoundtable = await pollAndProcessRoundtable();
      if (!didRoundtable) {
        const didInitiative = await pollAndProcessInitiative();
        if (!didInitiative) {
          await jitterSleep();
        }
      }
      continue;
    }

    console.log(`[worker] claimed step ${step.id} (kind=${step.kind})`);
    await processStep(step);
    console.log(`[worker] finished step ${step.id}`);
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
