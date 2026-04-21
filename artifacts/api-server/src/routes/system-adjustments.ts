/**
 * System Adjustments Routes
 *
 * GET  /api/system-adjustments          — fetch recent visible adaptation events
 * POST /api/system-adjustments/seen     — mark events as seen (clears "new" badge)
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  getAdjustmentEvents,
  markAdjustmentEventsSeen,
  createAdjustmentEvent,
  type FocusMode,
} from "../lib/system-adjustment-service";

const router: IRouter = Router();

router.get("/system-adjustments", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const focusMode = (req.query.focus as FocusMode) ?? "strength";
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 50);

  try {
    const events = await getAdjustmentEvents(userId, focusMode, limit);
    res.json(events);
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch system adjustment events");
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

router.post("/system-adjustments/seen", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
    res.status(400).json({ error: "ids must be an array of numbers" });
    return;
  }

  try {
    await markAdjustmentEventsSeen(userId, ids);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "Failed to mark events seen");
    res.status(500).json({ error: "Failed to mark events seen" });
  }
});

export default router;
