import Stripe from "stripe";
import { logger } from "./logger";

// ─── Stripe credentials from environment secrets ──────────────────────────────
//
// Reads STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY directly from environment.
// Set these in the Secrets panel — no integration connector required.

function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it in the Secrets panel."
    );
  }
  return key;
}

// ─── TASK 5: Pinned Stripe API version ───────────────────────────────────────
//
// Explicitly pinned to a known stable Stripe API version.
// Do not use unrecognized or future-dated version strings.
// Update this intentionally when upgrading Stripe SDK or API behavior.

const STRIPE_API_VERSION = "2024-06-20" as Stripe.LatestApiVersion;

// Stripe client is created fresh each call — avoids stale credentials.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = getSecretKey();
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export async function getStripePublishableKey(): Promise<string> {
  return process.env.STRIPE_PUBLISHABLE_KEY ?? "";
}

export async function getStripeSecretKey(): Promise<string> {
  return getSecretKey();
}

// ─── StripeSync singleton ─────────────────────────────────────────────────────

let _stripeSync: any = null;

export async function getStripeSync(): Promise<any> {
  if (_stripeSync) return _stripeSync;

  const { StripeSync } = await import("stripe-replit-sync");
  const secretKey = getSecretKey();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  _stripeSync = new StripeSync({
    stripeSecretKey: secretKey,
    poolConfig: { connectionString: databaseUrl, max: 2 },
  });

  logger.info("[StripeClient] StripeSync initialized");
  return _stripeSync;
}
