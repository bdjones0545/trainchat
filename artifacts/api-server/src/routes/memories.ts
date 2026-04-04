import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { listMemories, syncMemoriesFromData } from "../lib/memory";

const router: IRouter = Router();

router.get("/memories", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);
  res.json(memories.map((m) => ({
    id: m.id,
    userId: m.userId,
    type: m.type,
    subject: m.subject,
    sentiment: m.sentiment,
    confidence: m.confidence,
    source: m.source,
    detail: m.detail,
    updatedAt: m.updatedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/memories/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const synced = await syncMemoriesFromData(userId);
  res.json({ synced });
});

export default router;
