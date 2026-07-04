/**
 * sse.test.ts — Unit tests for lib/sse.ts
 *
 * Tests the three categories of helpers extracted from the SSE route handler:
 *   1. setupSseHeaders  — sets the four required response headers
 *   2. sseEmit / sseDone — write events to the client; survive disconnects
 *   3. checkSseRateLimit — shared-store counter (F10); blocks after 30 req/60 s.
 *      The store itself is covered in shared-rate-limiter.test.ts; here we
 *      verify the chat wrapper forwards the right key/limit/window and maps
 *      the result to a boolean.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shared-rate-limiter", () => ({
  sharedRateLimiter: { hit: vi.fn() },
}));

import { setupSseHeaders, sseEmit, sseDone, checkSseRateLimit } from "../sse";
import { sharedRateLimiter } from "../shared-rate-limiter";

const mockHit = sharedRateLimiter.hit as ReturnType<typeof vi.fn>;

// ─── Minimal res mock ────────────────────────────────────────────────────────

function makeMockRes() {
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
}

// ─── setupSseHeaders ─────────────────────────────────────────────────────────

describe("setupSseHeaders", () => {
  it("sets Content-Type text/event-stream", () => {
    const res = makeMockRes();
    setupSseHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
  });

  it("sets Cache-Control no-cache", () => {
    const res = makeMockRes();
    setupSseHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
  });

  it("sets Connection keep-alive", () => {
    const res = makeMockRes();
    setupSseHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
  });

  it("sets X-Accel-Buffering no (nginx buffering off)", () => {
    const res = makeMockRes();
    setupSseHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
  });

  it("calls flushHeaders after setting all four headers", () => {
    const res = makeMockRes();
    const callOrder: string[] = [];
    res.setHeader.mockImplementation(() => callOrder.push("setHeader"));
    res.flushHeaders.mockImplementation(() => callOrder.push("flushHeaders"));

    setupSseHeaders(res as any);

    expect(res.flushHeaders).toHaveBeenCalledOnce();
    expect(callOrder.at(-1)).toBe("flushHeaders");
  });
});

// ─── sseEmit ─────────────────────────────────────────────────────────────────

describe("sseEmit", () => {
  it("writes a data: line with JSON-serialized event", () => {
    const res = makeMockRes();
    sseEmit(res as any, { type: "stage", stage: "loading" });
    expect(res.write).toHaveBeenCalledWith('data: {"type":"stage","stage":"loading"}\n\n');
  });

  it("does not throw when res.write throws (disconnected client)", () => {
    const res = makeMockRes();
    res.write.mockImplementation(() => { throw new Error("write after end"); });
    expect(() => sseEmit(res as any, { type: "ping" })).not.toThrow();
  });

  it("swallows the error silently — does not call res.end", () => {
    const res = makeMockRes();
    res.write.mockImplementation(() => { throw new Error("closed"); });
    sseEmit(res as any, { type: "ping" });
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ─── sseDone ─────────────────────────────────────────────────────────────────

describe("sseDone", () => {
  it("writes the final event then calls res.end()", () => {
    const res = makeMockRes();
    sseDone(res as any, { type: "complete" });
    expect(res.write).toHaveBeenCalledWith('data: {"type":"complete"}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("calls res.end even when res.write throws", () => {
    const res = makeMockRes();
    res.write.mockImplementation(() => { throw new Error("closed"); });
    sseDone(res as any, { type: "complete" });
    expect(res.end).toHaveBeenCalledOnce();
  });
});

// ─── checkSseRateLimit ───────────────────────────────────────────────────────

describe("checkSseRateLimit", () => {
  beforeEach(() => {
    mockHit.mockReset();
  });

  it("counts against the shared chat bucket with 30 req / 60 s", async () => {
    mockHit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: 0, limit: 30 });
    await checkSseRateLimit(45);
    expect(mockHit).toHaveBeenCalledWith("chat:user:45", 30, 60_000);
  });

  it("returns true when the store allows the request", async () => {
    mockHit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: 0, limit: 30 });
    await expect(checkSseRateLimit("u1")).resolves.toBe(true);
  });

  it("returns false when the store reports the limit exceeded", async () => {
    mockHit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0, limit: 30 });
    await expect(checkSseRateLimit("u1")).resolves.toBe(false);
  });

  it("uses the same bucket for number and string userId", async () => {
    mockHit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: 0, limit: 30 });
    await checkSseRateLimit(88888);
    await checkSseRateLimit("88888");
    expect(mockHit).toHaveBeenNthCalledWith(1, "chat:user:88888", 30, 60_000);
    expect(mockHit).toHaveBeenNthCalledWith(2, "chat:user:88888", 30, 60_000);
  });
});
