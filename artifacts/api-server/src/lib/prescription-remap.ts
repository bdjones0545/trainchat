/**
 * Prescription Remap + Context Modifier Layer
 *
 * Layer 1 — Remap
 *   Decides whether a replacement exercise should inherit the original
 *   prescription or receive a recalculated one based on its movement
 *   family and role. (same-family → preserve, different-family → remap)
 *
 * Layer 2 — Context Modifier
 *   After the base prescription is selected, adjusts sets/reps/rest using
 *   deterministic, table-driven training context:
 *     • Block archetype  (FOUNDATION_ACCUMULATION, INTENSIFICATION_STRENGTH, …)
 *     • Training focus   (strength, speed, mobility, hybrid)
 *     • Session goal     (strength, hypertrophy, power, recovery, …)
 *     • Exercise position (early, middle, late)
 *     • User level       (beginner, intermediate, advanced)
 *     • Fatigue/readiness
 *     • Pain/safety flag
 *
 * Safety rules (always win over any modifier):
 *   • Isolation/accessory exercises can never be prescribed < 6 reps.
 *   • Pain-flag active: sets reduced, no aggressive low-rep loading.
 *   • High fatigue: sets reduced, no max-effort loading.
 *
 * All decisions are deterministic and table-driven — no AI randomness.
 *
 * Logs:
 *   [ExerciseMutation:PrescriptionRemap:Input]
 *   [ExerciseMutation:PrescriptionRemap:Decision]
 *   [ExerciseMutation:PrescriptionContext:Modifiers]
 *   [ExerciseMutation:PrescriptionRemap:Output]
 */

import { logger } from "./logger";

// ─── Movement Classification (fine-grained) ────────────────────────────────────
//
// More precise than ExerciseRole for prescription protection purposes.
// Used to enforce hard rules per movement quality (e.g. explosive ceiling).

export type MovementClassification =
  | "power"               // Olympic lifts: clean, snatch, jerk, kettlebell swing
  | "plyometric"          // Jumps: box jump, broad jump, standing long jump, squat jump
  | "elastic"             // Continuous/cyclic: pogo hop, ankle hop, bounding, triple hop
  | "reactive"            // Depth/drop jumps: reactive SSC, depth jump, hurdle hop
  | "sprint"              // Linear sprints, acceleration runs, resisted sprints
  | "medball_power"       // Med ball throws, slams, rotational power
  | "maximal_strength"    // Barbell compounds at high intensity
  | "hypertrophy"         // Accessory/isolation with moderate-high reps
  | "resilience"          // Isometrics, tempo, slow eccentrics
  | "aerobic_density"     // Long-duration circuits, aerobic intervals
  | "mobility_corrective" // Mobility flows, correctives, prehab
  | "conditioning_metabolic"; // Metabolic conditioning: sleds, bike intervals, rowers

// ─── Primary Intent ────────────────────────────────────────────────────────────
//
// High-level intent that MUST be preserved across adaptation remapping.

export type PrimaryIntent =
  | "explosive"           // Velocity, neural drive, elastic energy — NEVER convert to fatigue
  | "maximal_strength"    // Max force production at low reps
  | "hypertrophy"         // Mechanical tension + metabolic stress at moderate reps
  | "resilience"          // Connective tissue, control, tempo
  | "aerobic_density"     // Cardiovascular and mitochondrial adaptation
  | "mobility_corrective" // Tissue quality, range, activation
  | "conditioning_metabolic"; // Metabolic fatigue tolerance

// Classifications whose biomechanical/neural intent must NEVER be overridden by endurance remapping
const EXPLOSIVE_CLASSIFICATIONS = new Set<MovementClassification>([
  "power", "plyometric", "elastic", "reactive", "sprint", "medball_power",
]);

// Hard prescription ceilings for explosive exercises
const EXPLOSIVE_REP_CEILING = 5;
const EXPLOSIVE_REST_FLOOR_SECONDS = 60; // minimum rest in seconds

// Fine-grained classification patterns (checked before role fallback)
const MOVEMENT_CLASSIFICATION_PATTERNS: Array<{
  classification: MovementClassification;
  patterns: RegExp[];
}> = [
  {
    classification: "sprint",
    patterns: [
      /\bsprint\b/i, /\bacceleration\s+(run|drill)/i, /fly\s+sprint/i,
      /\d+m\s+sprint/i, /resisted\s+sprint/i, /wicket\s+run/i,
    ],
  },
  {
    classification: "medball_power",
    patterns: [
      /med(icine)?\s+ball\s+(slam|throw|toss|pass|rotational|chest)/i,
      /rotational\s+(med\s+ball|throw)/i,
      /overhead\s+med(icine)?\s+ball/i,
      /chest\s+pass/i,
      /side\s+throw/i,
    ],
  },
  {
    classification: "elastic",
    patterns: [
      /pogo\s+hop/i, /ankle\s+hop/i, /continuous\s+hop/i,
      /elastic\s+bound/i, /triple\s+hop/i, /alternating\s+bound/i,
      /single\s+leg\s+hop/i, /\bhop\s+for\s+distance/i,
    ],
  },
  {
    classification: "reactive",
    patterns: [
      /drop\s+jump/i, /depth\s+jump/i, /reactive\s+jump/i,
      /hurdle\s+hop/i, /hurdle\s+jump/i, /box\s+drop/i,
      /shock\s+method/i, /reactive\s+drop/i,
    ],
  },
  {
    classification: "plyometric",
    patterns: [
      /box\s+jump/i, /squat\s+jump/i, /jump\s+squat/i,
      /broad\s+jump/i, /standing\s+long\s+jump/i, /vertical\s+jump/i,
      /tuck\s+jump/i, /split\s+jump/i, /lateral\s+bound/i,
      /\bbound\b/i, /plyometric/i, /\bplyo\b/i,
      /countermovement\s+jump/i, /cmj\b/i,
    ],
  },
  {
    classification: "power",
    patterns: [
      /power\s+clean/i, /power\s+snatch/i, /hang\s+clean/i, /hang\s+snatch/i,
      /clean\s+(and\s+)?jerk/i, /clean\s+pull/i, /snatch\s+pull/i, /\bjerk\b/i,
      /kettlebell\s+swing/i, /kb\s+swing/i,
    ],
  },
];

const INTENT_BY_CLASSIFICATION: Record<MovementClassification, PrimaryIntent> = {
  power:                 "explosive",
  plyometric:            "explosive",
  elastic:               "explosive",
  reactive:              "explosive",
  sprint:                "explosive",
  medball_power:         "explosive",
  maximal_strength:      "maximal_strength",
  hypertrophy:           "hypertrophy",
  resilience:            "resilience",
  aerobic_density:       "aerobic_density",
  mobility_corrective:   "mobility_corrective",
  conditioning_metabolic:"conditioning_metabolic",
};

/** Classify an exercise name into a fine-grained MovementClassification. */
export function classifyMovementClassification(name: string): MovementClassification {
  for (const { classification, patterns } of MOVEMENT_CLASSIFICATION_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return classification;
  }

  // Fallback via ExerciseRole (classified later in this file)
  const role = classifyExerciseRole(name);
  switch (role) {
    case "power_plyometric": return "plyometric";
    case "primary_strength":
    case "secondary_strength": return "maximal_strength";
    case "hypertrophy_accessory":
    case "isolation": return "hypertrophy";
    case "mobility_prehab": return "mobility_corrective";
    case "conditioning": return "conditioning_metabolic";
    default: return "hypertrophy";
  }
}

/** Returns the PrimaryIntent for an exercise by name. */
export function getPrimaryIntent(name: string): PrimaryIntent {
  return INTENT_BY_CLASSIFICATION[classifyMovementClassification(name)];
}

/** Returns true when the exercise has explosive primary intent that must be protected. */
export function isExplosiveExercise(name: string): boolean {
  return EXPLOSIVE_CLASSIFICATIONS.has(classifyMovementClassification(name));
}

// ─── Explosive Prescription Protection ─────────────────────────────────────────
//
// Enforces hard rep ceilings and rest floors for explosive exercises.
// Called during any adaptation remapping that could increase reps or shorten rest.

export interface ExplosiveProtectionResult {
  sets: number;
  reps: string;
  rest: string;
  intentPreserved: boolean;
  violations: string[];
}

/** Parses a rest string ("30–60 sec", "2 min", "90 sec") to total seconds. Returns null if unparseable. */
export function parseRestToSeconds(rest: string): number | null {
  const minMatch = rest.match(/(\d+)\s*min/i);
  const secMatch = rest.match(/(\d+)\s*sec/i);
  if (minMatch) return parseInt(minMatch[1], 10) * 60;
  if (secMatch) return parseInt(secMatch[1], 10);
  return null;
}

/**
 * Enforces explosive prescription protection rules.
 * Hard ceilings:
 *   - max reps per set: 5
 *   - min rest: 60 sec
 * Does NOT change sets (volume can be lowered separately via fatigue signal).
 */
export function enforceExplosivePrescriptionProtection(
  exerciseName: string,
  sets: number,
  reps: string,
  rest: string,
): ExplosiveProtectionResult {
  const violations: string[] = [];
  let protectedReps = reps;
  let protectedRest = rest;
  let intentPreserved = true;

  // Skip time-based reps (e.g. "30 sec")
  const isTimeBased = /sec|min/i.test(reps);

  if (!isTimeBased) {
    const rangeMatch = reps.match(/^(\d+)\s*[–\-]\s*(\d+)/);
    const singleMatch = reps.match(/^(\d+)$/);

    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10);
      const hi = parseInt(rangeMatch[2], 10);
      if (lo > EXPLOSIVE_REP_CEILING || hi > EXPLOSIVE_REP_CEILING) {
        const clampedLo = Math.min(lo, EXPLOSIVE_REP_CEILING);
        const clampedHi = Math.min(hi, EXPLOSIVE_REP_CEILING);
        protectedReps = clampedLo === clampedHi
          ? String(clampedLo)
          : `${clampedLo}–${clampedHi}`;
        violations.push(
          `reps capped: "${reps}" → "${protectedReps}" (explosive ceiling: ${EXPLOSIVE_REP_CEILING})`,
        );
        intentPreserved = false;
      }
    } else if (singleMatch) {
      const val = parseInt(singleMatch[1], 10);
      if (val > EXPLOSIVE_REP_CEILING) {
        protectedReps = String(EXPLOSIVE_REP_CEILING);
        violations.push(
          `reps capped: "${reps}" → "${protectedReps}" (explosive ceiling: ${EXPLOSIVE_REP_CEILING})`,
        );
        intentPreserved = false;
      }
    }
  }

  // Enforce rest floor
  const restSec = parseRestToSeconds(rest);
  if (restSec !== null && restSec < EXPLOSIVE_REST_FLOOR_SECONDS) {
    protectedRest = "60–90 sec";
    violations.push(
      `rest raised: "${rest}" → "${protectedRest}" (explosive rest floor: ${EXPLOSIVE_REST_FLOOR_SECONDS}s)`,
    );
    intentPreserved = false;
  }

  return { sets, reps: protectedReps, rest: protectedRest, intentPreserved, violations };
}

// ─── Prescription Validation ────────────────────────────────────────────────────
//
// Validates that a prescription does not violate movement-classification rules.
// Called as a post-remapping check; violations are logged as warnings.

export interface PrescriptionValidationViolation {
  exercise: string;
  classification: MovementClassification;
  field: "reps" | "rest";
  rule: string;
  value: string;
}

export interface PrescriptionValidationResult {
  valid: boolean;
  violations: PrescriptionValidationViolation[];
}

/**
 * Validates a single exercise prescription against its movement classification rules.
 *
 * Rejects:
 *   - power/plyometric/elastic/reactive/sprint/medball_power exercises with > 5 reps
 *   - explosive exercises with rest below 60 sec
 *   - sprint exercises with hypertrophy rep ranges (> 6 reps)
 */
export function validateExercisePrescription(
  name: string,
  reps: string,
  rest: string,
): PrescriptionValidationResult {
  const violations: PrescriptionValidationViolation[] = [];
  const classification = classifyMovementClassification(name);

  if (!EXPLOSIVE_CLASSIFICATIONS.has(classification)) {
    return { valid: true, violations: [] };
  }

  const isTimeBased = /sec|min/i.test(reps);
  if (!isTimeBased) {
    const repMatch = reps.match(/(\d+)/);
    if (repMatch) {
      const minRep = parseInt(repMatch[1], 10);
      if (minRep > EXPLOSIVE_REP_CEILING) {
        violations.push({
          exercise: name,
          classification,
          field: "reps",
          rule: `explosive exercises must not exceed ${EXPLOSIVE_REP_CEILING} reps/set`,
          value: reps,
        });
      }
    }
  }

  const restSec = parseRestToSeconds(rest);
  if (restSec !== null && restSec < EXPLOSIVE_REST_FLOOR_SECONDS) {
    violations.push({
      exercise: name,
      classification,
      field: "rest",
      rule: `explosive exercises require at least ${EXPLOSIVE_REST_FLOOR_SECONDS}s rest`,
      value: rest,
    });
  }

  return { valid: violations.length === 0, violations };
}

// ─── Exercise Role ─────────────────────────────────────────────────────────────

export type ExerciseRole =
  | "primary_strength"      // Main compound lifts: squat, deadlift, bench, press, row
  | "secondary_strength"    // Compound accessories: RDL, incline, front squat, Pendlay row
  | "hypertrophy_accessory" // DB/machine compounds: DB bench, cable row, incline DB
  | "isolation"             // Single-joint: curl, extension, lateral raise, leg curl, pressdown
  | "power_plyometric"      // Power/speed: power clean, snatch, box jump, bounds, sprint
  | "mobility_prehab"       // Prep/mobility: CARs, activation, corrective, prehab
  | "conditioning";         // Metabolic: sled, intervals, bike, rower

// ─── Movement Bucket ───────────────────────────────────────────────────────────

export type MovementBucket =
  | "squat_knee"      // Squat, leg press, lunge family
  | "hinge_hip"       // Deadlift, RDL, hip thrust, good morning family
  | "push_h"          // Bench press, push-up, chest press family
  | "push_v"          // Overhead press, push press, landmine press family
  | "pull_h"          // Row, face pull family
  | "pull_v"          // Pull-up, pulldown family
  | "power"           // Olympic lifts, jumps, throws, sprints
  | "isolation_upper" // Curls, extensions, lateral raises, pressdowns
  | "isolation_lower" // Leg curl, leg extension, calf raise, adductor
  | "core"            // Carries, planks, pallof, anti-rotation
  | "mobility"        // Mobility flows, activation, corrective
  | "conditioning";   // Conditioning work

// ─── Context Types ─────────────────────────────────────────────────────────────

export type BlockType =
  | "FOUNDATION_ACCUMULATION"
  | "INTENSIFICATION_STRENGTH"
  | "POWER_ELASTIC_CONVERSION"
  | "REBUILD_DELOAD";

export type TrainingFocus = "strength" | "speed" | "mobility" | "hybrid";

export type SessionGoal =
  | "strength"
  | "hypertrophy"
  | "power"
  | "recovery"
  | "movement_quality"
  | "conditioning";

export type ExercisePosition = "early" | "middle" | "late";

export type UserLevel = "beginner" | "intermediate" | "advanced";

export type FatigueLevel = "low" | "moderate" | "high";

export interface PrescriptionContext {
  blockType?: BlockType;
  trainingFocus?: TrainingFocus;
  sessionGoal?: SessionGoal;
  exercisePosition?: ExercisePosition;
  userLevel?: UserLevel;
  /** Current fatigue level — "high" triggers stress reduction */
  fatigueLevel?: FatigueLevel;
  /** Readiness level — "low" is treated as high fatigue */
  readiness?: FatigueLevel;
  /** True if user has active pain/injury flag — always reduces stress */
  hasPainFlag?: boolean;
}

// ─── Pattern tables ────────────────────────────────────────────────────────────

const ROLE_PATTERNS: Array<{ role: ExerciseRole; patterns: RegExp[] }> = [
  {
    role: "power_plyometric",
    patterns: [
      /power\s+clean/i, /power\s+snatch/i, /hang\s+clean/i, /hang\s+snatch/i,
      /clean\s+pull/i, /snatch\s+pull/i, /jerk/i,
      /box\s+jump/i, /depth\s+jump/i, /hurdle\s+jump/i, /broad\s+jump/i,
      /bound/i, /sprint/i, /acceleration/i, /plyometric/i, /plyo/i,
      /med\s+ball\s+(slam|throw|toss|pass)/i, /kettlebell\s+swing/i,
    ],
  },
  {
    role: "mobility_prehab",
    patterns: [
      /car\b/i, /leg\s+swing/i, /hip\s+circle/i, /ankle\s+circle/i,
      /hip\s+flexor/i, /world\s+greatest/i, /inchworm/i, /flow/i,
      /prying/i, /90.90/i, /band\s+pull/i, /face\s+pull.*warm/i,
      /activation/i, /prehab/i, /corrective/i, /mobility/i,
      /foam\s+roll/i, /lacrosse/i, /tissue/i, /soft\s+tissue/i,
    ],
  },
  {
    role: "conditioning",
    patterns: [
      /sled\s+(push|pull|drag)/i, /bike\s+(sprint|interval)/i,
      /assault\s+bike/i, /airdyne/i, /rower\s+interval/i, /tempo\s+run/i,
      /conditioning/i,
    ],
  },
  {
    role: "isolation",
    patterns: [
      /leg\s+curl/i, /hamstring\s+curl/i, /lying\s+curl/i, /seated\s+leg\s+curl/i,
      /leg\s+extension/i, /quad\s+extension/i,
      /calf\s+raise/i, /standing\s+calf/i, /seated\s+calf/i,
      /adductor/i, /abductor/i, /hip\s+abduction/i, /hip\s+adduction/i,
      /glute\s+kickback/i, /cable\s+kickback/i,
      /bicep[s]?\s+curl/i, /hammer\s+curl/i, /preacher\s+curl/i, /concentration\s+curl/i,
      /ez.?bar\s+curl/i, /cable\s+curl/i, /dumbbell\s+curl/i,
      /tricep[s]?\s+pressdown/i, /tricep[s]?\s+pushdown/i, /tricep[s]?\s+extension/i,
      /skull\s+crusher/i, /overhead\s+tricep/i, /cable\s+tricep/i,
      /lateral\s+raise/i, /side\s+lateral/i, /front\s+raise/i,
      /rear\s+delt\s+(fly|raise|row)/i, /reverse\s+fly/i, /cable\s+fly/i,
      /chest\s+fly/i, /dumbbell\s+fly/i, /pec\s+deck/i,
      /pullover/i, /straight.?arm\s+pulldown/i,
    ],
  },
  {
    role: "primary_strength",
    patterns: [
      /^(barbell\s+)?back\s+squat/i, /^(barbell\s+)?front\s+squat/i,
      /^(barbell\s+)?squat$/i, /^pause\s+squat/i, /^tempo\s+squat/i,
      /^(barbell\s+)?deadlift$/i, /^conventional\s+deadlift/i,
      /^(barbell\s+)?sumo\s+deadlift/i, /^trap\s+bar\s+deadlift/i,
      /^hex\s+bar\s+deadlift/i, /^(barbell\s+)?deficit\s+deadlift/i,
      /^(barbell\s+)?pause\s+deadlift/i, /^rack\s+pull/i,
      /^(barbell\s+)?bench\s+press$/i, /^(barbell\s+)?pause\s+bench/i,
      /^(barbell\s+)?incline\s+bench/i, /^(barbell\s+)?decline\s+bench/i,
      /^(barbell\s+)?overhead\s+press$/i, /^(barbell\s+)?military\s+press$/i,
      /^(barbell\s+)?ohp$/i, /^push\s+press$/i,
      /^(barbell\s+)?pendlay\s+row/i, /^(barbell\s+)?bent.?over\s+row/i,
      /^(barbell\s+)?yates\s+row/i,
    ],
  },
];

const BUCKET_PATTERNS: Array<{ bucket: MovementBucket; patterns: RegExp[] }> = [
  {
    bucket: "power",
    patterns: [
      /power\s+clean/i, /power\s+snatch/i, /hang\s+clean/i, /hang\s+snatch/i,
      /clean\s+(and\s+)?jerk/i, /clean\s+pull/i, /snatch\s+pull/i,
      /box\s+jump/i, /depth\s+jump/i, /hurdle\s+jump/i, /squat\s+jump/i,
      /broad\s+jump/i, /vertical\s+jump/i,
      /bound/i, /\bsprint\b/i, /acceleration/i, /kettlebell\s+swing/i,
      /med\s+ball/i,
    ],
  },
  {
    bucket: "mobility",
    patterns: [
      /car\b/i, /leg\s+swing/i, /hip\s+circle/i, /world\s+greatest/i,
      /inchworm/i, /flow/i, /prying/i, /90.90/i, /activation/i,
      /prehab/i, /corrective/i, /\bmobility\b/i, /foam\s+roll/i,
    ],
  },
  {
    bucket: "conditioning",
    patterns: [/sled\s+(push|pull|drag)/i, /assault\s+bike/i, /airdyne/i, /conditioning/i],
  },
  {
    bucket: "isolation_lower",
    patterns: [
      /leg\s+curl/i, /hamstring\s+curl/i, /lying\s+curl/i, /seated\s+(leg\s+)?curl/i,
      /leg\s+extension/i, /quad\s+extension/i,
      /calf\s+raise/i, /adductor/i, /abductor/i, /hip\s+ab(duction|ductor)/i,
      /glute\s+kickback/i,
    ],
  },
  {
    bucket: "isolation_upper",
    patterns: [
      /bicep[s]?\s+curl/i, /hammer\s+curl/i, /preacher\s+curl/i,
      /concentration\s+curl/i, /ez.?bar\s+curl/i,
      /\bcurl$/i,
      /tricep[s]?\s+(pressdown|pushdown|extension)/i, /skull\s+crusher/i,
      /overhead\s+tricep/i,
      /lateral\s+raise/i, /front\s+raise/i,
      /rear\s+delt/i, /reverse\s+fly/i, /cable\s+fly/i, /chest\s+fly/i,
      /pec\s+deck/i, /pullover/i, /straight.?arm\s+pulldown/i,
    ],
  },
  {
    bucket: "hinge_hip",
    patterns: [
      /deadlift/i, /rdl/i, /romanian/i, /stiff.?leg/i, /sldl/i,
      /hip\s+thrust/i, /glute\s+bridge/i, /good\s+morning/i,
      /swing/i, /nordic\s+curl/i, /ghr\b/i,
    ],
  },
  {
    bucket: "squat_knee",
    patterns: [
      /squat/i, /lunge/i, /split\s+squat/i, /bulgarian/i,
      /step.?up/i, /leg\s+press/i, /hack\s+squat/i,
      /pistol/i, /rear\s+foot\s+elevated/i, /rfess/i,
    ],
  },
  {
    bucket: "push_h",
    patterns: [
      /bench\s+press/i, /chest\s+press/i, /push.?up/i, /\bdip\b/i,
      /incline\s+press/i, /decline\s+press/i,
    ],
  },
  {
    bucket: "push_v",
    patterns: [
      /overhead\s+press/i, /shoulder\s+press/i, /military\s+press/i,
      /\bohp\b/i, /push\s+press/i, /z.?press/i, /landmine\s+press/i,
      /arnold\s+press/i,
    ],
  },
  {
    bucket: "pull_h",
    patterns: [
      /\brow\b/i, /bent.?over\s+row/i, /pendlay\s+row/i, /face\s+pull/i,
      /cable\s+row/i, /seated\s+row/i, /chest.?supported\s+row/i,
      /t.?bar\s+row/i,
    ],
  },
  {
    bucket: "pull_v",
    patterns: [
      /pull.?up/i, /chin.?up/i, /pulldown/i, /lat\s+pulldown/i,
    ],
  },
  {
    bucket: "core",
    patterns: [
      /plank/i, /dead\s+bug/i, /hollow/i, /pallof/i, /anti.?rotation/i,
      /carry/i, /ab\s+wheel/i, /cable\s+crunch/i, /hanging\s+leg/i,
    ],
  },
];

// ─── Classifiers ───────────────────────────────────────────────────────────────

export function classifyExerciseRole(name: string): ExerciseRole {
  for (const { role, patterns } of ROLE_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return role;
  }

  const bucket = classifyMovementBucket(name);
  const isBarbell  = /barbell/i.test(name);
  const isDumbbell = /dumbbell|\bdb\b/i.test(name);
  const isCable    = /cable/i.test(name);
  const isMachine  = /machine|lever/i.test(name);
  const isBodyweight = /push.?up|pull.?up|chin.?up|\bdip\b|ring|bodyweight|air\s+squat/i.test(name);

  if (bucket === "hinge_hip" || bucket === "squat_knee") {
    return isBarbell ? "primary_strength" : "secondary_strength";
  }
  if (bucket === "push_h" || bucket === "push_v" || bucket === "pull_h" || bucket === "pull_v") {
    if (isBarbell) return "primary_strength";
    if (isDumbbell || isCable || isMachine || isBodyweight) return "hypertrophy_accessory";
    return "secondary_strength";
  }
  if (bucket === "isolation_upper" || bucket === "isolation_lower") return "isolation";
  if (bucket === "power") return "power_plyometric";
  if (bucket === "mobility") return "mobility_prehab";
  if (bucket === "conditioning") return "conditioning";
  if (bucket === "core") return "hypertrophy_accessory";

  if (isBarbell) return "secondary_strength";
  if (isDumbbell || isCable || isMachine) return "hypertrophy_accessory";
  return "hypertrophy_accessory";
}

export function classifyMovementBucket(name: string): MovementBucket {
  for (const { bucket, patterns } of BUCKET_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return bucket;
  }
  return "core";
}

// ─── Same-family check ─────────────────────────────────────────────────────────

/**
 * Returns true when original and replacement share the same movement bucket
 * AND no incompatible role boundary is crossed.
 *
 *   Barbell RDL → Dumbbell RDL: same hinge_hip bucket, roles compatible → SAME
 *   Deadlift    → Leg Curl:     hinge_hip vs isolation_lower            → DIFFERENT
 *   Bench       → Triceps Pressdown: push_h vs isolation_upper          → DIFFERENT
 */
export function isSameFamilyAndRole(originalName: string, replacementName: string): boolean {
  const origBucket = classifyMovementBucket(originalName);
  const repBucket  = classifyMovementBucket(replacementName);
  const origRole   = classifyExerciseRole(originalName);
  const repRole    = classifyExerciseRole(replacementName);

  if (origBucket !== repBucket) return false;

  if (origRole === "isolation" && repRole === "isolation") return true;

  if (origRole === "power_plyometric" || repRole === "power_plyometric") {
    return origRole === repRole;
  }

  const strengthRoles = new Set<ExerciseRole>([
    "primary_strength", "secondary_strength", "hypertrophy_accessory",
  ]);
  if (strengthRoles.has(origRole) && strengthRoles.has(repRole)) return true;

  if (origRole === "mobility_prehab" && repRole === "mobility_prehab") return true;

  return false;
}

// ─── Base prescription defaults ────────────────────────────────────────────────

export interface DefaultPrescription {
  sets: number;
  reps: string;
  rest: string;
}

export const ROLE_DEFAULTS: Record<ExerciseRole, DefaultPrescription> = {
  primary_strength:      { sets: 4, reps: "3–5",     rest: "2–3 min" },
  secondary_strength:    { sets: 3, reps: "5–8",     rest: "90–120 sec" },
  hypertrophy_accessory: { sets: 3, reps: "8–12",    rest: "60–90 sec" },
  isolation:             { sets: 3, reps: "10–15",   rest: "45–75 sec" },
  power_plyometric:      { sets: 4, reps: "3–5",     rest: "2–3 min" },
  mobility_prehab:       { sets: 2, reps: "8–10",    rest: "30–45 sec" },
  conditioning:          { sets: 4, reps: "30–45 sec", rest: "45–60 sec" },
};

// ─── Block-archetype prescription tables ──────────────────────────────────────
//
// These replace the role-default prescription when a block archetype is known.
// Entries exist only for roles whose defaults should differ in that block.
// Missing role entries → role-default is used as-is.

const BLOCK_PRESCRIPTIONS: Partial<Record<BlockType, Partial<Record<ExerciseRole, DefaultPrescription>>>> = {
  FOUNDATION_ACCUMULATION: {
    primary_strength:      { sets: 4, reps: "6–10",   rest: "90–120 sec" },
    secondary_strength:    { sets: 3, reps: "8–12",   rest: "75–90 sec" },
    hypertrophy_accessory: { sets: 3, reps: "10–15",  rest: "60–75 sec" },
    isolation:             { sets: 3, reps: "12–20",  rest: "45–60 sec" },
    // power, mobility, conditioning use role defaults
  },

  INTENSIFICATION_STRENGTH: {
    primary_strength:      { sets: 4, reps: "2–5",    rest: "2–4 min" },
    secondary_strength:    { sets: 3, reps: "4–8",    rest: "2–3 min" },
    // accessory/isolation: intentionally kept in support ranges — do NOT drop to low reps
    hypertrophy_accessory: { sets: 3, reps: "8–12",   rest: "60–90 sec" },
    isolation:             { sets: 3, reps: "10–15",  rest: "45–75 sec" },
    power_plyometric:      { sets: 4, reps: "3–5",    rest: "2–3 min" },
    // mobility, conditioning use role defaults
  },

  POWER_ELASTIC_CONVERSION: {
    primary_strength:      { sets: 3, reps: "3–6",    rest: "2–3 min" },   // reduce volume for fatigue
    secondary_strength:    { sets: 3, reps: "5–8",    rest: "90–150 sec" },
    hypertrophy_accessory: { sets: 2, reps: "10–15",  rest: "60 sec" },    // lower fatigue footprint
    isolation:             { sets: 2, reps: "10–15",  rest: "45–60 sec" }, // lower fatigue footprint
    power_plyometric:      { sets: 4, reps: "2–5",    rest: "2–4 min" },   // core of the block
    // mobility, conditioning use role defaults
  },

  REBUILD_DELOAD: {
    primary_strength:      { sets: 3, reps: "5–8",    rest: "90 sec" },
    secondary_strength:    { sets: 2, reps: "8–12",   rest: "75 sec" },
    hypertrophy_accessory: { sets: 2, reps: "10–15",  rest: "45–60 sec" },
    isolation:             { sets: 2, reps: "10–15",  rest: "45–60 sec" },
    power_plyometric:      { sets: 3, reps: "3–5",    rest: "2 min" },
    mobility_prehab:       { sets: 2, reps: "8–12",   rest: "30 sec" },
    // conditioning use role defaults
  },
};

const BLOCK_RATIONALES: Record<BlockType, string> = {
  FOUNDATION_ACCUMULATION: "Adjusted for accumulation block: more repeatable volume and tissue tolerance.",
  INTENSIFICATION_STRENGTH: "Adjusted for intensification block: higher output on strength work while keeping accessories in support ranges.",
  POWER_ELASTIC_CONVERSION: "Adjusted for power conversion: high intent with fatigue controlled.",
  REBUILD_DELOAD: "Adjusted for rebuild/deload: lower stress and cleaner execution.",
};

// ─── Guardrails ────────────────────────────────────────────────────────────────

const ISOLATION_MIN_REPS = 6;

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function parseMinReps(repsStr: string): number {
  const match = repsStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Clamps the lower bound of a rep string to minReps.
 * Skips time-based strings (those containing "sec", "min", or trailing "s").
 *
 *   clampRepsMin("3–5", 5)   → "5–5" → represented as "5"
 *   clampRepsMin("8–12", 10) → "10–12"
 *   clampRepsMin("30 sec", 5) → "30 sec"  (unchanged)
 */
export function clampRepsMin(repsStr: string, minReps: number): string {
  if (/sec|min|\ds$/.test(repsStr)) return repsStr;

  const sep      = repsStr.includes("–") ? "–" : "-";
  const rangeMatch = repsStr.match(/^(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) {
    const lo = Math.max(parseInt(rangeMatch[1], 10), minReps);
    const hi = Math.max(parseInt(rangeMatch[2], 10), minReps);
    return lo === hi ? String(lo) : `${lo}${sep}${hi}`;
  }

  const single = parseInt(repsStr, 10);
  if (!isNaN(single)) return String(Math.max(single, minReps));

  return repsStr;
}

function guardrailReps(role: ExerciseRole, repsStr: string): string {
  if (role !== "isolation" && role !== "hypertrophy_accessory") return repsStr;
  return clampRepsMin(repsStr, ISOLATION_MIN_REPS);
}

// ─── Context Modifier Result ───────────────────────────────────────────────────

export interface ContextModifierResult {
  prescription: DefaultPrescription;
  appliedModifiers: string[];
  rationaleAdditions: string[];
  safetyWarnings: string[];
}

// ─── Context Modifier Function ─────────────────────────────────────────────────

/**
 * Applies training-context modifiers to a base prescription.
 *
 * Order of operations:
 *   1. Block archetype  (replaces base values with block-specific prescription)
 *   2. Exercise position — "late" reduces sets by 1
 *   3. User level       — "beginner" caps sets at 3, raises rep floor
 *   4. Fatigue/readiness — high fatigue / low readiness reduces sets by 1
 *   5. Pain/safety flag — reduces sets by 1, raises rep floor to 6
 *   6. Final guardrail  — isolation/accessory rep floor always enforced
 *
 * Modifiers never increase intensity — they can only reduce sets, raise rep
 * floors, or widen rest periods. The base prescription may already be more
 * conservative (e.g. REBUILD_DELOAD) and modifiers stack on top.
 */
export function applyPrescriptionContextModifiers(
  base: DefaultPrescription,
  role: ExerciseRole,
  context: PrescriptionContext,
): ContextModifierResult {
  let { sets, reps, rest } = { ...base };
  const appliedModifiers: string[] = [];
  const rationaleAdditions: string[] = [];
  const safetyWarnings: string[] = [];

  // ── 1. Block archetype ──────────────────────────────────────────────────────
  if (context.blockType) {
    const blockMod = BLOCK_PRESCRIPTIONS[context.blockType]?.[role];
    if (blockMod) {
      sets = blockMod.sets ?? sets;
      reps = blockMod.reps ?? reps;
      rest = blockMod.rest ?? rest;
      appliedModifiers.push(`block:${context.blockType}`);
      rationaleAdditions.push(BLOCK_RATIONALES[context.blockType]);
    }
  }

  // ── 2. Exercise position ────────────────────────────────────────────────────
  // "early" → no change (default)
  // "middle" → no change (default)
  // "late"   → reduce sets by 1 to manage accumulated fatigue
  if (context.exercisePosition === "late") {
    const prev = sets;
    sets = Math.max(2, sets - 1);
    if (sets !== prev) {
      appliedModifiers.push("position:late");
      rationaleAdditions.push("Sets reduced for late-session placement — quality over volume at this position.");
    }
  }

  // ── 3. User level ───────────────────────────────────────────────────────────
  if (context.userLevel === "beginner") {
    const prevSets = sets;
    sets = Math.min(3, sets);

    // Rep floors per role for beginners
    const beginnerRepFloor =
      role === "isolation" ? 10
      : role === "hypertrophy_accessory" ? 8
      : role === "power_plyometric" ? 5
      : 5;

    const clampedReps = clampRepsMin(reps, beginnerRepFloor);
    const setsChanged = sets !== prevSets;
    const repsChanged = clampedReps !== reps;
    if (setsChanged || repsChanged) {
      if (setsChanged) appliedModifiers.push("level:beginner:sets_capped");
      if (repsChanged) appliedModifiers.push("level:beginner:reps_floor");
      rationaleAdditions.push("Adjusted for beginner level: controlled volume and rep range for quality execution.");
      reps = clampedReps;
    }
  }

  // ── 4. Fatigue / readiness ──────────────────────────────────────────────────
  const highFatigue =
    context.fatigueLevel === "high" || context.readiness === "low";

  if (highFatigue) {
    const prevSets = sets;
    sets = Math.max(2, sets - 1);

    // Avoid max-effort low reps when fatigued
    const fatigueRepFloor =
      role === "primary_strength" || role === "power_plyometric" ? 5 : 8;
    const clampedReps = clampRepsMin(reps, fatigueRepFloor);
    const setsChanged = sets !== prevSets;
    const repsChanged = clampedReps !== reps;
    if (setsChanged || repsChanged) {
      if (setsChanged) appliedModifiers.push("readiness:reduced_sets");
      if (repsChanged) appliedModifiers.push("readiness:reps_floor");
      rationaleAdditions.push("Adjusted for readiness: reduced stress to preserve quality.");
      reps = clampedReps;
    }
  }

  // ── 5. Pain / safety flag ───────────────────────────────────────────────────
  if (context.hasPainFlag) {
    const prevSets = sets;
    sets = Math.max(2, sets - 1);

    const clampedReps = clampRepsMin(reps, 6);
    const setsChanged = sets !== prevSets;
    const repsChanged = clampedReps !== reps;
    if (setsChanged) appliedModifiers.push("safety:reduced_sets");
    if (repsChanged) appliedModifiers.push("safety:reps_floor_6");
    safetyWarnings.push("Pain/safety flag active — sets reduced, aggressive low-rep loading avoided.");
    rationaleAdditions.push("Adjusted for safety: lower stress and controlled execution.");
    reps = clampedReps;
  }

  // ── 6. Final isolation/accessory guardrail (always enforced) ────────────────
  if (role === "isolation" || role === "hypertrophy_accessory") {
    const clamped = clampRepsMin(reps, ISOLATION_MIN_REPS);
    if (clamped !== reps) {
      reps = clamped;
      appliedModifiers.push("guardrail:isolation_min_reps");
      safetyWarnings.push(`Isolation/accessory guardrail: reps clamped to minimum ${ISOLATION_MIN_REPS}.`);
    }
  }

  return {
    prescription: { sets, reps, rest },
    appliedModifiers,
    rationaleAdditions,
    safetyWarnings,
  };
}

// ─── Prescription Remap Result ─────────────────────────────────────────────────

export interface PrescriptionRemapResult {
  sets: number;
  reps: string;
  rest: string;
  remapped: boolean;
  originalRole: ExerciseRole;
  replacementRole: ExerciseRole;
  originalBucket: MovementBucket;
  replacementBucket: MovementBucket;
  /** Rationale for cross-family prescription remap (null when same-family) */
  rationale: string | null;
  /** Context modifiers that were applied */
  appliedModifiers: string[];
  /** Rationale additions from context modifiers (null when no context or no change) */
  contextRationale: string | null;
}

// ─── Input ─────────────────────────────────────────────────────────────────────

export interface PrescriptionRemapInput {
  originalName: string;
  replacementName: string;
  existingSets: number | null;
  existingReps: string | null;
  existingRest: string | null;
  /** Optional training context for Layer 2 context modifiers */
  context?: PrescriptionContext;
}

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Determines whether a replacement exercise requires a prescription remap,
 * then applies context modifiers to the resulting prescription.
 *
 * Returns a PrescriptionRemapResult — never null.
 *
 *   remapped: false  → prescription is preserved (original or close to it)
 *   remapped: true   → prescription was recalculated for the new role/family
 *
 * In both cases, context modifiers may further adjust the output.
 */
export function remapPrescriptionIfNeeded(input: PrescriptionRemapInput): PrescriptionRemapResult {
  const { originalName, replacementName, existingSets, existingReps, existingRest, context } = input;

  const origBucket = classifyMovementBucket(originalName);
  const repBucket  = classifyMovementBucket(replacementName);
  const origRole   = classifyExerciseRole(originalName);
  const repRole    = classifyExerciseRole(replacementName);

  logger.info(
    {
      originalName, replacementName,
      origBucket, repBucket, origRole, repRole,
      existingSets, existingReps, existingRest,
      context,
    },
    "[ExerciseMutation:PrescriptionRemap:Input]"
  );

  const sameFamily = isSameFamilyAndRole(originalName, replacementName);

  // ── Layer 1: Remap decision ─────────────────────────────────────────────────
  let decision: "preserve" | "remap";
  let remapRationale: string | null = null;

  if (sameFamily) {
    decision = "preserve";
  } else {
    decision = "remap";
    if (repRole === "isolation") {
      remapRationale = `Prescription adjusted — ${replacementName} is an isolation exercise, not a ${origRole.replace(/_/g, " ")} movement. Isolation exercises require moderate-to-high reps with shorter rest.`;
    } else if (repRole === "power_plyometric" && origRole !== "power_plyometric") {
      remapRationale = `Prescription adjusted — ${replacementName} is a power/plyometric exercise requiring low reps and full recovery rest.`;
    } else if (origRole === "power_plyometric" && repRole !== "power_plyometric") {
      remapRationale = `Prescription adjusted — ${replacementName} is not a power exercise; loading recalculated for its role as a ${repRole.replace(/_/g, " ")} movement.`;
    } else if (repRole === "mobility_prehab") {
      remapRationale = `Prescription adjusted — ${replacementName} is a mobility/prehab exercise with lower volume demands.`;
    } else {
      remapRationale = `Prescription adjusted — ${replacementName} is a ${repRole.replace(/_/g, " ")} exercise (${repBucket.replace(/_/g, " ")}), different from the original ${origRole.replace(/_/g, " ")} (${origBucket.replace(/_/g, " ")}).`;
    }
  }

  logger.info(
    { originalName, replacementName, decision, sameFamily, origRole, repRole, remapRationale },
    "[ExerciseMutation:PrescriptionRemap:Decision]"
  );

  // ── Build base prescription ─────────────────────────────────────────────────
  let baseSets: number;
  let baseReps: string;
  let baseRest: string;
  let didRemap = false;

  if (decision === "preserve") {
    // Isolation guardrail on preserve — if existing reps are dangerously low,
    // override even when same-family.
    if (repRole === "isolation" && existingReps !== null) {
      const existingMin = parseMinReps(existingReps);
      if (existingMin < ISOLATION_MIN_REPS) {
        const defaults = ROLE_DEFAULTS.isolation;
        baseSets  = existingSets ?? defaults.sets;
        baseReps  = defaults.reps;
        baseRest  = existingRest ?? defaults.rest;
        didRemap  = true;
        remapRationale = `Rep guardrail applied — ${replacementName} is an isolation exercise and should not default to ${existingReps} reps. Using ${defaults.reps} instead.`;
      } else {
        baseSets = existingSets ?? ROLE_DEFAULTS[repRole].sets;
        baseReps = existingReps;
        baseRest = existingRest ?? ROLE_DEFAULTS[repRole].rest;
        didRemap = false;
      }
    } else {
      baseSets = existingSets ?? ROLE_DEFAULTS[repRole].sets;
      baseReps = existingReps ?? ROLE_DEFAULTS[repRole].reps;
      baseRest = existingRest ?? ROLE_DEFAULTS[repRole].rest;
      didRemap = false;
    }
  } else {
    // Remap — use role defaults (context modifiers may further adjust below)
    const defaults = ROLE_DEFAULTS[repRole];
    baseSets = defaults.sets;
    baseReps = guardrailReps(repRole, defaults.reps);
    baseRest = defaults.rest;
    didRemap = true;
  }

  // ── Layer 2: Context modifiers ──────────────────────────────────────────────
  let appliedModifiers: string[] = [];
  let contextRationale: string | null = null;

  const hasContext = context && Object.values(context).some((v) => v !== undefined);
  if (hasContext && context) {
    const contextResult = applyPrescriptionContextModifiers(
      { sets: baseSets, reps: baseReps, rest: baseRest },
      repRole,
      context,
    );

    baseSets = contextResult.prescription.sets;
    baseReps = contextResult.prescription.reps;
    baseRest = contextResult.prescription.rest;
    appliedModifiers = contextResult.appliedModifiers;

    if (contextResult.rationaleAdditions.length > 0) {
      contextRationale = contextResult.rationaleAdditions.join(" ");
    }

    logger.info(
      {
        originalName,
        replacementName,
        context,
        appliedModifiers,
        modifiedPrescription: { sets: baseSets, reps: baseReps, rest: baseRest },
        rationaleAdditions: contextResult.rationaleAdditions,
        safetyWarnings: contextResult.safetyWarnings,
      },
      "[ExerciseMutation:PrescriptionContext:Modifiers]"
    );
  }

  // Final global isolation guardrail — always the last word
  if (repRole === "isolation" || repRole === "hypertrophy_accessory") {
    baseReps = clampRepsMin(baseReps, ISOLATION_MIN_REPS);
  }

  const result: PrescriptionRemapResult = {
    sets: baseSets,
    reps: baseReps,
    rest: baseRest,
    remapped: didRemap || appliedModifiers.length > 0,
    originalRole: origRole,
    replacementRole: repRole,
    originalBucket: origBucket,
    replacementBucket: repBucket,
    rationale: remapRationale,
    appliedModifiers,
    contextRationale,
  };

  logger.info(
    {
      originalName,
      replacementName,
      decision,
      remapped: result.remapped,
      appliedModifiers,
      finalPrescription: { sets: baseSets, reps: baseReps, rest: baseRest },
      remapRationale,
      contextRationale,
    },
    "[ExerciseMutation:PrescriptionRemap:Output]"
  );

  return result;
}

// ─── QA Fixtures ───────────────────────────────────────────────────────────────

export const PRESCRIPTION_REMAP_QA_CASES: Array<{
  label: string;
  original: string;
  replacement: string;
  expectedRemapped: boolean;
  expectedRepMin?: number;
}> = [
  {
    label: "Deadlift → Leg Curl: must remap to isolation reps, not 3",
    original: "Deadlift",
    replacement: "Leg Curl",
    expectedRemapped: true,
    expectedRepMin: 6,
  },
  {
    label: "Barbell RDL → Dumbbell RDL: same family, preserve reps",
    original: "Barbell Romanian Deadlift",
    replacement: "Dumbbell Romanian Deadlift",
    expectedRemapped: false,
  },
  {
    label: "Squat → Leg Extension: must remap to 10–20 rep range",
    original: "Back Squat",
    replacement: "Leg Extension",
    expectedRemapped: true,
    expectedRepMin: 6,
  },
  {
    label: "Bench Press → Push-Up: same push_h bucket, may preserve/adjust",
    original: "Bench Press",
    replacement: "Push-Up",
    expectedRemapped: false,
  },
  {
    label: "Bench Press → Triceps Pressdown: must remap to isolation",
    original: "Bench Press",
    replacement: "Triceps Pressdown",
    expectedRemapped: true,
    expectedRepMin: 6,
  },
  {
    label: "Power Clean → Box Jump: both power, preserve low reps",
    original: "Power Clean",
    replacement: "Box Jump",
    expectedRemapped: false,
  },
  {
    label: "Power Clean → Hamstring Curl: must remap away from power reps",
    original: "Power Clean",
    replacement: "Hamstring Curl",
    expectedRemapped: true,
    expectedRepMin: 6,
  },
];
