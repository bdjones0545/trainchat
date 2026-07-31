-- ─── 0007: Kevin durability & autoscale safety ───────────────────────────────
--
-- Supports PR "Kevin Durability & Autoscale Safety":
--   H2 — outcome idempotency (idempotency_key + UNIQUE) so duplicate forwards are
--        harmless and DB uniqueness prevents duplicate outcome rows.
--   H3 — event stale-processing recovery via processing_started_at.
--   M7 — outcome stale-processing recovery via processing_started_at (replacing
--        the previous, incorrect use of created_at).
-- Plus supporting indexes for the recovery scans.
--
-- Additive, transactional, and idempotent (safe to re-run). Enabling Kevin
-- dispatch/outcome forwarding must NOT happen until this migration is applied.

BEGIN;

-- ── kevin_app_events: processing_started_at (H3) ─────────────────────────────
ALTER TABLE "kevin_app_events"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamptz;

-- ── kevin_training_outcomes: processing_started_at (M7) ──────────────────────
ALTER TABLE "kevin_training_outcomes"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamptz;

-- ── kevin_training_outcomes: idempotency_key (H2) ────────────────────────────
-- Add nullable, backfill a unique value per existing row, then enforce NOT NULL
-- + UNIQUE. Backfill uses the primary key so it is deterministic and unique;
-- re-runs only touch rows still NULL.
ALTER TABLE "kevin_training_outcomes"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

UPDATE "kevin_training_outcomes"
  SET "idempotency_key" = 'backfill:outcome:' || "id"::text
  WHERE "idempotency_key" IS NULL;

ALTER TABLE "kevin_training_outcomes"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_kevin_outcomes_idempotency"
  ON "kevin_training_outcomes" ("idempotency_key");

-- ── Recovery-scan indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_kevin_events_processing"
  ON "kevin_app_events" ("status", "processing_started_at");

CREATE INDEX IF NOT EXISTS "idx_kevin_outcomes_processing"
  ON "kevin_training_outcomes" ("forward_status", "processing_started_at");

COMMIT;

-- ─── Rollback / recovery ─────────────────────────────────────────────────────
-- All changes are additive; reverting drops the new columns and indexes and
-- loses no pre-existing data (idempotency_key values were synthesised here):
--
--   BEGIN;
--   DROP INDEX IF EXISTS "idx_kevin_outcomes_processing";
--   DROP INDEX IF EXISTS "idx_kevin_events_processing";
--   DROP INDEX IF EXISTS "idx_kevin_outcomes_idempotency";
--   ALTER TABLE "kevin_training_outcomes" DROP COLUMN IF EXISTS "idempotency_key";
--   ALTER TABLE "kevin_training_outcomes" DROP COLUMN IF EXISTS "processing_started_at";
--   ALTER TABLE "kevin_app_events" DROP COLUMN IF EXISTS "processing_started_at";
--   COMMIT;
--
-- NOTE (push-based schema): the Drizzle schema now declares these columns/indexes,
-- so apply this migration BEFORE the next `drizzle-kit push`. Pushing the NOT NULL
-- idempotency_key against a populated table without this backfill would fail.
