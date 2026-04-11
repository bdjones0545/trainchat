import { Router, type IRouter } from "express";
import { db, exerciseLogsTable, savedProgramsTable, sessionLogsTable, trainingSystems, systemChangeLog } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { getProgressionTargets, detectDeload } from "../lib/progression";

const router: IRouter = Router();

const CreateExerciseLogBody = z.object({
  exerciseName: z.string().min(1).max(200),
  programId: z.number().optional(),
  dayNumber: z.number().optional(),
  orderIndex: z.number().optional(),

  loadUsed: z.number().min(0).max(2000).optional(),
  repsCompleted: z.number().min(0).max(200).optional(),
  setsCompleted: z.number().min(0).max(20).optional(),
  rpe: z.number().min(1).max(10).optional(),

  completionStatus: z.enum(["easy", "solid", "hard", "failed"]).default("solid"),
  exerciseRole: z
    .enum(["power", "compound", "unilateral", "accessory", "prep", "trunk"])
    .optional(),
});

// ── POST /api/exercise-logs — log exercise performance ────────────────────────

router.post("/exercise-logs", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateExerciseLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const data = parsed.data;

  const [log] = await db
    .insert(exerciseLogsTable)
    .values({
      userId,
      exerciseName: data.exerciseName,
      programId: data.programId ?? null,
      dayNumber: data.dayNumber ?? null,
      orderIndex: data.orderIndex ?? null,
      loadUsed: data.loadUsed ?? null,
      repsCompleted: data.repsCompleted ?? null,
      setsCompleted: data.setsCompleted ?? null,
      rpe: data.rpe ?? null,
      completionStatus: data.completionStatus,
      exerciseRole: data.exerciseRole ?? null,
    })
    .returning();

  // Check for deload signal after each log — non-fatal
  try {
    const signal = await detectDeload(userId);
    if (signal.shouldDeload) {
      const activeSystem = await db
        .select({ id: trainingSystems.id })
        .from(trainingSystems)
        .where(eq(trainingSystems.userId, userId))
        .orderBy(desc(trainingSystems.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (activeSystem) {
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystem.id,
          source: "workout_feedback",
          intent: "deload_signal",
          scope: "block",
          changeSummary: `Auto-progression deload signal: ${signal.reason}`,
          isMajorVersion: false,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  res.status(201).json({
    id: log.id,
    exerciseName: log.exerciseName,
    completionStatus: log.completionStatus,
    loggedAt: log.loggedAt.toISOString(),
  });
});

// ── GET /api/exercise-logs/targets — progression targets for a program ─────────
// Query params: exerciseNames (comma-separated), programId (optional), goal (optional)

router.get("/exercise-logs/targets", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const { exerciseNames: rawNames, programId: rawProgramId, goal: rawGoal } = req.query as Record<string, string>;

  if (!rawNames) {
    res.status(400).json({ error: "exerciseNames query param required" });
    return;
  }

  const exerciseNames = rawNames
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 40);

  const programId = rawProgramId ? parseInt(rawProgramId, 10) : null;
  const goal = (rawGoal as any) || "general_fitness";

  // Pull most recent readiness score (last 24h)
  let readinessScore: number | null = null;
  try {
    const { readinessEntriesTable } = await import("@workspace/db");
    const oneDayAgo = new Date(Date.now() - 86400000);
    const entries = await db
      .select({ readinessScore: readinessEntriesTable.readinessScore })
      .from(readinessEntriesTable)
      .where(
        and(
          eq(readinessEntriesTable.userId, userId),
          gte(readinessEntriesTable.createdAt, oneDayAgo),
        ),
      )
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(1);
    readinessScore = entries[0]?.readinessScore ?? null;
  } catch {
    // Non-fatal — proceed without readiness
  }

  const targets = await getProgressionTargets(userId, programId, exerciseNames, goal, readinessScore);

  const payload = Array.from(targets.values()).map((t) => ({
    exerciseName: t.exerciseName,
    progressionState: t.progressionState,
    targetLoad: t.targetLoad,
    targetReps: t.targetReps,
    lastLoad: t.lastLoad,
    lastReps: t.lastReps,
    reasoning: t.reasoning,
    coachNote: t.coachNote,
  }));

  res.json({ targets: payload, readinessScore });
});

// ── GET /api/exercise-logs/history/:exerciseName — per-exercise history ────────

router.get("/exercise-logs/history/:exerciseName", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const { exerciseName } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) || "10", 10), 30);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const logs = await db
    .select()
    .from(exerciseLogsTable)
    .where(
      and(
        eq(exerciseLogsTable.userId, userId),
        gte(exerciseLogsTable.loggedAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(exerciseLogsTable.loggedAt))
    .limit(200);

  const filtered = logs
    .filter((l) => l.exerciseName.toLowerCase() === exerciseName.toLowerCase())
    .slice(0, limit);

  res.json(
    filtered.map((l) => ({
      id: l.id,
      exerciseName: l.exerciseName,
      loadUsed: l.loadUsed,
      repsCompleted: l.repsCompleted,
      setsCompleted: l.setsCompleted,
      rpe: l.rpe,
      completionStatus: l.completionStatus,
      exerciseRole: l.exerciseRole,
      loggedAt: l.loggedAt.toISOString(),
    })),
  );
});

// ── GET /api/exercise-logs — recent user logs ─────────────────────────────────

router.get("/exercise-logs", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 100);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const logs = await db
    .select()
    .from(exerciseLogsTable)
    .where(
      and(
        eq(exerciseLogsTable.userId, userId),
        gte(exerciseLogsTable.loggedAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(exerciseLogsTable.loggedAt))
    .limit(limit);

  res.json(
    logs.map((l) => ({
      id: l.id,
      exerciseName: l.exerciseName,
      programId: l.programId,
      dayNumber: l.dayNumber,
      loadUsed: l.loadUsed,
      repsCompleted: l.repsCompleted,
      setsCompleted: l.setsCompleted,
      rpe: l.rpe,
      completionStatus: l.completionStatus,
      exerciseRole: l.exerciseRole,
      loggedAt: l.loggedAt.toISOString(),
    })),
  );
});

export default router;
