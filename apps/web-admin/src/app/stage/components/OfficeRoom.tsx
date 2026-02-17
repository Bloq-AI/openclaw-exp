"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Turn {
  agent_id: string;
  message: string;
  timestamp: string;
}

interface Session {
  id: string;
  format: string;
  topic: string;
  status: string;
  participants: string[];
  turns: Turn[];
  created_at: string;
}

const AGENT_INITIALS: Record<string, string> = {
  strategist: "ST",
  hype: "HY",
  critic: "CR",
  builder: "BU",
  creative: "RE",
  analyst: "AN",
};

export function OfficeRoom() {
  const [session, setSession] = useState<Session | null | undefined>(
    undefined
  );

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data } = await sb
        .from("ops_roundtable_sessions")
        .select("*")
        .in("status", ["running", "completed"])
        .order("created_at", { ascending: false })
        .limit(1);

      setSession((data?.[0] as Session) ?? null);
    }

    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (session === undefined) {
    return (
      <div className="card office-room">
        <div className="card-header">
          <h2 className="card-title">
            <span className="card-title-icon">&#x25CB;</span>
            Office Room
          </h2>
        </div>
        <div className="card-empty">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card office-room">
        <div className="card-header">
          <h2 className="card-title">
            <span className="card-title-icon">&#x25CB;</span>
            Office Room
          </h2>
        </div>
        <div className="card-empty">
          No conversations yet.
          <br />
          Roundtable sessions appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="card office-room">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25CB;</span>
          Office Room
        </h2>
        <span className={`format-badge format-${session.format}`}>
          {session.format}
        </span>
      </div>
      <div className="office-meta">
        <div className="office-topic">{session.topic}</div>
        <div className="office-participants">
          {session.participants.map((p) => (
            <span key={p} className="participant-chip">
              {p}
            </span>
          ))}
        </div>
      </div>
      <div className="card-body" style={{ padding: 12 }}>
        {session.turns.length === 0 ? (
          <div className="card-empty">Waiting for first turn...</div>
        ) : (
          session.turns.map((turn, i) => (
            <div
              key={i}
              className={`chat-bubble agent-${turn.agent_id}`}
            >
              <div className={`avatar avatar-${turn.agent_id}`}>
                {AGENT_INITIALS[turn.agent_id] ?? "??"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="chat-name">{turn.agent_id}</div>
                <div className="chat-text">{turn.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
