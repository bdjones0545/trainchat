import type { PlanTier } from "@workspace/db";

/**
 * Minimal shape of the PlanInfo object that plan-gating logic depends on.
 * Matches the return type of getUserPlanInfo — only the fields actually used
 * by these helpers are required; the rest are not needed here.
 */
export type PlanGatingInfo = {
  plan: PlanTier;
  canSendMessage: boolean;
  messageCount: number;
  messagesRemaining: number | null;
  isAnonymous: boolean;
};

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Returns true when planInfo exists and the user cannot send a message.
 * A null planInfo (e.g. getUserPlanInfo threw) is treated as allowed so the
 * handler can proceed — same behaviour as the original `.catch(() => null)` pattern.
 */
export function isPaywallBlocked(planInfo: PlanGatingInfo | null): boolean {
  return planInfo != null && !planInfo.canSendMessage;
}

// ─── Message text ─────────────────────────────────────────────────────────────

/**
 * Produces the user-facing blocked message based on account type and plan tier.
 * Pure — no side effects.
 */
export function buildPaywallMessage(planInfo: PlanGatingInfo): string {
  if (planInfo.isAnonymous) {
    return `You've used your ${planInfo.messageCount} free interactions. Create your free account to keep training.`;
  }
  if (planInfo.plan === "free") {
    return "You've used your 5 free interactions. Upgrade to keep training with your AI coach.";
  }
  return "You've reached your monthly message limit. Upgrade to Pro for unlimited access.";
}

// ─── Response bodies ──────────────────────────────────────────────────────────

/**
 * Builds the HTTP 402 JSON body for the non-SSE (POST /messages) path.
 * Shape is unchanged from the original inline object.
 */
export function buildPaywallHttpBody(planInfo: PlanGatingInfo): Record<string, unknown> {
  return {
    error: "MESSAGE_LIMIT_REACHED",
    code: "PAYWALL",
    isAnonymous: planInfo.isAnonymous,
    message: buildPaywallMessage(planInfo),
    plan: planInfo.plan,
    messageCount: planInfo.messageCount,
    messagesRemaining: 0,
  };
}

/**
 * Builds the SSE error event for the streaming (POST /messages/stream) path.
 * Shape is unchanged from the original inline object.
 */
export function buildPaywallSseEvent(planInfo: PlanGatingInfo): Record<string, unknown> {
  return {
    type: "error",
    status: 402,
    code: "PAYWALL",
    isAnonymous: planInfo.isAnonymous,
    message: buildPaywallMessage(planInfo),
  };
}
