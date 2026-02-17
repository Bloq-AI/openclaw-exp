import { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

interface GitHubRepo {
  name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  fork: boolean;
}

export async function executeScanGithub(
  _sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  try {
    const org = (step.payload.org as string) || "bloq-ai";

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/orgs/${org}/repos?sort=pushed&per_page=30`,
      { headers }
    );

    if (!res.ok) {
      return { ok: false, error: `GitHub API ${res.status}: ${res.statusText}` };
    }

    const repos: GitHubRepo[] = await res.json();

    // Filter out forks, sort by recent push + stars
    const candidates = repos
      .filter((r) => !r.fork)
      .sort((a, b) => {
        const scoreA = a.stargazers_count + (new Date(a.pushed_at).getTime() / 1e10);
        const scoreB = b.stargazers_count + (new Date(b.pushed_at).getTime() / 1e10);
        return scoreB - scoreA;
      })
      .slice(0, 10);

    if (candidates.length === 0) {
      return { ok: false, error: `No public repos found for org: ${org}` };
    }

    const repoList = candidates
      .map(
        (r, i) =>
          `${i + 1}. ${r.name} — ${r.description ?? "No description"} (${r.stargazers_count} stars, ${r.language ?? "unknown"}, last push ${r.pushed_at})`
      )
      .join("\n");

    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `You are a developer advocate for BLOQ AI. Given these GitHub repos, pick the ONE most interesting for a LinkedIn post and explain why.\n\nRepos:\n${repoList}\n\nRespond in JSON:\n{"picked_index": number, "reason": string, "angle": string}\nwhere angle is the content angle/hook for the post.`,
      }),
      60_000,
      "gemini repo selection"
    );

    const text = response.text ?? "";
    let parsed: { picked_index: number; reason: string; angle: string };
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "Failed to parse Gemini response for repo selection" };
    }

    const picked = candidates[parsed.picked_index - 1] ?? candidates[0];

    return {
      ok: true,
      output: {
        repo: {
          name: picked.name,
          url: picked.html_url,
          description: picked.description,
          stars: picked.stargazers_count,
          language: picked.language,
        },
        reason: parsed.reason,
        angle: parsed.angle,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
