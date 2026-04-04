import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PlanTier } from "@workspace/db";

export const FREE_MESSAGE_LIMIT = 5;

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

export async function getUserPlanInfo(userId: number): Promise<{
  plan: PlanTier;
  planStatus: string;
  messageCount: number;
  features: PlanFeatures;
  canSendMessage: boolean;
  messagesRemaining: number | null;
}> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("User not found");

  const plan = (user.plan ?? "free") as PlanTier;
  const planStatus = user.planStatus ?? "active";
  const messageCount = user.messageCount ?? 0;
  const features = getPlanFeatures(plan);

  let canSendMessage = true;
  let messagesRemaining: number | null = null;

  if (plan === "free") {
    messagesRemaining = Math.max(0, FREE_MESSAGE_LIMIT - messageCount);
    canSendMessage = messageCount < FREE_MESSAGE_LIMIT;
  } else if (plan === "starter") {
    const STARTER_LIMIT = 75;
    messagesRemaining = Math.max(0, STARTER_LIMIT - messageCount);
    canSendMessage = messageCount < STARTER_LIMIT;
  }

  return { plan, planStatus, messageCount, features, canSendMessage, messagesRemaining };
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
