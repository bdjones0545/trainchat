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
import { ensureStripeAccountsTable } from "./lib/stripeSchemaRepair";
import { getKevinConfig, assertKevinExportConfig } from "./lib/kevin-config";
import { seedKevinCapabilities } from "./lib/kevin-capability-service";
import { startKevinEventWorker, drainKevinEventWorker } from "./services/kevin-event-service";
import { startKevinOutcomeWorker, drainKevinOutcomeWorker } from "./services/kevin-outcome-service";
import { pool } from "@workspace/db";

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
    await ensureStripeAccountsTable();
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

// Reconciliation uses the application's users table and the raw Stripe SDK;
// it must remain available even if the optional StripeSync backfill is degraded.
startBillingReconciliation();

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
    // H1: fail closed at boot if a data-export feature is on without a salt.
    // This throws intentionally — a misconfigured export must stop the deploy,
    // not silently ship reversible pseudonyms.
    assertKevinExportConfig(kevinCfg);
    seedKevinCapabilities().catch((err: unknown) => {
      logger.warn({ err }, "[Kevin] Capability seed failed — will retry on next startup");
    });
    if (kevinCfg.eventDispatchEnabled) {
      startKevinEventWorker();
    }
    if (kevinCfg.outcomeForwardingEnabled) {
      startKevinOutcomeWorker();
    }
  }
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────
//
// On SIGTERM/SIGINT (normal deploys): stop accepting new connections, drain the
// in-flight Kevin worker ticks so no claimed row is orphaned mid-dispatch, close
// the DB pool, then exit. A hard timeout forces exit if any step hangs.
const SHUTDOWN_TIMEOUT_MS = 15_000;
let _shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info({ signal }, "[Process] Graceful shutdown starting");

  const forceExit = setTimeout(() => {
    logger.error("[Process] Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  if (forceExit.unref) forceExit.unref();

  // 1. Stop accepting new connections. Long-lived streams (SSE chat) are not
  //    awaited — they are cut when the process exits below, bounded by the
  //    force-exit timer.
  server.close(() => logger.info("[Process] HTTP server closed"));

  // 2. Drain Kevin workers — stop scheduling and await any in-flight tick so a
  //    claimed event/outcome is never abandoned in "processing".
  try {
    await Promise.all([drainKevinEventWorker(), drainKevinOutcomeWorker()]);
  } catch (err) {
    logger.warn({ err }, "[Process] Kevin worker drain error during shutdown");
  }

  // 3. Close DB resources (best-effort — the process is exiting).
  try {
    await pool.end();
  } catch (err) {
    logger.warn({ err }, "[Process] DB pool close error during shutdown");
  }

  clearTimeout(forceExit);
  logger.info("[Process] Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
