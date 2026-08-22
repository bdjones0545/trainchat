import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  planInfo: { plan: "free", messagesRemaining: 3, features: {} } as any,
  beginChatTurn: vi.fn(),
  finalizeChatTurn: vi.fn(),
  getUserPlanInfo: vi.fn(),
  generateAIResponse: vi.fn(),
  captureWithTags: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  conversationsTable: { id: "id" },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => mocks.rows) })),
    })),
  },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => true) }));
vi.mock("../../lib/planGating", () => ({ getUserPlanInfo: mocks.getUserPlanInfo }));
vi.mock("../../lib/conversation-plan-gating", () => ({
  isPaywallBlocked: vi.fn((plan: any) => plan?.blocked === true),
}));
vi.mock("../../lib/chat-turn-integrity", () => ({
  beginChatTurn: mocks.beginChatTurn,
  finalizeChatTurn: mocks.finalizeChatTurn,
}));
vi.mock("../../lib/ai", () => ({ generateAIResponse: mocks.generateAIResponse }));
vi.mock("../../lib/sentry", () => ({ captureWithTags: mocks.captureWithTags }));
vi.mock("../../lib/logger", () => ({ logger: { error: vi.fn() } }));

import {
  classifySuccessfulOutcome,
  executeConversationAi,
  finalizeConversationExecution,
  prepareConversationExecution,
  renderTerminalOutcome,
} from "../conversation-execution-service";

describe("canonical conversation execution lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: 10, userId: 7 }];
    mocks.planInfo = { plan: "free", messagesRemaining: 3, features: {} };
    mocks.getUserPlanInfo.mockImplementation(async () => mocks.planInfo);
    mocks.beginChatTurn.mockResolvedValue({ state: "claimed", turnId: 91 });
    mocks.finalizeChatTurn.mockResolvedValue(undefined);
    mocks.generateAIResponse.mockResolvedValue({ content: "Done", structuredData: null });
  });

  it("assembles entitlement, ownership, and durable turn claim before execution", async () => {
    const result = await prepareConversationExecution({ userId: 7, conversationId: 10, clientTurnId: "turn-1" });
    expect(result).toMatchObject({ state: "ready", turnId: 91, conversation: { id: 10, userId: 7 } });
    expect(mocks.beginChatTurn).toHaveBeenCalledWith({ userId: 7, conversationId: 10, clientTurnId: "turn-1" });
  });

  it("fails ownership closed before claiming a turn", async () => {
    mocks.rows = [{ id: 10, userId: 999 }];
    const result = await prepareConversationExecution({ userId: 7, conversationId: 10, clientTurnId: "turn-2" });
    expect(result).toMatchObject({ state: "terminal", outcome: { category: "authorization", status: 404 } });
    expect(mocks.beginChatTurn).not.toHaveBeenCalled();
  });

  it("returns the durable completed payload for duplicate replay", async () => {
    mocks.beginChatTurn.mockResolvedValue({
      state: "duplicate",
      status: "succeeded",
      responsePayload: { userMessage: { id: 1 }, assistantMessage: { id: 2 } },
    });
    const result = await prepareConversationExecution({ userId: 7, conversationId: 10, clientTurnId: "turn-3" });
    expect(result).toMatchObject({ state: "terminal", outcome: { kind: "replay", status: 200 } });
  });

  it("renders the same bounded failure semantics for HTTP and SSE", () => {
    const failure = {
      kind: "safety_rejection" as const,
      category: "hard_constraint_violation" as const,
      status: 422,
      code: "HARD_CONSTRAINT_VIOLATION",
      message: "The requested program conflicts with a mandatory constraint.",
      chargeQuota: false as const,
    };
    expect(renderTerminalOutcome(failure, "http")).toMatchObject({
      status: 422,
      payload: { code: "HARD_CONSTRAINT_VIOLATION" },
    });
    expect(renderTerminalOutcome(failure, "sse")).toMatchObject({
      status: 422,
      payload: { type: "error", status: 422, code: "HARD_CONSTRAINT_VIOLATION" },
    });
  });

  it("charges a successful free turn exactly once at durable finalization", async () => {
    const preparation = await prepareConversationExecution({ userId: 7, conversationId: 10, clientTurnId: "turn-4" });
    if (preparation.state !== "ready") throw new Error("expected ready preparation");
    await finalizeConversationExecution({
      preparation,
      userId: 7,
      outcome: classifySuccessfulOutcome({ userMessage: { id: 1 }, assistantMessage: { id: 2 } }),
    });
    expect(mocks.finalizeChatTurn).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeChatTurn).toHaveBeenCalledWith(expect.objectContaining({ successful: true, shouldChargeQuota: true }));
  });

  it("never charges bounded provider or safety failures", async () => {
    const preparation = await prepareConversationExecution({ userId: 7, conversationId: 10, clientTurnId: "turn-5" });
    if (preparation.state !== "ready") throw new Error("expected ready preparation");
    await finalizeConversationExecution({
      preparation,
      userId: 7,
      outcome: {
        kind: "failure",
        category: "provider_failure",
        status: 503,
        code: "AI_ERROR",
        message: "The provider is temporarily unavailable.",
        chargeQuota: false,
      },
    });
    expect(mocks.finalizeChatTurn).toHaveBeenCalledWith(expect.objectContaining({ successful: false, shouldChargeQuota: false }));
  });

  it("gives HTTP and SSE the same bounded provider failure decision", async () => {
    mocks.generateAIResponse.mockRejectedValue(new Error("provider unavailable"));
    const args = ["hello", [], 7, {}] as any;
    const http = await executeConversationAi(args, "non_sse");
    const sse = await executeConversationAi(args, "sse");
    expect(http).toMatchObject({ ok: false, category: "provider_failure", status: 503, code: "AI_ERROR" });
    expect(sse).toEqual(http);
    expect(mocks.captureWithTags).toHaveBeenCalledTimes(2);
  });
});
