// ─── /api/billing/* routes ────────────────────────────────────────────────────
//
// Checkout, subscription status, and portal session endpoints.
// Single subscription: trainchat_monthly at $49.99/mo
// Legacy tiers (starter, pro, elite) still accepted for backward compatibility.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { stripeStorage } from "../lib/stripeStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Lookup key format ────────────────────────────────────────────────────────
//
// Current:  trainchat_monthly
// Legacy:   trainchat_(starter|pro|elite)_(monthly|yearly)
//
// When the caller passes tier="trainchat", interval="monthly"
//   → buildLookupKey produces "trainchat_monthly"
// When legacy tiers are passed (existing integrations), they still work.

function buildLookupKey(tier: string, billingInterval: string): string {
  if (tier === "trainchat") {
    // New single subscription — no tier prefix
    return `trainchat_monthly`;
  }
  // Legacy: trainchat_pro_monthly, etc.
  return `trainchat_${tier}_${billingInterval}`;
}

// "trainchat" is the canonical new tier.
// Legacy tiers retained for existing integrations / external API clients.
const VALID_TIERS = new Set(["trainchat", "starter", "pro", "elite"]);
const VALID_INTERVALS = new Set(["monthly", "yearly"]);

// ─── POST /api/billing/create-checkout-session ────────────────────────────────
//
// Accepts { tier, billingInterval } and creates a Stripe Checkout session.
// Resolves the Stripe Price via lookup_key — no env-var price IDs required.
//
// Returns { url } for frontend redirect.

router.post("/billing/create-checkout-session", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { tier, billingInterval } = req.body as { tier?: string; billingInterval?: string };

    if (!tier || !VALID_TIERS.has(tier)) {
      res.status(400).json({ error: "tier must be one of: trainchat, starter, pro, elite" });
      return;
    }

    if (!billingInterval || !VALID_INTERVALS.has(billingInterval)) {
      res.status(400).json({ error: "billingInterval must be one of: monthly, yearly" });
      return;
    }

    const user = await stripeStorage.getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!user.email) {
      res.status(400).json({ error: "User account has no email address. Please register first." });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // Resolve Stripe Price via lookup key
    const lookupKey = buildLookupKey(tier, billingInterval);
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
    if (!prices.data.length) {
      logger.error(
        { lookupKey },
        "[BillingRouter] Price not found for lookup key — run stripe:setup-products"
      );
      res.status(503).json({
        error: "Payments are still being configured. Please try again soon.",
        lookupKey,
      });
      return;
    }

    const price = prices.data[0];

    // Create or reuse Stripe customer.
    // Re-fetch the user directly before creating to avoid a race where two
    // simultaneous requests both see stripeCustomerId=null and both call
    // stripe.customers.create(), producing duplicate customers.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const freshUser = await stripeStorage.getUser(userId);
      customerId = freshUser?.stripeCustomerId ?? null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(userId), product: "trainchat" },
      });
      customerId = customer.id;
      await stripeStorage.linkStripeCustomer(userId, customerId);
      logger.info({ customerId, userId }, "[BillingRouter] Created Stripe customer");
    }

    // Build redirect URLs
    const clientUrl =
      process.env.CLIENT_URL ||
      (process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : `${req.protocol}://${req.get("host")}`);

    const successUrl = `${clientUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = "https://www.trainchat.ai";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: !customerId ? user.email : undefined,
      payment_method_types: ["card"],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: String(userId),
        tier,
        billingInterval,
        product: "trainchat",
      },
      subscription_data: {
        metadata: {
          userId: String(userId),
          tier,
          billingInterval,
          product: "trainchat",
        },
      },
    });

    logger.info(
      { userId, tier, billingInterval, priceId: price.id, sessionId: session.id, lookupKey },
      "[BillingRouter] Checkout session created"
    );

    res.json({ url: session.url });
  } catch (err: any) {
    logger.error({ err }, "[BillingRouter] /billing/create-checkout-session error");
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/checkout-session/:sessionId ────────────────────────────
//
// Retrieves a checkout session by ID. Used by the success page to confirm
// payment and display subscription details.

router.get("/billing/checkout-session/:sessionId", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const sub = session.subscription as any;

    res.json({
      status: session.payment_status,
      customerEmail: session.customer_details?.email,
      tier: session.metadata?.tier,
      billingInterval: session.metadata?.billingInterval,
      subscriptionId: typeof sub === "string" ? sub : sub?.id,
      subscriptionStatus: typeof sub === "object" ? sub?.status : undefined,
    });
  } catch (err: any) {
    logger.error({ err }, "[BillingRouter] /billing/checkout-session error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
