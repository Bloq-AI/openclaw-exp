import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/auth/linkedin-org/callback
 * Exchanges the code for a token with w_organization_social scope,
 * then stores it in ops_policy under "linkedin_org_auth".
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const clientId = process.env.LINKEDIN_ORG_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_ORG_CLIENT_SECRET;
  const orgId = process.env.LINKEDIN_ORG_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
  const redirectUri = `${baseUrl}/api/auth/linkedin-org/callback`;

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/stage?linkedin_org_error=${encodeURIComponent(error ?? "no_code")}`
    );
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "LINKEDIN_ORG_CLIENT_ID / LINKEDIN_ORG_CLIENT_SECRET not configured" }, { status: 500 });
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

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const orgUrn = orgId ? `urn:li:organization:${orgId}` : null;

  // ── Persist in ops_policy ──
  await supabaseAdmin.from("ops_policy").upsert({
    key: "linkedin_org_auth",
    json: {
      access_token: tokenData.access_token,
      org_urn: orgUrn,
      expires_at: expiresAt,
    },
    updated_at: new Date().toISOString(),
  });

  return NextResponse.redirect(`${baseUrl}/stage?linkedin_org_connected=1`);
}
