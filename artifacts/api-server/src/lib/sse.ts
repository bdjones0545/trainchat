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

// ─── In-memory SSE rate limiter ────────────────────────────────────────────────
// 30 requests per authenticated user per 60-second sliding window.
// Module-level map; no external dependency required.

export const _sseRateMap = new Map<string, number[]>();

const SSE_RATE_LIMIT = 30;
const SSE_RATE_WINDOW_MS = 60_000;

export function checkSseRateLimit(userId: number | string): boolean {
  const key = String(userId);
  const now = Date.now();
  const cutoff = now - SSE_RATE_WINDOW_MS;
  const timestamps = (_sseRateMap.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= SSE_RATE_LIMIT) return false;
  timestamps.push(now);
  _sseRateMap.set(key, timestamps);
  return true;
}
