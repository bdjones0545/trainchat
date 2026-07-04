/**
 * Rate limiters for LLM-triggering routes (audit F10).
 *
 * These routes previously had NO rate limit — only requireAuth. Anonymous
 * accounts are free to mint (one per device id), so an authenticated-but-free
 * session could invoke LLM-backed endpoints without bound. Limits are counted
 * in the shared Postgres store, so they hold across autoscale instances.
 *
 * Budgets (per authenticated user; per IP if somehow unauthenticated):
 *   - program-edit  30/60s — /training-system/edit, /training-system/mutate,
 *     /insights/apply. One shared bucket across all three so alternating
 *     endpoints can't triple the budget; 30/min matches the chat budget and
 *     is far above any legitimate UI cadence.
 *   - share         10/60s — /share-moments/* (card/audit generation).
 *
 * Plan/paywall caps are separate and unchanged — these limits are abuse
 * protection, not subscription enforcement.
 */

import { sharedRateLimit } from "../lib/shared-rate-limiter";

export const programEditRateLimiter = sharedRateLimit({
  category: "program-edit",
  max: 30,
  windowMs: 60_000,
  message: "You're making changes too quickly. Please wait a moment and try again.",
});

export const shareMomentsRateLimiter = sharedRateLimit({
  category: "share",
  max: 10,
  windowMs: 60_000,
  message: "Too many share requests. Please wait a moment and try again.",
});
