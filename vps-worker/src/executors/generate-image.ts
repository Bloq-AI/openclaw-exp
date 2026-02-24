import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { loadPersona } from "../personas/loader";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * generate_image executor
 *
 * Generates a brand-consistent image via Gemini 2.0 Flash image generation,
 * uploads to Supabase Storage (post-images bucket), returns the public URL.
 *
 * Payload:
 *   content         string   — the post text (used to tailor the image)
 *   brand           string   — 'bloq' | 'hadi' | 'fikrah' (default: 'bloq')
 *   platform        string   — 'twitter' | 'linkedin' (affects aspect ratio)
 *   content_post_id string?  — if set, updates content_posts.image_url
 *   draft_id        string?  — if set, updates ops_content_drafts.image_url
 */
export async function executeGenerateImage(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: "GEMINI_API_KEY not configured" };
  }

  const content = (step.payload.content as string) ?? "";
  const brand = (step.payload.brand as string) ?? "bloq";
  const platform = (step.payload.platform as string) ?? "twitter";
  const contentPostId = step.payload.content_post_id as string | undefined;
  const draftId = step.payload.draft_id as string | undefined;

  const persona = await loadPersona(sb, brand, platform);

  const imagePrompt = `${persona.image_style_prompt}

Post context (inform the abstract composition, do NOT include text or words from the post in the image):
"${content.slice(0, 200)}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
      config: { responseModalities: ["IMAGE"] },
    });

    // Extract inline image bytes from the response
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return { ok: false, error: "Gemini returned no image data" };
    }

    const imgBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType = imagePart.inlineData.mimeType ?? "image/png";
    const ext = mimeType.includes("jpeg") ? "jpg" : "png";

    const fileName = `${brand}/${platform}/${Date.now()}-${step.id.slice(0, 8)}.${ext}`;
    const { error: uploadErr } = await sb.storage
      .from("post-images")
      .upload(fileName, imgBuffer, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadErr) {
      return { ok: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    const { data: urlData } = sb.storage.from("post-images").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    if (contentPostId) {
      await sb.from("content_posts").update({ image_url: publicUrl }).eq("id", contentPostId);
    }
    if (draftId) {
      await sb.from("ops_content_drafts").update({ image_url: publicUrl }).eq("id", draftId);
    }

    console.log(`[generate_image] uploaded to ${fileName}`);
    return {
      ok: true,
      output: { image_url: publicUrl, content_post_id: contentPostId, draft_id: draftId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
