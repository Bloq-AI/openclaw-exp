-- Guarantee one LinkedIn draft per day:
-- • cooldown_minutes = 1440 → can fire at most once per 24h
-- • skip_probability = 0    → always fires when cooldown is satisfied (no random skips)
-- • jitter_minutes = 120    → up to 2h of organic timing variation
UPDATE ops_trigger_rules
SET
  cooldown_minutes  = 1440,
  skip_probability  = 0,
  jitter_minutes    = 120
WHERE name = 'proactive_github_linkedin';
