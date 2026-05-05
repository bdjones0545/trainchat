/**
 * TrainChat Auto-Progression Engine
 *
 * Determines how each exercise should progress, hold, or regress based on:
 *   - Logged performance (load, reps, completion status)
 *   - Session-level feedback (perceived difficulty, pain level)
 *   - Exercise type and progression type (load_based, reps_based, distance_quality, …)
 *   - Training goal (strength, hypertrophy, performance, …)
 *
 * Core rules:
 *   1. Pain overrides everything — moderate+ pain blocks progression.
 *   2. Session completion status drives baseline state.
 *   3. Session-level feedback (too_easy / too_hard) adjusts individual exercise state.
 *   4. Each progression type has its own advancement logic.
 *   5. Power / plyometric exercises progress through quality, never raw load / reps volume.
 *   6. Prep / trunk / mobility are completion-based — progression = control, not load.
 *   7. Missing data → always hold. Never hallucinate progression.
 */

import { db, exerciseLogsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressionState = "ready_to_progress" | "hold" | "regress" | "review";

export type ExerciseRole = "power" | "compound" | "unilateral" | "accessory" | "prep" | "trunk";

export type TrainingGoal =
  | "strength" | "hypertrophy" | "performance" | "fat_loss"
  | "general_fitness" | "athletic_performance" | "sport_performance";

export type PainLevel = "none" | "mild" | "moderate" | "significant" | "severe";

export type PerceivedDifficulty = "too_easy" | "just_right" | "too_hard";

/**
 * 8 progression archetypes — matched to exercise type.
 * Determines how recommendations are phrased and what gets incremented.
 */
export type ProgressionType =
  | "load_based"       // squat, deadlift, DB press — increase weight
  | "reps_based"       // pull-up, push-up, bodyweight row — increase reps first
  | "distance_quality" // broad jump, bounding — increase distance when quality is good
  | "height_quality"   // box jump, hurdle hop — increase height when landing is clean
  | "velocity_reps"    // med ball slam/throw — quality + explosiveness, not raw load
  | "duration_based"   // plank, hollow hold, wall sit — increase time
  | "time_speed"       // sprint, carry — improve time or increase distance
  | "completion_only"; // warm-up flows, activation drills — done = success

export interface ExerciseLogEntry {
  id: number;
  loadUsed: number | null;
  repsCompleted: number | null;
  setsCompleted: number | null;
  rpe: number | null;
  completionStatus: "easy" | "solid" | "hard" | "failed";
  exerciseRole: string | null;
  loggedAt: Date;
}

export interface ProgressionTarget {
  exerciseName: string;
  progressionType: ProgressionType;
  progressionState: ProgressionState;
  targetLoad: number | null;
  targetReps: number | null;
  lastLoad: number | null;
  lastReps: number | null;
  reasoning: string;
  coachNote: string;
  flagForReview: boolean;
}

export interface DeloadSignal {
  shouldDeload: boolean;
  reason: string | null;
  confidence: number;
}

export interface ExerciseEvaluation {
  exerciseName: string;
  progressionType: ProgressionType;
  status: "progress" | "maintain" | "regress" | "review";
  recommendation: {
    targetLoad: number | null;
    targetReps: number | null;
    loadChange: number | null;
    repsChange: number | null;
    unit: string;
  };
  reason: string;
  coachNote: string;
  flagForReview: boolean;
}

export interface SessionEvaluation {
  exercises: ExerciseEvaluation[];
  sessionAdaptation: {
    shouldReduceVolume: boolean;
    shouldProgress: boolean;
    reason: string;
  };
  deloadRecommended: boolean;
  deloadReason: string | null;
}

// ─── Progression type inference ────────────────────────────────────────────────
// Mirrors inferLoggingMode on the frontend — kept in sync manually.
// Priority: specific name patterns > category fallbacks > default (load_based).

export function inferProgressionType(name: string, category?: string): ProgressionType {
  const n = name.toLowerCase();

  // Completion-only: warmup / activation / recovery categories
  if (
    category === "warmup" || category === "activation" || category === "recovery"
  ) {
    return "completion_only";
  }

  // Specific named mobility/prep patterns
  if (
    n.includes("swing") || n.includes("hip circle") || n.includes("ankle circle") ||
    n.includes("arm circle") || n.includes("leg swing") || n.includes("inchworm") ||
    n.includes("wall slide") || n.includes("pull-apart") || n.includes("band pull") ||
    n.includes("shoulder cars") || n.includes("thoracic rotation") || n.includes("t-spine") ||
    n.includes("pogo hop") || n.includes("a-skip") || n.includes("b-skip") ||
    n.includes("snap-down") || n.includes("snap down") || n.includes("mobility flow") ||
    n.includes("dynamic prep") || n.includes("lateral band walk") || n.includes("monster walk") ||
    n.includes("cat-cow") || n.includes("bird dog") || n.includes("90-90") ||
    n.includes("hip flexor stretch") || n.includes("pec stretch") ||
    (n.includes("glute bridge") && !n.includes("loaded") && !n.includes("barbell"))
  ) {
    return "completion_only";
  }

  // Olympic / loaded power lifts — load_based (these have weights)
  if (
    n.includes("power clean") || n.includes("hang clean") || n.includes("clean pull") ||
    n.includes("hang snatch") || n.includes("power snatch") || n.includes("high pull") ||
    n.includes("push press") || n.includes("push jerk") || n.includes("split jerk")
  ) {
    return "load_based";
  }

  // Horizontal jumps — distance_quality
  if (n.includes("broad jump") || n.includes("long jump") || n.includes("bounding") || n.includes("bound")) {
    return "distance_quality";
  }

  // Vertical / box jumps — height_quality
  if (
    n.includes("box jump") || n.includes("hurdle jump") || n.includes("hurdle hop") ||
    n.includes("depth jump") || n.includes("reactive box")
  ) {
    return "height_quality";
  }

  // Med ball / throws — velocity_reps
  if (
    n.includes("med ball") || n.includes("medicine ball") || n.includes("slam") ||
    n.includes("rotational throw") || n.includes("chest pass") || n.includes("overhead throw") ||
    n.includes("scoop throw") || n.includes("shot put")
  ) {
    return "velocity_reps";
  }

  // Timed holds — duration_based
  if (
    n.includes("plank") || n.includes("isometric") || n.includes("wall sit") ||
    n.includes("l-sit") || n.includes("hollow hold") || n.includes("boat hold") ||
    n.includes("dead bug")
  ) {
    return "duration_based";
  }

  // Carries and sprints — time_speed
  if (
    n.includes("carry") || n.includes("farmer") || n.includes("suitcase carry") || n.includes("yoke") ||
    n.includes("sprint") || n.includes("10m") || n.includes("20m") || n.includes("30m") ||
    (n.includes("flying") && n.includes("run"))
  ) {
    return "time_speed";
  }

  // General jumps / hops (not box/broad/hurdle) — velocity_reps (quality focus)
  if (n.includes("jump") || n.includes("hop") || n.includes("plyometric") || n.includes("reactive")) {
    return "velocity_reps";
  }

  // Bodyweight classics — reps_based
  if (
    n.includes("pull-up") || n.includes("pullup") || n.includes("chin-up") || n.includes("chinup") ||
    n.includes("push-up") || n.includes("pushup") || n.includes("dip") ||
    (n.includes("bodyweight") && !n.includes("squat"))
  ) {
    return "reps_based";
  }

  // Category fallbacks
  if (category === "trunk") return "duration_based";
  if (category === "power") return "velocity_reps";
  if (category === "conditioning") return "time_speed";

  // Default: loaded strength lift
  return "load_based";
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

export function progressionTypeLabel(type: ProgressionType): string {
  switch (type) {
    case "load_based":      return "Load-based";
    case "reps_based":      return "Rep-based";
    case "distance_quality": return "Distance";
    case "height_quality":  return "Height";
    case "velocity_reps":   return "Quality/Velocity";
    case "duration_based":  return "Duration";
    case "time_speed":      return "Speed/Time";
    case "completion_only": return "Completion";
  }
}

export function progressionTypeUnit(type: ProgressionType): string {
  switch (type) {
    case "load_based":      return "lbs";
    case "reps_based":      return "reps";
    case "distance_quality": return "ft";
    case "height_quality":  return "in";
    case "velocity_reps":   return "reps";
    case "duration_based":  return "sec";
    case "time_speed":      return "ft";
    case "completion_only": return "";
  }
}

// ─── Load increment helpers ────────────────────────────────────────────────────

function loadIncrementForRole(role: ExerciseRole, currentLoad: number): number {
  switch (role) {
    case "power": return 0;
    case "compound": return currentLoad >= 200 ? 10 : 5;
    case "unilateral": return 2.5;
    case "accessory": return 2.5;
    case "prep":
    case "trunk": return 0;
    default: return 5;
  }
}

function repIncrementForRole(role: ExerciseRole): number {
  switch (role) {
    case "accessory": return 1;
    case "unilateral": return 1;
    default: return 0;
  }
}

// ─── Pain override ─────────────────────────────────────────────────────────────

/**
 * Determines whether pain overrides progression.
 * Returns the forced ProgressionState if pain is a blocker, or null if not.
 */
function painOverrideState(painLevel: PainLevel | null | undefined): ProgressionState | null {
  if (!painLevel || painLevel === "none" || painLevel === "mild") return null;
  if (painLevel === "moderate") return "hold";
  if (painLevel === "significant") return "regress";
  if (painLevel === "severe") return "review";
  return null;
}

// ─── Progression state computation ────────────────────────────────────────────

/**
 * Compute progression state from the most recent 1-3 logs, session feedback,
 * and pain signals. Recency-weighted: last session carries most weight.
 *
 * Pain always wins. Session difficulty skews individual exercise states.
 */
export function computeProgressionState(
  history: ExerciseLogEntry[],
  readinessScore: number | null,
  perceivedDifficulty?: PerceivedDifficulty | null,
  painLevel?: PainLevel | null,
): ProgressionState {
  // 1. Pain override — highest priority
  const painState = painOverrideState(painLevel);
  if (painState) return painState;

  // 2. No history → hold
  if (history.length === 0) return "hold";

  const recent = history.slice(0, 3);
  const last = recent[0];

  // 3. Individual exercise failures
  if (last.completionStatus === "failed") return "regress";

  const hardCount = recent.filter((l) => l.completionStatus === "hard").length;
  const failCount = recent.filter((l) => l.completionStatus === "failed").length;
  const easyCount = recent.filter((l) => l.completionStatus === "easy").length;
  const solidCount = recent.filter((l) => l.completionStatus === "solid").length;

  if (failCount >= 1 || hardCount >= 2) return "regress";

  // 4. Low readiness → hold regardless of performance
  const lowReadiness = readinessScore !== null && readinessScore < 2.5;
  if (lowReadiness) return "hold";

  // 5. Session-level difficulty overrides (secondary priority after pain)
  if (perceivedDifficulty === "too_hard") {
    // Too hard session → regress if last was hard, otherwise hold
    return last.completionStatus === "hard" ? "regress" : "hold";
  }
  if (perceivedDifficulty === "too_easy") {
    // Too easy → boost to progress even with just one easy log
    return "ready_to_progress";
  }

  // 6. Performance-based state
  if (easyCount >= 2) return "ready_to_progress";
  if (solidCount >= 2 && hardCount === 0 && failCount === 0) return "ready_to_progress";
  if (last.completionStatus === "easy" && recent.length === 1) return "ready_to_progress";
  if (last.completionStatus === "hard") return "hold";

  return "hold";
}

// ─── Next target computation ──────────────────────────────────────────────────

/**
 * Compute the recommended target for the next session, respecting:
 *   - progressionType (what kind of exercise this is)
 *   - progressionState (based on history + feedback)
 *   - trainingGoal (strength vs hypertrophy vs performance)
 *   - exerciseRole (compound, unilateral, accessory, …)
 */
export function computeNextTarget(
  exerciseName: string,
  history: ExerciseLogEntry[],
  goal: TrainingGoal,
  readinessScore: number | null,
  exerciseRole: ExerciseRole = "compound",
  perceivedDifficulty?: PerceivedDifficulty | null,
  painLevel?: PainLevel | null,
  category?: string,
): ProgressionTarget {
  const progressionType = inferProgressionType(exerciseName, category);
  const state = computeProgressionState(history, readinessScore, perceivedDifficulty, painLevel);
  const unit = progressionTypeUnit(progressionType);

  const last = history[0] ?? null;
  const lastLoad = last?.loadUsed ?? null;
  const lastReps = last?.repsCompleted ?? null;

  // Pain → severe = flag for review
  const flagForReview = painLevel === "severe";

  // ── No history ──────────────────────────────────────────────────────────────
  if (history.length === 0) {
    return {
      exerciseName,
      progressionType,
      progressionState: "hold",
      targetLoad: null,
      targetReps: null,
      lastLoad: null,
      lastReps: null,
      reasoning: "No previous data — log this session to start tracking.",
      coachNote: "First session. Focus on technique and establish your baseline.",
      flagForReview: false,
    };
  }

  // ── Review (severe pain) ────────────────────────────────────────────────────
  if (state === "review") {
    return {
      exerciseName,
      progressionType,
      progressionState: "review",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: "Flagged for review — severe discomfort reported. Do not progress.",
      coachNote: "Discuss with your coach before performing this exercise again.",
      flagForReview: true,
    };
  }

  // ── Regress ─────────────────────────────────────────────────────────────────
  if (state === "regress") {
    const targetLoad =
      progressionType === "load_based" && lastLoad !== null
        ? Math.round((lastLoad * 0.9) / 2.5) * 2.5
        : lastLoad;

    const regressReason =
      painLevel === "significant"
        ? "Significant discomfort reported — reducing load to protect recovery."
        : last?.completionStatus === "failed"
        ? "Last set was a miss — pulling back 10% to reset technique."
        : perceivedDifficulty === "too_hard"
        ? "Session marked too hard — reducing to let adaptation catch up."
        : "Two hard sessions in a row — slight reduction to reset fatigue.";

    return {
      exerciseName,
      progressionType,
      progressionState: "regress",
      targetLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: regressReason,
      coachNote:
        progressionType === "load_based"
          ? `Reduce to ${targetLoad ?? "lighter"} ${unit}. Focus on clean execution.`
          : "Reduce intensity. Accumulate quality reps before adding more.",
      flagForReview: painLevel === "significant",
    };
  }

  // ── Hold ────────────────────────────────────────────────────────────────────
  if (state === "hold") {
    const holdReason =
      painLevel === "moderate"
        ? "Moderate discomfort — no progression this session."
        : last?.completionStatus === "hard"
        ? "High effort last session — hold and let the adaptation catch up."
        : readinessScore !== null && readinessScore < 2.5
        ? "Low readiness today — don't push when the tank is low."
        : "Consistent effort — hold and build quality at current load.";

    return {
      exerciseName,
      progressionType,
      progressionState: "hold",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: holdReason,
      coachNote: "Same load, same reps. Own the weight before adding more.",
      flagForReview: false,
    };
  }

  // ── Ready to progress — type-specific logic ─────────────────────────────────

  // Completion-only (warm-up / activation / recovery)
  if (progressionType === "completion_only") {
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: "Completion-based — progression means better quality and control.",
      coachNote: "Add 2 seconds of pause or slow the eccentric if it feels easy.",
      flagForReview: false,
    };
  }

  // Velocity / med ball / general plyometrics — quality over load
  if (progressionType === "velocity_reps") {
    const canAddRep = lastReps !== null && lastReps < 6;
    const targetReps = canAddRep ? lastReps + 1 : lastReps;
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps,
      lastLoad,
      lastReps,
      reasoning: canAddRep
        ? "Good quality — add one rep. Focus on explosive intent every rep."
        : "Power work progresses through quality and intent, not more load. Move with maximum aggression.",
      coachNote: "Fastest possible execution. Every rep is max-effort — reset fully between reps.",
      flagForReview: false,
    };
  }

  // Distance-quality (broad jump, bounding)
  if (progressionType === "distance_quality") {
    const distanceInc = 1; // +1 ft
    const targetLoad = lastLoad !== null ? lastLoad + distanceInc : lastLoad;
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning:
        lastLoad !== null
          ? `Good quality and output — push for ${targetLoad} ft. Only increase if landing mechanics are clean.`
          : "Track your distance each set. Only progress when landings are controlled.",
      coachNote: "Land soft. Hip hinge on landing — never knee collapse. Distance only counts with clean mechanics.",
      flagForReview: false,
    };
  }

  // Height-quality (box jump, hurdle hop)
  if (progressionType === "height_quality") {
    const heightInc = 2; // +2 in
    const targetLoad = lastLoad !== null ? lastLoad + heightInc : lastLoad;
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning:
        lastLoad !== null
          ? `Clean landings last session — try ${targetLoad} in next. Prioritize soft, controlled landing.`
          : "Track box height each session. Progress only when landings are quiet and controlled.",
      coachNote: "Land quiet — soft knees, hips back. No crashing landings.",
      flagForReview: false,
    };
  }

  // Duration-based (plank, hollow hold, wall sit)
  if (progressionType === "duration_based") {
    const timeInc = 5; // +5 sec
    const targetLoad = lastLoad !== null ? lastLoad + timeInc : lastLoad;
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning:
        lastLoad !== null
          ? `Held position well — adding ${timeInc} sec next session (target: ${targetLoad}s).`
          : "Track hold time. Add 5 sec each time you nail the full duration with good position.",
      coachNote: "Position before duration — don't let form break down in the last seconds.",
      flagForReview: false,
    };
  }

  // Time/Speed (sprint, carry)
  if (progressionType === "time_speed") {
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: "Improvement target — push for better time or extend distance by 10%.",
      coachNote: "Full recovery between reps. Speed work requires complete rest — never rush the rest period.",
      flagForReview: false,
    };
  }

  // Reps-based (pull-up, push-up, bodyweight)
  if (progressionType === "reps_based") {
    const repCeiling = goal === "strength" ? 6 : 12;
    if (lastReps !== null && lastReps >= repCeiling && lastLoad !== null) {
      // Rep ceiling hit → add load (or add difficulty)
      const loadInc = 5;
      return {
        exerciseName,
        progressionType,
        progressionState: "ready_to_progress",
        targetLoad: lastLoad + loadInc,
        targetReps: Math.max(4, lastReps - 3),
        lastLoad,
        lastReps,
        reasoning: `Rep ceiling hit at ${lastReps} reps — moving to added load (+${loadInc} lbs). Drop reps to build from there.`,
        coachNote: `Add ${loadInc} lbs of assistance or resistance. Start at ${Math.max(4, lastReps - 3)} clean reps.`,
        flagForReview: false,
      };
    }
    const repInc = 1;
    const targetReps = lastReps !== null ? lastReps + repInc : lastReps;
    return {
      exerciseName,
      progressionType,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps,
      lastLoad,
      lastReps,
      reasoning:
        lastReps !== null
          ? `Good reps last session — push for ${targetReps} this time.`
          : "Track reps. Add one rep each session you nail the full set cleanly.",
      coachNote: "Full range of motion on every rep — no partial reps to hit the number.",
      flagForReview: false,
    };
  }

  // ── Load-based (default) ────────────────────────────────────────────────────
  let targetLoad = lastLoad;
  let targetReps = lastReps;
  let reasoning = "";
  let coachNote = "";

  const loadInc = lastLoad !== null ? loadIncrementForRole(exerciseRole, lastLoad) : 0;
  const repInc = repIncrementForRole(exerciseRole);

  if (goal === "strength") {
    if (lastLoad !== null && loadInc > 0) {
      targetLoad = lastLoad + loadInc;
      reasoning = `Last session: ${lastLoad} lbs — progressing by ${loadInc} lbs. Consistent resistance progression drives strength.`;
      coachNote = `Target: ${targetLoad} lbs × ${lastReps ?? "same"} reps. Resistance progression is the priority when a logged baseline exists.`;
    } else {
      reasoning = "No resistance logged yet — train with strong intent and log this session to establish your baseline.";
      coachNote = "Work at a challenging effort level — logging this session lets us track progress from here.";
    }
  } else if (goal === "hypertrophy") {
    if (lastReps !== null && repInc > 0) {
      targetReps = lastReps + repInc;
      reasoning = `At ${lastReps} reps — pushing to ${targetReps} before adding load. Volume drives hypertrophy.`;
      coachNote = `Hit ${targetReps} clean reps first. Then we add load next cycle.`;
    } else if (lastLoad !== null && loadInc > 0) {
      targetLoad = lastLoad + loadInc;
      reasoning = `Rep ceiling hit. Moving to ${targetLoad} lbs.`;
      coachNote = `New load: ${targetLoad} lbs. Start at the bottom of the rep range.`;
    }
  } else {
    if (lastLoad !== null && loadInc > 0) {
      targetLoad = lastLoad + loadInc;
      reasoning = `Performance goal: adding ${loadInc} lbs while keeping movement quality high.`;
      coachNote = `${targetLoad} lbs × ${lastReps ?? "same"} reps. Stay athletic — no grinding.`;
    }
  }

  if (!reasoning) {
    reasoning = "Ready to progress — add a small load increment.";
    coachNote = "Small step. Consistency over time compounds.";
  }

  return {
    exerciseName,
    progressionType,
    progressionState: "ready_to_progress",
    targetLoad,
    targetReps,
    lastLoad,
    lastReps,
    reasoning,
    coachNote,
    flagForReview: false,
  };
}

// ─── Exercise evaluation (richer output for session complete) ──────────────────

/**
 * Evaluates a single exercise and returns a structured decision.
 * Used by evaluateSessionProgression.
 */
export function evaluateExerciseProgression(
  exerciseName: string,
  history: ExerciseLogEntry[],
  goal: TrainingGoal,
  readinessScore: number | null,
  exerciseRole: ExerciseRole = "compound",
  perceivedDifficulty?: PerceivedDifficulty | null,
  painLevel?: PainLevel | null,
  category?: string,
): ExerciseEvaluation {
  const target = computeNextTarget(
    exerciseName, history, goal, readinessScore,
    exerciseRole, perceivedDifficulty, painLevel, category,
  );

  const statusMap: Record<ProgressionState, ExerciseEvaluation["status"]> = {
    ready_to_progress: "progress",
    hold: "maintain",
    regress: "regress",
    review: "review",
  };

  const loadChange =
    target.targetLoad !== null && target.lastLoad !== null && target.targetLoad !== target.lastLoad
      ? target.targetLoad - target.lastLoad
      : null;

  const repsChange =
    target.targetReps !== null && target.lastReps !== null && target.targetReps !== target.lastReps
      ? target.targetReps - target.lastReps
      : null;

  return {
    exerciseName,
    progressionType: target.progressionType,
    status: statusMap[target.progressionState],
    recommendation: {
      targetLoad: target.targetLoad,
      targetReps: target.targetReps,
      loadChange,
      repsChange,
      unit: progressionTypeUnit(target.progressionType),
    },
    reason: target.reasoning,
    coachNote: target.coachNote,
    flagForReview: target.flagForReview,
  };
}

// ─── Session evaluation ────────────────────────────────────────────────────────

export interface SessionExerciseInput {
  exerciseName: string;
  exerciseRole?: ExerciseRole;
  category?: string;
  setsCompleted: number;
  totalPrescribedSets: number;
  logs: ExerciseLogEntry[];
}

/**
 * Evaluates all exercises in a session and returns structured decisions for each.
 * Also produces session-level adaptation recommendations.
 */
export function evaluateSessionProgression(
  exercises: SessionExerciseInput[],
  goal: TrainingGoal,
  readinessScore: number | null,
  perceivedDifficulty?: PerceivedDifficulty | null,
  painLevel?: PainLevel | null,
  sessionWasSkipped?: boolean,
): SessionEvaluation {
  // Safety: never auto-progress a skipped session
  if (sessionWasSkipped) {
    return {
      exercises: exercises.map((ex) => ({
        exerciseName: ex.exerciseName,
        progressionType: inferProgressionType(ex.exerciseName, ex.category),
        status: "maintain",
        recommendation: { targetLoad: null, targetReps: null, loadChange: null, repsChange: null, unit: "" },
        reason: "Session was skipped — no progression applied.",
        coachNote: "Pick up where you left off.",
        flagForReview: false,
      })),
      sessionAdaptation: { shouldReduceVolume: false, shouldProgress: false, reason: "Session skipped — no adaptation." },
      deloadRecommended: false,
      deloadReason: null,
    };
  }

  const evaluations = exercises.map((ex) =>
    evaluateExerciseProgression(
      ex.exerciseName,
      ex.logs,
      goal,
      readinessScore,
      ex.exerciseRole ?? "compound",
      perceivedDifficulty,
      painLevel,
      ex.category,
    )
  );

  // Session-level adaptation signals
  const toHardCount = evaluations.filter((e) => e.status === "regress" || e.status === "review").length;
  const progressCount = evaluations.filter((e) => e.status === "progress").length;
  const total = evaluations.length;

  const shouldReduceVolume = perceivedDifficulty === "too_hard" || toHardCount >= Math.ceil(total * 0.4);
  const shouldProgress = perceivedDifficulty === "too_easy" || progressCount >= Math.ceil(total * 0.6);

  const adaptationReason = shouldReduceVolume
    ? "Session marked too hard or multiple exercises regressed — consider reducing total volume next session."
    : shouldProgress
    ? "Strong session across the board — ready to advance key lifts."
    : "Balanced session — maintain current volume and intensity.";

  // Deload signal: severe pain or pain + too hard
  const deloadRecommended = painLevel === "severe" || (painLevel === "significant" && perceivedDifficulty === "too_hard");
  const deloadReason = deloadRecommended
    ? painLevel === "severe"
      ? "Severe pain reported — immediate deload and medical review recommended."
      : "Significant discomfort combined with a too-hard session — a deload week is advised."
    : null;

  return {
    exercises: evaluations,
    sessionAdaptation: { shouldReduceVolume, shouldProgress, reason: adaptationReason },
    deloadRecommended,
    deloadReason,
  };
}

// ─── Progression change summary (for change log display) ──────────────────────

export function buildProgressionChangeSummary(evaluation: ExerciseEvaluation): string {
  const { exerciseName, status, recommendation, progressionType } = evaluation;
  const { targetLoad, targetReps, loadChange, repsChange, unit } = recommendation;

  if (status === "review") {
    return `⚑ ${exerciseName} — flagged for review (pain/discomfort reported)`;
  }

  if (status === "regress") {
    if (loadChange !== null && loadChange < 0) {
      return `${exerciseName}: ${(targetLoad ?? 0) - loadChange} ${unit} → ${targetLoad} ${unit} (reduced)`;
    }
    if (repsChange !== null && repsChange < 0) {
      return `${exerciseName}: reduce reps to ${targetReps} (recovery needed)`;
    }
    return `${exerciseName}: reduce load — recovery session needed`;
  }

  if (status === "progress") {
    if (progressionType === "load_based" && loadChange !== null && loadChange > 0) {
      return `${exerciseName}: ${(targetLoad ?? 0) - loadChange} ${unit} → ${targetLoad} ${unit}`;
    }
    if (progressionType === "reps_based" && repsChange !== null && repsChange > 0) {
      return `${exerciseName}: ${(targetReps ?? 0) - repsChange} reps → ${targetReps} reps`;
    }
    if (progressionType === "distance_quality" && loadChange !== null && loadChange > 0) {
      return `${exerciseName}: push for ${targetLoad} ft (up from ${(targetLoad ?? 0) - loadChange} ft)`;
    }
    if (progressionType === "height_quality" && loadChange !== null && loadChange > 0) {
      return `${exerciseName}: target ${targetLoad} in height (up from ${(targetLoad ?? 0) - loadChange} in)`;
    }
    if (progressionType === "duration_based" && loadChange !== null && loadChange > 0) {
      return `${exerciseName}: extend to ${targetLoad} sec (up from ${(targetLoad ?? 0) - loadChange} sec)`;
    }
    if (progressionType === "velocity_reps" && repsChange !== null && repsChange > 0) {
      return `${exerciseName}: add 1 quality rep (→ ${targetReps} reps)`;
    }
    return `${exerciseName}: ready to progress — small increment next session`;
  }

  return `${exerciseName}: maintain current load`;
}

// ─── Deload detection ──────────────────────────────────────────────────────────

export async function detectDeload(userId: number): Promise<DeloadSignal> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const logs = await db
    .select()
    .from(exerciseLogsTable)
    .where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.loggedAt, thirtyDaysAgo)))
    .orderBy(desc(exerciseLogsTable.loggedAt))
    .limit(30);

  if (logs.length < 6) {
    return { shouldDeload: false, reason: null, confidence: 0 };
  }

  const recentTen = logs.slice(0, 10);
  const failOrHard = recentTen.filter(
    (l) => l.completionStatus === "failed" || l.completionStatus === "hard",
  ).length;
  const failedCount = recentTen.filter((l) => l.completionStatus === "failed").length;

  if (failedCount >= 3) {
    return {
      shouldDeload: true,
      reason: `${failedCount} failed sets in the last 10 logged exercises — deload recommended.`,
      confidence: 0.9,
    };
  }

  if (failOrHard >= 6) {
    return {
      shouldDeload: true,
      reason: "High effort and failure rate across recent sessions — accumulated fatigue detected.",
      confidence: 0.75,
    };
  }

  return { shouldDeload: false, reason: null, confidence: 0 };
}

// ─── Bulk targets for a program ───────────────────────────────────────────────

export async function getProgressionTargets(
  userId: number,
  programId: number | null,
  exerciseNames: string[],
  goal: TrainingGoal,
  readinessScore: number | null,
  perceivedDifficulty?: PerceivedDifficulty | null,
  painLevel?: PainLevel | null,
): Promise<Map<string, ProgressionTarget>> {
  const targets = new Map<string, ProgressionTarget>();
  if (exerciseNames.length === 0) return targets;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const allLogs = await db
    .select()
    .from(exerciseLogsTable)
    .where(
      and(
        eq(exerciseLogsTable.userId, userId),
        gte(exerciseLogsTable.loggedAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(exerciseLogsTable.loggedAt))
    .limit(300);

  const logsByName = new Map<string, ExerciseLogEntry[]>();
  for (const log of allLogs) {
    const name = log.exerciseName.toLowerCase();
    if (!logsByName.has(name)) logsByName.set(name, []);
    logsByName.get(name)!.push({
      id: log.id,
      loadUsed: log.loadUsed,
      repsCompleted: log.repsCompleted,
      setsCompleted: log.setsCompleted,
      rpe: log.rpe,
      completionStatus: log.completionStatus as "easy" | "solid" | "hard" | "failed",
      exerciseRole: log.exerciseRole,
      loggedAt: log.loggedAt,
    });
  }

  for (const name of exerciseNames) {
    const history = logsByName.get(name.toLowerCase()) ?? [];
    const role = (history[0]?.exerciseRole ?? "compound") as ExerciseRole;
    const target = computeNextTarget(
      name, history, goal, readinessScore, role,
      perceivedDifficulty, painLevel,
    );
    targets.set(name, target);
  }

  return targets;
}
