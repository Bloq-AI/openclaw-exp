"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Proposal {
  id: string;
  title: string;
  status: string;
  source: string;
  step_kinds: string[];
  created_at: string;
  rejection_reason: string | null;
}

const SOURCE_CLASS: Record<string, string> = {
  trigger: "source-trigger",
  reaction: "source-reaction",
  manual: "source-manual",
  api: "source-api",
};

export function ProposalQueue() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [tab, setTab] = useState<"pending" | "recent">("recent");

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      let query = sb
        .from("ops_mission_proposals")
        .select("id, title, status, source, step_kinds, created_at, rejection_reason")
        .order("created_at", { ascending: false })
        .limit(15);

      if (tab === "pending") {
        query = query.eq("status", "pending");
      }

      const { data } = await query;
      if (data) setProposals(data as Proposal[]);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x25A0;</span>
          Proposals
        </h2>
        <span className="card-badge">{proposals?.length ?? 0}</span>
      </div>
      <div className="tabs">
        <button
          className={`tab ${tab === "recent" ? "active" : ""}`}
          onClick={() => setTab("recent")}
        >
          Recent
        </button>
        <button
          className={`tab ${tab === "pending" ? "active" : ""}`}
          onClick={() => setTab("pending")}
        >
          Pending
        </button>
      </div>
      <div className="card-body" style={{ maxHeight: 260 }}>
        {proposals === null ? (
          <div className="card-empty">Loading...</div>
        ) : proposals.length === 0 ? (
          <div className="card-empty">
            {tab === "pending" ? "No pending proposals" : "No proposals yet"}
          </div>
        ) : (
          proposals.map((p) => (
            <div key={p.id} className="proposal-row">
              <span
                className={`proposal-source ${SOURCE_CLASS[p.source] ?? ""}`}
              >
                {p.source}
              </span>
              <div className="proposal-info">
                <div className="proposal-title">{p.title}</div>
                <div className="proposal-meta">
                  <span>
                    {new Date(p.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {p.rejection_reason && (
                    <span style={{ color: "var(--red)", opacity: 0.8 }}>
                      {p.rejection_reason}
                    </span>
                  )}
                </div>
              </div>
              <div className="proposal-kinds">
                {p.step_kinds.map((k) => (
                  <span key={k} className="kind-chip">
                    {k}
                  </span>
                ))}
              </div>
              <span className={`pill pill-${p.status}`}>{p.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
