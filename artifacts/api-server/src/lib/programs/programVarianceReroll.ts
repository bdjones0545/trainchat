/**
 * Program Variance Reroll — Structured fallback coordination
 *
 * Coordinates the reroll/fallback logic when a generated program scores
 * below the variance threshold. Tries progressively stronger interventions:
 *
 *   1. Boost novelty pressure → exercise ranking changes
 *   2. Select next-best split architecture
 *   3. Select next-best block archetype (if valid)
 *
 * All steps are logged. No blind randomization.
 * Safety and constraint fit are preserved across all rerolls.
 */

import { THRESHOLDS, shouldRerollForVariance } from "./programVarianceThresholds";
import type { AggregatedSimilarityResult } from "./programSimilarity";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RerollAction =
  | "boost_novelty_pressure"
  | "select_next_split"
  | "select_next_archetype"
  | "none";

export interface RerollStep {
  action: RerollAction;
  reason: string;
  preRerollVarianceScore: number;
  postRerollVarianceScore: number | null;
  succeeded: boolean;
}

export interface RerollPlan {
  rerollRecommended: boolean;
  steps: RerollStep[];
  finalVarianceScore: number | null;
  improved: boolean;
}

// ─── DEV Logging ─────────────────────────────────────────────────────────────

export function emitRerollLog(action: RerollAction, reason: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[ProgramVarianceAuditReroll] reason=${reason} action=${action}`);
}

export function emitRerollWarning(message: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[ProgramVarianceAuditWarning] ${message}`);
}

// ─── Reroll Decision ─────────────────────────────────────────────────────────

/**
 * Determine whether and how to reroll based on variance score.
 * Returns the plan but does NOT execute the reroll — that is done by the caller.
 */
export function planVarianceReroll(
  aggregated: AggregatedSimilarityResult,
  attemptNumber: number = 1,
): {
  shouldReroll: boolean;
  recommendedAction: RerollAction;
  reason: string;
} {
  const { varianceScore } = aggregated;

  if (!shouldRerollForVariance(varianceScore)) {
    return { shouldReroll: false, recommendedAction: "none", reason: "variance acceptable" };
  }

  if (attemptNumber === 1) {
    emitRerollLog("boost_novelty_pressure", "low_variance");
    return {
      shouldReroll: true,
      recommendedAction: "boost_novelty_pressure",
      reason: `varianceScore ${varianceScore.toFixed(3)} < threshold ${THRESHOLDS.rerollBelow} (attempt 1: boost novelty pressure)`,
    };
  }

  if (attemptNumber === 2) {
    emitRerollLog("select_next_split", "low_variance");
    return {
      shouldReroll: true,
      recommendedAction: "select_next_split",
      reason: `varianceScore ${varianceScore.toFixed(3)} still low after novelty boost (attempt 2: select next split)`,
    };
  }

  if (attemptNumber >= 3) {
    emitRerollLog("select_next_archetype", "low_variance");
    return {
      shouldReroll: true,
      recommendedAction: "select_next_archetype",
      reason: `varianceScore ${varianceScore.toFixed(3)} still low after split fallback (attempt 3: select next archetype)`,
    };
  }

  return { shouldReroll: false, recommendedAction: "none", reason: "max reroll attempts reached" };
}

/**
 * Compute the boosted novelty pressure for the exercise engine
 * based on the current variance score.
 *
 * Lower variance → higher novelty pressure (stronger push toward variety).
 */
export function computeNoveltyPressureFromVariance(varianceScore: number): number {
  if (varianceScore >= THRESHOLDS.acceptable) return 0;
  if (varianceScore >= THRESHOLDS.borderlineBelow) return 0.3;
  if (varianceScore >= THRESHOLDS.rerollBelow) return 0.6;
  return 0.85;
}

/**
 * Build a human-readable reroll summary for the audit log.
 */
export function buildRerollSummary(steps: RerollStep[]): {
  rerollOccurred: boolean;
  totalAttempts: number;
  actionsAttempted: RerollAction[];
  finalAction: RerollAction | "none";
  improved: boolean;
} {
  if (steps.length === 0) {
    return {
      rerollOccurred: false,
      totalAttempts: 0,
      actionsAttempted: [],
      finalAction: "none",
      improved: false,
    };
  }

  const improved = steps.some((s) =>
    s.postRerollVarianceScore !== null && s.postRerollVarianceScore > s.preRerollVarianceScore + 0.05,
  );

  return {
    rerollOccurred: true,
    totalAttempts: steps.length,
    actionsAttempted: steps.map((s) => s.action),
    finalAction: steps[steps.length - 1]?.action ?? "none",
    improved,
  };
}
