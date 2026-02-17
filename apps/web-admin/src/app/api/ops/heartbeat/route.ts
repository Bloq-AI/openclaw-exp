import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateTriggers } from "@/ops/triggers";
import { processReactionQueue } from "@/ops/reactions/process";
import { recoverStaleSteps } from "@/ops/recoverStaleSteps";
import { evaluateRoundtableSchedule } from "@/ops/roundtable/schedule-eval";
import { maybePromoteInsights } from "@/ops/memory/promote";
import { maybeLearnFromOutcomes } from "@/ops/memory/outcomes";
import { maybeQueueInitiatives } from "@/ops/initiatives/queue";

const OPS_KEY = process.env.OPS_KEY;

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get("authorization");
  if (!OPS_KEY || auth !== `Bearer ${OPS_KEY}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const budgetMs = 25_000; // 25s total budget, split across subsystems
  const sliceBudget = Math.floor(budgetMs / 6);

  const triggersCount = await evaluateTriggers(supabaseAdmin, sliceBudget);
  const reactionsCount = await processReactionQueue(
    supabaseAdmin,
    sliceBudget
  );
  const recoveredCount = await recoverStaleSteps(supabaseAdmin, sliceBudget);
  const roundtableCount = await evaluateRoundtableSchedule(supabaseAdmin);

  // Memory subsystem: promote insights + learn from outcomes
  const promotedCount = await maybePromoteInsights(supabaseAdmin);
  const outcomesCount = await maybeLearnFromOutcomes(supabaseAdmin);

  // Initiative subsystem: queue agent-initiated proposals
  const initiativesCount = await maybeQueueInitiatives(supabaseAdmin);

  return NextResponse.json({
    ok: true,
    triggers_fired: triggersCount,
    reactions_processed: reactionsCount,
    stale_steps_recovered: recoveredCount,
    roundtable_sessions_created: roundtableCount,
    memory_promoted: promotedCount,
    memory_outcomes: outcomesCount,
    initiatives_queued: initiativesCount,
    timestamp: new Date().toISOString(),
  });
}
