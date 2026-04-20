/**
 * Strength Week Expression Engine — Library-Driven Variant Selection
 *
 * Replaces the hardcoded STRENGTH_EXERCISE_VARIANTS map as the primary selection
 * mechanism for week-to-week exercise variation within a 4-week strength block.
 *
 * Architecture:
 *   1. Build a ClusterIndex and FamilyIndex from EXERCISE_EXTENDED_META at module load.
 *   2. Score each candidate in the same cluster (or family fallback) for the target week role.
 *   3. Return the top-scoring candidate when it meaningfully outscores the current exercise.
 *   4. Return null when the current exercise is already a good fit — callers fall back
 *      to the hardcoded variant map (last-resort) or keep the exercise as-is.
 *
 * Week-role ↔ metadata alignment:
 *   W1 Establish  — prefer simple complexity, lower stability demand, accessible velocity
 *   W2 Build      — keep current exercise (no library swap — load progression is the week signal)
 *   W3 Intensify  — prefer complex/moderate complexity, high stability demand
 *   W4 Deload     — prefer simple complexity, low stability demand
 *
 * This matches the PHASE_MODS logic already defined in deriveSlotIntent.ts.
 */

import { EXERCISE_EXTENDED_META, type ExerciseExtendedMeta } from "./programs/exerciseExtendedMeta";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeekRole = "establish" | "build" | "intensify" | "deload";

export interface CandidateScore {
  name: string;
  score: number;
  breakdown: {
    complexity: number;
    stability: number;
    velocity: number;
  };
}

export interface LibraryVariantResult {
  selectedName: string | null;
  source: "cluster" | "family" | "none";
  candidatesConsidered: number;
  currentScore: number;
  selectedScore: number | null;
  scoreDiff: number | null;
}

// ─── Cluster & Family Indexes ─────────────────────────────────────────────────
//
// Built once at module load from EXERCISE_EXTENDED_META.
// cluster → exercises[]; family → exercises[]

type Index = Record<string, string[]>;

let _clusterIndex: Index | null = null;
let _familyIndex: Index | null = null;

function buildIndexes(): { clusterIndex: Index; familyIndex: Index } {
  const clusterIndex: Index = {};
  const familyIndex: Index = {};

  for (const [name, meta] of Object.entries(EXERCISE_EXTENDED_META)) {
    // Family index — all exercises
    const fam = meta.family;
    if (!familyIndex[fam]) familyIndex[fam] = [];
    familyIndex[fam].push(name);

    // Cluster index — only exercises with an explicit cluster
    const cluster = meta.equivalenceCluster;
    if (cluster && cluster !== "unclassified") {
      if (!clusterIndex[cluster]) clusterIndex[cluster] = [];
      clusterIndex[cluster].push(name);
    }
  }

  return { clusterIndex, familyIndex };
}

function getIndexes(): { clusterIndex: Index; familyIndex: Index } {
  if (!_clusterIndex) {
    const { clusterIndex, familyIndex } = buildIndexes();
    _clusterIndex = clusterIndex;
    _familyIndex = familyIndex;
  }
  return { clusterIndex: _clusterIndex!, familyIndex: _familyIndex! };
}

// ─── Week-Role Scoring Tables ─────────────────────────────────────────────────
//
// Each dimension is scored independently then summed.
// Positive = good fit for this week role, negative = poor fit.
//
// Aligned with PHASE_MODS in deriveSlotIntent.ts:
//   establish: complexityLimit=moderate, targetFatigueCost=moderate
//   build: complexityLimit=high, targetFatigueCost=high
//   intensify: complexityLimit=moderate, targetNeuralDemand=high, targetFatigueCost=high
//   deload: complexityLimit=low, targetNeuralDemand=low, targetFatigueCost=low

const COMPLEXITY_SCORE: Record<WeekRole, Record<string, number>> = {
  establish:  { simple: +4, moderate: +2, complex: -3 },
  build:      { simple: -1, moderate: +3, complex: +2 },
  intensify:  { simple: -3, moderate: +1, complex: +4 },
  deload:     { simple: +4, moderate: +1, complex: -4 },
};

const STABILITY_SCORE: Record<WeekRole, Record<string, number>> = {
  establish:  { low: +2, moderate: +1, high: -1 },
  build:      { low: +0, moderate: +1, high: +0 },
  intensify:  { low: -1, moderate: +1, high: +2 },
  deload:     { low: +2, moderate: +1, high: -2 },
};

const VELOCITY_SCORE: Record<WeekRole, Record<string, number>> = {
  establish:  { slow_grind: +1, moderate: +2, ballistic: -2, explosive: -3 },
  build:      { slow_grind: +1, moderate: +2, ballistic: +0, explosive: +0 },
  intensify:  { slow_grind: +2, moderate: +1, ballistic: +0, explosive: -1 },
  deload:     { slow_grind: +0, moderate: +2, ballistic: -1, explosive: -2 },
};

// Minimum score improvement required to trigger a swap.
// Prevents swapping when the current exercise already fits the week role well.
const SWAP_THRESHOLD = 2;

// ─── Scoring Function ─────────────────────────────────────────────────────────

export function scoreStrengthCandidateForWeekRole(
  candidateName: string,
  weekRole: WeekRole
): CandidateScore {
  const meta: ExerciseExtendedMeta = EXERCISE_EXTENDED_META[candidateName] ?? {
    family: "heavy_bilateral_squat",
    complexity: "moderate",
    velocityIntent: "moderate",
    stabilityDemand: "moderate",
  };

  const complexity = COMPLEXITY_SCORE[weekRole][meta.complexity] ?? 0;
  const stability  = STABILITY_SCORE[weekRole][meta.stabilityDemand] ?? 0;
  const velocity   = VELOCITY_SCORE[weekRole][meta.velocityIntent] ?? 0;

  return {
    name: candidateName,
    score: complexity + stability + velocity,
    breakdown: { complexity, stability, velocity },
  };
}

// ─── Week Number → Role ───────────────────────────────────────────────────────

export function weekNumberToRole(weekNumber: number): WeekRole {
  switch (weekNumber) {
    case 1: return "establish";
    case 2: return "build";
    case 3: return "intensify";
    case 4: return "deload";
    default: return "build";
  }
}

// ─── Primary Selection Function ───────────────────────────────────────────────
//
// Searches the exercise library for the best variant of `currentExerciseName`
// for the given week role.
//
// Selection order:
//   1. Cluster-level candidates (preferred — tight interchangeability guarantee)
//   2. Family-level candidates (broader fallback — keeps movement pattern coherent)
//   3. Return null — caller falls back to hardcoded map or keeps current exercise
//
// Returns null when:
//   - Exercise not found in library (unknown name)
//   - weekNumber === 2 (Build — no swap, load progression is the signal)
//   - No candidate scores >= current score + SWAP_THRESHOLD
//   - Only one exercise in the cluster (nothing to rotate to)

export function selectStrengthVariantFromLibrary(
  currentExerciseName: string,
  weekNumber: number
): LibraryVariantResult {
  const noResult: LibraryVariantResult = {
    selectedName: null,
    source: "none",
    candidatesConsidered: 0,
    currentScore: 0,
    selectedScore: null,
    scoreDiff: null,
  };

  // W2: Keep current exercise — load progression is the week-to-week signal
  if (weekNumber === 2) return noResult;

  // Must be in library
  const currentMeta = EXERCISE_EXTENDED_META[currentExerciseName];
  if (!currentMeta) return noResult;

  const weekRole = weekNumberToRole(weekNumber);
  const currentScore = scoreStrengthCandidateForWeekRole(currentExerciseName, weekRole).score;

  const { clusterIndex, familyIndex } = getIndexes();

  // ── Cluster-level candidates ─────────────────────────────────────────────
  const cluster = currentMeta.equivalenceCluster;
  let candidates: string[] = [];
  let searchSource: "cluster" | "family" = "cluster";

  if (cluster && cluster !== "unclassified" && clusterIndex[cluster]) {
    candidates = clusterIndex[cluster].filter(n => n !== currentExerciseName);
  }

  // ── Family-level fallback if cluster search is empty ────────────────────
  if (candidates.length === 0 && familyIndex[currentMeta.family]) {
    candidates = familyIndex[currentMeta.family].filter(n => n !== currentExerciseName);
    searchSource = "family";
  }

  if (candidates.length === 0) return noResult;

  // ── Score and rank candidates ─────────────────────────────────────────────
  const scored = candidates
    .map(name => scoreStrengthCandidateForWeekRole(name, weekRole))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); // desc score, asc name for determinism

  const top = scored[0];
  const scoreDiff = top.score - currentScore;

  // Only swap when the candidate is meaningfully better
  if (scoreDiff < SWAP_THRESHOLD) {
    return {
      selectedName: null,
      source: searchSource,
      candidatesConsidered: candidates.length,
      currentScore,
      selectedScore: top.score,
      scoreDiff,
    };
  }

  return {
    selectedName: top.name,
    source: searchSource,
    candidatesConsidered: candidates.length,
    currentScore,
    selectedScore: top.score,
    scoreDiff,
  };
}

// ─── Audit: Before/After Comparison ──────────────────────────────────────────
//
// Generates a structured comparison of library-driven vs hardcoded-map output
// for a given exercise across all 4 weeks. Used for [StrengthWeekVariationAudit] logging.

export interface WeekVariantAuditEntry {
  week: number;
  role: WeekRole;
  librarySelection: string | null;
  librarySource: "cluster" | "family" | "none";
  hardcodedMapSelection: string | null;
  finalSelection: string; // what actually gets used (library wins, map fallback)
  currentScore: number;
  selectedScore: number | null;
  scoreDiff: number | null;
}

export function auditExerciseVariantSelection(
  exerciseName: string,
  hardcodedMap: Record<string, { w1?: string; w2?: string; w3?: string; w4?: string }>
): WeekVariantAuditEntry[] {
  const mapEntry = hardcodedMap[exerciseName];

  return [1, 2, 3, 4].map(weekNumber => {
    const role = weekNumberToRole(weekNumber);
    const libResult = selectStrengthVariantFromLibrary(exerciseName, weekNumber);
    const weekKey = `w${weekNumber}` as "w1" | "w2" | "w3" | "w4";
    const hardcodedSelection = mapEntry?.[weekKey] ?? null;

    // W1/W2/W3: library wins → map fallback
    // W4 (deload): map wins → library fallback (map holds cross-family downgrades)
    const finalSelection = weekNumber === 4
      ? (hardcodedSelection ?? libResult.selectedName ?? exerciseName)
      : (libResult.selectedName ?? hardcodedSelection ?? exerciseName);

    return {
      week: weekNumber,
      role,
      librarySelection: libResult.selectedName,
      librarySource: libResult.source,
      hardcodedMapSelection: hardcodedSelection,
      finalSelection,
      currentScore: libResult.currentScore,
      selectedScore: libResult.selectedScore,
      scoreDiff: libResult.scoreDiff,
    };
  });
}
