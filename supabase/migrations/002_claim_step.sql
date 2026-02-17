-- =============================================================
-- claim_next_step — Atomic step claiming with SKIP LOCKED
-- =============================================================

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
  -- Atomically select one queued step, skipping any locked rows
  SELECT id INTO v_step_id
  FROM ops_mission_steps
  WHERE status = 'queued'
    AND (p_kinds IS NULL OR kind = ANY(p_kinds))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Nothing available
  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim it
  UPDATE ops_mission_steps
  SET status      = 'running',
      reserved_at = now(),
      reserved_by = p_worker_id
  WHERE id = v_step_id;

  -- Return the full row
  RETURN QUERY
    SELECT * FROM ops_mission_steps WHERE id = v_step_id;
END;
$$;
