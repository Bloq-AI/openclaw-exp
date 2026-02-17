import { SupabaseClient } from "@supabase/supabase-js";

interface MemoryRow {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  confidence: number;
  tags: string[];
}

interface CacheEntry {
  data: MemoryRow[];
  fetchedAt: number;
}

const TTL_MS = 60_000; // 60s cache

/**
 * In-memory cache for agent memories used in trigger evaluation.
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry>();

  async getMemories(
    sb: SupabaseClient,
    agentId: string
  ): Promise<MemoryRow[]> {
    const cached = this.cache.get(agentId);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached.data;
    }

    const { data } = await sb
      .from("ops_agent_memory")
      .select("id, agent_id, type, content, confidence, tags")
      .eq("agent_id", agentId)
      .is("superseded_by", null)
      .order("confidence", { ascending: false })
      .limit(50);

    const memories = (data as MemoryRow[]) ?? [];
    this.cache.set(agentId, { data: memories, fetchedAt: Date.now() });
    return memories;
  }

  clear() {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
