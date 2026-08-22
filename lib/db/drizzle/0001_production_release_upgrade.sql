-- REHEARSAL CANDIDATE ONLY.
--
-- This additive migration upgrades a populated database that already represents
-- the pre-release TrainChat schema. It must run only after 0000_current_schema
-- has been recorded as represented by the existing schema. Never run 0000
-- itself against a populated database.
--
-- Drizzle wraps the migration sequence in a transaction. Preflight must prove
-- that any existing partial objects are compatible before this file is run.

CREATE TABLE IF NOT EXISTS "chat_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_turn_id" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"response_payload" text,
	"quota_charged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "account_deletion_status" text,
	ADD COLUMN IF NOT EXISTS "account_deletion_requested_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "account_deletion_error" text;
--> statement-breakpoint
ALTER TABLE "external_programs"
	ADD COLUMN IF NOT EXISTS "training_system_id" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "external_programs" p
		LEFT JOIN "training_systems" s ON s."id" = p."training_system_id"
		WHERE p."training_system_id" IS NOT NULL AND s."id" IS NULL
	) THEN
		RAISE EXCEPTION 'external_programs.training_system_id contains orphan references';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'chat_turns_conversation_id_conversations_id_fk'
			AND conrelid = 'public.chat_turns'::regclass
	) THEN
		ALTER TABLE "chat_turns"
			ADD CONSTRAINT "chat_turns_conversation_id_conversations_id_fk"
			FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'chat_turns_user_id_users_id_fk'
			AND conrelid = 'public.chat_turns'::regclass
	) THEN
		ALTER TABLE "chat_turns"
			ADD CONSTRAINT "chat_turns_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'external_programs_training_system_id_training_systems_id_fk'
			AND conrelid = 'public.external_programs'::regclass
	) THEN
		ALTER TABLE "external_programs"
			ADD CONSTRAINT "external_programs_training_system_id_training_systems_id_fk"
			FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id")
			ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_turns_conversation_client_turn"
	ON "chat_turns" USING btree ("conversation_id", "client_turn_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counters_key_window_start_pk" PRIMARY KEY("key", "window_start")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_counters_expires_at_idx"
	ON "rate_limit_counters" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "kevin_app_events"
	ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kevin_events_processing"
	ON "kevin_app_events" USING btree ("status", "processing_started_at");
--> statement-breakpoint
ALTER TABLE "kevin_training_outcomes"
	ADD COLUMN IF NOT EXISTS "idempotency_key" text,
	ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "kevin_training_outcomes"
SET "idempotency_key" = 'trainchat:legacy:kevin_training_outcome:' || "id"::text
WHERE "idempotency_key" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "kevin_training_outcomes"
		WHERE "idempotency_key" IS NULL
	) THEN
		RAISE EXCEPTION 'kevin_training_outcomes.idempotency_key contains nulls after backfill';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "kevin_training_outcomes"
		GROUP BY "idempotency_key"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'kevin_training_outcomes.idempotency_key contains duplicates';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "kevin_training_outcomes"
	ALTER COLUMN "idempotency_key" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_kevin_outcomes_idempotency"
	ON "kevin_training_outcomes" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kevin_outcomes_processing"
	ON "kevin_training_outcomes" USING btree ("forward_status", "processing_started_at");
