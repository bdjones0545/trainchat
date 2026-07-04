/**
 * Surgical external edit (Phase 2.4) — pure orchestrator.
 *
 * Applies an external edit through the internal surgical pipeline:
 *   load system → serialize for prompt → interpretEditRequest → applyEditPlan
 *   → reload system → reserialize to a ProgramStructure blob.
 *
 * Every collaborator is INJECTED (only type-only engine imports here), so this
 * is unit-testable without a DB/engine and does not pull the engine at import.
 * It NEVER throws: any failure returns `null`, and the caller falls back to the
 * existing LLM regeneration path. Persistence (version snapshot + programData
 * overwrite + response) stays in the route, using the existing 1C audit pattern.
 *
 * See docs/phase-2-external-surgical-edit.md §10 (PR 2.4).
 */

import type { EditPlan } from "../edit-intent-service";
import type { EditResult } from "../edit-engine";
import type { FullTrainingSystem, SerializedProgram } from "./adapter";

export interface SurgicalEditParams {
  trainingSystemId: number;
  instruction: string;
  scope?: string | null;
}

export interface SurgicalEditDeps {
  loadFullSystem: (systemId: number) => Promise<FullTrainingSystem>;
  serializeSystemForPrompt: (system: NonNullable<FullTrainingSystem>) => string;
  interpretEditRequest: (userRequest: string, systemContext: string) => Promise<EditPlan | null>;
  applyEditPlan: (
    plan: EditPlan,
    intentFamily: string | undefined,
    trainingSystemId: number,
  ) => Promise<EditResult>;
  serializeToProgram: (system: NonNullable<FullTrainingSystem>) => SerializedProgram | null;
  onError?: (err: unknown, stage: string) => void;
}

export interface SurgicalEditResult {
  updatedProgram: SerializedProgram;
  changes: string[];
  coachSummary: string;
}

/** Build the NL instruction handed to interpretEditRequest. */
export function buildSurgicalEditMessage(instruction: string, scope?: string | null): string {
  return scope ? `${instruction} (scope: ${scope})` : instruction;
}

/**
 * Attempt a surgical edit. Returns the reserialized program + change summary on
 * success, or `null` on ANY failure/ambiguity (caller must fall back). Never
 * throws.
 */
export async function maybeApplySurgicalExternalEdit(
  params: SurgicalEditParams,
  deps: SurgicalEditDeps,
): Promise<SurgicalEditResult | null> {
  const { trainingSystemId, instruction, scope } = params;

  try {
    const preSystem = await deps.loadFullSystem(trainingSystemId);
    if (!preSystem) {
      deps.onError?.(new Error("training system not found"), "load");
      return null;
    }

    const systemContext = deps.serializeSystemForPrompt(preSystem);
    const editPlan = await deps.interpretEditRequest(
      buildSurgicalEditMessage(instruction, scope),
      systemContext,
    );
    if (!editPlan) {
      // Could not interpret into a structured plan → fall back to regeneration.
      deps.onError?.(new Error("no edit plan produced"), "interpret");
      return null;
    }

    const editResult = await deps.applyEditPlan(editPlan, undefined, trainingSystemId);
    if (!editResult || editResult.appliedCount <= 0) {
      // Nothing was applied surgically → fall back so the user still gets an edit.
      deps.onError?.(new Error("no changes applied"), "apply");
      return null;
    }

    const postSystem = await deps.loadFullSystem(trainingSystemId);
    if (!postSystem) {
      deps.onError?.(new Error("training system missing after apply"), "reload");
      return null;
    }

    const updatedProgram = deps.serializeToProgram(postSystem);
    if (!updatedProgram) {
      deps.onError?.(new Error("could not reserialize system"), "serialize");
      return null;
    }

    return {
      updatedProgram,
      changes: editResult.details ?? [],
      coachSummary: editResult.changeSummary ?? "Program updated.",
    };
  } catch (err) {
    deps.onError?.(err, "exception");
    return null;
  }
}
