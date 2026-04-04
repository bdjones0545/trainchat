/**
 * seed-products.ts
 *
 * Creates TrainChat Stripe products + prices for all 3 tiers.
 * Run once after connecting Stripe in the Replit integration panel.
 *
 *   pnpm --filter @workspace/scripts run seed-products
 *
 * Safe to re-run — skips products that already exist (matched by metadata.plan).
 */

import Stripe from "stripe";

const PLANS = [
  {
    plan: "starter",
    name: "TrainChat Starter",
    description: "AI coaching with 75 messages/month — full program building included.",
    monthlyAmount: 1900,
    yearlyAmount: 18200,
  },
  {
    plan: "pro",
    name: "TrainChat Pro",
    description: "Unlimited AI coaching, adaptive training, long-term memory & program evolution.",
    monthlyAmount: 3900,
    yearlyAmount: 37400,
  },
  {
    plan: "elite",
    name: "TrainChat Elite",
    description: "Everything in Pro + priority AI speed, advanced adaptation & early access features.",
    monthlyAmount: 7900,
    yearlyAmount: 75800,
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
        if (secret) return new Stripe(secret, { apiVersion: "2025-08-27.basil" as any });
      }
    } catch {}
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) return new Stripe(envKey, { apiVersion: "2025-08-27.basil" as any });

  throw new Error(
    "Stripe API key not found. Connect the Stripe integration or set STRIPE_SECRET_KEY."
  );
}

async function main() {
  const stripe = await getStripeClient();
  console.log("Connected to Stripe. Seeding products...\n");

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `metadata["trainchat_plan"]:"${plan.plan}"`,
    });

    let product: Stripe.Product;

    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`✓ Product already exists: ${product.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { trainchat_plan: plan.plan },
      });
      console.log(`✓ Created product: ${product.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const hasMonthly = prices.data.some((p) => p.recurring?.interval === "month");
    const hasYearly = prices.data.some((p) => p.recurring?.interval === "year");

    if (!hasMonthly) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyAmount,
        currency: "usd",
        recurring: { interval: "month" },
      });
      console.log(`  → Monthly price: $${plan.monthlyAmount / 100}/mo (${price.id})`);
    } else {
      const monthly = prices.data.find((p) => p.recurring?.interval === "month");
      console.log(`  → Monthly price already exists (${monthly?.id})`);
    }

    if (!hasYearly) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyAmount,
        currency: "usd",
        recurring: { interval: "year" },
      });
      console.log(`  → Yearly price: $${plan.yearlyAmount / 100}/yr (${price.id})`);
    } else {
      const yearly = prices.data.find((p) => p.recurring?.interval === "year");
      console.log(`  → Yearly price already exists (${yearly?.id})`);
    }

    console.log();
  }

  console.log("Done. Products and prices are ready in Stripe.");
  console.log(
    "\nNext step: In your Stripe dashboard, configure a webhook pointing to:"
  );
  console.log("  POST /api/stripe/webhook");
  console.log(
    "\nEvents to enable: customer.subscription.created, customer.subscription.updated,"
  );
  console.log("  customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed\n"
  );
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
