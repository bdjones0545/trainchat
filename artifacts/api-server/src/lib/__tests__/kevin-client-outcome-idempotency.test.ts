import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../kevin-config", () => ({
  getKevinConfig: vi.fn(() => ({
    integrationEnabled: true,
    outcomeForwardingEnabled: true,
    hermesBaseUrl: "https://hermes.test",
    hermesApiKey: "key",
    applicationId: "trainchat",
    eventTimeoutMs: 5000,
  })),
}));

vi.mock("../kevin-circuit-breaker", () => ({
  isKevinCircuitAllowed: vi.fn(() => true),
  recordKevinFailure: vi.fn(),
  recordKevinSuccess: vi.fn(),
}));

import { sendKevinOutcome } from "../kevin-client";

describe("sendKevinOutcome transmits the Idempotency-Key header (H2)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the outcome's idempotency key exactly like event forwarding", async () => {
    await sendKevinOutcome({
      userIdPseudonymous: "tc_u_abc",
      outcomeType: "session_completed",
      resultSummary: { overall_sentiment: "positive" },
      traceId: "trace-1",
      idempotencyKey: "trainchat:outcome:trace-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("trainchat:outcome:trace-1");
  });
});
