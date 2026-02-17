"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as s from "../styles";

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

const STATUS_ICONS: Record<string, string> = {
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
      <div style={s.card}>
        <div style={s.cardHeader}>
          <h2 style={s.cardTitle}>Mission Playback</h2>
        </div>
        <div style={s.empty}>No missions to replay</div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Mission Playback</h2>
        <span style={s.statusPill(mission.status)}>{mission.status}</span>
      </div>
      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${s.colors.border}` }}>
        <span style={s.missionId}>{mission.id.slice(0, 8)}</span>
        <span style={{ ...s.missionDate, marginLeft: 10 }}>
          {new Date(mission.created_at).toLocaleString()}
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {steps.map((step, i) => (
          <div key={step.id} style={s.timelineItem}>
            {i < steps.length - 1 && <div style={s.timelineLine} />}
            <div style={s.timelineDot(step.status)}>
              {STATUS_ICONS[step.status] ?? "\u25CB"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: s.colors.text }}>
                  {step.kind}
                </span>
                <span style={{ fontSize: 11, color: s.colors.textMuted }}>
                  {new Date(step.created_at).toLocaleTimeString()}
                </span>
              </div>
              {step.last_error && (
                <div style={{ fontSize: 12, color: s.colors.red, marginTop: 4 }}>
                  {step.last_error}
                </div>
              )}
              {step.status === "succeeded" && step.output && (
                <div>
                  <button
                    onClick={() => setOpenOutput(openOutput === step.id ? null : step.id)}
                    style={{
                      fontSize: 11,
                      color: s.colors.textMuted,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      marginTop: 4,
                      textDecoration: "underline",
                    }}
                  >
                    {openOutput === step.id ? "Hide output" : "View output"}
                  </button>
                  {openOutput === step.id && (
                    <div style={s.outputBox}>
                      {JSON.stringify(step.output, null, 2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {steps.length === 0 && (
          <div style={s.empty}>No steps</div>
        )}
      </div>
    </div>
  );
}
