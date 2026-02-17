-- Add posted_at to track when a draft was posted to LinkedIn
ALTER TABLE ops_content_drafts
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;
