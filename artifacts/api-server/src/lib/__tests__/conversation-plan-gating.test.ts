import { describe, it, expect } from "vitest";
import {
  isPaywallBlocked,
  buildPaywallMessage,
  buildPaywallHttpBody,
  buildPaywallSseEvent,
  type PlanGatingInfo,
} from "../conversation-plan-gating";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAID_ALLOWED: PlanGatingInfo = {
  plan: "pro",
  canSendMessage: true,
  messageCount: 12,
  messagesRemaining: null,
  isAnonymous: false,
};

const FREE_ALLOWED: PlanGatingInfo = {
  plan: "free",
  canSendMessage: true,
  messageCount: 3,
  messagesRemaining: 2,
  isAnonymous: false,
};

const FREE_BLOCKED: PlanGatingInfo = {
  plan: "free",
  canSendMessage: false,
  messageCount: 5,
  messagesRemaining: 0,
  isAnonymous: false,
};

const PRO_BLOCKED: PlanGatingInfo = {
  plan: "pro",
  canSendMessage: false,
  messageCount: 300,
  messagesRemaining: 0,
  isAnonymous: false,
};

const ANON_BLOCKED: PlanGatingInfo = {
  plan: "free",
  canSendMessage: false,
  messageCount: 3,
  messagesRemaining: 0,
  isAnonymous: true,
};

// ─── isPaywallBlocked ─────────────────────────────────────────────────────────

describe("isPaywallBlocked", () => {
  it("returns false when planInfo is null (getUserPlanInfo threw)", () => {
    expect(isPaywallBlocked(null)).toBe(false);
  });

  it("returns false for a paid user who can send messages", () => {
    expect(isPaywallBlocked(PAID_ALLOWED)).toBe(false);
  });

  it("returns false for a free user who is still under their limit", () => {
    expect(isPaywallBlocked(FREE_ALLOWED)).toBe(false);
  });

  it("returns true for a free user who has hit their limit", () => {
    expect(isPaywallBlocked(FREE_BLOCKED)).toBe(true);
  });

  it("returns true for a pro user who has hit their monthly limit", () => {
    expect(isPaywallBlocked(PRO_BLOCKED)).toBe(true);
  });

  it("returns true for an anonymous user who has hit their limit", () => {
    expect(isPaywallBlocked(ANON_BLOCKED)).toBe(true);
  });
});

// ─── buildPaywallMessage ──────────────────────────────────────────────────────

describe("buildPaywallMessage", () => {
  it("uses messageCount in anonymous message", () => {
    const msg = buildPaywallMessage(ANON_BLOCKED);
    expect(msg).toContain("3 free interactions");
    expect(msg).toContain("Create your free account");
  });

  it("returns free-tier upgrade message for free plan blocked users", () => {
    const msg = buildPaywallMessage(FREE_BLOCKED);
    expect(msg).toContain("5 free interactions");
    expect(msg).toContain("Upgrade to keep training");
  });

  it("returns pro monthly-limit message for pro plan blocked users", () => {
    const msg = buildPaywallMessage(PRO_BLOCKED);
    expect(msg).toContain("monthly message limit");
    expect(msg).toContain("Upgrade to Pro");
  });

  it("prioritizes isAnonymous over plan tier", () => {
    // Anonymous users see the account-creation prompt even if plan is "free"
    const msg = buildPaywallMessage(ANON_BLOCKED);
    expect(msg).toContain("Create your free account");
    expect(msg).not.toContain("Upgrade to keep training");
  });
});

// ─── buildPaywallHttpBody ─────────────────────────────────────────────────────

describe("buildPaywallHttpBody", () => {
  it("sets error to MESSAGE_LIMIT_REACHED", () => {
    expect(buildPaywallHttpBody(FREE_BLOCKED).error).toBe("MESSAGE_LIMIT_REACHED");
  });

  it("sets code to PAYWALL", () => {
    expect(buildPaywallHttpBody(FREE_BLOCKED).code).toBe("PAYWALL");
  });

  it("mirrors isAnonymous from planInfo", () => {
    expect(buildPaywallHttpBody(ANON_BLOCKED).isAnonymous).toBe(true);
    expect(buildPaywallHttpBody(FREE_BLOCKED).isAnonymous).toBe(false);
  });

  it("includes plan tier from planInfo", () => {
    expect(buildPaywallHttpBody(FREE_BLOCKED).plan).toBe("free");
    expect(buildPaywallHttpBody(PRO_BLOCKED).plan).toBe("pro");
  });

  it("includes messageCount from planInfo", () => {
    expect(buildPaywallHttpBody(FREE_BLOCKED).messageCount).toBe(5);
  });

  it("always sets messagesRemaining to 0", () => {
    expect(buildPaywallHttpBody(FREE_BLOCKED).messagesRemaining).toBe(0);
    expect(buildPaywallHttpBody(PRO_BLOCKED).messagesRemaining).toBe(0);
  });

  it("includes the user-facing message string", () => {
    const body = buildPaywallHttpBody(FREE_BLOCKED);
    expect(typeof body.message).toBe("string");
    expect((body.message as string).length).toBeGreaterThan(0);
  });
});

// ─── buildPaywallSseEvent ─────────────────────────────────────────────────────

describe("buildPaywallSseEvent", () => {
  it("sets type to error", () => {
    expect(buildPaywallSseEvent(FREE_BLOCKED).type).toBe("error");
  });

  it("sets HTTP status 402", () => {
    expect(buildPaywallSseEvent(FREE_BLOCKED).status).toBe(402);
  });

  it("sets code to PAYWALL", () => {
    expect(buildPaywallSseEvent(FREE_BLOCKED).code).toBe("PAYWALL");
  });

  it("mirrors isAnonymous from planInfo", () => {
    expect(buildPaywallSseEvent(ANON_BLOCKED).isAnonymous).toBe(true);
    expect(buildPaywallSseEvent(FREE_BLOCKED).isAnonymous).toBe(false);
  });

  it("includes the user-facing message string", () => {
    const event = buildPaywallSseEvent(FREE_BLOCKED);
    expect(typeof event.message).toBe("string");
    expect((event.message as string).length).toBeGreaterThan(0);
  });

  it("does not include messageCount or plan fields (SSE shape is leaner than HTTP)", () => {
    const event = buildPaywallSseEvent(FREE_BLOCKED);
    expect(event).not.toHaveProperty("messageCount");
    expect(event).not.toHaveProperty("plan");
  });
});
