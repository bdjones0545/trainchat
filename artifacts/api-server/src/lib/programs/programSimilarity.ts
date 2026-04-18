/**
 * Program Similarity — Layered 6-Dimension Scorer
 *
 * Compares two ExtendedProgramFingerprints across 6 independent dimensions:
 *   block / split / slot / family / exercise / identity
 *
 * Returns a weighted overall similarity score (0 = different, 1 = identical)
 * and the per-dimension breakdown for audit logging.
 */

import type { ExtendedProgramFingerprint, FamilyDistribution } from "./programFingerprint";
import { SIMILARITY_WEIGHTS } from "./programVarianceThresholds";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LayeredSimilarityBreakdown {
  blockSimilarity: number;
  splitSimilarity: number;
  slotSimilarity: number;
  familySimilarity: number;
  exerciseSimilarity: number;
  identitySimilarity: number;
  overallSimilarity: number;
  varianceScore: number;
  weights: typeof SIMILARITY_WEIGHTS;
}

export interface ProgramComparisonResult {
  comparedGenerationId: string;
  breakdown: LayeredSimilarityBreakdown;
}

export interface AggregatedSimilarityResult {
  comparisonWindowSize: number;
  perProgramComparisons: ProgramComparisonResult[];
  closestMatchGenerationId: string | null;
  closestMatchSimilarity: number;
  overallSimilarityAverage: number;
  varianceScore: number;
}

// ─── Block Similarity (0–1) ───────────────────────────────────────────────────
// Measures: archetype + phase + progression style + neural/fatigue profile

function computeBlockSimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  let score = 0;
  let checks = 0;

  // Archetype match: 40% of block score
  score += a.blockArchetype === b.blockArchetype ? 0.4 : 0;
  checks++;

  // Phase match: 25%
  score += a.currentPhase === b.currentPhase ? 0.25 : 0;
  checks++;

  // Progression style match: 20%
  score += a.progressionStyle === b.progressionStyle ? 0.2 : 0;
  checks++;

  // Neural demand profile match: 10%
  score += a.neuralDemandProfile === b.neuralDemandProfile ? 0.1 : 0;
  checks++;

  // Fatigue profile match: 5%
  score += a.fatigueProfile === b.fatigueProfile ? 0.05 : 0;
  checks++;

  return Math.min(score, 1);
}

// ─── Split Similarity (0–1) ───────────────────────────────────────────────────
// Measures: split ID + day theme sequence + day neural sequence + elastic placement

function computeSplitSimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  let score = 0;

  // Split ID match: 35%
  if (a.splitArchitecture === b.splitArchitecture) score += 0.35;

  // Day pattern sequence match: 30%
  const patternA = a.dayPrimaryPatterns.join(",");
  const patternB = b.dayPrimaryPatterns.join(",");
  if (patternA === patternB) score += 0.30;
  else {
    // Partial credit for each matching position
    const maxLen = Math.max(a.dayPrimaryPatterns.length, b.dayPrimaryPatterns.length, 1);
    const matchCount = a.dayPrimaryPatterns.filter((p, i) => p === b.dayPrimaryPatterns[i]).length;
    score += 0.30 * (matchCount / maxLen);
  }

  // Day theme sequence match: 20%
  const themeA = a.dayThemes.join("|");
  const themeB = b.dayThemes.join("|");
  if (themeA === themeB) score += 0.20;

  // Neural demand sequence match: 10%
  const neuralA = a.dayNeuralSequence.join(",");
  const neuralB = b.dayNeuralSequence.join(",");
  if (neuralA === neuralB) score += 0.10;

  // Elastic exposure placement: 5%
  const elasticA = a.dayElasticMap.join(",");
  const elasticB = b.dayElasticMap.join(",");
  if (elasticA === elasticB) score += 0.05;

  return Math.min(score, 1);
}

// ─── Slot Similarity (0–1) ───────────────────────────────────────────────────
// Measures: slot order key + per-slot family matching

function computeSlotSimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  let score = 0;

  // Slot order key exact match: 30%
  if (a.slotOrderKey === b.slotOrderKey) {
    score += 0.30;
  }

  // Per-slot family matching: 70% (distributed across matched slots)
  const allSlots = new Set([
    ...Object.keys(a.primaryFamiliesBySlot),
    ...Object.keys(b.primaryFamiliesBySlot),
  ]);

  if (allSlots.size > 0) {
    const familyMatchCount = [...allSlots].filter(
      (slot) => a.primaryFamiliesBySlot[slot] === b.primaryFamiliesBySlot[slot],
    ).length;
    score += 0.70 * (familyMatchCount / allSlots.size);
  }

  return Math.min(score, 1);
}

// ─── Family Similarity (0–1) ──────────────────────────────────────────────────
// Measures: bilateral/unilateral/upper/elastic/trunk balance similarity

function familyCountSim(a: number, b: number): number {
  const maxVal = Math.max(a, b, 1);
  return 1 - Math.abs(a - b) / maxVal;
}

function computeFamilySimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  // Compare high-level structural counts (each carries equal weight)
  const bilateral = familyCountSim(a.bilateralLowerCount, b.bilateralLowerCount);
  const unilateral = familyCountSim(a.unilateralLowerCount, b.unilateralLowerCount);
  const upperPush = familyCountSim(a.upperPushCount, b.upperPushCount);
  const upperPull = familyCountSim(a.upperPullCount, b.upperPullCount);
  const elastic = familyCountSim(a.elasticCount, b.elasticCount);
  const trunk = familyCountSim(a.trunkCount, b.trunkCount);
  const conditioning = familyCountSim(a.conditioningCount, b.conditioningCount);
  const rotational = familyCountSim(a.rotationalCount, b.rotationalCount);

  const avg = (bilateral + unilateral + upperPush + upperPull + elastic + trunk + conditioning + rotational) / 8;

  // Also compare fine-grained family distribution
  const fa = a.familyDistribution;
  const fb = b.familyDistribution;
  const fineKeys: Array<keyof FamilyDistribution> = [
    "bilateralSqat", "bilateralHinge", "trapBar", "gobletTempo",
    "unilateralSquat", "unilateralHinge", "plyometric", "elasticReactive",
  ];
  const fineSim = fineKeys.reduce((acc, k) => acc + familyCountSim(fa[k], fb[k]), 0) / fineKeys.length;

  return Math.min(avg * 0.7 + fineSim * 0.3, 1);
}

// ─── Exercise Similarity (0–1) ────────────────────────────────────────────────
// Measures: exact exercise overlap in primary slots

function computeExerciseSimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  // Overlap in topPrimaryExercises (most important)
  const aSet = new Set(a.topPrimaryExercises);
  const bSet = new Set(b.topPrimaryExercises);
  const overlapCount = [...aSet].filter((e) => bSet.has(e)).length;
  const maxSize = Math.max(aSet.size, bSet.size, 1);
  const topOverlap = overlapCount / maxSize;

  // Overlap in ALL primary slot exercises
  const aAll = new Set(Object.values(a.primaryExercisesBySlot));
  const bAll = new Set(Object.values(b.primaryExercisesBySlot));
  const allOverlapCount = [...aAll].filter((e) => bAll.has(e)).length;
  const allMaxSize = Math.max(aAll.size, bAll.size, 1);
  const allOverlap = allOverlapCount / allMaxSize;

  return Math.min(topOverlap * 0.6 + allOverlap * 0.4, 1);
}

// ─── Identity Similarity (0–1) ────────────────────────────────────────────────
// Measures: "program feel" — top lift pattern + lower/upper ratio + elastic signature

function computeIdentitySimilarity(
  a: ExtendedProgramFingerprint,
  b: ExtendedProgramFingerprint,
): number {
  let score = 0;

  // Top primary family sequence match (bilateral squat → bilateral hinge → lower power)
  const topFamA = a.topPrimaryFamilies.slice(0, 3).join(",");
  const topFamB = b.topPrimaryFamilies.slice(0, 3).join(",");
  if (topFamA === topFamB) score += 0.40;
  else {
    const matchCount = a.topPrimaryFamilies.slice(0, 3).filter((f, i) => f === b.topPrimaryFamilies[i]).length;
    score += 0.40 * (matchCount / 3);
  }

  // Lower/upper ratio proximity (within 0.1 = same feel)
  const ratioDiff = Math.abs(a.lowerUpperRatio - b.lowerUpperRatio);
  score += ratioDiff < 0.1 ? 0.30 : ratioDiff < 0.2 ? 0.15 : 0;

  // Elastic signature match (elastic count + placement)
  const elasticDiff = Math.abs(a.elasticCount - b.elasticCount);
  score += elasticDiff === 0 ? 0.20 : elasticDiff === 1 ? 0.10 : 0;

  // Days per week match (same structure week)
  score += a.daysPerWeek === b.daysPerWeek ? 0.10 : 0;

  return Math.min(score, 1);
}

// ─── Pairwise Comparison ─────────────────────────────────────────────────────

export function compareProgramPair(
  candidate: ExtendedProgramFingerprint,
  prior: ExtendedProgramFingerprint,
): LayeredSimilarityBreakdown {
  const blockSimilarity = computeBlockSimilarity(candidate, prior);
  const splitSimilarity = computeSplitSimilarity(candidate, prior);
  const slotSimilarity = computeSlotSimilarity(candidate, prior);
  const familySimilarity = computeFamilySimilarity(candidate, prior);
  const exerciseSimilarity = computeExerciseSimilarity(candidate, prior);
  const identitySimilarity = computeIdentitySimilarity(candidate, prior);

  const w = SIMILARITY_WEIGHTS;
  const overallSimilarity = Math.min(
    blockSimilarity * w.block +
    splitSimilarity * w.split +
    slotSimilarity * w.slot +
    familySimilarity * w.family +
    exerciseSimilarity * w.exercise +
    identitySimilarity * w.identity,
    1,
  );

  return {
    blockSimilarity,
    splitSimilarity,
    slotSimilarity,
    familySimilarity,
    exerciseSimilarity,
    identitySimilarity,
    overallSimilarity,
    varianceScore: 1 - overallSimilarity,
    weights: SIMILARITY_WEIGHTS,
  };
}

// ─── Aggregate Against Window ─────────────────────────────────────────────────

export function computeAggregatedSimilarity(
  candidate: ExtendedProgramFingerprint,
  recentPrograms: ExtendedProgramFingerprint[],
): AggregatedSimilarityResult {
  if (recentPrograms.length === 0) {
    return {
      comparisonWindowSize: 0,
      perProgramComparisons: [],
      closestMatchGenerationId: null,
      closestMatchSimilarity: 0,
      overallSimilarityAverage: 0,
      varianceScore: 1,
    };
  }

  const perProgramComparisons: ProgramComparisonResult[] = recentPrograms.map((prior) => ({
    comparedGenerationId: prior.generationId,
    breakdown: compareProgramPair(candidate, prior),
  }));

  const similarities = perProgramComparisons.map((c) => c.breakdown.overallSimilarity);
  const closestMatch = perProgramComparisons.reduce(
    (best, cur) => cur.breakdown.overallSimilarity > best.breakdown.overallSimilarity ? cur : best,
    perProgramComparisons[0],
  );

  const overallSimilarityAverage = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const varianceScore = 1 - overallSimilarityAverage;

  return {
    comparisonWindowSize: recentPrograms.length,
    perProgramComparisons,
    closestMatchGenerationId: closestMatch.comparedGenerationId,
    closestMatchSimilarity: closestMatch.breakdown.overallSimilarity,
    overallSimilarityAverage,
    varianceScore,
  };
}
