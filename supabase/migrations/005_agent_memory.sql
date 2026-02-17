-- Agent memory system
CREATE TABLE ops_agent_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        text NOT NULL,
  type            text NOT NULL CHECK (type IN ('insight', 'pattern', 'strategy', 'preference', 'lesson')),
  content         text NOT NULL,
  confidence      real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  tags            text[] NOT NULL DEFAULT '{}',
  source_trace_id text UNIQUE,           -- dedup key (e.g., session_id + turn index)
  superseded_by   uuid REFERENCES ops_agent_memory(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_memory_agent ON ops_agent_memory (agent_id);
CREATE INDEX idx_agent_memory_type ON ops_agent_memory (agent_id, type);
CREATE INDEX idx_agent_memory_confidence ON ops_agent_memory (agent_id, confidence DESC);
