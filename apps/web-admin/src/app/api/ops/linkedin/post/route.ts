import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface LinkedInAuth {
  access_token: string;
  person_urn: string;
  org_urn: string | null;
  org_name: string | null;
  expires_at: string;
}

/**
 * POST /api/ops/linkedin/post
 * Body: { draft_id: string }
 *
 * Reads the draft from ops_content_drafts, uploads the image to LinkedIn
 * (if present), publishes the UGC post, then marks the draft as posted.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { draft_id?: string };
  if (!body.draft_id) {
    return NextResponse.json({ error: "draft_id required" }, { status: 400 });
  }

  // ── Load LinkedIn credentials from ops_policy ──
  const { data: policy } = await supabaseAdmin
    .from("ops_policy")
    .select("json")
    .eq("key", "linkedin_auth")
    .single();

  if (!policy?.json) {
    return NextResponse.json({ error: "LinkedIn account not connected" }, { status: 401 });
  }

  const auth = policy.json as LinkedInAuth;
  if (new Date(auth.expires_at) < new Date()) {
    return NextResponse.json({ error: "LinkedIn token expired — reconnect account" }, { status: 401 });
  }

  // ── Load draft ──
  const { data: draft } = await supabaseAdmin
    .from("ops_content_drafts")
    .select("id, content, image_url, posted_at")
    .eq("id", body.draft_id)
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.posted_at) {
    return NextResponse.json({ error: "Draft already posted" }, { status: 409 });
  }

  const { access_token, person_urn, org_urn } = auth;
  // Try org first, fall back to personal if org not set or fails
  const preferredAuthor = org_urn ?? person_urn;
  let author = preferredAuthor;

  // ── Upload image if present ──
  let mediaAssetUrn: string | null = null;

  if (draft.image_url?.startsWith("data:")) {
    try {
      mediaAssetUrn = await uploadImageToLinkedIn(access_token, author, draft.image_url);
    } catch (err) {
      console.warn("[linkedin/post] image upload failed, posting text-only:", err);
    }
  }

  // ── Build UGC post body ──
  type UgcPost = {
    author: string;
    lifecycleState: string;
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: string };
        shareMediaCategory: string;
        media?: Array<{ status: string; media: string }>;
      };
    };
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": string;
    };
  };

  const ugcPost: UgcPost = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: draft.content },
        shareMediaCategory: mediaAssetUrn ? "IMAGE" : "NONE",
        ...(mediaAssetUrn && {
          media: [{ status: "READY", media: mediaAssetUrn }],
        }),
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  let postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(ugcPost),
  });

  // If org posting fails (needs w_organization_social), retry as personal profile
  if (!postRes.ok && author !== person_urn) {
    console.warn("[linkedin/post] org post failed, retrying as personal profile");
    author = person_urn;
    ugcPost.author = person_urn;
    if (mediaAssetUrn) {
      // Re-upload image under person URN
      try {
        mediaAssetUrn = await uploadImageToLinkedIn(access_token, person_urn, draft.image_url!);
        ugcPost.specificContent["com.linkedin.ugc.ShareContent"].media = [
          { status: "READY", media: mediaAssetUrn },
        ];
      } catch {
        ugcPost.specificContent["com.linkedin.ugc.ShareContent"].media = undefined;
        ugcPost.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "NONE";
      }
    }
    postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(ugcPost),
    });
  }

  if (!postRes.ok) {
    const detail = await postRes.text();
    return NextResponse.json({ error: "LinkedIn API error", detail }, { status: 502 });
  }

  const postResult = (await postRes.json()) as { id?: string };

  // ── Mark draft as posted ──
  await supabaseAdmin
    .from("ops_content_drafts")
    .update({ posted_at: new Date().toISOString(), status: "approved" })
    .eq("id", body.draft_id);

  return NextResponse.json({ ok: true, linkedin_post_id: postResult.id ?? null });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function uploadImageToLinkedIn(
  token: string,
  personUrn: string,
  dataUri: string
): Promise<string> {
  // 1. Register upload
  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    }
  );

  if (!registerRes.ok) {
    throw new Error(`registerUpload failed: ${await registerRes.text()}`);
  }

  const registerData = (await registerRes.json()) as {
    value: {
      asset: string;
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
          uploadUrl: string;
        };
      };
    };
  };

  const assetUrn =
    registerData.value.asset;
  const uploadUrl =
    registerData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;

  // 2. Upload binary
  const [meta, b64] = dataUri.split(",");
  const mimeMatch = meta.match(/data:([^;]+);/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const buffer = Buffer.from(b64, "base64");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`image PUT failed: ${uploadRes.status}`);
  }

  return assetUrn;
}
