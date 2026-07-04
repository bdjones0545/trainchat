/**
 * Auth route rate limiter — L-03 hardening
 *
 * Limits login, register, and forgot-password to 20 requests per 15-minute
 * window per IP. This constrains brute-force and credential-stuffing attacks.
 *
 * express-rate-limit reads the real client IP from X-Forwarded-For because
 * app.set("trust proxy", 1) is set in app.ts. Without trust-proxy, this
 * middleware would rate-limit the Replit proxy's IP instead of the user's.
 *
 * The window and max values are intentionally conservative — false positives
 * on a rate-limited auth endpoint are preferable to successful brute-force.
 *
 * F10: counting is backed by the shared rate_limit_counters table (a custom
 * express-rate-limit Store), so the brute-force budget is 20/15min TOTAL
 * across instances — previously the default MemoryStore gave each autoscale
 * instance its own 20. Tradeoff: the store fails OPEN on DB errors (an
 * attacker who can take down Postgres gets unlimited attempts, but then
 * logins fail anyway since credentials live in the same DB).
 */

import rateLimit from "express-rate-limit";
import { SharedExpressRateLimitStore } from "../lib/shared-rate-limiter";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new SharedExpressRateLimitStore("auth"),
  message: {
    error: "Too many requests. Please wait 15 minutes before trying again.",
    reason: "rate_limited",
  },
  // Skip rate limiting in test environments so test suites aren't affected.
  skip: () => process.env.NODE_ENV === "test",
});
