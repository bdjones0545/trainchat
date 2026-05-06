// ======================================================
// TRAINCHAT MUTATION OUTCOME FINALIZER
// ======================================================
//
// Universal contract for all main-chat shouldMutate=true turns.
//
// Rule — exactly one of these two outcomes is allowed:
//
//   A. mutation_applied
//      appliedCount > 0 OR changeLogId != null OR changeTargets.length > 0
//      → systemEdit.applied = true, auditStatus = PASS (or WARNING)
//
//   B. mutation_not_applied
//      appliedCount === 0, no changeLogId, no changeTargets
//      → systemEdit.applied = false, auditStatus = FAIL, failureReason set
//
// There is no third state (no_state_change + PASS).
//
// Usage: call finalizeMutationOutcome() from every shouldMutate=true
// path (SSE direct edit, SSE hierarchical, SSE clarification followup,
// non-SSE equivalents, catch blocks). Include the returned `mutationOutcome`
// in the complete event / JSON response for the Agent Turn Report.
// ======================================================

// ─── Outcome types ─────────────────────────────────────────────────────────────

export type MutationOutcomeType = "mutation_applied" | "mutation_not_applied";
export type MutationAuditStatus = "PASS" | "FAIL" | "WARNING";

// ─── No-change reason classification ──────────────────────────────────────────
//
// Maps internal reasonCategory codes emitted by the edit engine to
// simple user-facing explanations.  Used when appliedCount === 0.

export const NO_CHANGE_REASON_MESSAGES: Record<string, string> = {
  EMPTY_EDIT_PLAN:          "I understood the request, but no executable edit plan was produced.",
  NO_MATCHING_TARGET:       "I couldn't find the exercise or session to change.",
  UNSUPPORTED_MUTATION:     "That edit type isn't supported yet.",
  SCOPE_RESOLUTION_FAILED:  "I couldn't safely identify where to apply the change.",
  VERIFICATION_FAILED:      "The edit did not pass verification, so your program was left unchanged.",
  UNKNOWN:                  "I couldn't safely apply that edit.",
};

// Maps editFailure.reason codes (from the route handler) to reasonCategory keys.
export const EDIT_FAILURE_REASON_TO_CATEGORY: Record<string, string> = {
  no_changes_produced:  "NO_MATCHING_TARGET",
  no_changes_applied:   "EMPTY_EDIT_PLAN",
  verification_failed:  "VERIFICATION_FAILED",
  pipeline_error:       "UNKNOWN",
  edit_pipeline_error:  "UNKNOWN",
};

// ─── Response text repair ──────────────────────────────────────────────────────
//
// If the coaching response contradicts the actual outcome, repair it.
// Only fires on obvious conflicts — does not modify nuanced responses.

const SUCCESS_LANGUAGE_RE =
  /\b(check the Program tab|what was updated|changed your program|I applied the change|edit applied|changes (applied|saved)|has been (applied|updated))\b/i;

const FAILURE_LANGUAGE_RE =
  /\b(wasn'?t able to apply|hasn'?t been modified|couldn'?t apply|didn'?t apply)\b/i;

// ─── Input / Output ────────────────────────────────────────────────────────────

export interface MutationOutcomeInput {
  /** Number of DB records changed (from applyEditPlan result). */
  appliedCount: number;
  /** Change log entry ID — set after createChangeLogEntry succeeds. Null if write never happened. */
  changeLogId: number | null;
  /** Change targets from applyEditPlan — any object with at least a `type` field. */
  changeTargets?: Array<{ type: string }>;
  /** Verification status string from applyEditPlan. */
  verificationStatus?: string;
  /** The coaching response text shown to the user. Used for text repair. */
  responseText: string;
  /** Internal failure category from the edit engine (EMPTY_EDIT_PLAN, NO_MATCHING_TARGET, …). */
  reasonCategory?: string;
  /** editFailure.reason from the route handler — used to resolve reasonCategory if not provided. */
  editFailureReason?: string;
  /** Explicit user-facing failure reason — overrides reasonCategory lookup. */
  explicitFailureReason?: string;
  /** Edit scope from the edit plan. */
  scope?: string;
  /** Mutation type from the execution plan. */
  mutationType?: string;
  /** Intent family from the execution plan. */
  intentFamily?: string;
}

export interface MutationOutcomeSystemEdit {
  applied: boolean;
  appliedCount: number;
  changeLogId: number | null;
  changeTargets: Array<{ type: string }>;
  scope?: string;
  mutationType?: string;
  intentFamily?: string;
  /** User-facing explanation of why the mutation did not happen (mutation_not_applied only). */
  failureReason?: string;
  /** Non-fatal warning about verification or propagation (mutation_applied only). */
  warning?: string;
}

export interface MutationOutcomeResult {
  outcomeType: MutationOutcomeType;
  systemEdit: MutationOutcomeSystemEdit;
  /** Coaching response, repaired if it contradicted the actual outcome. */
  safeResponseText: string;
  toastType: "success" | "error" | "none";
  auditStatus: MutationAuditStatus;
  /** Same as systemEdit.failureReason — surfaced at the top level for quick access. */
  failureReason?: string;
}

// ─── Finalizer ─────────────────────────────────────────────────────────────────

export function finalizeMutationOutcome(input: MutationOutcomeInput): MutationOutcomeResult {
  const {
    appliedCount,
    changeLogId,
    changeTargets = [],
    verificationStatus,
    responseText,
    reasonCategory,
    editFailureReason,
    explicitFailureReason,
    scope,
    mutationType,
    intentFamily,
  } = input;

  // ── 1. Determine outcome type — DB evidence wins ─────────────────────────
  const mutationApplied =
    appliedCount > 0 ||
    changeLogId !== null ||
    changeTargets.length > 0;

  const outcomeType: MutationOutcomeType =
    mutationApplied ? "mutation_applied" : "mutation_not_applied";

  // ── 2. Classify failure reason ────────────────────────────────────────────
  let resolvedFailureReason: string | undefined;
  if (outcomeType === "mutation_not_applied") {
    if (explicitFailureReason) {
      resolvedFailureReason = explicitFailureReason;
    } else {
      const category =
        reasonCategory ??
        (editFailureReason ? (EDIT_FAILURE_REASON_TO_CATEGORY[editFailureReason] ?? "UNKNOWN") : "UNKNOWN");
      resolvedFailureReason = NO_CHANGE_REASON_MESSAGES[category] ?? NO_CHANGE_REASON_MESSAGES.UNKNOWN;
    }
  }

  // ── 3. Repair response text ───────────────────────────────────────────────
  let safeResponseText = responseText;
  if (outcomeType === "mutation_not_applied" && SUCCESS_LANGUAGE_RE.test(responseText)) {
    safeResponseText = `I didn't change your program yet — ${resolvedFailureReason ?? NO_CHANGE_REASON_MESSAGES.UNKNOWN}`;
  } else if (outcomeType === "mutation_applied" && FAILURE_LANGUAGE_RE.test(responseText)) {
    safeResponseText = `Done — your program has been updated.`;
  }

  // ── 4. Audit status ───────────────────────────────────────────────────────
  let auditStatus: MutationAuditStatus;
  let warning: string | undefined;

  if (outcomeType === "mutation_applied") {
    if (verificationStatus === "partial" || verificationStatus === "unclear") {
      auditStatus = "WARNING";
      warning = "Mutation applied but verification was inconclusive.";
    } else {
      auditStatus = "PASS";
    }
  } else {
    auditStatus = "FAIL";
  }

  return {
    outcomeType,
    systemEdit: {
      applied: mutationApplied,
      appliedCount,
      changeLogId,
      changeTargets,
      scope,
      mutationType,
      intentFamily,
      failureReason: resolvedFailureReason,
      warning,
    },
    safeResponseText,
    toastType: outcomeType === "mutation_applied" ? "success" : "error",
    auditStatus,
    failureReason: resolvedFailureReason,
  };
}
