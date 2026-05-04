/**
 * Prescription Remap Layer
 *
 * Called during every replace_exercise mutation to determine whether the
 * replacement exercise should inherit the original prescription or receive a
 * recalculated one appropriate for its role and movement family.
 *
 * Decision contract:
 *   PRESERVE — replacement is same-family + same-role → keep original sets/reps/rest
 *   REMAP    — replacement crosses family or role boundary → calculate new prescription
 *
 * Guardrail: isolation/accessory exercises can never default to < 6 reps.
 *
 * Log tags:
 *   [ExerciseMutation:PrescriptionRemap:Input]
 *   [ExerciseMutation:PrescriptionRemap:Decision]
 *   [ExerciseMutation:PrescriptionRemap:Output]
 */

import { logger } from "./logger";

// ─── Role Classification ───────────────────────────────────────────────────────

export type ExerciseRole =
  | "primary_strength"     // Main compound lifts: squat, deadlift, bench, press, row
  | "secondary_strength"   // Compound accessories: RDL, incline, front squat, Pendlay row
  | "hypertrophy_accessory"// DB/machine compounds: DB bench, cable row, incline DB
  | "isolation"            // Single-joint: curl, extension, lateral raise, leg curl, pressdown
  | "power_plyometric"     // Power/speed: power clean, snatch, box jump, bounds, sprint
  | "mobility_prehab"      // Prep/mobility: CARs, activation, corrective, prehab
  | "conditioning";        // Metabolic: sled, intervals, bike, rower

export type MovementBucket =
  | "squat_knee"     // Squat, leg press, lunge family
  | "hinge_hip"      // Deadlift, RDL, hip thrust, good morning family
  | "push_h"         // Bench press, push-up, chest press family
  | "push_v"         // Overhead press, push press, landmine press family
  | "pull_h"         // Row, face pull family
  | "pull_v"         // Pull-up, pulldown family
  | "power"          // Olympic lifts, jumps, throws, sprints
  | "isolation_upper"// Curls, extensions, lateral raises, pressdowns
  | "isolation_lower"// Leg curl, leg extension, calf raise, adductor
  | "core"           // Carries, planks, pallof, anti-rotation
  | "mobility"       // Mobility flows, activation, corrective
  | "conditioning";  // Conditioning work

// ─── Pattern tables ───────────────────────────────────────────────────────────

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
      // Lower body isolation
      /leg\s+curl/i, /hamstring\s+curl/i, /lying\s+curl/i, /seated\s+leg\s+curl/i,
      /leg\s+extension/i, /quad\s+extension/i,
      /calf\s+raise/i, /standing\s+calf/i, /seated\s+calf/i,
      /adductor/i, /abductor/i, /hip\s+abduction/i, /hip\s+adduction/i,
      /glute\s+kickback/i, /cable\s+kickback/i,
      // Upper body isolation
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
      // Primary squat/knee
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

// ─── Classifiers ──────────────────────────────────────────────────────────────

export function classifyExerciseRole(name: string): ExerciseRole {
  for (const { role, patterns } of ROLE_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return role;
  }

  const bucket = classifyMovementBucket(name);

  // Heuristic: barbell compound in main squat/hinge/push/pull buckets → primary or secondary
  const isBarbell = /barbell/i.test(name);
  const isDumbbell = /dumbbell|\bdb\b/i.test(name);
  const isCable = /cable/i.test(name);
  const isMachine = /machine|lever/i.test(name);
  const isBodyweight = /push.?up|pull.?up|chin.?up|\bdip\b|ring|bodyweight|air\s+squat/i.test(name);

  if (bucket === "hinge_hip" || bucket === "squat_knee") {
    if (isBarbell) return "primary_strength";
    return "secondary_strength";
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

  // Default: if DB/cable/machine, treat as accessory; barbell as secondary
  if (isBarbell) return "secondary_strength";
  if (isDumbbell || isCable || isMachine) return "hypertrophy_accessory";
  return "hypertrophy_accessory";
}

export function classifyMovementBucket(name: string): MovementBucket {
  for (const { bucket, patterns } of BUCKET_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return bucket;
  }
  return "core"; // fallback — generic
}

// ─── Same-family check ────────────────────────────────────────────────────────

/**
 * Returns true when the original and replacement share a movement bucket AND
 * neither crosses an incompatible role boundary.
 *
 * Example:
 *   Barbell RDL → Dumbbell RDL: same bucket (hinge_hip), roles close → SAME FAMILY
 *   Deadlift → Leg Curl:        hinge_hip vs isolation_lower        → DIFFERENT FAMILY
 *   Bench    → Triceps Press:   push_h vs isolation_upper           → DIFFERENT FAMILY
 */
export function isSameFamilyAndRole(originalName: string, replacementName: string): boolean {
  const origBucket = classifyMovementBucket(originalName);
  const repBucket = classifyMovementBucket(replacementName);
  const origRole = classifyExerciseRole(originalName);
  const repRole = classifyExerciseRole(replacementName);

  if (origBucket !== repBucket) return false;

  // Both are isolation → same family regardless of bucket detail
  if (origRole === "isolation" && repRole === "isolation") return true;

  // Power exercises are same-family only with each other
  if (origRole === "power_plyometric" || repRole === "power_plyometric") {
    return origRole === repRole;
  }

  // If buckets match, allow primary↔secondary↔hypertrophy_accessory transitions
  const strengthRoles = new Set<ExerciseRole>(["primary_strength", "secondary_strength", "hypertrophy_accessory"]);
  if (strengthRoles.has(origRole) && strengthRoles.has(repRole)) return true;

  // Mobility ↔ mobility is fine
  if (origRole === "mobility_prehab" && repRole === "mobility_prehab") return true;

  return false;
}

// ─── Default prescription rules ───────────────────────────────────────────────

export interface DefaultPrescription {
  sets: number;
  reps: string;
  rest: string;
}

const ROLE_DEFAULTS: Record<ExerciseRole, DefaultPrescription> = {
  primary_strength: { sets: 4, reps: "3–5", rest: "2–3 min" },
  secondary_strength: { sets: 3, reps: "5–8", rest: "90–120 sec" },
  hypertrophy_accessory: { sets: 3, reps: "8–12", rest: "60–90 sec" },
  isolation: { sets: 3, reps: "10–15", rest: "45–75 sec" },
  power_plyometric: { sets: 4, reps: "3–5", rest: "2–3 min" },
  mobility_prehab: { sets: 2, reps: "8–10", rest: "30–45 sec" },
  conditioning: { sets: 4, reps: "30–45 sec", rest: "45–60 sec" },
};

/** Isolation/accessory rep guardrail — never below 6. */
const ISOLATION_MIN_REPS = 6;

function parseMinReps(repsStr: string): number {
  const match = repsStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function guardrailReps(role: ExerciseRole, repsStr: string): string {
  if (role !== "isolation") return repsStr;
  const min = parseMinReps(repsStr);
  if (min < ISOLATION_MIN_REPS) {
    return "10–15"; // override to safe isolation default
  }
  return repsStr;
}

// ─── Remap result ─────────────────────────────────────────────────────────────

export interface PrescriptionRemapResult {
  sets: number;
  reps: string;
  rest: string;
  remapped: boolean;
  originalRole: ExerciseRole;
  replacementRole: ExerciseRole;
  originalBucket: MovementBucket;
  replacementBucket: MovementBucket;
  rationale: string | null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface PrescriptionRemapInput {
  originalName: string;
  replacementName: string;
  existingSets: number | null;
  existingReps: string | null;
  existingRest: string | null;
  /** Optional: session goal / block context used in rationale messages */
  sessionGoal?: string;
}

/**
 * Determines whether a replacement exercise requires a prescription remap.
 *
 * Returns a PrescriptionRemapResult with:
 *   - remapped: false  → caller should preserve existing prescription
 *   - remapped: true   → caller must use the returned sets/reps/rest
 *
 * Never returns null — always returns a decision.
 */
export function remapPrescriptionIfNeeded(input: PrescriptionRemapInput): PrescriptionRemapResult {
  const { originalName, replacementName, existingSets, existingReps, existingRest } = input;

  const origBucket = classifyMovementBucket(originalName);
  const repBucket = classifyMovementBucket(replacementName);
  const origRole = classifyExerciseRole(originalName);
  const repRole = classifyExerciseRole(replacementName);

  logger.info(
    {
      originalName,
      replacementName,
      origBucket,
      repBucket,
      origRole,
      repRole,
      existingSets,
      existingReps,
      existingRest,
    },
    "[ExerciseMutation:PrescriptionRemap:Input]"
  );

  const sameFamily = isSameFamilyAndRole(originalName, replacementName);

  let decision: "preserve" | "remap";
  let rationale: string | null = null;

  if (sameFamily) {
    decision = "preserve";
  } else {
    decision = "remap";

    if (repRole === "isolation") {
      rationale = `Prescription adjusted — ${replacementName} is an isolation exercise, not a ${origRole.replace(/_/g, " ")} movement. Isolation exercises require moderate-to-high reps with shorter rest.`;
    } else if (repRole === "power_plyometric" && origRole !== "power_plyometric") {
      rationale = `Prescription adjusted — ${replacementName} is a power/plyometric exercise requiring low reps and full recovery rest.`;
    } else if (origRole === "power_plyometric" && repRole !== "power_plyometric") {
      rationale = `Prescription adjusted — ${replacementName} is not a power exercise; loading recalculated for its role as a ${repRole.replace(/_/g, " ")} movement.`;
    } else if (repRole === "mobility_prehab") {
      rationale = `Prescription adjusted — ${replacementName} is a mobility/prehab exercise with lower volume demands.`;
    } else {
      rationale = `Prescription adjusted — ${replacementName} is a ${repRole.replace(/_/g, " ")} exercise (${repBucket.replace(/_/g, " ")}), different from the original ${origRole.replace(/_/g, " ")} (${origBucket.replace(/_/g, " ")}).`;
    }
  }

  logger.info(
    {
      originalName,
      replacementName,
      decision,
      sameFamily,
      origRole,
      repRole,
      rationale,
    },
    "[ExerciseMutation:PrescriptionRemap:Decision]"
  );

  if (decision === "preserve") {
    // Apply isolation guardrail even on preserve: if existing reps are dangerously low
    // for an isolation exercise, override them regardless of inheritance.
    if (repRole === "isolation" && existingReps !== null) {
      const existingMin = parseMinReps(existingReps);
      if (existingMin < ISOLATION_MIN_REPS) {
        const defaults = ROLE_DEFAULTS.isolation;
        const safeReps = defaults.reps;
        logger.info(
          {
            originalName,
            replacementName,
            existingReps,
            safeReps,
            reason: "isolation_guardrail_on_preserve",
          },
          "[ExerciseMutation:PrescriptionRemap:Output]"
        );
        return {
          sets: existingSets ?? defaults.sets,
          reps: safeReps,
          rest: existingRest ?? defaults.rest,
          remapped: true,
          originalRole: origRole,
          replacementRole: repRole,
          originalBucket: origBucket,
          replacementBucket: repBucket,
          rationale: `Rep guardrail applied — ${replacementName} is an isolation exercise and should not default to ${existingReps} reps. Using ${safeReps} instead.`,
        };
      }
    }

    const result: PrescriptionRemapResult = {
      sets: existingSets ?? ROLE_DEFAULTS[repRole].sets,
      reps: existingReps ?? ROLE_DEFAULTS[repRole].reps,
      rest: existingRest ?? ROLE_DEFAULTS[repRole].rest,
      remapped: false,
      originalRole: origRole,
      replacementRole: repRole,
      originalBucket: origBucket,
      replacementBucket: repBucket,
      rationale: null,
    };

    logger.info(
      { originalName, replacementName, decision: "preserve", result },
      "[ExerciseMutation:PrescriptionRemap:Output]"
    );

    return result;
  }

  // REMAP — use defaults for the replacement's role
  const defaults = ROLE_DEFAULTS[repRole];
  const safeReps = guardrailReps(repRole, defaults.reps);

  const result: PrescriptionRemapResult = {
    sets: defaults.sets,
    reps: safeReps,
    rest: defaults.rest,
    remapped: true,
    originalRole: origRole,
    replacementRole: repRole,
    originalBucket: origBucket,
    replacementBucket: repBucket,
    rationale,
  };

  logger.info(
    {
      originalName,
      replacementName,
      decision: "remap",
      origRole,
      repRole,
      remappedPrescription: { sets: result.sets, reps: result.reps, rest: result.rest },
      rationale,
    },
    "[ExerciseMutation:PrescriptionRemap:Output]"
  );

  return result;
}

// ─── QA Fixtures (used in tests and documentation) ───────────────────────────

/**
 * Known test cases for validating remap behavior.
 * Run via: pnpm --filter @workspace/api-server test:remap
 */
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
