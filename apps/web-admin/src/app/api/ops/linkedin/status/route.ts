import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/ops/linkedin/status
 * Returns whether a LinkedIn account is connected and its name/expiry.
 */
export async function GET() {
  const { data } = await supabaseAdmin
    .from("ops_policy")
    .select("json")
    .eq("key", "linkedin_auth")
    .single();

  if (!data?.json) {
    return NextResponse.json({ connected: false });
  }

  const auth = data.json as { name?: string; org_name?: string; expires_at?: string };
  const expired = auth.expires_at ? new Date(auth.expires_at) < new Date() : false;

  return NextResponse.json({
    connected: !expired,
    name: auth.org_name ?? auth.name ?? null,
    expires_at: auth.expires_at ?? null,
    expired,
  });
}
