/**
 * Program Variance Reasons — Human-readable low-variance diagnostics
 *
 * Inspects the similarity breakdown and fingerprint history to generate
 * specific, actionable explanations for why a program scored as too similar.
 *
 * Designed to be grep-friendly and appear in structured audit logs.
 */

import type { ExtendedProgramFingerprint } from "./programFingerprint";
import type { AggregatedSimilarityResult } from "./programSimilarity";
import { REASON_THRESHOLDS } from "./programVarianceThresholds";

// ─── Reason Detector ─────────────────────────────────────────────────────────

export function detectLowVarianceReasons(
  candidate: ExtendedProgramFingerprint,
  recentPrograms: ExtendedProgramFingerprint[],
  aggregated: AggregatedSimilarityResult,
): string[] {
  if (recentPrograms.length === 0) return [];

  const reasons: string[] = [];
  const n = recentPrograms.length;

  // ── Block-level reasons ─────────────────────────────────────────────────
  const archetypeMatches = recentPrograms.filter((p) => p.blockArchetype === candidate.blockArchetype).length;
  const archetypeRate = archetypeMatches / n;
  if (archetypeRate >= REASON_THRESHOLDS.archetypeRepetitionRate) {
    reasons.push(
      `same block archetype (${candidate.blockArchetype}) used in ${archetypeMatches} of last ${n} programs`,
    );
  }

  const phaseMatches = recentPrograms.filter((p) => p.currentPhase === candidate.currentPhase).length;
  if (phaseMatches === n && n >= 2) {
    reasons.push(`same phase (${candidate.currentPhase}) across all ${n} recent programs`);
  }

  const progressionMatches = recentPrograms.filter((p) => p.progressionStyle === candidate.progressionStyle).length;
  if (progressionMatches === n && n >= 3) {
    reasons.push(`same progression style (${candidate.progressionStyle}) in all recent programs`);
  }

  // ── Split-level reasons ──────────────────────────────────────────────────
  const splitMatches = recentPrograms.filter((p) => p.splitArchitecture === candidate.splitArchitecture).length;
  const splitRate = splitMatches / n;
  if (splitRate >= REASON_THRESHOLDS.splitRepetitionRate) {
    reasons.push(
      `same split architecture (${candidate.splitArchitecture}) used in ${splitMatches} of last ${n} programs`,
    );
  }

  const mostRecent = recentPrograms[recentPrograms.length - 1];
  if (mostRecent) {
    if (candidate.splitArchitecture === mostRecent.splitArchitecture) {
      reasons.push(`same split architecture as most recent program (${candidate.splitArchitecture})`);
    }

    if (candidate.dayPrimaryPatterns.join(",") === mostRecent.dayPrimaryPatterns.join(",")) {
      reasons.push(`same day pattern sequence as most recent program (${candidate.dayPrimaryPatterns.join(" → ")})`);
    }

    if (candidate.dayThemes.join("|") === mostRecent.dayThemes.join("|")) {
      reasons.push(`identical day theme sequence as most recent program`);
    }
  }

  // ── Slot-level reasons ───────────────────────────────────────────────────
  const slotKeyMatches = recentPrograms.filter((p) => p.slotOrderKey === candidate.slotOrderKey).length;
  if (slotKeyMatches >= Math.ceil(n * 0.6)) {
    reasons.push(`same slot assignment pattern in ${slotKeyMatches} of ${n} recent programs`);
  }

  // ── Exercise-level reasons ───────────────────────────────────────────────
  const primaryExercises = new Set(candidate.topPrimaryExercises);

  for (const prior of recentPrograms) {
    const priorExSet = new Set(prior.topPrimaryExercises);
    const overlap = [...primaryExercises].filter((e) => priorExSet.has(e));
    const overlapRate = overlap.length / Math.max(primaryExercises.size, 1);

    if (overlapRate >= REASON_THRESHOLDS.exerciseOverlapRate) {
      reasons.push(
        `primary exercises overlap ${Math.round(overlapRate * 100)}% with program ${prior.generationId.slice(0, 8)}: [${overlap.join(", ")}]`,
      );
    }
  }

  // Check specific repeated lifts
  if (mostRecent) {
    const squat = candidate.primaryExercisesBySlot["bilateral_squat_strength"];
    const squat2 = mostRecent.primaryExercisesBySlot["bilateral_squat_strength"];
    if (squat && squat === squat2) {
      reasons.push(`same primary squat slot exercise as most recent (${squat})`);
    }

    const hinge = candidate.primaryExercisesBySlot["bilateral_hinge_strength"];
    const hinge2 = mostRecent.primaryExercisesBySlot["bilateral_hinge_strength"];
    if (hinge && hinge === hinge2) {
      reasons.push(`same primary hinge slot exercise as most recent (${hinge})`);
    }

    const power = candidate.primaryExercisesBySlot["lower_power"];
    const power2 = mostRecent.primaryExercisesBySlot["lower_power"];
    if (power && power === power2) {
      reasons.push(`same lower power exercise as most recent (${power})`);
    }

    const trunk = candidate.primaryExercisesBySlot["trunk_anti_rotation"];
    const trunk2 = mostRecent.primaryExercisesBySlot["trunk_anti_rotation"];
    if (trunk && trunk === trunk2) {
      reasons.push(`same trunk anti-rotation exercise as most recent (${trunk})`);
    }

    const conditioner = candidate.primaryExercisesBySlot["conditioning_finisher"];
    const conditioner2 = mostRecent.primaryExercisesBySlot["conditioning_finisher"];
    if (conditioner && conditioner === conditioner2) {
      reasons.push(`same conditioning finisher as most recent (${conditioner})`);
    }
  }

  // ── Family distribution reasons ──────────────────────────────────────────
  const { perProgramComparisons } = aggregated;
  const highFamilyMatches = perProgramComparisons.filter(
    (c) => c.breakdown.familySimilarity >= REASON_THRESHOLDS.familySimilarity,
  );
  if (highFamilyMatches.length > 0) {
    const avgFam = highFamilyMatches.reduce((a, c) => a + c.breakdown.familySimilarity, 0) / highFamilyMatches.length;
    reasons.push(
      `similar bilateral/unilateral/upper family balance (family sim ${avgFam.toFixed(2)}) in ${highFamilyMatches.length} of ${n} comparisons`,
    );
  }

  // ── Meta pattern reasons ──────────────────────────────────────────────────
  // Detect "block varies but exercise stays same"
  const avgBlockSim = perProgramComparisons.reduce((a, c) => a + c.breakdown.blockSimilarity, 0) / n;
  const avgExSim = perProgramComparisons.reduce((a, c) => a + c.breakdown.exerciseSimilarity, 0) / n;
  if (avgBlockSim < 0.5 && avgExSim > 0.5) {
    reasons.push(
      `block varies (block sim ${avgBlockSim.toFixed(2)}) but exercise selection remains similar (ex sim ${avgExSim.toFixed(2)})`,
    );
  }

  // Detect "exercise swaps but split/day identity stays same"
  const avgSplitSim = perProgramComparisons.reduce((a, c) => a + c.breakdown.splitSimilarity, 0) / n;
  if (avgSplitSim > 0.7 && avgExSim < 0.4) {
    reasons.push(
      `exercises varied (ex sim ${avgExSim.toFixed(2)}) but split/day identity remained stale (split sim ${avgSplitSim.toFixed(2)})`,
    );
  }

  return reasons;
}

// ─── Warning Summaries ────────────────────────────────────────────────────────

export function buildVarianceWarnings(
  candidate: ExtendedProgramFingerprint,
  recentPrograms: ExtendedProgramFingerprint[],
  aggregated: AggregatedSimilarityResult,
  rerollTriggered: boolean,
  rerollImproved: boolean,
): string[] {
  const warnings: string[] = [];
  const { varianceScore, closestMatchSimilarity } = aggregated;

  if (varianceScore < 0.50 && !rerollTriggered) {
    warnings.push("new program is below variance threshold but no reroll was triggered");
  }

  if (rerollTriggered && !rerollImproved) {
    warnings.push("fallback reroll executed but variance did not meaningfully improve");
  }

  const n = recentPrograms.length;
  if (n >= 3) {
    const archetypeStreak = recentPrograms
      .slice(-4)
      .filter((p) => p.splitArchitecture === candidate.splitArchitecture).length;
    if (archetypeStreak >= 4) {
      warnings.push(`same split architecture selected ${archetypeStreak} generations in a row`);
    }

    const mostRecent = recentPrograms[recentPrograms.length - 1];
    const secondRecent = recentPrograms[recentPrograms.length - 2];
    if (mostRecent && secondRecent) {
      const liftRepeat = [
        "bilateral_squat_strength",
        "bilateral_hinge_strength",
        "lower_power",
      ].filter((slot) =>
        candidate.primaryExercisesBySlot[slot] &&
        candidate.primaryExercisesBySlot[slot] === mostRecent.primaryExercisesBySlot[slot] &&
        candidate.primaryExercisesBySlot[slot] === secondRecent.primaryExercisesBySlot[slot],
      );
      if (liftRepeat.length >= 2) {
        const liftNames = liftRepeat.map((slot) => candidate.primaryExercisesBySlot[slot]);
        warnings.push(`same primary lower lifts repeated excessively: [${liftNames.join(", ")}]`);
      }
    }
  }

  // Check for block variance without exercise variance
  const avgBlockSim = aggregated.perProgramComparisons.reduce(
    (a, c) => a + c.breakdown.blockSimilarity, 0,
  ) / Math.max(n, 1);
  const avgExSim = aggregated.perProgramComparisons.reduce(
    (a, c) => a + c.breakdown.exerciseSimilarity, 0,
  ) / Math.max(n, 1);
  if (avgBlockSim < 0.4 && avgExSim > 0.6) {
    warnings.push("block variance exists but exercise variance remains low");
  }
  if (avgExSim < 0.3 && aggregated.perProgramComparisons.some((c) => c.breakdown.splitSimilarity > 0.8)) {
    warnings.push("exercise variance exists but split/day identity remains stale");
  }

  return warnings;
}
