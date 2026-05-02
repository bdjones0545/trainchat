// ======================================================
// TRAINCHAT UNIFIED MUTATION ENGINE
// ======================================================
//
// GOAL:
// Take an ExecutionPlan and GUARANTEE a real program change.
//
// MUTATION SKILLS:
// - Produce real exercise names only — no placeholders
// - Guarantee a meaningful structural change on every mutation path
// - Resolve to a valid exercise from the catalogue or fallback map
// - Apply changes that match user intent with context-appropriate exercise selection
//
// NOTE: For conversation-route mutations, all APPLY_MUTATION actions are
// now routed through interpretEditRequest + applyEditPlan (DB-backed pipeline).
// This module remains the canonical mutation engine for any direct callers
// and future use, but is no longer the primary mutation path for chat turns.
//
// ======================================================

import { type ExecutionPlan, type ExecutionScope } from "./execution-planner";
import { type ProgramStructure, type ProgramDay, type Exercise } from "./ai";
import { getSwapCandidates } from "./exercise-service";
import {
  findSubstitute,
  findAdditions,
  getProgression,
  getRegression,
  type AdditionCategory,
} from "./exercise-intelligence";
import { logger } from "./logger";

// ─── Mutation Scope Classification ───────────────────────────────────────────
//
// Global mutations affect the entire program (all days, all sessions).
// Local mutations affect a single session or a single exercise.
//
// Scope is determined by the ExecutionPlan scope field:
//   scope.type === "program"  → global: apply across all days
//   scope.type === "session"  → local: apply to one day
//   scope.type === "exercise" → local: apply to one specific exercise
//
// Examples:
//   "make this program harder"     → global  (scope.type = "program")
//   "make Day 2 harder"            → local   (scope.type = "session")
//   "swap the back squat"          → local   (scope.type = "exercise")
//   "add more conditioning"        → global  (scope.type = "program")
//
// The add/remove/progression/regression handlers default to a single target day
// (getTargetDay). When the scope is "program", use resolveDays to apply globally.
//
// Callers can inspect isMutationGlobal(plan) to branch logic.

export function isMutationGlobal(plan: ExecutionPlan): boolean {
  return plan.scope.type === "program";
}

// ─── User Context ─────────────────────────────────────────────────────────────
//
// Real user context passed into mutations so exercise selection reflects
// the actual user's goal, equipment, and experience — not hardcoded defaults.

export interface UserMutationContext {
  goal?: string;
  equipment?: string;
  experience?: string;
  sport?: string | null;
  injuryFlags?: string[];
  sessionDurationMinutes?: number;
}

// ─── Mutation Scope Decision (Intent Scaling) ─────────────────────────────────
//
// Phase 5 skill addition — determine the correct scope for a requested change
// BEFORE routing it through the mutation or architecture pipeline.
//
// Scope levels:
//   "exercise"     → applies to a single exercise (button click or specific swap)
//   "session"      → applies to one training day ("Make Day 2 harder")
//   "program"      → applies across the whole program ("Make this program harder")
//   "architecture" → requires structural redesign or sport/goal pivot
//
// Routing:
//   exercise / session → mutation pipeline (fast path)
//   program            → Performance Architect
//   architecture       → Performance Architect + Progression Intelligence

export interface MutationScopeDecision {
  scope: "exercise" | "session" | "program" | "architecture";
  confidence: "low" | "moderate" | "high";
  reason: string;
}

export interface MutationScopeContext {
  /** Whether the request originated from a button action (vs typed chat) */
  isButtonAction: boolean;
  /** Target day index if pre-specified by UI */
  targetDayIndex?: number;
  /** Target exercise name if pre-specified by UI */
  targetExerciseName?: string;
  /** Whether an active program exists */
  hasActiveProgram: boolean;
}

/**
 * Determine the scope of a requested mutation from the user's message and UI context.
 * Used to route the request to the correct pipeline before any processing begins.
 */
export function determineMutationScope(
  userMessage: string,
  ctx: MutationScopeContext,
): MutationScopeDecision {
  const msg = userMessage.toLowerCase().trim();

  // Button action with explicit exercise target → always exercise scope
  if (ctx.isButtonAction && ctx.targetExerciseName) {
    return {
      scope: "exercise",
      confidence: "high",
      reason: `Button action targeting exercise "${ctx.targetExerciseName}" — exercise-level scope.`,
    };
  }

  // Architecture-level signals — sport pivot, goal change, "for X sport", progression block
  const architecturePatterns = [
    /\bfor\s+(football|soccer|basketball|rugby|baseball|tennis|hockey|swimming|cycling|mma|combat|volleyball)\b/i,
    /\b(progress|evolve|advance)\s+(this|the)\s+(program|plan)\s+(for|over)\s+\d+\s*weeks?\b/i,
    /\b(redesign|rebuild|restructure|overhaul|rethink|change the structure)\b/i,
    /\b(better for|suited for|optimized for|built for)\s+\w+/i,
    /\bperiodiz/i,
    /\b(new goal|different goal|switch to|pivot to|change my goal)\b/i,
    /\b4.week|6.week|8.week|12.week\b/i,
  ];
  if (architecturePatterns.some((p) => p.test(msg))) {
    return {
      scope: "architecture",
      confidence: "high",
      reason: "Message contains sport pivot, goal change, progression block, or structural redesign language.",
    };
  }

  // Single-exercise patterns
  const exercisePatterns = [
    /\b(swap|replace|substitute|change|switch out)\s+(this|the|that)\s+(exercise|movement|lift)\b/i,
    /\b(swap|replace|substitute)\s+\w[\w\s]+\b/i,
    /\b(make|make this exercise|this one)\s+(harder|easier|heavier|lighter)\b/i,
  ];
  if (ctx.isButtonAction || exercisePatterns.some((p) => p.test(msg))) {
    return {
      scope: "exercise",
      confidence: ctx.isButtonAction ? "high" : "moderate",
      reason: ctx.isButtonAction
        ? "Button-triggered mutation defaults to exercise scope."
        : "Message targets a specific exercise or uses exercise-swap language.",
    };
  }

  // Session-level patterns — day-specific language
  const sessionPatterns = [
    /\bday\s*\d+\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(this day|this session|today's session|session \d+)\b/i,
    /\b(make|make this day|make this session)\s+(harder|easier|shorter|longer|more intense|less intense)\b/i,
  ];
  if (sessionPatterns.some((p) => p.test(msg))) {
    return {
      scope: "session",
      confidence: "high",
      reason: "Message references a specific day or session.",
    };
  }

  // Program-level patterns
  const programPatterns = [
    /\b(this program|the program|the whole thing|all days|every day|overall)\b/i,
    /\b(make it|make this)\s+(harder|easier|more challenging|less challenging|more intense|less intense|more volume|less volume)\b/i,
    /\b(add|increase|reduce|decrease)\s+(volume|intensity|frequency|days|sessions)\b/i,
    /\b(more challenging|too easy|not hard enough|too hard|too much)\b/i,
  ];
  if (programPatterns.some((p) => p.test(msg))) {
    return {
      scope: "program",
      confidence: "moderate",
      reason: "Message uses program-wide language without a specific day or architecture-level trigger.",
    };
  }

  // Fallback: if active program exists, default to program scope; otherwise guidance
  return {
    scope: ctx.hasActiveProgram ? "program" : "exercise",
    confidence: "low",
    reason: "No clear scope signal detected — defaulting based on program state.",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function applyMutation({
  plan,
  program,
  userContext,
}: {
  plan: ExecutionPlan;
  program: ProgramStructure;
  userContext?: UserMutationContext;
}): Promise<{
  updatedProgram: ProgramStructure;
  changeSummary: string;
}> {
  if (!plan.mutation) {
    throw new Error("[MutationEngine] No mutation descriptor on ExecutionPlan");
  }

  const cloned: ProgramStructure = structuredClone(program);

  switch (plan.mutation.type) {
    case "swap":
      return handleSwap(cloned, plan, userContext);

    case "transform":
      return handleTransformation(cloned, plan);

    case "add":
      return handleAdd(cloned, plan, userContext);

    case "remove":
      return handleRemove(cloned, plan);

    case "progression":
      return handleProgression(cloned, plan, userContext);

    case "regression":
      return handleRegression(cloned, plan, userContext);

    default: {
      const exhaustive: never = plan.mutation.type;
      throw new Error(`[MutationEngine] Unknown mutation type: ${exhaustive}`);
    }
  }
}

// ======================================================
// SWAP ENGINE
// ======================================================
//
// Resolution order:
//   1. DB cluster swap candidates (exercise-service.ts)
//   2. exercise-intelligence.ts findSubstitute (in-memory catalogue)
//   3. Hard-coded fallback map (guarantees a real name)

async function handleSwap(
  program: ProgramStructure,
  plan: ExecutionPlan,
  userContext?: UserMutationContext
): Promise<{ updatedProgram: ProgramStructure; changeSummary: string }> {
  const targetName = String(plan.mutation?.params?.targetExercise ?? "");

  if (!targetName) {
    throw new Error("[MutationEngine] swap mutation requires params.targetExercise");
  }

  const day = getTargetDay(program, plan.scope);
  if (!day) throw new Error("[MutationEngine] No target day resolved for swap");

  const index = day.exercises.findIndex(
    (e) => normalize(e.name) === normalize(targetName)
  );

  if (index === -1) {
    throw new Error(
      `[MutationEngine] Exercise "${targetName}" not found in day "${day.name}" for swap`
    );
  }

  const original = day.exercises[index];
  const replacement = await findBestSwapSubstitute(original, userContext);

  day.exercises[index] = {
    ...original,
    name: replacement.name,
    classification: replacement.classification,
    notes: replacement.notes,
  };

  logger.info(
    { original: original.name, replacement: replacement.name, day: day.name },
    "[MutationEngine] Swap applied"
  );

  return {
    updatedProgram: program,
    changeSummary: `${original.name} replaced with ${replacement.name}`,
  };
}

// ======================================================
// TRANSFORMATION ENGINE (endurance / power / strength / etc.)
// ======================================================

function handleTransformation(
  program: ProgramStructure,
  plan: ExecutionPlan
): { updatedProgram: ProgramStructure; changeSummary: string } {
  const type = String(plan.mutation?.params?.transformation ?? "");
  const days = resolveDays(program, plan.scope);

  if (days.length === 0) {
    throw new Error("[MutationEngine] No days resolved for transformation");
  }

  for (const day of days) {
    for (const ex of day.exercises) {
      applyTransformationToExercise(ex, type);
    }

    // Add structural marker exercise so the program is visually different
    const marker = transformationMarkerExercise(type);
    if (marker) {
      day.exercises.push(marker);
    }
  }

  logger.info(
    { transformation: type, daysAffected: days.map((d) => d.name) },
    "[MutationEngine] Transformation applied"
  );

  return {
    updatedProgram: program,
    changeSummary: `Shifted toward ${formatTransformationLabel(type)} with structural changes across ${days.length} day(s)`,
  };
}

function applyTransformationToExercise(ex: Exercise, type: string): void {
  switch (type) {
    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
      ex.reps = increaseReps(ex.reps);
      ex.rest = "30-60 sec";
      break;

    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      ex.reps = "3-5";
      ex.rest = "2-3 min";
      break;

    case "strength":
    case "strength_focus":
    case "increase_difficulty":
      ex.reps = "3-6";
      ex.rest = "2-4 min";
      break;

    case "hypertrophy":
    case "hypertrophy_focus":
    case "increase_volume":
      ex.reps = "8-12";
      ex.rest = "60-90 sec";
      break;

    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
    case "decrease_difficulty":
    case "decrease_volume":
      ex.reps = "8-12";
      ex.rest = "2-3 min";
      break;

    case "reduce_time":
      ex.rest = "30-45 sec";
      break;

    default:
      // Generic: apply moderate rep range increase as a safe default change
      ex.reps = increaseReps(ex.reps);
      break;
  }
}

function transformationMarkerExercise(type: string): Exercise | null {
  switch (type) {
    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
      return { name: "Bike Sprint Intervals", sets: 4, reps: "30 sec", rest: "30 sec" };

    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      return { name: "Broad Jump", sets: 4, reps: "5", rest: "2 min" };

    case "strength":
    case "strength_focus":
      return { name: "Pause Squat", sets: 3, reps: "3-5", rest: "3 min" };

    case "hypertrophy":
    case "hypertrophy_focus":
      return { name: "Leg Extension", sets: 3, reps: "12-15", rest: "60 sec" };

    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
      return { name: "90/90 Hip Stretch", sets: 2, reps: "60 sec/side", rest: "30 sec" };

    default:
      return null;
  }
}

function formatTransformationLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ======================================================
// ADD ENGINE
// ======================================================

async function handleAdd(
  program: ProgramStructure,
  plan: ExecutionPlan,
  userContext?: UserMutationContext
): Promise<{ updatedProgram: ProgramStructure; changeSummary: string }> {
  const categoryRaw = String(plan.mutation?.params?.category ?? "general");

  // Global scope: add the exercise to all sessions
  if (isMutationGlobal(plan)) {
    const days = resolveDays(program, plan.scope);
    if (days.length === 0) throw new Error("[MutationEngine] No days resolved for global add");

    for (const day of days) {
      const exercise = pickAdditionExercise(categoryRaw, day.exercises.map((e) => e.name), userContext);
      day.exercises.push(exercise);
    }

    logger.info(
      { category: categoryRaw, daysAffected: days.map((d) => d.name) },
      "[MutationEngine] Global add applied across all sessions"
    );

    return {
      updatedProgram: program,
      changeSummary: `Added ${categoryRaw} work across all ${days.length} sessions`,
    };
  }

  // Local scope: add to a single day
  const day = getTargetDay(program, plan.scope);
  if (!day) throw new Error("[MutationEngine] No target day resolved for add");

  const exercise = pickAdditionExercise(categoryRaw, day.exercises.map((e) => e.name), userContext);

  day.exercises.push(exercise);

  logger.info(
    { exercise: exercise.name, day: day.name, category: categoryRaw },
    "[MutationEngine] Exercise added"
  );

  return {
    updatedProgram: program,
    changeSummary: `Added ${exercise.name} to ${day.name}`,
  };
}

function pickAdditionExercise(
  category: string,
  currentNames: string[],
  userContext?: UserMutationContext
): Exercise {
  const additionCategory = mapToAdditionCategory(category);

  const result = findAdditions({
    category: additionCategory,
    goal: (userContext?.goal ?? "general_fitness") as Parameters<typeof findAdditions>[0]["goal"],
    equipment: (userContext?.equipment ?? "full_gym") as Parameters<typeof findAdditions>[0]["equipment"],
    experience: (userContext?.experience ?? "intermediate") as Parameters<typeof findAdditions>[0]["experience"],
    injuryFlags: (userContext?.injuryFlags ?? []) as import("./training-intelligence").JointStress[],
    sessionDurationMinutes: userContext?.sessionDurationMinutes ?? 75,
    currentExerciseNames: currentNames,
    limit: 1,
  });

  if (result.additions.length > 0) {
    const top = result.additions[0];
    return {
      name: top.exercise.name,
      sets: top.prescription.sets,
      reps: top.prescription.reps,
      rest: top.prescription.rest,
      notes: top.placementNote,
    };
  }

  // Hard fallback — category-keyed real exercise names
  return categoryFallbackExercise(category);
}

function mapToAdditionCategory(raw: string): AdditionCategory {
  const map: Record<string, AdditionCategory> = {
    plyometric: "power",
    power: "power",
    core: "core",
    conditioning: "conditioning",
    cardio: "conditioning",
    hamstrings: "hamstrings",
    hamstring: "hamstrings",
    calves: "calves",
    calf: "calves",
    glutes: "glutes",
    glute: "glutes",
    shoulders: "shoulders_lateral",
    shoulder: "shoulders_lateral",
    upper_back: "upper_back",
    back: "upper_back",
    rear_delts: "rear_delts",
    carries: "carries",
    carry: "carries",
    mobility: "mobility",
    biceps: "arms_bicep",
    triceps: "arms_tricep",
  };

  return map[raw.toLowerCase().replace(/\s/g, "_")] ?? "core";
}

function categoryFallbackExercise(category: string): Exercise {
  const lower = category.toLowerCase();

  if (lower.includes("plyometric") || lower.includes("power"))
    return { name: "Bounding", sets: 3, reps: "8", rest: "90 sec" };
  if (lower.includes("core"))
    return { name: "Pallof Press", sets: 3, reps: "10/side", rest: "60 sec" };
  if (lower.includes("conditioning") || lower.includes("cardio"))
    return { name: "Sled Push", sets: 4, reps: "20m", rest: "90 sec" };
  if (lower.includes("hamstring"))
    return { name: "Nordic Hamstring Curl", sets: 3, reps: "6", rest: "2 min" };
  if (lower.includes("calf"))
    return { name: "Standing Calf Raise", sets: 4, reps: "15", rest: "45 sec" };
  if (lower.includes("glute"))
    return { name: "Hip Thrust", sets: 3, reps: "10", rest: "90 sec" };
  if (lower.includes("shoulder"))
    return { name: "Lateral Raise", sets: 3, reps: "15", rest: "60 sec" };
  if (lower.includes("back") || lower.includes("upper_back"))
    return { name: "Face Pull", sets: 3, reps: "15", rest: "60 sec" };
  if (lower.includes("carry") || lower.includes("carries"))
    return { name: "Farmer Carry", sets: 3, reps: "30m", rest: "60 sec" };

  return { name: "Farmer Carry", sets: 3, reps: "30m", rest: "60 sec" };
}

// ======================================================
// REMOVE ENGINE
// ======================================================

function handleRemove(
  program: ProgramStructure,
  plan: ExecutionPlan
): { updatedProgram: ProgramStructure; changeSummary: string } {
  const day = getTargetDay(program, plan.scope);
  if (!day) throw new Error("[MutationEngine] No target day resolved for remove");

  if (day.exercises.length === 0) {
    throw new Error(`[MutationEngine] Day "${day.name}" has no exercises to remove`);
  }

  // Remove by name if specified, otherwise remove last
  const targetName = plan.scope.exerciseName;
  let removed: Exercise;

  if (targetName) {
    const idx = day.exercises.findIndex((e) => normalize(e.name) === normalize(targetName));
    if (idx !== -1) {
      [removed] = day.exercises.splice(idx, 1);
    } else {
      removed = day.exercises.pop()!;
    }
  } else {
    removed = day.exercises.pop()!;
  }

  logger.info(
    { removed: removed.name, day: day.name },
    "[MutationEngine] Exercise removed"
  );

  return {
    updatedProgram: program,
    changeSummary: `Removed ${removed.name} from ${day.name}`,
  };
}

// ======================================================
// PROGRESSION ENGINE
// ======================================================

function handleProgression(
  program: ProgramStructure,
  plan: ExecutionPlan,
  userContext?: UserMutationContext
): { updatedProgram: ProgramStructure; changeSummary: string } {
  const day = getTargetDay(program, plan.scope);
  if (!day) throw new Error("[MutationEngine] No target day resolved for progression");

  const targetName = plan.scope.exerciseName ?? String(plan.mutation?.params?.targetExercise ?? "");

  if (targetName) {
    // Targeted single-exercise progression
    const idx = day.exercises.findIndex((e) => normalize(e.name) === normalize(targetName));
    if (idx !== -1) {
      const original = day.exercises[idx];
      const prog = getProgression(original.name);
      if (prog) {
        day.exercises[idx] = { ...original, name: prog.name };
        return {
          updatedProgram: program,
          changeSummary: `Progressed ${original.name} → ${prog.name}`,
        };
      }

      // Fall back to intelligence substitute with progression reason
      const sub = findSubstitute({
        originalName: original.name,
        reason: "progression",
        goal: (userContext?.goal ?? "general_fitness") as Parameters<typeof findSubstitute>[0]["goal"],
        equipment: (userContext?.equipment ?? "full_gym") as Parameters<typeof findSubstitute>[0]["equipment"],
        experience: (userContext?.experience ?? "intermediate") as Parameters<typeof findSubstitute>[0]["experience"],
        injuryFlags: (userContext?.injuryFlags ?? []) as import("./training-intelligence").JointStress[],
        sessionRole: "secondary_compound",
      });
      if (sub.chosen) {
        day.exercises[idx] = { ...original, name: sub.chosen.name };
        return {
          updatedProgram: program,
          changeSummary: `${original.name} progressed to ${sub.chosen.name}`,
        };
      }
    }
  }

  // Broad progression: increase load/intensity markers across the session
  for (const ex of day.exercises) {
    ex.reps = "3-6";
    ex.rest = "2-3 min";
  }

  return {
    updatedProgram: program,
    changeSummary: `Session intensity progressed — heavier rep ranges applied`,
  };
}

// ======================================================
// REGRESSION ENGINE
// ======================================================

function handleRegression(
  program: ProgramStructure,
  plan: ExecutionPlan,
  userContext?: UserMutationContext
): { updatedProgram: ProgramStructure; changeSummary: string } {
  const day = getTargetDay(program, plan.scope);
  if (!day) throw new Error("[MutationEngine] No target day resolved for regression");

  const targetName = plan.scope.exerciseName ?? String(plan.mutation?.params?.targetExercise ?? "");

  if (targetName) {
    const idx = day.exercises.findIndex((e) => normalize(e.name) === normalize(targetName));
    if (idx !== -1) {
      const original = day.exercises[idx];
      const regr = getRegression(original.name);
      if (regr) {
        day.exercises[idx] = { ...original, name: regr.name };
        return {
          updatedProgram: program,
          changeSummary: `Regressed ${original.name} → ${regr.name}`,
        };
      }

      const sub = findSubstitute({
        originalName: original.name,
        reason: "regression",
        goal: (userContext?.goal ?? "general_fitness") as Parameters<typeof findSubstitute>[0]["goal"],
        equipment: (userContext?.equipment ?? "full_gym") as Parameters<typeof findSubstitute>[0]["equipment"],
        experience: (userContext?.experience ?? "intermediate") as Parameters<typeof findSubstitute>[0]["experience"],
        injuryFlags: (userContext?.injuryFlags ?? []) as import("./training-intelligence").JointStress[],
        sessionRole: "secondary_compound",
      });
      if (sub.chosen) {
        day.exercises[idx] = { ...original, name: sub.chosen.name };
        return {
          updatedProgram: program,
          changeSummary: `${original.name} regressed to ${sub.chosen.name}`,
        };
      }
    }
  }

  // Broad regression: reduce intensity markers
  for (const ex of day.exercises) {
    ex.reps = "10-15";
    ex.rest = "90 sec";
  }

  return {
    updatedProgram: program,
    changeSummary: `Session intensity reduced — higher rep ranges applied`,
  };
}

// ======================================================
// SUBSTITUTE LOGIC — DB cluster → intelligence → hard fallback
// ======================================================

async function findBestSwapSubstitute(
  original: Exercise,
  userContext?: UserMutationContext
): Promise<{ name: string; classification?: string; notes?: string }> {
  // ── Step 1: DB cluster swap candidates ────────────────────────────────────
  const candidates = await getSwapCandidates({ exerciseName: original.name });

  if (candidates.length > 0) {
    const pick = candidates[0];
    logger.debug(
      { original: original.name, replacement: pick.name, source: "db_cluster" },
      "[MutationEngine] Swap candidate from DB cluster"
    );
    return { name: pick.name };
  }

  // ── Step 2: exercise-intelligence.ts findSubstitute ───────────────────────
  const sub = findSubstitute({
    originalName: original.name,
    reason: "swap",
    goal: (userContext?.goal ?? "general_fitness") as Parameters<typeof findSubstitute>[0]["goal"],
    equipment: (userContext?.equipment ?? "full_gym") as Parameters<typeof findSubstitute>[0]["equipment"],
    experience: (userContext?.experience ?? "intermediate") as Parameters<typeof findSubstitute>[0]["experience"],
    injuryFlags: (userContext?.injuryFlags ?? []) as import("./training-intelligence").JointStress[],
    sessionRole: "secondary_compound",
  });

  if (sub.chosen) {
    logger.debug(
      { original: original.name, replacement: sub.chosen.name, source: "intelligence" },
      "[MutationEngine] Swap candidate from exercise intelligence"
    );
    return { name: sub.chosen.name, notes: sub.rationale };
  }

  // ── Step 3: Hard fallback — guaranteed real exercise name ─────────────────
  const fallback = hardFallbackExercise(original.name);
  logger.warn(
    { original: original.name, fallback, source: "hard_fallback" },
    "[MutationEngine] No swap candidates found — using hard fallback"
  );
  return { name: fallback };
}

// ======================================================
// HARD FALLBACK MAP (guarantees a real name)
// ======================================================

function hardFallbackExercise(originalName: string): string {
  const name = originalName.toLowerCase();

  if (name.includes("jump") || name.includes("bound") || name.includes("hop"))
    return "Broad Jump";
  if (name.includes("squat") || name.includes("lunge") || name.includes("split squat"))
    return "Goblet Squat";
  if (name.includes("deadlift") || name.includes("rdl") || name.includes("hinge"))
    return "Romanian Deadlift";
  if (name.includes("bench") || name.includes("push") || name.includes("press") && name.includes("chest"))
    return "Push-Up";
  if (name.includes("row") || name.includes("pull") || name.includes("lat"))
    return "Lat Pulldown";
  if (name.includes("shoulder") || name.includes("delt") || name.includes("press") && name.includes("shoulder"))
    return "Dumbbell Lateral Raise";
  if (name.includes("curl") || name.includes("bicep"))
    return "Dumbbell Curl";
  if (name.includes("tricep") || name.includes("dip") || name.includes("extension"))
    return "Tricep Pushdown";
  if (name.includes("core") || name.includes("plank") || name.includes("crunch"))
    return "Dead Bug";
  if (name.includes("calf") || name.includes("ankle"))
    return "Standing Calf Raise";

  return "Kettlebell Swing";
}

// ======================================================
// HELPERS
// ======================================================

function getTargetDay(program: ProgramStructure, scope: ExecutionScope): ProgramDay | null {
  if (scope.type === "session" && scope.dayIndex !== undefined) {
    return program.days[scope.dayIndex] ?? program.days[0] ?? null;
  }

  // Default to day 0 — we always have at least one day
  return program.days[0] ?? null;
}

function resolveDays(program: ProgramStructure, scope: ExecutionScope): ProgramDay[] {
  if (scope.type === "program") {
    return program.days;
  }

  if (scope.type === "session" && scope.dayIndex !== undefined) {
    const day = program.days[scope.dayIndex];
    return day ? [day] : program.days;
  }

  // Unresolved scope — apply to all days (safe, visible, guarantees mutation)
  return program.days;
}

function normalize(str: string): string {
  return (str ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function increaseReps(reps: string | number): string {
  if (typeof reps === "number") return `${Math.min(reps + 3, 15)}`;

  // Try to parse upper bound and increase it
  const rangeMatch = String(reps).match(/(\d+)-(\d+)/);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]) + 2;
    const hi = Number(rangeMatch[2]) + 2;
    return `${lo}-${hi}`;
  }

  const single = Number(reps);
  if (!isNaN(single)) return `${Math.min(single + 3, 20)}`;

  return "12-15";
}

