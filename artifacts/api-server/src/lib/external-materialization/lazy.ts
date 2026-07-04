/**
 * Lazy materialization on external edit (Phase 2.3).
 *
 * A best-effort, side-effect-only step: when the flag is on and a program has
 * not yet been materialized, materialize it via the Phase 2.2 adapter and link
 * `external_programs.trainingSystemId`. It NEVER changes the edit itself — the
 * caller continues through the existing LLM regeneration path regardless of the
 * outcome, and a failure here is logged, not propagated.
 *
 * All collaborators are injected (Phase 2.1/2.2 style) so this is unit-testable
 * without a DB, engine, or route.
 *
 * See docs/phase-2-external-surgical-edit.md §10 (PR 2.3) and §11.
 */

import { getProgramStructure } from "./mapping";
import { materializeExternalProgram } from "./adapter";
import type { RoundTripAdapterDeps } from "./adapter";
import type { MaterializationOwnerContext } from "./service";

/** Minimal view of the external_programs row this step reads. */
export interface LazyMaterializeProgram {
  id: number;
  programData: unknown;
  trainingSystemId: number | null;
}

export interface LazyMaterializeDeps {
  /** Feature flag state (evaluated by the caller). */
  enabled: boolean;
  /** Adapter deps wiring the real (or fake) system builder + service user. */
  adapterDeps: RoundTripAdapterDeps;
  /** Persist the link on external_programs. */
  link: (programId: number, trainingSystemId: number) => Promise<void>;
  /** Focus lane hint for the builder. */
  focusMode?: string | null;
  /** Failure sink (logging). Never rethrows. */
  onError?: (err: unknown) => void;
}

export type LazyMaterializeReason =
  | "flag_off"
  | "already_materialized"
  | "not_materializable"
  | "materialized"
  | "failed";

export interface LazyMaterializeResult {
  attempted: boolean;
  materialized: boolean;
  trainingSystemId: number | null;
  reason: LazyMaterializeReason;
}

/**
 * Lazily materialize a program on edit. Pure orchestration over injected deps;
 * always resolves (never throws) so the edit path is never blocked.
 */
export async function maybeMaterializeOnEdit(
  program: LazyMaterializeProgram,
  ownerCtx: MaterializationOwnerContext,
  deps: LazyMaterializeDeps,
): Promise<LazyMaterializeResult> {
  if (!deps.enabled) {
    return { attempted: false, materialized: false, trainingSystemId: program.trainingSystemId, reason: "flag_off" };
  }
  if (program.trainingSystemId != null) {
    return { attempted: false, materialized: false, trainingSystemId: program.trainingSystemId, reason: "already_materialized" };
  }

  const chatProgram = getProgramStructure({ programData: program.programData });
  if (!chatProgram) {
    return { attempted: false, materialized: false, trainingSystemId: null, reason: "not_materializable" };
  }

  try {
    const { trainingSystemId } = await materializeExternalProgram(
      chatProgram,
      ownerCtx,
      deps.adapterDeps,
      deps.focusMode ?? null,
    );
    await deps.link(program.id, trainingSystemId);
    return { attempted: true, materialized: true, trainingSystemId, reason: "materialized" };
  } catch (err) {
    deps.onError?.(err);
    return { attempted: true, materialized: false, trainingSystemId: null, reason: "failed" };
  }
}
