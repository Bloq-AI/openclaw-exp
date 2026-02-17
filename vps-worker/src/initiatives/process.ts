import { sb, WORKER_ID, emitEvent } from "../lib/supabase";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * Poll for pending initiatives and process them via LLM to generate proposals.
 */
export async function pollAndProcessInitiative(): Promise<boolean> {
  // Claim a pending initiative
  const { data: initiative } = await sb
    .from("ops_initiative_queue")
    .update({ status: "processing" })
    .eq("status", "pending")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!initiative) return false;

  try {
    // Load agent's memories
    const { data: memories } = await sb
      .from("ops_agent_memory")
      .select("type, content, confidence, tags")
      .eq("agent_id", initiative.agent_id)
      .is("superseded_by", null)
      .order("confidence", { ascending: false })
      .limit(20);

    if (!memories || memories.length === 0) {
      await sb
        .from("ops_initiative_queue")
        .update({ status: "failed" })
        .eq("id", initiative.id);
      return true;
    }

    const memoryText = memories
      .map((m) => `[${m.type}] (${m.confidence}) ${m.content}`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are agent "${initiative.agent_id}". Based on your accumulated knowledge, propose ONE mission the team should undertake.

Your memories:
${memoryText}

Respond in JSON:
{
  "title": "short mission title",
  "summary": "1-2 sentence description of what to do and why",
  "step_kinds": ["analyze" and/or "write_content"],
  "topic": "the core topic to focus on"
}

Only propose step_kinds from: analyze, write_content. Keep it practical and actionable.`,
    });

    const text = response.text ?? "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const proposal = JSON.parse(cleaned);

    if (!proposal.title || !proposal.step_kinds) {
      throw new Error("Invalid proposal structure");
    }

    // Create proposal via Supabase (mimicking the proposal-service pattern)
    const { data: inserted } = await sb
      .from("ops_mission_proposals")
      .insert({
        status: "pending",
        source: "api",
        title: `[${initiative.agent_id}] ${proposal.title}`,
        summary: proposal.summary,
        step_kinds: proposal.step_kinds,
        payload: {
          topic: proposal.topic,
          initiated_by: initiative.agent_id,
          initiative_id: initiative.id,
        },
      })
      .select("id")
      .single();

    if (inserted) {
      await emitEvent("initiative:proposed", ["initiative", "proposed"], {
        agent_id: initiative.agent_id,
        proposal_id: inserted.id,
        title: proposal.title,
      });
    }

    await sb
      .from("ops_initiative_queue")
      .update({ status: "done" })
      .eq("id", initiative.id);

    console.log(
      `[initiative] ${initiative.agent_id} proposed: "${proposal.title}"`
    );
    return true;
  } catch (err) {
    console.error(`[initiative] processing error:`, err);
    await sb
      .from("ops_initiative_queue")
      .update({ status: "failed" })
      .eq("id", initiative.id);
    return true;
  }
}
