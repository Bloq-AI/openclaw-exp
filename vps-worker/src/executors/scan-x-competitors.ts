import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export interface ScanXResult {
  top_tweets: { text: string; author: string }[];
  angle: string;
  query: string;
}

/**
 * scan_x_competitors executor
 *
 * Searches X/Twitter for top posts about AI transformation, GCC tech,
 * and enterprise AI infrastructure. Uses Gemini to identify the hottest angle.
 *
 * Payload (all optional — falls back to policy defaults):
 *   query        string  — Twitter search query override
 *   max_results  number  — max tweets to fetch (capped at 100)
 */
export async function executeScanXCompetitors(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return { ok: false, error: "X_BEARER_TOKEN not configured" };
  }

  try {
    // Load scan config from policy (falls back to BLOQ-relevant defaults)
    const { data: configPolicy } = await sb
      .from("ops_policy")
      .select("json")
      .eq("key", "x_scan_config")
      .single();

    const config = configPolicy?.json as { query?: string; max_results?: number } | null;

    const query =
      config?.query ??
      '("AI transformation" OR "enterprise AI" OR "AI operating system" OR "AI infrastructure" OR "GCC AI" OR "AI automation" OR "agentic AI") lang:en -is:retweet -is:reply min_faves:10';
    const maxResults = Math.min(config?.max_results ?? 15, 100);

    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", String(maxResults));
    url.searchParams.set("tweet.fields", "text,author_id,public_metrics,created_at");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username,name");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `X API error ${res.status}: ${detail}` };
    }

    const data = (await res.json()) as {
      data?: {
        id: string;
        text: string;
        author_id: string;
        public_metrics?: { like_count: number; retweet_count: number; reply_count: number };
      }[];
      includes?: { users?: { id: string; username: string }[] };
    };

    const tweets = data.data ?? [];
    const users = data.includes?.users ?? [];

    const userMap: Record<string, string> = {};
    users.forEach((u) => { userMap[u.id] = `@${u.username}`; });

    // Sort by engagement score (likes + RT×2 + replies×1.5)
    tweets.sort((a, b) => {
      const scoreA =
        (a.public_metrics?.like_count ?? 0) +
        (a.public_metrics?.retweet_count ?? 0) * 2 +
        (a.public_metrics?.reply_count ?? 0) * 1.5;
      const scoreB =
        (b.public_metrics?.like_count ?? 0) +
        (b.public_metrics?.retweet_count ?? 0) * 2 +
        (b.public_metrics?.reply_count ?? 0) * 1.5;
      return scoreB - scoreA;
    });

    const topTweets = tweets.slice(0, 8).map((t) => ({
      text: t.text.replace(/\n+/g, " ").trim(),
      author: userMap[t.author_id] ?? "unknown",
    }));

    // Use Gemini to identify the hot angle/theme
    let angle = "AI infrastructure for enterprise operations";

    if (topTweets.length > 0) {
      const tweetsContext = topTweets
        .map((t, i) => `${i + 1}. ${t.author}: ${t.text}`)
        .join("\n");

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Given these top X posts about enterprise AI and automation:\n${tweetsContext}\n\nIn 10 words or less, what is the single hottest narrative or topic right now that BLOQ AI (an AI infrastructure company serving GCC mid-market companies) should respond to?`,
        });
        const raw = response.text?.trim() ?? "";
        if (raw) angle = raw.replace(/^["']|["']$/g, "");
      } catch (e) {
        console.warn("[scan_x_competitors] angle extraction failed:", e);
      }
    }

    console.log(`[scan_x_competitors] ${topTweets.length} tweets — angle: "${angle}"`);
    return { ok: true, output: { top_tweets: topTweets, angle, query } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
