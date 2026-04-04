import { Router, type IRouter } from "express";
import { db, sessionFeedbackTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/session-feedback", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { savedProgramId, difficultyScore, painResponseScore, energyResponseScore, notes } = req.body;

  if (difficultyScore === undefined || painResponseScore === undefined || energyResponseScore === undefined) {
    res.status(400).json({ error: "difficultyScore, painResponseScore, and energyResponseScore are required" });
    return;
  }

  const scores = [difficultyScore, painResponseScore, energyResponseScore];
  if (scores.some((s) => typeof s !== "number" || s < 1 || s > 5)) {
    res.status(400).json({ error: "All scores must be integers between 1 and 5" });
    return;
  }

  try {
    const [entry] = await db
      .insert(sessionFeedbackTable)
      .values({
        userId,
        savedProgramId: savedProgramId ?? null,
        difficultyScore,
        painResponseScore,
        energyResponseScore,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({ ...entry, createdAt: entry.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Failed to save session feedback");
    res.status(500).json({ error: "Failed to save session feedback" });
  }
});

router.get("/session-feedback", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const entries = await db
      .select()
      .from(sessionFeedbackTable)
      .where(eq(sessionFeedbackTable.userId, userId))
      .orderBy(desc(sessionFeedbackTable.createdAt))
      .limit(10);

    res.json(entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "Failed to fetch session feedback");
    res.status(500).json({ error: "Failed to fetch session feedback" });
  }
});

export default router;
