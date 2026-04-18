/**
 * Program Fingerprinting & Similarity Detection
 *
 * Normalizes generated programs into a fingerprint struct for comparison.
 * Computes a similarity score between the new fingerprint and recent ones.
 * If similarity exceeds threshold, the block scoring system will trigger
 * a re-roll with the next-best archetype + split candidate.
 */

import type { BlockArchetypeId, SplitArchitectureId } from "./blockArchetypes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgramFingerprint {
  blockArchetype: BlockArchetypeId;
  splitArchitecture: SplitArchitectureId;
  blockType: string;
  weeklyRhythm: string;
  topPrimaryMovements: string[];
  movementFamilyDistribution: Record<string, number>;
  neuralDemandDistribution: { high: number; moderate: number; low: number };
  totalElasticExposure: number;
  lowerUpperRatio: number;
  variationTags: string[];
  generatedAt: number;
}

export interface SimilarityResult {
  score: number;
  reasons: string[];
  isTooSimilar: boolean;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const FINGERPRINT_HISTORY: ProgramFingerprint[] = [];
const MAX_HISTORY = 8;
const SIMILARITY_THRESHOLD = 0.70;

/** Add a new fingerprint to the rolling history. Evicts oldest when over max. */
export function recordFingerprint(fp: ProgramFingerprint): void {
  FINGERPRINT_HISTORY.push(fp);
  while (FINGERPRINT_HISTORY.length > MAX_HISTORY) {
    FINGERPRINT_HISTORY.shift();
  }
}

/** Get the N most recent fingerprints (most recent last). */
export function getRecentFingerprints(n = 3): ProgramFingerprint[] {
  return FINGERPRINT_HISTORY.slice(-n);
}

/** Check how many recent builds used the given archetype. */
export function getRecentArchetypeCount(archetypeId: BlockArchetypeId, n = 4): number {
  return getRecentFingerprints(n).filter((fp) => fp.blockArchetype === archetypeId).length;
}

/** Check how many recent builds used the given split. */
export function getRecentSplitCount(splitId: SplitArchitectureId, n = 4): number {
  return getRecentFingerprints(n).filter((fp) => fp.splitArchitecture === splitId).length;
}

/** Check how many recent builds used the given block type. */
export function getRecentBlockTypeCount(blockType: string, n = 4): number {
  return getRecentFingerprints(n).filter((fp) => fp.blockType === blockType).length;
}

// ─── Fingerprint Builder ──────────────────────────────────────────────────────

/**
 * Build a normalized fingerprint from the generation inputs.
 * Called after archetype + split are selected, before the AI call.
 */
export function buildFingerprint(params: {
  blockArchetype: BlockArchetypeId;
  splitArchitecture: SplitArchitectureId;
  blockType: string;
  weeklyRhythm: string;
  slotSelections: Record<string, string>;
  neuralDemandProfile: "high" | "moderate" | "low";
  daysPerWeek: number;
  elasticExposureCount: number;
  lowerDaysCount: number;
  upperDaysCount: number;
  variationTags: string[];
}): ProgramFingerprint {
  const {
    blockArchetype, splitArchitecture, blockType, weeklyRhythm,
    slotSelections, neuralDemandProfile, daysPerWeek,
    elasticExposureCount, lowerDaysCount, upperDaysCount, variationTags,
  } = params;

  const topPrimaryMovements = [
    slotSelections.bilateral_squat_strength,
    slotSelections.bilateral_hinge_strength,
    slotSelections.lower_power,
    slotSelections.upper_push_primary,
    slotSelections.upper_pull_primary,
  ].filter(Boolean).slice(0, 5);

  const neuralHigh = neuralDemandProfile === "high" ? 1 : 0;
  const neuralMod = neuralDemandProfile === "moderate" ? 1 : 0;
  const neuralLow = neuralDemandProfile === "low" ? 1 : 0;

  const lowerUpperRatio = daysPerWeek > 0
    ? lowerDaysCount / (lowerDaysCount + upperDaysCount || 1)
    : 0.5;

  const movementFamilyDistribution: Record<string, number> = {
    lower_bilateral: lowerDaysCount,
    upper: upperDaysCount,
    elastic: elasticExposureCount,
  };

  return {
    blockArchetype,
    splitArchitecture,
    blockType,
    weeklyRhythm: weeklyRhythm.slice(0, 60),
    topPrimaryMovements,
    movementFamilyDistribution,
    neuralDemandDistribution: { high: neuralHigh, moderate: neuralMod, low: neuralLow },
    totalElasticExposure: elasticExposureCount,
    lowerUpperRatio,
    variationTags,
    generatedAt: Date.now(),
  };
}

// ─── Similarity Scoring ───────────────────────────────────────────────────────

/**
 * Compute how similar the candidate fingerprint is to recent history.
 * Returns a score from 0 (completely different) to 1 (identical).
 * Also returns a list of reasons for logging.
 */
export function computeSimilarity(
  candidate: ProgramFingerprint,
  recent: ProgramFingerprint[],
): SimilarityResult {
  if (recent.length === 0) {
    return { score: 0, reasons: [], isTooSimilar: false };
  }

  const reasons: string[] = [];
  let totalScore = 0;
  const weights = { archetype: 0.35, split: 0.25, exercises: 0.20, tags: 0.10, neural: 0.10 };

  let archetypeScore = 0;
  let splitScore = 0;
  let exerciseScore = 0;
  let tagScore = 0;
  let neuralScore = 0;

  for (const prior of recent) {
    // Archetype match
    if (candidate.blockArchetype === prior.blockArchetype) archetypeScore += 1;

    // Split match
    if (candidate.splitArchitecture === prior.splitArchitecture) splitScore += 1;

    // Exercise overlap
    const candidateSet = new Set(candidate.topPrimaryMovements);
    const priorSet = new Set(prior.topPrimaryMovements);
    const overlap = [...candidateSet].filter((e) => priorSet.has(e)).length;
    const maxExercises = Math.max(candidateSet.size, priorSet.size, 1);
    exerciseScore += overlap / maxExercises;

    // Tag overlap
    const candidateTags = new Set(candidate.variationTags);
    const priorTags = new Set(prior.variationTags);
    const tagOverlap = [...candidateTags].filter((t) => priorTags.has(t)).length;
    const maxTags = Math.max(candidateTags.size, priorTags.size, 1);
    tagScore += tagOverlap / maxTags;

    // Neural demand profile match
    if (candidate.neuralDemandDistribution.high === prior.neuralDemandDistribution.high) neuralScore += 1;
  }

  const n = recent.length;
  archetypeScore /= n;
  splitScore /= n;
  exerciseScore /= n;
  tagScore /= n;
  neuralScore /= n;

  totalScore =
    archetypeScore * weights.archetype +
    splitScore * weights.split +
    exerciseScore * weights.exercises +
    tagScore * weights.tags +
    neuralScore * weights.neural;

  if (archetypeScore > 0.6) reasons.push(`same archetype (${candidate.blockArchetype}) used in ${Math.round(archetypeScore * 100)}% of recent builds`);
  if (splitScore > 0.6) reasons.push(`same split (${candidate.splitArchitecture}) used in ${Math.round(splitScore * 100)}% of recent builds`);
  if (exerciseScore > 0.5) reasons.push(`primary exercises overlapping ${Math.round(exerciseScore * 100)}% with recent builds`);

  return {
    score: Math.min(totalScore, 1),
    reasons,
    isTooSimilar: totalScore >= SIMILARITY_THRESHOLD,
  };
}

/** Log the similarity result in DEV. */
export function logSimilarityResult(
  candidate: ProgramFingerprint,
  result: SimilarityResult,
): void {
  if (process.env.NODE_ENV === "production") return;

  const recentHistory = getRecentFingerprints(4);
  console.log("[BlockRulesAudit:Similarity]", JSON.stringify({
    candidateArchetype: candidate.blockArchetype,
    candidateSplit: candidate.splitArchitecture,
    candidateExercises: candidate.topPrimaryMovements,
    similarityScore: Number(result.score.toFixed(3)),
    isTooSimilar: result.isTooSimilar,
    threshold: 0.70,
    reasons: result.reasons,
    recentHistoryCount: recentHistory.length,
    recentArchetypes: recentHistory.map((fp) => fp.blockArchetype),
  }));

  if (result.isTooSimilar) {
    console.warn(
      `[BlockRulesAuditWarning] Similarity threshold bypassed — score ${result.score.toFixed(3)} ≥ 0.70. ` +
      `Reasons: ${result.reasons.join("; ")}`,
    );
  }
}
