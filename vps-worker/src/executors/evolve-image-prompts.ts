import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { loadPersona, savePersonaVersion } from "../personas/loader";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * evolve_image_prompts executor
 *
 * Reads unprocessed image_feedback rows (user ratings + notes on generated images),
 * uses them to produce an improved image_style_prompt for the given brand+platform,
 * and saves it as a new persona_version.
 *
 * This is the core of the user-feedback → prompt evolution loop for images.
 *
 * Payload:
 *   brand          string  — default 'bloq'
 *   platform       string  — 'twitter' | 'linkedin' | 'both' (default: 'both')
 *   min_feedback   number  — minimum feedback items needed to trigger (default: 3)
 */
export async function executeEvolveImagePrompts(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const brand = (step.payload.brand as string) ?? "bloq";
  const platform = (step.payload.platform as string) ?? "both";
  const minFeedback = (step.payload.min_feedback as number) ?? 3;

  try {
    // Load unprocessed feedback
    const { data: feedbackRows, error: fetchErr } = await sb
      .from("image_feedback")
      .select("id, rating, feedback_text, image_url, platform, created_at")
      .eq("brand", brand)
      .eq("processed", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchErr) return { ok: false, error: fetchErr.message };

    if (!feedbackRows || feedbackRows.length < minFeedback) {
      console.log(`[evolve_image_prompts] only ${feedbackRows?.length ?? 0} feedback items (min ${minFeedback}), skipping`);
      return {
        ok: true,
        output: {
          skipped: true,
          reason: `Insufficient feedback: ${feedbackRows?.length ?? 0} items (minimum ${minFeedback} required)`,
        },
      };
    }

    // Separate by platform if needed
    const twitterFeedback = feedbackRows.filter((f) => f.platform === "twitter");
    const linkedinFeedback = feedbackRows.filter((f) => f.platform === "linkedin");

    const platformsToEvolve = platform === "both"
      ? (["twitter", "linkedin"] as const).filter((p) =>
          (p === "twitter" ? twitterFeedback : linkedinFeedback).length >= minFeedback
        )
      : ([platform] as const);

    const savedVersionIds: string[] = [];

    for (const targetPlatform of platformsToEvolve) {
      const relevantFeedback = targetPlatform === "twitter" ? twitterFeedback : linkedinFeedback;
      if (relevantFeedback.length < minFeedback) continue;

      const currentPersona = await loadPersona(sb, brand, targetPlatform);

      // Format feedback for LLM
      const goodImages = relevantFeedback.filter((f) => (f.rating ?? 3) >= 4);
      const badImages = relevantFeedback.filter((f) => (f.rating ?? 3) <= 2);
      const neutralImages = relevantFeedback.filter((f) => (f.rating ?? 3) === 3);

      const feedbackSummary = [
        goodImages.length > 0 && `GOOD images (rating 4-5, ${goodImages.length} items):\n${
          goodImages.map((f) => `- Rating ${f.rating}: ${f.feedback_text ?? "(no note)"}`).join("\n")
        }`,
        badImages.length > 0 && `BAD images (rating 1-2, ${badImages.length} items):\n${
          badImages.map((f) => `- Rating ${f.rating}: ${f.feedback_text ?? "(no note)"}`).join("\n")
        }`,
        neutralImages.length > 0 && `NEUTRAL images (rating 3, ${neutralImages.length} items):\n${
          neutralImages.map((f) => `- Rating ${f.rating}: ${f.feedback_text ?? "(no note)"}`).join("\n")
        }`,
      ].filter(Boolean).join("\n\n");

      const avgRating = relevantFeedback.reduce((s, f) => s + (f.rating ?? 3), 0) / relevantFeedback.length;

      const prompt = `You are an AI image prompt engineer. Your job is to improve an image generation style prompt for a B2B AI company (BLOQ AI) based on user feedback.

Platform: ${targetPlatform}
Average image rating: ${avgRating.toFixed(1)}/5 from ${relevantFeedback.length} images

Current image style prompt:
---
${currentPersona.image_style_prompt}
---

User feedback on generated images:
${feedbackSummary}

Brand identity to maintain:
- BLOQ AI: deep navy/charcoal background, electric blue accents, enterprise-clean, technical
- NO people, NO stock photos, NO generic AI imagery
- Platform: ${targetPlatform === "twitter" ? "1792×1024 landscape" : "1200×627 LinkedIn format"}

Based on the feedback, write an IMPROVED image style prompt that:
1. Preserves what users rated highly (4-5 stars)
2. Fixes what users rated poorly (1-2 stars)
3. Stays true to the BLOQ brand identity
4. Gives more specific visual direction to avoid AI-generic results
5. Is detailed enough that DALL-E 3 produces consistent, professional results

Return JSON:
{
  "improved_prompt": "the full improved image style prompt",
  "change_reason": "2-3 sentences explaining what changed and why based on feedback",
  "key_changes": ["change 1", "change 2", "change 3"]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const raw = (response.text ?? "").trim();
      const result = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "")) as {
        improved_prompt: string;
        change_reason: string;
        key_changes: string[];
      };

      if (!result.improved_prompt || result.improved_prompt === currentPersona.image_style_prompt) {
        console.log(`[evolve_image_prompts] no changes needed for ${targetPlatform}`);
        continue;
      }

      const versionId = await savePersonaVersion(sb, {
        brand,
        platform: targetPlatform,
        field: "image_style_prompt",
        value: result.improved_prompt,
        reason: result.change_reason,
        createdBy: "user_feedback",
        judgeInput: { feedback_count: relevantFeedback.length, avg_rating: avgRating, good: goodImages.length, bad: badImages.length },
      });

      savedVersionIds.push(versionId);
      console.log(`[evolve_image_prompts] saved new image_style_prompt for ${targetPlatform}: ${versionId}`);

      // Mark feedback as processed
      await sb
        .from("image_feedback")
        .update({ processed: true, persona_version_id: versionId })
        .in("id", relevantFeedback.map((f) => f.id));

      // Emit event
      await sb.from("ops_agent_events").insert({
        type: "image_prompt:evolved",
        tags: ["image", "evolution", brand, targetPlatform],
        actor: "evolve_image_prompts",
        payload: {
          brand, platform: targetPlatform, version_id: versionId,
          feedback_count: relevantFeedback.length,
          avg_rating: avgRating,
          change_reason: result.change_reason,
          key_changes: result.key_changes,
        },
      });
    }

    return {
      ok: true,
      output: {
        versions_saved: savedVersionIds.length,
        version_ids: savedVersionIds,
        feedback_processed: feedbackRows.length,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
