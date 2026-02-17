import { SupabaseClient } from "@supabase/supabase-js";

export async function executePostTweet(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  // Stub: only posts if twitter keys are configured
  const hasKeys =
    process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;

  if (!hasKeys) {
    return {
      ok: true,
      output: { posted: false, reason: "twitter keys not configured" },
    };
  }

  // TODO: implement actual Twitter API posting
  return {
    ok: true,
    output: { posted: false, reason: "twitter posting not yet implemented" },
  };
}
