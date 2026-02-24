import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createProposalAndMaybeAutoApprove } from "@/ops/proposal-service";

/**
 * GET /api/cron/weekly-evolve
 *
 * Fires the weekly self-evolution pipeline:
 *   analyze_content_performance
 *   → judge_content_quality       (4 specialist judges in parallel)
 *   → synthesize_improvements     (synthesizes → saves new persona_versions)
 *
 * Also fires a separate evolve_image_prompts mission if there is
 * enough unprocessed image feedback.
 *
 * Runs every Sunday at 07:00 UTC (before Monday's linkedin-promote and twitter posts).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const opsKey = process.env.OPS_KEY;
  const token = authHeader?.replace("Bearer ", "");

  if (!token || (token !== cronSecret && token !== opsKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── 1. Content evolution pipeline ────────────────────────────────
  const contentEvolution = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
    source: "trigger",
    title: "Weekly content evolution",
    summary:
      "Analyze 14-day content performance → 4 judges evaluate quality → synthesize improvements → save new persona versions for Twitter",
    step_kinds: [
      "analyze_content_performance",
      "judge_content_quality",
      "synthesize_improvements",
    ],
    payload: {
      brand: "bloq",
      platform: "twitter",
      lookback_days: 14,
      top_n_examples: 5,
      trigger_rule: "weekly_evolve",
    },
  });
  results.content_evolution = contentEvolution;

  // ── 2. Image prompt evolution (if unprocessed feedback exists) ────
  const { count: unprocessedFeedback } = await supabaseAdmin
    .from("image_feedback")
    .select("*", { count: "exact", head: true })
    .eq("processed", false);

  if ((unprocessedFeedback ?? 0) >= 3) {
    const imageEvolution = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
      source: "trigger",
      title: "Image prompt evolution",
      summary: `Evolve image style prompts based on ${unprocessedFeedback} user feedback items`,
      step_kinds: ["evolve_image_prompts"],
      payload: {
        brand: "bloq",
        platform: "both",
        min_feedback: 3,
        trigger_rule: "weekly_evolve_images",
      },
    });
    results.image_evolution = imageEvolution;
  } else {
    results.image_evolution = { skipped: true, reason: `Only ${unprocessedFeedback ?? 0} feedback items (min 3)` };
  }

  console.log("[cron/weekly-evolve] fired:", results);
  return NextResponse.json({ ok: true, ...results });
}
