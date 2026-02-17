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
  posted_at: string | null;
}

interface LinkedInStatus {
  connected: boolean;
  name: string | null;
  expired: boolean;
}

export function ContentDrafts() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState<string | null>(null);
  const [postError, setPostError] = useState<Record<string, string>>({});
  const [liStatus, setLiStatus] = useState<LinkedInStatus | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    async function load() {
      const { data } = await sb
        .from("ops_content_drafts")
        .select("id, platform, content, image_url, context, status, created_at, posted_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) setDrafts(data as Draft[]);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Load LinkedIn connection status
  useEffect(() => {
    fetch("/api/ops/linkedin/status")
      .then((r) => r.json())
      .then((d) => setLiStatus(d as LinkedInStatus))
      .catch(() => {});
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

  async function postToLinkedIn(d: Draft) {
    setPosting(d.id);
    setPostError((prev) => ({ ...prev, [d.id]: "" }));

    try {
      const res = await fetch("/api/ops/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: d.id }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setPostError((prev) => ({ ...prev, [d.id]: json.error ?? "Post failed" }));
      } else {
        // Remove from list — it's now posted (status → approved)
        setDrafts((prev) => (prev ? prev.filter((x) => x.id !== d.id) : prev));
        if (expanded === d.id) setExpanded(null);
      }
    } catch {
      setPostError((prev) => ({ ...prev, [d.id]: "Network error" }));
    } finally {
      setPosting(null);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="card-title-icon">&#x270D;</span>
          Content Drafts
        </h2>
        <div className="draft-header-right">
          <span className="card-badge">{drafts?.length ?? 0}</span>
          {liStatus !== null && (
            <a
              href={liStatus.connected ? undefined : "/api/auth/linkedin"}
              className={`li-status ${liStatus.connected ? "li-status-on" : "li-status-off"}`}
              title={
                liStatus.connected
                  ? `LinkedIn: ${liStatus.name ?? "connected"}`
                  : "Click to connect LinkedIn"
              }
            >
              <span className="li-icon">in</span>
              {liStatus.connected ? liStatus.name ?? "Connected" : "Connect"}
            </a>
          )}
        </div>
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
            const isPosting = posting === d.id;
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

                {/* Image — full size when expanded */}
                {isExpanded && (
                  <div className="draft-image-wrap">
                    {d.image_url && !imgError[d.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.image_url}
                        alt="Generated visual"
                        className="draft-image"
                        loading="lazy"
                        onError={() =>
                          setImgError((prev) => ({ ...prev, [d.id]: true }))
                        }
                      />
                    ) : (
                      <div className="draft-image-placeholder">
                        No image generated
                      </div>
                    )}
                  </div>
                )}

                {/* Post error */}
                {postError[d.id] && (
                  <div className="draft-post-error">{postError[d.id]}</div>
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
                  {liStatus?.connected && !isEditing && (
                    <button
                      className="draft-btn draft-btn-linkedin"
                      disabled={isPosting}
                      onClick={() => postToLinkedIn(d)}
                    >
                      {isPosting ? "Posting…" : "Post"}
                    </button>
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
