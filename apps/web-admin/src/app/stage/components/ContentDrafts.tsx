"use client";

import { useEffect, useRef, useState } from "react";
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
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [editContent, editing]);

  async function updateStatus(id: string, status: "approved" | "dismissed") {
    const sb = getSupabaseBrowser();
    await sb
      .from("ops_content_drafts")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    if (expanded === id) setExpanded(null);
    if (editing === id) setEditing(null);
  }

  async function saveEdit(id: string) {
    const newContent = editContent[id];
    if (!newContent?.trim()) return;

    const sb = getSupabaseBrowser();
    await sb
      .from("ops_content_drafts")
      .update({ content: newContent })
      .eq("id", id);

    setDrafts((prev) =>
      prev ? prev.map((d) => (d.id === id ? { ...d, content: newContent } : d)) : prev
    );
    setEditing(null);
  }

  function startEdit(d: Draft) {
    setEditing(d.id);
    setEditContent((prev) => ({ ...prev, [d.id]: d.content }));
    setExpanded(d.id);
  }

  function cancelEdit(id: string) {
    setEditing(null);
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
      <div className="card-body" style={{ maxHeight: 480 }}>
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
            const isEditing = editing === d.id;
            const currentContent = isEditing ? (editContent[d.id] ?? d.content) : d.content;

            return (
              <div key={d.id} className="draft-row">
                {/* Header */}
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
                    {repo.name} &middot; {repo.stars} ★
                  </div>
                )}

                {/* Content — textarea when editing, text when not */}
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    className="draft-textarea"
                    value={editContent[d.id] ?? d.content}
                    onChange={(e) =>
                      setEditContent((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                  />
                ) : (
                  <div className="draft-preview">
                    {isExpanded
                      ? currentContent
                      : currentContent.slice(0, 140) +
                        (currentContent.length > 140 ? "…" : "")}
                  </div>
                )}

                {/* Image — full size when expanded, hidden when collapsed */}
                {isExpanded && d.image_url && !imgError[d.id] && (
                  <div className="draft-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.image_url}
                      alt="Generated visual"
                      className="draft-image"
                      loading="lazy"
                      onError={() =>
                        setImgError((prev) => ({ ...prev, [d.id]: true }))
                      }
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="draft-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="draft-btn draft-btn-save"
                        onClick={() => saveEdit(d.id)}
                      >
                        Save
                      </button>
                      <button
                        className="draft-btn draft-btn-expand"
                        onClick={() => cancelEdit(d.id)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="draft-btn draft-btn-expand"
                        onClick={() => setExpanded(isExpanded ? null : d.id)}
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                      </button>
                      <button
                        className="draft-btn draft-btn-edit"
                        onClick={() => startEdit(d)}
                      >
                        Edit
                      </button>
                    </>
                  )}
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
