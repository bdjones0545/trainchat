import { getUncachableStripeClient } from "./stripeClient";
import { stripeStorage } from "./stripeStorage";
import { logger } from "./logger";

// ─── Plan ↔ Stripe Price ID mapping ──────────────────────────────────────────
//
// Read from environment variables — never hardcoded.
// Used by the frontend plan-map endpoint to get price IDs without exposing
// secret keys.

export interface PlanPriceMap {
  starter: { monthly: string | null; yearly: string | null };
  pro:     { monthly: string | null; yearly: string | null };
  elite:   { monthly: string | null; yearly: string | null };
}

export function getPlanPriceMap(): PlanPriceMap {
  return {
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? null,
      yearly:  process.env.STRIPE_PRICE_STARTER_YEARLY  ?? null,
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? null,
      yearly:  process.env.STRIPE_PRICE_PRO_YEARLY  ?? null,
    },
    elite: {
      monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY ?? null,
      yearly:  process.env.STRIPE_PRICE_ELITE_YEARLY  ?? null,
    },
  };
}

export class StripeService {
  // ── Customer management ───────────────────────────────────────────────────────

  async createCustomer(email: string, userId: number): Promise<string> {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
    logger.info({ customerId: customer.id, userId }, "[StripeService] Customer created");
    return customer.id;
  }

  // ── Checkout session ──────────────────────────────────────────────────────────
  //
  // Attaches userId in metadata so webhook handlers can look up the user
  // without relying on email matching.

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    userId: number
  ) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: String(userId) },
      subscription_data: {
        metadata: { userId: String(userId) },
      },
    });
    logger.info(
      { sessionId: session.id, customerId, priceId, userId },
      "[StripeService] Checkout session created"
    );
    return session;
  }

  // ── Billing portal ────────────────────────────────────────────────────────────

  async createPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    logger.info({ customerId }, "[StripeService] Portal session created");
    return session;
  }

  // ── Checkout session retrieval ────────────────────────────────────────────────

  async getCheckoutSession(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.default_payment_method"],
    });
  }

  // ── Subscription retrieval ────────────────────────────────────────────────────

  async getSubscription(subscriptionId: string) {
    return stripeStorage.getActiveSubscription(subscriptionId);
  }
}

export const stripeService = new StripeService();
