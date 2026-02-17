import { SupabaseClient } from "@supabase/supabase-js";
import { createProposalAndMaybeAutoApprove } from "../proposal-service";
import { checkerMap } from "./checkers";

/**
 * Evaluate all enabled trigger rules from ops_trigger_rules.
 * Returns the number of proposals created.
 */
export async function evaluateTriggers(
  sb: SupabaseClient,
  budgetMs: number
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let count = 0;

  // Load enabled rules from DB
  const { data: rules, error } = await sb
    .from("ops_trigger_rules")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error || !rules) return 0;

  for (const rule of rules) {
    if (Date.now() >= deadline) break;

    // Look up checker function
    const checker = checkerMap[rule.trigger_event];
    if (!checker) continue;

    // Check cooldown (using last_fired_at + cooldown_minutes + jitter)
    if (rule.last_fired_at) {
      const jitter = rule.jitter_minutes > 0
        ? Math.random() * rule.jitter_minutes * 60_000
        : 0;
      const cooldownUntil =
        new Date(rule.last_fired_at).getTime() +
        rule.cooldown_minutes * 60_000 +
        jitter;
      if (Date.now() < cooldownUntil) continue;
    }

    // For proactive rules, apply skip probability
    if (rule.skip_probability > 0 && Math.random() < rule.skip_probability) {
      continue;
    }

    // Run checker
    const result = await checker(sb, rule.conditions ?? {});
    if (!result.fired) continue;

    // Build proposal from action_config
    const config = rule.action_config as {
      title: string;
      summary?: string;
      step_kinds: string[];
      payload?: Record<string, unknown>;
    };

    if (!config.title || !config.step_kinds) continue;

    // Merge checker payload with config payload
    const mergedPayload = {
      ...(config.payload ?? {}),
      ...(result.payload ?? {}),
      trigger_rule: rule.name,
    };

    await createProposalAndMaybeAutoApprove(sb, {
      source: "trigger",
      title: config.title,
      summary: config.summary,
      step_kinds: config.step_kinds,
      payload: mergedPayload,
    });

    // Update fire_count and last_fired_at
    await sb
      .from("ops_trigger_rules")
      .update({
        fire_count: (rule.fire_count ?? 0) + 1,
        last_fired_at: new Date().toISOString(),
      })
      .eq("id", rule.id);

    count++;
  }

  return count;
}
