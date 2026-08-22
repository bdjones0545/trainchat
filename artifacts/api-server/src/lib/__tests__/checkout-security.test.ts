import { beforeEach, describe, expect, it } from "vitest";
import {
  authorizeTrainChatCheckout,
  CheckoutAuthorizationError,
  isApprovedTrainChatPrice,
} from "../checkout-security";

const USER = { id: 42, stripeCustomerId: "cus_owner" };

function validSession(overrides: Record<string, unknown> = {}) {
  return {
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    livemode: false,
    customer: "cus_owner",
    metadata: { userId: "42", product: "trainchat" },
    subscription: {
      id: "sub_owner",
      status: "active",
      customer: "cus_owner",
      items: { data: [{ price: { id: "price_owner", active: true, lookup_key: "trainchat_monthly", livemode: false } }] },
    },
    ...overrides,
  };
}

describe("TrainChat Checkout authorization boundary", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    delete process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY;
  });

  it("accepts the authenticated user's successful approved Checkout", () => {
    expect(authorizeTrainChatCheckout(validSession(), USER).subscription.id).toBe("sub_owner");
  });

  it("is idempotently authorizable for duplicate confirmation", () => {
    const session = validSession();
    expect(authorizeTrainChatCheckout(session, USER)).toEqual(authorizeTrainChatCheckout(session, USER));
  });

  it.each([
    ["foreign metadata", { metadata: { userId: "99", product: "trainchat" } }],
    ["missing metadata", { metadata: null }],
    ["wrong product", { metadata: { userId: "42", product: "other" } }],
    ["foreign Checkout customer", { customer: "cus_foreign" }],
    ["foreign subscription customer", { subscription: { ...validSession().subscription, customer: "cus_foreign" } }],
    ["unpaid Checkout", { payment_status: "unpaid" }],
    ["incomplete Checkout", { status: "open" }],
    ["wrong mode", { mode: "payment" }],
    ["inactive subscription", { subscription: { ...validSession().subscription, status: "canceled" } }],
    ["unexpanded subscription", { subscription: "sub_owner" }],
    ["wrong environment", { livemode: true }],
    ["unknown price", { subscription: { ...validSession().subscription, items: { data: [{ price: { id: "price_unknown", active: true } }] } } }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => authorizeTrainChatCheckout(validSession(overrides), USER)).toThrow(CheckoutAuthorizationError);
  });

  it("rejects an inactive configured price", () => {
    process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY = "price_configured";
    expect(isApprovedTrainChatPrice({ id: "price_configured", active: false })).toBe(false);
  });
});
