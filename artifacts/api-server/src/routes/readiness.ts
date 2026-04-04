import { Router, type IRouter } from "express";
import { db, readinessEntriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/readiness", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore, notes } = req.body;

  if (
    sleepScore === undefined || energyScore === undefined || sorenessScore === undefined ||
    stressScore === undefined || motivationScore === undefined || painScore === undefined
  ) {
    res.status(400).json({ error: "All score fields are required" });
    return;
  }

  const scores = [sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore];
  if (scores.some((s) => typeof s !== "number" || s < 1 || s > 5)) {
    res.status(400).json({ error: "All scores must be integers between 1 and 5" });
    return;
  }

  try {
    const [entry] = await db
      .insert(readinessEntriesTable)
      .values({ userId, sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore, notes: notes ?? null })
      .returning();

    res.status(201).json({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to save readiness entry");
    res.status(500).json({ error: "Failed to save readiness entry" });
  }
});

router.get("/readiness", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "7", 10), 30);

  try {
    const entries = await db
      .select()
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(limit);

    res.json(entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "Failed to fetch readiness entries");
    res.status(500).json({ error: "Failed to fetch readiness entries" });
  }
});

export default router;
