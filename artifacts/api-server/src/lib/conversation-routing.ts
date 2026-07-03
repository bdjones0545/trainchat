import type { ExecutionAction, ExecutionMutation } from "./execution-planner";
import type { IntentFamily } from "./intent-family-engine";
import type { ResponseMode } from "./response-templates";

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
