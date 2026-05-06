/**
 * setup-trainchat-stripe-products.ts
 *
 * Creates TrainChat Stripe products and prices with lookup keys.
 * Fully idempotent — safe to re-run at any time.
 *
 *   pnpm --filter @workspace/scripts run stripe:setup-products
 *
 * Behavior:
 *   - Creates Products if missing (matched by metadata.trainchat_plan)
 *   - Creates recurring Prices with lookup_key if missing
 *   - If a price with the lookup_key already exists, reuses it
 *   - Prints product ID, price IDs, amounts, and intervals
 *
 * After running, copy the STRIPE_PRICE_* env var lines printed at the end
 * into your Replit Secrets panel. The app also works via lookup keys alone,
 * so this step is optional — but env vars enable plan detection in webhooks.
 */

import Stripe from "stripe";

const PLANS = [
  {
    plan: "starter",
    name: "TrainChat Starter",
    description: "AI coaching with 75 messages/month — full program building included.",
    monthly: { amount: 1900, lookupKey: "trainchat_starter_monthly" },
    yearly:  { amount: 18200, lookupKey: "trainchat_starter_yearly" },
  },
  {
    plan: "pro",
    name: "TrainChat Pro",
    description: "Unlimited AI coaching, adaptive training, long-term memory & program evolution.",
    monthly: { amount: 3900, lookupKey: "trainchat_pro_monthly" },
    yearly:  { amount: 37400, lookupKey: "trainchat_pro_yearly" },
  },
  {
    plan: "elite",
    name: "TrainChat Elite",
    description: "Everything in Pro + priority AI speed, advanced adaptation & early access features.",
    monthly: { amount: 7900, lookupKey: "trainchat_elite_monthly" },
    yearly:  { amount: 75800, lookupKey: "trainchat_elite_yearly" },
  },
] as const;

async function getStripeClient(): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    try {
      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set("include_secrets", "true");
      url.searchParams.set("connector_names", "stripe");
      url.searchParams.set("environment", "development");

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const secret = data.items?.[0]?.settings?.secret;
        if (secret) {
          console.log("  Using Stripe key from Replit connector");
          return new Stripe(secret, { apiVersion: "2024-06-20" as any });
        }
      }
    } catch {}
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) {
    console.log("  Using STRIPE_SECRET_KEY from environment");
    return new Stripe(envKey, { apiVersion: "2024-06-20" as any });
  }

  throw new Error(
    "Stripe API key not found. Connect the Stripe integration or set STRIPE_SECRET_KEY."
  );
}

async function getOrCreatePrice(
  stripe: Stripe,
  productId: string,
  amount: number,
  interval: "month" | "year",
  lookupKey: string
): Promise<Stripe.Price> {
  // Try to retrieve an existing price by lookup_key
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(`    ↳ Price exists (${lookupKey}): ${price.id} — $${amount / 100}/${interval === "month" ? "mo" : "yr"}`);
    return price;
  }

  // Create new price with lookup_key
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  });

  console.log(`    ↳ Created price (${lookupKey}): ${price.id} — $${amount / 100}/${interval === "month" ? "mo" : "yr"}`);
  return price;
}

async function main() {
  console.log("\n=== TrainChat Stripe Product Setup ===\n");

  let stripe: Stripe;
  try {
    stripe = await getStripeClient();
  } catch (err: any) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }

  console.log("Connected to Stripe.\n");

  const results: Array<{
    plan: string;
    productId: string;
    monthlyPriceId: string;
    monthlyLookupKey: string;
    yearlyPriceId: string;
    yearlyLookupKey: string;
  }> = [];

  for (const plan of PLANS) {
    console.log(`\n── ${plan.name} ──`);

    // Find or create product
    let product: Stripe.Product;
    const existing = await stripe.products.search({
      query: `metadata["trainchat_plan"]:"${plan.plan}"`,
    });

    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`  Product exists: ${product.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { trainchat_plan: plan.plan },
      });
      console.log(`  Created product: ${product.name} (${product.id})`);
    }

    // Find or create prices
    const monthlyPrice = await getOrCreatePrice(
      stripe,
      product.id,
      plan.monthly.amount,
      "month",
      plan.monthly.lookupKey
    );

    const yearlyPrice = await getOrCreatePrice(
      stripe,
      product.id,
      plan.yearly.amount,
      "year",
      plan.yearly.lookupKey
    );

    results.push({
      plan: plan.plan,
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      monthlyLookupKey: plan.monthly.lookupKey,
      yearlyPriceId: yearlyPrice.id,
      yearlyLookupKey: plan.yearly.lookupKey,
    });
  }

  // Print summary
  console.log("\n\n=== SETUP COMPLETE ===\n");
  console.log("All products and prices are ready.\n");

  console.log("── Lookup Keys (used automatically) ──");
  for (const r of results) {
    console.log(`  ${r.plan}: ${r.monthlyLookupKey}, ${r.yearlyLookupKey}`);
  }

  console.log("\n── Optional: Set these in Replit Secrets for env-var-based plan detection ──");
  console.log("   (The app works via lookup keys without these, but setting them");
  console.log("    adds a fast local fallback in webhook handlers)\n");
  for (const r of results) {
    const tier = r.plan.toUpperCase();
    console.log(`  STRIPE_PRICE_${tier}_MONTHLY=${r.monthlyPriceId}`);
    console.log(`  STRIPE_PRICE_${tier}_YEARLY=${r.yearlyPriceId}`);
  }

  console.log("\n── Next Steps ──");
  console.log("  1. Copy the STRIPE_PRICE_* lines above into Replit Secrets (optional but recommended)");
  console.log("  2. Set STRIPE_WEBHOOK_SECRET from your Stripe Dashboard webhook endpoint");
  console.log("  3. Set CLIENT_URL to your app's base URL");
  console.log("  4. Restart the API server");
  console.log("\n  Webhook endpoint to register in Stripe Dashboard:");
  console.log("    POST /api/stripe/webhook");
  console.log("\n  Events to enable:");
  console.log("    checkout.session.completed");
  console.log("    customer.subscription.created");
  console.log("    customer.subscription.updated");
  console.log("    customer.subscription.deleted");
  console.log("    invoice.paid");
  console.log("    invoice.payment_failed\n");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
