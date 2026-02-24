import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { loadPersona } from "../personas/loader";
import { savePersonaVersion } from "../personas/loader";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * synthesize_improvements executor
 *
 * Takes the 4 judge verdicts from judge_content_quality and synthesizes
 * them into concrete, improved persona config fields. Saves new versions
 * to the persona_versions table. The next content generation cycle will
 * automatically pick up the new prompts.
 *
 * Also updates ops_policy.x_scan_config if the market strategist
 * recommended new search angles.
 *
 * Payload (from judge_content_quality output, merged):
 *   judge_verdicts  array   — the 4 judge outputs
 *   brand           string  — default 'bloq'
 *   platform        string  — default 'twitter'
 *   analysis_used   object  — the performance data that drove this
 */
export async function executeSynthesizeImprovements(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const judgeVerdicts = step.payload.judge_verdicts as unknown[] | null;
  const brand = (step.payload.brand as string) ?? "bloq";
  const platform = (step.payload.platform as string) ?? "twitter";
  const analysisUsed = step.payload.analysis_used;

  if (!judgeVerdicts || judgeVerdicts.length === 0) {
    return { ok: false, error: "payload.judge_verdicts is required" };
  }

  const currentPersona = await loadPersona(sb, brand, platform);

  const verdictsJson = JSON.stringify(judgeVerdicts, null, 2);

  const synthesisPrompt = `You are the system architect responsible for improving an AI content generation system for BLOQ AI.

Four specialist judges have reviewed recent content performance and provided their verdicts. Your job: synthesize their recommendations into improved, concrete persona configuration fields.

Current system_prompt:
---
${currentPersona.system_prompt}
---

Current content_rules:
---
${currentPersona.content_rules}
---

Current image_style_prompt:
---
${currentPersona.image_style_prompt}
---

Judge verdicts:
${verdictsJson}

Instructions:
1. Write an IMPROVED system_prompt that incorporates the judges' recommendations. Keep the core BLOQ AI identity but make it sharper based on what's working. The prompt should be complete and self-contained.
2. Write IMPROVED content_rules — a clean, updated list of rules.
3. If the editor or analyst flagged specific image prompt issues, update the image_style_prompt. If not, return the current one unchanged.
4. Write a clear reason for the changes (2-3 sentences summarizing what changed and why).
5. If the market strategist recommended new search angles, return updated_scan_query (a Twitter search query string). Otherwise return null.

Return JSON with this exact shape:
{
  "improved_system_prompt": "full improved system prompt text",
  "improved_content_rules": "full improved content rules text",
  "improved_image_style_prompt": "full improved image style prompt text",
  "change_reason": "2-3 sentence summary of what changed and why",
  "updated_scan_query": "new Twitter search query" | null,
  "changes_summary": ["change 1", "change 2", "change 3"]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: synthesisPrompt,
      config: { responseMimeType: "application/json" },
    });

    const raw = (response.text ?? "").trim();
    const result = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "")) as {
      improved_system_prompt: string;
      improved_content_rules: string;
      improved_image_style_prompt: string;
      change_reason: string;
      updated_scan_query: string | null;
      changes_summary: string[];
    };

    const judgeInput = { verdicts: judgeVerdicts, analysis: analysisUsed };
    const savedVersionIds: string[] = [];

    // Save system_prompt version
    if (result.improved_system_prompt !== currentPersona.system_prompt) {
      const id = await savePersonaVersion(sb, {
        brand, platform, field: "system_prompt",
        value: result.improved_system_prompt,
        reason: result.change_reason,
        createdBy: "synthesize_improvements",
        judgeInput,
      });
      savedVersionIds.push(id);
      console.log(`[synthesize_improvements] saved new system_prompt version ${id}`);
    }

    // Save content_rules version
    if (result.improved_content_rules !== currentPersona.content_rules) {
      const id = await savePersonaVersion(sb, {
        brand, platform, field: "content_rules",
        value: result.improved_content_rules,
        reason: result.change_reason,
        createdBy: "synthesize_improvements",
        judgeInput,
      });
      savedVersionIds.push(id);
      console.log(`[synthesize_improvements] saved new content_rules version ${id}`);
    }

    // Save image_style_prompt version
    if (result.improved_image_style_prompt !== currentPersona.image_style_prompt) {
      const id = await savePersonaVersion(sb, {
        brand, platform, field: "image_style_prompt",
        value: result.improved_image_style_prompt,
        reason: result.change_reason,
        createdBy: "synthesize_improvements",
        judgeInput,
      });
      savedVersionIds.push(id);
      console.log(`[synthesize_improvements] saved new image_style_prompt version ${id}`);
    }

    // Update X scan config if strategist recommended new angles
    if (result.updated_scan_query) {
      await sb.from("ops_policy").upsert({
        key: "x_scan_config",
        json: { query: result.updated_scan_query, updated_by: "synthesize_improvements" },
        updated_at: new Date().toISOString(),
      });
      console.log(`[synthesize_improvements] updated x_scan_config query`);
    }

    // Emit a summary event for the Stage dashboard
    await sb.from("ops_agent_events").insert({
      type: "persona:evolved",
      tags: ["persona", "evolution", brand, platform],
      actor: "synthesize_improvements",
      payload: {
        brand,
        platform,
        changes_summary: result.changes_summary,
        change_reason: result.change_reason,
        versions_saved: savedVersionIds.length,
        updated_scan_query: result.updated_scan_query ?? null,
      },
    });

    return {
      ok: true,
      output: {
        brand,
        platform,
        versions_saved: savedVersionIds.length,
        version_ids: savedVersionIds,
        changes_summary: result.changes_summary,
        change_reason: result.change_reason,
        scan_query_updated: !!result.updated_scan_query,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
