# Agent Ops — Architecture

## Overview

Closed-loop agent operations system built into the Fitflow monorepo. The loop runs continuously:

```
Proposal → Gate/Auto-Approve → Mission + Steps → VPS Worker Executes → Events → Triggers/Reactions → Proposal
```

## Data Flow

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                        CONTROL PLANE                           │
 │                     (apps/web-admin)                            │
 │                                                                │
 │  ┌──────────┐    ┌────────┐    ┌──────────┐    ┌───────────┐  │
 │  │ Triggers │───▶│Proposal│───▶│  Gates   │───▶│  Mission  │  │
 │  │          │    │Service │    │          │    │  + Steps  │  │
 │  └──────────┘    └────────┘    └──────────┘    └─────┬─────┘  │
 │       ▲               ▲                              │        │
 │       │               │                              │        │
 │  ┌────┴─────┐         │                              │        │
 │  │Reactions │         │                              │        │
 │  └────┬─────┘         │                              │        │
 │       │               │                              │        │
 │  ┌────┴─────────────────┐                            │        │
 │  │    Events Table      │◀───────────────────────────┼────┐   │
 │  └──────────────────────┘                            │    │   │
 └──────────────────────────────────────────────────────┼────┼───┘
                                                        │    │
                                                        ▼    │
 ┌──────────────────────────────────────────────────────────────┐
 │                       VPS WORKER                             │
 │                     (vps-worker/)                             │
 │                                                              │
 │  claim_next_step() ──▶ Execute ──▶ Update Step ──▶ Emit Event│
 │        ▲                                                     │
 │        │                                                     │
 │        └──── sleep(5-15s jitter) ◀── no work ◀──┘            │
 └──────────────────────────────────────────────────────────────┘
```

## Components

### Supabase Schema (`/supabase/migrations/`)
- **ops_mission_proposals** — Incoming proposals (pending/approved/rejected)
- **ops_missions** — Active missions (running/succeeded/failed)
- **ops_mission_steps** — Individual work units claimed by workers
- **ops_agent_events** — Audit log for all system events
- **ops_policy** — Key-value config store for gates, quotas, reaction rules
- **ops_agent_reactions** — Queued reactions to events

### Control Plane (`apps/web-admin/src/ops/`)
- **proposal-service** — Single entry point for all proposals
- **gates** — Cap/quota checks before approval (e.g., tweet quota)
- **triggers** — Time/condition-based proposal generators
- **reactions** — Event-driven proposal generators via reaction_matrix
- **recoverStaleSteps** — Marks stuck steps as failed
- **missions/finalize** — Determines mission outcome from step statuses

### Heartbeat (`/api/ops/heartbeat`)
- Cron-hit endpoint that runs triggers, reactions, and stale recovery
- Protected by `OPS_KEY` bearer token

### VPS Worker (`/vps-worker/`)
- Polls for queued steps via `claim_next_step()` (atomic, skip-locked)
- Executes via kind-based executor map
- Reports results and emits events

## Invariants
1. Every proposal goes through `createProposalAndMaybeAutoApprove()` — no other path
2. Steps are claimed atomically via `FOR UPDATE SKIP LOCKED` — no double-execution
3. Mission finalization is idempotent — safe to call from both worker and control plane
4. Gates are checked before any proposal is approved
5. All state changes emit events to `ops_agent_events`
