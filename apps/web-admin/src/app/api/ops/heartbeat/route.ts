import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateTriggers } from "@/ops/triggers";
import { processReactionQueue } from "@/ops/reactions/process";
import { recoverStaleSteps } from "@/ops/recoverStaleSteps";

const OPS_KEY = process.env.OPS_KEY;

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get("authorization");
  if (!OPS_KEY || auth !== `Bearer ${OPS_KEY}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const budgetMs = 25_000; // 25s total budget, split across subsystems
  const sliceBudget = Math.floor(budgetMs / 3);

  const triggersCount = await evaluateTriggers(supabaseAdmin, sliceBudget);
  const reactionsCount = await processReactionQueue(
    supabaseAdmin,
    sliceBudget
  );
  const recoveredCount = await recoverStaleSteps(supabaseAdmin, sliceBudget);

  return NextResponse.json({
    ok: true,
    triggers_fired: triggersCount,
    reactions_processed: reactionsCount,
    stale_steps_recovered: recoveredCount,
    timestamp: new Date().toISOString(),
  });
}
