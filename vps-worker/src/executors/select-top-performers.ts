import { SupabaseClient } from "@supabase/supabase-js";

/**
 * select_top_performers executor
 *
 * Queries content_posts for the best-performing Twitter posts from the
 * past 7 days that haven't been promoted to LinkedIn yet.
 * Returns the top N by perf_score.
 *
 * Payload:
 *   top_n         number  — how many top posts to select (default: 3)
 *   min_score     number  — minimum perf_score to consider (default: 5)
 *   lookback_days number  — how many days back to search (default: 7)
 */
export async function executeSelectTopPerformers(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const topN = (step.payload.top_n as number) ?? 3;
  const minScore = (step.payload.min_score as number) ?? 5;
  const lookbackDays = (step.payload.lookback_days as number) ?? 7;

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: posts, error } = await sb
      .from("content_posts")
      .select("id, content, tweet_id, perf_score, likes, retweets, replies, impressions, posted_at, brand")
      .eq("platform", "twitter")
      .eq("promoted_to_linkedin", false)
      .not("tracked_at", "is", null)   // only posts that have been measured
      .gte("perf_score", minScore)
      .gte("posted_at", cutoff)
      .order("perf_score", { ascending: false })
      .limit(topN);

    if (error) {
      return { ok: false, error: `DB query failed: ${error.message}` };
    }

    if (!posts || posts.length === 0) {
      console.log(`[select_top_performers] no qualifying posts found (min_score=${minScore}, last ${lookbackDays}d)`);
      return {
        ok: true,
        output: { top_posts: [], count: 0, message: "No qualifying posts this week" },
      };
    }

    console.log(`[select_top_performers] found ${posts.length} qualifying posts`);

    return {
      ok: true,
      output: {
        top_posts: posts,
        count: posts.length,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
