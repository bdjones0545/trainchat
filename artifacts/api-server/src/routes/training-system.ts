import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import {
  trainingSystems,
  trainingPhases,
  trainingWeeks,
  systemChangeLog,
  systemAdjustmentEventsTable,
  conversationsTable,
  savedProgramsTable,
  activeSessionsTable,
} from "@workspace/db";
import { eq, and, desc, ne, inArray, isNotNull } from "drizzle-orm";
import {
  getActiveTrainingSystem,
  getAllActiveSystemsByFocus,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getCurrentWeekBySystemId,
  getTrainingSystemByConversation,
  getWeeksList,
  getBlockSummary,
  initializeTrainingSystem,
  createTrainingSystemFromProgram,
  getBlockCompletionStatus,
  markBlockComplete,
  generateContinuationPhase,
  advanceToNextWeek,
  type ChatProgram,
} from "../lib/training-system-service";
import {
  getChangeHistory,
  createChangeLogEntry,
} from "../lib/change-log-service";
import { logger } from "../lib/logger";
import { fireWeekTransitionEmail } from "../lib/retentionEmails";

const router: IRouter = Router();

// ─── GET /training-system/active ─────────────────────────────────────────────
// Returns the active training system for the given focus (shallow — no nested structure)
// Optional query param: ?focus=strength|speed|mobility
router.get("/training-system/active", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    const system = await getActiveTrainingSystem(userId, focusMode);
    console.log("[FocusSidebarAudit]", {
      currentFocus: focusMode ?? "unset",
      sidebarProgramId: system?.id ?? null,
      sidebarModeCorrect: !focusMode || ((system?.metadata as any)?.focusMode ?? "strength") === focusMode,
    });
    res.json(system ?? null);
  } catch (err) {
    console.error("[training-system] GET /active error", err);
    res.status(500).json({ error: "Failed to load training system" });
  }
});

// ─── GET /training-system/active-by-focus ─────────────────────────────────────
// Returns active programs for all three focus lanes simultaneously.
// Used by the Active Programs page to show focus tabs.
router.get("/training-system/active-by-focus", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const byFocus = await getAllActiveSystemsByFocus(userId);
    console.log("[FocusActiveProgramsAudit]", {
      strengthProgramId: byFocus.strength?.id ?? null,
      speedProgramId: byFocus.speed?.id ?? null,
      mobilityProgramId: byFocus.mobility?.id ?? null,
    });
    res.json(byFocus);
  } catch (err) {
    console.error("[training-system] GET /active-by-focus error", err);
    res.status(500).json({ error: "Failed to load programs by focus" });
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
// Returns today's session with exercises for the given focus
// Optional query param: ?focus=strength|speed|mobility
router.get("/training-system/today", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    // forceDay1=1 is sent by the client immediately after a brand-new program is saved.
    // It overrides weekday-based selection and returns the first session (Day 1).
    const forceDay1 = req.query.forceDay1 === "1";
    const todaySession = await getTodaySession(userId, focusMode, forceDay1);

    if (process.env.NODE_ENV !== "production" && todaySession) {
      const activeSystemForAudit = await getActiveTrainingSystem(userId, focusMode);
      const mismatch = !!activeSystemForAudit &&
        !!(todaySession as any).trainingSystemId &&
        (todaySession as any).trainingSystemId !== activeSystemForAudit.id;
      console.log("[BuildAudit:TodaySource]", JSON.stringify({
        systemId: (todaySession as any).trainingSystemId ?? null,
        activeSystemId: activeSystemForAudit?.id ?? null,
        mismatch,
        sessionId: todaySession.id,
        sessionLabel: todaySession.label,
        dayOfWeek: todaySession.dayOfWeek,
        todayDow: new Date().getDay(),
        matchedByDow: todaySession.dayOfWeek === new Date().getDay(),
        isAdvancedFromCompleted: (todaySession as any).isAdvancedFromCompleted ?? false,
        isWeekComplete: (todaySession as any).isWeekComplete ?? false,
        exercises: (todaySession.exercises ?? []).map((e: { name: string }) => e.name),
      }));
      if (mismatch) {
        console.error("[CRITICAL:TodaySystemMismatch]", {
          expected: activeSystemForAudit?.id,
          got: (todaySession as any).trainingSystemId,
          focusMode,
        });
      }
    }

    res.json(todaySession ?? null);
  } catch (err) {
    console.error("[training-system] GET /today error", err);
    res.status(500).json({ error: "Failed to load today's session" });
  }
});

// ─── GET /training-system/by-conversation/:conversationId ────────────────────
// Returns the training system linked to a specific conversation (any status).
// Used by Live Program Restore: never falls back to the global active system.
router.get("/training-system/by-conversation/:conversationId", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const conversationId = parseInt(req.params.conversationId as string, 10);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversationId" });
      return;
    }
    const system = await getTrainingSystemByConversation(userId, conversationId);
    logger.info(
      { userId, conversationId, foundSystemId: system?.id ?? null, systemStatus: system?.status ?? null },
      "[Live Program Restore] GET /by-conversation"
    );
    res.json(system ?? null);
  } catch (err) {
    logger.error({ err }, "[training-system] GET /by-conversation error");
    res.status(500).json({ error: "Failed to load training system for conversation" });
  }
});

// ─── GET /training-system/week ────────────────────────────────────────────────
// Returns the current week (or a specific week by ?weekNumber=N) for the given focus.
// Optional query params: ?weekNumber=N&focus=strength|speed|mobility&systemId=N
// When ?systemId=N is provided it bypasses the global active-system lookup and
// fetches week data for that exact system — used by Live Program Restore.
router.get("/training-system/week", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const weekNumberParam = req.query.weekNumber;
    const weekNumber = typeof weekNumberParam === "string" ? parseInt(weekNumberParam, 10) || undefined : undefined;
    const systemIdParam = req.query.systemId;
    const systemId = typeof systemIdParam === "string" ? parseInt(systemIdParam, 10) || undefined : undefined;

    if (systemId) {
      const week = await getCurrentWeekBySystemId(systemId, weekNumber);
      res.json(week ?? null);
      return;
    }

    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    const week = await getCurrentWeek(userId, weekNumber, focusMode);

    res.json(week ?? null);
  } catch (err) {
    console.error("[training-system] GET /week error", err);
    res.status(500).json({ error: "Failed to load current week" });
  }
});

// ─── GET /training-system/weeks ───────────────────────────────────────────────
// Returns list of all weeks in the current phase with status, labels, session counts
// Optional query param: ?focus=strength|speed|mobility
router.get("/training-system/weeks", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    const weeksList = await getWeeksList(userId, focusMode);
    res.json(weeksList ?? null);
  } catch (err) {
    console.error("[training-system] GET /weeks error", err);
    res.status(500).json({ error: "Failed to load weeks list" });
  }
});

// ─── GET /training-system/block ───────────────────────────────────────────────
// Returns current block/phase summary and program overview
// Optional query param: ?focus=strength|speed|mobility
router.get("/training-system/block", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    const block = await getBlockSummary(userId, focusMode);

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
    const { conversationId: rawConversationId, focusMode: rawFocusMode, ...program } = req.body as ChatProgram & { conversationId?: number | null; focusMode?: string | null };
    const conversationId = typeof rawConversationId === "number" ? rawConversationId : null;
    const focusMode = typeof rawFocusMode === "string" ? rawFocusMode : null;

    logger.info({ userId, programName: program?.programName, conversationId, focusMode }, "[training-system] POST /from-chat — received");

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

    const system = await createTrainingSystemFromProgram(userId, program, conversationId, focusMode);

    logger.info({ userId, systemId: system.id, conversationId }, "[training-system] POST /from-chat — Training System created successfully");

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
// Required query param: ?focus=strength|speed|mobility (defaults to null → newest active system)
router.get("/training-system/history", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const limitParam = req.query.limit;
    const limit = typeof limitParam === "string" ? Math.min(parseInt(limitParam, 10) || 30, 100) : 30;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;

    const system = await getActiveTrainingSystem(userId, focusMode);

    logger.info(
      { userId, focusMode, systemId: system?.id ?? null },
      "[ActiveProgramsHistory] GET /history — resolved active system for focus"
    );

    if (!system) {
      res.json({ history: [], trainingSystemId: null });
      return;
    }

    const history = await getChangeHistory(userId, system.id, limit);
    res.json({ history, trainingSystemId: system.id });
  } catch (err) {
    logger.error({ err }, "[ActiveProgramsHistory] GET /history error");
    res.status(500).json({ error: "Failed to load change history" });
  }
});

// NOTE: POST /training-system/restore/:changeId is handled exclusively by
// training-system-history.ts (registered after this router) — see routes/index.ts.
// The canonical restore route lives there because it includes entity-level restore,
// verification, audit receipts, and the standardized client-hydration response shape.
// Do NOT add a duplicate restore route here — Express route-registration order
// means the first matching route wins, and this router is registered first.

// ─── GET /training-system/library ────────────────────────────────────────────
// Returns ALL training systems for the user (active + archived) as a program library.
// Enriched with phase/week context, focus mode, and adaptation signals so the UI
// can render an intelligent "living athlete operating system" instead of a file list.
router.get("/training-system/library", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const systems = await db
      .select()
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.updatedAt));

    if (systems.length === 0) {
      res.json([]);
      return;
    }

    const systemIds = systems.map((s) => s.id);

    // ── Batch: phase names via currentPhaseId ────────────────────────────────
    const phaseIdList = systems
      .map((s) => s.currentPhaseId)
      .filter((id): id is number => id != null);

    const phaseMap = new Map<number, { name: string; goal: string; weekCount: number }>();
    if (phaseIdList.length > 0) {
      const phases = await db
        .select({
          id: trainingPhases.id,
          name: trainingPhases.name,
          goal: trainingPhases.goal,
          weekCount: trainingPhases.weekCount,
        })
        .from(trainingPhases)
        .where(inArray(trainingPhases.id, phaseIdList));
      for (const p of phases) phaseMap.set(p.id, p);
    }

    // ── Batch: current week number for those phases ──────────────────────────
    const weekMap = new Map<number, { weekNumber: number; volumeLevel: string }>();
    if (phaseIdList.length > 0) {
      const weeks = await db
        .select({
          trainingPhaseId: trainingWeeks.trainingPhaseId,
          weekNumber: trainingWeeks.weekNumber,
          volumeLevel: trainingWeeks.volumeLevel,
        })
        .from(trainingWeeks)
        .where(
          and(
            inArray(trainingWeeks.trainingPhaseId, phaseIdList),
            eq(trainingWeeks.status, "current")
          )
        );
      for (const w of weeks) weekMap.set(w.trainingPhaseId, { weekNumber: w.weekNumber, volumeLevel: w.volumeLevel });
    }

    // ── Batch: latest adjustment event per system ────────────────────────────
    const adjustmentMap = new Map<number, { title: string; createdAt: Date }>();
    const allAdjustments = await db
      .select({
        trainingSystemId: systemAdjustmentEventsTable.trainingSystemId,
        title: systemAdjustmentEventsTable.title,
        createdAt: systemAdjustmentEventsTable.createdAt,
      })
      .from(systemAdjustmentEventsTable)
      .where(
        and(
          eq(systemAdjustmentEventsTable.userId, userId),
          isNotNull(systemAdjustmentEventsTable.trainingSystemId)
        )
      )
      .orderBy(desc(systemAdjustmentEventsTable.createdAt));
    for (const a of allAdjustments) {
      if (a.trainingSystemId && !adjustmentMap.has(a.trainingSystemId)) {
        adjustmentMap.set(a.trainingSystemId, { title: a.title, createdAt: a.createdAt });
      }
    }

    // ── Batch: latest change log date per system ─────────────────────────────
    const changeLogMap = new Map<number, Date>();
    const allChangeLogs = await db
      .select({
        trainingSystemId: systemChangeLog.trainingSystemId,
        createdAt: systemChangeLog.createdAt,
      })
      .from(systemChangeLog)
      .where(
        and(
          eq(systemChangeLog.userId, userId),
          inArray(systemChangeLog.trainingSystemId, systemIds)
        )
      )
      .orderBy(desc(systemChangeLog.createdAt));
    for (const c of allChangeLogs) {
      if (!changeLogMap.has(c.trainingSystemId)) {
        changeLogMap.set(c.trainingSystemId, c.createdAt);
      }
    }

    res.json(
      systems.map((s) => {
        const phase = s.currentPhaseId ? phaseMap.get(s.currentPhaseId) : null;
        const week = s.currentPhaseId ? weekMap.get(s.currentPhaseId) : null;
        const adjustment = adjustmentMap.get(s.id);
        const changeLogDate = changeLogMap.get(s.id);
        const meta = s.metadata as Record<string, unknown> | null;

        return {
          id: s.id,
          name: s.name,
          overarchingGoal: s.overarchingGoal,
          trainingStyle: s.trainingStyle,
          weeklyFrequency: s.weeklyFrequency,
          status: s.status,
          focusMode: (meta?.focusMode as string | undefined) ?? "strength",
          currentPhaseName: phase?.name ?? null,
          currentPhaseGoal: phase?.goal ?? null,
          currentWeekNumber: week?.weekNumber ?? null,
          currentVolumeLevel: week?.volumeLevel ?? null,
          lastAdjustmentTitle: adjustment?.title ?? null,
          lastAdjustmentDate: adjustment?.createdAt?.toISOString() ?? null,
          lastChangeLogDate: changeLogDate?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        };
      })
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

    // Focus-aware: only archive systems in the same focus lane as the target
    const targetFocusMode = ((target.metadata as any)?.focusMode ?? "strength") as string;
    const allActiveSystems = await db
      .select()
      .from(trainingSystems)
      .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

    const sameFocusActive = allActiveSystems.filter(
      (s) => ((s.metadata as any)?.focusMode ?? "strength") === targetFocusMode
    );

    for (const s of sameFocusActive) {
      await db.update(trainingSystems).set({ status: "archived" }).where(eq(trainingSystems.id, s.id));
    }

    await db
      .update(trainingSystems)
      .set({ status: "active" })
      .where(eq(trainingSystems.id, id));

    console.log("[FocusSwitchAudit]", {
      action: "set-active",
      targetFocusMode,
      systemId: id,
      archivedSameFocusCount: sameFocusActive.length,
    });

    logger.info({ userId, systemId: id, targetFocusMode }, "[training-system] POST /set-active — program switched");

    res.json({ success: true, systemId: id });
  } catch (err) {
    logger.error({ err }, "[training-system] POST /set-active error");
    res.status(500).json({ error: "Failed to switch active program" });
  }
});

// ─── GET /training-system/by-id/:systemId ────────────────────────────────────
// Returns a specific training system by ID (ownership enforced).
// Used by the frontend to hydrate the sidebar after a mutation when the
// conversation-scoped query returns null (cross-conversation edit case).
router.get("/training-system/by-id/:systemId", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const systemId = parseInt(req.params.systemId as string, 10);
    if (isNaN(systemId)) {
      res.status(400).json({ error: "Invalid systemId" });
      return;
    }
    const [system] = await db
      .select()
      .from(trainingSystems)
      .where(and(eq(trainingSystems.id, systemId), eq(trainingSystems.userId, userId)));
    if (!system) {
      res.status(404).json({ error: "Training system not found" });
      return;
    }
    logger.info(
      { userId, systemId, systemStatus: system.status ?? null },
      "[training-system] GET /by-id — fetched for sidebar hydration"
    );
    res.json(system);
  } catch (err) {
    logger.error({ err }, "[training-system] GET /by-id error");
    res.status(500).json({ error: "Failed to load training system by id" });
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
    const linkedConversationId = target.conversationId ?? null;
    const targetFocusMode = ((target.metadata as any)?.focusMode ?? "strength") as "strength" | "speed" | "mobility";
    let newActiveSystemId: number | null = null;

    // If deleting the active system, promote the most-recently-updated archived one
    // FOCUS-AWARE: only promote a system in the same focus lane — never cross-promote
    if (wasActive) {
      const allArchived = await db
        .select()
        .from(trainingSystems)
        .where(
          and(
            eq(trainingSystems.userId, userId),
            eq(trainingSystems.status, "archived"),
            ne(trainingSystems.id, id)
          )
        )
        .orderBy(desc(trainingSystems.updatedAt));

      // Only promote same-focus archived systems
      const sameFocusArchived = allArchived.filter(
        (s) => ((s.metadata as any)?.focusMode ?? "strength") === targetFocusMode
      );
      const next = sameFocusArchived[0] ?? null;

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

    // ── Cascade: delete linked saved_programs snapshot ───────────────────────
    let savedProgramsDeleted = 0;
    if (linkedConversationId !== null) {
      const deletedPrograms = await db
        .delete(savedProgramsTable)
        .where(eq(savedProgramsTable.conversationId, linkedConversationId))
        .returning({ id: savedProgramsTable.id });
      savedProgramsDeleted = deletedPrograms.length;
    }

    // ── Cascade: delete linked conversation (source chat) ────────────────────
    // CASE B: if the training system was created from a specific conversation,
    // delete that conversation (messages cascade via DB FK).
    let conversationDeleted = false;
    if (linkedConversationId !== null) {
      const [linkedConvo] = await db
        .select({ id: conversationsTable.id, userId: conversationsTable.userId })
        .from(conversationsTable)
        .where(eq(conversationsTable.id, linkedConversationId));

      if (linkedConvo && linkedConvo.userId === userId) {
        await db.delete(conversationsTable).where(eq(conversationsTable.id, linkedConversationId));
        conversationDeleted = true;
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    logger.info({
      sourceType: "program",
      sourceId: id,
      linkedConversationId,
      linkedEntityFound: linkedConversationId !== null,
      linkedEntityType: "conversation",
      actionTaken: conversationDeleted ? "deleted" : (linkedConversationId !== null ? "skipped" : "none"),
      savedProgramsDeleted,
      referenceCount: 1,
    }, "[DeleteCascadeAudit]");

    // If deleting the active program with no same-focus fallback, clean up today's
    // active session record for that focus so the UI doesn't show a stale "Resume" state.
    // FOCUS-AWARE: only clear the session for the deleted system's focus lane.
    if (wasActive && newActiveSystemId === null) {
      const today = new Date().toISOString().slice(0, 10);
      await db
        .delete(activeSessionsTable)
        .where(
          and(
            eq(activeSessionsTable.userId, userId),
            eq(activeSessionsTable.sessionDate, today),
            eq(activeSessionsTable.focusMode, targetFocusMode),
          )
        );
    }

    // Hard delete — cascade removes phases → weeks → sessions → exercises → change logs
    await db.delete(trainingSystems).where(eq(trainingSystems.id, id));

    logger.info({ userId, systemId: id, wasActive, newActiveSystemId, linkedConversationId, conversationDeleted }, "[training-system] DELETE /:id — deleted");

    res.json({ success: true, wasActive, newActiveSystemId, linkedConversationId, conversationDeleted });
  } catch (err) {
    logger.error({ err }, "[training-system] DELETE /:id error");
    res.status(500).json({ error: "Failed to delete training system" });
  }
});

// ─── POST /training-system/advance-week ───────────────────────────────────────
// Marks the current training week as completed and advances to the next week.
// If the completed week was the final one, marks the block as complete.
// Meant to be called both manually (from UI) and automatically (after session log).
// Body: { focusMode?: string } or query ?focus=
router.post("/training-system/advance-week", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof (req.body?.focusMode ?? req.query.focus) === "string"
      ? (req.body?.focusMode ?? req.query.focus)
      : null;
    const result = await advanceToNextWeek(userId, focusMode);
    if (!result) {
      res.status(404).json({ error: "No active training week to advance" });
      return;
    }
    // P0-5: fire week-transition retention email (idempotent, non-blocking)
    if (result.newWeek?.weekNumber) {
      fireWeekTransitionEmail(userId, result.newWeek.weekNumber).catch(() => {});
    }
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "[training-system] POST /advance-week error");
    res.status(500).json({ error: err.message ?? "Failed to advance week" });
  }
});

// ─── GET /training-system/block-completion ────────────────────────────────────
// Checks if the current 4-week block is complete and returns next-block recommendation
// Optional query param: ?focus=strength|speed|mobility
router.get("/training-system/block-completion", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof req.query.focus === "string" ? req.query.focus : null;
    const status = await getBlockCompletionStatus(userId, focusMode);
    res.json(status ?? { isComplete: false, completedPhase: null, nextRecommendation: null, blockChainIndex: 0 });
  } catch (err) {
    logger.error({ err }, "[training-system] GET /block-completion error");
    res.status(500).json({ error: "Failed to check block completion status" });
  }
});

// ─── POST /training-system/mark-block-complete ────────────────────────────────
// Manually marks the current block as completed (manual override)
// Body: { focusMode?: string } or query ?focus=
router.post("/training-system/mark-block-complete", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const focusMode = typeof (req.body?.focusMode ?? req.query.focus) === "string"
      ? (req.body?.focusMode ?? req.query.focus)
      : null;
    const result = await markBlockComplete(userId, focusMode);
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "[training-system] POST /mark-block-complete error");
    const statusCode = err.message?.includes("No") ? 404 : 500;
    res.status(statusCode).json({ error: err.message ?? "Failed to mark block as complete" });
  }
});

// ─── POST /training-system/continue-block ────────────────────────────────────
// Generates a new continuation block on the existing training system.
// Body: { mode: "next" | "repeat", adjustments?: string[], blockTypeOverride?: string, focusMode?: string }
router.post("/training-system/continue-block", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { mode, adjustments, blockTypeOverride, focusMode } = req.body ?? {};

    if (!mode || !["next", "repeat"].includes(mode)) {
      res.status(400).json({ error: "mode must be 'next' or 'repeat'" });
      return;
    }

    const resolvedFocusMode = typeof focusMode === "string" ? focusMode : null;
    const newPhase = await generateContinuationPhase(userId, { mode, adjustments, blockTypeOverride, focusMode: resolvedFocusMode });
    res.json({ success: true, newPhaseId: newPhase.id, phaseName: newPhase.name });
  } catch (err: any) {
    logger.error({ err }, "[training-system] POST /continue-block error");
    const statusCode = err.message?.includes("No") ? 404 : 500;
    res.status(statusCode).json({ error: err.message ?? "Failed to generate continuation block" });
  }
});

export default router;
