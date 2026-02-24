import { SupabaseClient } from "@supabase/supabase-js";

interface ContentPost {
  id: string;
  brand: string;
  platform: string;
  content: string;
  perf_score: number;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  posted_at: string;
  promoted_to_linkedin: boolean;
}

/**
 * analyze_content_performance executor
 *
 * Reads content_posts for the lookback window, computes performance
 * statistics by pillar/format/time, and returns a structured analysis
 * object that feeds into the judge + synthesize pipeline.
 *
 * Payload:
 *   lookback_days  number  — days to analyze (default: 14)
 *   brand          string  — default 'bloq'
 *   platform       string  — 'twitter' | 'linkedin' | 'both' (default: 'twitter')
 *   top_n_examples number  — how many best/worst examples to include (default: 5)
 */
export async function executeAnalyzeContentPerformance(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const lookbackDays = (step.payload.lookback_days as number) ?? 14;
  const brand = (step.payload.brand as string) ?? "bloq";
  const platform = (step.payload.platform as string) ?? "twitter";
  const topNExamples = (step.payload.top_n_examples as number) ?? 5;

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const query = sb
      .from("content_posts")
      .select("id, brand, platform, content, perf_score, likes, retweets, replies, impressions, posted_at, promoted_to_linkedin")
      .eq("brand", brand)
      .gte("posted_at", cutoff)
      .not("tracked_at", "is", null); // only measured posts

    if (platform !== "both") {
      query.eq("platform", platform);
    }

    const { data: posts, error } = await query.order("posted_at", { ascending: false });

    if (error) return { ok: false, error: error.message };
    if (!posts || posts.length === 0) {
      return {
        ok: true,
        output: {
          total_posts: 0,
          message: `No tracked posts in last ${lookbackDays} days`,
          analysis: null,
        },
      };
    }

    const typedPosts = posts as ContentPost[];

    // ── Aggregate stats ─────────────────────────────────────────────
    const scores = typedPosts.map((p) => p.perf_score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];
    const promotedCount = typedPosts.filter((p) => p.promoted_to_linkedin).length;

    // ── Top/bottom performers ────────────────────────────────────────
    const sorted = [...typedPosts].sort((a, b) => b.perf_score - a.perf_score);
    const topPosts = sorted.slice(0, topNExamples).map((p) => ({
      id: p.id,
      content: truncateContent(p.content, 300),
      perf_score: p.perf_score,
      likes: p.likes,
      retweets: p.retweets,
      replies: p.replies,
      impressions: p.impressions,
      posted_at: p.posted_at,
    }));
    const bottomPosts = sorted.slice(-topNExamples).map((p) => ({
      id: p.id,
      content: truncateContent(p.content, 300),
      perf_score: p.perf_score,
      likes: p.likes,
      retweets: p.retweets,
      replies: p.replies,
      posted_at: p.posted_at,
    }));

    // ── Time-of-day analysis ─────────────────────────────────────────
    const byHour: Record<number, { count: number; totalScore: number }> = {};
    for (const post of typedPosts) {
      const hour = new Date(post.posted_at).getUTCHours();
      if (!byHour[hour]) byHour[hour] = { count: 0, totalScore: 0 };
      byHour[hour].count++;
      byHour[hour].totalScore += post.perf_score;
    }
    const bestHour = Object.entries(byHour)
      .map(([h, v]) => ({ hour: parseInt(h), avgScore: v.totalScore / v.count, count: v.count }))
      .filter((h) => h.count >= 2)
      .sort((a, b) => b.avgScore - a.avgScore)[0];

    // ── Content pattern analysis (basic heuristics) ──────────────────
    const patterns = {
      with_question: computeAvgScore(typedPosts.filter((p) => p.content.includes("?"))),
      with_numbers: computeAvgScore(typedPosts.filter((p) => /\d+/.test(p.content))),
      short_content: computeAvgScore(typedPosts.filter((p) => plainLen(p.content) < 140)),
      long_content: computeAvgScore(typedPosts.filter((p) => plainLen(p.content) >= 140)),
      thread_format: computeAvgScore(typedPosts.filter((p) => isThread(p.content))),
      single_tweet: computeAvgScore(typedPosts.filter((p) => !isThread(p.content))),
    };

    const analysis = {
      period_days: lookbackDays,
      total_posts: typedPosts.length,
      promoted_to_linkedin: promotedCount,
      scores: { avg: round(avgScore), max: maxScore, min: minScore, median: medianScore },
      best_hour_utc: bestHour ?? null,
      content_patterns: patterns,
      top_performers: topPosts,
      bottom_performers: bottomPosts,
    };

    console.log(
      `[analyze_content_performance] ${typedPosts.length} posts — avg score ${round(avgScore)}, max ${maxScore}`
    );

    return { ok: true, output: { analysis, total_posts: typedPosts.length } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncateContent(raw: string, maxLen: number): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return (parsed as string[]).join(" | ").slice(0, maxLen);
  } catch {
    // not JSON
  }
  return raw.slice(0, maxLen);
}

function plainLen(raw: string): number {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return (parsed as string[]).join("").length;
  } catch {
    // not JSON
  }
  return raw.length;
}

function isThread(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && (parsed as unknown[]).length > 1;
  } catch {
    return false;
  }
}

function computeAvgScore(posts: ContentPost[]): { avg: number; count: number } {
  if (posts.length === 0) return { avg: 0, count: 0 };
  const avg = posts.reduce((s, p) => s + p.perf_score, 0) / posts.length;
  return { avg: round(avg), count: posts.length };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
