import { SupabaseClient } from "@supabase/supabase-js";

export async function executeAnalyze(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  // Mock: simulate analysis
  return {
    ok: true,
    output: { analysis: "mock analysis complete", timestamp: new Date().toISOString() },
  };
}
