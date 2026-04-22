/**
 * Build Pipeline — Phase 2.4
 *
 * Every program creation or modification goes through 8 named stages.
 * These are NOT cosmetic labels — each stage corresponds to real work
 * happening in the system. The SSE stream endpoint emits a stage event
 * at each boundary so the UI always reflects what is actually happening.
 *
 * Stages:
 *   1. understanding — parsing user intent, extracting key variables
 *   2. loading       — fetching conversation history + active program state
 *   3. classifying   — intent classification, change-type decision
 *   4. planning      — deciding what to change (which days, exercises, volume)
 *   5. applying      — modifying the program object (AI call or edit engine)
 *   6. validating    — quality checks: balance, recovery, safety, constraints
 *   7. saving        — persisting updated program, generating change summary
 *   8. complete      — UI update triggered (complete SSE event sent)
 *
 * Action types from execPlan.action (new execution planner):
 *   GUIDANCE         — Q&A, coaching questions, explanations, general advice
 *   APPLY_MUTATION   — Edit/adjust an existing program
 *   REBUILD_PROGRAM  — Structural rebuild of an existing program
 *   ASK_CLARIFICATION — Request clarification before acting
 *   NO_OP            — No operation, conversational response
 *
 * Legacy action types from decision.ts (still used in some paths):
 *   PROGRAM_GENERATION — Build a new program from scratch
 *   STRUCTURAL_REBUILD — Full architectural restructure
 *   DIRECT_MUTATION    — Atomic surgical edit
 *   SESSION_ADJUSTMENT — Session-scoped adjustment for pain/readiness
 */

export type BuildStage =
  | "understanding"
  | "loading"
  | "classifying"
  | "planning"
  | "applying"
  | "validating"
  | "saving"
  | "complete";

/** Default user-visible labels — used when no action-specific label exists. */
export const STAGE_LABELS: Record<BuildStage, string> = {
  understanding: "Reading your request…",
  loading:       "Loading context…",
  classifying:   "Mapping out what needs to change…",
  planning:      "Structuring your training split…",
  applying:      "Applying updates to your program…",
  validating:    "Validating your training structure…",
  saving:        "Saving your program…",
  complete:      "Done.",
};

/**
 * Action-type specific stage labels.
 * Covers both legacy decision.ts action types and new execPlan.action types.
 * Falls back to STAGE_LABELS when no specific label is defined.
 */
const ACTION_STAGE_LABELS: Record<string, Partial<Record<BuildStage, string>>> = {

  // ── Legacy action types (decision.ts) ──────────────────────────────────────

  PROGRAM_GENERATION: {
    loading:    "Setting up from scratch…",
    classifying:"Analyzing your request…",
    planning:   "Structuring your training split…",
    applying:   "Selecting exercises and balancing volume…",
    validating: "Validating your training structure…",
    saving:     "Saving your program…",
  },
  STRUCTURAL_REBUILD: {
    loading:    "Loading your current program…",
    classifying:"Mapping out what needs to change…",
    planning:   "Restructuring your weekly split…",
    applying:   "Rebuilding your program architecture…",
    validating: "Validating the new structure…",
    saving:     "Saving your program…",
  },
  DIRECT_MUTATION: {
    loading:    "Loading your current program…",
    classifying:"Identifying what to change…",
    planning:   "Planning the adjustment…",
    applying:   "Applying the change…",
    validating: "Checking the update…",
    saving:     "Saving your program…",
  },
  SESSION_ADJUSTMENT: {
    loading:    "Loading your current program…",
    classifying:"Identifying movements to modify…",
    planning:   "Planning safe alternatives…",
    applying:   "Applying the modifications…",
    validating: "Checking the update…",
    saving:     "Saving your program…",
  },
  PROGRAM_RETRIEVAL: {
    loading:    "Fetching your program…",
    saving:     "Loading into the panel…",
  },

  // ── New execPlan.action types ────────────────────────────────────────────────

  /** Q&A, coaching questions, explanations, general advice — no program mutation. */
  GUIDANCE: {
    understanding: "Reviewing your question…",
    loading:       "Gathering context…",
    classifying:   "Organizing the key factors…",
    planning:      "Preparing the best answer…",
    applying:      "Thinking this through…",
    validating:    "Reviewing the response…",
    saving:        "Wrapping up…",
  },

  /** Targeted edit or adjustment to an existing program. */
  APPLY_MUTATION: {
    loading:    "Loading your current program…",
    classifying:"Identifying what to change…",
    planning:   "Planning the adjustment…",
    applying:   "Applying your changes…",
    validating: "Checking the update…",
    saving:     "Saving your changes…",
  },

  /** Structural rebuild of an existing program with new split or goal. */
  REBUILD_PROGRAM: {
    loading:    "Loading your current program…",
    classifying:"Mapping the new structure…",
    planning:   "Restructuring your weekly split…",
    applying:   "Rebuilding your program…",
    validating: "Validating the new structure…",
    saving:     "Saving your program…",
  },

  /** Request more info before acting — short-circuit path. */
  ASK_CLARIFICATION: {
    understanding: "Reviewing your request…",
    loading:       "Checking context…",
    classifying:   "Identifying what I need to know…",
    planning:      "Forming a question…",
    applying:      "Preparing my question…",
    validating:    "Almost ready…",
    saving:        "Almost done…",
  },

  /** No-op or purely conversational response. */
  NO_OP: {
    understanding: "Reading your message…",
    loading:       "Gathering context…",
    classifying:   "Reviewing the situation…",
    planning:      "Preparing a response…",
    applying:      "Working on it…",
    validating:    "Reviewing the response…",
    saving:        "Wrapping up…",
  },
};

/** Emitter function signature injected into pipeline steps. */
export type StageEmitter = (stage: BuildStage) => void;

/**
 * Build a stage SSE event object ready to write to the stream.
 * Picks the most specific label available: actionType > default.
 */
export function buildStageEvent(
  stage: BuildStage,
  intentType?: string,
  actionType?: string,
): Record<string, unknown> {
  const actionLabels = actionType ? ACTION_STAGE_LABELS[actionType] : null;
  const step = actionLabels?.[stage] ?? STAGE_LABELS[stage];

  return {
    type: "stage",
    stage,
    step,
    ...(intentType  ? { intentType }  : {}),
    ...(actionType  ? { actionType }  : {}),
  };
}
