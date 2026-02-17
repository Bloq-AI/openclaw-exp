# Agent Ops — Runbook

## VPS Worker Setup

### 1. Install and configure
```bash
cd vps-worker
cp .env.example .env
# Edit .env with your Supabase credentials and a unique WORKER_ID
pnpm install
```

### 2. Run the worker
```bash
# Development (with auto-reload)
pnpm dev

# Production
pnpm start
```

### 3. Cron: Heartbeat
Set up a cron job to hit the heartbeat endpoint every minute:

```bash
# crontab -e
* * * * * curl -s -X POST https://your-admin.vercel.app/api/ops/heartbeat \
  -H "Authorization: Bearer $OPS_KEY" \
  -H "Content-Type: application/json" > /dev/null 2>&1
```

## Observability SQL Queries

### Queued steps (waiting for workers)
```sql
SELECT kind, count(*) FROM ops_mission_steps
WHERE status = 'queued'
GROUP BY kind;
```

### Running steps (currently being executed)
```sql
SELECT id, kind, reserved_by, reserved_at
FROM ops_mission_steps
WHERE status = 'running'
ORDER BY reserved_at ASC;
```

### Stale steps (stuck > 30 min)
```sql
SELECT id, kind, reserved_by, reserved_at
FROM ops_mission_steps
WHERE status = 'running'
  AND reserved_at < now() - interval '30 minutes';
```

### Last 50 events
```sql
SELECT type, actor, tags, created_at
FROM ops_agent_events
ORDER BY created_at DESC
LIMIT 50;
```

### Mission success rate (last 24h)
```sql
SELECT status, count(*)
FROM ops_missions
WHERE created_at > now() - interval '24 hours'
GROUP BY status;
```

### Daily tweet count (for quota checks)
```sql
SELECT count(*)
FROM ops_agent_events
WHERE type = 'step:succeeded'
  AND 'post_tweet' = ANY(tags)
  AND created_at >= date_trunc('day', now());
```

## Troubleshooting

### Steps stuck in "running"
The heartbeat's `recoverStaleSteps` handles this automatically after 30 minutes. To force recovery:
```sql
UPDATE ops_mission_steps
SET status = 'failed', last_error = 'manual recovery'
WHERE status = 'running' AND reserved_at < now() - interval '30 minutes';
```

### Worker not claiming steps
1. Check worker logs for connection errors
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
3. Verify the `claim_next_step` function exists: `SELECT proname FROM pg_proc WHERE proname = 'claim_next_step';`

### Proposals stuck in "pending"
Check auto_approve policy:
```sql
SELECT json FROM ops_policy WHERE key = 'auto_approve';
```
Ensure the source and step_kinds are in the allowed lists, or manually approve:
```sql
UPDATE ops_mission_proposals SET status = 'approved' WHERE id = '<id>';
```

### Heartbeat returning 401
Verify that `OPS_KEY` env var is set in both the cron job and the Next.js deployment.
