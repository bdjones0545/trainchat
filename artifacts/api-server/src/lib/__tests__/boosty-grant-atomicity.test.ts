/**
 * boosty-grant-atomicity.test.ts
 *
 * The failure this file exists for: a purchase whose grant fails must NOT be
 * marked processed, because the webhook's idempotency check would then skip
 * every Stripe retry — money taken, nothing delivered, permanently, with the
 * automatic recovery mechanism disabled.
 *
 * The fix has two halves and both are asserted here:
 *   1. The ledger insert and the entitlement write share one transaction, so a
 *      failure cannot leave the idempotency guard standing with no grant behind
 *      it.
 *   2. A transient failure THROWS, so it bubbles past markEventProcessed and
 *      Stripe retries. A permanent data failure does not throw, because no
 *      number of retries will fix a malformed player id.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTransaction, mockInsert } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { transaction: mockTransaction, insert: mockInsert, select: vi.fn(), execute: vi.fn() },
  boostyEntitlementsTable: { playerId: "player_id", skus: "skus", bundle: "bundle", sparksPurchased: "sparks_purchased" },
  boostyPurchasesTable: { stripeSessionId: "stripe_session_id", id: "id" },
  eq: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
  inArray: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PLAYER = "plr_5c15bfe5ea134c78";

function purchaseArgs(over: Record<string, any> = {}) {
  return {
    playerId: PLAYER,
    sku: { id: "bundle.all", kind: "bundle" as const, name: "The Whole Locker", cents: 999, priceEnv: "X" },
    stripeSessionId: "cs_atomic_1",
    amountCents: 999,
    currency: "usd",
    ...over,
  };
}

/** A transaction stub whose entitlement write can be made to fail. */
function txStub({ ledgerInserted = true, entitlementFails = false } = {}) {
  let call = 0;
  return {
    insert: () => {
      call++;
      const isLedger = call === 1;
      const chain: any = {
        values: () => chain,
        onConflictDoNothing: () => chain,
        onConflictDoUpdate: () => {
          if (entitlementFails) return Promise.reject(new Error("deadlock detected"));
          return Promise.resolve();
        },
        returning: () => Promise.resolve(isLedger && ledgerInserted ? [{ id: 1 }] : []),
        then: (res: any) => res(undefined),
      };
      return chain;
    },
  };
}

describe("BOOSTY grant atomicity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants when both writes succeed", async () => {
    mockTransaction.mockImplementation(async (fn: any) => fn(txStub()));
    const { boostyStorage } = await import("../boostyStorage");
    const res = await boostyStorage.recordPurchase(purchaseArgs());
    expect(res).toEqual({ applied: true });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("THROWS when the entitlement write fails, so Stripe retries", async () => {
    // A real transaction rejects and rolls back; model that faithfully.
    mockTransaction.mockImplementation(async (fn: any) => {
      await fn(txStub({ entitlementFails: true }));
    });
    const { boostyStorage } = await import("../boostyStorage");
    await expect(boostyStorage.recordPurchase(purchaseArgs())).rejects.toThrow("deadlock detected");
  });

  it("THROWS when the database is unavailable, so Stripe retries", async () => {
    mockTransaction.mockRejectedValue(new Error("connection terminated"));
    const { boostyStorage } = await import("../boostyStorage");
    await expect(boostyStorage.recordPurchase(purchaseArgs())).rejects.toThrow("connection terminated");
  });

  it("does NOT throw on a redelivery — that is idempotent success, not an error", async () => {
    mockTransaction.mockImplementation(async (fn: any) => fn(txStub({ ledgerInserted: false })));
    const { boostyStorage } = await import("../boostyStorage");
    const res = await boostyStorage.recordPurchase(purchaseArgs());
    expect(res).toEqual({ applied: false, reason: "duplicate" });
  });

  it("does NOT throw on a permanent data problem — retrying cannot fix bad data", async () => {
    mockTransaction.mockImplementation(async (fn: any) => fn(txStub()));
    const { boostyStorage } = await import("../boostyStorage");
    const res = await boostyStorage.recordPurchase(purchaseArgs({ playerId: "not-a-player" }));
    expect(res).toEqual({ applied: false, reason: "invalid-player-id" });
    // and it never opened a transaction at all
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("writes the ledger and the entitlement inside ONE transaction", async () => {
    let insertsInsideTx = 0;
    mockTransaction.mockImplementation(async (fn: any) => {
      const tx = txStub();
      const wrapped = { insert: (...a: any[]) => { insertsInsideTx++; return (tx.insert as any)(...a); } };
      return fn(wrapped);
    });
    const { boostyStorage } = await import("../boostyStorage");
    await boostyStorage.recordPurchase(purchaseArgs());
    expect(insertsInsideTx).toBe(2);        // ledger + entitlement, same tx
    expect(mockInsert).not.toHaveBeenCalled(); // nothing written outside it
  });
});
