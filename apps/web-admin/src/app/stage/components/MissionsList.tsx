"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

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
  proposal_id: string | null;
  steps?: Step[];
}

interface Proposal {
  id: string;
  title: string;
}

export function MissionsList() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [proposals, setProposals] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data } = await sb
        .from("ops_missions")
        .select("id, status, created_at, finalized_at, proposal_id")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!data) return;
      setMissions(data as Mission[]);

      // Fetch proposal titles for missions that have them
      const proposalIds = data
        .map((m: { proposal_id?: string | null }) => m.proposal_id)
        .filter(Boolean) as string[];
      if (proposalIds.length > 0) {
        const { data: props } = await sb
          .from("ops_mission_proposals")
          .select("id, title")
          .in("id", proposalIds);
        if (props) {
          const map: Record<string, string> = {};
          (props as Proposal[]).forEach((p) => {
            map[p.id] = p.title;
          });
          setProposals(map);
        }
      }
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
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span className="card-title-icon">&#x25B7;</span>
            Missions
          </h2>
        </div>
        <div className="card-empty">Loading...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25B7;</span>
          Missions
        </h2>
        <span className="card-badge">{missions.length}</span>
      </div>
      <div className="card-body" style={{ maxHeight: 340 }}>
        {missions.length === 0 ? (
          <div className="card-empty">No missions yet</div>
        ) : (
          missions.map((mission) => {
            const title =
              mission.proposal_id && proposals[mission.proposal_id];
            const isOpen = expanded.has(mission.id);
            return (
              <div key={mission.id}>
                <div
                  className="mission-row"
                  onClick={() => toggleExpand(mission.id)}
                >
                  <div className="mission-top">
                    <div className="mission-left">
                      <span className={`pill pill-${mission.status}`}>
                        {mission.status}
                      </span>
                      {title ? (
                        <span className="mission-title">{title}</span>
                      ) : (
                        <span className="mission-id">
                          {mission.id.slice(0, 8)}
                        </span>
                      )}
                      <span
                        className={`mission-expand-icon ${isOpen ? "open" : ""}`}
                      >
                        &#x25B8;
                      </span>
                    </div>
                    <span className="mission-date">
                      {new Date(mission.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                {isOpen && mission.steps && (
                  <div className="step-panel">
                    {mission.steps.map((step) => (
                      <div key={step.id}>
                        <div className="step-row">
                          <span className="step-kind">{step.kind}</span>
                          <span className={`pill pill-${step.status}`}>
                            {step.status}
                          </span>
                        </div>
                        {step.last_error && (
                          <div className="step-error">{step.last_error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
