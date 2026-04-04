// ─── Billing Utility Functions ─────────────────────────────────────────────────
//
// Shared helpers for plan detection from Stripe price IDs.
// Used by both webhookHandlers.ts and stripe.ts (confirm endpoint).

import type { PlanTier, BillingInterval } from "@workspace/db";

export function detectPlanInterval(priceId: string): { plan: PlanTier; billingInterval: BillingInterval } {
  const monthlyMap: Record<string, PlanTier> = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY ?? ""]: "starter",
    [process.env.STRIPE_PRICE_PRO_MONTHLY ?? ""]: "pro",
    [process.env.STRIPE_PRICE_ELITE_MONTHLY ?? ""]: "elite",
  };
  const yearlyMap: Record<string, PlanTier> = {
    [process.env.STRIPE_PRICE_STARTER_YEARLY ?? ""]: "starter",
    [process.env.STRIPE_PRICE_PRO_YEARLY ?? ""]: "pro",
    [process.env.STRIPE_PRICE_ELITE_YEARLY ?? ""]: "elite",
  };

  if (yearlyMap[priceId]) {
    return { plan: yearlyMap[priceId], billingInterval: "yearly" };
  }
  if (monthlyMap[priceId]) {
    return { plan: monthlyMap[priceId], billingInterval: "monthly" };
  }
  return { plan: "starter", billingInterval: "monthly" };
}
