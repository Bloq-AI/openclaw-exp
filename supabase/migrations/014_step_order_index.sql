-- =============================================================
-- 014_step_order_index
--
-- Add order_index to ops_mission_steps so steps batch-inserted
-- at the same timestamp are still claimed in pipeline order.
-- =============================================================

ALTER TABLE ops_mission_steps
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

-- Update claim_next_step to order by (created_at, order_index)
CREATE OR REPLACE FUNCTION claim_next_step(
  p_worker_id text,
  p_kinds     text[] DEFAULT NULL
)
RETURNS SETOF ops_mission_steps
LANGUAGE plpgsql
AS $$
DECLARE
  v_step_id uuid;
BEGIN
  SELECT id INTO v_step_id
  FROM ops_mission_steps
  WHERE status = 'queued'
    AND (p_kinds IS NULL OR kind = ANY(p_kinds))
  ORDER BY created_at ASC, order_index ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE ops_mission_steps
  SET status      = 'running',
      reserved_at = now(),
      reserved_by = p_worker_id
  WHERE id = v_step_id;

  RETURN QUERY
    SELECT * FROM ops_mission_steps WHERE id = v_step_id;
END;
$$;
