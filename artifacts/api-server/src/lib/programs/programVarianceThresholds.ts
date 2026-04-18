/**
 * Program Variance Thresholds & Buckets
 *
 * Single source of truth for all variance thresholds, bucket definitions,
 * and similarity weights used by the Program Variance Audit system.
 *
 * Change values here — every downstream consumer picks them up automatically.
 */

// ─── Variance Buckets ──────────────────────────────────────────────────────────

export type VarianceBucket =
  | "EXCELLENT_VARIANCE"
  | "GOOD_VARIANCE"
  | "BORDERLINE_VARIANCE"
  | "LOW_VARIANCE"
  | "STALE_OUTPUT";

/**
 * Classify a varianceScore (0–1) into a human-readable bucket.
 * Variance score = 1 − similarity score. Higher = more different = better.
 */
export function classifyVariance(varianceScore: number): VarianceBucket {
  if (varianceScore >= 0.80) return "EXCELLENT_VARIANCE";
  if (varianceScore >= 0.65) return "GOOD_VARIANCE";
  if (varianceScore >= 0.50) return "BORDERLINE_VARIANCE";
  if (varianceScore >= 0.35) return "LOW_VARIANCE";
  return "STALE_OUTPUT";
}

/** True if a reroll should be recommended given this variance score. */
export function shouldRerollForVariance(varianceScore: number): boolean {
  return varianceScore < THRESHOLDS.rerollBelow;
}

/** True if a hard reroll must trigger (mandatory, not just recommended). */
export function mustReroll(varianceScore: number): boolean {
  return varianceScore < THRESHOLDS.mustRerollBelow;
}

// ─── Centralized Thresholds ───────────────────────────────────────────────────

export const THRESHOLDS = {
  /** varianceScore >= this is acceptable — no action needed */
  acceptable: 0.65,
  /** varianceScore < this → borderline, log a warning */
  borderlineBelow: 0.65,
  /** varianceScore < this → too similar, recommend reroll */
  rerollBelow: 0.50,
  /** varianceScore < this → stale output, must reroll */
  mustRerollBelow: 0.35,
  /** Maximum number of recent programs to compare against */
  comparisonWindowSize: 5,
  /** Minimum programs in history before variance check is meaningful */
  minimumHistoryForAudit: 1,
  /** How many reroll attempts to make before giving up */
  maxRerollAttempts: 3,
} as const;

// ─── Layered Similarity Weights ───────────────────────────────────────────────

/**
 * Weights for each similarity dimension. Must sum to 1.0.
 * Adjust here — logged with every audit entry.
 */
export const SIMILARITY_WEIGHTS = {
  /** Block archetype + phase + progression style */
  block: 0.15,
  /** Split architecture + day theme sequence */
  split: 0.20,
  /** Slot ordering + density + day structure */
  slot: 0.15,
  /** Movement family distribution balance */
  family: 0.20,
  /** Exact exercise overlap in primary slots */
  exercise: 0.20,
  /** Overall "program identity" (top lift pattern + feel fingerprint) */
  identity: 0.10,
} as const;

/** Assert weights sum to 1.0 */
const weightSum = Object.values(SIMILARITY_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`[ProgramVarianceThresholds] SIMILARITY_WEIGHTS must sum to 1.0, got ${weightSum.toFixed(3)}`);
}

// ─── Reason detection thresholds ─────────────────────────────────────────────

export const REASON_THRESHOLDS = {
  /** Archetype repetition rate that triggers a low-variance reason */
  archetypeRepetitionRate: 0.6,
  /** Split repetition rate that triggers a low-variance reason */
  splitRepetitionRate: 0.6,
  /** Exercise overlap rate that triggers a low-variance reason */
  exerciseOverlapRate: 0.5,
  /** Family similarity that triggers a family-level reason */
  familySimilarity: 0.7,
} as const;
