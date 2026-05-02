// ─── CEO Heartbeat ────────────────────────────────────────────────────────────
//
// Final-gate quality check run by Coach Atlas (Coach Agent) before any program
// output is returned to the user. The Coach Agent acts as the CEO and must
// approve every output against nine coaching standards.
//
// This is a deterministic, zero-latency check — no AI calls, no async.
// It runs AFTER all upstream validation layers (constraint enforcement,
// quality validation, special considerations, return-from-injury, population,
// variation mandate) and immediately before the final return.
//
// INTEGRATION: Called from generateAIResponse() in lib/ai.ts just before
//              return { content: cleanContent, structuredData }.
//
// SKILL GUIDANCE:
//   - Preserve all safety, equipment, schedule, and pain constraints established upstream
//   - Keep this layer internal — output is system logging only, never user-facing
//   - Apply judgment: recommend redesign only when substantive structural or safety issues are detected
// ─────────────────────────────────────────────────────────────────────────────

import type { ProgramStructure } from "../lib/ai";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CEOHeartbeatContext {
  userGoal: string | null;
  sport: string | null;
  painLimitations: string | null;
  equipmentAccess: string | null;
  experienceLevel: string | null;
  /** Estimated session length, e.g. "45 min", "30 min" */
  sessionLength: string | null;
  daysPerWeek: number | null;
  /** Whether the program was built with expert judgment notes (creative/justified deviation) */
  hasExpertJudgmentNotes: boolean;
}

export interface CEOHeartbeatResult {
  /** true = approved; false = concerns detected */
  pass: boolean;
  /**
   * Substantive concerns that should be logged.
   * Each entry names the check that failed and why.
   */
  concerns: string[];
  /**
   * Non-blocking observations — Coach Agent can optionally address but
   * they do not affect the pass/fail result.
   */
  minorAdjustments?: string[];
  /**
   * true = the program has a meaningful structural or safety problem.
   * Coach Agent should consider re-routing to the Performance Architect
   * or triggering a regeneration pass. Non-blocking in production —
   * logged loudly and flagged for observation.
   */
  overrideRecommended?: boolean;
  /**
   * Coaching Identity Filter result (Phase 6).
   * Evaluates whether the output aligns with TrainChat's programming philosophy:
   * purposeful programming, movement quality, neuromuscular efficiency, less
   * junk volume, quality adaptation over random fatigue.
   *
   * "strong"     = output clearly reflects TrainChat's identity
   * "acceptable" = minor concerns but output is defensible
   * "weak"       = output feels generic or overbuilt — simplify recommended
   */
  identityAlignment: "strong" | "acceptable" | "weak";
  /** Specific identity concerns detected. Empty if identityAlignment is "strong". */
  identityConcerns: string[];
  /**
   * Premium skill names executed during this heartbeat pass.
   * Used for internal dev logging and observability.
   */
  skillsRun: string[];
  /**
   * Aggregate confidence in the program quality assessment.
   * Derived from the number and severity of concerns found.
   */
  confidence: "low" | "moderate" | "high";
  /**
   * true when expert judgment latitude was granted (hasExpertJudgmentNotes = true),
   * meaning flow/structure and simplicity checks were relaxed.
   */
  fallbackUsed: boolean;
}

// ─── Check Thresholds ─────────────────────────────────────────────────────────

const MIN_EXERCISES_PER_SESSION = 3;
const MAX_EXERCISES_PER_SESSION = 14;
const WARN_EXERCISES_PER_SESSION = 12;
const GENERIC_DAY_NAMES = new Set([
  "day 1", "day 2", "day 3", "day 4", "day 5", "day 6", "day 7",
  "legs", "arms", "chest", "back", "push", "pull", "lower", "upper",
  "session 1", "session 2", "session a", "session b",
]);
const GENERIC_NOTE_PATTERNS = [
  /^great (lower|upper|full|push|pull)/i,
  /^work hard/i,
  /^this (day|session|workout) targets/i,
  /^good (session|workout|day)/i,
  /^this is a (great|good|solid)/i,
  /^have fun/i,
];
const PAIN_REGION_KEYWORDS: Record<string, string[]> = {
  shoulder: ["overhead press", "behind neck", "upright row", "bench press", "incline press"],
  knee: ["box jump", "jumping lunge", "deep squat", "pistol squat", "leg press"],
  "low back": ["good morning", "jefferson deadlift", "back extension"],
  elbow: ["skull crusher", "close grip bench", "dip"],
  hip: ["hip thrust", "glute bridge"],
};

// ─── Individual Checks ────────────────────────────────────────────────────────

function checkClarity(
  program: ProgramStructure,
  concerns: string[],
  minor: string[],
): void {
  // Check: are day names specific?
  let genericNameCount = 0;
  for (const day of program.days) {
    if (GENERIC_DAY_NAMES.has((day.name ?? "").toLowerCase().trim())) {
      genericNameCount++;
    }
  }
  if (genericNameCount > 0) {
    minor.push(
      `Clarity: ${genericNameCount} day(s) use generic names (e.g. "Legs", "Day 1"). Day names should reflect training intent.`,
    );
  }

  // Check: exercises have intent cues
  let missingIntentCount = 0;
  for (const day of program.days) {
    for (const ex of day.exercises ?? []) {
      if (!ex.intent || ex.intent.trim().length < 10) {
        missingIntentCount++;
      }
    }
  }
  if (missingIntentCount > 0) {
    concerns.push(
      `Clarity: ${missingIntentCount} exercise(s) missing intent cues. Every exercise should explain position + purpose + transfer.`,
    );
  }
}

function checkGoalAlignment(
  program: ProgramStructure,
  ctx: CEOHeartbeatContext,
  concerns: string[],
): void {
  if (!ctx.userGoal) return;
  const goalLower = ctx.userGoal.toLowerCase();
  const isStrengthGoal = /strength|powerlifting|1rm|maximal/i.test(goalLower);
  const isHypertrophyGoal = /hypertrophy|muscle|size|bodybuilding|bulk/i.test(goalLower);
  const isConditioningGoal = /conditioning|cardio|endurance|fitness|fat loss|weight loss/i.test(goalLower);

  if (!isStrengthGoal && !isHypertrophyGoal && !isConditioningGoal) return;

  // Sample rep ranges from primary/secondary exercises
  const allReps: string[] = [];
  for (const day of program.days) {
    for (const ex of day.exercises ?? []) {
      const cls = (ex.classification ?? "").toLowerCase();
      if (cls === "primary" || cls === "secondary") {
        allReps.push(ex.reps ?? "");
      }
    }
  }
  if (allReps.length === 0) return;

  const avgRep = estimateAvgRepRange(allReps);

  if (isStrengthGoal && avgRep > 10) {
    concerns.push(
      `Goal Alignment: User goal is strength but primary exercises average ~${avgRep} reps. Strength programs should use 3–8 rep ranges for primary lifts.`,
    );
  }
  if (isHypertrophyGoal && avgRep < 6) {
    concerns.push(
      `Goal Alignment: User goal is hypertrophy but primary exercises average ~${avgRep} reps. Hypertrophy programs should use 8–15 rep ranges.`,
    );
  }
}

function checkPracticality(
  program: ProgramStructure,
  ctx: CEOHeartbeatContext,
  concerns: string[],
  minor: string[],
): void {
  // Check: session length vs exercise count
  const sessionLengthMin = extractSessionLengthMinutes(ctx.sessionLength);
  for (const day of program.days) {
    const exCount = (day.exercises ?? []).length;
    if (sessionLengthMin !== null && sessionLengthMin <= 35 && exCount > 6) {
      concerns.push(
        `Practicality: Day "${day.name}" has ${exCount} exercises but session length is ~${sessionLengthMin} min. Consider trimming to 4–5 exercises to fit the time constraint.`,
      );
    }
    if (exCount < MIN_EXERCISES_PER_SESSION) {
      minor.push(
        `Practicality: Day "${day.name}" has only ${exCount} exercise(s). Minimum effective session density is usually ${MIN_EXERCISES_PER_SESSION}+.`,
      );
    }
  }

  // Check: days per week match the program day count
  if (ctx.daysPerWeek !== null && program.days.length !== ctx.daysPerWeek) {
    concerns.push(
      `Practicality: Program has ${program.days.length} day(s) but context shows ${ctx.daysPerWeek} days/week requested.`,
    );
  }
}

function checkCoachingQuality(
  program: ProgramStructure,
  concerns: string[],
  minor: string[],
): void {
  // Check: day notes are present and non-generic
  let missingNotesCount = 0;
  let genericNotesCount = 0;
  for (const day of program.days) {
    if (!day.notes || day.notes.trim().length < 20) {
      missingNotesCount++;
    } else if (GENERIC_NOTE_PATTERNS.some((p) => p.test(day.notes ?? ""))) {
      genericNotesCount++;
    }
  }
  if (missingNotesCount > 0) {
    concerns.push(
      `Coaching Quality: ${missingNotesCount} day(s) missing substantive coach notes. Notes should explain why the session exists in terms of the user's goal.`,
    );
  }
  if (genericNotesCount > 0) {
    minor.push(
      `Coaching Quality: ${genericNotesCount} day(s) have generic coach notes. Notes should read like a real coach, not a template.`,
    );
  }
}

function checkFlowAndStructure(
  program: ProgramStructure,
  concerns: string[],
): void {
  for (const day of program.days) {
    const exercises = day.exercises ?? [];
    if (exercises.length < 2) continue;

    // Check: power/plyometric exercises appearing AFTER primary strength (missequencing)
    let foundPrimary = false;
    for (const ex of exercises) {
      const cls = (ex.classification ?? "").toLowerCase();
      if (cls === "primary") foundPrimary = true;
      if (foundPrimary && (cls === "power" || cls === "plyometric" || cls === "olympic")) {
        concerns.push(
          `Flow & Structure: Day "${day.name}" has a ${cls} exercise ("${ex.name}") appearing AFTER a Primary lift. Power/Plyometric/Olympic work should come BEFORE primary strength for neural quality.`,
        );
        break; // only flag once per day
      }
    }
  }
}

function checkFatigueAndRecovery(
  program: ProgramStructure,
  concerns: string[],
  minor: string[],
): void {
  for (const day of program.days) {
    const exCount = (day.exercises ?? []).length;
    if (exCount > MAX_EXERCISES_PER_SESSION) {
      concerns.push(
        `Fatigue & Recovery: Day "${day.name}" has ${exCount} exercises — this is excessive for most populations. Review for junk volume.`,
      );
    } else if (exCount > WARN_EXERCISES_PER_SESSION) {
      minor.push(
        `Fatigue & Recovery: Day "${day.name}" has ${exCount} exercises — on the high end. Verify every exercise is earning its place.`,
      );
    }
  }
}

function checkSafety(
  program: ProgramStructure,
  ctx: CEOHeartbeatContext,
  concerns: string[],
): void {
  if (!ctx.painLimitations) return;
  const painLower = ctx.painLimitations.toLowerCase();

  for (const [region, flaggedExercises] of Object.entries(PAIN_REGION_KEYWORDS)) {
    if (!painLower.includes(region)) continue;

    for (const day of program.days) {
      for (const ex of day.exercises ?? []) {
        const exNameLower = ex.name.toLowerCase();
        if (flaggedExercises.some((f) => exNameLower.includes(f.toLowerCase()))) {
          concerns.push(
            `Safety: Day "${day.name}" contains "${ex.name}" which may aggravate the user's stated ${region} pain limitation. Verify this is intentional and safe.`,
          );
        }
      }
    }
  }
}

function checkSimplicity(
  program: ProgramStructure,
  ctx: CEOHeartbeatContext,
  concerns: string[],
  minor: string[],
): void {
  const isBeginnerOrMinimalist =
    /beginner|novice|simple|minimalist|just start/i.test(ctx.userGoal ?? "") ||
    /beginner|novice/i.test(ctx.experienceLevel ?? "");

  for (const day of program.days) {
    const exCount = (day.exercises ?? []).length;
    if (isBeginnerOrMinimalist && exCount > 7) {
      concerns.push(
        `Simplicity: User is a beginner/minimalist but Day "${day.name}" has ${exCount} exercises — too complex. Target 4–6 exercises for this population.`,
      );
    }
  }

  // Check: excessive exercise diversity (more than 5 unique classifications in one session)
  for (const day of program.days) {
    const classifications = new Set(
      (day.exercises ?? []).map((e) => (e.classification ?? "").toLowerCase()).filter(Boolean),
    );
    if (classifications.size > 6) {
      minor.push(
        `Simplicity: Day "${day.name}" uses ${classifications.size} exercise classifications — potentially overengineered. Verify all are necessary.`,
      );
    }
  }
}

function checkConfidence(
  program: ProgramStructure,
  concerns: string[],
  minor: string[],
): void {
  // Final confidence check: program must have a name, description, and at least one day with exercises
  if (!program.programName || program.programName.trim().length < 3) {
    concerns.push("Confidence: Program is missing a meaningful name.");
  }
  if (!program.description || program.description.trim().length < 10) {
    minor.push("Confidence: Program description is missing or too brief.");
  }
  for (const day of program.days) {
    if (!day.exercises || day.exercises.length === 0) {
      concerns.push(`Confidence: Day "${day.name || day.dayNumber}" has no exercises.`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateAvgRepRange(repStrings: string[]): number {
  const nums: number[] = [];
  for (const r of repStrings) {
    const match = r.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    if (match) {
      const lo = parseInt(match[1], 10);
      const hi = match[2] ? parseInt(match[2], 10) : lo;
      nums.push((lo + hi) / 2);
    }
  }
  if (nums.length === 0) return 8; // neutral default
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function extractSessionLengthMinutes(sessionLength: string | null): number | null {
  if (!sessionLength) return null;
  const match = sessionLength.match(/(\d+)\s*(?:min|minute)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ─── Coaching Identity Filter (Phase 6) ──────────────────────────────────────
//
// Checks whether the output aligns with TrainChat's programming philosophy:
//   purposeful programming · movement quality · neuromuscular efficiency
//   less junk volume · quality adaptation > random fatigue
//   constraints respected · simple enough to execute

function checkCoachingIdentity(
  program: ProgramStructure,
  ctx: CEOHeartbeatContext,
  identityConcerns: string[],
): void {
  const isStrength = /strength|power|force/i.test(ctx.userGoal ?? "");
  const isSpeed = /speed|sprint|athletic/i.test(ctx.userGoal ?? "") || /speed|sprint/i.test(ctx.sport ?? "");

  // 1. Overbuilt — excessive exercise count relative to goal
  //    Quality programs: 6–9 exercises per day for general; up to 11 for advanced multi-block.
  const MAX_QUALITY_EXERCISES = isStrength ? 9 : 11;
  for (const day of program.days) {
    const exCount = (day.exercises ?? []).length;
    if (exCount > MAX_QUALITY_EXERCISES) {
      identityConcerns.push(
        `Overbuilt: Day "${day.name}" has ${exCount} exercises — quality programs prioritize fewer, better exercises over exercise count. Review for junk volume.`,
      );
    }
  }

  // 2. Junk volume — 4+ consecutive accessories, or accessory-dominant day with no compound base
  for (const day of program.days) {
    const exes = day.exercises ?? [];
    let accessoryRun = 0;
    for (const ex of exes) {
      const cls = (ex.classification ?? "").toLowerCase();
      if (cls === "accessory") {
        accessoryRun++;
      } else {
        accessoryRun = 0;
      }
      if (accessoryRun >= 4) {
        identityConcerns.push(
          `Junk Volume: Day "${day.name}" has 4+ consecutive accessory exercises. Each accessory must earn its place and contribute directly to the goal.`,
        );
        break;
      }
    }

    // Flag days with accessories but no compound foundation
    const hasCompound = exes.some((e) =>
      /(primary|secondary|power|plyometric|olympic)/.test((e.classification ?? "").toLowerCase()),
    );
    const accessoryCount = exes.filter((e) => /accessory/.test((e.classification ?? "").toLowerCase())).length;
    if (!hasCompound && accessoryCount >= 3 && exes.length >= 4) {
      identityConcerns.push(
        `Junk Volume: Day "${day.name}" has ${accessoryCount} accessories but no primary or secondary compound work — lacks structural foundation.`,
      );
    }
  }

  // 3. Static intensity — uniform high-intensity naming across all days suggests
  //    no recovery logic (random fatigue bias over quality adaptation)
  if (program.days.length >= 4) {
    const intensityWords = ["max", "hardest", "brutal", "extreme", "all out", "all-out", "intense"];
    const highIntensityDays = program.days.filter((d) =>
      intensityWords.some((w) => d.name.toLowerCase().includes(w)),
    );
    if (highIntensityDays.length >= Math.ceil(program.days.length * 0.75)) {
      identityConcerns.push(
        "Static Intensity: Most day names suggest uniform maximum intensity with no visible recovery or variation structure. Quality programs alternate high and moderate stimulus.",
      );
    }
  }

  // 4. Speed/power programs must include neural quality work (power/plyometric)
  if (isSpeed) {
    for (const day of program.days) {
      const exes = day.exercises ?? [];
      if (exes.length < 3) continue; // skip very short days
      const hasPowerWork = exes.some((e) =>
        /(power|plyometric|olympic)/.test((e.classification ?? "").toLowerCase()),
      );
      if (!hasPowerWork) {
        identityConcerns.push(
          `Intentionality: Speed/power program — Day "${day.name}" has no Power, Plyometric, or Olympic work. Speed transfer requires neural quality work to be present.`,
        );
      }
    }
  }
}

// ─── Main Check ───────────────────────────────────────────────────────────────

/**
 * Run the CEO Heartbeat Check on a finalized program before it is returned
 * to the user. This is Coach Atlas's final quality gate.
 *
 * Runs nine coaching-standard checks plus the Coaching Identity Filter.
 *
 * @param program - The finalized ProgramStructure about to be returned.
 * @param context - User context for goal alignment, safety, and practicality checks.
 * @returns CEOHeartbeatResult with pass/fail, identity alignment, and override recommendation.
 */
export function runCEOHeartbeatCheck(
  program: ProgramStructure,
  context: CEOHeartbeatContext,
): CEOHeartbeatResult {
  const concerns: string[] = [];
  const minor: string[] = [];

  // 1. Clarity — intent cues and day naming
  checkClarity(program, concerns, minor);

  // 2. Goal Alignment — rep ranges match stated goal
  checkGoalAlignment(program, context, concerns);

  // 3. Practicality — session length, day count, density
  checkPracticality(program, context, concerns, minor);

  // 4. Coaching Quality — coach notes are substantive
  checkCoachingQuality(program, concerns, minor);

  // 5. Flow & Structure — block order is defensible
  checkFlowAndStructure(program, concerns);

  // 6. Fatigue & Recovery — no excessive junk volume
  checkFatigueAndRecovery(program, concerns, minor);

  // 7. Safety — pain limitations not violated
  checkSafety(program, context, concerns);

  // 8. Simplicity vs Overengineering — not overdone for the population
  checkSimplicity(program, context, concerns, minor);

  // 9. Confidence — program completeness
  checkConfidence(program, concerns, minor);

  // Creative programs with expert judgment notes get more latitude on structural checks.
  // Remove flow/structure and simplicity concerns if expert judgment is present.
  const finalConcerns = context.hasExpertJudgmentNotes
    ? concerns.filter(
        (c) =>
          !c.startsWith("Flow & Structure:") &&
          !c.startsWith("Simplicity:") &&
          !c.startsWith("Goal Alignment:"),
      )
    : concerns;

  const pass = finalConcerns.length === 0;

  // overrideRecommended when safety or critical structural issues are found
  const overrideRecommended =
    finalConcerns.some(
      (c) =>
        c.startsWith("Safety:") ||
        c.startsWith("Practicality: Day") ||
        c.startsWith("Fatigue & Recovery: Day") ||
        c.startsWith("Confidence: Day"),
    ) || finalConcerns.length >= 4;

  // 10. Coaching Identity Filter — TrainChat philosophy alignment
  const identityConcerns: string[] = [];
  checkCoachingIdentity(program, context, identityConcerns);

  const identityAlignment: CEOHeartbeatResult["identityAlignment"] =
    identityConcerns.length === 0 ? "strong" :
    identityConcerns.length === 1 ? "acceptable" :
    "weak";

  const skillsRun = [
    "Clarity Check",
    "Goal Match Check",
    "Practicality Check",
    "Coaching Quality Check",
    "Flow & Structure Check",
    "Fatigue Economics Check",
    "Safety Check",
    "Simplicity Check",
    "Confidence Check",
    "Identity Check",
  ];

  const confidence: CEOHeartbeatResult["confidence"] =
    finalConcerns.length === 0
      ? "high"
      : finalConcerns.length <= 2
        ? "moderate"
        : "low";

  return {
    pass,
    concerns: finalConcerns,
    minorAdjustments: minor.length > 0 ? minor : undefined,
    overrideRecommended: overrideRecommended || undefined,
    identityAlignment,
    identityConcerns,
    skillsRun,
    confidence,
    fallbackUsed: context.hasExpertJudgmentNotes,
  };
}
