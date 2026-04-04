import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
  initializeTrainingSystem,
} from "../lib/training-system-service";

const router: IRouter = Router();

// ─── GET /training-system/active ─────────────────────────────────────────────
// Returns the active training system (shallow — no nested structure)
router.get("/training-system/active", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const system = await getActiveTrainingSystem(userId);

    if (!system) {
      res.status(404).json({ error: "No active training system found" });
      return;
    }

    res.json(system);
  } catch (err) {
    console.error("[training-system] GET /active error", err);
    res.status(500).json({ error: "Failed to load training system" });
  }
});

// ─── GET /training-system/full ────────────────────────────────────────────────
// Returns the full nested training system (phases → weeks → sessions → exercises)
router.get("/training-system/full", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const system = await getActiveTrainingSystem(userId);

    if (!system) {
      res.status(404).json({ error: "No active training system found" });
      return;
    }

    const full = await getFullTrainingSystem(system.id);
    res.json(full);
  } catch (err) {
    console.error("[training-system] GET /full error", err);
    res.status(500).json({ error: "Failed to load full training system" });
  }
});

// ─── GET /training-system/today ───────────────────────────────────────────────
// Returns today's session with exercises
router.get("/training-system/today", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const todaySession = await getTodaySession(userId);

    if (!todaySession) {
      res.status(404).json({ error: "No session found for today" });
      return;
    }

    res.json(todaySession);
  } catch (err) {
    console.error("[training-system] GET /today error", err);
    res.status(500).json({ error: "Failed to load today's session" });
  }
});

// ─── GET /training-system/week ────────────────────────────────────────────────
// Returns the current week with all sessions and exercises
router.get("/training-system/week", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const week = await getCurrentWeek(userId);

    if (!week) {
      res.status(404).json({ error: "No current week found" });
      return;
    }

    res.json(week);
  } catch (err) {
    console.error("[training-system] GET /week error", err);
    res.status(500).json({ error: "Failed to load current week" });
  }
});

// ─── GET /training-system/block ───────────────────────────────────────────────
// Returns current block/phase summary and program overview
router.get("/training-system/block", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const block = await getBlockSummary(userId);

    if (!block) {
      res.status(404).json({ error: "No training system found" });
      return;
    }

    res.json(block);
  } catch (err) {
    console.error("[training-system] GET /block error", err);
    res.status(500).json({ error: "Failed to load block summary" });
  }
});

// ─── POST /training-system/initialize ────────────────────────────────────────
// Creates the user's training system from their profile (idempotent)
router.post("/training-system/initialize", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const system = await initializeTrainingSystem(userId);
    res.status(201).json(system);
  } catch (err) {
    console.error("[training-system] POST /initialize error", err);
    res.status(500).json({ error: "Failed to initialize training system" });
  }
});

export default router;
