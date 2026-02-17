import { SupabaseClient } from "@supabase/supabase-js";
import { memoryCache } from "../memory/cache";

interface CheckerResult {
  fired: boolean;
  payload?: Record<string, unknown>;
}

type CheckerFn = (
  sb: SupabaseClient,
  conditions: Record<string, unknown>
) => Promise<CheckerResult>;

/**
 * 30% chance to pull a topic from agent memories instead of default.
 */
async function maybeMemoryTopic(
  sb: SupabaseClient,
  defaultTopic: string
): Promise<string> {
  if (Math.random() > 0.3) return defaultTopic;

  const agents = ["strategist", "analyst", "creative"];
  const agentId = agents[Math.floor(Math.random() * agents.length)];

  try {
    const memories = await memoryCache.getMemories(sb, agentId);
    const highConf = memories.filter((m) => m.confidence >= 0.7);
    if (highConf.length > 0) {
      const pick = highConf[Math.floor(Math.random() * highConf.length)];
      return `${defaultTopic} — inspired by ${agentId}'s memory: "${pick.content}"`;
    }
  } catch {
    // Fall through to default
  }

  return defaultTopic;
}

// ── Reactive checkers ───────────────────────────────────────────────

async function checkMissionFailed(
  sb: SupabaseClient
): Promise<CheckerResult> {
  const { data } = await sb
    .from("ops_agent_events")
    .select("id, payload")
    .eq("type", "mission:failed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return { fired: false };

  // Check if we already diagnosed this mission
  const missionId = (data[0].payload as Record<string, unknown>)?.mission_id;
  const { data: existing } = await sb
    .from("ops_mission_proposals")
    .select("id")
    .eq("source", "trigger")
    .ilike("title", "%failed mission%")
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) return { fired: false };

  return { fired: true, payload: { mission_id: missionId } };
}

async function checkTweetHighEngagement(
  sb: SupabaseClient,
  conditions: Record<string, unknown>
): Promise<CheckerResult> {
  const minLikes = (conditions.min_likes as number) ?? 50;

  const { data } = await sb
    .from("ops_agent_events")
    .select("payload")
    .eq("type", "step:succeeded")
    .contains("tags", ["post_tweet"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data) return { fired: false };

  for (const event of data) {
    const output = (event.payload as Record<string, unknown>)?.output as
      | Record<string, unknown>
      | undefined;
    const likes = (output?.likes as number) ?? 0;
    if (likes >= minLikes) {
      return { fired: true, payload: { tweet_id: output?.tweet_id, likes } };
    }
  }

  return { fired: false };
}

async function checkStepFailedRepeated(
  sb: SupabaseClient,
  conditions: Record<string, unknown>
): Promise<CheckerResult> {
  const minFailures = (conditions.min_failures as number) ?? 3;
  const windowHours = (conditions.window_hours as number) ?? 6;
  const since = new Date(
    Date.now() - windowHours * 60 * 60_000
  ).toISOString();

  const { count } = await sb
    .from("ops_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "step:failed")
    .gte("created_at", since);

  if ((count ?? 0) >= minFailures) {
    return { fired: true, payload: { failure_count: count, window_hours: windowHours } };
  }

  return { fired: false };
}

async function checkContentPublished(
  sb: SupabaseClient
): Promise<CheckerResult> {
  const { data } = await sb
    .from("ops_agent_events")
    .select("id, payload")
    .eq("type", "step:succeeded")
    .contains("tags", ["post_tweet"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return { fired: false };

  // Only fire if content was published more than 1h ago (give time for engagement)
  const eventAge = Date.now() - new Date(data[0].payload?.created_at as string || Date.now()).getTime();
  if (eventAge < 60 * 60_000) return { fired: false };

  return { fired: true, payload: { event_id: data[0].id } };
}

// ── Proactive checkers ──────────────────────────────────────────────

async function checkScanSignals(sb: SupabaseClient): Promise<CheckerResult> {
  const topic = await maybeMemoryTopic(sb, "trending topics and market signals");
  return { fired: true, payload: { topic } };
}

async function checkDraftTweet(sb: SupabaseClient): Promise<CheckerResult> {
  const topic = await maybeMemoryTopic(sb, "engaging content based on recent insights");
  return { fired: true, payload: { topic } };
}

async function checkAnalyzeOps(sb: SupabaseClient): Promise<CheckerResult> {
  const { count } = await sb
    .from("ops_missions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());

  const topic = await maybeMemoryTopic(sb, "operational review");
  return {
    fired: true,
    payload: { topic, recent_mission_count: count ?? 0 },
  };
}

async function checkContentReview(sb: SupabaseClient): Promise<CheckerResult> {
  const topic = await maybeMemoryTopic(sb, "content quality and consistency review");
  return { fired: true, payload: { topic } };
}

async function checkTrendScan(sb: SupabaseClient): Promise<CheckerResult> {
  const topic = await maybeMemoryTopic(sb, "emerging trends and audience interests");
  return { fired: true, payload: { topic } };
}

async function checkEngagementCheck(sb: SupabaseClient): Promise<CheckerResult> {
  const topic = await maybeMemoryTopic(sb, "engagement metrics and strategy adjustment");
  return { fired: true, payload: { topic } };
}

async function checkHealthCheck(sb: SupabaseClient): Promise<CheckerResult> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();

  const { count: failedSteps } = await sb
    .from("ops_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "step:failed")
    .gte("created_at", since);

  return {
    fired: true,
    payload: { topic: "system health", recent_failures: failedSteps ?? 0 },
  };
}

// ── Checker map ─────────────────────────────────────────────────────

async function checkGithubLinkedinScan(
  _sb: SupabaseClient
): Promise<CheckerResult> {
  return { fired: true, payload: { org: "bloq-ai" } };
}

export const checkerMap: Record<string, CheckerFn> = {
  github_linkedin_scan: checkGithubLinkedinScan,
  mission_failed: checkMissionFailed,
  tweet_high_engagement: checkTweetHighEngagement,
  step_failed_repeated: checkStepFailedRepeated,
  content_published: checkContentPublished,
  scan_signals: checkScanSignals,
  draft_tweet: checkDraftTweet,
  analyze_ops: checkAnalyzeOps,
  content_review: checkContentReview,
  trend_scan: checkTrendScan,
  engagement_check: checkEngagementCheck,
  health_check: checkHealthCheck,
};
