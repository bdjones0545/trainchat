import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable, neuralProfilesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, type ProgramStructure, validateProgramAgainstConstraints } from "../lib/ai";
import { classifyIntent, logIntentSummary, extractConstraints, type IntentResult, type ExtractedConstraints } from "../lib/intent";
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
import { syncMemoriesFromData, listMemories, buildMemoryContext, extractMemoriesFromMessage } from "../lib/memory";
import { generateInsights, buildInsightPromptHint } from "../lib/insights";
import { getUserPlanInfo } from "../lib/planGating";
import { stripeStorage } from "../lib/stripeStorage";
import { interpretEditRequest, resolveTargetFromRequest } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import type { VerificationStatus } from "../lib/mutation-verifier";
import { createChangeLogEntry } from "../lib/change-log-service";
import { interpretNeuralGraph, buildNeuralAdjustmentSummary, type NeuralBias, type Imbalance } from "../lib/neural-graph-interpreter";
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
 * Builds a meaningful change log summary for the initial program build.
 * Uses extracted constraints to produce specific, accurate history entries.
 */
function buildInitialBuildSummary(
  program: ProgramStructure,
  constraints: ExtractedConstraints | null
): string {
  const days = program.days.length;
  const parts: string[] = [];

  parts.push(`Created new program from user request`);

  if (constraints?.primaryGoal) {
    const goalLabels: Record<string, string> = {
      strength: "Strength",
      hypertrophy: "Hypertrophy",
      athletic_performance: "Athletic Performance",
      fat_loss: "Fat Loss / Body Composition",
      general_fitness: "General Fitness",
    };
    parts.push(`Goal: ${goalLabels[constraints.primaryGoal] ?? constraints.primaryGoal}`);
  }

  parts.push(`Frequency: ${days} days/week`);

  if (constraints?.sportFocus) {
    const sportLabel = constraints.sportFocus.replace(/_/g, " ");
    parts.push(`Sport context: ${sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)}`);
  }

  if (constraints?.seasonContext) {
    const seasonLabels: Record<string, string> = {
      off_season: "Off-Season",
      pre_season: "Pre-Season",
      in_season: "In-Season",
      post_season: "Post-Season",
      return_to_play: "Return to Play",
    };
    parts.push(`Season phase: ${seasonLabels[constraints.seasonContext] ?? constraints.seasonContext}`);
  }

  if (constraints?.sessionDuration) {
    parts.push(`Session duration: ${constraints.sessionDuration} minutes`);
  }

  if (constraints?.equipment) {
    parts.push(`Equipment: ${constraints.equipment}`);
  }

  if (constraints?.experienceLevel) {
    parts.push(`Experience level: ${constraints.experienceLevel}`);
  }

  return parts.join(" · ");
}

/**
 * Builds an agentic, coaching-style response when an edit request could not be applied.
 * Language is intentional, context-aware, and never sounds like an entity-resolution error.
 * Used instead of the brittle "couldn't resolve to specific exercises/sessions" fallback.
 */
function buildAgenticNoChangesResponse(
  userRequest: string,
  editIntent: string,
  editScope: string,
  editSubtype: string | undefined,
  resolvedTarget?: { type: string; label?: string } | null
): string {
  const lower = userRequest.toLowerCase();

  // If the user mentioned a specific day/session and we still got 0 changes,
  // the problem is with what to change — not where. Ask about the action, not the location.
  const hasExplicitDayRef = /\bday\s+\d+\b|\bsession\s+\d+\b|\b(first|second|third|fourth|fifth|sixth|seventh)\s+(day|session)\b/.test(lower);
  const hasExplicitWeekRef = /\bweek\s+\d+\b/.test(lower);
  const hadResolvedTarget = !!resolvedTarget;

  // Broad program transformation — still need scope clarity (program-wide vs single block)
  if ((editScope === "block" || editScope === "system" || editSubtype === "program_transformation") && !hasExplicitDayRef) {
    const directionMap: Record<string, string> = {
      endurance_transformation: "endurance focus",
      conditioning_transformation: "conditioning emphasis",
      speed_transformation: "speed and agility focus",
      intensity_transformation: "overall intensity",
      refocus_block_power: "power and explosive development",
      refocus_block_hypertrophy: "hypertrophy emphasis",
      add_explosive_emphasis: "explosive and power qualities",
    };
    const directionLabel = directionMap[editIntent] ?? "the focus shift you described";
    return `I want to make that ${directionLabel} change — one quick thing: should this apply to a specific block or phase, or across all your current sessions as a program-wide shift?\n\nJust confirm and I'll get it done.`;
  }

  // Request explicitly named a day/session — don't ask "which day?" again
  if (hasExplicitDayRef || hadResolvedTarget) {
    const targetLabel = resolvedTarget?.label ? `"${resolvedTarget.label}"` : "that session";
    return `I found ${targetLabel} in your program but couldn't match a clean change to it based on your request. Could you be a bit more specific about what you'd like to do — for example: "add a Romanian deadlift", "remove the leg curl", or "reduce sets on the accessories"? Once I know exactly what to change, I'll apply it right away.`;
  }

  // Request explicitly named a week — don't ask "which week?" again
  if (hasExplicitWeekRef) {
    return `I located that week in your program but couldn't determine what to change. Could you be a bit more specific — for example: "make it a deload", "reduce volume", or "add an extra conditioning finisher"? I'll apply it directly once I understand the change.`;
  }

  // Volume or intensity request with no resolved target — ask about which week/session
  if (editIntent.match(/volume|intensity|fatigue/)) {
    return `I see what you're going for. To target the right place: are you looking to adjust this week's sessions, the overall program structure, or a specific day?\n\nOnce I know the scope, I'll apply it.`;
  }

  // Generic fallback — don't ask "which session" if the request has no program structure
  return `I couldn't find a clean match for that in your current program. Try being more specific — for example: the day or session ("Day 1", "the upper body day"), the exercise name, or exactly what you want to change (sets, reps, or movement). That gives me enough to act directly.`;
}

/**
 * Builds a coaching-toned confirmation message after a successful system edit.
 * Uses the edit plan's changeSummary and applied count to create a concise, clear response.
 */
function buildVibeEditCoachingResponse(editResult: EditResult): string {
  const summary = editResult.changeSummary;
  const skipped = editResult.skippedCount;
  const base = summary.endsWith(".") ? summary : `${summary}.`;
  const status = editResult.verification.status;

  if (status === "verified") {
    if (skipped > 0) {
      return `${base} (${skipped} item${skipped > 1 ? "s" : ""} couldn't be applied — try being more specific.)`;
    }
    return base;
  }

  if (status === "partial") {
    const verifiedCount = editResult.verification.verifiedChanges.length;
    const totalCount = editResult.verification.expectedChanges.length;
    return `${base} (${verifiedCount}/${totalCount} changes confirmed — check the panel for anything missing.)`;
  }

  if (status === "unclear") {
    return `${base} — double-check the panel to confirm.`;
  }

  return base;
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
      code: "PAYWALL",
      isAnonymous: planInfo.isAnonymous ?? false,
      message: planInfo.isAnonymous
        ? `You've used your ${planInfo.messageCount} free interactions. Create your free account to keep training.`
        : planInfo.plan === "free"
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
    extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
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

  // ── Phase B: Constraint Extraction ────────────────────────────────────────
  // For new program builds, extract hard constraints from the user's message.
  // These override profile defaults per priority: explicit input > profile > defaults.
  let extractedConstraints: ExtractedConstraints | null = null;
  if (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM") {
    extractedConstraints = extractConstraints(parsed.data.content);
    logger.info(
      {
        daysPerWeek: extractedConstraints.daysPerWeek,
        primaryGoal: extractedConstraints.primaryGoal,
        sportFocus: extractedConstraints.sportFocus,
        equipment: extractedConstraints.equipment,
        experienceLevel: extractedConstraints.experienceLevel,
        sessionDuration: extractedConstraints.sessionDuration,
      },
      "[ConstraintExtraction] Constraints extracted from user message for program build"
    );
  }

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

  // SAVE_PROGRAM — actually persist the program to the training system database
  if (intentResult.type === "SAVE_PROGRAM") {
    logger.info("[IntentRouter] Handling SAVE_PROGRAM — persisting program to training system");
    const programToSave = latestStructuredProgram;
    let saveSuccess = false;
    let savedSystemId: number | undefined;
    let saveFailureReason: string | undefined;

    if (programToSave) {
      try {
        const result = await upsertTrainingSystemFromProgram(userId, programToSave);
        savedSystemId = result.system.id;
        saveSuccess = true;
        const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
        createChangeLogEntry({
          userId,
          trainingSystemId: result.system.id,
          source: "initialize",
          intent: "save_program",
          scope: "system",
          changeSummary: `Program saved: ${programToSave.programName}`,
          requestText: parsed.data.content.slice(0, 300),
          beforeSnapshot: emptySnapshot,
          afterSnapshot: emptySnapshot,
          fullProgramSnapshot: programToSave as unknown as Record<string, unknown>,
          appliedCount: 1,
          skippedCount: 0,
          versionOverrides: { isMajorVersion: true, versionLabel: "V1 Initial Build" },
          decisionMetadata: { intentType: intentResult.type },
        }).catch((logErr) => logger.warn({ logErr }, "[SAVE_PROGRAM] Change log write failed — non-fatal"));
        logger.info({ userId, systemId: savedSystemId, programName: programToSave.programName }, "[SAVE_PROGRAM] Program persisted successfully");
      } catch (saveErr: any) {
        saveFailureReason = saveErr?.message ?? "unknown";
        logger.error({ err: saveErr?.message, userId }, "[SAVE_PROGRAM] Failed to persist program — returning failure to user");
      }
    }

    const saveContent = saveSuccess
      ? `Your program "${programToSave!.programName}" has been saved to your training system. You can access it anytime from the Program panel.`
      : programToSave
        ? `I wasn't able to save your program due to a system error. Your program hasn't been saved. Please try again in a moment.`
        : `There's no program ready to save yet. Once I've built your training program, you can ask me to save it and I'll add it to your system.`;

    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: saveContent,
      structuredData: programToSave ? JSON.stringify(programToSave) : null,
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
      systemSaved: saveSuccess,
      systemId: savedSystemId,
      saveFailure: !saveSuccess && !!programToSave ? { reason: saveFailureReason } : undefined,
    });
    return;
  }

  // ── VIBE EDIT MODE ────────────────────────────────────────────────────────
  // Handles all edit intents (EDIT_PROGRAM, ADJUST_FOR_PAIN, ADJUST_FOR_READINESS).
  // Resolution order:
  //   1. Active DB system exists   → edit directly (fast path)
  //   2. No DB system, chat program exists → auto-create system first, then edit
  //   3. No program at all         → return truthful "build first" message
  if (isVibeEditIntent(intentResult)) {
    let resolvedSystem: typeof activeSystem = activeSystem;
    let systemAutoCreatedForEdit = false;

    if (!resolvedSystem && latestStructuredProgram) {
      try {
        resolvedSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram);
        systemAutoCreatedForEdit = true;
        logger.info({ userId, systemId: resolvedSystem.id }, "[VibeEdit] Auto-created system from chat program before edit");
      } catch (createErr: any) {
        logger.error({ err: createErr?.message }, "[VibeEdit] Auto-create before edit failed — falling back to build-first response");
      }
    }

    if (!resolvedSystem) {
      const noProgramContent = `You don't have a training program yet. Once you build one, I can apply targeted changes directly to your system.\n\nTry something like: "Build me a 3-day strength program" — then I can handle any adjustments you need.`;
      const [assistantMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: noProgramContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: assistantMsg.id, conversationId: assistantMsg.conversationId, role: assistantMsg.role, content: assistantMsg.content, createdAt: assistantMsg.createdAt.toISOString(), structuredData: null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
        systemSaved: false,
      });
      return;
    }

    logger.info(
      { userId, systemId: resolvedSystem.id, intentType: intentResult.type, editSubtype: intentResult.editSubtype, wasAutoCreated: systemAutoCreatedForEdit },
      "[VibeEdit] Entering vibe edit mode — editing real training system from chat"
    );

    try {
      // Load full system + decision memory in parallel
      const [fullSystem, decisionMemory] = await Promise.all([
        getFullTrainingSystem(resolvedSystem.id),
        buildDecisionMemory(resolvedSystem.id, userId).catch(() => null),
      ]);

      if (!fullSystem) {
        logger.warn({ systemId: resolvedSystem.id }, "[VibeEdit] Could not load full system — falling back to AI");
        // Fall through to regular AI response below
      } else {
        // For program_transformation intents, enrich the user request with
        // explicit block-level instructions so the edit engine makes real
        // structural changes instead of trying to find a specific entity.
        const isProgramTransformation = intentResult.editSubtype === "program_transformation";
        const transformationDirection = isProgramTransformation
          ? (intentResult.metadata?.direction as string) ?? "focus shift"
          : null;

        const effectiveEditRequest = isProgramTransformation
          ? `[PROGRAM TRANSFORMATION — GLOBAL FOCUS SHIFT]\nUser request: "${parsed.data.content}"\n\nTransformation direction: ${transformationDirection}\n\nThis is a program-wide transformation, NOT a surgical exercise edit. You MUST:\n- Use scope: "block" (affects the whole phase/block)\n- Apply the matching BLOCK MUTATION RULE from your instructions (e.g., ENDURANCE_TRANSFORMATION, CONDITIONING_TRANSFORMATION, SPEED_TRANSFORMATION, INTENSITY_TRANSFORMATION, INCREASE_POWER_BIAS, INCREASE_HYPERTROPHY_BIAS, or INCREASE_SPORT_SPECIFICITY)\n- Make real structural changes: update exercises, rest intervals, rep ranges, session emphases, and phase goal across MULTIPLE sessions\n- Do NOT produce a notes-only update — exercise-level and session-level changes are required\n- Keep all primary compound lifts (squats, deadlifts, presses) intact\n- changeSummary must name specific exercises added/changed and sessions affected`
          : parsed.data.content;

        // DEFAULT EXECUTION LAYER — resolve day/session references before calling OpenAI
        const nonStreamUIContext = (req.body as any)?.uiContext ?? null;
        const resolvedTarget = isProgramTransformation
          ? undefined
          : resolveTargetFromRequest(parsed.data.content, fullSystem, nonStreamUIContext);

        if (resolvedTarget) {
          logger.info(
            { targetType: resolvedTarget.type, targetId: resolvedTarget.id, targetLabel: resolvedTarget.label },
            "[VibeEdit] DefaultExecution resolved target context — skipping ambiguous ID inference"
          );
        }

        // Interpret + apply the edit
        const editPlan = await interpretEditRequest(
          effectiveEditRequest,
          fullSystem,
          resolvedTarget,
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
          const verification = editResult.verification;

          // Phase 2: If verification fails — the DB wrote but the state didn't change
          if (verification.status === "failed") {
            logger.warn(
              { intent: editPlan.intent, summary: verification.summary },
              "[VibeEdit] Verification FAILED — changes applied but not detected in post-state"
            );
            const failedContent = `I applied the change but something didn't land cleanly in your program. Let me take another pass at it.\n\nCould you give me a little more direction? For example: the specific exercise name, which day or session it's in, or exactly what you want to change (sets, reps, rest, or movement). That'll help me lock it in precisely.`;
            const [failedMsg] = await db.insert(messagesTable).values({
              conversationId: params.data.id, role: "assistant",
              content: failedContent, structuredData: null,
            }).returning();
            await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
            if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
              stripeStorage.incrementMessageCount(userId).catch(() => {});
            }
            res.json({
              userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
              assistantMessage: { id: failedMsg.id, conversationId: failedMsg.conversationId, role: failedMsg.role, content: failedMsg.content, createdAt: failedMsg.createdAt.toISOString(), structuredData: null },
              planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
              intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
              systemEdit: { applied: false },
              editFailure: { reason: "verification_failed", verificationSummary: verification.summary },
            });
            return;
          }

          // Aggregate the AI's per-change reasons into a single "whyChanged" string
          const whyChangedParts = editPlan.changes
            .map((c) => c.reason)
            .filter((r): r is string => !!r);
          const whyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;

          const isStructuralVibeEdit = editPlan.scope === "system" || editPlan.scope === "block";

          // Log the change to system_change_log (only reached when verification passes)
          const changeLogId = await createChangeLogEntry({
            userId,
            trainingSystemId: resolvedSystem.id,
            source: "ai_edit",
            intent: editPlan.intent,
            scope: editPlan.scope,
            changeSummary: editResult.changeSummary,
            requestText: parsed.data.content,
            beforeSnapshot: editResult.beforeSnapshot,
            afterSnapshot: editResult.afterSnapshot,
            appliedCount: editResult.appliedCount,
            skippedCount: editResult.skippedCount,
            versionOverrides: isStructuralVibeEdit ? { isMajorVersion: true } : undefined,
            decisionMetadata: {
              whyChanged,
              intentType: intentResult.type,
              editSubtype: intentResult.editSubtype ?? undefined,
              verification: {
                status: verification.status,
                verifiedCount: verification.verifiedChanges.length,
                missingCount: verification.missingChanges.length,
                requiresReview: verification.requiresReview ?? false,
              },
            },
          });

          // Build coaching response — now verification-aware
          const coachingContent = buildVibeEditCoachingResponse(editResult);

          // Store the systemEdit marker in structuredData so MessageBubble
          // can render a SystemUpdateCard in the conversation history
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: editResult.changeSummary,
            changedIds: editResult.changedIds,
            systemId: resolvedSystem.id,
            changeLogId,
            verificationStatus: verification.status,
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
            ...(process.env.NODE_ENV !== "production" && editPlan._debugRoute ? { routeDebug: { ...editPlan._debugRoute, intentType: intentResult.type, editSubtype: intentResult.editSubtype ?? null, requestPreview: parsed.data.content.slice(0, 120) } } : {}),
            systemEdit: {
              applied: true,
              changeSummary: editResult.changeSummary,
              changedIds: editResult.changedIds,
              changeTargets: editResult.changeTargets,
              systemId: resolvedSystem.id,
              changeLogId,
              verificationStatus: verification.status as VerificationStatus,
              requiresReview: verification.requiresReview ?? false,
            },
          });
          return;
        }

        // Edit plan produced no applied changes — return agentic coaching response, do NOT pretend success
        logger.warn(
          { intent: editPlan.intent, scope: editPlan.scope, skipped: editResult.skippedCount, editSubtype: intentResult.editSubtype },
          "[VibeEdit] No changes applied — returning agentic clarification response"
        );
        const noOpContent = buildAgenticNoChangesResponse(
          parsed.data.content,
          editPlan.intent,
          editPlan.scope,
          intentResult.editSubtype,
          resolvedTarget
        );
        const [noOpMessage] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: noOpContent,
          structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: noOpMessage.id, conversationId: noOpMessage.conversationId, role: noOpMessage.role, content: noOpMessage.content, createdAt: noOpMessage.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
          ...(process.env.NODE_ENV !== "production" && editPlan._debugRoute ? { routeDebug: { ...editPlan._debugRoute, intentType: intentResult.type, editSubtype: intentResult.editSubtype ?? null, requestPreview: parsed.data.content.slice(0, 120) } } : {}),
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_applied", skippedCount: editResult.skippedCount },
        });
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[VibeEdit] Edit pipeline threw — returning error response to user");
      const errContent = `Something went wrong on my end while applying that change — your program hasn't been modified.\n\nGive it another try. If it keeps happening, try being a bit more specific: name the exercise, the day, or exactly what you want to change and I'll lock it in.`;
      const [errMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: errContent,
        structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: errMessage.id, conversationId: errMessage.conversationId, role: errMessage.role, content: errMessage.content, createdAt: errMessage.createdAt.toISOString(), structuredData: null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
        systemEdit: { applied: false },
        editFailure: { reason: "pipeline_error" },
      });
      return;
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

  // ── Neural Graph Context ───────────────────────────────────────────────────
  // Load the user's neural adaptation profile and interpret it.
  // This context is injected into every AI call so program decisions are graph-informed.
  // When no API key is present (fallback mode), bias is applied post-hoc to the built program.
  let neuralBias: NeuralBias | undefined;
  let neuralImbalances: Imbalance[] | undefined;
  let neuralContextStr: string | undefined;

  try {
    const [neuralRow] = await db
      .select({ graphState: neuralProfilesTable.graphState })
      .from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, userId))
      .limit(1);

    if (neuralRow?.graphState) {
      const interpretation = interpretNeuralGraph(neuralRow.graphState as any);
      if (interpretation.hasMeaningfulData) {
        neuralBias = interpretation.bias;
        neuralImbalances = interpretation.imbalances;
        neuralContextStr = interpretation.promptContext;
        logger.info(
          { powerBias: interpretation.bias.powerBias.toFixed(2), trunkBias: interpretation.bias.trunkBias.toFixed(2), recoveryBias: interpretation.bias.recoveryBias.toFixed(2), isActive: interpretation.bias.isActive },
          "[NeuralGraph] Interpretation active — injecting into AI context"
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "[NeuralGraph] Failed to load neural profile — proceeding without bias");
  }

  let { content: aiContent, structuredData } = await generateAIResponse(
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
      extractedConstraints,
      userMessage: parsed.data.content,
      neuralContext: neuralContextStr,
      neuralBias,
      neuralImbalances,
    }
  );

  // Warn if EDIT_PROGRAM was routed but no structured data returned
  if (intentResult.type === "EDIT_PROGRAM" && currentProgram && !structuredData) {
    logger.warn("[IntentRouter] EDIT_PROGRAM intent with program context, but AI did not return updated JSON. Right panel will NOT update.");
  }

  // ── Constraint Validation & Retry (for new program builds) ─────────────────
  // If extracted constraints exist and the AI returned a program, validate it.
  // If validation fails, retry once with a stronger enforcement prompt.
  if (
    extractedConstraints &&
    structuredData &&
    (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM")
  ) {
    const violations = validateProgramAgainstConstraints(structuredData, extractedConstraints);
    if (violations.length > 0) {
      logger.warn(
        { violations, programName: structuredData.programName, days: structuredData.days.length },
        "[ConstraintValidation] Program violates constraints — retrying with stronger enforcement"
      );
      // Retry once with a reinforced enforcement hint
      const enforceHint = `\n## CONSTRAINT ENFORCEMENT — RETRY\nThe previous program generation FAILED validation:\n${violations.map(v => `- ${v.field}: expected ${v.expected}, got ${v.actual}`).join("\n")}\n\nThis is your SECOND AND FINAL attempt. The constraints listed above are ABSOLUTE. Correct every violation before outputting JSON.`;
      const retryResult = await generateAIResponse(
        parsed.data.content,
        history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        userId,
        {
          adaptationContext: adaptationCtx || undefined,
          memoryContext: (hasMemory && memoryCtx) ? memoryCtx : undefined,
          currentProgram: preTransformedProgram,
          intentResult,
          actionDecision,
          responseMode,
          extractedConstraints,
          userMessage: parsed.data.content,
          transformHint: enforceHint,
          neuralContext: neuralContextStr,
          neuralBias,
          neuralImbalances,
        }
      ).catch(() => null);

      if (retryResult?.structuredData) {
        const retryViolations = validateProgramAgainstConstraints(retryResult.structuredData, extractedConstraints);
        if (retryViolations.length === 0) {
          logger.info("[ConstraintValidation] Retry succeeded — using corrected program");
          aiContent = retryResult.content;
          structuredData = retryResult.structuredData;
        } else {
          logger.warn(
            { retryViolations },
            "[ConstraintValidation] Retry still invalid — using best-available result"
          );
          // Use the retry anyway if the day count is now correct (the most critical constraint)
          const dayViolation = violations.find(v => v.field === "daysPerWeek");
          const retryDayViolation = retryViolations.find(v => v.field === "daysPerWeek");
          if (dayViolation && !retryDayViolation) {
            logger.info("[ConstraintValidation] Day count fixed in retry — using retry despite remaining violations");
            aiContent = retryResult.content;
            structuredData = retryResult.structuredData;
          }
          // Otherwise keep the first result — both failed, use first attempt
        }
      }
    } else {
      logger.info(
        { programName: structuredData.programName, days: structuredData.days.length },
        "[ConstraintValidation] Program passed constraint validation"
      );
    }
  }

  // ── Enrich structuredData with build metadata for initial builds ──────────
  const isInitialBuildNonStream =
    !hasActiveSystem &&
    structuredData != null &&
    (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM");

  if (isInitialBuildNonStream && structuredData) {
    (structuredData as unknown as Record<string, unknown>)._buildMeta = {
      frequency: structuredData.days.length,
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      sessionDuration: extractedConstraints?.sessionDuration ?? null,
    };
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
  // Routing rules:
  //   • CREATE_PROGRAM / START_NEW_PROGRAM → always create a NEW training system.
  //     This archives the existing active program (preserving it) and creates fresh.
  //   • All edit intents (EDIT_PROGRAM, ADJUST_FOR_PAIN, ADJUST_FOR_READINESS) →
  //     update the existing system IN PLACE (same ID, change logged).
  // This separates "new program builds" from "edits to the current program" so
  // a new builder session never silently overwrites an existing saved program.
  let systemSaved = false;
  let autoSavedSystemId: number | undefined;
  let changeLogId: number | undefined;

  if (structuredData && Array.isArray(structuredData.days) && structuredData.days.length > 0) {
    try {
      const isNewProgramBuild =
        intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM";
      let savedSystem: { id: number; [key: string]: any };
      let isUpdate: boolean;
      if (isNewProgramBuild) {
        savedSystem = await createTrainingSystemFromProgram(userId, structuredData);
        isUpdate = false;
      } else {
        const result = await upsertTrainingSystemFromProgram(userId, structuredData);
        savedSystem = result.system;
        isUpdate = result.isUpdate;
      }
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
      const fullProgramSnapshot = structuredData as unknown as Record<string, unknown>;

      if (isUpdate) {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[ChangeEngine] Active program updated in place"
        );
        try {
          const updateSummary = structuredData.whatChanged
            ?? `Program updated: ${structuredData.days.length} days/week · ${structuredData.programName}`;
          const updateMeta: Record<string, unknown> = {
            intentType: intentResult.type,
            editSubtype: intentResult.editSubtype ?? undefined,
            programDays: structuredData.days.length,
            programGoal: extractedConstraints?.primaryGoal ?? null,
            programSport: extractedConstraints?.sportFocus ?? null,
          };
          if (structuredData.whyChanged) updateMeta.whyChanged = structuredData.whyChanged;
          changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: savedSystem.id, source: "ai_edit",
            intent: intentResult.editSubtype ?? intentResult.type.toLowerCase(),
            scope: "system", changeSummary: updateSummary,
            requestText: parsed.data.content.slice(0, 300),
            beforeSnapshot: emptySnapshot, afterSnapshot: emptySnapshot,
            fullProgramSnapshot,
            appliedCount: 1, skippedCount: 0,
            versionOverrides: { isMajorVersion: true },
            decisionMetadata: updateMeta,
          });
        } catch (logErr) {
          logger.warn({ logErr }, "[ChangeEngine] Failed to write AI change log entry — non-fatal");
        }
      } else {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[AutoSave] New training system created — logging Initial Build version"
        );
        try {
          // Build a constraint-aware change summary for the Initial Build entry
          const initialBuildSummary = buildInitialBuildSummary(structuredData, extractedConstraints);
          changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: savedSystem.id, source: "initialize",
            intent: "create_program", scope: "system",
            changeSummary: initialBuildSummary,
            requestText: parsed.data.content.slice(0, 300),
            beforeSnapshot: emptySnapshot, afterSnapshot: emptySnapshot,
            fullProgramSnapshot,
            appliedCount: 1, skippedCount: 0,
            versionOverrides: { isMajorVersion: true, versionLabel: "V1 Initial Build" },
            decisionMetadata: {
              intentType: intentResult.type,
              extractedConstraints: extractedConstraints ?? {},
              programDays: structuredData.days.length,
              programGoal: extractedConstraints?.primaryGoal ?? null,
              programSport: extractedConstraints?.sportFocus ?? null,
            },
          });
        } catch (logErr) {
          logger.warn({ logErr }, "[AutoSave] Failed to write Initial Build log — non-fatal");
        }
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

  const streamUIContext = (req.body as any)?.uiContext ?? null;

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
      code: "PAYWALL",
      isAnonymous: planInfo.isAnonymous ?? false,
      message: planInfo.isAnonymous
        ? `You've used your ${planInfo.messageCount} free interactions. Create your free account to keep training.`
        : planInfo.plan === "free"
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
  const ackText = (() => {
    const lower = parsed.data.content.toLowerCase();
    if (lower.match(/build|create|make me|design|generate|new program|start/))
      return "Got it — building now.";
    if (lower.match(/update|change|switch|convert|restructure|rebuild/))
      return "On it — updating your program.";
    if (lower.match(/add|include|throw in|put in/))
      return "Got it — making that change.";
    if (lower.match(/remove|cut|drop|eliminate|take out/))
      return "On it — adjusting your program.";
    if (lower.match(/shorter|longer|time|minutes|compress|shorten/))
      return "On it — adjusting session length.";
    if (lower.match(/shoulder|knee|back|hip|pain|hurt|injury|sore/))
      return "Got it — adjusting for that.";
    if (lower.match(/swap|replace|substitute|instead/))
      return "On it — swapping that out.";
    return "Got it — working on this now.";
  })();
  emit({ type: "acknowledged", text: ackText });
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
    extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
  }

  // ── Neural Graph Context (streaming path) ─────────────────────────────────
  let streamNeuralBias: NeuralBias | undefined;
  let streamNeuralImbalances: Imbalance[] | undefined;
  let streamNeuralContextStr: string | undefined;
  try {
    const [neuralRow] = await db
      .select({ graphState: neuralProfilesTable.graphState })
      .from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, userId))
      .limit(1);
    if (neuralRow?.graphState) {
      const interpretation = interpretNeuralGraph(neuralRow.graphState as any);
      if (interpretation.bias || interpretation.imbalances.length > 0) {
        streamNeuralBias = interpretation.bias;
        streamNeuralImbalances = interpretation.imbalances;
        streamNeuralContextStr = interpretation.promptContext;
        logger.info({ userId }, "[NeuralGraph:stream] Interpretation active — injecting into AI context");
      }
    }
  } catch (err) {
    logger.warn({ err }, "[NeuralGraph:stream] Failed to load neural profile — proceeding without bias");
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

  // ── Constraint Extraction ─────────────────────────────────────────────────
  let extractedConstraints: ExtractedConstraints | null = null;
  if (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM") {
    extractedConstraints = extractConstraints(parsed.data.content);
    logger.info(
      {
        daysPerWeek: extractedConstraints.daysPerWeek,
        primaryGoal: extractedConstraints.primaryGoal,
        sportFocus: extractedConstraints.sportFocus,
      },
      "[SSE/ConstraintExtraction] Constraints extracted for program build"
    );
  }

  const actionDecision = resolveAction(intentResult, latestStructuredProgram, parsed.data.content);
  logDecisionSummary(parsed.data.content, intentResult, actionDecision, hasActiveProgram);

  const responseMode = selectResponseMode(actionDecision.actionType);

  // Emit classifying stage — intent and action type are now known
  emit(buildStageEvent("classifying", intentResult.type, actionDecision.actionType));

  // ── Helper: build the final SSE complete response ─────────────────────────
  function buildCompleteEvent(opts: {
    userMsg: typeof userMessage;
    assistantMsg: { id: number; conversationId: number; role: string; content: string; createdAt: Date; structuredData: string | null };
    planInfoVal: typeof planInfo;
    intentResultVal: typeof intentResult;
    systemSavedVal: boolean;
    systemIdVal?: number;
    systemEditVal?: { applied: boolean };
    changeLogIdVal?: number;
    outcomeTypeVal?: "mutation_applied" | "clarification_needed" | "conversation_only" | "true_failure";
  }) {
    const outcomeType: "mutation_applied" | "clarification_needed" | "conversation_only" | "true_failure" =
      opts.outcomeTypeVal ?? "conversation_only";
    return {
      type: "complete",
      outcomeType,
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
      changeLogId: opts.changeLogIdVal,
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
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only" }));
    return;
  }

  // ── Short-circuit: ASK_CLARIFYING_QUESTION ────────────────────────────────
  if (actionDecision.shouldAsk && actionDecision.clarifyingQuestion) {
    const clarifyContent = formatShortCircuitResponse({ mode: "CLARIFICATION_RESPONSE", hasActiveProgram, clarifyingQuestion: actionDecision.clarifyingQuestion });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: clarifyContent, structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }));
    return;
  }

  // ── Short-circuit: SAVE_PROGRAM — actually persist to DB ─────────────────
  if (intentResult.type === "SAVE_PROGRAM") {
    const programToSave = latestStructuredProgram;
    let saveSuccess = false;
    let savedSystemId: number | undefined;

    if (programToSave) {
      try {
        const result = await upsertTrainingSystemFromProgram(userId, programToSave);
        savedSystemId = result.system.id;
        saveSuccess = true;
        const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
        createChangeLogEntry({
          userId,
          trainingSystemId: result.system.id,
          source: "initialize",
          intent: "save_program",
          scope: "system",
          changeSummary: `Program saved: ${programToSave.programName}`,
          requestText: parsed.data.content.slice(0, 300),
          beforeSnapshot: emptySnapshot,
          afterSnapshot: emptySnapshot,
          fullProgramSnapshot: programToSave as unknown as Record<string, unknown>,
          appliedCount: 1,
          skippedCount: 0,
          versionOverrides: { isMajorVersion: true, versionLabel: "V1 Initial Build" },
          decisionMetadata: { intentType: intentResult.type },
        }).catch((logErr) => logger.warn({ logErr }, "[SAVE_PROGRAM:stream] Change log write failed — non-fatal"));
        logger.info({ userId, systemId: savedSystemId, programName: programToSave.programName }, "[SAVE_PROGRAM:stream] Program persisted successfully");
      } catch (saveErr: any) {
        logger.error({ err: saveErr?.message, userId }, "[SAVE_PROGRAM:stream] Failed to persist — returning failure to user");
      }
    }

    const saveContent = saveSuccess
      ? `Your program "${programToSave!.programName}" has been saved to your training system. You can access it anytime from the Program panel.`
      : programToSave
        ? `I wasn't able to save your program due to a system error. Your program hasn't been saved. Please try again in a moment.`
        : `There's no program ready to save yet. Once I've built your training program, you can ask me to save it and I'll add it to your system.`;

    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: saveContent,
      structuredData: programToSave ? JSON.stringify(programToSave) : null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
      stripeStorage.incrementMessageCount(userId).catch(() => {});
    }
    done({
      ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: saveSuccess, systemIdVal: savedSystemId, outcomeTypeVal: saveSuccess ? "mutation_applied" : (!programToSave ? "conversation_only" : "true_failure") }),
      saveFailure: !saveSuccess && !!programToSave ? { reason: "persistence_error" } : undefined,
    });
    return;
  }

  // ── Vibe Edit Mode ────────────────────────────────────────────────────────
  // Resolution order:
  //   1. Active DB system exists   → edit directly
  //   2. No DB system, chat program exists → auto-create system first, then edit
  //   3. No program at all         → return truthful "build first" SSE message
  if (isVibeEditIntent(intentResult)) {
    let resolvedSystem: typeof activeSystem = activeSystem;
    let systemAutoCreatedForEdit = false;

    if (!resolvedSystem && latestStructuredProgram) {
      try {
        resolvedSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram);
        systemAutoCreatedForEdit = true;
        logger.info({ userId, systemId: resolvedSystem.id }, "[VibeEdit:stream] Auto-created system from chat program before edit");
      } catch (createErr: any) {
        logger.error({ err: createErr?.message }, "[VibeEdit:stream] Auto-create before edit failed — returning build-first message");
      }
    }

    if (!resolvedSystem) {
      const noProgramContent = `You don't have a training program yet. Once you build one, I can apply targeted changes directly to your system.\n\nTry something like: "Build me a 3-day strength program" — then I can handle any adjustments you need.`;
      const [assistantMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: noProgramContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      done(buildCompleteEvent({
        userMsg: userMessage, assistantMsg: assistantMsg, planInfoVal: planInfo,
        intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only",
      }));
      return;
    }

    try {
      const [fullSystem, decisionMemory] = await Promise.all([
        getFullTrainingSystem(resolvedSystem.id),
        buildDecisionMemory(resolvedSystem.id, userId).catch(() => null),
      ]);

      if (fullSystem) {
        // Stage 4: Plan Modifications — interpretEditRequest analyses what needs to change
        emit(buildStageEvent("planning", intentResult.type, actionDecision.actionType));

        // DEFAULT EXECUTION LAYER — resolve day/session/week references before calling OpenAI.
        // Converts "add exercises to day 1" or "change week 2" into a concrete TargetContext
        // so the AI receives an explicit entity ID rather than inferring it from serialized text.
        const streamResolvedTarget = resolveTargetFromRequest(
          parsed.data.content, fullSystem, streamUIContext
        );

        if (streamResolvedTarget) {
          logger.info(
            { targetType: streamResolvedTarget.type, targetId: streamResolvedTarget.id, targetLabel: streamResolvedTarget.label },
            "[VibeEdit:stream] DefaultExecution resolved target context — skipping ambiguous ID inference"
          );
        }

        const editPlan = await interpretEditRequest(
          parsed.data.content, fullSystem, streamResolvedTarget,
          adaptationCtx || undefined, decisionMemory?.decisionMemoryContext || undefined,
        );

        // Stage 5: Apply Changes — edit engine modifies the program object
        emit(buildStageEvent("applying", intentResult.type, actionDecision.actionType));

        const editResult = await applyEditPlan(editPlan);

        if (editResult.appliedCount > 0) {
          const verification = editResult.verification;

          // Phase 2: Verification gate — only proceed to success if state actually changed
          if (verification.status === "failed") {
            logger.warn(
              { intent: editPlan.intent, summary: verification.summary },
              "[VibeEdit:stream] Verification FAILED — changes applied but not detected in post-state"
            );
            const failedContent = `I applied the change but something didn't land cleanly in your program. Let me take another pass at it.\n\nCould you give me a little more direction? For example: the specific exercise name, which day or session it's in, or exactly what you want to change (sets, reps, rest, or movement). That'll help me lock it in precisely.`;
            const [failedMsg] = await db.insert(messagesTable).values({
              conversationId: params.data.id, role: "assistant", content: failedContent, structuredData: null,
            }).returning();
            await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
            if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
              stripeStorage.incrementMessageCount(userId).catch(() => {});
            }
            done({
              ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: failedMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure" }),
              systemEdit: { applied: false },
              editFailure: { reason: "verification_failed", verificationSummary: verification.summary },
            });
            return;
          }

          // Stage 6: Validate — verification passed; then save
          emit(buildStageEvent("validating", intentResult.type, actionDecision.actionType));

          // Stage 7: Save Program State
          emit(buildStageEvent("saving", intentResult.type, actionDecision.actionType));

          const isStructuralVibeEdit = editPlan.scope === "system" || editPlan.scope === "block";
          const whyChangedParts = editPlan.changes.map((c: any) => c.reason).filter((r: any): r is string => !!r);
          const vibeWhyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;

          const changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: resolvedSystem.id, source: "ai_edit",
            intent: editPlan.intent, scope: editPlan.scope,
            changeSummary: editResult.changeSummary, requestText: parsed.data.content,
            beforeSnapshot: editResult.beforeSnapshot, afterSnapshot: editResult.afterSnapshot,
            appliedCount: editResult.appliedCount, skippedCount: editResult.skippedCount,
            versionOverrides: isStructuralVibeEdit ? { isMajorVersion: true } : undefined,
            decisionMetadata: {
              whyChanged: vibeWhyChanged,
              intentType: intentResult.type,
              editSubtype: intentResult.editSubtype ?? undefined,
              verification: {
                status: verification.status,
                verifiedCount: verification.verifiedChanges.length,
                missingCount: verification.missingChanges.length,
                requiresReview: verification.requiresReview ?? false,
              },
            },
          });

          const coachingContent = buildVibeEditCoachingResponse(editResult);
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: editResult.changeSummary,
            changedIds: editResult.changedIds,
            systemId: resolvedSystem.id,
            changeLogId,
            verificationStatus: verification.status,
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
              intentResultVal: intentResult, systemSavedVal: systemAutoCreatedForEdit,
              systemIdVal: systemAutoCreatedForEdit ? resolvedSystem.id : undefined,
              outcomeTypeVal: "mutation_applied",
            }),
            systemEdit: {
              applied: true,
              changeSummary: editResult.changeSummary,
              changedIds: editResult.changedIds,
              changeTargets: editResult.changeTargets,
              systemId: resolvedSystem.id,
              changeLogId,
              verificationStatus: verification.status as VerificationStatus,
              requiresReview: verification.requiresReview ?? false,
            },
          });
          return;
        }
        // No changes applied — return agentic coaching response, do NOT fall through to AI
        logger.warn({ intent: editPlan.intent, scope: editPlan.scope, skipped: editResult.skippedCount, editSubtype: intentResult.editSubtype }, "[VibeEdit:stream] No changes applied — returning agentic clarification response");
        const noOpContent = buildAgenticNoChangesResponse(
          parsed.data.content,
          editPlan.intent,
          editPlan.scope,
          intentResult.editSubtype,
          streamResolvedTarget
        );
        const [noOpMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noOpContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done({
          ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: noOpMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }),
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_applied", skippedCount: editResult.skippedCount },
        });
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "[VibeEdit:stream] Edit pipeline threw — returning error response to user");
      const errContent = `Something went wrong on my end while applying that change — your program hasn't been modified.\n\nGive it another try. If it keeps happening, try being a bit more specific: name the exercise, the day, or exactly what you want to change and I'll lock it in.`;
      const [errMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: errContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      done({
        ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: errMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure" }),
        systemEdit: { applied: false },
        editFailure: { reason: "pipeline_error" },
      });
      return;
    }
  }

  // ── Standard AI Response Path ─────────────────────────────────────────────
  // Stage 4: Plan Modifications — determine scope and pre-transform if needed
  emit(buildStageEvent("planning", intentResult.type, actionDecision.actionType));

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
  emit(buildStageEvent("applying", intentResult.type, actionDecision.actionType));

  let { content: aiContent, structuredData } = await generateAIResponse(
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
      extractedConstraints,
      userMessage: parsed.data.content,
      neuralContext: streamNeuralContextStr,
      neuralBias: streamNeuralBias,
      neuralImbalances: streamNeuralImbalances,
      uiContext: streamUIContext,
    }
  );

  // ── Constraint Validation & Retry ─────────────────────────────────────────
  if (
    extractedConstraints &&
    structuredData &&
    (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM")
  ) {
    const violations = validateProgramAgainstConstraints(structuredData, extractedConstraints);
    if (violations.length > 0) {
      logger.warn(
        { violations, programName: structuredData.programName, days: structuredData.days.length },
        "[SSE/ConstraintValidation] Program violates constraints — retrying"
      );
      const enforceHint = `\n## CONSTRAINT ENFORCEMENT — RETRY\nThe previous program generation FAILED validation:\n${violations.map(v => `- ${v.field}: expected ${v.expected}, got ${v.actual}`).join("\n")}\n\nThis is your SECOND AND FINAL attempt. Correct every violation before outputting JSON.`;
      const retryResult = await generateAIResponse(
        parsed.data.content,
        history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        userId,
        {
          currentProgram: preTransformedProgram,
          intentResult,
          actionDecision,
          responseMode,
          extractedConstraints,
          userMessage: parsed.data.content,
          transformHint: enforceHint,
        }
      ).catch(() => null);

      if (retryResult?.structuredData) {
        const retryViolations = validateProgramAgainstConstraints(retryResult.structuredData, extractedConstraints);
        if (retryViolations.length === 0) {
          aiContent = retryResult.content;
          structuredData = retryResult.structuredData;
          logger.info("[SSE/ConstraintValidation] Retry succeeded");
        } else {
          const dayViolation = violations.find(v => v.field === "daysPerWeek");
          const retryDayViolation = retryViolations.find(v => v.field === "daysPerWeek");
          if (dayViolation && !retryDayViolation) {
            aiContent = retryResult.content;
            structuredData = retryResult.structuredData;
            logger.info("[SSE/ConstraintValidation] Day count fixed in retry — accepting");
          }
        }
      }
    }
  }

  // Stage 6: Validate — AI response quality checks done; now persist
  emit(buildStageEvent("validating", intentResult.type, actionDecision.actionType));

  // ── Enrich structuredData with build metadata for initial builds ──────────
  // If there was no active system before this request and we built a new program,
  // attach _buildMeta so the chat message can render a rich BuildSummaryCard.
  const isInitialBuild =
    !hasActiveSystem &&
    structuredData != null &&
    (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM");

  if (isInitialBuild && structuredData) {
    (structuredData as unknown as Record<string, unknown>)._buildMeta = {
      frequency: structuredData.days.length,
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      sessionDuration: extractedConstraints?.sessionDuration ?? null,
    };
  }

  // Stage 7: Save Program State
  emit(buildStageEvent("saving", intentResult.type, actionDecision.actionType));

  const [assistantMessage] = await db.insert(messagesTable).values({
    conversationId: params.data.id, role: "assistant", content: aiContent,
    structuredData: structuredData ? JSON.stringify(structuredData) : null,
  }).returning();

  await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

  // ── Auto-save / Change Engine ─────────────────────────────────────────────
  // Same routing as non-streaming path:
  //   • CREATE_PROGRAM / START_NEW_PROGRAM → create NEW system (archive existing)
  //   • Edit intents → update in place
  let systemSaved = false;
  let autoSavedSystemId: number | undefined;
  let changeLogId: number | undefined;

  if (structuredData && Array.isArray(structuredData.days) && structuredData.days.length > 0) {
    try {
      const isNewProgramBuildSSE =
        intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM";
      let savedSystem: { id: number; [key: string]: any };
      let isUpdate: boolean;
      if (isNewProgramBuildSSE) {
        savedSystem = await createTrainingSystemFromProgram(userId, structuredData);
        isUpdate = false;
      } else {
        const result = await upsertTrainingSystemFromProgram(userId, structuredData);
        savedSystem = result.system;
        isUpdate = result.isUpdate;
      }
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      const emptySnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
      const fullProgramSnapshot = structuredData as unknown as Record<string, unknown>;

      if (isUpdate) {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[ChangeEngine:stream] Active program updated in place"
        );
        try {
          const updateSummary = structuredData.whatChanged
            ?? `Program updated: ${structuredData.days.length} days/week · ${structuredData.programName}`;
          const updateMeta: Record<string, unknown> = {
            intentType: intentResult.type,
            editSubtype: intentResult.editSubtype ?? undefined,
            programDays: structuredData.days.length,
            programGoal: extractedConstraints?.primaryGoal ?? null,
            programSport: extractedConstraints?.sportFocus ?? null,
          };
          if (structuredData.whyChanged) updateMeta.whyChanged = structuredData.whyChanged;
          changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: savedSystem.id, source: "ai_edit",
            intent: intentResult.editSubtype ?? intentResult.type.toLowerCase(),
            scope: "system", changeSummary: updateSummary,
            requestText: parsed.data.content.slice(0, 300),
            beforeSnapshot: emptySnapshot, afterSnapshot: emptySnapshot,
            fullProgramSnapshot,
            appliedCount: 1, skippedCount: 0,
            versionOverrides: { isMajorVersion: true },
            decisionMetadata: updateMeta,
          });
        } catch (logErr) {
          logger.warn({ logErr }, "[ChangeEngine:stream] Failed to write AI change log — non-fatal");
        }
      } else {
        logger.info(
          { userId, systemId: savedSystem.id, programName: structuredData.programName },
          "[AutoSave:stream] New training system created — logging Initial Build version"
        );
        try {
          const initialBuildSummary = buildInitialBuildSummary(structuredData, extractedConstraints);
          changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: savedSystem.id, source: "initialize",
            intent: "create_program", scope: "system",
            changeSummary: initialBuildSummary,
            requestText: parsed.data.content.slice(0, 300),
            beforeSnapshot: emptySnapshot, afterSnapshot: emptySnapshot,
            fullProgramSnapshot,
            appliedCount: 1, skippedCount: 0,
            versionOverrides: { isMajorVersion: true, versionLabel: "V1 Initial Build" },
            decisionMetadata: {
              intentType: intentResult.type,
              extractedConstraints: extractedConstraints ?? {},
              programDays: structuredData.days.length,
              programGoal: extractedConstraints?.primaryGoal ?? null,
              programSport: extractedConstraints?.sportFocus ?? null,
            },
          });
        } catch (logErr) {
          logger.warn({ logErr }, "[AutoSave:stream] Failed to write Initial Build log — non-fatal");
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
    changeLogIdVal: changeLogId,
    outcomeTypeVal: systemSaved ? "mutation_applied" : "conversation_only",
  }));
});

export default router;

