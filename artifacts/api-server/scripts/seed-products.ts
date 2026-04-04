#!/usr/bin/env tsx
/**
 * Seed Stripe Products & Prices for TrainChat
 *
 * Run after connecting the Stripe integration:
 *   pnpm --filter @workspace/api-server run seed:products
 *
 * Idempotent — skips creation if products with matching metadata already exist.
 */

import "../src/lib/stripeClient";
import { getUncachableStripeClient } from "../src/lib/stripeClient";

interface ProductSeed {
  key: string;
  name: string;
  description: string;
  monthlyAmount: number;
  yearlyAmount: number;
}

const PRODUCTS: ProductSeed[] = [
  {
    key: "starter",
    name: "TrainChat Starter",
    description: "AI coaching with 75 messages/month and full program building.",
    monthlyAmount: 1900,
    yearlyAmount: 18200,
  },
  {
    key: "pro",
    name: "TrainChat Pro",
    description: "Unlimited coaching, adaptive training, long-term memory, and session logging.",
    monthlyAmount: 3900,
    yearlyAmount: 37400,
  },
  {
    key: "elite",
    name: "TrainChat Elite",
    description: "Maximum performance mode with priority AI, advanced adaptation, and early access.",
    monthlyAmount: 7900,
    yearlyAmount: 75800,
  },
];

async function main() {
  const stripe = await getUncachableStripeClient();

  for (const seed of PRODUCTS) {
    const existing = await stripe.products.search({
      query: `metadata["trainchat_plan"]:"${seed.key}"`,
    });

    let productId: string;

    if (existing.data.length > 0) {
      productId = existing.data[0].id;
      console.log(`[skip] Product already exists: ${seed.name} (${productId})`);
    } else {
      const product = await stripe.products.create({
        name: seed.name,
        description: seed.description,
        metadata: { trainchat_plan: seed.key },
      });
      productId = product.id;
      console.log(`[create] Product: ${seed.name} (${productId})`);
    }

    const existingPrices = await stripe.prices.list({
      product: productId,
      active: true,
    });

    const hasMonthly = existingPrices.data.some(
      (p) => p.recurring?.interval === "month" && p.unit_amount === seed.monthlyAmount
    );
    const hasYearly = existingPrices.data.some(
      (p) => p.recurring?.interval === "year" && p.unit_amount === seed.yearlyAmount
    );

    if (!hasMonthly) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: seed.monthlyAmount,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { trainchat_plan: seed.key, billing: "monthly" },
      });
      console.log(`  [create] Monthly price: $${seed.monthlyAmount / 100}/mo (${price.id})`);
    } else {
      console.log(`  [skip] Monthly price already exists`);
    }

    if (!hasYearly) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: seed.yearlyAmount,
        currency: "usd",
        recurring: { interval: "year" },
        metadata: { trainchat_plan: seed.key, billing: "yearly" },
      });
      console.log(`  [create] Yearly price: $${seed.yearlyAmount / 100}/yr (${price.id})`);
    } else {
      console.log(`  [skip] Yearly price already exists`);
    }
  }

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
