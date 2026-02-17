import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

export const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const WORKER_ID = process.env.WORKER_ID ?? "worker-default";

export async function emitEvent(
  type: string,
  tags: string[],
  payload: Record<string, unknown>
) {
  await sb.from("ops_agent_events").insert({
    type,
    tags,
    actor: WORKER_ID,
    payload,
  });
}

/**
 * Check if all steps for a mission are done and finalize.
 * Duplicated from control plane so the worker can finalize without HTTP calls.
 */
export async function maybeFinalizeMission(missionId: string) {
  const { data: steps } = await sb
    .from("ops_mission_steps")
    .select("status")
    .eq("mission_id", missionId);

  if (!steps || steps.length === 0) return;

  const statuses = steps.map((s) => s.status);
  if (statuses.includes("queued") || statuses.includes("running")) return;

  const hasFailed = statuses.includes("failed");
  const finalStatus = hasFailed ? "failed" : "succeeded";

  await sb
    .from("ops_missions")
    .update({ status: finalStatus, finalized_at: new Date().toISOString() })
    .eq("id", missionId)
    .eq("status", "running");

  await emitEvent(`mission:${finalStatus}`, ["mission", finalStatus], {
    mission_id: missionId,
  });
}
