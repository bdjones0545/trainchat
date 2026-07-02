/**
 * conversations.test.ts — Phase 1 smoke tests
 *
 * PURPOSE
 * -------
 * Verify critical invariants of conversations.ts WITHOUT refactoring it.
 * These tests establish a safety net so future extraction work can be
 * validated against a known baseline.
 *
 * SCOPE
 * -----
 * - Route registration (no import-time throw)
 * - Auth guard on every route
 * - CRUD routes (list, create, get, delete) — happy + sad paths
 * - POST /messages — plan-gating paywall, structured-UI guardrail
 * - POST /messages/stream — SSE headers, plan-gating via SSE done event,
 *   SSE rate-limiting, structured-UI guardrail
 * - AI failure path → Sentry capture + graceful fallback (non-SSE)
 * - SSE AI failure → graceful error event
 *
 * MOCKS
 * -----
 * Everything that touches I/O is mocked:
 *   @workspace/db       — Drizzle client + all tables
 *   drizzle-orm         — eq / desc / count / and (return identity values)
 *   ../lib/ai           — generateAIResponse, validateProgramAgainstConstraints
 *   ../lib/planGating   — getUserPlanInfo
 *   ../lib/sentry       — captureWithTags
 *   All 30+ service/lib imports are replaced with no-ops so the handler
 *   can proceed without live infrastructure.
 *
 * ISOLATION GUARANTEE
 * -------------------
 * vi.resetAllMocks() runs before every test. Per-test setup re-applies the
 * minimum mock state for that test.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import express from "express";
import supertest from "supertest";

// ── vi.hoisted — all mock state that factory functions reference ──────────────

const {
  mockDb,
  mockGenerateAIResponse,
  mockGetUserPlanInfo,
  mockCaptureWithTags,
  mockOrchestrate,
  mockBuildExecutionPlan,
  mockInterpretMutationRequest,
  mockSaveOrUpdateProgram,
  mockBuildCompleteEvent,
  mockResolveAgentSettingsContext,
  mockGetActiveTrainingSystem,
} = vi.hoisted(() => {
  // ── Drizzle chain builders ─────────────────────────────────────────────────
  function selectChain(rows: unknown[]) {
    const whereResult: any = Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockReturnThis(),
    });
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(whereResult),
      orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
        limit: vi.fn().mockResolvedValue(rows),
      })),
      limit: vi.fn().mockResolvedValue(rows),
    };
  }

  function insertChain(rows: unknown[]) {
    return {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
    };
  }

  function updateChain() {
    const whereResult: any = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(whereResult),
    };
  }

  function deleteChain() {
    const whereResult: any = Object.assign(Promise.resolve([]), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return {
      where: vi.fn().mockReturnValue(whereResult),
    };
  }

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    // chain builders for per-test setup
    _select: selectChain,
    _insert: insertChain,
    _update: updateChain,
    _delete: deleteChain,
  };

  return {
    mockDb,
    mockGenerateAIResponse: vi.fn(),
    mockGetUserPlanInfo: vi.fn(),
    mockCaptureWithTags: vi.fn(),
    mockOrchestrate: vi.fn(),
    mockBuildExecutionPlan: vi.fn(),
    mockInterpretMutationRequest: vi.fn(),
    mockSaveOrUpdateProgram: vi.fn(),
    mockBuildCompleteEvent: vi.fn(),
    mockResolveAgentSettingsContext: vi.fn(),
    mockGetActiveTrainingSystem: vi.fn(),
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  conversationsTable: { id: "id", userId: "userId", title: "title", createdAt: "createdAt", updatedAt: "updatedAt" },
  messagesTable: { id: "id", conversationId: "conversationId", role: "role", content: "content", createdAt: "createdAt", structuredData: "structuredData" },
  neuralProfilesTable: { userId: "userId" },
  trainingSystems: { id: "id", userId: "userId", conversationId: "conversationId", status: "status", metadata: "metadata", updatedAt: "updatedAt" },
  savedProgramsTable: { id: "id", userId: "userId", conversationId: "conversationId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ __eq: val })),
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  count: vi.fn(() => ({ __count: true })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
}));

vi.mock("@workspace/api-zod", () => ({
  CreateConversationBody: { safeParse: vi.fn((b: any) => ({ success: true, data: b })) },
  GetConversationParams: { safeParse: vi.fn((p: any) => ({ success: true, data: p })) },
  DeleteConversationParams: { safeParse: vi.fn((p: any) => ({ success: true, data: p })) },
  ListMessagesParams: { safeParse: vi.fn((p: any) => ({ success: true, data: p })) },
  SendMessageBody: { safeParse: vi.fn((b: any) => ({ success: true, data: b })) },
  SendMessageParams: { safeParse: vi.fn((p: any) => ({ success: true, data: p })) },
}));

vi.mock("../lib/ai", () => ({
  generateAIResponse: mockGenerateAIResponse,
  validateProgramAgainstConstraints: vi.fn().mockResolvedValue({ passed: true, violations: [] }),
}));

vi.mock("../lib/planGating", () => ({
  getUserPlanInfo: mockGetUserPlanInfo,
}));

vi.mock("../lib/sentry", () => ({
  captureWithTags: mockCaptureWithTags,
}));

vi.mock("../agents/agent-orchestrator", () => ({
  orchestrate: mockOrchestrate,
  logOrchestratorDecision: vi.fn(),
}));

vi.mock("../lib/execution-planner", () => ({
  buildExecutionPlan: mockBuildExecutionPlan,
}));

vi.mock("../services/mutation-execution-service", () => ({
  interpretMutationRequest: mockInterpretMutationRequest,
}));

vi.mock("../services/program-build-service", () => ({
  saveOrUpdateProgram: mockSaveOrUpdateProgram,
  buildInitialBuildSummary: vi.fn().mockReturnValue("Build complete."),
}));

vi.mock("../services/streaming-response-service", () => ({
  buildCompleteEvent: mockBuildCompleteEvent,
}));

vi.mock("../lib/agent-settings-resolver", () => ({
  resolveAgentSettingsContext: mockResolveAgentSettingsContext,
}));

vi.mock("../lib/training-system-service", () => ({
  getActiveTrainingSystem: mockGetActiveTrainingSystem,
  getFullTrainingSystem: vi.fn().mockResolvedValue(null),
  createTrainingSystemFromProgram: vi.fn().mockResolvedValue({ id: 1 }),
  upsertTrainingSystemFromProgram: vi.fn().mockResolvedValue({ id: 1 }),
  dbSystemToProgramStructure: vi.fn().mockReturnValue(null),
}));

// ── Bulk no-op mocks for the 30+ service imports ────────────────────────────
vi.mock("../lib/intent", () => ({
  classifyIntent: vi.fn().mockReturnValue({ type: "GENERAL_COACHING_QUESTION", confidence: "high" }),
  logIntentSummary: vi.fn(),
  extractConstraints: vi.fn().mockReturnValue({}),
  detectSport: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/language-system", () => ({
  extractAgentIntentProfile: vi.fn().mockReturnValue({}),
}));

vi.mock("../lib/language-audit", () => ({
  auditLanguageInterpretation: vi.fn(),
}));

vi.mock("../lib/response-policy-engine", () => ({
  resolveResponsePolicy: vi.fn().mockReturnValue({ mode: "standard", hints: [] }),
  auditResponsePolicy: vi.fn(),
}));

vi.mock("../lib/response-policy-audit", () => ({
  auditResponsePolicy: vi.fn(),
}));

vi.mock("../lib/response-templates", () => ({
  formatShortCircuitResponse: vi.fn().mockReturnValue("Short circuit"),
}));

vi.mock("../lib/split-transform", () => ({
  transformProgram: vi.fn().mockResolvedValue(null),
  resolveTransformType: vi.fn().mockReturnValue(null),
  buildTransformPromptHint: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/adaptation", () => ({
  buildAdaptationContext: vi.fn().mockResolvedValue({ promptContext: "" }),
}));

vi.mock("../lib/memory", () => ({
  syncMemoriesFromData: vi.fn().mockResolvedValue(undefined),
  listMemories: vi.fn().mockResolvedValue([]),
  buildMemoryContext: vi.fn().mockReturnValue(""),
  extractMemoriesFromMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/insights", () => ({
  generateInsights: vi.fn().mockResolvedValue([]),
  buildInsightPromptHint: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/stripeStorage", () => ({
  stripeStorage: {
    getSubscription: vi.fn().mockResolvedValue(null),
    incrementMessageCount: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/edit-intent-service", () => ({
  interpretEditRequest: vi.fn().mockResolvedValue({ intent: "replace_exercise", scope: "session" }),
  resolveTargetFromRequest: vi.fn().mockResolvedValue(null),
  hasDeiticSessionReference: vi.fn().mockReturnValue(false),
  buildBulkSessionSetsEditPlan: vi.fn().mockReturnValue([]),
}));

vi.mock("../lib/edit-engine", () => ({
  applyEditPlan: vi.fn().mockResolvedValue({ changeSummary: "Done", skippedCount: 0, verification: { status: "verified", verifiedChanges: [], expectedChanges: [] } }),
}));

vi.mock("../lib/change-log-service", () => ({
  createChangeLogEntry: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("../lib/neural-graph-interpreter", () => ({
  interpretNeuralGraph: vi.fn().mockReturnValue({ bias: null, imbalances: [] }),
  buildNeuralAdjustmentSummary: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/decision-memory-service", () => ({
  buildDecisionMemory: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/safe-background", () => ({
  safeBackground: vi.fn(),
}));

vi.mock("../lib/build-pipeline", () => ({
  buildStageEvent: vi.fn().mockReturnValue({ type: "stage", stage: "loading" }),
}));

vi.mock("../lib/stage-narration", () => ({}));

vi.mock("../lib/response-alignment-verifier", () => ({
  verifyResponseAlignment: vi.fn().mockReturnValue({ aligned: true, flags: [] }),
}));

vi.mock("../lib/constraint-memory", () => ({
  persistConstraintsFromTurn: vi.fn().mockResolvedValue(undefined),
  loadHardConstraints: vi.fn().mockReturnValue({ bannedItems: [], dislikedItems: [], painRegions: [], monitorRegions: [], sport: null }),
  buildConstraintEnforcementDirective: vi.fn().mockReturnValue(null),
  validateAgainstHardConstraints: vi.fn().mockReturnValue({ violations: [] }),
}));

vi.mock("../lib/pending-clarification-service", () => ({
  writePendingClarification: vi.fn().mockResolvedValue(undefined),
  getActivePendingClarification: vi.fn().mockResolvedValue(null),
  resolvePendingClarification: vi.fn().mockResolvedValue(undefined),
  clearPendingClarificationsForConversation: vi.fn().mockResolvedValue(undefined),
  looksLikeClarificationAnswer: vi.fn().mockReturnValue(false),
  buildReconstructedRequest: vi.fn().mockReturnValue(""),
  decrementTurnsRemaining: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/intent-family-engine", () => ({
  normalizeToIntentFamily: vi.fn().mockReturnValue("coaching_question"),
}));

vi.mock("../lib/anti-loop-reliability-layer", () => ({
  applyAntiLoopReliabilityLayer: vi.fn().mockImplementation((plan: any) => ({ plan, triggered: false, shouldClearPending: false })),
}));

vi.mock("../lib/action-guarantee-layer", () => ({
  applyActionGuaranteeLayer: vi.fn().mockImplementation((plan: any) => ({ plan, triggered: false })),
}));

vi.mock("../lib/post-mutation-validator", () => ({
  validatePostMutationArchitectureLight: vi.fn().mockReturnValue({ hasCriticalIssue: false, issues: [] }),
}));

vi.mock("../lib/refinement-scope-resolver", () => ({
  resolveRefinementScope: vi.fn().mockResolvedValue({ scope: "session", blockIndex: 0, weekIndex: 0, sessionIndex: 0 }),
  inferBlockTypeFromMessage: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/hierarchical-refine-engine", () => ({
  applyHierarchicalRefinement: vi.fn().mockResolvedValue({ changeSummary: "Done", skippedCount: 0 }),
}));

vi.mock("../lib/refinement-impact-engine", () => ({
  processSessionScopeImpact: vi.fn().mockResolvedValue(undefined),
  processHierarchicalImpact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/focus-mode-audit", () => ({
  resolveFocusMode: vi.fn().mockReturnValue("strength"),
  logFocusModeAudit: vi.fn(),
}));

vi.mock("../lib/coach-reasoning-engine", () => ({
  generateCoachReasoning: vi.fn().mockReturnValue({ reasoning: "" }),
  goalToFocusMode: vi.fn().mockReturnValue("strength"),
}));

vi.mock("../lib/micro-reasoning", () => ({
  buildMicroReasons: vi.fn().mockReturnValue([]),
}));

vi.mock("../lib/confidence-signal", () => ({
  buildConfidenceLine: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/fail-safe", () => ({
  resolveFailSafeState: vi.fn().mockReturnValue({ isFailSafe: false }),
  applyFailSafeConstraints: vi.fn().mockReturnValue(null),
  attachFailSafeMetadata: vi.fn().mockReturnValue({}),
  prependFailSafeMessage: vi.fn().mockReturnValue(""),
  logFailSafeAudit: vi.fn(),
  acquireFailSafeEditLock: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/action-contract", () => ({
  buildActionContract: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/action-contract-enforcer", () => ({
  enforceActionContract: vi.fn().mockReturnValue(null),
  buildContractPromptDirective: vi.fn().mockReturnValue(""),
}));

vi.mock("../lib/architect-patch-generator", () => ({
  hasStructuralChanges: vi.fn().mockReturnValue(false),
  isMinorAttributeEdit: vi.fn().mockReturnValue(true),
  validateStructuralChanges: vi.fn().mockReturnValue({ hasCriticalIssue: false, issues: [] }),
  buildMutationSuccessReceipt: vi.fn().mockReturnValue({ success: true }),
  buildMutationFailureReceipt: vi.fn().mockReturnValue({ success: false }),
}));

vi.mock("../lib/mutation-outcome-finalizer", () => ({
  finalizeMutationOutcome: vi.fn().mockResolvedValue({ outcomeType: "conversation_only" }),
}));

vi.mock("../lib/conversation-context-resolver", () => ({
  resolveContextualMessage: vi.fn().mockReturnValue({ resolved: false }),
  tickConversationTurn: vi.fn(),
  clearConversationContext: vi.fn(),
  storeExerciseReference: vi.fn(),
  storeSessionReference: vi.fn(),
  storeMutationReference: vi.fn(),
  inferExerciseReferenceFromMutation: vi.fn(),
  inferSessionReferenceFromMutation: vi.fn(),
}));

vi.mock("../lib/session-log-adaptation-analyzer", () => ({
  buildSessionLogContext: vi.fn().mockResolvedValue(""),
}));

// ── Test app factory ──────────────────────────────────────────────────────────

type MockSession = {
  userId?: number;
  save: Mock;
  destroy: Mock;
  regenerate: Mock;
};

function makeMockSession(initial: Partial<MockSession> = {}): MockSession {
  return {
    save: vi.fn((cb: (e?: unknown) => void) => cb()),
    destroy: vi.fn((cb?: (e?: unknown) => void) => cb?.()),
    regenerate: vi.fn((cb: (e?: unknown) => void) => cb()),
    ...initial,
  };
}

import conversationsRouter from "../routes/conversations";

function makeApp(session: MockSession) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = session;
    next();
  });
  app.use("/api", conversationsRouter);
  return supertest(app);
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CONVO = {
  id: 1,
  userId: 42,
  title: "Test convo",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MSG = {
  id: 10,
  conversationId: 1,
  role: "assistant",
  content: "Hello!",
  createdAt: new Date("2024-01-01"),
  structuredData: null,
};

const FREE_PLAN = {
  plan: "free",
  canSendMessage: true,
  messageCount: 2,
  messagesRemaining: 3,
  isAnonymous: false,
  features: {
    unlimitedMessages: false,
    adaptationContext: false,
    memoryContext: false,
    insightHints: false,
    programEvolution: false,
    priorityAI: false,
    sessionLogging: false,
  },
};

const PRO_PLAN = {
  ...FREE_PLAN,
  plan: "pro",
  canSendMessage: true,
  features: {
    unlimitedMessages: true,
    adaptationContext: true,
    memoryContext: true,
    insightHints: true,
    programEvolution: true,
    priorityAI: true,
    sessionLogging: true,
  },
};

const BLOCKED_PLAN = {
  ...FREE_PLAN,
  canSendMessage: false,
  messageCount: 5,
  messagesRemaining: 0,
};

// ── DB mock helper (same pattern as auth.test.ts) ────────────────────────────

function setupSelects(...results: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => mockDb._select(results[call++] ?? []));
}

// ── Default agent settings stub ───────────────────────────────────────────────

const DEFAULT_AGENT_SETTINGS = {
  behavior: {
    memoryPersonalization: false,
    proactiveInsights: false,
    requireApprovalStructural: false,
    autoAdjustRecommendations: true,
  },
  training: {},
};

// ── GUIDANCE exec plan stub (bypasses mutation engine) ────────────────────────

const GUIDANCE_EXEC_PLAN = {
  action: "GUIDANCE",
  intentFamily: "coaching_question",
  scope: null,
  mutation: null,
};

const GUIDANCE_ORCHESTRATE = {
  route: "GUIDANCE",
  useProgramArchitect: false,
};

// ── Global beforeEach ─────────────────────────────────────────────────────────
//
// vi.clearAllMocks() clears call history and mockReturnValueOnce queues, but
// does NOT clear persistent implementations set in vi.mock() factories (like
// `vi.fn().mockResolvedValue([])` or `vi.fn((b) => ({ success: true, data: b }))`).
// Those factory defaults survive and do not need to be restored here.
//
// What DOES need restoring here: vi.hoisted() mocks, which are plain vi.fn()
// with no factory-set implementation — they return undefined after a test
// overrides them with mockRejectedValue etc.

beforeEach(() => {
  vi.clearAllMocks();

  // Restore vi.hoisted() mocks to clean defaults
  mockGetUserPlanInfo.mockResolvedValue(FREE_PLAN);
  mockResolveAgentSettingsContext.mockResolvedValue(DEFAULT_AGENT_SETTINGS);
  mockGetActiveTrainingSystem.mockResolvedValue(null);
  mockBuildExecutionPlan.mockResolvedValue(GUIDANCE_EXEC_PLAN);
  mockOrchestrate.mockReturnValue(GUIDANCE_ORCHESTRATE);
  mockBuildCompleteEvent.mockReturnValue({ type: "complete" });
  mockSaveOrUpdateProgram.mockResolvedValue({ saved: false, systemId: null });
  mockGenerateAIResponse.mockResolvedValue({
    content: "Here is your coaching response.",
    structuredData: null,
  });
  mockInterpretMutationRequest.mockResolvedValue(null);
  mockCaptureWithTags.mockReturnValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-C01 — Route registration
// ─────────────────────────────────────────────────────────────────────────────

describe("Route registration", () => {
  it("TC-C01: importing conversationsRouter does not throw", () => {
    // If this test passes, all top-level imports in conversations.ts resolved
    // without throwing (no missing module, no startup crash).
    expect(conversationsRouter).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard — every route must return 401 without a session
// ─────────────────────────────────────────────────────────────────────────────

describe("Auth guard (requireAuth)", () => {
  const noAuth = makeApp(makeMockSession()); // no userId

  it("TC-C02: GET /conversations → 401 unauthenticated", async () => {
    const res = await noAuth.get("/api/conversations");
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("session_expired");
  });

  it("TC-C03: POST /conversations → 401 unauthenticated", async () => {
    const res = await noAuth.post("/api/conversations").send({ title: "x" });
    expect(res.status).toBe(401);
  });

  it("TC-C04: GET /conversations/:id → 401 unauthenticated", async () => {
    const res = await noAuth.get("/api/conversations/1");
    expect(res.status).toBe(401);
  });

  it("TC-C05: DELETE /conversations/:id → 401 unauthenticated", async () => {
    const res = await noAuth.delete("/api/conversations/1");
    expect(res.status).toBe(401);
  });

  it("TC-C06: GET /conversations/:id/messages → 401 unauthenticated", async () => {
    const res = await noAuth.get("/api/conversations/1/messages");
    expect(res.status).toBe(401);
  });

  it("TC-C07: POST /conversations/:id/messages → 401 unauthenticated", async () => {
    const res = await noAuth.post("/api/conversations/1/messages").send({ content: "hello" });
    expect(res.status).toBe(401);
  });

  it("TC-C08: POST /conversations/:id/messages/stream → 401 unauthenticated", async () => {
    const res = await noAuth.post("/api/conversations/1/messages/stream").send({ content: "hello" });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /conversations
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /conversations", () => {
  it("TC-C09: returns array of conversations with messageCount and lastMessage", async () => {
    const session = makeMockSession({ userId: 42 });
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);
      if (call === 2) return mockDb._select([{ msgCount: 3 }]);
      return mockDb._select([{ content: "last message here" }]);
    });

    const res = await makeApp(session).get("/api/conversations");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ id: CONVO.id, title: CONVO.title });
    expect(typeof res.body[0].messageCount).toBe("number");
  });

  it("TC-C10: returns empty array when user has no conversations", async () => {
    setupSelects([]);
    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations", () => {
  it("TC-C11: creates conversation and returns 201 with expected shape", async () => {
    const ins = mockDb._insert([CONVO]);
    mockDb.insert.mockReturnValue(ins);

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations")
      .send({ title: "My new plan" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CONVO.id);
    expect(res.body.messageCount).toBe(0);
    expect(res.body.lastMessage).toBeNull();
  });

  it("TC-C12: returns 400 when Zod schema rejects the body", async () => {
    // Override the default pass-through to simulate validation failure
    const { CreateConversationBody } = await import("@workspace/api-zod");
    vi.mocked(CreateConversationBody.safeParse).mockReturnValueOnce({
      success: false,
      error: { message: "title required" } as any,
    } as any);

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations")
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /conversations/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /conversations/:id", () => {
  it("TC-C13: returns 404 when conversation does not exist", async () => {
    setupSelects([]); // no convo found
    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations/1");
    expect(res.status).toBe(404);
  });

  it("TC-C14: returns 404 when conversation belongs to a different user", async () => {
    setupSelects([{ ...CONVO, userId: 999 }]); // different user
    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations/1");
    expect(res.status).toBe(404);
  });

  it("TC-C15: returns 200 with conversation data when owned by current user", async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);
      if (call === 2) return mockDb._select([{ msgCount: 5 }]);
      return mockDb._select([{ content: "last msg" }]);
    });

    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(CONVO.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /conversations/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /conversations/:id", () => {
  it("TC-C16: returns 404 when conversation not found", async () => {
    setupSelects([]); // no convo found
    const res = await makeApp(makeMockSession({ userId: 42 })).delete("/api/conversations/1");
    expect(res.status).toBe(404);
  });

  it("TC-C17: returns 404 when conversation belongs to another user", async () => {
    setupSelects([{ ...CONVO, userId: 99 }]);
    const res = await makeApp(makeMockSession({ userId: 42 })).delete("/api/conversations/1");
    expect(res.status).toBe(404);
  });

  it("TC-C18: deletes conversation and cascade data, returns success", async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);       // convo ownership check
      return mockDb._select([]);                             // no linked training systems
    });
    mockDb.delete.mockReturnValue(mockDb._delete());

    const res = await makeApp(makeMockSession({ userId: 42 })).delete("/api/conversations/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /conversations/:id/messages
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /conversations/:id/messages", () => {
  it("TC-C19: returns 404 when conversation not found", async () => {
    setupSelects([]);
    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations/1/messages");
    expect(res.status).toBe(404);
  });

  it("TC-C20: returns ordered message list for owned conversation", async () => {
    setupSelects([CONVO], [MSG]);
    const res = await makeApp(makeMockSession({ userId: 42 })).get("/api/conversations/1/messages");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ id: MSG.id, role: "assistant" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages — plan gating
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages — plan gating", () => {
  it("TC-C21: returns 402 PAYWALL for free user who has hit the limit", async () => {
    mockGetUserPlanInfo.mockResolvedValue(BLOCKED_PLAN);

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "hello" });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("PAYWALL");
  });

  it("TC-C22: PAYWALL message for anonymous users references account creation", async () => {
    mockGetUserPlanInfo.mockResolvedValue({ ...BLOCKED_PLAN, isAnonymous: true });

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "hello" });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/create.*account|free account/i);
  });

  it("TC-C23: proceeds when planInfo is null (getUserPlanInfo fails safely)", async () => {
    // getUserPlanInfo throws → catch(() => null) → no paywall, continue handler
    mockGetUserPlanInfo.mockRejectedValue(new Error("DB down"));
    // Must still reach conversation check — set up minimum state:
    setupSelects([CONVO], [MSG], [MSG]); // convo + message inserts/selects
    mockDb.insert.mockReturnValue(mockDb._insert([MSG]));
    mockDb.update.mockReturnValue(mockDb._update());

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "hello" });

    // Should not be 402 (no paywall applied when planInfo is null)
    expect(res.status).not.toBe(402);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages — structured-UI guardrail
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages — structured-UI guardrail", () => {
  it("TC-C24: blocks payload with refineSource=program_refine_panel with 400", async () => {
    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "change sets", refineSource: "program_refine_panel" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STRUCTURED_UI_ROUTE_VIOLATION");
  });

  it("TC-C25: blocks payload with scopeOverride present", async () => {
    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "change sets", scopeOverride: "session" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STRUCTURED_UI_ROUTE_VIOLATION");
  });

  it("TC-C26: blocks payload with structuredIntent present", async () => {
    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "change sets", structuredIntent: { type: "edit_sets" } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STRUCTURED_UI_ROUTE_VIOLATION");
  });

  it("TC-C27: blocks payload with uiAction present", async () => {
    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "change sets", uiAction: "add_exercise" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STRUCTURED_UI_ROUTE_VIOLATION");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages — AI failure path → Sentry + graceful error
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages — AI failure + Sentry", () => {
  function setupForAi() {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);         // conversation check
      if (call === 2) return mockDb._select([MSG]);            // history load
      if (call === 3) return mockDb._select([{ id: 10 }]);    // existing messages count
      return mockDb._select([]);
    });
    mockDb.insert.mockReturnValue(mockDb._insert([MSG]));
    mockDb.update.mockReturnValue(mockDb._update());
  }

  it("TC-C28: AI non-429 failure → captureWithTags is called with subsystem tag", async () => {
    setupForAi();
    mockGenerateAIResponse.mockRejectedValue(new Error("Model timeout"));

    await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "build me a plan" });

    expect(mockCaptureWithTags).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "ai_coach", endpoint: "non_sse" }),
    );
  });

  it("TC-C29: AI 429 failure → no Sentry capture (expected error, not a bug)", async () => {
    setupForAi();
    const rateLimitErr = new Error("429 rate limit exceeded");
    mockGenerateAIResponse.mockRejectedValue(rateLimitErr);

    await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "build me a plan" });

    expect(mockCaptureWithTags).not.toHaveBeenCalled();
  });

  it("TC-C30: AI failure response contains graceful fallback text (not a raw stack trace)", async () => {
    setupForAi();
    mockGenerateAIResponse.mockRejectedValue(new Error("Unknown error"));

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages")
      .send({ content: "build me a plan" });

    // The route saves a fallback message and returns it — no raw error exposed
    expect(res.status).toBe(200);
    expect(res.body.assistantMessage).toMatchObject({ role: "assistant" });
    expect(res.body.assistantMessage.content).not.toMatch(/Error:|stack:|at Object\.|TypeError/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages/stream — SSE headers
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages/stream — SSE headers", () => {
  function setupSseBase() {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);      // conversation check
      if (call === 2) return mockDb._select([MSG, MSG]);   // history
      if (call === 3) return mockDb._select([{ id: 1 }]); // existing messages count
      return mockDb._select([]);
    });
    mockDb.insert.mockReturnValue(mockDb._insert([MSG]));
    mockDb.update.mockReturnValue(mockDb._update());
  }

  it("TC-C31: SSE endpoint sets Content-Type text/event-stream", async () => {
    setupSseBase();

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("TC-C32: SSE endpoint sets Cache-Control no-cache", async () => {
    setupSseBase();

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    expect(res.headers["cache-control"]).toMatch(/no-cache/);
  });

  it("TC-C33: SSE endpoint sets Connection keep-alive", async () => {
    setupSseBase();

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    expect(res.headers["connection"]).toMatch(/keep-alive/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages/stream — plan gating via SSE event
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages/stream — plan gating", () => {
  function parseSseEvents(body: string): Record<string, unknown>[] {
    return body
      .split("\n\n")
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => {
        try { return JSON.parse(chunk.replace("data: ", "")); }
        catch { return {}; }
      });
  }

  it("TC-C34: PAYWALL when plan is blocked → SSE error event with status 402", async () => {
    mockGetUserPlanInfo.mockResolvedValue(BLOCKED_PLAN);

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "hello" });

    // SSE always returns 200 HTTP; the error is conveyed inside the event stream
    const events = parseSseEvents(res.text);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent?.code).toBe("PAYWALL");
    expect(errEvent?.status).toBe(402);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages/stream — SSE in-memory rate limiter
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages/stream — SSE rate limiter", () => {
  function parseSseEvents(body: string): Record<string, unknown>[] {
    return body
      .split("\n\n")
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => {
        try { return JSON.parse(chunk.replace("data: ", "")); }
        catch { return {}; }
      });
  }

  it("TC-C35: returns RATE_LIMITED event after 30 requests within 60 s", async () => {
    // Use a unique userId so the rate limiter map is not polluted by other tests.
    const rateLimitedUserId = 9999;
    mockGetUserPlanInfo.mockResolvedValue(PRO_PLAN);

    // Send 30 messages (each needs a minimal DB state).
    // The SSE rate map is module-level state — we exhaust the window by sending
    // enough requests that the 31st is blocked.
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      const cycle = ((call - 1) % 3);
      if (cycle === 0) return mockDb._select([{ ...CONVO, userId: rateLimitedUserId }]);
      if (cycle === 1) return mockDb._select([MSG]);
      return mockDb._select([{ id: 1 }]);
    });
    mockDb.insert.mockReturnValue(mockDb._insert([MSG]));
    mockDb.update.mockReturnValue(mockDb._update());

    const app = makeApp(makeMockSession({ userId: rateLimitedUserId }));

    // Fire 30 requests to exhaust the window
    for (let i = 0; i < 30; i++) {
      await app.post("/api/conversations/1/messages/stream").send({ content: `msg ${i}` });
    }

    // 31st request should be rate-limited
    const res = await app
      .post("/api/conversations/1/messages/stream")
      .send({ content: "one too many" });

    const events = parseSseEvents(res.text);
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent?.code).toBe("RATE_LIMITED");
    expect(errEvent?.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages/stream — structured-UI guardrail
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages/stream — structured-UI guardrail", () => {
  it("TC-C36: blocks SSE payload with refineSource=program_refine_panel", async () => {
    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "change sets", refineSource: "program_refine_panel" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STRUCTURED_UI_ROUTE_VIOLATION");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/messages/stream — SSE AI failure path
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/:id/messages/stream — AI failure", () => {
  function parseSseEvents(body: string): Record<string, unknown>[] {
    return body
      .split("\n\n")
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => {
        try { return JSON.parse(chunk.replace("data: ", "")); }
        catch { return {}; }
      });
  }

  function setupSseWithAiError() {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return mockDb._select([CONVO]);
      if (call === 2) return mockDb._select([MSG]);
      if (call === 3) return mockDb._select([{ id: 1 }]);
      return mockDb._select([]);
    });
    mockDb.insert.mockReturnValue(mockDb._insert([MSG]));
    mockDb.update.mockReturnValue(mockDb._update());
  }

  it("TC-C37: SSE AI non-429 failure → captureWithTags called with sse endpoint tag", async () => {
    setupSseWithAiError();
    mockGenerateAIResponse.mockRejectedValue(new Error("OpenAI 500"));

    await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    expect(mockCaptureWithTags).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "ai_coach", endpoint: "sse" }),
    );
  });

  it("TC-C38: SSE AI 429 failure → no Sentry capture", async () => {
    setupSseWithAiError();
    mockGenerateAIResponse.mockRejectedValue(new Error("rate limit 429"));

    await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    expect(mockCaptureWithTags).not.toHaveBeenCalled();
  });

  it("TC-C39: SSE AI failure emits error event (not a stream crash)", async () => {
    setupSseWithAiError();
    mockGenerateAIResponse.mockRejectedValue(new Error("timeout"));

    const res = await makeApp(makeMockSession({ userId: 42 }))
      .post("/api/conversations/1/messages/stream")
      .send({ content: "give me advice" });

    // Must get SSE content type and some response body
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    // Body must have at least one SSE event
    expect(res.text).toContain("data: ");
  });
});
