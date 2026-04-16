/**
 * Training System History Routes — Phase 4
 *
 * GET  /training-system/history        — paginated list of change log entries
 * GET  /training-system/history/:id    — full detail with before/after snapshots
 * POST /training-system/restore/:id    — restore a prior state from a change log entry
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getActiveTrainingSystem } from "../lib/training-system-service";
import { getChangeHistory, getChangeDetail } from "../lib/change-log-service";
import { restoreFromChange } from "../lib/restore-service";
import { getTodaySession, getCurrentWeek, getBlockSummary } from "../lib/training-system-service";
import { trackLearningEvent } from "../lib/globalLearningService";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── GET /training-system/history ────────────────────────────────────────────

router.get("/training-system/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found." });
      return;
    }

    const limit = Math.min(Number(req.query.limit ?? 30), 50);
    const history = await getChangeHistory(userId, activeSystem.id, limit);

    res.json({ history, trainingSystemId: activeSystem.id });
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch training system history");
    res.status(500).json({ error: "Failed to fetch history." });
  }
});

// ─── GET /training-system/history/:changeId ───────────────────────────────────

router.get("/training-system/history/:changeId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const changeId = Number(req.params.changeId);

  if (!changeId || isNaN(changeId)) {
    res.status(400).json({ error: "Invalid change ID." });
    return;
  }

  try {
    const detail = await getChangeDetail(userId, changeId);
    if (!detail) {
      res.status(404).json({ error: "Change entry not found." });
      return;
    }

    res.json(detail);
  } catch (err) {
    logger.error({ err, userId, changeId }, "Failed to fetch change detail");
    res.status(500).json({ error: "Failed to fetch change detail." });
  }
});

// ─── POST /training-system/restore/:changeId ─────────────────────────────────

router.post("/training-system/restore/:changeId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const changeId = Number(req.params.changeId);

  if (!changeId || isNaN(changeId)) {
    res.status(400).json({ error: "Invalid change ID." });
    return;
  }

  try {
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found." });
      return;
    }

    const result = await restoreFromChange(userId, changeId, activeSystem.id);

    // ── Learning signal: user reverted a change ────────────────────────────
    trackLearningEvent({
      userId,
      eventType: "user_reverted_change",
      mutationApplied: true,
      metadata: { changeId, restoredChangeLogId: changeId },
    });

    // Return fresh data alongside the restore result
    const [today, week, block] = await Promise.all([
      getTodaySession(userId).catch(() => null),
      getCurrentWeek(userId).catch(() => null),
      getBlockSummary(userId).catch(() => null),
    ]);

    res.json({
      ...result,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, changeId }, "Failed to restore from change");
    res.status(500).json({ error: "Failed to restore prior state." });
  }
});

export default router;
