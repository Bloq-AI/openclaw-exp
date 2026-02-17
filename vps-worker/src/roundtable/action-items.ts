import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { emitEvent } from "../lib/supabase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

const QUALIFYING_FORMATS = ["standup", "debate"];
const MAX_PER_DAY = 3;

interface Turn {
  agent_id: string;
  message: string;
}

/**
 * Extract action items from qualifying roundtable sessions.
 * Creates proposals for actionable items discussed.
 */
export async function extractActionItems(
  sb: SupabaseClient,
  sessionId: string,
  format: string,
  turns: Turn[],
  topic: string
): Promise<number> {
  if (!QUALIFYING_FORMATS.includes(format)) return 0;
  if (turns.length < 4) return 0;

  // Check daily limit
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: todayCount } = await sb
    .from("ops_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "actionitem:created")
    .gte("created_at", todayStart.toISOString());

  if ((todayCount ?? 0) >= MAX_PER_DAY) return 0;

  const remaining = MAX_PER_DAY - (todayCount ?? 0);

  const conversationText = turns
    .map((t) => `[${t.agent_id}]: ${t.message}`)
    .join("\n");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract up to ${remaining} concrete action items from this ${format} conversation about "${topic}".

${conversationText}

Only extract items that were clearly agreed upon or strongly advocated. Each should be a practical mission.

Respond in JSON:
{"action_items": [{"title": string, "summary": string, "step_kinds": ["analyze" and/or "write_content"], "topic": string}]}

Only use step_kinds: analyze, write_content. Return empty array if no clear action items.`,
    });

    const text = response.text ?? "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const items = (parsed.action_items ?? []).slice(0, remaining);

    let created = 0;
    for (const item of items) {
      if (!item.title || !item.step_kinds) continue;

      const { data: proposal } = await sb
        .from("ops_mission_proposals")
        .insert({
          status: "pending",
          source: "api",
          title: `[roundtable] ${item.title}`,
          summary: item.summary,
          step_kinds: item.step_kinds,
          payload: {
            topic: item.topic,
            source_session: sessionId,
            source_format: format,
          },
        })
        .select("id")
        .single();

      if (proposal) {
        await emitEvent("actionitem:created", ["actionitem", "created"], {
          proposal_id: proposal.id,
          session_id: sessionId,
          title: item.title,
        });
        created++;
      }
    }

    return created;
  } catch (err) {
    console.error("[action-items] extraction error:", err);
    return 0;
  }
}
