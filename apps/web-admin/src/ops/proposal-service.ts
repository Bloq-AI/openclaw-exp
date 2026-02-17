import { SupabaseClient } from "@supabase/supabase-js";
import { checkGates } from "./gates";

interface ProposalInput {
  source?: "manual" | "trigger" | "reaction" | "api";
  title: string;
  summary?: string;
  step_kinds: string[];
  payload?: Record<string, unknown>;
}

interface ProposalResult {
  proposal_id: string;
  status: "approved" | "rejected" | "pending";
  mission_id?: string;
  rejection_reason?: string;
}

/**
 * THE single entry point for creating proposals.
 * Validates → checks gates → inserts proposal → auto-approves if policy allows.
 */
export async function createProposalAndMaybeAutoApprove(
  sb: SupabaseClient,
  input: ProposalInput
): Promise<ProposalResult> {
  const source = input.source ?? "manual";

  // 1. Validate
  if (!input.title || input.step_kinds.length === 0) {
    throw new Error("title and at least one step_kind are required");
  }

  // 2. Check gates
  const gateResult = await checkGates(sb, input.step_kinds);
  if (!gateResult.ok) {
    // Insert as rejected proposal
    const { data: proposal } = await sb
      .from("ops_mission_proposals")
      .insert({
        status: "rejected",
        source,
        title: input.title,
        summary: input.summary,
        step_kinds: input.step_kinds,
        payload: input.payload ?? {},
        rejection_reason: gateResult.reason,
      })
      .select("id")
      .single();

    await emitEvent(sb, "proposal:rejected", ["proposal", "rejected"], {
      proposal_id: proposal!.id,
      reason: gateResult.reason,
    });

    return {
      proposal_id: proposal!.id,
      status: "rejected",
      rejection_reason: gateResult.reason,
    };
  }

  // 3. Insert proposal as pending
  const { data: proposal } = await sb
    .from("ops_mission_proposals")
    .insert({
      status: "pending",
      source,
      title: input.title,
      summary: input.summary,
      step_kinds: input.step_kinds,
      payload: input.payload ?? {},
    })
    .select("id")
    .single();

  const proposalId = proposal!.id;

  await emitEvent(sb, "proposal:created", ["proposal", "created"], {
    proposal_id: proposalId,
    source,
  });

  // 4. Check auto_approve policy
  const { data: autoApprovePolicy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "auto_approve")
    .single();

  const policy = autoApprovePolicy?.json;
  const canAutoApprove =
    policy?.enabled &&
    policy?.allowed_sources?.includes(source) &&
    input.step_kinds.every((k: string) =>
      policy?.allowed_step_kinds?.includes(k)
    );

  if (!canAutoApprove) {
    return { proposal_id: proposalId, status: "pending" };
  }

  // 5. Auto-approve: update proposal, create mission + steps
  await sb
    .from("ops_mission_proposals")
    .update({ status: "approved" })
    .eq("id", proposalId);

  const { data: mission } = await sb
    .from("ops_missions")
    .insert({ proposal_id: proposalId, status: "running" })
    .select("id")
    .single();

  const missionId = mission!.id;

  // Create one step per kind — first step is queued, rest are pending
  // (pending steps get promoted to queued via step output chaining in the worker)
  const steps = input.step_kinds.map((kind, i) => ({
    mission_id: missionId,
    kind,
    status: (i === 0 ? "queued" : "pending") as string,
    payload: input.payload ?? {},
  }));

  await sb.from("ops_mission_steps").insert(steps);

  await emitEvent(sb, "mission:created", ["mission", "created"], {
    proposal_id: proposalId,
    mission_id: missionId,
    step_kinds: input.step_kinds,
  });

  return { proposal_id: proposalId, status: "approved", mission_id: missionId };
}

async function emitEvent(
  sb: SupabaseClient,
  type: string,
  tags: string[],
  payload: Record<string, unknown>
) {
  await sb.from("ops_agent_events").insert({
    type,
    tags,
    actor: "control-plane",
    payload,
  });
}
