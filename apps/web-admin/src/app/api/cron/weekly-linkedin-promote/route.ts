import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createProposalAndMaybeAutoApprove } from "@/ops/proposal-service";

/**
 * GET /api/cron/weekly-linkedin-promote
 *
 * Fires the weekly Twitter→LinkedIn promotion pipeline:
 *   select_top_performers → promote_to_linkedin
 *
 * Runs every Monday at 08:00 UTC via Vercel Cron.
 * The promote_to_linkedin step generates LinkedIn content + image and
 * creates drafts in ops_content_drafts for human review.
 *
 * Also accepts OPS_KEY as a manual trigger for testing.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const opsKey = process.env.OPS_KEY;
  const token = authHeader?.replace("Bearer ", "");

  if (!token || (token !== cronSecret && token !== opsKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
    source: "trigger",
    title: "Weekly Twitter→LinkedIn promotion",
    summary:
      "Pick the top 2-3 performing Twitter posts from the past week and expand them into LinkedIn long-form posts with brand images",
    step_kinds: ["select_top_performers", "promote_to_linkedin"],
    payload: {
      brand: "bloq",
      top_n: 3,
      min_score: 5,
      lookback_days: 7,
      trigger_rule: "weekly_linkedin_promote",
    },
  });

  console.log("[cron/weekly-linkedin-promote] fired:", result);
  return NextResponse.json({ ok: true, ...result });
}
