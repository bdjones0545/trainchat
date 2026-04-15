// ─── Billing Utility Functions ─────────────────────────────────────────────────
//
// Shared helpers for plan detection from Stripe price IDs.
// Used by both webhookHandlers.ts and stripe.ts (confirm endpoint).
//
// TASK 3: All price IDs are read exclusively from environment variables.
// There are NO hardcoded fallback live price IDs.
// If env vars are missing, validateBillingConfig() will throw at startup.

import type { PlanTier, BillingInterval } from "@workspace/db";
import { logger } from "./logger";

// ─── Price ID resolution ───────────────────────────────────────────────────────
//
// Reads from env vars only. Empty string means the var is not set.
// validateBillingConfig() must be called at startup to catch missing values.

const PRICE_IDS = {
  STARTER_MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
  STARTER_YEARLY:  process.env.STRIPE_PRICE_STARTER_YEARLY  ?? "",
  PRO_MONTHLY:     process.env.STRIPE_PRICE_PRO_MONTHLY     ?? "",
  PRO_YEARLY:      process.env.STRIPE_PRICE_PRO_YEARLY      ?? "",
  ELITE_MONTHLY:   process.env.STRIPE_PRICE_ELITE_MONTHLY   ?? "",
  ELITE_YEARLY:    process.env.STRIPE_PRICE_ELITE_YEARLY    ?? "",
};

// Exported for use in the plan-map API endpoint and webhook handlers
export const PLAN_PRICE_MAP = {
  starter: { monthly: PRICE_IDS.STARTER_MONTHLY, yearly: PRICE_IDS.STARTER_YEARLY },
  pro:     { monthly: PRICE_IDS.PRO_MONTHLY,     yearly: PRICE_IDS.PRO_YEARLY },
  elite:   { monthly: PRICE_IDS.ELITE_MONTHLY,   yearly: PRICE_IDS.ELITE_YEARLY },
} as const;

// ─── TASK 3: Startup validation ───────────────────────────────────────────────
//
// Call this at server startup. Throws if any required Stripe env var is absent.
// This prevents the app from running with missing billing configuration,
// which would cause silent plan mismatches or checkout failures.

// Note: STRIPE_WEBHOOK_SECRET is intentionally excluded — it is managed
// internally by the stripe-replit-sync library (via findOrCreateManagedWebhook).
// If you are using a custom webhook endpoint outside of stripe-replit-sync,
// add STRIPE_WEBHOOK_SECRET back to this list.
const REQUIRED_STRIPE_ENV_VARS: string[] = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_ELITE_MONTHLY",
  "STRIPE_PRICE_ELITE_YEARLY",
];

export function validateBillingConfig(): void {
  const missing = REQUIRED_STRIPE_ENV_VARS.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    const message =
      `[BillingConfig] FATAL: Missing required Stripe environment variables:\n` +
      missing.map((k) => `  - ${k}`).join("\n") +
      `\nSet these in the Secrets panel before starting the server. ` +
      `The server will NOT start with missing billing configuration.`;
    logger.error({ missing }, message);
    throw new Error(message);
  }

  logger.info("[BillingConfig] All required Stripe environment variables are present");
}

// ─── TASK 4: detectPlanInterval — fail loudly on unknown price IDs ─────────────
//
// If the price ID is not in the known map, throw rather than silently falling
// back to a default plan. This surfaces misconfiguration immediately.

export function detectPlanInterval(priceId: string): { plan: PlanTier; billingInterval: BillingInterval } {
  const monthlyMap: Record<string, PlanTier> = {};
  const yearlyMap: Record<string, PlanTier> = {};

  if (PRICE_IDS.STARTER_MONTHLY) monthlyMap[PRICE_IDS.STARTER_MONTHLY] = "starter";
  if (PRICE_IDS.PRO_MONTHLY)     monthlyMap[PRICE_IDS.PRO_MONTHLY]     = "pro";
  if (PRICE_IDS.ELITE_MONTHLY)   monthlyMap[PRICE_IDS.ELITE_MONTHLY]   = "elite";
  if (PRICE_IDS.STARTER_YEARLY)  yearlyMap[PRICE_IDS.STARTER_YEARLY]   = "starter";
  if (PRICE_IDS.PRO_YEARLY)      yearlyMap[PRICE_IDS.PRO_YEARLY]       = "pro";
  if (PRICE_IDS.ELITE_YEARLY)    yearlyMap[PRICE_IDS.ELITE_YEARLY]     = "elite";

  if (yearlyMap[priceId]) {
    return { plan: yearlyMap[priceId], billingInterval: "yearly" };
  }
  if (monthlyMap[priceId]) {
    return { plan: monthlyMap[priceId], billingInterval: "monthly" };
  }

  // TASK 4: Unknown price ID — do not silently default
  logger.error(
    { priceId, knownMonthlyIds: Object.keys(monthlyMap), knownYearlyIds: Object.keys(yearlyMap) },
    "[BillingUtils] UNKNOWN PRICE ID — cannot determine plan or interval. " +
    "Check STRIPE_PRICE_* env vars. This is a billing misconfiguration."
  );
  throw new Error(
    `Unknown Stripe price ID: "${priceId}". ` +
    "Set the correct STRIPE_PRICE_* environment variables."
  );
}
