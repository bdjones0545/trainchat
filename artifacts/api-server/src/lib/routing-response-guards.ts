/**
 * Routing Response Guards
 *
 * Pure utility functions extracted from conversations.ts to reduce duplication
 * between SSE and non-SSE handlers.
 *
 * ── Guards ──────────────────────────────────────────────────────────────────
 *
 * isMutationReconciliationMismatch — detects when classifyIntent says "edit"
 * but buildExecutionPlan says GUIDANCE/NO_OP. The reconciliation guard in both
 * handlers uses this to block silent AI fallback on mutation-like inputs.
 *
 * isStructuredUIRequest — detects requests that should be rejected at the HTTP
 * layer before any routing logic runs. Structured UI actions (chip mutations,
 * refine panel) have their own dedicated endpoints; they must never arrive at
 * the CEO chat handler.
 *
 * buildMutationFailureMessage — canonical user-facing failure message for when
 * an edit pipeline throws or applies 0 changes.
 */

// ─── Reconciliation guard ──────────────────────────────────────────────────

/** Intent types that imply a program mutation was requested. */
const MUTATION_INTENT_TYPES = new Set([
  "EDIT_PROGRAM",
  "ADJUST_FOR_PAIN",
  "ADJUST_FOR_READINESS",
]);

/** Execution plan actions that do NOT mutate the program. */
const NON_MUTATION_PLAN_ACTIONS = new Set(["GUIDANCE", "NO_OP"]);

/**
 * Returns true when classifyIntent says "mutation" but buildExecutionPlan
 * resolved to GUIDANCE or NO_OP. This signals a routing disagreement that
 * must be blocked — the reconciliation guard returns a clarification instead
 * of falling through to the AI response path.
 */
export function isMutationReconciliationMismatch(
  intentType: string,
  execPlanAction: string
): boolean {
  return (
    MUTATION_INTENT_TYPES.has(intentType) &&
    NON_MUTATION_PLAN_ACTIONS.has(execPlanAction)
  );
}

// ─── Structured UI guard ───────────────────────────────────────────────────

export interface StructuredUIGuardInput {
  refineSource?: string | null;
  scopeOverride?: unknown;
  structuredIntent?: unknown;
  uiAction?: unknown;
  trainingSystemId?: unknown;
}

/**
 * Returns true when the request body looks like it originated from a
 * structured UI action (chip, refine panel, direct edit) that should have
 * gone to /api/training-system/edit, not the chat handler.
 *
 * The chat handler MUST reject these with HTTP 400 to prevent silent fallback
 * to AI chat for mutation paths.
 */
export function isStructuredUIRequest(body: StructuredUIGuardInput): boolean {
  if (body.refineSource === "program_refine_panel") return true;
  if (body.scopeOverride != null) return true;
  if (body.structuredIntent != null) return true;
  if (body.uiAction != null) return true;
  // trainingSystemId + refineSource combo is always a chip/refine action
  if (body.trainingSystemId != null && body.refineSource != null) return true;
  return false;
}

// ─── Mutation failure message ──────────────────────────────────────────────

/**
 * Returns the canonical user-facing message for a failed/unapplied edit.
 * Used in both the non-SSE catch block and the SSE CLARIFICATION_FOLLOWUP
 * failure path so messaging is consistent.
 */
export function buildMutationFailureMessage(context: "clarification_followup" | "direct_edit"): string {
  if (context === "clarification_followup") {
    return "I couldn't apply that edit, so I left your program unchanged. Try rephrasing or being more specific about which exercise or day you'd like changed.";
  }
  return "I wasn't able to apply that change — your program hasn't been modified. Try being more specific: include the exercise name, which day it's in, and exactly what you'd like changed.";
}
