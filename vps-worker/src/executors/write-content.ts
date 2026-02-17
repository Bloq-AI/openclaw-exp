import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export async function executeWriteContent(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const topic = step.payload.topic as string | undefined;
    if (!topic) {
      return { ok: false, error: "payload.topic is required" };
    }

    const analysis = step.payload.analysis as string | undefined;
    const format = (step.payload.format as string) || "tweet";

    let prompt = `Write a ${format} about the following topic.\n\nTopic: ${topic}`;
    if (analysis) {
      prompt += `\n\nPrior analysis to incorporate:\n${typeof analysis === "string" ? analysis : JSON.stringify(analysis)}`;
    }
    prompt += `\n\nReturn only the final content text, no extra commentary.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const content = (response.text ?? "").trim();
    return { ok: true, output: { content } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
