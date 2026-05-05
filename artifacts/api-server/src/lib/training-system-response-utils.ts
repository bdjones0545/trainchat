/**
 * Training System Response Utilities
 *
 * Pure helpers extracted from conversations.ts to reduce duplication between
 * SSE and non-SSE mutation response paths.
 *
 * These functions produce the standard field shapes that appear in both the
 * JSON response body and the SSE done() event so both paths stay in sync.
 */

import type { PropagationSummary } from "./propagation-engine";

// ─── Auto-create hydration fields ─────────────────────────────────────────

/**
 * Returns the extra fields to spread into a mutation response when the
 * training system was auto-created from a chat program before the edit
 * was applied.
 *
 * The client reads these fields to hydrate the LiveProgramPanel without a
 * full page reload.
 */
export function buildAutoCreateHydrationFields(
  systemId: number,
  wasAutoCreated: boolean
): Record<string, unknown> {
  if (!wasAutoCreated) return {};
  return {
    systemSaved: true,
    systemId,
    trainingSystemId: systemId,
  };
}

// ─── Propagation metadata ─────────────────────────────────────────────────

/** Client-facing propagation status label. */
export type PropagationStatusLabel = "full" | "partial" | "none";

/**
 * Maps a PropagationSummary status to the three-value client label used in
 * systemEdit.propagationStatus and change log decisionMetadata.
 */
export function toPropagationStatusLabel(
  summary: PropagationSummary | undefined
): PropagationStatusLabel {
  if (!summary) return "none";
  if (summary.status === "propagated") return "full";
  if (summary.status === "partial") return "partial";
  return "none";
}

/**
 * Builds the propagation metadata block for change log decisionMetadata.
 */
export function buildPropagationDecisionMetadata(
  summary: PropagationSummary | undefined
): {
  propagated: boolean;
  propagationStatus: PropagationStatusLabel;
  propagationCheckedCount: number;
  propagationConfirmedCount: number;
  propagationFailedCount: number;
} {
  const label = toPropagationStatusLabel(summary);
  return {
    propagated: label !== "none",
    propagationStatus: label,
    propagationCheckedCount:
      (summary?.appliedWeeks?.length ?? 0) + (summary?.skippedWeeks?.length ?? 0),
    propagationConfirmedCount: summary?.appliedWeeks?.length ?? 0,
    propagationFailedCount: summary?.skippedWeeks?.length ?? 0,
  };
}

// ─── Standard mutation systemEdit shape ──────────────────────────────────

/**
 * Assembles the `systemEdit` field shape for mutation success responses.
 * Used in both non-SSE (res.json) and SSE (done()) handlers to ensure
 * the shapes are identical.
 */
export function buildMutationSystemEditShape(params: {
  applied: true;
  route: "direct_edit" | "clarification_followup" | "hierarchical_refine";
  scope: string;
  changedIds: unknown[];
  changeSummary: string;
  changeTargets: unknown[];
  systemId: number;
  changeLogId: number | undefined;
  propagationStatus: PropagationStatusLabel;
  architectureWarnings: string[] | undefined;
  verificationStatus: string;
  requiresReview: boolean;
}): Record<string, unknown> {
  return {
    applied: params.applied,
    route: params.route,
    scope: params.scope,
    changedIds: params.changedIds,
    changeSummary: params.changeSummary,
    changeTargets: params.changeTargets,
    systemId: params.systemId,
    changeLogId: params.changeLogId,
    propagationStatus: params.propagationStatus,
    ...(params.architectureWarnings?.length ? { architectureWarnings: params.architectureWarnings } : {}),
    verificationStatus: params.verificationStatus,
    requiresReview: params.requiresReview,
  };
}
