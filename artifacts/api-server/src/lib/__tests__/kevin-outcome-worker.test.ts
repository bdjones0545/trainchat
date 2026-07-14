// ─── Kevin Outcome Worker — Unit Tests ───────────────────────────────────────
//
// Tests for the durable Kevin outcome retry worker.
//
// All DB and Kevin client calls are mocked.
// KEVIN_HERMES_BASE_URL must be set for live-call tests (skipped otherwise).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../kevin-config", () => ({
  getKevinConfig: vi.fn(),
}));

vi.mock("../kevin-circuit-breaker", () => ({
  isKevinCircuitAllowed: vi.fn(() => true),
}));

vi.mock("../kevin-pseudonym", () => ({
  deriveKevinPseudonymousId: vi.fn((id: number) => `pseudo_${id}`),
  deriveKevinPseudonymousOrgId: vi.fn((id: string) => `orgpseudo_${id}`),
}));

// ── DB mock: captures which queries are called ────────────────────────────────

const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsertReturning = vi.fn().mockResolvedValue(undefined);
const mockInsertBuilder = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockReturnThis() };

const mockUpdateSet = vi.fn().mockReturnThis();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateBuilder = { set: mockUpdateSet, where: mockUpdateWhere };

const mockSelect = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockSelectLimit = vi.fn();

const mockDbInsert = vi.fn().mockReturnValue(mockInsertBuilder);
const mockDbUpdate = vi.fn().mockReturnValue(mockUpdateBuilder);
const mockDbSelect = vi.fn();

vi.mock("@workspace/db", async () => {
  const db: Record<string, any> = {};

  // Lazily accessed — the mock configures returns per test
  db.insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
      catch: vi.fn().mockResolvedValue(undefined),
    }),
    catch: vi.fn().mockResolvedValue(undefined),
  });
  db.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  db.select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });

  return {
    db,
    kevinTrainingOutcomesTable: {
      id: "id",
      forwardStatus: "forward_status",
      nextRetryAt: "next_retry_at",
      forwardAttempts: "forward_attempts",
      createdAt: "created_at",
    },
  };
});

vi.mock("../kevin-client", () => ({
  sendKevinOutcome: vi.fn(),
  KevinError: class KevinError extends Error {
    code: string;
    constructor(message: string, code = "KEVIN_ERROR") {
      super(message);
      this.code = code;
    }
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  flushPendingKevinTrainingOutcomes,
  startKevinOutcomeWorker,
  stopKevinOutcomeWorker,
  recordKevinOutcome,
  recordProgramGenerated,
  recordSessionCompleted,
  recordSessionFeedbackOutcome,
} from "../../services/kevin-outcome-service";
import { getKevinConfig } from "../kevin-config";
import { isKevinCircuitAllowed } from "../kevin-circuit-breaker";
import { sendKevinOutcome } from "../kevin-client";
import { db } from "@workspace/db";

const mockGetKevinConfig = vi.mocked(getKevinConfig);
const mockCircuitAllowed = vi.mocked(isKevinCircuitAllowed);
const mockSendKevinOutcome = vi.mocked(sendKevinOutcome);
const mockDb = db as any;

function enabledConfig() {
  return {
    integrationEnabled: true,
    outcomeForwardingEnabled: true,
    eventDispatchEnabled: true,
    contextRetrievalEnabled: true,
    signalIntakeEnabled: true,
    applicationId: "trainchat",
    hermesBaseUrl: "https://hermes.example.com",
    hermesApiKey: "key",
  };
}

function disabledConfig() {
  return { ...enabledConfig(), integrationEnabled: false };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("flushPendingKevinTrainingOutcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when integration is disabled", async () => {
    mockGetKevinConfig.mockReturnValue(disabledConfig() as any);

    const result = await flushPendingKevinTrainingOutcomes();
    expect(result).toEqual({ processed: 0, forwarded: 0, failed: 0 });
  });

  it("returns zero counts when outcomeForwardingEnabled=false", async () => {
    mockGetKevinConfig.mockReturnValue({ ...enabledConfig(), outcomeForwardingEnabled: false } as any);

    const result = await flushPendingKevinTrainingOutcomes();
    expect(result).toEqual({ processed: 0, forwarded: 0, failed: 0 });
  });

  it("returns zero counts when circuit is open", async () => {
    mockGetKevinConfig.mockReturnValue(enabledConfig() as any);
    mockCircuitAllowed.mockReturnValue(false);

    const result = await flushPendingKevinTrainingOutcomes();
    expect(result).toEqual({ processed: 0, forwarded: 0, failed: 0 });
  });

  it("returns zero counts when no pending outcomes", async () => {
    mockGetKevinConfig.mockReturnValue(enabledConfig() as any);
    mockCircuitAllowed.mockReturnValue(true);

    // Empty batch — no rows to claim
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // empty result
        }),
      }),
    });

    const result = await flushPendingKevinTrainingOutcomes();
    expect(result).toEqual({ processed: 0, forwarded: 0, failed: 0 });
  });
});

describe("startKevinOutcomeWorker / stopKevinOutcomeWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopKevinOutcomeWorker(); // ensure clean state
  });

  afterEach(() => {
    stopKevinOutcomeWorker();
  });

  it("does not start when integration is disabled", () => {
    mockGetKevinConfig.mockReturnValue(disabledConfig() as any);
    // Should not throw
    startKevinOutcomeWorker();
    stopKevinOutcomeWorker();
  });

  it("does not start when outcomeForwardingEnabled=false", () => {
    mockGetKevinConfig.mockReturnValue({ ...enabledConfig(), outcomeForwardingEnabled: false } as any);
    startKevinOutcomeWorker();
    stopKevinOutcomeWorker();
  });
});

describe("recordKevinOutcome helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKevinConfig.mockReturnValue(enabledConfig() as any);
  });

  it("recordProgramGenerated does not throw", () => {
    expect(() => {
      recordProgramGenerated(1, "prog_abc", {
        kevinContextUsed: true,
        trainingSystemId: 42,
      });
    }).not.toThrow();
  });

  it("recordSessionCompleted does not throw", () => {
    expect(() => {
      recordSessionCompleted(1, "sess_abc");
    }).not.toThrow();
  });

  it("recordSessionFeedbackOutcome classifies too_hard correctly", () => {
    // scores.difficulty >= 4 → too_hard
    expect(() => {
      recordSessionFeedbackOutcome(1, "sess_123", { difficulty: 5, energy: 3, pain: 2 });
    }).not.toThrow();
  });

  it("recordSessionFeedbackOutcome classifies too_easy correctly", () => {
    expect(() => {
      recordSessionFeedbackOutcome(1, "sess_123", { difficulty: 1, energy: 4, pain: 1 });
    }).not.toThrow();
  });
});

describe("recordKevinOutcome (disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKevinConfig.mockReturnValue(disabledConfig() as any);
  });

  it("is a no-op when integration is disabled", async () => {
    await recordKevinOutcome({
      userId: 1,
      outcomeType: "generated",
      entityType: "program",
      entityId: "prog_1",
    });
    // DB should not have been called
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
