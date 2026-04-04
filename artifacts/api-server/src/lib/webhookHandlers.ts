// ─── TrainChat Stripe Webhook Handlers ────────────────────────────────────────
//
// Two-layer webhook processing:
//   1. StripeSync — verifies signature, syncs raw Stripe data to stripe.* tables.
//   2. Business logic — updates our users table from the verified event.
//
// IMPORTANT: Business logic runs AFTER StripeSync succeeds so we can trust the
// event was already signature-verified by the library.
//
// Idempotency: all writes are upsert-style. Duplicate events produce the same
// final state with no side effects.

import { getStripeSync } from "./stripeClient";
import { stripeStorage, type SubscriptionSyncPayload } from "./stripeStorage";
import { logger } from "./logger";
import type { PlanTier, BillingInterval } from "@workspace/db";

// ─── Plan detection from Stripe price / product metadata ─────────────────────

const PLAN_PRICE_MAP: Record<string, PlanTier> = {
  [process.env.STRIPE_PRICE_STARTER_MONTHLY ?? ""]: "starter",
  [process.env.STRIPE_PRICE_PRO_MONTHLY ?? ""]: "pro",
  [process.env.STRIPE_PRICE_ELITE_MONTHLY ?? ""]: "elite",
  [process.env.STRIPE_PRICE_STARTER_YEARLY ?? ""]: "starter",
  [process.env.STRIPE_PRICE_PRO_YEARLY ?? ""]: "pro",
  [process.env.STRIPE_PRICE_ELITE_YEARLY ?? ""]: "elite",
};

const YEARLY_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_STARTER_YEARLY ?? "",
  process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
  process.env.STRIPE_PRICE_ELITE_YEARLY ?? "",
].filter(Boolean));

function detectPlanFromPriceId(priceId: string): PlanTier {
  return PLAN_PRICE_MAP[priceId] ?? "starter";
}

function detectIntervalFromPriceId(priceId: string): BillingInterval {
  return YEARLY_PRICE_IDS.has(priceId) ? "yearly" : "monthly";
}

// ─── Subscription status → access rules ──────────────────────────────────────
//
// Maps Stripe subscription status to our planStatus field.
// active/trialing = full access; past_due = grace period; others = restricted.

function normalizePlanStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      return "restricted";
    case "canceled":
      return "canceled";
    default:
      return stripeStatus;
  }
}

// ─── Build SubscriptionSyncPayload from a raw Stripe subscription object ──────

function buildSyncPayload(sub: any): SubscriptionSyncPayload | null {
  try {
    const item = sub.items?.data?.[0];
    const priceId: string = item?.price?.id ?? "";
    const customerId: string =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";

    if (!customerId || !priceId) {
      logger.warn({ subId: sub.id }, "[WebhookHandlers] Cannot build sync payload — missing customer or price");
      return null;
    }

    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : new Date();

    const trialEnd = sub.trial_end
      ? new Date(sub.trial_end * 1000)
      : null;

    return {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      plan: detectPlanFromPriceId(priceId),
      planStatus: normalizePlanStatus(sub.status),
      billingInterval: detectIntervalFromPriceId(priceId),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEnd,
    };
  } catch (err) {
    logger.error({ err }, "[WebhookHandlers] Failed to build sync payload");
    return null;
  }
}

// ─── Handler: checkout.session.completed ─────────────────────────────────────
//
// When a user completes Stripe Checkout, link their Stripe customer to our user
// record and record the subscription. We rely on userId in session metadata
// as the primary lookup. Customer email is the fallback.

async function handleCheckoutSessionCompleted(event: any): Promise<void> {
  const session = event.data.object;
  const customerId: string = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? "";

  const userIdFromMeta = session.metadata?.userId
    ? parseInt(session.metadata.userId, 10)
    : null;

  const subscriptionId: string = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? "";

  logger.info(
    { customerId, subscriptionId, userIdFromMeta },
    "[WebhookHandlers] checkout.session.completed"
  );

  if (!customerId || !subscriptionId) {
    logger.warn("[WebhookHandlers] checkout.session.completed missing customer or subscription — skipping");
    return;
  }

  // Resolve user — metadata userId first, then customer ID lookup, then email
  let user = null;
  if (userIdFromMeta) {
    user = await stripeStorage.getUser(userIdFromMeta);
  }
  if (!user && customerId) {
    user = await stripeStorage.getUserByStripeCustomerId(customerId);
  }
  if (!user && session.customer_details?.email) {
    user = await stripeStorage.getUserByEmail(session.customer_details.email);
  }

  if (!user) {
    logger.warn(
      { customerId, email: session.customer_details?.email },
      "[WebhookHandlers] checkout.session.completed — user not found, cannot sync"
    );
    return;
  }

  // Ensure customer ID is stored
  if (!user.stripeCustomerId) {
    await stripeStorage.linkStripeCustomer(user.id, customerId);
  }

  // Subscription details come via customer.subscription.created which fires at
  // the same time — no need to duplicate the sync here. Just log success.
  logger.info(
    { userId: user.id, subscriptionId },
    "[WebhookHandlers] checkout.session.completed — user linked, subscription sync via subscription.created"
  );
}

// ─── Handler: customer.subscription.created / updated ────────────────────────
//
// Primary sync path. Both creation and every update (renewal, upgrade,
// cancel-at-period-end toggle, trial changes) flow through here.
// Idempotent: same payload produces same state.

async function handleSubscriptionUpsert(event: any): Promise<void> {
  const sub = event.data.object;
  const eventType: string = event.type;

  logger.info(
    { subId: sub.id, status: sub.status, eventType },
    "[WebhookHandlers] subscription upsert"
  );

  const payload = buildSyncPayload(sub);
  if (!payload) return;

  // Find user by customer ID
  const user = await stripeStorage.getUserByStripeCustomerId(payload.stripeCustomerId);
  if (!user) {
    logger.warn(
      { customerId: payload.stripeCustomerId, subId: sub.id },
      "[WebhookHandlers] subscription upsert — no user found for customer ID"
    );
    return;
  }

  await stripeStorage.syncUserSubscription(user.id, payload);

  logger.info(
    {
      userId: user.id,
      plan: payload.plan,
      planStatus: payload.planStatus,
      interval: payload.billingInterval,
      periodEnd: payload.currentPeriodEnd,
      cancelAtEnd: payload.cancelAtPeriodEnd,
    },
    "[WebhookHandlers] subscription synced to user"
  );
}

// ─── Handler: customer.subscription.deleted ───────────────────────────────────
//
// Subscription fully ended. Revoke access immediately — do not wait for
// period end (that is handled by cancel_at_period_end logic during updated).

async function handleSubscriptionDeleted(event: any): Promise<void> {
  const sub = event.data.object;
  const customerId: string = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id ?? "";

  logger.info({ subId: sub.id, customerId }, "[WebhookHandlers] subscription deleted");

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] subscription deleted — user not found");
    return;
  }

  await stripeStorage.revokeUserSubscription(user.id);
}

// ─── Handler: invoice.paid ────────────────────────────────────────────────────
//
// Fires on every successful payment including renewals. Re-sync subscription
// state to confirm access is current. This is a safety net in case
// subscription.updated was missed.

async function handleInvoicePaid(event: any): Promise<void> {
  const invoice = event.data.object;
  const subscriptionId: string = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id ?? "";

  if (!subscriptionId) {
    logger.debug("[WebhookHandlers] invoice.paid — no subscription, skipping");
    return;
  }

  const customerId: string = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? "";

  logger.info({ subscriptionId, customerId }, "[WebhookHandlers] invoice.paid");

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] invoice.paid — user not found");
    return;
  }

  // Confirm active status — subscription.updated handles the full sync,
  // so here we just ensure planStatus is active if it was in a degraded state.
  if (user.planStatus === "past_due" || user.planStatus === "restricted") {
    await stripeStorage.updateUserStripeInfo(user.id, { planStatus: "active" });
    logger.info({ userId: user.id }, "[WebhookHandlers] invoice.paid — restored active status after payment");
  }
}

// ─── Handler: invoice.payment_failed ─────────────────────────────────────────
//
// A payment attempt failed. Mark the account as past_due.
// Stripe will retry automatically — we preserve access during the retry window.
// Access is only revoked if subscription is deleted.

async function handleInvoicePaymentFailed(event: any): Promise<void> {
  const invoice = event.data.object;
  const customerId: string = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? "";

  logger.warn({ customerId, invoiceId: invoice.id }, "[WebhookHandlers] invoice.payment_failed");

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] invoice.payment_failed — user not found");
    return;
  }

  // Mark as past_due — preserve plan tier until subscription is actually deleted
  await stripeStorage.updateUserStripeInfo(user.id, { planStatus: "past_due" });
  logger.warn(
    { userId: user.id },
    "[WebhookHandlers] invoice.payment_failed — account marked past_due (access preserved during retry window)"
  );
}

// ─── Event router ─────────────────────────────────────────────────────────────

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

async function dispatchWebhookEvent(event: any): Promise<void> {
  const eventType: string = event.type;
  logger.info({ eventType, eventId: event.id }, "[WebhookHandlers] dispatching business logic event");

  switch (eventType) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;
    default:
      logger.debug({ eventType }, "[WebhookHandlers] unhandled event type — skipping business logic");
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    // Layer 1: StripeSync — verifies signature, syncs data to stripe.* tables.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Layer 2: Business logic — runs after verified event.
    // Parse raw payload as JSON (StripeSync already verified the signature).
    try {
      const event = JSON.parse(payload.toString("utf8"));
      if (HANDLED_EVENTS.has(event.type)) {
        await dispatchWebhookEvent(event);
      }
    } catch (err) {
      // Business logic failure should not prevent webhook acknowledgment.
      // StripeSync already confirmed the event — log and continue.
      logger.error({ err }, "[WebhookHandlers] Business logic dispatch failed — event will not be retried");
    }
  }
}
