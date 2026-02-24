import { NextResponse } from "next/server";

/**
 * GET /api/auth/linkedin-org
 * Starts OAuth with the dedicated org-posting LinkedIn app (Community Management API).
 * Requires a separate LinkedIn app with ONLY Community Management API product.
 * Env vars: LINKEDIN_ORG_CLIENT_ID, LINKEDIN_ORG_CLIENT_SECRET
 */
export async function GET() {
  const clientId = process.env.LINKEDIN_ORG_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";

  if (!clientId) {
    return NextResponse.json(
      { error: "LINKEDIN_ORG_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${baseUrl}/api/auth/linkedin-org/callback`;
  const scope = "w_organization_social";

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);

  return NextResponse.redirect(url.toString());
}
