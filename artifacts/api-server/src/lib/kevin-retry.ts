// ─── Kevin worker retry policy ────────────────────────────────────────────────
//
// Shared by the event and outcome workers so the retry schedule and the
// "local failure does not consume budget" rule are defined once and unit-tested
// directly (M2).
//
// Schedule (documented in docs/kevin-integration.md):
//   failure 1 → 30s   failure 2 → 2m   failure 3 → 8m
//   failure 4 → 30m   failure 5 → 2h    failure 6 → dead-letter
//
// `newAttempts` is the 1-based count of failed attempts so far. The FIRST
// failure (newAttempts = 1) schedules the first delay (30s) — the previous code
// skipped it by indexing with the post-increment count.

export const KEVIN_RETRY_DELAYS_MS = [
  30_000, // 30 seconds
  120_000, // 2 minutes
  480_000, // 8 minutes
  1_800_000, // 30 minutes
  7_200_000, // 2 hours
] as const;

/** Number of scheduled retries before a row dead-letters. */
export const KEVIN_MAX_RETRIES = KEVIN_RETRY_DELAYS_MS.length; // 5

/**
 * Delay (ms) before the next retry, given the 1-based count of failures so far.
 * newAttempts=1 → 30s (index 0); clamps to the final delay past the schedule.
 */
export function kevinNextRetryDelay(newAttempts: number): number {
  const idx = Math.min(
    Math.max(newAttempts - 1, 0),
    KEVIN_RETRY_DELAYS_MS.length - 1,
  );
  return KEVIN_RETRY_DELAYS_MS[idx]!;
}

/**
 * Whether a row should dead-letter after this failure. True once the failures
 * exceed the number of scheduled delays (i.e. all retries have been used).
 */
export function kevinShouldDeadLetter(newAttempts: number): boolean {
  return newAttempts > KEVIN_MAX_RETRIES;
}

// Local/config errors: the dispatch never reached Kevin, so these must NOT
// increment attempts or dead-letter — the row is released back to pending.
const KEVIN_LOCAL_NONRETRY_CODES = new Set([
  "KEVIN_DISABLED",
  "KEVIN_NOT_CONFIGURED",
  "KEVIN_CIRCUIT_OPEN",
]);

/** True if the KevinError code is a local/config failure that must not consume budget. */
export function isKevinLocalNonRetryCode(code: string | undefined): boolean {
  return code !== undefined && KEVIN_LOCAL_NONRETRY_CODES.has(code);
}
