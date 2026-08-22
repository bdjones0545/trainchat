import { conversationsTable, db, messagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { beginChatTurn, finalizeChatTurn } from "../lib/chat-turn-integrity";
import { getUserPlanInfo } from "../lib/planGating";
import { isPaywallBlocked } from "../lib/conversation-plan-gating";
import { buildConversationContext } from "../lib/conversation-context-injection";
import type { AgentSettingsContext } from "../lib/agent-settings-resolver";
import { generateAIResponse } from "../lib/ai";
import { captureWithTags } from "../lib/sentry";
import { logger } from "../lib/logger";

export type ConversationFailureCategory =
  | "authorization"
  | "business_rule"
  | "provider_failure"
  | "timeout"
  | "malformed_structured_output"
  | "schema_validation_failure"
  | "hard_constraint_violation"
  | "exhausted_retry"
  | "persistence_failure";

export type CanonicalConversationOutcome =
  | {
      kind: "success" | "program_build" | "deterministic_mutation";
      payload: Record<string, unknown>;
      chargeQuota: boolean;
    }
  | {
      kind: "replay";
      payload: Record<string, unknown>;
      status: number;
      chargeQuota: false;
    }
  | {
      kind: "failure" | "safety_rejection";
      category: ConversationFailureCategory;
      status: number;
      code: string;
      message: string;
      chargeQuota: false;
      payload?: Record<string, unknown>;
    };

export type TerminalConversationOutcome = Extract<CanonicalConversationOutcome, { kind: "replay" }>
  | Extract<CanonicalConversationOutcome, { kind: "failure" | "safety_rejection" }>;

export type ConversationExecutionPreparation =
  | {
      state: "ready";
      turnId: number;
      planInfo: Awaited<ReturnType<typeof getUserPlanInfo>> | null;
      conversation: typeof conversationsTable.$inferSelect;
    }
  | {
      state: "terminal";
      outcome: TerminalConversationOutcome;
      planInfo: Awaited<ReturnType<typeof getUserPlanInfo>> | null;
    };

/**
 * Transport-independent entry boundary for an authenticated conversation turn.
 * Entitlement, ownership and durable turn claiming are resolved exactly once,
 * before either HTTP or SSE is allowed to persist a user message or execute AI.
 */
export async function prepareConversationExecution(input: {
  userId: number;
  conversationId: number;
  clientTurnId: string;
}): Promise<ConversationExecutionPreparation> {
  const planInfo = await getUserPlanInfo(input.userId).catch(() => null);
  if (isPaywallBlocked(planInfo)) {
    return {
      state: "terminal",
      planInfo,
      outcome: {
        kind: "failure",
        category: "business_rule",
        status: 402,
        code: "PAYWALL",
        message: "Your current plan does not allow another conversation turn.",
        chargeQuota: false,
      },
    };
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, input.conversationId));
  if (!conversation || conversation.userId !== input.userId) {
    return {
      state: "terminal",
      planInfo,
      outcome: {
        kind: "failure",
        category: "authorization",
        status: 404,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
        chargeQuota: false,
      },
    };
  }

  const claim = await beginChatTurn(input);
  if (claim.state === "duplicate") {
    if (claim.responsePayload) {
      return {
        state: "terminal",
        planInfo,
        outcome: {
          kind: "replay",
          payload: claim.responsePayload as Record<string, unknown>,
          status: claim.status === "succeeded" ? 200 : 409,
          chargeQuota: false,
        },
      };
    }
    const processing = claim.status === "processing";
    return {
      state: "terminal",
      planInfo,
      outcome: {
        kind: "failure",
        category: "business_rule",
        status: 409,
        code: processing ? "TURN_IN_PROGRESS" : "TURN_NOT_RETRYABLE",
        message: processing
          ? "This message is already being processed."
          : "This failed turn will not be executed twice. Submit a new message to retry.",
        chargeQuota: false,
      },
    };
  }

  return { state: "ready", turnId: claim.turnId, planInfo, conversation };
}

export function classifySuccessfulOutcome(payload: Record<string, unknown>): CanonicalConversationOutcome {
  const program = Boolean(payload.systemSaved || payload.systemId);
  const mutation = Boolean(payload.changeLogId || payload.auditReceipt);
  return {
    kind: program ? "program_build" : mutation ? "deterministic_mutation" : "success",
    payload,
    chargeQuota: true,
  };
}

export function classifyConversationOutcome(
  payload: Record<string, unknown>,
  status = 200,
): CanonicalConversationOutcome {
  const successful = status < 400
    && payload.outcomeType !== "true_failure"
    && (payload.type === "complete" || Boolean(payload.userMessage && payload.assistantMessage));
  if (successful) return classifySuccessfulOutcome(payload);
  const rawCategory = typeof payload.failureCategory === "string" ? payload.failureCategory : "persistence_failure";
  const category: ConversationFailureCategory = [
    "provider_failure", "timeout", "malformed_structured_output", "schema_validation_failure",
    "hard_constraint_violation", "exhausted_retry", "authorization", "business_rule", "persistence_failure",
  ].includes(rawCategory) ? rawCategory as ConversationFailureCategory : "persistence_failure";
  const code = typeof payload.code === "string"
    ? payload.code
    : category === "hard_constraint_violation" ? "HARD_CONSTRAINT_VIOLATION" : "CONVERSATION_EXECUTION_FAILED";
  return {
    kind: category === "hard_constraint_violation" ? "safety_rejection" : "failure",
    category,
    status,
    code,
    message: typeof payload.message === "string" ? payload.message : "The conversation turn could not be completed.",
    chargeQuota: false,
    payload,
  };
}

export function renderTerminalOutcome(
  outcome: TerminalConversationOutcome,
  transport: "http" | "sse",
): { status: number; payload: Record<string, unknown> } {
  if (outcome.kind === "replay") return { status: outcome.status, payload: outcome.payload };
  if (transport === "sse") {
    return {
      status: outcome.status,
      payload: { type: "error", status: outcome.status, code: outcome.code, message: outcome.message },
    };
  }
  return { status: outcome.status, payload: { error: outcome.message, code: outcome.code } };
}

/** One authoritative history/memory/constraint assembly path for both transports. */
export async function loadConversationExecutionContext(input: {
  userId: number;
  conversationId: number;
  userMessageContent: string;
  sessionFocusMode: Parameters<typeof buildConversationContext>[0]["sessionFocusMode"];
  agentSettings: AgentSettingsContext;
  planInfo: Awaited<ReturnType<typeof getUserPlanInfo>> | null;
}) {
  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, input.conversationId))
    .orderBy(messagesTable.createdAt);
  const isPro = input.planInfo?.features.adaptationContext ?? false;
  const hasMemory = input.planInfo?.features.memoryContext ?? false;
  const context = await buildConversationContext({
    userId: input.userId,
    isPro,
    agentSettings: input.agentSettings,
    sessionFocusMode: input.sessionFocusMode,
    isFirstUserMessage: history.filter((message) => message.role === "user").length === 0,
    userMessageContent: input.userMessageContent,
  });
  const conversionHint = input.planInfo?.plan === "free"
    ? `\n## COACHING CONTEXT (internal)\nThis athlete is on the free access tier with ${input.planInfo.messagesRemaining ?? 0} interaction${input.planInfo.messagesRemaining === 1 ? "" : "s"} remaining.\nWhen it feels natural — especially when discussing program details, progress tracking, or long-term planning — mention capabilities like adaptive training, session memory, and program evolution that you can offer them as they progress.\nKeep it helpful and intelligent, never promotional.`
    : "";
  return { history, isPro, hasMemory, conversionHint, ...context };
}

export async function executeConversationAi(
  args: Parameters<typeof generateAIResponse>,
  transport: "non_sse" | "sse",
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof generateAIResponse>> }
  | { ok: false; category: "provider_failure" | "timeout"; status: number; code: string; message: string }
> {
  try {
    return { ok: true, result: await generateAIResponse(...args) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const timeout = error instanceof Error && (error.name === "AbortError" || /timeout|timed out/i.test(detail));
    const rateLimited = /429|rate.?limit/i.test(detail);
    const category = timeout ? "timeout" : "provider_failure";
    const code = timeout ? "AI_TIMEOUT" : rateLimited ? "RATE_LIMITED_UPSTREAM" : "AI_ERROR";
    const message = timeout
      ? "The AI provider took too long to respond. Please try again — your program is unchanged."
      : rateLimited
        ? "I'm experiencing high demand right now — please try again in a moment. Your program hasn't been changed."
        : "Something went wrong generating your response. Please try again — your program is unchanged.";
    logger.error({ category, rateLimited, transport }, "[ConversationExecution] AI generation failed");
    if (!rateLimited) {
      captureWithTags(error, { subsystem: "ai_coach", feature: "generate_response", endpoint: transport });
    }
    return { ok: false, category, status: rateLimited ? 429 : timeout ? 504 : 503, code, message };
  }
}

/** Persist the terminal outcome before a transport acknowledges completion. */
export async function finalizeConversationExecution(input: {
  preparation: Extract<ConversationExecutionPreparation, { state: "ready" }>;
  userId: number;
  outcome: CanonicalConversationOutcome;
}): Promise<void> {
  const successful = input.outcome.kind === "success"
    || input.outcome.kind === "program_build"
    || input.outcome.kind === "deterministic_mutation";
  const responsePayload = input.outcome.kind === "replay"
    ? input.outcome.payload
    : input.outcome.kind === "failure" || input.outcome.kind === "safety_rejection"
      ? input.outcome.payload ?? { type: "error", status: input.outcome.status, code: input.outcome.code, message: input.outcome.message }
      : (input.outcome as Extract<CanonicalConversationOutcome, { payload: Record<string, unknown> }>).payload;
  const plan = input.preparation.planInfo?.plan;
  await finalizeChatTurn({
    turnId: input.preparation.turnId,
    userId: input.userId,
    responsePayload,
    successful,
    shouldChargeQuota: successful && input.outcome.chargeQuota && (plan === "free" || plan === "starter"),
  });
}
