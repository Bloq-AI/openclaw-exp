-- =============================================================
-- Content Posts — 012_content_posts.sql
-- Tracks all posts published across platforms (Twitter, LinkedIn)
-- with performance metrics and the Twitter→LinkedIn promotion pipeline.
-- =============================================================

CREATE TABLE IF NOT EXISTS content_posts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity
  brand                text NOT NULL DEFAULT 'bloq',   -- 'bloq' | 'hadi' | 'fikrah'
  platform             text NOT NULL,                  -- 'twitter' | 'linkedin'
  content              text NOT NULL,

  -- assets
  image_url            text,                           -- Supabase Storage public URL

  -- platform-specific IDs (filled after posting)
  tweet_id             text,
  linkedin_id          text,

  -- timestamps
  posted_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),

  -- performance metrics (filled by track_tweet_performance)
  likes                int NOT NULL DEFAULT 0,
  retweets             int NOT NULL DEFAULT 0,
  replies              int NOT NULL DEFAULT 0,
  impressions          int NOT NULL DEFAULT 0,
  tracked_at           timestamptz,

  -- computed engagement score: likes + RT×3 + replies×2
  perf_score           int GENERATED ALWAYS AS (likes + retweets * 3 + replies * 2) STORED,

  -- promotion pipeline
  promoted_to_linkedin boolean NOT NULL DEFAULT false,

  -- back-reference to the mission that produced this post
  mission_id           uuid REFERENCES ops_missions(id)
);

-- Indexes
CREATE INDEX idx_content_posts_platform   ON content_posts (platform, posted_at DESC);
CREATE INDEX idx_content_posts_perf       ON content_posts (perf_score DESC) WHERE platform = 'twitter';
CREATE INDEX idx_content_posts_unpromoted ON content_posts (perf_score DESC)
  WHERE platform = 'twitter' AND promoted_to_linkedin = false AND tracked_at IS NOT NULL;
