/**
 * sse.test.ts — Unit tests for lib/sse.ts
 *
 * Tests the three categories of helpers extracted from the SSE route handler:
 *   1. setupSseHeaders  — sets the four required response headers
 *   2. sseEmit / sseDone — write events to the client; survive disconnects
 *   3. checkSseRateLimit — sliding-window counter; blocks after 30 req/60 s
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupSseHeaders, sseEmit, sseDone, checkSseRateLimit, _sseRateMap } from "../sse";

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
  // Each test group uses a unique userId prefix to avoid cross-test contamination
  // from the module-level _sseRateMap.

  it("allows the first request", () => {
    expect(checkSseRateLimit("rl-test-1")).toBe(true);
  });

  it("allows up to 30 requests within the window", () => {
    const uid = "rl-test-2";
    for (let i = 0; i < 29; i++) checkSseRateLimit(uid);
    expect(checkSseRateLimit(uid)).toBe(true); // 30th — still allowed
  });

  it("blocks the 31st request within the window", () => {
    const uid = "rl-test-3";
    for (let i = 0; i < 30; i++) checkSseRateLimit(uid);
    expect(checkSseRateLimit(uid)).toBe(false);
  });

  it("accepts both number and string userId", () => {
    expect(checkSseRateLimit(88888)).toBe(true);
    expect(checkSseRateLimit("88888")).toBe(true); // same bucket — 2 requests
  });

  it("allows a new request after the window expires", () => {
    const uid = "rl-test-4";
    // Fill the bucket
    for (let i = 0; i < 30; i++) checkSseRateLimit(uid);
    expect(checkSseRateLimit(uid)).toBe(false);

    // Backdate all timestamps so they fall outside the 60-second window
    const stale = Date.now() - 61_000;
    _sseRateMap.set(uid, Array(30).fill(stale));

    expect(checkSseRateLimit(uid)).toBe(true);
  });

  it("isolates rate limits per userId", () => {
    const uid1 = "rl-test-5a";
    const uid2 = "rl-test-5b";
    for (let i = 0; i < 30; i++) checkSseRateLimit(uid1);
    // uid2 has never been called — should still be allowed
    expect(checkSseRateLimit(uid2)).toBe(true);
  });
});
