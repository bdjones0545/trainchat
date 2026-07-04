-- ============================================================================
-- Manual additive migration — external_programs.training_system_id
-- ============================================================================
--
-- Phase 2.1 (materialization foundation). Adds a nullable FK linking an external
-- program blob to a relational training_systems hierarchy, used by a LATER
-- Phase 2 PR to route external edits through the surgical edit engine. No code
-- writes this column yet; every existing and new row stays NULL.
--
-- Additive only: ADD COLUMN + ADD CONSTRAINT. No DROP, no destructive ALTER.
-- Idempotent (IF NOT EXISTS + duplicate_object guard). Mirrors the Drizzle model
-- in lib/db/src/schema/external-api.ts, so a future `drizzle-kit push` (once the
-- unrelated schema drift is reconciled) sees it already in sync.
--
-- Apply manually (do NOT run drizzle-kit push — see DEPLOYMENT.md §5):
--   psql "$DATABASE_URL" -f lib/db/manual-migrations/0002_external_programs_training_system_id.sql
-- ============================================================================

BEGIN;

ALTER TABLE "external_programs"
	ADD COLUMN IF NOT EXISTS "training_system_id" integer;

-- FK: training_system_id -> training_systems(id) ON DELETE SET NULL
-- (the blob survives if its materialized system is deleted).
DO $$ BEGIN
	ALTER TABLE "external_programs"
		ADD CONSTRAINT "external_programs_training_system_id_training_systems_id_fk"
		FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY (optional)
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'external_programs' AND column_name = 'training_system_id';
--   -- expect: integer, YES (nullable)
-- ============================================================================
