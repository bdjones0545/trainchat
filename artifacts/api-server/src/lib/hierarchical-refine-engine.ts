/**
 * Hierarchical Refine Engine
 *
 * Applies week-scope or block-scope refinements to an existing training system.
 * This is the counterpart to the session-scope path (interpretEditRequest + applyEditPlan).
 *
 * Week scope:  mutates exercises in a single week's sessions (reps / rest / emphasis)
 * Block scope: rebuilds the block type, mutates ALL sessions, patches system metadata
 *
 * Returns a HierarchicalRefineResult that conversations.ts uses to build the
 * coaching response and persist the change log entry.
 */

import {
  db,
  sessionExercises,
  trainingSessions,
  trainingSystems,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

import { logger } from "./logger";
import { getFullTrainingSystem } from "./training-system-service";
import {
  buildMonthlyBlockPlanForType,
  type MonthlyBlockType,
  type SpecialPopBlockType,
} from "./monthly-block-planner";
import {
  resolveRefinementScope,
  type ScopeResolution,
  inferBlockTypeFromMessage,
  inferTransformationFromMessage,
} from "./refinement-scope-resolver";

type FullTrainingSystem = NonNullable<Awaited<ReturnType<typeof getFullTrainingSystem>>>;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HierarchicalRefineResult {
  applied: boolean;
  changeSummary: string;
  sessionCount: number;
  exerciseCount: number;
  scopeLabel: string;
  scopeResolution: ScopeResolution;
  failureReason?: string;
}

// ─── Transformation Mappings ──────────────────────────────────────────────────
// Role-aware prescription: each exercise gets a prescription based on its
// category and name, not a single global value applied to every exercise.

interface ExercisePrescription {
  sets?: number;
  reps?: string;
  rest?: string;
}

// Classify an exercise into boolean roles based on its DB category + name.
function classifyExercise(exercise: { name: string; category: string }) {
  const cat = exercise.category;
  const n = exercise.name.toLowerCase();

  const isPrimary            = cat === "primary";
  const isPower              = cat === "power";
  const isSecondary          = cat === "secondary";
  const isAccessoryOrAux     = cat === "accessory" || cat === "finisher" || cat === "conditioning";
  const isTrunk              = cat === "trunk";
  const isMobilityOrPrep     = cat === "warmup" || cat === "activation" || cat === "recovery";

  // Name-based refinements that override category when more specific
  const isPowerByName = /\b(jump|plyometric|broad jump|box jump|hang clean|power clean|power snatch|hang snatch|explosive|bound|sprint|trap bar jump|depth jump|hurdle)\b/.test(n);
  const isCoreByName  = /\b(pallof|ab wheel|plank|dead bug|bird dog|hollow|crunch|russian twist|leg raise|woodchop|anti.?rotation|cable crunch|ab rollout|side plank|copenhagen)\b/.test(n);

  return {
    isPrimary,
    isPower,
    isSecondary,
    isAccessoryOrAux,
    isCoreOrTrunk:   isTrunk || isCoreByName,
    isMobilityOrPrep,
    isPowerExercise: isPower || isPowerByName,
  };
}

/**
 * Returns the prescription (sets / reps / rest) for a single exercise given
 * the week- or block-scope transformation type.
 *
 * Rules:
 *  - Mobility/prep exercises: always preserved, no change.
 *  - Core/trunk: never forced into 3–6 rep strength ranges.
 *  - Accessory/auxiliary: supportive rep ranges, never strength-only ranges.
 *  - Primary compound lifts get the "headline" prescription for the transformation.
 *  - Power/plyometric exercises: protected from being turned into high-rep conditioning work.
 */
export function getPrescriptionForExerciseTransformation(
  exercise: { name: string; category: string },
  transformation: string,
): ExercisePrescription {
  const {
    isPrimary,
    isPower,
    isSecondary,
    isAccessoryOrAux,
    isCoreOrTrunk,
    isMobilityOrPrep,
    isPowerExercise,
  } = classifyExercise(exercise);

  switch (transformation) {
    // ── Strength focus ─────────────────────────────────────────────────────
    case "strength":
    case "strength_focus":
    case "increase_difficulty": {
      if (isMobilityOrPrep)   return {};                                          // preserve warmup/mobility
      if (isCoreOrTrunk)      return { reps: "10-15", rest: "60-90 sec" };        // quality, not 3-6
      if (isAccessoryOrAux)   return { reps: "8-15",  rest: "60-90 sec" };        // supportive role
      if (isSecondary)        return { sets: 3, reps: "5-8",  rest: "90-150 sec" };
      if (isPrimary || isPower) return { sets: 4, reps: "3-6", rest: "2-3 min" }; // main compound lifts
      return { reps: "8-12", rest: "60-90 sec" };
    }

    // ── Endurance / conditioning focus ─────────────────────────────────────
    case "endurance":
    case "endurance_focus":
    case "conditioning_focus": {
      if (isMobilityOrPrep)   return {};
      if (isPowerExercise)    return { reps: "3-5",   rest: "60-90 sec" };        // protect plyo intent
      if (isCoreOrTrunk)      return { sets: 3, reps: "15-20", rest: "30-45 sec" };
      if (isAccessoryOrAux)   return { sets: 3, reps: "12-20", rest: "30-60 sec" };
      if (isSecondary)        return { sets: 3, reps: "10-15", rest: "45-75 sec" };
      if (isPrimary)          return { sets: 3, reps: "8-12",  rest: "45-90 sec" };
      return { reps: "12-15", rest: "30-60 sec" };
    }

    // ── Power / explosive focus ────────────────────────────────────────────
    case "power":
    case "power_explosive_focus":
    case "speed_focus": {
      if (isMobilityOrPrep)   return {};
      if (isCoreOrTrunk)      return { reps: "8-12", rest: "90 sec" };            // supportive
      if (isAccessoryOrAux)   return { reps: "8-12", rest: "90 sec" };
      if (isSecondary)        return { sets: 3, reps: "3-5", rest: "2 min" };
      if (isPrimary || isPower) return { sets: 4, reps: "2-5", rest: "2-3 min" };
      return { reps: "3-5", rest: "90 sec" };
    }

    // ── Reduce time ────────────────────────────────────────────────────────
    case "reduce_time": {
      if (isMobilityOrPrep) return {};
      return { rest: "30-45 sec" };                                               // rest is the main lever
    }

    // ── Hypertrophy / muscle growth ────────────────────────────────────────
    // Hypertrophy is a distinct training quality — not just "more volume everywhere."
    // Primary lifts stay in moderate-heavy range; accessories absorb the volume increase.
    // Power/plyometric exercises are protected from high-rep hypertrophy work.
    // Core/trunk stays functional — not converted to generic bodybuilding sets.
    case "hypertrophy":
    case "hypertrophy_focus":
    case "muscle_growth":
    case "increase_volume": {
      if (isMobilityOrPrep)   return {};                                             // preserve warmup/mobility
      if (isPowerExercise)    return { reps: "3-5", rest: "90-120 sec" };            // protect plyo/explosive intent
      if (isCoreOrTrunk)      return { sets: 3, reps: "10-15", rest: "45-60 sec" }; // functional trunk, not 20-rep fatigue
      if (isAccessoryOrAux)   return { sets: 3, reps: "10-20", rest: "45-90 sec" }; // main volume lever
      if (isSecondary)        return { sets: 3, reps: "8-12",  rest: "60-120 sec" };
      if (isPrimary)          return { sets: 4, reps: "6-10",  rest: "90-180 sec" }; // moderate-heavy, quality reps
      return { reps: "10-15", rest: "60-90 sec" };
    }

    // ── Recovery / deload ─────────────────────────────────────────────────
    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
    case "decrease_difficulty":
    case "decrease_volume":
    case "lower_impact":
    case "home_gym":
    case "limited_space":
    case "desk_reset": {
      if (isMobilityOrPrep) return {};
      if (isCoreOrTrunk)    return { reps: "8-12",  rest: "60-90 sec" };
      if (isAccessoryOrAux) return { reps: "10-15", rest: "60-90 sec" };
      return { reps: "8-12", rest: "2-3 min" };
    }

    default:
      return { rest: "90 sec" };
  }
}

/**
 * After applying prescriptions, verify correctness and repair obvious violations.
 *
 * Violations detected and repaired:
 *  - endurance transformation but primary exercises still show 3–6 reps
 *  - strength transformation but core/accessory exercises show 3–6 reps
 *
 * Returns the number of exercises repaired.
 */
async function verifyAndRepairPrescriptions(
  exercises: Array<{ id: number; name: string; category: string; reps: string | null }>,
  transformation: string,
): Promise<number> {
  let repaired = 0;
  const isEndurance   = ["endurance", "endurance_focus", "conditioning_focus"].includes(transformation);
  const isStrength    = ["strength", "strength_focus", "increase_difficulty"].includes(transformation);
  const isHypertrophy = ["hypertrophy", "hypertrophy_focus", "muscle_growth", "increase_volume"].includes(transformation);

  // Pattern: low-rep strength ranges (2–6 reps)
  const LOW_REP_RE    = /^[2-6]$|^[23]-[456]$|^3-6$|^4-6$|^2-4$|^2-5$/;
  // Pattern: high-rep hypertrophy/accessory ranges (15+ reps)
  const HIGH_REP_RE   = /^1[5-9]$|^[2-9]\d$|^1[5-9]-\d+$|^[2-9]\d-\d+$/;

  for (const ex of exercises) {
    if (!ex.id) continue;
    const reps = (ex.reps ?? "").trim();
    const cls = classifyExercise(ex);

    if (isEndurance && LOW_REP_RE.test(reps)) {
      // Endurance transformation should not leave any exercise in low-rep strength ranges
      const fix = getPrescriptionForExerciseTransformation(ex, transformation);
      if (fix.reps) {
        await db.update(sessionExercises).set({ reps: fix.reps }).where(eq(sessionExercises.id, ex.id));
        repaired++;
      }
    } else if (isStrength && (cls.isCoreOrTrunk || cls.isAccessoryOrAux || cls.isMobilityOrPrep) && LOW_REP_RE.test(reps)) {
      // Strength transformation must not force 3–6 reps onto core, accessories, or mobility
      const fix = getPrescriptionForExerciseTransformation(ex, transformation);
      if (fix.reps) {
        await db.update(sessionExercises).set({ reps: fix.reps }).where(eq(sessionExercises.id, ex.id));
        repaired++;
      }
    } else if (isHypertrophy) {
      // Power/plyometric exercises must not be turned into high-rep hypertrophy work
      if (cls.isPowerExercise && HIGH_REP_RE.test(reps)) {
        const fix = getPrescriptionForExerciseTransformation(ex, transformation);
        if (fix.reps) {
          await db.update(sessionExercises).set({ reps: fix.reps }).where(eq(sessionExercises.id, ex.id));
          repaired++;
        }
      }
      // Mobility/prep must not be converted into generic hypertrophy sets
      if (cls.isMobilityOrPrep && reps !== "") {
        await db.update(sessionExercises).set({ reps: null }).where(eq(sessionExercises.id, ex.id));
        repaired++;
      }
    }
  }

  // ── Hypertrophy: ensure accessories actually received a volume increase ─────
  // The main prescription loop should have handled this, but run a safety-net
  // pass and flag sessions where no accessories exist at all.
  if (isHypertrophy) {
    const accessories = exercises.filter((ex) => ex.id && classifyExercise(ex).isAccessoryOrAux);

    if (accessories.length === 0) {
      logger.warn(
        { transformation },
        "[verifyAndRepairPrescriptions] No accessory/auxiliary exercises found in session during hypertrophy — volume increase could not be applied to accessories",
      );
    } else {
      // Accessories whose OLD reps were outside the hypertrophy accessory range
      // should already have been updated by the main loop.  Re-apply here as a
      // safety net to guarantee nothing was silently skipped.
      const HYPERTROPHY_ACCESSORY_RE = /\b(10|1[1-9]|20)\b/;
      for (const ex of accessories) {
        if (!ex.id) continue;
        const oldReps = (ex.reps ?? "").trim();
        if (!HYPERTROPHY_ACCESSORY_RE.test(oldReps)) {
          const fix = getPrescriptionForExerciseTransformation(ex, transformation);
          if (fix.reps || fix.sets || fix.rest) {
            const patch: Record<string, unknown> = {};
            if (fix.sets !== undefined) patch.sets = fix.sets;
            if (fix.reps !== undefined) patch.reps = fix.reps;
            if (fix.rest !== undefined) patch.rest = fix.rest;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.update(sessionExercises).set(patch as any).where(eq(sessionExercises.id, ex.id));
            repaired++;
          }
        }
      }
    }
  }

  return repaired;
}

// Maps transformation type → (session label suffix, emphasis text)

function sessionIdentityForTransformation(type: string): { label: string; emphasis: string } {
  switch (type) {
    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      return { label: "Power & Explosive Strength", emphasis: "Rate of force development, contrast training" };

    case "strength":
    case "strength_focus":
    case "increase_difficulty":
      return { label: "Strength Development", emphasis: "Progressive overload, bilateral compound movements" };

    case "hypertrophy":
    case "hypertrophy_focus":
    case "muscle_growth":
    case "increase_volume":
      return { label: "Hypertrophy & Volume", emphasis: "Mechanical tension, high time under tension" };

    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
      return { label: "Conditioning & Work Capacity", emphasis: "Energy system development, aerobic base" };

    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
      return { label: "Active Recovery", emphasis: "Tissue quality, parasympathetic restoration" };

    case "reduce_time":
      return { label: "Efficiency Session", emphasis: "High density, minimal rest protocols" };

    default:
      return { label: "Training Session", emphasis: "General athletic development" };
  }
}

// Maps block type string to a base transformation type
function transformationForBlockType(blockType: string): string {
  const map: Record<string, string> = {
    power_conversion: "power",
    strength_emphasis: "strength",
    hypertrophy_support: "hypertrophy",
    work_capacity: "endurance",
    re_entry_resilience: "recovery",
    accumulation: "hypertrophy",
    intensification: "strength",
  };
  return map[blockType] ?? "recovery";
}

// ─── Exercise Swap Tables ─────────────────────────────────────────────────────
// Canonical exercises per training focus × movement family.
// Index 0 = preferred canonical; subsequent entries = fallbacks.
// Only primary/power category exercises get swapped — accessories keep their
// identity and only receive prescription (reps/rest) adjustments.

const FOCUS_EXERCISES: Record<string, Record<string, string[]>> = {
  power: {
    squat_lunge:       ["Box Jump", "Jump Squat", "Broad Jump"],
    hinge_deadlift:    ["Power Clean", "Hang Power Snatch", "Kettlebell Swing"],
    push_press:        ["Push Press", "Push Jerk", "Plyometric Push-Up"],
    pull_row:          ["Hang High Pull", "Explosive Pull-Up"],
    jump_plyometric:   ["Depth Jump", "Hurdle Hop", "Box Jump"],
    carry_stability:   ["Farmer's Carry", "Suitcase Carry"],
    core_anti_rotation: ["Medicine Ball Rotational Throw", "Pallof Press"],
  },
  strength: {
    squat_lunge:       ["Barbell Back Squat", "Front Squat", "Bulgarian Split Squat"],
    hinge_deadlift:    ["Conventional Deadlift", "Trap Bar Deadlift", "Romanian Deadlift"],
    push_press:        ["Barbell Bench Press", "Overhead Press", "Weighted Dip"],
    pull_row:          ["Weighted Pull-Up", "Barbell Row", "Pendlay Row"],
    jump_plyometric:   ["Box Jump", "Broad Jump"],
    carry_stability:   ["Farmer's Carry", "Overhead Carry"],
    core_anti_rotation: ["Pallof Press", "Dead Bug"],
  },
  hypertrophy: {
    squat_lunge:       ["Hack Squat", "Leg Press", "Dumbbell Goblet Squat"],
    hinge_deadlift:    ["Romanian Deadlift", "Lying Leg Curl", "Hip Thrust"],
    push_press:        ["Incline Dumbbell Press", "Cable Fly", "Dumbbell Shoulder Press"],
    pull_row:          ["Lat Pulldown", "Cable Row", "Single-Arm Dumbbell Row"],
    jump_plyometric:   ["Step-Up", "Box Step-Up"],
    carry_stability:   ["Copenhagen Plank", "Pallof Press"],
    core_anti_rotation: ["Cable Crunch", "Hollow Hold", "Leg Raise"],
  },
  endurance: {
    squat_lunge:       ["Goblet Squat", "Walking Lunge", "Step-Up"],
    hinge_deadlift:    ["Dumbbell Romanian Deadlift", "Hip Thrust", "Glute Bridge"],
    push_press:        ["Dumbbell Bench Press", "Push-Up"],
    pull_row:          ["Dumbbell Row", "Lat Pulldown"],
    jump_plyometric:   ["Jump Rope", "Box Step-Up"],
    carry_stability:   ["Plank Walk", "Sandbag Carry"],
    core_anti_rotation: ["Plank", "Bird Dog"],
  },
  recovery: {
    squat_lunge:       ["Goblet Squat", "Bodyweight Squat"],
    hinge_deadlift:    ["Glute Bridge", "Hip Hinge Drill"],
    push_press:        ["Push-Up", "Dumbbell Press"],
    pull_row:          ["Face Pull", "Band Pull-Apart"],
    jump_plyometric:   ["Box Step-Up", "Low Box Step"],
    carry_stability:   ["Plank", "Dead Bug"],
    core_anti_rotation: ["Bird Dog", "Pallof Press"],
  },
};

function mapTransformationToFocusKey(transformation: string): string {
  switch (transformation) {
    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      return "power";
    case "strength":
    case "strength_focus":
    case "increase_difficulty":
      return "strength";
    case "hypertrophy":
    case "hypertrophy_focus":
    case "muscle_growth":
    case "increase_volume":
      return "hypertrophy";
    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
    case "reduce_time":
      return "endurance";
    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
    case "decrease_difficulty":
    case "decrease_volume":
    case "lower_impact":
    case "home_gym":
    case "limited_space":
    case "desk_reset":
      return "recovery";
    default:
      return "strength";
  }
}

// ─── Role-Aware Session Identity Derivation ───────────────────────────────────
// The originalLabel is the source of truth — it is never modified or rewritten.
// The transformation is applied as a clean suffix/modifier only.
// No day-index assumptions, no lower/upper/hinge inference, no word replacement.
//
// Examples:
//   "Total Body Strength" + power    → "Total Body Strength + Explosive Emphasis"
//   "Total Body Strength" + strength → "Total Body Strength + Strength Emphasis"
//   "Total Body Strength" + reduce_time → "Total Body Strength — Condensed"
//   "Acceleration + First Step" + strength → "Acceleration + First Step + Strength Support"

interface TransformationModifier {
  labelSuffix: string;   // appended with " " separator
  emphasisNote: string;  // appended to original emphasis with "; " separator
}

const TRANSFORMATION_MODIFIERS: Record<string, TransformationModifier> = {
  power:                { labelSuffix: "+ Explosive Emphasis",    emphasisNote: "rate of force development and explosive output added" },
  power_explosive_focus:{ labelSuffix: "+ Explosive Emphasis",    emphasisNote: "rate of force development and explosive output added" },
  speed_focus:          { labelSuffix: "+ Explosive Emphasis",    emphasisNote: "rate of force development and explosive output added" },
  strength:             { labelSuffix: "+ Strength Emphasis",     emphasisNote: "strength emphasis increased across all movements" },
  strength_focus:       { labelSuffix: "+ Strength Emphasis",     emphasisNote: "strength emphasis increased across all movements" },
  increase_difficulty:  { labelSuffix: "+ Strength Emphasis",     emphasisNote: "strength emphasis increased across all movements" },
  endurance:            { labelSuffix: "+ Conditioning Emphasis", emphasisNote: "conditioning density and work capacity increased" },
  endurance_focus:      { labelSuffix: "+ Conditioning Emphasis", emphasisNote: "conditioning density and work capacity increased" },
  conditioning_focus:   { labelSuffix: "+ Conditioning Emphasis", emphasisNote: "conditioning density and work capacity increased" },
  reduce_time:          { labelSuffix: "— Condensed",             emphasisNote: "condensed for time efficiency, minimal rest" },
  lower_impact:         { labelSuffix: "— Lower Impact",          emphasisNote: "lower impact version, reduced load and intensity" },
  home_gym:             { labelSuffix: "— Home Gym",              emphasisNote: "adapted for home gym, bodyweight and minimal equipment" },
  limited_space:        { labelSuffix: "— Limited Space",         emphasisNote: "adapted for limited space training" },
  desk_reset:           { labelSuffix: "— Desk Reset",            emphasisNote: "adapted as a desk-reset mobility flow" },
  recovery:             { labelSuffix: "— Recovery Focus",        emphasisNote: "scaled back for recovery and tissue quality" },
  recovery_focus:       { labelSuffix: "— Recovery Focus",        emphasisNote: "scaled back for recovery and tissue quality" },
  fatigue_management:   { labelSuffix: "— Recovery Focus",        emphasisNote: "scaled back for recovery and tissue quality" },
  decrease_difficulty:  { labelSuffix: "— Recovery Focus",        emphasisNote: "scaled back for recovery and tissue quality" },
  decrease_volume:      { labelSuffix: "— Recovery Focus",        emphasisNote: "scaled back for recovery and tissue quality" },
  hypertrophy:          { labelSuffix: "+ Hypertrophy Emphasis",  emphasisNote: "volume and hypertrophy emphasis increased" },
  hypertrophy_focus:    { labelSuffix: "+ Hypertrophy Emphasis",  emphasisNote: "volume and hypertrophy emphasis increased" },
  muscle_growth:        { labelSuffix: "+ Muscle Growth Emphasis", emphasisNote: "muscle growth focus — mechanical tension and accessory volume increased" },
  increase_volume:      { labelSuffix: "+ Hypertrophy Emphasis",  emphasisNote: "volume and hypertrophy emphasis increased" },
};

export function deriveRefinedSessionIdentity(
  originalLabel: string | null | undefined,
  originalEmphasis: string | null | undefined,
  transformation: string,
): { label: string; emphasis: string } {
  const raw = (originalLabel ?? "").trim();
  const emph = (originalEmphasis ?? "").trim();

  // No original label — fall back to the generic identity for this transformation.
  if (!raw) return sessionIdentityForTransformation(transformation);

  const mod = TRANSFORMATION_MODIFIERS[transformation];

  // Unknown transformation — preserve the session exactly as-is.
  if (!mod) return { label: raw, emphasis: emph || "General athletic development" };

  const label = `${raw} ${mod.labelSuffix}`;
  const emphasis = emph ? `${emph}; ${mod.emphasisNote}` : mod.emphasisNote;

  return { label, emphasis };
}

function detectExerciseMovementFamily(name: string): string {
  const n = name.toLowerCase();
  if (/\b(squat|lunge|step.?up|split squat|leg press|hack squat|goblet)\b/.test(n)) return "squat_lunge";
  if (/\b(deadlift|rdl|romanian|hip hinge|swing|hip thrust|glute bridge|back extension)\b/.test(n)) return "hinge_deadlift";
  if (/\b(bench press|push.?up|overhead press|military press|dip|shoulder press|incline|decline|chest fly|push jerk|push press)\b/.test(n)) return "push_press";
  if (/\b(pull.?up|chin.?up|\brow\b|lat pulldown|cable row|face pull|rear delt|inverted row|high pull)\b/.test(n)) return "pull_row";
  if (/\b(box jump|broad jump|depth jump|hurdle|bound|jump squat|plyometric|sprint)\b/.test(n)) return "jump_plyometric";
  if (/\b(carry|plank|dead bug|bird dog|pallof|anti.?rotation|copenhagen)\b/.test(n)) return "carry_stability";
  if (/\b(crunch|sit.?up|hollow|leg raise|woodchop|rotation|russian twist)\b/.test(n)) return "core_anti_rotation";
  return "unknown";
}

function exerciseAlreadyFitsFocus(exerciseName: string, targetList: string[]): boolean {
  const nameWords = exerciseName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return targetList.some((target) => {
    const targetWords = target.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return nameWords.some((nw) => targetWords.some((tw) => nw.includes(tw) || tw.includes(nw)));
  });
}

async function swapExercisesForFocus(
  session: { exercises: Array<{ id: number; name: string; category: string }> },
  transformation: string,
): Promise<number> {
  const focusKey = mapTransformationToFocusKey(transformation);
  const focusMap = FOCUS_EXERCISES[focusKey] ?? {};
  let swapCount = 0;

  for (const exercise of session.exercises) {
    if (!["primary", "power"].includes(exercise.category)) continue;

    const family = detectExerciseMovementFamily(exercise.name);
    if (family === "unknown") continue;

    const targetList = focusMap[family];
    if (!targetList?.length) continue;

    if (exerciseAlreadyFitsFocus(exercise.name, targetList)) continue;

    await db
      .update(sessionExercises)
      .set({ name: targetList[0] })
      .where(eq(sessionExercises.id, exercise.id));

    swapCount++;
  }

  return swapCount;
}

// ─── Athletic Overlay ─────────────────────────────────────────────────────────
// Additive enhancement: preserves block type and program structure, adds
// power primers and athletic coaching notes appropriate to the user's constraints.

const ATHLETIC_OVERLAY_RE = /\b(make (this|it|my|the program) (more |a bit |even )?(athletic|explosive|dynamic)|add (more |an |some )?(explosive|athletic|power) (work|primer|intent|focus|training)|more (athletic|explosive|dynamic)( overall| performance| focus)?|make (it|this) explosive)\b/i;

const ATHLETIC_COACHING_NOTE = "Move with intent — speed of execution is a training variable. Focus on force expression, not just completion.";

interface AthleticPrimer {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
}

function selectAthleticPrimer(
  equipment: string[],
  painConstraints: string[],
  excludedExercises: string[] = [],
): AthleticPrimer {
  const hasKneePain = painConstraints.some(c => /knee|acl|meniscus|patella|quad tendon/i.test(c));
  const hasShoulderPain = painConstraints.some(c => /shoulder|rotator|labrum/i.test(c));
  const hasLowerBackPain = painConstraints.some(c => /back|lumbar|disc|spine/i.test(c));
  const equipStr = equipment.join(" ").toLowerCase();
  const hasDumbbellsOnly = equipment.length > 0 && /dumbbell|db/.test(equipStr) && !/barbell/.test(equipStr);
  const isExcluded = (name: string) => excludedExercises.some(e => e.toLowerCase() === name.toLowerCase());

  if (hasKneePain) {
    const opts: AthleticPrimer[] = [
      { name: "Medicine Ball Slam", sets: 3, reps: "5", rest: "90 sec", notes: "Total body power — full hip extension, slam with intent, reset between reps" },
      { name: "Explosive Hip Hinge", sets: 3, reps: "5", rest: "90 sec", notes: "Fast hip drive, neutral spine — focus on rate of force development through the hinge" },
      { name: "Pallof Press", sets: 3, reps: "8 each", rest: "60 sec", notes: "Anti-rotation power expression — press with intent and resist the rotation" },
    ];
    return opts.find(o => !isExcluded(o.name)) ?? opts[0];
  }

  if (hasShoulderPain) {
    const opts: AthleticPrimer[] = [
      { name: "Box Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Maximum vertical intent — land softly, step down, reset fully" },
      { name: "Broad Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Maximum horizontal power — stick the landing, absorb with both legs" },
    ];
    return opts.find(o => !isExcluded(o.name)) ?? opts[0];
  }

  if (hasLowerBackPain) {
    const opts: AthleticPrimer[] = [
      { name: "Box Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Lower box height — reactive quality focus, land softly with hip hinge" },
      { name: "Medicine Ball Chest Pass", sets: 3, reps: "6", rest: "60 sec", notes: "Upper body power expression — full extension, no lumbar shear" },
    ];
    return opts.find(o => !isExcluded(o.name)) ?? opts[0];
  }

  if (hasDumbbellsOnly) {
    const opts: AthleticPrimer[] = [
      { name: "Dumbbell Jump Squat", sets: 3, reps: "5", rest: "90 sec", notes: "Light DBs — explosive concentric, soft landing, full reset between reps" },
      { name: "Dumbbell Push Press", sets: 3, reps: "5", rest: "90 sec", notes: "Drive from legs — express power through the press, control the descent" },
      { name: "Dumbbell Power Clean", sets: 3, reps: "4", rest: "2 min", notes: "Explosive pull from knee — catch at shoulder with soft reception" },
    ];
    return opts.find(o => !isExcluded(o.name)) ?? opts[0];
  }

  const opts: AthleticPrimer[] = [
    { name: "Box Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Maximum intent each rep — step down, never jump down, full reset" },
    { name: "Broad Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Maximum horizontal power expression — stick the landing" },
    { name: "Trap Bar Jump", sets: 3, reps: "5", rest: "90 sec", notes: "Explosive pull from floor — light to moderate load, max bar speed" },
  ];
  return opts.find(o => !isExcluded(o.name)) ?? opts[0];
}

async function applyAthleticOverlay(
  systemId: number,
  fullSystem: FullTrainingSystem,
  resolution: ScopeResolution,
  _userMessage: string,
): Promise<HierarchicalRefineResult> {
  const metadata = ((fullSystem as any).metadata as Record<string, unknown>) ?? {};
  const goal = (metadata.goal as string | null) ?? null;
  const sport = (metadata.sport as string | null) ?? null;
  const equipment: string[] = Array.isArray(metadata.equipment) ? (metadata.equipment as string[]) : [];
  const painConstraints: string[] = Array.isArray(metadata.painConstraints) ? (metadata.painConstraints as string[]) : [];
  const excludedExercises: string[] = Array.isArray(metadata.excludedExercises) ? (metadata.excludedExercises as string[]) : [];

  const primer = selectAthleticPrimer(equipment, painConstraints, excludedExercises);

  const allSessions = fullSystem.phases.flatMap(p => p.weeks.flatMap(w => w.sessions));
  const totalDays = allSessions.filter(s => !s.isRestDay).length;

  let primersAdded = 0;
  let notesUpdated = 0;
  let overlaySessionCount = 0;
  const changesMade: string[] = [];

  // ── Step 1: Add power primer to first training session of each week ────────
  for (const phase of fullSystem.phases) {
    for (const week of phase.weeks) {
      const activeSessions = week.sessions.filter(s => !s.isRestDay);
      if (activeSessions.length === 0) continue;

      const firstSession = activeSessions[0];

      const hasPowerPrimer = firstSession.exercises.some(
        e => e.category === "power" || /jump|explosive|broad|box jump|plyometric|pogo|slam|bound/i.test(e.name),
      );

      if (!hasPowerPrimer && firstSession.exercises.length > 0) {
        const existingIds = firstSession.exercises
          .map(e => e.id)
          .filter((id): id is number => id != null);

        if (existingIds.length > 0) {
          await db
            .update(sessionExercises)
            .set({ orderIndex: sql`${sessionExercises.orderIndex} + 1` })
            .where(inArray(sessionExercises.id, existingIds));
        }

        await db.insert(sessionExercises).values({
          trainingSessionId: firstSession.id,
          name: primer.name,
          category: "power",
          sets: primer.sets,
          reps: primer.reps,
          rest: primer.rest,
          notes: primer.notes,
          orderIndex: 0,
        });
        primersAdded++;
        overlaySessionCount++;
      }
    }
  }

  // ── Step 2: Add athletic coaching notes to primary lifts ──────────────────
  for (const session of allSessions) {
    if (session.isRestDay) continue;
    for (const exercise of session.exercises) {
      if (exercise.category !== "primary") continue;
      const existingNote = exercise.notes ?? null;
      if (existingNote && /intent|express|force/i.test(existingNote)) continue;

      const newNote = existingNote
        ? `${existingNote}. ${ATHLETIC_COACHING_NOTE}`
        : ATHLETIC_COACHING_NOTE;

      await db
        .update(sessionExercises)
        .set({ notes: newNote })
        .where(eq(sessionExercises.id, exercise.id));
      notesUpdated++;
    }
  }

  // ── Deterministic fallback — guarantee at least one change ────────────────
  let fallbackApplied = false;
  if (primersAdded === 0 && notesUpdated === 0) {
    const firstExercise = allSessions
      .filter(s => !s.isRestDay)
      .flatMap(s => s.exercises)
      .find(e => e.id != null);

    if (firstExercise) {
      await db
        .update(sessionExercises)
        .set({ notes: ATHLETIC_COACHING_NOTE })
        .where(eq(sessionExercises.id, firstExercise.id));
      notesUpdated++;
      fallbackApplied = true;
    }
  }

  // ── Update system metadata ────────────────────────────────────────────────
  const applied = primersAdded > 0 || notesUpdated > 0;
  if (applied) {
    await db
      .update(trainingSystems)
      .set({
        metadata: {
          ...(((fullSystem as any).metadata as Record<string, unknown>) ?? {}),
          athleticOverlayApplied: true,
          athleticOverlayAt: new Date().toISOString(),
          athleticPrimer: primer.name,
        },
      })
      .where(eq(trainingSystems.id, systemId));

    if (primersAdded > 0) {
      changesMade.push(`Added ${primer.name} as explosive primer to ${primersAdded} session${primersAdded !== 1 ? "s" : ""}`);
    }
    if (notesUpdated > 0) {
      changesMade.push(`Updated ${notesUpdated} primary lift${notesUpdated !== 1 ? "s" : ""} with athletic intent cues`);
    }
  }

  logger.info(
    {
      activeSystemId: systemId,
      currentGoal: goal,
      sport,
      days: totalDays,
      equipment,
      painConstraints,
      overlayApplied: primersAdded > 0,
      fallbackApplied,
      changesMade,
      primersAdded,
      notesUpdated,
      failureReason: applied ? null : "no_exercises_found",
    },
    "[AthleticOverlay]",
  );

  const primerLine = primersAdded > 0
    ? `${primer.name} added as explosive primer to ${primersAdded} session${primersAdded !== 1 ? "s" : ""}`
    : "";
  const notesLine = notesUpdated > 0
    ? `${notesUpdated} primary lift${notesUpdated !== 1 ? "s" : ""} updated with athletic intent coaching cues`
    : "";
  const changeSummary = applied
    ? [primerLine, notesLine].filter(Boolean).join(". ") + "."
    : "No safe athletic changes could be applied with the current constraints.";

  return {
    applied,
    changeSummary,
    sessionCount: overlaySessionCount > 0 ? overlaySessionCount : Math.min(1, totalDays),
    exerciseCount: primersAdded + notesUpdated,
    scopeLabel: "athletic_overlay",
    scopeResolution: resolution,
    failureReason: applied ? undefined : "no_exercises_found",
  };
}

// ─── Week Scope ───────────────────────────────────────────────────────────────

async function applyWeekScope(
  systemId: number,
  fullSystem: FullTrainingSystem,
  resolution: ScopeResolution,
  userMessage: string,
): Promise<HierarchicalRefineResult> {
  const transformation =
    resolution.derivedTransformation ?? inferTransformationFromMessage(userMessage);

  // Identify target week(s)
  const targetWeekNumber = resolution.targetWeekNumber;
  const weeksToMutate = targetWeekNumber
    ? fullSystem.phases
        .flatMap((p) => p.weeks)
        .filter((w) => w.weekNumber === targetWeekNumber)
    : fullSystem.phases
        .flatMap((p) => p.weeks)
        .slice(-1); // default to most recent week if unspecified

  if (weeksToMutate.length === 0) {
    return {
      applied: false,
      changeSummary: "Could not find the target week in the current program.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "week",
      scopeResolution: resolution,
      failureReason: "target_week_not_found",
    };
  }

  const weekLabel = targetWeekNumber ? `Week ${targetWeekNumber}` : "current week";

  let exerciseCount = 0;
  let sessionCount = 0;
  let totalSwapped = 0;

  for (const week of weeksToMutate) {
    for (const session of week.sessions) {
      if (session.isRestDay) continue;

      // Update prescriptions (sets / reps / rest) per exercise, respecting role
      for (const exercise of session.exercises) {
        if (!exercise.id) continue;
        const p = getPrescriptionForExerciseTransformation(exercise, transformation);
        const patch: Record<string, unknown> = {};
        if (p.sets !== undefined) patch.sets = p.sets;
        if (p.reps !== undefined) patch.reps = p.reps;
        if (p.rest !== undefined) patch.rest = p.rest;
        if (Object.keys(patch).length > 0) {
          await db
            .update(sessionExercises)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set(patch as any)
            .where(eq(sessionExercises.id, exercise.id));
          exerciseCount++;
        }
      }

      // Verify and repair any prescription mismatches after applying
      await verifyAndRepairPrescriptions(
        session.exercises.map((e) => ({
          id: e.id ?? 0,
          name: e.name,
          category: e.category,
          reps: (e as any).reps ?? null,
        })),
        transformation,
      );

      // Swap primary exercises to match the target training focus
      const sessionSwaps = await swapExercisesForFocus(session, transformation);
      totalSwapped += sessionSwaps;

      // Derive a role-aware identity for this specific session, preserving its
      // original role (lower/upper/hinge/etc.) and blending the transformation
      // as a modifier instead of overwriting with a generic label.
      const refinedIdentity = deriveRefinedSessionIdentity(
        (session as any).label ?? null,
        (session as any).emphasis ?? null,
        transformation,
      );

      await db
        .update(trainingSessions)
        .set({ label: refinedIdentity.label, emphasis: refinedIdentity.emphasis })
        .where(eq(trainingSessions.id, session.id));

      sessionCount++;
    }
  }

  const swapSuffix = totalSwapped > 0
    ? `, ${totalSwapped} primary exercise${totalSwapped !== 1 ? "s" : ""} swapped to match ${transformation} focus`
    : "";
  const changeSummary = `${weekLabel} shifted to ${transformation} focus — updated ${sessionCount} session${sessionCount !== 1 ? "s" : ""} (${exerciseCount} prescription${exerciseCount !== 1 ? "s" : ""} adjusted${swapSuffix}).`;

  logger.info(
    { systemId, transformation, weekLabel, sessionCount, exerciseCount },
    "[HierarchicalRefine] Week scope applied"
  );

  return {
    applied: true,
    changeSummary,
    sessionCount,
    exerciseCount,
    scopeLabel: weekLabel,
    scopeResolution: resolution,
  };
}

// ─── Block Scope ──────────────────────────────────────────────────────────────

async function applyBlockScope(
  systemId: number,
  fullSystem: FullTrainingSystem,
  resolution: ScopeResolution,
  userMessage: string,
): Promise<HierarchicalRefineResult> {
  // Determine new block type
  const rawBlockType =
    resolution.derivedTransformation ?? inferBlockTypeFromMessage(userMessage) ?? "re_entry_resilience";

  const blockType = rawBlockType as MonthlyBlockType | SpecialPopBlockType;

  // Derive the matching transformation for exercises
  const transformation = transformationForBlockType(rawBlockType);

  // Build the new monthly block plan for metadata
  const newBlockPlan = buildMonthlyBlockPlanForType(
    blockType,
    ((fullSystem as any).metadata as any)?.sport ?? null,
    ((fullSystem as any).metadata as any)?.goal ?? null,
  );

  const identity = sessionIdentityForTransformation(transformation);

  let exerciseCount = 0;
  let sessionCount = 0;
  let totalSwapped = 0;

  // Apply to ALL sessions across ALL weeks
  for (const phase of fullSystem.phases) {
    for (const week of phase.weeks) {
      for (const session of week.sessions) {
        if (session.isRestDay) continue;

        // Update prescriptions per exercise, respecting role/category
        for (const exercise of session.exercises) {
          if (!exercise.id) continue;
          const p = getPrescriptionForExerciseTransformation(exercise, transformation);
          const patch: Record<string, unknown> = {};
          if (p.sets !== undefined) patch.sets = p.sets;
          if (p.reps !== undefined) patch.reps = p.reps;
          if (p.rest !== undefined) patch.rest = p.rest;
          if (Object.keys(patch).length > 0) {
            await db
              .update(sessionExercises)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .set(patch as any)
              .where(eq(sessionExercises.id, exercise.id));
            exerciseCount++;
          }
        }

        // Verify and repair any prescription mismatches after applying
        await verifyAndRepairPrescriptions(
          session.exercises.map((e) => ({
            id: e.id ?? 0,
            name: e.name,
            category: e.category,
            reps: (e as any).reps ?? null,
          })),
          transformation,
        );

        // Swap primary exercises to match the new block focus
        const sessionSwaps = await swapExercisesForFocus(session, transformation);
        totalSwapped += sessionSwaps;

        await db
          .update(trainingSessions)
          .set({ label: identity.label, emphasis: identity.emphasis })
          .where(eq(trainingSessions.id, session.id));

        sessionCount++;
      }
    }
  }

  // Update system metadata with new block info
  const currentMetadata = ((fullSystem as any).metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = {
    ...currentMetadata,
    blockType: newBlockPlan.blockType,
    blockDisplayName: newBlockPlan.displayName,
    blockMission: newBlockPlan.missionStatement,
    primaryAdaptation: newBlockPlan.primaryAdaptation,
    blockUpdatedAt: new Date().toISOString(),
  };

  await db
    .update(trainingSystems)
    .set({ metadata: updatedMetadata })
    .where(eq(trainingSystems.id, systemId));

  const swapSuffix = totalSwapped > 0
    ? `, ${totalSwapped} primary exercise${totalSwapped !== 1 ? "s" : ""} updated to match ${newBlockPlan.displayName}`
    : "";
  const adaptationLabel = newBlockPlan.primaryAdaptation
    ? newBlockPlan.primaryAdaptation.toLowerCase()
    : "performance focus shift";
  const changeSummary = `Block shifted to **${newBlockPlan.displayName}** — ${adaptationLabel}. Updated ${sessionCount} session${sessionCount !== 1 ? "s" : ""} (${exerciseCount} prescription${exerciseCount !== 1 ? "s" : ""} adjusted${swapSuffix}) across the full program.`;

  logger.info(
    { systemId, blockType, transformation, sessionCount, exerciseCount, displayName: newBlockPlan.displayName },
    "[HierarchicalRefine] Block scope applied"
  );

  return {
    applied: true,
    changeSummary,
    sessionCount,
    exerciseCount,
    scopeLabel: `block (${newBlockPlan.displayName})`,
    scopeResolution: resolution,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Runs the hierarchical refinement engine for a given system + user message.
 *
 * The caller has already determined this is week_scope or block_scope via
 * resolveRefinementScope. Pass the resolution in to skip the re-classification.
 */
export async function applyHierarchicalRefinement(opts: {
  systemId: number;
  userId: string;
  userMessage: string;
  scopeResolution: ScopeResolution;
}): Promise<HierarchicalRefineResult> {
  const { systemId, userMessage, scopeResolution } = opts;

  // Load fresh system state
  const fullSystem = await getFullTrainingSystem(systemId);
  if (!fullSystem) {
    return {
      applied: false,
      changeSummary: "Could not load the current training system.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "unknown",
      scopeResolution,
      failureReason: "system_not_found",
    };
  }

  try {
    // Athletic overlay — additive enhancement, not a block replacement.
    // Fires first so "make this more athletic / explosive" never falls through
    // to a pure block shift that can fail on programs with no sport context.
    if (ATHLETIC_OVERLAY_RE.test(userMessage)) {
      return await applyAthleticOverlay(systemId, fullSystem, scopeResolution, userMessage);
    }

    if (scopeResolution.scope === "week_scope") {
      return await applyWeekScope(systemId, fullSystem, scopeResolution, userMessage);
    }

    if (scopeResolution.scope === "block_scope") {
      return await applyBlockScope(systemId, fullSystem, scopeResolution, userMessage);
    }

    // Should never reach here — only call this for week or block scope
    return {
      applied: false,
      changeSummary: "Session scope requests are handled by the standard edit pipeline.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "session",
      scopeResolution,
      failureReason: "wrong_scope",
    };
  } catch (err: any) {
    logger.error(
      {
        err: err?.message,
        stack: err?.stack,
        scope: scopeResolution.scope,
        systemId,
        derivedTransformation: scopeResolution.derivedTransformation ?? null,
        userMessageSnippet: opts.userMessage.slice(0, 80),
      },
      "[ArchitectureChipFlow] Exception in hierarchical refinement engine"
    );

    return {
      applied: false,
      changeSummary: "Something went wrong applying that change — your program is unchanged.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: scopeResolution.scope,
      scopeResolution,
      failureReason: "engine_error",
    };
  }
}

/**
 * Convenience wrapper that also handles scope classification.
 * Use this when you don't have a pre-resolved scope.
 */
export async function applyHierarchicalRefinementWithClassification(opts: {
  systemId: number;
  userId: string;
  userMessage: string;
  currentWeekNumber?: number;
}): Promise<HierarchicalRefineResult & { scope: string }> {
  const resolution = resolveRefinementScope(opts.userMessage, {
    currentWeekNumber: opts.currentWeekNumber,
  });

  const result = await applyHierarchicalRefinement({
    systemId: opts.systemId,
    userId: opts.userId,
    userMessage: opts.userMessage,
    scopeResolution: resolution,
  });

  return { ...result, scope: resolution.scope };
}
