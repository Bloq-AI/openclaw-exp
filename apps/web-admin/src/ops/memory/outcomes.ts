import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lightweight outcome check for heartbeat.
 * Checks if there are recent tweet outcomes worth analyzing.
 * The actual LLM analysis runs in the worker.
 */
export async function maybeLearnFromOutcomes(
  sb: SupabaseClient
): Promise<number> {
  // Check cooldown
  const { data: cooldown } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "cooldown:learn_outcomes")
    .single();

  if (cooldown?.json?.until) {
    const until = new Date(cooldown.json.until);
    if (until > new Date()) return 0;
  }

  // Count recent tweet outcomes
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await sb
    .from("ops_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "step:succeeded")
    .contains("tags", ["post_tweet"])
    .gte("created_at", since);

  if ((count ?? 0) === 0) return 0;

  // Set cooldown (2h)
  await sb.from("ops_policy").upsert({
    key: "cooldown:learn_outcomes",
    json: { until: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), pending_count: count },
    updated_at: new Date().toISOString(),
  });

  return count ?? 0;
}
