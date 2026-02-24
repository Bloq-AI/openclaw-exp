-- =============================================================
-- Seed: Default ops_policy rows
-- =============================================================

INSERT INTO ops_policy (key, json) VALUES
  ('auto_approve', '{"enabled": true, "allowed_sources": ["trigger", "reaction"], "allowed_step_kinds": ["analyze", "write_content", "scan_github", "draft_linkedin_post", "scan_x_competitors", "draft_x_post", "generate_image", "post_tweet", "track_tweet_performance", "select_top_performers", "promote_to_linkedin", "post_linkedin", "analyze_content_performance", "judge_content_quality", "synthesize_improvements", "evolve_image_prompts"]}'),
  ('worker_policy', '{"max_concurrent_steps": 2, "stale_timeout_minutes": 30, "poll_interval_seconds": 10}'),
  ('x_autopost', '{"enabled": false, "require_approval_kinds": ["post_tweet"]}'),
  ('x_daily_quota', '{"limit": 10, "window": "day"}'),
  ('reaction_matrix', '{"patterns": []}')
ON CONFLICT (key) DO UPDATE SET json = EXCLUDED.json, updated_at = now();
