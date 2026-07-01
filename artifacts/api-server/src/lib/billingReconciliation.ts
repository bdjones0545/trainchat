// ─── Billing Reconciliation Job ────────────────────────────────────────────────
//
// TASK 6: Grace-period / dunning reconciliation backstop.
//
// This job runs daily and finds users whose planStatus is "past_due" AND whose
// currentPeriodEnd is more than DUNNING_THRESHOLD_DAYS in the past.
//
// For those users, it queries Stripe for the live subscription state and syncs
// it authoritatively. This prevents indefinite premium access due to webhook
// drift during the dunning lifecycle.
//
// This is a backstop — not a replacement for correct webhook handling.
// If webhooks are working correctly, this job should never need to take action.

import { db, usersTable } from "@workspace/db";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";
import { stripeStorage } from "./stripeStorage";
import { buildSyncPayload, normalizePlanStatus } from "./webhookHandlers";
import { logger } from "./logger";
import { captureWithTags } from "./sentry";

// How many days past currentPeriodEnd before we force-reconcile a past_due user.
// Default: 14 days — aligns with Stripe's maximum smart retry window.
const DUNNING_THRESHOLD_DAYS = parseInt(
  process.env.BILLING_RECONCILIATION_THRESHOLD_DAYS ?? "14",
  10
);

// How often the job runs in milliseconds. Default: every 24 hours.
const RECONCILIATION_INTERVAL_MS = parseInt(
  process.env.BILLING_RECONCILIATION_INTERVAL_MS ?? String(24 * 60 * 60 * 1000),
  10
);

async function reconcileStalePastDueUsers(): Promise<void> {
  logger.info("[BillingReconciliation] Starting daily reconciliation run");

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - DUNNING_THRESHOLD_DAYS);

  // Find users: past_due + has a subscription + currentPeriodEnd is stale
  let staleUsers: typeof usersTable.$inferSelect[];
  try {
    staleUsers = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.planStatus, "past_due"),
          isNotNull(usersTable.stripeSubscriptionId),
          lt(usersTable.currentPeriodEnd, thresholdDate)
        )
      );
  } catch (err) {
    logger.error({ err }, "[BillingReconciliation] DB query failed — skipping run");
    captureWithTags(err, { subsystem: "billing_reconciliation", feature: "db_query" });
    return;
  }

  if (staleUsers.length === 0) {
    logger.info("[BillingReconciliation] No stale past_due users found — billing state is clean");
    return;
  }

  logger.warn(
    { count: staleUsers.length, thresholdDays: DUNNING_THRESHOLD_DAYS },
    "[BillingReconciliation] Found stale past_due users — querying Stripe for live state"
  );

  const stripe = await getUncachableStripeClient();

  for (const user of staleUsers) {
    const subscriptionId = user.stripeSubscriptionId!;
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });

      logger.info(
        { userId: user.id, subscriptionId, stripeStatus: sub.status },
        "[BillingReconciliation] Stripe subscription status retrieved"
      );

      if (sub.status === "canceled") {
        // Subscription is fully canceled — revoke access immediately
        await stripeStorage.revokeUserSubscription(user.id);
        logger.warn(
          { userId: user.id, subscriptionId },
          "[BillingReconciliation] Revoked access — Stripe subscription is canceled"
        );
      } else {
        // Sync the full subscription payload for all other states
        // buildSyncPayload fetches from Stripe API as fallback for unknown prices
        const payload = await buildSyncPayload(sub);
        if (payload) {
          await stripeStorage.syncUserSubscription(user.id, payload);
          logger.info(
            { userId: user.id, plan: payload.plan, planStatus: payload.planStatus },
            "[BillingReconciliation] Full subscription sync applied"
          );
        }
      }
    } catch (err: any) {
      // If the subscription no longer exists in Stripe, revoke access
      if (err?.statusCode === 404 || err?.code === "resource_missing") {
        logger.warn(
          { userId: user.id, subscriptionId },
          "[BillingReconciliation] Subscription not found in Stripe — revoking access"
        );
        try {
          await stripeStorage.revokeUserSubscription(user.id);
        } catch (revokeErr) {
          logger.error({ revokeErr, userId: user.id }, "[BillingReconciliation] Failed to revoke missing subscription");
          captureWithTags(revokeErr, { subsystem: "billing_reconciliation", feature: "revoke_subscription" });
        }
      } else {
        // Log other errors but continue processing remaining users
        logger.error(
          { err, userId: user.id, subscriptionId },
          "[BillingReconciliation] Failed to reconcile user — will retry next run"
        );
        captureWithTags(err, { subsystem: "billing_reconciliation", feature: "stripe_sync" });
      }
    }
  }

  logger.info("[BillingReconciliation] Daily reconciliation run complete");
}

let _reconciliationTimer: ReturnType<typeof setInterval> | null = null;

export function startBillingReconciliation(): void {
  if (_reconciliationTimer) {
    logger.warn("[BillingReconciliation] Reconciliation already running — skipping start");
    return;
  }

  logger.info(
    { intervalMs: RECONCILIATION_INTERVAL_MS, thresholdDays: DUNNING_THRESHOLD_DAYS },
    "[BillingReconciliation] Starting reconciliation job"
  );

  // Run once immediately at startup (with a short delay to let the DB settle)
  setTimeout(() => {
    reconcileStalePastDueUsers().catch((err) => {
      logger.error({ err }, "[BillingReconciliation] Initial run failed");
      captureWithTags(err, { subsystem: "billing_reconciliation", feature: "initial_run" });
    });
  }, 30_000); // 30-second delay on startup

  // Then run on the configured interval
  _reconciliationTimer = setInterval(() => {
    reconcileStalePastDueUsers().catch((err) => {
      logger.error({ err }, "[BillingReconciliation] Scheduled run failed");
      captureWithTags(err, { subsystem: "billing_reconciliation", feature: "scheduled_run" });
    });
  }, RECONCILIATION_INTERVAL_MS);

  // Prevent the timer from blocking process shutdown
  if (_reconciliationTimer.unref) {
    _reconciliationTimer.unref();
  }
}

export function stopBillingReconciliation(): void {
  if (_reconciliationTimer) {
    clearInterval(_reconciliationTimer);
    _reconciliationTimer = null;
    logger.info("[BillingReconciliation] Reconciliation job stopped");
  }
}
