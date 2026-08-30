import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Repair a partially-applied stripe-replit-sync 0046 migration.
 *
 * Some existing Replit databases record the migration while missing the
 * stripe.accounts relation. Creating the relation is additive and idempotent;
 * the package migration and subsequent backfill remain authoritative.
 */
export async function ensureStripeAccountsTable(): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS stripe;

    CREATE TABLE IF NOT EXISTS stripe.accounts (
      id TEXT PRIMARY KEY,
      raw_data JSONB NOT NULL,
      first_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      business_name TEXT GENERATED ALWAYS AS ((raw_data->'business_profile'->>'name')::text) STORED,
      email TEXT GENERATED ALWAYS AS ((raw_data->>'email')::text) STORED,
      type TEXT GENERATED ALWAYS AS ((raw_data->>'type')::text) STORED,
      charges_enabled BOOLEAN GENERATED ALWAYS AS ((raw_data->>'charges_enabled')::boolean) STORED,
      payouts_enabled BOOLEAN GENERATED ALWAYS AS ((raw_data->>'payouts_enabled')::boolean) STORED,
      details_submitted BOOLEAN GENERATED ALWAYS AS ((raw_data->>'details_submitted')::boolean) STORED,
      country TEXT GENERATED ALWAYS AS ((raw_data->>'country')::text) STORED,
      default_currency TEXT GENERATED ALWAYS AS ((raw_data->>'default_currency')::text) STORED,
      created INTEGER GENERATED ALWAYS AS ((raw_data->>'created')::integer) STORED
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_business_name
      ON stripe.accounts (business_name);
  `);

  logger.info("[StripeSchema] stripe.accounts relation verified");
}
