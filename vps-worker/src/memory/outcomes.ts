import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * Review recent tweet/content performance and write lesson memories.
 */
export async function learnFromOutcomes(sb: SupabaseClient): Promise<number> {
  // Get recent successful post_tweet steps (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { data: events } = await sb
    .from("ops_agent_events")
    .select("payload, created_at")
    .eq("type", "step:succeeded")
    .contains("tags", ["post_tweet"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!events || events.length === 0) return 0;

  // Check if we already processed these
  const traceId = `outcomes:${new Date().toISOString().slice(0, 13)}`; // hourly dedup
  const { data: existing } = await sb
    .from("ops_agent_memory")
    .select("id")
    .eq("source_trace_id", traceId)
    .limit(1);

  if (existing && existing.length > 0) return 0;

  const summaries = events.map((e) => {
    const p = e.payload as Record<string, unknown>;
    return `Tweet posted at ${e.created_at}: ${JSON.stringify(p.output ?? {})}`;
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Review these recent content outcomes and extract 1-3 lessons about what works and what doesn't.

${summaries.join("\n")}

Respond in JSON:
{"lessons": [{"content": string, "confidence": 0.0-1.0, "tags": string[]}]}`,
    });

    const text = response.text ?? "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const lessons = (parsed.lessons ?? []).filter(
      (l: { confidence: number }) => l.confidence >= 0.55
    );

    let count = 0;
    for (const lesson of lessons) {
      await sb.from("ops_agent_memory").upsert(
        {
          agent_id: "strategist", // strategist owns outcome lessons
          type: "lesson",
          content: lesson.content,
          confidence: lesson.confidence,
          tags: lesson.tags ?? ["outcome"],
          source_trace_id: `${traceId}:${count}`,
        },
        { onConflict: "source_trace_id" }
      );
      count++;
    }

    return count;
  } catch (err) {
    console.error("[memory] learnFromOutcomes error:", err);
    return 0;
  }
}
