import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable, neuralProfilesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, type ProgramStructure, validateProgramAgainstConstraints } from "../lib/ai";
import { getLastMonthlyPlan } from "../lib/program-architecture-engine";
import { classifyIntent, logIntentSummary, extractConstraints, type IntentResult, type ExtractedConstraints } from "../lib/intent";
import { extractAgentIntentProfile } from "../lib/language-system";
import { auditLanguageInterpretation } from "../lib/language-audit";
import { resolveResponsePolicy, type ResponsePolicy, type ResponsePolicyContext } from "../lib/response-policy-engine";
import { auditResponsePolicy } from "../lib/response-policy-audit";
import {
  type ResponseMode,
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
import { interpretEditRequest, resolveTargetFromRequest, hasDeiticSessionReference } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import type { VerificationStatus } from "../lib/mutation-verifier";
import { createChangeLogEntry, type SystemSnapshot } from "../lib/change-log-service";
import { interpretNeuralGraph, buildNeuralAdjustmentSummary, type NeuralBias, type Imbalance } from "../lib/neural-graph-interpreter";
import { getActiveTrainingSystem, getFullTrainingSystem, createTrainingSystemFromProgram, upsertTrainingSystemFromProgram, dbSystemToProgramStructure } from "../lib/training-system-service";
import { buildDecisionMemory } from "../lib/decision-memory-service";
import { logger } from "../lib/logger";
import { buildStageEvent, type BuildStage } from "../lib/build-pipeline";
import {
  writePendingClarification,
  getActivePendingClarification,
  resolvePendingClarification,
  clearPendingClarificationsForConversation,
  looksLikeClarificationAnswer,
  buildReconstructedRequest,
} from "../lib/pending-clarification-service";
import { normalizeToIntentFamily } from "../lib/intent-family-engine";
import { buildExecutionPlan, type ExecutionPlan } from "../lib/execution-planner";
import { resolveAgentSettingsContext, type CoachBehaviorSettings, type AgentSettingsContext } from "../lib/agent-settings-resolver";
import { resolveRefinementScope } from "../lib/refinement-scope-resolver";
import { applyHierarchicalRefinement } from "../lib/hierarchical-refine-engine";

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
// ── Known training transformation intents ─────────────────────────────────────
// RULE: If a request contains a recognized coaching intent keyword AND a valid
// target was resolved, NEVER return a clarification question. These are unambiguous
// coaching commands — TrainChat must respond like a coach, not a parser.
const KNOWN_TRAINING_INTENT_PATTERN = /\b(endurance|aerobic|cardio|metabolic|work.capacity|conditioning|explosive|power|athletic|hypertrophy|muscle.build|muscle.growth|strength|stronger|fat.loss|cutting|leaner|speed|fast.twitch)\b/i;

function buildAgenticNoChangesResponse(
  userRequest: string,
  editIntent: string,
  editScope: string,
  editSubtype: string | undefined,
  resolvedTarget?: { type: string; label?: string } | null,
  executionFamily?: string | null,
): string {
  const lower = userRequest.toLowerCase();

  // ── BUTTON-DRIVEN ADD EXERCISE — never say "try being more specific" ──────────
  // When the execution plan is add_exercise (i.e. triggered by the right-panel button),
  // the intent is unambiguous. The failure is slot/exercise selection, not user clarity.
  // Return a retry prompt that never asks the user to clarify what the button already told us.
  if (executionFamily === "add_exercise" || editIntent === "add_exercise") {
    const targetLabel = resolvedTarget?.label ? `"${resolvedTarget.label}"` : "that session";
    return `I tried inserting a new exercise into ${targetLabel} but ran into an issue selecting the right one. Give it another tap — or name the type you'd like (e.g. "add a posterior chain accessory" or "add a conditioning finisher") and I'll place it right away.`;
  }

  // If the user mentioned a specific day/session and we still got 0 changes,
  // the problem is with what to change — not where. Ask about the action, not the location.
  const hasExplicitDayRef = /\bday\s+\d+\b|\bsession\s+\d+\b|\b(first|second|third|fourth|fifth|sixth|seventh)\s+(day|session)\b/.test(lower);
  const hasExplicitWeekRef = /\bweek\s+\d+\b/.test(lower);
  const hadResolvedTarget = !!resolvedTarget;

  // ── KNOWN INTENT OVERRIDE — NEVER ask for clarification ─────────────────────
  // A known coaching transformation keyword + a resolved target = unambiguous request.
  // Return a proactive coaching response instead of a clarification question.
  const isKnownIntent = KNOWN_TRAINING_INTENT_PATTERN.test(lower);
  if (isKnownIntent && (hadResolvedTarget || hasExplicitDayRef)) {
    const targetLabel = resolvedTarget?.label ? `"${resolvedTarget.label}"` : "that session";

    // Map known intent keywords to what was attempted, so the response is specific
    const intentDescriptions: [RegExp, string][] = [
      [/\b(endurance|aerobic|cardio|work.capacity|stamina)\b/i, "endurance conditioning (finisher added, rest tightened, rep ranges pushed up)"],
      [/\b(explosive|power|athletic)\b/i, "explosive output (Box Jump or Med Ball added, primary lifts shifted to power rep range with 3-1-X-0 tempo)"],
      [/\b(hypertrophy|muscle.build|muscle.growth)\b/i, "hypertrophy (rep ranges moved to 6-15, isolation accessory added, rest shortened)"],
      [/\b(strength|stronger)\b/i, "maximal strength (rep ranges moved to 3-6, rest extended to 3-5 min, load target 85-92%)"],
      [/\b(conditioning|metabolic)\b/i, "conditioning (circuit finisher added, rest density increased)"],
      [/\b(fat.loss|cutting|leaner)\b/i, "fat loss focus (rest tightened, conditioning finisher added)"],
      [/\b(speed|fast.twitch)\b/i, "speed and power (plyometrics added, load reduced to 60-70%)"],
    ];

    let attemptedDesc = "the coaching transformation you described";
    for (const [pattern, desc] of intentDescriptions) {
      if (pattern.test(lower)) {
        attemptedDesc = desc;
        break;
      }
    }

    return `I targeted ${targetLabel} for ${attemptedDesc}, but the session doesn't have enough exercise data to apply all the structural changes yet.\n\nIf this session has exercises programmed in, try the request again — or add the exercises first and I'll apply the full transformation right away.`;
  }

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
    return `I found ${targetLabel} in your program but couldn't match a clean change to it based on your request. Try being a bit more specific — for example: "add a Romanian deadlift", "remove the leg curl", or "reduce sets on the accessories". Once I know exactly what to change, I'll apply it right away.`;
  }

  // Request explicitly named a week — don't ask "which week?" again
  if (hasExplicitWeekRef) {
    return `I located that week in your program but couldn't determine what to change. Try being a bit more specific — for example: "make it a deload", "reduce volume", or "add an extra conditioning finisher". I'll apply it directly once I understand the change.`;
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

  // ── Agent Settings — resolve behavior + training defaults for this request ──
  // Reads coachSettings from request body (sent by frontend from localStorage).
  // Falls back to system defaults when client sends nothing.
  const rawCoachSettings = (req.body as any)?.coachSettings as Partial<CoachBehaviorSettings> | undefined;
  const agentSettings: AgentSettingsContext = await resolveAgentSettingsContext(userId, rawCoachSettings ?? null);

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

  const allowMemory = isPro && agentSettings.behavior.memoryPersonalization;
  const allowInsights = agentSettings.behavior.proactiveInsights;

  if (isPro) {
    const [adaptation, memories] = await Promise.all([
      buildAdaptationContext(userId).catch(() => ({ promptContext: "" })),
      allowMemory ? listMemories(userId).catch(() => []) : Promise.resolve([]),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = allowMemory ? buildMemoryContext(memories) : "";
    if (allowInsights && allowMemory) {
      const insights = await generateInsights(userId, memories).catch(() => []);
      insightHint = buildInsightPromptHint(insights);
    }

    if (allowMemory) {
      syncMemoriesFromData(userId).catch(() => {});
      extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
    }
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

  // Read the new-build-session flag from the request body uiContext.
  // When true, the user has explicitly started a fresh builder session.
  // We scope hasAnyProgram to only this conversation's history so the intent
  // classifier doesn't treat the old DB system as "current program context",
  // which would bias ambiguous first messages toward EDIT instead of CREATE.
  const nonStreamUiCtx = (req.body as any)?.uiContext ?? null;
  const isFreshBuildSession = nonStreamUiCtx?.newBuildSession === true;

  // Load both conversation history program AND DB system in parallel.
  // This is critical for cross-conversation continuity: if the user opens a new
  // chat while having an existing program in the DB, the intent classifier must
  // know a program exists so it routes edit requests correctly.
  // Exception: when isFreshBuildSession = true, we treat the DB system as
  // non-existent for intent purposes so the agent is not biased toward editing
  // the old program.
  const [latestStructuredProgram, activeSystem] = await Promise.all([
    Promise.resolve(resolveCurrentProgram(history)),
    getActiveTrainingSystem(userId).catch(() => null),
  ]);

  const hasActiveProgram = latestStructuredProgram !== null;
  const hasActiveSystem = activeSystem !== null;

  // For intent classification, combine both signals: a program exists if it's
  // in either the conversation history OR the live DB system.
  // Exception: during a fresh build session, only use conversation-scoped history.
  const hasAnyProgram = isFreshBuildSession
    ? hasActiveProgram
    : (hasActiveProgram || hasActiveSystem);

  // Classify the intent — this is the single source of truth for routing
  let intentResult = classifyIntent(parsed.data.content, {
    hasActiveProgram: hasAnyProgram,
    conversationTurnCount: history.filter((m) => m.role === "user").length,
  });

  // ── Pending Clarification Check ────────────────────────────────────────────
  // Before acting on the classified intent, check whether there is an active
  // pending clarification for this conversation. If the classified intent is
  // GENERAL_COACHING_QUESTION (i.e. a short answer or location reference that
  // doesn't match normal edit patterns) AND the message looks like a
  // clarification answer, override to CLARIFICATION_FOLLOWUP so we resume
  // the pending mutation instead of routing to GUIDANCE_ONLY.
  const activePendingClarification = await getActivePendingClarification(params.data.id).catch(() => null);

  if (activePendingClarification) {
    const isStrongNewIntent =
      intentResult.type === "CREATE_PROGRAM" ||
      intentResult.type === "START_NEW_PROGRAM";

    if (isStrongNewIntent) {
      // User has explicitly moved to a new topic — clear the pending clarification
      await clearPendingClarificationsForConversation(params.data.id).catch(() => {});
      logger.info(
        { pendingId: activePendingClarification.id, newIntent: intentResult.type },
        "[PendingClarification] Strong new intent detected — clearing active pending clarification"
      );
    } else if (
      intentResult.type === "GENERAL_COACHING_QUESTION" &&
      looksLikeClarificationAnswer(parsed.data.content)
    ) {
      // Short answer that looks like a clarification resolution — override intent
      intentResult = { type: "CLARIFICATION_FOLLOWUP", confidence: "high" };
      logger.info(
        {
          pendingId: activePendingClarification.id,
          userMessage: parsed.data.content.slice(0, 80),
          originalRequest: activePendingClarification.originalRequest.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
        },
        "[PendingClarification] Classified as CLARIFICATION_FOLLOWUP — resuming pending mutation"
      );
    }
  }

  logIntentSummary(parsed.data.content, intentResult, hasAnyProgram);

  // ── Language System + Response Policy ────────────────────────────────────
  // Layer 1: extract broad coaching language profile from the user message.
  // Layer 2: resolve a ResponsePolicy (action, scope, mode, voice, preserves).
  // Both layers are non-fatal — any failure is swallowed so the main flow continues.
  let resolvedResponsePolicy: ResponsePolicy | null = null;
  try {
    const langProfile = extractAgentIntentProfile(parsed.data.content, hasAnyProgram);
    auditLanguageInterpretation(langProfile);

    const policyCtx: ResponsePolicyContext = {
      hasActiveProgram: hasAnyProgram,
      currentBlock: latestStructuredProgram
        ? (latestStructuredProgram as any).phases?.[0]?.phaseName ?? null
        : null,
      todaySession: null,
    };

    resolvedResponsePolicy = resolveResponsePolicy(langProfile, policyCtx);
    auditResponsePolicy(resolvedResponsePolicy, parsed.data.content, langProfile);
  } catch (langErr) {
    // Intentionally silent — language/policy layer is observability + enrichment only
  }

  // ── EXECUTION PLANNER — Central single-brain routing decision ─────────────
  // Converts message + program state + pending clarification into one plan.
  // All downstream routing is driven by plan.action.
  const execPlan: ExecutionPlan = await buildExecutionPlan({
    message: parsed.data.content,
    userId: String(userId),
    conversationId: String(params.data.id),
    program: latestStructuredProgram,
    pendingClarification: activePendingClarification
      ? {
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          originalRequest: activePendingClarification.originalRequest,
          clarificationQuestion: activePendingClarification.clarificationQuestion,
        }
      : null,
    uiContext: nonStreamUiCtx,
  });

  logger.info(
    {
      action: execPlan.action,
      intentFamily: execPlan.intentFamily,
      scope: execPlan.scope,
      mutation: execPlan.mutation?.type ?? null,
      intentType: intentResult.type,
    },
    "[ExecutionPlanner] Plan resolved — driving routing"
  );

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

  // ── Response Mode Selection — derived from execution planner action ──────────
  // Decision tree (resolveAction) is no longer called here; the execution planner
  // is the single routing authority. ResponseMode is derived directly from execPlan.
  // For GUIDANCE actions, we further specialize the mode based on the intent family
  // so program questions get the exact right response template.
  const responseMode: ResponseMode =
    execPlan.action === "ASK_CLARIFICATION" ? "CLARIFICATION_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "program_safety_question" ? "PROGRAM_SAFETY_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "program_explanation_question" ? "PROGRAM_EXPLANATION_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "coaching_question" ? "COACHING_GUIDANCE_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "greeting" ? "GREETING_RESPONSE" :
    execPlan.action === "GUIDANCE" ? "COACHING_RESPONSE" :
    "EXECUTION_RESPONSE";

  // ── Intent-specific routing ───────────────────────────────────────────────

  // RETRIEVE_CURRENT_PROGRAM — no AI call needed, return current program directly.
  // Source-of-truth: DB-backed active system wins over stale conversation-history JSON.
  if (intentResult.type === "RETRIEVE_CURRENT_PROGRAM") {
    // Prefer DB-fresh state; fall back to conversation JSON; fall through to AI if neither exists
    let retrieveProgram: ProgramStructure | null = null;
    if (activeSystem) {
      const freshFull = await getFullTrainingSystem(activeSystem.id).catch(() => null);
      if (freshFull) retrieveProgram = dbSystemToProgramStructure(freshFull) as ProgramStructure | null;
    }
    if (!retrieveProgram) retrieveProgram = latestStructuredProgram;

    if (retrieveProgram) {
      logger.info(
        {
          source: activeSystem && retrieveProgram !== latestStructuredProgram ? "db_active_system" : "conversation_history",
          systemId: activeSystem?.id,
        },
        "[IntentRouter] Handling RETRIEVE_CURRENT_PROGRAM — returning current program without AI call"
      );
      const retrieveContent = formatShortCircuitResponse({
        mode: "EXECUTION_RESPONSE",
        hasActiveProgram: true,
      });
      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: retrieveContent,
        structuredData: JSON.stringify(retrieveProgram),
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

    // No program from either source — fall through to AI to explain
    logger.info("[IntentRouter] RETRIEVE_CURRENT_PROGRAM but no program found — routing to AI to explain");
  }

  // ── MAIN ROUTING SWITCH — driven entirely by execPlan.action ─────────────
  //
  //   APPLY_MUTATION  → edit engine (clarification followup OR direct vibe edit)
  //   ASK_CLARIFICATION → store pending state, return question
  //   REBUILD_PROGRAM   → fall through to AI program-builder path
  //   GUIDANCE          → fall through to AI coaching path
  //   NO_OP             → fall through (no action needed)
  //
  switch (execPlan.action) {

    // ── APPLY_MUTATION ────────────────────────────────────────────────────────
    // Handles both clarification followups (resume pending mutation) and direct
    // vibe edits (surgical edit on the active training system).
    case "APPLY_MUTATION": {

  // ── SUGGEST-ONLY GATE — skip edit engine when autoAdjustRecommendations is off ─
  // When executionPermission is "suggest_only", the edit engine is bypassed entirely.
  // The request falls through to the AI path, where system prompt behavior instructions
  // (injected via buildBehaviorInstructions) tell the AI to describe the change
  // and ask "Want me to apply this?" instead of mutating.
  if (agentSettings.behavior.executionPermission === "suggest_only") {
    logger.info(
      { userId, conversationId: params.data.id, executionPermission: "suggest_only" },
      "[AgentSettings] suggest_only mode — bypassing edit engine, routing to AI describe+confirm path"
    );
    break; // fall through to AI call below
  }

  // ── CLARIFICATION_FOLLOWUP — resume a pending mutation with the user's answer ──
  // This runs BEFORE the normal vibe edit path. When active, it reconstructs
  // the original request + user answer and re-runs the edit pipeline on the
  // pending intent family.
  if (intentResult.type === "CLARIFICATION_FOLLOWUP" && activePendingClarification) {
    const pending = activePendingClarification;

    logger.info(
      {
        pendingId: pending.id,
        intentFamily: pending.intentFamily,
        pendingAspect: pending.pendingAspect,
        originalRequest: pending.originalRequest.slice(0, 80),
        userReply: parsed.data.content.slice(0, 80),
        targetProgramId: pending.targetProgramId,
      },
      "[ClarificationFollowup] Resuming pending mutation"
    );

    const reconstructedRequest = buildReconstructedRequest(
      pending.originalRequest,
      parsed.data.content,
      pending.pendingAspect
    );

    logger.info(
      { reconstructedRequest: reconstructedRequest.slice(0, 200) },
      "[ClarificationFollowup] Reconstructed request built"
    );

    // Resolve the active system for editing
    let clarificationSystem = activeSystem;
    if (!clarificationSystem && latestStructuredProgram) {
      try {
        clarificationSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram);
        logger.info({ userId, systemId: clarificationSystem.id }, "[ClarificationFollowup] Auto-created system from chat program");
      } catch {
        // fall through to no-program response
      }
    }

    if (!clarificationSystem) {
      const noProgramContent = `You don't have a training program yet. Once you build one, I can apply targeted changes.\n\nTry something like: "Build me a 3-day strength program" — then I can handle any adjustments.`;
      const [assistantMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: noProgramContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      await resolvePendingClarification(pending.id, "no_program").catch(() => {});
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: assistantMsg.id, conversationId: assistantMsg.conversationId, role: assistantMsg.role, content: assistantMsg.content, createdAt: assistantMsg.createdAt.toISOString(), structuredData: null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: "CLARIFICATION_FOLLOWUP", confidence: "high" },
        systemEdit: { applied: false },
      });
      return;
    }

    try {
      const [clarificationFullSystem, clarificationDecisionMemory] = await Promise.all([
        getFullTrainingSystem(clarificationSystem.id),
        buildDecisionMemory(clarificationSystem.id, userId).catch(() => null),
      ]);

      if (clarificationFullSystem) {
        const clarificationTarget = resolveTargetFromRequest(
          reconstructedRequest,
          clarificationFullSystem,
          (req.body as any)?.uiContext ?? null
        );

        const clarificationEditPlan = await interpretEditRequest(
          reconstructedRequest,
          clarificationFullSystem,
          clarificationTarget,
          adaptationCtx || undefined,
          clarificationDecisionMemory?.decisionMemoryContext || undefined
        );

        logger.info(
          { intent: clarificationEditPlan.intent, scope: clarificationEditPlan.scope, changes: clarificationEditPlan.changes.length },
          "[ClarificationFollowup] Edit plan generated from reconstructed request"
        );

        const clarificationEditResult = await applyEditPlan(clarificationEditPlan, pending.intentFamily ?? undefined);

        logger.info(
          { applied: clarificationEditResult.appliedCount, skipped: clarificationEditResult.skippedCount },
          "[ClarificationFollowup] Edit plan applied"
        );

        if (clarificationEditResult.appliedCount > 0) {
          const verification = clarificationEditResult.verification;

          if (verification.status === "failed") {
            const failedContent = `I tried applying that change but it didn't land cleanly. Could you give me a bit more direction — the specific exercise name, which day it's in, or exactly what you'd like to change?`;
            const [failedMsg] = await db.insert(messagesTable).values({
              conversationId: params.data.id, role: "assistant", content: failedContent, structuredData: null,
            }).returning();
            await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
            await resolvePendingClarification(pending.id, "verification_failed").catch(() => {});
            if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
              stripeStorage.incrementMessageCount(userId).catch(() => {});
            }
            res.json({
              userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
              assistantMessage: { id: failedMsg.id, conversationId: failedMsg.conversationId, role: failedMsg.role, content: failedMsg.content, createdAt: failedMsg.createdAt.toISOString(), structuredData: null },
              planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
              intentDebug: { type: "CLARIFICATION_FOLLOWUP", confidence: "high" },
              systemEdit: { applied: false }, editFailure: { reason: "verification_failed" },
            });
            return;
          }

          const whyChangedParts = clarificationEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
          const whyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;
          const isStructuralVibeEdit = clarificationEditPlan.scope === "system" || clarificationEditPlan.scope === "block";

          const changeLogId = await createChangeLogEntry({
            userId,
            trainingSystemId: clarificationSystem.id,
            source: "ai_edit",
            intent: clarificationEditPlan.intent,
            scope: clarificationEditPlan.scope,
            changeSummary: clarificationEditResult.changeSummary,
            requestText: `[clarification followup] ${reconstructedRequest.slice(0, 300)}`,
            beforeSnapshot: clarificationEditResult.beforeSnapshot,
            afterSnapshot: clarificationEditResult.afterSnapshot,
            appliedCount: clarificationEditResult.appliedCount,
            skippedCount: clarificationEditResult.skippedCount,
            versionOverrides: isStructuralVibeEdit ? { isMajorVersion: true } : undefined,
            decisionMetadata: {
              whyChanged,
              intentType: "CLARIFICATION_FOLLOWUP",
              intentFamily: pending.intentFamily,
              pendingAspect: pending.pendingAspect,
              originalRequest: pending.originalRequest,
              userReply: parsed.data.content,
              verification: {
                status: verification.status,
                verifiedCount: verification.verifiedChanges.length,
                missingCount: verification.missingChanges.length,
                requiresReview: verification.requiresReview ?? false,
              },
            },
          });

          const coachingContent = buildVibeEditCoachingResponse(clarificationEditResult);
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: clarificationEditResult.changeSummary,
            changedIds: clarificationEditResult.changedIds,
            systemId: clarificationSystem.id,
            changeLogId,
            verificationStatus: verification.status,
          };

          const [assistantMessage] = await db.insert(messagesTable).values({
            conversationId: params.data.id,
            role: "assistant",
            content: coachingContent,
            structuredData: JSON.stringify(systemEditData),
          }).returning();

          await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
          await resolvePendingClarification(pending.id, "mutation_applied").catch(() => {});

          if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
            stripeStorage.incrementMessageCount(userId).catch(() => {});
          }

          res.json({
            userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
            assistantMessage: { id: assistantMessage.id, conversationId: assistantMessage.conversationId, role: assistantMessage.role, content: assistantMessage.content, createdAt: assistantMessage.createdAt.toISOString(), structuredData: assistantMessage.structuredData ?? null },
            planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
            intentDebug: { type: "CLARIFICATION_FOLLOWUP", confidence: "high" },
            systemEdit: {
              applied: true,
              changeSummary: clarificationEditResult.changeSummary,
              changedIds: clarificationEditResult.changedIds,
              changeTargets: clarificationEditResult.changeTargets,
              systemId: clarificationSystem.id,
              changeLogId,
              verificationStatus: verification.status as VerificationStatus,
              requiresReview: verification.requiresReview ?? false,
            },
          });
          return;
        }

        // No changes applied — the reconstructed request still didn't produce edits
        // Expire the pending clarification so we don't loop
        await resolvePendingClarification(pending.id, "no_changes_after_followup").catch(() => {});
        const noOpFollowupContent = `I couldn't find a clean match for that in your program. Try being more specific — for example: the exercise name, the day number, or exactly what you'd like to change (sets, reps, or movement).`;
        const [noOpMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noOpFollowupContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: noOpMsg.id, conversationId: noOpMsg.conversationId, role: noOpMsg.role, content: noOpMsg.content, createdAt: noOpMsg.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: "CLARIFICATION_FOLLOWUP", confidence: "high" },
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_after_followup" },
        });
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "[ClarificationFollowup] Pipeline threw — falling through to standard AI response");
      await resolvePendingClarification(pending.id, "pipeline_error").catch(() => {});
      // Fall through to standard AI response if the pipeline fails
    }
  }

      break; // end case "APPLY_MUTATION" — clarification followup did not fire; direct vibe edit handled below
    } // end case "APPLY_MUTATION"

    // ── ASK_CLARIFICATION ─────────────────────────────────────────────────────
    // Store pending clarification state and return the question without an AI call.
    case "ASK_CLARIFICATION": {

  // ASK_CLARIFYING_QUESTION — decision tree determined the request is genuinely ambiguous.
  // Skip AI call entirely; return the pre-formed question as the assistant response.
  // Write a pending clarification record BEFORE returning so the next reply can resume.
  if (execPlan.clarification?.question) {
    const clarifyingQuestion = execPlan.clarification.question;
    logger.info(
      { planAction: execPlan.action, question: clarifyingQuestion },
      "[ExecutionPlanner] Returning clarifying question — skipping AI call"
    );
    const clarifyContent = formatShortCircuitResponse({
      mode: "CLARIFICATION_RESPONSE",
      hasActiveProgram,
      clarifyingQuestion,
    });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: clarifyContent,
      structuredData: null,
    }).returning();

    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

    // Write pending clarification state so the next reply can resume the correct intent
    if (intentResult.type === "EDIT_PROGRAM" || intentResult.type === "ADJUST_FOR_PAIN" || intentResult.type === "ADJUST_FOR_READINESS") {
      const familyResult = normalizeToIntentFamily(parsed.data.content);
      writePendingClarification({
        conversationId: params.data.id,
        userId,
        targetProgramId: activeSystem?.id ?? null,
        originalRequest: parsed.data.content,
        intentFamily: familyResult.family,
        pendingAspect: "scope",
        clarificationQuestion: clarifyingQuestion,
        editSubtype: intentResult.editSubtype ?? null,
      }).catch((err) => logger.warn({ err }, "[PendingClarification] Failed to write record for planner clarification — non-fatal"));
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
        structuredData: null,
      },
      planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
      intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
      actionDebug: { planAction: execPlan.action, clarificationSource: "execution_planner" },
    });
    return;
  }

      break; // end case "ASK_CLARIFICATION"
    } // end case "ASK_CLARIFICATION"

    // ── REBUILD_PROGRAM / GUIDANCE / NO_OP ───────────────────────────────────
    // Fall through to the SAVE check and standard AI path below.
    case "REBUILD_PROGRAM":
    case "GUIDANCE":
    case "NO_OP":
    default:
      break;

  } // end switch (execPlan.action)

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

  // ── APPLY_MUTATION — direct vibe edit ────────────────────────────────────
  // Reached when execPlan.action === "APPLY_MUTATION" and the clarification
  // followup block (above) did not return early (i.e. this is a direct edit).
  // Resolution order:
  //   1. Active DB system exists   → edit directly (fast path)
  //   2. No DB system, chat program exists → auto-create system first, then edit
  //   3. No program at all         → return truthful "build first" message
  if (execPlan.action === "APPLY_MUTATION") {
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
      { userId, systemId: resolvedSystem.id, intentType: intentResult.type, mutationType: execPlan.mutation?.type ?? null, wasAutoCreated: systemAutoCreatedForEdit },
      "[MutationEngine] Entering mutation mode — deterministic edit, no AI interpretation"
    );

    try {
      // ── 1. Load full training system for DB pipeline ───────────────────────
      const [directFullSystem, directDecisionMemory] = await Promise.all([
        getFullTrainingSystem(resolvedSystem.id),
        buildDecisionMemory(resolvedSystem.id, userId).catch(() => null),
      ]);

      if (!directFullSystem) {
        const errContent = `I need a structured training program to apply that change. Build a program first, then I can handle any adjustments you need.`;
        const [errMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: errContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: errMsg.id, conversationId: errMsg.conversationId, role: errMsg.role, content: errMsg.content, createdAt: errMsg.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
          systemEdit: { applied: false },
        });
        return;
      }

      // ── 1.5 Hierarchical scope check — week or block scope bypasses session edit pipeline ─
      const directScopeResolution = resolveRefinementScope(parsed.data.content);
      if (directScopeResolution.scope !== "session_scope") {
        logger.info(
          { scope: directScopeResolution.scope, systemId: resolvedSystem.id },
          "[HierarchicalRefine] Routing to hierarchical engine"
        );
        const hierarchicalResult = await applyHierarchicalRefinement({
          systemId: resolvedSystem.id,
          userId,
          userMessage: parsed.data.content,
          scopeResolution: directScopeResolution,
        });

        const hierarchicalContent = hierarchicalResult.applied
          ? `Done — ${hierarchicalResult.changeSummary}`
          : `I wasn't able to apply that change. ${hierarchicalResult.changeSummary}`;

        const [hierarchicalMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: hierarchicalContent,
          structuredData: hierarchicalResult.applied
            ? JSON.stringify({ _type: "system_edit", changeSummary: hierarchicalResult.changeSummary, systemId: resolvedSystem.id })
            : null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        if (hierarchicalResult.applied) {
          createChangeLogEntry({
            userId,
            trainingSystemId: resolvedSystem.id,
            source: "ai_edit",
            intent: `${directScopeResolution.scope}_refinement`,
            scope: directScopeResolution.scope === "block_scope" ? "block" : "week",
            changeSummary: hierarchicalResult.changeSummary,
            requestText: parsed.data.content.slice(0, 300),
            appliedCount: hierarchicalResult.exerciseCount,
            skippedCount: 0,
            versionOverrides: directScopeResolution.scope === "block_scope" ? { isMajorVersion: true } : undefined,
          }).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: hierarchicalMsg.id, conversationId: hierarchicalMsg.conversationId, role: hierarchicalMsg.role, content: hierarchicalMsg.content, createdAt: hierarchicalMsg.createdAt.toISOString(), structuredData: hierarchicalMsg.structuredData ?? null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: directScopeResolution.scope },
          systemEdit: hierarchicalResult.applied
            ? { applied: true, changeSummary: hierarchicalResult.changeSummary, systemId: resolvedSystem.id }
            : { applied: false },
        });
        return;
      }

      // ── 2. Resolve target + interpret via DB edit pipeline ─────────────────
      const directTarget = resolveTargetFromRequest(
        parsed.data.content,
        directFullSystem,
        ((req.body as unknown as Record<string, unknown>)?.uiContext ?? null) as Record<string, unknown> | null
      );

      // ── 2.5 Deictic session reference guard ────────────────────────────────
      // "this day" / "this session" / "today" — user clearly means one session
      // but without a UIContext selectedSessionId we cannot tell which one.
      // Ask for clarification instead of silently mutating the whole program.
      if (!directTarget && hasDeiticSessionReference(parsed.data.content)) {
        const clarContent = `Which session did you have in mind? You can say something like "day 3", "the upper body session", or "week 2". Or open the session from your program view and tap the quick-edit button for precise targeting.`;
        const [clarMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: clarContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: clarMsg.id, conversationId: clarMsg.conversationId, role: clarMsg.role, content: clarMsg.content, createdAt: clarMsg.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
          outcomeType: "clarification_needed",
          systemEdit: { applied: false },
        });
        return;
      }

      const directEditPlan = await interpretEditRequest(
        parsed.data.content,
        directFullSystem,
        directTarget,
        adaptationCtx || undefined,
        directDecisionMemory?.decisionMemoryContext || undefined
      );

      logger.info(
        { intent: directEditPlan.intent, scope: directEditPlan.scope, changes: directEditPlan.changes.length, systemId: resolvedSystem.id },
        "[VibeEdit] DB pipeline — edit plan generated"
      );

      const directEditResult = await applyEditPlan(directEditPlan, execPlan.intentFamily ?? undefined);

      logger.info(
        { applied: directEditResult.appliedCount, skipped: directEditResult.skippedCount, systemId: resolvedSystem.id },
        "[VibeEdit] DB pipeline — edit plan applied"
      );

      // ── 3. Handle zero changes ─────────────────────────────────────────────
      if (directEditResult.appliedCount === 0) {
        const noChangesContent = buildAgenticNoChangesResponse(
          parsed.data.content,
          directEditPlan.intent,
          directEditPlan.scope,
          undefined,
          directTarget,
          execPlan.intentFamily,
        );
        const [noChangesMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noChangesContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: noChangesMsg.id, conversationId: noChangesMsg.conversationId, role: noChangesMsg.role, content: noChangesMsg.content, createdAt: noChangesMsg.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_produced" },
        });
        return;
      }

      // ── 4. Handle failed verification ──────────────────────────────────────
      const directVerification = directEditResult.verification;
      if (directVerification.status === "failed") {
        const failedContent = `I tried applying that change but it didn't land cleanly. Could you give me a bit more direction — the specific exercise name, which day it's in, or exactly what you'd like to change?`;
        const [failedMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: failedContent, structuredData: null,
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
          editFailure: { reason: "verification_failed" },
        });
        return;
      }

      // ── 5. Log the change ──────────────────────────────────────────────────
      const whyChangedParts = directEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
      const whyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;
      const isStructuralEdit = directEditPlan.scope === "system" || directEditPlan.scope === "block";

      const changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: resolvedSystem.id,
        source: "ai_edit",
        intent: directEditPlan.intent,
        scope: directEditPlan.scope as any,
        changeSummary: directEditResult.changeSummary,
        requestText: parsed.data.content.slice(0, 300),
        beforeSnapshot: directEditResult.beforeSnapshot,
        afterSnapshot: directEditResult.afterSnapshot,
        appliedCount: directEditResult.appliedCount,
        skippedCount: directEditResult.skippedCount,
        versionOverrides: isStructuralEdit ? { isMajorVersion: true } : undefined,
        decisionMetadata: {
          whyChanged,
          intentType: intentResult.type,
          intentFamily: execPlan.intentFamily,
          verification: {
            status: directVerification.status,
            verifiedCount: directVerification.verifiedChanges.length,
            missingCount: directVerification.missingChanges.length,
            requiresReview: directVerification.requiresReview ?? false,
          },
        },
      });

      // ── 6. Coaching response + persist message ─────────────────────────────
      const coachingContent = buildVibeEditCoachingResponse(directEditResult);

      const systemEditData = {
        _type: "system_edit" as const,
        changeSummary: directEditResult.changeSummary,
        changedIds: directEditResult.changedIds,
        systemId: resolvedSystem.id,
        changeLogId,
        verificationStatus: directVerification.status,
      };

      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: coachingContent,
        structuredData: JSON.stringify(systemEditData),
      }).returning();

      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }

      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: assistantMessage.id, conversationId: assistantMessage.conversationId, role: assistantMessage.role, content: assistantMessage.content, createdAt: assistantMessage.createdAt.toISOString(), structuredData: assistantMessage.structuredData ?? null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
        systemEdit: {
          applied: true,
          changeSummary: directEditResult.changeSummary,
          changedIds: directEditResult.changedIds,
          changeTargets: directEditResult.changeTargets,
          systemId: resolvedSystem.id,
          changeLogId,
          verificationStatus: directVerification.status as VerificationStatus,
          requiresReview: directVerification.requiresReview ?? false,
        },
      });
      return;

    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[VibeEdit] DB pipeline threw — returning error response");
      const errContent = `Something went wrong applying that change — your program hasn't been modified. Give it another try, and if it keeps happening, try being more specific about which exercise or day you mean.`;
      const [errMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: errContent, structuredData: null,
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
        editFailure: { reason: "edit_pipeline_error" },
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

  // ── SOURCE-OF-TRUTH RULE ──────────────────────────────────────────────────
  // BUILD mode (CREATE_PROGRAM / START_NEW_PROGRAM):
  //   conversation-built JSON is the source (DB system may not exist yet).
  // REFINE / EDIT / RETRIEVE mode:
  //   if a DB-backed active system exists, use that as currentProgram.
  //   DB state wins over stale conversation-history JSON — the AI and right panel
  //   must see the same program after any vibe edit.
  // PROGRAM QUESTION mode (GUIDANCE with program_safety_question, program_explanation_question, coaching_question):
  //   Also loads the current program so the AI can reference it when answering.
  //   This prevents the AI from answering blind without program context.
  // GREETING mode: also loads program so the AI can reference it in a context-aware greeting.
  const isProgramQuestionGuidance =
    execPlan.action === "GUIDANCE" && (
      execPlan.intentFamily === "program_safety_question" ||
      execPlan.intentFamily === "program_explanation_question" ||
      execPlan.intentFamily === "coaching_question" ||
      execPlan.intentFamily === "greeting"
    );

  let currentProgram: ProgramStructure | null = null;
  if (isModificationIntent || isProgramQuestionGuidance) {
    if (activeSystem) {
      // DB system exists — load fresh state and convert to ProgramStructure
      const freshFullSystem = await getFullTrainingSystem(activeSystem.id).catch(() => null);
      if (freshFullSystem) {
        const dbProgram = dbSystemToProgramStructure(freshFullSystem) as ProgramStructure | null;
        if (dbProgram) {
          currentProgram = dbProgram;
          logger.info(
            { source: "db_active_system", systemId: activeSystem.id, intentType: intentResult.type, days: dbProgram.days.length, isProgramQuestion: isProgramQuestionGuidance },
            "[ProgramContext] Using fresh DB program as currentProgram — overrides stale conversation JSON"
          );
        }
      }
    }
    if (!currentProgram) {
      // Fall back: build mode or no DB system yet
      currentProgram = latestStructuredProgram;
      logger.info(
        { source: "conversation_history", intentType: intentResult.type, hasProgram: !!latestStructuredProgram },
        "[ProgramContext] Using conversation-history program as currentProgram (no DB system)"
      );
    }
  }

  // ── STRUCTURAL_REBUILD pre-transform ──────────────────────────────────────
  // When the decision tree resolves a STRUCTURAL_REBUILD, run the transformation
  // engine before calling the AI. The AI then gets the already-transformed program
  // and just writes the coach confirmation — no structural guesswork needed.
  let preTransformedProgram: ProgramStructure | null = currentProgram;
  let transformHint: string | null = null;

  if (execPlan.action === "REBUILD_PROGRAM" && currentProgram) {
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
      actionDecision: null,
      transformHint: transformHint || undefined,
      responseMode,
      extractedConstraints,
      userMessage: parsed.data.content,
      neuralContext: neuralContextStr,
      neuralBias,
      neuralImbalances,
      hasActiveProgram: !!currentProgram || hasActiveSystem,
      agentSettings,
      responsePolicy: resolvedResponsePolicy,
    }
  );

  // Warn if EDIT_PROGRAM was routed but no structured data returned
  if (intentResult.type === "EDIT_PROGRAM" && currentProgram && !structuredData) {
    logger.warn("[IntentRouter] EDIT_PROGRAM intent with program context, but AI did not return updated JSON. Right panel will NOT update.");
  }

  // ── HARD GUARD: Block build templates for edit/refinement and program-question intents ─
  // Belt-and-suspenders protection:
  // 1. Edit/refine intents must never produce build-announcement language.
  // 2. Program question GUIDANCE intents (safety, explanation, coaching) must never
  //    produce build-announcement language — the user asked a question, not for a build.
  // 3. Any GUIDANCE response where no build actually occurred must not say "Built".
  {
    const isEditRefineIntent =
      intentResult.type === "EDIT_PROGRAM" ||
      intentResult.type === "ADJUST_FOR_PAIN" ||
      intentResult.type === "ADJUST_FOR_READINESS";

    const isGuidanceNoBuild = execPlan.action === "GUIDANCE";

    const shouldGuard = isEditRefineIntent || isGuidanceNoBuild || isProgramQuestionGuidance;

    if (shouldGuard) {
      // Pattern: build announcement language that should never appear in guidance/question responses
      const buildTemplatePattern = /^(built[\.\s]|got it[—\s]*i built\s|i built a \d|built a \d+[\s\-]day)/i;
      const buildBodyPattern = /\b(built a \d+[\s\-]day|check the program tab|your program is live in|i(?:'ve)? built (you |a )?(?:a )?\d+[\s\-]day)\b/i;

      if (buildTemplatePattern.test(aiContent.trim()) || (isGuidanceNoBuild && buildBodyPattern.test(aiContent))) {
        logger.warn(
          {
            intentType: intentResult.type,
            planAction: execPlan.action,
            intentFamily: execPlan.intentFamily,
            contentPreview: aiContent.slice(0, 100),
            guardReason: isEditRefineIntent ? "edit_refine_intent" : isProgramQuestionGuidance ? "program_question_guidance" : "guidance_no_build",
          },
          "[HardGuard] Build-template response detected for non-build path — overriding with coaching fallback"
        );

        if (isProgramQuestionGuidance) {
          if (execPlan.intentFamily === "program_safety_question") {
            aiContent = `That depends on your training background, current health, and any active injuries. For a healthy athlete adapted to this level of training, the program is appropriate. If you have specific concerns — pain, a recent injury, or very limited training history — let me know and I'll adjust the relevant parts.`;
          } else if (execPlan.intentFamily === "program_explanation_question") {
            aiContent = `The structure is built around your stated goal. Each session has a defined role — primary compound movements for the training stimulus, accessory work to reinforce weak links, and the ordering follows a CNS-demand hierarchy (hardest first). If you want me to explain a specific exercise or session, name it and I'll break it down.`;
          } else if (execPlan.intentFamily === "greeting") {
            aiContent = currentProgram
              ? `What's up — how's the program feeling so far?`
              : `What's up — want me to build you a program?`;
          } else {
            aiContent = `Good question. The program is structured to address your stated goal — the exercise selection, volume, and frequency are calibrated for that. If something doesn't seem right for your situation, tell me what specifically and I'll clarify or adjust.`;
          }
        } else {
          aiContent = `I processed your request and applied the change. Check the Program tab to see what was updated.`;
        }
      }
    }
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
          actionDecision: null,
          responseMode,
          extractedConstraints,
          userMessage: parsed.data.content,
          transformHint: enforceHint,
          neuralContext: neuralContextStr,
          neuralBias,
          neuralImbalances,
          agentSettings,
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
      // Attach block metadata from the most recent architecture brief build (side-effect)
      const lastPlan = getLastMonthlyPlan();
      if (lastPlan) {
        (structuredData as any).blockMetadata = {
          blockType: String(lastPlan.blockType),
          blockDisplayName: lastPlan.displayName,
          missionStatement: lastPlan.missionStatement,
          weekProgressionArc: lastPlan.weekProgressionArc,
          primaryAdaptation: lastPlan.primaryAdaptation,
          volumeProfile: lastPlan.volumeProfile,
          intensityProfile: lastPlan.intensityProfile,
        };
      }

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
      planAction: execPlan.action,
      intentFamily: execPlan.intentFamily,
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
  // Read the fresh-build flag passed by the frontend when the user starts a new builder session.
  // When true: scope intent classification to conversation history only (ignore DB active system)
  // and strip old program name from the AI system prompt uiContext section.
  const isFreshBuildSession = streamUIContext?.newBuildSession === true;

  // ── Agent Settings — resolve behavior + training defaults for this request ──
  const streamRawCoachSettings = (req.body as any)?.coachSettings as Partial<CoachBehaviorSettings> | undefined;
  const agentSettings: AgentSettingsContext = await resolveAgentSettingsContext(
    req.session.userId!,
    streamRawCoachSettings ?? null,
  );
  if (isFreshBuildSession) {
    logger.info(
      { conversationId: params.data.id },
      "[SSE/NewBuild] Fresh build session detected — DB system excluded from intent classification and uiContext stripped from AI prompt"
    );
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

  const allowMemory = isPro && agentSettings.behavior.memoryPersonalization;
  const allowInsights = agentSettings.behavior.proactiveInsights;

  if (isPro) {
    const [adaptation, memories] = await Promise.all([
      buildAdaptationContext(userId).catch(() => ({ promptContext: "" })),
      allowMemory ? listMemories(userId).catch(() => []) : Promise.resolve([]),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = allowMemory ? buildMemoryContext(memories) : "";
    if (allowInsights && allowMemory) {
      const insights = await generateInsights(userId, memories).catch(() => []);
      insightHint = buildInsightPromptHint(insights);
    }
    if (allowMemory) {
      syncMemoriesFromData(userId).catch(() => {});
      extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
    }
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
  // During a fresh build session, only use conversation-scoped history for intent classification.
  // This prevents the old DB system from biasing routing toward EDIT on ambiguous first messages.
  const hasAnyProgram = isFreshBuildSession
    ? hasActiveProgram
    : (hasActiveProgram || hasActiveSystem);

  let intentResult = classifyIntent(parsed.data.content, {
    hasActiveProgram: hasAnyProgram,
    conversationTurnCount: history.filter((m) => m.role === "user").length,
  });

  // ── Pending Clarification Check (SSE path) ─────────────────────────────────
  const activePendingClarification = await getActivePendingClarification(params.data.id).catch(() => null);

  if (activePendingClarification) {
    const isStrongNewIntent =
      intentResult.type === "CREATE_PROGRAM" ||
      intentResult.type === "START_NEW_PROGRAM";

    if (isStrongNewIntent) {
      await clearPendingClarificationsForConversation(params.data.id).catch(() => {});
      logger.info(
        { pendingId: activePendingClarification.id, newIntent: intentResult.type },
        "[PendingClarification:stream] Strong new intent — clearing pending clarification"
      );
    } else if (
      intentResult.type === "GENERAL_COACHING_QUESTION" &&
      looksLikeClarificationAnswer(parsed.data.content)
    ) {
      intentResult = { type: "CLARIFICATION_FOLLOWUP", confidence: "high" };
      logger.info(
        {
          pendingId: activePendingClarification.id,
          userMessage: parsed.data.content.slice(0, 80),
          originalRequest: activePendingClarification.originalRequest.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
        },
        "[PendingClarification:stream] Classified as CLARIFICATION_FOLLOWUP — resuming pending mutation"
      );
    }
  }

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

  // ── EXECUTION PLANNER (SSE path) — Central single-brain routing decision ──
  const execPlan: ExecutionPlan = await buildExecutionPlan({
    message: parsed.data.content,
    userId: String(userId),
    conversationId: String(params.data.id),
    program: latestStructuredProgram,
    pendingClarification: activePendingClarification
      ? {
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          originalRequest: activePendingClarification.originalRequest,
          clarificationQuestion: activePendingClarification.clarificationQuestion,
        }
      : null,
    uiContext: streamUIContext,
  });

  logger.info(
    {
      action: execPlan.action,
      intentFamily: execPlan.intentFamily,
      scope: execPlan.scope,
      mutation: execPlan.mutation?.type ?? null,
      intentType: intentResult.type,
    },
    "[ExecutionPlanner:stream] Plan resolved — driving routing"
  );

  // ── Response Mode Selection — derived from execution planner action ──────────
  // For GUIDANCE actions, specialize based on intent family so program questions
  // get the exact right response template (safety, explanation, or coaching).
  const responseMode: ResponseMode =
    execPlan.action === "ASK_CLARIFICATION" ? "CLARIFICATION_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "program_safety_question" ? "PROGRAM_SAFETY_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "program_explanation_question" ? "PROGRAM_EXPLANATION_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "coaching_question" ? "COACHING_GUIDANCE_RESPONSE" :
    execPlan.action === "GUIDANCE" && execPlan.intentFamily === "greeting" ? "GREETING_RESPONSE" :
    execPlan.action === "GUIDANCE" ? "COACHING_RESPONSE" :
    "EXECUTION_RESPONSE";

  // Emit classifying stage — intent and action type are now known
  emit(buildStageEvent("classifying", intentResult.type, execPlan.action));

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
  // DB-backed active system wins over stale conversation-history JSON.
  if (intentResult.type === "RETRIEVE_CURRENT_PROGRAM") {
    let retrieveProgram: ProgramStructure | null = null;
    if (activeSystem) {
      const freshFull = await getFullTrainingSystem(activeSystem.id).catch(() => null);
      if (freshFull) retrieveProgram = dbSystemToProgramStructure(freshFull) as ProgramStructure | null;
    }
    if (!retrieveProgram) retrieveProgram = latestStructuredProgram;

    if (retrieveProgram) {
      logger.info(
        { source: activeSystem && retrieveProgram !== latestStructuredProgram ? "db_active_system" : "conversation_history", systemId: activeSystem?.id },
        "[IntentRouter:stream] Handling RETRIEVE_CURRENT_PROGRAM — returning fresh program"
      );
      const retrieveContent = formatShortCircuitResponse({ mode: "EXECUTION_RESPONSE", hasActiveProgram: true });
      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: retrieveContent,
        structuredData: JSON.stringify(retrieveProgram),
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only" }));
      return;
    }
    // No program from either source — fall through to AI to explain
    logger.info("[IntentRouter:stream] RETRIEVE_CURRENT_PROGRAM but no program found — routing to AI to explain");
  }

  // ── MAIN ROUTING SWITCH (SSE path) — driven entirely by execPlan.action ───
  switch (execPlan.action) {

    // ── APPLY_MUTATION ────────────────────────────────────────────────────────
    case "APPLY_MUTATION": {

  // ── SUGGEST-ONLY GATE — skip edit engine when autoAdjustRecommendations is off ─
  if (agentSettings.behavior.executionPermission === "suggest_only") {
    logger.info(
      { userId, conversationId: params.data.id, executionPermission: "suggest_only" },
      "[AgentSettings:stream] suggest_only mode — bypassing edit engine, routing to AI describe+confirm path"
    );
    break; // fall through to AI call below
  }

  // ── Short-circuit: CLARIFICATION_FOLLOWUP ────────────────────────────────
  // Resume a pending mutation from a prior turn using the user's short answer.
  // This mirrors the non-stream path; we run the full edit pipeline, then emit
  // a complete event. Falls through to standard AI path on any pipeline error.
  if (intentResult.type === "CLARIFICATION_FOLLOWUP" && activePendingClarification) {
    const pending = activePendingClarification;

    const reconstructedRequest = buildReconstructedRequest(
      pending.originalRequest,
      parsed.data.content,
      pending.pendingAspect
    );

    logger.info(
      { pendingId: pending.id, reconstructedRequest: reconstructedRequest.slice(0, 200) },
      "[ClarificationFollowup:stream] Resuming pending mutation"
    );

    let clarificationSystem = activeSystem;
    if (!clarificationSystem && latestStructuredProgram) {
      try {
        clarificationSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram);
      } catch { /* fall through */ }
    }

    if (!clarificationSystem) {
      const noProgramContent = `You don't have a training program yet. Once you build one, I can apply targeted changes.`;
      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: noProgramContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      await resolvePendingClarification(pending.id, "no_program").catch(() => {});
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }
      done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, systemEditVal: { applied: false }, outcomeTypeVal: "conversation_only" }));
      return;
    }

    try {
      const [clarificationFullSystem, clarificationDecisionMemory] = await Promise.all([
        getFullTrainingSystem(clarificationSystem.id),
        buildDecisionMemory(clarificationSystem.id, userId).catch(() => null),
      ]);

      if (clarificationFullSystem) {
        const clarificationTarget = resolveTargetFromRequest(
          reconstructedRequest, clarificationFullSystem, (req.body as any)?.uiContext ?? null
        );
        const clarificationEditPlan = await interpretEditRequest(
          reconstructedRequest, clarificationFullSystem, clarificationTarget,
          adaptationCtx || undefined, clarificationDecisionMemory?.decisionMemoryContext || undefined
        );
        const clarificationEditResult = await applyEditPlan(clarificationEditPlan, pending.intentFamily ?? undefined);

        if (clarificationEditResult.appliedCount > 0) {
          const verification = clarificationEditResult.verification;
          const whyChangedParts = clarificationEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
          const whyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;
          const isStructuralVibeEdit = clarificationEditPlan.scope === "system" || clarificationEditPlan.scope === "block";

          const changeLogId = await createChangeLogEntry({
            userId, trainingSystemId: clarificationSystem.id, source: "ai_edit",
            intent: clarificationEditPlan.intent, scope: clarificationEditPlan.scope,
            changeSummary: clarificationEditResult.changeSummary,
            requestText: `[clarification followup:stream] ${reconstructedRequest.slice(0, 300)}`,
            beforeSnapshot: clarificationEditResult.beforeSnapshot,
            afterSnapshot: clarificationEditResult.afterSnapshot,
            appliedCount: clarificationEditResult.appliedCount, skippedCount: clarificationEditResult.skippedCount,
            versionOverrides: isStructuralVibeEdit ? { isMajorVersion: true } : undefined,
            decisionMetadata: { whyChanged, intentType: "CLARIFICATION_FOLLOWUP", intentFamily: pending.intentFamily, pendingAspect: pending.pendingAspect, originalRequest: pending.originalRequest, userReply: parsed.data.content, verification: { status: verification.status, verifiedCount: verification.verifiedChanges.length, missingCount: verification.missingChanges.length, requiresReview: verification.requiresReview ?? false } },
          });

          const coachingContent = buildVibeEditCoachingResponse(clarificationEditResult);
          const systemEditData = {
            _type: "system_edit" as const, changeSummary: clarificationEditResult.changeSummary,
            changedIds: clarificationEditResult.changedIds, systemId: clarificationSystem.id, changeLogId,
            verificationStatus: verification.status,
          };
          const [assistantMessage] = await db.insert(messagesTable).values({
            conversationId: params.data.id, role: "assistant", content: coachingContent,
            structuredData: JSON.stringify(systemEditData),
          }).returning();
          await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
          await resolvePendingClarification(pending.id, "mutation_applied").catch(() => {});
          if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }

          done(buildCompleteEvent({
            userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo,
            intentResultVal: intentResult, systemSavedVal: false,
            systemIdVal: clarificationSystem.id, changeLogIdVal: changeLogId,
            systemEditVal: { applied: true },
            outcomeTypeVal: "mutation_applied",
          }));
          return;
        }

        // No changes — expire pending and return helpful message
        await resolvePendingClarification(pending.id, "no_changes_after_followup").catch(() => {});
        const noOpFollowupContent = `I couldn't find a clean match for that in your program. Try being more specific — for example: the exercise name, the day number, or exactly what you'd like to change.`;
        const [noOpMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noOpFollowupContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }
        done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: noOpMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, systemEditVal: { applied: false }, outcomeTypeVal: "conversation_only" }));
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "[ClarificationFollowup:stream] Pipeline threw — falling through to standard AI response");
      await resolvePendingClarification(pending.id, "pipeline_error").catch(() => {});
      // Fall through to standard AI handling
    }
  }

      break; // end case "APPLY_MUTATION" — clarification followup did not fire; direct vibe edit handled below
    } // end case "APPLY_MUTATION"

    // ── ASK_CLARIFICATION ─────────────────────────────────────────────────────
    case "ASK_CLARIFICATION": {

  // ── Short-circuit: ASK_CLARIFYING_QUESTION ────────────────────────────────
  if (execPlan.clarification?.question) {
    const clarifyingQuestion = execPlan.clarification.question;
    const clarifyContent = formatShortCircuitResponse({ mode: "CLARIFICATION_RESPONSE", hasActiveProgram, clarifyingQuestion });
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: clarifyContent, structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));

    // Write pending clarification state so the next reply can resume the correct intent
    if (intentResult.type === "EDIT_PROGRAM" || intentResult.type === "ADJUST_FOR_PAIN" || intentResult.type === "ADJUST_FOR_READINESS") {
      const familyResult = normalizeToIntentFamily(parsed.data.content);
      writePendingClarification({
        conversationId: params.data.id, userId,
        targetProgramId: activeSystem?.id ?? null,
        originalRequest: parsed.data.content,
        intentFamily: familyResult.family,
        pendingAspect: "scope",
        clarificationQuestion: clarifyingQuestion,
        editSubtype: intentResult.editSubtype ?? null,
      }).catch((err) => logger.warn({ err }, "[PendingClarification:stream] Failed to write record for planner clarification — non-fatal"));
    }

    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }));
    return;
  }

      break; // end case "ASK_CLARIFICATION"
    } // end case "ASK_CLARIFICATION"

    // ── REBUILD_PROGRAM / GUIDANCE / NO_OP ───────────────────────────────────
    case "REBUILD_PROGRAM":
    case "GUIDANCE":
    case "NO_OP":
    default:
      break;

  } // end switch (execPlan.action) — SSE path

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

  // ── APPLY_MUTATION — direct vibe edit (SSE path) ─────────────────────────
  // Reached when execPlan.action === "APPLY_MUTATION" and clarification followup
  // block did not return early (i.e. this is a direct edit, not a followup).
  // Resolution order:
  //   1. Active DB system exists   → edit directly
  //   2. No DB system, chat program exists → auto-create system first, then edit
  //   3. No program at all         → return truthful "build first" SSE message
  if (execPlan.action === "APPLY_MUTATION") {
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
      // ── Stage: Planning ────────────────────────────────────────────────────
      emit(buildStageEvent("planning", intentResult.type, execPlan.action));

      // ── 1. Load full training system for DB pipeline ───────────────────────
      const [streamFullSystem, streamDecisionMemory] = await Promise.all([
        getFullTrainingSystem(resolvedSystem.id),
        buildDecisionMemory(resolvedSystem.id, userId).catch(() => null),
      ]);

      if (!streamFullSystem) {
        const errContent = `I need a structured training program to apply that change. Build a program first, then I can handle any adjustments you need.`;
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
        });
        return;
      }

      // ── 1.5 Hierarchical scope check — week or block scope bypasses session edit pipeline ─
      const streamScopeResolution = resolveRefinementScope(parsed.data.content);
      if (streamScopeResolution.scope !== "session_scope") {
        logger.info(
          { scope: streamScopeResolution.scope, systemId: resolvedSystem.id },
          "[HierarchicalRefine:stream] Routing to hierarchical engine"
        );
        emit(buildStageEvent("applying", intentResult.type, execPlan.action));
        const streamHierarchicalResult = await applyHierarchicalRefinement({
          systemId: resolvedSystem.id,
          userId,
          userMessage: parsed.data.content,
          scopeResolution: streamScopeResolution,
        });

        const streamHierarchicalContent = streamHierarchicalResult.applied
          ? `Done — ${streamHierarchicalResult.changeSummary}`
          : `I wasn't able to apply that change. ${streamHierarchicalResult.changeSummary}`;

        const [streamHierarchicalMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: streamHierarchicalContent,
          structuredData: streamHierarchicalResult.applied
            ? JSON.stringify({ _type: "system_edit", changeSummary: streamHierarchicalResult.changeSummary, systemId: resolvedSystem.id })
            : null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        if (streamHierarchicalResult.applied) {
          createChangeLogEntry({
            userId,
            trainingSystemId: resolvedSystem.id,
            source: "ai_edit",
            intent: `${streamScopeResolution.scope}_refinement`,
            scope: streamScopeResolution.scope === "block_scope" ? "block" : "week",
            changeSummary: streamHierarchicalResult.changeSummary,
            requestText: parsed.data.content.slice(0, 300),
            appliedCount: streamHierarchicalResult.exerciseCount,
            skippedCount: 0,
            versionOverrides: streamScopeResolution.scope === "block_scope" ? { isMajorVersion: true } : undefined,
          }).catch(() => {});
        }
        done(buildCompleteEvent({
          userMsg: userMessage,
          assistantMsg: streamHierarchicalMsg,
          planInfoVal: planInfo,
          intentResultVal: intentResult,
          systemSavedVal: streamHierarchicalResult.applied,
          outcomeTypeVal: streamHierarchicalResult.applied ? "mutation_applied" : "true_failure",
          systemEditVal: streamHierarchicalResult.applied
            ? { applied: true }
            : { applied: false },
        }));
        return;
      }

      // ── 2. Resolve target + interpret via DB edit pipeline ─────────────────
      emit(buildStageEvent("applying", intentResult.type, execPlan.action));

      const streamTarget = resolveTargetFromRequest(
        parsed.data.content,
        streamFullSystem,
        ((req.body as unknown as Record<string, unknown>)?.uiContext ?? null) as Record<string, unknown> | null
      );

      // ── 2.5 Deictic session reference guard ────────────────────────────────
      // "this day" / "this session" / "today" — user clearly means one session
      // but without a UIContext selectedSessionId we cannot tell which one.
      // Ask for clarification instead of silently mutating the whole program.
      if (!streamTarget && hasDeiticSessionReference(parsed.data.content)) {
        const clarContent = `Which session did you have in mind? You can say something like "day 3", "the upper body session", or "week 2". Or open the session from your program view and tap the quick-edit button for precise targeting.`;
        const [clarMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: clarContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done(buildCompleteEvent({
          userMsg: userMessage, assistantMsg: clarMsg, planInfoVal: planInfo,
          intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed",
        }));
        return;
      }

      const streamEditPlan = await interpretEditRequest(
        parsed.data.content,
        streamFullSystem,
        streamTarget,
        adaptationCtx || undefined,
        streamDecisionMemory?.decisionMemoryContext || undefined
      );

      logger.info(
        { intent: streamEditPlan.intent, scope: streamEditPlan.scope, changes: streamEditPlan.changes.length, systemId: resolvedSystem.id },
        "[VibeEdit:stream] DB pipeline — edit plan generated"
      );

      const streamEditResult = await applyEditPlan(streamEditPlan, execPlan.intentFamily ?? undefined);

      logger.info(
        { applied: streamEditResult.appliedCount, skipped: streamEditResult.skippedCount, systemId: resolvedSystem.id },
        "[VibeEdit:stream] DB pipeline — edit plan applied"
      );

      // ── 3. Handle zero changes ─────────────────────────────────────────────
      if (streamEditResult.appliedCount === 0) {
        const noChangesContent = buildAgenticNoChangesResponse(
          parsed.data.content,
          streamEditPlan.intent,
          streamEditPlan.scope,
          undefined,
          streamTarget,
          execPlan.intentFamily,
        );
        const [noChangesMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noChangesContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done({
          ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: noChangesMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only" }),
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_produced" },
        });
        return;
      }

      // ── 4. Handle failed verification ──────────────────────────────────────
      emit(buildStageEvent("validating", intentResult.type, execPlan.action));
      const streamVerification = streamEditResult.verification;

      if (streamVerification.status === "failed") {
        const failedContent = `I tried applying that change but it didn't land cleanly. Could you give me a bit more direction — the specific exercise name, which day it's in, or exactly what you'd like to change?`;
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
          editFailure: { reason: "verification_failed" },
        });
        return;
      }

      // ── 5. Log the change ──────────────────────────────────────────────────
      const streamWhyParts = streamEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
      const streamWhyChanged = streamWhyParts.length > 0 ? streamWhyParts.join("; ") : undefined;
      const streamIsStructural = streamEditPlan.scope === "system" || streamEditPlan.scope === "block";

      const changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: resolvedSystem.id,
        source: "ai_edit",
        intent: streamEditPlan.intent,
        scope: streamEditPlan.scope as any,
        changeSummary: streamEditResult.changeSummary,
        requestText: parsed.data.content.slice(0, 300),
        beforeSnapshot: streamEditResult.beforeSnapshot,
        afterSnapshot: streamEditResult.afterSnapshot,
        appliedCount: streamEditResult.appliedCount,
        skippedCount: streamEditResult.skippedCount,
        versionOverrides: streamIsStructural ? { isMajorVersion: true } : undefined,
        decisionMetadata: {
          whyChanged: streamWhyChanged,
          intentType: intentResult.type,
          intentFamily: execPlan.intentFamily,
          verification: {
            status: streamVerification.status,
            verifiedCount: streamVerification.verifiedChanges.length,
            missingCount: streamVerification.missingChanges.length,
            requiresReview: streamVerification.requiresReview ?? false,
          },
        },
      });

      // ── 6. Coaching response + persist message ─────────────────────────────
      const coachingContent = buildVibeEditCoachingResponse(streamEditResult);

      const systemEditData = {
        _type: "system_edit" as const,
        changeSummary: streamEditResult.changeSummary,
        changedIds: streamEditResult.changedIds,
        systemId: resolvedSystem.id,
        changeLogId,
        verificationStatus: streamVerification.status,
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
          changeSummary: streamEditResult.changeSummary,
          changedIds: streamEditResult.changedIds,
          changeTargets: streamEditResult.changeTargets,
          systemId: resolvedSystem.id,
          changeLogId,
          verificationStatus: streamVerification.status as VerificationStatus,
          requiresReview: streamVerification.requiresReview ?? false,
        },
      });
      return;
    } catch (err: any) {
      logger.error({ err: err?.message }, "[VibeEdit:stream] DB pipeline threw — returning error response");
      const errContent = `Something went wrong applying that change — your program hasn't been modified. Give it another try, and if it keeps happening, try being more specific about which exercise or day you mean.`;
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
        editFailure: { reason: "edit_pipeline_error" },
      });
      return;
    }
  }

  // ── Standard AI Response Path ─────────────────────────────────────────────
  // Stage 4: Plan Modifications — determine scope and pre-transform if needed
  emit(buildStageEvent("planning", intentResult.type, execPlan.action));

  const isModificationIntent = (
    intentResult.type === "EDIT_PROGRAM" ||
    intentResult.type === "ADJUST_FOR_PAIN" ||
    intentResult.type === "ADJUST_FOR_READINESS" ||
    intentResult.type === "RETRIEVE_CURRENT_PROGRAM"
  );

  // ── SOURCE-OF-TRUTH RULE (SSE path) ───────────────────────────────────────
  // BUILD mode: conversation JSON is the source (DB system may not exist yet).
  // REFINE / EDIT / RETRIEVE mode: DB-backed active system wins over stale
  // conversation-history JSON. The AI and the right panel must see the same
  // program. After any vibe edit, only the DB has the updated truth.
  // PROGRAM QUESTION mode: Also loads currentProgram so the AI can reference
  // it when answering safety, explanation, or coaching questions.
  const isProgramQuestionGuidanceSSE =
    execPlan.action === "GUIDANCE" && (
      execPlan.intentFamily === "program_safety_question" ||
      execPlan.intentFamily === "program_explanation_question" ||
      execPlan.intentFamily === "coaching_question" ||
      execPlan.intentFamily === "greeting"
    );

  let currentProgram: ProgramStructure | null = null;
  if (isModificationIntent || isProgramQuestionGuidanceSSE) {
    if (activeSystem) {
      const freshFullSystem = await getFullTrainingSystem(activeSystem.id).catch(() => null);
      if (freshFullSystem) {
        const dbProgram = dbSystemToProgramStructure(freshFullSystem) as ProgramStructure | null;
        if (dbProgram) {
          currentProgram = dbProgram;
          logger.info(
            { source: "db_active_system", systemId: activeSystem.id, intentType: intentResult.type, days: dbProgram.days.length, isProgramQuestion: isProgramQuestionGuidanceSSE },
            "[ProgramContext:stream] Using fresh DB program as currentProgram — overrides stale conversation JSON"
          );
        }
      }
    }
    if (!currentProgram) {
      currentProgram = latestStructuredProgram;
      logger.info(
        { source: "conversation_history", intentType: intentResult.type, hasProgram: !!latestStructuredProgram },
        "[ProgramContext:stream] Using conversation-history program as currentProgram (no DB system)"
      );
    }
  }

  let preTransformedProgram: ProgramStructure | null = currentProgram;
  let transformHint: string | null = null;

  if (execPlan.action === "REBUILD_PROGRAM" && currentProgram) {
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
  emit(buildStageEvent("applying", intentResult.type, execPlan.action));

  // For new program builds (or explicit fresh-build sessions), do NOT pass the old
  // uiContext to the AI. The buildUIContextSection would otherwise inject the old
  // program's name (e.g. "Active program: 'Program A'") into the system prompt,
  // causing the AI to anchor on the previous build instead of starting clean.
  const isNewBuildIntent =
    intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM";
  const safeUIContext = (isFreshBuildSession || isNewBuildIntent) ? null : streamUIContext;

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
      actionDecision: null,
      transformHint: transformHint || undefined,
      responseMode,
      extractedConstraints,
      userMessage: parsed.data.content,
      neuralContext: streamNeuralContextStr,
      neuralBias: streamNeuralBias,
      neuralImbalances: streamNeuralImbalances,
      uiContext: safeUIContext,
      hasActiveProgram: !!currentProgram || hasActiveSystem,
      agentSettings,
      responsePolicy: resolvedResponsePolicy,
    }
  );

  // ── HARD GUARD: Block build templates for edit/refinement and program-question intents ─
  // Belt-and-suspenders protection for the streaming path:
  // 1. Edit/refine intents must never produce build-announcement language.
  // 2. Program question GUIDANCE intents (safety, explanation, coaching) must never
  //    produce build-announcement language — the user asked a question, not for a build.
  // 3. Any GUIDANCE response where no build actually occurred must not say "Built".
  {
    const isEditRefineIntentSSE =
      intentResult.type === "EDIT_PROGRAM" ||
      intentResult.type === "ADJUST_FOR_PAIN" ||
      intentResult.type === "ADJUST_FOR_READINESS";

    const isGuidanceNoBuildSSE = execPlan.action === "GUIDANCE";

    const shouldGuardSSE = isEditRefineIntentSSE || isGuidanceNoBuildSSE || isProgramQuestionGuidanceSSE;

    if (shouldGuardSSE) {
      const buildTemplatePatternSSE = /^(built[\.\s]|got it[—\s]*i built\s|i built a \d|built a \d+[\s\-]day)/i;
      const buildBodyPatternSSE = /\b(built a \d+[\s\-]day|check the program tab|your program is live in|i(?:'ve)? built (you |a )?(?:a )?\d+[\s\-]day)\b/i;

      if (buildTemplatePatternSSE.test(aiContent.trim()) || (isGuidanceNoBuildSSE && buildBodyPatternSSE.test(aiContent))) {
        logger.warn(
          {
            intentType: intentResult.type,
            planAction: execPlan.action,
            intentFamily: execPlan.intentFamily,
            contentPreview: aiContent.slice(0, 100),
            guardReason: isEditRefineIntentSSE ? "edit_refine_intent" : isProgramQuestionGuidanceSSE ? "program_question_guidance" : "guidance_no_build",
          },
          "[HardGuard:stream] Build-template response detected for non-build path — overriding with coaching fallback"
        );

        if (isProgramQuestionGuidanceSSE) {
          if (execPlan.intentFamily === "program_safety_question") {
            aiContent = `That depends on your training background, current health, and any active injuries. For a healthy athlete adapted to this level of training, the program is appropriate. If you have specific concerns — pain, a recent injury, or very limited training history — let me know and I'll adjust the relevant parts.`;
          } else if (execPlan.intentFamily === "program_explanation_question") {
            aiContent = `The structure is built around your stated goal. Each session has a defined role — primary compound movements for the training stimulus, accessory work to reinforce weak links, and the ordering follows a CNS-demand hierarchy (hardest first). If you want me to explain a specific exercise or session, name it and I'll break it down.`;
          } else if (execPlan.intentFamily === "greeting") {
            aiContent = currentProgram
              ? `What's up — how's the program feeling so far?`
              : `What's up — want me to build you a program?`;
          } else {
            aiContent = `Good question. The program is structured to address your stated goal — the exercise selection, volume, and frequency are calibrated for that. If something doesn't seem right for your situation, tell me what specifically and I'll clarify or adjust.`;
          }
        } else {
          aiContent = `I processed your request and applied the change. Check the Program tab to see what was updated.`;
        }
      }
    }
  }

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
          actionDecision: null,
          responseMode,
          extractedConstraints,
          userMessage: parsed.data.content,
          transformHint: enforceHint,
          agentSettings,
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
  emit(buildStageEvent("validating", intentResult.type, execPlan.action));

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
  emit(buildStageEvent("saving", intentResult.type, execPlan.action));

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
      // Attach block metadata from the most recent architecture brief build (side-effect)
      const lastPlanSSE = getLastMonthlyPlan();
      if (lastPlanSSE) {
        (structuredData as any).blockMetadata = {
          blockType: String(lastPlanSSE.blockType),
          blockDisplayName: lastPlanSSE.displayName,
          missionStatement: lastPlanSSE.missionStatement,
          weekProgressionArc: lastPlanSSE.weekProgressionArc,
          primaryAdaptation: lastPlanSSE.primaryAdaptation,
          volumeProfile: lastPlanSSE.volumeProfile,
          intensityProfile: lastPlanSSE.intensityProfile,
        };
      }

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

