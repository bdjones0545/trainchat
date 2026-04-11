import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { generatePredictions } from "../lib/prediction-service";

const router: IRouter = Router();

/**
 * GET /api/predictions
 * Returns 0-3 active prediction signals for the current user.
 * Computed in real-time from readiness, session, and exercise data.
 * No DB writes — read-only.
 */
router.get("/predictions", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const result = await generatePredictions(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate predictions" });
  }
});

export default router;
