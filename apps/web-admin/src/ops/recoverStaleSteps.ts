import { SupabaseClient } from "@supabase/supabase-js";
import { maybeFinalizeMissionIfDone } from "./missions/finalize";

/**
 * Find steps stuck in 'running' for longer than the stale timeout.
 * Mark them failed and attempt to finalize their missions.
 */
export async function recoverStaleSteps(
  sb: SupabaseClient,
  budgetMs: number
): Promise<number> {
  const deadline = Date.now() + budgetMs;

  // Load stale timeout from policy (default 30 min)
  const { data: workerPolicy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "worker_policy")
    .single();

  const staleMinutes = workerPolicy?.json?.stale_timeout_minutes ?? 30;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  // Find stale steps
  const { data: staleSteps } = await sb
    .from("ops_mission_steps")
    .select("id, mission_id")
    .eq("status", "running")
    .lt("reserved_at", cutoff)
    .limit(50);

  if (!staleSteps || staleSteps.length === 0) return 0;

  let count = 0;
  const affectedMissions = new Set<string>();

  for (const step of staleSteps) {
    if (Date.now() >= deadline) break;

    await sb
      .from("ops_mission_steps")
      .update({
        status: "failed",
        last_error: `Stale: no heartbeat for ${staleMinutes}+ minutes`,
      })
      .eq("id", step.id);

    affectedMissions.add(step.mission_id);
    count++;
  }

  // Finalize affected missions
  for (const missionId of affectedMissions) {
    if (Date.now() >= deadline) break;
    await maybeFinalizeMissionIfDone(sb, missionId);
  }

  return count;
}
