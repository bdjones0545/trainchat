/**
 * Block + Split Scoring — Block Variation Engine Core Logic
 *
 * Implements the 10-step selection flow:
 *   STEP 2: Score all BlockArchetypes based on fit
 *   STEP 3: Choose top-scoring valid archetype (with anti-repetition)
 *   STEP 4: Score valid SplitArchitectures within chosen archetype
 *   STEP 5: Select split (same logic — novelty, fit, anti-repetition)
 *   STEP 9: Similarity check
 *   STEP 10: Fallback to second-best if too similar
 */

import {
  BLOCK_ARCHETYPES,
  type BlockArchetypeId,
  type SplitArchitectureId,
  type BlockArchetype,
} from "./blockArchetypes";
import { SPLIT_ARCHITECTURES, type SplitArchitecture } from "./splitArchitectures";
import {
  getRecentArchetypeCount,
  getRecentSplitCount,
  getRecentBlockTypeCount,
} from "./similarity";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserConstraints {
  goal: string | null;
  sport: string | null;
  daysPerWeek: number;
  experienceLevel: "beginner" | "novice" | "intermediate" | "advanced" | null;
  recoveryProfile: "fresh" | "normal" | "fatigued" | "overtrained";
  neuralDemandHint: "high" | "moderate" | "low";
  isDeload: boolean;
  isSpecialPopulation: boolean;
  equipmentLevel: "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight";
  seed: number;
}

export interface ArchetypeScore {
  archetypeId: BlockArchetypeId;
  score: number;
  breakdown: {
    goalFit: number;
    scheduleFit: number;
    recoveryFit: number;
    neuralFit: number;
    noveltyBonus: number;
    recentRepetitionPenalty: number;
    deloadPenalty: number;
  };
}

export interface SplitScore {
  splitId: SplitArchitectureId;
  score: number;
  breakdown: {
    daysFit: number;
    archetypePairFit: number;
    goalFit: number;
    noveltyBonus: number;
    recentRepetitionPenalty: number;
    bannedPenalty: number;
  };
}

export interface BlockSelectionResult {
  archetypeId: BlockArchetypeId;
  splitId: SplitArchitectureId;
  archetype: BlockArchetype;
  split: SplitArchitecture;
  archetypeCandidates: ArchetypeScore[];
  splitCandidates: SplitScore[];
  variationSeed: number;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  archetypeRuleHits: string[];
  archetypeRuleMisses: string[];
  splitRuleHits: string[];
}

// ─── Archetype Scoring ────────────────────────────────────────────────────────

function scoreArchetype(
  archetype: BlockArchetype,
  constraints: UserConstraints,
): ArchetypeScore {
  const g = (constraints.goal ?? "").toLowerCase();
  const s = (constraints.sport ?? "").toLowerCase();
  const combined = g + " " + s;

  // ── Goal fit ──────────────────────────────────────────────────────────────
  const goalMatches = archetype.suitableGoals.filter((goal) =>
    combined.includes(goal) || goal.split(" ").some((word) => combined.includes(word)),
  ).length;
  const goalAntiMatches = archetype.unsuitableGoals.filter((goal) =>
    combined.includes(goal) || goal.split(" ").some((word) => combined.includes(word)),
  ).length;
  const goalFit = Math.min(goalMatches * 2.0, 6) - goalAntiMatches * 3.0;

  // ── Schedule fit ──────────────────────────────────────────────────────────
  const [minDays, maxDays] = archetype.suitableScheduleRange;
  const scheduleFit = constraints.daysPerWeek >= minDays && constraints.daysPerWeek <= maxDays ? 2 : -1;

  // ── Recovery fit ──────────────────────────────────────────────────────────
  const recoveryFit = archetype.suitableRecoveryProfiles.includes(constraints.recoveryProfile)
    ? 1.5
    : -2;

  // ── Neural demand fit ─────────────────────────────────────────────────────
  const archetypeNeuralMap = { high: 2, moderate: 1, low: 0 };
  const constraintNeuralMap = { high: 2, moderate: 1, low: 0 };
  const neuralDiff = Math.abs(
    archetypeNeuralMap[archetype.neuralDemandProfile] -
    constraintNeuralMap[constraints.neuralDemandHint],
  );
  const neuralFit = neuralDiff === 0 ? 2 : neuralDiff === 1 ? 0 : -2;

  // ── Novelty / anti-repetition ─────────────────────────────────────────────
  const recentArchetypeCount = getRecentArchetypeCount(archetype.id, 4);
  const noveltyBonus = recentArchetypeCount === 0 ? 2.0 : 0;
  const recentRepetitionPenalty = Math.min(recentArchetypeCount * 2.5, 8);

  // Also penalize if the primary monthly block type has been used recently
  const primaryBlockType = archetype.primaryMonthlyBlockTypes[0];
  const blockTypeCount = getRecentBlockTypeCount(primaryBlockType, 4);
  const blockTypePenalty = Math.min(blockTypeCount * 1.5, 5);

  // ── Deload override ───────────────────────────────────────────────────────
  const deloadPenalty =
    constraints.isDeload && archetype.id !== "REBUILD_DELOAD" ? 5 : 0;

  // Seed tiebreaker: [0, 0.8) — ensures same-score candidates spread
  const seedTiebreaker = ((constraints.seed * 13 * archetype.id.length) % 0.8);

  const score =
    goalFit + scheduleFit + recoveryFit + neuralFit +
    noveltyBonus - recentRepetitionPenalty - blockTypePenalty - deloadPenalty +
    seedTiebreaker;

  return {
    archetypeId: archetype.id,
    score,
    breakdown: {
      goalFit,
      scheduleFit,
      recoveryFit,
      neuralFit,
      noveltyBonus,
      recentRepetitionPenalty: recentRepetitionPenalty + blockTypePenalty,
      deloadPenalty,
    },
  };
}

// ─── Split Scoring ────────────────────────────────────────────────────────────

function scoreSplit(
  split: SplitArchitecture,
  archetype: BlockArchetype,
  constraints: UserConstraints,
): SplitScore {
  const combined = ((constraints.goal ?? "") + " " + (constraints.sport ?? "")).toLowerCase();

  // ── Banned by archetype ───────────────────────────────────────────────────
  const bannedPenalty = archetype.bannedSplitArchitectures.includes(split.id) ? 20 : 0;

  // ── Days fit ──────────────────────────────────────────────────────────────
  const daysFit = split.trainingDaysSupported.includes(constraints.daysPerWeek) ? 3 : -3;

  // ── Archetype preference ──────────────────────────────────────────────────
  const archetypePairFit = archetype.preferredSplitArchitectures.includes(split.id) ? 3 : 0;

  // ── Goal fit ──────────────────────────────────────────────────────────────
  const goalMatches = split.suitableGoals.filter((goal) =>
    combined.includes(goal) || goal.split(" ").some((word) => word.length > 3 && combined.includes(word)),
  ).length;
  const goalFit = Math.min(goalMatches * 1.5, 4);

  // ── Anti-repetition ───────────────────────────────────────────────────────
  const recentSplitCount = getRecentSplitCount(split.id, 4);
  const noveltyBonus = recentSplitCount === 0 ? 2 : 0;
  const recentRepetitionPenalty = Math.min(recentSplitCount * 2.0, 6);

  // Seed tiebreaker
  const seedTiebreaker = ((constraints.seed * 7 * split.id.length) % 0.6);

  const score =
    daysFit + archetypePairFit + goalFit + noveltyBonus -
    recentRepetitionPenalty - bannedPenalty + seedTiebreaker;

  return {
    splitId: split.id,
    score,
    breakdown: {
      daysFit,
      archetypePairFit,
      goalFit,
      noveltyBonus,
      recentRepetitionPenalty,
      bannedPenalty,
    },
  };
}

// ─── Main Selection ───────────────────────────────────────────────────────────

/**
 * STEP 2-5: Score all archetypes and splits, select winning combination.
 *
 * Returns the best archetype + split pairing with full scoring data for audit.
 * If similarityFallback is set, skips the top-scoring archetype and uses
 * the second-best valid candidate.
 */
export function selectBlockAndSplit(
  constraints: UserConstraints,
  similarityFallback = false,
  fallbackReason: string | null = null,
): BlockSelectionResult {
  // Special population: always use REBUILD_DELOAD / FULL_BODY_3DAY
  if (constraints.isSpecialPopulation) {
    return buildResult(
      "REBUILD_DELOAD", "FULL_BODY_3DAY", constraints,
      [], [], false, null, ["special_population_override"],
      ["all_other_archetypes_excluded"],
    );
  }

  // Deload override: always use REBUILD_DELOAD
  if (constraints.isDeload) {
    const splitId = constraints.daysPerWeek <= 3 ? "FULL_BODY_3DAY" : "LOWER_UPPER_4DAY";
    return buildResult(
      "REBUILD_DELOAD", splitId, constraints,
      [], [], false, null, ["deload_override"], [],
    );
  }

  // Score all archetypes
  const archetypeCandidates: ArchetypeScore[] = Object.values(BLOCK_ARCHETYPES)
    .map((arch) => scoreArchetype(arch, constraints))
    .sort((a, b) => b.score - a.score);

  // If similarityFallback, skip the top candidate
  const candidatePool = similarityFallback
    ? archetypeCandidates.slice(1)
    : archetypeCandidates;

  const chosenArchetypeScore = candidatePool[0];
  if (!chosenArchetypeScore) {
    // Absolute fallback
    return buildResult(
      "FOUNDATION_ACCUMULATION", "FULL_BODY_3DAY", constraints,
      archetypeCandidates, [], true, "no_valid_candidates",
      [], [],
    );
  }

  const chosenArchetype = BLOCK_ARCHETYPES[chosenArchetypeScore.archetypeId];

  // Build rule hits/misses for audit
  const archetypeRuleHits: string[] = [];
  const archetypeRuleMisses: string[] = [];
  if (chosenArchetypeScore.breakdown.goalFit > 0) archetypeRuleHits.push("goal_fit");
  else archetypeRuleMisses.push("goal_fit");
  if (chosenArchetypeScore.breakdown.scheduleFit > 0) archetypeRuleHits.push("schedule_fit");
  else archetypeRuleMisses.push("schedule_fit");
  if (chosenArchetypeScore.breakdown.recoveryFit > 0) archetypeRuleHits.push("recovery_fit");
  else archetypeRuleMisses.push("recovery_fit");
  if (chosenArchetypeScore.breakdown.neuralFit > 0) archetypeRuleHits.push("neural_fit");
  else archetypeRuleMisses.push("neural_fit");
  if (chosenArchetypeScore.breakdown.noveltyBonus > 0) archetypeRuleHits.push("novelty_bonus");
  if (chosenArchetypeScore.breakdown.recentRepetitionPenalty > 0) archetypeRuleMisses.push("repetition_penalty_applied");

  // Score splits — filter to valid day counts first
  const splitCandidates: SplitScore[] = Object.values(SPLIT_ARCHITECTURES)
    .filter((split) => split.trainingDaysSupported.includes(constraints.daysPerWeek))
    .map((split) => scoreSplit(split, chosenArchetype, constraints))
    .sort((a, b) => b.score - a.score);

  const chosenSplitScore = splitCandidates[0];
  if (!chosenSplitScore) {
    // Fallback: pick any valid split for the day count
    const fallbackSplit = constraints.daysPerWeek <= 3 ? "FULL_BODY_3DAY" : "LOWER_UPPER_4DAY";
    return buildResult(
      chosenArchetypeScore.archetypeId, fallbackSplit, constraints,
      archetypeCandidates, splitCandidates,
      true, "no_valid_split_for_day_count",
      archetypeRuleHits, archetypeRuleMisses,
    );
  }

  const splitRuleHits: string[] = [];
  if (chosenSplitScore.breakdown.daysFit > 0) splitRuleHits.push("days_fit");
  if (chosenSplitScore.breakdown.archetypePairFit > 0) splitRuleHits.push("archetype_pair_preferred");
  if (chosenSplitScore.breakdown.noveltyBonus > 0) splitRuleHits.push("novelty_bonus");
  if (chosenSplitScore.breakdown.bannedPenalty > 0) splitRuleHits.push("banned_penalty_applied (should not win!)");

  const actualFallback = similarityFallback || (fallbackReason !== null);

  return buildResult(
    chosenArchetypeScore.archetypeId, chosenSplitScore.splitId, constraints,
    archetypeCandidates, splitCandidates,
    actualFallback, fallbackReason,
    archetypeRuleHits, archetypeRuleMisses,
    splitRuleHits,
  );
}

function buildResult(
  archetypeId: BlockArchetypeId,
  splitId: SplitArchitectureId,
  constraints: UserConstraints,
  archetypeCandidates: ArchetypeScore[],
  splitCandidates: SplitScore[],
  fallbackTriggered: boolean,
  fallbackReason: string | null,
  archetypeRuleHits: string[],
  archetypeRuleMisses: string[],
  splitRuleHits: string[] = [],
): BlockSelectionResult {
  const archetype = BLOCK_ARCHETYPES[archetypeId];
  const split = SPLIT_ARCHITECTURES[splitId];

  // Derive the variationSeed from the split's preferred range + constraints seed
  const [minSeed, maxSeed] = split.variationSeedRange;
  const rangeDelta = maxSeed - minSeed;
  const variationSeed = minSeed + (constraints.seed % 1) * rangeDelta;

  return {
    archetypeId,
    splitId,
    archetype,
    split,
    archetypeCandidates,
    splitCandidates,
    variationSeed,
    fallbackTriggered,
    fallbackReason,
    archetypeRuleHits,
    archetypeRuleMisses,
    splitRuleHits,
  };
}

/**
 * Map a BlockArchetypeId to the best MonthlyBlockType for it,
 * considering the user constraints to pick between primary options.
 */
export function archetypeToMonthlyBlockType(
  archetypeId: BlockArchetypeId,
  constraints: UserConstraints,
): string {
  const archetype = BLOCK_ARCHETYPES[archetypeId];
  const options = archetype.primaryMonthlyBlockTypes;
  if (options.length === 1) return options[0];

  // Use seed to select among equally valid options
  const g = (constraints.goal ?? "").toLowerCase();
  if (archetypeId === "FOUNDATION_ACCUMULATION") {
    // Prefer hypertrophy_support for muscle goals, accumulation for athletic
    if (g.includes("muscle") || g.includes("hypertrophy") || g.includes("size")) {
      return "hypertrophy_support";
    }
    return "accumulation";
  }
  if (archetypeId === "INTENSIFICATION_STRENGTH") {
    // Prefer strength_emphasis for general strength, intensification for power goals
    if (g.includes("power") || g.includes("explosive") || g.includes("sport")) {
      return "intensification";
    }
    return "strength_emphasis";
  }

  // Fallback: pick by seed
  return options[Math.floor(constraints.seed * options.length)] ?? options[0];
}
