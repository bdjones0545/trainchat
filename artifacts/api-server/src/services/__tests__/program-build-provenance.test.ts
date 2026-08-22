import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSystem: vi.fn(),
  upsertSystem: vi.fn(),
  createChangeLog: vi.fn(),
}));

vi.mock("../../lib/training-system-service", () => ({
  createTrainingSystemFromProgram: mocks.createSystem,
  upsertTrainingSystemFromProgram: mocks.upsertSystem,
}));
vi.mock("../../lib/change-log-service", () => ({ createChangeLogEntry: mocks.createChangeLog }));
vi.mock("../../lib/program-architecture-engine", () => ({ getLastMonthlyPlan: vi.fn(() => null) }));
vi.mock("../../lib/retentionEmails", () => ({ fireFirstBuildEmail: vi.fn(async () => undefined) }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../kevin-context-service", () => ({ buildKevinGenerationProvenance: vi.fn() }));
vi.mock("../kevin-event-service", () => ({ enqueueKevinEvent: vi.fn(async () => undefined) }));

import { saveOrUpdateProgram } from "../program-build-service";

describe("program build generation provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSystem.mockResolvedValue({ id: 44 });
    mocks.createChangeLog.mockResolvedValue(91);
  });

  it("persists bounded provenance in the initial-build decision metadata", async () => {
    const provenance = {
      provider: "openai",
      modelId: "gpt-4.1",
      promptVersion: "coach-atlas-program-2026-08-20",
      schemaVersion: "trainchat.program.v1",
      providerRequestId: "req_bounded",
      generatedAt: "2026-08-20T20:00:00.000Z",
      validationVerdict: "passed",
      constraintValidationVerdict: "passed",
      attemptCount: 2,
      fallbackUsed: false,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    };
    const program = {
      programName: "Safe Program",
      description: "Complete",
      days: [{ dayNumber: 1, name: "Day 1", exercises: [{ name: "Squat", sets: 3, reps: "8", rest: "2m" }] }],
      _generationProvenance: provenance,
    };

    await saveOrUpdateProgram({
      userId: 7,
      structuredData: program as any,
      conversationId: 8,
      focusMode: "strength",
      intentType: "CREATE_PROGRAM",
      requestText: "Build a program",
    });

    expect(mocks.createChangeLog).toHaveBeenCalledWith(expect.objectContaining({
      decisionMetadata: expect.objectContaining({ generationProvenance: provenance }),
    }));
    expect(JSON.stringify(mocks.createChangeLog.mock.calls[0])).not.toContain("apiKey");
  });
});
