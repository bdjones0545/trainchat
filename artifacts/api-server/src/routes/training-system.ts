import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
  initializeTrainingSystem,
  createTrainingSystemFromProgram,
  upsertTrainingSystemFromProgram,
  type ChatProgram,
} from "../lib/training-system-service";
import {
  getChangeHistory,
  getChangeDetail,
  createChangeLogEntry,
} from "../lib/change-log-service";
import { logger } from "../lib/logger";

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

// ─── POST /training-system/from-chat ─────────────────────────────────────────
// Saves a chat-generated ProgramStructure as a real Training System in the DB.
// This bridges the chat output → Training System page.
router.post("/training-system/from-chat", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const program = req.body as ChatProgram;

    logger.info({ userId, programName: program?.programName }, "[training-system] POST /from-chat — received");

    // Basic validation
    if (!program || !program.programName) {
      res.status(400).json({ error: "Missing programName in request body" });
      return;
    }
    if (!Array.isArray(program.days) || program.days.length === 0) {
      res.status(400).json({ error: "Program must have at least one day" });
      return;
    }

    // Validate each day has exercises
    for (const day of program.days) {
      if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
        logger.warn({ userId, dayName: day.name }, "[training-system] Day has no exercises — skipping validation error, proceeding");
      }
    }

    const system = await createTrainingSystemFromProgram(userId, program);

    logger.info({ userId, systemId: system.id }, "[training-system] POST /from-chat — Training System created successfully");

    res.status(201).json({
      success: true,
      systemId: system.id,
      systemName: system.name,
    });
  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, "[training-system] POST /from-chat error");
    res.status(500).json({ error: "Failed to save training system from chat program" });
  }
});

// ─── GET /training-system/history ────────────────────────────────────────────
// Returns change log entries for the active training system.
// Used by the History tab in the Live Program Panel.
router.get("/training-system/history", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const limitParam = req.query.limit;
    const limit = typeof limitParam === "string" ? Math.min(parseInt(limitParam, 10) || 30, 100) : 30;

    const system = await getActiveTrainingSystem(userId);
    if (!system) {
      res.json({ history: [] });
      return;
    }

    const history = await getChangeHistory(userId, system.id, limit);
    res.json({ history });
  } catch (err) {
    logger.error({ err }, "[training-system] GET /history error");
    res.status(500).json({ error: "Failed to load change history" });
  }
});

// ─── POST /training-system/restore/:changeId ──────────────────────────────────
// Restores the training system to the state captured in a change log entry's
// afterSnapshot.fullProgram field.
router.post("/training-system/restore/:changeId", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const changeId = parseInt(req.params.changeId, 10);

    if (isNaN(changeId)) {
      res.status(400).json({ error: "Invalid changeId" });
      return;
    }

    // Load the change log entry with its snapshots
    const detail = await getChangeDetail(userId, changeId);
    if (!detail) {
      res.status(404).json({ error: "Change log entry not found" });
      return;
    }

    // Extract the full program snapshot stored in afterSnapshot.fullProgram
    const snapshot = detail.afterSnapshot as any;
    const fullProgram = snapshot?.fullProgram;

    if (!fullProgram || !Array.isArray(fullProgram.days) || fullProgram.days.length === 0) {
      res.status(422).json({ error: "This version does not have a restoreable program snapshot" });
      return;
    }

    // Restore the program by upserting from the snapshot
    const { system: restoredSystem } = await upsertTrainingSystemFromProgram(userId, fullProgram as ChatProgram);

    // Determine a restore label from the entry being restored
    const sourceLabel = detail.versionLabel ?? detail.changeSummary.slice(0, 40);

    // Log the restore operation as a new major version
    const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
    const newChangeLogId = await createChangeLogEntry({
      userId,
      trainingSystemId: restoredSystem.id,
      source: "restore",
      intent: "restore",
      scope: "system",
      changeSummary: `Restored to: "${sourceLabel}"`,
      beforeSnapshot: emptySnapshot,
      afterSnapshot: { ...emptySnapshot, fullProgram },
      fullProgramSnapshot: fullProgram,
      appliedCount: 1,
      skippedCount: 0,
      restoredFromId: changeId,
      versionOverrides: {
        isMajorVersion: true,
        versionLabel: `Restored — ${sourceLabel}`,
      },
    });

    logger.info(
      { userId, systemId: restoredSystem.id, restoredFromId: changeId, newChangeLogId },
      "[training-system] Program restored from version snapshot"
    );

    res.json({
      success: true,
      systemId: restoredSystem.id,
      changeLogId: newChangeLogId,
      message: "Restored. Your program is now back to the selected version.",
    });
  } catch (err) {
    logger.error({ err }, "[training-system] POST /restore error");
    res.status(500).json({ error: "Failed to restore program version" });
  }
});

export default router;
