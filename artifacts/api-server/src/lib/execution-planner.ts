// ======================================================
// TRAINCHAT EXECUTION PLANNER (CORE AGENT LAYER)
// ======================================================
//
// Centralized execution planner that determines EXACTLY how
// every user message is handled.
//
// Replaces fragmented routing (intent.ts / decision.ts chaos)
// with a single brain that:
//
// 1. Understands user intent (via the intent family system)
// 2. Reads current program + system state
// 3. Determines EXACT action (mutate, ask, rebuild, guide)
// 4. Routes to the correct execution path
//
// ======================================================

import {
  normalizeToIntentFamily,
  getTransformationBundle,
  buildIntentFamilyPromptDirective,
  type IntentFamily,
  type IntentFamilyResult,
} from "./intent-family-engine";
import { classifyAdjustmentIntent, type AdjustmentIntentClassification } from "./adjustment-intent-classifier";
import { type ProgramStructure } from "./ai";
import { logger } from "./logger";
import type { FocusMode } from "./focus-engines/engine-interface";
import {
  isConstraintAlreadySatisfied,
  isConstraintAlreadyPersisted,
  buildConstraintReinforcementDirective,
  type HardConstraints,
} from "./constraint-memory";

// ─── Execution Action Types ───────────────────────────────────────────────────

export type ExecutionAction =
  | "APPLY_MUTATION"
  | "ASK_CLARIFICATION"
  | "GUIDANCE"
  | "REBUILD_PROGRAM"
  | "NO_OP";

// ─── Scope ───────────────────────────────────────────────────────────────────

export interface ExecutionScope {
  type: "exercise" | "session" | "program" | null;
  dayIndex?: number;
  exerciseName?: string;
}

// ─── Mutation Descriptor ──────────────────────────────────────────────────────

export interface ExecutionMutation {
  type: "swap" | "transform" | "add" | "remove" | "progression" | "regression";
  params: Record<string, unknown>;
}

// ─── Clarification Descriptor ─────────────────────────────────────────────────

export interface ExecutionClarification {
  question: string;
  pendingAspect: "scope" | "target_day" | "exercise";
}

// ─── Execution Plan ───────────────────────────────────────────────────────────

export interface ExecutionPlan {
  action: ExecutionAction;
  intentFamily: IntentFamily | null;
  scope: ExecutionScope;
  mutation?: ExecutionMutation;
  clarification?: ExecutionClarification;
  reasoning: string;
  /**
   * Present when the execution planner short-circuited an equipment or dislike
   * constraint that is already satisfied by the active program.  The route handler
   * must inject `transformHint` derived from buildConstraintReinforcementDirective()
   * instead of running a mutation.
   */
  constraintReinforcement?: {
    constraintLabel: string;
    alreadyPersisted: boolean;
    intentFamily: IntentFamily;
    promptDirective: string;
  };
}

// ─── Pending Clarification Shape ──────────────────────────────────────────────
//
// Minimal interface that matches what getActivePendingClarification() returns
// from the DB record — only the fields the planner actually needs.

export interface PendingClarificationContext {
  intentFamily: string;
  pendingAspect: string;
  originalRequest: string;
  clarificationQuestion: string;
}

// ─── Vague Improvement Patterns ───────────────────────────────────────────────
// These phrases are intentionally direction-free and must NEVER trigger
// REBUILD_PROGRAM. They always ask a clarifying question regardless of whether
// an active program exists.
const VAGUE_IMPROVEMENT_PATTERNS: RegExp[] = [
  /\bmake (it|this|the program|my program|things?) better\b/i,
  /\bimprove (it|this|the program|my program)\b/i,
  /\boptimi[sz]e (it|this|the program|my program)\b/i,
  /\bmake (it|this) more effective\b/i,
  /\bupgrade (it|this|the program|my program)\b/i,
  /\bmake (it|this) good(er)?\b/i,
  /\bjust make it better\b/i,
];

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function buildExecutionPlan({
  message,
  userId,
  conversationId,
  program,
  pendingClarification,
  uiContext,
  focusMode,
  hardConstraints,
}: {
  message: string;
  userId: string;
  conversationId: string;
  program: ProgramStructure | null;
  pendingClarification: PendingClarificationContext | null;
  uiContext?: Record<string, unknown> | null;
  focusMode?: FocusMode;
  hardConstraints?: HardConstraints;
}): Promise<ExecutionPlan> {
  // ── STEP 0: Button signal override ─────────────────────────────────────────
  // Right-panel buttons send an explicit button signal via uiContext.
  // These are DETERMINISTIC CONTROLS — they must NEVER route to ASK_CLARIFICATION.
  // The button signal overrides all text-based intent classification AND pending
  // clarification resolution — buttons act, they never ask.
  const buttonSignal = uiContext?.button as string | undefined;

  if (buttonSignal === "day_progression" || buttonSignal === "day_regression") {
    const scope = resolveScope(message);
    const resolvedScope: ExecutionScope = scope.type === "session"
      ? scope
      : { type: "session", dayIndex: scope.dayIndex };

    const plan: ExecutionPlan = {
      action: "APPLY_MUTATION",
      intentFamily: buttonSignal as IntentFamily,
      scope: resolvedScope,
      mutation: {
        type: buttonSignal === "day_progression" ? "progression" : "regression",
        params: { dayLevel: true, preserveIdentity: true },
      },
      reasoning: `Button-driven ${buttonSignal} — forced APPLY_MUTATION without clarification. Session identity preserved.`,
    };

    logger.debug(
      {
        conversationId,
        userId,
        action: plan.action,
        intentFamily: plan.intentFamily,
        scope: plan.scope,
        buttonSignal,
      },
      "[ExecutionPlanner] Button override — day-level progression/regression forced"
    );

    return plan;
  }

  if (buttonSignal === "add_exercise") {
    // Prefer the dayIndex supplied by the UI button (0-based) over text extraction,
    // then fall back to the text-parsed day number.
    const dayIndexFromUi = typeof uiContext?.dayIndex === "number" ? (uiContext.dayIndex as number) : undefined;
    const textScope = resolveScope(message);
    const resolvedDayIndex = dayIndexFromUi ?? textScope.dayIndex;

    const plan: ExecutionPlan = {
      action: "APPLY_MUTATION",
      intentFamily: "add_exercise",
      scope: { type: "session", dayIndex: resolvedDayIndex },
      mutation: {
        type: "add",
        params: {
          strict: true,
          forceExerciseRow: true,
          allowFallbackSlot: true,
          dayIndex: resolvedDayIndex,
        },
      },
      reasoning: "Button-driven add_exercise — forced APPLY_MUTATION. One real canonical exercise row must be inserted into the target day.",
    };

    logger.debug(
      {
        conversationId,
        userId,
        action: plan.action,
        intentFamily: plan.intentFamily,
        scope: plan.scope,
        buttonSignal,
        dayIndexFromUi,
        resolvedDayIndex,
        message,
      },
      "[AddExerciseButtonFlow] Button override — add_exercise forced to APPLY_MUTATION"
    );

    return plan;
  }

  // ── STEP 1: Handle clarification followup first ─────────────────────────────
  if (pendingClarification) {
    const plan = resolveClarification({ message, pendingClarification });

    logger.debug(
      {
        conversationId,
        userId,
        action: plan.action,
        intentFamily: plan.intentFamily,
        scope: plan.scope,
        reasoning: plan.reasoning,
      },
      "[ExecutionPlanner] Resolved from pending clarification"
    );

    return plan;
  }

  // ── STEP 2: Resolve intent family ──────────────────────────────────────────
  const intentResult = normalizeToIntentFamily(message, focusMode);
  const intent = intentResult.family;

  // ── STEP 3: Resolve target scope ──────────────────────────────────────────
  const scope = resolveScope(message);

  // ── STEP 3.5: Satisfied-constraint shortcut ───────────────────────────────
  // When the user restates a constraint that the active program already honors
  // (the banned/disliked item is absent from every exercise slot), skip any
  // mutation path and return a memory-reinforcement GUIDANCE plan instead.
  if (
    program &&
    hardConstraints &&
    (intent === "equipment_constraint" || intent === "exercise_dislike_or_preference")
  ) {
    try {
      const adjClass = classifyAdjustmentIntent(message, focusMode);
      const constraintLabel =
        adjClass.extractedEntities.targetEquipment ??
        adjClass.extractedEntities.targetExercise ??
        null;

      if (constraintLabel) {
        const satisfied = isConstraintAlreadySatisfied({ constraintLabel, activeProgram: program });
        if (satisfied) {
          const alreadyPersisted = isConstraintAlreadyPersisted({ constraintLabel, hardConstraints });
          const promptDirective = buildConstraintReinforcementDirective({
            constraintLabel,
            alreadyPersisted,
            intentFamily: intent,
          });

          const reinforcementPlan: ExecutionPlan = {
            action: "GUIDANCE",
            intentFamily: intent,
            scope,
            reasoning: `Constraint "${constraintLabel}" already satisfied by active program — returning memory-reinforcement GUIDANCE without mutation`,
            constraintReinforcement: {
              constraintLabel,
              alreadyPersisted,
              intentFamily: intent,
              promptDirective,
            },
          };

          logger.info(
            { conversationId, userId, constraintLabel, alreadyPersisted, intent },
            "[ConstraintReinforcement] Constraint already satisfied — skipping mutation, sending acknowledgment"
          );

          return reinforcementPlan;
        }
      }
    } catch (err) {
      // If classification fails, fall through to normal mutation path
      logger.warn({ err, intent }, "[ConstraintReinforcement] classifyAdjustmentIntent failed — falling through to mutation path");
    }
  }

  // ── STEP 3.6: Vague improvement short-circuit ─────────────────────────────
  // "make it better" / "improve it" / "optimize it" — these are direction-free.
  // They must NEVER trigger REBUILD_PROGRAM or a silent mutation.
  // Always route to ASK_CLARIFICATION regardless of program state.
  const isVagueImprovement = VAGUE_IMPROVEMENT_PATTERNS.some((re) => re.test(message));
  if (isVagueImprovement) {
    const question = program
      ? "What would you like to improve — strength, endurance, explosiveness, recovery, session length, or a specific day?"
      : "What would you like me to build or improve? For example: strength, speed, mobility, endurance, or recovery.";

    const vagueplan: ExecutionPlan = {
      action: "ASK_CLARIFICATION",
      intentFamily: "clarification_required",
      scope,
      clarification: {
        question,
        pendingAspect: "scope",
      },
      reasoning: "Vague improvement phrase — direction unclear, must clarify before any mutation or rebuild",
    };

    logger.info(
      { conversationId, userId, message: message.slice(0, 80), hasProgram: !!program },
      "[VagueImprovementGuard] Blocked generic improvement phrase → ASK_CLARIFICATION"
    );

    return vagueplan;
  }

  // ── STEP 4: Decision tree ─────────────────────────────────────────────────
  let plan: ExecutionPlan;

  // ── Exercise swap ────────────────────────────────────────────────────────
  if (intent === "exercise_swap") {
    const exerciseName = extractExerciseName(message);

    if (!exerciseName) {
      plan = {
        action: "ASK_CLARIFICATION",
        intentFamily: intent,
        scope,
        clarification: {
          question: "Which exercise do you want to swap?",
          pendingAspect: "exercise",
        },
        reasoning: "Swap intent detected but no specific exercise named",
      };
    } else {
      plan = {
        action: "APPLY_MUTATION",
        intentFamily: intent,
        scope: { ...scope, exerciseName },
        mutation: {
          type: "swap",
          params: { targetExercise: exerciseName },
        },
        reasoning: "Valid swap request with named exercise",
      };
    }
  }

  // ── Endurance transformation ──────────────────────────────────────────────
  else if (intent === "endurance_focus") {
    if (!scope.type) {
      plan = {
        action: "ASK_CLARIFICATION",
        intentFamily: intent,
        scope,
        clarification: {
          question: "Should this apply to a specific day or the whole program?",
          pendingAspect: "scope",
        },
        reasoning: "Endurance intent needs scope before applying transformation",
      };
    } else {
      plan = {
        action: "APPLY_MUTATION",
        intentFamily: intent,
        scope,
        mutation: {
          type: "transform",
          params: { transformation: "endurance" },
        },
        reasoning: "Endurance transformation with resolved scope",
      };
    }
  }

  // ── Day-level progression (text-matched, no button override needed) ─────────
  else if (intent === "day_progression") {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: scope.type ? scope : { type: "session" },
      mutation: {
        type: "progression",
        params: { dayLevel: true, preserveIdentity: true },
      },
      reasoning: "Day-level progression — same identity, harder execution. Never clarify.",
    };
  }

  // ── Day-level regression (text-matched, no button override needed) ─────────
  else if (intent === "day_regression") {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: scope.type ? scope : { type: "session" },
      mutation: {
        type: "regression",
        params: { dayLevel: true, preserveIdentity: true },
      },
      reasoning: "Day-level regression — same identity, easier execution. Never clarify.",
    };
  }

  // ── Exercise progression ──────────────────────────────────────────────────
  else if (intent === "exercise_progression") {
    const exerciseName = extractExerciseName(message);
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: exerciseName ? { type: "exercise", exerciseName } : scope,
      mutation: {
        type: "progression",
        params: {
          category: inferExerciseCategory(message),
          ...(exerciseName ? { targetExercise: exerciseName } : {}),
        },
      },
      reasoning: exerciseName
        ? `Exercise progression for named exercise: ${exerciseName}`
        : "Exercise progression flow",
    };
  }

  // ── Exercise regression ───────────────────────────────────────────────────
  else if (intent === "exercise_regression") {
    const exerciseName = extractExerciseName(message);
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: exerciseName ? { type: "exercise", exerciseName } : scope,
      mutation: {
        type: "regression",
        params: {
          category: inferExerciseCategory(message),
          ...(exerciseName ? { targetExercise: exerciseName } : {}),
        },
      },
      reasoning: exerciseName
        ? `Exercise regression for named exercise: ${exerciseName}`
        : "Exercise regression flow",
    };
  }

  // ── Strict single-exercise insertion (right panel "Add Exercise" button) ─
  else if (intent === "add_exercise") {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope,
      mutation: {
        type: "add",
        params: {
          category: inferExerciseCategory(message),
          strict: true,         // signals AI: produce exactly one add_exercise change
          forceExerciseRow: true,
        },
      },
      reasoning: "Strict add-exercise flow — one new exercise row must be inserted",
    };
  }

  // ── Bulk session sets adjustment (deterministic — no AI needed) ──────────
  // "Add N set(s) to each exercise for Day X" — fast path with no clarification.
  else if (intent === "bulk_session_sets_increase") {
    const dayIndex = scope.dayIndex;
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: dayIndex !== undefined ? { type: "session", dayIndex } : { type: "session" },
      mutation: {
        type: "transform",
        params: { bulkSetsAdjustment: true, dayIndex },
      },
      reasoning: "Bulk set adjustment across all exercises in a session — deterministic executor, no clarification",
    };
  }

  // ── Session expansion / volume increase ───────────────────────────────────
  else if (intent === "session_expansion" || intent === "increase_volume") {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope,
      mutation: {
        type: "add",
        params: { category: inferExerciseCategory(message) },
      },
      reasoning: "Add exercise flow via session expansion or volume increase",
    };
  }

  // ── Remove exercise / session reduction ───────────────────────────────────
  else if (intent === "session_reduction" || intent === "decrease_volume") {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope,
      mutation: {
        type: "remove",
        params: { category: inferExerciseCategory(message) },
      },
      reasoning: "Remove exercise or reduce session flow",
    };
  }

  // ── Mobility session regression (shorter/easier/gentler + resolved day) ───
  // "Make Day 3 shorter and easier" on a mobility program → deterministic
  // day_regression (identity-preserving). Avoids AI edit-plan failure on
  // vague difficulty descriptors that the generic transform path can't handle.
  else if (
    focusMode === "mobility" &&
    scope.type === "session" &&
    scope.dayIndex !== undefined &&
    /\b(shorter|easier|gentler|less intense|lower impact|desk.?friendly|simpler|calmer|less difficult)\b/i.test(message)
  ) {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: "day_regression",
      scope,
      mutation: {
        type: "regression",
        params: { dayLevel: true, preserveIdentity: true, preserveMobilityIdentity: true },
      },
      reasoning: `Mobility session regression — Day ${(scope.dayIndex ?? 0) + 1} shorter/easier routed to deterministic day_regression`,
    };
  }

  // ── All other family types that map to mutation ───────────────────────────
  else if (isMutationFamily(intent)) {
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope,
      mutation: {
        type: "transform",
        params: {
          transformation: intent,
          scope: scope.type ?? "program",
        },
      },
      reasoning: `Mutation family '${intent}' → apply structural transformation`,
    };
  }

  // ── Explicit fresh build request → ALWAYS rebuild, even if program exists ──
  // "Build a 3 day soccer program", "Create a new plan", etc.
  // This must appear BEFORE the !program check so that repeated build requests
  // are never silently routed to GUIDANCE when an active program exists.
  else if (intent === "new_program_request") {
    plan = {
      action: "REBUILD_PROGRAM",
      intentFamily: "new_program_request",
      scope,
      reasoning: "Explicit fresh build request — REBUILD_PROGRAM regardless of existing program state",
    };

    logger.info(
      {
        conversationId,
        userId,
        action: plan.action,
        intentFamily: plan.intentFamily,
        existingProgramPresent: !!program,
      },
      "[FreshBuildAudit] new_program_request detected — forcing REBUILD_PROGRAM path. Existing program will NOT be used as base.",
    );
  }

  // ── Program question intents → ALWAYS coaching guidance, even without program ─
  // These are questions ABOUT the current program (safety, explanation, coaching).
  // They must NEVER trigger a build — route to GUIDANCE regardless of program state.
  // Greetings are also non-building — context-aware conversational response only.
  else if (
    intent === "program_safety_question" ||
    intent === "program_explanation_question" ||
    intent === "coaching_question" ||
    intent === "greeting"
  ) {
    plan = {
      action: "GUIDANCE",
      intentFamily: intent,
      scope,
      reasoning: `Non-mutation intent '${intent}' — always GUIDANCE, never build`,
    };
  }

  // ── No program exists → build one ─────────────────────────────────────────
  else if (!program) {
    plan = {
      action: "REBUILD_PROGRAM",
      intentFamily: intent === "clarification_required" ? null : intent,
      scope,
      reasoning: "No program exists → trigger program generation",
    };
  }

  // ── Fallback → coaching guidance or forced clarification ─────────────────
  else {
    // Phase 2/3/5: When the intent family falls through to clarification_required
    // but the high-level classifier saw an actionable EDIT intent, do NOT silently
    // fall to GUIDANCE (which produces conversation_only). Instead, infer a
    // default scope and ask a targeted clarification question.
    //
    // This fires for messages like "Make it harder", "Shorten the sessions",
    // "Less rest" — things classifyIntent correctly tags as EDIT_PROGRAM but
    // normalizeToIntentFamily can't resolve to a specific family.
    const isEditActionVerb =
      /\b(add|make|increase|decrease|reduce|replace|remove|shorten|lengthen|drop|cut|give|take|bump|raise|lower|swap|change|modify|update|adjust|intensify|simplify|tighten|ease up|dial|condense|expand)\b/i.test(
        message
      );

    if (intent === "clarification_required" && program && isEditActionVerb) {
      // Phase 3: Infer scope from fallback priority chain:
      //   1. Scope already parsed from message text (e.g. "Day 1")
      //   2. Active first session (if program has days)
      //   3. Entire program
      const inferredScope: ExecutionScope =
        scope.type != null
          ? scope
          : program.days?.length
            ? { type: "session", dayIndex: 0 }
            : { type: "program" };

      const scopeQuestion = buildScopeInferenceQuestion(message);

      plan = {
        action: "ASK_CLARIFICATION",
        intentFamily: "clarification_required",
        scope: inferredScope,
        clarification: {
          question: scopeQuestion,
          pendingAspect: "scope",
        },
        reasoning:
          "[ContractBinding:Forced] EDIT_PROGRAM with action verb but no family match — routing to targeted scope clarification instead of GUIDANCE (never conversation_only)",
      };

      // Phase 7: Structured logging
      logger.info(
        {
          rawText: message.slice(0, 120),
          inferredScope,
          operation: "scope_clarification_forced",
          shouldMutate: true,
          family: intent,
        },
        "[ContractBinding:FallbackUsed] EDIT_PROGRAM with unmatched family — blocking conversation_only, routing to ASK_CLARIFICATION"
      );
    } else {
      plan = {
        action: "GUIDANCE",
        intentFamily: intent === "clarification_required" ? null : intent,
        scope,
        reasoning: `Intent '${intent}' has no mutation path → coaching response`,
      };
    }
  }

  logger.debug(
    {
      conversationId,
      userId,
      action: plan.action,
      intentFamily: plan.intentFamily,
      scope: plan.scope,
      mutationType: plan.mutation?.type ?? null,
      reasoning: plan.reasoning,
      intentConfidence: intentResult.confidence,
    },
    "[ExecutionPlanner] Plan resolved"
  );

  return plan;
}

// ─── Clarification Resolution ─────────────────────────────────────────────────

function resolveClarification({
  message,
  pendingClarification,
}: {
  message: string;
  pendingClarification: PendingClarificationContext;
}): ExecutionPlan {
  const lower = message.toLowerCase().trim();

  // Resolve pending scope clarification
  if (pendingClarification.pendingAspect === "scope") {
    const dayMatch = lower.match(/day\s*(\d+)/i);

    if (dayMatch) {
      return {
        action: "APPLY_MUTATION",
        intentFamily: pendingClarification.intentFamily as IntentFamily,
        scope: {
          type: "session",
          dayIndex: Number(dayMatch[1]) - 1,
        },
        mutation: {
          type: "transform",
          params: {
            transformation: pendingClarification.intentFamily,
          },
        },
        reasoning: "Resolved scope clarification → day target identified",
      };
    }

    // Whole-program resolution
    if (/\b(whole|entire|all|everything|program.?wide|every day)\b/.test(lower)) {
      return {
        action: "APPLY_MUTATION",
        intentFamily: pendingClarification.intentFamily as IntentFamily,
        scope: { type: "program" },
        mutation: {
          type: "transform",
          params: {
            transformation: pendingClarification.intentFamily,
          },
        },
        reasoning: "Resolved scope clarification → program-wide target",
      };
    }
  }

  // Resolve pending exercise clarification
  if (pendingClarification.pendingAspect === "target_exercise") {
    const exerciseName = extractExerciseName(message) ?? message.trim();
    return {
      action: "APPLY_MUTATION",
      intentFamily: pendingClarification.intentFamily as IntentFamily,
      scope: { type: null, exerciseName },
      mutation: {
        type: "swap",
        params: { targetExercise: exerciseName },
      },
      reasoning: "Resolved exercise clarification → exercise name extracted",
    };
  }

  // Could not resolve — fall through to guidance
  return {
    action: "GUIDANCE",
    intentFamily: null,
    scope: { type: null },
    reasoning: "Failed clarification resolution → fallback to coaching",
  };
}

// ─── Scope Resolution ─────────────────────────────────────────────────────────

function resolveScope(message: string): ExecutionScope {
  const lower = message.toLowerCase();

  // Explicit day index
  const dayMatch = lower.match(/day\s*(\d+)/i);
  if (dayMatch) {
    return {
      type: "session",
      dayIndex: Number(dayMatch[1]) - 1,
    };
  }

  // Explicit session reference
  if (/\b(this session|this day|today's session|today)\b/.test(lower)) {
    return { type: "session" };
  }

  // Explicit program-wide
  if (/\b(whole program|entire program|all sessions|everything|program.?wide)\b/.test(lower)) {
    return { type: "program" };
  }

  // Explicit exercise-level
  if (/\b(this exercise|this movement|this lift)\b/.test(lower)) {
    return { type: "exercise" };
  }

  return { type: null };
}

// ─── Exercise Name Extraction ─────────────────────────────────────────────────
//
// Attempts to extract a named exercise from swap-style requests.
// e.g. "swap bench press for dumbbell press" → "bench press"

function extractExerciseName(message: string): string | null {
  const lower = message.toLowerCase();

  // Pattern: swap/replace/substitute X (with/for Y)
  const swapMatch = lower.match(
    /\b(?:swap|replace|substitute|switch|change|take out|remove)\s+(?:out\s+)?(?:the\s+)?([a-z\s\-]+?)(?:\s+(?:with|for|to)\b|$)/i
  );
  if (swapMatch) {
    const candidate = swapMatch[1].trim();
    // Reject tiny fragments like "it" or "this"
    if (candidate.length > 3 && !/^(it|this|that|the)$/.test(candidate)) {
      return candidate;
    }
  }

  // Pattern: instead of X / in place of X
  const insteadMatch = lower.match(/\b(?:instead of|in place of|rather than)\s+(?:the\s+)?([a-z\s\-]+?)(?:\s+(?:with|for|to|,|$))/i);
  if (insteadMatch) {
    const candidate = insteadMatch[1].trim();
    if (candidate.length > 3 && !/^(it|this|that|the)$/.test(candidate)) {
      return candidate;
    }
  }

  // Pattern: "make [named exercise] harder/easier" — e.g., "Make goblet squat harder"
  // Negative lookahead blocks deictic ("it","this","the") and day references
  const harderEasierMatch = lower.match(
    /\bmake\s+(?!(?:it|this|the)\b|day\s*\d+)([a-z][a-z\s\-']{1,35?})\s+(?:harder|tougher|easier|simpler|more\s+\w+|less\s+\w+)\b/i
  );
  if (harderEasierMatch) {
    const candidate = harderEasierMatch[1].trim();
    if (candidate.length > 2 && !/^(it|this|that|the|my|your|a|an)$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ─── Exercise Category Inference ─────────────────────────────────────────────

function inferExerciseCategory(message: string): string {
  const lower = message.toLowerCase();

  if (/\b(jump|plyometric|box jump|depth jump|broad jump)\b/.test(lower)) return "plyometric";
  if (/\b(core|abs|plank|crunch|carry|anti.?rotation)\b/.test(lower)) return "core";
  if (/\b(conditioning|cardio|interval|aerobic|circuit|finisher)\b/.test(lower)) return "conditioning";
  if (/\b(hamstring|rdl|curl|nordics?|glute.ham)\b/.test(lower)) return "hamstrings";
  if (/\b(calf|calves|calf raise)\b/.test(lower)) return "calves";
  if (/\b(glute|hip thrust|bridge)\b/.test(lower)) return "glutes";
  if (/\b(shoulder|delt|press|lateral raise)\b/.test(lower)) return "shoulders";
  if (/\b(upper back|row|pull|lat|rhomboid)\b/.test(lower)) return "upper_back";
  if (/\b(mobility|stretch|hip|ankle|thoracic)\b/.test(lower)) return "mobility";

  return "general";
}

// ─── Adjustment Execution Planner ────────────────────────────────────────────
//
// Richer entry point for the Adjustment Intent Family Engine + Execution Planner.
// Calls classifyAdjustmentIntent() → resolves scope → builds a full plan with:
//
//   - action          — what to do (APPLY_MUTATION, ASK_CLARIFICATION, etc.)
//   - target          — which scope (session, program, exercise)
//   - mutationPlan    — specific mutation type + parameters
//   - constraintsToPersist — constraints to save to user profile
//   - uiUpdateRequired — whether the UI should refresh
//   - verificationRequired — whether mutation-verifier should run
//   - responseMode    — how to construct the response message
//   - fallbackPlan    — what to do if mutation fails
//   - classification  — the full AdjustmentIntentClassification result

export type ResponseMode =
  | "specific_verified"   // confirmed change — use per-family template
  | "specific_partial"    // some changes confirmed — honest partial response
  | "failure"             // mutation failed — never claim success
  | "clarification"       // need more info before acting
  | "guidance_only"       // informational, no mutation
  | "context_stored";     // preference/context stored, may or may not mutate

export interface AdjustmentMutationPlan {
  mutationType: AdjustmentIntentClassification["mutationType"];
  targetScope: string;
  intentFamily: IntentFamily;
  aiDirective: string;
  scopeGuidance: string;
  safetyFlags: AdjustmentIntentClassification["safetyFlags"];
  extractedEntities: AdjustmentIntentClassification["extractedEntities"];
  persistenceType: AdjustmentIntentClassification["persistenceType"];
}

export interface AdjustmentFallbackPlan {
  action: "retry_with_clarification" | "partial_apply" | "noop_with_explanation";
  message: string;
}

export interface AdjustmentExecutionPlan {
  action: ExecutionAction;
  target: ExecutionScope;
  mutationPlan: AdjustmentMutationPlan | null;
  constraintsToPersist: Record<string, unknown>;
  uiUpdateRequired: boolean;
  verificationRequired: boolean;
  responseMode: ResponseMode;
  fallbackPlan: AdjustmentFallbackPlan;
  classification: AdjustmentIntentClassification;
  promptDirective: string;
  reasoning: string;
}

export function planAdjustmentExecution({
  message,
  activeProgram,
  focusMode,
}: {
  message: string;
  activeProgram: ProgramStructure | null;
  focusMode?: FocusMode;
}): AdjustmentExecutionPlan {
  const classification = classifyAdjustmentIntent(message, focusMode);
  const {
    intentFamily,
    confidence,
    targetScope,
    extractedEntities,
    persistenceType,
    mutationType,
    requiresClarification,
    clarificationQuestion,
    safetyFlags,
    familyResult,
  } = classification;

  // ── Clarification required ────────────────────────────────────────────────
  if (requiresClarification || intentFamily === "clarification_required") {
    return {
      action: "ASK_CLARIFICATION",
      target: { type: null },
      mutationPlan: null,
      constraintsToPersist: {},
      uiUpdateRequired: false,
      verificationRequired: false,
      responseMode: "clarification",
      fallbackPlan: {
        action: "retry_with_clarification",
        message: clarificationQuestion ?? "Could you give me more detail?",
      },
      classification,
      promptDirective: "",
      reasoning: `Clarification required for family: ${intentFamily} (confidence: ${confidence})`,
    };
  }

  // ── Pure guidance / informational families ────────────────────────────────
  const guidanceFamilies: IntentFamily[] = [
    "program_safety_question",
    "program_explanation_question",
    "coaching_question",
    "greeting",
    "new_program_request",
  ];
  if (guidanceFamilies.includes(intentFamily)) {
    return {
      action: intentFamily === "new_program_request" ? "REBUILD_PROGRAM" : "GUIDANCE",
      target: { type: null },
      mutationPlan: null,
      constraintsToPersist: {},
      uiUpdateRequired: false,
      verificationRequired: false,
      responseMode: "guidance_only",
      fallbackPlan: { action: "noop_with_explanation", message: "No changes were needed." },
      classification,
      promptDirective: "",
      reasoning: `Guidance-only family: ${intentFamily}`,
    };
  }

  // ── Scope resolution ──────────────────────────────────────────────────────
  const scope = resolveScope(message);
  const resolvedScope: ExecutionScope =
    scope.type != null
      ? scope
      : activeProgram?.days?.length
        ? { type: "session", dayIndex: 0 }
        : { type: "program" };

  // ── Transformation bundle → prompt directive ──────────────────────────────
  const bundle = getTransformationBundle(intentFamily);
  const dayCount = activeProgram?.days?.length;
  const sessionLabel =
    dayCount && resolvedScope.dayIndex != null
      ? (activeProgram?.days?.[resolvedScope.dayIndex]?.name)
      : undefined;

  const promptDirective = buildIntentFamilyPromptDirective(familyResult, {
    dayCount,
    sessionLabel,
  });

  // ── Constraint persistence ────────────────────────────────────────────────
  const constraintsToPersist: Record<string, unknown> = {};

  if (persistenceType === "permanent" || persistenceType === "context_update") {
    if (extractedEntities.targetExercise && intentFamily === "exercise_dislike_or_preference") {
      constraintsToPersist.dislikedExercises = [extractedEntities.targetExercise];
      constraintsToPersist.preferenceDirection = extractedEntities.preferenceDirection;
    }
    if (extractedEntities.targetSport && intentFamily === "sport_context_update") {
      constraintsToPersist.sport = extractedEntities.targetSport;
    }
    if (extractedEntities.targetEquipment && intentFamily === "equipment_constraint") {
      constraintsToPersist.bannedEquipment = [extractedEntities.targetEquipment];
    }
    if (intentFamily === "injury_modification" || intentFamily === "joint_friendly_modification") {
      if (extractedEntities.targetBodyRegion) {
        constraintsToPersist.painConstraints = [extractedEntities.targetBodyRegion];
      }
    }
  }

  // ── UI update needed? ─────────────────────────────────────────────────────
  const uiUpdateRequired =
    mutationType !== "store_context" && mutationType !== "none" && persistenceType !== "none";

  // ── Verification needed? ──────────────────────────────────────────────────
  // uiUpdateRequired already excludes store_context and none mutations
  const verificationRequired = uiUpdateRequired;

  // ── Response mode ─────────────────────────────────────────────────────────
  const responseMode: ResponseMode =
    persistenceType === "context_update" || persistenceType === "none"
      ? "context_stored"
      : "specific_verified";

  // ── Fallback plan ─────────────────────────────────────────────────────────
  const fallbackPlan: AdjustmentFallbackPlan =
    confidence === "low"
      ? {
          action: "retry_with_clarification",
          message: "I wasn't sure what you meant — could you tell me more about what you'd like to change?",
        }
      : {
          action: "noop_with_explanation",
          message: "I wasn't able to apply the change. Your program is unchanged — let me know if you'd like to try again.",
        };

  // ── Mutation plan ─────────────────────────────────────────────────────────
  const mutationPlan: AdjustmentMutationPlan = {
    mutationType,
    targetScope,
    intentFamily,
    aiDirective: bundle?.aiDirective ?? "",
    scopeGuidance: bundle?.scopeGuidance ?? "",
    safetyFlags,
    extractedEntities,
    persistenceType,
  };

  logger.debug(
    {
      intentFamily,
      confidence,
      mutationType,
      persistenceType,
      targetScope,
      resolvedScope,
      safetyFlags,
      uiUpdateRequired,
      verificationRequired,
    },
    "[AdjustmentExecutionPlanner] Plan built"
  );

  return {
    action: "APPLY_MUTATION",
    target: resolvedScope,
    mutationPlan,
    constraintsToPersist,
    uiUpdateRequired,
    verificationRequired,
    responseMode,
    fallbackPlan,
    classification,
    promptDirective,
    reasoning: `IntentFamily: ${intentFamily} (confidence: ${confidence}), Mutation: ${mutationType}, Persistence: ${persistenceType}, Safety: [${safetyFlags.join(", ")}]`,
  };
}

// ─── Scope Inference Question Builder ────────────────────────────────────────
//
// Builds a targeted clarification question for EDIT_PROGRAM intents that
// have an action verb but no matched family. Goal: never leave the user with
// "I couldn't find a match" — always ask the minimal question needed to act.
//
// Phase 6 message template: "I can apply that — just to confirm, …"

function buildScopeInferenceQuestion(message: string): string {
  const lower = message.toLowerCase();

  // Day-specific references already in the message
  if (/\bday\s*\d+/i.test(lower)) {
    return "I can apply that — which specific aspect of that day should I adjust? (e.g. the exercises, sets, or intensity)";
  }

  // Week-scoped references
  if (/\b(this week|the week|week \d+|all week)\b/i.test(lower)) {
    return "I can apply that across the week — should every session change, or just specific days?";
  }

  // Difficulty / intensity signals without scope
  if (/\b(harder|easier|tougher|lighter|more intense|less intense|more challenging|simpler|too easy|too hard)\b/i.test(lower)) {
    return "I can apply that — just to confirm, do you want this applied to a specific day, or across the full program?";
  }

  // Volume / set / rep signals without scope
  if (/\b(more|less|fewer|extra|additional|remove|drop|cut|reduce|increase|add)\b.{0,30}\b(sets?|reps?|volume|exercises?|movements?)\b/i.test(lower)) {
    return "I can apply that — just to confirm, do you want this on a specific day (e.g. Day 1) or across the whole week?";
  }

  // Generic session-length signals
  if (/\b(shorter|longer|shorten|lengthen|condense|expand|quick|brief)\b/i.test(lower)) {
    return "I can make those sessions shorter or longer — which day should I start with, or should this apply to the whole program?";
  }

  // Default: minimal scope disambiguation
  return "I can apply that — just to confirm, do you want this change on a specific day, or across the full program?";
}

function isMutationFamily(family: IntentFamily): boolean {
  const mutationFamilies: IntentFamily[] = [
    "increase_difficulty",
    "decrease_difficulty",
    "increase_volume",
    "decrease_volume",
    "reduce_time",
    "increase_time",
    "strength_focus",
    "hypertrophy_focus",
    "conditioning_focus",
    "power_explosive_focus",
    "speed_focus",
    "athletic_performance_focus",
    "fatigue_management",
    "recovery_focus",
    "mobility_support",
    "injury_modification",
    "joint_friendly_modification",
    "equipment_constraint",
    "add_exercise",
    // Day-level progression/regression — always APPLY_MUTATION, never clarify
    "day_progression",
    "day_regression",
    // Training state families — adjust in place
    "readiness_low",
    "missed_sessions_reentry",
    "environment_temporary_switch",
    "sport_context_update",
    "exercise_dislike_or_preference",
    "bulk_session_sets_increase",
  ];

  return mutationFamilies.includes(family);
}
