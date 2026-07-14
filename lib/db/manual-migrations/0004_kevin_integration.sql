-- ============================================================================
-- Manual additive migration — kevin_integration
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--   `drizzle-kit push` cannot be safely used here because the production DB
--   contains objects not modeled in the schema files (user_sessions, etc.).
--   Running push would DROP those objects. This manual migration adds ONLY
--   the Kevin integration tables without touching anything else.
--
-- WHAT THIS FILE DOES
--   Creates 6 new tables:
--     kevin_app_capabilities   — capability modes per scope
--     kevin_app_events         — durable outbound event queue
--     kevin_context_requests   — audit log for context retrievals
--     kevin_training_outcomes  — training outcome records
--     kevin_app_signals        — inbound Kevin signals
--     kevin_memory_consents    — user/org memory consent records
--     kevin_identity_links     — future cross-app identity links (Phase 13)
--
-- IDEMPOTENCY
--   All statements use IF NOT EXISTS so re-running is safe.
--
-- SECURITY
--   - No raw PII is stored in any Kevin table
--   - user_id_pseudonymous is a one-way HMAC-derived identifier
--   - No raw health data, emails, or secrets in any column
--
-- HOW TO APPLY
--   psql $DATABASE_URL -f lib/db/manual-migrations/0004_kevin_integration.sql
-- ============================================================================

-- ─── kevin_app_capabilities ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_app_capabilities" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope_type" text NOT NULL DEFAULT 'application',
  "scope_id" text NOT NULL DEFAULT 'trainchat',
  "capability" text NOT NULL,
  "approval_mode" text NOT NULL DEFAULT 'observe',
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_app_capabilities'
    AND indexname = 'idx_kevin_capabilities_scope'
  ) THEN
    CREATE INDEX "idx_kevin_capabilities_scope"
      ON "kevin_app_capabilities" ("scope_type", "scope_id", "capability");
  END IF;
END $$;

-- ─── kevin_app_events ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_app_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "application_id" text NOT NULL DEFAULT 'trainchat',
  "org_id" text,
  "user_id_pseudonymous" text NOT NULL,
  "event_type" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "next_retry_at" timestamp with time zone,
  "trace_id" text,
  "origin" text,
  "depth" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "dead_lettered_at" timestamp with time zone,
  CONSTRAINT "kevin_app_events_idempotency_key_unique" UNIQUE ("idempotency_key")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_app_events'
    AND indexname = 'idx_kevin_events_status'
  ) THEN
    CREATE INDEX "idx_kevin_events_status"
      ON "kevin_app_events" ("status", "next_retry_at");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_app_events'
    AND indexname = 'idx_kevin_events_user'
  ) THEN
    CREATE INDEX "idx_kevin_events_user"
      ON "kevin_app_events" ("user_id_pseudonymous");
  END IF;
END $$;

-- ─── kevin_context_requests ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_context_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "application_id" text NOT NULL DEFAULT 'trainchat',
  "org_id" text,
  "user_id_pseudonymous" text NOT NULL,
  "workflow" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "question_summary" text,
  "response_summary" text,
  "memories_count" integer NOT NULL DEFAULT 0,
  "confidence" integer,
  "duration_ms" integer,
  "status" text NOT NULL DEFAULT 'pending',
  "trace_id" text,
  "depth" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_context_requests'
    AND indexname = 'idx_kevin_ctx_user'
  ) THEN
    CREATE INDEX "idx_kevin_ctx_user"
      ON "kevin_context_requests" ("user_id_pseudonymous");
  END IF;
END $$;

-- ─── kevin_training_outcomes ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_training_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "application_id" text NOT NULL DEFAULT 'trainchat',
  "org_id" text,
  "user_id_pseudonymous" text NOT NULL,
  "context_request_id" integer REFERENCES "kevin_context_requests"("id") ON DELETE SET NULL,
  "entity_type" text,
  "entity_id" text,
  "outcome_type" text NOT NULL,
  "result_summary" jsonb,
  "was_useful" boolean,
  "was_modified" boolean,
  "completion_status" text,
  "forward_status" text NOT NULL DEFAULT 'pending',
  "forward_attempts" integer NOT NULL DEFAULT 0,
  "last_forward_error" text,
  "trace_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "forwarded_at" timestamp with time zone
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_training_outcomes'
    AND indexname = 'idx_kevin_outcomes_user'
  ) THEN
    CREATE INDEX "idx_kevin_outcomes_user"
      ON "kevin_training_outcomes" ("user_id_pseudonymous");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_training_outcomes'
    AND indexname = 'idx_kevin_outcomes_fwd'
  ) THEN
    CREATE INDEX "idx_kevin_outcomes_fwd"
      ON "kevin_training_outcomes" ("forward_status");
  END IF;
END $$;

-- ─── kevin_app_signals ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_app_signals" (
  "id" serial PRIMARY KEY NOT NULL,
  "external_signal_id" text,
  "application_id" text NOT NULL DEFAULT 'trainchat',
  "org_id" text,
  "signal_type" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "title" text,
  "summary" text,
  "evidence" jsonb,
  "confidence" integer,
  "risk_class" text DEFAULT 'low',
  "status" text NOT NULL DEFAULT 'received',
  "routed_to" text,
  "trace_id" text,
  "depth" integer NOT NULL DEFAULT 0,
  "parent_id" text,
  "origin" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "routed_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_app_signals'
    AND indexname = 'idx_kevin_signals_status'
  ) THEN
    CREATE INDEX "idx_kevin_signals_status" ON "kevin_app_signals" ("status");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_app_signals'
    AND indexname = 'idx_kevin_signals_type'
  ) THEN
    CREATE INDEX "idx_kevin_signals_type" ON "kevin_app_signals" ("signal_type");
  END IF;
END $$;

-- ─── kevin_memory_consents ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "kevin_memory_consents" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope_type" text NOT NULL DEFAULT 'user',
  "scope_id" text NOT NULL,
  "memory_type" text NOT NULL,
  "consent_status" text NOT NULL DEFAULT 'not_requested',
  "granted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE ("scope_type", "scope_id", "memory_type")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_memory_consents'
    AND indexname = 'idx_kevin_consents_scope'
  ) THEN
    CREATE INDEX "idx_kevin_consents_scope"
      ON "kevin_memory_consents" ("scope_type", "scope_id", "memory_type");
  END IF;
END $$;

-- ─── kevin_identity_links ─────────────────────────────────────────────────────
--
-- NOTE: This table is created now but NO link creation endpoints exist yet.
-- Cross-application identity linking is a Phase 13 feature and requires
-- explicit consent, revocation support, and auditing before activation.

CREATE TABLE IF NOT EXISTS "kevin_identity_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "global_subject_id" text,
  "application_id" text NOT NULL DEFAULT 'trainchat',
  "application_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "link_status" text NOT NULL DEFAULT 'pending',
  "link_method" text,
  "consent_status" text NOT NULL DEFAULT 'not_requested',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_identity_links'
    AND indexname = 'idx_kevin_links_user'
  ) THEN
    CREATE INDEX "idx_kevin_links_user"
      ON "kevin_identity_links" ("application_user_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'kevin_identity_links'
    AND indexname = 'idx_kevin_links_subject'
  ) THEN
    CREATE INDEX "idx_kevin_links_subject"
      ON "kevin_identity_links" ("global_subject_id");
  END IF;
END $$;
