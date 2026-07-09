// ─── Subscription Self-Heal ────────────────────────────────────────────────────
//
// Runs once at startup to detect and fix users whose Stripe customer is linked
// but whose subscription was never synced — the "Lisa Jones scenario" where:
//   1. The user completed Stripe checkout (stripe_customer_id was written)
//   2. The webhook never fired / was never processed (stripe.accounts missing)
//   3. /subscription/confirm also failed (detectPlanInterval threw)
//   4. The user remains on plan=free despite a live Stripe subscription
//
// This is a startup backstop, not a replacement for correct webhook handling.
// It only queries Stripe for users in the orphaned state and writes the correct
// subscription state if one is found.
//
// Idempotent: if the user is already correctly synced, the query finds nothing
// and no Stripe API calls are made.

import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";
import { stripeStorage } from "./stripeStorage";
import { buildSyncPayload } from "./webhookHandlers";
import { logger } from "./logger";
import { captureWithTags } from "./sentry";

// Maximum users to heal per startup run.
// Keeps the startup footprint bounded — any remainder heals on the next deploy.
const HEAL_BATCH_LIMIT = 50;

export async function runSubscriptionSelfHeal(): Promise<void> {
  let orphaned: typeof usersTable.$inferSelect[];

  try {
    orphaned = await db
      .select()
      .from(usersTable)
      .where(
        and(
          isNotNull(usersTable.stripeCustomerId),
          isNull(usersTable.stripeSubscriptionId),
          eq(usersTable.isAnonymous, false),
          eq(usersTable.plan, "free")
        )
      )
      .limit(HEAL_BATCH_LIMIT);
  } catch (err) {
    logger.error({ err }, "[SubscriptionSelfHeal] DB query failed — skipping");
    captureWithTags(err, { subsystem: "subscription_self_heal", feature: "db_query" });
    return;
  }

  if (orphaned.length === 0) {
    logger.info("[SubscriptionSelfHeal] No orphaned customers — billing state is clean");
    return;
  }

  logger.warn(
    { count: orphaned.length },
    "[SubscriptionSelfHeal] Found users with Stripe customer ID but no subscription — checking Stripe for active subscriptions"
  );

  const stripe = await getUncachableStripeClient();

  for (const user of orphaned) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: user.stripeCustomerId!,
        status: "active",
        expand: ["data.items.data.price"],
        limit: 1,
      });

      if (subs.data.length === 0) {
        // No active subscription — check for trialing
        const trialing = await stripe.subscriptions.list({
          customer: user.stripeCustomerId!,
          status: "trialing",
          expand: ["data.items.data.price"],
          limit: 1,
        });
        if (trialing.data.length === 0) {
          logger.debug(
            { userId: user.id, customerId: user.stripeCustomerId },
            "[SubscriptionSelfHeal] No active/trialing subscription found — user correctly on free"
          );
          continue;
        }
        subs.data.push(...trialing.data);
      }

      const sub = subs.data[0];
      const payload = await buildSyncPayload(sub);

      if (!payload) {
        logger.warn(
          { userId: user.id, subId: sub.id },
          "[SubscriptionSelfHeal] buildSyncPayload returned null — skipping user"
        );
        continue;
      }

      await stripeStorage.syncUserSubscription(user.id, payload);

      logger.info(
        {
          userId: user.id,
          email: user.email,
          customerId: user.stripeCustomerId,
          subscriptionId: sub.id,
          plan: payload.plan,
          planStatus: payload.planStatus,
        },
        "[SubscriptionSelfHeal] Synced orphaned subscription — user now has correct plan"
      );
    } catch (err: any) {
      logger.error(
        { err: err.message, userId: user.id, customerId: user.stripeCustomerId },
        "[SubscriptionSelfHeal] Failed to heal user — will retry next startup"
      );
      captureWithTags(err, { subsystem: "subscription_self_heal", feature: "stripe_sync" });
    }
  }

  logger.info("[SubscriptionSelfHeal] Startup self-heal complete");
}
