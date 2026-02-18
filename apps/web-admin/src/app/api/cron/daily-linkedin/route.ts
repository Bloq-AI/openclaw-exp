import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createProposalAndMaybeAutoApprove } from "@/ops/proposal-service";

/**
 * GET /api/cron/daily-linkedin
 * Called by Vercel Cron at 10:00 UTC daily (configured in vercel.json).
 * Fires the GitHub scan → LinkedIn draft pipeline.
 *
 * Vercel passes the CRON_SECRET as a Bearer token in the Authorization header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  // Allow OPS_KEY as a fallback for manual testing
  const cronSecret = process.env.CRON_SECRET;
  const opsKey = process.env.OPS_KEY;
  const token = authHeader?.replace("Bearer ", "");

  if (!token || (token !== cronSecret && token !== opsKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
    source: "trigger",
    title: "GitHub LinkedIn promotion",
    summary:
      "Daily 10 AM: scan bloq-ai GitHub repos and draft a LinkedIn post promoting the most recently updated project",
    step_kinds: ["scan_github", "draft_linkedin_post"],
    payload: { org: "bloq-ai", trigger_rule: "proactive_github_linkedin" },
  });

  // Reset cooldown so heartbeat doesn't double-fire today
  await supabaseAdmin
    .from("ops_trigger_rules")
    .update({ last_fired_at: new Date().toISOString() })
    .eq("name", "proactive_github_linkedin");

  console.log("[cron/daily-linkedin] fired:", result);
  return NextResponse.json({ ok: true, ...result });
}
