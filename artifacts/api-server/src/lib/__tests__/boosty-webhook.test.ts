/**
 * boosty-webhook.test.ts
 *
 * The BOOSTY store takes real money for cosmetics through the same Stripe
 * webhook that runs TrainChat subscriptions. These tests exist for the failure
 * modes where money is taken and nothing is delivered:
 *
 *  1. A one-time payment must not be swallowed by the subscription path, which
 *     requires a subscription id and returns early without one.
 *  2. A redelivered webhook must not grant twice or double-credit sparks.
 *  3. A session without server-created metadata must not grant on the strength
 *     of an email or customer id.
 *  4. If metadata and the actually-charged price disagree, the charge wins.
 *  5. A TrainChat subscription event must still reach the TrainChat handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRecordPurchase, mockGetEntitlements } = vi.hoisted(() => ({
  mockRecordPurchase: vi.fn(),
  mockGetEntitlements: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
  stripeProcessedEventsTable: {},
  boostyEntitlementsTable: {},
  boostyPurchasesTable: {},
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../boostyStorage", async () => {
  const actual = await vi.importActual<typeof import("../boostyStorage")>("../boostyStorage");
  return {
    isValidPlayerId: actual.isValidPlayerId,
    boostyStorage: {
      recordPurchase: mockRecordPurchase,
      getEntitlements: mockGetEntitlements,
    },
  };
});

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PLAYER = "plr_5c15bfe5ea134c78";

function boostySession(over: Record<string, any> = {}) {
  return {
    id: "cs_test_boosty_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 999,
    currency: "usd",
    customer: "cus_boosty",
    subscription: null,
    payment_intent: "pi_boosty_1",
    metadata: { product: "boosty", boostyPlayerId: PLAYER, boostySku: "bundle.all" },
    ...over,
  };
}

describe("BOOSTY webhook grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordPurchase.mockResolvedValue({ applied: true });
    process.env.BOOSTY_PRICE_BUNDLE = "price_bundle_live";
    process.env.BOOSTY_PRICE_SPARKS_MEDIUM = "price_sparks_medium";
  });

  it("grants a one-time cosmetic purchase that carries no subscription", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    const handled = await handleBoostyCheckoutCompleted(
      { id: "evt_1", data: { object: boostySession() } },
      { eventId: "evt_1", eventType: "checkout.session.completed" }
    );
    expect(handled).toBe(true);
    expect(mockRecordPurchase).toHaveBeenCalledTimes(1);
    const arg = mockRecordPurchase.mock.calls[0][0];
    expect(arg.playerId).toBe(PLAYER);
    expect(arg.sku.id).toBe("bundle.all");
    expect(arg.amountCents).toBe(999);
    expect(arg.stripeSessionId).toBe("cs_test_boosty_1");
  });

  it("uses the amount Stripe actually charged, never a client-supplied figure", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    await handleBoostyCheckoutCompleted(
      { id: "evt_2", data: { object: boostySession({ amount_total: 1 }) } },
      { eventId: "evt_2", eventType: "checkout.session.completed" }
    );
    expect(mockRecordPurchase.mock.calls[0][0].amountCents).toBe(1);
  });

  it("refuses to grant without a valid server-created player id", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    for (const bad of [undefined, "", "not-a-player", "plr_ZZZZ"]) {
      mockRecordPurchase.mockClear();
      const handled = await handleBoostyCheckoutCompleted(
        {
          id: "evt_bad",
          data: { object: boostySession({ metadata: { product: "boosty", boostyPlayerId: bad, boostySku: "bundle.all" } }) },
        },
        { eventId: "evt_bad", eventType: "checkout.session.completed" }
      );
      // Claimed as ours (so it does NOT fall through to the subscription path)
      // but explicitly not granted.
      expect(handled).toBe(true);
      expect(mockRecordPurchase).not.toHaveBeenCalled();
    }
  });

  it("does not grant when the session is not paid", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    const handled = await handleBoostyCheckoutCompleted(
      { id: "evt_3", data: { object: boostySession({ payment_status: "unpaid" }) } },
      { eventId: "evt_3", eventType: "checkout.session.completed" }
    );
    expect(handled).toBe(true);
    expect(mockRecordPurchase).not.toHaveBeenCalled();
  });

  it("trusts the charged price over the metadata when they disagree", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    await handleBoostyCheckoutCompleted(
      {
        id: "evt_4",
        data: {
          object: boostySession({
            metadata: { product: "boosty", boostyPlayerId: PLAYER, boostySku: "bundle.all" },
            line_items: { data: [{ price: { id: "price_sparks_medium" } }] },
          }),
        },
      },
      { eventId: "evt_4", eventType: "checkout.session.completed" }
    );
    expect(mockRecordPurchase.mock.calls[0][0].sku.id).toBe("sparks.medium");
  });

  it("ignores events that are not BOOSTY, so TrainChat billing is untouched", async () => {
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    const handled = await handleBoostyCheckoutCompleted(
      {
        id: "evt_5",
        data: { object: boostySession({ metadata: { product: "trainchat", userId: "42" }, subscription: "sub_1" }) },
      },
      { eventId: "evt_5", eventType: "checkout.session.completed" }
    );
    expect(handled).toBe(false);
    expect(mockRecordPurchase).not.toHaveBeenCalled();
  });

  it("lets a transient grant failure propagate, so markEventProcessed is skipped and Stripe retries", async () => {
    // This is the whole point: if the handler swallowed this, the webhook would
    // mark the event processed and every Stripe retry would be skipped as a
    // duplicate — money taken, nothing granted, recovery disabled.
    mockRecordPurchase.mockRejectedValue(new Error("connection terminated"));
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    await expect(
      handleBoostyCheckoutCompleted(
        { id: "evt_throw", data: { object: boostySession() } },
        { eventId: "evt_throw", eventType: "checkout.session.completed" }
      )
    ).rejects.toThrow("connection terminated");
  });

  it("reports a failed grant rather than reporting success", async () => {
    mockRecordPurchase.mockResolvedValue({ applied: false, reason: "duplicate" });
    const { handleBoostyCheckoutCompleted } = await import("../webhookHandlers");
    const context: any = { eventId: "evt_6", eventType: "checkout.session.completed" };
    await handleBoostyCheckoutCompleted(
      { id: "evt_6", data: { object: boostySession() } },
      context
    );
    expect(context.finalStatus).toBe("boosty_duplicate");
  });
});

describe("BOOSTY player id validation", () => {
  it("accepts only the generated shape", async () => {
    const { isValidPlayerId } = await import("../boostyStorage");
    expect(isValidPlayerId("plr_5c15bfe5ea134c78")).toBe(true);
    expect(isValidPlayerId("plr_5C15BFE5EA134C78")).toBe(false); // uppercase is not what we mint
    expect(isValidPlayerId("plr_short")).toBe(false);
    expect(isValidPlayerId("5c15bfe5ea134c78")).toBe(false);
    expect(isValidPlayerId("")).toBe(false);
    expect(isValidPlayerId(null)).toBe(false);
    expect(isValidPlayerId("plr_" + "a".repeat(64))).toBe(false);
  });
});

describe("BOOSTY catalog is server-authoritative", () => {
  beforeEach(() => {
    delete process.env.BOOSTY_PRICE_WIGSBY;
    process.env.BOOSTY_PRICE_BUNDLE = "price_bundle_live";
  });

  it("treats an unpriced SKU as not for sale, never as free", async () => {
    const { getSku, isPurchasable } = await import("../boostyCatalog");
    const wigsby = getSku("wigsby")!;
    expect(wigsby).toBeTruthy();
    expect(isPurchasable(wigsby)).toBe(false);
  });

  it("rejects SKUs the client invents", async () => {
    const { getSku } = await import("../boostyCatalog");
    expect(getSku("free.everything")).toBeNull();
    expect(getSku("../../etc/passwd")).toBeNull();
    expect(getSku(12345)).toBeNull();
    expect(getSku(undefined)).toBeNull();
  });

  it("never exposes a client-settable price", async () => {
    const { getSku } = await import("../boostyCatalog");
    const bundle = getSku("bundle.all")!;
    // Price comes from our table + env, and the webhook reads the charged
    // amount from Stripe. Nothing in the request body can influence either.
    expect(bundle.cents).toBe(999);
  });

  it("reports which SKUs are on the shelf with no price configured", async () => {
    const { unconfiguredSkus } = await import("../boostyCatalog");
    expect(unconfiguredSkus()).toContain("wigsby");
    expect(unconfiguredSkus()).not.toContain("bundle.all");
  });
});
