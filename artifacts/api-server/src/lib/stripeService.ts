import { getUncachableStripeClient } from "./stripeClient";
import { stripeStorage } from "./stripeStorage";

export class StripeService {
  async createCustomer(email: string, userId: number): Promise<string> {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
    return customer.id;
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    return stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getCheckoutSession(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.default_payment_method"],
    });
  }

  async getSubscription(subscriptionId: string) {
    return stripeStorage.getActiveSubscription(subscriptionId);
  }
}

export const stripeService = new StripeService();
