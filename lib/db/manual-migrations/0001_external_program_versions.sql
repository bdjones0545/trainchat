-- ============================================================================
-- Manual additive migration — external_program_versions
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--   `drizzle-kit push` cannot be used to apply this table. Push diffs the
--   TypeScript schema against the live database and treats the schema as the
--   desired end-state, so it wants to DROP every production object that is not
--   modeled in lib/db/src/schema/*.ts. On this database that currently includes:
--     - user_sessions            (connect-pg-simple session store; intentionally
--                                  not Drizzle-managed — see CLAUDE.md §3 DR-0037)
--     - training_methods         (present in prod, missing from schema files)
--     - goal_knowledge_graph     (present in prod, missing from schema files)
--     - exercise_product_links   (present in prod, missing from schema files)
--     - 12 product_directory columns (prod has columns the schema file omits)
--   Running push would DROP all of the above. That is unrelated schema drift,
--   NOT part of this change.
--
-- WHAT THIS FILE DOES
--   Creates ONLY external_program_versions and its two foreign keys. It contains
--   NO destructive statements (no DROP/ALTER ... DROP). It is idempotent (safe to
--   re-run) via IF NOT EXISTS + duplicate_object guards.
--
--   The DDL mirrors lib/db/src/schema/external-api.ts exactly, so once the
--   unrelated drift above is reconciled, a future `drizzle-kit push` will see
--   this table as already in sync and make no changes to it.
--
-- HOW TO APPLY (Replit shell or any psql session against the prod DB)
--   psql "$DATABASE_URL" -f lib/db/manual-migrations/0001_external_program_versions.sql
--   -- or paste the statements into the Replit database SQL console.
--   Do NOT run `drizzle-kit push` for this change.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "external_program_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_program_id" integer NOT NULL,
	"api_key_id" integer,
	"program_snapshot" jsonb NOT NULL,
	"type" text DEFAULT 'edit' NOT NULL,
	"instruction" text,
	"scope" text,
	"change_summary" jsonb,
	"reverted_from_version_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- FK: external_program_id -> external_programs(id) ON DELETE CASCADE
-- (versions die with their parent program). Guarded so re-runs are no-ops.
DO $$ BEGIN
	ALTER TABLE "external_program_versions"
		ADD CONSTRAINT "external_program_versions_external_program_id_external_programs_id_fk"
		FOREIGN KEY ("external_program_id") REFERENCES "public"."external_programs"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: api_key_id -> external_api_keys(id) ON DELETE SET NULL
-- (history survives key deletion; attribution becomes null).
DO $$ BEGIN
	ALTER TABLE "external_program_versions"
		ADD CONSTRAINT "external_program_versions_api_key_id_external_api_keys_id_fk"
		FOREIGN KEY ("api_key_id") REFERENCES "public"."external_api_keys"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY (optional — run after applying)
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'external_program_versions'
--   ORDER BY ordinal_position;
--
--   SELECT conname, confdeltype
--   FROM pg_constraint
--   WHERE conrelid = 'external_program_versions'::regclass AND contype = 'f';
--   -- expect confdeltype 'c' (cascade) and 'n' (set null)
-- ============================================================================
