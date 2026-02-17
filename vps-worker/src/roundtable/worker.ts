import { sb, WORKER_ID, emitEvent } from "../lib/supabase";
import { GoogleGenAI } from "@google/genai";
import { agentMap } from "./agents";
import { formats } from "./formats";
import { buildSystemPrompt } from "./voices";
import { selectNextSpeaker, loadAffinityWeights } from "./speaker-selection";
import { distillMemoriesFromConversation } from "../memory/distill";
import { applyDrift } from "../relationships/drift";
import { extractActionItems } from "./action-items";
import { deriveVoiceModifiers } from "./voice-modifiers";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

interface Turn {
  agent_id: string;
  message: string;
  timestamp: string;
}

/**
 * Poll the roundtable queue, claim a session, and orchestrate conversation.
 */
export async function pollAndProcessRoundtable(): Promise<boolean> {
  // Claim a pending queue entry
  const { data: queueEntry } = await sb
    .from("ops_roundtable_queue")
    .update({ status: "claimed", claimed_by: WORKER_ID, claimed_at: new Date().toISOString() })
    .eq("status", "pending")
    .select("id, session_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!queueEntry) return false;

  // Load session
  const { data: session } = await sb
    .from("ops_roundtable_sessions")
    .select("*")
    .eq("id", queueEntry.session_id)
    .single();

  if (!session) {
    await sb.from("ops_roundtable_queue").update({ status: "done" }).eq("id", queueEntry.id);
    return false;
  }

  // Load roundtable policy
  const { data: policy } = await sb
    .from("ops_policy")
    .select("json")
    .eq("key", "roundtable")
    .single();

  const maxTurns = policy?.json?.max_turns ?? 12;
  const charCap = policy?.json?.char_cap ?? 120;

  const format = formats[session.format];
  if (!format) {
    await failSession(session.id, queueEntry.id, "unknown format");
    return true;
  }

  // Mark session as running
  await sb
    .from("ops_roundtable_sessions")
    .update({ status: "running" })
    .eq("id", session.id);

  await emitEvent("roundtable:started", ["roundtable", "started"], {
    session_id: session.id,
    format: session.format,
    topic: session.topic,
    participants: session.participants,
  });

  // Load affinity weights for speaker selection
  const affinityWeights = await loadAffinityWeights(sb, session.participants);

  // Derive voice modifiers for each participant (cached per session)
  const voiceModifiers = new Map<string, string[]>();
  for (const participantId of session.participants) {
    const mods = await deriveVoiceModifiers(sb, participantId);
    voiceModifiers.set(participantId, mods);
  }

  // Determine turn count
  const turnCount =
    format.minTurns + Math.floor(Math.random() * (format.maxTurns - format.minTurns + 1));
  const effectiveTurns = Math.min(turnCount, maxTurns);

  const turns: Turn[] = [];

  for (let i = 0; i < effectiveTurns; i++) {
    const speakerId = selectNextSpeaker(session.participants, turns, affinityWeights);
    const agent = agentMap.get(speakerId);
    if (!agent) continue;

    const systemPrompt = buildSystemPrompt(
      agent, format, turns, charCap, voiceModifiers.get(speakerId)
    );

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Topic: ${session.topic}\n\nRespond in character.`,
        config: {
          temperature: format.temperature,
          systemInstruction: systemPrompt,
        },
      });

      let message = response.text?.trim() ?? "";
      // Enforce char cap
      if (message.length > charCap) {
        message = message.slice(0, charCap - 3) + "...";
      }

      const turn: Turn = {
        agent_id: speakerId,
        message,
        timestamp: new Date().toISOString(),
      };
      turns.push(turn);

      // Update session turns in DB after each turn
      await sb
        .from("ops_roundtable_sessions")
        .update({ turns: JSON.parse(JSON.stringify(turns)) })
        .eq("id", session.id);
    } catch (err) {
      console.error(`[roundtable] LLM error for ${speakerId}:`, err);
      // Skip this turn but continue the conversation
    }
  }

  // Complete session
  await sb
    .from("ops_roundtable_sessions")
    .update({
      status: "completed",
      turns: JSON.parse(JSON.stringify(turns)),
      completed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  await sb.from("ops_roundtable_queue").update({ status: "done" }).eq("id", queueEntry.id);

  await emitEvent("roundtable:completed", ["roundtable", "completed"], {
    session_id: session.id,
    format: session.format,
    turn_count: turns.length,
    participants: session.participants,
  });

  // Distill memories and relationship drifts from conversation
  try {
    const distillResult = await distillMemoriesFromConversation(
      sb, session.id, turns, session.participants
    );
    console.log(`[roundtable] distilled ${distillResult.memories.length} memories for session ${session.id}`);

    // Apply relationship drifts
    for (const drift of distillResult.drifts) {
      await applyDrift(sb, drift.agent_a, drift.agent_b, drift.delta, drift.reason);
    }
    if (distillResult.drifts.length > 0) {
      console.log(`[roundtable] applied ${distillResult.drifts.length} relationship drifts`);
    }

    // Extract action items from qualifying formats
    const actionCount = await extractActionItems(
      sb, session.id, session.format, turns, session.topic
    );
    if (actionCount > 0) {
      console.log(`[roundtable] extracted ${actionCount} action items`);
    }
  } catch (err) {
    console.error("[roundtable] memory/drift/actions error:", err);
  }

  console.log(
    `[roundtable] completed session ${session.id} (${session.format}, ${turns.length} turns)`
  );

  return true;
}

async function failSession(sessionId: string, queueId: string, error: string) {
  await sb
    .from("ops_roundtable_sessions")
    .update({ status: "failed" })
    .eq("id", sessionId);
  await sb.from("ops_roundtable_queue").update({ status: "done" }).eq("id", queueId);
  await emitEvent("roundtable:failed", ["roundtable", "failed"], {
    session_id: sessionId,
    error,
  });
}
