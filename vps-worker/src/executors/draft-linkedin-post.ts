import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

interface RepoData {
  name: string;
  url: string;
  description: string | null;
  stars: number;
  language: string | null;
}

export async function executeDraftLinkedinPost(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const repo = step.payload.repo as RepoData | undefined;
    const reason = step.payload.reason as string | undefined;
    const angle = step.payload.angle as string | undefined;

    if (!repo) {
      return { ok: false, error: "payload.repo is required (from scan_github step)" };
    }

    // ── Generate LinkedIn post text ──
    const textResponse = await withTimeout(
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `You are the social media voice for BLOQ AI. Write a compelling LinkedIn post promoting this open-source project.\n\nProject: ${repo.name}\nDescription: ${repo.description ?? "N/A"}\nStars: ${repo.stars}\nLanguage: ${repo.language ?? "N/A"}\nWhy it's interesting: ${reason ?? "N/A"}\nContent angle: ${angle ?? "N/A"}\n\nGuidelines:\n- Professional but energetic tone\n- Do NOT include any GitHub or repository URLs\n- Use 2-3 relevant hashtags\n- Keep it under 1300 characters\n- Start with a hook\n\nReturn only the post text.`,
      }),
      60_000,
      "gemini post generation"
    );

    const content = (textResponse.text ?? "").trim();

    // ── Generate image via Gemini 2.0 Flash ──
    let imageUrl: string | null = null;

    try {
      const imageResponse = await withTimeout(
        ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: `Generate a modern, professional social media graphic for a LinkedIn post about an open-source AI project called "${repo.name}". The image should feel tech-forward, use dark tones with accent colors, and subtly reference code or AI. Do NOT include any text in the image.`,
          config: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
        60_000,
        "gemini image generation"
      );

      const parts = imageResponse.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          console.log("[draft_linkedin_post] image generated via Gemini");
          break;
        }
      }
    } catch (imgErr) {
      console.warn(
        "[draft_linkedin_post] image generation failed:",
        imgErr instanceof Error ? imgErr.message : imgErr
      );
    }

    // ── Insert into ops_content_drafts ──
    const missionId = step.payload.mission_id as string | undefined;

    const { data: draft, error: insertErr } = await sb
      .from("ops_content_drafts")
      .insert({
        platform: "linkedin",
        content,
        image_url: imageUrl,
        context: { repo, reason, angle },
        status: "pending",
        mission_id: missionId ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      return { ok: false, error: `DB insert failed: ${insertErr.message}` };
    }

    return {
      ok: true,
      output: {
        draft_id: draft.id,
        content,
        image_generated: !!imageUrl,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
