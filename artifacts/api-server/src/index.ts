// Sentry MUST be the first import. It instruments Node.js module loading via
// OpenTelemetry; importing it after Express or other dependencies would miss
// automatic HTTP and database instrumentation.
import { Sentry, sentryEnabled } from "./lib/sentry";

import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import { validateBillingConfig } from "./lib/billingUtils";
import { startBillingReconciliation } from "./lib/billingReconciliation";
import { seedExerciseLibraryIfEmpty } from "./lib/exercise-seeder";
import { seedCoachingKnowledgeIfEmpty } from "./lib/coaching-knowledge-seeder";
import { seedWhitepaperPublicationsIfMissing } from "./lib/whitepaper-publications-seeder";
import { runExternalMaterializationReadinessCheck } from "./lib/external-materialization";
import { runSubscriptionSelfHeal } from "./lib/subscriptionSelfHeal";
import { getKevinConfig } from "./lib/kevin-config";
import { seedKevinCapabilities } from "./lib/kevin-capability-service";
import { startKevinEventWorker, stopKevinEventWorker } from "./services/kevin-event-service";

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

// ─── Process-level exception handlers ────────────────────────────────────────
//
// Node.js does not propagate unhandled exceptions or rejections through Express
// error middleware. Without these handlers, a thrown error in an async startup
// task or a rejected Promise crashes the process silently in some environments.

process.on("uncaughtException", (err) => {
  logger.error({ err }, "[Process] Uncaught exception — shutting down");
  if (sentryEnabled) Sentry.captureException(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[Process] Unhandled promise rejection");
  if (sentryEnabled) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  // Do not exit — unhandled rejections in background jobs should not crash the server
});

// ─── TASK 3: Billing configuration validation ─────────────────────────────────
//
// Validate all required Stripe environment variables before starting the server.
// If any are missing, the process exits with a clear error message.
// This prevents silent billing misconfiguration in any environment.

try {
  validateBillingConfig();
} catch (err: any) {
  logger.error({ err }, "[Startup] Billing configuration is invalid — STRIPE_SECRET_KEY is required");
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
    }).catch((err: unknown) => {
      logger.error({ err }, "Stripe backfill error");
    });

    // ─── TASK 6: Start billing reconciliation job ─────────────────────────────
    //
    // Runs daily to find stale past_due users and sync their state from Stripe.
    // This is a backstop against webhook drift — ensures premium access is never
    // held indefinitely after a payment failure lifecycle concludes.
    startBillingReconciliation();
  } catch (err: any) {
    // ── IMPORTANT: This catch covers the findOrCreateManagedWebhook failure ──
    //
    // Known failure mode: "stripe.accounts does not exist" — migration 0046 from
    // stripe-replit-sync did not complete because its FK-cascade step failed on
    // existing data in the production DB.
    //
    // Consequences:
    //   - Managed webhook was NOT registered with Stripe
    //   - StripeSync data sync will not run
    //   - BUT: webhooks can still be processed by /api/stripe/webhook because
    //     WebhookHandlers.processWebhook now uses raw Stripe SDK signature
    //     verification (Layer 1a) which does NOT depend on stripe.accounts
    //   - Subscription self-heal will still run below to fix any orphaned users
    //
    // Resolution: Re-initialize the Stripe integration (stripe-replit-sync
    // migrations will re-run and create stripe.accounts).
    logger.error(
      { err: err?.message ?? String(err) },
      "Stripe initialization FAILED — managed webhook not registered. " +
      "Webhook delivery will rely on STRIPE_WEBHOOK_SECRET direct verification. " +
      "Fix: ensure stripe-replit-sync migration 0046 (stripe.accounts) has run in production. " +
      "Payments and plan upgrades will still process correctly via the raw SDK webhook path."
    );
  }
}

await initStripe();

// ─── Subscription self-heal ───────────────────────────────────────────────────
//
// Detects users who have a Stripe customer ID but no subscription synced —
// the classic "webhook was never processed" scenario (e.g. stripe.accounts
// was missing when the checkout.session.completed event arrived).
//
// Runs after initStripe so any DB schema setup has completed first.
// Best-effort: errors are logged but never crash the server.
runSubscriptionSelfHeal().catch((err: unknown) => {
  logger.error({ err }, "[Startup] Subscription self-heal threw unexpectedly");
});

await seedExerciseLibraryIfEmpty();
await seedCoachingKnowledgeIfEmpty();
await seedWhitepaperPublicationsIfMissing();

// Phase 2.7: best-effort, non-fatal — warn if the external materialization/
// surgical flags could be active but migration 0002 hasn't been applied.
runExternalMaterializationReadinessCheck().catch(() => {});

// ─── Kevin integration startup ─────────────────────────────────────────────
//
// 1. Seed default capability rows (idempotent) so admin diagnostics work.
// 2. Start the event dispatch worker if KEVIN_EVENT_DISPATCH_ENABLED=true.
//
// Both are best-effort: failures are logged but never crash the server.
// Kevin being unavailable must NEVER stop TrainChat from operating.
{
  const kevinCfg = getKevinConfig();
  if (kevinCfg.integrationEnabled) {
    seedKevinCapabilities().catch((err: unknown) => {
      logger.warn({ err }, "[Kevin] Capability seed failed — will retry on next startup");
    });
    if (kevinCfg.eventDispatchEnabled) {
      startKevinEventWorker();
    }
  }
}

// Graceful shutdown — stops Kevin event worker cleanly before process exits
process.on("SIGTERM", () => {
  logger.info("[Process] SIGTERM received — stopping Kevin event worker");
  stopKevinEventWorker();
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
