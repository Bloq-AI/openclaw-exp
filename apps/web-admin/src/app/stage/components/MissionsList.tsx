"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as s from "../styles";

interface Step {
  id: string;
  kind: string;
  status: string;
  last_error: string | null;
}

interface Mission {
  id: string;
  status: string;
  created_at: string;
  finalized_at: string | null;
  steps?: Step[];
}

export function MissionsList() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data } = await sb
        .from("ops_missions")
        .select("id, status, created_at, finalized_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) setMissions(data as Mission[]);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function toggleExpand(missionId: string) {
    const next = new Set(expanded);
    if (next.has(missionId)) {
      next.delete(missionId);
    } else {
      const mission = missions?.find((m) => m.id === missionId);
      if (mission && !mission.steps) {
        const sb = getSupabaseBrowser();
        const { data: steps } = await sb
          .from("ops_mission_steps")
          .select("id, kind, status, last_error")
          .eq("mission_id", missionId)
          .order("created_at", { ascending: true });

        if (steps && missions) {
          setMissions(
            missions.map((m) =>
              m.id === missionId ? { ...m, steps: steps as Step[] } : m
            )
          );
        }
      }
      next.add(missionId);
    }
    setExpanded(next);
  }

  if (missions === null) {
    return (
      <div style={s.card}>
        <div style={s.cardHeader}>
          <h2 style={s.cardTitle}>Missions</h2>
        </div>
        <div style={s.empty}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Missions</h2>
        <span style={s.cardCount}>{missions.length}</span>
      </div>
      <div style={s.cardBody}>
        {missions.length === 0 ? (
          <div style={s.empty}>No missions yet</div>
        ) : (
          missions.map((mission) => (
            <div key={mission.id}>
              <div
                style={s.missionRow}
                onClick={() => toggleExpand(mission.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = s.colors.surfaceHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={s.missionHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={s.statusPill(mission.status)}>
                      {mission.status}
                    </span>
                    <span style={s.missionId}>{mission.id.slice(0, 8)}</span>
                  </div>
                  <span style={s.missionDate}>
                    {new Date(mission.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              {expanded.has(mission.id) && mission.steps && (
                <div style={s.stepPanel}>
                  {mission.steps.map((step) => (
                    <div key={step.id} style={s.stepRow}>
                      <span style={s.stepKind}>{step.kind}</span>
                      <span style={s.statusPill(step.status)}>{step.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
