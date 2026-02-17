import { SupabaseClient } from "@supabase/supabase-js";

const COOLDOWN_HOURS = 4;
const MIN_HIGH_CONFIDENCE_MEMORIES = 5;

/**
 * Check each agent and queue initiative proposals for those with enough experience.
 * Returns count of initiatives queued.
 */
export async function maybeQueueInitiatives(
  sb: SupabaseClient
): Promise<number> {
  const agentIds = ["strategist", "hype", "critic", "builder", "creative", "analyst"];
  let queued = 0;

  for (const agentId of agentIds) {
    // Check per-agent cooldown
    const cooldownKey = `cooldown:initiative:${agentId}`;
    const { data: cooldown } = await sb
      .from("ops_policy")
      .select("json")
      .eq("key", cooldownKey)
      .single();

    if (cooldown?.json?.until) {
      if (new Date(cooldown.json.until) > new Date()) continue;
    }

    // Check if agent has enough high-confidence memories
    const { count } = await sb
      .from("ops_agent_memory")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .gte("confidence", 0.7)
      .is("superseded_by", null);

    if ((count ?? 0) < MIN_HIGH_CONFIDENCE_MEMORIES) continue;

    // Check no pending initiative for this agent
    const { data: pending } = await sb
      .from("ops_initiative_queue")
      .select("id")
      .eq("agent_id", agentId)
      .in("status", ["pending", "processing"])
      .limit(1);

    if (pending && pending.length > 0) continue;

    // Queue initiative
    await sb.from("ops_initiative_queue").insert({
      agent_id: agentId,
      status: "pending",
      payload: { memory_count: count },
    });

    // Set cooldown
    await sb.from("ops_policy").upsert({
      key: cooldownKey,
      json: { until: new Date(Date.now() + COOLDOWN_HOURS * 60 * 60_000).toISOString() },
      updated_at: new Date().toISOString(),
    });

    queued++;
  }

  return queued;
}
