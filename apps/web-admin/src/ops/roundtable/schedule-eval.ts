import { SupabaseClient } from "@supabase/supabase-js";

interface ScheduleSlot {
  format: string;
  probability: number;
}

const schedule: Record<number, ScheduleSlot> = {
  8: { format: "standup", probability: 0.8 },
  9: { format: "standup", probability: 1.0 },
  10: { format: "debate", probability: 0.4 },
  11: { format: "watercooler", probability: 0.3 },
  12: { format: "watercooler", probability: 0.5 },
  13: { format: "debate", probability: 0.5 },
  14: { format: "debate", probability: 0.6 },
  15: { format: "standup", probability: 0.4 },
  16: { format: "watercooler", probability: 0.4 },
  17: { format: "debate", probability: 0.3 },
  18: { format: "standup", probability: 0.6 },
  19: { format: "watercooler", probability: 0.3 },
  20: { format: "debate", probability: 0.4 },
  21: { format: "watercooler", probability: 0.4 },
  22: { format: "watercooler", probability: 0.2 },
};

const agentIds = ["strategist", "hype", "critic", "builder", "creative", "analyst"];

const formatAgentCounts: Record<string, { min: number; max: number }> = {
  standup: { min: 4, max: 6 },
  debate: { min: 2, max: 3 },
  watercooler: { min: 2, max: 3 },
};

function pickParticipants(format: string): string[] {
  const config = formatAgentCounts[format] ?? { min: 2, max: 3 };
  const count = config.min + Math.floor(Math.random() * (config.max - config.min + 1));
  const shuffled = [...agentIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const topics: Record<string, string[]> = {
  standup: [
    "What did we accomplish and what's next?",
    "Status check: wins, blockers, priorities",
    "Quick sync on current operations",
  ],
  debate: [
    "Should we prioritize growth or engagement?",
    "Quality vs quantity in content strategy",
    "Is our current approach sustainable?",
  ],
  watercooler: [
    "Random thoughts on what we've been seeing",
    "Anything interesting catch your eye lately?",
    "Just vibing — what's on your mind?",
  ],
};

function pickTopic(format: string): string {
  const pool = topics[format] ?? topics.watercooler;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Evaluate the roundtable schedule for the current hour.
 * Creates a session + queue entry if conditions are met.
 */
export async function evaluateRoundtableSchedule(
  sb: SupabaseClient
): Promise<number> {
  // Check if roundtable is enabled
  const { data: policy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "roundtable")
    .single();

  if (!policy?.json?.enabled) return 0;

  const enabledFormats: string[] = policy.json.enabled_formats ?? [];
  const maxConcurrent = policy.json.max_concurrent_sessions ?? 1;

  // Check current hour against schedule
  const hour = new Date().getUTCHours();
  const slot = schedule[hour];
  if (!slot) return 0;
  if (!enabledFormats.includes(slot.format)) return 0;

  // Apply probability
  if (Math.random() > slot.probability) return 0;

  // Check if already created for this hour today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: existing } = await sb
    .from("ops_roundtable_sessions")
    .select("id")
    .eq("scheduled_hour", hour)
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return 0;

  // Check concurrent session limit
  const { count: running } = await sb
    .from("ops_roundtable_sessions")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "running"]);

  if ((running ?? 0) >= maxConcurrent) return 0;

  // Create session
  const participants = pickParticipants(slot.format);
  const topic = pickTopic(slot.format);

  const { data: session } = await sb
    .from("ops_roundtable_sessions")
    .insert({
      format: slot.format,
      topic,
      status: "pending",
      participants,
      scheduled_hour: hour,
    })
    .select("id")
    .single();

  if (!session) return 0;

  // Create queue entry for worker
  await sb.from("ops_roundtable_queue").insert({
    session_id: session.id,
    status: "pending",
  });

  return 1;
}
