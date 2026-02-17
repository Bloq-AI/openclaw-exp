"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface EventRow {
  id: string;
  type: string;
  tags: string[];
  actor: string;
  created_at: string;
}

const DOT_COLOR: Record<string, string> = {
  "step:succeeded": "green",
  "step:failed": "red",
  "mission:created": "purple",
  "mission:succeeded": "green",
  "mission:failed": "red",
  "proposal:created": "amber",
  "proposal:rejected": "red",
  "roundtable:started": "cyan",
  "roundtable:completed": "green",
  "roundtable:failed": "red",
  "initiative:proposed": "orange",
  "actionitem:created": "pink",
};

const TAG_CLASS: Record<string, string> = {
  mission: "tag-mission",
  step: "tag-step",
  proposal: "tag-proposal",
  roundtable: "tag-roundtable",
  initiative: "tag-initiative",
  actionitem: "tag-actionitem",
  failed: "tag-failed",
  succeeded: "tag-succeeded",
  created: "tag-created",
  started: "tag-started",
  completed: "tag-completed",
};

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
    <div className="card signal-feed">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25C8;</span>
          Signal Feed
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="live-dot" />
          <span className="card-badge">{events.length}</span>
        </div>
      </div>
      <div ref={listRef} className="card-body">
        {events.length === 0 ? (
          <div className="card-empty">
            No signals yet.
            <br />
            Fire a heartbeat to initialize.
          </div>
        ) : (
          events.map((event) => {
            const dotClass = DOT_COLOR[event.type] ?? "muted";
            return (
              <div key={event.id} className="event-row">
                <div className={`event-dot ${dotClass}`} />
                <div className="event-content">
                  <div className="event-top">
                    <span className="event-type">{event.type}</span>
                    <span className="event-time">
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="event-tags">
                    {event.tags.map((t) => (
                      <span
                        key={t}
                        className={`tag ${TAG_CLASS[t] ?? ""}`}
                      >
                        {t}
                      </span>
                    ))}
                    <span className="event-actor">{event.actor}</span>
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
