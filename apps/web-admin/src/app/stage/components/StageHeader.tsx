"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as s from "../styles";

interface Stats {
  activeMissions: number;
  agentMemories: number;
  lastHeartbeat: string | null;
  totalEvents: number;
}

export function StageHeader() {
  const [stats, setStats] = useState<Stats>({
    activeMissions: 0,
    agentMemories: 0,
    lastHeartbeat: null,
    totalEvents: 0,
  });

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const [missions, memories, heartbeat, events] = await Promise.all([
        sb
          .from("ops_missions")
          .select("id", { count: "exact", head: true })
          .eq("status", "running"),
        sb
          .from("ops_agent_memory")
          .select("id", { count: "exact", head: true }),
        sb
          .from("ops_agent_events")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1),
        sb
          .from("ops_agent_events")
          .select("id", { count: "exact", head: true }),
      ]);

      setStats({
        activeMissions: missions.count ?? 0,
        agentMemories: memories.count ?? 0,
        lastHeartbeat: heartbeat.data?.[0]?.created_at ?? null,
        totalEvents: events.count ?? 0,
      });
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const pulse = stats.lastHeartbeat
    && (Date.now() - new Date(stats.lastHeartbeat).getTime()) < 5 * 60_000;

  return (
    <header style={s.header}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: pulse ? s.colors.green : s.colors.red,
            boxShadow: pulse ? `0 0 8px ${s.colors.green}` : "none",
          }} />
          <h1 style={s.headerTitle}>OpenClaw Stage</h1>
        </div>
        <p style={s.headerSub}>Multi-Agent Operations Dashboard</p>
      </div>
      <div style={s.statsRow}>
        <div style={s.statBox}>
          <div style={s.statValue(s.colors.green)}>{stats.activeMissions}</div>
          <div style={s.statLabel}>Missions</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue(s.colors.accent)}>{stats.agentMemories}</div>
          <div style={s.statLabel}>Memories</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statValue(s.colors.blue)}>{stats.totalEvents}</div>
          <div style={s.statLabel}>Events</div>
        </div>
        <div style={s.statBox}>
          <div style={{ fontSize: 12, color: s.colors.textMuted }}>
            {stats.lastHeartbeat
              ? new Date(stats.lastHeartbeat).toLocaleTimeString()
              : "---"}
          </div>
          <div style={s.statLabel}>Last Beat</div>
        </div>
      </div>
    </header>
  );
}
