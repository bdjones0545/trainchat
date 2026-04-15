/**
 * Coach Select — Intelligent Exercise Selection Engine
 *
 * This is the brain of TrainChat's exercise selection system.
 * It thinks like an expert strength coach — not like a database query.
 *
 * Core principles:
 * 1. NSCA exercise hierarchy: explosive → primary → secondary compound → accessory → conditioning
 * 2. Goal-driven prescription: strength vs hypertrophy vs athletic vs fat loss
 * 3. Constraint filtering: equipment, injuries, experience level
 * 4. Variety rotation: deprioritize recently used exercises
 * 5. Progression awareness: surfaces regressions/progressions, selects appropriate difficulty
 *
 * The session types map to specific pattern combinations that mirror how
 * an expert coach would actually structure a training day.
 */

import {
  getByMovementPattern,
  getSwapCandidates,
  type ExerciseLibraryEntry,
} from "./exercise-service";

// ─── Public Types ─────────────────────────────────────────────────────────────

export type GoalType =
  | "strength"
  | "hypertrophy"
  | "athletic_performance"
  | "fat_loss"
  | "general_fitness"
  | "endurance"
  | "power"
  | "speed";

export type ExperienceTier = "beginner" | "intermediate" | "advanced";
export type EquipmentLevel = "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight";

export type SessionType =
  | "lower_a"           // Squat primary, hinge secondary
  | "lower_b"           // Hinge primary, squat secondary
  | "upper_a"           // Horizontal push primary, pull secondary
  | "upper_b"           // Vertical pull primary, push secondary
  | "push"              // All pressing — chest, shoulder, triceps
  | "pull"              // All pulling — back, biceps
  | "legs"              // Combined lower — squat + hinge + iso
  | "full_body_a"       // Squat + horizontal push primary
  | "full_body_b"       // Hinge + vertical pull primary
  | "full_body"         // Balanced full body
  | "conditioning";     // Power/plyometric/conditioning day

export type ExerciseRole = "explosive" | "primary" | "secondary" | "accessory" | "conditioning";

export interface CoachExercise {
  name: string;
  movementPattern: string;
  bodyRegion: string | null;
  classification: string;
  role: ExerciseRole;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
  equipment: string[];
  unilateral: boolean;
  easierAlternative: string | null;
  harderAlternative: string | null;
}

export interface CoachSelectOpts {
  sessionType: SessionType;
  goal: GoalType;
  experience: ExperienceTier;
  equipment: EquipmentLevel;
  injuryFlags?: string[];
  recentExercises?: string[];  // avoid repeating within X sessions
  sessionDuration?: number;    // minutes — controls exercise count
  includeExplosive?: boolean;  // override — force/suppress explosive work
  weekNumber?: number;         // 1-4 — affects volume/intensity scaling
}

// ─── Session Blueprint: Pattern ordering per session type ─────────────────────
// Each tier maps to movement patterns from the DB.
// The order mirrors NSCA hierarchy: explosive → primary → secondary → accessory → conditioning

interface SessionBlueprint {
  explosive: string[];
  primary: string[];
  secondary: string[];
  accessory: string[];
  conditioning: string[];
  explosiveForGoals: GoalType[];  // Only add explosive for these goals
}

const SESSION_BLUEPRINTS: Record<SessionType, SessionBlueprint> = {
  lower_a: {
    explosive:    ["plyometric"],
    primary:      ["squat"],
    secondary:    ["hinge"],
    accessory:    ["iso_legs", "core_anti_extension", "activation"],
    conditioning: ["carry"],
    explosiveForGoals: ["athletic_performance", "strength"],
  },
  lower_b: {
    explosive:    ["power_explosive", "plyometric"],
    primary:      ["hinge"],
    secondary:    ["squat"],
    accessory:    ["iso_legs", "core_anti_lateral", "activation"],
    conditioning: ["carry", "conditioning"],
    explosiveForGoals: ["athletic_performance", "strength"],
  },
  upper_a: {
    explosive:    ["power_explosive"],
    primary:      ["push_horizontal"],
    secondary:    ["pull_horizontal", "push_vertical"],
    accessory:    ["iso_shoulders", "iso_arms", "core_anti_rotation"],
    conditioning: [],
    explosiveForGoals: ["athletic_performance"],
  },
  upper_b: {
    explosive:    [],
    primary:      ["pull_vertical"],
    secondary:    ["pull_horizontal", "push_vertical"],
    accessory:    ["iso_back", "iso_arms", "iso_shoulders"],
    conditioning: [],
    explosiveForGoals: [],
  },
  push: {
    explosive:    [],
    primary:      ["push_horizontal"],
    secondary:    ["push_vertical"],
    accessory:    ["iso_chest", "iso_shoulders", "iso_arms"],
    conditioning: [],
    explosiveForGoals: [],
  },
  pull: {
    explosive:    [],
    primary:      ["pull_vertical"],
    secondary:    ["pull_horizontal"],
    accessory:    ["iso_back", "iso_arms", "iso_shoulders"],
    conditioning: [],
    explosiveForGoals: [],
  },
  legs: {
    explosive:    ["plyometric", "power_explosive"],
    primary:      ["squat"],
    secondary:    ["hinge", "squat"],
    accessory:    ["iso_legs", "core_flexion", "activation"],
    conditioning: ["carry"],
    explosiveForGoals: ["athletic_performance", "fat_loss"],
  },
  full_body_a: {
    explosive:    ["plyometric"],
    primary:      ["squat", "push_horizontal"],
    secondary:    ["hinge", "pull_horizontal"],
    accessory:    ["core_anti_extension", "iso_shoulders"],
    conditioning: [],
    explosiveForGoals: ["athletic_performance"],
  },
  full_body_b: {
    explosive:    [],
    primary:      ["hinge", "pull_vertical"],
    secondary:    ["squat", "push_vertical"],
    accessory:    ["core_rotation", "iso_arms"],
    conditioning: [],
    explosiveForGoals: [],
  },
  full_body: {
    explosive:    ["power_explosive", "plyometric"],
    primary:      ["squat", "hinge", "push_horizontal"],
    secondary:    ["pull_horizontal", "push_vertical"],
    accessory:    ["core_anti_extension", "iso_arms", "carry"],
    conditioning: ["conditioning"],
    explosiveForGoals: ["athletic_performance", "fat_loss"],
  },
  conditioning: {
    explosive:    ["power_explosive", "plyometric", "sport_performance"],
    primary:      ["conditioning"],
    secondary:    ["carry"],
    accessory:    ["core_anti_extension", "smr"],
    conditioning: ["mobility"],
    explosiveForGoals: ["athletic_performance", "fat_loss", "general_fitness", "strength", "hypertrophy", "endurance"],
  },
};

// ─── Goal Prescription Tables ─────────────────────────────────────────────────
// Maps goal + role → sets / reps / rest / base coaching note
// Week scaling is applied on top (deload reduces, accumulation increases)

interface Prescription {
  sets: number;
  reps: string;
  rest: string;
  note: string;
  classification: string;
}

type PrescriptionTable = Record<ExerciseRole, Prescription>;

const PRESCRIPTIONS: Record<GoalType, PrescriptionTable> = {
  strength: {
    explosive:    { classification: "Plyometric/Explosive", sets: 4, reps: "3-5",  rest: "3 min",     note: "Explosive concentric — max intent every rep. CNS must be fresh." },
    primary:      { classification: "Primary",              sets: 5, reps: "3-5",  rest: "3-4 min",   note: "Control the eccentric (2-3s), drive hard through the concentric. 1 RIR on top sets." },
    secondary:    { classification: "Secondary Compound",   sets: 4, reps: "4-6",  rest: "2-3 min",   note: "Controlled tempo throughout. Support the primary pattern. 2 RIR on all working sets." },
    accessory:    { classification: "Accessory",            sets: 3, reps: "8-12", rest: "60-90 sec", note: "Full range of motion. Quality reps — accumulate volume with good positions." },
    conditioning: { classification: "Conditioning",         sets: 3, reps: "20m",  rest: "90 sec",    note: "Flush the system after heavy compound work. Maintain posture." },
  },
  hypertrophy: {
    explosive:    { classification: "Plyometric/Explosive", sets: 3, reps: "4-6",   rest: "2-3 min",   note: "Explosive intent for CNS priming — not a conditioning exercise." },
    primary:      { classification: "Primary",              sets: 4, reps: "6-10",  rest: "2-3 min",   note: "3-second eccentric. Feel the muscle load — contraction quality matters. 2 RIR." },
    secondary:    { classification: "Secondary Compound",   sets: 3, reps: "8-12",  rest: "90 sec",    note: "Moderate load, full ROM, mind-muscle connection throughout. 2 RIR." },
    accessory:    { classification: "Accessory",            sets: 3, reps: "10-15", rest: "60 sec",    note: "Chase the pump, not the load. Full stretch at the bottom of every rep." },
    conditioning: { classification: "Conditioning",         sets: 2, reps: "10-12", rest: "60 sec",    note: "Metabolic finisher — keeps density high and adds volume." },
  },
  athletic_performance: {
    explosive:    { classification: "Plyometric/Explosive", sets: 4, reps: "3-5", rest: "2-3 min",   note: "Maximum explosive intent — bar speed is the output metric, not weight." },
    primary:      { classification: "Primary",              sets: 4, reps: "4-6", rest: "2-3 min",   note: "Strength is the engine of athletic power. Move with controlled aggression." },
    secondary:    { classification: "Secondary Compound",   sets: 3, reps: "5-8", rest: "2 min",     note: "Sport-relevant loading. Stay crisp — no grinding reps." },
    accessory:    { classification: "Accessory",            sets: 3, reps: "8-12", rest: "75 sec",   note: "Build resilient tissue. Full ROM, quality movement patterns." },
    conditioning: { classification: "Conditioning",         sets: 4, reps: "5-8", rest: "90 sec",    note: "Power endurance — maintain output quality across all sets." },
  },
  fat_loss: {
    explosive:    { classification: "Plyometric/Explosive", sets: 3, reps: "6-8",   rest: "90 sec",    note: "Metabolic power work — keep rest tight and intent high." },
    primary:      { classification: "Primary",              sets: 3, reps: "8-12",  rest: "90 sec",    note: "Compound loading with metabolic demand. Full ROM — every rep counts." },
    secondary:    { classification: "Secondary Compound",   sets: 3, reps: "10-15", rest: "60 sec",    note: "Moderate load, higher reps. Keep session density high." },
    accessory:    { classification: "Accessory",            sets: 3, reps: "12-20", rest: "45-60 sec", note: "Volume-based accessory. Squeeze the contraction on each rep." },
    conditioning: { classification: "Conditioning",         sets: 3, reps: "30 sec", rest: "30 sec",   note: "Work capacity finisher — metabolic stress closes the session." },
  },
  general_fitness: {
    explosive:    { classification: "Plyometric/Explosive", sets: 3, reps: "5-8",   rest: "90 sec",    note: "Power pattern learning — focus on intent and landing mechanics." },
    primary:      { classification: "Primary",              sets: 3, reps: "8-12",  rest: "90 sec",    note: "Build the movement pattern with quality reps. No ego loading." },
    secondary:    { classification: "Secondary Compound",   sets: 3, reps: "10-15", rest: "60-75 sec", note: "Support the primary. Consistent tempo throughout." },
    accessory:    { classification: "Accessory",            sets: 2, reps: "12-15", rest: "60 sec",    note: "Accessory work for balance, resilience, and longevity." },
    conditioning: { classification: "Conditioning",         sets: 2, reps: "20-30 sec", rest: "45 sec", note: "Light metabolic work — close the session strong." },
  },
  endurance: {
    explosive:    { classification: "Plyometric/Explosive", sets: 3, reps: "8-10",    rest: "90 sec",    note: "Neuromuscular power for endurance athletes — brief, sharp, explosive." },
    primary:      { classification: "Primary",              sets: 3, reps: "12-15",   rest: "60-90 sec", note: "Strength endurance — higher reps at moderate load. Control the breath." },
    secondary:    { classification: "Secondary Compound",   sets: 3, reps: "15-20",   rest: "60 sec",    note: "Volume-based work to build muscular endurance." },
    accessory:    { classification: "Accessory",            sets: 2, reps: "15-20",   rest: "45 sec",    note: "High-rep accessory for muscular endurance and tissue resilience." },
    conditioning: { classification: "Conditioning",         sets: 4, reps: "60-90 sec", rest: "30-60 sec", note: "Aerobic conditioning finisher — Zone 2 to threshold effort." },
  },
  power: {
    explosive:    { classification: "Power",      sets: 4, reps: "2-4",  rest: "3-5 min", note: "Maximum intent every rep — this is a power development exercise, not a fatigue exercise. Bar speed is the output, not load." },
    primary:      { classification: "Primary",   sets: 4, reps: "2-5",  rest: "3-5 min", note: "Heavy load at high velocity intent — the 'strength' side of the contrast pair. Drive with maximum force application." },
    secondary:    { classification: "Secondary", sets: 3, reps: "3-6",  rest: "2-3 min", note: "Secondary power development or strength support. Move with intent — quality over quantity." },
    accessory:    { classification: "Accessory", sets: 2, reps: "6-10", rest: "90 sec",  note: "Structural support for power output — posterior chain, trunk stiffness, joint prep. Not a fatigue exercise." },
    conditioning: { classification: "Conditioning", sets: 2, reps: "30m", rest: "2 min", note: "Light movement work only — power sessions do not end with metabolic conditioning. This is recovery-oriented." },
  },
  speed: {
    explosive:    { classification: "Speed",     sets: 3, reps: "2-4",  rest: "3-5 min", note: "Full sprint effort — every rep is a true max-speed attempt. If mechanics break down, the rep is over." },
    primary:      { classification: "Primary",   sets: 3, reps: "2-5",  rest: "3-5 min", note: "Speed-strength compound work — power-focused primary lift that supports sprint mechanics. Full intent every rep." },
    secondary:    { classification: "Secondary", sets: 3, reps: "4-8",  rest: "2-3 min", note: "Strength support for speed — posterior chain, hip extension, unilateral power. Supports sprint mechanics." },
    accessory:    { classification: "Accessory", sets: 2, reps: "8-12", rest: "90 sec",  note: "Sprint-mechanics accessory — hip flexor, hamstring resilience, ankle stiffness. Structural sprint preparation." },
    conditioning: { classification: "Conditioning", sets: 0, reps: "N/A", rest: "N/A",   note: "Speed sessions do NOT include conditioning work. Fatigue contaminates speed development." },
  },
};

// ─── Volume scaler by week ────────────────────────────────────────────────────
// Week 1: -1 set (intro), Week 2-3: standard, Week 4: deload (-2 sets, -1 rep range)

function scaleForWeek(sets: number, weekNumber: number): number {
  if (weekNumber === 1) return Math.max(2, sets - 1);  // intro week — lighter volume
  if (weekNumber === 4) return Math.max(2, sets - 2);  // deload
  return sets;  // weeks 2 and 3 — full volume
}

// ─── Difficulty gate by experience ───────────────────────────────────────────

const DIFFICULTY_MAX: Record<ExperienceTier, "beginner" | "intermediate" | "advanced"> = {
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
};

// ─── Core Selection Logic ─────────────────────────────────────────────────────

/**
 * Pick the best exercise from DB candidates for a given tier.
 * Deprioritizes recently-used exercises but doesn't exclude them
 * (better to repeat than to have nothing).
 */
async function pickFromPatterns(
  patterns: string[],
  opts: CoachSelectOpts,
  exclude: Set<string>,
  count: number = 1
): Promise<ExerciseLibraryEntry[]> {
  if (patterns.length === 0) return [];

  const recent = new Set((opts.recentExercises ?? []).map((n) => n.toLowerCase()));
  const allCandidates: ExerciseLibraryEntry[] = [];

  for (const pattern of patterns) {
    const candidates = await getByMovementPattern({
      pattern,
      equipmentLevel: opts.equipment,
      injuryFlags: opts.injuryFlags ?? [],
      difficultyMax: DIFFICULTY_MAX[opts.experience],
      excludeNames: Array.from(exclude),
      maxCount: 20, // get plenty, then we'll score and pick
    });
    allCandidates.push(...candidates);
  }

  if (allCandidates.length === 0) return [];

  // Score: prefer goal-matching intent tags, deprioritize recently used
  const scored = allCandidates.map((ex) => {
    const intentTags = ex.intentTags as string[];
    const goalScore = intentTags.includes(opts.goal) || intentTags.includes(opts.goal.replace("_performance", "")) ? 2 : 0;
    const varietyScore = recent.has(ex.name.toLowerCase()) ? -3 : 0;
    const diffScore = ex.difficultyLevel === opts.experience ? 1 : 0;
    return { ex, score: goalScore + varietyScore + diffScore };
  });

  scored.sort((a, b) => b.score - a.score);

  const results: ExerciseLibraryEntry[] = [];
  const seen = new Set<string>();
  for (const { ex } of scored) {
    if (results.length >= count) break;
    if (!seen.has(ex.name.toLowerCase())) {
      results.push(ex);
      seen.add(ex.name.toLowerCase());
      exclude.add(ex.name.toLowerCase());
    }
  }

  return results;
}

/**
 * Convert a DB exercise + prescription into a CoachExercise with full coaching context.
 */
function buildCoachExercise(
  ex: ExerciseLibraryEntry,
  role: ExerciseRole,
  goal: GoalType,
  weekNumber: number
): CoachExercise {
  const rx = PRESCRIPTIONS[goal][role];
  const scaledSets = scaleForWeek(rx.sets, weekNumber);

  // Prefer the exercise's own description as the coaching note if it's specific enough
  const coachingNote =
    ex.description && ex.description.length > 20
      ? ex.description
      : rx.note;

  const easier = (ex.easierVariations as string[]);
  const harder = (ex.harderVariations as string[]);

  return {
    name: ex.name,
    movementPattern: ex.movementPattern,
    bodyRegion: ex.bodyRegion,
    classification: rx.classification,
    role,
    sets: scaledSets,
    reps: rx.reps,
    rest: rx.rest,
    notes: coachingNote,
    equipment: ex.equipment as string[],
    unilateral: ex.unilateral,
    easierAlternative: easier[0] ?? null,
    harderAlternative: harder[0] ?? null,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Select exercises for a training session like an expert strength coach.
 *
 * Returns a coach-ordered array of exercises with full prescription metadata.
 * The order mirrors the NSCA hierarchy — explosive first, compounds before
 * accessories, conditioning last.
 */
export async function selectSessionExercises(
  opts: CoachSelectOpts
): Promise<CoachExercise[]> {
  const {
    sessionType,
    goal,
    experience,
    weekNumber = 2,
    includeExplosive,
  } = opts;

  const blueprint = SESSION_BLUEPRINTS[sessionType];
  const usedNames = new Set<string>();
  const result: CoachExercise[] = [];

  // ── Target exercise count based on session duration ──
  const duration = opts.sessionDuration ?? 60;
  const maxExercises =
    duration <= 40 ? 4 :
    duration <= 55 ? 5 :
    duration <= 70 ? 6 : 7;

  // ── 1. Explosive (NSCA position 1-2) ──
  const wantExplosive = includeExplosive ??
    (blueprint.explosiveForGoals.includes(goal) && blueprint.explosive.length > 0);

  if (wantExplosive && result.length < maxExercises) {
    const explosivePicks = await pickFromPatterns(blueprint.explosive, opts, usedNames, 1);
    for (const ex of explosivePicks) {
      result.push(buildCoachExercise(ex, "explosive", goal, weekNumber));
    }
  }

  // ── 2. Primary compound(s) (NSCA position 3) ──
  const primaryCount = blueprint.primary.length > 1 ? 2 : 1;
  if (result.length < maxExercises) {
    const primaryPicks = await pickFromPatterns(blueprint.primary, opts, usedNames, primaryCount);
    for (const ex of primaryPicks) {
      if (result.length >= maxExercises) break;
      result.push(buildCoachExercise(ex, "primary", goal, weekNumber));
    }
  }

  // ── 3. Secondary compound(s) (NSCA position 4) ──
  const secondarySlots = Math.min(2, maxExercises - result.length);
  if (secondarySlots > 0) {
    const secondaryPicks = await pickFromPatterns(blueprint.secondary, opts, usedNames, secondarySlots);
    for (const ex of secondaryPicks) {
      if (result.length >= maxExercises) break;
      result.push(buildCoachExercise(ex, "secondary", goal, weekNumber));
    }
  }

  // ── 4. Accessory / Isolation (NSCA position 5) ──
  const accessorySlots = Math.min(2, maxExercises - result.length);
  if (accessorySlots > 0) {
    const accessoryPicks = await pickFromPatterns(blueprint.accessory, opts, usedNames, accessorySlots);
    for (const ex of accessoryPicks) {
      if (result.length >= maxExercises) break;
      result.push(buildCoachExercise(ex, "accessory", goal, weekNumber));
    }
  }

  // ── 5. Conditioning / Finisher (NSCA position 6 — only if time allows) ──
  if (blueprint.conditioning.length > 0 && result.length < maxExercises && duration >= 55) {
    const condPicks = await pickFromPatterns(blueprint.conditioning, opts, usedNames, 1);
    for (const ex of condPicks) {
      if (result.length >= maxExercises) break;
      result.push(buildCoachExercise(ex, "conditioning", goal, weekNumber));
    }
  }

  return result;
}

/**
 * Select an equipment-appropriate swap for a given exercise.
 * Respects injury constraints and experience level.
 * Returns the best candidate and coaching rationale.
 */
export async function selectSwap(opts: {
  exerciseName: string;
  reason: "equipment" | "injury" | "too_hard" | "too_easy" | "variety";
  goal: GoalType;
  experience: ExperienceTier;
  equipment: EquipmentLevel;
  injuryFlags?: string[];
}): Promise<{ exercise: CoachExercise | null; rationale: string }> {
  const { exerciseName, reason, goal, experience, equipment, injuryFlags = [] } = opts;

  const candidates = await getSwapCandidates({
    exerciseName,
    equipmentLevel: equipment,
    injuryFlags,
    maxCount: 6,
  });

  if (candidates.length === 0) {
    return {
      exercise: null,
      rationale: `No direct substitutes found for "${exerciseName}" given the current constraints. Consider an exercise from the same movement pattern.`,
    };
  }

  // For regressions, pick easiest candidate
  // For progressions, pick hardest candidate
  const diffOrder: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, elite: 3 };
  const sorted =
    reason === "too_hard"
      ? candidates.sort((a, b) => diffOrder[a.difficultyLevel] - diffOrder[b.difficultyLevel])
      : reason === "too_easy"
      ? candidates.sort((a, b) => diffOrder[b.difficultyLevel] - diffOrder[a.difficultyLevel])
      : candidates;

  const best = sorted[0];
  const exercise = buildCoachExercise(best, "primary", goal, 2);

  const rationaleMap: Record<string, string> = {
    equipment: `"${best.name}" uses ${(best.equipment as string[]).join("/")} and targets the same movement pattern as "${exerciseName}".`,
    injury: `"${best.name}" removes the flagged joint stress while preserving the training stimulus of "${exerciseName}".`,
    too_hard: `"${best.name}" is a ${best.difficultyLevel}-level regression from "${exerciseName}" — same pattern, lower skill and load demand.`,
    too_easy: `"${best.name}" is a progression from "${exerciseName}" — same pattern with greater demand. Earn the upgrade.`,
    variety: `"${best.name}" is a variation of "${exerciseName}" in the same cluster — fresh stimulus, same movement goal.`,
  };

  return {
    exercise,
    rationale: rationaleMap[reason] ?? `"${best.name}" is a suitable substitute for "${exerciseName}".`,
  };
}

/**
 * Build the AI exercise context for a full program.
 * This injects structured exercise options into the system prompt
 * so the AI selects from the real 620-exercise library, not its training data.
 *
 * The output reads like a coach's reference sheet, not a database dump.
 */
export async function buildCoachContext(opts: {
  sessionType: SessionType;
  goal: GoalType;
  experience: ExperienceTier;
  equipment: EquipmentLevel;
  injuryFlags?: string[];
  recentExercises?: string[];
  perPatternMax?: number;
}): Promise<string> {
  const { sessionType, goal, experience, equipment, injuryFlags = [], perPatternMax = 6 } = opts;
  const blueprint = SESSION_BLUEPRINTS[sessionType];

  const allPatterns = [
    ...blueprint.explosive,
    ...blueprint.primary,
    ...blueprint.secondary,
    ...blueprint.accessory,
    ...blueprint.conditioning,
  ].filter((v, i, arr) => arr.indexOf(v) === i); // unique

  const lines: string[] = [
    `EXERCISE LIBRARY — ${sessionType.toUpperCase().replace(/_/g, " ")} SESSION`,
    `Goal: ${goal} | Experience: ${experience} | Equipment: ${equipment}`,
    `(Use these exercise names exactly. Select in the order prescribed.)`,
    "",
  ];

  for (const pattern of allPatterns) {
    const candidates = await getByMovementPattern({
      pattern,
      equipmentLevel: equipment,
      injuryFlags,
      difficultyMax: DIFFICULTY_MAX[experience],
      maxCount: perPatternMax,
    });
    if (candidates.length === 0) continue;

    const patternLabel = pattern.replace(/_/g, " ").toUpperCase();
    const tier =
      blueprint.explosive.includes(pattern) ? "EXPLOSIVE (NSCA tier 1-2)" :
      blueprint.primary.includes(pattern)   ? "PRIMARY (NSCA tier 3)" :
      blueprint.secondary.includes(pattern) ? "SECONDARY (NSCA tier 4)" :
      blueprint.conditioning.includes(pattern) ? "CONDITIONING (NSCA tier 6)" :
      "ACCESSORY (NSCA tier 5)";

    lines.push(`${patternLabel} — ${tier}:`);
    for (const ex of candidates) {
      const equip = (ex.equipment as string[]).join("/");
      const lateral = ex.unilateral ? " [unilateral]" : "";
      const easier = (ex.easierVariations as string[])[0];
      const harder = (ex.harderVariations as string[])[0];
      let line = `  • ${ex.name} (${equip}, ${ex.difficultyLevel})${lateral}`;
      if (easier || harder) {
        const chain: string[] = [];
        if (easier) chain.push(`↓ ${easier}`);
        if (harder) chain.push(`↑ ${harder}`);
        line += ` [${chain.join(" | ")}]`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a coach exercise as a human-readable string for display or AI injection.
 */
export function formatCoachExercise(ex: CoachExercise): string {
  const lateral = ex.unilateral ? " (each side)" : "";
  let line = `${ex.name} — ${ex.sets}×${ex.reps}${lateral} | rest: ${ex.rest}`;
  line += `\n  Classification: ${ex.classification}`;
  line += `\n  Coach note: ${ex.notes}`;
  if (ex.easierAlternative) line += `\n  Regression: ${ex.easierAlternative}`;
  if (ex.harderAlternative) line += `\n  Progression: ${ex.harderAlternative}`;
  return line;
}
