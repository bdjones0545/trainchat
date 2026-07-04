-- 0003: shared rate-limit counters (audit F10 — autoscale-safe rate limiting)
-- Apply with: psql "$DATABASE_URL" -f lib/db/manual-migrations/0003_rate_limit_counters.sql
-- (or `pnpm --filter db push`, which derives the same table from the Drizzle schema)

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "rate_limit_counters_key_window_start_pk" PRIMARY KEY ("key", "window_start")
);

CREATE INDEX IF NOT EXISTS "rate_limit_counters_expires_at_idx"
  ON "rate_limit_counters" ("expires_at");
