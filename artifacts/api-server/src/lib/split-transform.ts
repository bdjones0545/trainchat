// ─── TrainChat Split Transformation Engine ────────────────────────────────────
//
// Sits below the decision tree. Called when actionType === STRUCTURAL_REBUILD.
// Takes the current ProgramStructure and produces a correctly transformed
// program with a full transformation log — no AI involvement in structure.
//
// Pipeline:
//   1. Detect current split type
//   2. Categorize all exercises by movement pattern + priority tier
//   3. Extract preserved compound lifts
//   4. Apply transformation algorithm
//   5. Validate transformed program
//   6. Return transformed program + log + coach response

import { logger } from "./logger";
import { ProgramStructure, ProgramDay, Exercise } from "./ai";
import { UserProfile } from "./training-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SplitType =
  | "full_body"
  | "upper_lower"
  | "ppl"
  | "push_pull"
  | "body_part"
  | "unknown";

export type TransformationType =
  | "to_full_body"
  | "to_upper_lower"
  | "to_ppl"
  | "reduce_days"
  | "increase_days"
  | "make_more_athletic"
  | "reduce_fatigue"
  | "simplify";

export interface TransformRequest {
  type: TransformationType;
  targetDays?: number;
  userProfile?: UserProfile | null;
  rawRequest: string;
}

export interface CategorizedExercise {
  exercise: Exercise;
  pattern: MovementCategory;
  bodyRegion: "upper" | "lower" | "full";
  priorityTier: 1 | 2 | 3 | 4; // 1=compound/primary, 2=secondary, 3=accessory, 4=conditioning
  isExplosive: boolean;
  sourceDay: number;
}

export type MovementCategory =
  | "squat"
  | "hinge"
  | "push_horizontal"
  | "push_vertical"
  | "pull_horizontal"
  | "pull_vertical"
  | "carry"
  | "core"
  | "power_explosive"
  | "iso_chest"
  | "iso_back"
  | "iso_shoulders"
  | "iso_arms"
  | "iso_legs"
  | "conditioning";

export interface TransformationLog {
  originalSplit: string;
  detectedSplit: SplitType;
  requestedTransformation: string;
  resultingSplit: string;
  targetDays: number;
  preservedExercises: string[];
  replacedExercises: string[];
  removedExercises: string[];
  addedExercises: string[];
  validationResults: ValidationResult[];
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  note?: string;
}

export interface TransformResult {
  program: ProgramStructure;
  log: TransformationLog;
  coachResponse: string;
}

// ─── Movement Pattern Classifier ─────────────────────────────────────────────

const PATTERN_RULES: Array<[RegExp, MovementCategory, "upper" | "lower" | "full", 1 | 2 | 3 | 4]> = [
  // Explosive / Power — tier 1
  [/(power clean|hang clean|power snatch|hang snatch|clean pull|push press|push jerk|split jerk|box jump|broad jump|med ball|jump squat|plyo|sprint|depth jump)/i, "power_explosive", "full", 1],

  // Primary compounds — tier 1-2
  [/(barbell back squat|back squat|front squat|goblet squat|belt squat|hack squat)/i, "squat", "lower", 1],
  [/(split squat|bulgarian split|lunge|step.up|step up)/i, "squat", "lower", 2],
  [/(deadlift|trap bar|sumo dead|conventional dead|romanian deadlift|rdl|stiff.leg|nordic curl|glute.ham|hip thrust|barbell hip thrust)/i, "hinge", "lower", 1],
  [/(bench press|flat bench|incline bench|decline bench|chest press|dumbbell press)/i, "push_horizontal", "upper", 1],
  [/(overhead press|ohp|military press|push press|seated press|dumbbell shoulder press|arnold press)/i, "push_vertical", "upper", 1],
  [/(barbell row|bent.over row|pendlay row|yates row|cable row|seated row|t.bar row)/i, "pull_horizontal", "upper", 1],
  [/(pull.up|chin.up|weighted pull|lat pulldown|band pulldown)/i, "pull_vertical", "upper", 1],

  // Secondary compounds — tier 2
  [/(incline dumbbell|dumbbell flat|dumbbell incline|chest fly|pec deck|cable fly|cable crossover)/i, "iso_chest", "upper", 2],
  [/(leg press|leg extension|leg curl|seated leg curl|lying leg curl|nordic)/i, "iso_legs", "lower", 2],
  [/(dumbbell row|chest.supported|single.arm row|one.arm row)/i, "pull_horizontal", "upper", 2],
  [/(face pull|band pull.apart|rear delt fly|rear delt|reverse fly)/i, "iso_shoulders", "upper", 2],
  [/(lat pull|cable pull|single.arm lat)/i, "pull_vertical", "upper", 2],
  [/(lateral raise|front raise|upright row)/i, "iso_shoulders", "upper", 3],

  // Carries — tier 2-3
  [/(farmer.s? (carry|walk)|suitcase (carry|walk)|trap bar carry|yoke|heavy carry)/i, "carry", "full", 2],

  // Accessories — tier 3
  [/(bicep curl|curl|preacher curl|hammer curl|reverse curl|concentration curl)/i, "iso_arms", "upper", 3],
  [/(tricep|skull crusher|close.grip bench|overhead extension|pushdown|dip)/i, "iso_arms", "upper", 3],
  [/(calf raise|seated calf|standing calf|single.leg calf)/i, "iso_legs", "lower", 3],
  [/(glute bridge|hip thrust|cable kick|donkey kick|abductor|adductor)/i, "hinge", "lower", 3],

  // Core — tier 3
  [/(plank|ab wheel|rollout|dead bug|bird.dog|hollow hold|l.sit)/i, "core", "full", 3],
  [/(cable crunch|crunch|sit.up|decline crunch|weighted crunch)/i, "core", "full", 3],
  [/(hanging leg|hanging knee|toes.to.bar|leg raise|knee raise)/i, "core", "full", 3],
  [/(pallof press|anti.rotation|suitcase|landmine twist|russian twist)/i, "core", "full", 3],
  [/(back extension|hyperextension|45.degree|reverse hyper)/i, "core", "full", 3],

  // Conditioning — tier 4
  [/(row (machine|ergometer)|rower|bike|assault bike|sled push|sled pull|battle rope|jump rope|shuttle run|interval|hiit|circuit)/i, "conditioning", "full", 4],
];

export function categorizeExercise(exercise: Exercise, sourceDay: number): CategorizedExercise {
  const name = exercise.name.toLowerCase();
  const classLower = (exercise.classification ?? "").toLowerCase();

  for (const [pattern, category, bodyRegion, defaultTier] of PATTERN_RULES) {
    if (pattern.test(name)) {
      const isExplosive = category === "power_explosive";

      // Override tier from classification field when available
      let tier = defaultTier;
      if (/primary|explosive|olympic/i.test(classLower)) tier = 1;
      else if (/secondary/i.test(classLower)) tier = 2;
      else if (/accessory|isolation/i.test(classLower)) tier = 3;
      else if (/conditioning/i.test(classLower)) tier = 4;

      return { exercise, pattern: category, bodyRegion, priorityTier: tier, isExplosive, sourceDay };
    }
  }

  // Fallback: classify from classification field
  let pattern: MovementCategory = "iso_arms";
  let bodyRegion: "upper" | "lower" | "full" = "full";
  let tier: 1 | 2 | 3 | 4 = 3;

  if (/squat|leg|quad/i.test(name)) { pattern = "squat"; bodyRegion = "lower"; tier = 2; }
  else if (/dead|hinge|hip|rdl|hamstring/i.test(name)) { pattern = "hinge"; bodyRegion = "lower"; tier = 2; }
  else if (/chest|push|press/i.test(name)) { pattern = "push_horizontal"; bodyRegion = "upper"; tier = 2; }
  else if (/row|pull|back|lat/i.test(name)) { pattern = "pull_horizontal"; bodyRegion = "upper"; tier = 2; }
  else if (/core|ab|plank/i.test(name)) { pattern = "core"; bodyRegion = "full"; tier = 3; }
  else if (/condition|cardio|bike|run/i.test(name)) { pattern = "conditioning"; bodyRegion = "full"; tier = 4; }

  if (/primary|explosive/i.test(classLower)) tier = 1;
  else if (/secondary/i.test(classLower)) tier = 2;
  else if (/conditioning/i.test(classLower)) tier = 4;

  return {
    exercise,
    pattern,
    bodyRegion,
    priorityTier: tier,
    isExplosive: false,
    sourceDay,
  };
}

// ─── Current Split Detector ───────────────────────────────────────────────────

export function detectCurrentSplit(program: ProgramStructure): SplitType {
  // Use explicit splitType field first
  const declared = (program.splitType ?? "").toLowerCase();
  if (/full.?body/i.test(declared)) return "full_body";
  if (/upper.lower|upper\/lower/i.test(declared)) return "upper_lower";
  if (/ppl|push.pull.leg/i.test(declared)) return "ppl";
  if (/push.pull(?!.leg)/i.test(declared)) return "push_pull";

  // Infer from day names
  const dayNames = program.days.map((d) => d.name.toLowerCase());

  const hasUpperLower = dayNames.some((n) => /upper/i.test(n)) && dayNames.some((n) => /lower/i.test(n));
  if (hasUpperLower) return "upper_lower";

  const hasPPL =
    dayNames.some((n) => /push/i.test(n)) &&
    dayNames.some((n) => /pull/i.test(n)) &&
    dayNames.some((n) => /leg/i.test(n));
  if (hasPPL) return "ppl";

  const hasPushPull = dayNames.some((n) => /push/i.test(n)) && dayNames.some((n) => /pull/i.test(n));
  if (hasPushPull) return "push_pull";

  const hasFullBody = dayNames.every((n) => /full.?body|full body/i.test(n));
  if (hasFullBody) return "full_body";

  // Infer from exercise distribution per day
  const allCategorized = program.days.flatMap((day) =>
    day.exercises.map((ex) => categorizeExercise(ex, day.dayNumber))
  );
  const upperCount = allCategorized.filter((e) => e.bodyRegion === "upper").length;
  const lowerCount = allCategorized.filter((e) => e.bodyRegion === "lower").length;

  // If every day has both upper and lower work — full body
  const daysWithMixed = program.days.filter((day) => {
    const cats = day.exercises.map((ex) => categorizeExercise(ex, day.dayNumber));
    return cats.some((e) => e.bodyRegion === "upper") && cats.some((e) => e.bodyRegion === "lower");
  });
  if (daysWithMixed.length >= program.days.length - 1) return "full_body";

  if (dayNames.some((n) => /chest|back|shoulder|arm|bicep|tricep/i.test(n))) return "body_part";

  return "unknown";
}

// ─── Exercise Pool Extraction ─────────────────────────────────────────────────

function extractPool(program: ProgramStructure): CategorizedExercise[] {
  const allExercises: CategorizedExercise[] = [];
  const seen = new Set<string>();

  for (const day of program.days) {
    for (const ex of day.exercises) {
      const key = ex.name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        allExercises.push(categorizeExercise(ex, day.dayNumber));
      }
    }
  }

  // Sort: explosive first, then by tier, then by pattern priority
  return allExercises.sort((a, b) => {
    if (a.isExplosive !== b.isExplosive) return a.isExplosive ? -1 : 1;
    if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    return 0;
  });
}

// ─── Realistic Session Duration Estimator ────────────────────────────────────

function estimateSessionMinutes(exercises: Exercise[]): number {
  let minutes = 10; // warmup baseline
  for (const ex of exercises) {
    const sets = ex.sets ?? 3;
    const restSeconds = parseInt(ex.rest?.match(/\d+/)?.[0] ?? "90", 10);
    const setTime = 45; // avg set execution
    minutes += (sets * setTime + (sets - 1) * restSeconds) / 60;
  }
  return Math.round(minutes);
}

// ─── NSCA Sort ────────────────────────────────────────────────────────────────
// explosive → primary → secondary → accessory → conditioning

function nscaSort(exercises: CategorizedExercise[]): CategorizedExercise[] {
  const order: Record<MovementCategory, number> = {
    power_explosive: 0,
    squat: 1,
    hinge: 1,
    push_horizontal: 2,
    push_vertical: 2,
    pull_horizontal: 2,
    pull_vertical: 2,
    carry: 3,
    iso_chest: 3,
    iso_back: 3,
    iso_shoulders: 3,
    iso_arms: 4,
    iso_legs: 4,
    core: 5,
    conditioning: 6,
  };

  return [...exercises].sort((a, b) => {
    const aPriority = a.isExplosive ? -1 : (a.priorityTier === 1 ? order[a.pattern] : a.priorityTier + order[a.pattern] * 0.1);
    const bPriority = b.isExplosive ? -1 : (b.priorityTier === 1 ? order[b.pattern] : b.priorityTier + order[b.pattern] * 0.1);
    return aPriority - bPriority;
  });
}

// ─── Default Prescriptions ────────────────────────────────────────────────────

const DEFAULT_EXPLOSIVE: Omit<Exercise, "name"> = {
  classification: "explosive",
  sets: 4,
  reps: "4-5",
  rest: "2-3 min",
  intent: "Power development — full recovery between sets",
};

const EXPLOSIVE_FILLERS: Exercise[] = [
  { name: "Box Jump", ...DEFAULT_EXPLOSIVE, reps: "4", intent: "Lower body power" },
  { name: "Med Ball Slam", ...DEFAULT_EXPLOSIVE, sets: 3, reps: "6-8", rest: "90 sec", intent: "Total-body power" },
  { name: "Jump Squat", ...DEFAULT_EXPLOSIVE, reps: "5", intent: "Leg drive and rate of force development" },
];

const ANTI_ROTATION_CORE: Exercise[] = [
  { name: "Pallof Press", classification: "core", sets: 3, reps: "10-12 each side", rest: "60 sec", intent: "Anti-rotation stability" },
  { name: "Suitcase Carry", classification: "core/carry", sets: 3, reps: "30-40m each side", rest: "90 sec", intent: "Lateral stability and grip" },
];

// ─── Transformation Algorithms ────────────────────────────────────────────────

// A. UPPER/LOWER or PPL or BODY_PART → FULL BODY
function transformToFullBody(
  pool: CategorizedExercise[],
  targetDays: number,
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const days: ProgramDay[] = [];

  const maxPerDay = profile?.sessionDuration
    ? Math.floor(profile.sessionDuration / 12) // rough: ~12 min/exercise incl. rest
    : 6;

  // Required pattern buckets per full-body session
  const requiredPatterns: MovementCategory[][] = [
    ["squat", "hinge"],               // lower compound — one per day
    ["push_horizontal", "push_vertical"], // upper push — one per day
    ["pull_horizontal", "pull_vertical"], // upper pull — one per day
  ];

  // Build day rotation: alternate which lower compound leads
  const lowerCompounds = pool.filter((e) => (e.pattern === "squat" || e.pattern === "hinge") && e.priorityTier <= 2);
  const upperPushCompounds = pool.filter((e) => (e.pattern === "push_horizontal" || e.pattern === "push_vertical") && e.priorityTier <= 2);
  const upperPullCompounds = pool.filter((e) => (e.pattern === "pull_horizontal" || e.pattern === "pull_vertical") && e.priorityTier <= 2);
  const accessories = pool.filter((e) => e.priorityTier >= 3 && e.pattern !== "conditioning");
  const conditioning = pool.filter((e) => e.pattern === "conditioning");
  const explosive = pool.filter((e) => e.isExplosive);

  // Track what's been used to rotate across days
  let lowerIdx = 0;
  let pushIdx = 0;
  let pullIdx = 0;
  let accessoryStart = 0;

  const dayLabels = targetDays === 3
    ? ["Full Body A", "Full Body B", "Full Body C"]
    : targetDays === 4
    ? ["Full Body A", "Full Body B", "Full Body C", "Full Body D"]
    : targetDays === 5
    ? ["Full Body A", "Full Body B", "Full Body C", "Full Body D", "Full Body E"]
    : Array.from({ length: targetDays }, (_, i) => `Full Body ${String.fromCharCode(65 + i)}`);

  for (let i = 0; i < targetDays; i++) {
    const dayExercises: CategorizedExercise[] = [];

    // Explosive opener (alternate)
    if (explosive.length > 0) {
      dayExercises.push(explosive[i % explosive.length]);
    }

    // Lower compound (rotate)
    if (lowerCompounds.length > 0) {
      dayExercises.push(lowerCompounds[lowerIdx % lowerCompounds.length]);
      lowerIdx++;
    }

    // Upper push compound (rotate)
    if (upperPushCompounds.length > 0) {
      dayExercises.push(upperPushCompounds[pushIdx % upperPushCompounds.length]);
      pushIdx++;
    }

    // Upper pull compound (rotate)
    if (upperPullCompounds.length > 0) {
      dayExercises.push(upperPullCompounds[pullIdx % upperPullCompounds.length]);
      pullIdx++;
    }

    // Fill accessories up to session cap
    const accessorySlots = Math.max(0, maxPerDay - dayExercises.length - (conditioning.length > 0 ? 1 : 0));
    const dayAccessories = accessories.slice(accessoryStart, accessoryStart + accessorySlots);
    accessoryStart = (accessoryStart + accessorySlots) % Math.max(accessories.length, 1);
    dayExercises.push(...dayAccessories);

    // Conditioning finisher (every other day)
    if (conditioning.length > 0 && i % 2 === 1) {
      dayExercises.push(conditioning[0]);
    }

    const sorted = nscaSort(dayExercises);
    const exercises = sorted.map((e) => e.exercise);

    days.push({
      dayNumber: i + 1,
      name: dayLabels[i] ?? `Full Body ${i + 1}`,
      focus: "Full body — compound emphasis",
      exercises,
    });
  }

  // Build log
  const allPoolNames = pool.map((e) => e.exercise.name);
  const usedNames = new Set(days.flatMap((d) => d.exercises.map((e) => e.name)));
  log.removedExercises = allPoolNames.filter((n) => !usedNames.has(n));
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2 && usedNames.has(e.exercise.name)).map((e) => e.exercise.name);

  return days;
}

// B. FULL BODY or BODY_PART → UPPER/LOWER
function transformToUpperLower(
  pool: CategorizedExercise[],
  targetDays: number,
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const upperExercises = nscaSort(pool.filter((e) => e.bodyRegion === "upper" || e.pattern === "carry"));
  const lowerExercises = nscaSort(pool.filter((e) => e.bodyRegion === "lower"));
  const coreExercises = nscaSort(pool.filter((e) => e.pattern === "core" && e.bodyRegion === "full"));
  const conditioningExercises = pool.filter((e) => e.pattern === "conditioning");

  const maxPerDay = profile?.sessionDuration ? Math.floor(profile.sessionDuration / 12) : 6;

  // Day count → pattern
  // 2 → U-L
  // 3 → U-L-U
  // 4 → U-L-U-L
  // 5 → U-L-U-L-U
  // 6 → U-L-U-L-U-L
  const dayPattern: ("upper" | "lower")[] = [];
  for (let i = 0; i < targetDays; i++) {
    dayPattern.push(i % 2 === 0 ? "upper" : "lower");
  }

  const days: ProgramDay[] = [];
  const upperUsed: Set<string> = new Set();
  const lowerUsed: Set<string> = new Set();
  let upperDayCount = 0;
  let lowerDayCount = 0;

  for (let i = 0; i < targetDays; i++) {
    const focus = dayPattern[i];
    const isUpper = focus === "upper";
    const pool = isUpper ? upperExercises : lowerExercises;
    const usedSet = isUpper ? upperUsed : lowerUsed;
    const dayIndex = isUpper ? upperDayCount++ : lowerDayCount++;

    const dayExercises: CategorizedExercise[] = [];

    // Main work (not yet used this week, or rotate on second pass)
    for (const ex of pool) {
      if (dayExercises.length >= maxPerDay - 1) break; // leave room for core
      if (dayExercises.length < 3 || !usedSet.has(ex.exercise.name)) {
        dayExercises.push(ex);
        usedSet.add(ex.exercise.name);
      }
    }

    // Add a core exercise as finisher
    if (coreExercises.length > 0 && dayExercises.length < maxPerDay) {
      dayExercises.push(coreExercises[dayIndex % coreExercises.length]);
    }

    // Conditioning on lower days
    if (!isUpper && conditioningExercises.length > 0 && dayExercises.length < maxPerDay) {
      dayExercises.push(conditioningExercises[0]);
    }

    const focusLabel = isUpper ? "Upper Body" : "Lower Body";
    const letterSuffix = dayIndex === 0 ? "A" : dayIndex === 1 ? "B" : String.fromCharCode(65 + dayIndex);

    days.push({
      dayNumber: i + 1,
      name: `${focusLabel} ${letterSuffix}`,
      focus: isUpper ? "Upper body — push/pull balance" : "Lower body — squat/hinge balance",
      exercises: nscaSort(dayExercises).map((e) => e.exercise),
    });
  }

  const usedNames = new Set(days.flatMap((d) => d.exercises.map((e) => e.name)));
  log.removedExercises = pool.filter((e) => !usedNames.has(e.exercise.name)).map((e) => e.exercise.name);
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2 && usedNames.has(e.exercise.name)).map((e) => e.exercise.name);

  return days;
}

// C. ANY → PPL (Push/Pull/Legs)
function transformToPPL(
  pool: CategorizedExercise[],
  targetDays: number,
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const pushExercises = nscaSort(pool.filter((e) =>
    e.pattern === "push_horizontal" || e.pattern === "push_vertical" || e.pattern === "iso_chest" ||
    (e.pattern === "iso_arms" && /tricep|pushdown|skull/i.test(e.exercise.name))
  ));
  const pullExercises = nscaSort(pool.filter((e) =>
    e.pattern === "pull_horizontal" || e.pattern === "pull_vertical" || e.pattern === "iso_back" ||
    e.pattern === "iso_shoulders" ||
    (e.pattern === "iso_arms" && /curl|bicep/i.test(e.exercise.name))
  ));
  const legExercises = nscaSort(pool.filter((e) =>
    e.pattern === "squat" || e.pattern === "hinge" || e.pattern === "iso_legs"
  ));
  const coreExercises = pool.filter((e) => e.pattern === "core");
  const explosive = pool.filter((e) => e.isExplosive);

  const maxPerDay = profile?.sessionDuration ? Math.floor(profile.sessionDuration / 12) : 6;

  // targetDays: 3=PPL, 4=PPLL or PPLP, 5=PPLLP, 6=PPL PPL
  const dayFocuses: ("push" | "pull" | "legs")[] = [];
  if (targetDays === 3) dayFocuses.push("push", "pull", "legs");
  else if (targetDays === 4) dayFocuses.push("push", "pull", "legs", "legs");
  else if (targetDays === 5) dayFocuses.push("push", "pull", "legs", "push", "pull");
  else if (targetDays === 6) dayFocuses.push("push", "pull", "legs", "push", "pull", "legs");
  else for (let i = 0; i < targetDays; i++) dayFocuses.push(["push", "pull", "legs"][i % 3] as "push" | "pull" | "legs");

  const days: ProgramDay[] = [];

  for (let i = 0; i < targetDays; i++) {
    const focus = dayFocuses[i];
    let candidates: CategorizedExercise[];
    let dayName: string;
    let dayFocus: string;

    if (focus === "push") {
      candidates = pushExercises;
      dayName = `Push ${i < 3 ? "A" : "B"}`;
      dayFocus = "Chest, shoulders, triceps";
    } else if (focus === "pull") {
      candidates = pullExercises;
      dayName = `Pull ${i < 3 ? "A" : "B"}`;
      dayFocus = "Back, rear delts, biceps";
    } else {
      candidates = legExercises;
      dayName = `Legs ${i < 3 ? "A" : "B"}`;
      dayFocus = "Quads, hamstrings, glutes, calves";
    }

    const dayExercises: CategorizedExercise[] = [];

    // Add explosive opener to leg days (or first push day)
    if ((focus === "legs" || (focus === "push" && i === 0)) && explosive.length > 0) {
      dayExercises.push(explosive[0]);
    }

    for (const ex of candidates) {
      if (dayExercises.length >= maxPerDay - 1) break;
      dayExercises.push(ex);
    }

    // Core finisher on pull days
    if (focus === "pull" && coreExercises.length > 0) {
      dayExercises.push(coreExercises[0]);
    }

    days.push({
      dayNumber: i + 1,
      name: dayName,
      focus: dayFocus,
      exercises: nscaSort(dayExercises).map((e) => e.exercise),
    });
  }

  const usedNames = new Set(days.flatMap((d) => d.exercises.map((e) => e.name)));
  log.removedExercises = pool.filter((e) => !usedNames.has(e.exercise.name)).map((e) => e.exercise.name);
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2 && usedNames.has(e.exercise.name)).map((e) => e.exercise.name);

  return days;
}

// D. Reduce days — redistribute, prioritize compounds
function transformReduceDays(
  program: ProgramStructure,
  pool: CategorizedExercise[],
  targetDays: number,
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const currentSplit = detectCurrentSplit(program);
  const maxPerDay = profile?.sessionDuration ? Math.floor(profile.sessionDuration / 12) : 7;
  const targetTotal = targetDays * maxPerDay;

  // Keep top exercises by priority, then distribute
  const prioritized = [...pool].sort((a, b) => {
    if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    return 0;
  });

  const kept = prioritized.slice(0, targetTotal);

  log.removedExercises = prioritized.slice(targetTotal).map((e) => e.exercise.name);
  log.preservedExercises = kept.filter((e) => e.priorityTier <= 2).map((e) => e.exercise.name);

  // Delegate to appropriate structure based on existing split
  if (currentSplit === "upper_lower") {
    return transformToUpperLower(kept, targetDays, profile, { ...log, removedExercises: [], preservedExercises: [] });
  }
  if (currentSplit === "ppl") {
    return transformToPPL(kept, targetDays, profile, { ...log, removedExercises: [], preservedExercises: [] });
  }
  if (currentSplit === "full_body") {
    return transformToFullBody(kept, targetDays, profile, { ...log, removedExercises: [], preservedExercises: [] });
  }

  // Unknown split — evenly distribute across target days
  const days: ProgramDay[] = [];
  const perDay = Math.ceil(kept.length / targetDays);

  for (let i = 0; i < targetDays; i++) {
    const slice = kept.slice(i * perDay, (i + 1) * perDay);
    days.push({
      dayNumber: i + 1,
      name: `Day ${i + 1}`,
      exercises: nscaSort(slice).map((e) => e.exercise),
    });
  }

  return days;
}

// E. Increase days — spread existing volume across more days
function transformIncreaseDays(
  program: ProgramStructure,
  pool: CategorizedExercise[],
  targetDays: number,
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const currentSplit = detectCurrentSplit(program);
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2).map((e) => e.exercise.name);
  log.removedExercises = [];

  if (currentSplit === "upper_lower" || currentSplit === "unknown") {
    return transformToUpperLower(pool, targetDays, profile, log);
  }
  if (currentSplit === "full_body") {
    return transformToFullBody(pool, targetDays, profile, log);
  }
  if (currentSplit === "ppl" || currentSplit === "body_part") {
    return transformToPPL(pool, targetDays, profile, log);
  }
  return transformToUpperLower(pool, targetDays, profile, log);
}

// F. Make more athletic — explosive openers, reduce isolation, add carries/core
function transformMakeMoreAthletic(
  program: ProgramStructure,
  pool: CategorizedExercise[],
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const removed: string[] = [];
  const added: string[] = [];

  // Remove excessive isolation exercises (iso_arms, iso_chest, iso_shoulders at tier 3+)
  const filtered = pool.filter((e) => {
    const isExcessiveIso = e.priorityTier >= 3 && (
      e.pattern === "iso_arms" ||
      (e.pattern === "iso_chest" && e.priorityTier === 3) ||
      (e.pattern === "iso_shoulders" && e.priorityTier === 3 && !/rear delt|face pull/i.test(e.exercise.name))
    );
    if (isExcessiveIso) { removed.push(e.exercise.name); return false; }
    return true;
  });

  // Add explosive work if not present
  const hasExplosive = filtered.some((e) => e.isExplosive);
  const explosiveAdds: CategorizedExercise[] = [];
  if (!hasExplosive) {
    const filler = categorizeExercise(EXPLOSIVE_FILLERS[0], 1);
    explosiveAdds.push(filler);
    added.push(EXPLOSIVE_FILLERS[0].name);
  }

  // Add anti-rotation core if not present
  const hasPallof = filtered.some((e) => /pallof|anti.rotation/i.test(e.exercise.name));
  if (!hasPallof) {
    const core = categorizeExercise(ANTI_ROTATION_CORE[0], 1);
    explosiveAdds.push(core);
    added.push(ANTI_ROTATION_CORE[0].name);
  }

  const finalPool = [...explosiveAdds, ...filtered];

  log.removedExercises = removed;
  log.addedExercises = added;
  log.preservedExercises = filtered.filter((e) => e.priorityTier <= 2).map((e) => e.exercise.name);

  // Rebuild days maintaining existing structure
  const days: ProgramDay[] = program.days.map((day) => {
    const dayPool = finalPool.filter((e) =>
      e.isExplosive || e.sourceDay === day.dayNumber || e.priorityTier <= 2
    );

    // Replace day exercises preserving structure
    const originalNames = new Set(day.exercises.map((e) => e.name));
    const dayExercises = finalPool.filter((e) =>
      originalNames.has(e.exercise.name) || (e.isExplosive && !pool.some((p) => p.isExplosive && p.sourceDay === day.dayNumber))
    );

    return {
      ...day,
      exercises: nscaSort(dayExercises).map((e) => e.exercise),
    };
  });

  return days;
}

// G. Reduce fatigue — cut accessory volume from highest-density sessions first
function transformReduceFatigue(
  program: ProgramStructure,
  pool: CategorizedExercise[],
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const removed: string[] = [];
  const targetMinutes = profile?.sessionDuration ?? 75;
  const aggressiveMinutes = 65; // if session exceeds this, cut more aggressively

  const days: ProgramDay[] = program.days.map((day) => {
    const estimated = estimateSessionMinutes(day.exercises);
    const overage = estimated - targetMinutes;

    if (overage <= 0) {
      return day; // session is fine
    }

    // Determine cut aggressiveness
    const cuttingSetCount = overage > 15;

    // Sort day exercises by priority (accessories first to cut)
    const dayPool = day.exercises.map((ex) => categorizeExercise(ex, day.dayNumber));
    const sorted = [...dayPool].sort((a, b) => b.priorityTier - a.priorityTier); // highest tier first (cut those first)

    const kept: CategorizedExercise[] = [];
    let remainingMinutes = estimated;

    for (const ex of sorted) {
      if (remainingMinutes <= targetMinutes) {
        kept.push(ex);
        continue;
      }

      // Cut conditioning first
      if (ex.pattern === "conditioning" && remainingMinutes > targetMinutes) {
        removed.push(ex.exercise.name);
        remainingMinutes -= estimateSessionMinutes([ex.exercise]);
        continue;
      }

      // Cut tier-3 iso accessories
      if (ex.priorityTier >= 3 && remainingMinutes > targetMinutes) {
        if (cuttingSetCount && ex.exercise.sets > 2) {
          // Just reduce sets
          kept.push({ ...ex, exercise: { ...ex.exercise, sets: ex.exercise.sets - 1 } });
        } else {
          removed.push(ex.exercise.name);
        }
        remainingMinutes -= estimateSessionMinutes([ex.exercise]);
        continue;
      }

      kept.push(ex);
    }

    return {
      ...day,
      exercises: nscaSort(kept).map((e) => e.exercise),
    };
  });

  log.removedExercises = removed;
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2).map((e) => e.exercise.name);
  log.addedExercises = [];

  return days;
}

// H. Simplify — remove redundant accessories, reduce clutter
function transformSimplify(
  program: ProgramStructure,
  pool: CategorizedExercise[],
  profile: UserProfile | null,
  log: TransformationLog,
): ProgramDay[] {
  const removed: string[] = [];

  // Remove exercises where same movement pattern appears 3+ times in a single day
  const days: ProgramDay[] = program.days.map((day) => {
    const dayPool = day.exercises.map((ex) => categorizeExercise(ex, day.dayNumber));
    const patternCounts: Record<string, number> = {};
    const kept: CategorizedExercise[] = [];

    for (const ex of dayPool) {
      const count = (patternCounts[ex.pattern] ?? 0);
      const maxAllowed = ex.priorityTier <= 2 ? 2 : 1; // allow 2 compounds of same pattern, only 1 accessory
      if (count < maxAllowed) {
        kept.push(ex);
        patternCounts[ex.pattern] = count + 1;
      } else {
        removed.push(ex.exercise.name);
      }
    }

    return {
      ...day,
      exercises: nscaSort(kept).map((e) => e.exercise),
    };
  });

  log.removedExercises = removed;
  log.preservedExercises = pool.filter((e) => e.priorityTier <= 2).map((e) => e.exercise.name);
  log.addedExercises = [];

  return days;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateTransform(days: ProgramDay[], profile: UserProfile | null): ValidationResult[] {
  const results: ValidationResult[] = [];
  const maxDuration = profile?.sessionDuration ?? 90;

  for (const day of days) {
    // Session length check
    const estimated = estimateSessionMinutes(day.exercises);
    const durationOk = estimated <= maxDuration + 10;
    results.push({
      check: `${day.name}: session length`,
      passed: durationOk,
      note: durationOk
        ? `~${estimated} min (within range)`
        : `~${estimated} min — exceeds ${maxDuration} min target`,
    });

    // Movement balance: at least one lower + one upper exercise (skip if full body intent isn't expected)
    const cats = day.exercises.map((ex) => categorizeExercise(ex, day.dayNumber));
    const hasUpper = cats.some((c) => c.bodyRegion === "upper");
    const hasLower = cats.some((c) => c.bodyRegion === "lower");
    const mixedDay = /full.?body|full body/i.test(day.name ?? "");
    if (mixedDay) {
      results.push({
        check: `${day.name}: movement balance`,
        passed: hasUpper && hasLower,
        note: hasUpper && hasLower ? "Upper + lower patterns present" : "Missing upper or lower work",
      });
    }

    // No duplicate exercises within a day
    const names = day.exercises.map((e) => e.name.toLowerCase());
    const unique = new Set(names);
    results.push({
      check: `${day.name}: no duplicates`,
      passed: unique.size === names.length,
      note: unique.size === names.length ? "No duplicates" : "Duplicate exercises detected",
    });

    // At least 3 exercises
    results.push({
      check: `${day.name}: minimum volume`,
      passed: day.exercises.length >= 3,
      note: `${day.exercises.length} exercises`,
    });
  }

  return results;
}

// ─── Coach Response Templates ─────────────────────────────────────────────────

function buildCoachResponse(
  type: TransformationType,
  log: TransformationLog,
): string {
  const preserved = log.preservedExercises.slice(0, 4).join(", ");
  const removedCount = log.removedExercises.length;
  const addedCount = log.addedExercises.length;

  const responses: Record<TransformationType, string> = {
    to_full_body: `Converted to a ${log.resultingSplit}. Your main compound work (${preserved || "key lifts"}) is preserved and redistributed for better frequency. ${removedCount > 0 ? `Removed ${removedCount} redundant accessories to keep sessions realistic.` : ""} Updated plan is in the right panel.`,

    to_upper_lower: `Restructured to ${log.resultingSplit}. Each day now has a clear upper or lower emphasis, which is more efficient for recovery and specialization. ${preserved ? `Core lifts preserved: ${preserved}.` : ""} Updated plan is in the right panel.`,

    to_ppl: `Converted to ${log.resultingSplit}. Each session now has a single focus — push, pull, or legs — which allows higher volume per pattern and cleaner recovery. ${preserved ? `Compound work preserved: ${preserved}.` : ""} Updated plan is in the right panel.`,

    reduce_days: `Consolidated to ${log.targetDays} days. Priority was given to compound movements — ${removedCount > 0 ? `${removedCount} lower-priority accessories were removed` : "no essential work was dropped"} to keep sessions within a realistic time frame. Updated plan is in the right panel.`,

    increase_days: `Expanded to ${log.targetDays} days by spreading your current volume more across the week. Sessions should be shorter and more recoverable. Updated plan is in the right panel.`,

    make_more_athletic: `Shifted toward a more athletic setup. ${addedCount > 0 ? `Added explosive work to session openings.` : "Explosive work already present — enhanced its placement."} ${removedCount > 0 ? `Removed ${removedCount} non-essential isolation exercises.` : ""} Compound and unilateral work preserved. Updated plan is in the right panel.`,

    reduce_fatigue: `Reduced overall training demand. ${removedCount > 0 ? `Removed ${removedCount} lower-priority exercises` : "Trimmed set counts"} on the most demanding days. Your main compound lifts are untouched. Updated plan is in the right panel.`,

    simplify: `Cleaned up redundant volume. Removed exercises where the same movement pattern was represented too many times in a single session. Compound structure intact. Updated plan is in the right panel.`,
  };

  return responses[type] ?? "Transformation applied. Updated plan is in the right panel.";
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function transformProgram(
  program: ProgramStructure,
  request: TransformRequest,
): TransformResult {
  const currentSplit = detectCurrentSplit(program);
  const currentDays = program.days.length;
  const targetDays = request.targetDays ?? currentDays;
  const profile = request.userProfile ?? null;

  const log: TransformationLog = {
    originalSplit: program.splitType ?? "unknown",
    detectedSplit: currentSplit,
    requestedTransformation: request.type,
    resultingSplit: "",
    targetDays,
    preservedExercises: [],
    replacedExercises: [],
    removedExercises: [],
    addedExercises: [],
    validationResults: [],
  };

  logger.info(
    {
      transformation: request.type,
      currentSplit,
      currentDays,
      targetDays,
      rawRequest: request.rawRequest.slice(0, 80),
    },
    "[SplitTransform] Starting transformation"
  );

  const pool = extractPool(program);

  let days: ProgramDay[];
  let newSplitType: string;
  let newSplitLabel: string;

  switch (request.type) {
    case "to_full_body":
      days = transformToFullBody(pool, targetDays, profile, log);
      newSplitType = `Full Body × ${targetDays}`;
      newSplitLabel = `Full Body × ${targetDays}`;
      break;

    case "to_upper_lower":
      days = transformToUpperLower(pool, targetDays, profile, log);
      newSplitType = `Upper/Lower × ${targetDays}`;
      newSplitLabel = `Upper/Lower × ${targetDays}`;
      break;

    case "to_ppl":
      days = transformToPPL(pool, targetDays, profile, log);
      newSplitType = `PPL × ${targetDays}`;
      newSplitLabel = `Push/Pull/Legs × ${targetDays}`;
      break;

    case "reduce_days":
      days = transformReduceDays(program, pool, targetDays, profile, log);
      newSplitType = program.splitType ?? currentSplit;
      newSplitLabel = `${currentSplit !== "unknown" ? currentSplit : "Custom"} × ${targetDays}`;
      break;

    case "increase_days":
      days = transformIncreaseDays(program, pool, targetDays, profile, log);
      newSplitType = program.splitType ?? currentSplit;
      newSplitLabel = `${currentSplit !== "unknown" ? currentSplit : "Custom"} × ${targetDays}`;
      break;

    case "make_more_athletic":
      days = transformMakeMoreAthletic(program, pool, profile, log);
      newSplitType = program.splitType ?? currentSplit;
      newSplitLabel = program.splitType ?? "Athletic Focus";
      break;

    case "reduce_fatigue":
      days = transformReduceFatigue(program, pool, profile, log);
      newSplitType = program.splitType ?? currentSplit;
      newSplitLabel = program.splitType ?? "Reduced Fatigue";
      break;

    case "simplify":
      days = transformSimplify(program, pool, profile, log);
      newSplitType = program.splitType ?? currentSplit;
      newSplitLabel = program.splitType ?? "Simplified";
      break;

    default:
      // Safe fallback — return program unchanged
      days = program.days;
      newSplitType = program.splitType ?? "unknown";
      newSplitLabel = program.splitType ?? "unknown";
      break;
  }

  log.resultingSplit = newSplitLabel;
  log.validationResults = validateTransform(days, profile);

  const failedChecks = log.validationResults.filter((v) => !v.passed);

  logger.info(
    {
      resultingSplit: log.resultingSplit,
      targetDays,
      preserved: log.preservedExercises,
      removed: log.removedExercises,
      added: log.addedExercises,
      validationPassed: failedChecks.length === 0,
      failedChecks: failedChecks.map((f) => f.check),
    },
    "[SplitTransform] Transformation complete"
  );

  const transformedProgram: ProgramStructure = {
    ...program,
    splitType: newSplitType,
    days,
  };

  const coachResponse = buildCoachResponse(request.type, log);

  return { program: transformedProgram, log, coachResponse };
}

// ─── Intent → TransformationType Mapper ──────────────────────────────────────
// Used by ai.ts/conversations.ts to map the intent metadata into a concrete TransformRequest

export function resolveTransformType(
  targetSplit: string,
  targetDays: number | null,
  targetGoalShift: string | null,
  currentDays: number,
): TransformationType {
  if (targetSplit === "full_body") return "to_full_body";
  if (targetSplit === "upper_lower") return "to_upper_lower";
  if (targetSplit === "ppl" || targetSplit === "push_pull") return "to_ppl";

  if (targetDays !== null) {
    return targetDays < currentDays ? "reduce_days" : "increase_days";
  }

  if (targetGoalShift === "athletic") return "make_more_athletic";
  if (targetGoalShift === "fat_loss" || targetGoalShift === "conditioning") return "reduce_fatigue";

  return "simplify";
}

// ─── Prompt Hint Builder ───────────────────────────────────────────────────────
// Tells the AI what the transformation engine already did, so it writes the
// confirmation naturally without re-doing the structural work.

export function buildTransformPromptHint(log: TransformationLog): string {
  const failedChecks = log.validationResults.filter((v) => !v.passed);

  return `## SPLIT TRANSFORMATION RESULT

The split transformation engine has already restructured the program.

- **Original:** ${log.originalSplit} (detected: ${log.detectedSplit})
- **Requested:** ${log.requestedTransformation}
- **Result:** ${log.resultingSplit} — ${log.targetDays} training days

**Preserved compound lifts:** ${log.preservedExercises.length > 0 ? log.preservedExercises.join(", ") : "none identified"}
**Removed exercises:** ${log.removedExercises.length > 0 ? log.removedExercises.join(", ") : "none"}
**Added exercises:** ${log.addedExercises.length > 0 ? log.addedExercises.join(", ") : "none"}
${failedChecks.length > 0 ? `**Validation warnings:** ${failedChecks.map((f) => f.note).join("; ")}` : "**Validation:** all checks passed"}

Return the restructured program JSON below as your response. Write a brief 2-3 sentence coach confirmation of the transformation. Do NOT redesign from scratch — use the transformed structure provided.`;
}
