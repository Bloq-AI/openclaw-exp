import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here after the operator authorises.
 * Exchanges the code for tokens, fetches the person sub, and stores
 * everything in ops_policy under the key "linkedin_auth".
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
  const redirectUri = `${baseUrl}/api/auth/linkedin/callback`;

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/stage?linkedin_error=${encodeURIComponent(error ?? "no_code")}`
    );
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "LinkedIn credentials not configured" },
      { status: 500 }
    );
  }

  // ── Exchange code for access token ──
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return NextResponse.json({ error: "token exchange failed", detail: body }, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  // ── Fetch person ID via OpenID Connect userinfo ──
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: "userinfo fetch failed" }, { status: 502 });
  }

  const userInfo = (await userRes.json()) as { sub: string; name?: string };
  const personUrn = `urn:li:person:${userInfo.sub}`;
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // ── Persist in ops_policy ──
  await supabaseAdmin.from("ops_policy").upsert({
    key: "linkedin_auth",
    json: {
      access_token: tokenData.access_token,
      person_urn: personUrn,
      name: userInfo.name ?? null,
      expires_at: expiresAt,
    },
    updated_at: new Date().toISOString(),
  });

  return NextResponse.redirect(`${baseUrl}/stage?linkedin_connected=1`);
}
