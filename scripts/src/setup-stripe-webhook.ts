import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not set");
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
const domain = domains[0];
if (!domain) {
  console.error("REPLIT_DOMAINS is not set");
  process.exit(1);
}

const webhookUrl = `https://${domain}/api/stripe/webhook`;

const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

async function createWebhook() {
  const webhook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: EVENTS,
    description: "TrainChat production webhook",
  });
  console.log(`\n  ✓ Created: ${webhook.id}`);
  console.log(`  Status:   ${webhook.status}`);
  console.log(`\n  ══════════════════════════════════════════════════════`);
  console.log(`  STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
  console.log(`  ══════════════════════════════════════════════════════`);
  console.log(`\n  Add the line above to Replit Secrets, then restart the API server.\n`);
}

async function run() {
  console.log(`\n=== TrainChat Stripe Webhook Setup ===\n`);
  console.log(`  Target URL: ${webhookUrl}`);

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((w) => w.url === webhookUrl);

  if (match) {
    // Delete and recreate so we can surface the signing secret
    console.log(`\n  Existing webhook found (${match.id}) — deleting and recreating to obtain signing secret...`);
    await stripe.webhookEndpoints.del(match.id);
    console.log(`  Deleted ${match.id}`);
  }

  await createWebhook();

  console.log(`  Enabled events:`);
  for (const e of EVENTS) console.log(`    • ${e}`);
  console.log(`\n=== DONE ===\n`);
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
