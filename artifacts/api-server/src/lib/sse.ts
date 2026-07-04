import type { Response } from "express";

// ─── SSE header setup ──────────────────────────────────────────────────────────

export function setupSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

// ─── SSE event writers ─────────────────────────────────────────────────────────

export function sseEmit(res: Response, event: Record<string, unknown>): void {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    // client disconnected — swallow so the handler can still call done()
  }
}

export function sseDone(res: Response, event: Record<string, unknown>): void {
  sseEmit(res, event);
  res.end();
}

// ─── Chat rate limiter (shared store — audit F10) ─────────────────────────────
// 30 requests per authenticated user per 60-second window. Previously an
// in-memory sliding window (per process — the effective limit multiplied
// under autoscale); now counted in the shared rate_limit_counters table so it
// holds across instances. Fail-open on store errors (see shared-rate-limiter.ts).

import { sharedRateLimiter } from "./shared-rate-limiter";

const SSE_RATE_LIMIT = 30;
const SSE_RATE_WINDOW_MS = 60_000;

export async function checkSseRateLimit(userId: number | string): Promise<boolean> {
  const result = await sharedRateLimiter.hit(
    `chat:user:${String(userId)}`,
    SSE_RATE_LIMIT,
    SSE_RATE_WINDOW_MS,
  );
  return result.allowed;
}
