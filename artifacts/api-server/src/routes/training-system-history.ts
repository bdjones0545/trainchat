/**
 * Training System History Routes — Canonical
 *
 * GET  /training-system/history/:changeId  — full detail with before/after snapshots
 * POST /training-system/restore/:changeId  — canonical restore (entity-level, verified,
 *                                            audit receipt, standardized response shape)
 *
 * NOTE: GET /training-system/history (list) is handled by training-system.ts which is
 * registered first in routes/index.ts and already supports the ?focus= param.
 * This router handles routes that do NOT conflict with training-system.ts.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getActiveTrainingSystem } from "../lib/training-system-service";
import { getChangeDetail } from "../lib/change-log-service";
import { restoreFromChange } from "../lib/restore-service";
import { getTodaySession, getCurrentWeek, getBlockSummary } from "../lib/training-system-service";
import { trackLearningEvent } from "../lib/globalLearningService";
import { writeAuditReceipt } from "../lib/mutation-audit-receipt-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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
// Canonical restore route. Entity-level restore from beforeSnapshot with:
//  - verification of restored state
//  - audit receipt (immutable undo record)
//  - standardized client-hydration response shape
//  - focusMode scoping so multi-lane users restore the correct program
//
// Query param: ?focus=strength|speed|mobility  (required for correct lane targeting)

router.post("/training-system/restore/:changeId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const changeId = Number(req.params.changeId);
  const focusMode = typeof req.query.focus === "string" ? req.query.focus : undefined;

  logger.info(
    { userId, changeId, focusMode },
    "[ActiveProgramsRestore] canonical restore route hit"
  );

  if (!changeId || isNaN(changeId)) {
    res.status(400).json({
      success: false,
      systemEdit: { applied: false, route: "restore", scope: "system", error: "Invalid change ID." },
    });
    return;
  }

  try {
    // Resolve the active system for the requested focus lane.
    const activeSystem = await getActiveTrainingSystem(userId, focusMode);
    if (!activeSystem) {
      res.status(404).json({
        success: false,
        systemEdit: { applied: false, route: "restore", scope: "system", error: "No active training system found." },
      });
      return;
    }

    const result = await restoreFromChange(userId, changeId, activeSystem.id);

    // ── Learning signal ────────────────────────────────────────────────────
    trackLearningEvent({
      userId,
      eventType: "user_reverted_change",
      mutationApplied: true,
      metadata: { changeId, restoredChangeLogId: result.changeLogId },
    });

    // ── Audit receipt — immutable undo record ──────────────────────────────
    void writeAuditReceipt({
      userId,
      trainingSystemId: activeSystem.id,
      changeLogId: changeId,
      userRequest: `[undo] restore to change log entry #${changeId}`,
      intentFamily: "undo",
      targetScope: "system",
      persistenceType: "permanent",
      mutationType: "reorient",
      beforeSnapshot: { exercises: {}, sessions: {}, weeks: {}, phases: {} },
      afterSnapshot:  { exercises: {}, sessions: {}, weeks: {}, phases: {} },
      persistedConstraints: [],
      verificationStatus: (result.verificationStatus === "verified" || result.verificationStatus === "partial")
        ? result.verificationStatus
        : "noop",
      repairAttempted: false,
      responseShown: null,
      source: "chat",
      metadata: { changeId, restoredChangeLogId: result.changeLogId ?? changeId, isUndo: true },
    }).catch(() => {});

    // ── Return fresh data for client-side hydration ────────────────────────
    const [today, week, block] = await Promise.all([
      getTodaySession(userId, focusMode).catch(() => null),
      getCurrentWeek(userId, undefined, focusMode).catch(() => null),
      getBlockSummary(userId, focusMode).catch(() => null),
    ]);

    const systemId = activeSystem.id;

    logger.info(
      { userId, systemId, changeId, changeLogId: result.changeLogId, focusMode, verificationStatus: result.verificationStatus },
      "[ActiveProgramsHydration] restore response hydration fields returned"
    );

    res.json({
      success: true,
      systemSaved: true,
      systemId,
      trainingSystemId: systemId,
      systemEdit: {
        applied: true,
        route: "restore",
        scope: "system",
        changeLogId: result.changeLogId,
      },
      verificationStatus: result.verificationStatus,
      restoredCount: result.restoredCount,
      changeSummary: result.changeSummary,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, changeId, focusMode }, "[ActiveProgramsRestore] restore failed");
    res.status(500).json({
      success: false,
      systemEdit: { applied: false, route: "restore", scope: "system", error: "Failed to restore prior state." },
    });
  }
});

export default router;
