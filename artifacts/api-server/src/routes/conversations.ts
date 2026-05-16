import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable, neuralProfilesTable, trainingSystems, savedProgramsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { CreateConversationBody, GetConversationParams, DeleteConversationParams, ListMessagesParams, SendMessageBody, SendMessageParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateAIResponse, type ProgramStructure, validateProgramAgainstConstraints } from "../lib/ai";
import { getLastMonthlyPlan } from "../lib/program-architecture-engine";
import { classifyIntent, logIntentSummary, extractConstraints, detectSport, type IntentResult, type ExtractedConstraints } from "../lib/intent";
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
import { interpretEditRequest, resolveTargetFromRequest, hasDeiticSessionReference, buildBulkSessionSetsEditPlan } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";
import type { VerificationStatus } from "../lib/mutation-verifier";
import { createChangeLogEntry, type SystemSnapshot } from "../lib/change-log-service";
import { interpretNeuralGraph, buildNeuralAdjustmentSummary, type NeuralBias, type Imbalance } from "../lib/neural-graph-interpreter";
import { getActiveTrainingSystem, getFullTrainingSystem, createTrainingSystemFromProgram, upsertTrainingSystemFromProgram, dbSystemToProgramStructure } from "../lib/training-system-service";
import { buildDecisionMemory } from "../lib/decision-memory-service";
import { logger } from "../lib/logger";
import { buildStageEvent, type BuildStage } from "../lib/build-pipeline";
import type { NarrationContext } from "../lib/stage-narration";
import { verifyResponseAlignment } from "../lib/response-alignment-verifier";
import {
  persistConstraintsFromTurn,
  loadHardConstraints,
  buildConstraintEnforcementDirective,
  validateAgainstHardConstraints,
  type HardConstraints,
} from "../lib/constraint-memory";
import {
  writePendingClarification,
  getActivePendingClarification,
  resolvePendingClarification,
  clearPendingClarificationsForConversation,
  looksLikeClarificationAnswer,
  buildReconstructedRequest,
  decrementTurnsRemaining,
} from "../lib/pending-clarification-service";
import { normalizeToIntentFamily } from "../lib/intent-family-engine";
import { buildExecutionPlan, type ExecutionPlan } from "../lib/execution-planner";
import { applyAntiLoopReliabilityLayer } from "../lib/anti-loop-reliability-layer";
import { applyActionGuaranteeLayer } from "../lib/action-guarantee-layer";
import { validatePostMutationArchitectureLight } from "../lib/post-mutation-validator";
import { resolveAgentSettingsContext, type CoachBehaviorSettings, type AgentSettingsContext } from "../lib/agent-settings-resolver";
import { resolveRefinementScope, inferBlockTypeFromMessage, type ScopeResolution } from "../lib/refinement-scope-resolver";
import { applyHierarchicalRefinement } from "../lib/hierarchical-refine-engine";
import {
  processSessionScopeImpact,
  processHierarchicalImpact,
} from "../lib/refinement-impact-engine";
import { resolveFocusMode } from "../lib/focus-mode-audit";
import { logFocusModeAudit } from "../lib/focus-mode-audit";
import { generateCoachReasoning, goalToFocusMode, type FocusMode } from "../lib/coach-reasoning-engine";
import { buildMicroReasons } from "../lib/micro-reasoning";
import { buildConfidenceLine } from "../lib/confidence-signal";
import {
  resolveFailSafeState,
  applyFailSafeConstraints,
  attachFailSafeMetadata,
  prependFailSafeMessage,
  logFailSafeAudit,
  acquireFailSafeEditLock,
} from "../lib/fail-safe";
import { buildActionContract, type ActionContract } from "../lib/action-contract";
import { enforceActionContract, buildContractPromptDirective, type TurnOutcome } from "../lib/action-contract-enforcer";
import { orchestrate, logOrchestratorDecision } from "../agents/agent-orchestrator";
import { fireFirstBuildEmail } from "../lib/retentionEmails";
import {
  hasStructuralChanges,
  isMinorAttributeEdit,
  validateStructuralChanges,
  buildMutationSuccessReceipt,
  buildMutationFailureReceipt,
  type SessionContext,
} from "../lib/architect-patch-generator";
import { finalizeMutationOutcome, type MutationOutcomeResult } from "../lib/mutation-outcome-finalizer";
import {
  resolveContextualMessage,
  tickConversationTurn,
  clearConversationContext,
  storeExerciseReference,
  storeSessionReference,
  storeMutationReference,
  inferExerciseReferenceFromMutation,
  inferSessionReferenceFromMutation,
} from "../lib/conversation-context-resolver";
import { buildSessionLogContext } from "../lib/session-log-adaptation-analyzer";

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
 *
 * ADVISORY ONLY — classifyIntent() output is used here for logging and analytics.
 * The single routing authority is execPlan.action (from buildExecutionPlan).
 * No routing or mutation eligibility decision should depend solely on intentResult.type.
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

  // Generic fallback — targeted clarification question (never "I couldn't find a match")
  return `I can apply that — just to confirm, which day or session should this go to? For example: "Day 1", "the upper body day", or "the whole week". Once I know the target, I'll apply it directly.`;
}

/**
 * Builds a coaching-toned confirmation message after a successful system edit.
 * Used as a fallback when the AI stream doesn't produce a post-edit explanation.
 * Produces coach-voice output (what changed, brief why, what stayed) rather than
 * raw database language.
 */
function buildVibeEditCoachingResponse(editResult: EditResult): string {
  const summary = editResult.changeSummary;
  const skipped = editResult.skippedCount;
  const status = editResult.verification.status;

  // Ensure summary ends with period and reads naturally
  const base = (() => {
    const s = summary.endsWith(".") ? summary : `${summary}.`;
    // Strip scope prefixes that leak DB internals (e.g. "session_" → "")
    return s.replace(/^(session|week|block|exercise)_/i, "").trim();
  })();

  // Append a "what stayed intact" cue for partial or skipped cases
  if (status === "verified") {
    if (skipped > 0) {
      return `${base} ${skipped} item${skipped > 1 ? "s" : ""} couldn't be applied — try describing the target more specifically (exercise name, day number, or session type).`;
    }
    return base;
  }

  if (status === "partial") {
    const verifiedCount = editResult.verification.verifiedChanges.length;
    const totalCount = editResult.verification.expectedChanges.length;
    return `${base} ${verifiedCount} of ${totalCount} changes landed — check the Program panel to see what applied and what didn't.`;
  }

  if (status === "unclear") {
    return `${base} Double-check the Program panel to confirm everything looks right.`;
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
  const conversationId = params.data.id;

  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));

  if (!convo || convo.userId !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // ── Cascade: delete linked training systems ───────────────────────────────
  // CASE A: find any training systems that were built from this conversation.
  // If they are singly owned (only linked to this chat), delete them too.
  const linkedSystems = await db
    .select({ id: trainingSystems.id, status: trainingSystems.status, metadata: trainingSystems.metadata })
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.conversationId, conversationId)));

  let trainingSystemsDeleted = 0;
  let wasActiveSystemDeleted = false;
  let newActiveSystemId: number | null = null;

  for (const system of linkedSystems) {
    if (system.status === "active") {
      wasActiveSystemDeleted = true;
      // FOCUS-AWARE: only promote archived systems in the same focus lane.
      // Prevents a Speed system from being promoted when a Strength system is deleted.
      const systemFocusMode = ((system.metadata as any)?.focusMode ?? "strength") as string;
      const allArchived = await db
        .select({ id: trainingSystems.id, metadata: trainingSystems.metadata })
        .from(trainingSystems)
        .where(
          and(
            eq(trainingSystems.userId, userId),
            eq(trainingSystems.status, "archived"),
          )
        )
        .orderBy(desc(trainingSystems.updatedAt));

      const sameFocusArchived = allArchived.filter(
        (s) => ((s.metadata as any)?.focusMode ?? "strength") === systemFocusMode
      );
      const next = sameFocusArchived[0] ?? null;

      if (next) {
        await db
          .update(trainingSystems)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(trainingSystems.id, next.id));
        newActiveSystemId = next.id;
      }
    }
    await db.delete(trainingSystems).where(eq(trainingSystems.id, system.id));
    trainingSystemsDeleted++;
  }

  // ── Cascade: delete linked saved_programs snapshots ──────────────────────
  // The DB constraint is "set null" on delete, but we want to actually remove
  // the orphaned snapshot row when the source conversation is deleted.
  const deletedPrograms = await db
    .delete(savedProgramsTable)
    .where(and(eq(savedProgramsTable.userId, userId), eq(savedProgramsTable.conversationId, conversationId)))
    .returning({ id: savedProgramsTable.id });
  const savedProgramsDeleted = deletedPrograms.length;

  // ── Audit log ─────────────────────────────────────────────────────────────
  logger.info({
    sourceType: "chat",
    sourceId: conversationId,
    linkedEntityFound: linkedSystems.length > 0 || savedProgramsDeleted > 0,
    linkedEntityType: "training_system+saved_programs",
    actionTaken: trainingSystemsDeleted > 0 || savedProgramsDeleted > 0 ? "deleted" : "none",
    referenceCount: linkedSystems.length,
    trainingSystemsDeleted,
    savedProgramsDeleted,
    wasActiveSystemDeleted,
    newActiveSystemId,
  }, "[DeleteCascadeAudit]");

  // Delete the conversation (messages cascade via DB FK)
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conversationId));

  res.json({ success: true, trainingSystemsDeleted, savedProgramsDeleted, wasActiveSystemDeleted, newActiveSystemId });
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

  // ── Structured UI action guardrail ────────────────────────────────────────
  // Requests from deterministic UI actions (chips, buttons, panel controls)
  // must use /api/training-system/edit or /api/training-system/mutate — never
  // the chat endpoint. If any of these fields are present, reject fast.
  {
    const _body = req.body as Record<string, unknown>;
    const _hasStructuredUIField =
      _body.refineSource === "program_refine_panel" ||
      _body.scopeOverride != null ||
      _body.structuredIntent != null ||
      _body.uiAction != null ||
      (_body.trainingSystemId != null && _body.refineSource != null);
    if (_hasStructuredUIField) {
      logger.warn(
        { refineSource: _body.refineSource, scopeOverride: _body.scopeOverride, structuredIntent: _body.structuredIntent, uiAction: _body.uiAction },
        "[Structured UI Action] Blocked structured UI payload from chat endpoint — must use /api/training-system/edit"
      );
      res.status(400).json({
        error: "Structured UI actions must use /api/training-system/edit or /api/training-system/mutate — not the chat endpoint.",
        code: "STRUCTURED_UI_ROUTE_VIOLATION",
      });
      return;
    }
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

  // Hard constraints from persisted memory — enforced for ALL users regardless of plan tier.
  let hardConstraintsNonSSE: HardConstraints = { bannedItems: [], dislikedItems: [], painRegions: [], sport: null };
  let constraintDirectiveNonSSE: string | null = null;

  if (isPro) {
    const _sessionFocusMode = resolveFocusMode((req.body as any)?.uiContext?.focusMode ?? null);
    const [adaptation, memories, sessionLogCtx] = await Promise.all([
      buildAdaptationContext(userId, _sessionFocusMode).catch(() => ({ promptContext: "" })),
      allowMemory ? listMemories(userId).catch(() => []) : Promise.resolve([]),
      buildSessionLogContext(userId).catch(() => ""),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = allowMemory ? buildMemoryContext(memories) : "";
    if (sessionLogCtx) {
      memoryCtx += `\n\n${sessionLogCtx}`;
    }
    if (allowInsights && allowMemory) {
      const insights = await generateInsights(userId, memories).catch(() => []);
      insightHint = buildInsightPromptHint(insights);
    }

    if (allowMemory) {
      syncMemoriesFromData(userId).catch(() => {});
      extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
    }

    // Extract hard constraints from the already-loaded memories (no extra DB call)
    hardConstraintsNonSSE = loadHardConstraints(allowMemory ? memories : []);
    constraintDirectiveNonSSE = buildConstraintEnforcementDirective(hardConstraintsNonSSE);

    // ── Priority 5: Cross-conversation continuity opener ─────────────────────
    // ── Priority 2: Proactive behavioral signal ──────────────────────────────
    if (allowMemory && memories.length > 0) {
      const isFirstUserMessage = history.filter((m) => m.role === "user").length === 0;
      if (isFirstUserMessage) {
        const highConfMemories = memories.filter((m) => (m as any).confidence >= 3);
        if (highConfMemories.length > 0) {
          const OPENER_PRIORITY = ["pain_pattern", "sport_context", "exercise_preference", "adherence_pattern", "volume_response", "training_preference"];
          const topMemory = [...highConfMemories].sort((a, b) => {
            const pa = OPENER_PRIORITY.indexOf((a as any).type), pb = OPENER_PRIORITY.indexOf((b as any).type);
            if (pa !== pb) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            return (b as any).confidence - (a as any).confidence;
          })[0] as any;
          memoryCtx += `\n\n## RETURNING ATHLETE — PROACTIVE OPENER\nThis is the first message of a new conversation. Before answering, open with one brief, coach-like sentence referencing what you already know about this athlete. Make it feel natural — like a real coach who remembers their client. DO NOT say "Based on my memory" or "I know that you". Examples: "Good to be back — how's that shoulder holding up?" or "We've been building more athletically lately — continuing that direction?" Memory to reference: [${topMemory.type}] "${topMemory.detail}"`;
        }
        const behavioralSignals = memories.filter((m) =>
          (["adherence_pattern", "volume_response", "recovery_pattern"].includes((m as any).type)) &&
          (m as any).sentiment === "negative" && (m as any).confidence >= 3
        );
        if (behavioralSignals.length > 0) {
          const signal = behavioralSignals[0] as any;
          memoryCtx += `\n\n## PROACTIVE BEHAVIORAL SIGNAL\nPattern observed: ${signal.detail}. If clearly relevant to what the user is asking today, briefly and naturally surface it before answering. Keep it coaching-toned and concise. Example: "I've noticed [pattern] — want me to factor that in?" Only include if genuinely relevant. Do NOT force it into every response.`;
        }
      }
    }
  } else {
    // For non-Pro users: lightweight constraint memory load for hard constraint enforcement
    const constraintMemories = await listMemories(userId).catch(() => []);
    hardConstraintsNonSSE = loadHardConstraints(constraintMemories);
    constraintDirectiveNonSSE = buildConstraintEnforcementDirective(hardConstraintsNonSSE);
    // Inject recent session logs for all users — grounding the coach in real feedback
    const sessionLogCtxFree = await buildSessionLogContext(userId).catch(() => "");
    if (sessionLogCtxFree) memoryCtx += `\n\n${sessionLogCtxFree}`;
  }

  // ── Priority 3: Mutation trust language directive ─────────────────────────
  // Prevent the AI from confirming mutations as complete before verification.
  // This fires on every turn — only affects language when mutations are being applied.
  memoryCtx += `\n\n## MUTATION RESPONSE LANGUAGE\nWhen applying program changes: never use past-tense confirmation ("Done", "I've updated", "Your program has been changed"). Use present-tense or forward-looking language: "Applying that now — see the changes in your program panel" or "On it — the panel will show the update." The verification indicator in the UI confirms success.`;

  // ── P1: STRUCTURAL APPROVAL GATE — REBUILD_PROGRAM (non-SSE) ─────────────────
  // When requireApprovalStructural=true, prevent the program architect from
  // auto-generating a structured program. The AI must describe and ask first.
  if (agentSettings.behavior.requireApprovalStructural && execPlan.action === "REBUILD_PROGRAM") {
    memoryCtx += `\n\n## STRUCTURAL REBUILD — APPROVAL REQUIRED [user preference: on]\nCRITICAL: The user has enabled "Require Approval for Structural Changes."\nYou MUST follow this protocol:\n1. Do NOT generate or output a structured training program in this response.\n2. In 2-3 sentences, briefly describe what you would build (focus, structure, key emphasis).\n3. End with exactly: "Want me to build this out for you?" — wait for confirmation.\nOnly build the full program after the user explicitly says yes.`;
    logger.info({ userId }, "[AgentSettings] requireApprovalStructural — REBUILD_PROGRAM intercepted; injecting approval gate directive");
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
  const nonStreamFocusMode = resolveFocusMode(nonStreamUiCtx?.focusMode ?? null);

  // Load both conversation history program AND DB system in parallel.
  // This is critical for cross-conversation continuity: if the user opens a new
  // chat while having an existing program in the DB, the intent classifier must
  // know a program exists so it routes edit requests correctly.
  // Exception: when isFreshBuildSession = true, we treat the DB system as
  // non-existent for intent purposes so the agent is not biased toward editing
  // the old program.
  const [latestStructuredProgram, activeSystem] = await Promise.all([
    Promise.resolve(resolveCurrentProgram(history)),
    // Pass focusMode so we resolve the correct focus's training system.
    // Only filter by focus when the UI explicitly sends a focusMode; otherwise
    // fall back to the unscoped query (handles old clients and edge cases).
    getActiveTrainingSystem(userId, nonStreamUiCtx?.focusMode ? nonStreamFocusMode : undefined).catch(() => null),
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
  let activePendingClarification = await getActivePendingClarification(params.data.id).catch(() => null);

  // ── Stale pending check (non-SSE path) ─────────────────────────────────────
  if (
    activePendingClarification &&
    (activeSystem as any)?.id != null &&
    activePendingClarification.targetProgramId != null &&
    activePendingClarification.targetProgramId !== (activeSystem as any)?.id
  ) {
    resolvePendingClarification(activePendingClarification.id, "expired").catch(() => {});
    logger.warn(
      { pendingId: activePendingClarification.id, pendingTargetId: activePendingClarification.targetProgramId, activeSystemId: (activeSystem as any)?.id },
      "[AntiLoop] Stale pending cleared — system mismatch (non-SSE)"
    );
    activePendingClarification = null;
  }

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
    } else if (looksLikeClarificationAnswer(parsed.data.content)) {
      // Any message (not just GENERAL_COACHING_QUESTION) that looks like an answer
      // to a clarification question should resume the pending mutation.
      // Widened from "GENERAL_COACHING_QUESTION only" to cover EDIT_PROGRAM etc.
      // because responses like "the full program" can be misclassified.
      const _priorIntentType = intentResult.type;
      intentResult = { type: "CLARIFICATION_FOLLOWUP", confidence: "high" };
      logger.info(
        {
          pendingId: activePendingClarification.id,
          originalMessage: activePendingClarification.originalRequest.slice(0, 80),
          followupMessage: parsed.data.content.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          priorIntentType: _priorIntentType,
          trainingSystemId: activePendingClarification.targetProgramId ?? null,
        },
        "[ClarificationFollowup] pending context found — overriding intent to CLARIFICATION_FOLLOWUP"
      );
    }
  }

  logIntentSummary(parsed.data.content, intentResult, hasAnyProgram);

  // ── Clarification State Dev Log (non-SSE path) ────────────────────────────
  console.log("[Clarification State]", {
    pendingIntentFamily: activePendingClarification?.intentFamily ?? null,
    pendingAction: activePendingClarification ? "pending" : "none",
    pendingScope: activePendingClarification?.pendingAspect ?? null,
    pendingClarificationQuestion: activePendingClarification?.clarificationQuestion?.slice(0, 80) ?? null,
    pendingClarificationFields: activePendingClarification
      ? {
          originalRequest: activePendingClarification.originalRequest?.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          turnsRemaining: activePendingClarification.turnsRemaining,
        }
      : null,
    pendingTrainingSystemId: activePendingClarification?.targetProgramId ?? null,
    pendingConversationId: activePendingClarification?.conversationId ?? null,
    currentMessage: parsed.data.content.slice(0, 80),
    clarificationResolutionAttempted: intentResult.type === "CLARIFICATION_FOLLOWUP",
    clarificationResolved: false, // updated after execPlan resolves
  });

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

  // ── ACTION CONTRACT — Central binding contract for this turn ─────────────────
  // Built before the execution planner so it governs the entire turn.
  // The contract determines what the agent is allowed/forbidden to do and what
  // response type it must produce. The enforcer checks compliance after the turn.
  let actionContract: ActionContract | null = null;
  let contractDirective = "";
  try {
    actionContract = buildActionContract(
      parsed.data.content,
      hasAnyProgram,
      intentResult.type,
    );
    contractDirective = buildContractPromptDirective(actionContract);
  } catch (contractErr) {
    logger.warn({ contractErr }, "[ActionContract] Failed to build contract — proceeding without enforcement");
  }

  // Mutable turn outcome — updated as the handler progresses
  const turnOutcome: TurnOutcome = {
    mutationApplied: false,
    constraintPersisted: false,
    clarificationAsked: false,
    programRebuilt: false,
    verificationStatus: "not_applicable",
  };

  // ── EXECUTION PLANNER — Central single-brain routing decision ─────────────
  // Converts message + program state + pending clarification into one plan.
  // All downstream routing is driven by plan.action.
  // ── Loop detection state ──────────────────────────────────────────────────
  // pendingClarificationCount: how many clarification rounds have already been
  // taken for the active pending clarification (0 = first answer, 2 = force action).
  // Derived from turnsRemaining (starts at 2, decremented on each followup turn).
  const pendingClarificationCount = activePendingClarification
    ? Math.max(0, 2 - activePendingClarification.turnsRemaining)
    : 0;
  const lastClarificationQuestion = activePendingClarification?.clarificationQuestion ?? undefined;

  const _rawExecPlan: ExecutionPlan = await buildExecutionPlan({
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
    focusMode: nonStreamFocusMode,
    hardConstraints: hardConstraintsNonSSE,
    pendingClarificationCount,
    lastClarificationQuestion,
  });

  // ── Anti-Loop Reliability Layer (non-SSE) ──────────────────────────────────
  const _antiLoopResult = applyAntiLoopReliabilityLayer(_rawExecPlan, {
    message: parsed.data.content,
    program: latestStructuredProgram,
    activeSystemId: (activeSystem as any)?.id ?? null,
    conversationId: params.data.id as number,
    pendingClarificationId: activePendingClarification?.id ?? null,
    pendingClarificationTargetProgramId: activePendingClarification?.targetProgramId ?? null,
    pendingClarificationCount,
  });
  if (_antiLoopResult.shouldClearPending && activePendingClarification) {
    resolvePendingClarification(activePendingClarification.id, "expired").catch(() => {});
    activePendingClarification = null;
  }

  // ── Action Guarantee Layer (non-SSE) ──────────────────────────────────────
  const _guaranteeResult = applyActionGuaranteeLayer(_antiLoopResult.plan, {
    message: parsed.data.content,
    activeProgramId: (activeSystem as any)?.id ?? null,
    program: latestStructuredProgram,
    conversationId: params.data.id as number,
    pendingClarificationCount,
  });
  const execPlan = _guaranteeResult.plan;

  // Sync clarification outcome to turnOutcome
  if (execPlan.action === "ASK_CLARIFICATION") {
    turnOutcome.clarificationAsked = true;
  }

  // Persist constraint signals from this turn (fire-and-forget — non-fatal)
  if (execPlan.intentFamily) {
    persistConstraintsFromTurn(userId, parsed.data.content, execPlan.intentFamily).catch((err: unknown) => {
      logger.warn({ err }, "[ConstraintMemory] persistConstraintsFromTurn failed — non-fatal");
    });
  }

  // ── Agent Orchestrator — structured chain-of-command decision log ────────
  // Phase 1: mutationType is derived from the execution plan's mutation type.
  // "structural" (add/swap/remove) → BUILD_WITH_ARCHITECT validation gate
  // "minor" (sets/reps/rest/tempo) → DIRECT_EDIT fast path
  const execMutationType = execPlan.mutation?.type;
  const orchMutationType: "structural" | "minor" | undefined =
    execMutationType === "add" || execMutationType === "remove" || execMutationType === "swap"
      ? "structural"
      : execMutationType === "progression" || execMutationType === "regression"
        ? "minor"
        : undefined;

  const orchDecision = orchestrate({
    message: parsed.data.content,
    userId,
    conversationId: String(params.data.id),
    intentType: intentResult.type,
    execPlanAction: (execPlan.action === "ACTION_CHOICE_CARD" || execPlan.action === "SAFETY_REFUSAL" ? "GUIDANCE" : execPlan.action) as "APPLY_MUTATION" | "ASK_CLARIFICATION" | "GUIDANCE" | "REBUILD_PROGRAM" | "NO_OP",
    focusMode: nonStreamFocusMode,
    hasActiveProgram: hasAnyProgram,
    isAdminRequest: false,
    isFreshBuildSession,
    mutationType: orchMutationType,
  });
  logOrchestratorDecision(orchDecision.observabilityEvent);

  logger.info(
    {
      action: execPlan.action,
      intentFamily: execPlan.intentFamily,
      scope: execPlan.scope,
      mutation: execPlan.mutation?.type ?? null,
      intentType: intentResult.type,
      orchRoute: orchDecision.route,
      orchAgents: orchDecision.participatingAgents,
    },
    "[Routing Authority] execPlan.action selected"
  );

  // ── Phase B: Constraint Extraction ────────────────────────────────────────
  // For new program builds, extract hard constraints from the user's message.
  // These override profile defaults per priority: explicit input > profile > defaults.
  let extractedConstraints: ExtractedConstraints | null = null;
  if (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM") {
    extractedConstraints = extractConstraints(parsed.data.content);

    // ── Sport inheritance: if the user didn't mention a sport in this message,
    // carry forward the sport from the currently active program or system.
    // Scenario: "give me a 3-day strength program" after a football speed session
    // should produce a Football Strength program, not a generic one.
    if (extractedConstraints.sportFocus === null) {
      const contextText = [
        (activeSystem as any)?.name ?? "",
        (activeSystem as any)?.overarchingGoal ?? "",
        latestStructuredProgram?.programName ?? "",
        latestStructuredProgram?.description ?? "",
      ].filter(Boolean).join(" ").toLowerCase();
      if (contextText.trim()) {
        const inheritedSport = detectSport(contextText);
        if (inheritedSport) {
          extractedConstraints = { ...extractedConstraints, sportFocus: inheritedSport };
          logger.info(
            { inheritedSport, source: activeSystem ? "activeSystem" : "latestProgram" },
            "[ConstraintExtraction] Inherited sportFocus from active program context"
          );
        }
      }
    }

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

  const failSafeResolution = resolveFailSafeState({
    message: parsed.data.content,
    focusMode: nonStreamFocusMode,
    activeProgram: (activeSystem as any) ?? (latestStructuredProgram as any),
    recentCommands: history
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    requestedFrequency: extractedConstraints?.daysPerWeek ?? null,
    requestedDuration: extractedConstraints?.sessionDuration ?? null,
    action: execPlan.action,
    intentType: intentResult.type,
  });
  extractedConstraints = applyFailSafeConstraints(extractedConstraints, failSafeResolution);
  logFailSafeAudit(logger, { message: parsed.data.content, focusMode: nonStreamFocusMode, activeProgram: (activeSystem as any) ?? (latestStructuredProgram as any), action: execPlan.action, intentType: intentResult.type }, failSafeResolution);

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
  // ExecutionPlan is the single routing authority. classifyIntent is advisory only.
  // intentResult.type is available for logging and analytics throughout this handler,
  // but routing decisions and mutation eligibility are controlled by execPlan.action.
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

  // ── P1: DELOAD APPROVAL GATE (non-SSE) ──────────────────────────────────────
  // When requireApprovalDeload=true, deload/recovery-focus intents must route
  // to the AI describe+confirm path instead of being auto-applied.
  if (
    agentSettings.behavior.requireApprovalDeload &&
    execPlan.intentFamily != null &&
    (["fatigue_management", "recovery_focus"] as string[]).includes(execPlan.intentFamily as string)
  ) {
    logger.info(
      { userId, intentFamily: execPlan.intentFamily },
      "[AgentSettings] requireApprovalDeload — deload intent requires user confirmation, routing to AI confirm path"
    );
    break; // fall through to AI describe+confirm path
  }

  // ── P1: STRUCTURAL MUTATION APPROVAL GATE (non-SSE) ─────────────────────────
  // When requireApprovalStructural=true, structural exercise mutations (add/remove/swap)
  // must route to the AI describe+confirm path before the edit engine runs.
  if (
    agentSettings.behavior.requireApprovalStructural &&
    orchMutationType === "structural"
  ) {
    logger.info(
      { userId, orchMutationType, mutationType: execPlan.mutation?.type },
      "[AgentSettings] requireApprovalStructural — structural mutation requires user confirmation, routing to AI confirm path"
    );
    break; // fall through to AI describe+confirm path
  }

  // ── CLARIFICATION_FOLLOWUP — resume a pending mutation with the user's answer ──
  // This runs BEFORE the normal vibe edit path. When active, it reconstructs
  // the original request + user answer and re-runs the edit pipeline on the
  // pending intent family.
  if (intentResult.type === "CLARIFICATION_FOLLOWUP" && activePendingClarification) {
    const pending = activePendingClarification;

    // Decrement turnsRemaining so loop detection sees progress on the next turn.
    // Fire-and-forget — the pending record may be resolved before next read.
    decrementTurnsRemaining(pending.id).catch(() => {});

    // Derive resolved scope label for logging
    const _followupLower = parsed.data.content.toLowerCase().trim();
    const _resolvedScope =
      /\b(full program|whole program|entire program|all sessions?|all days?|everything|program.?wide|across)\b/i.test(_followupLower)
        ? "full_program"
        : /\bweek\s*\d+\b/i.test(_followupLower)
        ? "week"
        : /\bday\s*\d+\b/i.test(_followupLower)
        ? "day"
        : "unknown";

    logger.info(
      {
        pendingId: pending.id,
        originalMessage: pending.originalRequest.slice(0, 80),
        followupMessage: parsed.data.content.slice(0, 80),
        resolvedScope: _resolvedScope,
        resolvedIntent: pending.intentFamily,
        intentFamily: pending.intentFamily,
        pendingAspect: pending.pendingAspect,
        trainingSystemId: pending.targetProgramId ?? null,
      },
      "[ClarificationFollowup] pending context found — executing original intent"
    );

    const reconstructedRequest = buildReconstructedRequest(
      pending.originalRequest,
      parsed.data.content,
      pending.pendingAspect
    );

    logger.info(
      {
        reconstructedRequest: reconstructedRequest.slice(0, 200),
        resolvedScope: _resolvedScope,
        resolvedIntent: pending.intentFamily,
        trainingSystemId: pending.targetProgramId ?? null,
      },
      "[ClarificationFollowup] resolved scope — reconstructed request built"
    );

    // Resolve the active system for editing
    let clarificationSystem = activeSystem;
    if (!clarificationSystem && latestStructuredProgram) {
      try {
        clarificationSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram, null, nonStreamFocusMode);
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
          {
            applied: clarificationEditResult.appliedCount,
            skipped: clarificationEditResult.skippedCount,
            resolvedScope: _resolvedScope,
            resolvedIntent: pending.intentFamily,
            trainingSystemId: pending.targetProgramId ?? null,
          },
          "[ClarificationFollowup] mutation applied"
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
            source: "clarification_followup",
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
          const _clarificationFocusMode = ((clarificationSystem?.metadata as any)?.focusMode ?? "strength") as FocusMode;
          const systemEditData = {
            _type: "system_edit" as const,
            changeSummary: clarificationEditResult.changeSummary,
            changedIds: clarificationEditResult.changedIds,
            systemId: clarificationSystem.id,
            changeLogId,
            verificationStatus: verification.status,
            coachReasoning: generateCoachReasoning({
              focusMode: _clarificationFocusMode,
              actionType: "edit",
              intent: clarificationEditResult.changeSummary,
            }),
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
        const noOpFollowupContent = `I can try a different approach — could you tell me which day or exercise you'd like this applied to? For example: "Day 1, the squats" or "all exercises on Day 2". That gives me enough to act directly.`;
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
      logger.error(
        {
          err: err?.message,
          stack: err?.stack,
          originalMessage: pending.originalRequest.slice(0, 80),
          followupMessage: parsed.data.content.slice(0, 80),
          resolvedScope: _resolvedScope,
          resolvedIntent: pending.intentFamily,
          trainingSystemId: pending.targetProgramId ?? null,
        },
        "[ClarificationFollowup] mutation failed — pipeline threw, program left unchanged"
      );
      logger.warn("[Mutation Failure] program left unchanged — CLARIFICATION_FOLLOWUP pipeline error, no AI fallback");
      await resolvePendingClarification(pending.id, "pipeline_error").catch(() => {});
      // Scope-aware error message: mention "full program" if that was the resolved scope
      const _isScopeFullProgram = _resolvedScope === "full_program";
      const pipelineErrContent = _isScopeFullProgram
        ? `I understood you want the full program adjusted, but I couldn't safely apply the edit. Your program was left unchanged. Try rephrasing — for example: "Make every session harder" or "Increase difficulty across all days".`
        : `I couldn't apply that edit, so I left your program unchanged. Try rephrasing or being more specific about which exercise or day you'd like changed.`;
      const [pipelineErrMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: pipelineErrContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: pipelineErrMsg.id, conversationId: pipelineErrMsg.conversationId, role: pipelineErrMsg.role, content: pipelineErrMsg.content, createdAt: pipelineErrMsg.createdAt.toISOString(), structuredData: null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: "CLARIFICATION_FOLLOWUP", confidence: "high" },
        systemEdit: { applied: false, route: "clarification_followup", scope: "system", changedIds: [], error: "pipeline_error" },
        structuredData: null,
      });
      return;
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

    // Write pending clarification state so the next reply can resume the correct intent.
    // Always write here — we are inside case "ASK_CLARIFICATION" so the plan is always a question.
    // FIX 1 (non-SSE): When execPlan.intentFamily is "clarification_required" (the fallback value),
    // re-run normalizeToIntentFamily to recover the actual intent. Using the fallback value would
    // store "clarification_required" in the DB, breaking resolveClarification on the next turn.
    {
      const _rawFamily = execPlan.intentFamily as string | null;
      const familyForPending =
        (_rawFamily && _rawFamily !== "clarification_required")
          ? _rawFamily
          : (() => {
              const recovered = normalizeToIntentFamily(parsed.data.content, nonStreamFocusMode);
              return recovered.family !== "clarification_required" ? recovered.family : "clarification_required";
            })();

      writePendingClarification({
        conversationId: params.data.id,
        userId,
        targetProgramId: activeSystem?.id ?? null,
        originalRequest: parsed.data.content,
        intentFamily: familyForPending,
        pendingAspect: (execPlan.clarification?.pendingAspect as "scope" | "target_day" | "target_session" | "target_exercise" | "phase_or_block" | "confirmation") ?? "scope",
        clarificationQuestion: clarifyingQuestion,
        editSubtype: intentResult.editSubtype ?? null,
        editIntent: execPlan.intentFamily ?? null,
      }).then(() => {
        logger.info(
          {
            conversationId: params.data.id,
            originalRequest: parsed.data.content.slice(0, 80),
            intentFamily: familyForPending,
            pendingAspect: execPlan.clarification?.pendingAspect ?? "scope",
            clarificationQuestion: clarifyingQuestion.slice(0, 100),
          },
          "[ClarificationFollowup] Pending clarification record written — next reply will resume this intent"
        );
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

    // ── ACTION_CHOICE_CARD ────────────────────────────────────────────────────
    // Ambiguous destructive target (e.g. "replace that" with no named exercise).
    // Return a structured choice card instead of a free-text clarification question.
    case "ACTION_CHOICE_CARD": {
      const choiceCard = execPlan.choiceCard;
      if (choiceCard) {
        const choiceLines = choiceCard.choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
        const choiceContent = `${choiceCard.prompt}\n\n${choiceLines}`;
        const [assistantMessage] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: choiceContent,
          structuredData: JSON.stringify({ _type: "action_choice_card", ...choiceCard }),
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
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
          actionDebug: { planAction: execPlan.action, source: "action_guarantee_layer" },
        });
        return;
      }
      break;
    } // end case "ACTION_CHOICE_CARD"

    // ── SAFETY_REFUSAL ────────────────────────────────────────────────────────
    // Request would cause physical harm — return a safe redirect message.
    case "SAFETY_REFUSAL": {
      const refusalMessage = execPlan.safetyRefusal?.message ??
        "I can't design sessions intended to cause pain or injury. Let me know if you want to increase intensity safely.";
      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: refusalMessage,
        structuredData: JSON.stringify({ _type: "safety_refusal" }),
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
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
        actionDebug: { planAction: execPlan.action, source: "action_guarantee_layer" },
      });
      return;
    } // end case "SAFETY_REFUSAL"

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
        const result = await upsertTrainingSystemFromProgram(userId, programToSave, undefined, params.data.id);
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
        resolvedSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram, null, nonStreamFocusMode);
        systemAutoCreatedForEdit = true;
        logger.info({ userId, systemId: resolvedSystem.id }, "[VibeEdit] Auto-created system from chat program before edit");
        logger.info({ userId, systemId: resolvedSystem.id }, "[Auto Create For Edit] system created and client hydration fields returned");
        // Create initialization change log entry before the edit change log
        const _initSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
        createChangeLogEntry({
          userId,
          trainingSystemId: resolvedSystem.id,
          source: "initialize",
          scope: "system",
          intent: "auto_created_for_edit",
          changeSummary: `Program initialized from conversation history: ${latestStructuredProgram.programName ?? "Unnamed Program"}`,
          requestText: parsed.data.content.slice(0, 300),
          beforeSnapshot: _initSnapshot,
          afterSnapshot: _initSnapshot,
          fullProgramSnapshot: latestStructuredProgram as unknown as Record<string, unknown>,
          appliedCount: 1,
          skippedCount: 0,
          versionOverrides: { isMajorVersion: true, versionLabel: "Initial Build" },
          decisionMetadata: { intentType: intentResult.type, autoCreatedForEdit: true },
        }).catch((initLogErr) => logger.warn({ initLogErr }, "[Auto Create For Edit] Initialization change log write failed — non-fatal"));
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

    // Declared outside the try block so the catch can inspect whether the DB
    // write succeeded even when subsequent response-generation steps throw.
    let changeLogId: number | null = null;

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
      const _directBtnScope = nonStreamUiCtx?.buttonPayload?.scope as string | undefined;
      const directScopeResolution: ScopeResolution = (_directBtnScope === "architecture" || _directBtnScope === "block")
        ? (() => {
            logger.info(
              { message: parsed.data.content.slice(0, 80), btnScope: _directBtnScope },
              "[GlobalChipRouting] buttonPayload.scope=architecture — overriding to block_scope"
            );
            return {
              scope: "block_scope" as const,
              confidence: "high" as const,
              derivedTransformation: inferBlockTypeFromMessage(parsed.data.content) ?? undefined,
              reasoning: "buttonPayload.scope=block override from client chip",
            };
          })()
        : resolveRefinementScope(parsed.data.content);
      logger.info(
        {
          label: parsed.data.content.slice(0, 80),
          source: nonStreamUiCtx?.buttonPayload?.source ?? null,
          actionType: nonStreamUiCtx?.buttonPayload?.actionType ?? null,
          scope: _directBtnScope ?? null,
          actualRoute: directScopeResolution.scope,
          btnScopeOverride: _directBtnScope === "architecture" || _directBtnScope === "block",
        },
        "[ActionRoutingAudit]"
      );
      if (directScopeResolution.scope !== "session_scope") {
        const _directBlockType = directScopeResolution.derivedTransformation ?? null;
        logger.info(
          { scope: directScopeResolution.scope, systemId: resolvedSystem.id, blockType: _directBlockType, btnScope: _directBtnScope ?? null },
          "[ArchitectureChipFlow] Routing to hierarchical engine (non-stream)"
        );
        const hierarchicalResult = await applyHierarchicalRefinement({
          systemId: resolvedSystem.id,
          userId,
          userMessage: parsed.data.content,
          scopeResolution: directScopeResolution,
        });

        let hierarchicalContent: string;
        if (hierarchicalResult.applied) {
          const allWeeks = directFullSystem?.phases.flatMap((p) => p.weeks) ?? [];
          const currentWeekNumber = allWeeks.slice(-1)[0]?.weekNumber ?? 1;
          const hierarchicalImpact = await processHierarchicalImpact({
            userMessage: parsed.data.content,
            scopeResolution: directScopeResolution,
            changeSummary: hierarchicalResult.changeSummary,
            sessionCount: hierarchicalResult.sessionCount,
            exerciseCount: hierarchicalResult.exerciseCount,
            fullSystem: directFullSystem ?? { phases: [] },
            currentWeekNumber,
          });
          hierarchicalContent = hierarchicalImpact.coachResponse;
        } else {
          const _hfr = (hierarchicalResult as any).failureReason;
          if (_hfr === "system_not_found") {
            hierarchicalContent = "I need a structured training program to apply that change. Build a program first and I'll handle any adjustments you need.";
          } else {
            hierarchicalContent = `I wasn't able to shift the block right now — ${hierarchicalResult.changeSummary} Try a more specific request like "shift to strength" or "make this more explosive."`;
          }
        }

        const _hierarchicalCoachReasoning = hierarchicalResult.applied ? generateCoachReasoning({
          focusMode: nonStreamFocusMode as FocusMode,
          actionType: "edit",
          intent: hierarchicalResult.changeSummary,
        }) : null;
        const [hierarchicalMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: hierarchicalContent,
          structuredData: hierarchicalResult.applied
            ? JSON.stringify({ _type: "system_edit", changeSummary: hierarchicalResult.changeSummary, systemId: resolvedSystem.id, coachReasoning: _hierarchicalCoachReasoning })
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

      // ── 2. Bulk session sets executor (deterministic — no AI call) ─────────
      // Fast path for "add/remove N sets to/from each exercise for Day X".
      // Bypasses interpretEditRequest and the structural validator entirely.
      if (execPlan.intentFamily === "bulk_session_sets_increase") {
        const bulkSessionIndex = execPlan.scope.dayIndex ?? 0;
        const bulkEditPlan = buildBulkSessionSetsEditPlan(
          directFullSystem,
          bulkSessionIndex,
          parsed.data.content,
        );

        logger.info(
          { changes: bulkEditPlan.changes.length, sessionIndex: bulkSessionIndex, systemId: resolvedSystem.id },
          "[BulkSetsExecutor] Deterministic bulk plan built — bypassing AI interpretation"
        );

        const bulkEditResult = await applyEditPlan(bulkEditPlan, "bulk_session_sets_increase");

        if (bulkEditResult.appliedCount === 0) {
          const noChangesContent = bulkEditPlan.changes.length === 0
            ? `I couldn't find that session in your program. Try something like "Day 1" or "Day 2" to target a specific training day.`
            : `I wasn't able to apply the set changes — each exercise may already be at the maximum or minimum set count.`;

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
            intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: "bulk_session" },
            systemEdit: { applied: false },
            editFailure: { reason: "no_changes_produced" },
          });
          return;
        }

        const bulkIsDecrease = /\b(remove|take off|cut|subtract|drop|reduce|decrease)\b/i.test(parsed.data.content);
        const bulkDeltaMatch = parsed.data.content.match(/(\d+)\s+(?:more\s+)?sets?/i);
        const bulkDelta = bulkDeltaMatch ? bulkDeltaMatch[1] : "1";
        const bulkVerb = bulkIsDecrease ? "Removed" : "Added";
        const bulkSetWord = bulkDelta !== "1" ? "sets" : "set";
        const bulkCoachingContent = `Done. ${bulkVerb} ${bulkDelta} ${bulkSetWord} to each exercise — ${bulkEditResult.changeSummary}.`;

        const bulkChangeLogId = await createChangeLogEntry({
          userId,
          trainingSystemId: resolvedSystem.id,
          source: "ai_edit",
          intent: "bulk_session_sets_adjustment",
          scope: "session",
          changeSummary: bulkEditResult.changeSummary,
          requestText: parsed.data.content.slice(0, 300),
          beforeSnapshot: bulkEditResult.beforeSnapshot,
          afterSnapshot: bulkEditResult.afterSnapshot,
          appliedCount: bulkEditResult.appliedCount,
          skippedCount: bulkEditResult.skippedCount,
          decisionMetadata: {
            intentType: intentResult.type,
            intentFamily: "bulk_session_sets_increase",
            deterministic: true,
          },
        }).catch(() => undefined);

        const bulkSystemEditData = {
          _type: "system_edit" as const,
          changeSummary: bulkEditResult.changeSummary,
          changedIds: bulkEditResult.changedIds,
          systemId: resolvedSystem.id,
          changeLogId: bulkChangeLogId,
        };

        const [bulkMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: bulkCoachingContent,
          structuredData: JSON.stringify(bulkSystemEditData),
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: bulkMsg.id, conversationId: bulkMsg.conversationId, role: bulkMsg.role, content: bulkMsg.content, createdAt: bulkMsg.createdAt.toISOString(), structuredData: bulkMsg.structuredData ?? null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: "bulk_session" },
          systemEdit: { applied: true, changeSummary: bulkEditResult.changeSummary, systemId: resolvedSystem.id, changeLogId: bulkChangeLogId },
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

      // Stamp bannedItems onto system so autoSelectOpenEndedSwap and harder/easier
      // fallback can read user-excluded exercises without a signature change.
      if (hardConstraintsNonSSE.bannedItems.length > 0) {
        (directFullSystem as any).bannedItems = hardConstraintsNonSSE.bannedItems;
      }

      // ── [MutationTrace] STEP 1+6 — direct vibe edit entry (non-SSE) ─────────
      logger.info(
        {
          path:                "non-SSE:direct_vibe_edit",
          originalUserMessage: parsed.data.content.slice(0, 200),
          intentFamily:        execPlan.intentFamily ?? null,
          mutationType:        execPlan.mutation?.type ?? null,
          targetScope: {
            type:         execPlan.scope.type,
            dayIndex:     execPlan.scope.dayIndex ?? null,
            exerciseName: execPlan.scope.exerciseName ?? null,
          },
          resolvedTarget: directTarget
            ? {
                resolvedSessionId:   (directTarget as any).sessionId ?? null,
                resolvedSessionName: (directTarget as any).sessionLabel ?? null,
                exerciseCountFound:  (directTarget as any).exerciseCount ?? null,
              }
            : null,
          systemId: resolvedSystem.id,
          systemAutoCreated: systemAutoCreatedForEdit,
        },
        "[MutationTrace] ENTRY — direct vibe edit (non-SSE)",
      );

      const directEditPlan = await interpretEditRequest(
        parsed.data.content,
        directFullSystem,
        directTarget,
        adaptationCtx || undefined,
        directDecisionMemory?.decisionMemoryContext || undefined
      );

      logger.info(
        {
          intent:   directEditPlan.intent,
          scope:    directEditPlan.scope,
          changes:  directEditPlan.changes.length,
          systemId: resolvedSystem.id,
          changeDetail: directEditPlan.changes.map((c) => ({
            type:         c.type,
            id:           c.id ?? null,
            sessionId:    c.sessionId ?? null,
            exerciseName: c.exercise?.name ?? c.replacement?.name ?? null,
            updatesKeys:  c.updates ? Object.keys(c.updates) : null,
          })),
        },
        "[MutationTrace] STEP2 — interpretEditRequest complete (non-SSE)",
      );

      logger.info(
        { intent: directEditPlan.intent, scope: directEditPlan.scope, changes: directEditPlan.changes.length, systemId: resolvedSystem.id },
        "[VibeEdit] DB pipeline — edit plan generated"
      );

      // ── Phase 1 + 3: Architect validation gate ─────────────────────────────
      // All structural edits (add/remove/replace exercise) are validated by the
      // Performance Architect layer before the edit engine executes them.
      // Minor attribute edits (sets/reps) bypass this gate (fast DIRECT_EDIT path).
      //
      // If the generated plan has structural changes, we:
      //   1. Build a session context lookup from the full training system
      //   2. Validate sessionId exists, insertionPoint is valid, exercise.name populated
      //   3. Auto-fill vague exercise names (Phase 6)
      //   4. If validation fails → return clarification instead of executing
      if (orchDecision.route === "BUILD_WITH_ARCHITECT" || hasStructuralChanges(directEditPlan)) {
        // Build session lookup map for validation + auto-fill context
        const sessionLookup = new Map<number, SessionContext>();
        const systemFocusMode = ((directFullSystem as any)?.metadata as any)?.focusMode ?? nonStreamFocusMode;
        for (const phase of (directFullSystem as any)?.phases ?? []) {
          for (const week of phase.weeks ?? []) {
            for (const session of week.sessions ?? []) {
              if (session.id) {
                sessionLookup.set(session.id, {
                  label:       session.label ?? undefined,
                  sessionType: session.sessionType ?? undefined,
                  focusMode:   systemFocusMode,
                });
              }
            }
          }
        }

        const patchValidation = validateStructuralChanges(directEditPlan, sessionLookup);

        if (!patchValidation.valid) {
          if ("clarification" in patchValidation) {
            const { question } = patchValidation.clarification;
            logger.info(
              {
                missingField: patchValidation.clarification.missingField,
                question,
                systemId: resolvedSystem.id,
              },
              "[ArchitectPatchValidator] Validation failed — returning clarification instead of executing",
            );
            const receipt = buildMutationFailureReceipt(
              `Missing required field: ${patchValidation.clarification.missingField}`,
            );
            const [clarMsg] = await db.insert(messagesTable).values({
              conversationId: params.data.id,
              role: "assistant",
              content: question,
              structuredData: null,
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
              mutationReceipt: receipt,
            });
            return;
          }
          // Unexpected validation error — log and fall through to the edit engine
          logger.warn(
            { validationError: (patchValidation as any).error, systemId: resolvedSystem.id },
            "[ArchitectPatchValidator] Non-clarification validation error — proceeding to edit engine",
          );
        } else {
          logger.info(
            { patchCount: patchValidation.patches.length, systemId: resolvedSystem.id },
            "[ArchitectPatchValidator] Structural changes validated — proceeding to execution",
          );
        }
      }

      // ── Execute edit plan ──────────────────────────────────────────────────
      // IMPORTANT: Do NOT retry applyEditPlan. If the first call writes to the DB
      // and then throws (e.g., during snapshot/verification), retrying would
      // double-add exercises or trigger the duplicate-safe resolver to block the
      // now-existing exercise, producing a false-negative appliedCount === 0.
      const directEditResult = await applyEditPlan(directEditPlan, execPlan.intentFamily ?? undefined);

      logger.info(
        { applied: directEditResult.appliedCount, skipped: directEditResult.skippedCount, systemId: resolvedSystem.id },
        "[VibeEdit] DB pipeline — edit plan applied"
      );

      // ── Build mutation receipt from DB results ────────────────────────────
      // The receipt encodes the ACTUAL DB outcome (including post-write
      // verification). It is the source-of-truth for whether the operation
      // succeeded — not the verification status from the snapshot comparison.
      const addedResult = directEditResult.changeTargets?.find((t) => t.type === "exercise_added");
      const mutationReceipt = directEditResult.appliedCount > 0
        ? buildMutationSuccessReceipt({
            action:        orchMutationType === "structural" ? (execPlan.mutation?.type === "remove" ? "delete_exercise" : execPlan.mutation?.type === "swap" ? "replace_exercise" : "add_exercise") : "update_exercise",
            sessionId:     directEditPlan.changes.find((c) => c.type === "add_exercise")?.sessionId ?? directEditPlan.changes[0]?.id ?? 0,
            exerciseName:  addedResult?.newExercise ?? directEditPlan.changes[0]?.exercise?.name ?? directEditPlan.changes[0]?.replacement?.name ?? "exercise",
            verified:      true,
          })
        : buildMutationFailureReceipt("appliedCount === 0 — no changes written to DB");

      logger.info(
        {
          operation:         orchMutationType ?? "unknown",
          sessionId:         mutationReceipt.success ? mutationReceipt.sessionId : null,
          exerciseName:      mutationReceipt.success ? mutationReceipt.exerciseName : null,
          appliedCount:      directEditResult.appliedCount,
          verified:          mutationReceipt.success ? mutationReceipt.verified : false,
          selectedReceiptType: mutationReceipt.success ? "success" : "failure",
        },
        "[Program Mutation Receipt Created]",
      );

      // ── 3. Handle zero changes ─────────────────────────────────────────────
      // IMPORTANT: Never show a failure message if the receipt says success OR
      // the verification confirms the change is in the DB.
      // appliedCount === 0 with no verified writes means nothing was mutated.
      if (directEditResult.appliedCount === 0) {
        const noChangesContent = buildAgenticNoChangesResponse(
          parsed.data.content,
          directEditPlan.intent,
          directEditPlan.scope,
          undefined,
          directTarget,
          execPlan.intentFamily,
        );

        logger.info(
          { operation: orchMutationType, appliedCount: 0, selectedMessageType: "failure", systemId: resolvedSystem.id },
          "[Program Mutation Response Selected]",
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
          mutationReceipt,
        });
        return;
      }

      // ── 4. Guard: never show a failure message after a verified write ──────
      // If the mutation receipt says success (appliedCount > 0), skip the
      // verification-failed path entirely — the DB has the change and the user
      // should see success copy. The verification status is observability-only
      // once we have a confirmed DB write.
      const directVerification = directEditResult.verification;
      const receiptVerified = mutationReceipt.success === true;

      if (!receiptVerified && directVerification.status === "failed") {
        logger.info(
          { verificationStatus: "failed", appliedCount: directEditResult.appliedCount, selectedMessageType: "failure", systemId: resolvedSystem.id },
          "[Program Mutation Response Selected]",
        );
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
          mutationReceipt,
        });
        return;
      }

      logger.info(
        { verificationStatus: directVerification.status, receiptVerified, appliedCount: directEditResult.appliedCount, selectedMessageType: "success", systemId: resolvedSystem.id },
        "[Program Mutation Response Selected]",
      );

      // ── 5. Log the change ──────────────────────────────────────────────────
      const whyChangedParts = directEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
      const whyChanged = whyChangedParts.length > 0 ? whyChangedParts.join("; ") : undefined;
      const isStructuralEdit = directEditPlan.scope === "system" || directEditPlan.scope === "block";

      // ── Swap contract — built before createChangeLogEntry so confirmed is persisted ──
      // The frontend badge reads decisionMetadata.confirmed === true (strict boolean).
      // Building here from the DB after-snapshot guarantees it reflects actual DB state.
      const _directSwapChangeTarget = directEditResult.changeTargets.find((t) => t.type === "exercise_swap");
      const _directSwapPlanChange = directEditPlan.changes.find((c) => c.type === "replace_exercise");
      let directSwapContract: {
        actionType: "replace_exercise";
        confirmed: boolean;
        originalExercise: string | null;
        replacementExercise: string | null;
        updatedExercise: Record<string, unknown> | null;
        changeEntry: Record<string, unknown> | null;
        invalidationKeys: string[];
      } | null = null;

      if (_directSwapChangeTarget && _directSwapPlanChange) {
        const _directUpdatedEx = (directEditResult.afterSnapshot?.exercises?.[String(_directSwapPlanChange.id)] as Record<string, unknown> | undefined) ?? null;
        const _directConfirmed = directEditResult.appliedCount > 0 && !!_directSwapChangeTarget.newExercise && !!_directUpdatedEx;
        directSwapContract = {
          actionType: "replace_exercise",
          confirmed: _directConfirmed,
          originalExercise: _directSwapChangeTarget.originalExercise ?? null,
          replacementExercise: _directSwapChangeTarget.newExercise ?? null,
          updatedExercise: _directUpdatedEx,
          changeEntry: null,
          invalidationKeys: ["training-system-week", "live-panel-week-ids", "week-view-select", "training-system-today", "training-system-active", "training-system-history"],
        };
        logger.info(
          { confirmed: _directConfirmed, originalExercise: directSwapContract.originalExercise, replacementExercise: directSwapContract.replacementExercise },
          "[VibeEdit] Swap contract built"
        );
      }

      // ── Post-mutation light architecture validation ─────────────────────────
      const _directArchResult = validatePostMutationArchitectureLight({
        entitySessions: directEditResult.afterSnapshot?.sessions as Record<string, Record<string, unknown>> | undefined,
        context: "non-SSE:direct_edit",
      });

      changeLogId = await createChangeLogEntry({
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
          confirmed: directSwapContract?.confirmed ?? false,
          propagated: (directEditResult.propagationSummary?.status ?? "local_only") !== "local_only",
          propagationStatus: directEditResult.propagationSummary?.status === "propagated" ? "full"
            : directEditResult.propagationSummary?.status === "partial" ? "partial"
            : "none",
          propagationCheckedCount: (directEditResult.propagationSummary?.appliedWeeks?.length ?? 0) + (directEditResult.propagationSummary?.skippedWeeks?.length ?? 0),
          propagationConfirmedCount: directEditResult.propagationSummary?.appliedWeeks?.length ?? 0,
          propagationFailedCount: directEditResult.propagationSummary?.skippedWeeks?.length ?? 0,
          architectureWarnings: _directArchResult.warnings.length > 0 ? _directArchResult.warnings : undefined,
          verification: {
            status: directVerification.status,
            verifiedCount: directVerification.verifiedChanges.length,
            missingCount: directVerification.missingChanges.length,
            requiresReview: directVerification.requiresReview ?? false,
          },
        },
      });

      // ── 6. Coaching response + persist message ─────────────────────────────
      const vibeBaseResponse = buildVibeEditCoachingResponse(directEditResult);
      const directAllWeeks = directFullSystem?.phases.flatMap((p) => p.weeks) ?? [];
      const directCurrentWeek = directAllWeeks.slice(-1)[0]?.weekNumber ?? 1;
      const directTargetNames = directEditResult.changeTargets
        .flatMap((t) => [t.originalExercise, t.newExercise])
        .filter((n): n is string => !!n);
      // Wrap processSessionScopeImpact so a coaching-response failure never
      // converts a successful DB write into a user-facing error.
      let coachingContentRaw: string;
      try {
        const directImpact = await processSessionScopeImpact({
          userMessage: parsed.data.content,
          scopeResolution: directScopeResolution,
          editPlan: directEditPlan,
          immediateChangeSummary: vibeBaseResponse,
          fullSystem: directFullSystem ?? { phases: [] },
          currentWeekNumber: directCurrentWeek,
          targetExerciseNames: directTargetNames,
        });
        coachingContentRaw = directImpact.coachResponse;
      } catch (impactErr: unknown) {
        logger.warn({ impactErr }, "[VibeEdit] processSessionScopeImpact failed — using fallback coaching response");
        coachingContentRaw = vibeBaseResponse;
      }
      const _mutationConfidenceLine = buildConfidenceLine({
        hardConstraints: hardConstraintsNonSSE,
        equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
        safetyMode: actionContract?.safetyMode ?? false,
        verificationResult: directVerification,
        actionType: "mutation",
      });
      const coachingContent = _mutationConfidenceLine
        ? `${coachingContentRaw} ${_mutationConfidenceLine}`
        : coachingContentRaw;

      const systemEditData = {
        _type: "system_edit" as const,
        changeSummary: directEditResult.changeSummary,
        changedIds: directEditResult.changedIds,
        systemId: resolvedSystem.id,
        changeLogId,
        verificationStatus: directVerification.status,
        coachReasoning: generateCoachReasoning({
          focusMode: nonStreamFocusMode as FocusMode,
          actionType: "edit",
          intent: directEditPlan.intent,
          scope: directEditPlan.scope,
        }),
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

      const _directPropStatus = directEditResult.propagationSummary?.status === "propagated" ? "full"
        : directEditResult.propagationSummary?.status === "partial" ? "partial"
        : "none";

      res.json({
        outcomeType: "mutation_applied",
        ...(systemAutoCreatedForEdit ? {
          systemSaved: true,
          systemId: resolvedSystem.id,
          trainingSystemId: resolvedSystem.id,
        } : {}),
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: assistantMessage.id, conversationId: assistantMessage.conversationId, role: assistantMessage.role, content: assistantMessage.content, createdAt: assistantMessage.createdAt.toISOString(), structuredData: assistantMessage.structuredData ?? null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
        systemEdit: {
          applied: true,
          route: "direct_edit" as const,
          scope: (directEditPlan.scope ?? "exercise") as "exercise" | "session" | "week" | "block" | "system",
          changedIds: directEditResult.changedIds as unknown as string[],
          changeSummary: directEditResult.changeSummary,
          changeTargets: directEditResult.changeTargets,
          systemId: resolvedSystem.id,
          changeLogId,
          propagationStatus: _directPropStatus,
          architectureWarnings: _directArchResult.warnings.length > 0 ? _directArchResult.warnings.map((w) => w.message) : undefined,
          verificationStatus: directVerification.status as VerificationStatus,
          requiresReview: directVerification.requiresReview ?? false,
        },
        structuredData: null,
        swapContract: directSwapContract,
        mutationReceipt,
      });
      return;

    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack, changeLogId }, "[VibeEdit] DB pipeline threw — returning error response");

      // [MutationResponse] mismatch_detected guard:
      // If changeLogId is already set the DB write succeeded — a later step (coaching
      // response generation, message insert, etc.) threw. Return a success envelope
      // so the frontend shows success and refetches the updated program.
      if (changeLogId !== null) {
        logger.warn(
          { changeLogId, err: err?.message },
          "[MutationResponse] mismatch_detected — DB write succeeded but response-generation threw; returning success envelope",
        );
        const fallbackContent = `Done — your program has been updated.`;
        const [successMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: fallbackContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        res.json({
          outcomeType: "mutation_applied",
          userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
          assistantMessage: { id: successMsg.id, conversationId: successMsg.conversationId, role: successMsg.role, content: successMsg.content, createdAt: successMsg.createdAt.toISOString(), structuredData: null },
          planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
          intentDebug: { type: intentResult.type, confidence: intentResult.confidence, editSubtype: intentResult.editSubtype ?? null },
          systemEdit: { applied: true, changeLogId },
        });
        return;
      }

      // True failure — DB write never happened.
      const structuralOp = execPlan.mutation?.type === "add"
        ? "add that exercise"
        : execPlan.mutation?.type === "remove"
          ? "remove that exercise"
          : execPlan.mutation?.type === "swap"
            ? "swap that exercise"
            : "apply that change";
      const errContent = `I wasn't able to ${structuralOp} — your program hasn't been modified. Try being specific: include the exercise name, which day it's in, and exactly what you'd like changed. If it keeps happening, try opening the session panel and making the change from there.`;
      const receipt = buildMutationFailureReceipt(err?.message ?? "edit_pipeline_error");
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
        mutationReceipt: receipt,
      });
      return;
    }
  }

  // ── Routing Reconciliation Guard ─────────────────────────────────────────
  // If the intent classifier says "mutation" but the execution planner chose
  // GUIDANCE or NO_OP, the two layers disagree. Never silently fall through to
  // the AI with an edit intent that the planner declined to act on — doing so
  // would produce a fake "applied" response or a ghost program build.
  {
    const _isMutationIntent =
      intentResult.type === "EDIT_PROGRAM" ||
      intentResult.type === "ADJUST_FOR_PAIN" ||
      intentResult.type === "ADJUST_FOR_READINESS";
    const _isNonMutationPlan =
      execPlan.action === "GUIDANCE" ||
      execPlan.action === "NO_OP";
    if (_isMutationIntent && _isNonMutationPlan) {
      logger.warn(
        { intentType: intentResult.type, execPlanAction: execPlan.action, intentFamily: execPlan.intentFamily },
        "[Routing Reconciliation] intent/edit mismatch blocked AI fallback"
      );
      const _reconcilContent = `I need one more detail before changing your program. Could you clarify which part you'd like to adjust — the exercise, day, or overall structure?`;
      const [_reconcilMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: _reconcilContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      res.json({
        userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
        assistantMessage: { id: _reconcilMsg.id, conversationId: _reconcilMsg.conversationId, role: _reconcilMsg.role, content: _reconcilMsg.content, createdAt: _reconcilMsg.createdAt.toISOString(), structuredData: null },
        planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
        intentDebug: { type: intentResult.type, confidence: intentResult.confidence },
        actionDebug: { planAction: execPlan.action, reconciliationBlocked: true },
        systemEdit: { applied: false, route: "clarification_followup" as const, scope: "system" as const, changedIds: [] },
        structuredData: null,
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
  // Prepend the action contract directive to any transform hints so it takes
  // effect at the AI layer as the first behavioral instruction.
  // Prepend persisted hard constraints so they are enforced absolutely.
  let transformHint: string | null = contractDirective || null;
  if (constraintDirectiveNonSSE) {
    transformHint = transformHint
      ? `${constraintDirectiveNonSSE}\n\n${transformHint}`
      : constraintDirectiveNonSSE;
  }

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
      const splitHint = buildTransformPromptHint(result.log);
      transformHint = transformHint ? `${transformHint}\n\n${splitHint}` : splitHint;
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

  // ── Constraint reinforcement shortcut (non-SSE) ───────────────────────────
  // When the execution planner detected a restated constraint that the active
  // program already satisfies, override transformHint with the reinforcement
  // directive so the AI acknowledges instead of asking a question.
  if (execPlan.constraintReinforcement) {
    transformHint = execPlan.constraintReinforcement.promptDirective;
    logger.info(
      {
        constraintLabel: execPlan.constraintReinforcement.constraintLabel,
        alreadyPersisted: execPlan.constraintReinforcement.alreadyPersisted,
      },
      "[ConstraintReinforcement:NonSSE] Injecting reinforcement directive — no mutation will run"
    );
  }

  // ── Clarification loop guard (non-SSE) ────────────────────────────────────
  {
    const _recentAsstMsgsNS = await db
      .select({ structuredData: messagesTable.structuredData })
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, params.data.id), eq(messagesTable.role, "assistant")))
      .orderBy(desc(messagesTable.createdAt))
      .limit(6)
      .catch(() => [] as Array<{ structuredData: string | null }>);
    const _convOnlyCountNS = _recentAsstMsgsNS.filter((m) => !m.structuredData).length;
    if (_convOnlyCountNS >= 3) {
      const _loopNoteNS = `\n\n## CLARIFICATION LOOP PREVENTION\nThe assistant has responded ${_convOnlyCountNS} consecutive times without producing an actionable output. You MUST take a decisive action this turn: either build a program, apply a mutation, or give concrete specific guidance. Do NOT ask another clarifying question.`;
      transformHint = transformHint ? `${transformHint}${_loopNoteNS}` : _loopNoteNS.trim();
      logger.warn(
        { conversationId: params.data.id, _convOnlyCountNS },
        "[LoopGuard:NonSSE] Clarification loop detected — injecting force-action prompt nudge"
      );
    }
  }

  // ── Rate-limit / API failure safety wrapper (non-SSE) ─────────────────────
  let aiContent: string;
  let structuredData: any;
  try {
    const _nonSseAiResult = await generateAIResponse(
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
        execPlanAction: execPlan.action,
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
        focusMode: nonStreamFocusMode,
        failSafeResolution,
        hardConstraints: hardConstraintsNonSSE,
      }
    );
    aiContent = _nonSseAiResult.content;
    structuredData = _nonSseAiResult.structuredData;
  } catch (aiErrNonSSE: any) {
    const is429 = /429|rate.?limit/i.test(String(aiErrNonSSE?.message ?? ""));
    const errContent = is429
      ? "I'm experiencing high demand right now — please try again in a moment. Your program hasn't been changed."
      : "Something went wrong generating your response. Please try again — your program is unchanged.";
    logger.error(
      { aiErr: aiErrNonSSE?.message, is429 },
      "[NonSSE/AIFallback] generateAIResponse threw — returning graceful error"
    );
    const [fallbackMsg] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: errContent, structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
      stripeStorage.incrementMessageCount(userId).catch(() => {});
    }
    return res.json({
      userMessage: { id: userMessage.id, conversationId: userMessage.conversationId, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt.toISOString(), structuredData: null },
      assistantMessage: { id: fallbackMsg.id, conversationId: fallbackMsg.conversationId, role: fallbackMsg.role, content: fallbackMsg.content, createdAt: fallbackMsg.createdAt.toISOString(), structuredData: null },
      planInfo: planInfo ? { plan: planInfo.plan, messagesRemaining: planInfo.messagesRemaining } : null,
      systemSaved: false,
    });
  }

  // Warn if EDIT_PROGRAM was routed but no structured data returned
  structuredData = attachFailSafeMetadata(structuredData as any, failSafeResolution) as any;
  if (structuredData && failSafeResolution.triggered) {
    aiContent = prependFailSafeMessage(aiContent, failSafeResolution);
  }

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
          // FIX 6: No false-success copy — tell the truth that nothing was changed yet
          aiContent = `I didn't change your program yet. Tell me exactly what you want adjusted and I'll apply it directly.`;
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
          hardConstraints: hardConstraintsNonSSE,
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

  // ── Hard constraint validation against persisted memory ───────────────────
  if (structuredData) {
    const hardViolations = validateAgainstHardConstraints(structuredData, hardConstraintsNonSSE);
    if (hardViolations.length > 0) {
      logger.warn(
        { violations: hardViolations.map((v) => ({ exercise: v.exerciseName, type: v.violationType, constraint: v.matchedConstraint })) },
        "[ConstraintMemory] Hard constraint violations detected in generated program"
      );
    }
  }

  // ── Enrich structuredData with build metadata for all program builds ────────
  // Attach _buildMeta for initial builds AND for rebuilds from scratch so the UI
  // always renders a BuildSummaryCard after any full program generation.
  const isInitialBuildNonStream =
    structuredData != null &&
    (intentResult.type === "CREATE_PROGRAM" ||
     intentResult.type === "START_NEW_PROGRAM" ||
     intentResult.type === "STRUCTURAL_REBUILD");

  if (isInitialBuildNonStream && structuredData) {
    const _buildFocusMode = goalToFocusMode(extractedConstraints?.primaryGoal) as FocusMode;
    const _buildCoachReasoning = generateCoachReasoning({
      focusMode: _buildFocusMode,
      actionType: "build",
      goal: extractedConstraints?.primaryGoal ?? undefined,
      frequency: structuredData.days.length,
    });
    const _microReasonResult = buildMicroReasons({
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
      hardConstraints: hardConstraintsNonSSE,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[MicroReasoningAudit]", JSON.stringify({
        path: "non_sse_build",
        safeToShow: _microReasonResult.safeToShow,
        reasons: _microReasonResult.reasons,
        evidence: _microReasonResult.evidence,
      }));
    }
    (structuredData as unknown as Record<string, unknown>)._buildMeta = {
      frequency: structuredData.days.length,
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      sessionDuration: extractedConstraints?.sessionDuration ?? null,
      _coachReasoning: _buildCoachReasoning,
      _microReasons: _microReasonResult.safeToShow ? _microReasonResult.reasons : [],
    };
  }

  // ── Confidence signal — builds only ───────────────────────────────────────
  // Append a short closing sentence confirming program-constraint alignment.
  // Only fires when the AI produced a structured program (structuredData != null).
  if (structuredData) {
    const _buildConfidenceLine = buildConfidenceLine({
      hardConstraints: hardConstraintsNonSSE,
      equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
      safetyMode: actionContract?.safetyMode ?? false,
      verificationResult: null,
      actionType: "build",
    });
    if (_buildConfidenceLine) {
      aiContent = `${aiContent} ${_buildConfidenceLine}`;
    }
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
        savedSystem = await createTrainingSystemFromProgram(userId, structuredData, params.data.id, nonStreamFocusMode);
        isUpdate = false;
      } else {
        const result = await upsertTrainingSystemFromProgram(userId, structuredData, nonStreamFocusMode, params.data.id);
        savedSystem = result.system;
        isUpdate = result.isUpdate;
      }
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      // ── Action Contract TurnOutcome tracking ────────────────────────────────
      if (isNewProgramBuild) {
        turnOutcome.programRebuilt = true;
        // P0-5: fire first-build retention email (idempotent, non-blocking)
        fireFirstBuildEmail(userId).catch(() => {});
      } else {
        turnOutcome.mutationApplied = true;
        turnOutcome.verificationStatus = "verified";
      }

      if (nonStreamFocusMode === "speed" || nonStreamFocusMode === "mobility") {
        logger.info(
          {
            userId,
            systemId: savedSystem.id,
            focusMode: nonStreamFocusMode,
            programName: structuredData.programName,
            dayCount: structuredData.days?.length ?? 0,
            programSaved: true,
          },
          "[SpeedBuildCompletionAudit] Build completed successfully — program saved to DB"
        );
      }

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

  // ── Action Contract Enforcement ────────────────────────────────────────────
  // Build the audit receipt and check compliance. Non-fatal — enforcement
  // is observability + guard, not a hard gate that breaks the response.
  let auditReceipt = null;
  if (actionContract) {
    try {
      auditReceipt = enforceActionContract(actionContract, turnOutcome);
    } catch (enforceErr) {
      logger.warn({ enforceErr }, "[ActionContract] Enforcer failed — non-fatal");
    }
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
    auditReceipt,
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

  // ── Structured UI action guardrail (SSE path) ─────────────────────────────
  // Deterministic UI actions must use /api/training-system/edit or mutate — not chat.
  {
    const _bodySSE = req.body as Record<string, unknown>;
    const _hasStructuredUIFieldSSE =
      _bodySSE.refineSource === "program_refine_panel" ||
      _bodySSE.scopeOverride != null ||
      _bodySSE.structuredIntent != null ||
      _bodySSE.uiAction != null ||
      (_bodySSE.trainingSystemId != null && _bodySSE.refineSource != null);
    if (_hasStructuredUIFieldSSE) {
      logger.warn(
        { refineSource: _bodySSE.refineSource, scopeOverride: _bodySSE.scopeOverride, structuredIntent: _bodySSE.structuredIntent, uiAction: _bodySSE.uiAction },
        "[Structured UI Action] Blocked structured UI payload from SSE chat endpoint — must use /api/training-system/edit"
      );
      res.status(400).json({
        error: "Structured UI actions must use /api/training-system/edit or /api/training-system/mutate — not the chat endpoint.",
        code: "STRUCTURED_UI_ROUTE_VIOLATION",
      });
      return;
    }
  }

  // ── Pipeline Latency Tracking ─────────────────────────────────────────────
  const _pipeline_t0 = Date.now();
  let _t_history_done = 0;
  let _t_intent_done = 0;
  let _t_ai_start = 0;
  let _t_ai_end = 0;
  let _t_db_start = 0;
  let _t_db_end = 0;

  const streamUIContext = (req.body as any)?.uiContext ?? null;
  // Read the fresh-build flag passed by the frontend when the user starts a new builder session.
  // When true: scope intent classification to conversation history only (ignore DB active system)
  // and strip old program name from the AI system prompt uiContext section.
  const isFreshBuildSession = streamUIContext?.newBuildSession === true;
  const streamFocusMode = resolveFocusMode(streamUIContext?.focusMode ?? null);

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
    // Clear conversation context on new build so stale exercise/session/mutation refs
    // from a previous program do not leak into a fresh session.
    clearConversationContext(String(params.data.id));
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

  // Tick the conversation context turn counter so stale references expire correctly.
  // Must be called after the message is saved but before resolution runs.
  tickConversationTurn(String(params.data.id));

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

  // Early narration context — only user message is available at these stages.
  // Action type is not yet classified; keyword hints drive the narration branch.
  const _earlyNarrationCtx: NarrationContext = {
    action: "",
    userMessageHint: parsed.data.content.slice(0, 120),
  };
  emit(buildStageEvent("understanding", undefined, undefined, _earlyNarrationCtx));

  // ── Stage 2: Load Program State ──────────────────────────────────────────
  // Fetch conversation history and pro context before loading program state
  emit(buildStageEvent("loading", undefined, undefined, _earlyNarrationCtx));

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

  // Hard constraints from persisted memory — enforced for ALL users regardless of plan tier.
  let hardConstraintsSSE: HardConstraints = { bannedItems: [], dislikedItems: [], painRegions: [], sport: null };
  let constraintDirectiveSSE2: string | null = null;

  if (isPro) {
    const _sessionFocusMode = resolveFocusMode((req.body as any)?.uiContext?.focusMode ?? null);
    const [adaptation, memories, sessionLogCtxSSE] = await Promise.all([
      buildAdaptationContext(userId, _sessionFocusMode).catch(() => ({ promptContext: "" })),
      allowMemory ? listMemories(userId).catch(() => []) : Promise.resolve([]),
      buildSessionLogContext(userId).catch(() => ""),
    ]);
    adaptationCtx = adaptation.promptContext;
    memoryCtx = allowMemory ? buildMemoryContext(memories) : "";
    if (sessionLogCtxSSE) {
      memoryCtx += `\n\n${sessionLogCtxSSE}`;
    }
    if (allowInsights && allowMemory) {
      const insights = await generateInsights(userId, memories).catch(() => []);
      insightHint = buildInsightPromptHint(insights);
    }
    if (allowMemory) {
      syncMemoriesFromData(userId).catch(() => {});
      extractMemoriesFromMessage(userId, userMessage.content).catch(() => {});
    }

    // Extract hard constraints from the already-loaded memories (no extra DB call)
    hardConstraintsSSE = loadHardConstraints(allowMemory ? memories : []);
    constraintDirectiveSSE2 = buildConstraintEnforcementDirective(hardConstraintsSSE);

    // ── Priority 5: Cross-conversation continuity opener (SSE path) ──────────
    // ── Priority 2: Proactive behavioral signal (SSE path) ───────────────────
    if (allowMemory && memories.length > 0) {
      const isFirstUserMessageSSE = history.filter((m) => m.role === "user").length === 0;
      if (isFirstUserMessageSSE) {
        const highConfMemoriesSSE = memories.filter((m) => (m as any).confidence >= 3);
        if (highConfMemoriesSSE.length > 0) {
          const OPENER_PRIORITY_SSE = ["pain_pattern", "sport_context", "exercise_preference", "adherence_pattern", "volume_response", "training_preference"];
          const topMemorySSE = [...highConfMemoriesSSE].sort((a, b) => {
            const pa = OPENER_PRIORITY_SSE.indexOf((a as any).type), pb = OPENER_PRIORITY_SSE.indexOf((b as any).type);
            if (pa !== pb) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            return (b as any).confidence - (a as any).confidence;
          })[0] as any;
          memoryCtx += `\n\n## RETURNING ATHLETE — PROACTIVE OPENER\nThis is the first message of a new conversation. Before answering, open with one brief, coach-like sentence referencing what you already know about this athlete. Make it feel natural — like a real coach who remembers their client. DO NOT say "Based on my memory" or "I know that you". Examples: "Good to be back — how's that shoulder holding up?" or "We've been building more athletically lately — continuing that direction?" Memory to reference: [${topMemorySSE.type}] "${topMemorySSE.detail}"`;
        }
        const behavioralSignalsSSE = memories.filter((m) =>
          (["adherence_pattern", "volume_response", "recovery_pattern"].includes((m as any).type)) &&
          (m as any).sentiment === "negative" && (m as any).confidence >= 3
        );
        if (behavioralSignalsSSE.length > 0) {
          const signalSSE = behavioralSignalsSSE[0] as any;
          memoryCtx += `\n\n## PROACTIVE BEHAVIORAL SIGNAL\nPattern observed: ${signalSSE.detail}. If clearly relevant to what the user is asking today, briefly and naturally surface it before answering. Keep it coaching-toned and concise. Example: "I've noticed [pattern] — want me to factor that in?" Only include if genuinely relevant. Do NOT force it into every response.`;
        }
      }
    }
  } else {
    // For non-Pro users: lightweight constraint memory load for hard constraint enforcement
    const constraintMemories = await listMemories(userId).catch(() => []);
    hardConstraintsSSE = loadHardConstraints(constraintMemories);
    constraintDirectiveSSE2 = buildConstraintEnforcementDirective(hardConstraintsSSE);
    // Inject recent session logs for all users — grounding the coach in real feedback
    const sessionLogCtxFreeSSE = await buildSessionLogContext(userId).catch(() => "");
    if (sessionLogCtxFreeSSE) memoryCtx += `\n\n${sessionLogCtxFreeSSE}`;
  }

  // ── Priority 3: Mutation trust language directive (SSE path) ─────────────
  memoryCtx += `\n\n## MUTATION RESPONSE LANGUAGE\nWhen applying program changes: never use past-tense confirmation ("Done", "I've updated", "Your program has been changed"). Use present-tense or forward-looking language: "Applying that now — see the changes in your program panel" or "On it — the panel will show the update." The verification indicator in the UI confirms success.`;

  // ── P1: STRUCTURAL APPROVAL GATE — REBUILD_PROGRAM (SSE path) ────────────
  // When requireApprovalStructural=true, prevent the program architect from
  // auto-generating a structured program. The AI must describe and ask first.
  if (agentSettings.behavior.requireApprovalStructural && execPlan.action === "REBUILD_PROGRAM") {
    memoryCtx += `\n\n## STRUCTURAL REBUILD — APPROVAL REQUIRED [user preference: on]\nCRITICAL: The user has enabled "Require Approval for Structural Changes."\nYou MUST follow this protocol:\n1. Do NOT generate or output a structured training program in this response.\n2. In 2-3 sentences, briefly describe what you would build (focus, structure, key emphasis).\n3. End with exactly: "Want me to build this out for you?" — wait for confirmation.\nOnly build the full program after the user explicitly says yes.`;
    logger.info({ userId }, "[AgentSettings:stream] requireApprovalStructural — REBUILD_PROGRAM intercepted; injecting approval gate directive");
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
  // Load active program + system in parallel, then classify intent.
  // Pass focusMode so we resolve the correct focus's training system.
  const [latestStructuredProgram, activeSystem] = await Promise.all([
    Promise.resolve(resolveCurrentProgram(history)),
    getActiveTrainingSystem(userId, streamUIContext?.focusMode ? streamFocusMode : undefined).catch(() => null),
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
  let activePendingClarification = await getActivePendingClarification(params.data.id).catch(() => null);

  // ── Stale pending check (SSE path) ─────────────────────────────────────────
  // If the pending clarification targets a different training system than the
  // one currently active, it is stale. Clear it so it doesn't pollute routing.
  if (
    activePendingClarification &&
    (activeSystem as any)?.id != null &&
    activePendingClarification.targetProgramId != null &&
    activePendingClarification.targetProgramId !== (activeSystem as any)?.id
  ) {
    resolvePendingClarification(activePendingClarification.id, "expired").catch(() => {});
    logger.warn(
      { pendingId: activePendingClarification.id, pendingTargetId: activePendingClarification.targetProgramId, activeSystemId: (activeSystem as any)?.id },
      "[AntiLoop] Stale pending cleared — system mismatch (SSE)"
    );
    activePendingClarification = null;
  }

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
    } else if (looksLikeClarificationAnswer(parsed.data.content)) {
      // Widened: any non-strong-new-intent message that looks like a clarification
      // answer resumes the pending mutation — regardless of classified intent type.
      const _priorIntentTypeStream = intentResult.type;
      intentResult = { type: "CLARIFICATION_FOLLOWUP", confidence: "high" };
      logger.info(
        {
          pendingId: activePendingClarification.id,
          originalMessage: activePendingClarification.originalRequest.slice(0, 80),
          followupMessage: parsed.data.content.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          priorIntentType: _priorIntentTypeStream,
          trainingSystemId: activePendingClarification.targetProgramId ?? null,
        },
        "[ClarificationFollowup:stream] pending context found — overriding intent to CLARIFICATION_FOLLOWUP"
      );
    }
  }

  logIntentSummary(parsed.data.content, intentResult, hasAnyProgram);

  // ── Clarification State Dev Log (SSE path) ────────────────────────────────
  console.log("[Clarification State]", {
    pendingIntentFamily: activePendingClarification?.intentFamily ?? null,
    pendingAction: activePendingClarification ? "pending" : "none",
    pendingScope: activePendingClarification?.pendingAspect ?? null,
    pendingClarificationQuestion: activePendingClarification?.clarificationQuestion?.slice(0, 80) ?? null,
    pendingClarificationFields: activePendingClarification
      ? {
          originalRequest: activePendingClarification.originalRequest?.slice(0, 80),
          intentFamily: activePendingClarification.intentFamily,
          pendingAspect: activePendingClarification.pendingAspect,
          turnsRemaining: activePendingClarification.turnsRemaining,
        }
      : null,
    pendingTrainingSystemId: activePendingClarification?.targetProgramId ?? null,
    pendingConversationId: activePendingClarification?.conversationId ?? null,
    currentMessage: parsed.data.content.slice(0, 80),
    clarificationResolutionAttempted: intentResult.type === "CLARIFICATION_FOLLOWUP",
    clarificationResolved: false, // updated after execPlan resolves
  });

  // ── Language System + Response Policy (SSE path) ─────────────────────────
  // Mirror of the same block in the non-stream handler. Both handlers must
  // declare resolvedResponsePolicy in their own scope — the non-stream handler's
  // variable is NOT accessible here (different closure).
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
  } catch (langErrSSE) {
    logger.warn({ langErrSSE }, "[SSE/ResponsePolicy] Language/policy resolution failed — continuing without it");
  }

  // ── ACTION CONTRACT (SSE path) — Central binding contract for this turn ────
  let actionContractSSE: ActionContract | null = null;
  let contractDirectiveSSE = "";
  try {
    actionContractSSE = buildActionContract(
      parsed.data.content,
      hasAnyProgram,
      intentResult.type,
    );
    contractDirectiveSSE = buildContractPromptDirective(actionContractSSE);
  } catch (contractErrSSE) {
    logger.warn({ contractErrSSE }, "[ActionContract/SSE] Failed to build contract — proceeding without enforcement");
  }

  const turnOutcomeSSE: TurnOutcome = {
    mutationApplied: false,
    constraintPersisted: false,
    clarificationAsked: false,
    programRebuilt: false,
    verificationStatus: "not_applicable",
  };

  // ── Constraint Extraction ─────────────────────────────────────────────────
  let extractedConstraints: ExtractedConstraints | null = null;
  if (intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM") {
    extractedConstraints = extractConstraints(parsed.data.content);

    // ── Sport inheritance: carry forward sport from the active program context
    // if the user didn't mention a sport in this specific message.
    if (extractedConstraints.sportFocus === null) {
      const contextText = [
        (activeSystem as any)?.name ?? "",
        (activeSystem as any)?.overarchingGoal ?? "",
        latestStructuredProgram?.programName ?? "",
        latestStructuredProgram?.description ?? "",
      ].filter(Boolean).join(" ").toLowerCase();
      if (contextText.trim()) {
        const inheritedSport = detectSport(contextText);
        if (inheritedSport) {
          extractedConstraints = { ...extractedConstraints, sportFocus: inheritedSport };
          logger.info(
            { inheritedSport, source: activeSystem ? "activeSystem" : "latestProgram" },
            "[SSE/ConstraintExtraction] Inherited sportFocus from active program context"
          );
        }
      }
    }

    logger.info(
      {
        daysPerWeek: extractedConstraints.daysPerWeek,
        primaryGoal: extractedConstraints.primaryGoal,
        sportFocus: extractedConstraints.sportFocus,
      },
      "[SSE/ConstraintExtraction] Constraints extracted for program build"
    );
  }

  // ── Conversation Context Resolution — deictic follow-up rewriting ────────
  // Attempt to rewrite vague references like "that exercise", "do the same for Day 2",
  // "undo that" into fully-specified equivalents before the execution planner runs.
  // The original parsed.data.content is preserved as-is for DB storage and user display.
  const _ctxResolution = resolveContextualMessage(
    String(params.data.id),
    parsed.data.content,
    activeSystem?.id ?? null
  );

  // The effective message drives routing + edit pipeline. Falls back to original if no resolution.
  const effectiveMessage = _ctxResolution.resolved
    ? _ctxResolution.resolvedMessage
    : parsed.data.content;

  if (_ctxResolution.resolved) {
    logger.info(
      {
        conversationId: params.data.id,
        original: parsed.data.content.slice(0, 100),
        resolved: _ctxResolution.resolvedMessage.slice(0, 100),
        resolution: _ctxResolution.resolution,
      },
      "[ConversationContext] resolved — rewriting message for execution planner"
    );
  } else if ("ambiguous" in _ctxResolution && _ctxResolution.ambiguous) {
    // Ambiguous deictic reference — short-circuit with a clarification question
    logger.info(
      { conversationId: params.data.id, resolution: _ctxResolution.resolution },
      "[ConversationContext] ambiguous — short-circuiting with clarification question"
    );
    const [_ctxClarMsg] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content: _ctxResolution.clarificationQuestion,
      structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
      stripeStorage.incrementMessageCount(userId).catch(() => {});
    }
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: _ctxClarMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }));
    return;
  }

  // ── Loop detection state (SSE path) ──────────────────────────────────────
  const pendingClarificationCountSSE = activePendingClarification
    ? Math.max(0, 2 - activePendingClarification.turnsRemaining)
    : 0;
  const lastClarificationQuestionSSE = activePendingClarification?.clarificationQuestion ?? undefined;

  // ── EXECUTION PLANNER (SSE path) — Central single-brain routing decision ──
  const _rawExecPlanSSE: ExecutionPlan = await buildExecutionPlan({
    message: effectiveMessage,
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
    focusMode: streamFocusMode,
    hardConstraints: hardConstraintsSSE,
    pendingClarificationCount: pendingClarificationCountSSE,
    lastClarificationQuestion: lastClarificationQuestionSSE,
  });

  // ── Anti-Loop Reliability Layer (SSE path) ────────────────────────────────
  const _antiLoopResultSSE = applyAntiLoopReliabilityLayer(_rawExecPlanSSE, {
    message: effectiveMessage,
    program: latestStructuredProgram,
    activeSystemId: (activeSystem as any)?.id ?? null,
    conversationId: params.data.id as number,
    pendingClarificationId: activePendingClarification?.id ?? null,
    pendingClarificationTargetProgramId: activePendingClarification?.targetProgramId ?? null,
    pendingClarificationCount: pendingClarificationCountSSE,
  });
  if (_antiLoopResultSSE.shouldClearPending && activePendingClarification) {
    resolvePendingClarification(activePendingClarification.id, "expired").catch(() => {});
    activePendingClarification = null;
  }

  // ── Action Guarantee Layer (SSE path) ─────────────────────────────────────
  const _guaranteeResultSSE = applyActionGuaranteeLayer(_antiLoopResultSSE.plan, {
    message: effectiveMessage,
    activeProgramId: (activeSystem as any)?.id ?? null,
    program: latestStructuredProgram,
    conversationId: params.data.id as number,
    pendingClarificationCount: pendingClarificationCountSSE,
  });
  const execPlan = _guaranteeResultSSE.plan;

  logger.info(
    {
      action: execPlan.action,
      intentFamily: execPlan.intentFamily,
      scope: execPlan.scope,
      mutation: execPlan.mutation?.type ?? null,
      intentType: intentResult.type,
    },
    "[Routing Authority] execPlan.action selected (SSE path)"
  );

  // ── Orchestration context audit — compare typed vs voice sends here ──────
  // plannerRoute is derived from execPlan.action (architect is engaged on
  // REBUILD_PROGRAM; direct edit fast-path is used on APPLY_MUTATION).
  logger.info(
    {
      plannerRoute:
        execPlan.action === "REBUILD_PROGRAM" ? "BUILD_WITH_ARCHITECT" :
        execPlan.action === "APPLY_MUTATION"  ? "DIRECT_EDIT" :
        execPlan.action === "ASK_CLARIFICATION" ? "GUIDANCE" :
        execPlan.action === "GUIDANCE"        ? "GUIDANCE" :
        "NO_OP",
      architectEnabled: execPlan.action === "REBUILD_PROGRAM",
      orchestrationMode: execPlan.action,
      intentType: intentResult.type,
      intentFamily: execPlan.intentFamily ?? null,
      focusMode: streamFocusMode,
      hasActiveProgram: hasAnyProgram,
      isFreshBuildSession,
      activeProgramId: (activeSystem as any)?.id ?? null,
      activeProgramName: (activeSystem as any)?.name ?? null,
      constraintMemoryLoaded: hardConstraintsSSE != null,
      messageSource: streamUIContext?.source ?? "typed",
    },
    "[TrainChat Orchestration Context]"
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

  const failSafeResolution = resolveFailSafeState({
    message: parsed.data.content,
    focusMode: streamFocusMode,
    activeProgram: (activeSystem as any) ?? (latestStructuredProgram as any),
    recentCommands: history
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    requestedFrequency: extractedConstraints?.daysPerWeek ?? null,
    requestedDuration: extractedConstraints?.sessionDuration ?? null,
    action: execPlan.action,
    intentType: intentResult.type,
  });
  extractedConstraints = applyFailSafeConstraints(extractedConstraints, failSafeResolution);
  logFailSafeAudit(logger, { message: parsed.data.content, focusMode: streamFocusMode, activeProgram: (activeSystem as any) ?? (latestStructuredProgram as any), action: execPlan.action, intentType: intentResult.type }, failSafeResolution);

  _t_intent_done = Date.now();

  // Full narration context — action type, intent family, constraints, and
  // mutation details are all available from classifying onwards.
  const _narrationCtx: NarrationContext = {
    action: execPlan.action,
    intentFamily: execPlan.intentFamily ?? null,
    mutationType: execPlan.mutation?.type ?? null,
    goal: extractedConstraints?.primaryGoal ?? null,
    daysPerWeek: extractedConstraints?.daysPerWeek ?? null,
    equipment: extractedConstraints?.equipment ?? null,
    sport: extractedConstraints?.sportFocus ?? null,
    sessionDuration: extractedConstraints?.sessionDuration ?? null,
    hasPain: intentResult.type === "ADJUST_FOR_PAIN" || execPlan.intentFamily === "injury_modification" || execPlan.intentFamily === "joint_friendly_modification",
    userMessageHint: parsed.data.content.slice(0, 120),
  };

  // Emit micro-reasons early in the stream — computed from persisted constraints,
  // sport context, and equipment profile already available. The client uses these
  // to build the conversational feedback line during the active build.
  {
    const _earlyMicroResult = buildMicroReasons({
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? hardConstraintsSSE.sport,
      equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
      hardConstraints: hardConstraintsSSE,
    });
    const _isSafetyTurn =
      _narrationCtx.hasPain ||
      (actionContractSSE?.safetyMode ?? false) ||
      execPlan.intentFamily === "injury_modification" ||
      execPlan.intentFamily === "joint_friendly_modification";
    emit({
      type: "micro_reasons",
      reasons: _earlyMicroResult.safeToShow ? _earlyMicroResult.reasons : [],
      safeToShow: _earlyMicroResult.safeToShow,
      safetyMode: _isSafetyTurn,
    });
  }

  // Emit classifying stage — intent and action type are now known
  emit(buildStageEvent("classifying", intentResult.type, execPlan.action, _narrationCtx));

  // ── Helper: build the final SSE complete response ─────────────────────────
  function buildCompleteEvent(opts: {
    userMsg: typeof userMessage;
    assistantMsg: { id: number; conversationId: number; role: string; content: string; createdAt: Date; structuredData: string | null };
    planInfoVal: typeof planInfo;
    intentResultVal: typeof intentResult;
    systemSavedVal: boolean;
    systemIdVal?: number;
    systemEditVal?: { applied: boolean; changeSummary?: string; systemId?: number };
    changeLogIdVal?: number;
    outcomeTypeVal?: "mutation_applied" | "clarification_needed" | "conversation_only" | "true_failure";
    auditReceiptVal?: unknown;
    /** Global mutation outcome from finalizeMutationOutcome() — present on shouldMutate=true paths. */
    mutationOutcomeVal?: MutationOutcomeResult | null;
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
      auditReceipt: opts.auditReceiptVal ?? null,
      mutationOutcome: opts.mutationOutcomeVal ?? null,
    };
  }

  if (failSafeResolution.strategy === "redirect_focus") {
    const content = failSafeResolution.userFacingMessage ?? "That request fits a different training focus. Switch focus modes and I’ll build it with the right engine.";
    const [assistantMessage] = await db.insert(messagesTable).values({
      conversationId: params.data.id,
      role: "assistant",
      content,
      structuredData: JSON.stringify({ _type: "fail_safe", ...failSafeResolution }),
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only" }));
    return;
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
  // ExecutionPlan is the single routing authority. classifyIntent is advisory only.
  // intentResult.type is available for logging and analytics throughout this handler,
  // but routing decisions and mutation eligibility are controlled by execPlan.action.
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

  // ── P1: DELOAD APPROVAL GATE (SSE path) ─────────────────────────────────────
  // When requireApprovalDeload=true, deload/recovery-focus intents must route
  // to the AI describe+confirm path instead of being auto-applied.
  if (
    agentSettings.behavior.requireApprovalDeload &&
    execPlan.intentFamily != null &&
    (["fatigue_management", "recovery_focus"] as string[]).includes(execPlan.intentFamily as string)
  ) {
    logger.info(
      { userId, intentFamily: execPlan.intentFamily },
      "[AgentSettings:stream] requireApprovalDeload — deload intent requires user confirmation, routing to AI confirm path"
    );
    break; // fall through to AI describe+confirm path
  }

  // ── P1: STRUCTURAL MUTATION APPROVAL GATE (SSE path) ─────────────────────────
  // When requireApprovalStructural=true, structural exercise mutations (add/remove/swap)
  // must route to the AI describe+confirm path before the edit engine runs.
  if (
    agentSettings.behavior.requireApprovalStructural &&
    execPlan.mutation?.type != null &&
    (["add", "remove", "swap"] as string[]).includes(execPlan.mutation.type)
  ) {
    logger.info(
      { userId, mutationType: execPlan.mutation?.type },
      "[AgentSettings:stream] requireApprovalStructural — structural mutation requires user confirmation, routing to AI confirm path"
    );
    break; // fall through to AI describe+confirm path
  }

  // ── Short-circuit: CLARIFICATION_FOLLOWUP ────────────────────────────────
  // Resume a pending mutation from a prior turn using the user's short answer.
  // This mirrors the non-stream path; we run the full edit pipeline, then emit
  // a complete event. Falls through to standard AI path on any pipeline error.
  if (intentResult.type === "CLARIFICATION_FOLLOWUP" && activePendingClarification) {
    const pending = activePendingClarification;

    // Decrement turnsRemaining so loop detection sees progress on the next turn.
    // Fire-and-forget — the pending record may be resolved before next read.
    decrementTurnsRemaining(pending.id).catch(() => {});

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
        clarificationSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram, null, streamFocusMode);
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
            userId, trainingSystemId: clarificationSystem.id, source: "clarification_followup",
            intent: clarificationEditPlan.intent, scope: clarificationEditPlan.scope,
            changeSummary: clarificationEditResult.changeSummary,
            requestText: `[clarification followup:stream] ${reconstructedRequest.slice(0, 300)}`,
            beforeSnapshot: clarificationEditResult.beforeSnapshot,
            afterSnapshot: clarificationEditResult.afterSnapshot,
            appliedCount: clarificationEditResult.appliedCount, skippedCount: clarificationEditResult.skippedCount,
            versionOverrides: isStructuralVibeEdit ? { isMajorVersion: true } : undefined,
            decisionMetadata: { whyChanged, intentType: "CLARIFICATION_FOLLOWUP", intentFamily: pending.intentFamily, pendingAspect: pending.pendingAspect, originalRequest: pending.originalRequest, userReply: parsed.data.content, verification: { status: verification.status, verifiedCount: verification.verifiedChanges.length, missingCount: verification.missingChanges.length, requiresReview: verification.requiresReview ?? false } },
          });

          let coachingContent = buildVibeEditCoachingResponse(clarificationEditResult);

          // FIX 7: Run response alignment verifier on the coaching text before writing to DB.
          // buildVibeEditCoachingResponse produces deterministic text from edit results, but
          // the verifier catches any false-success claims that might slip through, and repairs
          // them to truthful copy before the message is persisted.
          try {
            const _clariVerifyResult = verifyResponseAlignment({
              action: "APPLY_MUTATION",
              intentType: "CLARIFICATION_FOLLOWUP",
              narrationCtx: _narrationCtx,
              aiContent: coachingContent,
              structuredData: null,
              systemSaved: false,
              outcomeType: "mutation_applied",
              mutationApplied: true,
              extractedConstraints: null,
              hardConstraints: null,
            });
            if (!_clariVerifyResult.passed && _clariVerifyResult.repairedContent) {
              logger.warn(
                { violations: _clariVerifyResult.violations?.length ?? 0 },
                "[ResponseVerifier/ClarificationFollowup] Coaching text repaired before DB write"
              );
              coachingContent = _clariVerifyResult.repairedContent;
            }
          } catch { /* non-fatal — use original coachingContent */ }

          const _sseClariFixFocusMode = ((clarificationSystem?.metadata as any)?.focusMode ?? "strength") as FocusMode;
          const systemEditData = {
            _type: "system_edit" as const, changeSummary: clarificationEditResult.changeSummary,
            changedIds: clarificationEditResult.changedIds, systemId: clarificationSystem.id, changeLogId,
            verificationStatus: verification.status,
            coachReasoning: generateCoachReasoning({
              focusMode: _sseClariFixFocusMode,
              actionType: "edit",
              intent: clarificationEditResult.changeSummary,
            }),
          };
          const [assistantMessage] = await db.insert(messagesTable).values({
            conversationId: params.data.id, role: "assistant", content: coachingContent,
            structuredData: JSON.stringify(systemEditData),
          }).returning();
          await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
          await resolvePendingClarification(pending.id, "mutation_applied").catch(() => {});
          if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }

          // ── Store conversation context for follow-up resolution (clarification path) ──
          try {
            storeMutationReference(String(params.data.id), {
              mutationType: clarificationEditPlan.intent,
              intentFamily: pending.intentFamily ?? null,
              scope: clarificationEditPlan.scope ?? "exercise",
              affectedExerciseIds: clarificationEditResult.changedIds?.exercises ?? [],
              affectedSessionIds: clarificationEditResult.changedIds?.sessions ?? [],
              changeLogId: changeLogId ?? null,
              userRequest: pending.originalRequest,
              changeSummary: clarificationEditResult.changeSummary,
            });
            inferExerciseReferenceFromMutation({
              conversationId: String(params.data.id),
              userRequest: pending.originalRequest,
              changeTargets: clarificationEditResult.changeTargets ?? [],
              intentFamily: pending.intentFamily ?? null,
            });
          } catch (ctxClariErr) {
            logger.warn({ ctxClariErr }, "[ConversationContext] Failed to store refs after clarification followup — non-fatal");
          }

          // FIX 7: Build action contract and enforce it for audit receipt.
          // Without this, clarification followup success turns have auditReceipt: null
          // in the complete event, making the AgentTurnReport incomplete.
          let _clariAuditReceipt: unknown = null;
          try {
            const _clariContract = buildActionContract(parsed.data.content, true, "CLARIFICATION_FOLLOWUP");
            _clariAuditReceipt = enforceActionContract(_clariContract, {
              mutationApplied: true,
              constraintPersisted: false,
              clarificationAsked: false,
              programRebuilt: false,
              verificationStatus: verification.status as "verified" | "partial" | "unclear" | "not_applicable",
            });
          } catch { /* non-fatal */ }

          done(buildCompleteEvent({
            userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo,
            intentResultVal: intentResult, systemSavedVal: false,
            systemIdVal: clarificationSystem.id, changeLogIdVal: changeLogId,
            systemEditVal: { applied: true },
            outcomeTypeVal: "mutation_applied",
            auditReceiptVal: _clariAuditReceipt,
          }));
          return;
        }

        // No changes — expire pending and return helpful message
        await resolvePendingClarification(pending.id, "no_changes_after_followup").catch(() => {});
        const noOpFollowupContent = `I can try a different approach — could you tell me which day or exercise you'd like this applied to? For example: "Day 1, the squats" or "all exercises on Day 2". That gives me enough to act directly.`;
        const [noOpMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noOpFollowupContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }
        done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: noOpMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, systemEditVal: { applied: false }, outcomeTypeVal: "conversation_only" }));
        return;
      }
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[ClarificationFollowup:stream] Pipeline threw — returning safe failure, program left unchanged");
      logger.warn("[Mutation Failure] program left unchanged — CLARIFICATION_FOLLOWUP:stream pipeline error, no AI fallback");
      await resolvePendingClarification(pending.id, "pipeline_error").catch(() => {});
      const _sseClariErrContent = `I couldn't apply that edit, so I left your program unchanged. Try rephrasing or being more specific about which exercise or day you'd like changed.`;
      const [_sseClariErrMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: _sseClariErrContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }
      done({
        ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: _sseClariErrMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, systemEditVal: { applied: false }, outcomeTypeVal: "true_failure" }),
        systemEdit: { applied: false, route: "clarification_followup", scope: "system", changedIds: [], error: "pipeline_error" },
        structuredData: null,
      });
      return;
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

    // Write pending clarification state so the next reply can resume the correct intent.
    // Always write here — we are inside case "ASK_CLARIFICATION" so the plan is always a question.
    // FIX 1 (SSE): Same recovery as non-SSE path — if execPlan.intentFamily is
    // "clarification_required" (fallback), re-classify to find the real family.
    {
      const _rawFamilySSE = execPlan.intentFamily as string | null;
      const familyForPending =
        (_rawFamilySSE && _rawFamilySSE !== "clarification_required")
          ? _rawFamilySSE
          : (() => {
              const recovered = normalizeToIntentFamily(parsed.data.content, streamFocusMode);
              return recovered.family !== "clarification_required" ? recovered.family : "clarification_required";
            })();

      writePendingClarification({
        conversationId: params.data.id, userId,
        targetProgramId: activeSystem?.id ?? null,
        originalRequest: parsed.data.content,
        intentFamily: familyForPending,
        pendingAspect: (execPlan.clarification?.pendingAspect as "scope" | "target_day" | "target_session" | "target_exercise" | "phase_or_block" | "confirmation") ?? "scope",
        clarificationQuestion: clarifyingQuestion,
        editSubtype: intentResult.editSubtype ?? null,
        editIntent: execPlan.intentFamily ?? null,
      }).then(() => {
        logger.info(
          {
            conversationId: params.data.id,
            originalRequest: parsed.data.content.slice(0, 80),
            intentFamily: familyForPending,
            pendingAspect: execPlan.clarification?.pendingAspect ?? "scope",
          },
          "[ClarificationFollowup:stream] Pending clarification record written — next reply will resume this intent"
        );
      }).catch((err) => logger.warn({ err }, "[PendingClarification:stream] Failed to write record for planner clarification — non-fatal"));
    }

    done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }));
    return;
  }

      break; // end case "ASK_CLARIFICATION"
    } // end case "ASK_CLARIFICATION"

    // ── ACTION_CHOICE_CARD (SSE path) ─────────────────────────────────────────
    // Ambiguous destructive target — show structured choices, never a free-text question.
    case "ACTION_CHOICE_CARD": {
      const choiceCard = execPlan.choiceCard;
      if (choiceCard) {
        const choiceLines = choiceCard.choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
        const choiceContent = `${choiceCard.prompt}\n\n${choiceLines}`;
        const [assistantMessage] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: choiceContent,
          structuredData: JSON.stringify({ _type: "action_choice_card", ...choiceCard }),
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }));
        return;
      }
      break;
    } // end case "ACTION_CHOICE_CARD" (SSE)

    // ── SAFETY_REFUSAL (SSE path) ─────────────────────────────────────────────
    // Request would cause physical harm — return a safe redirect message.
    case "SAFETY_REFUSAL": {
      const refusalMessage = execPlan.safetyRefusal?.message ??
        "I can't design sessions intended to cause pain or injury. Let me know if you want to increase intensity safely.";
      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: refusalMessage,
        structuredData: JSON.stringify({ _type: "safety_refusal" }),
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "conversation_only" }));
      return;
    } // end case "SAFETY_REFUSAL" (SSE)

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
        const result = await upsertTrainingSystemFromProgram(userId, programToSave, undefined, params.data.id);
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

    const _saveProgramBaseContent = saveSuccess
      ? `Your program "${programToSave!.programName}" has been saved to your training system. You can access it anytime from the Program panel.`
      : programToSave
        ? `I wasn't able to save your program due to a system error. Your program hasn't been saved. Please try again in a moment.`
        : `There's no program ready to save yet. Once I've built your training program, you can ask me to save it and I'll add it to your system.`;
    const saveContent = (() => {
      if (!saveSuccess) return _saveProgramBaseContent;
      const _cl = buildConfidenceLine({
        hardConstraints: hardConstraintsSSE,
        equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
        safetyMode: _isSafetyTurn,
        verificationResult: null,
        actionType: "build",
      });
      return _cl ? `${_saveProgramBaseContent} ${_cl}` : _saveProgramBaseContent;
    })();

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
    const editLock = acquireFailSafeEditLock(`chat:${userId}:${streamFocusMode}`);
    if (!editLock.acquired) {
      const lockContent = "Updating your program now. Send the next change after this one finishes so the edits land in order.";
      const [lockMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id,
        role: "assistant",
        content: lockContent,
        structuredData: JSON.stringify({ _type: "fail_safe", category: "rapid_chained_edits", strategy: "queue_edit" }),
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      done(buildCompleteEvent({ userMsg: userMessage, assistantMsg: lockMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, systemEditVal: { applied: false }, outcomeTypeVal: "conversation_only" }));
      return;
    }
    let resolvedSystem: typeof activeSystem = activeSystem;
    let systemAutoCreatedForEdit = false;

    if (!resolvedSystem && latestStructuredProgram) {
      try {
        resolvedSystem = await createTrainingSystemFromProgram(userId, latestStructuredProgram, null, streamFocusMode);
        systemAutoCreatedForEdit = true;
        logger.info({ userId, systemId: resolvedSystem.id }, "[VibeEdit:stream] Auto-created system from chat program before edit");
        logger.info({ userId, systemId: resolvedSystem.id }, "[Auto Create For Edit] system created and client hydration fields returned (SSE path)");
        // Create initialization change log entry before the edit change log
        const _sseInitSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
        createChangeLogEntry({
          userId,
          trainingSystemId: resolvedSystem.id,
          source: "initialize",
          scope: "system",
          intent: "auto_created_for_edit",
          changeSummary: `Program initialized from conversation history: ${latestStructuredProgram.programName ?? "Unnamed Program"}`,
          requestText: parsed.data.content.slice(0, 300),
          beforeSnapshot: _sseInitSnapshot,
          afterSnapshot: _sseInitSnapshot,
          fullProgramSnapshot: latestStructuredProgram as unknown as Record<string, unknown>,
          appliedCount: 1,
          skippedCount: 0,
          versionOverrides: { isMajorVersion: true, versionLabel: "Initial Build" },
          decisionMetadata: { intentType: intentResult.type, autoCreatedForEdit: true },
        }).catch((initLogErr) => logger.warn({ initLogErr }, "[Auto Create For Edit:stream] Initialization change log write failed — non-fatal"));
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
      editLock.release();
      return;
    }

    // Declared outside the try block so the catch can inspect whether the DB
    // write succeeded even when subsequent response-generation steps throw.
    let changeLogId: number | null = null;

    try {
      // ── Stage: Planning ────────────────────────────────────────────────────
      emit(buildStageEvent("planning", intentResult.type, execPlan.action, _narrationCtx));

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
        editLock.release();
        return;
      }

      // ── 1.5 Hierarchical scope check — week or block scope bypasses session edit pipeline ─
      const _streamBtnScope = streamUIContext?.buttonPayload?.scope as string | undefined;
      const streamScopeResolution: ScopeResolution = (_streamBtnScope === "architecture" || _streamBtnScope === "block")
        ? (() => {
            const derivedBlockType = inferBlockTypeFromMessage(parsed.data.content) ?? undefined;
            logger.info(
              { message: parsed.data.content.slice(0, 80), btnScope: _streamBtnScope, derivedBlockType },
              "[ArchitectureChipFlow] buttonPayload.scope=architecture — overriding to block_scope"
            );
            return {
              scope: "block_scope" as const,
              confidence: "high" as const,
              derivedTransformation: derivedBlockType,
              reasoning: "buttonPayload.scope=block override from client chip",
            };
          })()
        : resolveRefinementScope(parsed.data.content);
      logger.info(
        {
          label: parsed.data.content.slice(0, 80),
          source: streamUIContext?.buttonPayload?.source ?? null,
          actionType: streamUIContext?.buttonPayload?.actionType ?? null,
          scope: _streamBtnScope ?? null,
          actualRoute: streamScopeResolution.scope,
          btnScopeOverride: _streamBtnScope === "architecture" || _streamBtnScope === "block",
        },
        "[ActionRoutingAudit]"
      );
      if (streamScopeResolution.scope !== "session_scope") {
        logger.info(
          { scope: streamScopeResolution.scope, systemId: resolvedSystem.id },
          "[HierarchicalRefine:stream] Routing to hierarchical engine"
        );
        emit(buildStageEvent("applying", intentResult.type, execPlan.action, _narrationCtx));
        const streamHierarchicalResult = await applyHierarchicalRefinement({
          systemId: resolvedSystem.id,
          userId,
          userMessage: effectiveMessage,
          scopeResolution: streamScopeResolution,
        });
        logger.info(
          {
            applied: streamHierarchicalResult.applied,
            blockType: streamScopeResolution.derivedTransformation ?? null,
            sessionCount: streamHierarchicalResult.sessionCount,
            exerciseCount: streamHierarchicalResult.exerciseCount,
            failureReason: (streamHierarchicalResult as any).failureReason ?? null,
          },
          "[ArchitectureChipFlow] Hierarchical engine result"
        );

        let streamHierarchicalContent: string;
        if (streamHierarchicalResult.applied) {
          const streamAllWeeks = streamFullSystem?.phases.flatMap((p) => p.weeks) ?? [];
          const streamCurrentWeek = streamAllWeeks.slice(-1)[0]?.weekNumber ?? 1;
          const streamHierarchicalImpact = await processHierarchicalImpact({
            userMessage: parsed.data.content,
            scopeResolution: streamScopeResolution,
            changeSummary: streamHierarchicalResult.changeSummary,
            sessionCount: streamHierarchicalResult.sessionCount,
            exerciseCount: streamHierarchicalResult.exerciseCount,
            fullSystem: streamFullSystem ?? { phases: [] },
            currentWeekNumber: streamCurrentWeek,
          });
          streamHierarchicalContent = streamHierarchicalImpact.coachResponse;
        } else {
          const _sfr = (streamHierarchicalResult as any).failureReason;
          if (_sfr === "system_not_found") {
            streamHierarchicalContent = "I need a structured training program to apply that change. Build a program first and I'll handle any adjustments you need.";
          } else {
            streamHierarchicalContent = `I wasn't able to shift the block right now — ${streamHierarchicalResult.changeSummary} Try a more specific request like "shift to strength" or "make this more explosive."`;
          }
        }

        const _streamHierarchicalCoachReasoning = streamHierarchicalResult.applied ? generateCoachReasoning({
          focusMode: streamFocusMode as FocusMode,
          actionType: "edit",
          intent: streamHierarchicalResult.changeSummary,
        }) : null;
        const [streamHierarchicalMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id,
          role: "assistant",
          content: streamHierarchicalContent,
          structuredData: streamHierarchicalResult.applied
            ? JSON.stringify({ _type: "system_edit", changeSummary: streamHierarchicalResult.changeSummary, systemId: resolvedSystem.id, coachReasoning: _streamHierarchicalCoachReasoning, changedIds: { exercises: [], sessions: [], weeks: [], phases: [] } })
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
            ? { applied: true, changeSummary: streamHierarchicalResult.changeSummary, systemId: resolvedSystem.id }
            : { applied: false },
        }));
        return;
      }

      // ── 2. Resolve target + interpret via DB edit pipeline ─────────────────
      emit(buildStageEvent("applying", intentResult.type, execPlan.action, _narrationCtx));

      const streamTarget = resolveTargetFromRequest(
        effectiveMessage,
        streamFullSystem,
        ((req.body as unknown as Record<string, unknown>)?.uiContext ?? null) as Record<string, unknown> | null
      );

      // ── 2.5 Deictic session reference guard ────────────────────────────────
      // "this day" / "this session" / "today" — user clearly means one session
      // but without a UIContext selectedSessionId we cannot tell which one.
      // Ask for clarification instead of silently mutating the whole program.
      // Note: check effectiveMessage (already context-resolved) to avoid double-asking.
      if (!streamTarget && hasDeiticSessionReference(effectiveMessage)) {
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

      // Stamp bannedItems onto system so autoSelectOpenEndedSwap and harder/easier
      // fallback can read user-excluded exercises without a signature change.
      if (hardConstraintsSSE.bannedItems.length > 0) {
        (streamFullSystem as any).bannedItems = hardConstraintsSSE.bannedItems;
      }

      // ── [MutationTrace] STEP 1+6 — direct vibe edit entry (SSE) ─────────────
      logger.info(
        {
          path:                "SSE:direct_vibe_edit",
          originalUserMessage: parsed.data.content.slice(0, 200),
          intentFamily:        execPlan.intentFamily ?? null,
          mutationType:        execPlan.mutation?.type ?? null,
          targetScope: {
            type:         execPlan.scope.type,
            dayIndex:     execPlan.scope.dayIndex ?? null,
            exerciseName: execPlan.scope.exerciseName ?? null,
          },
          resolvedTarget: streamTarget
            ? {
                resolvedSessionId:   (streamTarget as any).sessionId ?? null,
                resolvedSessionName: (streamTarget as any).sessionLabel ?? null,
                exerciseCountFound:  (streamTarget as any).exerciseCount ?? null,
              }
            : null,
          systemId: resolvedSystem.id,
          systemAutoCreated: systemAutoCreatedForEdit,
        },
        "[MutationTrace] ENTRY — direct vibe edit (SSE)",
      );

      const streamEditPlan = await interpretEditRequest(
        effectiveMessage,
        streamFullSystem,
        streamTarget,
        adaptationCtx || undefined,
        streamDecisionMemory?.decisionMemoryContext || undefined
      );

      logger.info(
        {
          intent:   streamEditPlan.intent,
          scope:    streamEditPlan.scope,
          changes:  streamEditPlan.changes.length,
          systemId: resolvedSystem.id,
          changeDetail: streamEditPlan.changes.map((c) => ({
            type:         c.type,
            id:           c.id ?? null,
            sessionId:    c.sessionId ?? null,
            exerciseName: c.exercise?.name ?? c.replacement?.name ?? null,
            updatesKeys:  c.updates ? Object.keys(c.updates) : null,
          })),
        },
        "[MutationTrace] STEP2 — interpretEditRequest complete (SSE)",
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
        const _noChangeOutcome = finalizeMutationOutcome({
          appliedCount: 0,
          changeLogId: null,
          changeTargets: [],
          responseText: noChangesContent,
          editFailureReason: "no_changes_produced",
          scope: streamEditPlan.scope ?? undefined,
          mutationType: execPlan.mutation?.type ?? undefined,
          intentFamily: execPlan.intentFamily ?? undefined,
        });
        const [noChangesMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: noChangesContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done({
          ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: noChangesMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure", mutationOutcomeVal: _noChangeOutcome }),
          systemEdit: { applied: false },
          editFailure: { reason: "no_changes_produced" },
          mutationOutcome: _noChangeOutcome,
        });
        return;
      }

      // ── 4. Handle failed verification ──────────────────────────────────────
      emit(buildStageEvent("validating", intentResult.type, execPlan.action, _narrationCtx));
      const streamVerification = streamEditResult.verification;

      // Guard: only treat verification failure as a user-facing error when NOTHING
      // was written to the DB. If appliedCount > 0 the change is already persisted —
      // skip the failure branch and continue to createChangeLogEntry + success path.
      if (streamVerification.status === "failed" && streamEditResult.appliedCount === 0) {
        const failedContent = `I tried applying that change but it didn't land cleanly. Could you give me a bit more direction — the specific exercise name, which day it's in, or exactly what you'd like to change?`;
        const _verifyFailOutcome = finalizeMutationOutcome({
          appliedCount: 0,
          changeLogId: null,
          changeTargets: [],
          responseText: failedContent,
          reasonCategory: "VERIFICATION_FAILED",
          scope: streamEditPlan.scope ?? undefined,
          mutationType: execPlan.mutation?.type ?? undefined,
          intentFamily: execPlan.intentFamily ?? undefined,
        });
        const [failedMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: failedContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done({
          ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: failedMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure", mutationOutcomeVal: _verifyFailOutcome }),
          systemEdit: { applied: false },
          editFailure: { reason: "verification_failed" },
          mutationOutcome: _verifyFailOutcome,
        });
        return;
      }

      // ── 5. Log the change ──────────────────────────────────────────────────
      const streamWhyParts = streamEditPlan.changes.map((c) => c.reason).filter((r): r is string => !!r);
      const streamWhyChanged = streamWhyParts.length > 0 ? streamWhyParts.join("; ") : undefined;
      const streamIsStructural = streamEditPlan.scope === "system" || streamEditPlan.scope === "block";

      // ── Swap contract — built before createChangeLogEntry so confirmed is persisted ──
      // The frontend badge reads decisionMetadata.confirmed === true (strict boolean).
      // Building here from the DB after-snapshot guarantees it reflects actual DB state.
      const _streamSwapChangeTarget = streamEditResult.changeTargets.find((t) => t.type === "exercise_swap");
      const _streamSwapPlanChange = streamEditPlan.changes.find((c) => c.type === "replace_exercise");
      let streamSwapContract: {
        actionType: "replace_exercise";
        confirmed: boolean;
        originalExercise: string | null;
        replacementExercise: string | null;
        updatedExercise: Record<string, unknown> | null;
        changeEntry: Record<string, unknown> | null;
        invalidationKeys: string[];
      } | null = null;

      if (_streamSwapChangeTarget && _streamSwapPlanChange) {
        const _streamUpdatedEx = (streamEditResult.afterSnapshot?.exercises?.[String(_streamSwapPlanChange.id)] as Record<string, unknown> | undefined) ?? null;
        const _streamConfirmed = streamEditResult.appliedCount > 0 && !!_streamSwapChangeTarget.newExercise && !!_streamUpdatedEx;
        streamSwapContract = {
          actionType: "replace_exercise",
          confirmed: _streamConfirmed,
          originalExercise: _streamSwapChangeTarget.originalExercise ?? null,
          replacementExercise: _streamSwapChangeTarget.newExercise ?? null,
          updatedExercise: _streamUpdatedEx,
          changeEntry: null,
          invalidationKeys: ["training-system-week", "live-panel-week-ids", "week-view-select", "training-system-today", "training-system-active", "training-system-history"],
        };
        logger.info(
          { confirmed: _streamConfirmed, originalExercise: streamSwapContract.originalExercise, replacementExercise: streamSwapContract.replacementExercise },
          "[VibeEdit:stream] Swap contract built"
        );
      }

      // ── Post-mutation light architecture validation ─────────────────────────
      const _streamArchResult = validatePostMutationArchitectureLight({
        entitySessions: streamEditResult.afterSnapshot?.sessions as Record<string, Record<string, unknown>> | undefined,
        context: "SSE:direct_edit",
      });

      changeLogId = await createChangeLogEntry({
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
          confirmed: streamSwapContract?.confirmed ?? false,
          propagated: (streamEditResult.propagationSummary?.status ?? "local_only") !== "local_only",
          propagationStatus: streamEditResult.propagationSummary?.status === "propagated" ? "full"
            : streamEditResult.propagationSummary?.status === "partial" ? "partial"
            : "none",
          propagationCheckedCount: (streamEditResult.propagationSummary?.appliedWeeks?.length ?? 0) + (streamEditResult.propagationSummary?.skippedWeeks?.length ?? 0),
          propagationConfirmedCount: streamEditResult.propagationSummary?.appliedWeeks?.length ?? 0,
          propagationFailedCount: streamEditResult.propagationSummary?.skippedWeeks?.length ?? 0,
          architectureWarnings: _streamArchResult.warnings.length > 0 ? _streamArchResult.warnings : undefined,
          verification: {
            status: streamVerification.status,
            verifiedCount: streamVerification.verifiedChanges.length,
            missingCount: streamVerification.missingChanges.length,
            requiresReview: streamVerification.requiresReview ?? false,
          },
        },
      });

      // ── 6. Coaching response + persist message ─────────────────────────────
      const streamVibeBaseResponse = buildVibeEditCoachingResponse(streamEditResult);
      const streamAllWeeks = streamFullSystem?.phases.flatMap((p) => p.weeks) ?? [];
      const streamCurrentWeek = streamAllWeeks.slice(-1)[0]?.weekNumber ?? 1;
      const streamTargetNames = streamEditResult.changeTargets
        .flatMap((t) => [t.originalExercise, t.newExercise])
        .filter((n): n is string => !!n);
      // Wrap processSessionScopeImpact so a coaching-response failure never
      // converts a successful DB write into a user-facing error.
      let coachingContentRaw: string;
      try {
        const streamImpact = await processSessionScopeImpact({
          userMessage: parsed.data.content,
          scopeResolution: streamScopeResolution,
          editPlan: streamEditPlan,
          immediateChangeSummary: streamVibeBaseResponse,
          fullSystem: streamFullSystem ?? { phases: [] },
          currentWeekNumber: streamCurrentWeek,
          targetExerciseNames: streamTargetNames,
        });
        coachingContentRaw = streamImpact.coachResponse;
      } catch (impactErr: unknown) {
        logger.warn({ impactErr }, "[VibeEdit:stream] processSessionScopeImpact failed — using fallback coaching response");
        coachingContentRaw = streamVibeBaseResponse;
      }
      const _sseConfidenceLine = buildConfidenceLine({
        hardConstraints: hardConstraintsSSE,
        equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
        safetyMode: _isSafetyTurn,
        verificationResult: streamVerification,
        actionType: "mutation",
      });
      const coachingContent = _sseConfidenceLine
        ? `${coachingContentRaw} ${_sseConfidenceLine}`
        : coachingContentRaw;

      const systemEditData = {
        _type: "system_edit" as const,
        changeSummary: streamEditResult.changeSummary,
        changedIds: streamEditResult.changedIds,
        systemId: resolvedSystem.id,
        changeLogId,
        verificationStatus: streamVerification.status,
        coachReasoning: generateCoachReasoning({
          focusMode: streamFocusMode as FocusMode,
          actionType: "edit",
          intent: streamEditPlan.intent,
          scope: streamEditPlan.scope,
        }),
      };

      const [assistantMessage] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant",
        content: coachingContent, structuredData: JSON.stringify(systemEditData),
      }).returning();

      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }

      // ── Store conversation context for follow-up resolution ────────────────
      // Mutation reference: enables "do the same for Day 2", "undo that", etc.
      try {
        storeMutationReference(String(params.data.id), {
          mutationType: execPlan.mutation?.type ?? streamEditPlan.intent,
          intentFamily: execPlan.intentFamily ?? null,
          scope: streamEditPlan.scope ?? "exercise",
          affectedExerciseIds: streamEditResult.changedIds?.exercises ?? [],
          affectedSessionIds: streamEditResult.changedIds?.sessions ?? [],
          changeLogId: changeLogId ?? null,
          userRequest: parsed.data.content,
          changeSummary: streamEditResult.changeSummary,
        });
        // Exercise reference: enables "change that exercise", "swap it"
        inferExerciseReferenceFromMutation({
          conversationId: String(params.data.id),
          userRequest: parsed.data.content,
          changeTargets: streamEditResult.changeTargets ?? [],
          intentFamily: execPlan.intentFamily ?? null,
        });
        // Session reference: enables "make that day shorter", "apply to this session"
        if (streamTarget) {
          const _tgt = streamTarget as any;
          if (_tgt.sessionId) {
            inferSessionReferenceFromMutation({
              conversationId: String(params.data.id),
              sessionId: _tgt.sessionId ?? null,
              dayIndex: execPlan.scope.dayIndex ?? null,
              sessionLabel: _tgt.sessionLabel ?? (_tgt.dayIndex != null ? `Day ${_tgt.dayIndex + 1}` : "current session"),
              weekNumber: _tgt.weekNumber ?? null,
            });
          }
        }
      } catch (ctxErr) {
        logger.warn({ ctxErr }, "[ConversationContext] Failed to store references after direct edit — non-fatal");
      }

      const _sseSuccessOutcome = finalizeMutationOutcome({
        appliedCount: streamEditResult.appliedCount,
        changeLogId,
        changeTargets: streamEditResult.changeTargets ?? [],
        verificationStatus: streamVerification.status,
        responseText: coachingContent,
        scope: streamEditPlan.scope ?? undefined,
        mutationType: execPlan.mutation?.type ?? undefined,
        intentFamily: execPlan.intentFamily ?? undefined,
      });

      done({
        ...buildCompleteEvent({
          userMsg: userMessage, assistantMsg: assistantMessage, planInfoVal: planInfo,
          intentResultVal: intentResult, systemSavedVal: systemAutoCreatedForEdit,
          systemIdVal: systemAutoCreatedForEdit ? resolvedSystem.id : undefined,
          outcomeTypeVal: "mutation_applied",
          mutationOutcomeVal: _sseSuccessOutcome,
        }),
        ...(systemAutoCreatedForEdit ? { trainingSystemId: resolvedSystem.id } : {}),
        mutationOutcome: _sseSuccessOutcome,
        systemEdit: {
          applied: true,
          route: "direct_edit" as const,
          scope: (streamEditPlan.scope ?? "exercise") as "exercise" | "session" | "week" | "block" | "system",
          changedIds: streamEditResult.changedIds as unknown as string[],
          changeSummary: streamEditResult.changeSummary,
          changeTargets: streamEditResult.changeTargets,
          systemId: resolvedSystem.id,
          changeLogId,
          propagationStatus: streamEditResult.propagationSummary?.status === "propagated" ? "full"
            : streamEditResult.propagationSummary?.status === "partial" ? "partial"
            : "none",
          architectureWarnings: _streamArchResult.warnings.length > 0 ? _streamArchResult.warnings.map((w) => w.message) : undefined,
          verificationStatus: streamVerification.status as VerificationStatus,
          requiresReview: streamVerification.requiresReview ?? false,
        },
        structuredData: null,
        swapContract: streamSwapContract,
      });
      editLock.release();
      return;
    } catch (err: any) {
      logger.error({ err: err?.message, changeLogId }, "[VibeEdit:stream] DB pipeline threw — returning error response");

      // [MutationResponse] mismatch_detected guard:
      // If changeLogId is already set the DB write succeeded — a later step threw.
      // Return a success envelope so the frontend shows success and refetches.
      if (changeLogId !== null) {
        logger.warn(
          { changeLogId, err: err?.message },
          "[MutationResponse] mismatch_detected — DB write succeeded but response-generation threw (SSE); returning success envelope",
        );
        const fallbackContent = `Done — your program has been updated.`;
        const [successMsg] = await db.insert(messagesTable).values({
          conversationId: params.data.id, role: "assistant", content: fallbackContent, structuredData: null,
        }).returning();
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
        if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
          stripeStorage.incrementMessageCount(userId).catch(() => {});
        }
        done({
          ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: successMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "mutation_applied" }),
          systemEdit: { applied: true, changeLogId },
        });
        editLock.release();
        return;
      }

      // True failure — DB write never happened.
      const streamStructuralOp = execPlan.mutation?.type === "add"
        ? "add that exercise"
        : execPlan.mutation?.type === "remove"
          ? "remove that exercise"
          : execPlan.mutation?.type === "swap"
            ? "swap that exercise"
            : "apply that change";
      const errContent = `I wasn't able to ${streamStructuralOp} — your program hasn't been modified. Try being specific: include the exercise name, which day it's in, and exactly what you'd like changed. If it keeps happening, try opening the session panel and making the change from there.`;
      const streamReceipt = buildMutationFailureReceipt(err?.message ?? "edit_pipeline_error");
      const _catchFailOutcome = finalizeMutationOutcome({
        appliedCount: 0,
        changeLogId: null,
        changeTargets: [],
        responseText: errContent,
        editFailureReason: "edit_pipeline_error",
        mutationType: execPlan.mutation?.type ?? undefined,
        intentFamily: execPlan.intentFamily ?? undefined,
      });
      const [errMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: errContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
        stripeStorage.incrementMessageCount(userId).catch(() => {});
      }
      done({
        ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: errMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure", mutationOutcomeVal: _catchFailOutcome }),
        systemEdit: { applied: false },
        editFailure: { reason: "edit_pipeline_error" },
        mutationReceipt: streamReceipt,
        mutationOutcome: _catchFailOutcome,
      });
      editLock.release();
      return;
    }
  }

  // ── Routing Reconciliation Guard (SSE path) ───────────────────────────────
  // Same rule as non-SSE: if intent says mutation but execPlan says GUIDANCE/NO_OP,
  // block the AI call and return a safe clarification. Never generate a new program.
  {
    const _isMutationIntentSSE =
      intentResult.type === "EDIT_PROGRAM" ||
      intentResult.type === "ADJUST_FOR_PAIN" ||
      intentResult.type === "ADJUST_FOR_READINESS";
    const _isNonMutationPlanSSE =
      execPlan.action === "GUIDANCE" ||
      execPlan.action === "NO_OP";
    if (_isMutationIntentSSE && _isNonMutationPlanSSE) {
      logger.warn(
        { intentType: intentResult.type, execPlanAction: execPlan.action, intentFamily: execPlan.intentFamily },
        "[Routing Reconciliation] intent/edit mismatch blocked AI fallback (SSE path)"
      );
      const _sseReconcilContent = `I need one more detail before changing your program. Could you clarify which part you'd like to adjust — the exercise, day, or overall structure?`;
      const [_sseReconcilMsg] = await db.insert(messagesTable).values({
        conversationId: params.data.id, role: "assistant", content: _sseReconcilContent, structuredData: null,
      }).returning();
      await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
      if (planInfo?.plan === "free" || planInfo?.plan === "starter") { stripeStorage.incrementMessageCount(userId).catch(() => {}); }
      done({
        ...buildCompleteEvent({ userMsg: userMessage, assistantMsg: _sseReconcilMsg, planInfoVal: planInfo, intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "clarification_needed" }),
        systemEdit: { applied: false, route: "clarification_followup", scope: "system", changedIds: [] },
        structuredData: null,
        actionDebug: { planAction: execPlan.action, reconciliationBlocked: true },
      });
      return;
    }
  }

  // ── Standard AI Response Path ─────────────────────────────────────────────
  // Stage 4: Plan Modifications — determine scope and pre-transform if needed
  emit(buildStageEvent("planning", intentResult.type, execPlan.action, _narrationCtx));

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
  // Prepend contract directive so it governs the AI layer in the streaming path.
  // Prepend persisted hard constraints so they are enforced absolutely.
  let transformHint: string | null = contractDirectiveSSE || null;
  if (constraintDirectiveSSE2) {
    transformHint = transformHint
      ? `${constraintDirectiveSSE2}\n\n${transformHint}`
      : constraintDirectiveSSE2;
  }

  // Sync clarification outcome to SSE turnOutcome
  if (execPlan.action === "ASK_CLARIFICATION") {
    turnOutcomeSSE.clarificationAsked = true;
  }

  // Persist constraint signals from this turn (fire-and-forget — non-fatal)
  if (execPlan.intentFamily) {
    persistConstraintsFromTurn(userId, parsed.data.content, execPlan.intentFamily).catch((err: unknown) => {
      logger.warn({ err }, "[ConstraintMemory] persistConstraintsFromTurn failed — non-fatal");
    });
  }

  if (execPlan.action === "REBUILD_PROGRAM" && currentProgram) {
    const meta = intentResult.metadata as { targetSplit?: string; targetDays?: number | null; targetGoalShift?: string | null } | undefined;
    const transformType = resolveTransformType(meta?.targetSplit ?? "unknown", meta?.targetDays ?? null, meta?.targetGoalShift ?? null, currentProgram.days.length);
    const transformRequest: TransformRequest = { type: transformType, targetDays: meta?.targetDays ?? currentProgram.days.length, rawRequest: parsed.data.content };
    try {
      const result = transformProgram(currentProgram, transformRequest);
      preTransformedProgram = result.program;
      const splitHintSSE = buildTransformPromptHint(result.log);
      transformHint = transformHint ? `${transformHint}\n\n${splitHintSSE}` : splitHintSSE;
    } catch (err) {
      logger.error({ err }, "[ConversationRouter:stream] Split transform failed — falling back to AI-only");
    }
  }

  // ── Constraint reinforcement shortcut (SSE) ──────────────────────────────
  if (execPlan.constraintReinforcement) {
    transformHint = execPlan.constraintReinforcement.promptDirective;
    logger.info(
      {
        constraintLabel: execPlan.constraintReinforcement.constraintLabel,
        alreadyPersisted: execPlan.constraintReinforcement.alreadyPersisted,
      },
      "[ConstraintReinforcement:SSE] Injecting reinforcement directive — no mutation will run"
    );
  }

  // ── Clarification loop guard ───────────────────────────────────────────────
  // If the last ≥ 3 assistant messages are all conversation_only (no structuredData),
  // inject a "take decisive action" nudge so the AI breaks the clarification cycle.
  {
    const _recentAsstMsgs = await db
      .select({ structuredData: messagesTable.structuredData })
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, params.data.id), eq(messagesTable.role, "assistant")))
      .orderBy(desc(messagesTable.createdAt))
      .limit(6)
      .catch(() => [] as Array<{ structuredData: string | null }>);
    const _convOnlyCount = _recentAsstMsgs.filter((m) => !m.structuredData).length;
    if (_convOnlyCount >= 3) {
      const _loopNote = `\n\n## CLARIFICATION LOOP PREVENTION\nThe assistant has responded ${_convOnlyCount} consecutive times without producing an actionable output. The user may be growing frustrated. You MUST take a decisive action this turn: either build a program, apply a mutation, or give concrete specific guidance. Do NOT ask another clarifying question unless the request is genuinely unsafe to proceed without clarification.`;
      transformHint = transformHint ? `${transformHint}${_loopNote}` : _loopNote.trim();
      logger.warn(
        { conversationId: params.data.id, _convOnlyCount },
        "[LoopGuard:SSE] Clarification loop detected — injecting force-action prompt nudge"
      );
    }
  }

  // Stage 5: Apply Changes — AI generates the program (this is the longest stage)
  emit(buildStageEvent("applying", intentResult.type, execPlan.action, _narrationCtx));

  // For new program builds (or explicit fresh-build sessions), do NOT pass the old
  // uiContext to the AI. The buildUIContextSection would otherwise inject the old
  // program's name (e.g. "Active program: 'Program A'") into the system prompt,
  // causing the AI to anchor on the previous build instead of starting clean.
  const isNewBuildIntent =
    intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM";
  const safeUIContext = (isFreshBuildSession || isNewBuildIntent) ? null : streamUIContext;

  _t_ai_start = Date.now();

  // ── Rate-limit / API failure safety wrapper ────────────────────────────────
  // If OpenAI throws (e.g. 429 after retries, 5xx, network drop), we return a
  // graceful user-facing message instead of crashing the SSE stream.
  let aiContent: string;
  let structuredData: any;
  try {
    const _sseAiResult = await generateAIResponse(
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
        execPlanAction: execPlan.action,
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
        focusMode: streamFocusMode,
        failSafeResolution,
        hardConstraints: hardConstraintsSSE,
      }
    );
    aiContent = _sseAiResult.content;
    structuredData = _sseAiResult.structuredData;
  } catch (aiErrSSE: any) {
    const is429 = /429|rate.?limit/i.test(String(aiErrSSE?.message ?? ""));
    const sseErrContent = is429
      ? "I'm experiencing high demand right now — please try again in a moment. Your program hasn't been changed."
      : "Something went wrong on my end while generating your response. Please try again — your program is unchanged.";
    logger.error(
      { aiErr: aiErrSSE?.message, is429 },
      "[SSE/AIFallback] generateAIResponse threw — returning graceful error to client"
    );
    const [sseErrMsg] = await db.insert(messagesTable).values({
      conversationId: params.data.id, role: "assistant", content: sseErrContent, structuredData: null,
    }).returning();
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
    if (planInfo?.plan === "free" || planInfo?.plan === "starter") {
      stripeStorage.incrementMessageCount(userId).catch(() => {});
    }
    done(buildCompleteEvent({
      userMsg: userMessage, assistantMsg: sseErrMsg, planInfoVal: planInfo,
      intentResultVal: intentResult, systemSavedVal: false, outcomeTypeVal: "true_failure",
    }));
    return;
  }

  // ── HARD GUARD: Block build templates for edit/refinement and program-question intents ─
  structuredData = attachFailSafeMetadata(structuredData as any, failSafeResolution) as any;
  if (structuredData && failSafeResolution.triggered) {
    aiContent = prependFailSafeMessage(aiContent, failSafeResolution);
  }

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
          // FIX 6: No false-success copy — tell the truth that nothing was changed yet
          aiContent = `I didn't change your program yet. Tell me exactly what you want adjusted and I'll apply it directly.`;
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
          hardConstraints: hardConstraintsSSE,
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

  // ── Hard constraint validation against persisted memory ───────────────────
  if (structuredData) {
    const hardViolations = validateAgainstHardConstraints(structuredData, hardConstraintsSSE);
    if (hardViolations.length > 0) {
      logger.warn(
        { violations: hardViolations.map((v) => ({ exercise: v.exerciseName, type: v.violationType, constraint: v.matchedConstraint })) },
        "[ConstraintMemory] Hard constraint violations detected in SSE-generated program"
      );
    }
  }

  _t_ai_end = Date.now();
  // Stage 6: Validate — AI response quality checks done; now persist
  emit(buildStageEvent("validating", intentResult.type, execPlan.action, _narrationCtx));

  // ── Enrich structuredData with build metadata for all program builds ────────
  // Attach _buildMeta for initial builds AND for rebuilds from scratch so the UI
  // always renders a BuildSummaryCard after any full program generation.
  const isInitialBuild =
    structuredData != null &&
    (intentResult.type === "CREATE_PROGRAM" ||
     intentResult.type === "START_NEW_PROGRAM" ||
     intentResult.type === "STRUCTURAL_REBUILD");

  if (isInitialBuild && structuredData) {
    const _sseBuildFocusMode = goalToFocusMode(extractedConstraints?.primaryGoal) as FocusMode;
    const _sseBuildCoachReasoning = generateCoachReasoning({
      focusMode: _sseBuildFocusMode,
      actionType: "build",
      goal: extractedConstraints?.primaryGoal ?? undefined,
      frequency: structuredData.days.length,
    });
    const _sseMicroReasonResult = buildMicroReasons({
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      equipmentProfile: extractedConstraints?.equipmentLevel ?? null,
      hardConstraints: hardConstraintsSSE,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[MicroReasoningAudit]", JSON.stringify({
        path: "sse_build",
        safeToShow: _sseMicroReasonResult.safeToShow,
        reasons: _sseMicroReasonResult.reasons,
        evidence: _sseMicroReasonResult.evidence,
      }));
    }
    (structuredData as unknown as Record<string, unknown>)._buildMeta = {
      frequency: structuredData.days.length,
      goal: extractedConstraints?.primaryGoal ?? null,
      sport: extractedConstraints?.sportFocus ?? null,
      sessionDuration: extractedConstraints?.sessionDuration ?? null,
      _coachReasoning: _sseBuildCoachReasoning,
      _microReasons: _sseMicroReasonResult.safeToShow ? _sseMicroReasonResult.reasons : [],
    };
  }

  // Stage 7: Save Program State
  emit(buildStageEvent("saving", intentResult.type, execPlan.action, _narrationCtx));
  _t_db_start = Date.now();

  const [assistantMessage] = await db.insert(messagesTable).values({
    conversationId: params.data.id, role: "assistant", content: aiContent,
    structuredData: structuredData ? JSON.stringify(structuredData) : null,
  }).returning();

  await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, params.data.id));
  _t_db_end = Date.now();

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
        savedSystem = await createTrainingSystemFromProgram(userId, structuredData, params.data.id, streamFocusMode);
        isUpdate = false;
      } else {
        const result = await upsertTrainingSystemFromProgram(userId, structuredData, streamFocusMode, params.data.id);
        savedSystem = result.system;
        isUpdate = result.isUpdate;
      }
      systemSaved = true;
      autoSavedSystemId = savedSystem.id;

      // ── Action Contract TurnOutcome tracking (SSE path) ─────────────────────
      if (isNewProgramBuildSSE) {
        turnOutcomeSSE.programRebuilt = true;
        // P0-5: fire first-build retention email (idempotent, non-blocking)
        fireFirstBuildEmail(userId).catch(() => {});
      } else {
        turnOutcomeSSE.mutationApplied = true;
        turnOutcomeSSE.verificationStatus = "verified";
      }

      if (streamFocusMode === "speed" || streamFocusMode === "mobility") {
        logger.info(
          {
            userId,
            systemId: savedSystem.id,
            focusMode: streamFocusMode,
            programName: structuredData.programName,
            dayCount: structuredData.days?.length ?? 0,
            programSaved: true,
          },
          "[SpeedBuildCompletionAudit] Build completed successfully — program saved to DB (stream path)"
        );
      }

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

  // ── Final Response Alignment Verification ─────────────────────────────────
  // Checks consistency between narration context, action contract, mutation
  // outcome, final program payload, and assistant message text.
  // On mismatch: attempt one repair; on failure: return transparent failure.
  let _alignedAssistantMsg = assistantMessage;
  try {
    const _alignResult = verifyResponseAlignment({
      action: execPlan.action,
      intentType: intentResult.type,
      narrationCtx: _narrationCtx,
      aiContent: assistantMessage.content,
      structuredData: structuredData ?? null,
      systemSaved,
      outcomeType: systemSaved ? "mutation_applied" : "conversation_only",
      mutationApplied: turnOutcomeSSE.mutationApplied,
      extractedConstraints: extractedConstraints
        ? { daysPerWeek: extractedConstraints.daysPerWeek }
        : null,
      hardConstraints: hardConstraintsSSE,
    });

    if (!_alignResult.passed) {
      logger.warn(
        {
          issues: _alignResult.issues.map((i) => ({ type: i.type, severity: i.severity, detail: i.detail })),
          intentType: intentResult.type,
          action: execPlan.action,
          systemSaved,
        },
        "[ResponseAlignment] Alignment mismatch detected before final SSE event"
      );

      if (_alignResult.repairedContent) {
        logger.info(
          { repairPreview: _alignResult.repairedContent.slice(0, 120) },
          "[ResponseAlignment] Applying repair — updating persisted message"
        );
        await db
          .update(messagesTable)
          .set({ content: _alignResult.repairedContent })
          .where(eq(messagesTable.id, assistantMessage.id))
          .catch((repairErr: unknown) => {
            logger.warn({ repairErr }, "[ResponseAlignment] DB repair update failed — non-fatal");
          });
        _alignedAssistantMsg = { ...assistantMessage, content: _alignResult.repairedContent };
      }

      if (_alignResult.structuredDataRepair === "clear") {
        logger.info(
          "[ResponseAlignment] Suppressing structuredData — guidance_program_leak detected"
        );
        _alignedAssistantMsg = { ..._alignedAssistantMsg, structuredData: null };
      }
    }
  } catch (alignErr: unknown) {
    // Verification mismatch fallback: if the verifier itself throws, the response
    // is still valid — log and continue so the client always gets its complete event.
    logger.warn({ alignErr }, "[ResponseAlignment] verifyResponseAlignment threw — skipping alignment repair, response unaffected");
  }

  // ── Pipeline Latency Audit ────────────────────────────────────────────────
  const _pipeline_total = Date.now() - _pipeline_t0;
  logger.info(
    {
      totalMs: _pipeline_total,
      setupMs: _t_intent_done > 0 ? _t_intent_done - _pipeline_t0 : null,
      aiCallMs: (_t_ai_start > 0 && _t_ai_end > 0) ? _t_ai_end - _t_ai_start : null,
      dbSaveMs: (_t_db_start > 0 && _t_db_end > 0) ? _t_db_end - _t_db_start : null,
      postAiMs: (_t_ai_end > 0 && _t_db_start > 0) ? _t_db_start - _t_ai_end : null,
      intentType: intentResult.type,
      isBuildIntent: intentResult.type === "CREATE_PROGRAM" || intentResult.type === "START_NEW_PROGRAM",
      focusMode: streamFocusMode,
    },
    "[PipelineLatencyAudit] SSE request completed"
  );

  // ── Action Contract Enforcement (SSE path) ────────────────────────────────
  let auditReceiptSSE = null;
  if (actionContractSSE) {
    try {
      auditReceiptSSE = enforceActionContract(actionContractSSE, turnOutcomeSSE);
    } catch (enforceErrSSE) {
      logger.warn({ enforceErrSSE }, "[ActionContract/SSE] Enforcer failed — non-fatal");
    }
  }

  done(buildCompleteEvent({
    userMsg: userMessage, assistantMsg: _alignedAssistantMsg, planInfoVal: planInfo,
    intentResultVal: intentResult, systemSavedVal: systemSaved, systemIdVal: autoSavedSystemId,
    changeLogIdVal: changeLogId,
    outcomeTypeVal: systemSaved ? "mutation_applied" : "conversation_only",
    auditReceiptVal: auditReceiptSSE,
  }));
});

export default router;

