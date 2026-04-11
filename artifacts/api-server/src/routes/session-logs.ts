import { Router, type IRouter } from "express";
import { db, sessionLogsTable, sessionFeedbackTable, systemChangeLog, trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { evaluateWorkoutCompletion } from "../lib/workout-evaluation";

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

export default router;
