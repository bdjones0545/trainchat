/**
 * MutationExecutionService — Phase 2 extraction
 *
 * Provides typed adapter functions wrapping the deterministic edit pipeline.
 * The seam between interpretEditRequest and applyEditPlan must be preserved in
 * conversations.ts because the architect validation gate runs between them.
 *
 * Two exported functions:
 *   interpretMutationRequest — wraps interpretEditRequest with typed params
 *   executeDirectEdit        — calls both steps (use when no validation gate needed)
 *
 * NOT responsible for:
 *   - Routing gates (suggest_only, requireApprovalDeload, requireApprovalStructural)
 *   - Architecture validation gate (validateStructuralChanges) — remains in route
 *   - Change log creation — called after this service returns
 *   - SSE event emission or DB message insert
 *
 * Phase 3 target:
 *   Move the validation gate and change log creation into this service to create
 *   a fully self-contained ExecuteMutationResult that routes treat as a black box.
 */

import { interpretEditRequest } from "../lib/edit-intent-service";
import { applyEditPlan, type EditResult } from "../lib/edit-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MutationRequestParams {
  /** User message, possibly already context-resolved by ConversationContextResolver. */
  effectiveMessage: string;
  /** Full training system from getFullTrainingSystem(). */
  fullSystem: unknown;
  /** Resolved edit target (session/exercise scope). May be null for program-wide edits. */
  target: unknown;
  /** Adaptation context (readiness, fatigue). */
  adaptationCtx?: unknown;
  /** Decision memory context for this system. */
  decisionMemoryContext?: string | undefined;
}

export interface MutationExecutionParams extends MutationRequestParams {
  /** Intent family from the execution plan — propagated to applyEditPlan. */
  intentFamily?: string;
}

export interface MutationExecutionResult {
  editPlan: Awaited<ReturnType<typeof interpretEditRequest>>;
  editResult: EditResult;
}

// ── interpretMutationRequest ──────────────────────────────────────────────────
// Use this when the architect validation gate must run between interpretation
// and application. The caller calls applyEditPlan directly after the gate.

export async function interpretMutationRequest(
  params: MutationRequestParams,
): Promise<Awaited<ReturnType<typeof interpretEditRequest>>> {
  return interpretEditRequest(
    params.effectiveMessage,
    params.fullSystem as Parameters<typeof interpretEditRequest>[1],
    params.target as Parameters<typeof interpretEditRequest>[2],
    params.adaptationCtx as Parameters<typeof interpretEditRequest>[3],
    params.decisionMemoryContext,
  );
}

// ── executeDirectEdit ─────────────────────────────────────────────────────────
// Use when no validation gate is needed (e.g. simple attribute updates where
// hasStructuralChanges() returned false and validation is skipped).
//
// IMPORTANT: Do NOT retry. If applyEditPlan writes to DB and then throws,
// retrying would double-add exercises or trigger the duplicate-safe resolver.

export async function executeDirectEdit(
  params: MutationExecutionParams,
): Promise<MutationExecutionResult> {
  const editPlan = await interpretEditRequest(
    params.effectiveMessage,
    params.fullSystem as Parameters<typeof interpretEditRequest>[1],
    params.target as Parameters<typeof interpretEditRequest>[2],
    params.adaptationCtx as Parameters<typeof interpretEditRequest>[3],
    params.decisionMemoryContext,
  );

  const editResult = await applyEditPlan(editPlan, params.intentFamily);

  return { editPlan, editResult };
}
