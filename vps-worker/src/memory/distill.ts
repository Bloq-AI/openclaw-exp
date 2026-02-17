import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

const MAX_MEMORIES_PER_AGENT = 200;

interface Turn {
  agent_id: string;
  message: string;
}

interface ExtractedMemory {
  agent_id: string;
  type: "insight" | "pattern" | "strategy" | "preference" | "lesson";
  content: string;
  confidence: number;
  tags: string[];
}

interface PairwiseDrift {
  agent_a: string;
  agent_b: string;
  delta: number; // positive = warmer, negative = cooler
  reason: string;
}

interface DistillResult {
  memories: ExtractedMemory[];
  drifts: PairwiseDrift[];
}

/**
 * Distill memories from a completed roundtable conversation.
 * Single LLM call extracts both memories and pairwise drift.
 */
export async function distillMemoriesFromConversation(
  sb: SupabaseClient,
  sessionId: string,
  turns: Turn[],
  participants: string[]
): Promise<DistillResult> {
  if (turns.length === 0) return { memories: [], drifts: [] };

  const conversationText = turns
    .map((t) => `[${t.agent_id}]: ${t.message}`)
    .join("\n");

  const prompt = `Analyze this agent conversation and extract:

1. MEMORIES: Up to 6 key memories that agents should retain. Each memory belongs to a specific agent.
Types: insight (new understanding), pattern (recurring observation), strategy (approach to try), preference (style/topic preference), lesson (learned from outcome).

2. PAIRWISE_DRIFT: How did agent relationships shift? For each notable pair interaction, indicate if they warmed up (positive delta) or cooled down (negative delta). Delta range: -0.03 to +0.03.

Participants: ${participants.join(", ")}

Conversation:
${conversationText}

Respond in JSON:
{
  "memories": [{"agent_id": string, "type": string, "content": string, "confidence": 0.0-1.0, "tags": string[]}],
  "pairwise_drift": [{"agent_a": string, "agent_b": string, "delta": number, "reason": string}]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text ?? "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const memories: ExtractedMemory[] = (parsed.memories ?? [])
      .filter((m: ExtractedMemory) => m.confidence >= 0.55)
      .slice(0, 6);

    const drifts: PairwiseDrift[] = (parsed.pairwise_drift ?? []).map(
      (d: PairwiseDrift) => ({
        ...d,
        delta: Math.max(-0.03, Math.min(0.03, d.delta)),
      })
    );

    // Insert memories with dedup via source_trace_id
    for (const mem of memories) {
      const traceId = `${sessionId}:${mem.agent_id}:${mem.content.slice(0, 50)}`;

      // Check cap per agent
      const { count } = await sb
        .from("ops_agent_memory")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", mem.agent_id);

      if ((count ?? 0) >= MAX_MEMORIES_PER_AGENT) {
        // Delete oldest low-confidence memory
        const { data: oldest } = await sb
          .from("ops_agent_memory")
          .select("id")
          .eq("agent_id", mem.agent_id)
          .is("superseded_by", null)
          .order("confidence", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1);

        if (oldest && oldest.length > 0) {
          await sb.from("ops_agent_memory").delete().eq("id", oldest[0].id);
        }
      }

      await sb.from("ops_agent_memory").upsert(
        {
          agent_id: mem.agent_id,
          type: mem.type,
          content: mem.content,
          confidence: mem.confidence,
          tags: mem.tags ?? [],
          source_trace_id: traceId,
        },
        { onConflict: "source_trace_id" }
      );
    }

    return { memories, drifts };
  } catch (err) {
    console.error("[memory] distillation error:", err);
    return { memories: [], drifts: [] };
  }
}
