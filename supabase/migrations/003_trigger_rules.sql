-- Trigger rules: DB-driven trigger engine replacing hardcoded array
CREATE TABLE ops_trigger_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  trigger_event text NOT NULL,          -- key for checker lookup
  conditions  jsonb NOT NULL DEFAULT '{}',
  action_config jsonb NOT NULL DEFAULT '{}', -- { title, summary, step_kinds, payload }
  cooldown_minutes int NOT NULL DEFAULT 60,
  enabled     boolean NOT NULL DEFAULT true,
  fire_count  int NOT NULL DEFAULT 0,
  last_fired_at timestamptz,
  skip_probability real NOT NULL DEFAULT 0,  -- 0.0-1.0, for proactive rules
  jitter_minutes int NOT NULL DEFAULT 0,     -- random jitter added to cooldown
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trigger_rules_enabled ON ops_trigger_rules (enabled) WHERE enabled = true;
