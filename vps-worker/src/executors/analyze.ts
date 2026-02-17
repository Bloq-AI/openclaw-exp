import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export async function executeAnalyze(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const topic = step.payload.topic as string | undefined;
    if (!topic) {
      return { ok: false, error: "payload.topic is required" };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following topic and return a structured analysis with key points, current trends, and actionable suggestions.\n\nTopic: ${topic}\n\nRespond in JSON with this shape:\n{"key_points": string[], "trends": string[], "suggestions": string[]}`,
    });

    const text = response.text ?? "";
    let analysis: unknown;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = text;
    }

    return { ok: true, output: { analysis } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
