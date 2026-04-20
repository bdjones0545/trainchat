/**
 * Strength Week Expression Engine — Auditable Metadata-First Variant Selection
 *
 * Architecture:
 *   1. Build ClusterIndex and FamilyIndex from EXERCISE_EXTENDED_META at module load.
 *   2. Score every same-cluster candidate for the target week role (3 axes: complexity,
 *      stabilityDemand, velocityIntent). Configurable per-week threshold.
 *   3. If the cluster produces no winner (threshold miss or no candidates), extend the
 *      search to the full movement family — same family, broader candidate set.
 *   4. Return null + explicit reason code when library cannot provide a winner. The
 *      caller in training-system-service.ts then consults STRENGTH_EXERCISE_VARIANTS
 *      (curated map) as last resort.
 *
 * Week role policies:
 *   W1 Establish  — prefer simpler complexity, lower stability. Threshold = 2.
 *   W2 Build      — no swap. Load progression is the week-to-week signal. Threshold = ∞.
 *   W3 Intensify  — prefer complex/high-stability. Threshold = 1 (any measurable gain).
 *   W4 Deload     — caller uses curated-map-first (cross-family deload); library is
 *                   the fallback for exercises without a map entry. Threshold = 2.
 *
 * Same-family-before-cross-family rule (items 5):
 *   The library ONLY searches within the same equivalenceCluster or same movement family.
 *   Cross-family selections are exclusively sourced from the curated map — this is by
 *   design and is logged with reason "map_w4_cross_family_policy".
 *
 * Every selection path returns an explicit reason code (items 1, 8) so nothing is
 * silent. The audit utilities (items 2, 3, 7) are exported for dev-only reporting.
 */

import { EXERCISE_EXTENDED_META, type ExerciseExtendedMeta } from "./programs/exerciseExtendedMeta";

// ─── Reason Codes ─────────────────────────────────────────────────────────────
//
// Every call to selectStrengthVariantFromLibrary returns one of these.
// Callers in training-system-service.ts preserve and log the reason.

export type SelectionReason =
  | "library_selected_cluster"        // winner found within equivalenceCluster
  | "library_selected_family"         // winner found via family fallback (cluster was insufficient)
  | "library_no_candidates"           // exercise has no cluster or family siblings
  | "library_below_threshold_cluster" // cluster candidates exist but none meets threshold
  | "library_below_threshold_family"  // family candidates exist but none meets threshold after cluster also failed
  | "library_all_tied_cluster"        // all cluster candidates score identically — threshold miss at 0 diff
  | "library_all_tied_family"         // all family candidates also score identically
  | "exercise_not_in_library"         // exercise name not found in EXERCISE_EXTENDED_META
  | "w2_build_no_swap";               // W2 always keeps current exercise

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
  // Core output
  selectedName: string | null;
  source: "cluster" | "family" | "none";
  reason: SelectionReason;

  // Scoring context
  candidateCount: number;
  currentExerciseScore: number;
  winningScore: number | null;
  scoreDelta: number | null;
  thresholdApplied: number;

  // Exercise metadata
  equivalenceCluster: string | null;
  movementFamily: string | null;

  // Cross-family flag — true if selected exercise is in a different family
  // (should only happen via curated map, never via library path)
  crossFamily: boolean;
}

// ─── Per-week Swap Threshold ──────────────────────────────────────────────────
//
// Candidate must outscore the current exercise by at least this many points.
//
//   W1: 2 — meaningful simplification; prevents swapping equal alternatives
//   W2: 999 — never swap; load progression is the week signal
//   W3: 1 — any measurable gain triggers swap (enables Pause/Deficit selection
//            when base lifts are adjusted to stabilityDemand:"moderate")
//   W4: 2 — meaningful deload; caller uses curated-map-first anyway

export const SWAP_THRESHOLD_BY_WEEK: Record<number, number> = {
  1: 2,
  2: 999,
  3: 1,
  4: 2,
};

// ─── Cluster & Family Indexes ─────────────────────────────────────────────────

type Index = Record<string, string[]>;

let _clusterIndex: Index | null = null;
let _familyIndex: Index | null = null;

function buildIndexes(): { clusterIndex: Index; familyIndex: Index } {
  const clusterIndex: Index = {};
  const familyIndex: Index = {};

  for (const [name, meta] of Object.entries(EXERCISE_EXTENDED_META)) {
    const fam = meta.family;
    if (!familyIndex[fam]) familyIndex[fam] = [];
    familyIndex[fam].push(name);

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
// Three independent axes: complexity, stabilityDemand, velocityIntent.
// Score = sum of all three. Positive = good fit, negative = poor fit.
//
// Aligned with PHASE_MODS in deriveSlotIntent.ts.

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
// Library-first, auditable, reason-coded selection for a given exercise × week.
//
// Search order (same-family-before-cross-family rule):
//   1. Cluster candidates (same equivalenceCluster — tightest interchangeability)
//   2. Family candidates (same movement family — broader, still coherent)
//   3. Return null + reason — caller consults curated map
//
// Cross-family selection NEVER happens in this function. Only the curated map
// in training-system-service.ts makes cross-family deload downgrades.

export function selectStrengthVariantFromLibrary(
  currentExerciseName: string,
  weekNumber: number
): LibraryVariantResult {
  const threshold = SWAP_THRESHOLD_BY_WEEK[weekNumber] ?? 2;
  const weekRole = weekNumberToRole(weekNumber);

  const base: Omit<LibraryVariantResult, "selectedName" | "source" | "reason" | "candidateCount" | "winningScore" | "scoreDelta"> = {
    currentExerciseScore: 0,
    thresholdApplied: threshold,
    equivalenceCluster: null,
    movementFamily: null,
    crossFamily: false,
  };

  // W2: never swap — load progression is the signal
  if (weekNumber === 2) {
    return { ...base, selectedName: null, source: "none", reason: "w2_build_no_swap", candidateCount: 0, winningScore: null, scoreDelta: null };
  }

  // Must be in library
  const currentMeta = EXERCISE_EXTENDED_META[currentExerciseName];
  if (!currentMeta) {
    return { ...base, selectedName: null, source: "none", reason: "exercise_not_in_library", candidateCount: 0, winningScore: null, scoreDelta: null };
  }

  const currentScore = scoreStrengthCandidateForWeekRole(currentExerciseName, weekRole).score;
  const cluster = currentMeta.equivalenceCluster ?? null;
  const family = currentMeta.family;

  const filledBase = { ...base, currentExerciseScore: currentScore, equivalenceCluster: cluster, movementFamily: family };

  const { clusterIndex, familyIndex } = getIndexes();

  // ── Helper: score + rank candidates ────────────────────────────────────────
  function rankCandidates(pool: string[]): CandidateScore[] {
    return pool
      .map(n => scoreStrengthCandidateForWeekRole(n, weekRole))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  // ── 1. Cluster-level search ─────────────────────────────────────────────────
  if (cluster && cluster !== "unclassified" && clusterIndex[cluster]) {
    const clusterCandidates = clusterIndex[cluster].filter(n => n !== currentExerciseName);

    if (clusterCandidates.length > 0) {
      const ranked = rankCandidates(clusterCandidates);
      const top = ranked[0];
      const delta = top.score - currentScore;

      // Did any candidate beat the threshold?
      if (delta >= threshold) {
        return {
          ...filledBase,
          selectedName: top.name,
          source: "cluster",
          reason: "library_selected_cluster",
          candidateCount: clusterCandidates.length,
          winningScore: top.score,
          scoreDelta: delta,
        };
      }

      // Candidates exist but fell short — still try family before giving up
      const allTied = ranked.every(c => c.score === top.score && top.score === currentScore);
      const clusterReason: SelectionReason = allTied
        ? "library_all_tied_cluster"
        : "library_below_threshold_cluster";

      // ── 2. Family-level fallback when cluster found no winner ─────────────
      const familyCandidates = (familyIndex[family] ?? []).filter(
        n => n !== currentExerciseName && !(clusterIndex[cluster] ?? []).includes(n)
      );

      if (familyCandidates.length > 0) {
        const familyRanked = rankCandidates(familyCandidates);
        const familyTop = familyRanked[0];
        const familyDelta = familyTop.score - currentScore;

        if (familyDelta >= threshold) {
          return {
            ...filledBase,
            selectedName: familyTop.name,
            source: "family",
            reason: "library_selected_family",
            candidateCount: familyCandidates.length,
            winningScore: familyTop.score,
            scoreDelta: familyDelta,
          };
        }

        const familyAllTied = familyRanked.every(c => c.score === familyTop.score && familyTop.score === currentScore);
        return {
          ...filledBase,
          selectedName: null,
          source: "family",
          reason: familyAllTied ? "library_all_tied_family" : "library_below_threshold_family",
          candidateCount: clusterCandidates.length + familyCandidates.length,
          winningScore: familyTop.score,
          scoreDelta: familyDelta,
        };
      }

      // No family candidates either — return cluster miss
      return {
        ...filledBase,
        selectedName: null,
        source: "cluster",
        reason: clusterReason,
        candidateCount: clusterCandidates.length,
        winningScore: top.score,
        scoreDelta: delta,
      };
    }
  }

  // ── 3. No cluster — family-only search ──────────────────────────────────────
  const familyCandidates = (familyIndex[family] ?? []).filter(n => n !== currentExerciseName);

  if (familyCandidates.length === 0) {
    return { ...filledBase, selectedName: null, source: "none", reason: "library_no_candidates", candidateCount: 0, winningScore: null, scoreDelta: null };
  }

  const familyRanked = rankCandidates(familyCandidates);
  const familyTop = familyRanked[0];
  const familyDelta = familyTop.score - currentScore;

  if (familyDelta >= threshold) {
    return {
      ...filledBase,
      selectedName: familyTop.name,
      source: "family",
      reason: "library_selected_family",
      candidateCount: familyCandidates.length,
      winningScore: familyTop.score,
      scoreDelta: familyDelta,
    };
  }

  const familyAllTied = familyRanked.every(c => c.score === familyTop.score && familyTop.score === currentScore);
  return {
    ...filledBase,
    selectedName: null,
    source: "family",
    reason: familyAllTied ? "library_all_tied_family" : "library_below_threshold_family",
    candidateCount: familyCandidates.length,
    winningScore: familyTop.score,
    scoreDelta: familyDelta,
  };
}

// ─── Per-Candidate Audit Entry ────────────────────────────────────────────────

export interface CandidateAuditEntry {
  name: string;
  score: number;
  breakdown: { complexity: number; stability: number; velocity: number };
  metadata: {
    complexity: string;
    stabilityDemand: string;
    velocityIntent: string;
    family: string;
    cluster: string | null;
  };
  selected: boolean;
  rejectionReason: "below_threshold" | "lower_score" | "is_current" | null;
}

export interface ExerciseWeekAudit {
  week: number;
  role: WeekRole;
  originalExercise: string;
  finalSelection: string;
  selectionSource: "library_cluster" | "library_family" | "curated_map_w4_policy" | "curated_map_fallback" | "kept";
  libraryReason: SelectionReason;

  currentMeta: {
    complexity: string;
    stabilityDemand: string;
    velocityIntent: string;
    family: string;
    cluster: string | null;
  };
  currentScore: number;
  winningScore: number | null;
  scoreDelta: number | null;
  threshold: number;

  hardcodedMapOption: string | null;
  candidates: CandidateAuditEntry[];
}

// ─── Deep Audit Function ──────────────────────────────────────────────────────
//
// Returns per-week audit with full candidate breakdown, rejection reasons,
// and source attribution. Used by dev-only reporting endpoints.

export function auditExerciseVariantSelection(
  exerciseName: string,
  hardcodedMap: Record<string, { w1?: string; w2?: string; w3?: string; w4?: string }>
): ExerciseWeekAudit[] {
  const { clusterIndex, familyIndex } = getIndexes();
  const mapEntry = hardcodedMap[exerciseName];
  const currentMeta = EXERCISE_EXTENDED_META[exerciseName];

  return [1, 2, 3, 4].map(weekNumber => {
    const role = weekNumberToRole(weekNumber);
    const threshold = SWAP_THRESHOLD_BY_WEEK[weekNumber] ?? 2;
    const libResult = selectStrengthVariantFromLibrary(exerciseName, weekNumber);
    const weekKey = `w${weekNumber}` as "w1" | "w2" | "w3" | "w4";
    const mapOption = mapEntry?.[weekKey] ?? null;

    // W4: map-first; W1/W2/W3: library-first
    const finalSelection = weekNumber === 4
      ? (mapOption ?? libResult.selectedName ?? exerciseName)
      : (libResult.selectedName ?? mapOption ?? exerciseName);

    // Determine the selection source
    let selectionSource: ExerciseWeekAudit["selectionSource"];
    if (weekNumber === 4 && mapOption) {
      selectionSource = "curated_map_w4_policy";
    } else if (libResult.selectedName) {
      selectionSource = libResult.source === "cluster" ? "library_cluster" : "library_family";
    } else if (mapOption) {
      selectionSource = "curated_map_fallback";
    } else {
      selectionSource = "kept";
    }

    // Build candidate list for this week
    const candidates: CandidateAuditEntry[] = [];
    const cluster = currentMeta?.equivalenceCluster ?? null;
    const family = currentMeta?.family ?? "unknown";
    const currentScore = currentMeta
      ? scoreStrengthCandidateForWeekRole(exerciseName, role).score
      : 0;

    const clusterPool = cluster && cluster !== "unclassified"
      ? (clusterIndex[cluster] ?? []).filter(n => n !== exerciseName)
      : [];
    const familyPool = (familyIndex[family] ?? []).filter(
      n => n !== exerciseName && !clusterPool.includes(n)
    );

    for (const name of [...clusterPool, ...familyPool]) {
      const scored = scoreStrengthCandidateForWeekRole(name, role);
      const meta = EXERCISE_EXTENDED_META[name];
      const delta = scored.score - currentScore;

      let rejectionReason: CandidateAuditEntry["rejectionReason"] = null;
      if (name === finalSelection) {
        rejectionReason = null; // selected
      } else if (delta < threshold) {
        rejectionReason = delta < scored.score ? "below_threshold" : "lower_score";
      } else {
        rejectionReason = "lower_score";
      }

      candidates.push({
        name,
        score: scored.score,
        breakdown: scored.breakdown,
        metadata: {
          complexity: meta?.complexity ?? "unknown",
          stabilityDemand: meta?.stabilityDemand ?? "unknown",
          velocityIntent: meta?.velocityIntent ?? "unknown",
          family: meta?.family ?? "unknown",
          cluster: meta?.equivalenceCluster ?? null,
        },
        selected: name === finalSelection,
        rejectionReason: name === finalSelection ? null : (delta < threshold ? "below_threshold" : "lower_score"),
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return {
      week: weekNumber,
      role,
      originalExercise: exerciseName,
      finalSelection,
      selectionSource,
      libraryReason: libResult.reason,
      currentMeta: {
        complexity: currentMeta?.complexity ?? "unknown",
        stabilityDemand: currentMeta?.stabilityDemand ?? "unknown",
        velocityIntent: currentMeta?.velocityIntent ?? "unknown",
        family,
        cluster,
      },
      currentScore: libResult.currentExerciseScore,
      winningScore: libResult.winningScore,
      scoreDelta: libResult.scoreDelta,
      threshold,
      hardcodedMapOption: mapOption,
      candidates,
    };
  });
}

// ─── Metadata Coverage Diagnostics ───────────────────────────────────────────
//
// Scans the library and identifies coverage gaps:
//   - exercises with no equivalenceCluster (cannot benefit from cluster search)
//   - clusters with only 1 member (no rotation possible)
//   - primary lift families and their W1/W3 library coverage

export interface MetadataCoverageReport {
  totalExercises: number;
  withCluster: number;
  withoutCluster: string[];
  singletonClusters: Array<{ cluster: string; member: string }>;
  clusterSizes: Record<string, number>;
  familySizes: Record<string, number>;
  primaryLiftCoverage: Array<{
    exercise: string;
    family: string;
    cluster: string | null;
    w1LibraryResult: string | null;
    w1Reason: SelectionReason;
    w3LibraryResult: string | null;
    w3Reason: SelectionReason;
    w4LibraryResult: string | null;
    w4Reason: SelectionReason;
    gaps: string[];
  }>;
}

const PRIMARY_LIFTS_TO_AUDIT = [
  "Back Squat", "Front Squat", "Conventional Deadlift", "Sumo Deadlift",
  "Romanian Deadlift", "Bench Press", "Overhead Press (barbell)",
  "Barbell Row", "Pull-Up", "Chin-Up",
  "Bulgarian Split Squat", "Dead Bug", "Pallof Press", "Farmers Carry",
];

export function buildMetadataCoverageReport(): MetadataCoverageReport {
  const { clusterIndex, familyIndex } = getIndexes();

  const withoutCluster: string[] = [];
  const clusterSizes: Record<string, number> = {};
  const familySizes: Record<string, number> = {};

  for (const [name, meta] of Object.entries(EXERCISE_EXTENDED_META)) {
    if (!meta.equivalenceCluster || meta.equivalenceCluster === "unclassified") {
      withoutCluster.push(name);
    }
    const c = meta.equivalenceCluster;
    if (c && c !== "unclassified") clusterSizes[c] = (clusterSizes[c] ?? 0) + 1;
    familySizes[meta.family] = (familySizes[meta.family] ?? 0) + 1;
  }

  const singletonClusters: MetadataCoverageReport["singletonClusters"] = [];
  for (const [cluster, members] of Object.entries(clusterIndex)) {
    if (members.length === 1) {
      singletonClusters.push({ cluster, member: members[0] });
    }
  }

  const primaryLiftCoverage = PRIMARY_LIFTS_TO_AUDIT.map(name => {
    const meta = EXERCISE_EXTENDED_META[name];
    const r1 = selectStrengthVariantFromLibrary(name, 1);
    const r3 = selectStrengthVariantFromLibrary(name, 3);
    const r4 = selectStrengthVariantFromLibrary(name, 4);

    const gaps: string[] = [];
    if (!r1.selectedName) gaps.push(`W1 gap (${r1.reason})`);
    if (!r3.selectedName) gaps.push(`W3 gap (${r3.reason})`);
    if (!r4.selectedName) gaps.push(`W4 gap (${r4.reason}) — may use curated map`);

    return {
      exercise: name,
      family: meta?.family ?? "NOT_IN_LIBRARY",
      cluster: meta?.equivalenceCluster ?? null,
      w1LibraryResult: r1.selectedName,
      w1Reason: r1.reason,
      w3LibraryResult: r3.selectedName,
      w3Reason: r3.reason,
      w4LibraryResult: r4.selectedName,
      w4Reason: r4.reason,
      gaps,
    };
  });

  return {
    totalExercises: Object.keys(EXERCISE_EXTENDED_META).length,
    withCluster: Object.keys(EXERCISE_EXTENDED_META).length - withoutCluster.length,
    withoutCluster,
    singletonClusters,
    clusterSizes,
    familySizes,
    primaryLiftCoverage,
  };
}

// ─── Fallback Reduction Report ────────────────────────────────────────────────
//
// Summarises library-driven vs curated-map vs no-change ratios across a set
// of exercises. Reveals what remains hardcoded and which exercises most depend
// on the curated map.

export interface FallbackReductionReport {
  totalSelections: number;
  bySource: {
    library: number;
    curatedMap: number;
    kept: number;
  };
  byWeek: Record<number, { library: number; curatedMap: number; kept: number }>;
  libraryPct: string;
  curatedMapPct: string;
  keptPct: string;
  topCuratedDependencies: Array<{
    exercise: string;
    weeks: number[];
    reasons: string[];
  }>;
}

export function buildFallbackReductionReport(
  exerciseNames: string[],
  hardcodedMap: Record<string, { w1?: string; w2?: string; w3?: string; w4?: string }>
): FallbackReductionReport {
  const byWeek: Record<number, { library: number; curatedMap: number; kept: number }> = {
    1: { library: 0, curatedMap: 0, kept: 0 },
    2: { library: 0, curatedMap: 0, kept: 0 },
    3: { library: 0, curatedMap: 0, kept: 0 },
    4: { library: 0, curatedMap: 0, kept: 0 },
  };

  const curatedDependencyMap: Record<string, { weeks: number[]; reasons: string[] }> = {};

  let totalLib = 0, totalCurated = 0, totalKept = 0;

  for (const name of exerciseNames) {
    const audits = auditExerciseVariantSelection(name, hardcodedMap);
    for (const audit of audits) {
      const wk = audit.week;
      if (audit.selectionSource.startsWith("library")) {
        byWeek[wk].library++;
        totalLib++;
      } else if (audit.selectionSource.startsWith("curated")) {
        byWeek[wk].curatedMap++;
        totalCurated++;
        if (!curatedDependencyMap[name]) curatedDependencyMap[name] = { weeks: [], reasons: [] };
        curatedDependencyMap[name].weeks.push(wk);
        curatedDependencyMap[name].reasons.push(`W${wk}: ${audit.libraryReason}`);
      } else {
        byWeek[wk].kept++;
        totalKept++;
      }
    }
  }

  const total = totalLib + totalCurated + totalKept;
  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

  const topCuratedDependencies = Object.entries(curatedDependencyMap)
    .sort((a, b) => b[1].weeks.length - a[1].weeks.length)
    .map(([exercise, { weeks, reasons }]) => ({ exercise, weeks, reasons }));

  return {
    totalSelections: total,
    bySource: { library: totalLib, curatedMap: totalCurated, kept: totalKept },
    byWeek,
    libraryPct: pct(totalLib),
    curatedMapPct: pct(totalCurated),
    keptPct: pct(totalKept),
    topCuratedDependencies,
  };
}

