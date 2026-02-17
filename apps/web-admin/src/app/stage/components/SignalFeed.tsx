"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import * as s from "../styles";

interface EventRow {
  id: string;
  type: string;
  tags: string[];
  actor: string;
  created_at: string;
}

export function SignalFeed() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data } = await sb
      .from("ops_agent_events")
      .select("id, type, tags, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (data) setEvents(data as EventRow[]);
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 10_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Signal Feed</h2>
        <span style={s.cardCount}>{events.length}</span>
      </div>
      <div ref={listRef} style={{ ...s.cardBody, height: 480 }}>
        {events.length === 0 ? (
          <div style={s.empty}>No events yet. Fire a heartbeat to get started.</div>
        ) : (
          events.map((event) => {
            const dotColor = s.EVENT_DOT_COLORS[event.type] ?? s.colors.textMuted;
            return (
              <div key={event.id} style={s.eventRow}>
                <div style={s.eventDot(dotColor)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={s.eventType}>{event.type}</span>
                    <span style={s.eventTime}>
                      {new Date(event.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={s.tagRow}>
                    {event.tags.map((t) => {
                      const ts = s.TAG_STYLES[t] ?? { bg: "rgba(255,255,255,0.05)", fg: s.colors.textMuted };
                      return (
                        <span key={t} style={s.tag(ts.bg, ts.fg)}>{t}</span>
                      );
                    })}
                    <span style={{ ...s.tag("transparent", s.colors.textMuted), marginLeft: "auto" }}>
                      {event.actor}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
