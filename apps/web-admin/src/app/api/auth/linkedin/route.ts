import { NextResponse } from "next/server";

/**
 * GET /api/auth/linkedin
 * Redirects the operator to LinkedIn's OAuth consent screen.
 * After authorisation LinkedIn calls /api/auth/linkedin/callback.
 */
export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";

  if (!clientId) {
    return NextResponse.json(
      { error: "LINKEDIN_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const redirectUri = `${baseUrl}/api/auth/linkedin/callback`;
  const scope = "openid profile w_member_social";

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);

  return NextResponse.redirect(url.toString());
}
