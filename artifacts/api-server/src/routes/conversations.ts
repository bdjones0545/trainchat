import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, type ProgramStructure } from "../lib/ai";
import { classifyIntent, logIntentSummary } from "../lib/intent";
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
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the most recent valid structured program from a conversation's message history.
 * Searches backwards through assistant messages for the latest program JSON.
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
      if (data?.days && Array.isArray(data.days) && data.days.length > 0) {
        return data as ProgramStructure;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
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

  // Resolve current active program from conversation history (needed for EDIT/RETRIEVE intents)
  const latestStructuredProgram = resolveCurrentProgram(history);
  const hasActiveProgram = latestStructuredProgram !== null;

  // Classify the intent — this is the single source of truth for routing
  const intentResult = classifyIntent(parsed.data.content, {
    hasActiveProgram,
    conversationTurnCount: history.filter((m) => m.role === "user").length,
  });

  logIntentSummary(parsed.data.content, intentResult, hasActiveProgram);

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

  // For all other intents — route to AI with appropriate context
  // EDIT_PROGRAM needs the current program; others may or may not
  const currentProgram = (intentResult.type === "EDIT_PROGRAM" || intentResult.type === "RETRIEVE_CURRENT_PROGRAM")
    ? latestStructuredProgram
    : null;

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
  });
});

export default router;
