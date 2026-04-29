// ─── Exercise + Block Variation Engine ───────────────────────────────────────
//
// Slot-based exercise selection with ranked scoring and family-rotation logic.
//
// ── Decision Hierarchy (in priority order) ───────────────────────────────────
//   PRIMARY (steer which exercise wins):
//     1. Movement-family rotation via BlockExposureTracker
//        — prevents same exercise repeating in the same slot across weeks
//     2. Phase exercise affinity
//        — ensures week role drives WHICH family member is chosen
//     3. Equivalence cluster suppression (movementClusterPenalty)
//        — prevents perceptually similar exercises from filling the same week
//     4. Sport fit, session intent fit, block archetype fit
//   SECONDARY (guardrails only — constrain but do not primarily steer):
//     5. Equipment mismatch (-3 hard)
//     6. Exact duplicate in this build (-5 hard)
//     7. Fatigue mismatch (deload/low-fatigue slots)
//     8. Complexity limit mismatch
//     9. Disallowed family mismatch
//    10. Cross-build contrast memory and slot-repeat (soft, reduced)
//
// ── NOT used as primary selectors ────────────────────────────────────────────
//   ✗ ANCHOR_EXTRA_PENALTY — removed. Manual exercise suppression (Back Squat
//     -2.5, Zercher -2.0, etc.) caused a penalty treadmill: penalise one winner
//     → next runner-up becomes the new repeated winner → patch again. The new
//     architecture avoids this through exposure tracking + phase affinity.
//   ✗ isDefaultAnchor penalty — removed. Default-anchor suppression is now
//     handled by the exposure gate preventing any exercise from repeating the
//     same slot across weeks.
//   ✗ recentWindowPenalty — removed. Fully superseded by blockExposurePenalty
//     and the reduced cross-build contrast penalties.
//
// ── Remaining legacy signals (demoted to soft tiebreakers) ───────────────────
//   • overusePenalty  — 0.4× scale, cap -2. Very soft long-tail learning only.
//   • contrastPenalty — max -1.5/-0.75 for last/2nd-ago build. Cross-build soft.
//   • slotRepeatPenalty — max -3.0 per slot across builds. Cross-build soft.
//
// ── Selection audit ───────────────────────────────────────────────────────────
//   [FamilyRotationAudit]     — per slot pick: family, exposure, penalty applied
//   [SelectionDecisionAudit]  — per slot pick: which dimensions drove the winner
//   [ExposureAudit]           — post-build: full slot×exercise×week matrix
//
// Key guarantee: coaching correctness is NEVER sacrificed for novelty.
//   Every candidate in every pool is valid for its slot.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Block Variation Engine Imports ──────────────────────────────────────────
import { getExerciseExtendedMeta, getExerciseFamily, getEquivalenceCluster } from "./programs/exerciseExtendedMeta";
import { deriveSlotIntent, type SlotIntentResult } from "./programs/deriveSlotIntent";
import { deriveFamilyBiases, getFamilyBiasScore, type FamilyBiasResult } from "./programs/deriveFamilyBiases";
import {
  emitExerciseVariationAudit,
  emitExerciseVariationWarning,
  validateSelectionCoherence,
  buildWinReasons,
  buildPenaltySummary,
  type ExerciseScoreBreakdown,
  type SlotAuditPayload,
} from "./programs/exerciseVariationAudit";
import type { ProgramContextProfile } from "./programs/programContextProfile";
import type { ResolvedAgentControls } from "./programs/agentControlTypes";
import { getAnchorPenaltyMultiplierForMode } from "./programs/agentControlResolver";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Coaching metadata for each exercise in a pool. */
interface ExerciseMeta {
  name: string;
  /** Sports this exercise is particularly well-suited for (lowercase, partial). */
  sportTags: string[];
  /** Intent categories this exercise serves. */
  intentTags: Array<"power" | "strength" | "hypertrophy" | "endurance" | "stability" | "mobility" | "speed" | "elastic" | "rotational">;
  /** Neural system load. */
  neuralDemand: "high" | "moderate" | "low";
  /** Session fatigue cost. Higher = harder to recover from. */
  fatigueCost: "high" | "moderate" | "low";
  /** True if this exercise is one of the 5 default anchors we're trying to rotate away from. */
  isDefaultAnchor?: boolean;
  /**
   * Movement equivalence cluster — a sub-family label that groups exercises
   * that are functionally interchangeable in a given slot (e.g. all bilateral
   * barbell squats, all vertical-pull patterns).  When defined, the cluster-
   * alternative-bonus scoring dimension gives +1.5 to OTHER exercises in the
   * same cluster when this exercise was picked in the previous build for this
   * slot, encouraging build-over-build rotation within equivalents.
   */
  equivalenceCluster?: string;
  /**
   * True if this exercise requires specialty equipment not found in most gyms.
   * Specialty exercises are excluded from program generation by default.
   * They are only selected if the user explicitly confirms equipment access.
   * Example: Belt Squat requires a belt squat machine.
   */
  specialtyEquipment?: boolean;
}

/** Scoring context passed per build. */
export interface ScoreContext {
  sport: string | null;
  goal: string | null;
  /** Session-level intent for this particular slot usage. */
  sessionIntent: Array<"power" | "strength" | "hypertrophy" | "endurance" | "stability" | "mobility" | "speed" | "elastic" | "rotational">;
  /** Exercises already chosen for other slots in this build — exact repeats are penalised heavily. */
  alreadySelected: Set<string>;
  /** Equipment available. */
  equipmentLevel: "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight";
  /** Whether this slot should preference low-fatigue options (deload, early week). */
  lowFatigue?: boolean;
  /** Seed [0, 1) — used only as tiebreaker after scoring. */
  seed: number;
  /** Slot name — used in debug logs. */
  slotName: string;

  // ── Block Variation Engine extensions ───────────────────────────────────
  /** Derived slot intent from the block archetype + phase. When provided, enables block-aware scoring. */
  slotIntent?: SlotIntentResult;
  /** Family bias scores from deriveFamilyBiases(). When provided, enables family-level ranking. */
  familyBiases?: FamilyBiasResult;
  /** Full program context profile. Enables all extended scoring dimensions. */
  programContext?: ProgramContextProfile;
  /** Novelty pressure from similarity detection. Higher = stronger push toward variety. */
  noveltyPressure?: number;
  /** Generation ID for audit correlation. */
  generationId?: string;
  /** Resolved agent control directives for this generation. */
  resolvedAgentControls?: ResolvedAgentControls;
  /** Day index for this slot (used for day identity overrides). */
  dayIndex?: number;
  /**
   * Block-scoped exposure tracker for the current 4-week build.
   * When provided, scoreCandidate applies an intra-block exposure penalty
   * that prevents any single exercise from dominating a slot across all weeks.
   */
  blockExposure?: BlockExposureTracker;
}

export interface SlotExerciseSelection {
  lower_power: string;
  lower_power_d2: string;  // day 2 power — always different from lower_power
  lower_power_d3: string;  // day 3 power — different from d1 + d2
  lower_power_d4: string;  // day 4 power — different from d1 + d2 + d3
  bilateral_squat_strength: string;
  bilateral_squat_strength_d2: string;  // second squat day — always different from bilateral_squat_strength
  bilateral_hinge_strength: string;
  unilateral_lower: string;
  unilateral_lower_alt: string;
  trunk_anti_rotation: string;
  trunk_anti_extension: string;
  upper_push_primary: string;
  upper_push_secondary: string;
  upper_pull_primary: string;
  upper_pull_secondary: string;
  rotational_power: string;
  conditioning_finisher: string;
  elastic_power: string;
  positional_support: string;
  block_template_index: number;
  _debug?: SlotDebugInfo[];
}

interface CandidateScore {
  name: string;
  score: number;
  breakdown: {
    // ── Original dimensions ──────────────────────────────────────────────
    sportFit: number;
    intentFit: number;
    neuralFit: number;
    equipFit: number;
    noveltyBonus: number;
    fatiguePenalty: number;
    overusePenalty: number;
    contrastPenalty: number;
    exactRepeatPenalty: number;
    seedTiebreaker: number;
    // ── Novelty Pressure Layer ────────────────────────────────────────────
    /** Flat -2.5 penalty if this exercise appeared in any of the last 5 builds.
     *  Bridges the gap between the 2-build contrast memory and the slow 20-build
     *  overuse accumulation. Scales with noveltyPressure. */
    recentUsePenalty: number;
    /** -1.5 per same-family exercise already chosen in this build's alreadySelected.
     *  Prevents movement-pattern saturation within a single build (e.g., two
     *  hip-hinge exercises crowding out push or trunk variety). Capped at -3.0. */
    movementClusterPenalty: number;
    /** +1.5 when the last exercise used in THIS SLOT belonged to the same
     *  equivalence cluster (e.g., "bilateral-squat", "vertical-pull") and the
     *  candidate is a DIFFERENT exercise in that cluster.  Drives rotation
     *  within the cluster: the next build prefers "Safety Bar Squat" over
     *  "Back Squat" because Back Squat won last time in this slot. */
    clusterAlternativeBonus: number;
    // ── Block Variation Engine extensions ────────────────────────────────
    blockArchetypeFit: number;
    currentPhaseFit: number;
    slotIntentFit: number;
    movementBiasFit: number;
    familyPreferenceFit: number;
    familyReductionPenalty: number;
    disallowedFamilyPenalty: number;
    velocityIntentFit: number;
    stabilityDemandFit: number;
    complexityPenalty: number;
    progressionStyleFit: number;
    anchorPenalty: number;
    slotRepeatPenalty: number;
    // ── Agent Control Layer dimensions ────────────────────────────────────
    heroSuppressionPenalty: number;
    controlFamilyBoostFit: number;
    controlFamilyReductionPenalty: number;
    visibleSpineAlignmentFit: number;
    dayIdentityAlignmentFit: number;
    controlNoveltyBonus: number;
    controlNoveltyPenalty: number;
    // ── Family Rotation System ────────────────────────────────────────────────
    /** -5 to -14: penalty for reusing the same exercise in the same slot in a
     *  prior week of the current 4-week block.  Primary gate preventing one
     *  exercise from dominating all weeks. */
    blockExposurePenalty: number;
    /** 0 to +2.5: bonus for exercises that are the ideal expression of their
     *  movement family during the current training phase (establish/build/
     *  intensify/deload).  Drives WHICH family member is chosen. */
    phaseAffinityFit: number;
  };
}

export interface SlotDebugInfo {
  slot: string;
  poolSize: number;
  top3: CandidateScore[];
  chosen: string;
  contextSport: string | null;
  contextIntent: string[];
  softmaxRank?: number;
  topKWindow?: number;
  softmaxNeedle?: number;
  softmaxTemperature?: number;
  diversityBoostedNames?: string[];
  diversityFamiliesAlreadyUsed?: string[];
  biasTopDecayApplied?: boolean;
}

// ─── Overuse Registry ─────────────────────────────────────────────────────────
// Per-build sliding window: tracks which exercises appeared in each of the last
// REGISTRY_MAX_BUILDS builds. Overuse count = how many builds contained that
// exercise. Eviction removes the oldest builds (not timestamp-based clearing).
//
// Also maintains a two-build contrast memory for immediate repeat avoidance:
// exercises from the immediately prior build receive a strong extra penalty;
// exercises from two builds ago receive a moderate penalty.

interface BuildRecord {
  timestamp: number;
  exercises: string[];
}

const REGISTRY_BUILDS: BuildRecord[] = [];
const REGISTRY_MAX_BUILDS = 20;
const MAX_REGISTRY_AGE_MS = 15 * 60 * 1000; // 15 minutes

// Contrast memory: most recent two builds for strong intra-session penalty
let LAST_BUILD_SELECTIONS: Set<string> = new Set();
let SECOND_LAST_BUILD_SELECTIONS: Set<string> = new Set();

// ─── Per-Slot Contrast Registry ───────────────────────────────────────────────
// Tracks the last SLOT_HISTORY_MAX exercises chosen for each slot name.
// "same slot, same exercise" repeat penalties are much sharper than global contrast
// because the user visibly sees the same exercise in the same position every time.
const SLOT_HISTORY_MAX = 5;
const SLOT_CONTRAST_REGISTRY: Record<string, string[]> = {};

function recordSlotSelection(slotName: string, exerciseName: string): void {
  if (!SLOT_CONTRAST_REGISTRY[slotName]) SLOT_CONTRAST_REGISTRY[slotName] = [];
  SLOT_CONTRAST_REGISTRY[slotName].push(exerciseName);
  while (SLOT_CONTRAST_REGISTRY[slotName].length > SLOT_HISTORY_MAX) {
    SLOT_CONTRAST_REGISTRY[slotName].shift();
  }
}

/**
 * Cross-build slot-repeat penalty — demoted to a soft guardrail.
 * Fires when the same exercise occupies the same slot position across consecutive builds.
 * Magnitude is intentionally reduced: BlockExposureTracker is the primary intra-block
 * gate. This signal only governs cross-build slot-level contrast.
 *   Last build:    −3.0 (high-vis slots: −3.75)
 *   2 builds ago:  −1.5 (high-vis: −1.875)
 *   3 builds ago:  −0.75 (high-vis: −0.9375)
 */
function getSlotRepeatPenalty(slotName: string, exerciseName: string): number {
  const history = SLOT_CONTRAST_REGISTRY[slotName];
  if (!history || history.length === 0) return 0;

  const isHighVisibility = [
    "lower_power", "bilateral_squat_strength", "bilateral_hinge_strength",
    "unilateral_lower", "trunk_anti_rotation",
  ].includes(slotName);

  const multiplier = isHighVisibility ? 1.25 : 1.0;

  const len = history.length;
  if (history[len - 1] === exerciseName) return 3.0 * multiplier; // last build
  if (len >= 2 && history[len - 2] === exerciseName) return 1.5 * multiplier; // 2 builds ago
  if (len >= 3 && history[len - 3] === exerciseName) return 0.75 * multiplier; // 3 builds ago
  return 0;
}

/** Export for audit logging */
export function getSlotHistory(slotName: string): string[] {
  return [...(SLOT_CONTRAST_REGISTRY[slotName] ?? [])];
}

function registerBuildSelections(selections: Record<string, string>): void {
  const now = Date.now();
  const exercises = Object.values(selections).filter(Boolean);

  // Rotate contrast memory
  SECOND_LAST_BUILD_SELECTIONS = new Set(LAST_BUILD_SELECTIONS);
  LAST_BUILD_SELECTIONS = new Set(exercises);

  // Record per-slot history
  for (const [slotName, exerciseName] of Object.entries(selections)) {
    if (exerciseName) recordSlotSelection(slotName, exerciseName);
  }

  // Evict builds that are too old or exceed the cap
  const cutoff = now - MAX_REGISTRY_AGE_MS;
  while (
    REGISTRY_BUILDS.length > 0 &&
    (REGISTRY_BUILDS.length >= REGISTRY_MAX_BUILDS || REGISTRY_BUILDS[0].timestamp < cutoff)
  ) {
    REGISTRY_BUILDS.shift();
  }

  REGISTRY_BUILDS.push({ timestamp: now, exercises });
}

// ─── Block Exposure Tracker ────────────────────────────────────────────────────
//
// Tracks exercise selection across the weeks of a SINGLE program build.
// Passed through W1→W2→W3→W4 selectSlotExercises calls so each week knows what
// the prior weeks already chose for the same slot.
//
// Separation of concerns:
//   • BlockExposureTracker = intra-block (same 4-week program). Reset per build.
//   • REGISTRY_BUILDS      = inter-build (across programs). Persists in memory.
//
// Penalty logic (applied in scoreCandidate):
//   count=1 (used once this block) : -5.0  — soft discouragement
//   count=2 (used twice this block): -9.0  — near-hard ban
//   count≥3                        : -14.0 — hard ban (never 4× same slot)

export class BlockExposureTracker {
  /** slotName → exerciseName → weekNumbers[] */
  private readonly exposure: Map<string, Map<string, number[]>> = new Map();
  /** Public so audit logs inside pick() can read it without a getter method. */
  currentWeek: number = 1;

  /** Call before each week's selectSlotExercises call. */
  setWeek(weekNumber: number): void {
    this.currentWeek = weekNumber;
  }

  /** Record a selection after it is made. Called inside pick(). */
  record(slotName: string, exerciseName: string): void {
    if (!this.exposure.has(slotName)) this.exposure.set(slotName, new Map());
    const slotMap = this.exposure.get(slotName)!;
    if (!slotMap.has(exerciseName)) slotMap.set(exerciseName, []);
    slotMap.get(exerciseName)!.push(this.currentWeek);
  }

  /** Times this exercise has been used in this slot so far in the block. */
  getCount(slotName: string, exerciseName: string): number {
    return this.exposure.get(slotName)?.get(exerciseName)?.length ?? 0;
  }

  /** All exercises used in this slot across the block with their week arrays. */
  getSlotExposure(slotName: string): Map<string, number[]> {
    return this.exposure.get(slotName) ?? new Map();
  }

  /** Full exposure map for audit output. */
  getFullExposure(): Record<string, Record<string, number[]>> {
    const out: Record<string, Record<string, number[]>> = {};
    for (const [slot, exMap] of this.exposure) {
      out[slot] = {};
      for (const [ex, weeks] of exMap) out[slot][ex] = weeks;
    }
    return out;
  }
}

/** How many of the last N builds included this exercise (proper sliding count). */
function getOveruseCount(name: string): number {
  return REGISTRY_BUILDS.filter((b) => b.exercises.includes(name)).length;
}

/**
 * Cross-build contrast penalty — demoted to a soft tiebreaker.
 * Fires only for exercises used in the last two builds. Magnitude is intentionally
 * low since BlockExposureTracker is now the primary intra-block gate and
 * slotRepeatPenalty is the primary cross-build per-slot gate.
 *   Last build:        −1.5
 *   Second-to-last:    −0.75
 */
function getContrastPenalty(name: string): number {
  if (LAST_BUILD_SELECTIONS.has(name)) return 1.5;
  if (SECOND_LAST_BUILD_SELECTIONS.has(name)) return 0.75;
  return 0;
}

// ─── Scoring System ────────────────────────────────────────────────────────────

const NEURAL_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2 };
const FATIGUE_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2 };

const EQUIPMENT_REQUIRES: Record<string, string[]> = {
  barbell: ["full_gym"],
  trap_bar: ["full_gym"],
  cable: ["full_gym"],
  machine: ["full_gym"],
  med_ball: ["full_gym", "dumbbells_only", "home_limited"],
  kettlebell: ["full_gym", "dumbbells_only", "home_limited"],
  dumbbell: ["full_gym", "dumbbells_only", "home_limited"],
  bodyweight: ["full_gym", "dumbbells_only", "home_limited", "bodyweight"],
  band: ["full_gym", "dumbbells_only", "home_limited", "bodyweight"],
};

const EQUIPMENT_TAGS_PER_EXERCISE: Record<string, string[]> = {
  "Back Squat": ["barbell"],
  "Front Squat": ["barbell"],
  "Pause Back Squat": ["barbell"],
  "Safety Bar Squat": ["barbell"],
  "Box Squat": ["barbell"],
  "Low-Bar Back Squat": ["barbell"],
  "Cambered Bar Squat": ["barbell"],
  "Heel-Elevated Back Squat": ["barbell"],
  "Heel-Elevated Goblet Squat": ["dumbbell", "kettlebell"],
  "Goblet Squat (heavy)": ["dumbbell", "kettlebell"],
  "Trap Bar Deadlift (squat-mode, low handles)": ["trap_bar"],
  "Trap Bar Deadlift (low handles)": ["trap_bar"],
  "Zercher Squat": ["barbell"],
  "Hack Squat (machine)": ["machine"],
  "Leg Press (as primary)": ["machine"],
  "Conventional Deadlift": ["barbell"],
  "Sumo Deadlift": ["barbell"],
  "Rack Pull (from knee)": ["barbell"],
  "Snatch-Grip Deadlift": ["barbell"],
  "Romanian Deadlift": ["barbell"],
  "Romanian Deadlift (heavy)": ["barbell"],
  "Trap Bar Deadlift": ["trap_bar"],
  "Hex Bar Deadlift": ["trap_bar"],
  "Hex Bar RDL": ["trap_bar"],
  "Good Morning": ["barbell"],
  "Dumbbell Romanian Deadlift": ["dumbbell"],
  "Kettlebell Deadlift": ["kettlebell"],
  "Bulgarian Split Squat": ["dumbbell", "barbell"],
  "Rear-Foot Elevated Split Squat (RFESS)": ["dumbbell", "barbell"],
  "Lateral Step-Up": ["dumbbell", "barbell"],
  "Single-Leg Squat to Box": ["bodyweight", "dumbbell"],
  "Reverse Lunge": ["dumbbell", "barbell"],
  "Lateral Lunge": ["dumbbell", "bodyweight"],
  "Walking Lunge (weighted)": ["dumbbell", "barbell"],
  "Cossack Squat": ["dumbbell", "kettlebell", "bodyweight"],
  "Deficit Reverse Lunge": ["dumbbell", "barbell"],
  "Single-Leg Romanian Deadlift": ["dumbbell", "barbell"],
  "Single-Leg Hip Thrust": ["dumbbell", "barbell"],
  "Single-Leg Deadlift (KB)": ["kettlebell"],
  "Kickstand RDL": ["dumbbell", "barbell"],
  "Single-Leg Good Morning": ["bodyweight", "dumbbell"],
  "Hip Hinge to Single-Leg RDL": ["bodyweight", "dumbbell"],
};

function hasEquipment(exerciseName: string, equipmentLevel: string): boolean {
  const tags = EQUIPMENT_TAGS_PER_EXERCISE[exerciseName];
  if (!tags) return true; // unknown → assume available
  return tags.some((tag) => {
    const requires = EQUIPMENT_REQUIRES[tag];
    return !requires || requires.includes(equipmentLevel);
  });
}

// ANCHOR_EXTRA_PENALTY has been removed.
//
// The old per-exercise hardcoded suppression table (Back Squat: -2.5, BSS: -2.5,
// Zercher: -2.0, etc.) caused a penalty treadmill: penalise one winner → next
// runner-up becomes the new repeated winner → patch it too → system becomes
// hard to reason about and fights the newer family-rotation logic.
//
// Repetition is now prevented architecturally:
//   • BlockExposureTracker: same exercise cannot repeat the same slot week-over-week
//   • phaseAffinityFit: phase drives which FAMILY MEMBER wins (not Back Squat)
//   • movementClusterPenalty: cross-family pattern saturation
//   • slotRepeatPenalty + contrastPenalty: soft cross-build guardrails

// ─── Phase Exercise Affinity ──────────────────────────────────────────────────
//
// Maps "phase:exerciseName" → score bonus.
//
// Purpose: make week role change WHICH family member is chosen, not just
// the sets/reps.  Example: the "bilateral squat" family should express as:
//   Establish → Belt Squat / Safety Bar (teachable, moderate axial load)
//   Build     → Back Squat / Front Squat (progressive loading)
//   Intensify → Pause Back Squat / Zercher (peak-force intent)
//   Deload    → Belt Squat / Goblet Squat (zero axial compression)
//
// These bonuses are additive on top of all existing scoring dimensions.
// They are intentionally NOT large enough to override a sport-fit or
// equipment-fit mismatch — they only shift the tie-break inside the family.

const PHASE_EXERCISE_AFFINITY: Record<string, number> = {
  // ── Bilateral Squat — Phase Expressions ───────────────────────────────────
  // Establish: teachable, stable, moderate complexity
  // Belt Squat excluded — specialty machine not found in most gyms.
  "establish:Belt Squat":                                   -5.0,
  "establish:Safety Bar Squat":                             1.5,
  "establish:Goblet Squat (heavy)":                         1.5,
  "establish:Heel-Elevated Goblet Squat":                   1.0,
  "establish:Back Squat":                                   1.0,
  "establish:Trap Bar Deadlift (squat-mode, low handles)":  1.0,
  "establish:Box Squat":                                    0.5,

  // Build: progressive, demand-increasing
  "build:Back Squat":                                       1.5,
  "build:Front Squat":                                      1.5,
  "build:Safety Bar Squat":                                 1.0,
  "build:Cambered Bar Squat":                               1.0,
  "build:Hatfield Squat":                                   1.0,
  "build:Belt Squat":                                       0.5,

  // Intensify: highest-force / highest-intent
  "intensify:Pause Back Squat":                             2.0,
  "intensify:Front Squat":                                  1.5,
  "intensify:Zercher Squat":                                1.5,
  "intensify:Low-Bar Back Squat":                           1.5,
  "intensify:Hatfield Squat":                               1.0,
  "intensify:Tempo Back Squat (3-1-1)":                     1.0,

  // Deload: low axial load, joint-friendly, technique maintenance only
  // Belt Squat excluded — specialty machine not found in most gyms.
  "deload:Belt Squat":                                      -5.0,
  "deload:Goblet Squat (heavy)":                            2.5,
  "deload:Heel-Elevated Goblet Squat":                      2.0,
  "deload:Box Squat":                                       1.5,
  "deload:Safety Bar Squat":                                1.0,
  "deload:Heel-Elevated Back Squat":                        1.0,

  // ── Bilateral Hinge — Phase Expressions ──────────────────────────────────
  "establish:Romanian Deadlift":                            2.0,
  "establish:Dumbbell Romanian Deadlift":                   1.5,
  "establish:Hip Thrust (barbell)":                         1.5,
  "establish:Trap Bar Deadlift":                            1.0,
  "establish:Hex Bar RDL":                                  1.0,

  "build:Romanian Deadlift (heavy)":                        1.5,
  "build:Conventional Deadlift":                            1.5,
  "build:Sumo Deadlift":                                    1.0,
  "build:Trap Bar Deadlift":                                1.0,
  "build:Stiff-Leg Deadlift":                               1.0,

  "intensify:Conventional Deadlift":                        2.0,
  "intensify:Sumo Deadlift":                                1.5,
  "intensify:Snatch-Grip Deadlift":                         1.5,
  "intensify:Rack Pull (from knee)":                        1.0,
  "intensify:Romanian Deadlift (heavy)":                    1.0,

  "deload:Dumbbell Romanian Deadlift":                      2.5,
  "deload:Good Morning":                                    2.0,
  "deload:Hip Thrust (barbell)":                            1.5,
  "deload:Hex Bar RDL":                                     1.5,
  "deload:Romanian Deadlift":                               1.0,

  // ── Lower Power / Explosive — Phase Expressions ──────────────────────────
  "establish:Broad Jump":                                   1.5,
  "establish:Standing Long Jump":                           1.5,
  "establish:Box Jump (step-down)":                         1.0,
  "establish:Med-Ball Scoop Toss":                          1.0,
  "establish:Lateral Bound":                                1.0,

  "build:Trap Bar Jump":                                    2.0,
  "build:Box Jump":                                         1.5,
  "build:Broad Jump":                                       1.0,
  "build:Bounding":                                         1.0,
  "build:Reactive Bound":                                   1.0,

  "intensify:Depth Jump":                                   2.0,
  "intensify:Trap Bar Jump":                                2.0,
  "intensify:Loaded Jump":                                  1.5,
  "intensify:Reactive Bound":                               1.5,

  "deload:Pogo Hops":                                       2.0,
  "deload:Ankle Stiffness Drill":                           2.0,
  "deload:Box Jump (step-down)":                            1.5,
  "deload:Med-Ball Scoop Toss":                             1.5,
  "deload:Standing Long Jump":                              1.0,

  // ── Unilateral Lower — Phase Expressions ──────────────────────────────────
  "establish:Reverse Lunge":                                2.0,
  "establish:Walking Lunge (weighted)":                     1.5,
  "establish:Lateral Lunge":                                1.5,
  "establish:Step-Up with Knee Drive":                      1.0,
  "establish:Step-Up (front, loaded)":                      1.0,

  "build:Bulgarian Split Squat":                            1.5,
  "build:Rear-Foot Elevated Split Squat (RFESS)":           1.5,
  "build:Deficit Reverse Lunge":                            1.0,
  "build:Elevated Split Squat (barbell)":                   1.0,
  "build:Lateral Step-Up":                                  0.5,

  "intensify:Rear-Foot Elevated Split Squat (RFESS)":       2.0,
  "intensify:Bulgarian Split Squat":                        1.5,
  "intensify:Single-Leg Squat to Box":                      1.5,
  "intensify:Deficit Reverse Lunge":                        1.0,

  "deload:Reverse Lunge":                                   2.0,
  "deload:Lateral Lunge":                                   2.0,
  "deload:Cossack Squat":                                   2.0,
  "deload:Heel-Elevated Goblet Split Squat":                1.5,
  "deload:Walking Lunge (weighted)":                        1.0,

  // ── Unilateral Hinge — Phase Expressions ──────────────────────────────────
  // Establish: teachable, lower stability demand, pattern distinct from bilateral
  // RDL (Single-Leg Hip Thrust, Kickstand RDL feel nothing like a bilateral RDL
  // to the athlete, even if they share the same posterior-chain intent).
  "establish:Kickstand RDL":                                2.0,
  "establish:Single-Leg Hip Thrust":                        2.0,
  "establish:Single-Leg Deadlift (KB)":                     1.5,
  "establish:Single-Leg Good Morning":                      0.5,

  // Build: standard SLRDL appropriate once athletes are established
  "build:Single-Leg Romanian Deadlift":                     2.0,
  "build:Single-Leg Deadlift (KB)":                         1.5,
  "build:Single-Leg Hip Thrust":                            1.0,
  "build:Kickstand RDL":                                    0.5,

  // Intensify: maximal posterior-chain neural demand
  "intensify:Nordics (Nordic Hamstring Curl)":              2.5,
  "intensify:Single-Leg Romanian Deadlift":                 1.5,
  "intensify:Single-Leg Good Morning":                      1.5,
  "intensify:Glute-Ham Raise":                              1.0,

  // Deload: lowest load, different-feeling pattern from any heavy bilateral hinge
  "deload:Single-Leg Hip Thrust":                           2.5,
  "deload:Kickstand RDL":                                   2.0,
  "deload:Hip Hinge to Single-Leg RDL":                     1.5,
  "deload:Single-Leg Deadlift (KB)":                        1.0,
};

// ─── Per-candidate seed utilities ─────────────────────────────────────────────
//
// The old seedTiebreaker used (seed * slotPrime * constant) which produces the
// SAME scalar for every candidate in a slot — a no-op for ranking.
// These functions mix the candidate name (or slot name) into the hash so each
// candidate gets a genuinely unique tiebreaker value.

/** Deterministic [0, 1) hash unique per (seed, candidateName, slotPrime). */
function candidateHash(seed: number, candidateName: string, slotPrimeMultiplier: number): number {
  let h = ((Math.floor(seed * 10_000_000)) ^ Math.floor(slotPrimeMultiplier * 1000)) >>> 0;
  for (let i = 0; i < candidateName.length; i++) {
    h = ((h * 31) + candidateName.charCodeAt(i)) >>> 0;
  }
  return (h % 100000) / 100000;
}

/** Deterministic [0, 1) needle for the softmax draw — unique per (seed, slotName, primeMultiplier). */
function slotSeedNeedle(seed: number, slotName: string, primeMultiplier: number): number {
  let h = (Math.floor(seed * 13_000_000) ^ Math.floor(primeMultiplier * 997)) >>> 0;
  for (let i = 0; i < slotName.length; i++) {
    h = ((h * 37) + slotName.charCodeAt(i)) >>> 0;
  }
  return (h % 100000) / 100000;
}

function scoreCandidate(
  meta: ExerciseMeta,
  ctx: ScoreContext,
  slotPrimeMultiplier: number,
): CandidateScore {
  const sport = ctx.sport?.toLowerCase() ?? "";
  const targetNeuralLevel = NEURAL_ORDER[ctx.sessionIntent.includes("power") || ctx.sessionIntent.includes("speed") ? "high" : "moderate"];

  // ── Sport fit (0–4) ────────────────────────────────────────────────────────
  let sportFit = 0;
  if (sport && meta.sportTags.length > 0) {
    const matches = meta.sportTags.filter((tag) => sport.includes(tag) || tag.includes(sport)).length;
    sportFit = Math.min(4, matches * 2);
  }

  // ── Intent fit (0–3) ──────────────────────────────────────────────────────
  const intentMatches = ctx.sessionIntent.filter((i) => meta.intentTags.includes(i)).length;
  const intentFit = Math.min(3, intentMatches * 1.5);

  // ── Neural demand fit (0–2) ────────────────────────────────────────────────
  const actualNeuralLevel = NEURAL_ORDER[meta.neuralDemand] ?? 1;
  const neuralFit = actualNeuralLevel >= targetNeuralLevel ? 2 : 1;

  // ── Equipment fit (0–1) ───────────────────────────────────────────────────
  const equipFit = hasEquipment(meta.name, ctx.equipmentLevel) ? 1 : -3;

  // ── Novelty bonus (flat soft tiebreaker) ─────────────────────────────────
  // Previously: isDefaultAnchor flag applied -2.5 to -12+ penalty, and
  // ANCHOR_EXTRA_PENALTY table added up to -3.0 more per exercise.
  // Removed: repetition prevention is now architectural (BlockExposureTracker,
  // phaseAffinityFit, movementClusterPenalty). The noveltyBonus is now a
  // flat +0.5 for ALL exercises — a small tiebreaker that doesn't steer decisions.
  const noveltyBonus = 0.5;
  const anchorPenalty = 0; // kept in breakdown for log compatibility

  // ── Fatigue penalty ───────────────────────────────────────────────────────
  let fatiguePenalty = 0;
  const slotLowFatigue = ctx.slotIntent?.targetFatigueCost === "low" || ctx.lowFatigue;
  const slotModerateFatigue = ctx.slotIntent?.targetFatigueCost === "moderate";
  if (slotLowFatigue && FATIGUE_ORDER[meta.fatigueCost] === 2) {
    fatiguePenalty = 2;
  } else if (slotLowFatigue && FATIGUE_ORDER[meta.fatigueCost] === 1) {
    fatiguePenalty = 1;
  } else if (slotModerateFatigue && FATIGUE_ORDER[meta.fatigueCost] === 2) {
    fatiguePenalty = 0.5;
  }

  // ── Overuse penalty (0–2, demoted) ───────────────────────────────────────
  // Formerly: 1.2× scale, cap -6. Demoted to a very soft long-tail signal.
  // BlockExposureTracker is the primary intra-block anti-repeat gate.
  // This signal only provides a gentle cross-build recency signal for exercises
  // that have appeared in many of the last 20 builds.
  const usageCount = getOveruseCount(meta.name);
  const overusePenalty = Math.min(2.0, usageCount * 0.4);

  // ── Contrast penalty (0–3) ────────────────────────────────────────────────
  const contrastPenalty = getContrastPenalty(meta.name);

  // ── Exact repeat penalty (0–5) ────────────────────────────────────────────
  const exactRepeatPenalty = ctx.alreadySelected.has(meta.name) ? 5 : 0;

  // ── Per-slot repeat penalty (0–7.5) ──────────────────────────────────────
  // Penalises choosing the same exercise in the same slot as a recent build.
  // Much sharper than the global contrast penalty — this is what makes the user
  // see a different "first explosive" or "primary squat" across generations.
  const slotRepeatPenalty = getSlotRepeatPenalty(ctx.slotName, meta.name);

  // recentUsePenalty has been removed.
  // It was a -2.5 flat penalty for any exercise used in the last 5 builds.
  // Now superseded by: blockExposurePenalty (primary), contrastPenalty (soft),
  // slotRepeatPenalty (soft, per-slot). Retaining it would over-penalise
  // exercises that legitimately belong in a new block.
  const recentUsePenalty = 0; // kept at 0 for log schema compatibility

  // ── Movement cluster penalty (-1.5 per same-family exercise in this build) ─
  // Within the current build's alreadySelected set, count exercises that share
  // the same movement family OR the same equivalence cluster as this candidate.
  // Each match adds -1.5, capped at -3.0.
  //
  // The equivalence-cluster check is the cross-family saturation gate:
  // "Romanian Deadlift" (family: heavy_bilateral_hinge, cluster: rdl-pattern)
  // and "Single-Leg Romanian Deadlift" (family: unilateral_hinge, cluster:
  // rdl-pattern) are different families, but share a movement pattern. If
  // bilateral RDL was already selected, SLRDL will receive -1.5 here and the
  // unilateral hinge slot will prefer Single-Leg Hip Thrust or Nordic Curl.
  const movementClusterPenalty = (() => {
    if (ctx.alreadySelected.size === 0) return 0;
    const candidateFamily  = getExerciseExtendedMeta(meta.name).family;
    const candidateCluster = getEquivalenceCluster(meta.name);
    const sameClusterCount = [...ctx.alreadySelected].filter((n) => {
      const alreadyMeta = getExerciseExtendedMeta(n);
      if (alreadyMeta.family === candidateFamily) return true;
      // Cross-family cluster overlap: penalise same-pattern exercises even when
      // they live in different slot families (e.g. bilateral vs unilateral RDL).
      if (candidateCluster !== "unclassified") {
        const alreadyCluster = getEquivalenceCluster(n);
        if (alreadyCluster === candidateCluster) return true;
      }
      return false;
    }).length;
    return Math.min(3.0, sameClusterCount * 1.5);
  })();

  // ── Cluster alternative bonus (+1.5) ──────────────────────────────────────
  // Fires when the last exercise chosen for THIS SLOT was from the same
  // equivalence cluster as the candidate AND the candidate is a different
  // exercise.  Example: if "Back Squat" won the bilateral_squat_strength slot
  // last build, every other "bilateral-squat" cluster member (Safety Bar Squat,
  // Front Squat, Belt Squat, etc.) gets +1.5 next build.
  // "I need a squat — pick a DIFFERENT squat than last time."
  const clusterAlternativeBonus = (() => {
    const candidateCluster = getEquivalenceCluster(meta.name);
    if (candidateCluster === "unclassified") return 0;
    const slotHistory = SLOT_CONTRAST_REGISTRY[ctx.slotName];
    if (!slotHistory || slotHistory.length === 0) return 0;
    const lastSlotExercise = slotHistory[slotHistory.length - 1];
    if (lastSlotExercise === meta.name) return 0; // already penalised by slotRepeatPenalty
    const lastCluster = getEquivalenceCluster(lastSlotExercise);
    return lastCluster === candidateCluster ? 1.5 : 0;
  })();

  // ── Seed tiebreaker (0–1.5, per-candidate) ────────────────────────────────
  // Previous formula: (seed * slotPrime * constant) — produces the SAME value
  // for every candidate in the slot (no-op tiebreaker). Fixed: mix meta.name
  // so each candidate gets a unique hash-derived float in [0, 1.5).
  const seedTiebreaker = candidateHash(ctx.seed, meta.name, slotPrimeMultiplier) * 1.5;

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Block Variation Engine extended scoring dimensions ─────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const exMeta = getExerciseExtendedMeta(meta.name);
  const exerciseFamily = exMeta.family;
  const profile = ctx.programContext;
  const weights = profile?.blockSpecificRankingWeights;

  // ── Block archetype fit (−3 to +3) ────────────────────────────────────────
  let blockArchetypeFit = 0;
  if (profile) {
    const archetype = profile.blockArchetype;
    const intentSet = new Set(meta.intentTags);
    if (archetype === "INTENSIFICATION_STRENGTH") {
      if (intentSet.has("strength")) blockArchetypeFit += 2;
      if (exMeta.velocityIntent === "slow_grind") blockArchetypeFit += 0.5;
      if (intentSet.has("endurance")) blockArchetypeFit -= 1.5;
    } else if (archetype === "POWER_ELASTIC_CONVERSION") {
      if (intentSet.has("elastic") || intentSet.has("speed")) blockArchetypeFit += 2.5;
      if (intentSet.has("power")) blockArchetypeFit += 1.5;
      if (exMeta.velocityIntent === "explosive" || exMeta.velocityIntent === "ballistic") blockArchetypeFit += 1;
      if (exMeta.velocityIntent === "slow_grind" && meta.fatigueCost === "high") blockArchetypeFit -= 2;
    } else if (archetype === "FOUNDATION_ACCUMULATION") {
      if (intentSet.has("hypertrophy")) blockArchetypeFit += 1.5;
      if (intentSet.has("strength")) blockArchetypeFit += 1;
      if (intentSet.has("stability")) blockArchetypeFit += 0.5;
      if (exerciseFamily === "elastic_reactive" || exerciseFamily === "plyometric") blockArchetypeFit -= 1;
    } else if (archetype === "REBUILD_DELOAD") {
      if (intentSet.has("stability") || intentSet.has("mobility")) blockArchetypeFit += 2.5;
      if (meta.fatigueCost === "low") blockArchetypeFit += 1.5;
      if (meta.neuralDemand === "high") blockArchetypeFit -= 2.5;
      if (exMeta.complexity === "complex") blockArchetypeFit -= 1.5;
    }
    blockArchetypeFit *= (weights?.blockArchetypeFitWeight ?? 1);
    blockArchetypeFit = Math.max(-3, Math.min(3, blockArchetypeFit));
  }

  // ── Current phase fit (−1 to +2) ──────────────────────────────────────────
  let currentPhaseFit = 0;
  if (profile) {
    const phase = profile.currentPhase;
    if (phase === "intensify") {
      if (meta.neuralDemand === "high") currentPhaseFit += 1.5;
      if (meta.fatigueCost === "low" && !meta.intentTags.includes("power")) currentPhaseFit -= 0.5;
    } else if (phase === "build") {
      if (meta.fatigueCost === "high") currentPhaseFit += 0.5;
    } else if (phase === "deload" || phase === "establish") {
      if (meta.fatigueCost === "low") currentPhaseFit += 1;
      if (meta.neuralDemand === "low") currentPhaseFit += 0.5;
      if (meta.fatigueCost === "high" && phase === "deload") currentPhaseFit -= 1.5;
    }
    currentPhaseFit = Math.max(-1, Math.min(2, currentPhaseFit));
  }

  // ── Slot intent fit (−2 to +2) ────────────────────────────────────────────
  let slotIntentFit = 0;
  if (ctx.slotIntent) {
    const si = ctx.slotIntent;
    const slotNeuralLevel = NEURAL_ORDER[si.targetNeuralDemand] ?? 1;
    const exNeuralLevel = NEURAL_ORDER[meta.neuralDemand] ?? 1;
    if (exNeuralLevel === slotNeuralLevel) slotIntentFit += 0.5;
    else if (Math.abs(exNeuralLevel - slotNeuralLevel) > 1) slotIntentFit -= 0.5;
    if (si.targetVelocityIntent === "explosive" || si.targetVelocityIntent === "ballistic") {
      if (exMeta.velocityIntent === "explosive" || exMeta.velocityIntent === "ballistic") slotIntentFit += 1;
      else if (exMeta.velocityIntent === "slow_grind") slotIntentFit -= 0.5;
    } else if (si.targetVelocityIntent === "slow_grind") {
      if (exMeta.velocityIntent === "slow_grind") slotIntentFit += 0.5;
      else if (exMeta.velocityIntent === "explosive") slotIntentFit -= 0.5;
    }
    if (si.preferredFamilies.includes(exerciseFamily)) slotIntentFit += 1;
    if (si.disallowedFamilies.includes(exerciseFamily)) slotIntentFit -= 2;
    if (si.reducedFamilies.includes(exerciseFamily)) slotIntentFit -= 0.5;
    slotIntentFit *= (weights?.slotIntentFitWeight ?? 1);
    slotIntentFit = Math.max(-2, Math.min(2, slotIntentFit));
  }

  // ── Movement bias fit (0 to +2) ───────────────────────────────────────────
  let movementBiasFit = 0;
  if (profile?.movementBiases?.length) {
    const biasSet = new Set(profile.movementBiases.map((b) => b.toLowerCase()));
    if (biasSet.has(exerciseFamily) || meta.intentTags.some((t) => biasSet.has(t))) {
      movementBiasFit = Math.min(2, 1.5 * (weights?.movementBiasFitWeight ?? 1));
    }
  }

  // ── Family bias (preference, reduction, disallowed) ───────────────────────
  let familyPreferenceFit = 0;
  let familyReductionPenalty = 0;
  let disallowedFamilyPenalty = 0;
  if (ctx.familyBiases) {
    const biasScore = getFamilyBiasScore(ctx.familyBiases, exerciseFamily);
    if (biasScore > 0) familyPreferenceFit = Math.min(2, biasScore * (weights?.familyPreferenceFitWeight ?? 1));
    else if (biasScore < -4) disallowedFamilyPenalty = Math.min(6, Math.abs(biasScore));
    else if (biasScore < 0) familyReductionPenalty = Math.min(2, Math.abs(biasScore));
  }

  // ── Velocity intent fit (0 to +1.5) ──────────────────────────────────────
  let velocityIntentFit = 0;
  if (ctx.slotIntent) {
    const targetVel = ctx.slotIntent.targetVelocityIntent;
    const exVel = exMeta.velocityIntent;
    if (targetVel === exVel) velocityIntentFit = 1 * (weights?.velocityIntentFitWeight ?? 1);
    else if ((targetVel === "explosive" && exVel === "ballistic") || (targetVel === "ballistic" && exVel === "explosive")) {
      velocityIntentFit = 0.5 * (weights?.velocityIntentFitWeight ?? 1);
    }
    velocityIntentFit = Math.min(1.5, velocityIntentFit);
  }

  // ── Stability demand fit (0 to +0.5) ─────────────────────────────────────
  let stabilityDemandFit = 0;
  if (ctx.slotIntent) {
    const STAB_ORDER: Record<string, number> = { low: 0, moderate: 1, high: 2 };
    const diff = Math.abs((STAB_ORDER[ctx.slotIntent.targetStabilityDemand] ?? 1) - (STAB_ORDER[exMeta.stabilityDemand] ?? 1));
    stabilityDemandFit = diff === 0 ? 0.5 : 0;
  }

  // ── Complexity penalty (0 to −3) ─────────────────────────────────────────
  let complexityPenalty = 0;
  if (ctx.slotIntent) {
    if (ctx.slotIntent.complexityLimit === "low") {
      if (exMeta.complexity === "complex") complexityPenalty = 2.5 * (weights?.complexityPenaltyWeight ?? 1);
      else if (exMeta.complexity === "moderate") complexityPenalty = 1 * (weights?.complexityPenaltyWeight ?? 1);
    } else if (ctx.slotIntent.complexityLimit === "moderate" && exMeta.complexity === "complex") {
      complexityPenalty = 1 * (weights?.complexityPenaltyWeight ?? 1);
    }
    complexityPenalty = Math.min(3, complexityPenalty);
  }

  // ── Progression style fit (0 to +0.5) ────────────────────────────────────
  let progressionStyleFit = 0;
  if (profile?.progressionStyle === "wave_load" && exMeta.complexity !== "simple") progressionStyleFit = 0.3;
  else if (profile?.progressionStyle === "linear" && exMeta.complexity === "simple") progressionStyleFit = 0.3;

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Agent Control Layer scoring dimensions ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  // These dimensions are applied AFTER block/phase scoring and AFTER novelty
  // scoring. They represent explicit agent steering, not engine defaults.
  // They are always logged in DEV audit output.

  const agentControls = ctx.resolvedAgentControls;

  // ── Hero Suppression Penalty (0 to −12) ───────────────────────────────────
  // Penalises exercises the agent has explicitly targeted for suppression.
  // Scale: strength=0.7 → ~7pts, strength=1.0 → 10pts (capped at 12 with multiplier).
  let heroSuppressionPenalty = 0;
  if (agentControls) {
    const suppPenalty = agentControls.resolvedHeroSuppressionPenalties[meta.name];
    if (suppPenalty) {
      heroSuppressionPenalty = Math.min(12, suppPenalty);
    }

    // Also amplify anchor penalty based on mode
    // e.g. high_variance mode doubles normal anchor penalties
    if (meta.isDefaultAnchor) {
      const modeMult = getAnchorPenaltyMultiplierForMode(agentControls.resolvedGenerationMode);
      // The existing anchorPenalty was computed with noveltyPressureMultiplier.
      // Here we apply an *additional* mode-based delta beyond the existing anchor calc.
      // We cap it to avoid double-counting with the already-applied anchorPenalty.
      const modeBoostFraction = modeMult - 1.0; // 0.0 for default, 0.4 for explore, 1.0 for high_variance
      if (modeBoostFraction > 0) {
        heroSuppressionPenalty = Math.min(12, heroSuppressionPenalty + anchorPenalty * modeBoostFraction * 0.5);
      }
    }
  }

  // ── Control Family Boost Fit (0 to +3) ────────────────────────────────────
  // Separate from familyPreferenceFit — this is the agent-layer boost on top.
  let controlFamilyBoostFit = 0;
  if (agentControls) {
    const delta = agentControls.resolvedFamilyBiasOverrides[exerciseFamily] ?? 0;
    if (delta > 0) {
      controlFamilyBoostFit = Math.min(3, delta * 0.5);
    }
  }

  // ── Control Family Reduction Penalty (0 to −3) ────────────────────────────
  // Separate from familyReductionPenalty — this is agent-driven, logged independently.
  let controlFamilyReductionPenalty = 0;
  if (agentControls) {
    const delta = agentControls.resolvedFamilyBiasOverrides[exerciseFamily] ?? 0;
    if (delta < 0 && delta > -10) {
      // Not a hard ban — soft reduction only
      controlFamilyReductionPenalty = Math.min(3, Math.abs(delta) * 0.4);
    }
  }

  // ── Visible Spine Alignment Fit (−1 to +1) ───────────────────────────────
  // Penalises exercises that would reinforce avoided visible-spine patterns.
  // Rewards exercises that align with prioritized visible-spine patterns.
  // Uses family membership as a proxy for pattern contribution.
  let visibleSpineAlignmentFit = 0;
  if (agentControls?.resolvedVisibleSpineRules.enabled) {
    const rules = agentControls.resolvedVisibleSpineRules;
    const strength = rules.strength;

    // Families associated with "grindy" patterns: penalise when those patterns are avoided
    const GRINDY_FAMILIES = new Set(["heavy_bilateral_squat", "heavy_bilateral_hinge"]);
    const REACTIVE_FAMILIES = new Set(["elastic_reactive", "plyometric", "ballistic"]);
    const UNILATERAL_FAMILIES = new Set(["unilateral_squat", "unilateral_hinge"]);

    const isGrindy = GRINDY_FAMILIES.has(exerciseFamily);
    const isReactive = REACTIVE_FAMILIES.has(exerciseFamily);
    const isUnilateral = UNILATERAL_FAMILIES.has(exerciseFamily);

    for (const pattern of rules.avoidPatterns) {
      if (
        (pattern.includes("grindy") && isGrindy) ||
        (pattern.includes("bilateral_force") && isGrindy)
      ) {
        visibleSpineAlignmentFit -= 0.8 * strength;
      }
    }
    for (const pattern of rules.prioritizePatterns) {
      if (
        (pattern.includes("reactive") && isReactive) ||
        (pattern.includes("elastic") && isReactive) ||
        (pattern.includes("unilateral") && isUnilateral) ||
        (pattern.includes("jump") && isReactive)
      ) {
        visibleSpineAlignmentFit += 0.8 * strength;
      }
    }
    visibleSpineAlignmentFit = Math.max(-1, Math.min(1, visibleSpineAlignmentFit));
  }

  // ── Day Identity Alignment Fit (−1 to +1) ────────────────────────────────
  // Scores exercises against day-level identity overrides (neural, fatigue, velocity).
  // This is the control-layer complement to slotIntentFit.
  let dayIdentityAlignmentFit = 0;
  if (agentControls && ctx.dayIndex !== undefined) {
    const dayOverride = agentControls.resolvedDayIdentityTargets[ctx.dayIndex];
    if (dayOverride) {
      if (dayOverride.targetNeuralDemand) {
        const targetNeural = NEURAL_ORDER[dayOverride.targetNeuralDemand] ?? 1;
        const exNeural = NEURAL_ORDER[meta.neuralDemand] ?? 1;
        if (exNeural === targetNeural) dayIdentityAlignmentFit += 0.5;
        else if (Math.abs(exNeural - targetNeural) > 1) dayIdentityAlignmentFit -= 0.5;
      }
      if (dayOverride.targetFatigue) {
        const targetFat = FATIGUE_ORDER[dayOverride.targetFatigue] ?? 1;
        const exFat = FATIGUE_ORDER[meta.fatigueCost] ?? 1;
        if (exFat === targetFat) dayIdentityAlignmentFit += 0.3;
        else if (Math.abs(exFat - targetFat) > 1) dayIdentityAlignmentFit -= 0.3;
      }
      if (dayOverride.avoidFamilies?.includes(exerciseFamily)) {
        dayIdentityAlignmentFit -= 0.8;
      }
      dayIdentityAlignmentFit = Math.max(-1, Math.min(1, dayIdentityAlignmentFit));
    }
  }

  // ── Control Novelty Bonus (0 to +2) ──────────────────────────────────────
  // Adds novelty reward for non-anchors when explore/high_variance mode is active.
  let controlNoveltyBonus = 0;
  if (agentControls && !meta.isDefaultAnchor) {
    const mode = agentControls.resolvedGenerationMode;
    if (mode === "high_variance") controlNoveltyBonus = 2.0;
    else if (mode === "explore") controlNoveltyBonus = 1.0;
  }

  // ── Control Novelty Penalty (0 to −1) ─────────────────────────────────────
  // Reduces novelty bonus for non-anchors in conservative mode.
  let controlNoveltyPenalty = 0;
  if (agentControls) {
    const mode = agentControls.resolvedGenerationMode;
    if (mode === "conservative" && !meta.isDefaultAnchor) {
      // Don't over-penalise non-anchors in conservative mode, just reduce their bonus
      controlNoveltyPenalty = 0.5;
    }
  }

  // ── Block Exposure Penalty (0 to −14) ────────────────────────────────────
  // Core intra-block rotation gate. Fires when this exact exercise has already
  // been used in THIS SAME SLOT in a prior week of the current 4-week block.
  // This is the primary mechanism replacing penalty-only winner logic:
  // after an exercise wins once, it is hard-suppressed for the remaining weeks
  // unless it genuinely outscores all other candidates by a large margin.
  //
  //   count = 1 (used once this block):   -5.0  — soft discouragement
  //   count = 2 (used twice this block):  -9.0  — near-hard ban
  //   count ≥ 3 (used 3+ times):          -14.0 — hard ban
  let blockExposurePenalty = 0;
  if (ctx.blockExposure) {
    const count = ctx.blockExposure.getCount(ctx.slotName, meta.name);
    if (count >= 3) blockExposurePenalty = 14.0;
    else if (count === 2) blockExposurePenalty = 9.0;
    else if (count === 1) blockExposurePenalty = 5.0;
  }

  // ── Phase Affinity Fit (0 to +2.5) ────────────────────────────────────────
  // Boosts exercises that are the ideal expression of their movement family
  // during the current training phase.  Makes week role change WHICH family
  // member is chosen — not just the sets/reps.
  // Example: "deload:Belt Squat" = +2.5 so Belt Squat rises over Back Squat
  // when the program context is a deload week.
  let phaseAffinityFit = 0;
  if (profile?.currentPhase) {
    const affinityKey = `${profile.currentPhase}:${meta.name}`;
    const rawBonus = PHASE_EXERCISE_AFFINITY[affinityKey] ?? 0;
    phaseAffinityFit = Math.min(2.5, rawBonus);
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  //
  // New decision hierarchy (read top-to-bottom = highest priority first):
  //
  //   PRIMARY positive selectors (steer WHICH exercise wins):
  //     phaseAffinityFit      (+0 to +2.5)  phase-appropriate family member
  //     sportFit              (+0 to +4)    sport-specific preference
  //     blockArchetypeFit     (−3 to +3)    block intent alignment
  //     intentFit             (+0 to +3)    session intent match
  //     slotIntentFit         (−2 to +2)    slot-level context match
  //     currentPhaseFit       (−1 to +2)    phase fatigue/neural match
  //     clusterAlternativeBonus (+1.5)      cross-build cluster rotation bonus
  //
  //   PRIMARY rotation gates (prevent same exercise repeating):
  //     blockExposurePenalty  (−5 / −9 / −14)  intra-block: same slot, prior weeks
  //     movementClusterPenalty (−1.5 to −3)     same-week: cross-family saturation
  //
  //   GUARDRAILS (true hard/soft constraints):
  //     equipFit              (−3 hard)     equipment not available
  //     exactRepeatPenalty    (−5 hard)     same exercise already in this build
  //     fatiguePenalty        (−0.5 to −2)  fatigue mismatch for slot
  //     complexityPenalty     (−1 to −3)    complexity limit mismatch
  //     disallowedFamilyPenalty (−6)        disallowed family
  //     heroSuppressionPenalty (−12 max)    agent-controlled suppression
  //
  //   SOFT TIEBREAKERS (cross-build memory, low magnitude):
  //     contrastPenalty       (−0.75 to −1.5)  last 2 builds (demoted)
  //     slotRepeatPenalty     (−0.75 to −3.75) same slot last 3 builds (demoted)
  //     overusePenalty        (0 to −2)         20-build frequency (demoted)
  //     noveltyBonus          (+0.5 flat)        universal soft tiebreaker
  //
  const total = sportFit + intentFit + neuralFit + equipFit + noveltyBonus
    - fatiguePenalty - overusePenalty - contrastPenalty - exactRepeatPenalty - slotRepeatPenalty
    - movementClusterPenalty + clusterAlternativeBonus
    + seedTiebreaker
    + blockArchetypeFit + currentPhaseFit + slotIntentFit + movementBiasFit
    + familyPreferenceFit + velocityIntentFit + stabilityDemandFit + progressionStyleFit
    - familyReductionPenalty - disallowedFamilyPenalty - complexityPenalty
    // Agent Control Layer dimensions
    - heroSuppressionPenalty
    + controlFamilyBoostFit - controlFamilyReductionPenalty
    + visibleSpineAlignmentFit
    + dayIdentityAlignmentFit
    + controlNoveltyBonus - controlNoveltyPenalty
    // PRIMARY: family rotation system
    - blockExposurePenalty
    + phaseAffinityFit;

  return {
    name: meta.name,
    score: total,
    breakdown: {
      sportFit,
      intentFit,
      neuralFit,
      equipFit,
      noveltyBonus,
      fatiguePenalty,
      overusePenalty,
      contrastPenalty,
      exactRepeatPenalty,
      seedTiebreaker,
      recentUsePenalty,
      movementClusterPenalty,
      clusterAlternativeBonus,
      blockArchetypeFit,
      currentPhaseFit,
      slotIntentFit,
      movementBiasFit,
      familyPreferenceFit,
      familyReductionPenalty,
      disallowedFamilyPenalty,
      velocityIntentFit,
      stabilityDemandFit,
      complexityPenalty,
      progressionStyleFit,
      anchorPenalty,
      slotRepeatPenalty,
      heroSuppressionPenalty,
      controlFamilyBoostFit,
      controlFamilyReductionPenalty,
      visibleSpineAlignmentFit,
      dayIdentityAlignmentFit,
      controlNoveltyBonus,
      controlNoveltyPenalty,
      blockExposurePenalty,
      phaseAffinityFit,
    },
  };
}

// ─── Top-K softmax constants ──────────────────────────────────────────────────
//
// Instead of always picking scored[0], we score all candidates, take the top
// CANDIDATE_WINDOW, and do a temperature-scaled softmax draw using a
// slot-specific seed needle. This means:
//
//   • High-scoring candidates still win most of the time (temperature controls this)
//   • Rank-2 through rank-5 candidates get meaningful chances when scores are close
//   • Different seed values → different draws from the SAME top-K pool → natural
//     build-over-build variation without sacrificing coaching correctness
//   • Overuse/contrast penalties now control who enters the top-K (the real gate)
//     rather than having to overcome a first-rank margin that may never happen
//
// Temperature interpretation (noveltyPressure ∈ [0, 1]):
//   noveltyPressure=0 → temperature=1.5 → rank-1 is ~7× more likely than rank-1+3pts-lower
//   noveltyPressure=1 → temperature=3.5 → same gap → ~2.4× — competitive field

const CANDIDATE_WINDOW = 10;
const SOFTMAX_TEMP_BASE = 1.5;
const SOFTMAX_TEMP_NOVELTY_SCALE = 2.0;
// biasTop: rank-position exponential decay multiplier applied on top of softmax weights.
// rank-0 → 1.000×, rank-1 → 0.861×, rank-2 → 0.741×, rank-5 → 0.472×, rank-9 → 0.259×
const BIAS_TOP_DECAY = 0.15;
// diversityBoost: weight multiplier for candidates from movement families not yet
// picked in this build. 1.4 = 40% boost — enough to overcome a small score gap.
const DIVERSITY_BOOST_MULT = 1.4;

// ─── weightedRandom ────────────────────────────────────────────────────────────
//
// Core selection primitive used by ranked(). Takes a pre-scored, pre-sorted
// top-K list and draws one candidate using a seed-deterministic draw with two
// optional modifiers:
//
//   biasTop      — apply exponential rank-position decay so higher-ranked
//                  candidates are inherently more likely, independent of their
//                  score gap. Provides a second layer of safety on top of the
//                  softmax weights.
//
//   diversityBoost — multiply the weight of any candidate whose movement FAMILY
//                  has not yet appeared among already-selected exercises. Pushes
//                  the engine toward varied movement families within a build
//                  without hard-filtering anything from the pool.
//
// The two modifiers compound: a rank-2 candidate from a new family gets
// softmax_weight × rank_decay(2) × DIVERSITY_BOOST_MULT. Combined, variety
// can overcome a moderate score gap but not a large one — coaching quality
// is preserved.

interface WeightedRandomOptions {
  biasTop: boolean;
  diversityBoost: boolean;
  temperature: number;
  /** Pre-computed [0,1) needle — deterministic for repeatability */
  needle: number;
  /** Already-selected exercise names; used for family-novelty check */
  alreadySelected: Set<string>;
}

interface WeightedRandomResult {
  chosenIndex: number;
  finalWeights: number[];
  diversityBoostedNames: string[];
  diversityFamiliesAlreadyUsed: string[];
}

function weightedRandom(
  topK: CandidateScore[],
  options: WeightedRandomOptions,
): WeightedRandomResult {
  const { biasTop, diversityBoost, temperature, needle, alreadySelected } = options;

  // Step 1 — numerically stable softmax base weights
  const minScore = topK[topK.length - 1]?.score ?? 0;
  let weights = topK.map((c) => Math.exp((c.score - minScore) / temperature));

  // Step 2 — biasTop: rank-position decay multiplier
  if (biasTop) {
    weights = weights.map((w, i) => w * Math.exp(-i * BIAS_TOP_DECAY));
  }

  // Step 3 — diversityBoost: family-novelty multiplier
  const diversityBoostedNames: string[] = [];
  const diversityFamiliesAlreadyUsed: string[] = [];
  if (diversityBoost && alreadySelected.size > 0) {
    const usedFamilies = new Set(
      [...alreadySelected].map((name) => getExerciseExtendedMeta(name).family),
    );
    diversityFamiliesAlreadyUsed.push(...usedFamilies);
    weights = weights.map((w, i) => {
      const family = getExerciseExtendedMeta(topK[i].name).family;
      if (!usedFamilies.has(family)) {
        diversityBoostedNames.push(topK[i].name);
        return w * DIVERSITY_BOOST_MULT;
      }
      return w;
    });
  }

  // Step 4 — seed-deterministic draw
  const total = weights.reduce((a, b) => a + b, 0);
  const drawAt = needle * total;
  let cumulative = 0;
  let chosenIndex = 0;
  for (let i = 0; i < topK.length; i++) {
    cumulative += weights[i];
    if (drawAt <= cumulative) {
      chosenIndex = i;
      break;
    }
  }

  return { chosenIndex, finalWeights: weights, diversityBoostedNames, diversityFamiliesAlreadyUsed };
}

function ranked(pool: ExerciseMeta[], ctx: ScoreContext, primeMultiplier: number): { chosen: string; debugInfo: SlotDebugInfo } {
  const scored = pool.map((m) => scoreCandidate(m, ctx, primeMultiplier));
  scored.sort((a, b) => b.score - a.score);

  // ── Top-K candidate window ────────────────────────────────────────────────
  const topK = scored.slice(0, Math.min(CANDIDATE_WINDOW, scored.length));
  const temperature = SOFTMAX_TEMP_BASE + (ctx.noveltyPressure ?? 0) * SOFTMAX_TEMP_NOVELTY_SCALE;

  // ── Seed needle — unique per (seed × slotName × primeMultiplier) ──────────
  const needle = slotSeedNeedle(ctx.seed, ctx.slotName, primeMultiplier);

  // ── Weighted random draw with biasTop + diversityBoost ───────────────────
  const { chosenIndex, diversityBoostedNames, diversityFamiliesAlreadyUsed } = weightedRandom(topK, {
    biasTop: true,
    diversityBoost: true,
    temperature,
    needle,
    alreadySelected: ctx.alreadySelected,
  });

  const softmaxRank = chosenIndex;
  const chosen = topK[chosenIndex]?.name ?? pool[0]?.name ?? "Back Squat";
  const chosenScore = scored.find((c) => c.name === chosen) ?? scored[0] ?? null;
  const top3 = scored.slice(0, 3);

  const debugInfo: SlotDebugInfo = {
    slot: ctx.slotName,
    poolSize: pool.length,
    top3,
    chosen,
    contextSport: ctx.sport,
    contextIntent: ctx.sessionIntent,
    softmaxRank,
    topKWindow: topK.length,
    softmaxNeedle: Number(needle.toFixed(4)),
    softmaxTemperature: Number(temperature.toFixed(2)),
    diversityBoostedNames,
    diversityFamiliesAlreadyUsed,
    biasTopDecayApplied: true,
  };

  if (process.env.NODE_ENV !== "production") {
    // ── Original audit log ────────────────────────────────────────────────
    console.log("[BuildAudit:Variation]", JSON.stringify({
      slot: ctx.slotName,
      sport: ctx.sport,
      poolSize: pool.length,
      topKWindow: topK.length,
      softmaxRank,
      softmaxTemperature: Number(temperature.toFixed(2)),
      biasTopApplied: true,
      diversityBoostedNames,
      diversityFamiliesAlreadyUsed,
      top5: scored.slice(0, 5).map((c) => ({
        name: c.name,
        score: Number(c.score.toFixed(2)),
        isDefaultAnchor: !!(pool.find((m) => m.name === c.name)?.isDefaultAnchor),
        breakdown: c.breakdown,
      })),
      chosen,
      chosenIsDefaultAnchor: !!(pool.find((m) => m.name === chosen)?.isDefaultAnchor),
      contrastPenaltyActive: LAST_BUILD_SELECTIONS.size > 0,
      lastBuildAnchors: [...LAST_BUILD_SELECTIONS].slice(0, 6),
    }));

    // ── Extended Block Variation Audit ────────────────────────────────────
    if (ctx.programContext && chosenScore) {
      const chosenExMeta = getExerciseExtendedMeta(chosen);

      // Build factor objects for top candidates
      const toFactors = (c: CandidateScore): ExerciseScoreBreakdown => ({
        exerciseName: c.name,
        totalScore: c.score,
        factors: {
          sportFit: c.breakdown.sportFit,
          intentFit: c.breakdown.intentFit,
          neuralFit: c.breakdown.neuralFit,
          equipFit: c.breakdown.equipFit,
          noveltyBonus: c.breakdown.noveltyBonus,
          fatiguePenalty: c.breakdown.fatiguePenalty,
          overusePenalty: c.breakdown.overusePenalty,
          contrastPenalty: c.breakdown.contrastPenalty,
          exactRepeatPenalty: c.breakdown.exactRepeatPenalty,
          seedTiebreaker: c.breakdown.seedTiebreaker,
          blockArchetypeFit: c.breakdown.blockArchetypeFit,
          currentPhaseFit: c.breakdown.currentPhaseFit,
          slotIntentFit: c.breakdown.slotIntentFit,
          movementBiasFit: c.breakdown.movementBiasFit,
          familyPreferenceFit: c.breakdown.familyPreferenceFit,
          familyReductionPenalty: c.breakdown.familyReductionPenalty,
          disallowedFamilyPenalty: c.breakdown.disallowedFamilyPenalty,
          velocityIntentFit: c.breakdown.velocityIntentFit,
          stabilityDemandFit: c.breakdown.stabilityDemandFit,
          complexityPenalty: c.breakdown.complexityPenalty,
          progressionStyleFit: c.breakdown.progressionStyleFit,
          anchorPenalty: c.breakdown.anchorPenalty,
          slotRepeatPenalty: c.breakdown.slotRepeatPenalty,
          recentUsePenalty: c.breakdown.recentUsePenalty,
          movementClusterPenalty: c.breakdown.movementClusterPenalty,
          clusterAlternativeBonus: c.breakdown.clusterAlternativeBonus,
          // Agent Control Layer dimensions
          heroSuppressionPenalty: c.breakdown.heroSuppressionPenalty,
          controlFamilyBoostFit: c.breakdown.controlFamilyBoostFit,
          controlFamilyReductionPenalty: c.breakdown.controlFamilyReductionPenalty,
          visibleSpineAlignmentFit: c.breakdown.visibleSpineAlignmentFit,
          dayIdentityAlignmentFit: c.breakdown.dayIdentityAlignmentFit,
          blockExposurePenalty: c.breakdown.blockExposurePenalty,
          phaseAffinityFit: c.breakdown.phaseAffinityFit,
          controlNoveltyBonus: c.breakdown.controlNoveltyBonus,
          controlNoveltyPenalty: c.breakdown.controlNoveltyPenalty,
        },
      });

      const topCandidates = scored.slice(0, 5).map(toFactors);
      const chosenBreakdown = toFactors(chosenScore);

      const payload: SlotAuditPayload = {
        generationId: ctx.generationId ?? "unknown",
        chosenBlockArchetype: ctx.programContext.blockArchetype,
        chosenPhase: ctx.programContext.currentPhase,
        chosenSplitArchitecture: ctx.programContext.splitArchitecture,
        dayIndex: ctx.dayIndex ?? 0,
        dayTheme: ctx.slotName,
        slotId: ctx.slotName,
        slotIntentLabel: ctx.slotIntent?.slotIntentLabel ?? ctx.slotName,
        targetStimulus: ctx.slotIntent?.targetStimulus ?? "",
        poolSize: pool.length,
        topCandidates,
        chosenExercise: chosen,
        winReasons: buildWinReasons(chosenBreakdown.factors),
        penaltiesApplied: buildPenaltySummary(chosenBreakdown.factors),
        noveltyPressureApplied: ctx.noveltyPressure ?? 0,
        familyBiasApplied: ctx.familyBiases?.boostedFamilies ?? [],
        phaseModifierApplied: ctx.programContext.currentPhase,
        blockModifierApplied: ctx.programContext.blockArchetype,
        rerankOccurred: false,
        rerankReason: null,
        exerciseFamily: chosenExMeta.family,
        complexity: chosenExMeta.complexity,
        velocityIntent: chosenExMeta.velocityIntent,
      };

      emitExerciseVariationAudit(payload);

      // Validate coherence
      validateSelectionCoherence(
        ctx.programContext.blockArchetype,
        ctx.slotName,
        chosen,
        chosenExMeta.family,
        pool.find((m) => m.name === chosen)?.fatigueCost ?? "moderate",
        pool.find((m) => m.name === chosen)?.neuralDemand ?? "moderate",
        chosenExMeta.complexity,
      );
    }
  }

  return { chosen, debugInfo };
}

// ─── Pool Definitions ─────────────────────────────────────────────────────────

// ── Lower Power ───────────────────────────────────────────────────────────────

const LOWER_POWER_POOL: ExerciseMeta[] = [
  { name: "Box Jump", sportTags: ["soccer", "basketball", "football", "rugby", "lacrosse", "volleyball", "hockey", "track"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "moderate", isDefaultAnchor: true },
  { name: "Broad Jump", sportTags: ["soccer", "football", "rugby", "lacrosse", "track", "sprint"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate", isDefaultAnchor: true },
  { name: "Vertical Jump (countermovement)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Hurdle Hop", sportTags: ["track", "soccer", "football", "sprint"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Depth Jump", sportTags: ["basketball", "volleyball", "track", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Trap Bar Jump (loaded)", sportTags: ["football", "rugby", "hockey"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Single-Leg Box Jump", sportTags: ["basketball", "soccer", "lacrosse"], intentTags: ["power", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Broad Jump (stick landing)", sportTags: ["soccer", "football", "lacrosse", "rugby"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Approach Jump to Box", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Lateral Bound", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Seated Box Jump", sportTags: [], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Triple Bound", sportTags: ["track", "sprint", "soccer", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Skater Bound", sportTags: ["hockey", "soccer", "basketball"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  // ── Expanded pool — horizontal acceleration ───────────────────────────────
  { name: "Power Skip (for distance)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Snap-Down to Broad Jump", sportTags: ["soccer", "football", "track", "rugby"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Acceleration Bound (3-step)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Standing Long Jump", sportTags: ["soccer", "football", "track"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Single-Leg Broad Jump", sportTags: ["soccer", "basketball", "lacrosse", "track"], intentTags: ["power", "stability", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Approach Broad Jump (3-step)", sportTags: ["soccer", "football", "track", "sprint"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  // ── Expanded pool — vertical projection ───────────────────────────────────
  { name: "Countermovement Jump (max height)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Depth Drop to Box Jump", sportTags: ["basketball", "volleyball", "track"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Reactive Box Jump (step off to jump)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  // ── Expanded pool — lateral/COD ────────────────────────────────────────────
  { name: "Reactive Lateral Bound (stop and go)", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Lateral Box Jump", sportTags: ["hockey", "soccer", "basketball"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Split-Stance Reactive Bound", sportTags: ["soccer", "lacrosse", "basketball", "hockey"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  // ── Expanded pool — reactive stiffness ────────────────────────────────────
  { name: "Fast Hurdle Hop (bilateral continuous, 6 hurdles)", sportTags: ["track", "soccer", "basketball", "football"], intentTags: ["elastic", "speed", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Pogo to Bound (2 pogos then launch)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
];

const LOWER_POWER_POOL_SUBMAXIMAL: ExerciseMeta[] = [
  { name: "Box Jump (sub-maximal, technique focus)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Broad Jump (approach, stick landing)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Vertical Jump (reset between reps)", sportTags: [], intentTags: ["power"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Medicine Ball Slam (explosive, low reactive demand)", sportTags: [], intentTags: ["power", "endurance"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Low Box Jump (12-inch, soft landing focus)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Lateral Bound (controlled, stick and pause)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Standing Long Jump (3-second hold at landing)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Step-Up Jump (low-impact, alternating)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "low", fatigueCost: "low" },
];

// ── Week-Role Biased Power Pools ──────────────────────────────────────────────
// Establish: simpler, teachable expressions — build movement competency first
const LOWER_POWER_POOL_ESTABLISH: ExerciseMeta[] = [
  { name: "Box Jump", sportTags: ["soccer", "basketball", "football", "rugby", "lacrosse", "volleyball", "hockey", "track"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "moderate", isDefaultAnchor: true },
  { name: "Broad Jump", sportTags: ["soccer", "football", "rugby", "lacrosse", "track", "sprint"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate", isDefaultAnchor: true },
  { name: "Standing Long Jump", sportTags: ["soccer", "football", "track"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Lateral Bound", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Vertical Jump (countermovement)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Power Skip (for distance)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Single-Leg Box Jump", sportTags: ["basketball", "soccer", "lacrosse"], intentTags: ["power", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Pogo Jump", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Ankle Hop (series)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "speed"], neuralDemand: "moderate", fatigueCost: "low" },
];

// Intensify: sharper, more aggressive, higher-intent versions
const LOWER_POWER_POOL_INTENSIFY: ExerciseMeta[] = [
  { name: "Depth Jump", sportTags: ["basketball", "volleyball", "track", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Trap Bar Jump (loaded)", sportTags: ["football", "rugby", "hockey"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Triple Bound", sportTags: ["track", "sprint", "soccer", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Depth Drop to Box Jump", sportTags: ["basketball", "volleyball", "track"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Reactive Broad Jump (stick landing)", sportTags: ["soccer", "football", "lacrosse", "rugby"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Approach Broad Jump (3-step)", sportTags: ["soccer", "football", "track", "sprint"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Acceleration Bound (3-step)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Snap-Down to Broad Jump", sportTags: ["soccer", "football", "track", "rugby"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Lateral Bound (stop and go)", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Fast Hurdle Hop (bilateral continuous, 6 hurdles)", sportTags: ["track", "soccer", "basketball", "football"], intentTags: ["elastic", "speed", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Box Jump (step off to jump)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Pogo to Bound (2 pogos then launch)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
];

// ── Power Expression Families — maps expression type to a focused pool ────────
// Used when session identity or sport calls for a specific power expression family

const HORIZONTAL_ACCELERATION_POWER_POOL: ExerciseMeta[] = [
  { name: "Broad Jump", sportTags: ["soccer", "football", "track", "sprint", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Power Skip (for distance)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Snap-Down to Broad Jump", sportTags: ["soccer", "football", "track", "rugby"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Acceleration Bound (3-step)", sportTags: ["soccer", "track", "football", "lacrosse"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Standing Long Jump", sportTags: ["soccer", "football", "track"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Triple Bound", sportTags: ["track", "sprint", "soccer", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Approach Broad Jump (3-step)", sportTags: ["soccer", "football", "track", "sprint"], intentTags: ["power", "speed", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Single-Leg Broad Jump", sportTags: ["soccer", "basketball", "lacrosse", "track"], intentTags: ["power", "stability", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
];

const VERTICAL_PROJECTION_POWER_POOL: ExerciseMeta[] = [
  { name: "Box Jump", sportTags: ["basketball", "volleyball", "football", "soccer"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Countermovement Jump (max height)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Approach Jump to Box", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Depth Jump", sportTags: ["basketball", "volleyball", "track", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Depth Drop to Box Jump", sportTags: ["basketball", "volleyball", "track"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Reactive Box Jump (step off to jump)", sportTags: ["basketball", "volleyball", "football"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Single-Leg Box Jump", sportTags: ["basketball", "soccer", "lacrosse"], intentTags: ["power", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
];

const LATERAL_COD_POWER_POOL: ExerciseMeta[] = [
  { name: "Lateral Bound", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Skater Bound", sportTags: ["hockey", "soccer", "basketball"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Lateral Bound (stop and go)", sportTags: ["hockey", "soccer", "basketball", "lacrosse"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Lateral Box Jump", sportTags: ["hockey", "soccer", "basketball"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Split-Stance Reactive Bound", sportTags: ["soccer", "lacrosse", "basketball", "hockey"], intentTags: ["power", "elastic", "stability"], neuralDemand: "high", fatigueCost: "moderate" },
];

const REACTIVE_STIFFNESS_POWER_POOL: ExerciseMeta[] = [
  { name: "Ankle Hop (series)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "speed"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Pogo Jump", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Hurdle Bounce (continuous)", sportTags: ["track", "soccer", "football"], intentTags: ["elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Fast Hurdle Hop (bilateral continuous, 6 hurdles)", sportTags: ["track", "soccer", "basketball", "football"], intentTags: ["elastic", "speed", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Pogo to Bound (2 pogos then launch)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "power", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Single-Leg Ankle Hop", sportTags: ["track", "basketball"], intentTags: ["elastic", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Drop Jump (sub-maximal contact time focus)", sportTags: ["track", "basketball", "volleyball"], intentTags: ["elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
];

const CONTRAST_LOADED_POWER_POOL: ExerciseMeta[] = [
  { name: "Trap Bar Jump (loaded)", sportTags: ["football", "rugby", "hockey"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Jump Squat (barbell, 30% 1RM)", sportTags: ["football", "rugby", "track"], intentTags: ["power", "speed", "strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Banded Jump Squat", sportTags: ["football", "rugby", "hockey", "soccer"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Hex Bar Jump (loaded)", sportTags: ["football", "rugby", "hockey"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Depth Jump", sportTags: ["basketball", "volleyball", "track", "football"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Seated Box Jump", sportTags: [], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
];

// ── Bilateral Squat ───────────────────────────────────────────────────────────

const BILATERAL_SQUAT_POOL: ExerciseMeta[] = [
  { name: "Back Squat", sportTags: [], intentTags: ["strength", "hypertrophy", "power"], neuralDemand: "high", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Front Squat", sportTags: ["olympic", "soccer", "basketball", "lacrosse"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Pause Back Squat", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Safety Bar Squat", sportTags: ["football", "rugby", "hockey"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Box Squat", sportTags: ["football", "powerlifting", "rugby"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Low-Bar Back Squat", sportTags: ["powerlifting"], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Cambered Bar Squat", sportTags: ["football", "rugby"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Heel-Elevated Back Squat", sportTags: ["soccer", "basketball", "volleyball"], intentTags: ["hypertrophy", "mobility"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Trap Bar Deadlift (squat-mode, low handles)", sportTags: ["football", "rugby", "hockey", "basketball"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Zercher Squat", sportTags: ["wrestling", "mma", "football"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Hatfield Squat", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  // ── Movement Equivalents (specialty equipment) ────────────────────────────────
  // Belt squat: excellent alternative but requires a belt squat machine — specialty
  // equipment not found in most gyms. Marked specialtyEquipment: true so it is
  // excluded from default program generation. Only selected when the user explicitly
  // confirms their gym has one.
  { name: "Belt Squat", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "moderate", equivalenceCluster: "bilateral-squat", specialtyEquipment: true },
  // Tempo Back Squat: same pattern as Back Squat but with deliberate eccentric
  // tempo (3-second down, 1-second pause, 1-second up) — hypertrophy and positional
  // strength emphasis without adding new loading modalities.
  { name: "Tempo Back Squat (3-1-1)", sportTags: ["powerlifting", "football", "rugby"], intentTags: ["strength", "hypertrophy", "stability"], neuralDemand: "high", fatigueCost: "high", equivalenceCluster: "bilateral-squat" },
];

const BILATERAL_SQUAT_JOINT_FRIENDLY: ExerciseMeta[] = [
  { name: "Trap Bar Deadlift (low handles)", sportTags: ["football", "rugby"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Goblet Squat (heavy)", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Front Squat", sportTags: ["basketball", "volleyball"], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Safety Bar Squat", sportTags: [], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Box Squat", sportTags: [], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Heel-Elevated Goblet Squat", sportTags: [], intentTags: ["hypertrophy", "mobility"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Leg Press (as primary)", sportTags: ["bodybuilding", "swimming"], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "moderate" },
];

const BILATERAL_SQUAT_STRENGTH_FOCUS: ExerciseMeta[] = [
  { name: "Back Squat", sportTags: [], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Pause Back Squat", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Safety Bar Squat", sportTags: ["football", "rugby", "hockey"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Cambered Bar Squat", sportTags: ["football", "rugby"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Box Squat", sportTags: ["football", "powerlifting", "rugby"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Low-Bar Back Squat", sportTags: ["powerlifting"], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Front Squat", sportTags: ["soccer", "basketball", "lacrosse"], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Trap Bar Deadlift (squat-mode, low handles)", sportTags: ["football", "rugby", "hockey", "basketball"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Hatfield Squat", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Zercher Squat", sportTags: ["wrestling", "mma", "football"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
];

const BILATERAL_SQUAT_HYPERTROPHY_FOCUS: ExerciseMeta[] = [
  { name: "Back Squat", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "high", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Safety Bar Squat", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Heel-Elevated Back Squat", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Leg Press (as primary)", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Hack Squat (machine)", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Trap Bar Deadlift (squat-mode, low handles)", sportTags: [], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Front Squat", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
];

// ── Bilateral Hinge ───────────────────────────────────────────────────────────

const BILATERAL_HINGE_POOL: ExerciseMeta[] = [
  { name: "Conventional Deadlift", sportTags: [], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Romanian Deadlift", sportTags: ["soccer", "football", "basketball", "lacrosse"], intentTags: ["hypertrophy", "strength", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Trap Bar Deadlift", sportTags: ["football", "hockey", "rugby", "basketball"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Sumo Deadlift", sportTags: ["powerlifting", "football", "rugby"], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Rack Pull (from knee)", sportTags: ["football", "rugby", "powerlifting"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Dumbbell Romanian Deadlift", sportTags: ["soccer", "basketball", "lacrosse"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Hex Bar RDL", sportTags: ["football", "rugby", "hockey"], intentTags: ["strength", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Good Morning", sportTags: ["soccer", "track", "football"], intentTags: ["strength", "mobility"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Snatch-Grip Deadlift", sportTags: ["olympic", "track", "football"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Romanian Deadlift (heavy)", sportTags: ["football", "rugby"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Banded Deadlift", sportTags: ["powerlifting", "football", "rugby"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Hip Thrust (barbell)", sportTags: ["soccer", "football", "sprint", "track"], intentTags: ["strength", "hypertrophy", "power"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Stiff-Leg Deadlift", sportTags: ["track", "soccer", "football"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
];

const BILATERAL_HINGE_MODERATE_FATIGUE: ExerciseMeta[] = [
  { name: "Romanian Deadlift", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Trap Bar Deadlift", sportTags: [], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Dumbbell Romanian Deadlift", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Rack Pull (from knee)", sportTags: [], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Hex Bar Deadlift", sportTags: [], intentTags: ["strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Good Morning", sportTags: [], intentTags: ["strength", "mobility"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Kettlebell Deadlift", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
];

// ── Unilateral Lower ──────────────────────────────────────────────────────────

const UNILATERAL_LOWER_SQUAT_POOL: ExerciseMeta[] = [
  { name: "Bulgarian Split Squat", sportTags: [], intentTags: ["strength", "hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Rear-Foot Elevated Split Squat (RFESS)", sportTags: ["soccer", "football", "basketball", "rugby"], intentTags: ["strength", "stability", "power"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Lateral Step-Up", sportTags: ["soccer", "hockey", "basketball", "football"], intentTags: ["stability", "strength", "speed"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Single-Leg Squat to Box", sportTags: ["football", "basketball", "lacrosse"], intentTags: ["stability", "strength"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Reverse Lunge", sportTags: ["soccer", "basketball", "lacrosse", "football"], intentTags: ["stability", "strength"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Lateral Lunge", sportTags: ["hockey", "soccer", "basketball", "lacrosse", "football"], intentTags: ["mobility", "stability", "strength"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Walking Lunge (weighted)", sportTags: ["soccer", "football", "track", "rugby"], intentTags: ["strength", "endurance"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Cossack Squat", sportTags: ["hockey", "soccer", "mma", "wrestling"], intentTags: ["mobility", "stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Deficit Reverse Lunge", sportTags: ["football", "rugby", "track"], intentTags: ["strength", "stability"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Step-Up (front, loaded)", sportTags: ["football", "rugby", "soccer", "hockey"], intentTags: ["strength", "stability", "power"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Elevated Split Squat (barbell)", sportTags: ["football", "powerlifting", "rugby"], intentTags: ["strength", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Heel-Elevated Goblet Split Squat", sportTags: ["soccer", "basketball", "volleyball"], intentTags: ["mobility", "strength", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
];

const UNILATERAL_LOWER_HINGE_POOL: ExerciseMeta[] = [
  { name: "Single-Leg Romanian Deadlift", sportTags: ["soccer", "basketball", "lacrosse"], intentTags: ["stability", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Single-Leg Hip Thrust", sportTags: ["soccer", "football", "sprint"], intentTags: ["strength", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Single-Leg Deadlift (KB)", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Kickstand RDL", sportTags: ["soccer", "basketball", "football"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Single-Leg Good Morning", sportTags: [], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Hip Hinge to Single-Leg RDL", sportTags: [], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Nordic Curl", sportTags: ["soccer", "football", "sprint"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
];

// ── Trunk ─────────────────────────────────────────────────────────────────────

const TRUNK_ANTI_ROTATION_POOL: ExerciseMeta[] = [
  { name: "Pallof Press", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low", isDefaultAnchor: true },
  { name: "Half-Kneeling Cable Chop", sportTags: ["golf", "baseball", "tennis", "soccer"], intentTags: ["rotational", "stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Landmine Anti-Rotation", sportTags: ["football", "rugby", "mma"], intentTags: ["stability", "strength"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Copenhagen Plank", sportTags: ["soccer", "football", "hockey"], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Suitcase Carry", sportTags: ["football", "rugby", "mma", "wrestling"], intentTags: ["stability", "endurance"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Offset Farmer Carry", sportTags: ["football", "rugby", "mma"], intentTags: ["stability", "endurance"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Band Pallof Press", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Half-Kneeling Band Chop", sportTags: ["golf", "baseball", "tennis"], intentTags: ["rotational", "stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Cable Woodchop (low to high)", sportTags: ["golf", "baseball", "tennis", "soccer", "mma"], intentTags: ["rotational", "power"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Bear Crawl", sportTags: ["football", "mma", "wrestling"], intentTags: ["stability", "endurance"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Rolling Plank", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
];

const TRUNK_ANTI_EXTENSION_POOL: ExerciseMeta[] = [
  { name: "Dead Bug", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Ab Wheel Rollout", sportTags: ["mma", "football", "soccer"], intentTags: ["stability", "strength"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Hollow Body Hold", sportTags: ["gymnastics", "swimming", "track"], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "RKC Plank", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "TRX Fallout", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Stir the Pot (Swiss ball)", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Long-Lever Plank", sportTags: [], intentTags: ["stability", "endurance"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Barbell Rollout", sportTags: [], intentTags: ["stability", "strength"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Hanging Knee Raise (controlled)", sportTags: ["gymnastics", "swimming"], intentTags: ["stability", "endurance"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Paloff Press (long-lever)", sportTags: [], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "low" },
];

// ── Upper Push ────────────────────────────────────────────────────────────────

const UPPER_PUSH_PRIMARY_POOL: ExerciseMeta[] = [
  { name: "Barbell Bench Press", sportTags: ["football", "powerlifting", "rugby"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Incline Barbell Press", sportTags: ["football", "powerlifting"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Dumbbell Bench Press", sportTags: ["basketball", "soccer", "swimming"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Incline Dumbbell Press", sportTags: ["soccer", "basketball"], intentTags: ["hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Overhead Press (barbell)", sportTags: ["football", "rugby", "mma"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Push Press", sportTags: ["football", "rugby", "olympic", "mma"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Landmine Press", sportTags: ["baseball", "soccer", "mma"], intentTags: ["strength", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Close-Grip Bench Press", sportTags: [], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Single-Arm Dumbbell Press", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Dumbbell Shoulder Press", sportTags: ["basketball", "swimming", "soccer"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
];

const UPPER_PUSH_SECONDARY_POOL: ExerciseMeta[] = [
  { name: "Incline Dumbbell Press", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Dumbbell Shoulder Press", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Landmine Press", sportTags: [], intentTags: ["stability", "strength"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Single-Arm Dumbbell Press", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Cable Chest Press", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Push-Up (weighted)", sportTags: ["mma", "wrestling"], intentTags: ["hypertrophy", "endurance"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Ring Dip", sportTags: ["gymnastics"], intentTags: ["strength", "stability"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "DB Floor Press", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "low", fatigueCost: "low" },
];

// ── Upper Pull ────────────────────────────────────────────────────────────────

const UPPER_PULL_PRIMARY_POOL: ExerciseMeta[] = [
  { name: "Weighted Pull-Up", sportTags: ["basketball", "gymnastics", "mma", "swimming"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high", isDefaultAnchor: true },
  { name: "Barbell Bent-Over Row", sportTags: ["football", "powerlifting", "rugby"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Weighted Chin-Up", sportTags: ["gymnastics", "mma", "basketball", "soccer"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Seated Cable Row", sportTags: ["swimming", "rowing", "soccer"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Pendlay Row", sportTags: ["football", "rugby", "hockey"], intentTags: ["strength", "power"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Single-Arm Dumbbell Row", sportTags: ["basketball", "soccer", "lacrosse"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "T-Bar Row", sportTags: ["football", "rugby", "hockey"], intentTags: ["strength", "hypertrophy"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Chest-Supported Dumbbell Row", sportTags: ["swimming", "baseball", "tennis"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Meadows Row", sportTags: ["bodybuilding", "mma"], intentTags: ["hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Seal Row", sportTags: ["football", "rugby", "swimming"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Dumbbell Seal Row", sportTags: ["soccer", "basketball"], intentTags: ["hypertrophy", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Half-Kneeling Cable Pull", sportTags: ["golf", "baseball", "tennis", "soccer"], intentTags: ["stability", "hypertrophy", "rotational"], neuralDemand: "moderate", fatigueCost: "low" },
  // ── Vertical-Pull Movement Equivalents (new) ────────────────────────────────
  // The primary pool previously contained pull-up and chin-up variants but lacked
  // band-assisted and gymnastic ring options.  These are movement-equivalent to
  // Weighted Pull-Up for the vertical-pull slot and share the "vertical-pull"
  // equivalenceCluster so the cluster-alternative-bonus rotates through them.
  { name: "Banded Pull-Up", sportTags: ["gymnastics", "mma", "basketball", "calisthenics"], intentTags: ["strength", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate", equivalenceCluster: "vertical-pull" },
  { name: "Ring Pull-Up", sportTags: ["gymnastics", "mma", "calisthenics"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high", equivalenceCluster: "vertical-pull" },
  // Lat Pulldown (heavy) promotes to primary: full lat-dominant vertical pull at
  // high load — functionally equivalent to weighted pull-up for athletes who
  // lack sufficient bodyweight pull strength or use equipment-based periodisation.
  { name: "Lat Pulldown (heavy)", sportTags: ["swimming", "rowing", "bodybuilding", "gymnastics"], intentTags: ["strength", "hypertrophy"], neuralDemand: "moderate", fatigueCost: "moderate", equivalenceCluster: "vertical-pull" },
];

const UPPER_PULL_SECONDARY_POOL: ExerciseMeta[] = [
  { name: "Lat Pulldown", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Cable Row (neutral grip)", sportTags: [], intentTags: ["hypertrophy", "stability"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Incline Dumbbell Row", sportTags: [], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Band Pull-Apart", sportTags: [], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Face Pull", sportTags: ["swimming", "baseball", "tennis"], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Half-Kneeling Cable Row", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Single-Arm Cable Row", sportTags: [], intentTags: ["stability", "hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Inverted Row", sportTags: ["mma", "wrestling", "gymnastics"], intentTags: ["strength", "endurance"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Cable Pullover", sportTags: ["swimming"], intentTags: ["hypertrophy"], neuralDemand: "low", fatigueCost: "low" },
];

// ── Rotational Power ──────────────────────────────────────────────────────────

const ROTATIONAL_POWER_POOL: ExerciseMeta[] = [
  { name: "Med Ball Rotational Throw (against wall)", sportTags: ["baseball", "softball", "tennis", "golf", "soccer", "hockey", "mma"], intentTags: ["rotational", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Med Ball Scoop Toss (rotational)", sportTags: ["golf", "baseball", "tennis", "mma"], intentTags: ["rotational", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Med Ball Overhead Backward Slam", sportTags: ["football", "mma", "rugby"], intentTags: ["power", "strength"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Med Ball Chest Throw", sportTags: ["basketball", "football", "rugby"], intentTags: ["power", "elastic"], neuralDemand: "high", fatigueCost: "low" },
  { name: "Med Ball Side Slam", sportTags: ["golf", "baseball", "mma", "tennis"], intentTags: ["rotational", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Med Ball Rotational Pass (partner or wall)", sportTags: ["soccer", "hockey", "mma"], intentTags: ["rotational", "elastic"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Landmine Rotation (loaded)", sportTags: ["golf", "baseball", "mma", "football"], intentTags: ["rotational", "strength"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Cable Rotational Throw", sportTags: ["golf", "tennis", "baseball", "soccer"], intentTags: ["rotational", "power"], neuralDemand: "moderate", fatigueCost: "low" },
];

// ── Elastic / Reactive Power ──────────────────────────────────────────────────

const ELASTIC_POWER_POOL: ExerciseMeta[] = [
  { name: "Ankle Hop (series)", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic", "speed"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Pogo Jump", sportTags: ["track", "soccer", "basketball"], intentTags: ["elastic"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Hurdle Bounce (continuous)", sportTags: ["track", "soccer", "football"], intentTags: ["elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Reactive Bound", sportTags: ["basketball", "soccer", "track"], intentTags: ["elastic", "power"], neuralDemand: "high", fatigueCost: "moderate" },
  { name: "Single-Leg Ankle Hop", sportTags: ["track", "basketball"], intentTags: ["elastic", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Drop Jump (sub-maximal contact time focus)", sportTags: ["track", "basketball", "volleyball"], intentTags: ["elastic", "speed"], neuralDemand: "high", fatigueCost: "moderate" },
];

// ── Conditioning Finisher ─────────────────────────────────────────────────────

const CONDITIONING_FINISHER_POOL: ExerciseMeta[] = [
  { name: "Farmer Carry complex (30m × 3)", sportTags: ["football", "rugby", "mma"], intentTags: ["endurance", "stability"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Kettlebell Swing (4 × 15)", sportTags: ["mma", "soccer", "hockey"], intentTags: ["power", "endurance"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Sled Push (20m × 5)", sportTags: ["football", "rugby", "soccer", "hockey"], intentTags: ["strength", "endurance", "speed"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Assault Bike (6 × 30 sec all-out / 90 sec rest)", sportTags: ["mma", "hockey", "soccer"], intentTags: ["endurance", "speed"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Battle Rope (8 × 20 sec / 40 sec rest)", sportTags: ["mma", "football", "rugby"], intentTags: ["endurance"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Rowing Intervals (6 × 250m / 90 sec rest)", sportTags: ["rowing", "swimming", "track"], intentTags: ["endurance"], neuralDemand: "moderate", fatigueCost: "moderate" },
  { name: "Rower Sprint (5 × 300m / 2 min rest)", sportTags: ["rowing", "swimming", "mma"], intentTags: ["endurance", "speed"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Trap Bar Carry (30m × 3)", sportTags: ["football", "rugby"], intentTags: ["stability", "endurance", "strength"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Ski Erg Sprint (4 × 30 sec / 90 sec rest)", sportTags: ["hockey", "skiing", "mma"], intentTags: ["endurance", "speed"], neuralDemand: "moderate", fatigueCost: "high" },
  { name: "Lactate Sprint Complex (4 × 10 KB swing + 10 push-up + 200m run)", sportTags: ["soccer", "football", "lacrosse"], intentTags: ["endurance", "speed"], neuralDemand: "moderate", fatigueCost: "high" },
];

// ── Positional / Sport-Specific Support ───────────────────────────────────────

const POSITIONAL_SUPPORT_POOL: ExerciseMeta[] = [
  { name: "Copenhagen Plank", sportTags: ["soccer", "hockey", "lacrosse"], intentTags: ["stability"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Nordic Curl", sportTags: ["soccer", "football", "sprint"], intentTags: ["strength", "stability"], neuralDemand: "high", fatigueCost: "high" },
  { name: "Tibialis Raise", sportTags: ["track", "soccer", "basketball"], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Calf Raise (eccentric heavy)", sportTags: ["track", "basketball", "soccer"], intentTags: ["strength", "stability"], neuralDemand: "low", fatigueCost: "moderate" },
  { name: "Hip Flexor / Psoas March", sportTags: ["soccer", "football", "track"], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Shoulder External Rotation (side-lying)", sportTags: ["baseball", "swimming", "tennis"], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
  { name: "Y-T-W (face-pull variation)", sportTags: ["swimming", "baseball", "tennis"], intentTags: ["stability", "mobility"], neuralDemand: "low", fatigueCost: "low" },
];

// ─── Prep Family Definitions ──────────────────────────────────────────────────
//
// Each family has expressions per week role.
// Selection is driven by session patterns, sport, blockArchetype, weekRole, and dayNumber.
// Two or three distinct descriptions per slot ensure within-week prep variety.
//

type PrepWeekRole = "establish" | "build" | "intensify" | "deload";

interface PrepFamily {
  id: string;
  label: string;
  /** Which session patterns trigger this family (first match wins). */
  primaryPatterns: string[];
  /** Sport tags that make this family more likely (partial match). */
  sportAffinity: string[];
  expressions: Record<PrepWeekRole, string[]>;
}

const PREP_FAMILIES: PrepFamily[] = [
  {
    id: "sprint_mechanics",
    label: "Sprint Mechanics Prep",
    primaryPatterns: ["locomotion", "speed"],
    sportAffinity: ["soccer", "football", "track", "sprint", "lacrosse"],
    expressions: {
      establish: [
        "Sprint mechanics prep (10 min): jog 3 min → A-skip 2 × 20m (tall posture, pawing action) → high knees 2 × 20m → 3 × build-up strides at 70%, 80%, 85%. TEACH the positions before loading speed.",
        "Acceleration prep (10 min): jog 3 min → A-skip 2 × 15m → B-skip 2 × 15m → high knees 2 × 20m → 2 × 30m build-up at 70%, 80%. Focus on triple extension and forward lean.",
        "Sprint drill prep (10 min): light jog → ankling drill 2 × 20m → A-skip 2 × 20m → fall-and-sprint drill × 3. Positional awareness before speed.",
      ],
      build: [
        "Sprint prep (8 min): jog 2 min → A-skip 2 × 20m → B-skip 2 × 15m → 3 × build-up strides at 75%, 85%, 90%. CNS awakening before primary speed work.",
        "Acceleration drill series (8 min): A-skip 2 × 20m → power skip × 3 × 15m → 3 × 30m build-ups at 75%, 85%, 92%. Drive mechanics before the session primary.",
        "Sprint mechanics warm-up (8 min): ankling × 20m → A-skip × 20m → split-stance acceleration × 3 → 2 × build-up strides at 80%, 90%.",
      ],
      intensify: [
        "Sprint CNS primer (6 min): A-skip 2 × 20m → 2 × 30m build-up strides at 90%, 95%. BRIEF. CNS must be fresh. No volume — activation only.",
        "Speed activation (5 min): A-skip × 15m → 3 × fall-and-drive at 90%+ intent. Brief and sharp — do NOT fatigue before primary sprint work.",
        "Acceleration primer (6 min): 2 × power skip 15m → 2 × build-up strides at 90%, 95%. Quality over quantity.",
      ],
      deload: [
        "Easy sprint mechanics prep (10 min): jog 5 min → A-skip 2 × 15m at 60% effort → 2 × 20m build-ups at 60%, 70%. No sprint demands — movement quality only.",
        "Light locomotion prep (10 min): jog 5 min → walking A-skip × 20m → slow ankling × 20m → 2 × easy strides at 65%. Tissue care, not CNS activation.",
        "Restorative sprint prep (10 min): jog → hip circles while jogging → A-skip slow × 2 × 15m. Zero intensity. Skill pattern only.",
      ],
    },
  },
  {
    id: "elastic_ankle_stiffness",
    label: "Elastic / Ankle Stiffness Prep",
    primaryPatterns: ["lateral", "power"],
    sportAffinity: ["soccer", "basketball", "track", "volleyball", "lacrosse"],
    expressions: {
      establish: [
        "Elastic ankle prep (10 min): slow calf raise × 15 → ankle circles × 10 each → pogo hops 2 × 10 (sub-max, teaching quiet contact) → ankle hop series 2 × 15. Goal: introduce foot stiffness concept.",
        "Ankle stiffness primer (10 min): single-leg calf raise × 12 each → ankle dorsiflexion hold 3 × 5 sec → pogo hop 2 × 10 → bilateral ankle hop 2 × 12. Focus: minimal ground contact time.",
        "Foot and ankle prep (10 min): toe spread + calf raise × 15 → ankle CAR × 6 each → pogo series 2 × 8 → low hurdle step-over × 3 each leg. Build elastic reflex from ground up.",
      ],
      build: [
        "Elastic prep (8 min): ankle mobility → single-leg pogo hops 2 × 8 each → hurdle step-over × 3 → fast ankle hops 2 × 12. Goal: minimize contact time at moderate intensity.",
        "Stiffness primer (8 min): ankle circles → bilateral ankle hop 2 × 10 → single-leg ankle hop 2 × 6 each. Goal: teach elastic loading before power block.",
        "Reactive ankle prep (8 min): calf raise × 10 → pogo hops 2 × 10 → hurdle bounce series 2 × 6. Building stiffness progression toward the session's power intent.",
      ],
      intensify: [
        "CNS ankle primer (5 min): rapid ankle hops 2 × 8 → single-leg quick hop × 5 each. BRIEF — CNS must be fresh for maximum reactive output.",
        "Elastic activation (6 min): pogo hops 2 × 6 (max stiffness, minimum ground time) → ankle pop to acceleration × 3. CNS prime only — no fatigue accumulation.",
        "Stiffness activation (5 min): fast ankle hops 2 × 8 → 2 × hurdle bounce reactive. Brief, sharp, maximal intent on every contact.",
      ],
      deload: [
        "Light ankle/calf prep (10 min): calf raises (slow eccentric 4-count) × 15 → ankle circles → sub-max pogo hops 2 × 8 at 40% effort. Tissue quality only, zero reactive demand.",
        "Restorative foot prep (10 min): toe spreads × 10 → slow calf raise and lower × 12 → ankle CARs × 5 each → gentle pogo × 6. Recovery focus — no impact loading.",
        "Easy elastic prep (10 min): ankle mobility work + slow calf raises + light ankle hops 2 × 8. Very low amplitude, no maximal effort.",
      ],
    },
  },
  {
    id: "hip_posterior_chain",
    label: "Hip / Posterior Chain Prep",
    primaryPatterns: ["hinge"],
    sportAffinity: ["soccer", "football", "track", "rugby", "lacrosse"],
    expressions: {
      establish: [
        "Hip and posterior chain prep (10 min): hip CARs 5 each direction → 90/90 hip stretch 3 × 30 sec each → hamstring walkout × 6 → single-leg hip bridge × 10 each. Thorough tissue preparation before hinge loading.",
        "Posterior chain activation (10 min): piriformis stretch 2 × 30 sec → hip CARs × 5 → good-morning walkout × 6 → glute bridge march × 10. Educating the posterior chain before the session.",
        "Hip hinge prep (10 min): 90/90 hip mobility 2 × 30 sec each → hip CARs × 5 each → couch stretch 30 sec each → banded glute bridge × 12. Building awareness of hip position before loading.",
      ],
      build: [
        "Hip prep (8 min): hip CARs × 4 each → couch stretch 30 sec each → single-leg hip bridge × 10 each → deadlift walkout × 5. Targeted posterior chain readiness.",
        "Posterior prep (8 min): hamstring mobilization (standing) × 8 → hip CARs × 4 → banded clamshell × 12 each → RDL walkout × 5. Progressively loading the hinge pattern.",
        "Hip hinge activation (8 min): half-kneeling hip flexor stretch × 30 sec each → hip CAR × 4 → single-leg RDL (bodyweight) × 5 each. Sport-specific posterior chain priming.",
      ],
      intensify: [
        "Brief hip activation (6 min): hip CARs × 3 each direction → 3 × single-leg bridge hold 3 sec. Quality focus — CNS must be fresh for heavy hinge loading.",
        "Hip primer (5 min): quick hip CAR × 3 → glute bridge × 8 → bodyweight RDL × 4 each. Brief and targeted — do not pre-fatigue the posterior chain.",
        "Posterior chain primer (6 min): couch stretch 20 sec each → hip CAR × 3 → single-leg deadlift (bodyweight, 3 reps each). Efficient neural readiness.",
      ],
      deload: [
        "Restorative hip prep (10 min): deep 90/90 hold 2 × 45 sec each → hip circles × 8 → supine piriformis stretch 30 sec → light glute bridge × 10. Parasympathetic, slow, joint health focus.",
        "Light hip mobility (10 min): pigeon pose variation 45 sec each → hip CARs × 4 slow → very light glute bridge × 8. Recovery priority — no loading.",
        "Gentle posterior chain prep (10 min): 90/90 breathing + hip release 3 × 5 breaths → supine hip stretch → slow hip CARs × 4. Tissue quality only.",
      ],
    },
  },
  {
    id: "landing_deceleration",
    label: "Landing / Deceleration Prep",
    primaryPatterns: ["squat"],
    sportAffinity: ["basketball", "volleyball", "soccer", "lacrosse", "football"],
    expressions: {
      establish: [
        "Landing mechanics prep (8 min): snap-down drill × 3 (teaching absorption — hips back, soft knee, foot flat) → stick landing × 5 (3-second hold) → depth drop (no jump, just land and hold) × 3. TEACH the positions before loading them.",
        "Deceleration prep (8 min): snap-down × 3 → 5-3-1 decel drill (5m sprint, stop) × 4 → stick landing from step-off × 5. Build the landing pattern from simple to sport-specific.",
        "Bilateral landing prep (8 min): squat-depth holds × 5 at landing position → forward step landing × 5 each → depth drop to stick × 3. Reinforcing landing mechanics before power.",
      ],
      build: [
        "Landing prep (7 min): snap-down drill × 3 → lateral decel from 5m sprint × 3 each → double-leg stick landing × 5. Moving toward reactive landing mechanics.",
        "Decel prep (7 min): depth drop × 3 → lateral step to stick × 4 each → 5m sprint to broad jump with stick landing × 3. Progressively loading the deceleration demand.",
        "Reactive landing prep (7 min): snap-down × 3 → bilateral drop land × 3 → single-leg stick landing × 3 each. Building deceleration capacity toward the session's explosive work.",
      ],
      intensify: [
        "Landing primer (5 min): depth drop × 3 + stick landing × 3. Brief, sharp — prime the deceleration pattern before high-intensity reactive work.",
        "Decel CNS prime (5 min): snap-down to stick × 3 → lateral cut to hold × 2 each. Quality only — do NOT pre-fatigue landing mechanics.",
        "Reactive landing activation (6 min): step-off to bilateral stick landing × 3 → single-leg stick × 2 each. Brief preparation for maximal reactive output.",
      ],
      deload: [
        "Slow landing practice (8 min): controlled step-off and soft landing × 5, slow → squat-depth deceleration hold × 5 at 30% speed. No reactive demand — movement rehearsal only.",
        "Easy landing mechanics (8 min): slow-motion snap-down × 3 → low-amplitude step landing × 4 each. Very low impact, focus on feel and position.",
        "Restorative movement prep (10 min): slow deceleration walks × 4 each direction + squat hold × 3 at bottom. Zero CNS demand.",
      ],
    },
  },
  {
    id: "trunk_posture",
    label: "Trunk / Posture Prep",
    primaryPatterns: ["trunk", "rotational"],
    sportAffinity: [],
    expressions: {
      establish: [
        "Trunk and posture prep (10 min): foam roller thoracic extension (10 reps) → cat-cow × 10 → dead bug × 8 each → 90/90 breathing × 5 breaths each side. Full reset of rib cage position before loading.",
        "Thoracic mobility prep (10 min): thoracic rotation (quadruped) × 8 each → rib cage expansion breathing × 5 → dead bug × 6 each → half-kneeling Pallof hold × 5 each. Posture and bracing education.",
        "Core posture prep (10 min): thoracic opener on foam roller × 10 → side-lying thoracic rotation × 8 each → hollow body practice × 3 × 5 sec → 90/90 breathing. Build trunk integrity from scratch.",
      ],
      build: [
        "Trunk activation (8 min): thoracic rotation × 6 each → 90/90 breathing × 4 → dead bug × 6 each → half-kneeling Pallof hold 3 sec × 5 each. Targeted trunk readiness for the session.",
        "Posture prep (8 min): cat-cow × 8 → thoracic extension on roller × 6 → brace drill × 5 (breath in, brace, hold 3 sec) → dead bug × 6. Building trunk stiffness.",
        "Core activation (8 min): rib cage breathing 4 × 5 breaths → dead bug × 5 each → plank with breathing 3 × 10 sec. Establishes intra-abdominal pressure before loading.",
      ],
      intensify: [
        "Trunk primer (5 min): brace drill × 5 (360-degree pressure) → dead bug × 4 each. Brief and targeted — no fatigue before heavy trunk demands.",
        "Posture activation (5 min): thoracic extension × 5 → 90/90 breathing × 3 → brace hold × 3. Quick reset of rib cage and spinal position.",
        "Core primer (6 min): thoracic extension on roller × 4 → brace drill × 4 → hollow body hold 3 × 5 sec. Short, direct trunk prep.",
      ],
      deload: [
        "Restorative trunk prep (10 min): full thoracic foam roller work 2 × 10 → 90/90 breathing 4 × 5 breaths → supine dead bug (very easy) × 5 each. Parasympathetic priority.",
        "Thoracic mobility recovery (10 min): cat-cow × 10 slow → thoracic rotation × 8 slow each → diaphragmatic breathing practice × 5 min. Full tissue care, no compression.",
        "Posture restoration (10 min): rib cage mobility + 90/90 breathing + supine thoracic extension. Zero intensity, full recovery.",
      ],
    },
  },
  {
    id: "upper_structural",
    label: "Upper Structural Prep",
    primaryPatterns: ["upper_push", "upper_pull"],
    sportAffinity: [],
    expressions: {
      establish: [
        "Upper structural prep (10 min): wall slides × 12 (scapular upward rotation) → band pull-apart × 15 → shoulder CARs × 3 each direction → Y/T/W × 8 each. Full scapulothoracic and shoulder health protocol.",
        "Scapular and shoulder prep (10 min): thoracic extension on roller × 8 → wall slides × 12 → face pull × 12 → shoulder CAR × 3 each. Teaching scapular mechanics before pressing or pulling.",
        "Upper mobility prep (10 min): pec stretch + thoracic opener × 30 sec → wall slides × 10 → band pull-apart × 15 → side-lying shoulder ER × 10 each. Building shoulder integrity from scratch.",
      ],
      build: [
        "Upper prep (8 min): wall slides × 10 → band pull-apart × 12 → face pull × 12 → shoulder CAR × 3 each. Targeted scapular activation before the primary push or pull.",
        "Scapular activation (8 min): thoracic rotation × 6 each → wall slides × 10 → band pull-apart × 12 → 5 reps of the session's primary movement at 30% (rehearsal). Sport-specific readiness.",
        "Shoulder prep (8 min): thoracic extension × 6 → wall slides × 10 → Y/T/W × 6 → banded external rotation × 12 each. Scapulothoracic integrity before loading.",
      ],
      intensify: [
        "Scapular primer (5 min): band pull-apart × 10 → shoulder CAR × 2 each. Brief — do not pre-fatigue the scapular stabilizers.",
        "Upper activation (5 min): wall slides × 8 → face pull × 10. Quick scapular engagement — CNS must be ready for heavy pressing or pulling.",
        "Shoulder CNS prime (6 min): band pull-apart × 10 → Y/T/W × 5 → banded ER × 8 each. Short and targeted.",
      ],
      deload: [
        "Restorative shoulder prep (10 min): pec stretch 2 × 30 sec → wall slides × 12 slow → shoulder CARs × 4 slow each direction → band pull-apart × 15 easy. Tissue quality and range — no loading.",
        "Upper mobility recovery (10 min): thoracic opener on roller × 8 → side-lying thoracic rotation × 8 each → slow face pull × 12 → shoulder hang (bar) 3 × 15 sec. Full shoulder restoration.",
        "Scapular care (10 min): band pull-apart × 15 easy + shoulder CARs × 4 each + side-lying ER × 10 each. Recovery priority.",
      ],
    },
  },
];

// ─── Prep Selection Logic ─────────────────────────────────────────────────────

/** Deterministically pick one item from an array using a fractional index. */
function pickFromArray<T>(arr: T[], idx: number): T {
  return arr[Math.abs(Math.floor(idx)) % arr.length];
}

/**
 * Select a prep family description based on session context.
 * Returns a specific, varied prep description string.
 * Uses dayNumber + seed for within-week variety and weekRole for between-week variety.
 */
export function selectPrepDescription(params: {
  patterns: string[];
  blockArchetype?: string;
  weekRole?: string;
  sport: string | null;
  dayNumber: number;
  seed: number;
}): string {
  const { patterns, blockArchetype, weekRole, sport, dayNumber, seed } = params;
  const sportLc = sport?.toLowerCase() ?? "";
  const role = (weekRole ?? "establish") as PrepWeekRole;

  // ── Block-archetype-driven overrides first ───────────────────────────────
  if (blockArchetype === "REBUILD_DELOAD") {
    const isLower = patterns.some(p => ["squat", "hinge", "unilateral_lower"].includes(p));
    const isUpper = patterns.some(p => ["upper_push", "upper_pull"].includes(p));
    const options = isLower
      ? [
          "Deload lower prep (10 min): light hip circles × 10 each direction → slow hip CARs × 4 → banded clamshell × 10 → easy cat-cow × 8. Tissue quality, not CNS activation. No approach to mechanical limits.",
          "Light lower mobility (10 min): 90/90 hip stretch 30 sec each → slow ankle CARs × 6 each → easy glute bridge × 10. Recovery priority — nothing taxing.",
          "Gentle lower prep (10 min): supine hip circles × 8 → couch stretch 30 sec each → slow hip hinge (bodyweight) × 6. Move through ranges without loading.",
        ]
      : isUpper
        ? [
            "Deload upper prep (10 min): pec stretch 30 sec each → slow wall slides × 12 → gentle band pull-apart × 15 easy. Shoulder care and thoracic mobility only.",
            "Light upper mobility (10 min): thoracic foam roller extension × 8 → shoulder CARs × 3 each slow → side-lying ER × 8 each. Recovery focus — no loading.",
            "Restorative upper prep (10 min): slow wall slides × 10 → thoracic rotation × 6 each → gentle face pull band × 12. Tissue quality only.",
          ]
        : [
            "Deload prep (8 min): light dynamic mobility — hip circles, arm swings, inchworm × 3. Tissue quality only. No CNS demands.",
            "Gentle full-body prep (10 min): easy jog 3 min → slow leg swings × 10 each → arm circles → light inchworm × 3. Recovery, not activation.",
            "Light dynamic warm-up (10 min): jog 4 min → walking hip circles → arm swings. Zero intensity.",
          ];
    const idx = (seed * 17.3 + dayNumber * 3.1) % options.length;
    return pickFromArray(options, idx);
  }

  if (blockArchetype === "INTENSIFICATION_STRENGTH") {
    const isLower = patterns.some(p => ["squat", "hinge", "unilateral_lower"].includes(p));
    const isHinge = patterns.includes("hinge") && !patterns.includes("squat");
    const options = isLower
      ? isHinge
        ? [
            "Intensification hinge prep (6 min): hip CARs × 4 each → single-leg bridge × 6 each → brief hamstring mobilization. Quality over duration — CNS must be fresh for heavy hinge loading.",
            "Posterior chain primer (6 min): 90/90 hip stretch 20 sec each → hip CARs × 3 → banded glute bridge × 8. Brief and targeted — do not pre-fatigue the hinge.",
            "Hip activation (5 min): hip CAR × 3 each → single-leg RDL (bodyweight) × 3 each. Minimal. CNS fresh for maximal loading.",
          ]
        : [
            "Intensification squat prep (6 min): hip CARs × 4 → ankle dorsiflexion mobilization × 8 → goblet squat hold 3 × 5 sec. Quality over duration. CNS must be fresh.",
            "Lower CNS primer (6 min): hip circles × 8 → glute activation (bridge) × 8 → slow goblet squat × 3. Brief and targeted — no fatigue before heavy squat.",
            "Bilateral squat primer (5 min): hip CAR × 3 → ankle dorsiflexion hold × 5 → air squat × 4 slow. Minimal prep — CNS must be fully fresh.",
          ]
      : [
          "Intensification upper prep (6 min): thoracic extension × 5 → wall slides × 8 → band pull-apart × 10. Brief. CNS must be ready for heavy pressing.",
          "Upper CNS primer (5 min): shoulder CAR × 2 each → band pull-apart × 10 → 3 reps of primary press at 30%. Do not pre-fatigue.",
          "Scapular primer (6 min): wall slides × 8 → face pull × 10. Short and targeted — CNS fresh for maximal loading.",
        ];
    const idx = (seed * 19.7 + dayNumber * 2.9) % options.length;
    return pickFromArray(options, idx);
  }

  if (blockArchetype === "POWER_ELASTIC_CONVERSION") {
    const options = [
      "Reactive power prep (10 min): ankle mobility 2 min → pogo hop series 2 × 10 (sub-max, teaching stiffness) → 2 × 3 approach jumps to box (sub-max, position focus). Activating the stretch-shortening cycle before elastic output.",
      "Elastic activation prep (10 min): slow calf raise × 12 → ankle CARs × 6 each → pogo hops 2 × 8 sub-max → hurdle step-over × 3 each → 2 × approach jump sub-max. Teaching the rebound reflex.",
      "SSC prep (10 min): ankle circles → fast ankle hops 2 × 8 → bilateral pogo 2 × 6 → 2 × snap-down to sub-max bound. Awakening the elastic system before full reactive output.",
      "Power primer (8 min): ankle stiffness series → pogo hops 2 × 8 → sub-max horizontal jump × 3. Elastic system awakened — do NOT pre-fatigue before primary reactive block.",
    ];
    const idx = (seed * 13.1 + dayNumber * 5.7) % options.length;
    return pickFromArray(options, idx);
  }

  // ── Standard session prep — pick family by pattern + sport + day ─────────

  // Score each family
  const familyScores: Array<{ family: PrepFamily; score: number }> = PREP_FAMILIES.map((family) => {
    let score = 0;
    // Pattern match
    if (patterns.some(p => family.primaryPatterns.includes(p))) score += 4;
    // Sport affinity
    if (family.sportAffinity.some(tag => sportLc.includes(tag))) score += 2;
    // Day-number seeding: stir scores by (dayNumber * seed) to spread families across the week
    score += ((dayNumber * seed * 7.3) % 1) * 1.5;
    return { family, score };
  });

  familyScores.sort((a, b) => b.score - a.score);

  // Top family wins, but alternate between top-2 using dayNumber parity for within-week variety
  const useSecond = familyScores.length > 1 && (dayNumber % 2 === 0) && familyScores[0].score - familyScores[1].score < 2;
  const chosenFamily = useSecond ? familyScores[1].family : familyScores[0].family;

  const expressions = chosenFamily.expressions[role] ?? chosenFamily.expressions.establish;
  const idx = (seed * 11.3 + dayNumber * 4.1) % expressions.length;
  return pickFromArray(expressions, idx);
}

// ─── Sport-Specific Pool Selection ────────────────────────────────────────────

function getLowerPowerPool(sport: string | null, neuralDemand: "high" | "moderate" | "low", weekRole?: string): ExerciseMeta[] {
  if (neuralDemand === "low" || weekRole === "deload") return LOWER_POWER_POOL_SUBMAXIMAL;
  if (weekRole === "intensify") {
    const s = sport?.toLowerCase() ?? "";
    if (s.includes("swim") || s.includes("row")) return LOWER_POWER_POOL_INTENSIFY.filter(e => !e.name.toLowerCase().includes("trap bar"));
    if (s.includes("golf") || s.includes("baseball") || s.includes("softball")) return ROTATIONAL_POWER_POOL;
    if (s.includes("hockey") || s.includes("soccer") || s.includes("lacrosse") || s.includes("basketball")) {
      return [...LOWER_POWER_POOL_INTENSIFY, ...LATERAL_COD_POWER_POOL];
    }
    return LOWER_POWER_POOL_INTENSIFY;
  }
  if (weekRole === "establish") {
    const s = sport?.toLowerCase() ?? "";
    if (s.includes("golf") || s.includes("baseball") || s.includes("softball")) return ROTATIONAL_POWER_POOL;
    return LOWER_POWER_POOL_ESTABLISH;
  }
  const s = sport?.toLowerCase() ?? "";
  // Swimming/rowing: lower power is still needed but not jump-heavy
  if (s.includes("swim") || s.includes("row")) {
    return LOWER_POWER_POOL.filter((e) => !e.name.toLowerCase().includes("jump") && !e.name.toLowerCase().includes("bound"));
  }
  // Golf/baseball/softball: rotational power is the primary power modality
  if (s.includes("golf") || s.includes("baseball") || s.includes("softball")) {
    return ROTATIONAL_POWER_POOL;
  }
  // Soccer/lacrosse: prefer horizontal acceleration and lateral power
  if (s.includes("soccer") || s.includes("lacrosse")) {
    return [...HORIZONTAL_ACCELERATION_POWER_POOL, ...LATERAL_COD_POWER_POOL];
  }
  // Basketball/volleyball: prefer vertical projection
  if (s.includes("basketball") || s.includes("volleyball")) {
    return VERTICAL_PROJECTION_POWER_POOL;
  }
  // Hockey: prefer lateral/COD power
  if (s.includes("hockey")) {
    return [...LATERAL_COD_POWER_POOL, ...HORIZONTAL_ACCELERATION_POWER_POOL];
  }
  return LOWER_POWER_POOL;
}

function getBilateralSquatPool(sport: string | null, goal: string | null, allowSpecialtyEquipment?: boolean): ExerciseMeta[] {
  const s = sport?.toLowerCase() ?? "";
  const g = goal?.toLowerCase() ?? "";

  // Specialty equipment (e.g. Belt Squat machine) is excluded by default.
  // Only include specialty exercises when the caller explicitly opts in.
  const specialtyFilter = (pool: ExerciseMeta[]) =>
    allowSpecialtyEquipment ? pool : pool.filter((e) => !e.specialtyEquipment);

  if (s.includes("basketball") || s.includes("volleyball")) return specialtyFilter(BILATERAL_SQUAT_JOINT_FRIENDLY);
  if (g.includes("strength") || g.includes("powerlifting")) return specialtyFilter(BILATERAL_SQUAT_STRENGTH_FOCUS);
  if (g.includes("hypertrophy") || g.includes("bodybuilding")) return specialtyFilter(BILATERAL_SQUAT_HYPERTROPHY_FOCUS);
  return specialtyFilter(BILATERAL_SQUAT_POOL);
}

function getBilateralHingePool(sport: string | null, goal: string | null, lowFatigue?: boolean): ExerciseMeta[] {
  if (lowFatigue) return BILATERAL_HINGE_MODERATE_FATIGUE;
  const g = goal?.toLowerCase() ?? "";
  if (g.includes("strength")) {
    return BILATERAL_HINGE_POOL.filter((e) => e.intentTags.includes("strength") || e.intentTags.includes("power"));
  }
  return BILATERAL_HINGE_POOL;
}

function getUpperPushPool(sport: string | null): ExerciseMeta[] {
  const s = sport?.toLowerCase() ?? "";
  // Athletic sports: de-emphasise heavy barbell bench, prefer shoulder-safe options
  if (s.includes("swim") || s.includes("tennis") || s.includes("baseball") || s.includes("softball")) {
    return UPPER_PUSH_PRIMARY_POOL.filter((e) => !e.name.toLowerCase().includes("barbell bench"));
  }
  return UPPER_PUSH_PRIMARY_POOL;
}

// ─── Block/Week Context for Hierarchical Selection ───────────────────────────

export interface BlockSelectionContext {
  /** Block type from monthly-block-planner — modulates intent scoring. */
  blockType?: string;
  /** Week role — deload/establish drives lowFatigue, intensify drives high-intensity intent. */
  weekRole?: "establish" | "build" | "intensify" | "deload";
}

/** Derive intent array from block context to enrich scoring. */
function deriveBlockIntent(
  blockType: string | undefined,
  weekRole: string | undefined,
  baseIntent: ScoreContext["sessionIntent"],
): ScoreContext["sessionIntent"] {
  const merged = new Set(baseIntent);

  if (blockType === "hypertrophy_support") {
    merged.add("hypertrophy");
  } else if (blockType === "power_conversion") {
    merged.add("power");
    merged.add("elastic");
    merged.add("speed");
  } else if (blockType === "work_capacity") {
    merged.add("endurance");
  } else if (blockType === "re_entry_resilience" || blockType === "resilience_block" || blockType === "control_block" || blockType === "re_entry_block") {
    merged.add("stability");
    merged.add("mobility");
  } else if (blockType === "strength_emphasis" || blockType === "intensification") {
    merged.add("strength");
  }

  if (weekRole === "intensify") {
    merged.add("strength");
    merged.add("power");
  } else if (weekRole === "deload" || weekRole === "establish") {
    merged.add("stability");
    merged.add("mobility");
  }

  return [...merged] as ScoreContext["sessionIntent"];
}

/** Audit log for slot exercise selections with block context. */
function auditSlotSelection(
  slotName: string,
  chosen: string,
  blockType: string | undefined,
  weekRole: string | undefined,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:ExerciseSelection]", JSON.stringify({
      slot: slotName,
      chosen,
      blockType: blockType ?? "none",
      weekRole: weekRole ?? "none",
    }));
  }
}

// ─── Main Selection Function ───────────────────────────────────────────────────

export function selectSlotExercises(
  seed: number,
  sport: string | null,
  goal: string | null,
  neuralDemand: "high" | "moderate" | "low" = "high",
  equipmentLevel: "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight" = "full_gym",
  lowFatigue?: boolean,
  blockContext?: BlockSelectionContext,
  programContext?: ProgramContextProfile,
  dayIndex?: number,
  registerSelections: boolean = true,
  blockExposure?: BlockExposureTracker,
): SlotExerciseSelection {
  const alreadySelected = new Set<string>();
  const debugInfos: SlotDebugInfo[] = [];

  // Deload and establish weeks always drive low-fatigue selection
  const effectiveLowFatigue =
    lowFatigue ||
    blockContext?.weekRole === "deload" ||
    blockContext?.weekRole === "establish" ||
    programContext?.currentPhase === "deload";

  // Pre-derive family biases once per build (same archetype + phase for all slots)
  const sharedFamilyBiases = programContext
    ? deriveFamilyBiases(programContext)
    : undefined;

  // Stable generation ID for audit log correlation
  const generationId = programContext
    ? `${programContext.blockArchetype}:${programContext.currentPhase}:${seed.toFixed(4)}`
    : undefined;

  // Extract resolved agent controls from program context (resolved once in buildProgramContextProfile)
  const resolvedAgentControls = programContext?.resolvedAgentControls;

  function pick(
    pool: ExerciseMeta[],
    slotName: string,
    intent: ScoreContext["sessionIntent"],
    primeMultiplier: number,
  ): string {
    const enrichedIntent = deriveBlockIntent(
      blockContext?.blockType,
      blockContext?.weekRole,
      intent,
    );

    // Derive per-slot intent from block archetype + phase (pass dayIndex for day identity overrides)
    const slotIntent = programContext
      ? deriveSlotIntent(programContext, slotName, dayIndex)
      : undefined;

    const ctx: ScoreContext = {
      sport,
      goal,
      sessionIntent: enrichedIntent,
      alreadySelected,
      equipmentLevel,
      lowFatigue: effectiveLowFatigue,
      seed,
      slotName,
      slotIntent,
      familyBiases: sharedFamilyBiases,
      programContext,
      noveltyPressure: programContext?.noveltyPressure,
      generationId,
      resolvedAgentControls,
      dayIndex,
      blockExposure,
    };
    const { chosen, debugInfo } = ranked(pool, ctx, primeMultiplier);
    debugInfos.push(debugInfo);
    alreadySelected.add(chosen);

    // Record to block exposure tracker so subsequent weeks penalise this choice
    if (blockExposure) {
      const prevCount = blockExposure.getCount(slotName, chosen);
      blockExposure.record(slotName, chosen);

      if (process.env.NODE_ENV !== "production") {
        const family = getExerciseFamily(chosen);
        const exposurePenaltyApplied = prevCount >= 3 ? 14 : prevCount === 2 ? 9 : prevCount === 1 ? 5 : 0;

        // [FamilyRotationAudit] — per-pick exposure + family context
        console.log("[FamilyRotationAudit]", JSON.stringify({
          slot: slotName,
          week: blockExposure.currentWeek,
          phase: programContext?.currentPhase ?? "unknown",
          movementFamily: family,
          selected: chosen,
          priorBlockUses: prevCount,
          exposurePenaltyApplied,
          slotExposureSoFar: Object.fromEntries(blockExposure.getSlotExposure(slotName)),
          top3: debugInfo.top3.map((c) => ({ name: c.name, score: Number(c.score.toFixed(2)) })),
        }));

        // [SelectionDecisionAudit] — shows which scoring dimensions drove the decision
        // and confirms that legacy penalties are no longer the primary steering force.
        const winner = debugInfo.top3[0];
        const winnerBreakdown = winner?.breakdown;
        if (winnerBreakdown) {
          const primaryDrivers: string[] = [];
          if (winnerBreakdown.phaseAffinityFit > 0) primaryDrivers.push(`phaseAffinity:+${winnerBreakdown.phaseAffinityFit.toFixed(2)}`);
          if (winnerBreakdown.sportFit > 0) primaryDrivers.push(`sportFit:+${winnerBreakdown.sportFit.toFixed(2)}`);
          if (winnerBreakdown.blockArchetypeFit > 0) primaryDrivers.push(`archetype:+${winnerBreakdown.blockArchetypeFit.toFixed(2)}`);
          if (winnerBreakdown.clusterAlternativeBonus > 0) primaryDrivers.push(`clusterRotation:+${winnerBreakdown.clusterAlternativeBonus.toFixed(2)}`);
          if (winnerBreakdown.slotIntentFit > 0) primaryDrivers.push(`slotIntent:+${winnerBreakdown.slotIntentFit.toFixed(2)}`);

          const rotationGates: string[] = [];
          if (winnerBreakdown.blockExposurePenalty > 0) rotationGates.push(`exposure:-${winnerBreakdown.blockExposurePenalty}`);
          if (winnerBreakdown.movementClusterPenalty > 0) rotationGates.push(`clusterSat:-${winnerBreakdown.movementClusterPenalty.toFixed(2)}`);

          const guardrails: string[] = [];
          if (winnerBreakdown.fatiguePenalty > 0) guardrails.push(`fatigue:-${winnerBreakdown.fatiguePenalty}`);
          if (winnerBreakdown.complexityPenalty > 0) guardrails.push(`complexity:-${winnerBreakdown.complexityPenalty}`);
          if (winnerBreakdown.exactRepeatPenalty > 0) guardrails.push(`exactRepeat:-${winnerBreakdown.exactRepeatPenalty}`);
          if (winnerBreakdown.heroSuppressionPenalty > 0) guardrails.push(`heroSuppress:-${winnerBreakdown.heroSuppressionPenalty}`);

          const legacySignals: string[] = [];
          if (winnerBreakdown.contrastPenalty > 0) legacySignals.push(`contrast:-${winnerBreakdown.contrastPenalty.toFixed(2)}`);
          if (winnerBreakdown.slotRepeatPenalty > 0) legacySignals.push(`slotRepeat:-${winnerBreakdown.slotRepeatPenalty.toFixed(2)}`);
          if (winnerBreakdown.overusePenalty > 0) legacySignals.push(`overuse:-${winnerBreakdown.overusePenalty.toFixed(2)}`);
          // recentUsePenalty is always 0 — included in schema only for compat

          console.log("[SelectionDecisionAudit]", JSON.stringify({
            slot: slotName,
            week: blockExposure.currentWeek,
            phase: programContext?.currentPhase ?? "unknown",
            selected: chosen,
            movementFamily: family,
            score: Number(winner.score.toFixed(3)),
            primaryDrivers,       // what positively steered the decision
            rotationGates,        // exposure/cluster signals that suppressed others
            guardrailsApplied: guardrails,  // true constraints
            legacySignalsApplied: legacySignals,  // soft tiebreakers (should be small)
            equivalenceClusterHit: winnerBreakdown.movementClusterPenalty > 0,
            phaseAffinityBonus: winnerBreakdown.phaseAffinityFit,
            priorBlockExposure: prevCount,
          }));
        }
      }
    }

    auditSlotSelection(slotName, chosen, blockContext?.blockType, blockContext?.weekRole);
    return chosen;
  }

  const weekRole = blockContext?.weekRole;
  const lowerPowerPool = getLowerPowerPool(sport, neuralDemand, weekRole);
  const bilateralSquatPool = getBilateralSquatPool(sport, goal);
  const bilateralHingePool = getBilateralHingePool(sport, goal, lowFatigue);
  const upperPushPool = getUpperPushPool(sport);

  const lower_power                = pick(lowerPowerPool,               "lower_power",               ["power", "speed", "elastic"],            1.0);
  // Per-session power variety: d2/d3/d4 use the same pool but alreadySelected prevents repeats
  // We use different prime multipliers so the scorer's tiebreaker lands on different candidates
  const lower_power_d2             = pick(lowerPowerPool,               "lower_power_d2",            ["power", "elastic", "speed"],            1.05);
  const lower_power_d3             = pick(lowerPowerPool,               "lower_power_d3",            ["speed", "power", "elastic"],            1.10);
  const lower_power_d4             = pick(lowerPowerPool,               "lower_power_d4",            ["elastic", "speed", "power"],            1.15);
  const bilateral_squat_strength   = pick(bilateralSquatPool,           "bilateral_squat_strength",  ["strength", "hypertrophy", "power"],      1.3);
  // Second squat day: same pool, but alreadySelected prevents exact repeat — guarantees within-week variety
  // Different prime multiplier shifts the tiebreaker so the runner-up from d1 scoring wins here.
  const bilateral_squat_strength_d2 = pick(bilateralSquatPool,          "bilateral_squat_strength_d2", ["hypertrophy", "strength", "power"],   1.35);
  const bilateral_hinge_strength   = pick(bilateralHingePool,           "bilateral_hinge_strength",  ["strength", "hypertrophy"],               1.7);
  const unilateral_lower           = pick(UNILATERAL_LOWER_SQUAT_POOL,  "unilateral_lower",          ["stability", "strength"],                 2.1);
  const unilateral_lower_alt       = pick(UNILATERAL_LOWER_HINGE_POOL,  "unilateral_lower_alt",      ["stability", "hypertrophy"],              2.5);
  const trunk_anti_rotation        = pick(TRUNK_ANTI_ROTATION_POOL,     "trunk_anti_rotation",       ["stability", "rotational"],               3.1);
  const trunk_anti_extension       = pick(TRUNK_ANTI_EXTENSION_POOL,    "trunk_anti_extension",      ["stability"],                             3.7);
  const upper_push_primary         = pick(upperPushPool,                "upper_push_primary",        ["strength", "hypertrophy", "power"],      4.3);
  const upper_push_secondary       = pick(UPPER_PUSH_SECONDARY_POOL,    "upper_push_secondary",      ["hypertrophy", "stability"],              4.9);
  const upper_pull_primary         = pick(UPPER_PULL_PRIMARY_POOL,      "upper_pull_primary",        ["strength", "hypertrophy"],               5.3);
  const upper_pull_secondary       = pick(UPPER_PULL_SECONDARY_POOL,    "upper_pull_secondary",      ["hypertrophy", "stability"],              5.9);
  const rotational_power           = pick(ROTATIONAL_POWER_POOL,        "rotational_power",          ["rotational", "power"],                   6.7);
  const conditioning_finisher      = pick(CONDITIONING_FINISHER_POOL,   "conditioning_finisher",     ["endurance", "speed"],                    7.3);
  const elastic_power              = pick(ELASTIC_POWER_POOL,           "elastic_power",             ["elastic", "speed"],                      8.1);
  const positional_support         = pick(POSITIONAL_SUPPORT_POOL,      "positional_support",        ["stability", "mobility"],                 8.9);

  // Block template: 4 variants selected by seed quartile
  const block_template_index = Math.floor(seed * 4) % 4;

  const sel: SlotExerciseSelection = {
    lower_power,
    lower_power_d2,
    lower_power_d3,
    lower_power_d4,
    bilateral_squat_strength,
    bilateral_squat_strength_d2,
    bilateral_hinge_strength,
    unilateral_lower,
    unilateral_lower_alt,
    trunk_anti_rotation,
    trunk_anti_extension,
    upper_push_primary,
    upper_push_secondary,
    upper_pull_primary,
    upper_pull_secondary,
    rotational_power,
    conditioning_finisher,
    elastic_power,
    positional_support,
    block_template_index,
    _debug: process.env.NODE_ENV !== "production" ? debugInfos : undefined,
  };

  // Register selections in overuse registry so next build penalises these
  // Only register for the primary (Week 1) selection — per-week secondary selections
  // must NOT register to avoid polluting the registry with 4x entries per build.
  if (registerSelections) {
    registerBuildSelections({
      lower_power, bilateral_squat_strength, bilateral_squat_strength_d2,
      bilateral_hinge_strength, unilateral_lower, trunk_anti_rotation, trunk_anti_extension,
    });
  }

  return sel;
}

// ─── Description Builders ─────────────────────────────────────────────────────

export function buildLowerPowerDescription(
  sel: SlotExerciseSelection,
  neuralDemand: "high" | "moderate" | "low",
  overrideExercise?: string,
  weekRole?: string,
): string {
  const exercise = overrideExercise ?? sel.lower_power;
  if (neuralDemand === "low" || weekRole === "deload") {
    return `Power primer (sub-maximal): ${exercise} — 3 × 3, technique and position focus, not max effort today`;
  }
  if (weekRole === "establish") {
    return `Power — Establish: ${exercise} (3–4 sets × 4–5 reps — teach the movement, moderate intent, position over maximal output)`;
  }
  if (weekRole === "intensify") {
    return `Power — Intensify: ${exercise} (3–4 sets × 3 reps — MAXIMUM intent, full 2–3 min rest, no fatigue accumulation)`;
  }
  return `Vertical/horizontal power: ${exercise} (3–5 sets × 3–5 reps — maximum intent, full reset between reps)`;
}

/**
 * Get the day-specific power exercise from the selection.
 * dayNumber is 1-based. Falls back to lower_power for any day > 4.
 */
export function getDayPowerExercise(sel: SlotExerciseSelection, dayNumber: number): string {
  switch (dayNumber) {
    case 2: return sel.lower_power_d2;
    case 3: return sel.lower_power_d3;
    case 4: return sel.lower_power_d4;
    default: return sel.lower_power;
  }
}

export function buildSquatPrimaryDescription(sel: SlotExerciseSelection): string {
  return `Primary squat pattern: ${sel.bilateral_squat_strength} — bilateral lower force production (3–5 sets × 3–6 reps for strength / 4 × 6–10 for performance)`;
}

export function buildHingePrimaryDescription(sel: SlotExerciseSelection): string {
  return `Primary hinge pattern: ${sel.bilateral_hinge_strength} — posterior chain force production (4–5 sets, load per goal)`;
}

export function buildHingeSecondaryDescription(sel: SlotExerciseSelection): string {
  return `Hinge complement: ${sel.bilateral_hinge_strength} as secondary anchor + posterior chain support (3 × 8–10)`;
}

export function buildUnilateralDescription(sel: SlotExerciseSelection, isHingeDay: boolean = false): string {
  const exercise = isHingeDay ? sel.unilateral_lower_alt : sel.unilateral_lower;
  return `Unilateral lower-body: ${exercise} — single-leg positional control and asymmetry exposure (3 × 8–10 each side)`;
}

export function buildTrunkDescription(sel: SlotExerciseSelection, hasRotational: boolean = false): string {
  if (hasRotational) {
    return `Rotational trunk integrity: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — anti-rotation and anti-extension pairing (2–3 sets each)`;
  }
  return `Trunk integrity: ${sel.trunk_anti_extension} (anti-extension) + ${sel.trunk_anti_rotation} (anti-rotation) — paired for session integrity (2–3 sets each)`;
}

export function buildUpperPushDescription(sel: SlotExerciseSelection, isPrimary: boolean = true): string {
  if (isPrimary) {
    return `Primary press: ${sel.upper_push_primary} — horizontal or vertical force production (4–5 sets × 3–6 reps for strength / 4 × 8–10 for performance)`;
  }
  return `Press complement: ${sel.upper_push_secondary} — volume accumulation and structural balance (3 × 8–12)`;
}

export function buildUpperPullDescription(sel: SlotExerciseSelection, isPrimary: boolean = true): string {
  if (isPrimary) {
    return `Primary pull: ${sel.upper_pull_primary} — vertical or horizontal pull for scapular strength and structural balance (4–5 sets × 3–6 reps strength / 4 × 6–10 performance)`;
  }
  return `Pull complement: ${sel.upper_pull_secondary} — volume and scapular integrity (3 × 10–12)`;
}

export function buildRotationalPowerDescription(sel: SlotExerciseSelection): string {
  return `Rotational power: ${sel.rotational_power} (4 × 5–6 each side — hip-driven, maximum rotational intent)`;
}

// ─── Block Template Variants ──────────────────────────────────────────────────
// 4 coaching-logical block ordering variants (A–D) for lower performance days.
// All variants obey neural demand ordering: power before strength before accessory.

export type BlockVariant = "squat_first" | "hinge_first" | "power_extended" | "elastic_lead";

export function getBlockVariant(templateIndex: number, sport: string | null): BlockVariant {
  const s = sport?.toLowerCase() ?? "";
  // Rotational sports bias toward power-extended to get more med ball volume up front
  if (s.includes("golf") || s.includes("baseball") || s.includes("tennis")) {
    const variants: BlockVariant[] = ["power_extended", "squat_first", "power_extended", "hinge_first"];
    return variants[templateIndex % 4];
  }
  // Track/sprint sports benefit from elastic_lead to target stiffness before loading
  if (s.includes("track") || s.includes("sprint")) {
    const variants: BlockVariant[] = ["elastic_lead", "squat_first", "elastic_lead", "hinge_first"];
    return variants[templateIndex % 4];
  }
  const variants: BlockVariant[] = ["squat_first", "hinge_first", "power_extended", "elastic_lead"];
  return variants[templateIndex % 4];
}

/** @deprecated Use getBlockVariant */
export function getBlockVariantForLowerDay(templateIndex: number): BlockVariant {
  return getBlockVariant(templateIndex, null);
}

export function describeBlockVariant(variant: BlockVariant, sel: SlotExerciseSelection): string {
  switch (variant) {
    case "squat_first":
      return [
        `Block order (Variant A — Squat anchor):`,
        `  1. Movement prep / dynamic warm-up (8–10 min)`,
        `  2. ${sel.lower_power} — power primer (3–5 × 3–5, max intent, full reset)`,
        `  3. ${sel.bilateral_squat_strength} — bilateral squat strength (3–5 × 3–6)`,
        `  4. ${sel.bilateral_hinge_strength} — hinge complement at moderate intensity (3 × 6–8)`,
        `  5. ${sel.unilateral_lower} — unilateral lower (3 × 8–10 per side)`,
        `  6. ${sel.trunk_anti_extension} + ${sel.trunk_anti_rotation} — trunk superset (2–3 × 8–12)`,
      ].join("\n");

    case "hinge_first":
      return [
        `Block order (Variant B — Hinge anchor):`,
        `  1. Movement prep / dynamic warm-up (8–10 min)`,
        `  2. ${sel.lower_power} — power primer (3–5 × 3–5, max intent, full reset)`,
        `  3. ${sel.bilateral_hinge_strength} — bilateral hinge strength (4–5 × 3–5)`,
        `  4. ${sel.bilateral_squat_strength} — squat complement at moderate intensity (3 × 5–8)`,
        `  5. ${sel.unilateral_lower_alt} — unilateral hinge variation (3 × 8–10 per side)`,
        `  6. ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — trunk superset (2–3 × 8–12)`,
      ].join("\n");

    case "power_extended":
      return [
        `Block order (Variant C — Power-extended):`,
        `  1. Movement prep / dynamic warm-up (8–10 min)`,
        `  2. ${sel.lower_power} — primary power block, extended (4–5 × 4–6, include contrast if appropriate)`,
        `  3. ${sel.rotational_power} — rotational power complement (3–4 × 5 per side)`,
        `  4. ${sel.bilateral_squat_strength} or ${sel.bilateral_hinge_strength} — loaded post-activation at moderate weight (3 × 5–8)`,
        `  5. ${sel.unilateral_lower} — unilateral lower (3 × 8 per side)`,
        `  6. ${sel.trunk_anti_rotation} — anti-rotation trunk work (2–3 × 10–12)`,
      ].join("\n");

    case "elastic_lead":
      return [
        `Block order (Variant D — Elastic / Reactive lead):`,
        `  1. Movement prep / dynamic warm-up (8–10 min)`,
        `  2. ${sel.elastic_power} — elastic / reactive power primer targeting stiffness (3–4 × 8–10 contacts, short rest)`,
        `  3. ${sel.lower_power} — higher-amplitude power (3–4 × 3–5, max intent)`,
        `  4. ${sel.bilateral_squat_strength} or ${sel.bilateral_hinge_strength} — bilateral strength anchor (4 × 4–6)`,
        `  5. ${sel.unilateral_lower} — unilateral control (3 × 8–10 per side)`,
        `  6. ${sel.trunk_anti_extension} + ${sel.trunk_anti_rotation} — trunk (2–3 × 8–12)`,
      ].join("\n");
  }
}

// ─── Archetype-specific session block order descriptions ──────────────────────
//
// These replace the generic Variant A/B/C/D template when a specific block
// archetype is active. Each archetype generates a DIFFERENT numbered step list
// that matches what buildCNSFlow actually produces for that archetype.
// The AI follows the numbered list — so this is the highest-leverage fix point.

function describeIntensificationBlockOrder(sel: SlotExerciseSelection): string {
  return [
    `### SESSION STRUCTURE — INTENSIFICATION STRENGTH BLOCK`,
    ``,
    `This is an INTENSIFICATION block. Session density is managed by LOAD, not exercise count.`,
    `Fewer movements. Heavier weights. Full rest between sets. No unilateral block.`,
    ``,
    `LOWER DAYS (SQUAT-ANCHOR):`,
    `  1. Neural prep (6–8 min) — hip CARs, thoracic extension, glute activation`,
    `  2. CNS PRIMER: [DAY-SPECIFIC — D1=${sel.lower_power} | D2=${sel.lower_power_d2} | D3=${sel.lower_power_d3}] — 2–3 × 3 reps. NOT a full power block. Primes neural drive. Full rest.`,
    `  3. PRIMARY COMPOUND: ${sel.bilateral_squat_strength} — 4–5 × 2–4 @ 83–92%. Maximum load. Controlled eccentric, explosive concentric. THIS IS THE SESSION.`,
    `  4. SECONDARY: ${sel.bilateral_hinge_strength} — 3 × 5–6 @ 75–80%. Posterior chain complement. NOT a second primary.`,
    `  5. TRUNK CLOSE: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — 2–3 sets only. Brief. Session close.`,
    `  *** NO UNILATERAL BLOCK. Load density is the training stimulus, not exercise variety. ***`,
    ``,
    `LOWER DAYS (HINGE-ANCHOR):`,
    `  1. Neural prep (6–8 min)`,
    `  2. CNS PRIMER: [DAY-SPECIFIC — D1=${sel.lower_power} | D2=${sel.lower_power_d2} | D3=${sel.lower_power_d3}] — 2–3 × 3 reps. Primes the pull pattern.`,
    `  3. PRIMARY COMPOUND: ${sel.bilateral_hinge_strength} — 4 × 2–4 @ 83–90%. Deliberate reset between reps. Maximum posterior chain engagement.`,
    `  4. SECONDARY: ${sel.unilateral_lower_alt} — 3 × 5–6 per side. Posterior chain integrity, not a volume block.`,
    `  5. TRUNK CLOSE: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — 2–3 sets only.`,
    `  *** NO UNILATERAL SQUAT BLOCK. Fewer total exercises = more load quality. ***`,
    ``,
    `UPPER DAYS:`,
    `  1. Upper prep — scapular positioning, wall slides, thoracic mobility`,
    `  2. PRIMARY COMPOUND: ${sel.upper_push_primary} or ${sel.upper_pull_primary} (anchor for this day) — 4–5 × 3–5 @ 80–90%. Heavy.`,
    `  3. STRUCTURAL BALANCE: pulling volume to complement pressing — 3–4 × 5–8`,
    `  4. TRUNK: ${sel.trunk_anti_rotation} — 2 sets. Brief.`,
    `  *** Sessions are tight. Heavy primary + structural balance + trunk. No isolation clusters. ***`,
  ].join("\n");
}

function describePowerElasticBlockOrder(sel: SlotExerciseSelection): string {
  return [
    `### SESSION STRUCTURE — POWER / ELASTIC CONVERSION BLOCK`,
    ``,
    `This is a POWER/ELASTIC block. Reactive and elastic output IS the primary training goal.`,
    `The bilateral compound is the contrast VEHICLE — it potentiates the reactive work.`,
    `Session is inverted vs standard: elastic/reactive comes FIRST when the CNS is freshest.`,
    ``,
    `LOWER DAYS (ALL):`,
    `  1. Reactive prep — ankle mobility → pogo series (2 × 10 sub-max) → 2 × 3 approach jumps. Activates SSC.`,
    `  2. ELASTIC/REACTIVE BLOCK (PRIMARY OUTPUT): ${sel.elastic_power} — minimum contact time, maximum stiffness. THEN [DAY-SPECIFIC POWER — D1=${sel.lower_power} | D2=${sel.lower_power_d2} | D3=${sel.lower_power_d3}] — maximum velocity expression. 3–4 sets × 4–5 reps each. FULL REST (2–3 min). *** MAIN TRAINING GOAL. ***`,
    `  3. CONTRAST COMPOUND: ${sel.bilateral_squat_strength} or ${sel.bilateral_hinge_strength} — 65–78% load, VELOCITY INTENT on every concentric. This lift potentiates the reactive work above. 4 × 3–5 reps. Bar speed is the intent.`,
    `  4. TRUNK CLOSE: ${sel.trunk_anti_rotation} — 2 sets. Anti-rotation. Brief close.`,
    `  *** NO UNILATERAL BLOCK. NO SECONDARY BILATERAL COMPOUND. Elastic output + one contrast compound + brief trunk. ***`,
    ``,
    `UPPER DAYS:`,
    `  1. Upper explosive prep — med ball chest throw (2 × 3) or band-resisted push-up explosive (2 × 5)`,
    `  2. UPPER POWER: ${sel.rotational_power} or med ball slam — 3 × 5 explosive reps. Upper elastic output.`,
    `  3. PRIMARY PRESS: ${sel.upper_push_primary} — 4 × 4–5 with VELOCITY INTENT on concentric`,
    `  4. STRUCTURAL PULL: ${sel.upper_pull_primary} — 4 × 6–8 for scapular integrity`,
    `  5. TRUNK: ${sel.trunk_anti_rotation} — 2 sets.`,
    `  *** No hypertrophy isolation clusters. Speed and power dominate this session. ***`,
  ].join("\n");
}

function describeAccumulationBlockOrder(sel: SlotExerciseSelection): string {
  return [
    `### SESSION STRUCTURE — FOUNDATION / ACCUMULATION BLOCK`,
    ``,
    `This is an ACCUMULATION block. Full movement stack. Volume and density are the training stimuli.`,
    `Every lower session includes a conditioning finisher — this is not optional. It is the accumulation stimulus.`,
    ``,
    `LOWER DAYS (SQUAT-ANCHOR):`,
    `  1. Lower-body neural prep — hip CARs, glute activation, ankle stiffness series`,
    `  2. POWER: [DAY-SPECIFIC — D1=${sel.lower_power} | D2=${sel.lower_power_d2} | D3=${sel.lower_power_d3} | D4=${sel.lower_power_d4}] — 3–4 × 4–5, maximal intent, full reset between reps. EACH SESSION USES A DIFFERENT MOVEMENT.`,
    `  3. PRIMARY: ${sel.bilateral_squat_strength} — 4 × 6–10 (volume accumulation, controlled tempo, full depth)`,
    `  4. SECONDARY HINGE: ${sel.bilateral_hinge_strength} — 3 × 8–10 (posterior chain complement)`,
    `  5. UNILATERAL: ${sel.unilateral_lower} — 3 × 8–10 per side (positional control + asymmetry exposure)`,
    `  6. TRUNK: ${sel.trunk_anti_extension} + ${sel.trunk_anti_rotation} — 2–3 sets each`,
    `  7. CONDITIONING FINISHER: ${sel.conditioning_finisher} — 3–4 sets, high effort sustainable pace. THIS IS NOT REST. Metabolic accumulation stimulus.`,
    ``,
    `LOWER DAYS (HINGE-ANCHOR):`,
    `  1. Lower-body neural prep`,
    `  2. POWER: [DAY-SPECIFIC — see D1/D2/D3/D4 assignment above] — 3–4 × 4–5. Different movement each session.`,
    `  3. PRIMARY: ${sel.bilateral_hinge_strength} — 4 × 6–10`,
    `  4. SECONDARY SQUAT: ${sel.bilateral_squat_strength} — 3 × 6–8`,
    `  5. UNILATERAL: ${sel.unilateral_lower_alt} — 3 × 8–10 per side`,
    `  6. TRUNK: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — 2–3 sets each`,
    `  7. CONDITIONING FINISHER: ${sel.conditioning_finisher} — 3–4 sets. Density. Closes the accumulation block.`,
    ``,
    `UPPER DAYS:`,
    `  1. Upper-body neural prep — scapular positioning, wall slides`,
    `  2. POWER PRIMER: med ball chest throw or push press variation — 3 × 4–5 explosive`,
    `  3. PRIMARY: ${sel.upper_push_primary} or ${sel.upper_pull_primary} (day anchor) — 4 × 6–10`,
    `  4. SECONDARY: structural balance pull or press — 3–4 × 8–12`,
    `  5. ACCESSORY PAIRS: 2–3 exercises for hypertrophy support`,
    `  6. TRUNK: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — 2 sets`,
  ].join("\n");
}

// ─── Variation Mandate ────────────────────────────────────────────────────────

export function buildVariationMandate(
  sel: SlotExerciseSelection,
  sport: string | null,
  blockArchetype?: string,
): string {
  const s = sport?.toLowerCase() ?? "";
  const isRotationalSport = s.includes("baseball") || s.includes("softball") || s.includes("tennis") || s.includes("golf");
  const isElasticSport = s.includes("track") || s.includes("sprint") || s.includes("basketball") || s.includes("volleyball");

  // ── Archetype-specific block order ────────────────────────────────────────
  // These override the generic Variant A/B/C/D for archetypes that have genuinely
  // different session structures. This is the fix for macro variation getting
  // choked at the session grammar level.
  let blockOrderSection: string;
  let validationChecklist: string[];

  if (blockArchetype === "INTENSIFICATION_STRENGTH") {
    blockOrderSection = describeIntensificationBlockOrder(sel);
    validationChecklist = [
      `- [ ] Day 1 power CNS primer: ${sel.lower_power} | Day 2: ${sel.lower_power_d2} | Day 3: ${sel.lower_power_d3}`,
      `- [ ] ${sel.bilateral_squat_strength} is used as the bilateral squat primary at 83–92%`,
      `- [ ] ${sel.bilateral_hinge_strength} is used as the bilateral hinge primary at 83–90%`,
      `- [ ] NO unilateral block on lower days — load density replaces volume`,
      `- [ ] ${sel.trunk_anti_rotation} is used for anti-rotation trunk close`,
      `- [ ] ${sel.upper_pull_primary} is used as the upper pull primary`,
      `- [ ] Sessions are TIGHT: 4–5 blocks maximum on lower days`,
      `- [ ] Power exercise is DIFFERENT across every lower session`,
    ];
  } else if (blockArchetype === "POWER_ELASTIC_CONVERSION") {
    blockOrderSection = describePowerElasticBlockOrder(sel);
    validationChecklist = [
      `- [ ] ${sel.elastic_power} appears as the FIRST training block (after prep) on lower days`,
      `- [ ] Day 1 reactive power: ${sel.lower_power} | Day 2: ${sel.lower_power_d2} | Day 3: ${sel.lower_power_d3}`,
      `- [ ] ${sel.bilateral_squat_strength} or ${sel.bilateral_hinge_strength} is used as CONTRAST VEHICLE at 65–78%`,
      `- [ ] NO unilateral block on lower days`,
      `- [ ] NO secondary bilateral compound on lower days`,
      `- [ ] ${sel.trunk_anti_rotation} is a brief trunk close (2 sets only)`,
      `- [ ] Sessions are SHORT: elastic + contrast + trunk = 4 blocks total`,
      `- [ ] Power exercise is DIFFERENT across every lower session`,
    ];
  } else if (blockArchetype === "FOUNDATION_ACCUMULATION" || blockArchetype === "WORK_CAPACITY_BLOCK") {
    blockOrderSection = describeAccumulationBlockOrder(sel);
    validationChecklist = [
      `- [ ] Day 1 power: ${sel.lower_power} | Day 2: ${sel.lower_power_d2} | Day 3: ${sel.lower_power_d3} | Day 4: ${sel.lower_power_d4}`,
      `- [ ] ${sel.bilateral_squat_strength} is used as the bilateral squat primary`,
      `- [ ] ${sel.bilateral_hinge_strength} is used as the bilateral hinge primary`,
      `- [ ] ${sel.unilateral_lower} is used for unilateral lower on squat-primary days`,
      `- [ ] ${sel.conditioning_finisher} is used as the conditioning finisher on EVERY lower session`,
      `- [ ] ${sel.trunk_anti_rotation} is used for anti-rotation trunk work`,
      `- [ ] ${sel.upper_pull_primary} is used as the upper pull primary`,
      `- [ ] No two sessions share the same primary lift`,
      `- [ ] Power exercise is DIFFERENT in every lower session`,
    ];
  } else {
    // Default: use generic variant A/B/C/D (unchanged from original)
    const blockVariant = getBlockVariant(sel.block_template_index, sport);
    const blockDescription = describeBlockVariant(blockVariant, sel);
    const variantLabel = blockVariant === "squat_first" ? "A" : blockVariant === "hinge_first" ? "B" : blockVariant === "power_extended" ? "C" : "D";
    blockOrderSection = `### SESSION BLOCK ORDER — VARIANT ${variantLabel}\n\n${blockDescription}`;
    validationChecklist = [
      `- [ ] Day 1 power: ${sel.lower_power} | Day 2: ${sel.lower_power_d2} | Day 3: ${sel.lower_power_d3}`,
      `- [ ] ${sel.bilateral_squat_strength} is used as the bilateral squat primary`,
      `- [ ] ${sel.bilateral_hinge_strength} is used as the bilateral hinge primary`,
      `- [ ] ${sel.unilateral_lower} is used for unilateral lower on squat-primary days`,
      `- [ ] ${sel.trunk_anti_rotation} is used for anti-rotation trunk work`,
      `- [ ] ${sel.upper_pull_primary} is used as the upper pull primary`,
      `- [ ] No two sessions share the same primary lift`,
      `- [ ] Power exercise is DIFFERENT in every lower session`,
      `- [ ] Block order follows Variant ${variantLabel} template`,
    ];
  }

  const lines = [
    `## ⚠️ CRITICAL EXERCISE MANDATE — LOCKED SELECTIONS — DO NOT OVERRIDE ⚠️`,
    ``,
    `These exercises were chosen by a pre-computation scoring engine based on sport fit,`,
    `intent matching, novelty rotation, and repeat-avoidance. They are FINAL for this build.`,
    ``,
    `OVERRIDE PROTECTION: Substituting any locked exercise below with a generic default`,
    `(Back Squat, Box Jump, Broad Jump, Pull-Up, Bulgarian Split Squat, Pallof Press, Conventional Deadlift)`,
    `is a BUILD FAILURE — unless that generic exercise IS the one explicitly listed.`,
    ``,
    `### LOCKED EXERCISES — USE THESE EXACTLY`,
    ``,
    `- Power / Explosive — Day 1: ${sel.lower_power}`,
    `- Power / Explosive — Day 2: ${sel.lower_power_d2}`,
    `- Power / Explosive — Day 3: ${sel.lower_power_d3}`,
    `- Power / Explosive — Day 4: ${sel.lower_power_d4}`,
    `- Elastic / Reactive: ${sel.elastic_power}`,
    `- Bilateral Squat Primary: ${sel.bilateral_squat_strength}`,
    `- Bilateral Hinge Primary: ${sel.bilateral_hinge_strength}`,
    `- Unilateral Lower (squat days): ${sel.unilateral_lower}`,
    `- Unilateral Lower (hinge days): ${sel.unilateral_lower_alt}`,
    `- Trunk Anti-Rotation: ${sel.trunk_anti_rotation}`,
    `- Trunk Anti-Extension: ${sel.trunk_anti_extension}`,
    `- Upper Push Primary: ${sel.upper_push_primary}`,
    `- Upper Push Secondary: ${sel.upper_push_secondary}`,
    `- Upper Pull Primary: ${sel.upper_pull_primary}`,
    `- Upper Pull Secondary: ${sel.upper_pull_secondary}`,
    `- Conditioning Finisher: ${sel.conditioning_finisher}`,
    isRotationalSport ? `- Rotational Power: ${sel.rotational_power}` : null,
    ``,
    `### SUBSTITUTION RULES — PROHIBITED DEFAULTS`,
    ``,
    `Do NOT use these unless they appear above as the locked selection:`,
    `- PROHIBITED as squat primary: Back Squat → use ${sel.bilateral_squat_strength}`,
    `- PROHIBITED as sole power exercise: Box Jump or Broad Jump every session → use the per-day power selection above`,
    `- PROHIBITED as hinge primary: Conventional Deadlift → use ${sel.bilateral_hinge_strength}`,
    `- PROHIBITED as unilateral primary: Bulgarian Split Squat → use ${sel.unilateral_lower}`,
    `- PROHIBITED as sole trunk exercise: Pallof Press → use ${sel.trunk_anti_rotation}`,
    `- PROHIBITED as upper pull primary: Unweighted Pull-Up → use ${sel.upper_pull_primary}`,
    ``,
    blockOrderSection,
    ``,
    `### CROSS-SESSION VARIETY RULES`,
    ``,
    `1. No exercise appears as a PRIMARY lift in more than one session.`,
    `2. If the same slot must appear on two days: Day 1 uses strength sets; Day 3 uses speed/technique sets at 65–75%.`,
    `3. Power choices ARE LOCKED PER DAY — use exactly the day-specific power exercise listed above for each session day.`,
    `   Day 1 lower sessions → ${sel.lower_power} | Day 2 lower sessions → ${sel.lower_power_d2} | Day 3 → ${sel.lower_power_d3} | Day 4 → ${sel.lower_power_d4}`,
    `4. At least 3 DIFFERENT trunk exercises must appear across the full week — not the same one every session.`,
    `5. Prep blocks are already varied by the Architecture Engine — do NOT override them with generic warm-up language.`,
    ``,
    `### FINAL VALIDATION CHECKLIST`,
    ``,
    ...validationChecklist,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
