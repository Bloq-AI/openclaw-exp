import { CSSProperties } from "react";

// ── Color tokens ────────────────────────────────────────────────────
const c = {
  bg: "#0a0e17",
  surface: "#111827",
  surfaceHover: "#1a2235",
  border: "#1e293b",
  borderLight: "#334155",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
  accent: "#6366f1",
  accentDim: "#4f46e5",
  green: "#22c55e",
  greenDim: "#16a34a",
  greenBg: "rgba(34,197,94,0.1)",
  red: "#ef4444",
  redDim: "#dc2626",
  redBg: "rgba(239,68,68,0.08)",
  yellow: "#eab308",
  yellowBg: "rgba(234,179,8,0.1)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.1)",
  purple: "#a855f7",
  purpleBg: "rgba(168,85,247,0.1)",
  cyan: "#06b6d4",
  cyanBg: "rgba(6,182,212,0.1)",
  orange: "#f97316",
  orangeBg: "rgba(249,115,22,0.1)",
  pink: "#ec4899",
  pinkBg: "rgba(236,72,153,0.1)",
};

// ── Base ────────────────────────────────────────────────────────────
export const page: CSSProperties = {
  minHeight: "100vh",
  background: c.bg,
  color: c.text,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "24px",
};

export const grid: CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 20,
};

// ── Header ──────────────────────────────────────────────────────────
export const header: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: `linear-gradient(135deg, ${c.surface} 0%, #0f172a 100%)`,
  border: `1px solid ${c.border}`,
  borderRadius: 16,
  padding: "20px 28px",
};

export const headerTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#fff",
  margin: 0,
  letterSpacing: -0.5,
};

export const headerSub: CSSProperties = {
  fontSize: 13,
  color: c.textMuted,
  margin: "2px 0 0",
};

export const statsRow: CSSProperties = {
  display: "flex",
  gap: 32,
};

export const statBox: CSSProperties = {
  textAlign: "center" as const,
};

export const statValue = (color: string): CSSProperties => ({
  fontSize: 24,
  fontWeight: 700,
  color,
  lineHeight: 1,
});

export const statLabel: CSSProperties = {
  fontSize: 11,
  color: c.textMuted,
  marginTop: 4,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};

// ── Card ────────────────────────────────────────────────────────────
export const card: CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 14,
  overflow: "hidden",
};

export const cardHeader: CSSProperties = {
  padding: "14px 18px",
  borderBottom: `1px solid ${c.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const cardTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  margin: 0,
};

export const cardCount: CSSProperties = {
  fontSize: 11,
  color: c.textMuted,
  background: "rgba(255,255,255,0.05)",
  padding: "2px 8px",
  borderRadius: 10,
};

export const cardBody: CSSProperties = {
  maxHeight: 420,
  overflowY: "auto" as const,
};

// ── Event row ───────────────────────────────────────────────────────
export const eventRow: CSSProperties = {
  padding: "10px 18px",
  borderBottom: `1px solid rgba(255,255,255,0.03)`,
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  transition: "background 0.15s",
};

export const eventDot = (color: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: color,
  marginTop: 5,
  flexShrink: 0,
});

export const eventType: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: c.text,
};

export const eventTime: CSSProperties = {
  fontSize: 11,
  color: c.textMuted,
  marginLeft: "auto",
  flexShrink: 0,
};

export const tagRow: CSSProperties = {
  display: "flex",
  gap: 4,
  marginTop: 4,
  flexWrap: "wrap" as const,
};

export const tag = (bg: string, fg: string): CSSProperties => ({
  fontSize: 10,
  padding: "1px 7px",
  borderRadius: 6,
  background: bg,
  color: fg,
  fontWeight: 500,
});

// ── Mission row ─────────────────────────────────────────────────────
export const missionRow: CSSProperties = {
  padding: "12px 18px",
  borderBottom: `1px solid rgba(255,255,255,0.03)`,
  cursor: "pointer",
  transition: "background 0.15s",
};

export const missionHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const statusPill = (status: string): CSSProperties => {
  const colors: Record<string, { bg: string; fg: string }> = {
    running: { bg: c.yellowBg, fg: c.yellow },
    succeeded: { bg: c.greenBg, fg: c.green },
    failed: { bg: c.redBg, fg: c.red },
    queued: { bg: "rgba(255,255,255,0.05)", fg: c.textMuted },
    pending: { bg: "rgba(255,255,255,0.05)", fg: c.textMuted },
  };
  const { bg, fg } = colors[status] ?? colors.queued;
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 8,
    background: bg,
    color: fg,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  };
};

export const missionId: CSSProperties = {
  fontSize: 12,
  color: c.textMuted,
  fontFamily: "monospace",
};

export const missionDate: CSSProperties = {
  fontSize: 11,
  color: c.textMuted,
};

export const stepPanel: CSSProperties = {
  background: "rgba(0,0,0,0.2)",
  padding: "8px 18px",
  borderBottom: `1px solid ${c.border}`,
};

export const stepRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 0",
};

export const stepKind: CSSProperties = {
  fontSize: 12,
  color: c.textDim,
  fontFamily: "monospace",
};

// ── Chat bubbles ────────────────────────────────────────────────────
const agentColors: Record<string, string> = {
  strategist: c.blue,
  hype: c.yellow,
  critic: c.red,
  builder: c.green,
  creative: c.purple,
  analyst: c.cyan,
};

export const chatBubble = (agentId: string): CSSProperties => {
  const color = agentColors[agentId] ?? c.textMuted;
  return {
    display: "flex",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 12,
    background: `rgba(255,255,255,0.02)`,
    borderLeft: `3px solid ${color}`,
    marginBottom: 8,
  };
};

export const avatar = (agentId: string): CSSProperties => {
  const color = agentColors[agentId] ?? c.textMuted;
  return {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: `${color}22`,
    border: `2px solid ${color}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    color,
    flexShrink: 0,
  };
};

export const chatName: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: 2,
};

export const chatText: CSSProperties = {
  fontSize: 13,
  color: c.textDim,
  lineHeight: 1.45,
};

// ── Topic pill ──────────────────────────────────────────────────────
export const topicPill: CSSProperties = {
  fontSize: 11,
  color: c.textMuted,
  padding: "4px 10px",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 8,
  marginTop: 6,
  display: "inline-block",
};

export const formatBadge = (format: string): CSSProperties => {
  const colors: Record<string, string> = {
    standup: c.green,
    debate: c.orange,
    watercooler: c.cyan,
  };
  const color = colors[format] ?? c.textMuted;
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 6,
    background: `${color}18`,
    color,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };
};

export const participantChip: CSSProperties = {
  fontSize: 10,
  padding: "2px 7px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.06)",
  color: c.textMuted,
};

// ── Timeline ────────────────────────────────────────────────────────
export const timelineItem: CSSProperties = {
  display: "flex",
  gap: 14,
  paddingBottom: 16,
  position: "relative" as const,
};

export const timelineLine: CSSProperties = {
  position: "absolute" as const,
  left: 11,
  top: 26,
  bottom: 0,
  width: 1,
  background: c.border,
};

export const timelineDot = (status: string): CSSProperties => {
  const colors: Record<string, string> = {
    succeeded: c.green,
    failed: c.red,
    running: c.yellow,
    queued: c.textMuted,
  };
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: `${colors[status] ?? c.textMuted}18`,
    border: `2px solid ${colors[status] ?? c.textMuted}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: colors[status] ?? c.textMuted,
    flexShrink: 0,
    zIndex: 1,
  };
};

// ── Skeleton ────────────────────────────────────────────────────────
export const skeleton: CSSProperties = {
  background: `linear-gradient(90deg, ${c.surface} 25%, #1a2235 50%, ${c.surface} 75%)`,
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s infinite",
  borderRadius: 8,
};

// ── Empty state ─────────────────────────────────────────────────────
export const empty: CSSProperties = {
  padding: "40px 20px",
  textAlign: "center" as const,
  color: c.textMuted,
  fontSize: 13,
};

// ── Error ───────────────────────────────────────────────────────────
export const errorBox: CSSProperties = {
  padding: 16,
  background: c.redBg,
  border: `1px solid rgba(239,68,68,0.2)`,
  borderRadius: 12,
};

export const errorTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: c.red,
  marginBottom: 4,
};

export const errorMsg: CSSProperties = {
  fontSize: 12,
  color: "rgba(239,68,68,0.7)",
  marginBottom: 10,
};

export const retryBtn: CSSProperties = {
  fontSize: 11,
  padding: "4px 12px",
  borderRadius: 6,
  background: "rgba(239,68,68,0.15)",
  color: c.red,
  border: "none",
  cursor: "pointer",
};

// ── Output box ──────────────────────────────────────────────────────
export const outputBox: CSSProperties = {
  marginTop: 6,
  padding: "6px 10px",
  background: "rgba(0,0,0,0.3)",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "monospace",
  color: c.textMuted,
  maxHeight: 80,
  overflow: "auto",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-all" as const,
};

// ── Column wrapper ──────────────────────────────────────────────────
export const column: CSSProperties = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 20,
};

// ── Tag color lookup ────────────────────────────────────────────────
export const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  mission: { bg: c.purpleBg, fg: c.purple },
  step: { bg: c.blueBg, fg: c.blue },
  proposal: { bg: c.yellowBg, fg: c.yellow },
  roundtable: { bg: c.greenBg, fg: c.green },
  initiative: { bg: c.orangeBg, fg: c.orange },
  actionitem: { bg: c.pinkBg, fg: c.pink },
  failed: { bg: c.redBg, fg: c.red },
  succeeded: { bg: c.greenBg, fg: c.green },
  created: { bg: c.blueBg, fg: c.blue },
  started: { bg: c.cyanBg, fg: c.cyan },
  completed: { bg: c.greenBg, fg: c.green },
};

export const EVENT_DOT_COLORS: Record<string, string> = {
  "step:succeeded": c.green,
  "step:failed": c.red,
  "mission:created": c.purple,
  "mission:succeeded": c.green,
  "mission:failed": c.red,
  "proposal:created": c.yellow,
  "proposal:rejected": c.red,
  "roundtable:started": c.cyan,
  "roundtable:completed": c.green,
  "roundtable:failed": c.red,
  "initiative:proposed": c.orange,
  "actionitem:created": c.pink,
};

export const AGENT_INITIALS: Record<string, string> = {
  strategist: "ST",
  hype: "HY",
  critic: "CR",
  builder: "BU",
  creative: "RE",
  analyst: "AN",
};

export { c as colors };
