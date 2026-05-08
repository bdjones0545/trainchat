/**
 * Anti-Loop Reliability Layer
 *
 * Post-processes an ExecutionPlan from buildExecutionPlan() and applies safety
 * repairs to guarantee that every turn ends in real action. It is a pure
 * function — no DB calls, no side effects. All upgrades are logged via the
 * structured [AntiLoop Reliability] audit log.
 *
 * Repairs applied (in order):
 *  1. Stale pending detection — flags pending clarification for clearing when
 *     its target program no longer matches the active system.
 *  2. Clarification loop breaker — when the same pending intent has already
 *     asked for clarification ≥ 2 times, force APPLY_MUTATION.
 *  3. GUIDANCE → APPLY_MUTATION upgrade — when the planner returned GUIDANCE
 *     for a message with a clear action signal and an active program exists,
 *     and the family is not a legitimate guidance-only family.
 *  4. NO_OP → APPLY_MUTATION upgrade — when NO_OP fires with an active program
 *     and the message contains an action signal.
 */

import { logger } from "./logger";
import type { ExecutionPlan, ExecutionScope } from "./execution-planner";
import type { IntentFamily } from "./intent-family-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AntiLoopContext {
  message: string;
  program: object | null;
  activeSystemId: number | null;
  conversationId: number;
  pendingClarificationId: number | null;
  pendingClarificationTargetProgramId: number | null;
  pendingClarificationCount: number;
}

export interface AntiLoopResult {
  plan: ExecutionPlan;
  stalePendingCleared: boolean;
  defaultScopeUsed: boolean;
  loopBreakerUsed: boolean;
  noOpUpgraded: boolean;
  guidanceUpgraded: boolean;
  reason: string | null;
  shouldClearPending: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Intent families that legitimately produce GUIDANCE — never upgrade these.
const GUIDANCE_ONLY_FAMILIES = new Set<IntentFamily | null>([
  "greeting",
  "program_safety_question",
  "program_explanation_question",
  "coaching_question",
  null,
]);

// Action signal: user wants something changed (not just a question or greeting).
// Includes implicit modifiers ("harder", "easier", "more", "less") as well as verbs.
const ACTION_SIGNAL_RE =
  /\b(make|add|increase|decrease|reduce|replace|remove|shorten|lengthen|drop|cut|give|take|bump|raise|lower|swap|change|modify|update|adjust|intensify|simplify|tighten|dial|condense|expand|improve|strengthen|focus|shift|tune|adapt|target|fix|correct|build|convert|rebalance|harder|easier|heavier|lighter|faster|more|less|bigger|smaller|better|shorter|longer|stronger|quicker)\b/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasActionSignal(message: string): boolean {
  return ACTION_SIGNAL_RE.test(message);
}

function isStalePending(ctx: AntiLoopContext): boolean {
  if (!ctx.pendingClarificationId) return false;
  if (
    ctx.activeSystemId != null &&
    ctx.pendingClarificationTargetProgramId != null &&
    ctx.pendingClarificationTargetProgramId !== ctx.activeSystemId
  ) {
    return true;
  }
  return false;
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

export function applyAntiLoopReliabilityLayer(
  plan: ExecutionPlan,
  ctx: AntiLoopContext
): AntiLoopResult {
  const result: AntiLoopResult = {
    plan,
    stalePendingCleared: false,
    defaultScopeUsed: false,
    loopBreakerUsed: false,
    noOpUpgraded: false,
    guidanceUpgraded: false,
    reason: null,
    shouldClearPending: false,
  };

  const originalRoute = plan.action;
  const { message, program } = ctx;

  // ── 1. Stale pending detection ──────────────────────────────────────────────
  if (isStalePending(ctx)) {
    result.stalePendingCleared = true;
    result.shouldClearPending = true;
    result.reason = `Stale pending — targetProgramId ${ctx.pendingClarificationTargetProgramId} ≠ activeSystemId ${ctx.activeSystemId}`;
  }

  // ── 2. Clarification loop breaker ───────────────────────────────────────────
  // If the same pending intent has already asked for scope ≥ 2 times and
  // we're about to ask again, force a program-wide mutation instead.
  if (
    result.plan.action === "ASK_CLARIFICATION" &&
    ctx.pendingClarificationCount >= 2 &&
    program
  ) {
    result.plan = makeProgramWideMutation(
      result.plan,
      {
        loopBreaker: true,
        repairHint: "I'll apply this across the full program.",
      },
      `[AntiLoop:LoopBreaker] ${ctx.pendingClarificationCount} clarification rounds — forcing APPLY_MUTATION with program-wide default`
    );
    result.loopBreakerUsed = true;
    result.defaultScopeUsed = true;
    result.reason = result.reason ?? `Loop breaker: ${ctx.pendingClarificationCount} clarification rounds exceeded`;
  }

  // ── 3. GUIDANCE → APPLY_MUTATION upgrade ────────────────────────────────────
  // When the planner returned GUIDANCE but the user's message clearly signals
  // a desired change and an active program exists, act instead of advising.
  // Exception: leave legitimate guidance families (safety, coaching, greetings) alone.
  if (
    result.plan.action === "GUIDANCE" &&
    program &&
    !GUIDANCE_ONLY_FAMILIES.has(result.plan.intentFamily) &&
    hasActionSignal(message)
  ) {
    result.plan = makeProgramWideMutation(
      result.plan,
      {
        guidanceUpgrade: true,
        repairHint: "I'll use the current program as the target.",
      },
      "[AntiLoop:GuidanceUpgrade] Actionable message with active program — upgrading GUIDANCE to APPLY_MUTATION"
    );
    result.guidanceUpgraded = true;
    result.defaultScopeUsed = true;
    result.reason = result.reason ?? "GUIDANCE upgraded: active program + action signal detected";
  }

  // ── 4. NO_OP → APPLY_MUTATION upgrade ───────────────────────────────────────
  if (
    result.plan.action === "NO_OP" &&
    program &&
    hasActionSignal(message)
  ) {
    result.plan = makeProgramWideMutation(
      result.plan,
      {
        noOpUpgrade: true,
        repairHint: "I'll make the safest global adjustment.",
      },
      "[AntiLoop:NoOpUpgrade] NO_OP with active program + action signal — upgrading to APPLY_MUTATION"
    );
    result.noOpUpgraded = true;
    result.defaultScopeUsed = true;
    result.reason = result.reason ?? "NO_OP upgraded: active program + action signal detected";
  }

  // ── Structured audit log (only when a repair was applied) ───────────────────
  const anyRepair =
    result.stalePendingCleared ||
    result.loopBreakerUsed ||
    result.guidanceUpgraded ||
    result.noOpUpgraded;

  if (anyRepair) {
    console.log("[AntiLoop Reliability]", {
      message: message.slice(0, 80),
      activeProgramId: ctx.activeSystemId,
      originalRoute,
      finalRoute: result.plan.action,
      intentFamily: result.plan.intentFamily,
      pendingClarificationId: ctx.pendingClarificationId,
      pendingClarificationCount: ctx.pendingClarificationCount,
      stalePendingCleared: result.stalePendingCleared,
      defaultScopeUsed: result.defaultScopeUsed,
      loopBreakerUsed: result.loopBreakerUsed,
      noOpUpgraded: result.noOpUpgraded,
      guidanceUpgraded: result.guidanceUpgraded,
      reason: result.reason,
    });

    logger.warn(
      {
        conversationId: ctx.conversationId,
        originalRoute,
        finalRoute: result.plan.action,
        intentFamily: result.plan.intentFamily,
        pendingClarificationCount: ctx.pendingClarificationCount,
        stalePendingCleared: result.stalePendingCleared,
        loopBreakerUsed: result.loopBreakerUsed,
        guidanceUpgraded: result.guidanceUpgraded,
        noOpUpgraded: result.noOpUpgraded,
        reason: result.reason,
      },
      "[AntiLoop Reliability] Plan repaired before execution"
    );
  }

  return result;
}
