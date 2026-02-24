-- =============================================================
-- Persona Versions + Image Feedback — 013_persona_versions.sql
--
-- persona_versions: versioned history of evolved AI persona configs
--   (system_prompt, content_rules, image_style_prompt, pillar_weights)
--   Each row is one field for one brand+platform combo.
--   The latest active version per (brand, platform, field) wins.
--
-- image_feedback: user ratings on generated images, feeds the
--   image prompt evolution pipeline.
-- =============================================================

-- ── Persona Versions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS persona_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity
  brand       text NOT NULL DEFAULT 'bloq',   -- 'bloq' | 'hadi' | 'fikrah'
  platform    text NOT NULL,                  -- 'twitter' | 'linkedin' | 'both'
  field       text NOT NULL,
    -- 'system_prompt' | 'content_rules' | 'image_style_prompt'
    -- | 'pillar_weights' | 'scan_query'

  -- the evolved value
  value       text NOT NULL,

  -- provenance
  parent_id   uuid REFERENCES persona_versions(id),  -- what this evolved from
  reason      text,                                   -- why this update was made
  created_by  text NOT NULL DEFAULT 'system',         -- 'system' | 'user' | agent_id
  is_active   boolean NOT NULL DEFAULT true,          -- false = superseded

  -- judge verdicts that led to this change (for audit trail)
  judge_input jsonb,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup: get latest active version per brand+platform+field
CREATE INDEX idx_persona_versions_active
  ON persona_versions (brand, platform, field, created_at DESC)
  WHERE is_active = true;

-- ── Image Feedback ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS image_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- source
  content_post_id  uuid REFERENCES content_posts(id),
  draft_id         uuid,   -- ops_content_drafts.id (no FK since table has no uuid PK constraint)
  image_url        text NOT NULL,
  brand            text NOT NULL DEFAULT 'bloq',
  platform         text NOT NULL DEFAULT 'twitter',

  -- feedback
  rating           int CHECK (rating BETWEEN 1 AND 5),   -- 1=terrible 5=great
  feedback_text    text,                                  -- freeform user note
  processed        boolean NOT NULL DEFAULT false,        -- true once used in evolution

  -- which prompt version generated this image
  persona_version_id uuid REFERENCES persona_versions(id),

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_feedback_unprocessed
  ON image_feedback (created_at DESC)
  WHERE processed = false;
