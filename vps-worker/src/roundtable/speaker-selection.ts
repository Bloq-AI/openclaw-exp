import { SupabaseClient } from "@supabase/supabase-js";

interface Turn {
  agent_id: string;
  message: string;
}

/**
 * Load affinity weights for participants from ops_agent_relationships.
 * Returns a Map from agent_id to average affinity with other participants.
 */
export async function loadAffinityWeights(
  sb: SupabaseClient,
  participants: string[]
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();

  if (participants.length < 2) {
    for (const p of participants) weights.set(p, 1.0);
    return weights;
  }

  const { data: relationships } = await sb
    .from("ops_agent_relationships")
    .select("agent_a, agent_b, affinity");

  if (!relationships) {
    for (const p of participants) weights.set(p, 1.0);
    return weights;
  }

  // Build affinity map
  const affinityMap = new Map<string, number[]>();
  for (const p of participants) affinityMap.set(p, []);

  for (const rel of relationships) {
    if (participants.includes(rel.agent_a) && participants.includes(rel.agent_b)) {
      affinityMap.get(rel.agent_a)?.push(rel.affinity);
      affinityMap.get(rel.agent_b)?.push(rel.affinity);
    }
  }

  for (const [agentId, affinities] of affinityMap) {
    if (affinities.length === 0) {
      weights.set(agentId, 1.0);
    } else {
      const avg = affinities.reduce((a, b) => a + b, 0) / affinities.length;
      // Normalize around 1.0 — high affinity = slightly more likely to speak
      weights.set(agentId, 0.7 + avg * 0.6);
    }
  }

  return weights;
}

/**
 * Select next speaker with no-back-to-back, recency penalty, and random jitter.
 * affinityWeights is optional — maps agent_id to a weight multiplier (default 1.0).
 */
export function selectNextSpeaker(
  participants: string[],
  history: Turn[],
  affinityWeights?: Map<string, number>
): string {
  if (participants.length === 0) throw new Error("No participants");
  if (history.length === 0) {
    return participants[Math.floor(Math.random() * participants.length)];
  }

  const lastSpeaker = history[history.length - 1].agent_id;

  // Build recency penalty: more recent speakers get lower scores
  const recencyMap = new Map<string, number>();
  const recentTurns = history.slice(-6);
  for (let i = 0; i < recentTurns.length; i++) {
    const agentId = recentTurns[i].agent_id;
    const penalty = (i + 1) / recentTurns.length;
    recencyMap.set(agentId, Math.max(recencyMap.get(agentId) ?? 0, penalty));
  }

  // Score each candidate
  const candidates = participants.filter((p) => p !== lastSpeaker);
  if (candidates.length === 0) return participants[0];

  const scores = candidates.map((agentId) => {
    const recencyPenalty = recencyMap.get(agentId) ?? 0;
    const baseScore = 1.0 - recencyPenalty * 0.6;
    const affinityMul = affinityWeights?.get(agentId) ?? 1.0;
    const jitter = 0.8 + Math.random() * 0.4;
    return { agentId, score: baseScore * affinityMul * jitter };
  });

  // Weighted random selection
  const totalScore = scores.reduce((sum, s) => sum + Math.max(s.score, 0.1), 0);
  let roll = Math.random() * totalScore;

  for (const s of scores) {
    roll -= Math.max(s.score, 0.1);
    if (roll <= 0) return s.agentId;
  }

  return candidates[candidates.length - 1];
}
