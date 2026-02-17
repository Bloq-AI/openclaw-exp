"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Draft {
  id: string;
  platform: string;
  content: string;
  image_url: string | null;
  context: Record<string, unknown>;
  status: string;
  created_at: string;
}

export function ContentDrafts() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data } = await sb
        .from("ops_content_drafts")
        .select("id, platform, content, image_url, context, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) setDrafts(data as Draft[]);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function updateStatus(id: string, status: "approved" | "dismissed") {
    const sb = getSupabaseBrowser();
    await sb
      .from("ops_content_drafts")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    if (expanded === id) setExpanded(null);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x270D;</span>
          Content Drafts
        </h2>
        <span className="card-badge">{drafts?.length ?? 0}</span>
      </div>
      <div className="card-body" style={{ maxHeight: 380 }}>
        {drafts === null ? (
          <div className="card-empty">Loading...</div>
        ) : drafts.length === 0 ? (
          <div className="card-empty">No pending drafts</div>
        ) : (
          drafts.map((d) => {
            const repo = d.context?.repo as
              | { name: string; url: string; stars: number }
              | undefined;
            const isExpanded = expanded === d.id;

            return (
              <div key={d.id} className="draft-row">
                <div className="draft-top">
                  <span className="draft-platform">{d.platform}</span>
                  <span className="draft-time">
                    {new Date(d.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {repo && (
                  <div className="draft-repo">
                    {repo.name} &middot; {repo.stars} stars
                  </div>
                )}

                <div className="draft-preview">
                  {isExpanded ? d.content : d.content.slice(0, 140) + (d.content.length > 140 ? "..." : "")}
                </div>

                {d.image_url && (
                  <div className="draft-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.image_url}
                      alt="Generated visual"
                      className="draft-image"
                    />
                  </div>
                )}

                <div className="draft-actions">
                  <button
                    className="draft-btn draft-btn-expand"
                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                  <button
                    className="draft-btn draft-btn-approve"
                    onClick={() => updateStatus(d.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="draft-btn draft-btn-dismiss"
                    onClick={() => updateStatus(d.id, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
