/**
 * setup-trainchat-stripe-products.ts
 *
 * Creates the single TrainChat subscription product and price in Stripe.
 * Fully idempotent — safe to re-run at any time.
 *
 *   pnpm --filter @workspace/scripts run stripe:setup-products
 *
 * Behavior:
 *   - Creates the Product if missing (matched by metadata.trainchat_plan)
 *   - Creates a recurring monthly Price with lookup_key if missing
 *   - If a price with the lookup_key already exists, reuses it
 *   - Prints product ID, price ID, amount, and interval
 *
 * After running, copy the STRIPE_PRICE_TRAINCHAT_MONTHLY env var line printed
 * at the end into your Replit Secrets panel. The app also works via lookup
 * key alone, so this step is optional but recommended.
 */

import Stripe from "stripe";

const PRODUCT = {
  plan: "trainchat",
  name: "TrainChat",
  description: "AI performance coaching — unlimited conversations, adaptive training, long-term memory, and program evolution.",
  monthly: { amount: 4999, lookupKey: "trainchat_monthly" },
} as const;

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

  console.log(`── ${PRODUCT.name} ──`);

  // Find or create product
  let product: Stripe.Product;
  const existing = await stripe.products.search({
    query: `metadata["trainchat_plan"]:"${PRODUCT.plan}"`,
  });

  if (existing.data.length > 0) {
    product = existing.data[0];
    console.log(`  Product exists: ${product.name} (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: PRODUCT.name,
      description: PRODUCT.description,
      metadata: { trainchat_plan: PRODUCT.plan },
    });
    console.log(`  Created product: ${product.name} (${product.id})`);
  }

  // Find or create the monthly price
  const monthlyPrice = await getOrCreatePrice(
    stripe,
    product.id,
    PRODUCT.monthly.amount,
    "month",
    PRODUCT.monthly.lookupKey
  );

  // Print summary
  console.log("\n\n=== SETUP COMPLETE ===\n");
  console.log("Product and price are ready.\n");

  console.log("── Lookup Key (used automatically) ──");
  console.log(`  trainchat: ${PRODUCT.monthly.lookupKey}`);

  console.log("\n── Optional: Set this in Replit Secrets for env-var-based plan detection ──");
  console.log("   (The app works via lookup key without this, but setting it");
  console.log("    adds a fast local fallback in webhook handlers)\n");
  console.log(`  STRIPE_PRICE_TRAINCHAT_MONTHLY=${monthlyPrice.id}`);

  console.log("\n── Next Steps ──");
  console.log("  1. Copy the STRIPE_PRICE_TRAINCHAT_MONTHLY line above into Replit Secrets (optional but recommended)");
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
