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
import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import { createChangeLogEntry } from "../lib/change-log-service";
import { buildAdaptationContext } from "../lib/adaptation";
import { listMemories, syncMemoriesFromData, extractMemoriesFromMessage } from "../lib/memory";
import { buildDecisionMemory } from "../lib/decision-memory-service";
import {
  getActiveTrainingSystem,
  getFullTrainingSystem,
  getTodaySession,
  getCurrentWeek,
  getBlockSummary,
} from "../lib/training-system-service";
import { trackLearningEvent } from "../lib/globalLearningService";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

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
): Promise<void> {
  try {
    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);

    if (!recentConvo) return;

    // Build the chat message content from the changeSummary, which already
    // includes the propagation note (e.g. "Applied to 3 matching future weeks.").
    const summary = editResult.changeSummary;
    const base = summary.endsWith(".") ? summary : `${summary}.`;

    const structuredData = JSON.stringify({
      _type: "system_edit",
      changeSummary: editResult.changeSummary,
      changedIds: editResult.changedIds,
      systemId,
      changeLogId,
      verificationStatus: editResult.verification.status,
      source: "programs_page",
      propagationSummary: editResult.propagationSummary ?? null,
    });

    await db.insert(messagesTable).values({
      conversationId: recentConvo.id,
      role: "assistant",
      content: base,
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
        propagationStatus: editResult.propagationSummary?.status ?? "none",
      },
      "[SystemEdit] Posted programs-page edit acknowledgment to chat"
    );
  } catch (err) {
    logger.warn({ err, userId }, "[SystemEdit] Failed to post edit ack to chat (non-fatal)");
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
  request: z.string().min(1).max(2000),
  targetContext: TargetContextSchema.optional(),
  source: z.enum(["ai_edit", "quick_action", "initialize", "auto_adjust"]).optional(),
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
  const { request: userRequest, targetContext, source = "ai_edit" } = parsed.data;
  const uiContext = (req.body as any)?.uiContext ?? null;

  try {
    // 1. Load active training system
    const activeSystem = await getActiveTrainingSystem(userId);
    if (!activeSystem) {
      res.status(404).json({ error: "No active training system found. Initialize your system first." });
      return;
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

    // 3. Interpret the edit request into a structured plan
    const editPlan = await interpretEditRequest(
      userRequest,
      fullSystem,
      targetContext,
      enrichedAdaptationContext,
      decisionMemory?.decisionMemoryContext || undefined
    );

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
      routeUsed: "deterministic",
      intentType: editPlan.intent,
      editSubtype: editPlan.scope,
      targetScope: targetContext?.type,
      uiPage: (uiContext as any)?.page,
      requestText: userRequest,
      metadata: { source, targetLabel: targetContext?.label },
    });

    // 4. Apply the edit plan to the database (with family propagation across weeks)
    const editResult = await applyEditPlan(editPlan, undefined, activeSystem.id);

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

    // 6. Echo the change to the user's most recent chat conversation so they see
    //    what was updated when they return to chat. Fire-and-forget.
    postEditAckToChat(userId, editResult, activeSystem.id, changeLogId).catch(() => {});

    // 7. Sync coach memories from the edit — same path as the conversation pipeline.
    //    Fire-and-forget: never block the response on memory operations.
    syncMemoriesFromData(userId).catch(() => {});
    if (userRequest.length > 10) {
      extractMemoriesFromMessage(userId, userRequest).catch(() => {});
    }

    // 7. Reload affected data to return fresh state
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
      propagationSummary: editResult.propagationSummary ?? null,
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
  }
});

export default router;
