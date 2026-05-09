/**
 * Action Guarantee Layer
 *
 * Applied after the Anti-Loop Reliability Layer. Guarantees that when an
 * active program exists and the user's message has ANY actionable signal,
 * the system returns one of:
 *   - APPLY_MUTATION
 *   - ACTION_CHOICE_CARD   (ambiguous destructive target, e.g. "replace that")
 *   - SAFETY_REFUSAL       (harmful intent, e.g. "make it painful")
 *
 * It must NEVER allow GUIDANCE, NO_OP, or repeated clarification to fall
 * through when the user is clearly trying to change their active program.
 *
 * Repairs (in priority order):
 *  1. Safety block         — harmful request → SAFETY_REFUSAL
 *  2. Ambiguous destructive — destructive verb + pronoun, no named target → ACTION_CHOICE_CARD
 *  3. Clarification limit  — 1-round max; second ask → APPLY_MUTATION (program default)
 *  4. GUIDANCE / NO_OP upgrade — extended actionable signal → APPLY_MUTATION
 */

import { logger } from "./logger";
import type { ExecutionPlan, ExecutionScope } from "./execution-planner";
import type { IntentFamily } from "./intent-family-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionGuaranteeContext {
  message: string;
  activeProgramId: number | null;
  program: object | null;
  conversationId: number;
  pendingClarificationCount: number;
}

export interface ActionChoiceOption {
  label: string;
  action: string;
}

export interface ActionChoiceCard {
  prompt: string;
  choices: ActionChoiceOption[];
}

export interface ActionGuaranteeResult {
  plan: ExecutionPlan;
  actionableSignal: boolean;
  originalAction: string;
  finalAction: string;
  defaultScopeUsed: boolean;
  repairReason: string | null;
  choiceCardShown: boolean;
  safetyBlocked: boolean;
}

// ─── Actionable Signal Detection ─────────────────────────────────────────────
//
// Extended beyond the anti-loop layer's ACTION_SIGNAL_RE — catches sport context,
// equipment, duration, intensity style, and pain/fatigue signals in addition
// to command verbs.

const SPORT_CONTEXT_RE =
  /\b(football|hockey|basketball|soccer|baseball|lacrosse|rugby|volleyball|tennis|wrestling|track(?:\s+and\s+field)?|sprinting|swimming|mma|boxing|rowing|cycling|triathlon|crossfit|cross.?fit|softball|cricket|squash|padel|pickleball|jiu.?jitsu|bjj|powerlifting|weightlifting|olympic\s+lifting|in.?season|off.?season|pre.?season|post.?season)\b/i;

const EQUIPMENT_RE =
  /\b(dumbbells?|full\s+gym|home\s+gym|no\s+machines?|kettlebells?|barbells?|bodyweight|body\s+weight|resistance\s+bands?|cables?|free\s+weights?)\b/i;

const DURATION_RE =
  /\b(\d{1,3}\s*min(?:utes?)?|\d{1,2}\s*(?:hours?|hrs?\.?)|shorter|longer|shorten|lengthen|too\s+long|too\s+short)\b/i;

const INTENSITY_RE =
  /\b(harder|easier|heavier|lighter|more\s+intense|less\s+intense|too\s+much|too\s+easy|too\s+hard|dial\s+(?:it\s+)?(?:up|down)|step\s+it\s+up|tone\s+it\s+down|ramp\s+(?:it\s+)?up|scale\s+(?:it\s+)?(?:back|down))\b/i;

const STYLE_RE =
  /\b(more\s+athletic|more\s+explosive|less\s+impact|more\s+conditioning|more\s+power(?:ful)?|more\s+speed|more\s+agile|more\s+functional|sport.?specific|performance.?focused|game.?ready)\b/i;

const PAIN_FATIGUE_RE =
  /\b(knees?\s+(?:hurt|are\s+(?:bad|sore|shot))|back\s+(?:hurt|is\s+(?:bad|sore|shot))|shoulder(?:s)?\s+hurt|hip(?:s)?\s+hurt|(?:i'?m|i\s+am)\s+(?:cooked|wrecked|dead|fried|burned?\s*out|exhausted|sore|toast|done)|too\s+tired|too\s+sore|too\s+fatigued|overtraining|beat\s+up|worn\s+out|legs?\s+(?:are\s+)?(?:dead|shot)|my\s+\w+\s+(?:is\s+|are\s+)?(?:killing\s+me|sore|hurts?|shot))\b/i;

const COMMAND_VERB_RE =
  /\b(make|change|add|remove|replace|swap|adjust|progress|regress|shorten|increase|decrease|drop|cut|reduce|modify|update|adapt|fix|correct|rebalance|convert|shift|tune|target|strengthen|simplify|expand|condense|overhaul|rework|redo|rebuild)\b/i;

// ─── Safety Block Patterns ────────────────────────────────────────────────────
//
// Requests that would cause physical harm or are fundamentally counterproductive.

const SAFETY_BLOCK_RE =
  /\b(make\s+it\s+painful|make\s+it\s+hurt|train\s+through\s+(?:the\s+)?pain|ignore\s+(?:my\s+)?(?:injury|injuries|pain|hurt(?:ing)?)|push\s+through\s+(?:the\s+)?injury|destroy\s+(?:me|my\s+body|myself)|wreck\s+(?:me|my\s+body|myself)|max\s+out\s+every\s+(?:day|session|exercise)|injure\s+(?:me|myself))\b/i;

// ─── Ambiguous Destructive Target Detection ───────────────────────────────────
//
// "replace that", "swap it", "remove this" — destructive verb + pronoun only,
// no named exercise in the message. Must show a choice card instead of a
// free-text clarification question.

const EXACT_DESTRUCTIVE_PRONOUN_RE =
  /^\s*(?:replace|swap|remove|drop|cut|take\s+out)\s+(?:that|it|this|one)\s*[.!?]?\s*$/i;

const SHORT_DESTRUCTIVE_PRONOUN_RE =
  /\b(replace|swap|remove|drop)\s+(that|it|this)\b/i;

// ─── Guidance-only families — never upgrade these ─────────────────────────────

const GUIDANCE_ONLY_FAMILIES = new Set<IntentFamily | null>([
  "greeting",
  "program_safety_question",
  "program_explanation_question",
  "coaching_question",
  null,
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function detectActionableSignal(message: string): boolean {
  return (
    SPORT_CONTEXT_RE.test(message) ||
    EQUIPMENT_RE.test(message) ||
    DURATION_RE.test(message) ||
    INTENSITY_RE.test(message) ||
    STYLE_RE.test(message) ||
    PAIN_FATIGUE_RE.test(message) ||
    COMMAND_VERB_RE.test(message)
  );
}

function detectSafetyBlock(message: string): boolean {
  return SAFETY_BLOCK_RE.test(message);
}

function isAmbiguousDestructive(message: string): boolean {
  const trimmed = message.trim();
  if (EXACT_DESTRUCTIVE_PRONOUN_RE.test(trimmed)) return true;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 5 && SHORT_DESTRUCTIVE_PRONOUN_RE.test(trimmed)) return true;
  return false;
}

function hasNamedExerciseTarget(message: string): boolean {
  const lower = message.toLowerCase();
  const match = lower.match(
    /\b(?:replace|swap|remove|drop|cut|take\s+out)\s+(?:out\s+)?(?:that|it|this|one|the)?\s*([a-z][a-z\s\-']{2,})/
  );
  if (!match) return false;
  const candidate = (match[1] ?? "").trim();
  if (/^(that|it|this|one|the|a|an|out)$/.test(candidate)) return false;
  return candidate.length > 3;
}

function makeProgramWideMutation(
  plan: ExecutionPlan,
  params: Record<string, unknown>,
  reasoning: string
): ExecutionPlan {
  const forcedScope: ExecutionScope = { type: "program" };
  return {
    ...plan,
    action: "APPLY_MUTATION",
    scope: forcedScope,
    mutation: {
      type: "transform",
      params: {
        transformation: plan.intentFamily ?? "general_improvement",
        defaultScopeUsed: true,
        ...params,
      },
    },
    reasoning,
    defaultScopeUsed: true,
  };
}

// ─── Core Layer ───────────────────────────────────────────────────────────────

export function applyActionGuaranteeLayer(
  plan: ExecutionPlan,
  ctx: ActionGuaranteeContext
): ActionGuaranteeResult {
  const originalAction = plan.action;
  const { message, activeProgramId, program, conversationId, pendingClarificationCount } = ctx;

  const result: ActionGuaranteeResult = {
    plan,
    actionableSignal: false,
    originalAction,
    finalAction: plan.action,
    defaultScopeUsed: plan.defaultScopeUsed ?? false,
    repairReason: null,
    choiceCardShown: false,
    safetyBlocked: false,
  };

  // ── 1. Safety block ──────────────────────────────────────────────────────────
  // Intercept before anything else — harmful requests are always refused.
  if (detectSafetyBlock(message)) {
    const safetyMessage =
      "I can't design sessions intended to cause pain or injury — that's counterproductive to real training. If you want to push harder, I can safely increase intensity. If something is hurting, tell me and I'll work around it.";

    result.plan = {
      ...plan,
      action: "SAFETY_REFUSAL",
      reasoning: "[ActionGuarantee:SafetyRefusal] Request would cause harm — refusing with safe redirect",
      safetyRefusal: { message: safetyMessage },
    };
    result.finalAction = "SAFETY_REFUSAL";
    result.safetyBlocked = true;
    result.actionableSignal = true;
    result.repairReason = "safety_block";

    console.log("[Action Guarantee Layer]", {
      message: message.slice(0, 80),
      activeProgramId,
      originalAction,
      finalAction: "SAFETY_REFUSAL",
      actionableSignal: true,
      defaultScopeUsed: false,
      repairReason: "safety_block",
      choiceCardShown: false,
      safetyBlocked: true,
    });

    logger.warn(
      { conversationId, originalAction, finalAction: "SAFETY_REFUSAL" },
      "[ActionGuarantee] Safety refusal — harmful request blocked"
    );

    return result;
  }

  // ── Detect actionable signal (used for all remaining repairs) ─────────────
  const actionableSignal = detectActionableSignal(message);
  result.actionableSignal = actionableSignal;

  const hasActiveProgram = !!program && activeProgramId != null;

  // ── 2. Ambiguous destructive target → ACTION_CHOICE_CARD ─────────────────
  // "replace that" / "swap it" with no named exercise → structured choice card,
  // never another free-text question.
  if (
    hasActiveProgram &&
    isAmbiguousDestructive(message) &&
    !hasNamedExerciseTarget(message) &&
    plan.action !== "APPLY_MUTATION"
  ) {
    const choiceCard: ActionChoiceCard = {
      prompt: "What would you like to replace?",
      choices: [
        { label: "Replace the last exercise", action: "replace_last_exercise" },
        { label: "Pick a specific exercise", action: "pick_exercise" },
        { label: "Cancel", action: "cancel" },
      ],
    };

    result.plan = {
      ...plan,
      action: "ACTION_CHOICE_CARD",
      reasoning:
        "[ActionGuarantee:ChoiceCard] Ambiguous destructive target — showing structured choices instead of free-text question",
      choiceCard,
    };
    result.finalAction = "ACTION_CHOICE_CARD";
    result.choiceCardShown = true;
    result.repairReason = "ambiguous_destructive_choice_card";

    console.log("[Action Guarantee Layer]", {
      message: message.slice(0, 80),
      activeProgramId,
      originalAction,
      finalAction: "ACTION_CHOICE_CARD",
      actionableSignal,
      defaultScopeUsed: false,
      repairReason: "ambiguous_destructive_choice_card",
      choiceCardShown: true,
      safetyBlocked: false,
    });

    logger.info(
      { conversationId, originalAction, finalAction: "ACTION_CHOICE_CARD" },
      "[ActionGuarantee] Ambiguous destructive target — choice card shown"
    );

    return result;
  }

  // ── 3. Clarification limit: 1-round maximum ──────────────────────────────
  // After one unanswered clarification for the same intent, act with the
  // program-wide default. Never ask the same class of question twice.
  if (
    plan.action === "ASK_CLARIFICATION" &&
    pendingClarificationCount >= 1 &&
    hasActiveProgram &&
    actionableSignal
  ) {
    result.plan = makeProgramWideMutation(
      plan,
      {
        actionGuaranteeUpgrade: true,
        repairHint: "Applying with program-wide default after 1-round clarification limit.",
        originalMessage: message.slice(0, 120),
      },
      "[ActionGuarantee:ClarificationLimit] 1-round clarification limit reached — forcing APPLY_MUTATION program-wide"
    );
    result.finalAction = "APPLY_MUTATION";
    result.defaultScopeUsed = true;
    result.repairReason = "clarification_limit_1_round";

    console.log("[Action Guarantee Layer]", {
      message: message.slice(0, 80),
      activeProgramId,
      originalAction,
      finalAction: "APPLY_MUTATION",
      actionableSignal,
      defaultScopeUsed: true,
      repairReason: "clarification_limit_1_round",
      choiceCardShown: false,
      safetyBlocked: false,
    });

    logger.warn(
      { conversationId, originalAction, pendingClarificationCount, finalAction: "APPLY_MUTATION" },
      "[ActionGuarantee] Clarification limit reached — upgrading to APPLY_MUTATION program-wide"
    );

    return result;
  }

  // ── 4. GUIDANCE / NO_OP upgrade with extended signal detection ─────────────
  // The anti-loop layer covers the narrow verb set. This layer additionally
  // catches sport context, equipment, duration, intensity, style, and pain/fatigue.
  if (
    (plan.action === "GUIDANCE" || plan.action === "NO_OP") &&
    hasActiveProgram &&
    actionableSignal &&
    !GUIDANCE_ONLY_FAMILIES.has(plan.intentFamily)
  ) {
    result.plan = makeProgramWideMutation(
      plan,
      {
        actionGuaranteeUpgrade: true,
        repairHint: "Actionable signal with active program — applying program-wide.",
        originalMessage: message.slice(0, 120),
      },
      "[ActionGuarantee:GuidanceUpgrade] Extended actionable signal — upgrading GUIDANCE/NO_OP to APPLY_MUTATION"
    );
    result.finalAction = "APPLY_MUTATION";
    result.defaultScopeUsed = true;
    result.repairReason = "action_guarantee_upgrade";

    console.log("[Action Guarantee Layer]", {
      message: message.slice(0, 80),
      activeProgramId,
      originalAction,
      finalAction: "APPLY_MUTATION",
      actionableSignal,
      defaultScopeUsed: true,
      repairReason: "action_guarantee_upgrade",
      choiceCardShown: false,
      safetyBlocked: false,
    });

    logger.warn(
      { conversationId, originalAction, intentFamily: plan.intentFamily, finalAction: "APPLY_MUTATION" },
      "[ActionGuarantee] GUIDANCE/NO_OP upgraded — extended actionable signal with active program"
    );

    return result;
  }

  // ── Pass-through — no repair needed ──────────────────────────────────────
  console.log("[Action Guarantee Layer]", {
    message: message.slice(0, 80),
    activeProgramId,
    originalAction,
    finalAction: plan.action,
    actionableSignal,
    defaultScopeUsed: plan.defaultScopeUsed ?? false,
    repairReason: null,
    choiceCardShown: false,
    safetyBlocked: false,
  });

  return result;
}
