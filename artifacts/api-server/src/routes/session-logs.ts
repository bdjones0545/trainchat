import { Router, type IRouter } from "express";
import { db, sessionLogsTable, sessionFeedbackTable, systemChangeLog, trainingSystems, exerciseLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { evaluateWorkoutCompletion } from "../lib/workout-evaluation";
import { getProgressionTargets } from "../lib/progression";

const router: IRouter = Router();

const CreateSessionLogBody = z.object({
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
  sessionType: z.string().default("workout"),
  completedAt: z.string().optional(),

  // Completion metadata
  sessionStatus: z.enum(["completed", "partial", "skipped", "rescheduled"]).default("completed"),
  actualDuration: z.number().optional(),

  // Scores (1-5)
  difficultyScore: z.number().min(1).max(5).optional(),
  painScore: z.number().min(1).max(5).optional(),
  energyScore: z.number().min(1).max(5).optional(),
  enjoymentScore: z.number().min(1).max(5).optional(),

  // Body areas with discomfort
  painAreas: z.array(z.string()).optional(),

  notes: z.string().optional(),
});

// ── Response profile / summary ────────────────────────────────────────────────
// Returns aggregated training behavior data (UserTrainingResponseProfile).
router.get("/session-logs/summary", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const logs = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.userId, userId))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(30);

  if (logs.length === 0) {
    res.json({ totalSessions: 0, message: "No sessions logged yet." });
    return;
  }

  const total = logs.length;
  const completed = logs.filter((l) => l.sessionStatus === "completed").length;
  const partial = logs.filter((l) => l.sessionStatus === "partial").length;
  const skipped = logs.filter((l) => l.sessionStatus === "skipped").length;
  const completionRate = Math.round((completed / total) * 100);

  const withDiff = logs.filter((l) => l.difficultyScore != null);
  const withPain = logs.filter((l) => l.painScore != null);
  const withEnergy = logs.filter((l) => l.energyScore != null);
  const withEnjoy = logs.filter((l) => l.enjoymentScore != null);
  const withDuration = logs.filter((l) => l.actualDuration != null);

  function average(vals: number[]): number | null {
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const avgDifficulty = average(withDiff.map((l) => l.difficultyScore!));
  const avgPain = average(withPain.map((l) => l.painScore!));
  const avgEnergy = average(withEnergy.map((l) => l.energyScore!));
  const avgEnjoyment = average(withEnjoy.map((l) => l.enjoymentScore!));
  const avgActualDuration = average(withDuration.map((l) => l.actualDuration!));

  // Tally pain area frequency
  const areaCount: Record<string, number> = {};
  for (const log of logs) {
    if ((log.painScore ?? 0) >= 3 && log.painAreas) {
      for (const area of (log.painAreas as string[])) {
        areaCount[area] = (areaCount[area] ?? 0) + 1;
      }
    }
  }
  const frequentPainAreas = Object.entries(areaCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([area, count]) => ({ area, count }));

  res.json({
    totalSessions: total,
    completed,
    partial,
    skipped,
    completionRate,
    avgDifficulty,
    avgPain,
    avgEnergy,
    avgEnjoyment,
    avgActualDuration,
    frequentPainAreas,
    updatedAt: new Date().toISOString(),
  });
});

router.get("/session-logs", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const logs = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.userId, userId))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(50);

  res.json(
    logs.map((l) => ({
      id: l.id,
      savedProgramId: l.savedProgramId,
      dayNumber: l.dayNumber,
      sessionType: l.sessionType,
      completedAt: l.completedAt.toISOString(),
      sessionStatus: l.sessionStatus,
      difficultyScore: l.difficultyScore,
      painScore: l.painScore,
      energyScore: l.energyScore,
      enjoymentScore: l.enjoymentScore,
      actualDuration: l.actualDuration,
      painAreas: l.painAreas,
      notes: l.notes,
    }))
  );
});

router.post("/session-logs", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateSessionLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const data = parsed.data;

  // ── Save workout completion ───────────────────────────────────────────────
  const [log] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
      dayNumber: data.dayNumber ?? null,
      sessionType: data.sessionType,
      completedAt: data.completedAt ? new Date(data.completedAt) : new Date(),
      sessionStatus: data.sessionStatus,
      difficultyScore: data.difficultyScore ?? null,
      painScore: data.painScore ?? null,
      energyScore: data.energyScore ?? null,
      enjoymentScore: data.enjoymentScore ?? null,
      actualDuration: data.actualDuration ?? null,
      painAreas: data.painAreas ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  // ── Mirror to session_feedback for adaptation engine ─────────────────────
  // The adaptation engine reads from session_feedback to compute training tolerance.
  // When a session has full feedback, mirror the key scores there too.
  if (
    data.sessionStatus !== "skipped" &&
    data.difficultyScore != null &&
    data.painScore != null &&
    data.energyScore != null
  ) {
    try {
      await db.insert(sessionFeedbackTable).values({
        userId,
        savedProgramId: data.savedProgramId ?? null,
        difficultyScore: Math.round(data.difficultyScore),
        painResponseScore: Math.round(data.painScore),
        energyResponseScore: Math.round(data.energyScore),
        notes: data.notes ?? null,
      });
    } catch {
      // Non-fatal — session log already saved
    }
  }

  // ── Run evaluation and build session recap ────────────────────────────────
  const recap = evaluateWorkoutCompletion({
    sessionStatus: data.sessionStatus,
    difficultyScore: data.difficultyScore,
    painScore: data.painScore,
    energyScore: data.energyScore,
    enjoymentScore: data.enjoymentScore,
    actualDuration: data.actualDuration,
    painAreas: data.painAreas,
    notes: data.notes,
  });

  // ── Write change log note for significant flags ───────────────────────────
  // Non-fatal: if no active system, skip.
  const significantFlags = recap.flags.filter((f) => f.type === "pain_trigger" || f.type === "overload");
  if (significantFlags.length > 0) {
    try {
      const activeSystem = await db
        .select({ id: trainingSystems.id })
        .from(trainingSystems)
        .where(eq(trainingSystems.userId, userId))
        .orderBy(desc(trainingSystems.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (activeSystem) {
        const changeSummary = significantFlags
          .map((f) => f.detail)
          .join("; ");
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystem.id,
          source: "workout_feedback",
          intent: "session_signal",
          scope: "session",
          changeSummary: `Workout feedback signal: ${changeSummary}`,
          isMajorVersion: false,
        });
      }
    } catch {
      // Non-fatal — recap already built
    }
  }

  res.status(201).json({
    id: log.id,
    savedProgramId: log.savedProgramId,
    dayNumber: log.dayNumber,
    sessionStatus: log.sessionStatus,
    completedAt: log.completedAt.toISOString(),
    recap,
  });
});

// ── POST /api/session-logs/complete — save a full session + run progression ────

const CompleteSessionBody = z.object({
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
  goal: z.string().default("general_fitness"),
  perceivedDifficulty: z.enum(["too_easy", "just_right", "too_hard"]).optional(),
  notes: z.string().optional(),
  exercises: z.array(
    z.object({
      exerciseName: z.string().min(1).max(200),
      exerciseRole: z.enum(["power", "compound", "unilateral", "accessory", "prep", "trunk"]).optional(),
      sets: z.array(
        z.object({
          setNumber: z.number(),
          weight: z.number().min(0).max(2000).nullable(),
          reps: z.number().min(0).max(200).nullable(),
          completed: z.boolean(),
        })
      ),
    })
  ),
});

router.post("/session-logs/complete", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CompleteSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const data = parsed.data;
  const now = new Date();

  // ── 1. Insert exercise_logs for all completed sets ─────────────────────────
  const exerciseInserts: Promise<any>[] = [];

  for (const ex of data.exercises) {
    const completedSets = ex.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;

    for (const set of completedSets) {
      exerciseInserts.push(
        db.insert(exerciseLogsTable).values({
          userId,
          exerciseName: ex.exerciseName,
          programId: data.savedProgramId ?? null,
          dayNumber: data.dayNumber ?? null,
          orderIndex: set.setNumber - 1,
          loadUsed: set.weight,
          repsCompleted: set.reps,
          setsCompleted: 1,
          completionStatus: "solid",
          exerciseRole: ex.exerciseRole ?? null,
        })
      );
    }
  }

  await Promise.all(exerciseInserts);

  // ── 2. Create session_log entry ────────────────────────────────────────────
  const difficultyScore =
    data.perceivedDifficulty === "too_easy" ? 2 :
    data.perceivedDifficulty === "too_hard" ? 4 :
    data.perceivedDifficulty === "just_right" ? 3 :
    null;

  const [sessionLog] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
      dayNumber: data.dayNumber ?? null,
      sessionType: "workout",
      completedAt: now,
      sessionStatus: "completed",
      difficultyScore,
      notes: data.notes ?? null,
    })
    .returning();

  // ── 3. Run progression analysis ────────────────────────────────────────────
  const exerciseNames = data.exercises.map((e) => e.exerciseName);
  const goal = data.goal as any;

  let targets: Awaited<ReturnType<typeof getProgressionTargets>> | null = null;
  try {
    targets = await getProgressionTargets(userId, data.savedProgramId ?? null, exerciseNames, goal, null);
  } catch {
    // Non-fatal — return session log without progression
  }

  // ── 4. Write progression changes to system_change_log ──────────────────────
  const progressions: string[] = [];

  if (targets) {
    let activeSystemId: number | null = null;
    try {
      const activeSystem = await db
        .select({ id: trainingSystems.id })
        .from(trainingSystems)
        .where(eq(trainingSystems.userId, userId))
        .orderBy(desc(trainingSystems.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      activeSystemId = activeSystem?.id ?? null;
    } catch {
      // Non-fatal
    }

    for (const [exerciseName, target] of targets.entries()) {
      // Only log exercises that were actually logged this session
      const sessionEx = data.exercises.find(
        (e) => e.exerciseName.toLowerCase() === exerciseName.toLowerCase()
      );
      if (!sessionEx || sessionEx.sets.filter((s) => s.completed).length === 0) continue;

      if (target.progressionState === "ready_to_progress") {
        let msg = "";
        if (target.targetLoad !== null && target.lastLoad !== null && target.targetLoad !== target.lastLoad) {
          msg = `${exerciseName}: ${target.lastLoad} lbs → ${target.targetLoad} lbs next session`;
        } else if (target.targetReps !== null && target.lastReps !== null && target.targetReps !== target.lastReps) {
          msg = `${exerciseName}: ${target.lastReps} reps → ${target.targetReps} reps next session`;
        } else if (target.lastLoad !== null) {
          msg = `${exerciseName}: ready to progress — add a small load increment`;
        }

        if (msg) {
          progressions.push(msg);

          if (activeSystemId) {
            try {
              await db.insert(systemChangeLog).values({
                userId,
                trainingSystemId: activeSystemId,
                source: "workout_feedback",
                intent: "auto_progression",
                scope: "exercise",
                changeSummary: `Auto-progression: ${msg}`,
                isMajorVersion: false,
                decisionMetadata: {
                  exerciseName,
                  lastLoad: target.lastLoad,
                  targetLoad: target.targetLoad,
                  lastReps: target.lastReps,
                  targetReps: target.targetReps,
                  progressionState: target.progressionState,
                  reasoning: target.reasoning,
                },
              });
            } catch {
              // Non-fatal
            }
          }
        }
      } else if (target.progressionState === "regress") {
        const msg = target.targetLoad !== null
          ? `${exerciseName}: reduce to ${target.targetLoad} lbs (recovery needed)`
          : `${exerciseName}: reduce load — recovery needed`;
        progressions.push(msg);

        if (activeSystemId) {
          try {
            await db.insert(systemChangeLog).values({
              userId,
              trainingSystemId: activeSystemId,
              source: "workout_feedback",
              intent: "load_reduction",
              scope: "exercise",
              changeSummary: `Load reduction signal: ${msg}`,
              isMajorVersion: false,
              decisionMetadata: {
                exerciseName,
                lastLoad: target.lastLoad,
                targetLoad: target.targetLoad,
                progressionState: target.progressionState,
                reasoning: target.reasoning,
              },
            });
          } catch {
            // Non-fatal
          }
        }
      }
    }
  }

  res.status(201).json({
    sessionLogId: sessionLog.id,
    completedAt: sessionLog.completedAt.toISOString(),
    progressions,
    exercisesLogged: data.exercises.filter(
      (e) => e.sets.some((s) => s.completed)
    ).length,
  });
});

export default router;
