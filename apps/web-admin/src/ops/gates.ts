import { SupabaseClient } from "@supabase/supabase-js";

type GateResult = { ok: true } | { ok: false; reason: string };
type GateFn = (sb: SupabaseClient) => Promise<GateResult>;

/** Gate: post_tweet — checks x_autopost enabled + daily quota */
const postTweetGate: GateFn = async (sb) => {
  // Check if autopost is enabled
  const { data: autopost } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "x_autopost")
    .single();

  if (!autopost?.json?.enabled) {
    return { ok: false, reason: "x_autopost policy is disabled" };
  }

  // Check daily quota
  const { data: quota } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "x_daily_quota")
    .single();

  const limit = quota?.json?.limit ?? 10;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await sb
    .from("ops_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "step:succeeded")
    .contains("tags", ["post_tweet"])
    .gte("created_at", todayStart.toISOString());

  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      reason: `x_daily_quota exceeded: ${count}/${limit} tweets today`,
    };
  }

  return { ok: true };
};

/** Gate: deploy — placeholder, allows unless policy disabled */
const deployGate: GateFn = async (sb) => {
  const { data: policy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "deploy")
    .single();

  if (policy?.json?.disabled) {
    return { ok: false, reason: "deploy policy is disabled" };
  }
  return { ok: true };
};

/** Map of step kinds to their gate functions */
const gateMap: Record<string, GateFn> = {
  post_tweet: postTweetGate,
  deploy: deployGate,
};

/**
 * Run gates for a list of step kinds.
 * Returns the first rejection or {ok: true}.
 */
export async function checkGates(
  sb: SupabaseClient,
  stepKinds: string[]
): Promise<GateResult> {
  for (const kind of stepKinds) {
    const gate = gateMap[kind];
    if (gate) {
      const result = await gate(sb);
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}
