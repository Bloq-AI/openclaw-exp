-- Agent relationship / affinity system
CREATE TABLE ops_agent_relationships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_a             text NOT NULL,
  agent_b             text NOT NULL,
  affinity            real NOT NULL DEFAULT 0.50 CHECK (affinity >= 0.10 AND affinity <= 0.95),
  total_interactions   int NOT NULL DEFAULT 0,
  positive_interactions int NOT NULL DEFAULT 0,
  negative_interactions int NOT NULL DEFAULT 0,
  drift_log           jsonb NOT NULL DEFAULT '[]',  -- last 20 entries [{delta, reason, timestamp}]
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_a, agent_b),
  CHECK (agent_a < agent_b)
);
