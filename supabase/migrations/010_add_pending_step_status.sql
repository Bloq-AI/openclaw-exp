-- The proposal-service inserts subsequent steps with status='pending'
-- (they get promoted to 'queued' by the worker after the previous step succeeds).
-- The original CHECK constraint was missing 'pending', causing a silent insert
-- failure whenever a mission had more than one step.
ALTER TABLE ops_mission_steps
  DROP CONSTRAINT IF EXISTS ops_mission_steps_status_check;

ALTER TABLE ops_mission_steps
  ADD CONSTRAINT ops_mission_steps_status_check
  CHECK (status IN ('pending','queued','running','succeeded','failed'));
