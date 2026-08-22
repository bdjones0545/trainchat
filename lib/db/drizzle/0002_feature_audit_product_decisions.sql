-- Feature-audit product decisions. Additive and safe for existing rows.
-- Null coaching settings mean the account has not made explicit choices;
-- application defaults are resolved at read time rather than invented here.
ALTER TABLE "users" ADD COLUMN "coaching_settings" jsonb;
--> statement-breakpoint
-- Existing programs remain current. The false default/backfill is deliberate:
-- only later application behavior may mark a program as needing review.
ALTER TABLE "training_systems" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_systems" ADD COLUMN "review_reasons" jsonb;
--> statement-breakpoint
ALTER TABLE "training_systems" ADD COLUMN "marked_needs_review_at" timestamp with time zone;
