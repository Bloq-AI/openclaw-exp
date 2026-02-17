-- Roundtable policy configuration
INSERT INTO ops_policy (key, json) VALUES
('roundtable', '{
  "enabled": true,
  "max_concurrent_sessions": 1,
  "max_turns": 12,
  "char_cap": 120,
  "enabled_formats": ["standup", "debate", "watercooler"]
}'::jsonb)
ON CONFLICT (key) DO UPDATE SET json = EXCLUDED.json, updated_at = now();
