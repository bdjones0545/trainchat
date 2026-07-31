// Regression guard (H5): the outcome allowlist must keep every categorical key
// the outcome factories actually emit. difficulty_level / energy_response were
// dropped once because the allowlist held the event-side numeric names instead.

import { describe, it, expect, vi, beforeEach } from "vitest";

const captured: { resultSummary?: Record<string, unknown> }[] = vi.hoisted(() => [] as any);

vi.mock("../kevin-config", () => ({
  getKevinConfig: vi.fn(() => ({ integrationEnabled: true, pseudonymSalt: "test-salt" })),
}));

vi.mock("../kevin-pseudonym", () => ({
  deriveKevinPseudonymousId: vi.fn((id: number) => `pseudo_${id}`),
  deriveKevinPseudonymousOrgId: vi.fn((id: string) => `orgpseudo_${id}`),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        captured.push(v as any);
        return { catch: () => Promise.resolve() };
      }),
    })),
  },
  kevinTrainingOutcomesTable: {},
}));

import { recordSessionFeedbackOutcome, recordExerciseSubstituted } from "../../services/kevin-outcome-service";

// recordSessionFeedbackOutcome fires recordKevinOutcome().catch() without await;
// flush the microtask queue so the insert runs before we assert.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("outcome sanitization keeps produced categorical keys (H5 regression)", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("retains difficulty_level, energy_response and overall_sentiment", async () => {
    recordSessionFeedbackOutcome(1, "session-1", { difficulty: 5, energy: 1, pain: 0 });
    await flush();

    expect(captured).toHaveLength(1);
    const summary = captured[0]?.resultSummary as Record<string, unknown>;
    expect(summary).toEqual({
      difficulty_level: "high",
      energy_response: "poor",
      overall_sentiment: "negative",
    });
  });

  it("retains user_initiated on exercise substitution", async () => {
    recordExerciseSubstituted(1, "ex-1", true);
    await flush();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.resultSummary).toEqual({ user_initiated: true });
  });
});
