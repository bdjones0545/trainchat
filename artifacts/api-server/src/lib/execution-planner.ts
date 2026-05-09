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
import { normalizeSpokenNumbers } from "./intent";
import { isMutationFamilyOntology, getCanonicalName, getMutationCategory } from "./mutation-ontology";
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
import { runLLMIntentInterpreter, type LLMContextType } from "./intent/llm-intent-interpreter";

// ─── Execution Action Types ───────────────────────────────────────────────────

export type ExecutionAction =
  | "APPLY_MUTATION"
  | "ASK_CLARIFICATION"
  | "GUIDANCE"
  | "REBUILD_PROGRAM"
  | "NO_OP"
  | "ACTION_CHOICE_CARD"
  | "SAFETY_REFUSAL";

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
  /** True when scope was inferred as "program" because user didn't specify one. */
  defaultScopeUsed?: boolean;
  /** Human-readable explanation for why no mutation was applied (ASK_CLARIFICATION / GUIDANCE paths). */
  reasonForNoAction?: string;
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
  /**
   * Present on ACTION_CHOICE_CARD actions — structured choices for the frontend
   * to render as an interactive card instead of a free-text clarification question.
   */
  choiceCard?: {
    prompt: string;
    choices: Array<{ label: string; action: string }>;
  };
  /**
   * Present on SAFETY_REFUSAL actions — the message to return to the user.
   */
  safetyRefusal?: {
    message: string;
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

// ─── Low-Detail Context Command Detection ─────────────────────────────────────
// Single-word / very-short context signals that the existing multi-word intent
// patterns don't catch. Examples: "football", "in season", "dumbbells", "45 min".
// These fire in Step 1.5 — BEFORE the normal intent classifier — so they never
// fall through to clarification_required.

type LowDetailContextType = "sport_only" | "phase_only" | "equipment_only" | "duration_only";

interface LowDetailContextCommand {
  type: LowDetailContextType;
  value: string;
  intentFamily: IntentFamily;
}

// Bare sport names with no verb/preamble
const LOW_DETAIL_SPORT_RE =
  /^(football|basketball|soccer|hockey|baseball|lacrosse|rugby|volleyball|tennis|golf|wrestling|track(\s+and\s+field)?|swimming|mma|boxing|rowing|cycling|triathlon|crossfit|cross.?fit|softball|cricket|squash|padel|pickleball|jiu.?jitsu|bjj|powerlifting|weightlifting|olympic\s+lifting)$/i;

// Training-phase single concepts with their canonical intent families
const LOW_DETAIL_PHASE_MAP: Array<{ re: RegExp; intentFamily: IntentFamily; label: string }> = [
  { re: /^(in.?season|in season|inseason)$/i,      intentFamily: "sport_context_update",   label: "in-season"    },
  { re: /^(off.?season|off season|offseason)$/i,   intentFamily: "sport_context_update",   label: "off-season"   },
  { re: /^(pre.?season|preseason)$/i,              intentFamily: "sport_context_update",   label: "pre-season"   },
  { re: /^(post.?season|postseason)$/i,            intentFamily: "sport_context_update",   label: "post-season"  },
  { re: /^maintenance$/i,                          intentFamily: "fatigue_management",     label: "maintenance"  },
  { re: /^hypertrophy$/i,                          intentFamily: "hypertrophy_focus",      label: "hypertrophy"  },
  { re: /^(power|explosive)$/i,                    intentFamily: "power_explosive_focus",  label: "power"        },
  { re: /^speed$/i,                                intentFamily: "speed_focus",            label: "speed"        },
  { re: /^(deload|recovery week)$/i,               intentFamily: "fatigue_management",     label: "deload"       },
];

// Equipment declarations without any negation or qualifying verb
const LOW_DETAIL_EQUIPMENT_RE =
  /^(full\s+gym|home\s+gym|dumbbells?|bodyweight|body\s+weight|no\s+machines?|kettlebells?|barbells?|no\s+equipment|resistance\s+bands?|cables?|machines?|free\s+weights?)$/i;

// Bare duration signals: "45 min", "45 minutes", "one hour", "under an hour", "2 hours"
const LOW_DETAIL_DURATION_RE =
  /^(\d{1,3}\s*min(?:utes?)?|(one|1)\s*(?:hour|hr\.?)|under\s+an?\s*(?:hour|hr\.?)|\d{1,2}\s*(?:hours?|hrs?\.?))$/i;

// ─── Sport-Context Pronoun Override Detection ─────────────────────────────────
// Catches "make it for hockey", "gear it toward basketball", etc. — patterns where
// the pronoun "it" or "this" refers to the active PROGRAM, not an individual exercise.
// Must fire in Step 1.6, before the intent engine, to prevent exercise_swap misrouting.

// Sport names matched anywhere in a message (no anchors)
const SPORT_IN_MESSAGE_RE =
  /\b(football|basketball|soccer|hockey|baseball|lacrosse|rugby|volleyball|tennis|golf|wrestling|track(?:\s+and\s+field)?|sprinting|swimming|mma|boxing|rowing|cycling|triathlon|crossfit|cross.?fit|softball|cricket|squash|padel|pickleball|jiu.?jitsu|bjj|powerlifting|weightlifting|olympic\s+lifting)\b/i;

// Verb/preposition patterns that indicate program-level sport targeting
const SPORT_CONTEXT_VERB_PATTERNS: RegExp[] = [
  /\bmake\s+(it|this)\s+for\b/i,                    // "make it for hockey"
  /\bgear\s+(it|this)\s+toward(s)?\b/i,             // "gear it toward basketball"
  /\bgeared?\s+toward(s)?\b/i,                      // "geared toward basketball"
  /\bthis\s+is\s+for\b/i,                           // "this is for hockey"
  /^for\s+\w/i,                                      // "for hockey" (starts with "for")
  /\boptimize\s+(it|this)\s+for\b/i,                // "optimize it for hockey"
  /\btailor\s+(it|this|the\s+program)?\s*(to|for)\b/i, // "tailor it to hockey"
  /\bbuild\s+(it|this)\s+for\b/i,                   // "build it for hockey"
  /\bdesign\s+(it|this)\s+for\b/i,                  // "design it for hockey"
  /\bcater\s+(it|this)?\s*(to|for)\b/i,             // "cater it to hockey"
];

// Explicit exercise references that block the override — user is talking about an exercise
const EXPLICIT_EXERCISE_REF_RE =
  /\b(this\s+exercise|the\s+exercise|exercise\s+\d+|exercise\s+(?:one|two|three|four|five)|the\s+first\s+exercise|the\s+second\s+exercise|the\s+third\s+exercise|first\s+exercise|second\s+exercise|third\s+exercise)\b/i;

// Explicit day/session references that also block the pending-clarification override
const EXPLICIT_DAY_REF_RE = /\b(this\s+day|that\s+day|day\s*\d+|session\s*\d+)\b/i;

// Intent families that unambiguously apply to the full program and must NEVER be
// treated as answers to "Which exercise did you mean?" or similar exercise-clarification
// questions. When one of these is detected while a pending clarification is active,
// the clarification is discarded and the message falls through to the normal planner.
const FULL_PROGRAM_CONTEXT_OVERRIDE_FAMILIES = new Set<IntentFamily>([
  "conditioning_focus",          // "weight loss", "fat loss", "cardio focus"
  "athletic_performance_focus",  // "more athletic"
  "injury_modification",         // "knees hurt", "bad back"
  "joint_friendly_modification", // "easy on my joints"
  "readiness_low",               // "I'm tired", "exhausted"
  "reduce_time",                 // "too long", "shorter sessions"
  "increase_time",               // "need longer sessions"
  "strength_focus",              // "more strength focus"
  "hypertrophy_focus",           // "build more muscle"
  "endurance_focus",             // "more endurance", "more cardio"
  "power_explosive_focus",       // "more explosive"
  "speed_focus",                 // "faster"
  "reactive_focus",              // reactive agility focus
  "cod_decel_focus",             // change-of-direction focus
  "footwork_rhythm_focus",       // footwork focus
  "fatigue_management",          // "deload me", "I'm overtrained"
  "recovery_focus",              // "recovery week"
  "mobility_support",            // "add more mobility"
  "rom_restoration_focus",       // ROM-specific
  "tissue_stiffness_focus",      // stiffness / soft tissue
  "tendon_resilience_focus",     // tendon health
  "end_range_control_focus",     // end range
  "mobility_flow_focus",         // flow-based mobility
  "unilateral_emphasis",         // "more single-leg"
  "posterior_chain_emphasis",    // "more posterior chain"
  "trunk_core_emphasis",         // "more core"
  "missed_sessions_reentry",     // "I missed workouts"
  "environment_temporary_switch",// "I'm traveling"
  "sport_context_update",        // caught first by detectSportContextCommand, but belt+suspenders
  "equipment_constraint",        // "full gym", "dumbbells only" — richer variants not caught by ldCtx
  "increase_difficulty",         // "make it harder" (program-wide, no exercise ref)
  "decrease_difficulty",         // "make it easier" (program-wide, no exercise ref)
  "increase_volume",             // "more volume"
  "decrease_volume",             // "less volume"
]);

interface SportContextCommand {
  sport: string;
  patternMatched: string;
}

/**
 * Detects sport-context pronoun commands: "make it for hockey", "gear it toward basketball", etc.
 * Returns the detected sport and matched pattern, or null if no override should fire.
 * Bare sport names ("hockey") are handled by detectLowDetailContextCommand, not here.
 */
export function detectSportContextCommand(message: string): SportContextCommand | null {
  // Explicit exercise target overrides — user is targeting an exercise, not the program
  if (EXPLICIT_EXERCISE_REF_RE.test(message)) return null;

  // Named exercise in message? Let normal routing handle it
  // (extractExerciseName is defined later; hoisting covers this)
  if (extractExerciseName(message)) return null;

  // Sport must be present
  const sportMatch = message.match(SPORT_IN_MESSAGE_RE);
  if (!sportMatch) return null;
  const sport = sportMatch[0].toLowerCase();

  // Require a verb/preposition pattern — bare names are handled by detectLowDetailContextCommand
  for (const re of SPORT_CONTEXT_VERB_PATTERNS) {
    if (re.test(message)) {
      return { sport, patternMatched: re.source };
    }
  }

  return null;
}

export function detectLowDetailContextCommand(message: string): LowDetailContextCommand | null {
  const trimmed = message.trim();

  // Guard: bail out early if the message is more than 6 words — the normal
  // intent engine handles richer phrases and we don't want false positives.
  if (trimmed.split(/\s+/).length > 6) return null;

  if (LOW_DETAIL_SPORT_RE.test(trimmed)) {
    return { type: "sport_only", value: trimmed.toLowerCase(), intentFamily: "sport_context_update" };
  }

  for (const entry of LOW_DETAIL_PHASE_MAP) {
    if (entry.re.test(trimmed)) {
      return { type: "phase_only", value: entry.label, intentFamily: entry.intentFamily };
    }
  }

  if (LOW_DETAIL_EQUIPMENT_RE.test(trimmed)) {
    return { type: "equipment_only", value: trimmed.toLowerCase(), intentFamily: "equipment_constraint" };
  }

  if (LOW_DETAIL_DURATION_RE.test(trimmed)) {
    return { type: "duration_only", value: trimmed.toLowerCase(), intentFamily: "reduce_time" };
  }

  return null;
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

// ─── LLM Intent Interpreter Helpers ───────────────────────────────────────────

/**
 * Builds a brief, token-efficient summary of the active program for the
 * LLM intent interpreter. Returns null when no program is active.
 */
function buildProgramSummary(program: ProgramStructure | null): string | null {
  if (!program) return null;
  const name = (program as any).programName ?? (program as any).name ?? "Active Program";
  const days = (program as any).days as Array<{ name?: string; dayNumber?: number }> | undefined;
  if (!days?.length) return name;
  const dayList = days.map((d) => d.name ?? `Day ${d.dayNumber ?? "?"}`).join(", ");
  return `${name} — ${days.length} days: ${dayList}`;
}

/**
 * Maps the LLM contextType to a deterministic IntentFamily.
 * The mapping covers the most unambiguous cases; unknown/exercise/program
 * contextTypes fall back to normalizeToIntentFamily on the interpretedCommand.
 */
const CONTEXT_TYPE_TO_INTENT_FAMILY: Partial<Record<LLMContextType, IntentFamily>> = {
  sport:     "sport_context_update",
  goal:      "conditioning_focus",
  equipment: "equipment_constraint",
  duration:  "reduce_time",
  phase:     "sport_context_update",
  pain:      "injury_modification",
  fatigue:   "readiness_low",
  style:     "athletic_performance_focus",
};

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
  pendingClarificationCount,
  lastClarificationQuestion,
}: {
  message: string;
  userId: string;
  conversationId: string;
  program: ProgramStructure | null;
  pendingClarification: PendingClarificationContext | null;
  uiContext?: Record<string, unknown> | null;
  focusMode?: FocusMode;
  hardConstraints?: HardConstraints;
  /** Number of clarification turns already taken for the active pending intent (0 = first answer). */
  pendingClarificationCount?: number;
  /** The last clarification question asked, for loop detection. */
  lastClarificationQuestion?: string;
}): Promise<ExecutionPlan> {
  // Normalize spoken number words to digits so voice-transcribed messages
  // ("give me a three day strength program") hit the same patterns as typed
  // input ("give me a 3 day strength program"). A single pass here covers
  // all downstream sub-functions (resolveScope, resolveClarification, etc.).
  message = normalizeSpokenNumbers(message);

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

  // ── STEP 0.5: LLM Intent Interpreter ─────────────────────────────────────────
  // Lightweight AI router (gpt-4.1-mini, ≤2.5 s timeout) that converts the user
  // message into structured intent JSON BEFORE the deterministic planner runs.
  //
  // INVARIANTS — the interpreter NEVER writes to the DB or mutates the program.
  //   confidence ≥ 0.75 + isActionable + full-program → return plan immediately
  //   confidence ≥ 0.75 + isActionable + create_program → REBUILD_PROGRAM
  //   confidence ≥ 0.75 + isActionable + answer_question → GUIDANCE
  //   confidence ≥ 0.75 + safety concern → SAFETY_REFUSAL
  //   confidence 0.45–0.74 + isActionable → rewrite message, run deterministic planner
  //   confidence < 0.45 or error → pass through unchanged
  //   exercise-scoped or day-scoped intents at any confidence → always fall through
  //   (exercise/day routing in the deterministic planner is more reliable)
  {
    const interpreterResult = await runLLMIntentInterpreter({
      rawMessage: message,
      activeProgramExists: !!program,
      pendingClarification: pendingClarification
        ? { pendingAspect: pendingClarification.pendingAspect, clarificationQuestion: pendingClarification.clarificationQuestion }
        : null,
      currentProgramSummary: buildProgramSummary(program),
      conversationContext: null,
      recentReferences: null,
      focusMode: focusMode ?? null,
    });

    if (interpreterResult) {
      console.log("[LLM Intent Interpreter]", {
        rawMessage: message.slice(0, 80),
        interpretedCommand: interpreterResult.interpretedCommand.slice(0, 80),
        actionType: interpreterResult.actionType,
        intentFamily: interpreterResult.intentFamily,
        contextType: interpreterResult.contextType,
        scope: interpreterResult.scope,
        confidence: interpreterResult.confidence,
        needsClarification: interpreterResult.needsClarification,
        pendingClarificationDiscarded: !!pendingClarification && interpreterResult.isActionable && interpreterResult.scope === "full_program",
      });

      const { confidence, isActionable, actionType, scope: interpScope, contextType } = interpreterResult;
      const isFullProgramScope = interpScope === "full_program" || interpScope === "unknown";
      const isExerciseOrDayScope = interpScope === "exercise" || interpScope === "day" || interpScope === "session";

      // ── High-confidence full-program modify → immediate APPLY_MUTATION ──────
      if (
        confidence >= 0.75 &&
        isActionable &&
        actionType === "modify_program" &&
        isFullProgramScope &&
        !isExerciseOrDayScope &&
        program
      ) {
        const mappedFamily =
          (CONTEXT_TYPE_TO_INTENT_FAMILY[contextType] as IntentFamily | undefined) ??
          normalizeToIntentFamily(interpreterResult.interpretedCommand, focusMode).family;

        // Safety valve: if the mapped family is clarification_required, fall through
        if (mappedFamily !== "clarification_required") {
          const interpreterPlan: ExecutionPlan = {
            action: "APPLY_MUTATION",
            intentFamily: mappedFamily,
            scope: { type: "program" },
            defaultScopeUsed: true,
            mutation: {
              type: "transform",
              params: {
                transformation: mappedFamily,
                contextType,
                context: interpreterResult.value ?? interpreterResult.interpretedCommand,
                interpretedCommand: interpreterResult.interpretedCommand,
                defaultScopeUsed: true,
              },
            },
            reasoning: `[LLMInterpreter/high] confidence=${confidence.toFixed(2)} contextType=${contextType} → ${mappedFamily} full-program mutation`,
          };

          logger.info(
            { conversationId, userId, mappedFamily, contextType, confidence, pendingClarificationDiscarded: !!pendingClarification },
            "[LLMIntentInterpreter] High-confidence full-program modify — returning APPLY_MUTATION plan"
          );

          return interpreterPlan;
        }
      }

      // ── High-confidence create_program → REBUILD_PROGRAM ───────────────────
      if (confidence >= 0.75 && isActionable && actionType === "create_program") {
        const rebuildPlan: ExecutionPlan = {
          action: "REBUILD_PROGRAM",
          intentFamily: "new_program_request",
          scope: { type: "program" },
          reasoning: `[LLMInterpreter/high] confidence=${confidence.toFixed(2)} → create_program detected`,
        };

        logger.info(
          { conversationId, userId, confidence },
          "[LLMIntentInterpreter] High-confidence create_program — REBUILD_PROGRAM"
        );

        return rebuildPlan;
      }

      // ── High-confidence answer_question → GUIDANCE ──────────────────────────
      if (confidence >= 0.75 && actionType === "answer_question") {
        const guidancePlan: ExecutionPlan = {
          action: "GUIDANCE",
          intentFamily: "coaching_question",
          scope: { type: "program" },
          reasoning: `[LLMInterpreter/high] confidence=${confidence.toFixed(2)} → answer_question`,
        };

        logger.info(
          { conversationId, userId, confidence },
          "[LLMIntentInterpreter] High-confidence answer_question — GUIDANCE"
        );

        return guidancePlan;
      }

      // ── High-confidence safety → SAFETY_REFUSAL ─────────────────────────────
      if (confidence >= 0.75 && actionType === "safety" && interpreterResult.safetyConcern) {
        const safetyPlan: ExecutionPlan = {
          action: "SAFETY_REFUSAL",
          intentFamily: "clarification_required",
          scope: { type: "program" },
          reasoning: `[LLMInterpreter/high] safety concern: ${interpreterResult.safetyConcern}`,
        };

        logger.info(
          { conversationId, userId, safetyConcern: interpreterResult.safetyConcern },
          "[LLMIntentInterpreter] Safety concern detected — SAFETY_REFUSAL"
        );

        return safetyPlan;
      }

      // ── Medium-confidence or exercise-scoped → rewrite message only ─────────
      // The deterministic planner (Steps 1–4) runs on the rewritten message.
      // This improves pattern matching without bypassing safety checks.
      if (
        confidence >= 0.45 &&
        isActionable &&
        !isExerciseOrDayScope &&
        interpreterResult.interpretedCommand !== message
      ) {
        logger.info(
          { conversationId, userId, confidence, originalMessage: message.slice(0, 80), rewrittenMessage: interpreterResult.interpretedCommand.slice(0, 80) },
          "[LLMIntentInterpreter] Medium-confidence — rewrote message for deterministic planner"
        );
        message = interpreterResult.interpretedCommand;
      }
    }
  }

  // ── STEP 1: Handle clarification followup first ─────────────────────────────
  // Before passing the message to resolveClarification, run a three-layer
  // full-program context intercept. If the new message is an unambiguous
  // full-program context command (sport, equipment, duration, fatigue, injury,
  // goal, phase, style…), the pending clarification is discarded and the
  // message falls through to the normal planner (Steps 1.5, 1.6, 2+) instead
  // of being misread as an answer to "Which exercise did you mean?".
  //
  // The override is BLOCKED when the message explicitly references:
  //   - a specific exercise  ("this exercise", "exercise 2", "first exercise")
  //   - a specific day/session ("day 2", "that day", "session 3")
  if (pendingClarification) {
    const hasExplicitRef =
      EXPLICIT_EXERCISE_REF_RE.test(message) || EXPLICIT_DAY_REF_RE.test(message);

    if (!hasExplicitRef) {
      // ── Layer 1: Sport-context pronoun ("make it for hockey") ──────────────
      // Returns an immediate APPLY_MUTATION plan — does not fall through.
      const earlySpotCtxCmd = detectSportContextCommand(message);
      if (earlySpotCtxCmd && program) {
        const earlyActiveProgramId = (program as any)?.id ?? null;
        console.log("[EARLY SPORT OVERRIDE FIRED]", { message, sport: earlySpotCtxCmd.sport, activeProgramId: earlyActiveProgramId });

        const earlySportPlan: ExecutionPlan = {
          action: "APPLY_MUTATION",
          intentFamily: "sport_context_update",
          scope: { type: "program" },
          defaultScopeUsed: true,
          mutation: {
            type: "transform",
            params: {
              transformation: "sport_context_update",
              contextType: "sport",
              context: earlySpotCtxCmd.sport,
              defaultScopeUsed: true,
              repairHint: `Refine the current program for ${earlySpotCtxCmd.sport}.`,
            },
          },
          reasoning: `[EarlySportOverride] "${earlySpotCtxCmd.sport}" sport-context pronoun detected inside pending clarification — discarding pending clarification and applying full-program sport mutation`,
        };

        logger.info(
          { conversationId, userId, sport: earlySpotCtxCmd.sport, discardedPendingAspect: pendingClarification.pendingAspect },
          "[EarlyContextOverride/sport] Sport-context pronoun — pending clarification discarded"
        );

        return earlySportPlan;
      }

      // ── Layer 2: Low-detail context ("Full gym", "45 min", "In season", "Hockey") ──
      // Single-word / short context signals. If a program exists, return an
      // immediate plan. If no program, just fall through — Step 1.5 catches it.
      const earlyLdCtx = detectLowDetailContextCommand(message);
      if (earlyLdCtx) {
        console.log("[EARLY CONTEXT OVERRIDE FIRED]", {
          layer: "low_detail",
          message: message.slice(0, 80),
          detectedType: earlyLdCtx.type,
          detectedValue: earlyLdCtx.value,
          activeProgramPresent: !!program,
          discardedPendingAspect: pendingClarification.pendingAspect,
        });

        logger.info(
          { conversationId, userId, ldCtxType: earlyLdCtx.type, ldCtxValue: earlyLdCtx.value, discardedPendingAspect: pendingClarification.pendingAspect },
          "[EarlyContextOverride/low_detail] Low-detail context command — pending clarification discarded"
        );

        if (program) {
          const earlyLdPlan: ExecutionPlan = {
            action: "APPLY_MUTATION",
            intentFamily: earlyLdCtx.intentFamily,
            scope: { type: "program" },
            defaultScopeUsed: true,
            mutation: {
              type: "transform",
              params: {
                transformation: earlyLdCtx.intentFamily,
                context: earlyLdCtx.value,
                contextType: earlyLdCtx.type,
                defaultScopeUsed: true,
              },
            },
            reasoning: `[EarlyContextOverride/low_detail] "${earlyLdCtx.value}" (${earlyLdCtx.type}) while pending clarification active — discarding clarification, applying program-wide ${earlyLdCtx.intentFamily}`,
          };
          return earlyLdPlan;
        }
        // No program → fall through; Step 1.5 will build/route correctly.
      } else {
        // ── Layer 3: Intent-family whitelist ───────────────────────────────────
        // For richer messages ("Weight loss", "More athletic", "Knees hurt",
        // "I'm tired", "Too long") that the low-detail detector doesn't catch,
        // run normalizeToIntentFamily early. If the family is unambiguously
        // full-program, discard the pending clarification and fall through.
        const earlyFamily = normalizeToIntentFamily(message, focusMode).family;
        if (FULL_PROGRAM_CONTEXT_OVERRIDE_FAMILIES.has(earlyFamily)) {
          console.log("[EARLY CONTEXT OVERRIDE FIRED]", {
            layer: "intent_family",
            message: message.slice(0, 80),
            detectedFamily: earlyFamily,
            activeProgramPresent: !!program,
            discardedPendingAspect: pendingClarification.pendingAspect,
          });

          logger.info(
            { conversationId, userId, earlyFamily, discardedPendingAspect: pendingClarification.pendingAspect },
            "[EarlyContextOverride/intent_family] Full-program intent family — pending clarification discarded, falling through to normal planner"
          );

          // Fall through to Steps 1.5, 1.6, 2+ — do NOT call resolveClarification.
        } else {
          // No override — treat as a normal clarification answer.
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
      }
    } else {
      // Explicit exercise or day reference → always treat as clarification answer.
      const plan = resolveClarification({ message, pendingClarification });

      logger.debug(
        {
          conversationId,
          userId,
          action: plan.action,
          intentFamily: plan.intentFamily,
          scope: plan.scope,
          reasoning: plan.reasoning,
          hasExplicitRef,
        },
        "[ExecutionPlanner] Resolved from pending clarification (explicit ref present — no override)"
      );

      return plan;
    }
  }

  // ── STEP 1.5: Low-detail context command detection ────────────────────────
  // Single-word / very-short context signals ("football", "in season",
  // "dumbbells", "45 min") don't match any multi-word regex in the intent
  // engine and would fall through to clarification_required. Catch them here
  // and route directly to action — never clarify when the intent is unambiguous.
  const ldCtx = detectLowDetailContextCommand(message);
  if (ldCtx) {
    if (program) {
      const ldScope: ExecutionScope = { type: "program" };
      const ldPlan: ExecutionPlan = {
        action: "APPLY_MUTATION",
        intentFamily: ldCtx.intentFamily,
        scope: ldScope,
        mutation: {
          type: "transform",
          params: {
            transformation: ldCtx.intentFamily,
            context: ldCtx.value,
            contextType: ldCtx.type,
            defaultScopeUsed: true,
          },
        },
        reasoning: `Low-detail context command "${ldCtx.value}" (${ldCtx.type}) — applying as program-wide ${ldCtx.intentFamily} mutation without clarification`,
        defaultScopeUsed: true,
      };

      console.log("[Low Detail Context Command]", {
        message: message.slice(0, 80),
        detectedContextType: ldCtx.type,
        detectedValue: ldCtx.value,
        activeProgramId: true,
        routedAction: "APPLY_MUTATION",
        defaultScopeUsed: true,
      });

      logger.info(
        {
          conversationId,
          userId,
          detectedContextType: ldCtx.type,
          detectedValue: ldCtx.value,
          intentFamily: ldCtx.intentFamily,
          action: "APPLY_MUTATION",
          scope: ldScope,
        },
        "[LowDetailContextCommand] Short context signal detected — routing to APPLY_MUTATION program-wide (no clarification)"
      );

      return ldPlan;
    }

    // No active program — sport signals trigger a guided build.
    // Other low-detail signals (equipment, duration, phase) fall through to
    // the normal classification tree which will route to REBUILD_PROGRAM.
    if (ldCtx.type === "sport_only") {
      const ldNoProgramPlan: ExecutionPlan = {
        action: "REBUILD_PROGRAM",
        intentFamily: "sport_context_update",
        scope: { type: "program" },
        reasoning: `Low-detail sport signal "${ldCtx.value}" with no active program — triggering sport-aware program build`,
      };

      console.log("[Low Detail Context Command]", {
        message: message.slice(0, 80),
        detectedContextType: ldCtx.type,
        detectedValue: ldCtx.value,
        activeProgramId: null,
        routedAction: "REBUILD_PROGRAM",
        defaultScopeUsed: true,
      });

      logger.info(
        { conversationId, userId, detectedContextType: ldCtx.type, detectedValue: ldCtx.value },
        "[LowDetailContextCommand] Sport signal with no active program — routing to REBUILD_PROGRAM"
      );

      return ldNoProgramPlan;
    }
    // Non-sport low-detail without a program: fall through to STEP 2 so the
    // normal classifier + REBUILD_PROGRAM logic handles it naturally.
  }

  // ── STEP 1.6: Sport-context pronoun override ───────────────────────────────
  // "Make it for hockey", "gear it toward basketball", "this is for football"
  // — pronouns like "it" and "this" refer to the ACTIVE PROGRAM, not an exercise.
  // This fires BEFORE the intent engine so exercise_swap never misroutes them.
  // Explicit exercise targets ("this exercise", "exercise 2") bypass the override.
  const sportCtxCmd = detectSportContextCommand(message);
  if (sportCtxCmd) {
    const sportPlan: ExecutionPlan = {
      action: program ? "APPLY_MUTATION" : "REBUILD_PROGRAM",
      intentFamily: "sport_context_update",
      scope: { type: "program" },
      mutation: program
        ? {
            type: "transform",
            params: {
              transformation: "sport_context_update",
              contextType: "sport",
              context: sportCtxCmd.sport,
              defaultScopeUsed: true,
              repairHint: `Refine the current program for ${sportCtxCmd.sport}.`,
            },
          }
        : undefined,
      reasoning: `[SportContextOverride] "${sportCtxCmd.sport}" with program-level pronoun — routing to ${program ? "APPLY_MUTATION" : "REBUILD_PROGRAM"} full_program`,
      defaultScopeUsed: true,
    };

    console.log("[Sport Context Override]", {
      message: message.slice(0, 80),
      detectedSport: sportCtxCmd.sport,
      activeProgramId: (program as any)?.id ?? null,
      explicitExerciseTarget: false,
      routedAction: sportPlan.action,
      scope: "full_program",
    });

    logger.info(
      { conversationId, userId, sport: sportCtxCmd.sport, hasProgram: !!program },
      "[SportContextOverride] Sport-context pronoun command — bypassing exercise clarification"
    );

    return sportPlan;
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
  // Actionable default: endurance is safe to apply program-wide when no scope
  // is specified — never ask "which day or whole program?".
  else if (intent === "endurance_focus") {
    const enduranceScope = scope.type ? scope : { type: "program" as const };
    const enduranceDefaulted = !scope.type;
    plan = {
      action: "APPLY_MUTATION",
      intentFamily: intent,
      scope: enduranceScope,
      mutation: {
        type: "transform",
        params: { transformation: "endurance", defaultScopeUsed: enduranceDefaulted },
      },
      reasoning: enduranceDefaulted
        ? "Endurance transformation — actionable default: applying program-wide (no scope needed)"
        : "Endurance transformation with resolved scope",
      defaultScopeUsed: enduranceDefaulted,
    };
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

      const loopCount = pendingClarificationCount ?? 0;

      // ── Loop detection: we've already asked scope once, apply with program default ──
      // If the user has answered the scope question but the family still can't be
      // resolved, stop asking and apply a best-effort program-wide transformation
      // so the AI receives the full original request and can act on it.
      if (loopCount >= 1) {
        const forcedScope: ExecutionScope = { type: "program" };

        plan = {
          action: "APPLY_MUTATION",
          intentFamily: "clarification_required",
          scope: forcedScope,
          mutation: {
            type: "transform",
            params: {
              transformation: "general_improvement",
              defaultScopeUsed: true,
              loopBreaker: true,
              originalMessage: message.slice(0, 120),
            },
          },
          reasoning: `[LoopBreaker] clarification_required + ${loopCount} previous rounds — forcing APPLY_MUTATION with program-wide default`,
          defaultScopeUsed: true,
        };

        logger.warn(
          {
            rawText: message.slice(0, 120),
            loopCount,
            operation: "loop_breaker_forced",
            forcedScope,
          },
          "[Conversation Loop Audit] Loop detected — breaking out of clarification cycle with APPLY_MUTATION"
        );
      } else {
        // First time: ask scope as normal
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
          reasonForNoAction: scopeQuestion,
        };

        // Phase 7: Structured logging
        logger.info(
          {
            rawText: message.slice(0, 120),
            inferredScope,
            operation: "scope_clarification_forced",
            shouldMutate: true,
            family: intent,
            loopCount,
          },
          "[ContractBinding:FallbackUsed] EDIT_PROGRAM with unmatched family — blocking conversation_only, routing to ASK_CLARIFICATION"
        );
      }
    } else {
      plan = {
        action: "GUIDANCE",
        intentFamily: intent === "clarification_required" ? null : intent,
        scope,
        reasoning: `Intent '${intent}' has no mutation path → coaching response`,
      };
    }
  }

  logger.info(
    {
      conversationId,
      userId,
      action:           plan.action,
      intentFamily:     plan.intentFamily,
      scope:            plan.scope,
      mutationType:     plan.mutation?.type ?? null,
      mutationParams:   plan.mutation?.params ?? null,
      reasoning:        plan.reasoning,
      intentConfidence: intentResult.confidence,
      intentRaw:        intentResult.family,
      hasProgram:       !!program,
      messagePreview:   message.slice(0, 120),
    },
    "[MutationTrace] ExecutionPlanner — plan resolved",
  );

  // ── [Conversation Loop Audit] — structured audit log for every turn ─────────
  logger.info(
    {
      conversationId,
      userId,
      activeProgramPresent: !!program,
      intentFamily:            plan.intentFamily,
      plannerRoute:            plan.action,
      pendingClarificationCount: pendingClarificationCount ?? 0,
      lastClarificationQuestion: lastClarificationQuestion ?? null,
      clarificationAsked:      plan.action === "ASK_CLARIFICATION",
      mutationQueued:          plan.action === "APPLY_MUTATION",
      defaultScopeUsed:        plan.defaultScopeUsed ?? false,
      reasonForNoAction:       plan.action !== "APPLY_MUTATION" ? (plan.reasonForNoAction ?? plan.reasoning) : null,
      messagePreview:          message.slice(0, 80),
    },
    "[Conversation Loop Audit] turn routing resolved",
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

  // ── FIX 2: Recover real intent family if stored as fallback ─────────────────
  // When the fallback ASK_CLARIFICATION fires (e.g. "Make this program harder"
  // doesn't match any specific family pattern), pendingClarification.intentFamily
  // is "clarification_required". Re-run normalizeToIntentFamily on the original
  // request to recover the actual family before building the mutation plan.
  // This prevents mutation params like { transformation: "clarification_required" }
  // which are meaningless to the edit engine.
  const rawStoredFamily = pendingClarification.intentFamily;
  const effectiveFamily: IntentFamily = (() => {
    if (rawStoredFamily && rawStoredFamily !== "clarification_required") {
      return rawStoredFamily as IntentFamily;
    }
    const originalRequest = pendingClarification.originalRequest ?? "";
    if (originalRequest) {
      const recovered = normalizeToIntentFamily(originalRequest);
      if (recovered.family !== "clarification_required") {
        return recovered.family;
      }
    }
    // Safe program-mutating fallback — edit engine treats this as a general
    // difficulty/intensity edit, which is the most common unrecognized command type
    return "increase_difficulty" as IntentFamily;
  })();

  // Dev logging — clarification state before resolution attempt
  console.log("[Clarification State]", {
    pendingIntentFamily: rawStoredFamily,
    effectiveFamily,
    pendingAction: "APPLY_MUTATION",
    pendingScope: pendingClarification.pendingAspect,
    pendingClarificationQuestion: pendingClarification.clarificationQuestion,
    pendingClarificationFields: {
      originalRequest: pendingClarification.originalRequest?.slice(0, 80),
      intentFamily: pendingClarification.intentFamily,
      pendingAspect: pendingClarification.pendingAspect,
    },
    currentMessage: message.slice(0, 80),
    clarificationResolutionAttempted: true,
    clarificationResolved: false, // updated on resolution
  });

  // ── Resolve pending scope / phase / general clarification ────────────────────
  // Handles: "scope", "target_day", "target_session", "phase_or_block" and any
  // non-exercise aspects. Structural patterns are checked first; unmatched answers
  // fall through to a general catch-all that still routes to APPLY_MUTATION so the
  // pending clarification is always consumed (never left dangling as GUIDANCE).
  if (
    pendingClarification.pendingAspect === "scope" ||
    pendingClarification.pendingAspect === "target_day" ||
    pendingClarification.pendingAspect === "target_session" ||
    pendingClarification.pendingAspect === "phase_or_block" ||
    pendingClarification.pendingAspect === "confirmation"
  ) {
    // Day-level structural match
    const dayMatch = lower.match(/day\s*(\d+)/i);
    if (dayMatch) {
      console.log("[Clarification State]", {
        pendingIntentFamily: rawStoredFamily,
        effectiveFamily,
        pendingScope: pendingClarification.pendingAspect,
        currentMessage: message.slice(0, 80),
        clarificationResolutionAttempted: true,
        clarificationResolved: true,
        resolvedAs: "day_target",
      });
      return {
        action: "APPLY_MUTATION",
        intentFamily: effectiveFamily,
        scope: {
          type: "session",
          dayIndex: Number(dayMatch[1]) - 1,
        },
        mutation: {
          type: "transform",
          params: { transformation: effectiveFamily },
        },
        reasoning: "Resolved scope clarification → day target identified",
      };
    }

    // Deictic scope — "this session", "this day", "this workout", "current session",
    // "today", "the current day", "right now"
    if (
      /\b(this session|this day|this workout|current session|current day|today|the current day|right now|this one)\b/i.test(lower)
    ) {
      return {
        action: "APPLY_MUTATION",
        intentFamily: effectiveFamily,
        scope: { type: "session" },
        mutation: {
          type: "transform",
          params: { transformation: effectiveFamily, scopeLabel: "this session" },
        },
        reasoning: "Resolved scope clarification → deictic scope (this session/today)",
      };
    }

    // Whole-program resolution
    if (
      /\b(whole|entire|full|all|everything|program.?wide|every day|all days?|across (all|the)|across the program)\b/.test(lower) ||
      /\b(the full program|the whole program|the entire program)\b/.test(lower)
    ) {
      return {
        action: "APPLY_MUTATION",
        intentFamily: effectiveFamily,
        scope: { type: "program" },
        mutation: {
          type: "transform",
          params: { transformation: effectiveFamily },
        },
        reasoning: "Resolved scope clarification → program-wide target",
      };
    }

    // Week-level resolution (e.g. "Week 1", "week 2")
    const weekMatch = lower.match(/\bweek\s*(\d+)\b/i);
    if (weekMatch) {
      return {
        action: "APPLY_MUTATION",
        intentFamily: effectiveFamily,
        scope: { type: "program" },
        mutation: {
          type: "transform",
          params: {
            transformation: effectiveFamily,
            weekNumber: Number(weekMatch[1]),
            scopeLabel: `week ${weekMatch[1]}`,
          },
        },
        reasoning: `Resolved scope clarification → week ${weekMatch[1]} target`,
      };
    }

    // ── General catch-all for scope/phase/confirmation answers ──────────────────
    // Handles non-structural answers like "in season maintenance", "pre-season",
    // "full gym access", "45 minutes", "all exercises", "maintenance", etc.
    // CRITICAL: never return GUIDANCE here — that leaves the pending clarification
    // unresolved in the DB, causing it to bleed into subsequent turns.
    console.log("[Clarification State]", {
      pendingIntentFamily: rawStoredFamily,
      effectiveFamily,
      pendingScope: pendingClarification.pendingAspect,
      currentMessage: message.slice(0, 80),
      clarificationResolutionAttempted: true,
      clarificationResolved: true,
      resolvedAs: "general_catch_all",
    });
    return {
      action: "APPLY_MUTATION",
      intentFamily: effectiveFamily,
      scope: { type: "program" },
      mutation: {
        type: "transform",
        params: {
          transformation: effectiveFamily,
          clarificationAnswer: message.trim(),
        },
      },
      reasoning: `Resolved ${pendingClarification.pendingAspect} clarification → general answer applied (was: "${pendingClarification.originalRequest.slice(0, 60)}")`,
    };
  }

  // ── Resolve pending exercise clarification ──────────────────────────────────
  // Only binds to this path when the ORIGINAL intent was exercise_swap and
  // the pending question was specifically asking which exercise to target.
  if (pendingClarification.pendingAspect === "target_exercise") {
    const exerciseName = extractExerciseName(message) ?? message.trim();
    console.log("[Clarification State]", {
      pendingIntentFamily: rawStoredFamily,
      effectiveFamily,
      pendingScope: pendingClarification.pendingAspect,
      currentMessage: message.slice(0, 80),
      clarificationResolutionAttempted: true,
      clarificationResolved: true,
      resolvedAs: "target_exercise",
      exerciseName,
    });
    return {
      action: "APPLY_MUTATION",
      intentFamily: effectiveFamily,
      scope: { type: null, exerciseName },
      mutation: {
        type: "swap",
        params: { targetExercise: exerciseName },
      },
      reasoning: "Resolved exercise clarification → exercise name extracted",
    };
  }

  // ── Final safety catch-all — should never reach here given the branches above ──
  // Route to APPLY_MUTATION rather than GUIDANCE to ensure the pending clarification
  // is always consumed and never left dangling across turns.
  console.log("[Clarification State]", {
    pendingIntentFamily: rawStoredFamily,
    effectiveFamily,
    pendingScope: pendingClarification.pendingAspect,
    currentMessage: message.slice(0, 80),
    clarificationResolutionAttempted: true,
    clarificationResolved: false,
    resolvedAs: "safety_fallback",
  });
  return {
    action: "APPLY_MUTATION",
    intentFamily: effectiveFamily,
    scope: { type: "program" },
    mutation: {
      type: "transform",
      params: {
        transformation: effectiveFamily,
        clarificationAnswer: message.trim(),
      },
    },
    reasoning: `Safety catch-all: unhandled pendingAspect "${pendingClarification.pendingAspect}" — routing to APPLY_MUTATION to prevent stale clarification leakage`,
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
  const result = isMutationFamilyOntology(family);
  if (result) {
    const canonical = getCanonicalName(family);
    const category = getMutationCategory(family);
    logger.debug(
      { family, canonical, category },
      `[OntologyTrace] isMutationFamily → true | canonical=${canonical} category=${category}`
    );
  }
  return result;
}
