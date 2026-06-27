// ─── TrainChat Stripe Webhook Handlers ────────────────────────────────────────
//
// Two-layer webhook processing:
//   1. StripeSync — verifies signature, syncs raw Stripe data to stripe.* tables.
//   2. Business logic — updates our users table from the verified event.
//
// IMPORTANT: Business logic runs AFTER StripeSync succeeds so we can trust the
// event was already signature-verified by the library.
//
// Idempotency: event IDs are recorded in stripe_processed_events. Duplicate
// deliveries and Stripe retries skip business logic after the first success.
// DB writes in individual handlers are also upsert-safe as a secondary guard.
//
// Reliability: business-logic exceptions are re-thrown so the webhook route
// returns 5xx → Stripe retries the event. StripeSync upserts are idempotent,
// so retries are safe.

import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { stripeStorage, type SubscriptionSyncPayload } from "./stripeStorage";
import { logger } from "./logger";
import type { PlanTier, BillingInterval } from "@workspace/db";

// ─── Plan detection from Stripe price lookup_key or price ID ──────────────────
//
// Primary path: parse the lookup_key field on the Stripe price object.
//   Current format:  trainchat_monthly
//   Legacy formats:  trainchat_(starter|pro|elite)_(monthly|yearly)
//
// Fallback: match against STRIPE_PRICE_* environment variables.
//   This allows continued operation when prices predate lookup_key adoption.
//
// Both paths are tried before throwing, so the setup script and env vars are
// independently sufficient.

// Env-var fallback map (populated at startup; missing vars are safely skipped)
const PLAN_PRICE_MAP: Record<string, PlanTier> = {
  // Current single plan
  [process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY ?? ""]: "pro",
  // Legacy plans — existing subscribers retain access
  [process.env.STRIPE_PRICE_STARTER_MONTHLY ?? ""]: "starter",
  [process.env.STRIPE_PRICE_PRO_MONTHLY ?? ""]: "pro",
  [process.env.STRIPE_PRICE_ELITE_MONTHLY ?? ""]: "elite",
  [process.env.STRIPE_PRICE_STARTER_YEARLY ?? ""]: "starter",
  [process.env.STRIPE_PRICE_PRO_YEARLY ?? ""]: "pro",
  [process.env.STRIPE_PRICE_ELITE_YEARLY ?? ""]: "elite",
};
delete (PLAN_PRICE_MAP as Record<string, PlanTier>)[""];

const YEARLY_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_STARTER_YEARLY ?? "",
  process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
  process.env.STRIPE_PRICE_ELITE_YEARLY ?? "",
].filter(Boolean));

// Matches current: trainchat_monthly
// Matches legacy:  trainchat_(starter|pro|elite)_(monthly|yearly)
const LOOKUP_KEY_RE = /^trainchat_(?:(starter|pro|elite)_)?(monthly|yearly)$/;

export function detectPlanFromLookupKey(
  lookupKey: string | null | undefined
): { plan: PlanTier; billingInterval: BillingInterval } | null {
  if (!lookupKey) return null;
  const m = lookupKey.match(LOOKUP_KEY_RE);
  if (!m) return null;

  // m[1] = tier (undefined for new single plan), m[2] = interval
  const interval = m[2] as BillingInterval;

  // New single plan: trainchat_monthly → maps to "pro" internally
  if (!m[1]) {
    return { plan: "pro", billingInterval: interval };
  }

  // Legacy plans: trainchat_starter_monthly, trainchat_pro_yearly, etc.
  return {
    plan: m[1] as PlanTier,
    billingInterval: interval,
  };
}

export function detectPlanFromPriceId(priceId: string, lookupKey?: string | null): PlanTier {
  // Try lookup_key first (preferred — no env vars required)
  const fromKey = detectPlanFromLookupKey(lookupKey);
  if (fromKey) return fromKey.plan;

  // Fallback: env-var price ID map
  const plan = PLAN_PRICE_MAP[priceId];
  if (plan) return plan;

  logger.error(
    { priceId, lookupKey, knownPriceIds: Object.keys(PLAN_PRICE_MAP) },
    "[WebhookHandlers] UNKNOWN PRICE — cannot determine plan tier. " +
    "Either run stripe:setup-products (adds lookup_key) or set STRIPE_PRICE_* env vars."
  );
  throw new Error(
    `Unknown Stripe price ID: "${priceId}" (lookup_key: ${lookupKey ?? "none"}). ` +
    "Run stripe:setup-products or set STRIPE_PRICE_* environment variables."
  );
}

export function detectIntervalFromPriceId(priceId: string, lookupKey?: string | null): BillingInterval {
  // Try lookup_key first
  const fromKey = detectPlanFromLookupKey(lookupKey);
  if (fromKey) return fromKey.billingInterval;

  // Fallback: env-var yearly set
  return YEARLY_PRICE_IDS.has(priceId) ? "yearly" : "monthly";
}

// ─── Subscription status → access rules ──────────────────────────────────────
//
// Maps Stripe subscription status to our planStatus field.
// active/trialing = full access; past_due = grace period; others = restricted.

export function normalizePlanStatus(stripeStatus: string): string {
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
//
// Exported so the reconciliation job can re-use the same mapping logic.

export function buildSyncPayload(sub: any): SubscriptionSyncPayload | null {
  try {
    const item = sub.items?.data?.[0];
    const priceId: string = item?.price?.id ?? "";
    const lookupKey: string | null = item?.price?.lookup_key ?? null;
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

    // detectPlanFromPriceId tries lookup_key first, then env-var map
    const plan = detectPlanFromPriceId(priceId, lookupKey);

    logger.debug(
      { priceId, lookupKey, plan },
      "[WebhookHandlers] Plan detected from price"
    );

    return {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      plan,
      planStatus: normalizePlanStatus(sub.status),
      billingInterval: detectIntervalFromPriceId(priceId, lookupKey),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEnd,
    };
  } catch (err) {
    logger.error({ err }, "[WebhookHandlers] Failed to build sync payload");
    throw err; // re-throw so the caller can propagate for retry
  }
}

// ─── Handler: checkout.session.completed ─────────────────────────────────────
//
// When a user completes Stripe Checkout, link their Stripe customer to our user
// record. If the session includes an expanded subscription, sync it directly
// to avoid a race window where subscription.created fires before the customer
// link is established.
//
// User resolution order: metadata.userId → customer ID → email.

async function handleCheckoutSessionCompleted(
  event: any,
  context: EventContext
): Promise<void> {
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

  // Ensure customer ID is stored before subscription events arrive
  if (!user.stripeCustomerId) {
    await stripeStorage.linkStripeCustomer(user.id, customerId);
  }

  context.userId = user.id;
  context.subscriptionId = subscriptionId;

  // If the session includes an expanded subscription object, sync it directly.
  // This closes the race window where subscription.created fires and can't find
  // the user by customer ID because the link above hasn't been written yet.
  const expandedSub = session.subscription && typeof session.subscription === "object"
    ? session.subscription
    : null;

  if (expandedSub) {
    const payload = buildSyncPayload(expandedSub);
    if (payload) {
      await stripeStorage.syncUserSubscription(user.id, payload);
      context.finalStatus = payload.planStatus;
      logger.info(
        { userId: user.id, subscriptionId, plan: payload.plan, planStatus: payload.planStatus },
        "[WebhookHandlers] checkout.session.completed — subscription synced directly from expanded object"
      );
      return;
    }
  }

  // No expanded sub — retrieve it from Stripe to sync immediately.
  // This ensures the user has active access even if subscription.created
  // is delayed or arrives out of order.
  try {
    const stripe = await getUncachableStripeClient();
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    const payload = buildSyncPayload(sub);
    if (payload) {
      await stripeStorage.syncUserSubscription(user.id, payload);
      context.finalStatus = payload.planStatus;
      logger.info(
        { userId: user.id, subscriptionId, plan: payload.plan, planStatus: payload.planStatus },
        "[WebhookHandlers] checkout.session.completed — subscription retrieved and synced"
      );
    }
  } catch (err) {
    // Log but don't throw — subscription.created will sync the state.
    logger.warn(
      { err, userId: user.id, subscriptionId },
      "[WebhookHandlers] checkout.session.completed — subscription retrieve failed; relying on subscription.created"
    );
  }
}

// ─── Handler: customer.subscription.created / updated ────────────────────────
//
// Primary sync path. Both creation and every update (renewal, upgrade,
// cancel-at-period-end toggle, trial changes) flow through here.
// Idempotent: same payload produces same state.

async function handleSubscriptionUpsert(
  event: any,
  context: EventContext
): Promise<void> {
  const sub = event.data.object;
  const eventType: string = event.type;

  const payload = buildSyncPayload(sub); // throws on unknown price ID
  if (!payload) return;

  context.customerId = payload.stripeCustomerId;
  context.subscriptionId = payload.stripeSubscriptionId;

  // Find user by customer ID
  const user = await stripeStorage.getUserByStripeCustomerId(payload.stripeCustomerId);
  if (!user) {
    logger.warn(
      { customerId: payload.stripeCustomerId, subId: sub.id, eventType },
      "[WebhookHandlers] subscription upsert — no user found for customer ID"
    );
    return;
  }

  context.userId = user.id;

  await stripeStorage.syncUserSubscription(user.id, payload);
  context.finalStatus = payload.planStatus;

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
// Subscription fully ended. If current_period_end is in the future, mark as
// canceled but preserve access until period end (cancel_at_period_end flow).
// If current_period_end is in the past or missing, revoke access immediately.

async function handleSubscriptionDeleted(
  event: any,
  context: EventContext
): Promise<void> {
  const sub = event.data.object;
  const customerId: string = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id ?? "";

  context.customerId = customerId;
  context.subscriptionId = sub.id;

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] subscription deleted — user not found");
    return;
  }

  context.userId = user.id;

  const periodEndUnix: number | null = sub.current_period_end ?? null;
  const periodEndDate = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const now = new Date();

  if (periodEndDate && periodEndDate > now) {
    // Access should remain until the period genuinely ends.
    // Mark cancelAtPeriodEnd so the UI shows "cancels on <date>".
    await stripeStorage.syncUserSubscription(user.id, {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      stripePriceId: sub.items?.data?.[0]?.price?.id ?? user.stripePriceId ?? "",
      plan: user.plan,
      planStatus: "canceled",
      billingInterval: user.billingInterval ?? "monthly",
      currentPeriodEnd: periodEndDate,
      cancelAtPeriodEnd: true,
      trialEnd: null,
    });
    context.finalStatus = "canceled_access_until_period_end";
    logger.info(
      { userId: user.id, periodEnd: periodEndDate },
      "[WebhookHandlers] subscription deleted — access preserved until period end"
    );
  } else {
    // Period already over — revoke immediately
    await stripeStorage.revokeUserSubscription(user.id);
    context.finalStatus = "revoked";
    logger.info(
      { userId: user.id },
      "[WebhookHandlers] subscription deleted — access revoked immediately"
    );
  }
}

// ─── Handler: invoice.paid / invoice.payment_succeeded ───────────────────────
//
// Full subscription sync on every successful payment.
//
// Fires on every successful payment including renewals. We perform a FULL sync
// of the subscription state — not just a planStatus patch — by retrieving the
// live subscription from Stripe. This is the authoritative renewal backstop.
//
// This prevents stale currentPeriodEnd, stale interval, or stale plan fields
// if customer.subscription.updated was delayed or missed.

async function handleInvoicePaid(
  event: any,
  context: EventContext
): Promise<void> {
  const invoice = event.data.object;
  const subscriptionId: string = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id ?? "";

  if (!subscriptionId) {
    logger.debug("[WebhookHandlers] invoice paid — no subscription, skipping");
    return;
  }

  const customerId: string = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? "";

  context.customerId = customerId;
  context.subscriptionId = subscriptionId;

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] invoice paid — user not found");
    return;
  }

  context.userId = user.id;

  // Retrieve the full subscription object from Stripe to get current state.
  const stripe = await getUncachableStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  const payload = buildSyncPayload(sub); // throws on unknown price ID
  if (!payload) return;

  await stripeStorage.syncUserSubscription(user.id, payload);
  context.finalStatus = payload.planStatus;

  logger.info(
    {
      userId: user.id,
      plan: payload.plan,
      planStatus: payload.planStatus,
      periodEnd: payload.currentPeriodEnd,
    },
    "[WebhookHandlers] invoice paid — full subscription sync complete"
  );

  // ── Payment receipt email ──────────────────────────────────────────────────
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (!sendgridKey) {
    logger.info(
      { userId: user.id, invoiceId: invoice.id },
      "[BillingEmail] No SENDGRID_API_KEY — relying on Stripe built-in receipt emails"
    );
    return;
  }

  try {
    const intervalLabel = payload.billingInterval === "yearly" ? "yearly" : "monthly";
    const amountPaid = invoice.amount_paid ? `$${(invoice.amount_paid / 100).toFixed(2)}` : "";
    const receiptUrl: string = invoice.hosted_invoice_url ?? invoice.receipt_url ?? "";

    const emailBody = [
      `Hi,`,
      ``,
      `Your TrainChat (${intervalLabel}) payment has been confirmed.`,
      amountPaid ? `Amount: ${amountPaid}` : "",
      receiptUrl ? `View receipt: ${receiptUrl}` : "",
      ``,
      `Your subscription is active and your AI coaching continues.`,
      ``,
      `— TrainChat`,
    ].filter((l) => l !== undefined).join("\n");

    const customerEmail = typeof invoice.customer_email === "string"
      ? invoice.customer_email
      : user.email ?? null;

    if (!customerEmail) {
      logger.warn({ userId: user.id }, "[BillingEmail] No customer email — skipping receipt");
      return;
    }

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: customerEmail }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL ?? "noreply@trainchat.app", name: "TrainChat" },
        subject: `TrainChat payment confirmed`,
        content: [{ type: "text/plain", value: emailBody }],
      }),
    });

    logger.info(
      { userId: user.id, email: customerEmail },
      "[BillingEmail] Payment confirmation email sent via SendGrid"
    );
  } catch (emailErr) {
    // Email failure must never block webhook success
    logger.warn(
      { err: emailErr, userId: user.id },
      "[BillingEmail] Failed to send payment confirmation — webhook continues"
    );
  }
}

// ─── Handler: invoice.payment_failed ─────────────────────────────────────────
//
// A payment attempt failed. Mark the account as past_due.
// Stripe will retry automatically — we preserve access during the retry window.
// Access is only revoked if subscription is deleted or moves to unpaid/canceled.

async function handleInvoicePaymentFailed(
  event: any,
  context: EventContext
): Promise<void> {
  const invoice = event.data.object;
  const customerId: string = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? "";

  context.customerId = customerId;

  const user = await stripeStorage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, "[WebhookHandlers] invoice.payment_failed — user not found");
    return;
  }

  context.userId = user.id;

  // Mark as past_due — preserve plan tier until subscription is actually deleted
  await stripeStorage.updateUserStripeInfo(user.id, { planStatus: "past_due" });
  context.finalStatus = "past_due";

  logger.warn(
    { userId: user.id, invoiceId: invoice.id },
    "[WebhookHandlers] invoice.payment_failed — account marked past_due (access preserved during retry window)"
  );
}

// ─── Event logging context ────────────────────────────────────────────────────
//
// Mutable struct populated by each handler so the final audit log can include
// all required fields regardless of which handler ran.

interface EventContext {
  eventId: string;
  eventType: string;
  userId?: number;
  customerId?: string;
  subscriptionId?: string;
  finalStatus?: string;
}

// ─── Event router ─────────────────────────────────────────────────────────────

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

async function dispatchWebhookEvent(event: any): Promise<void> {
  const context: EventContext = {
    eventId: event.id,
    eventType: event.type,
  };

  logger.info(
    { eventId: event.id, eventType: event.type },
    "[WebhookHandlers] processing business logic"
  );

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event, context);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event, context);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event, context);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event, context);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event, context);
      break;
    default:
      logger.debug({ eventType: event.type }, "[WebhookHandlers] unhandled event type — skipping");
  }

  // Structured audit log — all required fields in one line regardless of handler
  logger.info(
    {
      eventId: context.eventId,
      eventType: context.eventType,
      userId: context.userId ?? null,
      customerId: context.customerId ?? null,
      subscriptionId: context.subscriptionId ?? null,
      finalStatus: context.finalStatus ?? null,
    },
    "[WebhookHandlers] event complete"
  );
}

// ─── Main entry point ─────────────────────────────────────────────────────────
//
// If business logic throws, we re-throw so the webhook route returns 4xx/5xx.
// Stripe will then retry the event. StripeSync already recorded the event
// idempotently, so retries are safe — the upsert writes produce the same state.
//
// DO NOT swallow business-logic exceptions here. Silent 200s cause drift.

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    // Layer 1: StripeSync — verifies signature using STRIPE_WEBHOOK_SECRET,
    // syncs data to stripe.* tables. Throws on invalid signature → returns 400.
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Layer 2: Business logic — runs after verified event.
    // Parse raw payload as JSON (StripeSync already verified the signature).
    const event = JSON.parse(payload.toString("utf8"));

    if (!HANDLED_EVENTS.has(event.type)) {
      logger.debug({ eventType: event.type }, "[WebhookHandlers] event type not handled — skipping");
      return;
    }

    // ── Idempotency check — skip if already processed ──────────────────────────
    const alreadyDone = await stripeStorage.hasProcessedEvent(event.id);
    if (alreadyDone) {
      logger.info(
        { eventId: event.id, eventType: event.type },
        "[WebhookHandlers] event already processed — skipping (idempotent)"
      );
      return;
    }

    // ── Run business logic ─────────────────────────────────────────────────────
    // Do NOT catch exceptions here — let them bubble to the route so Stripe retries.
    await dispatchWebhookEvent(event);

    // ── Mark event as processed (best-effort, non-fatal) ──────────────────────
    await stripeStorage.markEventProcessed(event.id, event.type);
  }
}
