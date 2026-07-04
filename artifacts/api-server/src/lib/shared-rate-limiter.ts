/**
 * Shared (Postgres-backed) rate limiting — audit F10.
 *
 * Every previous limiter counted in process memory, so under autoscale each
 * instance enforced its own copy of the limit (N instances → N× the limit,
 * and the auth brute-force limiter diluted by N). This module counts in a
 * shared `rate_limit_counters` table instead:
 *
 *   - fixed windows: window_start = floor(now / windowMs); one row per
 *     (key, window), incremented atomically with INSERT ... ON CONFLICT
 *     DO UPDATE SET count = count + 1 RETURNING count — correct under
 *     concurrent instances with no process state.
 *   - keys encode category + principal ("chat:user:45", "external:key:9",
 *     "auth:ip:1.2.3.4") so per-user / per-key / per-IP limits never collide.
 *   - cleanup is opportunistic: ~1% of hits delete rows past their own
 *     expires_at (window-size-agnostic), so the table stays bounded without
 *     a scheduler.
 *   - FAIL-OPEN: if the DB call fails (or the table is not yet migrated),
 *     the request is allowed and a warning is logged. Rate limiting is abuse
 *     protection; it must not take the product down with it. The tradeoff is
 *     documented for the auth limiter specifically.
 *
 * Plan/paywall caps (conversation-plan-gating) are unrelated to this module
 * and unchanged — those are subscription logic, not abuse protection.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { sql, lt } from "drizzle-orm";
import { db, rateLimitCountersTable } from "@workspace/db";
import type { Dbx } from "./db-executor";
import { logger } from "./logger";

export interface SharedRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the current window ends
  limit: number;
  /** true when the DB was unreachable and the request was allowed fail-open */
  failedOpen?: boolean;
}

const CLEANUP_PROBABILITY = 0.01;

/**
 * Count one hit against `key` in the shared store and report whether the
 * caller is within `maxRequests` per `windowMs`.
 *
 * `nowFn` is injectable for deterministic tests.
 */
export class SharedRateLimiter {
  constructor(
    private readonly dbx: Dbx = db,
    private readonly nowFn: () => number = Date.now,
  ) {}

  async hit(key: string, maxRequests: number, windowMs: number): Promise<SharedRateLimitResult> {
    const now = this.nowFn();
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const resetAt = windowStartMs + windowMs;

    try {
      const [row] = await this.dbx
        .insert(rateLimitCountersTable)
        .values({
          key,
          windowStart,
          count: 1,
          expiresAt: new Date(resetAt),
        })
        .onConflictDoUpdate({
          target: [rateLimitCountersTable.key, rateLimitCountersTable.windowStart],
          set: { count: sql`${rateLimitCountersTable.count} + 1` },
        })
        .returning({ count: rateLimitCountersTable.count });

      const count = row?.count ?? 1;

      // Opportunistic cleanup of rows whose own window has ended. Wrapped in
      // Promise.resolve so the lazy Drizzle builder actually executes without
      // blocking this request; failures are logged and ignored.
      if (Math.random() < CLEANUP_PROBABILITY) {
        Promise.resolve(
          this.dbx
            .delete(rateLimitCountersTable)
            .where(lt(rateLimitCountersTable.expiresAt, new Date(now))),
        ).then(
          () => {},
          (err: unknown) => logger.warn({ err }, "[SharedRateLimiter] cleanup failed (non-fatal)"),
        );
      }

      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetAt,
        limit: maxRequests,
      };
    } catch (err) {
      logger.warn(
        { err, key },
        "[SharedRateLimiter] store unavailable — failing open (request allowed)",
      );
      return { allowed: true, remaining: maxRequests, resetAt, limit: maxRequests, failedOpen: true };
    }
  }
}

/** Module-level default limiter used by middleware and route helpers. */
export const sharedRateLimiter = new SharedRateLimiter();

// ─── Express middleware factory ───────────────────────────────────────────────

export interface SharedRateLimitOptions {
  /** Key namespace, e.g. "chat", "ts-edit", "share". */
  category: string;
  max: number;
  windowMs: number;
  /** Human-readable message for the 429 body. */
  message?: string;
  /** Override principal resolution. Defaults to session user, else IP. */
  keyFor?: (req: Request) => string;
  /** Injectable for tests. */
  limiter?: SharedRateLimiter;
}

/** Default principal: authenticated session user, else client IP. */
export function defaultPrincipal(req: Request): string {
  const userId = (req as Request & { session?: { userId?: number } }).session?.userId;
  return userId != null ? `user:${userId}` : `ip:${req.ip ?? "unknown"}`;
}

/**
 * Shared-store rate-limit middleware. On limit: HTTP 429 with a stable JSON
 * shape ({ error, code: "RATE_LIMITED", retryAfter }) and a Retry-After
 * header. Sets standard X-RateLimit-* headers on every response.
 */
export function sharedRateLimit(options: SharedRateLimitOptions): RequestHandler {
  const {
    category,
    max,
    windowMs,
    message = "Too many requests. Please wait a moment and try again.",
    keyFor,
    limiter = sharedRateLimiter,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = keyFor ? keyFor(req) : defaultPrincipal(req);
    const result = await limiter.hit(`${category}:${principal}`, max, windowMs);

    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", retryAfterSec);
      res.status(429).json({
        error: message,
        code: "RATE_LIMITED",
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}

// ─── express-rate-limit store adapter (auth brute-force limiter) ──────────────

/**
 * Minimal express-rate-limit (v7+) Store backed by the shared counter table,
 * so the auth brute-force limiter counts across instances instead of per
 * process. Fail-open matches the module policy: if the DB is down, increment
 * reports 1 hit (allowed) rather than blocking logins.
 *
 * decrement/resetKey are best-effort no-ops: the auth limiter does not use
 * skipFailedRequests/skipSuccessfulRequests, so they are never called in
 * production config.
 */
export class SharedExpressRateLimitStore {
  /** Set by express-rate-limit via init(). */
  private windowMs = 60_000;
  /** Key namespace (public — express-rate-limit's Store contract reads it). */
  readonly prefix: string;
  /** Keys live in Postgres, shared across instances. */
  readonly localKeys = false;

  // Distinct keys per limiter instance so two express-rate-limit instances
  // with different configs never share counters.
  constructor(prefix = "erl", private readonly limiter: SharedRateLimiter = sharedRateLimiter) {
    this.prefix = prefix;
  }

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const result = await this.limiter.hit(`${this.prefix}:${key}`, Number.MAX_SAFE_INTEGER, this.windowMs);
    if (result.failedOpen) {
      return { totalHits: 1, resetTime: new Date(result.resetAt) };
    }
    // totalHits = how many requests this window; express-rate-limit compares
    // against its own max.
    return { totalHits: result.limit - result.remaining, resetTime: new Date(result.resetAt) };
  }

  async decrement(_key: string): Promise<void> {
    // no-op (not used by our config)
  }

  async resetKey(_key: string): Promise<void> {
    // no-op (not used by our config)
  }
}
