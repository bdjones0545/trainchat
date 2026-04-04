/**
 * Training System Edit Routes — Phase 2 + Phase 3
 *
 * POST /training-system/edit
 *   Accepts a natural language modification request with optional target context.
 *   Orchestrates: interpret → plan → apply → respond with updated data + changedIds.
 *
 * Phase 3: targetContext enables focused, object-level edits from the UI.
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

const TargetContextSchema = z.object({
  type: z.enum(["exercise", "session", "week", "phase"]),
  id: z.number().int().positive(),
  label: z.string().optional(),
  parentLabel: z.string().optional(),
});

const EditRequestBody = z.object({
  request: z.string().min(1).max(2000),
  targetContext: TargetContextSchema.optional(),
});

// ─── POST /training-system/edit ───────────────────────────────────────────────
router.post("/training-system/edit", requireAuth, async (req, res): Promise<void> => {
  const parsed = EditRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. 'request' field required." });
    return;
  }

  const userId = req.session.userId!;
  const { request: userRequest, targetContext } = parsed.data;

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
    //    targetContext focuses the AI on a specific exercise/session/week/phase
    const editPlan = await interpretEditRequest(userRequest, fullSystem, targetContext);

    logger.info(
      { userId, intent: editPlan.intent, scope: editPlan.scope, changesCount: editPlan.changes.length, targetType: targetContext?.type, targetId: targetContext?.id },
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
      changedIds: editResult.changedIds,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, userRequest }, "Training system edit failed");
    res.status(500).json({ error: "Failed to process edit request." });
  }
});

export default router;
