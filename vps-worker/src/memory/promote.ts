import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * Find repeated observations/patterns and synthesize them into insights.
 * Promotes low-level memories into higher-confidence insights.
 */
export async function promoteInsights(sb: SupabaseClient): Promise<number> {
  // Get agents with enough pattern/lesson memories to promote
  const { data: agents } = await sb
    .from("ops_agent_memory")
    .select("agent_id")
    .in("type", ["pattern", "lesson"])
    .is("superseded_by", null);

  if (!agents) return 0;

  // Count per agent
  const agentCounts = new Map<string, number>();
  for (const row of agents) {
    agentCounts.set(row.agent_id, (agentCounts.get(row.agent_id) ?? 0) + 1);
  }

  let promoted = 0;

  for (const [agentId, count] of agentCounts) {
    if (count < 3) continue; // Need at least 3 observations to synthesize

    // Get the observations
    const { data: observations } = await sb
      .from("ops_agent_memory")
      .select("id, type, content, confidence, tags")
      .eq("agent_id", agentId)
      .in("type", ["pattern", "lesson"])
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!observations || observations.length < 3) continue;

    // Check hourly dedup
    const traceId = `promote:${agentId}:${new Date().toISOString().slice(0, 13)}`;
    const { data: existing } = await sb
      .from("ops_agent_memory")
      .select("id")
      .eq("source_trace_id", traceId)
      .limit(1);

    if (existing && existing.length > 0) continue;

    try {
      const observationText = observations
        .map((o) => `[${o.type}] ${o.content} (confidence: ${o.confidence})`)
        .join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Given these observations from agent "${agentId}", synthesize 1-2 higher-level insights. Only create an insight if multiple observations support it.

${observationText}

Respond in JSON:
{"insights": [{"content": string, "confidence": 0.0-1.0, "tags": string[], "supersedes": number[]}]}
Where "supersedes" is an array of 0-indexed observation indices that this insight absorbs.`,
      });

      const text = response.text ?? "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      for (const insight of parsed.insights ?? []) {
        if (insight.confidence < 0.6) continue;

        const { data: newMemory } = await sb
          .from("ops_agent_memory")
          .insert({
            agent_id: agentId,
            type: "insight",
            content: insight.content,
            confidence: insight.confidence,
            tags: insight.tags ?? [],
            source_trace_id: `${traceId}:${promoted}`,
          })
          .select("id")
          .single();

        // Mark superseded observations
        if (newMemory && insight.supersedes) {
          for (const idx of insight.supersedes) {
            if (idx >= 0 && idx < observations.length) {
              await sb
                .from("ops_agent_memory")
                .update({ superseded_by: newMemory.id })
                .eq("id", observations[idx].id);
            }
          }
        }

        promoted++;
      }
    } catch (err) {
      console.error(`[memory] promote error for ${agentId}:`, err);
    }
  }

  return promoted;
}
