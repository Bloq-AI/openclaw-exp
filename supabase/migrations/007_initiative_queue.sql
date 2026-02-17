-- Initiative system: agents propose their own missions
CREATE TABLE ops_initiative_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiative_queue_pending ON ops_initiative_queue (status) WHERE status = 'pending';
