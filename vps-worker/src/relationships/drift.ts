import { SupabaseClient } from "@supabase/supabase-js";

interface DriftEntry {
  delta: number;
  reason: string;
  timestamp: string;
}

/**
 * Apply affinity drift to an agent pair.
 * Normalizes pair order (agent_a < agent_b), clamps delta ±0.03,
 * clamps affinity 0.10-0.95, keeps last 20 drift_log entries.
 */
export async function applyDrift(
  sb: SupabaseClient,
  agentA: string,
  agentB: string,
  delta: number,
  reason: string
): Promise<void> {
  // Normalize pair order
  const [a, b] = agentA < agentB ? [agentA, agentB] : [agentB, agentA];

  // Clamp delta
  const clampedDelta = Math.max(-0.03, Math.min(0.03, delta));
  if (Math.abs(clampedDelta) < 0.001) return; // negligible

  // Get current relationship
  const { data: rel } = await sb
    .from("ops_agent_relationships")
    .select("*")
    .eq("agent_a", a)
    .eq("agent_b", b)
    .single();

  if (!rel) {
    // Create new relationship
    const newAffinity = Math.max(0.10, Math.min(0.95, 0.50 + clampedDelta));
    await sb.from("ops_agent_relationships").insert({
      agent_a: a,
      agent_b: b,
      affinity: newAffinity,
      total_interactions: 1,
      positive_interactions: clampedDelta > 0 ? 1 : 0,
      negative_interactions: clampedDelta < 0 ? 1 : 0,
      drift_log: [{ delta: clampedDelta, reason, timestamp: new Date().toISOString() }],
    });
    return;
  }

  // Update existing relationship
  const newAffinity = Math.max(0.10, Math.min(0.95, rel.affinity + clampedDelta));

  const driftLog: DriftEntry[] = Array.isArray(rel.drift_log) ? rel.drift_log : [];
  driftLog.push({ delta: clampedDelta, reason, timestamp: new Date().toISOString() });
  // Keep last 20 entries
  const trimmedLog = driftLog.slice(-20);

  await sb
    .from("ops_agent_relationships")
    .update({
      affinity: newAffinity,
      total_interactions: rel.total_interactions + 1,
      positive_interactions: rel.positive_interactions + (clampedDelta > 0 ? 1 : 0),
      negative_interactions: rel.negative_interactions + (clampedDelta < 0 ? 1 : 0),
      drift_log: trimmedLog,
    })
    .eq("agent_a", a)
    .eq("agent_b", b);
}
