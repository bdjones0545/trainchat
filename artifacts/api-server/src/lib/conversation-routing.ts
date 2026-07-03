import type { ExecutionAction, ExecutionMutation } from "./execution-planner";
import { normalizeToIntentFamily, type IntentFamily } from "./intent-family-engine";
import type { ResponseMode } from "./response-templates";
import type { AgentSettingsContext } from "./agent-settings-resolver";
import type { FocusMode } from "./focus-engines/engine-interface";

// ─── Response mode ────────────────────────────────────────────────────────────

/**
 * Maps an execution plan action + intent family to the ResponseMode string that
 * governs which system-prompt template is selected for the AI call.
 *
 * Pure — no side effects. Duplicated inline in both the SSE and non-SSE handlers;
 * extracted here so the mapping is testable and lives in exactly one place.
 */
export function resolveResponseMode(
  action: ExecutionAction,
  intentFamily: IntentFamily | null | undefined,
): ResponseMode {
  if (action === "ASK_CLARIFICATION") return "CLARIFICATION_RESPONSE";
  if (action === "GUIDANCE") {
    if (intentFamily === "program_safety_question") return "PROGRAM_SAFETY_RESPONSE";
    if (intentFamily === "program_explanation_question") return "PROGRAM_EXPLANATION_RESPONSE";
    if (intentFamily === "coaching_question") return "COACHING_GUIDANCE_RESPONSE";
    if (intentFamily === "greeting") return "GREETING_RESPONSE";
    return "COACHING_RESPONSE";
  }
  return "EXECUTION_RESPONSE";
}

// ─── Mutation type classification ─────────────────────────────────────────────

/**
 * Classifies a mutation's raw type string into the two-tier structural/minor
 * taxonomy used by the orchestrator and agent-settings approval gates.
 *
 * - "structural" → add / remove / swap   (engage the Architect; require approval when gated)
 * - "minor"      → progression / regression  (fast DIRECT_EDIT path)
 * - undefined    → no mutation, or type not recognized
 *
 * Pure — no side effects.
 */
export function classifyOrchMutationType(
  mutationType: ExecutionMutation["type"] | null | undefined,
): "structural" | "minor" | undefined {
  if (mutationType === "add" || mutationType === "remove" || mutationType === "swap") {
    return "structural";
  }
  if (mutationType === "progression" || mutationType === "regression") {
    return "minor";
  }
  return undefined;
}

// ─── Approval gate ────────────────────────────────────────────────────────────

/**
 * The set of intent families that trigger the deload approval gate.
 * Kept as a const so tests can import it and the gate definition lives in one place.
 */
export const DELOAD_INTENT_FAMILIES: ReadonlySet<IntentFamily> = new Set<IntentFamily>([
  "fatigue_management",
  "recovery_focus",
]);

/**
 * Why the edit engine was bypassed, or null if it should proceed normally.
 *
 * - "suggest_only"              — executionPermission is "suggest_only"; AI describes the change instead
 * - "requireApprovalDeload"     — deload/recovery intent with requireApprovalDeload=true
 * - "requireApprovalStructural" — structural mutation (add/remove/swap) with requireApprovalStructural=true
 * - null                        — no gate triggered; proceed with edit engine
 */
export type EditEngineBypassReason =
  | "suggest_only"
  | "requireApprovalDeload"
  | "requireApprovalStructural"
  | null;

/**
 * Determines whether the edit engine should be bypassed for an APPLY_MUTATION turn.
 *
 * Encodes the three approval gates that appear identically in both the SSE and
 * non-SSE APPLY_MUTATION switch cases. Pure — no side effects, no logging.
 * The caller is responsible for logging and for the `break` that routes to the AI path.
 *
 * @param agentSettings  Resolved agent-settings context for this request
 * @param intentFamily   execPlan.intentFamily (may be null/undefined)
 * @param orchMutationType  Pre-classified mutation tier from classifyOrchMutationType()
 */
export function shouldBypassEditEngine(
  agentSettings: AgentSettingsContext,
  intentFamily: IntentFamily | null | undefined,
  orchMutationType: "structural" | "minor" | undefined,
): EditEngineBypassReason {
  if (agentSettings.behavior.executionPermission === "suggest_only") {
    return "suggest_only";
  }

  if (
    agentSettings.behavior.requireApprovalDeload &&
    intentFamily != null &&
    DELOAD_INTENT_FAMILIES.has(intentFamily)
  ) {
    return "requireApprovalDeload";
  }

  if (agentSettings.behavior.requireApprovalStructural && orchMutationType === "structural") {
    return "requireApprovalStructural";
  }

  return null;
}

// ─── Pending-clarification family resolution ──────────────────────────────────

/**
 * Resolves the intent family to store in a pending-clarification record.
 *
 * The execution planner occasionally emits `"clarification_required"` as a
 * fallback `intentFamily` when it cannot classify the request. Persisting that
 * sentinel in the DB breaks `resolveClarification` on the next turn (FIX 1).
 * When the fallback is detected, this function re-runs `normalizeToIntentFamily`
 * to recover the real family from the raw user message.
 *
 * Present in both the non-SSE and SSE ASK_CLARIFICATION branches with only the
 * `focusMode` argument differing; extracted here so the fix lives in one place.
 *
 * @param planIntentFamily  `execPlan.intentFamily` cast to string (may be null/undefined)
 * @param userMessage       Raw user message content
 * @param focusMode         Active focus mode for the session (null → no mode override)
 */
export function resolveClarificationPendingFamily(
  planIntentFamily: string | null | undefined,
  userMessage: string,
  focusMode: FocusMode | null | undefined,
): string {
  if (planIntentFamily && planIntentFamily !== "clarification_required") {
    return planIntentFamily;
  }
  const recovered = normalizeToIntentFamily(userMessage, focusMode ?? undefined);
  return recovered.family !== "clarification_required" ? recovered.family : "clarification_required";
}
