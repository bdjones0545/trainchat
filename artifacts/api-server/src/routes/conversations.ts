import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, detectEditIntent, type ProgramStructure } from "../lib/ai";
import { buildAdaptationContext } from "../lib/adaptation";
import { syncMemoriesFromData, listMemories, buildMemoryContext } from "../lib/memory";
import { generateInsights, buildInsightPromptHint } from "../lib/insights";
import { getUserPlanInfo } from "../lib/planGating";
import { stripeStorage } from "../lib/stripeStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

  // ── Edit intent detection & current program resolution ──────────────────
  const editIntent = detectEditIntent(parsed.data.content);
  let currentProgram: ProgramStructure | null = null;

  if (editIntent.isEdit) {
    // Find the most recent assistant message in the conversation that has structured program data
    const assistantMessages = history
      .filter((m) => m.role === "assistant" && m.structuredData)
      .reverse();

    for (const msg of assistantMessages) {
      const rawData = msg.structuredData;
      if (rawData) {
        try {
          const programData = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
          if (programData?.days && Array.isArray(programData.days) && programData.days.length > 0) {
            currentProgram = programData as ProgramStructure;
            break;
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }

    logger.info(
      { editType: editIntent.editType, confidence: editIntent.confidence, hasProgramContext: !!currentProgram },
      "[EditPipeline] Processing edit request"
    );

    if (!currentProgram) {
      logger.warn("[EditPipeline] Edit intent detected but no structured program found in history");
    }
  }

  const { content: aiContent, structuredData } = await generateAIResponse(
    parsed.data.content,
    history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    userId,
    adaptationCtx || undefined,
    (hasMemory && memoryCtx) ? memoryCtx : undefined,
    insightHint || undefined,
    conversionHint || undefined,
    currentProgram
  );

  // Fallback warning if edit was detected but no structured data came back
  if (editIntent.isEdit && currentProgram && !structuredData) {
    logger.warn("[EditPipeline] Edit intent detected and program was available, but AI did not return updated JSON. Right panel will not update.");
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
  });
});

export default router;
