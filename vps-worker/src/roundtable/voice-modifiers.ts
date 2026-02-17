import { SupabaseClient } from "@supabase/supabase-js";

const MAX_MODIFIERS = 3;

interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  topTags: string[];
}

/**
 * Derive voice modifiers based on an agent's accumulated memories.
 * Returns up to 3 personality evolution modifiers.
 */
export async function deriveVoiceModifiers(
  sb: SupabaseClient,
  agentId: string
): Promise<string[]> {
  const { data: memories } = await sb
    .from("ops_agent_memory")
    .select("type, tags")
    .eq("agent_id", agentId)
    .is("superseded_by", null);

  if (!memories || memories.length < 3) return [];

  // Aggregate stats
  const stats: MemoryStats = {
    totalCount: memories.length,
    byType: {},
    topTags: [],
  };

  const tagCounts = new Map<string, number>();

  for (const mem of memories) {
    stats.byType[mem.type] = (stats.byType[mem.type] ?? 0) + 1;
    for (const tag of mem.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  stats.topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Apply rules to derive modifiers
  const modifiers: string[] = [];

  if ((stats.byType.lesson ?? 0) >= 10) {
    modifiers.push("Speaks from hard-won experience — references past outcomes naturally");
  } else if ((stats.byType.lesson ?? 0) >= 5) {
    modifiers.push("Occasionally references lessons learned from past efforts");
  }

  if ((stats.byType.insight ?? 0) >= 8) {
    modifiers.push("Has developed deep intuition — makes bold, confident claims");
  } else if ((stats.byType.insight ?? 0) >= 4) {
    modifiers.push("Starting to see bigger patterns — connects dots across topics");
  }

  if ((stats.byType.strategy ?? 0) >= 5) {
    modifiers.push("Thinks strategically — naturally frames discussions around next moves");
  }

  if ((stats.byType.pattern ?? 0) >= 7) {
    modifiers.push("Notices recurring themes — often says 'we keep seeing this'");
  }

  if (stats.totalCount >= 50) {
    modifiers.push("A team veteran — speaks with authority and shorthand");
  } else if (stats.totalCount >= 20) {
    modifiers.push("Growing more confident — has found their voice in the team");
  }

  if (stats.topTags.length >= 3) {
    modifiers.push(
      `Has developed expertise in: ${stats.topTags.slice(0, 3).join(", ")}`
    );
  }

  return modifiers.slice(0, MAX_MODIFIERS);
}
