// ─── TrainChat Exercise Redistribution Quality Layer ─────────────────────────
//
// Sits beneath the split transformation engine.
// Transforms rough exercise assignments into intelligent coaching decisions.
//
// The transformation engine decides architecture (what kind of days).
// This layer decides which exercises belong where and why.
//
// Pipeline:
//   1. Score every exercise in the pool
//   2. Detect and resolve redundancy across patterns
//   3. Assign exercise-level decisions (PRESERVE, MOVE, REPLACE, REMOVE)
//   4. Redistribute to target days respecting session purpose + capacity
//   5. Fill balance gaps with principled additions
//   6. Validate movement balance across the week
//   7. Return refined days + full decision log

import { logger } from "./logger";
import { ProgramDay, Exercise } from "./ai";
import {
  UserProfile,
  MovementPattern,
  JointStress,
  normalizeGoal,
  normalizeExperience,
  normalizeEquipment,
  detectInjuryFlags,
} from "./training-intelligence";
import {
  CategorizedExercise,
  MovementCategory,
  SplitType,
  TransformationType,
  categorizeExercise,
} from "./split-transform";
import {
  findSubstitute,
  findAdditions,
  getPrescription,
  lookupExercise,
  EXERCISE_INTELLIGENCE,
  SessionRole,
} from "./exercise-intelligence";

// ─── Decision Types ───────────────────────────────────────────────────────────

export type ExerciseDecision =
  | "PRESERVE_IN_PLACE"
  | "MOVE_TO_DIFFERENT_DAY"
  | "REPLACE_WITH_SIMILAR"
  | "REMOVE_AS_REDUNDANT"
  | "REMOVE_FOR_FATIGUE"
  | "REMOVE_FOR_TIME"
  | "REMOVE_FOR_CONFLICT"
  | "ADD_NEW_EXERCISE";

export interface ExerciseDecisionEntry {
  exerciseName: string;
  decision: ExerciseDecision;
  reason: string;
  originalDay?: number;
  targetDay?: number;
  replacedBy?: string;
  priorityScore: number;
}

// ─── Session Purpose ──────────────────────────────────────────────────────────

export type SessionPurpose =
  | "full_body_strength"
  | "full_body_athletic"
  | "full_body_hypertrophy"
  | "upper_push_focus"
  | "upper_pull_focus"
  | "upper_balanced"
  | "lower_squat_focus"
  | "lower_hinge_focus"
  | "lower_balanced"
  | "push_day"
  | "pull_day"
  | "leg_day"
  | "power_athletic"
  | "recovery_low_stress";

export interface DayTemplate {
  dayNumber: number;
  name: string;
  purpose: SessionPurpose;
  bodyRegionPriority: "upper" | "lower" | "full";
  maxExercises: number;
  requiredPatterns: MovementCategory[];
  preferredPatterns: MovementCategory[];
  forbiddenPatterns: MovementCategory[];
  fatigueCapacity: "high" | "medium" | "low";
}

export interface ScoredExercise extends CategorizedExercise {
  priorityScore: number;
  decision: ExerciseDecision;
  decisionReason: string;
  targetDay: number | null;
  replacedBy?: string;
}

export interface RedistributionContext {
  goal: import("./training-intelligence").GoalType;
  sessionDurationMinutes: number;
  painFlags: import("./training-intelligence").JointStress[];
  preferredExercises: string[];
  avoidedExercises: string[];
  experience: import("./training-intelligence").ExperienceTier;
  equipment: import("./training-intelligence").EquipmentLevel;
  // Legacy aliases kept for backward compat
  experienceLevel?: string;
}

export interface RedistributionResult {
  days: ProgramDay[];
  decisionLog: ExerciseDecisionEntry[];
  weeklyBalanceReport: WeeklyBalanceReport;
}

export interface WeeklyBalanceReport {
  pushCount: number;
  pullCount: number;
  squatCount: number;
  hingeCount: number;
  coreCount: number;
  explosiveCount: number;
  balanceIssues: string[];
}

// ─── Priority Scoring ─────────────────────────────────────────────────────────
//
// Each exercise receives a score 0-100 that drives preservation decisions.
// Higher score = stronger claim to survive the transformation.

function scoreExercise(
  ex: CategorizedExercise,
  context: RedistributionContext,
): number {
  let score = 0;

  // Tier base scores — compounds must win over accessories
  const tierBase: Record<number, number> = { 1: 55, 2: 38, 3: 22, 4: 10 };
  score += tierBase[ex.priorityTier] ?? 20;

  // Explosive bonus — always high priority in athletic training
  if (ex.isExplosive) score += 15;

  // Goal alignment bonuses
  const goal = context.goal.toLowerCase();
  if (goal.includes("strength") || goal.includes("power")) {
    if (ex.priorityTier === 1) score += 12;
    if (ex.pattern === "squat" || ex.pattern === "hinge") score += 8;
  }
  if (goal.includes("hypertrophy") || goal.includes("muscle")) {
    if (ex.priorityTier <= 2) score += 8;
    if (ex.pattern === "iso_chest" || ex.pattern === "iso_back") score += 5;
  }
  if (goal.includes("athletic") || goal.includes("performance")) {
    if (ex.isExplosive) score += 12;
    if (ex.pattern === "carry" || ex.pattern === "core") score += 6;
    if (ex.pattern === "iso_arms") score -= 8; // less relevant for athletics
  }
  if (goal.includes("fat_loss") || goal.includes("conditioning")) {
    if (ex.pattern === "conditioning") score += 10;
    if (ex.priorityTier === 1) score += 8;
  }

  // Movement pattern value scores
  const patternBonus: Partial<Record<MovementCategory, number>> = {
    squat: 8, hinge: 8, push_horizontal: 5, pull_horizontal: 5,
    push_vertical: 4, pull_vertical: 4, carry: 6, core: 3,
    iso_arms: -3, conditioning: 2,
  };
  score += patternBonus[ex.pattern] ?? 0;

  // User preference bonus
  const exLower = ex.exercise.name.toLowerCase();
  if (context.preferredExercises.some((p) => exLower.includes(p.toLowerCase()))) score += 10;
  if (context.avoidedExercises.some((a) => exLower.includes(a.toLowerCase()))) score -= 30;

  // Pain conflict penalty
  for (const flag of context.painFlags) {
    if (flagConflictsWithExercise(flag, ex)) score -= 25;
  }

  return Math.max(0, Math.min(100, score));
}

function flagConflictsWithExercise(flag: string, ex: CategorizedExercise): boolean {
  const name = ex.exercise.name.toLowerCase();
  const conflicts: Record<string, RegExp> = {
    knee_dominant: /(squat|lunge|leg press|step.up|leg extension|jump)/i,
    shoulder_dominant: /(overhead|press|pull.up|chin.up|dip|bench)/i,
    spine_load: /(deadlift|barbell squat|barbell row|good morning)/i,
    low_back_stress: /(deadlift|barbell row|good morning|hyperextension)/i,
    hip_stress: /(hip thrust|glute bridge|rdl|romanian|cable kick)/i,
    elbow_stress: /(curl|tricep|skull crusher|close.grip)/i,
  };
  return conflicts[flag]?.test(name) ?? false;
}

// ─── Redundancy Detection ─────────────────────────────────────────────────────
//
// Flags exercises as redundant when the same movement pattern is over-represented.
// Decisions: lowest-scoring duplicates get REMOVE_AS_REDUNDANT.

interface RedundancyDecision {
  exerciseName: string;
  isRedundant: boolean;
  reason: string;
}

function detectRedundancy(
  pool: ScoredExercise[],
  sessionDuration: number,
): RedundancyDecision[] {
  const decisions: RedundancyDecision[] = [];

  // Max allowed per pattern across the whole program pool
  // (tight for short sessions, looser for longer ones)
  const isShortSession = sessionDuration < 60;
  const maxByPattern: Partial<Record<MovementCategory, number>> = {
    iso_arms: isShortSession ? 1 : 2,
    iso_chest: isShortSession ? 1 : 2,
    iso_shoulders: isShortSession ? 1 : 2,
    iso_back: isShortSession ? 1 : 2,
    iso_legs: 2,
    conditioning: 1,
    core: 3,
    squat: 3,
    hinge: 3,
    push_horizontal: 3,
    push_vertical: 2,
    pull_horizontal: 3,
    pull_vertical: 2,
    carry: 2,
    power_explosive: 2,
  };

  // Group exercises by pattern
  const byPattern: Map<MovementCategory, ScoredExercise[]> = new Map();
  for (const ex of pool) {
    if (!byPattern.has(ex.pattern)) byPattern.set(ex.pattern, []);
    byPattern.get(ex.pattern)!.push(ex);
  }

  const allRedundant = new Set<string>();

  for (const [pattern, exercises] of byPattern.entries()) {
    const max = maxByPattern[pattern] ?? 4;
    if (exercises.length <= max) {
      for (const ex of exercises) {
        decisions.push({ exerciseName: ex.exercise.name, isRedundant: false, reason: "Within pattern limit" });
      }
      continue;
    }

    // Sort by priority score descending — keep best, flag the rest
    const sorted = [...exercises].sort((a, b) => b.priorityScore - a.priorityScore);
    const keep = sorted.slice(0, max);
    const remove = sorted.slice(max);

    for (const ex of keep) {
      decisions.push({ exerciseName: ex.exercise.name, isRedundant: false, reason: "Highest priority in pattern group" });
    }
    for (const ex of remove) {
      allRedundant.add(ex.exercise.name);
      decisions.push({
        exerciseName: ex.exercise.name,
        isRedundant: true,
        reason: `${exercises.length} ${pattern.replace(/_/g, " ")} exercises — low-priority excess removed`,
      });
    }
  }

  // Also detect name-similarity duplicates (e.g., "Barbell Row" and "Bent-Over Barbell Row")
  const seenKeys: Map<string, string> = new Map();
  for (const ex of pool) {
    const normalized = ex.exercise.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenKeys.has(normalized) && !allRedundant.has(ex.exercise.name)) {
      const existing = decisions.find((d) => d.exerciseName === seenKeys.get(normalized));
      if (existing && !allRedundant.has(seenKeys.get(normalized)!)) {
        allRedundant.add(ex.exercise.name);
        const idx = decisions.findIndex((d) => d.exerciseName === ex.exercise.name);
        if (idx >= 0) {
          decisions[idx] = {
            exerciseName: ex.exercise.name,
            isRedundant: true,
            reason: "Near-duplicate of a higher-priority exercise already in pool",
          };
        }
      }
    } else {
      seenKeys.set(normalized, ex.exercise.name);
    }
  }

  return decisions;
}

// ─── Session Purpose Inference ────────────────────────────────────────────────

function inferSessionPurpose(dayName: string, dayFocus: string, goal: string): SessionPurpose {
  const combined = `${dayName} ${dayFocus}`.toLowerCase();
  const goalLower = goal.toLowerCase();

  if (/athletic|power|explosive/i.test(combined)) return "power_athletic";
  if (/full.?body/i.test(combined)) {
    if (/strength/i.test(goalLower)) return "full_body_strength";
    if (/athletic|performance/i.test(goalLower)) return "full_body_athletic";
    return "full_body_hypertrophy";
  }
  if (/upper/i.test(combined)) {
    if (/push/i.test(combined)) return "upper_push_focus";
    if (/pull/i.test(combined)) return "upper_pull_focus";
    return "upper_balanced";
  }
  if (/lower/i.test(combined)) {
    if (/squat|quad/i.test(combined)) return "lower_squat_focus";
    if (/hinge|hamstring|deadlift/i.test(combined)) return "lower_hinge_focus";
    return "lower_balanced";
  }
  if (/push/i.test(combined)) return "push_day";
  if (/pull/i.test(combined)) return "pull_day";
  if (/leg/i.test(combined)) return "leg_day";
  if (/recover|active|mobility/i.test(combined)) return "recovery_low_stress";
  return "full_body_strength"; // safe default
}

// ─── Day Template Builder ─────────────────────────────────────────────────────

function buildDayTemplate(day: ProgramDay, purpose: SessionPurpose, maxExercises: number): DayTemplate {
  const required: MovementCategory[] = [];
  const preferred: MovementCategory[] = [];
  const forbidden: MovementCategory[] = [];
  let bodyRegionPriority: "upper" | "lower" | "full" = "full";
  let fatigueCapacity: "high" | "medium" | "low" = "medium";

  switch (purpose) {
    case "full_body_strength":
    case "full_body_hypertrophy":
      required.push("squat", "push_horizontal", "pull_horizontal");
      preferred.push("hinge", "push_vertical", "pull_vertical", "core");
      bodyRegionPriority = "full";
      fatigueCapacity = "high";
      break;
    case "full_body_athletic":
      required.push("power_explosive", "squat", "push_horizontal", "pull_horizontal");
      preferred.push("hinge", "carry", "core");
      bodyRegionPriority = "full";
      fatigueCapacity = "high";
      break;
    case "power_athletic":
      required.push("power_explosive");
      preferred.push("squat", "hinge", "carry", "core");
      forbidden.push("iso_arms", "iso_legs");
      bodyRegionPriority = "full";
      fatigueCapacity = "high";
      break;
    case "upper_balanced":
      required.push("push_horizontal", "pull_horizontal");
      preferred.push("push_vertical", "pull_vertical", "iso_shoulders", "core");
      forbidden.push("squat", "hinge", "iso_legs");
      bodyRegionPriority = "upper";
      fatigueCapacity = "medium";
      break;
    case "upper_push_focus":
      required.push("push_horizontal");
      preferred.push("push_vertical", "iso_chest", "iso_arms");
      forbidden.push("squat", "hinge", "pull_horizontal", "pull_vertical", "iso_legs");
      bodyRegionPriority = "upper";
      fatigueCapacity = "medium";
      break;
    case "upper_pull_focus":
      required.push("pull_horizontal");
      preferred.push("pull_vertical", "iso_back", "iso_shoulders", "iso_arms");
      forbidden.push("squat", "hinge", "push_horizontal", "iso_legs");
      bodyRegionPriority = "upper";
      fatigueCapacity = "medium";
      break;
    case "push_day":
      required.push("push_horizontal", "push_vertical");
      preferred.push("iso_chest", "iso_shoulders", "iso_arms");
      forbidden.push("squat", "hinge", "pull_horizontal", "pull_vertical", "iso_legs");
      bodyRegionPriority = "upper";
      fatigueCapacity = "medium";
      break;
    case "pull_day":
      required.push("pull_horizontal", "pull_vertical");
      preferred.push("iso_back", "iso_shoulders", "iso_arms", "core");
      forbidden.push("squat", "hinge", "push_horizontal", "push_vertical", "iso_legs");
      bodyRegionPriority = "upper";
      fatigueCapacity = "medium";
      break;
    case "leg_day":
    case "lower_balanced":
      required.push("squat", "hinge");
      preferred.push("iso_legs", "core", "carry");
      forbidden.push("push_horizontal", "pull_horizontal", "iso_chest", "iso_arms");
      bodyRegionPriority = "lower";
      fatigueCapacity = "high";
      break;
    case "lower_squat_focus":
      required.push("squat");
      preferred.push("iso_legs", "hinge", "core");
      forbidden.push("push_horizontal", "pull_horizontal", "iso_chest", "iso_arms");
      bodyRegionPriority = "lower";
      fatigueCapacity = "high";
      break;
    case "lower_hinge_focus":
      required.push("hinge");
      preferred.push("squat", "iso_legs", "core");
      forbidden.push("push_horizontal", "pull_horizontal", "iso_chest", "iso_arms");
      bodyRegionPriority = "lower";
      fatigueCapacity = "high";
      break;
    case "recovery_low_stress":
      preferred.push("core", "carry");
      forbidden.push("power_explosive", "squat", "hinge");
      bodyRegionPriority = "full";
      fatigueCapacity = "low";
      break;
  }

  return {
    dayNumber: day.dayNumber,
    name: day.name,
    purpose,
    bodyRegionPriority,
    maxExercises,
    requiredPatterns: required,
    preferredPatterns: preferred,
    forbiddenPatterns: forbidden,
    fatigueCapacity,
  };
}

// ─── Fatigue Score Estimator ──────────────────────────────────────────────────

function estimateFatigueScore(ex: CategorizedExercise): number {
  // 1-10 scale, higher = more demanding
  const patternFatigue: Partial<Record<MovementCategory, number>> = {
    power_explosive: 8,
    squat: 9,
    hinge: 8,
    push_horizontal: 6,
    push_vertical: 5,
    pull_horizontal: 6,
    pull_vertical: 5,
    carry: 7,
    iso_chest: 3,
    iso_back: 3,
    iso_shoulders: 2,
    iso_arms: 2,
    iso_legs: 4,
    core: 3,
    conditioning: 6,
  };
  const base = patternFatigue[ex.pattern] ?? 4;
  // Adjust for set count
  const sets = ex.exercise.sets ?? 3;
  const setMultiplier = sets >= 5 ? 1.3 : sets <= 2 ? 0.8 : 1;
  return Math.round(base * setMultiplier * 10) / 10;
}

function estimateSessionFatigue(exercises: CategorizedExercise[]): number {
  return exercises.reduce((sum, ex) => sum + estimateFatigueScore(ex), 0);
}

const FATIGUE_CAPS: Record<"high" | "medium" | "low", number> = {
  high: 45,
  medium: 35,
  low: 22,
};

// ─── Movement Balance Check ───────────────────────────────────────────────────

function checkWeeklyBalance(
  days: ProgramDay[],
  context: RedistributionContext,
): WeeklyBalanceReport {
  let pushCount = 0;
  let pullCount = 0;
  let squatCount = 0;
  let hingeCount = 0;
  let coreCount = 0;
  let explosiveCount = 0;

  for (const day of days) {
    for (const ex of day.exercises) {
      const cat = categorizeExercise(ex, day.dayNumber);
      if (cat.pattern === "push_horizontal" || cat.pattern === "push_vertical" || cat.pattern === "iso_chest") pushCount++;
      if (cat.pattern === "pull_horizontal" || cat.pattern === "pull_vertical" || cat.pattern === "iso_back") pullCount++;
      if (cat.pattern === "squat") squatCount++;
      if (cat.pattern === "hinge") hingeCount++;
      if (cat.pattern === "core") coreCount++;
      if (cat.isExplosive) explosiveCount++;
    }
  }

  const issues: string[] = [];
  const pushPullRatio = pullCount > 0 ? pushCount / pullCount : pushCount;

  if (pushPullRatio > 1.5) issues.push(`Push/pull imbalance: ${pushCount} push vs ${pullCount} pull — add more pulling work`);
  if (pushPullRatio < 0.5) issues.push(`Push/pull imbalance: ${pullCount} pull vs ${pushCount} push — add more pressing work`);
  if (squatCount === 0) issues.push("No squat pattern present across the week");
  if (hingeCount === 0) issues.push("No hinge pattern present across the week");
  if (coreCount < 2) issues.push("Insufficient core work — fewer than 2 core exercises per week");
  const goal = context.goal.toLowerCase();
  if ((goal.includes("athletic") || goal.includes("performance")) && explosiveCount === 0) {
    issues.push("Athletic goal but no explosive/power work present");
  }

  return { pushCount, pullCount, squatCount, hingeCount, coreCount, explosiveCount, balanceIssues: issues };
}

// ─── Replacement Engine (via Exercise Intelligence Layer) ─────────────────────
//
// Delegates to exercise-intelligence.ts findSubstitute() and findAdditions()
// instead of a static list. Applies full goal/equipment/pain/fatigue awareness.

function findReplacement(
  original: CategorizedExercise,
  context: RedistributionContext,
): Exercise | null {
  const sessionRole = inferSessionRole(original);
  const result = findSubstitute({
    originalName: original.exercise.name,
    reason: context.painFlags.length > 0 ? "pain" : "swap",
    goal: context.goal,
    equipment: context.equipment,
    experience: context.experience,
    injuryFlags: context.painFlags as JointStress[],
    sessionRole,
    excludeNames: context.avoidedExercises,
  });

  if (!result.chosen) return null;

  const prescription = result.prescription ?? {
    sets: original.exercise.sets,
    reps: original.exercise.reps,
    rest: original.exercise.rest,
    intent: original.exercise.intent ?? "",
  };

  logger.info(
    {
      original: original.exercise.name,
      replacement: result.chosen.name,
      rationale: result.rationale,
      alternatives: result.alternativesConsidered,
    },
    "[ExerciseIntelligence] Replacement selected via intelligence layer"
  );

  return {
    name: result.chosen.name,
    classification: roleToClassification(result.chosen.sessionRole),
    sets: prescription.sets,
    reps: prescription.reps,
    rest: prescription.rest,
    intent: prescription.intent,
  };
}

function inferSessionRole(ex: CategorizedExercise): SessionRole {
  if (ex.priorityTier === 1) return "main_lift";
  if (ex.priorityTier === 2) return "secondary_compound";
  if (ex.pattern === "core" || ex.pattern === "carry") return "trunk_work";
  if (ex.pattern === "power_explosive") return "power_work";
  if (ex.pattern === "conditioning") return "finisher";
  return "hypertrophy_accessory";
}

function roleToClassification(role: SessionRole): string {
  const map: Record<SessionRole, string> = {
    main_lift: "Primary",
    secondary_compound: "Secondary",
    hypertrophy_accessory: "Accessory",
    power_work: "Explosive",
    trunk_work: "Accessory",
    mobility_reset: "Accessory",
    finisher: "Conditioning",
  };
  return map[role] ?? "Accessory";
}

function intelligenceExerciseToExercise(
  intel: ReturnType<typeof findAdditions>["additions"][0],
): Exercise {
  return {
    name: intel.exercise.name,
    classification: roleToClassification(intel.exercise.sessionRole),
    sets: intel.prescription.sets,
    reps: intel.prescription.reps,
    rest: intel.prescription.rest,
    intent: intel.prescription.intent,
  };
}

// ─── NSCA Sort (local) ────────────────────────────────────────────────────────

function nscaSortExercises(exercises: CategorizedExercise[]): CategorizedExercise[] {
  const ORDER: Record<MovementCategory, number> = {
    power_explosive: 0,
    squat: 1, hinge: 1,
    push_horizontal: 2, push_vertical: 2,
    pull_horizontal: 2, pull_vertical: 2,
    carry: 3,
    iso_chest: 4, iso_back: 4, iso_shoulders: 4, iso_legs: 4,
    iso_arms: 5,
    core: 6,
    conditioning: 7,
  };

  return [...exercises].sort((a, b) => {
    const aOrder = a.isExplosive ? -1 : ORDER[a.pattern] + (a.priorityTier * 0.01);
    const bOrder = b.isExplosive ? -1 : ORDER[b.pattern] + (b.priorityTier * 0.01);
    return aOrder - bOrder;
  });
}

// ─── Core Redistribution Function ────────────────────────────────────────────

export function redistributeExercises(
  roughDays: ProgramDay[],
  originalPool: CategorizedExercise[],
  context: RedistributionContext,
  transformation: TransformationType,
): RedistributionResult {
  const decisionLog: ExerciseDecisionEntry[] = [];

  // ── Step 1: Score every exercise in the pool ───────────────────────────────
  const scoredPool: ScoredExercise[] = originalPool.map((ex) => ({
    ...ex,
    priorityScore: scoreExercise(ex, context),
    decision: "PRESERVE_IN_PLACE" as ExerciseDecision,
    decisionReason: "Not yet evaluated",
    targetDay: null,
  }));

  // ── Step 2: Detect and mark redundancy ────────────────────────────────────
  const redundancyReport = detectRedundancy(scoredPool, context.sessionDurationMinutes);
  const redundantNames = new Set(
    redundancyReport.filter((r) => r.isRedundant).map((r) => r.exerciseName)
  );

  for (const ex of scoredPool) {
    if (redundantNames.has(ex.exercise.name)) {
      ex.decision = "REMOVE_AS_REDUNDANT";
      ex.decisionReason = redundancyReport.find((r) => r.exerciseName === ex.exercise.name)?.reason
        ?? "Redundant within movement pattern";
    }
  }

  // ── Step 3: Mark pain conflicts ───────────────────────────────────────────
  for (const ex of scoredPool) {
    if (ex.decision !== "REMOVE_AS_REDUNDANT") {
      const hasConflict = context.painFlags.some((f) => flagConflictsWithExercise(f, ex));
      if (hasConflict && ex.priorityTier >= 2) {
        ex.decision = "REPLACE_WITH_SIMILAR";
        ex.decisionReason = `Pain conflict with ${context.painFlags.join(", ")} — replacing with movement-pattern-safe alternative`;
      } else if (hasConflict && ex.priorityTier === 1) {
        // Tier-1 compounds: flag but don't auto-replace (coach should decide)
        ex.decisionReason = `Note: ${ex.exercise.name} may conflict with flagged limitation — preserved but flagged`;
      }
    }
  }

  // ── Step 4: Build day templates + assign exercises ─────────────────────────
  const maxPerDay = Math.max(3, Math.floor(context.sessionDurationMinutes / 12));
  const dayTemplates: DayTemplate[] = roughDays.map((day) => {
    const purpose = inferSessionPurpose(day.name, day.focus ?? "", context.goal);
    return buildDayTemplate(day, purpose, maxPerDay);
  });

  // Candidates that can be placed (not removing)
  const activePool = scoredPool.filter((ex) =>
    ex.decision !== "REMOVE_AS_REDUNDANT" &&
    ex.decision !== "REMOVE_FOR_CONFLICT"
  );

  // Build the per-day exercise assignments
  const dayAssignments: Map<number, CategorizedExercise[]> = new Map();
  for (const tmpl of dayTemplates) dayAssignments.set(tmpl.dayNumber, []);

  // Pass 1: Place all tier-1 compounds (sorted by score desc) with day affinity
  const tier1 = activePool.filter((ex) => ex.priorityTier === 1).sort((a, b) => b.priorityScore - a.priorityScore);
  for (const ex of tier1) {
    const bestDay = findBestDay(ex, dayTemplates, dayAssignments, context, maxPerDay);
    if (bestDay !== null) {
      dayAssignments.get(bestDay)!.push(ex);
      ex.targetDay = bestDay;
      ex.decision = bestDay === ex.sourceDay ? "PRESERVE_IN_PLACE" : "MOVE_TO_DIFFERENT_DAY";
      ex.decisionReason = bestDay === ex.sourceDay
        ? "Tier-1 compound preserved in original position"
        : `Tier-1 compound moved to Day ${bestDay} — better pattern fit`;
    } else {
      ex.decision = "REMOVE_FOR_FATIGUE";
      ex.decisionReason = "No compatible day with available capacity — fatigue budget exceeded";
    }
  }

  // Pass 2: Place tier-2 secondary compounds
  const tier2 = activePool.filter((ex) => ex.priorityTier === 2).sort((a, b) => b.priorityScore - a.priorityScore);
  for (const ex of tier2) {
    const bestDay = findBestDay(ex, dayTemplates, dayAssignments, context, maxPerDay);
    if (bestDay !== null) {
      dayAssignments.get(bestDay)!.push(ex);
      ex.targetDay = bestDay;
      ex.decision = bestDay === ex.sourceDay ? "PRESERVE_IN_PLACE" : "MOVE_TO_DIFFERENT_DAY";
      ex.decisionReason = bestDay === ex.sourceDay
        ? "Tier-2 secondary preserved in original position"
        : `Moved to Day ${bestDay} — better session balance fit`;
    } else {
      ex.decision = "REMOVE_FOR_TIME";
      ex.decisionReason = "Session at capacity — tier-2 exercise deferred";
    }
  }

  // Pass 3: Place tier-3 accessories (lowest priority)
  const tier3 = activePool.filter((ex) => ex.priorityTier === 3).sort((a, b) => b.priorityScore - a.priorityScore);
  for (const ex of tier3) {
    if (ex.decision === "REPLACE_WITH_SIMILAR") {
      // Find replacement via intelligence layer — returns Exercise | null directly
      const replacementExercise = findReplacement(ex, context);
      if (replacementExercise) {
        const replacementCat = categorizeExercise(replacementExercise, 0);
        const bestDay = findBestDay(replacementCat, dayTemplates, dayAssignments, context, maxPerDay);
        if (bestDay !== null) {
          const replacedEx: CategorizedExercise = { ...replacementCat, sourceDay: bestDay };
          dayAssignments.get(bestDay)!.push(replacedEx);
          ex.targetDay = bestDay;
          ex.replacedBy = replacementExercise.name;
        } else {
          ex.decision = "REMOVE_FOR_CONFLICT";
          ex.decisionReason = "Replacement needed but no compatible slot available";
        }
      }
      continue;
    }

    const bestDay = findBestDay(ex, dayTemplates, dayAssignments, context, maxPerDay);
    if (bestDay !== null) {
      dayAssignments.get(bestDay)!.push(ex);
      ex.targetDay = bestDay;
      ex.decision = bestDay === ex.sourceDay ? "PRESERVE_IN_PLACE" : "MOVE_TO_DIFFERENT_DAY";
      ex.decisionReason = bestDay === ex.sourceDay
        ? "Accessory preserved in session"
        : `Accessory moved to Day ${bestDay} — fits session purpose better`;
    } else {
      ex.decision = "REMOVE_FOR_TIME";
      ex.decisionReason = "Session at capacity — lowest-priority accessory removed";
    }
  }

  // Pass 4: Conditioning (tier 4)
  const tier4 = activePool.filter((ex) => ex.priorityTier === 4).sort((a, b) => b.priorityScore - a.priorityScore);
  for (const ex of tier4) {
    const bestDay = findBestDay(ex, dayTemplates, dayAssignments, context, maxPerDay);
    if (bestDay !== null) {
      dayAssignments.get(bestDay)!.push(ex);
      ex.targetDay = bestDay;
      ex.decision = "PRESERVE_IN_PLACE";
      ex.decisionReason = "Conditioning block placed at session end";
    } else {
      ex.decision = "REMOVE_FOR_TIME";
      ex.decisionReason = "Session at capacity — conditioning block dropped";
    }
  }

  // ── Step 5: Fill required-pattern gaps via intelligence layer ─────────────
  // Maps movement patterns to addition categories so findAdditions() can
  // perform goal/equipment/pain-aware selection rather than pulling from a
  // static list.
  const patternToAdditionCategory: Partial<Record<MovementCategory, import("./exercise-intelligence").AdditionCategory>> = {
    core: "core",
    carry: "carries",
    conditioning: "conditioning",
    power_explosive: "power",
    iso_legs: "calves",
    iso_shoulders: "shoulders_lateral",
    iso_back: "upper_back",
  };

  for (const tmpl of dayTemplates) {
    const assigned = dayAssignments.get(tmpl.dayNumber) ?? [];
    const assignedPatterns = new Set(assigned.map((e) => e.pattern));
    const existingNames = assigned.map((e) => e.exercise.name);

    for (const requiredPattern of tmpl.requiredPatterns) {
      if (assignedPatterns.has(requiredPattern) || assigned.length >= tmpl.maxExercises) continue;

      // Try the intelligence layer first (goal/equipment/pain-aware)
      const additionCategory = patternToAdditionCategory[requiredPattern];
      let addedFromIntelligence = false;

      if (additionCategory) {
        const addResult = findAdditions({
          category: additionCategory,
          goal: context.goal,
          equipment: context.equipment,
          experience: context.experience,
          injuryFlags: context.painFlags as JointStress[],
          sessionDurationMinutes: context.sessionDurationMinutes,
          currentExerciseNames: existingNames,
          limit: 1,
        });

        if (addResult.additions.length > 0) {
          const addition = addResult.additions[0];
          const ex = categorizeExercise(intelligenceExerciseToExercise(addition), tmpl.dayNumber);
          assigned.push(ex);
          assignedPatterns.add(requiredPattern);
          existingNames.push(addition.exercise.name);
          decisionLog.push({
            exerciseName: addition.exercise.name,
            decision: "ADD_NEW_EXERCISE",
            reason: `Required ${requiredPattern.replace(/_/g, " ")} missing on ${tmpl.name} — ${addition.rationale}. ${addition.placementNote}`,
            targetDay: tmpl.dayNumber,
            priorityScore: 50,
          });
          addedFromIntelligence = true;
        }
      }

      // Fallback: raw pattern search through EXERCISE_INTELLIGENCE
      if (!addedFromIntelligence) {
        const fallback = EXERCISE_INTELLIGENCE.find(
          (e) => e.pattern === requiredPattern &&
          !existingNames.some((n) => n.toLowerCase() === e.name.toLowerCase())
        );
        if (fallback) {
          const pres = getPrescription(fallback, context.goal, context.experience);
          const fallbackExercise: Exercise = {
            name: fallback.name,
            classification: roleToClassification(fallback.sessionRole),
            sets: pres.sets,
            reps: pres.reps,
            rest: pres.rest,
            intent: pres.intent,
          };
          const ex = categorizeExercise(fallbackExercise, tmpl.dayNumber);
          assigned.push(ex);
          assignedPatterns.add(requiredPattern);
          decisionLog.push({
            exerciseName: fallback.name,
            decision: "ADD_NEW_EXERCISE",
            reason: `Required ${requiredPattern.replace(/_/g, " ")} pattern missing on ${tmpl.name} — added from exercise library fallback`,
            targetDay: tmpl.dayNumber,
            priorityScore: 45,
          });
        }
      }
    }
  }

  // ── Step 6: Build final days ───────────────────────────────────────────────
  const finalDays: ProgramDay[] = roughDays.map((originalDay) => {
    const assigned = dayAssignments.get(originalDay.dayNumber) ?? [];
    const sorted = nscaSortExercises(assigned);

    // Enforce fatigue cap by trimming from tail
    const tmpl = dayTemplates.find((t) => t.dayNumber === originalDay.dayNumber);
    let trimmed = sorted;
    if (tmpl) {
      const cap = FATIGUE_CAPS[tmpl.fatigueCapacity];
      let totalFatigue = 0;
      trimmed = [];
      for (const ex of sorted) {
        const fatigue = estimateFatigueScore(ex);
        if (totalFatigue + fatigue <= cap) {
          trimmed.push(ex);
          totalFatigue += fatigue;
        } else {
          // Log the fatigue cut
          decisionLog.push({
            exerciseName: ex.exercise.name,
            decision: "REMOVE_FOR_FATIGUE",
            reason: `Session fatigue budget (${cap}) exceeded — exercise removed to protect recovery`,
            originalDay: ex.sourceDay,
            priorityScore: (ex as ScoredExercise).priorityScore,
          });
        }
      }
    }

    return {
      ...originalDay,
      exercises: trimmed.map((e) => e.exercise),
    };
  });

  // ── Step 7: Build decision log from scored pool ────────────────────────────
  for (const ex of scoredPool) {
    decisionLog.push({
      exerciseName: ex.exercise.name,
      decision: ex.decision,
      reason: ex.decisionReason,
      originalDay: ex.sourceDay,
      targetDay: ex.targetDay ?? undefined,
      replacedBy: ex.replacedBy,
      priorityScore: ex.priorityScore,
    });
  }

  // ── Step 8: Weekly balance check ──────────────────────────────────────────
  const weeklyBalance = checkWeeklyBalance(finalDays, context);

  if (weeklyBalance.balanceIssues.length > 0) {
    logger.warn(
      { balanceIssues: weeklyBalance.balanceIssues, transformation },
      "[ExerciseRedistribution] Weekly balance issues detected post-redistribution"
    );
  }

  return { days: finalDays, decisionLog, weeklyBalanceReport: weeklyBalance };
}

// ─── Best Day Finder ──────────────────────────────────────────────────────────
// Finds the most appropriate day for an exercise given session purposes, capacity,
// fatigue budget, and forbidden pattern rules.

function findBestDay(
  ex: CategorizedExercise,
  templates: DayTemplate[],
  assignments: Map<number, CategorizedExercise[]>,
  context: RedistributionContext,
  maxPerDay: number,
): number | null {
  type DayScore = { dayNumber: number; score: number };
  const scores: DayScore[] = [];

  for (const tmpl of templates) {
    const assigned = assignments.get(tmpl.dayNumber) ?? [];

    // Capacity check
    if (assigned.length >= tmpl.maxExercises) continue;

    // Forbidden pattern check
    if (tmpl.forbiddenPatterns.includes(ex.pattern)) continue;

    // Fatigue budget check
    const currentFatigue = estimateSessionFatigue(assigned);
    const cap = FATIGUE_CAPS[tmpl.fatigueCapacity];
    if (currentFatigue + estimateFatigueScore(ex) > cap * 1.15) continue; // 15% overage tolerance

    let score = 0;

    // Required pattern — strong preference
    if (tmpl.requiredPatterns.includes(ex.pattern)) score += 30;

    // Preferred pattern — moderate preference
    if (tmpl.preferredPatterns.includes(ex.pattern)) score += 15;

    // Body region match
    if (tmpl.bodyRegionPriority === "full" || tmpl.bodyRegionPriority === ex.bodyRegion) score += 10;

    // Same day as original — prefer to keep unless there's a clear reason to move
    if (tmpl.dayNumber === ex.sourceDay) score += 8;

    // High-capacity days can absorb compound work better
    if (tmpl.fatigueCapacity === "high" && ex.priorityTier <= 2) score += 5;

    // Avoid stacking multiple tier-1 compounds in low-capacity days
    const currentTier1 = assigned.filter((a) => a.priorityTier === 1).length;
    if (ex.priorityTier === 1 && currentTier1 >= 2 && tmpl.fatigueCapacity !== "high") score -= 15;

    // Pattern count balance — don't stack same pattern
    const patternCount = assigned.filter((a) => a.pattern === ex.pattern).length;
    score -= patternCount * 8;

    scores.push({ dayNumber: tmpl.dayNumber, score });
  }

  if (scores.length === 0) return null;
  scores.sort((a, b) => b.score - a.score);
  return scores[0].dayNumber;
}

// ─── Logging Helper ───────────────────────────────────────────────────────────

export function logRedistributionSummary(result: RedistributionResult): void {
  const preserved = result.decisionLog.filter((d) => d.decision === "PRESERVE_IN_PLACE").length;
  const moved = result.decisionLog.filter((d) => d.decision === "MOVE_TO_DIFFERENT_DAY").length;
  const replaced = result.decisionLog.filter((d) => d.decision === "REPLACE_WITH_SIMILAR").length;
  const removed = result.decisionLog.filter((d) =>
    d.decision === "REMOVE_AS_REDUNDANT" ||
    d.decision === "REMOVE_FOR_FATIGUE" ||
    d.decision === "REMOVE_FOR_TIME" ||
    d.decision === "REMOVE_FOR_CONFLICT"
  ).length;
  const added = result.decisionLog.filter((d) => d.decision === "ADD_NEW_EXERCISE").length;

  logger.info(
    {
      preserved,
      moved,
      replaced,
      removed,
      added,
      weeklyBalance: result.weeklyBalanceReport,
      decisionBreakdown: {
        redundant: result.decisionLog.filter((d) => d.decision === "REMOVE_AS_REDUNDANT").length,
        fatigueCut: result.decisionLog.filter((d) => d.decision === "REMOVE_FOR_FATIGUE").length,
        timeCut: result.decisionLog.filter((d) => d.decision === "REMOVE_FOR_TIME").length,
        conflictCut: result.decisionLog.filter((d) => d.decision === "REMOVE_FOR_CONFLICT").length,
      },
    },
    "[ExerciseRedistribution] Redistribution complete"
  );
}

// ─── Context Builder from UserProfile ────────────────────────────────────────

export function buildRedistributionContext(profile: UserProfile | null): RedistributionContext {
  if (!profile) {
    return {
      goal: "general_fitness",
      sessionDurationMinutes: 60,
      painFlags: [],
      preferredExercises: [],
      avoidedExercises: [],
      experience: "intermediate",
      equipment: "full_gym",
    };
  }

  const preferredExercises = profile.exercisePreferences
    ? profile.exercisePreferences.split(/,|;|\n/).map((s) => s.trim()).filter(Boolean)
    : [];

  const avoidedExercises = profile.exercisesToAvoid
    ? profile.exercisesToAvoid.split(/,|;|\n/).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    goal: normalizeGoal(profile.trainingGoal),
    sessionDurationMinutes: profile.sessionDuration,
    painFlags: detectInjuryFlags(profile.injuries),
    preferredExercises,
    avoidedExercises,
    experience: normalizeExperience(profile.experienceLevel),
    equipment: normalizeEquipment(profile.equipmentAccess),
  };
}
