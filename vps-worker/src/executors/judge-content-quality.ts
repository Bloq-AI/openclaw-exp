import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { loadPersona } from "../personas/loader";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * Four specialist judges evaluate content performance data in parallel.
 * Each has a distinct lens and produces structured recommendations.
 *
 * Judges:
 *  1. Performance Analyst  — data correlations, what to do more/less of
 *  2. Brand Voice Auditor  — on-brand vs drift, tone violations, anti-guru test
 *  3. Market Strategist    — angles, GCC market positioning, competitor gaps
 *  4. Editor               — craft quality, hooks, formatting, specific rules
 *
 * Payload (from analyze_content_performance output, merged):
 *   analysis     object  — the structured performance analysis
 *   brand        string  — default 'bloq'
 *   platform     string  — default 'twitter'
 */
export async function executeJudgeContentQuality(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const analysis = step.payload.analysis as Record<string, unknown> | null;
  const brand = (step.payload.brand as string) ?? "bloq";
  const platform = (step.payload.platform as string) ?? "twitter";

  if (!analysis) {
    return { ok: false, error: "payload.analysis is required (from analyze_content_performance)" };
  }

  // Load the current persona so judges know what they're evaluating against
  const currentPersona = await loadPersona(sb, brand, platform);
  const analysisJson = JSON.stringify(analysis, null, 2);
  const currentSystemPrompt = currentPersona.system_prompt.slice(0, 800);
  const currentContentRules = currentPersona.content_rules.slice(0, 400);

  const judgeDefinitions = [
    {
      id: "performance_analyst",
      name: "Performance Analyst",
      directive: `You are a data-driven content performance analyst. Your job: find statistical patterns in what works and what doesn't. Look for correlations between content characteristics (questions, numbers, length, threads vs singles, format) and engagement scores. Be specific — "posts with specific numbers outperform by X%" is useful, "be more authentic" is not.`,
      question: `Given this performance data, what content characteristics correlate with higher perf_score? What should we do MORE of? What should we do LESS of? What timing insight do you see?`,
    },
    {
      id: "brand_voice_auditor",
      name: "Brand Voice Auditor",
      directive: `You are a brand consistency expert. BLOQ AI's voice should be: clear, direct, outcome-focused, calm authority, technically sharp, never hype, never guru energy. You know the brand kit: Hormozi directness without gym bro energy, specific numbers/decisions/tradeoffs, Anti-Guru test (if it sounds like a motivational speaker, rewrite it). Check if the content samples drift from this voice.`,
      question: `Look at the top and bottom performing posts. Does the content sound on-brand? What specific voice issues or drift do you see? What changes to the system prompt would make future content more consistently on-brand?`,
    },
    {
      id: "market_strategist",
      name: "Market Strategist",
      directive: `You are a B2B content strategist specializing in the GCC enterprise tech market. BLOQ AI serves mid-market companies in the GCC with AI operating systems. Key angles: ZATCA compliance, UAE Corporate Tax, Vision 2030, why Western SaaS fails in the region, real AI deployments (not demos). You know what topics are underserved.`,
      question: `Based on the performance data and content samples, is BLOQ owning the right angles in the GCC enterprise AI conversation? What topics/angles are underperforming that should be replaced? What angles are missing entirely that would resonate with CFOs and ops directors in KSA/UAE?`,
    },
    {
      id: "editor",
      name: "Editor",
      directive: `You are a precision editor who evaluates content craft. You care about: hook strength (first line on Twitter must stop the scroll), formatting (single-line paragraphs for LinkedIn, line breaks on Twitter), conciseness (no filler), specificity (numbers beat vague claims), and the Anti-Guru test. You identify specific patterns in top vs bottom performers at the sentence level.`,
      question: `Compare the top and bottom performing posts on craft quality. What hook patterns work? What formatting choices correlate with engagement? What specific editorial rules should be added to or removed from the content generation guidelines?`,
    },
  ];

  // Run all 4 judges in parallel
  const judgePromises = judgeDefinitions.map(async (judge) => {
    const prompt = `${judge.directive}

Current system prompt being used for content generation (truncated):
---
${currentSystemPrompt}
---

Current content rules:
---
${currentContentRules}
---

Performance data (last 14 days):
${analysisJson}

${judge.question}

Respond in JSON with this exact shape:
{
  "verdict": "2-3 sentence overall assessment",
  "what_is_working": ["specific thing 1", "specific thing 2"],
  "what_is_not_working": ["specific issue 1", "specific issue 2"],
  "recommended_system_prompt_changes": ["specific change 1 to the system_prompt", "specific change 2"],
  "recommended_rule_changes": ["specific change 1 to content_rules", "specific change 2"],
  "confidence": "high" | "medium" | "low"
}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const raw = (response.text ?? "").trim();
      const verdict = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
      return { judge_id: judge.id, judge_name: judge.name, ...verdict };
    } catch (err) {
      console.warn(`[judge_content_quality] ${judge.id} failed:`, err);
      return {
        judge_id: judge.id,
        judge_name: judge.name,
        verdict: "Judge failed to produce output",
        what_is_working: [],
        what_is_not_working: [],
        recommended_system_prompt_changes: [],
        recommended_rule_changes: [],
        confidence: "low",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const verdicts = await Promise.all(judgePromises);

  console.log(`[judge_content_quality] ${verdicts.length} judges completed for ${brand}/${platform}`);

  return {
    ok: true,
    output: {
      brand,
      platform,
      judge_verdicts: verdicts,
      analysis_used: analysis,
    },
  };
}
