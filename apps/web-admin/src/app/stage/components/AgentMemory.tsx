"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Memory {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  confidence: number;
  created_at: string;
}

const TYPE_CLASS: Record<string, string> = {
  insight: "type-insight",
  pattern: "type-pattern",
  strategy: "type-strategy",
  preference: "type-preference",
  lesson: "type-lesson",
};

const AGENTS = [
  "all",
  "strategist",
  "hype",
  "critic",
  "builder",
  "creative",
  "analyst",
] as const;

export function AgentMemory() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      let query = sb
        .from("ops_agent_memory")
        .select("id, agent_id, type, content, confidence, created_at")
        .is("superseded_by", null)
        .order("confidence", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(25);

      if (agentFilter !== "all") {
        query = query.eq("agent_id", agentFilter);
      }

      const { data } = await query;
      if (data) setMemories(data as Memory[]);
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [agentFilter]);

  function confidenceLevel(c: number): string {
    if (c >= 0.7) return "high";
    if (c >= 0.4) return "medium";
    return "low";
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25C7;</span>
          Agent Memory
        </h2>
        <span className="card-badge">{memories?.length ?? 0}</span>
      </div>
      <div className="tabs">
        {AGENTS.map((agent) => (
          <button
            key={agent}
            className={`tab ${agentFilter === agent ? "active" : ""}`}
            onClick={() => setAgentFilter(agent)}
          >
            {agent === "all" ? "All" : agent.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="card-body" style={{ maxHeight: 260 }}>
        {memories === null ? (
          <div className="card-empty">Loading...</div>
        ) : memories.length === 0 ? (
          <div className="card-empty">No memories stored yet</div>
        ) : (
          memories.map((mem) => (
            <div key={mem.id} className="memory-row">
              <div className="memory-top">
                <span
                  className={`memory-type ${TYPE_CLASS[mem.type] ?? ""}`}
                >
                  {mem.type}
                </span>
                <span className="memory-agent">{mem.agent_id}</span>
                <span className="memory-confidence">
                  {Math.round(mem.confidence * 100)}%
                  <span className="confidence-bar">
                    <span
                      className={`confidence-fill ${confidenceLevel(mem.confidence)}`}
                      style={{ width: `${mem.confidence * 100}%` }}
                    />
                  </span>
                </span>
              </div>
              <div className="memory-content">{mem.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
