/**
 * setup-trainchat-stripe-products.ts
 *
 * Creates the single TrainChat subscription product and price in Stripe,
 * and registers (or verifies) the webhook endpoint with the correct event list.
 * Fully idempotent — safe to re-run at any time.
 *
 *   pnpm --filter @workspace/scripts run stripe:setup-products
 *
 * What this script does:
 *   1. Creates the TrainChat Product if missing (matched by metadata.trainchat_plan)
 *   2. Creates a recurring monthly Price (lookup_key: trainchat_monthly) if missing
 *   3. Registers a Stripe webhook endpoint for the deployed backend if WEBHOOK_URL
 *      is provided (or detected from REPLIT_DOMAINS), otherwise prints the URL
 *   4. Prints all env vars to copy into Replit Secrets
 *
 * Required events handled by the webhook:
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   invoice.payment_succeeded
 *   invoice.payment_failed
 */

import Stripe from "stripe";

const PRODUCT = {
  plan: "trainchat",
  name: "TrainChat",
  description: "AI performance coaching — unlimited conversations, adaptive training, long-term memory, and program evolution.",
  monthly: { amount: 4999, lookupKey: "trainchat_monthly" },
} as const;

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const WEBHOOK_PATH = "/api/stripe/webhook";

// ─── Stripe client ─────────────────────────────────────────────────────────────

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

// ─── Product + Price setup ─────────────────────────────────────────────────────

async function getOrCreatePrice(
  stripe: Stripe,
  productId: string,
  amount: number,
  interval: "month" | "year",
  lookupKey: string
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(`    ↳ Price exists (${lookupKey}): ${price.id} — $${amount / 100}/${interval === "month" ? "mo" : "yr"}`);
    return price;
  }

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

// ─── Webhook endpoint setup ────────────────────────────────────────────────────
//
// Resolves the webhook URL in this order:
//   1. WEBHOOK_URL env var (explicit override)
//   2. REPLIT_DOMAINS env var (auto-detected in deployed Replit apps)
//   3. CLIENT_URL env var + /api/stripe/webhook
//   4. null (no auto-registration; script prints instructions instead)

function resolveWebhookUrl(): string | null {
  if (process.env.WEBHOOK_URL) {
    return process.env.WEBHOOK_URL.replace(/\/$/, "") + WEBHOOK_PATH;
  }
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    return `https://${domain}${WEBHOOK_PATH}`;
  }
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL.replace(/\/$/, "") + WEBHOOK_PATH;
  }
  return null;
}

async function setupWebhookEndpoint(stripe: Stripe, webhookUrl: string): Promise<string | null> {
  console.log(`\n── Webhook Endpoint ──`);
  console.log(`  URL: ${webhookUrl}`);

  // List existing webhook endpoints to check for a match
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === webhookUrl);

  if (existing) {
    console.log(`  ↳ Endpoint already registered: ${existing.id}`);

    // Check if all required events are enabled — update if not
    const missingEvents = WEBHOOK_EVENTS.filter(
      (ev) => !existing.enabled_events.includes(ev) && !existing.enabled_events.includes("*")
    );

    if (missingEvents.length > 0) {
      console.log(`  ↳ Missing events: ${missingEvents.join(", ")} — updating`);
      await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: WEBHOOK_EVENTS,
      });
      console.log(`  ↳ Events updated`);
    } else {
      console.log(`  ↳ All required events are enabled`);
    }

    // Note: Stripe does not expose the secret after creation.
    // If STRIPE_WEBHOOK_SECRET is not set, the user must retrieve it from the dashboard.
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.log(`\n  ⚠️  STRIPE_WEBHOOK_SECRET is not set.`);
      console.log(`     Go to Stripe Dashboard → Developers → Webhooks → ${existing.id}`);
      console.log(`     Click "Reveal" next to the signing secret and copy it to Replit Secrets.`);
    }

    return null; // Secret not available for existing endpoints
  }

  // Create new webhook endpoint
  const endpoint = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: "TrainChat production webhook",
  });

  console.log(`  ↳ Created endpoint: ${endpoint.id}`);
  console.log(`  ↳ Events: ${WEBHOOK_EVENTS.join(", ")}`);

  // The secret is only available at creation time
  const secret = (endpoint as any).secret as string | undefined;
  if (secret) {
    console.log(`\n  Signing secret (copy to Replit Secrets as STRIPE_WEBHOOK_SECRET):`);
    console.log(`    STRIPE_WEBHOOK_SECRET=${secret}`);
  }

  return secret ?? null;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== TrainChat Stripe Setup ===\n");

  let stripe: Stripe;
  try {
    stripe = await getStripeClient();
  } catch (err: any) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }

  console.log("Connected to Stripe.\n");

  // ── Product ──────────────────────────────────────────────────────────────────

  console.log(`── ${PRODUCT.name} Product ──`);
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

  // ── Price ─────────────────────────────────────────────────────────────────────

  const monthlyPrice = await getOrCreatePrice(
    stripe,
    product.id,
    PRODUCT.monthly.amount,
    "month",
    PRODUCT.monthly.lookupKey
  );

  // ── Webhook endpoint ──────────────────────────────────────────────────────────

  const webhookUrl = resolveWebhookUrl();
  let webhookSecret: string | null = null;

  if (webhookUrl) {
    webhookSecret = await setupWebhookEndpoint(stripe, webhookUrl);
  } else {
    console.log(`\n── Webhook Endpoint (manual setup required) ──`);
    console.log(`  Could not auto-detect your app's URL.`);
    console.log(`  Set WEBHOOK_URL, REPLIT_DOMAINS, or CLIENT_URL and re-run this script,`);
    console.log(`  OR register the endpoint manually in the Stripe Dashboard:`);
    console.log(`\n  Endpoint URL (replace <your-domain>):`);
    console.log(`    https://<your-domain>${WEBHOOK_PATH}`);
    console.log(`\n  Events to enable:`);
    WEBHOOK_EVENTS.forEach((ev) => console.log(`    ${ev}`));
  }

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log("\n\n=== SETUP COMPLETE ===\n");

  console.log("── Lookup Key ──");
  console.log(`  trainchat_monthly → ${monthlyPrice.id}`);

  console.log("\n── Copy these into Replit Secrets ──");
  console.log(`  STRIPE_PRICE_TRAINCHAT_MONTHLY=${monthlyPrice.id}`);
  if (webhookSecret) {
    console.log(`  STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  }

  console.log("\n── Required Secrets (must be set) ──");
  console.log("  STRIPE_SECRET_KEY           — your Stripe secret key");
  console.log("  STRIPE_WEBHOOK_SECRET       — signing secret for webhook signature validation");

  console.log("\n── Optional Secrets ──");
  console.log("  STRIPE_PRICE_TRAINCHAT_MONTHLY — fast local fallback (recommended)");
  console.log("  STRIPE_PUBLISHABLE_KEY         — for frontend Stripe.js (if used)");
  console.log("  CLIENT_URL                     — your app's base URL (e.g. https://trainchat.app)");
  console.log("  SENDGRID_API_KEY               — for payment confirmation emails");

  console.log("\n── Webhook endpoint ──");
  if (webhookUrl) {
    console.log(`  ${webhookUrl}`);
  } else {
    console.log("  https://<your-domain>/api/stripe/webhook");
  }

  console.log("\n── Events subscribed ──");
  WEBHOOK_EVENTS.forEach((ev) => console.log(`  ${ev}`));

  if (!webhookSecret && !process.env.STRIPE_WEBHOOK_SECRET) {
    console.log("\n⚠️  Remember to set STRIPE_WEBHOOK_SECRET in Replit Secrets.");
    console.log("   Without it, all webhook requests will be rejected (HTTP 400).");
    console.log("   Get it from Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret.");
  }

  console.log("");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
