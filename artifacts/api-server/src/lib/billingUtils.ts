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

// ─── Startup validation ────────────────────────────────────────────────────────
//
// STRIPE_SECRET_KEY is required — without it, no Stripe calls can be made.
//
// STRIPE_PRICE_* env vars are OPTIONAL. They provide a local fallback for
// webhook plan detection, but the primary mechanism is price lookup_keys set
// by the stripe:setup-products script. The app starts and operates correctly
// without them as long as prices have lookup_keys.
//
// To set env vars, run: pnpm --filter @workspace/scripts run stripe:setup-products
// and copy the STRIPE_PRICE_* lines printed at the end into Replit Secrets.

const REQUIRED_STRIPE_ENV_VARS: string[] = [
  "STRIPE_SECRET_KEY",
];

const OPTIONAL_STRIPE_ENV_VARS: string[] = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_ELITE_MONTHLY",
  "STRIPE_PRICE_ELITE_YEARLY",
];

export function validateBillingConfig(): void {
  const missing = REQUIRED_STRIPE_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const message =
      `[BillingConfig] FATAL: Missing required Stripe environment variables:\n` +
      missing.map((k) => `  - ${k}`).join("\n") +
      `\nSet these in the Secrets panel before starting the server.`;
    logger.error({ missing }, message);
    throw new Error(message);
  }

  // Warn about missing optional price ID env vars (not fatal)
  const missingOptional = OPTIONAL_STRIPE_ENV_VARS.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    logger.warn(
      { missingOptional },
      "[BillingConfig] Optional Stripe price ID env vars not set. " +
      "Webhook plan detection will rely on price lookup_keys. " +
      "Run stripe:setup-products and copy the STRIPE_PRICE_* lines to Replit Secrets to add the fallback."
    );
  } else {
    logger.info("[BillingConfig] All Stripe environment variables are present");
  }
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
