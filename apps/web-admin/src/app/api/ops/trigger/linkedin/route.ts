import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createProposalAndMaybeAutoApprove } from "@/ops/proposal-service";

const OPS_KEY = process.env.OPS_KEY;

/**
 * POST /api/ops/trigger/linkedin
 * Immediately fires a GitHub scan → LinkedIn draft pipeline, bypassing the
 * proactive trigger cooldown. Useful for manual on-demand runs.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!OPS_KEY || auth !== `Bearer ${OPS_KEY}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await createProposalAndMaybeAutoApprove(supabaseAdmin, {
    source: "trigger",
    title: "GitHub LinkedIn promotion",
    summary:
      "Scan bloq-ai GitHub repos and draft a LinkedIn post promoting the most interesting project",
    step_kinds: ["scan_github", "draft_linkedin_post"],
    payload: { org: "bloq-ai", trigger_rule: "proactive_github_linkedin" },
  });

  return NextResponse.json({ ok: true, ...result });
}
