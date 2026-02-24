import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/ops/linkedin/status
 * Returns whether a LinkedIn account is connected and its name/expiry.
 */
export async function GET() {
  const [{ data }, { data: orgData }] = await Promise.all([
    supabaseAdmin.from("ops_policy").select("json").eq("key", "linkedin_auth").single(),
    supabaseAdmin.from("ops_policy").select("json").eq("key", "linkedin_org_auth").single(),
  ]);

  const auth = data?.json as { name?: string; org_name?: string; org_urn?: string | null; person_urn?: string; expires_at?: string } | null;
  const orgAuth = orgData?.json as { org_urn?: string; expires_at?: string } | null;

  const expired = auth?.expires_at ? new Date(auth.expires_at) < new Date() : true;
  const orgExpired = orgAuth?.expires_at ? new Date(orgAuth.expires_at) < new Date() : true;

  return NextResponse.json({
    connected: !!auth && !expired,
    name: auth?.org_name ?? auth?.name ?? null,
    expires_at: auth?.expires_at ?? null,
    expired,
    org_urn: auth?.org_urn ?? null,
    person_urn: auth?.person_urn ?? null,
    // Org token (Community Management API app)
    org_token_connected: !!orgAuth && !orgExpired,
    org_token_expires_at: orgAuth?.expires_at ?? null,
    org_token_expired: orgExpired,
  });
}
