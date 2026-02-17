import { SupabaseClient } from "@supabase/supabase-js";
import { createProposalAndMaybeAutoApprove } from "../proposal-service";

/**
 * Match recent events against the reaction_matrix policy and enqueue reactions.
 * Then process any due reactions.
 */
export async function processReactionQueue(
  sb: SupabaseClient,
  budgetMs: number
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let count = 0;

  // 1. Load reaction matrix
  const { data: matrixRow } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "reaction_matrix")
    .single();

  const patterns: ReactionPattern[] = matrixRow?.json?.patterns ?? [];

  // 2. Find the last check timestamp
  const { data: lastCheckRow } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "reaction_last_check")
    .single();

  const lastCheck =
    lastCheckRow?.json?.at ?? new Date(Date.now() - 60_000).toISOString();

  // 3. Get recent events since last check
  const { data: events } = await sb
    .from("ops_agent_events")
    .select("*")
    .gt("created_at", lastCheck)
    .order("created_at", { ascending: true })
    .limit(100);

  // 4. Match events against patterns and enqueue reactions
  if (events && events.length > 0) {
    for (const event of events) {
      if (Date.now() >= deadline) break;

      for (const pattern of patterns) {
        if (matchesPattern(event, pattern)) {
          await sb.from("ops_agent_reactions").insert({
            event_id: event.id,
            target_agent: pattern.target_agent ?? "control-plane",
            reaction_type: pattern.reaction_type,
            run_after: pattern.delay_seconds
              ? new Date(
                  Date.now() + pattern.delay_seconds * 1000
                ).toISOString()
              : new Date().toISOString(),
          });
        }
      }
    }

    // Update last check timestamp
    await sb.from("ops_policy").upsert({
      key: "reaction_last_check",
      json: { at: events[events.length - 1].created_at },
      updated_at: new Date().toISOString(),
    });
  }

  // 5. Process due reactions
  const { data: dueReactions } = await sb
    .from("ops_agent_reactions")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(20);

  if (dueReactions) {
    for (const reaction of dueReactions) {
      if (Date.now() >= deadline) break;

      // Load the triggering event
      const { data: event } = await sb
        .from("ops_agent_events")
        .select("*")
        .eq("id", reaction.event_id)
        .single();

      if (!event) {
        await sb
          .from("ops_agent_reactions")
          .update({ status: "skipped" })
          .eq("id", reaction.id);
        continue;
      }

      // Generate proposal from reaction
      await createProposalAndMaybeAutoApprove(sb, {
        source: "reaction",
        title: `Reaction: ${reaction.reaction_type} to ${event.type}`,
        summary: `Auto-generated from reaction to event ${event.id}`,
        step_kinds: [reaction.reaction_type],
        payload: { event_id: event.id, event_payload: event.payload },
      });

      await sb
        .from("ops_agent_reactions")
        .update({ status: "done" })
        .eq("id", reaction.id);

      count++;
    }
  }

  return count;
}

interface ReactionPattern {
  tags: string[];
  reaction_type: string;
  target_agent?: string;
  delay_seconds?: number;
}

function matchesPattern(
  event: { tags: string[] },
  pattern: ReactionPattern
): boolean {
  return pattern.tags.every((t) => event.tags.includes(t));
}
