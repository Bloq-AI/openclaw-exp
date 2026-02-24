import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createProposalAndMaybeAutoApprove } from "@/ops/proposal-service";

/**
 * GET /api/cron/daily-twitter
 *
 * Fires the daily Twitter content pipeline for BLOQ AI:
 *   scan_x_competitors → draft_x_post → generate_image → post_tweet
 *
 * Scheduled 3× daily by Vercel Cron (9:00, 13:00, 17:00 UTC).
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

  // Each daily cron fires a single tweet pipeline
  // The pillar rotates by time-of-day within the day's content plan
  const hour = new Date().getUTCHours();
  let pillar = "ai_in_real_companies";
  if (hour >= 13 && hour < 17) pillar = "building_in_public";
  else if (hour >= 17) pillar = "gcc_tech_finance";

  const result = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
    source: "trigger",
    title: "BLOQ AI Twitter post",
    summary: `Daily X/Twitter content pipeline — scan competitors, draft post with BLOQ persona (${pillar.replace(/_/g, " ")}), generate image, post tweet`,
    step_kinds: ["scan_x_competitors", "draft_x_post", "generate_image", "post_tweet"],
    payload: {
      brand: "bloq",
      platform: "twitter",
      pillar,
      trigger_rule: "daily_twitter",
    },
  });

  console.log("[cron/daily-twitter] fired:", result);
  return NextResponse.json({ ok: true, pillar, ...result });
}
