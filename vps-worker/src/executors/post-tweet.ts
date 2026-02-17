import { SupabaseClient } from "@supabase/supabase-js";
import { TwitterApi } from "twitter-api-v2";

export async function executePostTweet(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const appKey = process.env.TWITTER_APP_KEY;
  const appSecret = process.env.TWITTER_APP_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    return { ok: false, error: "twitter credentials not configured" };
  }

  const content = step.payload.content as string | undefined;
  if (!content) {
    return { ok: false, error: "payload.content is required" };
  }

  try {
    const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    const { data } = await client.v2.tweet(content);
    return { ok: true, output: { tweet_id: data.id, posted: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
