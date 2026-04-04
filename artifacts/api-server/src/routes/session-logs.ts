import { Router, type IRouter } from "express";
import { db, sessionLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const CreateSessionLogBody = z.object({
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
  sessionType: z.string().default("workout"),
  completedAt: z.string().optional(),
  difficultyScore: z.number().min(1).max(5).optional(),
  painScore: z.number().min(1).max(5).optional(),
  energyScore: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
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
      difficultyScore: l.difficultyScore,
      painScore: l.painScore,
      energyScore: l.energyScore,
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

  const [log] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
      dayNumber: data.dayNumber ?? null,
      sessionType: data.sessionType,
      completedAt: data.completedAt ? new Date(data.completedAt) : new Date(),
      difficultyScore: data.difficultyScore ?? null,
      painScore: data.painScore ?? null,
      energyScore: data.energyScore ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  res.status(201).json({
    id: log.id,
    savedProgramId: log.savedProgramId,
    dayNumber: log.dayNumber,
    sessionType: log.sessionType,
    completedAt: log.completedAt.toISOString(),
    difficultyScore: log.difficultyScore,
    painScore: log.painScore,
    energyScore: log.energyScore,
    notes: log.notes,
  });
});

export default router;
