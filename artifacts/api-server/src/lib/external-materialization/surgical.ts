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

/**
 * Discriminated outcome (Phase 2.6). `committed` distinguishes failures that
 * happened AFTER a relational mutation may have committed (must NOT fall back to
 * regeneration — that would leave the blob and training system divergent) from
 * failures before any relational change (safe to fall back).
 */
export type SurgicalEditOutcome =
  | { ok: true; result: SurgicalEditResult }
  | { ok: false; committed: boolean; stage: string };

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
): Promise<SurgicalEditOutcome> {
  const { trainingSystemId, instruction, scope } = params;

  // ── Pre-mutation stages: a failure here means nothing was committed → safe
  //    to fall back to the regeneration path.
  let editPlan: Awaited<ReturnType<SurgicalEditDeps["interpretEditRequest"]>>;
  try {
    const preSystem = await deps.loadFullSystem(trainingSystemId);
    if (!preSystem) {
      deps.onError?.(new Error("training system not found"), "load");
      return { ok: false, committed: false, stage: "load" };
    }
    const systemContext = deps.serializeSystemForPrompt(preSystem);
    editPlan = await deps.interpretEditRequest(
      buildSurgicalEditMessage(instruction, scope),
      systemContext,
    );
    if (!editPlan) {
      deps.onError?.(new Error("no edit plan produced"), "interpret");
      return { ok: false, committed: false, stage: "interpret" };
    }
  } catch (err) {
    deps.onError?.(err, "pre");
    return { ok: false, committed: false, stage: "pre" };
  }

  // ── Mutation: applyEditPlan runs its writes in one transaction under a
  //    per-system advisory lock (PR #15/F8, F9) and converts write failures to
  //    a zero-applied result, so a throw here is unexpected. Kept defensive:
  //    treat an actual throw as possibly-committed to avoid a divergent fallback.
  let editResult: Awaited<ReturnType<SurgicalEditDeps["applyEditPlan"]>>;
  try {
    editResult = await deps.applyEditPlan(editPlan, undefined, trainingSystemId);
  } catch (err) {
    deps.onError?.(err, "apply");
    return { ok: false, committed: true, stage: "apply" };
  }
  if (!editResult || editResult.appliedCount <= 0) {
    // Clean no-op — nothing changed → safe to fall back.
    deps.onError?.(new Error("no changes applied"), "apply_noop");
    return { ok: false, committed: false, stage: "apply_noop" };
  }

  // ── Finalize: the relational mutation is committed. Any failure here MUST NOT
  //    fall back (would leave blob and system divergent) — the caller fails loud.
  try {
    const postSystem = await deps.loadFullSystem(trainingSystemId);
    if (!postSystem) {
      deps.onError?.(new Error("training system missing after apply"), "reload");
      return { ok: false, committed: true, stage: "reload" };
    }
    const updatedProgram = deps.serializeToProgram(postSystem);
    if (!updatedProgram) {
      deps.onError?.(new Error("could not reserialize system"), "serialize");
      return { ok: false, committed: true, stage: "serialize" };
    }
    return {
      ok: true,
      result: {
        updatedProgram,
        changes: editResult.details ?? [],
        coachSummary: editResult.changeSummary ?? "Program updated.",
      },
    };
  } catch (err) {
    deps.onError?.(err, "finalize");
    return { ok: false, committed: true, stage: "finalize" };
  }
}
