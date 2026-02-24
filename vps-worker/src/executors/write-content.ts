import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { getPersona, getDailyPillar } from "../personas/bloq";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * write_content executor
 *
 * General-purpose content writer. Loads the BLOQ persona for the given
 * brand + platform and generates content using the appropriate voice and rules.
 *
 * Payload:
 *   topic     string  — the topic to write about
 *   format    string  — 'tweet' | 'linkedin' | 'thread' (default: 'tweet')
 *   brand     string  — 'bloq' | 'hadi' | 'fikrah' (default: 'bloq')
 *   platform  string  — 'twitter' | 'linkedin' (default: 'twitter')
 *   analysis  string? — prior analysis to incorporate
 *   pillar    string? — content pillar override
 */
export async function executeWriteContent(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const topic = step.payload.topic as string | undefined;
    if (!topic) {
      return { ok: false, error: "payload.topic is required" };
    }

    const format = (step.payload.format as string) || "tweet";
    const brand = (step.payload.brand as string) || "bloq";
    const platform = format === "linkedin" ? "linkedin" : "twitter";
    const analysis = step.payload.analysis as string | undefined;
    const pillar = (step.payload.pillar as string) ?? getDailyPillar();

    const persona = getPersona(brand, platform);

    let prompt = `${persona.system_prompt}

Content pillar for today: ${pillar.replace(/_/g, " ")}

Topic to write about: ${topic}`;

    if (analysis) {
      prompt += `\n\nPrior analysis to incorporate:\n${typeof analysis === "string" ? analysis : JSON.stringify(analysis)}`;
    }

    if (format === "thread") {
      prompt += `\n\nWrite a 3-5 tweet thread. Return a JSON array of strings, each under 280 characters.\nExample: ["Hook tweet.", "Development.", "Close."]`;
    } else if (format === "linkedin") {
      prompt += `\n\n${persona.content_rules}\n\nReturn only the LinkedIn post text.`;
    } else {
      prompt += `\n\n${persona.content_rules}\n\nReturn only the tweet text (under 280 characters). No meta-commentary.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let content = (response.text ?? "").trim();

    // For thread format, try to parse as JSON
    if (format === "thread") {
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          content = JSON.stringify(parsed.map((t: unknown) => String(t).slice(0, 280)));
        }
      } catch {
        // Keep as-is
      }
    } else if (format === "tweet") {
      content = content.slice(0, 280);
    }

    return { ok: true, output: { content, brand, platform, format } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
