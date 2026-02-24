import { SupabaseClient } from "@supabase/supabase-js";

interface XAuth {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  username: string;
}

/**
 * post_tweet executor
 *
 * Posts a tweet (or thread) using OAuth2 credentials stored in ops_policy.x_auth.
 * Automatically refreshes expired tokens using X_CLIENT_ID / X_CLIENT_SECRET.
 * Supports optional media image upload via v1.1 multipart upload.
 *
 * Payload:
 *   content          string   — tweet text (or JSON array for thread)
 *   tweets           array?   — explicit array of tweet texts (preferred for threads)
 *   content_post_id  string?  — content_posts row to update after posting
 *   image_url        string?  — Supabase Storage public URL to attach as media
 *   brand            string?  — default 'bloq'
 */
export async function executePostTweet(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  // Load OAuth2 credentials from ops_policy
  const { data: policy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "x_auth")
    .single();

  if (!policy?.json) {
    return { ok: false, error: "X account not connected — visit /api/auth/x to connect" };
  }

  let auth = policy.json as XAuth;

  // Refresh token if expired
  if (new Date(auth.expires_at) < new Date()) {
    if (!auth.refresh_token) {
      return { ok: false, error: "X token expired — reconnect account at /api/auth/x" };
    }
    const refreshed = await refreshXToken(auth.refresh_token);
    if (!refreshed) {
      return { ok: false, error: "X token refresh failed — reconnect account at /api/auth/x" };
    }
    await sb.from("ops_policy").upsert({
      key: "x_auth",
      json: { ...auth, ...refreshed },
      updated_at: new Date().toISOString(),
    });
    auth = { ...auth, ...refreshed };
  }

  const contentPostId = step.payload.content_post_id as string | undefined;
  const imageUrl = step.payload.image_url as string | undefined;

  // Resolve tweet texts
  let tweets: string[];
  if (Array.isArray(step.payload.tweets)) {
    tweets = (step.payload.tweets as unknown[]).map(String).filter(Boolean);
  } else {
    const raw = step.payload.content as string | undefined;
    if (!raw) {
      return { ok: false, error: "payload.content or payload.tweets is required" };
    }
    try {
      const parsed = JSON.parse(raw);
      tweets = Array.isArray(parsed) ? parsed.map(String) : [raw];
    } catch {
      tweets = [raw];
    }
  }

  if (tweets.length === 0) {
    return { ok: false, error: "No tweet content to post" };
  }

  tweets = tweets.map((t) => t.slice(0, 280));

  try {
    // Upload image if provided (v1.1 multipart, OAuth2 user context)
    let mediaId: string | undefined;
    if (imageUrl) {
      try {
        mediaId = await uploadMedia(imageUrl, auth.access_token);
        console.log(`[post_tweet] uploaded media: ${mediaId}`);
      } catch (mediaErr) {
        console.warn("[post_tweet] media upload failed, posting text-only:", mediaErr);
      }
    }

    // Post first tweet
    const firstBody: Record<string, unknown> = { text: tweets[0] };
    if (mediaId) {
      firstBody.media = { media_ids: [mediaId] };
    }

    const firstRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(firstBody),
    });

    if (!firstRes.ok) {
      const detail = await firstRes.text();
      return { ok: false, error: `Twitter API error: ${firstRes.status} ${detail}` };
    }

    const firstResult = (await firstRes.json()) as { data: { id: string } };
    const tweetId = firstResult.data.id;

    // Post thread replies
    let lastTweetId = tweetId;
    for (let i = 1; i < tweets.length; i++) {
      const replyRes = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: tweets[i],
          reply: { in_reply_to_tweet_id: lastTweetId },
        }),
      });
      if (replyRes.ok) {
        const replyResult = (await replyRes.json()) as { data: { id: string } };
        lastTweetId = replyResult.data.id;
      }
    }

    // Update content_posts
    if (contentPostId) {
      await sb
        .from("content_posts")
        .update({ tweet_id: tweetId, posted_at: new Date().toISOString() })
        .eq("id", contentPostId);
    }

    console.log(`[post_tweet] posted tweet ${tweetId} (${tweets.length} tweet(s))`);

    return {
      ok: true,
      output: {
        tweet_id: tweetId,
        posted: true,
        thread_length: tweets.length,
        content_post_id: contentPostId,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function refreshXToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function uploadMedia(imageUrl: string, accessToken: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);

  const imgBuffer = await imgRes.arrayBuffer();
  const form = new FormData();
  form.append("media", new Blob([imgBuffer], { type: "image/png" }), "image.png");

  const uploadRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    throw new Error(`Media upload failed: ${uploadRes.status} ${detail}`);
  }

  const uploadData = (await uploadRes.json()) as { media_id_string: string };
  return uploadData.media_id_string;
}
