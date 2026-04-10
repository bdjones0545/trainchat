import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, type ProgramStructure } from "../lib/ai";
import { classifyIntent, logIntentSummary, type IntentResult } from "../lib/intent";
import { resolveAction, logDecisionSummary } from "../lib/decision";
import {
  selectResponseMode,
  formatShortCircuitResponse,
} from "../lib/response-templates";
import {
  transformProgram,
  resolveTransformType,
  buildTransformPromptHint,
  type TransformRequest,
} from "../lib/split-transform";
import { buildAdaptationContext } from "../lib/adaptation";
import { syncMemoriesFromData, listMemories, buildMemoryContext } from "../lib/memory";
import { generateInsights, buildInsightPromptHint } from "../lib/insights";
import { getUserPlanInfo } from "../lib/planGating";
import { stripeStorage } from "../lib/stripeStorage";
import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import { createChangeLogEntry } from "../lib/change-log-service";
import { getActiveTrainingSystem, getFullTrainingSystem, createTrainingSystemFromProgram, upsertTrainingSystemFromProgram } from "../lib/training-system-service";
import { buildDecisionMemory } from "../lib/decision-memory-service";
import { logger } from "../lib/logger";
import { buildStageEvent, type BuildStage } from "../lib/build-pipeline";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the most recent valid structured program from a conversation's message history.
 * Searches backwards through assistant messages for the latest program JSON.
 * Skips system_edit markers (they are not draft programs).
 */
function resolveCurrentProgram(
  history: Array<{ role: string; structuredData?: string | null }>
): ProgramStructure | null {
  const assistantMessages = [...history]
    .reverse()
    .filter((m) => m.role === "assistant" && m.structuredData);

  for (const msg of assistantMessages) {
    if (!msg.structuredData) continue;
    try {
      const data = typeof msg.structuredData === "string"
        ? JSON.parse(msg.structuredData)
        : msg.structuredData;
      // Skip system_edit markers
      if (data?._type === "system_edit") continue;
      if (data?.days && Array.isArray(data.days) && data.days.length > 0) {
        return data as ProgramStructure;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
}

/**
 * Returns true if the intent should trigger a direct edit of the real training system.
 * EDIT_PROGRAM, ADJUST_FOR_PAIN, and ADJUST_FOR_READINESS all modify existing program
 * structure — the vibe edit engine handles all three through the Change Engine pipeline.
 */
function isVibeEditIntent(intentResult: IntentResult): boolean {
  return (
    intentResult.type === "EDIT_PROGRAM" ||
    intentResult.type === "ADJUST_FOR_PAIN" ||
    intentResult.type === "ADJUST_FOR_READINESS"
  );
}

/**
 * Builds a coaching-toned confirmation message after a successful system edit.
 * Uses the edit plan's changeSummary and applied count to create a concise, clear response.
 */
function buildVibeEditCoachingResponse(editResult: EditResult): string {
  const summary = editResult.changeSummary;
  const skipped = editResult.skippedCount;
  const base = summary.endsWith(".") ? summary : `${summary}.`;
  const suffix = skipped > 0
    ? ` (${skipped} change${skipped > 1 ? "s" : ""} could not be applied.)`
    : "";
  return `${base}${suffix}\n\nYour training system is updated — the change is live now.`;
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const convos = await db
    .select({
      id: conversationsTable.id,
      userId: conversationsTable.userId,
      title: conversationsTable.title,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .orderBy(desc(conversationsTable.updatedAt));

  const result = await Promise.all(
    convos.map(async (c) => {
      const [{ msgCount }] = await db
        .select({ msgCount: count() })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, c.id));

      const [lastMsg] = await db
        .select({ content: messagesTable.content })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, c.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);

      return {
        id: c.id,
        userId: c.userId,
        title: c.title,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messageCount: Number(msgCount),
        lastMessage: lastMsg?.content?.slice(0, 100) ?? null,
      };
    })
  );

  res.json(result);
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [convo] = await db.insert(conversationsTable).values({
    userId,
    title: parsed.data.title,
  }).returning();

  res.status(201).json({
    id: convo.id,
    userId: convo.userId,
    title: convo.title,
    createdAt: convo.createdAt.toISOString(),
    updatedAt: convo.updatedAt.toISOString(),
    messageCount: 0,
    lastMessage: null,
  });
});

router.get("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  if (!convo || convo.userId !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [{ msgCount }] = await db
    .select({ msgCount: count() })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convo.id));

  res.json({
    id: convo.id,
    userId: convo.userId,
    title: convo.title,
    createdAt: convo.createdAt.toISOString(),
    updatedAt: convo.updatedAt.toISOString(),
    messageCount: Number(msgCount),
    lastMessage: null,
  });
});

router.delete("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, params.data.id));

  if (!convo || convo.userId !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.delete(conversationsTable).where(eq(conversationsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, params.data.id));

  if (!convo || convo.userId !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  res.json(messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    structuredData: m.structuredData ?? null,
  })));
});

router.post("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;

  // --- Plan gating ---
  let planInfo = await getUserPlanInfo(userId).catch(() => null);
  if (planInfo && !planInfo.canSendMessage) {
    res.status(402).json({
      error: "MESSAGE_LIMIT_REACHED",
      message:
        planInfo.plan === "free"
          ? `You've used your 5 free interactions. Upgrade to keep training with your AI coach.`
          : `You've reached your monthly message limit. Upgrade to Pro for unlimited access.`,
      plan: planInfo.plan,
      messageCount: planInfo.messageCount,
      messagesRemaining: 0,
    });
    return;
  }

  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, params.data.id));

  if (!convo || convo.userId !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Save user message
  const [userMessage] = await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "user",
    content: parsed.data.content,
  }).returning();

  // Auto-title from first message
  const existingMessages = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id));

  if (existingMessages.length === 1) {
    const autoTitle = parsed.data.content.slice(0, 60).trim() + (parsed.data.content.length > 60 ? "…" : "");
    await db.update(conversationsTable)
      .set({ title: autoTitle, updatedAt: new Date() })
      .where(eq(conversationsTable.id, params.data.id));
  }

  // Get history
  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  const isPro = planInfo?.features.adaptationContext ?? false;
  const hasMemory = planInfo?.features.memoryContext ?? false;

  let adaptationCtx = "";
  let memoryCtx = "";
  let insightHint = "";

  if (isPro) {
    const [adaptation, memories] = await Promise.all([
      buildAdaptationContext(userId).catch(() => ({ promptContext: "" })),
      listMemories(userId).catch(() => []),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = buildMemoryContext(memories);
    const insights = await generateInsights(userId, memories).catch(() => []);
    insightHint = buildInsightPromptHint(insights);

    syncMemoriesFromData(userId).catch(() => {});
  }

  // Agent-driven conversion hint for free/starter users
  let conversionHint = "";
  if (planInfo?.plan === "free") {
    const remaining = planInfo.messagesRemaining ?? 0;
    conversionHint = `
## COACHING CONTEXT (internal)
This athlete is on the free access tier with ${remaining} interaction${remaining === 1 ? "" : "s"} remaining.
When it feels natural — especially when discussing program details, progress tracking, or long-term planning — mention capabilities like adaptive training, session memory, and program evolution that you can offer them as they progress.
Keep it helpful and intelligent, never promotional.`;
  }

  // ── Phase A: Intent Classification & Request Routing ─────────────────────

  // Load both conversation history program AND DB system in parallel.
  // This is critical for cross-conversation continuity: if the user opens a new
  // chat while having an existing program in the DB, the intent classifier must
  // know a program exists so it routes edit requests correctly.
  const [latestStructuredProgram, activeSystem] = await Promise.all([
    Promise.resolve(resolveCurrentProgram(history)),
    getActiveTrainingSystem(userId).catch(() => null),
  ]);

  const hasActiveProgram = latestStructuredProgram !== null;
  const hasActiveSystem = activeSystem !== null;

  // For intent classification, combine both signals: a program exists if it's
  // in either the conversation history OR the live DB system.
  const hasAnyProgram = hasActiveProgram || hasActiveSystem;

  // Classify the intent — this is the single source of truth for routing
  const intentResult = classifyIntent(parsed.data.content, {
    hasActiveProgram: hasAnyProgram,
    conversationTurnCount: history.filter((m) => m.role === "user").length,
  });

  logIntentSummary(parsed.data.content, intentResult, hasAnyProgram);

  // ── Decision Tree: resolve action type, preservation rules, and infer-vs-ask ──
  const actionDecision = resolveAction(intentResult, latestStructuredProgram, parsed.data.content);
  logDecisionSummary(parsed.data.content, intentResult, actionDecision, hasActiveProgram);

  // ── Response Mode Selection — determines how this response will be formatted ──
  const responseMode = selectResponseMode(actionDecision.actionType);

  // ── Intent-specific routing ───────────────────────────────────────────────

  // RETRIEVE_CURRENT_PROGRAM — no AI call needed, return current program directly
  if (intentResult.type === "RETRIEVE_CURRENT_PROGRAM" && latestStructuredProgram) {
    logger.info("[IntentRouter] Handling RETRIEVE_CURRENT_PROGRAM — returning current program without AI call");
    const retrieveContent = formatShortCircuitResponse({
      mode: "EXECUTION_RESPONSE",
      hasActiveProgram: true,
    });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: retrieveContent,
      structuredData: JSON.stringify(latestStructuredProgram),
    }).returning();

    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

    res.json({
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt.toISOString(),
        structuredData: null,
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
        structuredData: assistantMessage.structuredData ?? null,
      },
      planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
      intentDebug: { type: intentResult.type, confidence: intentResult.confidence },
    });
    return;
  }

  // RETRIEVE_CURRENT_PROGRAM but no program exists — fall through to AI
  if (intentResult.type === "RETRIEVE_CURRENT_PROGRAM" && !latestStructuredProgram) {
    logger.info("[IntentRouter] RETRIEVE_CURRENT_PROGRAM but no program found — routing to AI to explain");
  }

  // ASK_CLARIFYING_QUESTION — decision tree determined the request is genuinely ambiguous.
  // Skip AI call entirely; return the pre-formed question as the assistant response.
  if (actionDecision.shouldAsk && actionDecision.clarifyingQuestion) {
    logger.info(
      { actionType: actionDecision.actionType, question: actionDecision.clarifyingQuestion },
      "[DecisionTree] Returning clarifying question — skipping AI call"
    );
    const clarifyContent = formatShortCircuitResponse({
      mode: "CLARIFICATION_RESPONSE",
      hasActiveProgram,
      clarifyingQuestion: actionDecision.clarifyingQuestion,
    });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: clarifyContent,
      structuredData: null,
    }).returning();

    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

    res.json({
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt.toISOString(),
        structuredData: null,
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
        structuredData: null,
      },
      planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
      intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
      actionDebug: { actionType: actionDecision.actionType, shouldAsk: true, inferenceRationale: actionDecision.inferenceRationale },
    });
    return;
  }

  // SAVE_PROGRAM — respond with save signal (frontend handles actual save)
  if (intentResult.type === "SAVE_PROGRAM") {
    logger.info("[IntentRouter] Handling SAVE_PROGRAM — responding with save confirmation");
    const saveContent = formatShortCircuitResponse({
      mode: "EXECUTION_RESPONSE",
      hasActiveProgram: !!latestStructuredProgram,
    });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: saveContent,
      structuredData: latestStructuredProgram ? JSON.stringify(latestStructuredProgram) : null,
    }).returning();

    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

    res.json({
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt.toISOString(),
        structuredData: null,
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt.toISOString(),
        structuredData: assistantMessage.structuredData ?? null,
      },
      planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
      intentDebug: { type: intentResult.type, confidence: intentResult.confidence },
      triggerSave: !!latestStructuredProgram,
    });
    return;
  }

  // ── VIBE EDIT MODE ────────────────────────────────────────────────────────
  // If the user has an active training system in the DB AND the intent is a
  // system edit (EDIT_PROGRAM or ADJUST_FOR_PAIN), bypass the draft-program chat
  // flow and directly edit the real training system. This is the "vibe coding" UX.
  if (hasActiveSystem && isVibeEditIntent(intentResult)) {
    logger.info(
      { userId, systemId: activeSystem!.id, intentType: intentResult.type, editSubtype: intentResult.editSubtype },
      "[VibeEdit] Entering vibe edit mode — editing real training system from chat"
    );

    try {
      // Load full system + decision memory in parallel
      const [fullSystem, decisionMemory] = await Promise.all([
        getFullTrainingSystem(activeSystem!.id),
        buildDecisionMemory(activeSystem!.id, userId).catch(() => null),
      ]);

      if (!fullSystem) {
        logger.warn({ systemId: activeSystem!.id }, "[VibeEdit] Could not load full system — falling back to AI");
        // Fall through to regular AI response below
      } else {
        // Interpret + apply the edit
        const editPlan = await interpretEditRequest(
          parsed.data.content,
          fullSystem,
          undefined,
          adaptationCtx || undefined,
          decisionMemory?.decisionMemoryContext || undefined,
        );

        logger.info(
          { intent: editPlan.intent, scope: editPlan.scope, changes: editPlan.changes.length },
          "[VibeEdit] Edit plan generated"
        );

        const editResult = await applyEditPlan(editPlan);

        logger.info(
          { applied: editResult.appliedCount, skipped: editResult.skippedCount, summary: editResult.changeSummary },
          "[VibeEdit] Edit plan applied"
        );

        if (editResult.appliedCount > 0) {
          // Log the change to system_change_log
          const changeLogId = await createChangeLogEntry({
            userId,
            trainingSystemId: activeSystem!.id,
            source: "ai_edit",
            intent: editPlan.intent,
            scope: editPlan.scope,
            changeSummary: editResult.changeSummary,
            requestText: parsed.data.content,
            beforeSnapshot: editResult.beforeSnapshot,
            afterSnapshot: editResult.afterSnapshot,
            appliedCount: editResult.appliedCount,
            skippedCount: editResult.skippedCount,
          });

          // Build coaching response confirming the change
          const coachingContent = buildVibeEditCoachingResponse(editResult);

          // Store the systemEdit marker in structuredData so MessageBubble
          // can render a SystemUpdateCard in the conversation history
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: editResult.changeSummary,
            changedIds: editResult.changedIds,
            systemId: activeSystem!.id,
            changeLogId,
          };

          const [assistantMessage] = await db.insert(messagesTable).values({
            conversationId: params.data.id,
            role: "assistant",
            content: coachingContent,
            structuredData: JSON.stringify(systemEditData),
          }).returning();

          await db.update(conversationsTable)
            .set({ updatedAt: new Date() })
            .where(eq(conversationsTable.id, params.data.id));

          if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
            stripeStorage.incrementMessageCount(userId).catch(() => {});
          }

          res.json({
            userMessage: {
              id: userMessage.id,
              conversationId: userMessage.conversationId,
              role: userMessage.role,
              content: userMessage.content,
              createdAt: userMessage.createdAt.toISOString(),
              structuredData: null,
            },
            assistantMessage: {
              id: assistantMessage.id,
              conversationId: assistantMessage.conversationId,
              role: assistantMessage.role,
              content: assistantMessage.content,
              createdAt: assistantMessage.createdAt.toISOString(),
              structuredData: assistantMessage.structuredData ?? null,
            },
            planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
            intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
            systemEdit: {
              applied: true,
              changeSummary: editResult.changeSummary,
              changedIds: editResult.changedIds,
              systemId: activeSystem!.id,
              changeLogId,
            },
          });
          return;
        }

        // Edit plan produced no applied changes — fall through to AI response
        logger.warn(
          { intent: editPlan.intent, skipped: editResult.skippedCount },
          "[VibeEdit] No changes applied — falling back to AI response"
        );
      }
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[VibeEdit] Edit pipeline failed — falling back to AI");
      // Fall through to regular AI response
    }
  }

  // ── Standard AI Response Path ─────────────────────────────────────────────

  // For all modification and retrieval intents, pass the current program state.
  // Change Engine rule: the AI must always operate from the current active program.
  // EDIT_PROGRAM, ADJUST_FOR_PAIN, ADJUST_FOR_READINESS, and RETRIEVE all need it.
  const isModificationIntent = (
    intentResult.type === "EDIT_PROGRAM" ||
    intentResult.type === "ADJUST_FOR_PAIN" ||
    intentResult.type === "ADJUST_FOR_READINESS" ||
    intentResult.type === "RETRIEVE_CURRENT_PROGRAM"
  );
  const currentProgram = isModificationIntent ? latestStructuredProgram : null;

  // ── STRUCTURAL_REBUILD pre-transform ──────────────────────────────────────
  // When the decision tree resolves a STRUCTURAL_REBUILD, run the transformation
  // engine before calling the AI. The AI then gets the already-transformed program
  // and just writes the coach confirmation — no structural guesswork needed.
  let preTransformedProgram: ProgramStructure | null = currentProgram;
  let transformHint: string | null = null;

  if (actionDecision.actionType === "STRUCTURAL_REBUILD" && currentProgram) {
    const meta = intentResult.metadata as {
      targetSplit?: string;
      targetDays?: number | null;
      targetGoalShift?: string | null;
    } | undefined;

    const targetSplit = meta?.targetSplit ?? "unknown";
    const targetDays = meta?.targetDays ?? null;
    const targetGoalShift = meta?.targetGoalShift ?? null;

    const transformType = resolveTransformType(
      targetSplit,
      targetDays,
      targetGoalShift,
      currentProgram.days.length,
    );

    const transformRequest: TransformRequest = {
      type: transformType,
      targetDays: targetDays ?? currentProgram.days.length,
      rawRequest: parsed.data.content,
    };

    try {
      const result = transformProgram(currentProgram, transformRequest);
      preTransformedProgram = result.program;
      transformHint = buildTransformPromptHint(result.log);
      logger.info(
        {
          transformType,
          resultingSplit: result.log.resultingSplit,
          preserved: result.log.preservedExercises.length,
          removed: result.log.removedExercises.length,
        },
        "[ConversationRouter] Pre-transform complete — passing to AI for confirmation"
      );
    } catch (err) {
      logger.error({ err }, "[ConversationRouter] Split transform failed — falling back to AI-only structural edit");
      // preTransformedProgram stays as currentProgram; AI handles it
    }
  }

  const { content: aiContent, structuredData } = await generateAIResponse(
    parsed.data.content,
    history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    userId,
    {
      adaptationContext: adaptationCtx || undefined,
      memoryContext: (hasMemory && memoryCtx) ? memoryCtx : undefined,
      insightHint: insightHint || undefined,
      conversionHint: conversionHint || undefined,
      currentProgram: preTransformedProgram,
      intentResult,
      actionDecision,
      transformHint: transformHint || undefined,
      responseMode,
    }
  );

  // Warn if EDIT_PROGRAM was routed but no structured data returned
  if (intentResult.type === "EDIT_PROGRAM" && currentProgram && !structuredData) {
    logger.warn("[IntentRouter] EDIT_PROGRAM intent with program context, but AI did not return updated JSON. Right panel will NOT update.");
  }

  const [assistantMessage] = await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "assistant",
    content: aiContent,
    structuredData: structuredData ? JSON.stringify(structuredData) : null,
  }).returning();

  await db.update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, params.data.id));

  // ── Auto-save / Auto-update program (Change Engine) ───────────────────────
  // When the AI returns a valid program, persist it via upsert:
  //   • first program → creates a new training system
  //   • existing program → updates the system IN PLACE (same ID, change logged)
  // This is the core of the Change Engine: the program is a living state,
  // not regenerated from scratch on each message.
  let systemSaved = false;
  let autoSavedSystemId: number | undefined;
  let changeLogId: number | undefined;

  if (structuredData && Array.isArray(structuredData.days) && structuredData.days.length > 0) {
    try {
      const { system: savedSystem, isUpdate } = await upsertTrainingSystemFromProgram(userId, structuredData);
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      if (isUpdate) {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[ChangeEngine] Active program updated in place"
        );

        // Log what changed to the change log so the Changes tab shows it
        if (structuredData.whatChanged) {
          try {
            const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
            changeLogId = await createChangeLogEntry({
              userId,
              trainingSystemId: savedSystem.id,
              source: "ai_edit",
              intent: intentResult.editSubtype ?? intentResult.type.toLowerCase(),
              scope: "system",
              changeSummary: structuredData.whatChanged,
              requestText: parsed.data.content.slice(0, 300),
              beforeSnapshot: emptySnapshot,
              afterSnapshot: emptySnapshot,
              appliedCount: 1,
              skippedCount: 0,
              decisionMetadata: structuredData.whyChanged
                ? { whyChanged: structuredData.whyChanged, intentType: intentResult.type }
                : { intentType: intentResult.type },
            });
          } catch (logErr) {
            logger.warn({ logErr }, "[ChangeEngine] Failed to write AI change log entry — non-fatal");
          }
        }
      } else {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[AutoSave] New training system created from program"
        );
      }
    } catch (err) {
      logger.error({ err, userId }, "[AutoSave] Failed to save training system — user can still save manually");
    }
  }

  // Increment message count for free/starter users
  if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
    stripeStorage.incrementMessageCount(userId).catch(() => {});
  }

  res.json({
    userMessage: {
      id: userMessage.id,
      conversationId: userMessage.conversationId,
      role: userMessage.role,
      content: userMessage.content,
      createdAt: userMessage.createdAt.toISOString(),
      structuredData: null,
    },
    assistantMessage: {
      id: assistantMessage.id,
      conversationId: assistantMessage.conversationId,
      role: assistantMessage.role,
      content: assistantMessage.content,
      createdAt: assistantMessage.createdAt.toISOString(),
      structuredData: assistantMessage.structuredData ?? null,
    },
    planInfo: planInfo
      ? {
          plan: planInfo.plan,
          messagesRemaining: planInfo.messagesRemaining,
        }
      : null,
    intentDebug: {
      type: intentResult.type,
      confidence: intentResult.confidence,
      editSubtype: intentResult.editSubtype ?? null,
    },
    actionDebug: {
      actionType: actionDecision.actionType,
      shouldAsk: actionDecision.shouldAsk,
      inferenceRationale: actionDecision.inferenceRationale,
      recommendedMaxTokens: actionDecision.recommendedMaxTokens,
    },
    systemSaved,
    systemId: autoSavedSystemId,
  });
});

// ─── SSE Streaming Endpoint ───────────────────────────────────────────────────
// POST /api/conversations/:id/messages/stream
// Mirrors the standard send-message handler but streams Server-Sent Events so
// the UI can show live thinking/progress states instead of waiting for the full
// response. Same business logic, same routing rules — just with emit() calls at
// key checkpoints.

router.post("/conversations/:id/messages/stream", requireAuth, async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // ── SSE setup ─────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function emit(event: Record<string, unknown>): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // client disconnected
    }
  }

  function done(event: Record<string, unknown>): void {
    emit(event);
    res.end();
  }

  const userId = req.session.userId!;

  // ── Plan gating ───────────────────────────────────────────────────────────
  let planInfo = await getUserPlanInfo(userId).catch(() => null);
  if (planInfo && !planInfo.canSendMessage) {
    done({
      type: "error",
      status: 402,
      message:
        planInfo.plan === "free"
          ? "You've used your 5 free interactions. Upgrade to keep training with your AI coach."
          : "You've reached your monthly message limit. Upgrade to Pro for unlimited access.",
    });
    return;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));

  if (!convo || convo.userId !== userId) {
    done({ type: "error", status: 404, message: "Conversation not found" });
    return;
  }

  // Save user message
  const [userMessage] = await db
    .insert(messagesTable)
    .values({ conversationId: params.data.id, role: "user", content: parsed.data.content })
    .returning();

  // Auto-title on first message
  const existingMessages = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id));
  if (existingMessages.length === 1) {
    const autoTitle = parsed.data.content.slice(0, 60).trim() + (parsed.data.content.length > 60 ? "…" : "");
    await db
      .update(conversationsTable)
      .set({ title: autoTitle, updatedAt: new Date() })
      .where(eq(conversationsTable.id, params.data.id));
  }

  // ── Emit immediate acknowledgment (Stage 1: Understand Request) ───────────
  emit({ type: "acknowledged", text: "On it." });
  emit(buildStageEvent("understanding"));

  // ── Stage 2: Load Program State ──────────────────────────────────────────
  // Fetch conversation history and pro context before loading program state
  emit(buildStageEvent("loading"));

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  const isPro = planInfo?.features.adaptationContext ?? false;
  const hasMemory = planInfo?.features.memoryContext ?? false;

  let adaptationCtx = "";
  let memoryCtx = "";
  let insightHint = "";

  if (isPro) {
    const [adaptation, memories] = await Promise.all([
      buildAdaptationContext(userId).catch(() => ({ promptContext: "" })),
      listMemories(userId).catch(() => []),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = buildMemoryContext(memories);
    const insights = await generateInsights(userId, memories).catch(() => []);
    insightHint = buildInsightPromptHint(insights);
    syncMemoriesFromData(userId).catch(() => {});
  }

  let conversionHint = "";
  if (planInfo?.plan === "free") {
    const remaining = planInfo.messagesRemaining ?? 0;
    conversionHint = `\n## COACHING CONTEXT (internal)\nThis athlete is on the free access tier with ${remaining} interaction${remaining === 1 ? "" : "s"} remaining.\nWhen it feels natural — especially when discussing program details, progress tracking, or long-term planning — mention capabilities like adaptive training, session memory, and program evolution that you can offer them as they progress.\nKeep it helpful and intelligent, never promotional.`;
  }

  // ── Stage 3: Classify Change Type ────────────────────────────────────────
  // Load active program + system in parallel, then classify intent
  const [latestStructuredProgram, activeSystem] = await Promise.all([
    Promise.resolve(resolveCurrentProgram(history)),
    getActiveTrainingSystem(userId).catch(() => null),
  ]);

  const hasActiveProgram = latestStructuredProgram !== null;
  const hasActiveSystem = activeSystem !== null;
  const hasAnyProgram = hasActiveProgram || hasActiveSystem;

  const intentResult = classifyIntent(parsed.data.content, {
    hasActiveProgram: hasAnyProgram,
    conversationTurnCount: history.filter((m) => m.role === "user").length,
  });

  logIntentSummary(parsed.data.content, intentResult, hasAnyProgram);

  const actionDecision = resolveAction(intentResult, latestStructuredProgram, parsed.data.content);
  logDecisionSummary(parsed.data.content, intentResult, actionDecision, hasActiveProgram);

  const responseMode = selectResponseMode(actionDecision.actionType);

  // Emit classifying stage — intent is now known
  emit(buildStageEvent("classifying", intentResult.type));

  // ── Helper: build the final SSE complete response ─────────────────────────
  function buildCompleteEvent(opts: {
    userMsg: typeof userMessage;
    assistantMsg: { id: number; conversationId: number; role: string; content: string; createdAt: Date; structuredData: string | null };
    planInfoVal: typeof planInfo;
    intentResultVal: typeof intentResult;
    systemSavedVal: boolean;
    systemIdVal?: number;
    systemEditVal?: { applied: boolean };
  }) {
    return {
      type: "complete",
      userMessage: {
        id: opts.userMsg.id,
        conversationId: opts.userMsg.conversationId,
        role: opts.userMsg.role,
        content: opts.userMsg.content,
        createdAt: opts.userMsg.createdAt.toISOString(),
        structuredData: null,
      },
      assistantMessage: {
        id: opts.assistantMsg.id,
        conversationId: opts.assistantMsg.conversationId,
        role: opts.assistantMsg.role,
        content: opts.assistantMsg.content,
        createdAt: opts.assistantMsg.createdAt.toISOString(),
        structuredData: opts.assistantMsg.structuredData ?? null,
      },
      planInfo: opts.planInfoVal
        ? { plan: opts.planInfoVal.plan, messagesRemaining: opts.planInfoVal.messagesRemaining }
        : null,
      intentDebug: {
        type: opts.intentResultVal.type,
        confidence: opts.intentResultVal.confidence,
        editSubtype: opts.intentResultVal.editSubtype ?? null,
      },
      systemSaved: opts.systemSavedVal,
      systemId: opts.systemIdVal,
      systemEdit: opts.systemEditVal,
    };
  }

  // ── Short-circuit: RETRIEVE_CURRENT_PROGRAM ───────────────────────────────
  if (intentResult.type === "RETRIEVE_CURRENT_PROGRAM" && latestStructuredProgram) {
    const retrieveContent = formatShortCircuitResponse({ mode: "EXECUTION_RESPONSE", hasActiveProgram: true });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: retrieveContent,
      structuredData: JSON.stringify(latestStructuredProgram),
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false }));
    return;
  }

  // ── Short-circuit: ASK_CLARIFYING_QUESTION ────────────────────────────────
  if (actionDecision.shouldAsk && actionDecision.clarifyingQuestion) {
    const clarifyContent = formatShortCircuitResponse({ mode: "CLARIFICATION_RESPONSE", hasActiveProgram, clarifyingQuestion: actionDecision.clarifyingQuestion });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: clarifyContent, structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false }));
    return;
  }

  // ── Short-circuit: SAVE_PROGRAM ───────────────────────────────────────────
  if (intentResult.type === "SAVE_PROGRAM") {
    const saveContent = formatShortCircuitResponse({ mode: "EXECUTION_RESPONSE", hasActiveProgram: !!latestStructuredProgram });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: saveContent,
      structuredData: latestStructuredProgram ? JSON.stringify(latestStructuredProgram) : null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false }));
    return;
  }

  // ── Vibe Edit Mode ────────────────────────────────────────────────────────
  if (hasActiveSystem && isVibeEditIntent(intentResult)) {
    try {
      const [fullSystem, decisionMemory] = await Promise.all([
        getFullTrainingSystem(activeSystem!.id),
        buildDecisionMemory(activeSystem!.id, userId).catch(() => null),
      ]);

      if (fullSystem) {
        // Stage 4: Plan Modifications — interpretEditRequest analyses what needs to change
        emit(buildStageEvent("planning", intentResult.type));

        const editPlan = await interpretEditRequest(
          parsed.data.content, fullSystem, undefined,
          adaptationCtx || undefined, decisionMemory?.decisionMemoryContext || undefined,
        );

        // Stage 5: Apply Changes — edit engine modifies the program object
        emit(buildStageEvent("applying", intentResult.type));

        const editResult = await applyEditPlan(editPlan);

        if (editResult.appliedCount > 0) {
          // Stage 6: Validate — implicit in applyEditPlan quality checks; then save
          emit(buildStageEvent("validating", intentResult.type));

          // Stage 7: Save Program State
          emit(buildStageEvent("saving", intentResult.type));

          const changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: activeSystem!.id, source: "ai_edit",
            intent: editPlan.intent, scope: editPlan.scope,
            changeSummary: editResult.changeSummary, requestText: parsed.data.content,
            beforeSnapshot: editResult.beforeSnapshot, afterSnapshot: editResult.afterSnapshot,
            appliedCount: editResult.appliedCount, skippedCount: editResult.skippedCount,
          });

          const coachingContent = buildVibeEditCoachingResponse(editResult);
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: editResult.changeSummary,
            changedIds: editResult.changedIds,
            systemId: activeSystem!.id,
            changeLogId,
          };

          const [assistantMessage] = await db.insert(messagesTable).values({
            conversationId: params.data.id, role: "assistant",
            content: coachingContent, structuredData: JSON.stringify(systemEditData),
          }).returning();

          await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

          if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
            stripeStorage.incrementMessageCount(userId).catch(() => {});
          }

          done({
            ...buildCompleteEvent({
              userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo,
              intentResultVal: intentResult, systemSavedVal: false,
            }),
            systemEdit: { applied: true, changeSummary: editResult.changeSummary, changedIds: editResult.changedIds, systemId: activeSystem!.id, changeLogId },
          });
          return;
        }
        // No changes applied — fall through to AI
        logger.warn({ intent: editPlan.intent, skipped: editResult.skippedCount }, "[VibeEdit:stream] No changes applied — falling back to AI");
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "[VibeEdit:stream] Edit pipeline failed — falling back to AI");
    }
  }

  // ── Standard AI Response Path ─────────────────────────────────────────────
  // Stage 4: Plan Modifications — determine scope and pre-transform if needed
  emit(buildStageEvent("planning", intentResult.type));

  const isModificationIntent = (
    intentResult.type === "EDIT_PROGRAM" ||
    intentResult.type === "ADJUST_FOR_PAIN" ||
    intentResult.type === "ADJUST_FOR_READINESS" ||
    intentResult.type === "RETRIEVE_CURRENT_PROGRAM"
  );
  const currentProgram = isModificationIntent ? latestStructuredProgram : null;

  let preTransformedProgram: ProgramStructure | null = currentProgram;
  let transformHint: string | null = null;

  if (actionDecision.actionType === "STRUCTURAL_REBUILD" && currentProgram) {
    const meta = intentResult.metadata as { targetSplit?: string; targetDays?: number | null; targetGoalShift?: string | null } | undefined;
    const transformType = resolveTransformType(meta?.targetSplit ?? "unknown", meta?.targetDays ?? null, meta?.targetGoalShift ?? null, currentProgram.days.length);
    const transformRequest: TransformRequest = { type: transformType, targetDays: meta?.targetDays ?? currentProgram.days.length, rawRequest: parsed.data.content };
    try {
      const result = transformProgram(currentProgram, transformRequest);
      preTransformedProgram = result.program;
      transformHint = buildTransformPromptHint(result.log);
    } catch (err) {
      logger.error({ err }, "[ConversationRouter:stream] Split transform failed — falling back to AI-only");
    }
  }

  // Stage 5: Apply Changes — AI generates the program (this is the longest stage)
  emit(buildStageEvent("applying", intentResult.type));

  const { content: aiContent, structuredData } = await generateAIResponse(
    parsed.data.content,
    history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    userId,
    {
      adaptationContext: adaptationCtx || undefined,
      memoryContext: (hasMemory && memoryCtx) ? memoryCtx : undefined,
      insightHint: insightHint || undefined,
      conversionHint: conversionHint || undefined,
      currentProgram: preTransformedProgram,
      intentResult,
      actionDecision,
      transformHint: transformHint || undefined,
      responseMode,
    }
  );

  // Stage 6: Validate — AI response quality checks done; now persist
  emit(buildStageEvent("validating", intentResult.type));

  // ── Persist AI response ───────────────────────────────────────────────────
  // Stage 7: Save Program State
  emit(buildStageEvent("saving", intentResult.type));

  const [assistantMessage] = await db.insert(messagesTable).values({
    conversationId: params.data.id, role: "assistant", content: aiContent,
    structuredData: structuredData ? JSON.stringify(structuredData) : null,
  }).returning();

  await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

  // ── Auto-save / Change Engine ─────────────────────────────────────────────
  let systemSaved = false;
  let autoSavedSystemId: number | undefined;

  if (structuredData && Array.isArray(structuredData.days) && structuredData.days.length > 0) {
    try {
      const { system: savedSystem, isUpdate } = await upsertTrainingSystemFromProgram(userId, structuredData);
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      if (isUpdate && structuredData.whatChanged) {
        try {
          const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
          await createChangeLogEntry({
            userId, trainingSystemId: savedSystem.id, source: "ai_edit",
            intent: intentResult.editSubtype ?? intentResult.type.toLowerCase(),
            scope: "system", changeSummary: structuredData.whatChanged,
            requestText: parsed.data.content.slice(0, 300),
            beforeSnapshot: emptySnapshot, afterSnapshot: emptySnapshot,
            appliedCount: 1, skippedCount: 0,
            decisionMetadata: structuredData.whyChanged
              ? { whyChanged: structuredData.whyChanged, intentType: intentResult.type }
              : { intentType: intentResult.type },
          });
        } catch (logErr) {
          logger.warn({ logErr }, "[ChangeEngine:stream] Failed to write AI change log — non-fatal");
        }
      }
    } catch (err) {
      logger.error({ err, userId }, "[AutoSave:stream] Failed to save training system — non-fatal");
    }
  }

  if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
    stripeStorage.incrementMessageCount(userId).catch(() => {});
  }

  done(buildCompleteEvent({
    userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo,
    intentResultVal: intentResult, systemSavedVal: systemSaved, systemIdVal: autoSavedSystemId,
  }));
});

export default router;

