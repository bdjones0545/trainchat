import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import { validateBillingConfig } from "./lib/billingUtils";
import { startBillingReconciliation } from "./lib/billingReconciliation";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── TASK 3: Billing configuration validation ─────────────────────────────────
//
// Validate all required Stripe environment variables before starting the server.
// If any are missing, the process exits with a clear error message.
// This prevents silent billing misconfiguration in any environment.

try {
  validateBillingConfig();
} catch (err: any) {
  logger.error({ err }, "[Startup] Billing configuration is invalid — refusing to start");
  process.exit(1);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not found — skipping Stripe initialization");
    return;
  }

  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    logger.info("Stripe webhook configured");

    stripeSync.syncBackfill().then(() => {
      logger.info("Stripe data synced");
    }).catch((err) => {
      logger.error({ err }, "Stripe backfill error");
    });

    // ─── TASK 6: Start billing reconciliation job ─────────────────────────────
    //
    // Runs daily to find stale past_due users and sync their state from Stripe.
    // This is a backstop against webhook drift — ensures premium access is never
    // held indefinitely after a payment failure lifecycle concludes.
    startBillingReconciliation();
  } catch (err) {
    logger.warn({ err }, "Stripe initialization failed — payments unavailable");
  }
}

await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
