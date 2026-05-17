/**
 * ExternalApiRateLimiter — In-memory sliding window rate limiter
 *
 * Tracks requests per API key over a rolling window.
 * Default: 60 requests / 60 seconds per key.
 *
 * Designed to be lightweight and self-cleaning — expired windows are
 * pruned on each check so memory does not grow unboundedly.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

function pruneOldEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter(t => now - t < DEFAULT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;

function startPruneTimer(): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(pruneOldEntries, 30_000);
  if (pruneTimer.unref) pruneTimer.unref();
}

startPruneTimer();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function checkRateLimit(
  keyId: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(keyId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(keyId, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  const count = entry.timestamps.length;
  const allowed = count < maxRequests;

  if (allowed) {
    entry.timestamps.push(now);
  }

  const oldest = entry.timestamps[0] ?? now;
  const resetAt = oldest + windowMs;

  return {
    allowed,
    remaining: Math.max(0, maxRequests - count - (allowed ? 1 : 0)),
    resetAt,
    limit: maxRequests,
  };
}
