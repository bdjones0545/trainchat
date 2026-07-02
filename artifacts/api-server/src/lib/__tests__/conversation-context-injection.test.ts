/**
 * conversation-context-injection.test.ts
 *
 * Unit tests for buildConversationContext — the pure extractor of memory, adaptation,
 * constraint, and insight context injected into every AI call. All service dependencies
 * are mocked at module level so tests run without a database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildConversationContext, type ContextInjectionOptions } from "../conversation-context-injection";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../adaptation", () => ({
  buildAdaptationContext: vi.fn(),
}));

vi.mock("../memory", () => ({
  listMemories: vi.fn(),
  buildMemoryContext: vi.fn(),
  syncMemoriesFromData: vi.fn(),
  extractMemoriesFromMessage: vi.fn(),
}));

vi.mock("../insights", () => ({
  generateInsights: vi.fn(),
  buildInsightPromptHint: vi.fn(),
}));

vi.mock("../session-log-adaptation-analyzer", () => ({
  buildSessionLogContext: vi.fn(),
}));

vi.mock("../constraint-memory", () => ({
  loadHardConstraints: vi.fn(),
  buildConstraintEnforcementDirective: vi.fn(),
}));

vi.mock("../safe-background", () => ({
  safeBackground: vi.fn(),
}));

// ─── Import mocks for per-test control ───────────────────────────────────────

import { buildAdaptationContext } from "../adaptation";
import { listMemories, buildMemoryContext, syncMemoriesFromData, extractMemoriesFromMessage } from "../memory";
import { generateInsights, buildInsightPromptHint } from "../insights";
import { buildSessionLogContext } from "../session-log-adaptation-analyzer";
import { loadHardConstraints, buildConstraintEnforcementDirective } from "../constraint-memory";
import { safeBackground } from "../safe-background";

const mockBuildAdaptationContext = vi.mocked(buildAdaptationContext);
const mockListMemories = vi.mocked(listMemories);
const mockBuildMemoryContext = vi.mocked(buildMemoryContext);
const mockSyncMemoriesFromData = vi.mocked(syncMemoriesFromData);
const mockExtractMemoriesFromMessage = vi.mocked(extractMemoriesFromMessage);
const mockGenerateInsights = vi.mocked(generateInsights);
const mockBuildInsightPromptHint = vi.mocked(buildInsightPromptHint);
const mockBuildSessionLogContext = vi.mocked(buildSessionLogContext);
const mockLoadHardConstraints = vi.mocked(loadHardConstraints);
const mockBuildConstraintEnforcementDirective = vi.mocked(buildConstraintEnforcementDirective);
const mockSafeBackground = vi.mocked(safeBackground);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_HARD_CONSTRAINTS = {
  bannedItems: [],
  dislikedItems: [],
  painRegions: [],
  monitorRegions: [],
  sport: null,
};

const PRO_SETTINGS = {
  behavior: {
    memoryPersonalization: true,
    proactiveInsights: true,
    executionPermission: "apply_mutation" as const,
    conciseResponses: false,
    autoAdjustRecommendations: true,
    coachingStyle: "supportive" as const,
    explanationDepth: "balanced" as const,
    trainingAggression: "balanced" as const,
    requireApprovalStructural: false,
    requireApprovalDeload: false,
    adaptFromReadiness: true,
    adaptFromMissedSessions: true,
  },
  training: {},
  source: { profileLoaded: false, settingsFromClient: false, profileId: null },
};

const FREE_SETTINGS = {
  ...PRO_SETTINGS,
  behavior: { ...PRO_SETTINGS.behavior, memoryPersonalization: false, proactiveInsights: false },
};

const BASE_OPTS: ContextInjectionOptions = {
  userId: 42,
  isPro: false,
  agentSettings: FREE_SETTINGS as any,
  sessionFocusMode: null,
  isFirstUserMessage: false,
  userMessageContent: "How's my program looking?",
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Sensible defaults so every test gets a clean baseline without boilerplate
  mockBuildAdaptationContext.mockResolvedValue({ promptContext: "" } as any);
  mockListMemories.mockResolvedValue([]);
  mockBuildMemoryContext.mockReturnValue("");
  mockSyncMemoriesFromData.mockResolvedValue(undefined as any);
  mockExtractMemoriesFromMessage.mockResolvedValue(undefined as any);
  mockGenerateInsights.mockResolvedValue([]);
  mockBuildInsightPromptHint.mockReturnValue("");
  mockBuildSessionLogContext.mockResolvedValue("");
  mockLoadHardConstraints.mockReturnValue(EMPTY_HARD_CONSTRAINTS);
  mockBuildConstraintEnforcementDirective.mockReturnValue(null);
});

// ─── MUTATION RESPONSE LANGUAGE directive — always injected ──────────────────

describe("mutation response language directive", () => {
  it("is always appended to memoryCtx regardless of plan tier", async () => {
    const result = await buildConversationContext({ ...BASE_OPTS, isPro: false });
    expect(result.memoryCtx).toContain("MUTATION RESPONSE LANGUAGE");
  });

  it("is still injected for Pro users", async () => {
    const result = await buildConversationContext({ ...BASE_OPTS, isPro: true, agentSettings: PRO_SETTINGS as any });
    expect(result.memoryCtx).toContain("MUTATION RESPONSE LANGUAGE");
  });
});

// ─── Non-Pro path ─────────────────────────────────────────────────────────────

describe("free (non-Pro) user — no memory or adaptation context", () => {
  it("returns empty adaptationCtx", async () => {
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.adaptationCtx).toBe("");
  });

  it("returns empty insightHint", async () => {
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.insightHint).toBe("");
  });

  it("does not call buildAdaptationContext", async () => {
    await buildConversationContext(BASE_OPTS);
    expect(mockBuildAdaptationContext).not.toHaveBeenCalled();
  });

  it("does not call buildMemoryContext (prompt injection blocked for free tier)", async () => {
    await buildConversationContext(BASE_OPTS);
    expect(mockBuildMemoryContext).not.toHaveBeenCalled();
  });

  it("still calls listMemories to load hard constraints", async () => {
    await buildConversationContext(BASE_OPTS);
    expect(mockListMemories).toHaveBeenCalledWith(42);
  });

  it("calls loadHardConstraints with the fetched memories", async () => {
    const memories = [{ id: 1, type: "pain_pattern", detail: "left knee" }];
    mockListMemories.mockResolvedValue(memories as any);
    await buildConversationContext(BASE_OPTS);
    expect(mockLoadHardConstraints).toHaveBeenCalledWith(memories);
  });

  it("calls buildConstraintEnforcementDirective and returns it", async () => {
    mockBuildConstraintEnforcementDirective.mockReturnValue("NO KNEE FLEXION");
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.constraintDirective).toBe("NO KNEE FLEXION");
  });

  it("appends session log context to memoryCtx when present", async () => {
    mockBuildSessionLogContext.mockResolvedValue("Session feedback: good compliance");
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.memoryCtx).toContain("Session feedback: good compliance");
  });

  it("does not append session log when empty", async () => {
    mockBuildSessionLogContext.mockResolvedValue("");
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.memoryCtx).not.toContain("\n\n\n\n");
  });

  it("does not fire background memory operations", async () => {
    await buildConversationContext(BASE_OPTS);
    expect(mockSafeBackground).not.toHaveBeenCalled();
  });

  it("gracefully falls back when listMemories throws", async () => {
    mockListMemories.mockRejectedValue(new Error("DB down"));
    const result = await buildConversationContext(BASE_OPTS);
    // loadHardConstraints should be called with the empty fallback []
    expect(mockLoadHardConstraints).toHaveBeenCalledWith([]);
    expect(result.hardConstraints).toEqual(EMPTY_HARD_CONSTRAINTS);
  });

  it("gracefully falls back when buildSessionLogContext throws", async () => {
    mockBuildSessionLogContext.mockRejectedValue(new Error("timeout"));
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.memoryCtx).toContain("MUTATION RESPONSE LANGUAGE");
  });
});

// ─── Pro path — adaptation context ────────────────────────────────────────────

describe("Pro user — adaptation context", () => {
  it("calls buildAdaptationContext with userId and sessionFocusMode", async () => {
    await buildConversationContext({
      ...BASE_OPTS,
      isPro: true,
      agentSettings: PRO_SETTINGS as any,
      sessionFocusMode: "strength",
    });
    expect(mockBuildAdaptationContext).toHaveBeenCalledWith(42, "strength");
  });

  it("sets adaptationCtx from promptContext", async () => {
    mockBuildAdaptationContext.mockResolvedValue({ promptContext: "Block 2: Intensity" } as any);
    const result = await buildConversationContext({
      ...BASE_OPTS,
      isPro: true,
      agentSettings: PRO_SETTINGS as any,
    });
    expect(result.adaptationCtx).toBe("Block 2: Intensity");
  });

  it("falls back to empty string when buildAdaptationContext throws", async () => {
    mockBuildAdaptationContext.mockRejectedValue(new Error("service down"));
    const result = await buildConversationContext({
      ...BASE_OPTS,
      isPro: true,
      agentSettings: PRO_SETTINGS as any,
    });
    expect(result.adaptationCtx).toBe("");
  });
});

// ─── Pro path — memory context ────────────────────────────────────────────────

describe("Pro user with memoryPersonalization=true — memory context", () => {
  const PRO_OPTS = { ...BASE_OPTS, isPro: true, agentSettings: PRO_SETTINGS as any };

  it("calls listMemories for the user", async () => {
    await buildConversationContext(PRO_OPTS);
    expect(mockListMemories).toHaveBeenCalledWith(42);
  });

  it("calls buildMemoryContext with the fetched memories", async () => {
    const memories = [{ id: 1, type: "training_preference", detail: "prefers AM sessions" }];
    mockListMemories.mockResolvedValue(memories as any);
    await buildConversationContext(PRO_OPTS);
    expect(mockBuildMemoryContext).toHaveBeenCalledWith(memories);
  });

  it("uses the buildMemoryContext return value as memoryCtx base", async () => {
    mockBuildMemoryContext.mockReturnValue("## ATHLETE MEMORY\n- prefers AM sessions");
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).toContain("## ATHLETE MEMORY");
  });

  it("appends session log context after memory context", async () => {
    mockBuildMemoryContext.mockReturnValue("MEMORY");
    mockBuildSessionLogContext.mockResolvedValue("SESSION LOG");
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).toContain("MEMORY");
    expect(result.memoryCtx).toContain("SESSION LOG");
    expect(result.memoryCtx.indexOf("MEMORY")).toBeLessThan(result.memoryCtx.indexOf("SESSION LOG"));
  });

  it("fires background sync and extract operations", async () => {
    mockSyncMemoriesFromData.mockResolvedValue(undefined as any);
    mockExtractMemoriesFromMessage.mockResolvedValue(undefined as any);
    await buildConversationContext({ ...PRO_OPTS, userMessageContent: "My shoulder hurts" });
    expect(mockSafeBackground).toHaveBeenCalledTimes(2);
  });

  it("passes hard constraints derived from loaded memories", async () => {
    const memories = [{ id: 1, type: "pain_pattern", detail: "left knee" }];
    mockListMemories.mockResolvedValue(memories as any);
    await buildConversationContext(PRO_OPTS);
    expect(mockLoadHardConstraints).toHaveBeenCalledWith(memories);
  });

  it("falls back to empty memory list when listMemories throws", async () => {
    mockListMemories.mockRejectedValue(new Error("DB timeout"));
    const result = await buildConversationContext(PRO_OPTS);
    // buildMemoryContext is still called (with []) and memoryCtx is a string
    expect(typeof result.memoryCtx).toBe("string");
  });
});

// ─── Pro path — memoryPersonalization=false ───────────────────────────────────

describe("Pro user with memoryPersonalization=false", () => {
  const PRO_NO_MEM_SETTINGS = {
    ...PRO_SETTINGS,
    behavior: { ...PRO_SETTINGS.behavior, memoryPersonalization: false },
  };
  const OPTS = { ...BASE_OPTS, isPro: true, agentSettings: PRO_NO_MEM_SETTINGS as any };

  it("does not call listMemories for memory prompt content", async () => {
    await buildConversationContext(OPTS);
    // listMemories should NOT be called when allowMemory is false in the Pro branch
    expect(mockListMemories).not.toHaveBeenCalled();
  });

  it("does not call buildMemoryContext", async () => {
    await buildConversationContext(OPTS);
    expect(mockBuildMemoryContext).not.toHaveBeenCalled();
  });

  it("loads empty hard constraints (no memory to derive from)", async () => {
    await buildConversationContext(OPTS);
    expect(mockLoadHardConstraints).toHaveBeenCalledWith([]);
  });

  it("does not fire background operations", async () => {
    await buildConversationContext(OPTS);
    expect(mockSafeBackground).not.toHaveBeenCalled();
  });
});

// ─── Pro path — insight hint ──────────────────────────────────────────────────

describe("Pro user with proactiveInsights=true — insight hint", () => {
  const PRO_OPTS = { ...BASE_OPTS, isPro: true, agentSettings: PRO_SETTINGS as any };

  it("calls generateInsights and buildInsightPromptHint when both flags are on", async () => {
    mockGenerateInsights.mockResolvedValue(["insight1"] as any);
    mockBuildInsightPromptHint.mockReturnValue("## INSIGHT");
    const result = await buildConversationContext(PRO_OPTS);
    expect(mockGenerateInsights).toHaveBeenCalledWith(42, []);
    expect(result.insightHint).toBe("## INSIGHT");
  });

  it("returns empty insightHint when generateInsights throws", async () => {
    mockGenerateInsights.mockRejectedValue(new Error("service error"));
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.insightHint).toBe("");
  });

  it("does not call generateInsights when proactiveInsights=false", async () => {
    const NO_INSIGHTS = {
      ...PRO_SETTINGS,
      behavior: { ...PRO_SETTINGS.behavior, proactiveInsights: false },
    };
    await buildConversationContext({ ...PRO_OPTS, agentSettings: NO_INSIGHTS as any });
    expect(mockGenerateInsights).not.toHaveBeenCalled();
  });
});

// ─── Returning-athlete opener (first message) ─────────────────────────────────

describe("returning athlete opener — first message injection", () => {
  const HIGH_CONF_MEMORY = { type: "pain_pattern", detail: "left knee pain", confidence: 4, sentiment: "negative" };
  const PRO_OPTS = { ...BASE_OPTS, isPro: true, agentSettings: PRO_SETTINGS as any, isFirstUserMessage: true };

  beforeEach(() => {
    mockListMemories.mockResolvedValue([HIGH_CONF_MEMORY] as any);
    mockBuildMemoryContext.mockReturnValue("MEMORY BASE");
  });

  it("appends the RETURNING ATHLETE section on the first message", async () => {
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).toContain("RETURNING ATHLETE — PROACTIVE OPENER");
  });

  it("includes the top memory type and detail in the opener", async () => {
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).toContain("[pain_pattern]");
    expect(result.memoryCtx).toContain('"left knee pain"');
  });

  it("does NOT append opener on subsequent messages (isFirstUserMessage=false)", async () => {
    const result = await buildConversationContext({ ...PRO_OPTS, isFirstUserMessage: false });
    expect(result.memoryCtx).not.toContain("RETURNING ATHLETE — PROACTIVE OPENER");
  });

  it("does NOT append opener when there are no high-confidence memories (confidence < 3)", async () => {
    mockListMemories.mockResolvedValue([{ ...HIGH_CONF_MEMORY, confidence: 2 }] as any);
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).not.toContain("RETURNING ATHLETE — PROACTIVE OPENER");
  });

  it("selects pain_pattern before sport_context (priority ordering)", async () => {
    mockListMemories.mockResolvedValue([
      { type: "sport_context", detail: "basketball player", confidence: 5, sentiment: "neutral" },
      { type: "pain_pattern", detail: "left knee", confidence: 4, sentiment: "negative" },
    ] as any);
    const result = await buildConversationContext(PRO_OPTS);
    // pain_pattern has higher priority even though sport_context has higher confidence
    expect(result.memoryCtx).toContain("[pain_pattern]");
    expect(result.memoryCtx).not.toContain("[sport_context]");
  });

  it("appends PROACTIVE BEHAVIORAL SIGNAL when negative adherence signal present on first message", async () => {
    const behavioralMemory = {
      type: "adherence_pattern",
      detail: "often skips Monday sessions",
      confidence: 3,
      sentiment: "negative",
    };
    mockListMemories.mockResolvedValue([behavioralMemory] as any);
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).toContain("PROACTIVE BEHAVIORAL SIGNAL");
    expect(result.memoryCtx).toContain("often skips Monday sessions");
  });

  it("does NOT append behavioral signal when sentiment is not negative", async () => {
    const positiveMemory = {
      type: "adherence_pattern",
      detail: "excellent consistency",
      confidence: 4,
      sentiment: "positive",
    };
    mockListMemories.mockResolvedValue([positiveMemory] as any);
    const result = await buildConversationContext(PRO_OPTS);
    expect(result.memoryCtx).not.toContain("PROACTIVE BEHAVIORAL SIGNAL");
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("return shape", () => {
  it("always returns all five fields", async () => {
    const result = await buildConversationContext(BASE_OPTS);
    expect(result).toHaveProperty("adaptationCtx");
    expect(result).toHaveProperty("memoryCtx");
    expect(result).toHaveProperty("insightHint");
    expect(result).toHaveProperty("hardConstraints");
    expect(result).toHaveProperty("constraintDirective");
  });

  it("hardConstraints defaults to empty arrays and null sport when no memories", async () => {
    const result = await buildConversationContext(BASE_OPTS);
    expect(result.hardConstraints).toEqual(EMPTY_HARD_CONSTRAINTS);
  });
});
