import { SupabaseClient } from "@supabase/supabase-js";

/**
 * post_linkedin executor
 *
 * Delegates LinkedIn posting to the control plane's existing
 * POST /api/ops/linkedin/post endpoint (which handles OAuth, image upload,
 * UGC post creation, and draft status update).
 *
 * Payload:
 *   draft_id  string  — the ops_content_drafts ID to post
 */
export async function executePostLinkedIn(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL?.replace(/\/$/, "");
  const opsKey = process.env.OPS_KEY;

  if (!controlPlaneUrl || !opsKey) {
    return { ok: false, error: "CONTROL_PLANE_URL or OPS_KEY not configured" };
  }

  const draftId = step.payload.draft_id as string | undefined;
  if (!draftId) {
    return { ok: false, error: "payload.draft_id is required" };
  }

  try {
    const res = await fetch(`${controlPlaneUrl}/api/ops/linkedin/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opsKey}`,
      },
      body: JSON.stringify({ draft_id: draftId }),
    });

    const result = (await res.json()) as { ok?: boolean; linkedin_post_id?: string; error?: string };

    if (!res.ok || !result.ok) {
      return { ok: false, error: result.error ?? `LinkedIn post failed: ${res.status}` };
    }

    // Track in content_posts if we have the context
    const { data: draft } = await sb
      .from("ops_content_drafts")
      .select("content, context")
      .eq("id", draftId)
      .single();

    if (draft && result.linkedin_post_id) {
      const ctx = draft.context as Record<string, unknown> | null;
      await sb.from("content_posts").insert({
        brand: (ctx?.brand as string) ?? "bloq",
        platform: "linkedin",
        content: draft.content,
        linkedin_id: result.linkedin_post_id,
        posted_at: new Date().toISOString(),
        mission_id: (ctx?.mission_id as string) ?? null,
      });
    }

    console.log(`[post_linkedin] posted draft ${draftId} — linkedin_id: ${result.linkedin_post_id}`);
    return { ok: true, output: { draft_id: draftId, linkedin_post_id: result.linkedin_post_id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
