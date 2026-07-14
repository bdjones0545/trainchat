-- Migration 0005 — Kevin outcomes worker columns
--
-- Adds the columns needed for the durable outcome retry worker:
--   next_retry_at  — when to next attempt forwarding
--   dead_lettered_at — when the row was dead-lettered
--
-- The forward_status values (processing, forwarded, dead_lettered) are
-- enforced at the ORM level only (text column with no DB check constraint),
-- so no ALTER TYPE is needed.
--
-- Idempotent — safe to re-run.

ALTER TABLE kevin_training_outcomes
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

-- Add index for worker queries (status + next_retry_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_training_outcomes'
      AND indexname = 'idx_kevin_outcomes_retry'
  ) THEN
    CREATE INDEX idx_kevin_outcomes_retry
      ON kevin_training_outcomes (forward_status, next_retry_at);
  END IF;
END $$;
