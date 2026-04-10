/**
 * Build Pipeline — Phase 2.3
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

/** User-visible labels for each stage. */
export const STAGE_LABELS: Record<BuildStage, string> = {
  understanding: "Understanding your request…",
  loading:       "Loading your program state…",
  classifying:   "Classifying the change type…",
  planning:      "Mapping out your modifications…",
  applying:      "Applying updates to your program…",
  validating:    "Validating your training structure…",
  saving:        "Saving your program…",
  complete:      "Done.",
};

/** Emitter function signature injected into pipeline steps. */
export type StageEmitter = (stage: BuildStage) => void;

/** Build a stage SSE event object ready to write to the stream. */
export function buildStageEvent(stage: BuildStage, intentType?: string): Record<string, unknown> {
  return {
    type: "stage",
    stage,
    step: STAGE_LABELS[stage],
    ...(intentType ? { intentType } : {}),
  };
}
