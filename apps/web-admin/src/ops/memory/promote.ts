import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lightweight promote check for heartbeat.
 * The actual LLM-powered promotion runs in the worker.
 * This just queues a flag so the worker picks it up.
 */
export async function maybePromoteInsights(
  sb: SupabaseClient
): Promise<number> {
  // Check cooldown
  const { data: cooldown } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "cooldown:promote_insights")
    .single();

  if (cooldown?.json?.until) {
    const until = new Date(cooldown.json.until);
    if (until > new Date()) return 0;
  }

  // Count agents with enough observations to promote
  const { data: candidates } = await sb
    .from("ops_agent_memory")
    .select("agent_id")
    .in("type", ["pattern", "lesson"])
    .is("superseded_by", null);

  if (!candidates) return 0;

  const counts = new Map<string, number>();
  for (const row of candidates) {
    counts.set(row.agent_id, (counts.get(row.agent_id) ?? 0) + 1);
  }

  const eligible = [...counts.entries()].filter(([, c]) => c >= 3);
  if (eligible.length === 0) return 0;

  // Set cooldown (4h) — actual promotion happens in worker memory distillation
  await sb.from("ops_policy").upsert({
    key: "cooldown:promote_insights",
    json: { until: new Date(Date.now() + 4 * 60 * 60_000).toISOString(), eligible: eligible.length },
    updated_at: new Date().toISOString(),
  });

  return eligible.length;
}
