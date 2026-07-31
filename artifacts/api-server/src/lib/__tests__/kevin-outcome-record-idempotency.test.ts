// Verifies recordKevinOutcome stamps a stable idempotency key and inserts with a
// conflict target so duplicate logical outcomes are harmless (H2).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { insert, values, onConflictDoNothing, capturedValues, capturedConflict } =
  vi.hoisted(() => {
    const capturedValues: Record<string, unknown>[] = [];
    const capturedConflict: unknown[] = [];
    const onConflictDoNothing = vi.fn((arg?: unknown) => {
      capturedConflict.push(arg);
      return { catch: () => Promise.resolve() };
    });
    const values = vi.fn((v: Record<string, unknown>) => {
      capturedValues.push(v);
      return { onConflictDoNothing };
    });
    const insert = vi.fn(() => ({ values }));
    return { insert, values, onConflictDoNothing, capturedValues, capturedConflict };
  });

vi.mock("../kevin-config", () => ({
  getKevinConfig: vi.fn(() => ({
    integrationEnabled: true,
    pseudonymSalt: "test-salt",
    applicationId: "trainchat",
  })),
}));

vi.mock("../kevin-pseudonym", () => ({
  deriveKevinPseudonymousId: vi.fn((id: number) => `pseudo_${id}`),
  deriveKevinPseudonymousOrgId: vi.fn((id: string) => `orgpseudo_${id}`),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@workspace/db", () => ({
  db: { insert },
  kevinTrainingOutcomesTable: { idempotencyKey: "idempotency_key" },
}));

import { recordKevinOutcome } from "../../services/kevin-outcome-service";

describe("recordKevinOutcome idempotency (H2)", () => {
  beforeEach(() => {
    capturedValues.length = 0;
    capturedConflict.length = 0;
  });

  it("stamps a non-empty idempotency key and inserts with a conflict target", async () => {
    await recordKevinOutcome({
      userId: 1,
      outcomeType: "session_completed",
      traceId: "fixed-trace",
    });

    expect(capturedValues).toHaveLength(1);
    expect(capturedValues[0]?.idempotencyKey).toBe("trainchat:outcome:fixed-trace");
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(capturedConflict[0]).toEqual({ target: "idempotency_key" });
  });

  it("honours a caller-supplied stable idempotency key", async () => {
    await recordKevinOutcome({
      userId: 1,
      outcomeType: "session_completed",
      idempotencyKey: "session_completed:42",
    });
    expect(capturedValues[0]?.idempotencyKey).toBe("session_completed:42");
  });

  it("skips entirely when no pseudonym salt is configured (never staging a raw key)", async () => {
    const { getKevinConfig } = await import("../kevin-config");
    (getKevinConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      integrationEnabled: true,
      pseudonymSalt: null,
      applicationId: "trainchat",
    });
    await recordKevinOutcome({ userId: 1, outcomeType: "session_completed" });
    expect(capturedValues).toHaveLength(0);
  });
});
