/**
 * TrainChat Auto-Progression Engine
 *
 * Determines whether each exercise should progress, hold, or regress
 * based on logged performance, readiness, and training goal.
 *
 * Rules are deterministic, structured, and goal-differentiated:
 *   STRENGTH     → prioritise load increases
 *   HYPERTROPHY  → prioritise reps/volume first, then load
 *   PERFORMANCE  → balance load and quality; never chase fatigue on power
 *
 * Exercise-role modifiers:
 *   power      → increase intent language only; never increase reps/load blindly
 *   compound   → small load increments (5 lbs); respect fatigue
 *   unilateral → 2.5-lb increments or tempo control
 *   accessory  → lowest-priority; 1-rep or 2.5-lb increases
 *   prep/trunk → progress control, not load
 */

import { db, exerciseLogsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressionState = "ready_to_progress" | "hold" | "regress";
export type ExerciseRole = "power" | "compound" | "unilateral" | "accessory" | "prep" | "trunk";
export type TrainingGoal = "strength" | "hypertrophy" | "performance" | "fat_loss" | "general_fitness" | "athletic_performance" | "sport_performance";

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
  progressionState: ProgressionState;
  targetLoad: number | null;
  targetReps: number | null;
  lastLoad: number | null;
  lastReps: number | null;
  reasoning: string;
  coachNote: string;
}

export interface DeloadSignal {
  shouldDeload: boolean;
  reason: string | null;
  confidence: number;
}

// ─── State computation ────────────────────────────────────────────────────────

/**
 * Compute progression state from the most recent 1-3 logs.
 * Recency-weighted: last session carries most weight.
 */
export function computeProgressionState(
  history: ExerciseLogEntry[],
  readinessScore: number | null,
): ProgressionState {
  if (history.length === 0) return "hold";

  const recent = history.slice(0, 3);
  const last = recent[0];

  if (last.completionStatus === "failed") return "regress";

  const hardCount = recent.filter((l) => l.completionStatus === "hard").length;
  const failCount = recent.filter((l) => l.completionStatus === "failed").length;
  const easyCount = recent.filter((l) => l.completionStatus === "easy").length;
  const solidCount = recent.filter((l) => l.completionStatus === "solid").length;

  if (failCount >= 1 || hardCount >= 2) return "regress";

  const lowReadiness = readinessScore !== null && readinessScore < 2.5;
  if (lowReadiness) return "hold";

  if (easyCount >= 2) return "ready_to_progress";
  if (solidCount >= 2 && hardCount === 0 && failCount === 0) return "ready_to_progress";
  if (last.completionStatus === "easy" && recent.length === 1) return "ready_to_progress";

  if (last.completionStatus === "hard") return "hold";
  return "hold";
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

// ─── Next target computation ──────────────────────────────────────────────────

export function computeNextTarget(
  exerciseName: string,
  history: ExerciseLogEntry[],
  goal: TrainingGoal,
  readinessScore: number | null,
  exerciseRole: ExerciseRole = "compound",
): ProgressionTarget {
  const state = computeProgressionState(history, readinessScore);

  const last = history[0] ?? null;
  const lastLoad = last?.loadUsed ?? null;
  const lastReps = last?.repsCompleted ?? null;

  if (history.length === 0) {
    return {
      exerciseName,
      progressionState: "hold",
      targetLoad: null,
      targetReps: null,
      lastLoad: null,
      lastReps: null,
      reasoning: "No previous performance data — log this session to start tracking.",
      coachNote: "First session. Focus on technique and establish your baseline.",
    };
  }

  if (state === "regress") {
    const targetLoad = lastLoad !== null ? Math.round((lastLoad * 0.9) / 2.5) * 2.5 : null;
    return {
      exerciseName,
      progressionState: "regress",
      targetLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: last.completionStatus === "failed"
        ? "Last set was a miss. Pulling back 10% to rebuild confidence and technique."
        : "Two hard sessions in a row. Slight reduction to reset fatigue.",
      coachNote: "Reduce load and focus on clean execution. Accumulate quality reps.",
    };
  }

  if (state === "hold") {
    return {
      exerciseName,
      progressionState: "hold",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: last.completionStatus === "hard"
        ? "High effort last session. Hold load and reps — let the adaptation catch up."
        : readinessScore !== null && readinessScore < 2.5
        ? "Low readiness today. Maintain last session's load — don't push when the tank is low."
        : "Consistent effort. Hold load and hit the same reps with better quality.",
      coachNote: "Same load, same reps. Own the weight before adding more.",
    };
  }

  if (exerciseRole === "power") {
    return {
      exerciseName,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: "Power work progresses through quality and intent — not more load or reps. Move with maximum intent every rep.",
      coachNote: "Fastest possible execution. Every rep is max-effort.",
    };
  }

  if (exerciseRole === "prep" || exerciseRole === "trunk") {
    return {
      exerciseName,
      progressionState: "ready_to_progress",
      targetLoad: lastLoad,
      targetReps: lastReps,
      lastLoad,
      lastReps,
      reasoning: "Progressing prep/trunk work through control and tempo, not load.",
      coachNote: "Add 2 seconds of control on the eccentric or isometric hold.",
    };
  }

  let targetLoad = lastLoad;
  let targetReps = lastReps;
  let reasoning = "";
  let coachNote = "";

  const loadInc = lastLoad !== null ? loadIncrementForRole(exerciseRole, lastLoad) : 0;
  const repInc = repIncrementForRole(exerciseRole);

  if (goal === "strength") {
    if (lastLoad !== null && loadInc > 0) {
      targetLoad = lastLoad + loadInc;
      reasoning = `Last session: ${lastLoad} lbs — adding ${loadInc} lbs. Strength requires consistent load progression.`;
      coachNote = `Target: ${targetLoad} lbs × ${lastReps ?? "same"} reps. Load is the priority.`;
    } else {
      reasoning = "No load recorded. Add weight today and log it.";
      coachNote = "Add load based on feel — then we can track it from here.";
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
      reasoning = `Performance goal: adding small load increment (${loadInc} lbs) while keeping movement quality high.`;
      coachNote = `${targetLoad} lbs × ${lastReps ?? "same"} reps. Stay athletic — no grinding.`;
    }
  }

  if (!reasoning) {
    reasoning = "Ready to progress — add small load increment.";
    coachNote = "Small step. Consistency over time compounds.";
  }

  return {
    exerciseName,
    progressionState: "ready_to_progress",
    targetLoad,
    targetReps,
    lastLoad,
    lastReps,
    reasoning,
    coachNote,
  };
}

// ─── Deload detection ─────────────────────────────────────────────────────────

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
    const target = computeNextTarget(name, history, goal, readinessScore, role);
    targets.set(name, target);
  }

  return targets;
}
