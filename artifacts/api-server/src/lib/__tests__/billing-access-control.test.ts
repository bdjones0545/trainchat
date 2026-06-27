/**
 * billing-access-control.test.ts
 *
 * Pure unit tests for plan-gating and subscription access logic.
 * No database, no Stripe calls — all pure functions.
 *
 * Coverage:
 *  1. getPlanFeatures() — all four plan tiers
 *  2. checkSubscriptionAccess() — every meaningful state combination
 *  3. PLAN_DISPLAY — regression: all paid tiers display as "TrainChat" at $49.99
 *  4. FREE_MESSAGE_LIMIT / ANON_MESSAGE_LIMIT constants present
 */

import { describe, it, expect, vi } from "vitest";

// ── Module mocks (must precede any imports that touch the DB) ──────────────────
// planGating.ts imports { db, usersTable } at module level; mock so tests don't
// need a live DATABASE_URL.
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
  usersTable: {},
  eq: vi.fn(),
}));

import {
  getPlanFeatures,
  checkSubscriptionAccess,
  PLAN_DISPLAY,
  FREE_MESSAGE_LIMIT,
  ANON_MESSAGE_LIMIT,
} from "../planGating";

// ─── Helper ───────────────────────────────────────────────────────────────────

function baseUser(overrides: Partial<Parameters<typeof checkSubscriptionAccess>[0]> = {}) {
  return {
    plan: "pro" as const,
    planStatus: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: "sub_test123",
    ...overrides,
  };
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);  // +7 days
const PAST   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);  // -7 days

// ═══════════════════════════════════════════════════════════════════════════════
// 1. getPlanFeatures()
// ═══════════════════════════════════════════════════════════════════════════════

describe("getPlanFeatures()", () => {
  it("free plan has all features disabled", () => {
    const f = getPlanFeatures("free");
    expect(f.unlimitedMessages).toBe(false);
    expect(f.adaptationContext).toBe(false);
    expect(f.memoryContext).toBe(false);
    expect(f.insightHints).toBe(false);
    expect(f.programEvolution).toBe(false);
    expect(f.priorityAI).toBe(false);
    expect(f.sessionLogging).toBe(false);
  });

  it("pro plan (current TrainChat) has all features enabled", () => {
    const f = getPlanFeatures("pro");
    expect(f.unlimitedMessages).toBe(true);
    expect(f.adaptationContext).toBe(true);
    expect(f.memoryContext).toBe(true);
    expect(f.insightHints).toBe(true);
    expect(f.programEvolution).toBe(true);
    expect(f.priorityAI).toBe(true);
    expect(f.sessionLogging).toBe(true);
  });

  it("starter (legacy) has all features enabled", () => {
    const f = getPlanFeatures("starter");
    expect(f.unlimitedMessages).toBe(true);
    expect(f.memoryContext).toBe(true);
    expect(f.adaptationContext).toBe(true);
  });

  it("elite (legacy) has all features enabled", () => {
    const f = getPlanFeatures("elite");
    expect(f.unlimitedMessages).toBe(true);
    expect(f.priorityAI).toBe(true);
    expect(f.sessionLogging).toBe(true);
  });

  it("no feature gating between legacy tiers — all paid tiers are equivalent", () => {
    const starter = getPlanFeatures("starter");
    const pro     = getPlanFeatures("pro");
    const elite   = getPlanFeatures("elite");
    expect(starter).toEqual(pro);
    expect(pro).toEqual(elite);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. checkSubscriptionAccess()
// ═══════════════════════════════════════════════════════════════════════════════

describe("checkSubscriptionAccess()", () => {
  it("active subscription → full access", () => {
    const { hasActiveAccess, effectivePlan, accessReason } = checkSubscriptionAccess(
      baseUser({ planStatus: "active" })
    );
    expect(hasActiveAccess).toBe(true);
    expect(effectivePlan).toBe("pro");
    expect(accessReason).toBe("active");
  });

  it("trialing subscription → full access", () => {
    const { hasActiveAccess, accessReason } = checkSubscriptionAccess(
      baseUser({ planStatus: "trialing" })
    );
    expect(hasActiveAccess).toBe(true);
    expect(accessReason).toBe("trialing");
  });

  it("past_due → access preserved during retry window", () => {
    const { hasActiveAccess, accessReason } = checkSubscriptionAccess(
      baseUser({ planStatus: "past_due" })
    );
    expect(hasActiveAccess).toBe(true);
    expect(accessReason).toBe("past_due_grace");
  });

  it("canceled + period still in future → access preserved until period end", () => {
    const { hasActiveAccess, accessReason } = checkSubscriptionAccess(
      baseUser({ planStatus: "canceled", currentPeriodEnd: FUTURE })
    );
    expect(hasActiveAccess).toBe(true);
    expect(accessReason).toBe("canceled_within_period");
  });

  it("canceled + period already past → no access", () => {
    const { hasActiveAccess, effectivePlan } = checkSubscriptionAccess(
      baseUser({ planStatus: "canceled", currentPeriodEnd: PAST })
    );
    expect(hasActiveAccess).toBe(false);
    expect(effectivePlan).toBe("free");
  });

  it("canceled + no currentPeriodEnd → no access (treated as past)", () => {
    const { hasActiveAccess } = checkSubscriptionAccess(
      baseUser({ planStatus: "canceled", currentPeriodEnd: null })
    );
    expect(hasActiveAccess).toBe(false);
  });

  it("restricted (incomplete_expired) → no access", () => {
    const { hasActiveAccess, effectivePlan } = checkSubscriptionAccess(
      baseUser({ planStatus: "restricted" })
    );
    expect(hasActiveAccess).toBe(false);
    expect(effectivePlan).toBe("free");
  });

  it("no subscription ID at all → no access regardless of planStatus", () => {
    const { hasActiveAccess, effectivePlan, accessReason } = checkSubscriptionAccess(
      baseUser({ stripeSubscriptionId: null, planStatus: "active" })
    );
    expect(hasActiveAccess).toBe(false);
    expect(effectivePlan).toBe("free");
    expect(accessReason).toBe("no_subscription");
  });

  it("legacy starter subscriber → full access when active", () => {
    const { hasActiveAccess, effectivePlan } = checkSubscriptionAccess(
      baseUser({ plan: "starter", planStatus: "active" })
    );
    expect(hasActiveAccess).toBe(true);
    expect(effectivePlan).toBe("starter");
  });

  it("legacy elite subscriber → full access when active", () => {
    const { hasActiveAccess, effectivePlan } = checkSubscriptionAccess(
      baseUser({ plan: "elite", planStatus: "active" })
    );
    expect(hasActiveAccess).toBe(true);
    expect(effectivePlan).toBe("elite");
  });

  it("legacy starter subscriber canceled in-period → still has access", () => {
    const { hasActiveAccess } = checkSubscriptionAccess(
      baseUser({ plan: "starter", planStatus: "canceled", currentPeriodEnd: FUTURE })
    );
    expect(hasActiveAccess).toBe(true);
  });

  it("unpaid subscriber → no access (maps to restricted planStatus)", () => {
    // Stripe "unpaid" normalizes to "restricted" in our system
    const { hasActiveAccess } = checkSubscriptionAccess(
      baseUser({ planStatus: "restricted" })
    );
    expect(hasActiveAccess).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PLAN_DISPLAY — regression guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("PLAN_DISPLAY regression — single TrainChat branding", () => {
  it("free plan shows $0", () => {
    expect(PLAN_DISPLAY.free.price).toBe(0);
    expect(PLAN_DISPLAY.free.name).toBe("Free");
  });

  it("starter (legacy) displays as TrainChat at $49.99", () => {
    expect(PLAN_DISPLAY.starter.name).toBe("TrainChat");
    expect(PLAN_DISPLAY.starter.price).toBe(49.99);
  });

  it("pro (current TrainChat) displays as TrainChat at $49.99", () => {
    expect(PLAN_DISPLAY.pro.name).toBe("TrainChat");
    expect(PLAN_DISPLAY.pro.price).toBe(49.99);
  });

  it("elite (legacy) displays as TrainChat at $49.99", () => {
    expect(PLAN_DISPLAY.elite.name).toBe("TrainChat");
    expect(PLAN_DISPLAY.elite.price).toBe(49.99);
  });

  it("all paid tiers have identical display properties", () => {
    const { starter, pro, elite } = PLAN_DISPLAY;
    expect(starter.name).toBe(pro.name);
    expect(pro.name).toBe(elite.name);
    expect(starter.price).toBe(pro.price);
    expect(pro.price).toBe(elite.price);
  });

  it("no legacy tier names exposed (Starter / Pro / Elite) in display", () => {
    const names = [PLAN_DISPLAY.starter.name, PLAN_DISPLAY.pro.name, PLAN_DISPLAY.elite.name];
    expect(names.some((n) => n === "Starter" || n === "Pro" || n === "Elite")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Message limit constants
// ═══════════════════════════════════════════════════════════════════════════════

describe("Message limit constants", () => {
  it("FREE_MESSAGE_LIMIT is a positive integer", () => {
    expect(FREE_MESSAGE_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(FREE_MESSAGE_LIMIT)).toBe(true);
  });

  it("ANON_MESSAGE_LIMIT is less than or equal to FREE_MESSAGE_LIMIT", () => {
    expect(ANON_MESSAGE_LIMIT).toBeGreaterThan(0);
    expect(ANON_MESSAGE_LIMIT).toBeLessThanOrEqual(FREE_MESSAGE_LIMIT);
  });
});
