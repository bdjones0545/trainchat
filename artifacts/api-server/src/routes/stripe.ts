import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { stripeService } from "../lib/stripeService";
import { stripeStorage } from "../lib/stripeStorage";
import { getUserPlanInfo, getPlanFeatures } from "../lib/planGating";
import { detectPlanInterval } from "../lib/billingUtils";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── GET /api/subscription ────────────────────────────────────────────────────
//
// Returns the full subscription state for the current user.
// All fields are sourced from our users table (webhook-synced), not from Stripe
// API calls on each request — this keeps latency low.

router.get("/subscription", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const planInfo = await getUserPlanInfo(userId);

    res.json({
      plan: planInfo.plan,
      planStatus: planInfo.planStatus,
      features: planInfo.features,
      messagesRemaining: planInfo.messagesRemaining,
      billingInterval: planInfo.billingInterval,
      currentPeriodEnd: planInfo.currentPeriodEnd,
      cancelAtPeriodEnd: planInfo.cancelAtPeriodEnd,
      trialEnd: planInfo.trialEnd,
      hasActiveAccess: planInfo.hasActiveAccess,
    });
  } catch (err: any) {
    logger.error({ err }, "[StripeRouter] /subscription error");
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/subscription/products ──────────────────────────────────────────
//
// Returns active products with prices from the StripeSync tables.
// Used by PricingModal to match plan names to live Stripe price IDs.

router.get("/subscription/products", async (_req, res): Promise<void> => {
  try {
    const products = await stripeStorage.listProductsWithPrices();
    res.json({ products });
  } catch {
    res.json({ products: [] });
  }
});

// ─── GET /api/subscription/plan-map ──────────────────────────────────────────
//
// Returns the single TrainChat subscription plan info.
// Safe to expose: price IDs are not secret.

router.get("/subscription/plan-map", async (_req, res): Promise<void> => {
  res.json({ planMap: { trainchat: process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY ?? null } });
});

// ─── POST /api/subscription/checkout ─────────────────────────────────────────
//
// Creates a Stripe Checkout Session for the given price ID.
// Returns the session URL for frontend redirect.

router.post("/subscription/checkout", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { priceId } = req.body;

    if (!priceId) {
      res.status(400).json({ error: "priceId is required" });
      return;
    }

    const user = await stripeStorage.getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Create Stripe customer if not yet on file
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      if (!user.email) {
        res.status(400).json({ error: "User account has no email address" });
        return;
      }
      customerId = await stripeService.createCustomer(user.email, userId);
      await stripeStorage.linkStripeCustomer(userId, customerId);
    }

    const baseUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL
      ? process.env.STRIPE_CHECKOUT_SUCCESS_URL.replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}")
      : `${req.protocol}://${req.get("host")}`;

    const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL
      ?? `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL
      ?? "https://www.trainchat.ai";

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      userId
    );

    logger.info({ userId, priceId, sessionId: session.id }, "[StripeRouter] Checkout session created");
    res.json({ url: session.url });
  } catch (err: any) {
    logger.error({ err }, "[StripeRouter] /subscription/checkout error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/subscription/confirm ──────────────────────────────────────────
//
// Called from the checkout success page to verify and record the subscription.
// This is a safety net — the primary source of truth is the webhook.
// Idempotent: safe to call multiple times.

router.post("/subscription/confirm", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    const checkoutSession = await stripeService.getCheckoutSession(sessionId);
    if (!checkoutSession.subscription) {
      res.status(400).json({ error: "No subscription on checkout session" });
      return;
    }

    const sub =
      typeof checkoutSession.subscription === "string"
        ? null
        : (checkoutSession.subscription as any);

    const subscriptionId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : checkoutSession.subscription.id;

    // If we got the expanded subscription object, sync immediately
    if (sub && sub.id) {
      const item = sub.items?.data?.[0];
      const priceId: string = item?.price?.id ?? "";
      const customerId: string =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";

      if (priceId && customerId) {
        const { plan, billingInterval } = detectPlanInterval(priceId);
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : new Date();

        await stripeStorage.syncUserSubscription(userId, {
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          plan,
          planStatus: sub.status === "active" ? "active" : sub.status,
          billingInterval,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        });

        const features = getPlanFeatures(plan);
        res.json({ plan, features, subscriptionId });
        return;
      }
    }

    // Fallback: derive plan from StripeSync tables
    const plan = await stripeStorage.getSubscriptionPlan(subscriptionId);
    await stripeStorage.updateUserStripeInfo(userId, {
      stripeSubscriptionId: subscriptionId,
      plan,
      planStatus: "active",
    });

    const features = getPlanFeatures(plan);
    res.json({ plan, features, subscriptionId });
  } catch (err: any) {
    logger.error({ err }, "[StripeRouter] /subscription/confirm error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/subscription/portal ───────────────────────────────────────────
//
// Creates a Stripe Billing Portal session.
// Users can update payment method, cancel, or manage their subscription.

router.post("/subscription/portal", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const user = await stripeStorage.getUser(userId);

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found. Please subscribe first." });
      return;
    }

    const returnUrl =
      process.env.STRIPE_BILLING_PORTAL_RETURN_URL ??
      (process.env.CLIENT_URL
        ? `${process.env.CLIENT_URL}/billing`
        : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/billing`
        : `${req.protocol}://${req.get("host")}/billing`);

    const portalSession = await stripeService.createPortalSession(
      user.stripeCustomerId,
      returnUrl
    );

    logger.info({ userId }, "[StripeRouter] Portal session created");
    res.json({ url: portalSession.url });
  } catch (err: any) {
    logger.error({ err }, "[StripeRouter] /subscription/portal error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
