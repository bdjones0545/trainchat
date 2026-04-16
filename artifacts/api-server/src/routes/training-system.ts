import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import { trainingSystems } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
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
    res.json(system ?? null);
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

    res.json(todaySession ?? null);
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

    res.json(week ?? null);
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

    res.json(block ?? null);
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

    // Create an initial "Version 1" change log entry so the History tab
    // immediately shows the program build as the first version snapshot.
    try {
      const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
      const buildParts: string[] = [`Created: ${program.programName}`];
      if (program.days?.length) buildParts.push(`${program.days.length} training days`);
      if (program.splitType) buildParts.push(program.splitType);
      if (program.progressionStrategy) buildParts.push(program.progressionStrategy);

      await createChangeLogEntry({
        userId,
        trainingSystemId: system.id,
        source: "initialize",
        intent: "initialize",
        scope: "system",
        changeSummary: buildParts.join(" · "),
        beforeSnapshot: emptySnapshot,
        afterSnapshot: emptySnapshot,
        fullProgramSnapshot: program as unknown as Record<string, unknown>,
        appliedCount: program.days?.length ?? 0,
        skippedCount: 0,
        versionOverrides: { isMajorVersion: true, versionLabel: "Initial Build" },
        decisionMetadata: {
          programGoal: program.description ?? undefined,
          programDays: program.days?.length ?? 0,
          splitType: program.splitType ?? undefined,
        },
      });
    } catch (err) {
      logger.warn({ err }, "[training-system] Could not create initial change log entry (non-fatal)");
    }

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
    const changeId = parseInt(req.params.changeId as string, 10);

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
      afterSnapshot: emptySnapshot,
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

// ─── GET /training-system/library ────────────────────────────────────────────
// Returns ALL training systems for the user (active + archived) as a program library.
// This is how the "Saved Programs" sidebar section gets its data.
router.get("/training-system/library", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const systems = await db
      .select()
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.updatedAt));

    res.json(
      systems.map((s) => ({
        id: s.id,
        name: s.name,
        overarchingGoal: s.overarchingGoal,
        trainingStyle: s.trainingStyle,
        weeklyFrequency: s.weeklyFrequency,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "[training-system] GET /library error");
    res.status(500).json({ error: "Failed to load program library" });
  }
});

// ─── POST /training-system/set-active/:id ────────────────────────────────────
// Switches the active training system: archives the current active one and
// activates the specified system. This is how the user switches between saved programs.
router.post("/training-system/set-active/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id as string, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid training system id" });
      return;
    }

    const [target] = await db
      .select()
      .from(trainingSystems)
      .where(and(eq(trainingSystems.id, id), eq(trainingSystems.userId, userId)));

    if (!target) {
      res.status(404).json({ error: "Training system not found" });
      return;
    }

    if (target.status === "active") {
      res.json({ success: true, systemId: id, message: "Already the active program" });
      return;
    }

    await db
      .update(trainingSystems)
      .set({ status: "archived" })
      .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

    await db
      .update(trainingSystems)
      .set({ status: "active" })
      .where(eq(trainingSystems.id, id));

    logger.info({ userId, systemId: id }, "[training-system] POST /set-active — program switched");

    res.json({ success: true, systemId: id });
  } catch (err) {
    logger.error({ err }, "[training-system] POST /set-active error");
    res.status(500).json({ error: "Failed to switch active program" });
  }
});

// ─── DELETE /training-system/:id ─────────────────────────────────────────────
// Hard-deletes a training system (all phases/weeks/sessions/exercises/change
// logs cascade). If the deleted system was the active one, the most-recently-
// updated archived system is promoted to active. Ownership is enforced.
router.delete("/training-system/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id as string, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid training system id" });
      return;
    }

    const [target] = await db
      .select()
      .from(trainingSystems)
      .where(and(eq(trainingSystems.id, id), eq(trainingSystems.userId, userId)));

    if (!target) {
      res.status(404).json({ error: "Training system not found" });
      return;
    }

    const wasActive = target.status === "active";
    let newActiveSystemId: number | null = null;

    // If deleting the active system, promote the most-recently-updated archived one
    if (wasActive) {
      const [next] = await db
        .select()
        .from(trainingSystems)
        .where(
          and(
            eq(trainingSystems.userId, userId),
            eq(trainingSystems.status, "archived"),
            ne(trainingSystems.id, id)
          )
        )
        .orderBy(desc(trainingSystems.updatedAt))
        .limit(1);

      if (next) {
        await db
          .update(trainingSystems)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(trainingSystems.id, next.id));
        newActiveSystemId = next.id;
        logger.info(
          { userId, deletedId: id, promotedId: next.id },
          "[training-system] DELETE /:id — active system deleted, next system promoted"
        );
      } else {
        logger.info(
          { userId, deletedId: id },
          "[training-system] DELETE /:id — active system deleted, no fallback available (workspace will be empty)"
        );
      }
    }

    // Hard delete — cascade removes phases → weeks → sessions → exercises → change logs
    await db.delete(trainingSystems).where(eq(trainingSystems.id, id));

    logger.info({ userId, systemId: id, wasActive, newActiveSystemId }, "[training-system] DELETE /:id — deleted");

    res.json({ success: true, wasActive, newActiveSystemId });
  } catch (err) {
    logger.error({ err }, "[training-system] DELETE /:id error");
    res.status(500).json({ error: "Failed to delete training system" });
  }
});

export default router;
