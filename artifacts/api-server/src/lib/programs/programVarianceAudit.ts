/**
 * Program Variance Audit — DEV-only structured generation audit
 *
 * Runs after every program generation. Compares the new program against
 * recent programs in session history, produces a layered variance score,
 * detects low-variance patterns, and emits structured logs.
 *
 * All logging is gated by NODE_ENV !== "production".
 *
 * Usage:
 *   1. After generation: call runProgramVarianceAudit()
 *   2. The audit runs internally, emits logs, returns the audit result
 *   3. Use auditResult.rerollRecommended to decide on fallbacks
 *
 * Log markers:
 *   [ProgramVarianceAudit] — main per-generation audit entry
 *   [ProgramVarianceAuditWarning] — suspicious patterns
 *   [ProgramVarianceAuditReroll] — reroll/fallback steps (from reroll module)
 */

import type { ExtendedProgramFingerprint } from "./programFingerprint";
import {
  recordExtendedFingerprint,
  getRecentExtendedFingerprints,
} from "./programFingerprint";
import { computeAggregatedSimilarity } from "./programSimilarity";
import {
  classifyVariance,
  shouldRerollForVariance,
  THRESHOLDS,
  SIMILARITY_WEIGHTS,
} from "./programVarianceThresholds";
import { detectLowVarianceReasons, buildVarianceWarnings } from "./programVarianceReasons";
import { buildRerollSummary, type RerollStep } from "./programVarianceReroll";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProgramVarianceAuditResult {
  generationId: string;
  comparisonWindowSize: number;
  comparedGenerationIds: string[];
  varianceScore: number;
  overallSimilarityAverage: number;
  closestMatchGenerationId: string | null;
  closestMatchSimilarity: number;
  varianceBucket: ReturnType<typeof classifyVariance>;
  lowVarianceReasons: string[];
  rerollRecommended: boolean;
  rerollTriggered: boolean;
  rerollSteps: RerollStep[];
  rerollSummary: ReturnType<typeof buildRerollSummary>;
  warnings: string[];
  perProgramBreakdowns: Array<{
    comparedId: string;
    blockSimilarity: number;
    splitSimilarity: number;
    slotSimilarity: number;
    familySimilarity: number;
    exerciseSimilarity: number;
    identitySimilarity: number;
    overallSimilarity: number;
  }>;
}

// ─── Main Audit Function ──────────────────────────────────────────────────────

export function runProgramVarianceAudit(
  candidate: ExtendedProgramFingerprint,
  rerollSteps: RerollStep[] = [],
  postRerollFingerprint?: ExtendedProgramFingerprint,
): ProgramVarianceAuditResult {
  if (process.env.NODE_ENV === "production") {
    recordExtendedFingerprint(candidate);
    return buildSilentResult(candidate);
  }

  // ── Comparison window ────────────────────────────────────────────────────
  const recentPrograms = getRecentExtendedFingerprints(THRESHOLDS.comparisonWindowSize);

  // ── Similarity computation ────────────────────────────────────────────────
  const aggregated = computeAggregatedSimilarity(candidate, recentPrograms);
  const { varianceScore, overallSimilarityAverage, closestMatchGenerationId, closestMatchSimilarity } = aggregated;
  const varianceBucket = classifyVariance(varianceScore);

  // ── Post-reroll variance (if reroll happened) ─────────────────────────────
  let postRerollVarianceScore: number | null = null;
  if (postRerollFingerprint && rerollSteps.length > 0) {
    const postAggregated = computeAggregatedSimilarity(postRerollFingerprint, recentPrograms);
    postRerollVarianceScore = postAggregated.varianceScore;
  }

  // ── Reason detection ──────────────────────────────────────────────────────
  const lowVarianceReasons = detectLowVarianceReasons(candidate, recentPrograms, aggregated);
  const rerollTriggered = rerollSteps.length > 0;
  const rerollSummary = buildRerollSummary(rerollSteps);
  const rerollImproved = rerollSummary.improved;
  const warnings = buildVarianceWarnings(candidate, recentPrograms, aggregated, rerollTriggered, rerollImproved);

  // ── Record fingerprint AFTER comparison (so it doesn't compare to itself) ─
  recordExtendedFingerprint(candidate);

  // ── Structured audit log ──────────────────────────────────────────────────
  const perProgramBreakdowns = aggregated.perProgramComparisons.map((c) => ({
    comparedId: c.comparedGenerationId,
    blockSimilarity: Number(c.breakdown.blockSimilarity.toFixed(3)),
    splitSimilarity: Number(c.breakdown.splitSimilarity.toFixed(3)),
    slotSimilarity: Number(c.breakdown.slotSimilarity.toFixed(3)),
    familySimilarity: Number(c.breakdown.familySimilarity.toFixed(3)),
    exerciseSimilarity: Number(c.breakdown.exerciseSimilarity.toFixed(3)),
    identitySimilarity: Number(c.breakdown.identitySimilarity.toFixed(3)),
    overallSimilarity: Number(c.breakdown.overallSimilarity.toFixed(3)),
  }));

  console.log("[ProgramVarianceAudit]", JSON.stringify({
    generationId: candidate.generationId,
    block: candidate.blockArchetype,
    phase: candidate.currentPhase,
    split: candidate.splitArchitecture,
    daysPerWeek: candidate.daysPerWeek,
    comparisonWindowSize: recentPrograms.length,
    comparedGenerationIds: recentPrograms.map((p) => p.generationId),
    varianceScore: Number(varianceScore.toFixed(3)),
    overallSimilarityAverage: Number(overallSimilarityAverage.toFixed(3)),
    closestMatchGenerationId,
    closestMatchSimilarity: Number(closestMatchSimilarity.toFixed(3)),
    varianceBucket,
    lowVarianceReasons,
    rerollRecommended: shouldRerollForVariance(varianceScore),
    rerollTriggered,
    rerollSummary,
    postRerollVarianceScore: postRerollVarianceScore !== null ? Number(postRerollVarianceScore.toFixed(3)) : null,
    similarityWeights: SIMILARITY_WEIGHTS,
    topExercises: candidate.topPrimaryExercises,
    dayThemes: candidate.dayThemes,
    perProgramBreakdowns,
  }));

  // ── Concise grep-friendly summary line ────────────────────────────────────
  console.log(
    `[ProgramVarianceAudit] generation=${candidate.generationId.slice(0, 8)} ` +
    `block=${candidate.blockArchetype} split=${candidate.splitArchitecture} ` +
    `variance=${varianceScore.toFixed(3)} bucket=${varianceBucket} ` +
    `closestMatch=${closestMatchSimilarity.toFixed(3)} ` +
    `reroll=${rerollTriggered} window=${recentPrograms.length}`,
  );

  // ── Warnings ───────────────────────────────────────────────────────────────
  for (const w of warnings) {
    console.warn(`[ProgramVarianceAuditWarning] ${w}`);
  }

  const result: ProgramVarianceAuditResult = {
    generationId: candidate.generationId,
    comparisonWindowSize: recentPrograms.length,
    comparedGenerationIds: recentPrograms.map((p) => p.generationId),
    varianceScore,
    overallSimilarityAverage,
    closestMatchGenerationId,
    closestMatchSimilarity,
    varianceBucket,
    lowVarianceReasons,
    rerollRecommended: shouldRerollForVariance(varianceScore),
    rerollTriggered,
    rerollSteps,
    rerollSummary,
    warnings,
    perProgramBreakdowns,
  };

  return result;
}

// ─── Silent result (production) ───────────────────────────────────────────────

function buildSilentResult(candidate: ExtendedProgramFingerprint): ProgramVarianceAuditResult {
  return {
    generationId: candidate.generationId,
    comparisonWindowSize: 0,
    comparedGenerationIds: [],
    varianceScore: 1,
    overallSimilarityAverage: 0,
    closestMatchGenerationId: null,
    closestMatchSimilarity: 0,
    varianceBucket: "EXCELLENT_VARIANCE",
    lowVarianceReasons: [],
    rerollRecommended: false,
    rerollTriggered: false,
    rerollSteps: [],
    rerollSummary: {
      rerollOccurred: false,
      totalAttempts: 0,
      actionsAttempted: [],
      finalAction: "none",
      improved: false,
    },
    warnings: [],
    perProgramBreakdowns: [],
  };
}

// ─── Multi-generation DEV Test Harness ───────────────────────────────────────

/**
 * DEV-only test harness for simulating multiple program generations.
 * Call this from a debug endpoint or test utility to verify variance
 * across N generations with similar inputs.
 *
 * Output: compact matrix printed to console.
 */
export function runVarianceTestHarness(
  fingerprints: ExtendedProgramFingerprint[],
): void {
  if (process.env.NODE_ENV === "production") return;

  console.log("\n[ProgramVarianceAudit:TestHarness] ─────────────────────────────────────────");
  console.log("[ProgramVarianceAudit:TestHarness] Multi-generation variance matrix");
  console.log("[ProgramVarianceAudit:TestHarness] ─────────────────────────────────────────");

  const rows: Array<{
    gen: number;
    id: string;
    block: string;
    phase: string;
    split: string;
    dayThemes: string;
    variance: string;
    closestMatch: string;
    bucket: string;
    reroll: string;
  }> = [];

  const runningHistory: ExtendedProgramFingerprint[] = [];

  for (let i = 0; i < fingerprints.length; i++) {
    const fp = fingerprints[i];
    const aggregated = computeAggregatedSimilarity(fp, runningHistory);
    const { varianceScore, closestMatchSimilarity } = aggregated;
    const bucket = classifyVariance(varianceScore);

    rows.push({
      gen: i + 1,
      id: fp.generationId.slice(0, 8),
      block: fp.blockArchetype,
      phase: fp.currentPhase,
      split: fp.splitArchitecture,
      dayThemes: fp.dayThemes.map((t) => t.split(" ")[0]).join(" / "),
      variance: varianceScore.toFixed(3),
      closestMatch: closestMatchSimilarity.toFixed(3),
      bucket,
      reroll: shouldRerollForVariance(varianceScore) ? "YES" : "no",
    });

    runningHistory.push(fp);
  }

  console.table(rows);

  // Summary
  const avgVariance = rows.reduce((a, r) => a + parseFloat(r.variance), 0) / rows.length;
  const staleCount = rows.filter((r) => r.bucket === "STALE_OUTPUT").length;
  const lowCount = rows.filter((r) => r.bucket === "LOW_VARIANCE" || r.bucket === "STALE_OUTPUT").length;
  console.log(`[ProgramVarianceAudit:TestHarness] Average variance: ${avgVariance.toFixed(3)}`);
  console.log(`[ProgramVarianceAudit:TestHarness] Stale outputs: ${staleCount}/${rows.length}`);
  console.log(`[ProgramVarianceAudit:TestHarness] Low/stale outputs: ${lowCount}/${rows.length}`);
  console.log("[ProgramVarianceAudit:TestHarness] ─────────────────────────────────────────\n");
}
