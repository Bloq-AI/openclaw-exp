import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Check if all steps for a mission are done. If so, finalize the mission.
 * - Any failed step → mission failed
 * - All succeeded → mission succeeded
 * - Otherwise (still queued/running) → no-op
 */
export async function maybeFinalizeMissionIfDone(
  sb: SupabaseClient,
  missionId: string
) {
  const { data: steps, error } = await sb
    .from("ops_mission_steps")
    .select("status")
    .eq("mission_id", missionId);

  if (error || !steps || steps.length === 0) return;

  const statuses = steps.map((s) => s.status);

  // If any step is still queued or running, not done yet
  if (statuses.includes("queued") || statuses.includes("running")) return;

  const hasFailed = statuses.includes("failed");
  const finalStatus = hasFailed ? "failed" : "succeeded";

  await sb
    .from("ops_missions")
    .update({ status: finalStatus, finalized_at: new Date().toISOString() })
    .eq("id", missionId)
    .eq("status", "running"); // only update if still running

  await sb.from("ops_agent_events").insert({
    type: `mission:${finalStatus}`,
    tags: ["mission", finalStatus],
    actor: "control-plane",
    payload: { mission_id: missionId },
  });
}
