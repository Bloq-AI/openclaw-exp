# openclaw-exp

Closed-loop agent operations system with SHIELD.md security policy.

## Architecture

```
Proposal → Gate/Auto-Approve → Mission + Steps → VPS Worker Executes → Events → Triggers/Reactions → back to Proposal
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system overview and [docs/RUNBOOK.md](docs/RUNBOOK.md) for operational guidance.

## Structure

- **`supabase/`** — Database migrations and seed data (6 tables, atomic claim function)
- **`apps/web-admin/src/ops/`** — Control plane: proposal service, gates, triggers, reactions, stale recovery
- **`apps/web-admin/src/app/api/ops/`** — Heartbeat API endpoint (cron-driven)
- **`vps-worker/`** — Standalone TypeScript worker that polls and executes steps
- **`docs/`** — Architecture and runbook documentation
- **`SHIELD.md`** — SHIELD v0 security policy for agent threat detection

## SHIELD.md

A context-loaded runtime threat feed policy based on the [SHIELD standard](https://github.com/moltthreats/shield). Defines how the agent should react when known threats are detected — without redefining the agent role.

Decision priority: `block > require_approval > log`

Ships with 6 active threats covering: unauthorized secret access, untrusted MCP connections, prompt injection, supply chain attacks, data exfiltration, and policy bypass.

## Setup

1. Run migrations against Supabase: `supabase/migrations/001_ops.sql`, `002_claim_step.sql`
2. Seed policies: `supabase/seed/ops_policy.sql`
3. Configure env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPS_KEY`
4. Deploy web-admin (Next.js) and set up heartbeat cron
5. Run the VPS worker: `cd vps-worker && pnpm install && pnpm start`
