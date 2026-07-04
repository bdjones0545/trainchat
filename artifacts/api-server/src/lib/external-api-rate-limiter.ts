/**
 * ExternalApiRateLimiter — shared-store (Postgres) rate limiter.
 *
 * Tracks requests per API key: 60 requests / 60 seconds per key (unchanged
 * from the in-memory implementation this replaces — audit F10). Counting now
 * happens in the shared `rate_limit_counters` table, so the limit holds
 * across app instances under autoscale instead of multiplying per instance.
 *
 * Fail-open: if the store is unreachable the request is allowed (see
 * shared-rate-limiter.ts for the policy rationale).
 */

import { sharedRateLimiter, type SharedRateLimitResult } from "./shared-rate-limiter";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

export type RateLimitResult = SharedRateLimitResult;

export async function checkRateLimit(
  keyId: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  return sharedRateLimiter.hit(`external:key:${keyId}`, maxRequests, windowMs);
}
