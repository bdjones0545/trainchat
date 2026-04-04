/**
 * Training System Edit Routes — Phase 2
 *
 * POST /training-system/edit
 *   Accepts a natural language modification request.
 *   Orchestrates: interpret → plan → apply → respond with updated data.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan } from "../lib/edit-engine";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
} from "../lib/training-system-service";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EditRequestBody = z.object({
  request: z.string().min(1).max(1000),
});

// ─── POST /training-system/edit ───────────────────────────────────────────────
router.post("/training-system/edit", requireAuth, async (req, res): Promise<void> => {
  const parsed = EditRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. 'request' field required." });
    return;
  }

  const userId = req.session.userId!;
  const userRequest = parsed.data.request;

  try {
    // 1. Load active training system
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found. Initialize your system first." });
      return;
    }

    // 2. Load full system with hierarchy (needed for AI context)
    const fullSystem = await getFullTrainingSystem(activeSystem.id);
    if (!fullSystem) {
      res.status(500).json({ error: "Failed to load training system data." });
      return;
    }

    // 3. Interpret the edit request into a structured plan
    const editPlan = await interpretEditRequest(userRequest, fullSystem);

    logger.info(
      { userId, intent: editPlan.intent, scope: editPlan.scope, changesCount: editPlan.changes.length },
      "Edit plan ready — applying"
    );

    // 4. Apply the edit plan to the database
    const editResult = await applyEditPlan(editPlan);

    // 5. Reload affected data to return fresh state
    const [today, week, block] = await Promise.all([
      getTodaySession(userId).catch(() => null),
      getCurrentWeek(userId).catch(() => null),
      getBlockSummary(userId).catch(() => null),
    ]);

    res.json({
      intent: editPlan.intent,
      scope: editPlan.scope,
      changeSummary: editResult.changeSummary,
      appliedCount: editResult.appliedCount,
      skippedCount: editResult.skippedCount,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, userRequest }, "Training system edit failed");
    res.status(500).json({ error: "Failed to process edit request." });
  }
});

export default router;
