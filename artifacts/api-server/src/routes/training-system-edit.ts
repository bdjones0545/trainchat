/**
 * Training System Edit Routes — Phase 2 + Phase 3 + Phase 4
 *
 * POST /training-system/edit
 *   Accepts a natural language modification request with optional target context.
 *   Orchestrates: interpret → snapshot before → plan → apply → snapshot after
 *                 → persist change log → respond with updated data + changedIds.
 *
 * Phase 3: targetContext enables focused, object-level edits from the UI.
 * Phase 4: Every applied edit is recorded in system_change_log with before/after
 *           snapshots for full history and restore capability.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan } from "../lib/edit-engine";
import { createChangeLogEntry } from "../lib/change-log-service";
import { buildAdaptationContext } from "../lib/adaptation";
import { listMemories } from "../lib/memory";
import { buildDecisionMemory } from "../lib/decision-memory-service";
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
  // Phase 4: caller can hint at source type; defaults to ai_edit
  source: z.enum(["ai_edit", "quick_action", "initialize", "auto_adjust"]).optional(),
});

// ─── POST /training-system/edit ───────────────────────────────────────────────
router.post("/training-system/edit", requireAuth, async (req, res): Promise<void> => {
  const parsed = EditRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. 'request' field required." });
    return;
  }

  const userId = req.session.userId!;
  const { request: userRequest, targetContext, source = "ai_edit" } = parsed.data;

  try {
    // 1. Load active training system
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found. Initialize your system first." });
      return;
    }

    // 2. Load full system with hierarchy (needed for AI context)
    // Also load adaptation context, memories, and decision history in parallel
    const [fullSystem, adaptationCtx, memories] = await Promise.all([
      getFullTrainingSystem(activeSystem.id),
      buildAdaptationContext(userId).catch(() => null),
      listMemories(userId).catch(() => []),
    ]);
    if (!fullSystem) {
      res.status(500).json({ error: "Failed to load training system data." });
      return;
    }

    // Build decision memory context (Phase B)
    const decisionMemory = await buildDecisionMemory(
      userId,
      activeSystem.id,
      memories
    ).catch(() => null);

    // 3. Interpret the edit request into a structured plan
    const editPlan = await interpretEditRequest(
      userRequest,
      fullSystem,
      targetContext,
      adaptationCtx?.promptContext || undefined,
      decisionMemory?.decisionMemoryContext || undefined
    );

    logger.info(
      {
        userId, intent: editPlan.intent, scope: editPlan.scope,
        changesCount: editPlan.changes.length,
        targetType: targetContext?.type, targetId: targetContext?.id,
      },
      "Edit plan ready — applying"
    );

    // 4. Apply the edit plan to the database (Phase 4: also captures before/after snapshots)
    const editResult = await applyEditPlan(editPlan);

    // 5. Persist the change log entry (Phase 4)
    let changeLogId: number | undefined;
    try {
      changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: activeSystem.id,
        source,
        intent: editPlan.intent,
        scope: editPlan.scope,
        changeSummary: editResult.changeSummary,
        requestText: userRequest,
        targetType: targetContext?.type,
        targetId: targetContext?.id,
        targetLabel: targetContext?.label,
        beforeSnapshot: editResult.beforeSnapshot,
        afterSnapshot: editResult.afterSnapshot,
        appliedCount: editResult.appliedCount,
        skippedCount: editResult.skippedCount,
      });
    } catch (logErr) {
      // Log error but do not fail the request — the edit itself succeeded
      logger.error({ logErr, userId }, "Failed to persist change log entry (non-fatal)");
    }

    // 6. Reload affected data to return fresh state
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
      changeTargets: editResult.changeTargets,
      changeLogId,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, userRequest }, "Training system edit failed");
    res.status(500).json({ error: "Failed to process edit request." });
  }
});

export default router;
