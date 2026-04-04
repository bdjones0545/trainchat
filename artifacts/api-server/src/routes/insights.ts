import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { generateInsights } from "../lib/insights";
import { listMemories } from "../lib/memory";

const router: IRouter = Router();

router.get("/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);
  const insights = await generateInsights(userId, memories);
  res.json(insights);
});

export default router;
