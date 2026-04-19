/**
 * Block Projection Engine — Predictive Adaptation
 *
 * Analyzes recent session performance (last 4-14 sessions) and projects
 * forward adjustments to UPCOMING training weeks within the current block.
 *
 * Called fire-and-forget after session log when enough data exists.
 * Small adjustments = silent. Large adjustments = coaching note injected.
 *
 * Priority:
 *   high fatigue / pain     → delay intensification, reduce sets
 *   low adherence           → simplify volume
 *   consistently easy       → accelerate progression curve
 *   baseline                → maintain as planned
 */

import {
  db,
  sessionLogsTable,
  trainingSystems,
  trainingWeeks,
  trainingSessions,
  sessionExercises,
} from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BlockProjection {
  avgDifficulty: number;
  painFrequency: number;
  adherenceRate: number;
  fatigueTrend: "high" | "moderate" | "low";
  progressionCurve: "accelerate" | "maintain" | "delay_intensification" | "simplify";
  weekModifications: WeekModification[];
  adaptationNote: string | null;
}

interface WeekModification {
  weekNumber: number;
  volumeAdjustment: "reduce" | "maintain" | "increase" | null;
  intensityAdjustment: "reduce" | "maintain" | "increase" | null;
  reason: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function avgArr(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeFatigueTrend(
  logs: { difficultyScore: number | null; energyScore: number | null }[]
): "high" | "moderate" | "low" {
  if (logs.length === 0) return "low";
  const scores = logs.map((l) => ((l.difficultyScore ?? 3) + (6 - (l.energyScore ?? 3))) / 2);
  const avg = avgArr(scores);
  return avg >= 4.2 ? "high" : avg >= 3.2 ? "moderate" : "low";
}

export function getAdaptationVisibilityLevel(
  mods: WeekModification[]
): "silent" | "subtle" | "visible" {
  if (mods.length === 0) return "silent";
  const hasReduce = mods.some(
    (m) => m.volumeAdjustment === "reduce" || m.intensityAdjustment === "reduce"
  );
  if (hasReduce && mods.length >= 2) return "visible";
  return "subtle";
}

function buildSessionCoachNote(mod: WeekModification, curve: BlockProjection["progressionCurve"]): string {
  if (mod.intensityAdjustment === "reduce" && mod.volumeAdjustment === "reduce") {
    return "Volume and intensity have been adjusted this week based on your recent session data — focus on quality movement and let your body recover its capacity.";
  }
  if (mod.intensityAdjustment === "reduce") {
    return "Intensity targets are slightly reduced this week based on recent fatigue signals — same structure, more sustainable loading.";
  }
  if (mod.volumeAdjustment === "reduce") {
    return "Volume trimmed slightly this week to support consistency — prioritize showing up over maximum effort.";
  }
  if (curve === "accelerate") {
    return "You've been handling the load well — this week has been bumped up slightly to match where you actually are.";
  }
  return mod.reason;
}

// ─── Core functions ────────────────────────────────────────────────────────

export async function buildBlockProjection(userId: number): Promise<BlockProjection | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const logs = await db
    .select({
      sessionStatus: sessionLogsTable.sessionStatus,
      difficultyScore: sessionLogsTable.difficultyScore,
      painScore: sessionLogsTable.painScore,
      energyScore: sessionLogsTable.energyScore,
    })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, cutoff)))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(14);

  if (logs.length < 4) return null;

  const completed = logs.filter((l) => l.sessionStatus !== "skipped");
  const avgDifficulty = completed.length > 0
    ? avgArr(completed.map((l) => l.difficultyScore ?? 3))
    : 3;
  const painFrequency = completed.length > 0
    ? completed.filter((l) => (l.painScore ?? 0) >= 3).length / completed.length
    : 0;
  const adherenceRate = logs.length > 0 ? completed.length / logs.length : 1;
  const fatigueTrend = computeFatigueTrend(completed);

  let progressionCurve: BlockProjection["progressionCurve"] = "maintain";
  if (adherenceRate < 0.65 && logs.length >= 5) {
    progressionCurve = "simplify";
  } else if (avgDifficulty >= 4.2 || fatigueTrend === "high" || painFrequency >= 0.4) {
    progressionCurve = "delay_intensification";
  } else if (
    avgDifficulty <= 2.3 &&
    adherenceRate >= 0.85 &&
    fatigueTrend === "low" &&
    completed.length >= 4
  ) {
    progressionCurve = "accelerate";
  }

  const weekModifications: WeekModification[] = [];

  if (progressionCurve === "delay_intensification") {
    weekModifications.push({
      weekNumber: 3,
      volumeAdjustment: "maintain",
      intensityAdjustment: "reduce",
      reason: "Accumulated fatigue signals — holding intensity conservative to protect progression capacity",
    });
  } else if (progressionCurve === "simplify") {
    weekModifications.push({
      weekNumber: 2,
      volumeAdjustment: "reduce",
      intensityAdjustment: "reduce",
      reason: "Adherence below 65% — reducing density to make the schedule more executable",
    });
    weekModifications.push({
      weekNumber: 3,
      volumeAdjustment: "reduce",
      intensityAdjustment: null,
      reason: "Keeping volume manageable to rebuild training habit",
    });
  } else if (progressionCurve === "accelerate") {
    weekModifications.push({
      weekNumber: 2,
      volumeAdjustment: "increase",
      intensityAdjustment: "increase",
      reason: "Consistently below target difficulty — accelerating progression curve",
    });
  }

  // Build the one adaptation note that goes to chat (only most relevant signal)
  let adaptationNote: string | null = null;
  if (avgDifficulty >= 4.2) {
    adaptationNote = "Based on how your last few sessions felt, I'm slightly pulling back the intensity planned for later in this block — you'll still progress, just at a pace that doesn't compromise recovery.";
  } else if (fatigueTrend === "high") {
    adaptationNote = "Fatigue is building up. I've given the upcoming weeks a bit more breathing room before the next push.";
  } else if (painFrequency >= 0.4) {
    adaptationNote = "With recurring discomfort in your recent sessions, I'm keeping the loading conservative on those patterns for the next couple of weeks.";
  } else if (adherenceRate < 0.65 && logs.length >= 5) {
    adaptationNote = "A few missed sessions in this block — I've trimmed the upcoming weeks slightly so it's easier to stay on track.";
  } else if (progressionCurve === "accelerate") {
    adaptationNote = "You've been handling the workload comfortably — I'm going to push the pace a bit sooner than originally planned.";
  }

  return {
    avgDifficulty,
    painFrequency,
    adherenceRate,
    fatigueTrend,
    progressionCurve,
    weekModifications,
    adaptationNote,
  };
}

export async function applyBlockProjectionToFutureWeeks(
  userId: number,
  projection: BlockProjection
): Promise<{ weeksModified: number; sessionsModified: number; visibility: "silent" | "subtle" | "visible" }> {
  if (projection.weekModifications.length === 0) {
    return { weeksModified: 0, sessionsModified: 0, visibility: "silent" };
  }

  const [system] = await db
    .select({ id: trainingSystems.id, currentPhaseId: trainingSystems.currentPhaseId })
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")))
    .limit(1);

  if (!system?.currentPhaseId) return { weeksModified: 0, sessionsModified: 0, visibility: "silent" };

  const upcomingWeeks = await db
    .select()
    .from(trainingWeeks)
    .where(
      and(
        eq(trainingWeeks.trainingPhaseId, system.currentPhaseId),
        eq(trainingWeeks.status, "upcoming")
      )
    );

  if (upcomingWeeks.length === 0) return { weeksModified: 0, sessionsModified: 0, visibility: "silent" };

  let weeksModified = 0;
  let sessionsModified = 0;

  for (const mod of projection.weekModifications) {
    const week = upcomingWeeks.find((w) => w.weekNumber === mod.weekNumber);
    if (!week) continue;

    // Idempotency: skip if already has projection marker
    if (week.focus?.includes("[proj]")) continue;

    let newVolumeLevel = week.volumeLevel;
    if (mod.volumeAdjustment === "reduce") {
      newVolumeLevel =
        week.volumeLevel === "high" ? "moderate" :
        week.volumeLevel === "moderate" ? "low" :
        week.volumeLevel;
    } else if (mod.volumeAdjustment === "increase" && week.volumeLevel !== "deload") {
      newVolumeLevel =
        week.volumeLevel === "low" ? "moderate" :
        week.volumeLevel === "moderate" ? "high" :
        week.volumeLevel;
    }

    const projTag = "[proj]";
    const newFocus = [
      week.focus?.replace(projTag, "").trim(),
      `${projTag} ${mod.reason}`,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 200);

    await db
      .update(trainingWeeks)
      .set({ volumeLevel: newVolumeLevel, focus: newFocus })
      .where(eq(trainingWeeks.id, week.id));

    weeksModified++;

    const sessions = await db
      .select({ id: trainingSessions.id, coachingNotes: trainingSessions.coachingNotes })
      .from(trainingSessions)
      .where(eq(trainingSessions.trainingWeekId, week.id));

    for (const session of sessions) {
      const coachNote = buildSessionCoachNote(mod, projection.progressionCurve);
      if (!session.coachingNotes?.includes("[proj]")) {
        const merged = session.coachingNotes
          ? `${session.coachingNotes}. [proj] ${coachNote}`
          : `[proj] ${coachNote}`;
        await db
          .update(trainingSessions)
          .set({ coachingNotes: merged.slice(0, 500) })
          .where(eq(trainingSessions.id, session.id));
        sessionsModified++;
      }

      // Reduce sets on primary/power exercises when intensity is being held back
      if (mod.intensityAdjustment === "reduce") {
        const exercises = await db
          .select({
            id: sessionExercises.id,
            sets: sessionExercises.sets,
            notes: sessionExercises.notes,
            category: sessionExercises.category,
          })
          .from(sessionExercises)
          .where(eq(sessionExercises.trainingSessionId, session.id));

        for (const ex of exercises) {
          if (
            (ex.category === "primary" || ex.category === "power") &&
            (ex.sets ?? 3) >= 4
          ) {
            await db
              .update(sessionExercises)
              .set({
                sets: Math.max(2, (ex.sets ?? 4) - 1),
                notes: ex.notes
                  ? `${ex.notes} — load managed`
                  : "Load managed based on recent fatigue signals",
              })
              .where(eq(sessionExercises.id, ex.id));
          }
        }
      }
    }
  }

  const visibility = getAdaptationVisibilityLevel(projection.weekModifications);

  logger.info(
    {
      userId,
      weeksModified,
      sessionsModified,
      progressionCurve: projection.progressionCurve,
      visibility,
    },
    "[BlockProjection] Applied to future weeks"
  );

  return { weeksModified, sessionsModified, visibility };
}
