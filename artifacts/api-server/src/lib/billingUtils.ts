// ─── Billing Utility Functions ─────────────────────────────────────────────────
//
// Shared helpers for plan detection from Stripe price IDs.
// Used by both webhookHandlers.ts and stripe.ts (confirm endpoint).

import type { PlanTier, BillingInterval } from "@workspace/db";

// Stripe price IDs — created in the TrainChat Stripe account.
// Env vars take precedence if set; these are the live defaults.
const PRICE_IDS = {
  STARTER_MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "price_1TIYT5GOcsf8J09lKmI1806Q",
  STARTER_YEARLY:  process.env.STRIPE_PRICE_STARTER_YEARLY  ?? "price_1TIYT5GOcsf8J09l14kpf3zn",
  PRO_MONTHLY:     process.env.STRIPE_PRICE_PRO_MONTHLY     ?? "price_1TIYT6GOcsf8J09liwTgBS2B",
  PRO_YEARLY:      process.env.STRIPE_PRICE_PRO_YEARLY      ?? "price_1TIYT6GOcsf8J09lwEsSUGIB",
  ELITE_MONTHLY:   process.env.STRIPE_PRICE_ELITE_MONTHLY   ?? "price_1TIYT7GOcsf8J09l1wnaZMge",
  ELITE_YEARLY:    process.env.STRIPE_PRICE_ELITE_YEARLY    ?? "price_1TIYT7GOcsf8J09lOHjWItMD",
};

// Exported for use in the plan-map API endpoint
export const PLAN_PRICE_MAP = {
  starter: { monthly: PRICE_IDS.STARTER_MONTHLY, yearly: PRICE_IDS.STARTER_YEARLY },
  pro:     { monthly: PRICE_IDS.PRO_MONTHLY,     yearly: PRICE_IDS.PRO_YEARLY },
  elite:   { monthly: PRICE_IDS.ELITE_MONTHLY,   yearly: PRICE_IDS.ELITE_YEARLY },
} as const;

export function detectPlanInterval(priceId: string): { plan: PlanTier; billingInterval: BillingInterval } {
  const monthlyMap: Record<string, PlanTier> = {
    [PRICE_IDS.STARTER_MONTHLY]: "starter",
    [PRICE_IDS.PRO_MONTHLY]:     "pro",
    [PRICE_IDS.ELITE_MONTHLY]:   "elite",
  };
  const yearlyMap: Record<string, PlanTier> = {
    [PRICE_IDS.STARTER_YEARLY]: "starter",
    [PRICE_IDS.PRO_YEARLY]:     "pro",
    [PRICE_IDS.ELITE_YEARLY]:   "elite",
  };

  if (yearlyMap[priceId]) {
    return { plan: yearlyMap[priceId], billingInterval: "yearly" };
  }
  if (monthlyMap[priceId]) {
    return { plan: monthlyMap[priceId], billingInterval: "monthly" };
  }
  return { plan: "starter", billingInterval: "monthly" };
}
