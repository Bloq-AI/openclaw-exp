-- =============================================================
-- Agent Ops Schema — 001_ops.sql
-- Six core tables for the closed-loop agent operations system.
-- =============================================================

-- 1. Mission Proposals
CREATE TABLE IF NOT EXISTS ops_mission_proposals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  source      text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','trigger','reaction','api')),
  title       text NOT NULL,
  summary     text,
  step_kinds  text[] NOT NULL DEFAULT '{}',
  payload     jsonb NOT NULL DEFAULT '{}',
  rejection_reason text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Missions (approved proposals become missions)
CREATE TABLE IF NOT EXISTS ops_missions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   uuid NOT NULL REFERENCES ops_mission_proposals(id),
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','succeeded','failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  finalized_at  timestamptz
);

-- 3. Mission Steps (individual units of work)
CREATE TABLE IF NOT EXISTS ops_mission_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL REFERENCES ops_missions(id),
  kind        text NOT NULL,
  status      text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed')),
  payload     jsonb NOT NULL DEFAULT '{}',
  output      jsonb,
  reserved_at timestamptz,
  reserved_by text,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Agent Events (audit log for everything)
CREATE TABLE IF NOT EXISTS ops_agent_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  actor      text NOT NULL DEFAULT 'system',
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Policy (key-value config store)
CREATE TABLE IF NOT EXISTS ops_policy (
  key        text PRIMARY KEY,
  json       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Agent Reactions (queued reactions to events)
CREATE TABLE IF NOT EXISTS ops_agent_reactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','done','skipped')),
  event_id       uuid NOT NULL REFERENCES ops_agent_events(id),
  target_agent   text NOT NULL DEFAULT 'control-plane',
  reaction_type  text NOT NULL,
  run_after      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- Indexes
-- =============================================================

-- Fast worker claim query: find queued steps, optionally filtered by kind
CREATE INDEX idx_mission_steps_claim
  ON ops_mission_steps (status, kind)
  WHERE status = 'queued';

-- Event timeline queries
CREATE INDEX idx_agent_events_created
  ON ops_agent_events (created_at DESC);

-- Reaction queue polling
CREATE INDEX idx_agent_reactions_queue
  ON ops_agent_reactions (status, run_after)
  WHERE status = 'pending';
