type StripeLikePrice = {
  id?: string;
  active?: boolean;
  lookup_key?: string | null;
  livemode?: boolean;
};

type StripeLikeSubscription = {
  id?: string;
  status?: string;
  customer?: string | { id?: string } | null;
  items?: { data?: Array<{ price?: StripeLikePrice }> };
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  trial_end?: number | null;
};

type StripeLikeCheckoutSession = {
  mode?: string;
  status?: string | null;
  payment_status?: string;
  livemode?: boolean;
  customer?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  subscription?: string | StripeLikeSubscription | null;
};

export class CheckoutAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutAuthorizationError";
  }
}

function objectId(value: string | { id?: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function isApprovedTrainChatPrice(price: StripeLikePrice): boolean {
  if (!price.id || price.active === false) return false;
  const configuredPriceId = process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY;
  return price.lookup_key === "trainchat_monthly" ||
    (Boolean(configuredPriceId) && price.id === configuredPriceId);
}

function expectedLiveMode(): boolean | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (key.startsWith("sk_live_")) return true;
  if (key.startsWith("sk_test_")) return false;
  return null;
}

/** Fail-closed proof that a Checkout session can affect this user's entitlement. */
export function authorizeTrainChatCheckout(
  session: StripeLikeCheckoutSession,
  user: { id: number; stripeCustomerId: string | null },
): { subscription: StripeLikeSubscription; price: StripeLikePrice; customerId: string } {
  if (session.mode !== "subscription" || session.status !== "complete") {
    throw new CheckoutAuthorizationError("Checkout session is not complete");
  }
  if (!new Set(["paid", "no_payment_required"]).has(session.payment_status ?? "")) {
    throw new CheckoutAuthorizationError("Checkout payment is not eligible");
  }
  if (session.metadata?.product !== "trainchat" || session.metadata?.userId !== String(user.id)) {
    throw new CheckoutAuthorizationError("Checkout account binding is invalid");
  }

  const customerId = objectId(session.customer);
  if (!customerId || !user.stripeCustomerId || customerId !== user.stripeCustomerId) {
    throw new CheckoutAuthorizationError("Checkout customer does not match account");
  }

  const expectedMode = expectedLiveMode();
  if (expectedMode !== null && session.livemode !== expectedMode) {
    throw new CheckoutAuthorizationError("Checkout environment does not match server");
  }

  if (!session.subscription || typeof session.subscription === "string") {
    throw new CheckoutAuthorizationError("Checkout subscription was not expanded");
  }
  const subscription = session.subscription;
  if (!subscription.id || !new Set(["active", "trialing"]).has(subscription.status ?? "")) {
    throw new CheckoutAuthorizationError("Subscription is not eligible");
  }
  if (objectId(subscription.customer) !== customerId) {
    throw new CheckoutAuthorizationError("Subscription customer does not match Checkout");
  }

  const price = subscription.items?.data?.[0]?.price;
  if (!price || !isApprovedTrainChatPrice(price)) {
    throw new CheckoutAuthorizationError("Checkout price is not approved");
  }
  if (expectedMode !== null && price.livemode !== undefined && price.livemode !== expectedMode) {
    throw new CheckoutAuthorizationError("Price environment does not match server");
  }

  return { subscription, price, customerId };
}
