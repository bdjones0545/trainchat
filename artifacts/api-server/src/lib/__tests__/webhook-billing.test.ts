/**
 * webhook-billing.test.ts
 *
 * Tests for webhook event routing, idempotency, signature validation,
 * plan detection, status normalisation, and subscription sync payload building.
 *
 * All external collaborators (StripeSync, stripeStorage, Stripe API client,
 * database) are mocked so no real I/O occurs.
 *
 * Coverage:
 *  1. detectPlanFromLookupKey()  — new plan + all legacy formats + invalid inputs
 *  2. detectIntervalFromPriceId() — lookup_key path and env-var fallback
 *  3. normalizePlanStatus()      — every Stripe subscription status
 *  4. buildSyncPayload()         — happy path, missing customer, missing price,
 *                                   unknown lookup_key throws
 *  5. WebhookHandlers.processWebhook():
 *       – non-Buffer payload throws immediately
 *       – StripeSync failure propagates (invalid signature)
 *       – unhandled event type skips business logic silently
 *       – duplicate event ID skips business logic (idempotency)
 *       – new event dispatches and marks processed
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

// ── vi.hoisted() — variables usable inside vi.mock() factories ────────────────
// vi.mock() calls are hoisted to the top of the file by vitest at transform
// time. Any variable they reference must also be hoisted with vi.hoisted()
// so it is initialised before the factory runs.
const { mockStripeSync } = vi.hoisted(() => ({
  mockStripeSync: {
    processWebhook: vi.fn<[Buffer, string], Promise<void>>(),
  },
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
  stripeProcessedEventsTable: {},
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../stripeClient", () => ({
  getStripeSync: vi.fn().mockResolvedValue(mockStripeSync),
  getUncachableStripeClient: vi.fn(),
}));

// stripeStorage mock — all methods start as passing no-ops
vi.mock("../stripeStorage", () => {
  const storage = {
    hasProcessedEvent: vi.fn<[string], Promise<boolean>>().mockResolvedValue(false),
    markEventProcessed: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue(null),
    getUserByStripeCustomerId: vi.fn().mockResolvedValue(null),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    syncUserSubscription: vi.fn().mockResolvedValue(undefined),
    linkStripeCustomer: vi.fn().mockResolvedValue(undefined),
    revokeUserSubscription: vi.fn().mockResolvedValue(undefined),
    updateUserStripeInfo: vi.fn().mockResolvedValue(undefined),
  };
  return { stripeStorage: storage, SubscriptionSyncPayload: {} };
});

// ── Import after mocks are in place ──────────────────────────────────────────
import {
  detectPlanFromLookupKey,
  detectIntervalFromPriceId,
  normalizePlanStatus,
  buildSyncPayload,
  WebhookHandlers,
} from "../webhookHandlers";
import { stripeStorage } from "../stripeStorage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBuffer(event: object): Buffer {
  return Buffer.from(JSON.stringify(event), "utf8");
}

function makeEvent(type: string, dataOverride: object = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        customer: "cus_test123",
        subscription: "sub_test123",
        id: "sub_test123",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        trial_end: null,
        items: {
          data: [
            {
              price: {
                id: "price_test",
                lookup_key: "trainchat_monthly",
              },
            },
          ],
        },
        ...dataOverride,
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. detectPlanFromLookupKey()
// ═══════════════════════════════════════════════════════════════════════════════

describe("detectPlanFromLookupKey()", () => {
  // ── Current single plan ────────────────────────────────────────────────────

  it("trainchat_monthly → pro / monthly", () => {
    const result = detectPlanFromLookupKey("trainchat_monthly");
    expect(result).toEqual({ plan: "pro", billingInterval: "monthly" });
  });

  // ── Legacy plans ───────────────────────────────────────────────────────────

  it("trainchat_starter_monthly → starter / monthly", () => {
    expect(detectPlanFromLookupKey("trainchat_starter_monthly")).toEqual({
      plan: "starter",
      billingInterval: "monthly",
    });
  });

  it("trainchat_starter_yearly → starter / yearly", () => {
    expect(detectPlanFromLookupKey("trainchat_starter_yearly")).toEqual({
      plan: "starter",
      billingInterval: "yearly",
    });
  });

  it("trainchat_pro_monthly → pro / monthly", () => {
    expect(detectPlanFromLookupKey("trainchat_pro_monthly")).toEqual({
      plan: "pro",
      billingInterval: "monthly",
    });
  });

  it("trainchat_pro_yearly → pro / yearly", () => {
    expect(detectPlanFromLookupKey("trainchat_pro_yearly")).toEqual({
      plan: "pro",
      billingInterval: "yearly",
    });
  });

  it("trainchat_elite_monthly → elite / monthly", () => {
    expect(detectPlanFromLookupKey("trainchat_elite_monthly")).toEqual({
      plan: "elite",
      billingInterval: "monthly",
    });
  });

  it("trainchat_elite_yearly → elite / yearly", () => {
    expect(detectPlanFromLookupKey("trainchat_elite_yearly")).toEqual({
      plan: "elite",
      billingInterval: "yearly",
    });
  });

  // ── Invalid / unrecognised inputs ──────────────────────────────────────────

  it("null → null", () => {
    expect(detectPlanFromLookupKey(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(detectPlanFromLookupKey(undefined)).toBeNull();
  });

  it("empty string → null", () => {
    expect(detectPlanFromLookupKey("")).toBeNull();
  });

  it("arbitrary Stripe price ID → null (not a lookup key)", () => {
    expect(detectPlanFromLookupKey("price_1ABC2defGHIjklMN")).toBeNull();
  });

  it("wrong prefix → null", () => {
    expect(detectPlanFromLookupKey("gym_monthly")).toBeNull();
  });

  it("unknown tier in key → null", () => {
    expect(detectPlanFromLookupKey("trainchat_premium_monthly")).toBeNull();
  });

  it("missing interval → null", () => {
    expect(detectPlanFromLookupKey("trainchat_pro")).toBeNull();
  });

  it("wrong interval → null", () => {
    expect(detectPlanFromLookupKey("trainchat_pro_weekly")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. detectIntervalFromPriceId()
// ═══════════════════════════════════════════════════════════════════════════════

describe("detectIntervalFromPriceId()", () => {
  it("lookup_key trainchat_monthly → monthly", () => {
    expect(detectIntervalFromPriceId("price_abc", "trainchat_monthly")).toBe("monthly");
  });

  it("lookup_key trainchat_pro_yearly → yearly", () => {
    expect(detectIntervalFromPriceId("price_abc", "trainchat_pro_yearly")).toBe("yearly");
  });

  it("lookup_key trainchat_starter_monthly → monthly", () => {
    expect(detectIntervalFromPriceId("price_abc", "trainchat_starter_monthly")).toBe("monthly");
  });

  it("no lookup_key + unknown price ID → defaults to monthly", () => {
    // No STRIPE_PRICE_*_YEARLY env vars set in tests, so YEARLY_PRICE_IDS is empty
    expect(detectIntervalFromPriceId("price_unknownXYZ")).toBe("monthly");
  });

  it("null lookup_key → defaults to monthly", () => {
    expect(detectIntervalFromPriceId("price_abc", null)).toBe("monthly");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. normalizePlanStatus()
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizePlanStatus()", () => {
  it("active → active", () => expect(normalizePlanStatus("active")).toBe("active"));
  it("trialing → active", () => expect(normalizePlanStatus("trialing")).toBe("active"));
  it("past_due → past_due", () => expect(normalizePlanStatus("past_due")).toBe("past_due"));
  it("incomplete → incomplete", () => expect(normalizePlanStatus("incomplete")).toBe("incomplete"));
  it("incomplete_expired → restricted", () => expect(normalizePlanStatus("incomplete_expired")).toBe("restricted"));
  it("unpaid → restricted", () => expect(normalizePlanStatus("unpaid")).toBe("restricted"));
  it("paused → restricted", () => expect(normalizePlanStatus("paused")).toBe("restricted"));
  it("canceled → canceled", () => expect(normalizePlanStatus("canceled")).toBe("canceled"));

  it("unknown status is passed through (future-proof)", () => {
    expect(normalizePlanStatus("some_new_stripe_status")).toBe("some_new_stripe_status");
  });

  it("trialing maps to active — no restricted access during trial", () => {
    expect(normalizePlanStatus("trialing")).toBe("active");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. buildSyncPayload()
// ═══════════════════════════════════════════════════════════════════════════════

function makeSub(overrides: object = {}) {
  return {
    id: "sub_test123",
    status: "active",
    customer: "cus_test123",
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    trial_end: null,
    items: {
      data: [
        {
          price: {
            id: "price_test",
            lookup_key: "trainchat_monthly",
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("buildSyncPayload()", () => {
  it("returns a full payload for a valid active subscription", () => {
    const payload = buildSyncPayload(makeSub());
    expect(payload).not.toBeNull();
    expect(payload!.plan).toBe("pro");
    expect(payload!.planStatus).toBe("active");
    expect(payload!.billingInterval).toBe("monthly");
    expect(payload!.stripeCustomerId).toBe("cus_test123");
    expect(payload!.stripeSubscriptionId).toBe("sub_test123");
    expect(payload!.stripePriceId).toBe("price_test");
    expect(payload!.cancelAtPeriodEnd).toBe(false);
    expect(payload!.currentPeriodEnd).toBeInstanceOf(Date);
    expect(payload!.trialEnd).toBeNull();
  });

  it("maps trainchat_monthly lookup_key to plan=pro", () => {
    const payload = buildSyncPayload(makeSub());
    expect(payload!.plan).toBe("pro");
  });

  it("maps trainchat_starter_monthly lookup_key to plan=starter", () => {
    const payload = buildSyncPayload(
      makeSub({
        items: { data: [{ price: { id: "price_starter", lookup_key: "trainchat_starter_monthly" } }] },
      })
    );
    expect(payload!.plan).toBe("starter");
    expect(payload!.billingInterval).toBe("monthly");
  });

  it("maps trainchat_pro_yearly lookup_key to plan=pro interval=yearly", () => {
    const payload = buildSyncPayload(
      makeSub({
        items: { data: [{ price: { id: "price_pro_yr", lookup_key: "trainchat_pro_yearly" } }] },
      })
    );
    expect(payload!.plan).toBe("pro");
    expect(payload!.billingInterval).toBe("yearly");
  });

  it("maps trialing status → planStatus=active", () => {
    const payload = buildSyncPayload(makeSub({ status: "trialing" }));
    expect(payload!.planStatus).toBe("active");
  });

  it("maps canceled status → planStatus=canceled", () => {
    const payload = buildSyncPayload(makeSub({ status: "canceled" }));
    expect(payload!.planStatus).toBe("canceled");
  });

  it("maps unpaid status → planStatus=restricted", () => {
    const payload = buildSyncPayload(makeSub({ status: "unpaid" }));
    expect(payload!.planStatus).toBe("restricted");
  });

  it("maps incomplete_expired status → planStatus=restricted", () => {
    const payload = buildSyncPayload(makeSub({ status: "incomplete_expired" }));
    expect(payload!.planStatus).toBe("restricted");
  });

  it("returns null when customer is missing", () => {
    const payload = buildSyncPayload(makeSub({ customer: "" }));
    expect(payload).toBeNull();
  });

  it("returns null when price item is missing", () => {
    const payload = buildSyncPayload(makeSub({ items: { data: [] } }));
    expect(payload).toBeNull();
  });

  it("throws when lookup_key is unrecognized and no env-var fallback", () => {
    expect(() =>
      buildSyncPayload(
        makeSub({
          items: { data: [{ price: { id: "price_unknown_xyz", lookup_key: "gym_weekly" } }] },
        })
      )
    ).toThrow(/Unknown Stripe price ID/);
  });

  it("sets trialEnd from trial_end unix timestamp when present", () => {
    const trialTs = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
    const payload = buildSyncPayload(makeSub({ trial_end: trialTs }));
    expect(payload!.trialEnd).toBeInstanceOf(Date);
    expect(payload!.trialEnd!.getTime()).toBeCloseTo(trialTs * 1000, -3);
  });

  it("sets cancelAtPeriodEnd=true when sub.cancel_at_period_end=true", () => {
    const payload = buildSyncPayload(makeSub({ cancel_at_period_end: true }));
    expect(payload!.cancelAtPeriodEnd).toBe(true);
  });

  it("handles customer as nested object (expanded Stripe resource)", () => {
    const payload = buildSyncPayload(
      makeSub({ customer: { id: "cus_expanded" } })
    );
    expect(payload!.stripeCustomerId).toBe("cus_expanded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WebhookHandlers.processWebhook()
// ═══════════════════════════════════════════════════════════════════════════════

describe("WebhookHandlers.processWebhook()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: StripeSync succeeds, hasProcessedEvent returns false
    mockStripeSync.processWebhook.mockResolvedValue(undefined);
    (stripeStorage.hasProcessedEvent as MockedFunction<typeof stripeStorage.hasProcessedEvent>)
      .mockResolvedValue(false);
    (stripeStorage.markEventProcessed as MockedFunction<typeof stripeStorage.markEventProcessed>)
      .mockResolvedValue(undefined);
  });

  // ── Non-buffer payload ─────────────────────────────────────────────────────

  it("throws immediately if payload is not a Buffer (middleware misconfiguration guard)", async () => {
    await expect(
      WebhookHandlers.processWebhook("{}" as any, "sig_abc")
    ).rejects.toThrow(/Payload must be a Buffer/);
  });

  it("non-buffer error is thrown before StripeSync is called", async () => {
    await expect(
      WebhookHandlers.processWebhook("not a buffer" as any, "sig")
    ).rejects.toThrow();
    expect(mockStripeSync.processWebhook).not.toHaveBeenCalled();
  });

  // ── Invalid signature → StripeSync throws ─────────────────────────────────

  it("propagates StripeSync signature error (caller returns HTTP 400)", async () => {
    mockStripeSync.processWebhook.mockRejectedValue(
      new Error("No signatures found matching the expected signature for payload")
    );
    const payload = makeBuffer(makeEvent("customer.subscription.updated"));
    await expect(
      WebhookHandlers.processWebhook(payload, "bad_signature")
    ).rejects.toThrow(/No signatures found/);
  });

  it("does not write to DB when signature verification fails", async () => {
    mockStripeSync.processWebhook.mockRejectedValue(new Error("signature error"));
    const payload = makeBuffer(makeEvent("invoice.paid"));
    await expect(WebhookHandlers.processWebhook(payload, "x")).rejects.toThrow();
    expect(stripeStorage.hasProcessedEvent).not.toHaveBeenCalled();
    expect(stripeStorage.markEventProcessed).not.toHaveBeenCalled();
  });

  // ── Unhandled event type ───────────────────────────────────────────────────

  it("silently skips events not in HANDLED_EVENTS", async () => {
    const event = makeEvent("payment_intent.created");
    const payload = makeBuffer(event);
    await WebhookHandlers.processWebhook(payload, "sig");
    expect(stripeStorage.hasProcessedEvent).not.toHaveBeenCalled();
    expect(stripeStorage.markEventProcessed).not.toHaveBeenCalled();
  });

  it("does not throw for an unknown event type", async () => {
    const payload = makeBuffer(makeEvent("some.future.event"));
    await expect(WebhookHandlers.processWebhook(payload, "sig")).resolves.toBeUndefined();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("skips business logic when event ID was already processed", async () => {
    (stripeStorage.hasProcessedEvent as MockedFunction<typeof stripeStorage.hasProcessedEvent>)
      .mockResolvedValue(true);

    const event = makeEvent("customer.subscription.updated");
    const payload = makeBuffer(event);
    await WebhookHandlers.processWebhook(payload, "sig");

    // Idempotency check ran
    expect(stripeStorage.hasProcessedEvent).toHaveBeenCalledWith(event.id);
    // markEventProcessed must NOT run (event was already recorded)
    expect(stripeStorage.markEventProcessed).not.toHaveBeenCalled();
    // syncUserSubscription must NOT run
    expect(stripeStorage.syncUserSubscription).not.toHaveBeenCalled();
  });

  it("checks idempotency using the exact Stripe event ID", async () => {
    (stripeStorage.hasProcessedEvent as MockedFunction<typeof stripeStorage.hasProcessedEvent>)
      .mockResolvedValue(true);

    const event = makeEvent("invoice.paid");
    const eventId = event.id;
    const payload = makeBuffer(event);
    await WebhookHandlers.processWebhook(payload, "sig");

    expect(stripeStorage.hasProcessedEvent).toHaveBeenCalledWith(eventId);
  });

  // ── Successful new event ───────────────────────────────────────────────────

  it("marks event processed after successful business logic", async () => {
    // Provide a no-user-found scenario so handleSubscriptionUpsert exits early
    // but still reaches markEventProcessed.
    (stripeStorage.getUserByStripeCustomerId as MockedFunction<typeof stripeStorage.getUserByStripeCustomerId>)
      .mockResolvedValue(null);

    const event = makeEvent("customer.subscription.created");
    const payload = makeBuffer(event);
    await WebhookHandlers.processWebhook(payload, "sig");

    expect(stripeStorage.markEventProcessed).toHaveBeenCalledWith(event.id, event.type);
  });

  it("calls hasProcessedEvent before dispatching any business logic", async () => {
    const order: string[] = [];
    (stripeStorage.hasProcessedEvent as MockedFunction<typeof stripeStorage.hasProcessedEvent>)
      .mockImplementation(async () => { order.push("hasProcessed"); return false; });
    (stripeStorage.getUserByStripeCustomerId as MockedFunction<typeof stripeStorage.getUserByStripeCustomerId>)
      .mockImplementation(async () => { order.push("getUserByCustomer"); return null; });

    const event = makeEvent("customer.subscription.updated");
    await WebhookHandlers.processWebhook(makeBuffer(event), "sig");

    expect(order[0]).toBe("hasProcessed");
    expect(order[1]).toBe("getUserByCustomer");
  });

  it("each unique event ID is processed independently", async () => {
    (stripeStorage.getUserByStripeCustomerId as MockedFunction<typeof stripeStorage.getUserByStripeCustomerId>)
      .mockResolvedValue(null);

    const event1 = makeEvent("customer.subscription.updated");
    const event2 = makeEvent("customer.subscription.updated");
    // Ensure different IDs
    expect(event1.id).not.toBe(event2.id);

    await WebhookHandlers.processWebhook(makeBuffer(event1), "sig");
    await WebhookHandlers.processWebhook(makeBuffer(event2), "sig");

    expect(stripeStorage.markEventProcessed).toHaveBeenCalledTimes(2);
    expect(stripeStorage.markEventProcessed).toHaveBeenCalledWith(event1.id, event1.type);
    expect(stripeStorage.markEventProcessed).toHaveBeenCalledWith(event2.id, event2.type);
  });

  // ── Signature is passed through to StripeSync ─────────────────────────────

  it("passes raw Buffer and signature string to StripeSync unchanged", async () => {
    (stripeStorage.getUserByStripeCustomerId as MockedFunction<typeof stripeStorage.getUserByStripeCustomerId>)
      .mockResolvedValue(null);

    const event = makeEvent("customer.subscription.updated");
    const buf = makeBuffer(event);
    const sig = "t=1234,v1=abc123";
    await WebhookHandlers.processWebhook(buf, sig);

    expect(mockStripeSync.processWebhook).toHaveBeenCalledWith(buf, sig);
  });

  // ── All HANDLED_EVENTS are routed ─────────────────────────────────────────

  const HANDLED = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ];

  it.each(HANDLED)("routes %s through to business logic", async (eventType) => {
    (stripeStorage.getUserByStripeCustomerId as MockedFunction<typeof stripeStorage.getUserByStripeCustomerId>)
      .mockResolvedValue(null);
    (stripeStorage.getUser as MockedFunction<typeof stripeStorage.getUser>)
      .mockResolvedValue(null);
    (stripeStorage.getUserByEmail as MockedFunction<typeof stripeStorage.getUserByEmail>)
      .mockResolvedValue(null);

    const event = makeEvent(eventType, { customer_details: { email: "test@example.com" } });
    await WebhookHandlers.processWebhook(makeBuffer(event), "sig");

    // idempotency check must have run — meaning it entered business-logic path
    expect(stripeStorage.hasProcessedEvent).toHaveBeenCalled();
  });
});
