/**
 * Insights Routes — Phase 5
 *
 * GET  /insights        — Generate proactive insights based on readiness, feedback, memory
 * POST /insights/apply  — Apply an insight as an AI-generated edit (routes through Phase 2 engine)
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { generateInsights, type InsightType } from "../lib/insights";
import { listMemories } from "../lib/memory";
import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan } from "../lib/edit-engine";
import { createChangeLogEntry } from "../lib/change-log-service";
import { buildAdaptationContext } from "../lib/adaptation";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
} from "../lib/training-system-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── GET /insights ───────────────────────────────────────────────────────────

router.get("/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);
  const insights = await generateInsights(userId, memories);
  res.json(insights);
});

// ─── Insight → Edit Request mapping ─────────────────────────────────────────

const INSIGHT_EDIT_REQUESTS: Record<InsightType, string> = {
  deload_suggestion:
    "Reduce the volume and intensity of the current week — this is a deload week. Drop training volume by 30-40%, keep the same exercises but reduce sets and load. Focus on active recovery and movement quality.",
  progression_ready:
    "I'm handling sessions well and recovering strongly. Add a small, conservative load increment or one extra working set to the main compound exercises in the current week to drive progression.",
  pain_warning:
    "I've been experiencing recurring discomfort during training. Review the current session exercises and modify any high joint-stress movements — reduce range of motion requirements, swap to machine or unilateral alternatives, and add recovery notes to flagged exercises.",
  consistency_positive:
    "I've been training consistently. Keep the current plan on track — no major changes needed. Add a note acknowledging the consistency and any minor optimization based on current recovery.",
  schedule_review:
    "My training frequency has been lower than planned. Simplify the weekly schedule — remove one session or convert it to optional, and adjust the remaining sessions to be more manageable and time-efficient.",
  sleep_impact:
    "My sleep quality has been poor and it's affecting my recovery. Make this week shorter and lower intensity — reduce accessory work, shorten session duration, and add coaching notes about sleep's impact on adaptation.",
  recovery_strength:
    "My recovery has been excellent and readiness is high. This is a good window to push training quality slightly. Add a small volume increment or slightly increase the challenge on primary movements.",
  tolerance_building:
    "Sessions are appropriately challenging and I'm adapting well. Maintain the current programming as is — just add a note that the current loading is working well and to stay the course.",
  program_evolution:
    "My current program is several weeks old. Introduce a meaningful progression — either a new phase emphasis, exercise rotation in the main lifts, or an increase in training complexity to drive continued adaptation.",
};

// ─── POST /insights/apply ────────────────────────────────────────────────────

router.post("/insights/apply", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { insightType, insightTitle } = req.body as { insightType: InsightType; insightTitle?: string };

  if (!insightType || !INSIGHT_EDIT_REQUESTS[insightType]) {
    res.status(400).json({ error: "Invalid or unsupported insight type." });
    return;
  }

  const editRequest = INSIGHT_EDIT_REQUESTS[insightType];

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

    const editPlan = await interpretEditRequest(
      editRequest,
      fullSystem,
      undefined,
      adaptationCtx?.promptContext || undefined
    );

    const editResult = await applyEditPlan(editPlan);

    let changeLogId: number | undefined;
    try {
      changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: activeSystem.id,
        source: "auto_adjust",
        intent: editPlan.intent,
        scope: editPlan.scope,
        changeSummary: editResult.changeSummary,
        requestText: `[Coach Insight] ${insightTitle ?? insightType}: ${editRequest}`,
        beforeSnapshot: editResult.beforeSnapshot,
        afterSnapshot: editResult.afterSnapshot,
        appliedCount: editResult.appliedCount,
        skippedCount: editResult.skippedCount,
      });
    } catch (logErr) {
      logger.error({ logErr, userId }, "Failed to persist insight apply change log (non-fatal)");
    }

    const [today, week, block] = await Promise.all([
      getTodaySession(userId).catch(() => null),
      getCurrentWeek(userId).catch(() => null),
      getBlockSummary(userId).catch(() => null),
    ]);

    logger.info({ userId, insightType, intent: editPlan.intent, appliedCount: editResult.appliedCount }, "Insight applied");

    res.json({
      intent: editPlan.intent,
      scope: editPlan.scope,
      changeSummary: editResult.changeSummary,
      appliedCount: editResult.appliedCount,
      changedIds: editResult.changedIds,
      changeLogId,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, insightType }, "Failed to apply insight");
    res.status(500).json({ error: "Failed to apply insight suggestion." });
  }
});

export default router;
