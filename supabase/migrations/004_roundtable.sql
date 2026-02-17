-- Roundtable conversation system
CREATE TABLE ops_roundtable_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format      text NOT NULL,              -- standup | debate | watercooler
  topic       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  participants text[] NOT NULL DEFAULT '{}',
  turns       jsonb NOT NULL DEFAULT '[]', -- [{agent_id, message, timestamp}]
  scheduled_hour int,                      -- 0-23, which hour slot created this
  created_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE ops_roundtable_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES ops_roundtable_sessions(id),
  status      text NOT NULL DEFAULT 'pending', -- pending | claimed | done
  claimed_by  text,
  claimed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roundtable_queue_pending ON ops_roundtable_queue (status) WHERE status = 'pending';
CREATE INDEX idx_roundtable_sessions_status ON ops_roundtable_sessions (status);
