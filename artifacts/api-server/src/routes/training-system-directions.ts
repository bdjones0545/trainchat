/**
 * Training System Directions Route — Phase A: Collaborative Decision Layer
 *
 * POST /training-system/directions
 *   Interprets the user's edit intent and returns either:
 *   - 2-4 direction options for the user to choose from
 *   - A signal to skip directions (for highly specific requests)
 *
 * This is called BEFORE /training-system/edit.
 * The user selects a direction → frontend calls /edit with the chosen editRequest.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { generateDirections } from "../lib/directions-service";
import { buildAdaptationContext } from "../lib/adaptation";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
} from "../lib/training-system-service";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TargetContextSchema = z.object({
  type: z.enum(["exercise", "session", "week", "phase"]),
  id: z.number().int().positive(),
  label: z.string().optional(),
  parentLabel: z.string().optional(),
});

const DirectionsRequestBody = z.object({
  request: z.string().min(1).max(2000),
  targetContext: TargetContextSchema.optional(),
});

// ─── POST /training-system/directions ─────────────────────────────────────────
router.post("/training-system/directions", requireAuth, async (req, res): Promise<void> => {
  const parsed = DirectionsRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. 'request' field required." });
    return;
  }

  const userId = req.session.userId!;
  const { request: userRequest, targetContext } = parsed.data;

  try {
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found." });
      return;
    }

    const [fullSystem, adaptationCtx] = await Promise.all([
      getFullTrainingSystem(activeSystem.id),
      buildAdaptationContext(userId).catch(() => null),
    ]);

    if (!fullSystem) {
      res.status(500).json({ error: "Failed to load training system data." });
      return;
    }

    const result = await generateDirections(
      userRequest,
      fullSystem,
      targetContext as any,
      adaptationCtx?.promptContext || undefined
    );

    logger.info(
      {
        userId,
        shouldSkipDirections: result.shouldSkipDirections,
        directionsCount: result.directions?.length ?? 0,
        targetType: targetContext?.type,
      },
      "Directions generated"
    );

    res.json(result);
  } catch (err) {
    logger.error({ err, userId, userRequest }, "Failed to generate directions");
    res.status(500).json({ error: "Failed to generate directions." });
  }
});

export default router;
