import { SupabaseClient } from "@supabase/supabase-js";

export async function executeWriteContent(
  sb: SupabaseClient,
  step: { id: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  // Mock: simulate content writing
  return {
    ok: true,
    output: { content: "mock content generated", timestamp: new Date().toISOString() },
  };
}
