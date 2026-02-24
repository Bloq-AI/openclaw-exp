import { SupabaseClient } from "@supabase/supabase-js";

/**
 * track_tweet_performance executor
 *
 * Polls Twitter API v2 for engagement metrics on a posted tweet,
 * then updates the content_posts record with the data.
 *
 * Designed to run ~36 hours after posting (enough time for engagement to settle).
 *
 * Payload:
 *   tweet_id         string  — the Twitter tweet ID to track
 *   content_post_id  string  — the content_posts row to update
 */
export async function executeTrackTweetPerformance(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return { ok: false, error: "X_BEARER_TOKEN not configured" };
  }

  const tweetId = step.payload.tweet_id as string | undefined;
  const contentPostId = step.payload.content_post_id as string | undefined;

  if (!tweetId) {
    return { ok: false, error: "payload.tweet_id is required" };
  }
  if (!contentPostId) {
    return { ok: false, error: "payload.content_post_id is required" };
  }

  try {
    const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
    url.searchParams.set("tweet.fields", "public_metrics");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
      const detail = await res.text();
      // 404 means tweet was deleted — mark as tracked with zeros
      if (res.status === 404) {
        await sb
          .from("content_posts")
          .update({ tracked_at: new Date().toISOString() })
          .eq("id", contentPostId);
        return { ok: true, output: { tracked: true, deleted: true } };
      }
      return { ok: false, error: `X API error ${res.status}: ${detail}` };
    }

    const data = (await res.json()) as {
      data?: {
        public_metrics?: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          impression_count: number;
        };
      };
    };

    const metrics = data.data?.public_metrics;

    await sb
      .from("content_posts")
      .update({
        likes: metrics?.like_count ?? 0,
        retweets: metrics?.retweet_count ?? 0,
        replies: metrics?.reply_count ?? 0,
        impressions: metrics?.impression_count ?? 0,
        tracked_at: new Date().toISOString(),
      })
      .eq("id", contentPostId);

    const perfScore =
      (metrics?.like_count ?? 0) +
      (metrics?.retweet_count ?? 0) * 3 +
      (metrics?.reply_count ?? 0) * 2;

    console.log(
      `[track_tweet_performance] tweet ${tweetId} — ` +
      `likes=${metrics?.like_count ?? 0} RT=${metrics?.retweet_count ?? 0} ` +
      `replies=${metrics?.reply_count ?? 0} score=${perfScore}`
    );

    return {
      ok: true,
      output: {
        tweet_id: tweetId,
        content_post_id: contentPostId,
        likes: metrics?.like_count ?? 0,
        retweets: metrics?.retweet_count ?? 0,
        replies: metrics?.reply_count ?? 0,
        impressions: metrics?.impression_count ?? 0,
        perf_score: perfScore,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
