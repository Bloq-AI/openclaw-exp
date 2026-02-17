"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Step {
  id: string;
  kind: string;
  status: string;
  output: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
}

interface Mission {
  id: string;
  status: string;
  created_at: string;
  finalized_at: string | null;
}

const STATUS_ICON: Record<string, string> = {
  queued: "\u25CB",
  running: "\u25D4",
  succeeded: "\u2713",
  failed: "\u2717",
};

export function MissionPlayback() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [openOutput, setOpenOutput] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data: missions } = await sb
        .from("ops_missions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      const m = missions?.[0] as Mission | undefined;
      if (!m) return;
      setMission(m);

      const { data: stepData } = await sb
        .from("ops_mission_steps")
        .select("id, kind, status, output, last_error, created_at")
        .eq("mission_id", m.id)
        .order("created_at", { ascending: true });

      if (stepData) setSteps(stepData as Step[]);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (!mission) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span className="card-title-icon">&#x25C6;</span>
            Latest Mission
          </h2>
        </div>
        <div className="card-empty">No missions to replay</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25C6;</span>
          Latest Mission
        </h2>
        <span className={`pill pill-${mission.status}`}>{mission.status}</span>
      </div>
      <div className="playback-meta">
        <span className="mission-id mono">{mission.id.slice(0, 8)}</span>
        <span className="mission-date">
          {new Date(mission.created_at).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="playback-body">
        {steps.length === 0 ? (
          <div className="card-empty">No steps</div>
        ) : (
          steps.map((step) => (
            <div key={step.id} className="timeline-item">
              <div className="timeline-line" />
              <div className={`timeline-dot ${step.status}`}>
                {STATUS_ICON[step.status] ?? "\u25CB"}
              </div>
              <div className="timeline-content">
                <div className="timeline-top">
                  <span className="timeline-kind">{step.kind}</span>
                  <span className="timeline-time">
                    {new Date(step.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                {step.last_error && (
                  <div className="timeline-error">{step.last_error}</div>
                )}
                {step.status === "succeeded" && step.output && (
                  <div>
                    <button
                      className="output-toggle"
                      onClick={() =>
                        setOpenOutput(
                          openOutput === step.id ? null : step.id
                        )
                      }
                    >
                      {openOutput === step.id
                        ? "\u25BE hide output"
                        : "\u25B8 view output"}
                    </button>
                    {openOutput === step.id && (
                      <div className="output-box">
                        {JSON.stringify(step.output, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
