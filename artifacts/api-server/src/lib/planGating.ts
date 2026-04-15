import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PlanTier } from "@workspace/db";

export const FREE_MESSAGE_LIMIT = 5;
export const STARTER_MESSAGE_LIMIT = 75;

// Anonymous users (device-ID authenticated, not yet registered) get 8 free
// interactions — enough to build and refine a real program before the paywall.
export const ANON_MESSAGE_LIMIT = 8;

export interface PlanFeatures {
  unlimitedMessages: boolean;
  adaptationContext: boolean;
  memoryContext: boolean;
  insightHints: boolean;
  programEvolution: boolean;
  priorityAI: boolean;
  sessionLogging: boolean;
}

export function getPlanFeatures(plan: PlanTier): PlanFeatures {
  switch (plan) {
    case "elite":
      return {
        unlimitedMessages: true,
        adaptationContext: true,
        memoryContext: true,
        insightHints: true,
        programEvolution: true,
        priorityAI: true,
        sessionLogging: true,
      };
    case "pro":
      return {
        unlimitedMessages: true,
        adaptationContext: true,
        memoryContext: true,
        insightHints: true,
        programEvolution: true,
        priorityAI: false,
        sessionLogging: true,
      };
    case "starter":
      return {
        unlimitedMessages: false,
        adaptationContext: false,
        memoryContext: false,
        insightHints: false,
        programEvolution: false,
        priorityAI: false,
        sessionLogging: false,
      };
    default:
      return {
        unlimitedMessages: false,
        adaptationContext: false,
        memoryContext: false,
        insightHints: false,
        programEvolution: false,
        priorityAI: false,
        sessionLogging: false,
      };
  }
}

// ─── Subscription access check ────────────────────────────────────────────────
//
// Determines effective access from persisted subscription state.
// Rules:
//   active/trialing                           → full plan access
//   canceled + currentPeriodEnd in future     → keep access until period ends
//   past_due                                  → keep access (Stripe retry window)
//   incomplete/restricted/no subscription     → free tier
//   cancelAtPeriodEnd=true + within period    → full access until period ends

export function checkSubscriptionAccess(user: {
  plan: PlanTier;
  planStatus: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
}): { effectivePlan: PlanTier; hasActiveAccess: boolean; accessReason: string } {
  const now = new Date();

  if (!user.stripeSubscriptionId) {
    return { effectivePlan: "free", hasActiveAccess: false, accessReason: "no_subscription" };
  }

  const planStatus = user.planStatus;
  const periodEnd = user.currentPeriodEnd;
  const withinPeriod = periodEnd ? now < periodEnd : false;

  if (planStatus === "active" || planStatus === "trialing") {
    return {
      effectivePlan: user.plan,
      hasActiveAccess: true,
      accessReason: planStatus,
    };
  }

  if (planStatus === "past_due") {
    return {
      effectivePlan: user.plan,
      hasActiveAccess: true,
      accessReason: "past_due_grace",
    };
  }

  if (planStatus === "canceled" && withinPeriod) {
    return {
      effectivePlan: user.plan,
      hasActiveAccess: true,
      accessReason: "canceled_within_period",
    };
  }

  return { effectivePlan: "free", hasActiveAccess: false, accessReason: planStatus };
}

export async function getUserPlanInfo(userId: number): Promise<{
  plan: PlanTier;
  planStatus: string;
  messageCount: number;
  features: PlanFeatures;
  canSendMessage: boolean;
  messagesRemaining: number | null;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  hasActiveAccess: boolean;
  isAnonymous: boolean;
}> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("User not found");

  const messageCount = user.messageCount ?? 0;

  // ── Anonymous users bypass subscription logic and use a simple message cap ──
  if (user.isAnonymous) {
    const messagesRemaining = Math.max(0, ANON_MESSAGE_LIMIT - messageCount);
    return {
      plan: "free",
      planStatus: "active",
      messageCount,
      features: getPlanFeatures("free"),
      canSendMessage: messageCount < ANON_MESSAGE_LIMIT,
      messagesRemaining,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      hasActiveAccess: false,
      isAnonymous: true,
    };
  }

  // ── Registered users: check subscription access ───────────────────────────
  const { effectivePlan, hasActiveAccess } = checkSubscriptionAccess({
    plan: (user.plan ?? "free") as PlanTier,
    planStatus: user.planStatus ?? "active",
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: user.stripeSubscriptionId ?? null,
  });

  const features = getPlanFeatures(effectivePlan);

  let canSendMessage = true;
  let messagesRemaining: number | null = null;

  if (effectivePlan === "free") {
    messagesRemaining = Math.max(0, FREE_MESSAGE_LIMIT - messageCount);
    canSendMessage = messageCount < FREE_MESSAGE_LIMIT;
  } else if (effectivePlan === "starter") {
    messagesRemaining = Math.max(0, STARTER_MESSAGE_LIMIT - messageCount);
    canSendMessage = messageCount < STARTER_MESSAGE_LIMIT;
  }

  return {
    plan: effectivePlan,
    planStatus: user.planStatus ?? "active",
    messageCount,
    features,
    canSendMessage,
    messagesRemaining,
    billingInterval: user.billingInterval ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
    trialEnd: user.trialEnd ?? null,
    hasActiveAccess,
    isAnonymous: false,
  };
}

export const PLAN_DISPLAY: Record<
  PlanTier,
  { name: string; price: number; yearlyPrice: number; badge?: string }
> = {
  free: { name: "Free", price: 0, yearlyPrice: 0 },
  starter: { name: "Starter", price: 19, yearlyPrice: 182 },
  pro: { name: "Pro", price: 39, yearlyPrice: 374, badge: "Most Popular" },
  elite: { name: "Elite", price: 79, yearlyPrice: 758, badge: "High Performance" },
};
