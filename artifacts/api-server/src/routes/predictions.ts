import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { generatePredictions } from "../lib/prediction-service";

const router: IRouter = Router();

/**
 * GET /api/predictions
 *
 * Returns a structured forecast response for the current user.
 * Response shape is gated by forecast eligibility:
 *
 *   status: "no_data"    → user has no completed workouts and no check-ins
 *   status: "warming_up" → user has some data but not enough for confident forecasts
 *   status: "active"     → user has enough real data — predictions array is populated
 *
 * The backend enforces eligibility — even if the frontend requests predictions,
 * forecastItems will be empty until the user reaches the active threshold.
 * No DB writes — read-only.
 */
router.get("/predictions", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const result = await generatePredictions(userId);
    res.json(result);
  } catch (err) {
    console.error("[Predictions] Failed to generate predictions:", err);
    res.status(500).json({
      status: "no_data",
      confidence: "none",
      message: "Unable to generate forecast right now.",
      predictions: [],
      generatedAt: new Date(),
    });
  }
});

export default router;
