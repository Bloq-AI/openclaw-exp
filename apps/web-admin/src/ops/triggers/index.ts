import { SupabaseClient } from "@supabase/supabase-js";
import { createProposalAndMaybeAutoApprove } from "../proposal-service";

interface TriggerResult {
  fired: boolean;
  proposalTemplate?: {
    title: string;
    summary?: string;
    step_kinds: string[];
    payload?: Record<string, unknown>;
  };
  cooldownKey: string;
  cooldownMinutes: number;
}

type TriggerFn = (sb: SupabaseClient) => Promise<TriggerResult>;

/**
 * Registered triggers — add new triggers to this array.
 * Each trigger is evaluated on every heartbeat.
 */
const triggers: { name: string; fn: TriggerFn }[] = [
  // Example (disabled — uncomment and customize):
  // {
  //   name: "daily_content_generation",
  //   fn: async (sb) => ({
  //     fired: true,
  //     proposalTemplate: {
  //       title: "Daily content generation",
  //       step_kinds: ["analyze", "write_content"],
  //     },
  //     cooldownKey: "daily_content",
  //     cooldownMinutes: 60 * 24,
  //   }),
  // },
];

/**
 * Evaluate all triggers, respecting cooldowns.
 * Returns the number of proposals created.
 */
export async function evaluateTriggers(
  sb: SupabaseClient,
  budgetMs: number
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let count = 0;

  for (const trigger of triggers) {
    if (Date.now() >= deadline) break;

    const result = await trigger.fn(sb);
    if (!result.fired || !result.proposalTemplate) continue;

    // Check cooldown
    const cooldownKey = `cooldown:${result.cooldownKey}`;
    const { data: cooldown } = await sb
      .from("ops_policy")
      .select("json")
      .eq("key", cooldownKey)
      .single();

    if (cooldown?.json?.until) {
      const until = new Date(cooldown.json.until);
      if (until > new Date()) continue; // still in cooldown
    }

    // Fire the trigger
    await createProposalAndMaybeAutoApprove(sb, {
      source: "trigger",
      ...result.proposalTemplate,
    });

    // Set cooldown
    const cooldownUntil = new Date(
      Date.now() + result.cooldownMinutes * 60_000
    ).toISOString();

    await sb.from("ops_policy").upsert({
      key: cooldownKey,
      json: { until: cooldownUntil },
      updated_at: new Date().toISOString(),
    });

    count++;
  }

  return count;
}
