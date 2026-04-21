/**
 * Training System Edit Routes — Phase 2 + Phase 3 + Phase 4 + Unified Intelligence
 *
 * POST /training-system/edit
 *   Accepts a natural language modification request with optional target context
 *   and optional UI context (page, selected session/exercise).
 *   Orchestrates: interpret → snapshot before → plan → apply → snapshot after
 *                 → persist change log → sync memories → respond.
 *
 * Phase 3: targetContext enables focused, object-level edits from the UI.
 * Phase 4: Every applied edit is recorded in system_change_log with before/after
 *           snapshots for full history and restore capability.
 * Unified: uiContext resolves spatial references ("this", "here") and triggers
 *           the same memory-sync path as the main conversation pipeline.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { interpretEditRequest, handleStructuredIntent, mapNLPToIntent, type CommandIntentKey } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import { createChangeLogEntry, type SystemSnapshot } from "../lib/change-log-service";
import { buildAdaptationContext } from "../lib/adaptation";
import { listMemories, syncMemoriesFromData, extractMemoriesFromMessage } from "../lib/memory";
import { generateCoachReasoning, type FocusMode } from "../lib/coach-reasoning-engine";
import { buildDecisionMemory } from "../lib/decision-memory-service";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
} from "../lib/training-system-service";
import { trackLearningEvent } from "../lib/globalLearningService";
import { db, conversationsTable, messagesTable, trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { createEditAdjustmentEvent } from "../lib/system-adjustment-service";
import { acquireFailSafeEditLock, logFailSafeAudit, resolveFailSafeState } from "../lib/fail-safe";

// ─── Diff computation ─────────────────────────────────────────────────────────

export interface EditDiff {
  changedExercises: Array<{ from: string; to: string }>;
  changedSetsRepsRest: Array<{ label: string; from: string; to: string }>;
  changedSessions: number;
  changedWeeks: number;
}

function computeSnapshotDiff(before: SystemSnapshot, after: SystemSnapshot): EditDiff {
  const changedExercises: Array<{ from: string; to: string }> = [];
  const changedSetsRepsRest: Array<{ label: string; from: string; to: string }> = [];

  for (const [id, afterEx] of Object.entries(after.exercises ?? {})) {
    const beforeEx = (before.exercises ?? {})[id];
    if (!beforeEx) continue;

    const afterName = String(afterEx.name ?? "");
    const beforeName = String(beforeEx.name ?? "");
    if (beforeName && afterName && beforeName !== afterName) {
      changedExercises.push({ from: beforeName, to: afterName });
    }

    const label = afterName || beforeName || "Exercise";
    if (beforeEx.sets != null && afterEx.sets != null && beforeEx.sets !== afterEx.sets) {
      changedSetsRepsRest.push({ label, from: `${beforeEx.sets} sets`, to: `${afterEx.sets} sets` });
    }
    if (beforeEx.reps != null && afterEx.reps != null && String(beforeEx.reps) !== String(afterEx.reps)) {
      changedSetsRepsRest.push({ label, from: String(beforeEx.reps), to: String(afterEx.reps) });
    }
    if (beforeEx.rest != null && afterEx.rest != null && beforeEx.rest !== afterEx.rest) {
      changedSetsRepsRest.push({ label, from: `${beforeEx.rest}s rest`, to: `${afterEx.rest}s rest` });
    }
  }

  return {
    changedExercises,
    changedSetsRepsRest,
    changedSessions: Object.keys(after.sessions ?? {}).length,
    changedWeeks: Object.keys(after.weeks ?? {}).length,
  };
}

// ─── Agent memory helpers ─────────────────────────────────────────────────────

export interface AgentMemory {
  activeEmphases: string[];
  activeConstraints: string[];
  activeBiases: string[];
  lastModifiers: Array<{ label: string; scope: string; appliedAt: string }>;
}

async function getSystemAndMetadata(userId: number) {
  const [system] = await db
    .select({ id: trainingSystems.id, metadata: trainingSystems.metadata })
    .from(trainingSystems)
    .where(eq(trainingSystems.userId, userId))
    .limit(1);
  return system ?? null;
}

/**
 * Posts an acknowledgment message to the user's most recent conversation so they
 * see what changed when they return to chat. Fire-and-forget — never blocks the
 * edit response.
 */
async function postEditAckToChat(
  userId: number,
  editResult: EditResult,
  systemId: number,
  changeLogId: number | undefined,
  diff?: EditDiff,
  focusMode?: string,
  intent?: string,
): Promise<number | null> {
  try {
    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);

    if (!recentConvo) return null;

    const summary = editResult.changeSummary;
    const base = summary.endsWith(".") ? summary : `${summary}.`;

    // Build a richer narrative from the diff if available
    const diffLines: string[] = [];
    if (diff) {
      if (diff.changedExercises.length > 0) {
        const swaps = diff.changedExercises.slice(0, 3).map((e) => `${e.from} → ${e.to}`).join(", ");
        diffLines.push(`Swapped: ${swaps}${diff.changedExercises.length > 3 ? ` +${diff.changedExercises.length - 3} more` : ""}.`);
      }
      if (diff.changedSetsRepsRest.length > 0) {
        const params = diff.changedSetsRepsRest.slice(0, 2).map((p) => `${p.label}: ${p.from} → ${p.to}`).join("; ");
        diffLines.push(`Updated: ${params}${diff.changedSetsRepsRest.length > 2 ? " and more" : ""}.`);
      }
      if (diff.changedSessions > 0) diffLines.push(`${diff.changedSessions} session${diff.changedSessions !== 1 ? "s" : ""} updated.`);
    }

    const content = diffLines.length > 0 ? `${base} ${diffLines.join(" ")}` : base;

    const coachReasoning = generateCoachReasoning({
      focusMode: (focusMode as FocusMode) ?? "strength",
      actionType: "edit",
      intent: intent ?? editResult.changeSummary,
    });

    const structuredData = JSON.stringify({
      _type: "system_edit",
      changeSummary: editResult.changeSummary,
      diff,
      changedIds: editResult.changedIds,
      systemId,
      changeLogId,
      verificationStatus: editResult.verification.status,
      source: "programs_page",
      propagationSummary: editResult.propagationSummary ?? null,
      coachReasoning,
    });

    await db.insert(messagesTable).values({
      conversationId: recentConvo.id,
      role: "assistant",
      content,
      structuredData,
    });

    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, recentConvo.id));

    logger.info(
      {
        userId,
        conversationId: recentConvo.id,
        changeSummary: editResult.changeSummary,
        diffItems: (diff?.changedExercises.length ?? 0) + (diff?.changedSetsRepsRest.length ?? 0),
        propagationStatus: editResult.propagationSummary?.status ?? "none",
      },
      "[SystemEdit] Posted programs-page edit acknowledgment to chat"
    );
    return recentConvo.id;
  } catch (err) {
    logger.warn({ err, userId }, "[SystemEdit] Failed to post edit ack to chat (non-fatal)");
    return null;
  }
}

const router: IRouter = Router();

const TargetContextSchema = z.object({
  type: z.enum(["exercise", "session", "week", "phase"]),
  id: z.number().int().positive(),
  label: z.string().optional(),
  parentLabel: z.string().optional(),
});

const EditRequestBody = z.object({
  request: z.string().max(2000).optional().default(""),
  intent: z.string().optional(),
  targetContext: TargetContextSchema.optional(),
  source: z.enum(["ai_edit", "quick_action", "initialize", "auto_adjust"]).optional(),
  focusMode: z.enum(["strength", "speed", "mobility"]).optional(),
}).refine((d) => d.intent || (d.request && d.request.length > 0), {
  message: "Either 'intent' or a non-empty 'request' is required.",
});

/** Builds a prompt hint from UIContext so the edit engine understands spatial references. */
function buildUIContextHint(uiContext: Record<string, any> | null | undefined): string | null {
  if (!uiContext) return null;
  const lines: string[] = [];
  if (uiContext.page) lines.push(`Current page: ${uiContext.page}`);
  if (uiContext.activeProgramName) lines.push(`Active program: "${uiContext.activeProgramName}"`);
  if (uiContext.selectedWeek != null) lines.push(`User is viewing Week ${uiContext.selectedWeek}`);
  if (uiContext.selectedSessionName) lines.push(`Selected session: "${uiContext.selectedSessionName}"`);
  if (uiContext.selectedExerciseName) lines.push(`Selected exercise: "${uiContext.selectedExerciseName}"`);
  if (lines.length === 0) return null;
  return [
    "## CURRENT USER CONTEXT",
    "The user is looking at:",
    ...lines.map((l) => `- ${l}`),
    "When the request says 'this', 'here', or a positional reference, resolve using the above context.",
  ].join("\n");
}

// ─── POST /training-system/edit ───────────────────────────────────────────────
router.post("/training-system/edit", requireAuth, async (req, res): Promise<void> => {
  const parsed = EditRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. 'request' field required." });
    return;
  }

  const userId = req.session.userId!;
  const { request: rawRequest, intent, targetContext, source = "ai_edit", focusMode } = parsed.data;
  const userRequest = rawRequest ?? "";
  const uiContext = (req.body as any)?.uiContext ?? null;
  // focusMode can also come from uiContext (chat path); body-level takes precedence
  const resolvedFocusMode: string | undefined = focusMode ?? (uiContext?.focusMode as string | undefined) ?? undefined;
  const editLock = acquireFailSafeEditLock(`route:${userId}:${resolvedFocusMode ?? "any"}`);
  if (!editLock.acquired) {
    const resolution = resolveFailSafeState({
      message: userRequest || intent || "edit",
      focusMode: resolvedFocusMode as any,
      activeProgram: null,
      action: "APPLY_MUTATION",
      intentType: "EDIT_PROGRAM",
      recentCommands: [
        { role: "user", content: userRequest || intent || "edit", createdAt: new Date() },
        { role: "user", content: userRequest || intent || "edit", createdAt: new Date() },
      ],
    });
    logFailSafeAudit(logger, { message: userRequest || intent || "edit", focusMode: resolvedFocusMode as any, action: "APPLY_MUTATION", intentType: "EDIT_PROGRAM" }, resolution);
    res.status(409).json({
      error: "Updating your program now. Send the next change after this one finishes so the edits land in order.",
      failSafe: resolution,
    });
    return;
  }

  try {
    // 1. Load active training system — FOCUS-SCOPED
    // If focusMode is provided, we MUST resolve to that focus's training system.
    // Never fall back to the last-created system regardless of focus.
    const activeSystem = await getActiveTrainingSystem(userId, resolvedFocusMode);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found. Initialize your system first." });
      return;
    }

    // ── FOCUS MISMATCH GUARD ────────────────────────────────────────────────
    // If a focusMode was explicitly requested, verify the resolved system matches.
    // Reject any edit that would mutate the wrong focus's program.
    if (resolvedFocusMode) {
      const systemFocus = ((activeSystem.metadata as any)?.focusMode ?? "strength") as string;
      if (systemFocus !== resolvedFocusMode) {
        logger.error(
          {
            userId,
            requestedFocus: resolvedFocusMode,
            resolvedFocus: systemFocus,
            resolvedTrainingSystemId: activeSystem.id,
            command: intent ?? userRequest,
          },
          "[FocusMismatchEditBlock] CRITICAL — edit would have mutated the wrong focus program. REJECTED."
        );
        res.status(409).json({
          error: `Focus mismatch: requested edit for '${resolvedFocusMode}' but resolved system is '${systemFocus}'. Edit rejected.`,
          requestedFocus: resolvedFocusMode,
          resolvedFocus: systemFocus,
        });
        return;
      }
    }

    // 2. Load full system with hierarchy + adaptation context + memories in parallel
    const [fullSystem, adaptationCtx, memories] = await Promise.all([
      getFullTrainingSystem(activeSystem.id),
      buildAdaptationContext(userId).catch(() => null),
      listMemories(userId).catch(() => []),
    ]);
    if (!fullSystem) {
      res.status(500).json({ error: "Failed to load training system data." });
      return;
    }

    const failSafeResolution = resolveFailSafeState({
      message: userRequest || intent || "edit",
      focusMode: resolvedFocusMode as any,
      activeProgram: activeSystem as any,
      action: "APPLY_MUTATION",
      intentType: "EDIT_PROGRAM",
      recentCommands: [{ role: "user", content: userRequest || intent || "edit", createdAt: new Date() }],
    });
    logFailSafeAudit(logger, { message: userRequest || intent || "edit", focusMode: resolvedFocusMode as any, activeProgram: activeSystem as any, action: "APPLY_MUTATION", intentType: "EDIT_PROGRAM" }, failSafeResolution);

    // ── STRUCTURED INTENT FAST PATH ─────────────────────────────────────────
    // If the caller passes an explicit intent, skip ALL NLP and route directly
    // to the deterministic intent handler. Zero OpenAI cost. Always succeeds.
    let resolvedIntent = intent;
    if (!resolvedIntent && userRequest) {
      const nlpMapped = mapNLPToIntent(userRequest);
      if (nlpMapped) resolvedIntent = nlpMapped;
    }

    let editPlan: Awaited<ReturnType<typeof interpretEditRequest>>;

    if (resolvedIntent) {
      logger.info(
        { userId, intent: resolvedIntent, source, targetType: targetContext?.type, targetId: targetContext?.id },
        "[SystemEdit] Structured intent detected — bypassing NLP"
      );
      editPlan = handleStructuredIntent(resolvedIntent as CommandIntentKey, fullSystem, targetContext);
    } else {
      // Build decision memory context
      const decisionMemory = await buildDecisionMemory(
        userId,
        activeSystem.id,
        memories
      ).catch(() => null);

      // Build UIContext hint and append to adaptationContext for the edit engine
      const uiHint = buildUIContextHint(uiContext);
      const enrichedAdaptationContext = [
        adaptationCtx?.promptContext || "",
        uiHint || "",
      ].filter(Boolean).join("\n\n") || undefined;

      // 3. Interpret the edit request into a structured plan via NLP
      editPlan = await interpretEditRequest(
        userRequest,
        fullSystem,
        targetContext,
        enrichedAdaptationContext,
        decisionMemory?.decisionMemoryContext || undefined
      );
    }

    logger.info(
      {
        userId, intent: editPlan.intent, scope: editPlan.scope,
        changesCount: editPlan.changes.length,
        targetType: targetContext?.type, targetId: targetContext?.id,
        hasUIContext: !!uiContext,
      },
      "[SystemEdit] Edit plan ready — applying"
    );

    // ── Learning signal: capture the edit request ──────────────────────────
    trackLearningEvent({
      userId,
      eventType: "edit_request",
      routeUsed: resolvedIntent ? "structured_intent" : "deterministic",
      intentType: editPlan.intent,
      editSubtype: editPlan.scope,
      targetScope: targetContext?.type,
      uiPage: (uiContext as any)?.page,
      requestText: resolvedIntent ? `[intent:${resolvedIntent}] ${userRequest}`.trim() : userRequest,
      metadata: { source, targetLabel: targetContext?.label, structuredIntent: resolvedIntent ?? null },
    });

    // 4. Apply the edit plan to the database (with family propagation across weeks)
    const editResult = await applyEditPlan(editPlan, undefined, activeSystem.id);

    // ── FOCUS-SCOPED EDIT AUDIT LOG ─────────────────────────────────────────
    const auditSystemFocus = ((activeSystem.metadata as any)?.focusMode ?? "strength") as string;
    logger.info(
      {
        surface: source,
        requestedFocus: resolvedFocusMode ?? "none",
        requestedTrainingSystemId: null,
        resolvedTrainingSystemId: activeSystem.id,
        resolvedFocus: auditSystemFocus,
        mismatchBlocked: false,
        editApplied: editResult.appliedCount > 0,
        appliedCount: editResult.appliedCount,
        intent: editPlan.intent,
        scope: editPlan.scope,
        userId,
      },
      "[FocusScopedEditAudit]"
    );

    // 5. Persist the change log entry
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
      logger.error({ logErr, userId }, "[SystemEdit] Failed to persist change log entry (non-fatal)");
    }

    // ── Learning signal: mutation succeeded ───────────────────────────────
    trackLearningEvent({
      userId,
      eventType: "mutation_success",
      routeUsed: "deterministic",
      intentType: editPlan.intent,
      editSubtype: editPlan.scope,
      targetScope: targetContext?.type,
      requestText: userRequest,
      mutationApplied: true,
      validatorPassed: true,
      metadata: {
        appliedCount: editResult.appliedCount,
        skippedCount: editResult.skippedCount,
        changeLogId,
      },
    });

    // ── System Adjustment Event — visible adaptation layer ─────────────────────
    createEditAdjustmentEvent({
      userId,
      trainingSystemId: activeSystem.id,
      focusMode: (auditSystemFocus as "strength" | "speed" | "mobility"),
      intent: editPlan.intent,
      scope: editPlan.scope,
      changeSummary: editResult.changeSummary,
      appliedCount: editResult.appliedCount,
    }).catch(() => {});

    // 6. Compute structured diff from before/after snapshots
    const diff = computeSnapshotDiff(editResult.beforeSnapshot, editResult.afterSnapshot);

    // Sync memories fire-and-forget — never block the response on memory ops.
    syncMemoriesFromData(userId).catch(() => {});
    if (userRequest.length > 10) {
      extractMemoriesFromMessage(userId, userRequest).catch(() => {});
    }

    // Echo the change to the user's most recent chat conversation AND reload
    // affected data in parallel so neither blocks the other.
    const coachReasoning = generateCoachReasoning({
      focusMode: (auditSystemFocus as FocusMode) ?? "strength",
      actionType: "edit",
      intent: editPlan.intent,
      scope: editPlan.scope,
    });

    const [chatConversationId, today, week, block] = await Promise.all([
      postEditAckToChat(userId, editResult, activeSystem.id, changeLogId, diff, auditSystemFocus, editPlan.intent).catch(() => null),
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
      diff,
      propagationSummary: editResult.propagationSummary ?? null,
      chatConversationId: chatConversationId ?? null,
      coachReasoning,
      updatedData: { today, week, block },
    });
  } catch (err) {
    logger.error({ err, userId, userRequest }, "[SystemEdit] Training system edit failed");

    // ── Learning signal: mutation failed ──────────────────────────────────
    trackLearningEvent({
      userId,
      eventType: "mutation_failure",
      routeUsed: "deterministic",
      requestText: userRequest,
      mutationApplied: false,
      validatorPassed: false,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });

    res.status(500).json({ error: "Failed to process edit request." });
  } finally {
    editLock.release();
  }
});

// ─── GET /training-system/agent-memory ───────────────────────────────────────
// Returns the persisted AgentMemory from training_systems.metadata.agentMemory
router.get("/training-system/agent-memory", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const system = await getSystemAndMetadata(userId);
    if (!system) { res.json({ agentMemory: null }); return; }
    const meta = (system.metadata ?? {}) as Record<string, unknown>;
    res.json({ agentMemory: (meta.agentMemory ?? null) as AgentMemory | null });
  } catch (err) {
    logger.warn({ err, userId }, "[AgentMemory] Failed to fetch agent memory");
    res.json({ agentMemory: null });
  }
});

// ─── PATCH /training-system/agent-memory ─────────────────────────────────────
// Merges the provided fields into training_systems.metadata.agentMemory
const AgentMemoryPatchSchema = z.object({
  agentMemory: z.object({
    activeEmphases: z.array(z.string()).optional(),
    activeConstraints: z.array(z.string()).optional(),
    activeBiases: z.array(z.string()).optional(),
    lastModifiers: z.array(z.object({
      label: z.string(),
      scope: z.string(),
      appliedAt: z.string(),
    })).optional(),
  }),
});

router.patch("/training-system/agent-memory", requireAuth, async (req, res): Promise<void> => {
  const parsed = AgentMemoryPatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const userId = req.session.userId!;
  const { agentMemory: patch } = parsed.data;

  try {
    const system = await getSystemAndMetadata(userId);
    if (!system) { res.status(404).json({ error: "No training system found" }); return; }

    const meta = (system.metadata ?? {}) as Record<string, unknown>;
    const existing = (meta.agentMemory ?? {}) as Record<string, unknown>;
    const merged: AgentMemory = {
      activeEmphases: (patch.activeEmphases ?? existing.activeEmphases ?? []) as string[],
      activeConstraints: (patch.activeConstraints ?? existing.activeConstraints ?? []) as string[],
      activeBiases: (patch.activeBiases ?? existing.activeBiases ?? []) as string[],
      lastModifiers: (patch.lastModifiers ?? existing.lastModifiers ?? []) as AgentMemory["lastModifiers"],
    };

    await db
      .update(trainingSystems)
      .set({ metadata: { ...meta, agentMemory: merged } as any })
      .where(eq(trainingSystems.id, system.id));

    res.json({ ok: true, agentMemory: merged });
  } catch (err) {
    logger.error({ err, userId }, "[AgentMemory] Failed to patch agent memory");
    res.status(500).json({ error: "Failed to update agent memory" });
  }
});

// ─── POST /training-system/session-start ─────────────────────────────────────
// Called when the user taps "Start Session". Posts a chat acknowledgment with
// today's session summary. Never fails — returns { ok: true } regardless.
router.post("/training-system/session-start", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const todaySession = await getTodaySession(userId);
    const sessionLabel = (todaySession as any)?.label ?? "Today's session";
    const exercises = (todaySession as any)?.exercises ?? [];
    const exerciseCount: number = exercises.length;

    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);

    if (recentConvo) {
      const parts: string[] = [`Let's go — ${sessionLabel} is locked in.`];
      if (exerciseCount > 0) {
        parts.push(`${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""} on deck.`);
      }
      parts.push("Log your session when you're done and I'll update your plan.");

      const structuredData = JSON.stringify({
        _type: "session_started",
        sessionLabel,
        exerciseCount,
      });

      await db.insert(messagesTable).values({
        conversationId: recentConvo.id,
        role: "assistant",
        content: parts.join(" "),
        structuredData,
      });

      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, recentConvo.id));
    }

    res.json({ ok: true, sessionLabel, exerciseCount });
  } catch (err) {
    logger.warn({ err, userId }, "[session-start] Non-fatal error posting session start ack");
    res.json({ ok: true }); // Always succeed — UI state must not block on this
  }
});

export default router;
