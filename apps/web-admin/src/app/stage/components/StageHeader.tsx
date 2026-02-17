"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

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

  const isLive =
    !!stats.lastHeartbeat &&
    Date.now() - new Date(stats.lastHeartbeat).getTime() < 5 * 60_000;

  return (
    <header className="stage-header">
      <div className="header-brand">
        <div className={`header-pulse ${isLive ? "live" : "dead"}`} />
        <div>
          <h1 className="header-title">OpenClaw Ops</h1>
          <p className="header-sub">
            {isLive ? "systems nominal" : "awaiting heartbeat"} /{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat">
          <div className="stat-value green">{stats.activeMissions}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat">
          <div className="stat-value purple">{stats.agentMemories}</div>
          <div className="stat-label">Memories</div>
        </div>
        <div className="stat">
          <div className="stat-value blue">{stats.totalEvents}</div>
          <div className="stat-label">Events</div>
        </div>
        <div className="stat">
          <div className="stat-heartbeat">
            {stats.lastHeartbeat
              ? new Date(stats.lastHeartbeat).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "---"}
          </div>
          <div className="stat-label">Last Beat</div>
        </div>
      </div>
    </header>
  );
}
