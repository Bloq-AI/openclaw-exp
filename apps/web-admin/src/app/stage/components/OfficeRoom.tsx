"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as s from "../styles";

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

export function OfficeRoom() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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
      <div style={s.card}>
        <div style={s.cardHeader}>
          <h2 style={s.cardTitle}>Office Room</h2>
        </div>
        <div style={s.empty}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={s.card}>
        <div style={s.cardHeader}>
          <h2 style={s.cardTitle}>Office Room</h2>
        </div>
        <div style={s.empty}>
          No conversations yet. Roundtable sessions appear here when agents chat.
        </div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Office Room</h2>
        <span style={s.formatBadge(session.format)}>{session.format}</span>
      </div>
      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${s.colors.border}` }}>
        <div style={s.topicPill}>{session.topic}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {session.participants.map((p) => (
            <span key={p} style={s.participantChip}>{p}</span>
          ))}
        </div>
      </div>
      <div style={{ ...s.cardBody, padding: 14, height: 380 }}>
        {session.turns.length === 0 ? (
          <div style={s.empty}>Waiting for first turn...</div>
        ) : (
          session.turns.map((turn, i) => (
            <div key={i} style={s.chatBubble(turn.agent_id)}>
              <div style={s.avatar(turn.agent_id)}>
                {s.AGENT_INITIALS[turn.agent_id] ?? "??"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...s.chatName, color: s.colors.textMuted }}>
                  {turn.agent_id}
                </div>
                <div style={s.chatText}>{turn.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
