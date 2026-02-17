-- Seed trigger rules: 4 reactive + 7 proactive
INSERT INTO ops_trigger_rules (name, trigger_event, conditions, action_config, cooldown_minutes, skip_probability, jitter_minutes) VALUES

-- === REACTIVE RULES (skip_probability = 0, always fire when conditions met) ===

('react_mission_failed', 'mission_failed', '{}',
 '{"title":"Diagnose failed mission","summary":"Analyze why the most recent mission failed and suggest fixes","step_kinds":["analyze"]}'::jsonb,
 30, 0, 0),

('react_tweet_high_engagement', 'tweet_high_engagement', '{"min_likes":50}'::jsonb,
 '{"title":"Capitalize on viral tweet","summary":"Analyze high-engagement tweet and draft follow-up content","step_kinds":["analyze","write_content"]}'::jsonb,
 120, 0, 0),

('react_step_failed_repeated', 'step_failed_repeated', '{"min_failures":3,"window_hours":6}'::jsonb,
 '{"title":"Investigate repeated step failures","summary":"Multiple steps failed recently — diagnose root cause","step_kinds":["analyze"]}'::jsonb,
 60, 0, 0),

('react_content_published', 'content_published', '{}',
 '{"title":"Post-publish review","summary":"Review published content performance after cooldown","step_kinds":["analyze"]}'::jsonb,
 240, 0, 0),

-- === PROACTIVE RULES (skip_probability + jitter for organic timing) ===

('proactive_scan_signals', 'scan_signals', '{}',
 '{"title":"Scan external signals","summary":"Look for trending topics and opportunities","step_kinds":["analyze"]}'::jsonb,
 180, 0.3, 30),

('proactive_draft_tweet', 'draft_tweet', '{}',
 '{"title":"Draft tweet content","summary":"Proactively create tweet content based on recent analysis","step_kinds":["analyze","write_content"]}'::jsonb,
 240, 0.4, 45),

('proactive_analyze_ops', 'analyze_ops', '{}',
 '{"title":"Ops self-analysis","summary":"Review recent mission outcomes and operational health","step_kinds":["analyze"]}'::jsonb,
 360, 0.3, 60),

('proactive_content_review', 'content_review', '{}',
 '{"title":"Content quality review","summary":"Review recent content output for quality and consistency","step_kinds":["analyze"]}'::jsonb,
 480, 0.5, 30),

('proactive_trend_scan', 'trend_scan', '{}',
 '{"title":"Trend scan","summary":"Scan for emerging trends relevant to our audience","step_kinds":["analyze"]}'::jsonb,
 300, 0.35, 45),

('proactive_engagement_check', 'engagement_check', '{}',
 '{"title":"Engagement check","summary":"Review recent engagement metrics and adjust strategy","step_kinds":["analyze"]}'::jsonb,
 360, 0.4, 30),

('proactive_health_check', 'health_check', '{}',
 '{"title":"System health check","summary":"Verify all subsystems are operational and performing well","step_kinds":["analyze"]}'::jsonb,
 120, 0.2, 15)

ON CONFLICT (name) DO NOTHING;
