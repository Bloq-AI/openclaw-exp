import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { BLOQ_LINKEDIN } from "../personas/bloq";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

interface ContentPost {
  id: string;
  content: string;
  tweet_id: string | null;
  perf_score: number;
  likes: number;
  retweets: number;
  replies: number;
  brand: string;
}

/**
 * promote_to_linkedin executor
 *
 * Takes the top-performing Twitter posts (from select_top_performers output),
 * expands each one into a long-form LinkedIn post using the BLOQ LinkedIn persona,
 * generates a brand image via DALL-E 3, and creates drafts in ops_content_drafts.
 *
 * The drafts land in the Stage → Content Drafts queue for human review.
 *
 * Payload (from previous select_top_performers output, merged):
 *   top_posts   array  — list of content_posts rows
 *   brand       string — default 'bloq'
 */
export async function executePromoteToLinkedIn(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const topPosts = (step.payload.top_posts as ContentPost[]) ?? [];
  const brand = (step.payload.brand as string) ?? "bloq";
  const missionId = step.payload.mission_id as string | undefined;

  if (topPosts.length === 0) {
    return { ok: true, output: { draft_ids: [], message: "No posts to promote" } };
  }

  const draftIds: string[] = [];
  const errors: string[] = [];

  for (const post of topPosts) {
    try {
      // Parse content (may be JSON array for threads)
      let tweetContent: string;
      try {
        const parsed = JSON.parse(post.content);
        tweetContent = Array.isArray(parsed) ? (parsed as string[]).join("\n\n") : post.content;
      } catch {
        tweetContent = post.content;
      }

      // Generate LinkedIn long-form expansion
      const prompt = `${BLOQ_LINKEDIN.system_prompt}

Original Twitter post (this performed well — ${post.likes} likes, ${post.retweets} retweets, ${post.replies} replies):
"${tweetContent}"

${BLOQ_LINKEDIN.content_rules}

Expand this into a compelling LinkedIn post. Keep the core idea but:
- Add more depth, specific context, or a before/after example
- Open with a hook (the original tweet's core insight works well as a hook)
- Add 1-2 concrete details or analogies that wouldn't fit in a tweet
- Close with a thought-provoking question or insight
- Add 3-5 relevant hashtags at the very end

Return only the LinkedIn post text. No meta-commentary.`;

      const textResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const linkedinContent = (textResponse.text ?? "").trim();
      if (!linkedinContent) {
        errors.push(`Post ${post.id}: empty content generated`);
        continue;
      }

      // Generate image via DALL-E 3
      let imageUrl: string | null = null;
      try {
        const imagePrompt = `${BLOQ_LINKEDIN.image_style_prompt}

Post context (do NOT include text in the image): "${linkedinContent.slice(0, 200)}"`;

        const imageRes = await openai.images.generate({
          model: "dall-e-3",
          prompt: imagePrompt,
          n: 1,
          size: "1792x1024",
          quality: "standard",
          response_format: "url",
        });

        const tempUrl = imageRes.data?.[0]?.url;
        if (tempUrl) {
          const imgFetch = await fetch(tempUrl);
          if (imgFetch.ok) {
            const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
            const fileName = `${brand}/linkedin/${Date.now()}-${post.id.slice(0, 8)}.png`;
            const { error: uploadErr } = await sb.storage
              .from("post-images")
              .upload(fileName, imgBuffer, { contentType: "image/png", cacheControl: "31536000" });

            if (!uploadErr) {
              const { data: urlData } = sb.storage.from("post-images").getPublicUrl(fileName);
              imageUrl = urlData.publicUrl;
            }
          }
        }
      } catch (imgErr) {
        console.warn(`[promote_to_linkedin] image gen failed for ${post.id}:`, imgErr);
      }

      // Create draft in ops_content_drafts
      const { data: draft, error: draftErr } = await sb
        .from("ops_content_drafts")
        .insert({
          platform: "linkedin",
          content: linkedinContent,
          image_url: imageUrl,
          context: {
            source: "twitter_promotion",
            original_tweet_id: post.tweet_id,
            original_content_post_id: post.id,
            perf_score: post.perf_score,
            likes: post.likes,
            retweets: post.retweets,
            replies: post.replies,
            brand,
            mission_id: missionId,
          },
          status: "pending",
          mission_id: missionId ?? null,
        })
        .select("id")
        .single();

      if (draftErr) {
        errors.push(`Post ${post.id}: draft insert failed — ${draftErr.message}`);
        continue;
      }

      // Mark original content_post as promoted
      await sb
        .from("content_posts")
        .update({ promoted_to_linkedin: true })
        .eq("id", post.id);

      draftIds.push(draft.id);
      console.log(`[promote_to_linkedin] created draft ${draft.id} from tweet ${post.tweet_id ?? post.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Post ${post.id}: ${msg}`);
    }
  }

  return {
    ok: draftIds.length > 0 || topPosts.length === 0,
    output: {
      draft_ids: draftIds,
      count: draftIds.length,
      errors: errors.length > 0 ? errors : undefined,
    },
    error: draftIds.length === 0 && errors.length > 0 ? errors.join("; ") : undefined,
  };
}
