// ─── Exercise + Block Variation Engine ───────────────────────────────────────
//
// Slot-based exercise selection with ranked scoring — replaces seeded random
// pick with an explicit, inspectable scoring system.
//
// Problem solved:
//   Without this layer, the AI defaults to the same 4–5 anchors every build:
//   Broad Jump, Back Squat, Conventional Deadlift, Bulgarian Split Squat, Pallof Press.
//
// How it works:
//   1. Each movement slot maps to a candidate pool with annotated metadata.
//   2. A scoring function ranks candidates on: sport fit, intent fit, neural
//      demand match, fatigue cost, novelty bonus, and repeat/overuse penalty.
//   3. Seed provides a deterministic tiebreaker — stable within a build, varied
//      across builds — so two equally-scored exercises still spread across builds.
//   4. An overuse registry penalises exercises that have been selected too many
//      times in recent builds, preventing default anchors from auto-winning by
//      inertia.
//   5. Selected exercises are injected into the Architecture Brief as
//      prescriptions ("use X"), not options ("choose from X, Y, Z").
//
// Key guarantee: coaching correctness is NEVER sacrificed for novelty.
//   Every candidate in every pool is valid for its slot.
//
// Tasks covered:
//   T1  Slot system with 14 named slots
//   T2  Candidate pools (static, DB-first ready) with coaching metadata
//   T3  Explicit scoring formula: sportFit + intentFit + neuralFit + equipFit
//        + noveltyBonus − fatiguePenalty − overusePenalty − exactRepeatPenalty
//   T4  Novelty / repeat-avoidance via overuse registry + exactRepeat penalty
//   T5  4 block template variants (A–D) per session identity
//   T6  Sport category aware pools (soccer, golf, swim, MMA, hockey, track…)
//   T7  Coaching logic preserved — neural demand ordering enforced per variant
//   T9  Debug logging: slot, pool size, top 3 with scores, chosen, penalties
// ─────────────────────────────────────────────────────────────────────────────

// ─── Block Variation Engine Imports ──────────────────────────────────────────
import { getExerciseExtendedMeta, getExerciseFamily } from "./programs/exerciseExtendedMeta";
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
}

export interface SlotExerciseSelection {
  lower_power: string;
  bilateral_squat_strength: string;
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
  };
}

export interface SlotDebugInfo {
  slot: string;
  poolSize: number;
  top3: CandidateScore[];
  chosen: string;
  contextSport: string | null;
  contextIntent: string[];
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
 * Returns extra penalty for choosing the same exercise in the same slot consecutively.
 * Much sharper than the global contrast penalty because the user sees identical positions.
 * HIGH_VISIBILITY slots (lower_power, bilateral_squat, bilateral_hinge, unilateral_lower, trunk)
 * get an extra multiplier.
 */
function getSlotRepeatPenalty(slotName: string, exerciseName: string): number {
  const history = SLOT_CONTRAST_REGISTRY[slotName];
  if (!history || history.length === 0) return 0;

  const isHighVisibility = [
    "lower_power", "bilateral_squat_strength", "bilateral_hinge_strength",
    "unilateral_lower", "trunk_anti_rotation",
  ].includes(slotName);

  const multiplier = isHighVisibility ? 1.5 : 1.0;

  const len = history.length;
  if (history[len - 1] === exerciseName) return 5.0 * multiplier; // last build
  if (len >= 2 && history[len - 2] === exerciseName) return 3.0 * multiplier; // 2 builds ago
  if (len >= 3 && history[len - 3] === exerciseName) return 1.5 * multiplier; // 3 builds ago
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

/** How many of the last N builds included this exercise (proper sliding count). */
function getOveruseCount(name: string): number {
  return REGISTRY_BUILDS.filter((b) => b.exercises.includes(name)).length;
}

/**
 * Extra penalty for exercises used in the most recent builds.
 * Last build: −3, second-to-last: −1.5  → forces real contrast on repeated prompts.
 */
function getContrastPenalty(name: string): number {
  if (LAST_BUILD_SELECTIONS.has(name)) return 3.0;
  if (SECOND_LAST_BUILD_SELECTIONS.has(name)) return 1.5;
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

/**
 * Explicit per-exercise overused-anchor extra penalty.
 * Applied ON TOP of the isDefaultAnchor flag for the worst repeat offenders.
 * Does not ban these exercises — competitors must earn the slot.
 *
 * Tuned based on perceived-variance audit findings:
 * "hero" exercises that dominate visible positions need extra discounting.
 */
const ANCHOR_EXTRA_PENALTY: Record<string, number> = {
  // ── Explosive slot anchors ─────────────────────────────────────────────
  "Broad Jump": 3.0,        // most frequently surfacing explosive default
  "Box Jump": 3.0,          // ties with Broad Jump for default top pick
  "Pogo Hops": 2.0,         // appears in warmup AND power slot — double exposure

  // ── Primary squat slot anchors ────────────────────────────────────────
  "Back Squat": 2.5,        // universal default — needs strong discounting
  "Front Squat": 1.0,       // secondary default that surfaces too easily

  // ── Primary hinge slot anchors ─────────────────────────────────────────
  "Conventional Deadlift": 2.0,  // most commonly selected hinge
  "Romanian Deadlift": 0.5,      // appears when deadlift is penalized, still common

  // ── Unilateral slot anchors ────────────────────────────────────────────
  "Bulgarian Split Squat": 2.5,  // dominates unilateral slot when no sport filter
  "Rear-Foot Elevated Split Squat (RFESS)": 0.5, // close to BSS — also surfaces heavily

  // ── Trunk slot anchors ────────────────────────────────────────────────
  "Pallof Press": 2.5,           // most frequently selected anti-rotation default
  "Dead Bug": 2.0,               // dominates anti-extension when no sport context
  "Weighted Pull-Up": 1.0,       // upper pull default
};

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

  // ── Novelty bonus + anchor penalty ───────────────────────────────────────
  const defaultAnchorPenalty = meta.isDefaultAnchor ? -2.5 : 1.0;
  const anchorExtraPenalty = ANCHOR_EXTRA_PENALTY[meta.name] ?? 0;
  const baseNoveltyBonus = defaultAnchorPenalty - anchorExtraPenalty;
  // Scale anchor penalty by novelty pressure from similarity detection
  const noveltyPressureMultiplier = 1 + (ctx.noveltyPressure ?? 0) * 1.5;
  const anchorPenalty = meta.isDefaultAnchor ? (2.5 + anchorExtraPenalty) * noveltyPressureMultiplier : 0;
  const noveltyBonus = meta.isDefaultAnchor
    ? -anchorPenalty
    : Math.max(0, baseNoveltyBonus) * (1 + (ctx.noveltyPressure ?? 0) * 0.5);

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

  // ── Overuse penalty (0–6) ─────────────────────────────────────────────────
  const usageCount = getOveruseCount(meta.name);
  const overusePenalty = Math.min(6, usageCount * 1.2);

  // ── Contrast penalty (0–3) ────────────────────────────────────────────────
  const contrastPenalty = getContrastPenalty(meta.name);

  // ── Exact repeat penalty (0–5) ────────────────────────────────────────────
  const exactRepeatPenalty = ctx.alreadySelected.has(meta.name) ? 5 : 0;

  // ── Per-slot repeat penalty (0–7.5) ──────────────────────────────────────
  // Penalises choosing the same exercise in the same slot as a recent build.
  // Much sharper than the global contrast penalty — this is what makes the user
  // see a different "first explosive" or "primary squat" across generations.
  const slotRepeatPenalty = getSlotRepeatPenalty(ctx.slotName, meta.name);

  // ── Seed tiebreaker (0–1.5) ───────────────────────────────────────────────
  const seedTiebreaker = (((ctx.seed * slotPrimeMultiplier * 2654435761) % 1) + 1) % 1 * 1.5;

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

  // ── Total ─────────────────────────────────────────────────────────────────
  const total = sportFit + intentFit + neuralFit + equipFit + noveltyBonus
    - fatiguePenalty - overusePenalty - contrastPenalty - exactRepeatPenalty - slotRepeatPenalty
    + seedTiebreaker
    + blockArchetypeFit + currentPhaseFit + slotIntentFit + movementBiasFit
    + familyPreferenceFit + velocityIntentFit + stabilityDemandFit + progressionStyleFit
    - familyReductionPenalty - disallowedFamilyPenalty - complexityPenalty
    // Agent Control Layer dimensions
    - heroSuppressionPenalty
    + controlFamilyBoostFit - controlFamilyReductionPenalty
    + visibleSpineAlignmentFit
    + dayIdentityAlignmentFit
    + controlNoveltyBonus - controlNoveltyPenalty;

  return {
    name: meta.name,
    score: total,
    breakdown: {
      sportFit,
      intentFit,
      neuralFit,
      equipFit,
      noveltyBonus: baseNoveltyBonus,
      fatiguePenalty,
      overusePenalty,
      contrastPenalty,
      exactRepeatPenalty,
      seedTiebreaker,
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
    },
  };
}

function ranked(pool: ExerciseMeta[], ctx: ScoreContext, primeMultiplier: number): { chosen: string; debugInfo: SlotDebugInfo } {
  const scored = pool.map((m) => scoreCandidate(m, ctx, primeMultiplier));
  scored.sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  const chosen = scored[0]?.name ?? pool[0]?.name ?? "Back Squat";
  const chosenScore = scored[0] ?? null;

  const debugInfo: SlotDebugInfo = {
    slot: ctx.slotName,
    poolSize: pool.length,
    top3,
    chosen,
    contextSport: ctx.sport,
    contextIntent: ctx.sessionIntent,
  };

  if (process.env.NODE_ENV !== "production") {
    // ── Original audit log ────────────────────────────────────────────────
    console.log("[BuildAudit:Variation]", JSON.stringify({
      slot: ctx.slotName,
      sport: ctx.sport,
      poolSize: pool.length,
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
          // Agent Control Layer dimensions
          heroSuppressionPenalty: c.breakdown.heroSuppressionPenalty,
          controlFamilyBoostFit: c.breakdown.controlFamilyBoostFit,
          controlFamilyReductionPenalty: c.breakdown.controlFamilyReductionPenalty,
          visibleSpineAlignmentFit: c.breakdown.visibleSpineAlignmentFit,
          dayIdentityAlignmentFit: c.breakdown.dayIdentityAlignmentFit,
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
];

const LOWER_POWER_POOL_SUBMAXIMAL: ExerciseMeta[] = [
  { name: "Box Jump (sub-maximal, technique focus)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Broad Jump (approach, stick landing)", sportTags: [], intentTags: ["power", "stability"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Vertical Jump (reset between reps)", sportTags: [], intentTags: ["power"], neuralDemand: "moderate", fatigueCost: "low" },
  { name: "Medicine Ball Slam (explosive, low reactive demand)", sportTags: [], intentTags: ["power", "endurance"], neuralDemand: "moderate", fatigueCost: "low" },
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

// ─── Sport-Specific Pool Selection ────────────────────────────────────────────

function getLowerPowerPool(sport: string | null, neuralDemand: "high" | "moderate" | "low"): ExerciseMeta[] {
  if (neuralDemand === "low") return LOWER_POWER_POOL_SUBMAXIMAL;
  const s = sport?.toLowerCase() ?? "";
  // Swimming/rowing: lower power is still needed but not jump-heavy
  if (s.includes("swim") || s.includes("row")) {
    return LOWER_POWER_POOL.filter((e) => !e.name.toLowerCase().includes("jump") && !e.name.toLowerCase().includes("bound"));
  }
  // Golf/baseball/softball: rotational power is the primary power modality
  if (s.includes("golf") || s.includes("baseball") || s.includes("softball")) {
    return ROTATIONAL_POWER_POOL;
  }
  return LOWER_POWER_POOL;
}

function getBilateralSquatPool(sport: string | null, goal: string | null): ExerciseMeta[] {
  const s = sport?.toLowerCase() ?? "";
  const g = goal?.toLowerCase() ?? "";
  if (s.includes("basketball") || s.includes("volleyball")) return BILATERAL_SQUAT_JOINT_FRIENDLY;
  if (g.includes("strength") || g.includes("powerlifting")) return BILATERAL_SQUAT_STRENGTH_FOCUS;
  if (g.includes("hypertrophy") || g.includes("bodybuilding")) return BILATERAL_SQUAT_HYPERTROPHY_FOCUS;
  return BILATERAL_SQUAT_POOL;
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
    };
    const { chosen, debugInfo } = ranked(pool, ctx, primeMultiplier);
    debugInfos.push(debugInfo);
    alreadySelected.add(chosen);
    auditSlotSelection(slotName, chosen, blockContext?.blockType, blockContext?.weekRole);
    return chosen;
  }

  const lowerPowerPool = getLowerPowerPool(sport, neuralDemand);
  const bilateralSquatPool = getBilateralSquatPool(sport, goal);
  const bilateralHingePool = getBilateralHingePool(sport, goal, lowFatigue);
  const upperPushPool = getUpperPushPool(sport);

  const lower_power                = pick(lowerPowerPool,               "lower_power",               ["power", "speed", "elastic"],            1.0);
  const bilateral_squat_strength   = pick(bilateralSquatPool,           "bilateral_squat_strength",  ["strength", "hypertrophy", "power"],      1.3);
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
    bilateral_squat_strength,
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
  registerBuildSelections({
    lower_power, bilateral_squat_strength, bilateral_hinge_strength,
    unilateral_lower, trunk_anti_rotation, trunk_anti_extension,
  });

  return sel;
}

// ─── Description Builders ─────────────────────────────────────────────────────

export function buildLowerPowerDescription(sel: SlotExerciseSelection, neuralDemand: "high" | "moderate" | "low"): string {
  if (neuralDemand === "low") {
    return `Power primer (sub-maximal): ${sel.lower_power} (3 × 3, technique focus — not max effort today)`;
  }
  return `Vertical/horizontal power: ${sel.lower_power} (3–5 sets × 3–5 reps — maximum intent, full reset between reps)`;
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

// ─── Variation Mandate ────────────────────────────────────────────────────────

export function buildVariationMandate(sel: SlotExerciseSelection, sport: string | null): string {
  const s = sport?.toLowerCase() ?? "";
  const isRotationalSport = s.includes("baseball") || s.includes("softball") || s.includes("tennis") || s.includes("golf");
  const isElasticSport = s.includes("track") || s.includes("sprint") || s.includes("basketball") || s.includes("volleyball");

  const blockVariant = getBlockVariant(sel.block_template_index, sport);
  const blockDescription = describeBlockVariant(blockVariant, sel);

  const variantLabel = blockVariant === "squat_first" ? "A" : blockVariant === "hinge_first" ? "B" : blockVariant === "power_extended" ? "C" : "D";

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
    `- Power / Explosive: ${sel.lower_power}`,
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
    isRotationalSport ? `- Rotational Power: ${sel.rotational_power}` : null,
    isElasticSport ? `- Elastic / Reactive Power: ${sel.elastic_power}` : null,
    ``,
    `### SUBSTITUTION RULES — PROHIBITED DEFAULTS`,
    ``,
    `Do NOT use these unless they appear above as the locked selection:`,
    `- PROHIBITED as squat primary: Back Squat → use ${sel.bilateral_squat_strength}`,
    `- PROHIBITED as power exercise: Box Jump → use ${sel.lower_power}`,
    `- PROHIBITED as power exercise: Broad Jump → use ${sel.lower_power}`,
    `- PROHIBITED as hinge primary: Conventional Deadlift → use ${sel.bilateral_hinge_strength}`,
    `- PROHIBITED as unilateral primary: Bulgarian Split Squat → use ${sel.unilateral_lower}`,
    `- PROHIBITED as sole trunk exercise: Pallof Press → use ${sel.trunk_anti_rotation}`,
    `- PROHIBITED as upper pull primary: Unweighted Pull-Up → use ${sel.upper_pull_primary}`,
    ``,
    `### SESSION BLOCK ORDER — VARIANT ${variantLabel}`,
    ``,
    blockDescription,
    ``,
    `### CROSS-SESSION VARIETY RULES`,
    ``,
    `1. No exercise appears as a PRIMARY lift in more than one session.`,
    `2. If the same slot must appear on two days: Day 1 uses strength sets; Day 3 uses speed/technique sets at 65–75%.`,
    `3. Power choices MUST differ across sessions. Day 1 = ${sel.lower_power}; other days use a different power modality.`,
    `4. At least 3 DIFFERENT trunk exercises must appear across the full week — not the same one every session.`,
    ``,
    `### FINAL VALIDATION CHECKLIST`,
    ``,
    `- [ ] ${sel.lower_power} is used as the power/explosive slot`,
    `- [ ] ${sel.bilateral_squat_strength} is used as the bilateral squat primary`,
    `- [ ] ${sel.bilateral_hinge_strength} is used as the bilateral hinge primary`,
    `- [ ] ${sel.unilateral_lower} is used for unilateral lower on squat-primary days`,
    `- [ ] ${sel.trunk_anti_rotation} is used for anti-rotation trunk work`,
    `- [ ] ${sel.upper_pull_primary} is used as the upper pull primary`,
    `- [ ] No two sessions share the same primary lift`,
    `- [ ] Power exercise differs across all sessions`,
    `- [ ] Block order follows Variant ${variantLabel} template`,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
