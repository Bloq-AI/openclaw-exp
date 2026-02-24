import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { getDailyPillar } from "../personas/bloq";
import { loadPersona } from "../personas/loader";
import type { ScanXResult } from "./scan-x-competitors";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * draft_x_post executor
 *
 * Uses the BLOQ AI persona and the scan_x_competitors output to generate
 * a tweet (or thread). Creates a record in content_posts and a draft in
 * ops_content_drafts for the human review queue.
 *
 * Payload (from previous scan_x_competitors step output, merged):
 *   top_tweets   array   — competitor tweet context
 *   angle        string  — hot topic identified by scan step
 *   pillar       string? — content pillar override (else uses day-of-week rotation)
 *   brand        string? — default 'bloq'
 */
export async function executeDraftXPost(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const topTweets = (step.payload.top_tweets as ScanXResult["top_tweets"]) ?? [];
    const angle = (step.payload.angle as string) ?? "AI infrastructure for enterprise";
    const pillar = (step.payload.pillar as string) ?? getDailyPillar();
    const brand = (step.payload.brand as string) ?? "bloq";
    const missionId = step.payload.mission_id as string | undefined;

    const tweetsContext =
      topTweets.length > 0
        ? topTweets.map((t, i) => `${i + 1}. ${t.author}: "${t.text}"`).join("\n")
        : "No competitor context available — focus on the topic independently.";

    const pillarInstructions: Record<string, string> = {
      ai_in_real_companies: `Focus on a real-world observation about AI deployment inside businesses. Share a specific data point, decision, or tradeoff from deploying AI systems. Ask a question that operators genuinely wonder about.`,
      building_in_public: `Share a transparent update about building AI infrastructure. Use specific numbers. No moral lesson attached — just "here's what happened, here's the number, here's what's next."`,
      gcc_tech_finance: `Comment on the intersection of AI, finance automation, and the GCC market. Could be ZATCA compliance, UAE corporate tax, Vision 2030, or why Western SaaS doesn't translate here.`,
      operator_philosophy: `Share a thoughtful take on why AI operators beat dashboards, or why shadow mode builds trust, or how governance matters more than raw capability. Working through an idea, not lecturing.`,
    };

    const pillarGuide = pillarInstructions[pillar] ?? pillarInstructions.ai_in_real_companies;

    // Load dynamic persona — may have evolved since last cycle
    const persona = await loadPersona(sb, brand, "twitter");

    const prompt = `${persona.system_prompt}

Today's content pillar: ${pillar.replace(/_/g, " ")}
${pillarGuide}

Hot topic from X right now: "${angle}"

Competitor/context tweets for awareness (do NOT quote or directly reference — just use for context):
${tweetsContext}

${persona.content_rules}

Write either:
- A single tweet (under 280 characters) if the idea is tight enough, OR
- A 2-3 tweet thread if the idea needs space (each tweet under 280 characters)

Return a JSON array of strings — one string per tweet.
Example single: ["Here is the tweet text."]
Example thread: ["Hook tweet.", "Development tweet.", "Close tweet."]

Return ONLY the JSON array, no other text.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const rawText = (response.text ?? "").trim();
    let tweets: string[];

    try {
      const parsed = JSON.parse(rawText);
      tweets = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      tweets = match ? (JSON.parse(match[0]) as unknown[]).map(String) : [rawText];
    }

    // Enforce 280-char limit
    tweets = tweets.map((t) => t.slice(0, 280)).filter(Boolean);

    if (tweets.length === 0) {
      return { ok: false, error: "Generated empty tweet content" };
    }

    // The content to post is the first tweet (thread: post first, then replies)
    const primaryContent = tweets[0];

    // Create content_posts record (will be updated with tweet_id after posting)
    const { data: contentPost, error: cpErr } = await sb
      .from("content_posts")
      .insert({
        brand,
        platform: "twitter",
        content: tweets.length > 1 ? JSON.stringify(tweets) : primaryContent,
        mission_id: missionId ?? null,
      })
      .select("id")
      .single();

    if (cpErr) {
      return { ok: false, error: `Failed to create content_posts record: ${cpErr.message}` };
    }

    // Also create a draft in ops_content_drafts for the review queue
    const { data: draft, error: draftErr } = await sb
      .from("ops_content_drafts")
      .insert({
        platform: "x",
        content: tweets.length > 1 ? JSON.stringify(tweets) : primaryContent,
        context: { angle, pillar, top_tweets: topTweets, mission_id: missionId, content_post_id: contentPost.id },
        status: "pending",
        mission_id: missionId ?? null,
      })
      .select("id")
      .single();

    if (draftErr) {
      console.warn("[draft_x_post] draft insert failed:", draftErr.message);
    }

    console.log(`[draft_x_post] drafted ${tweets.length} tweet(s) — pillar: ${pillar}`);

    return {
      ok: true,
      output: {
        content: primaryContent,
        tweets,
        content_post_id: contentPost.id,
        draft_id: draft?.id ?? null,
        brand,
        platform: "twitter",
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
