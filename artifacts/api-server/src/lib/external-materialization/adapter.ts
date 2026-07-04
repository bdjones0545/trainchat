/**
 * External program round-trip adapter (Phase 2.2 foundation).
 *
 * Bridges an external `programData` blob to the relational training-system
 * representation and back, by wiring the EXISTING internal functions:
 *   - createTrainingSystemFromProgram   (ProgramStructure → training_systems)
 *   - getFullTrainingSystem             (load the hierarchy)
 *   - dbSystemToProgramStructure        (training_systems → ProgramStructure)
 *
 * Dependency-injected, consistent with Phase 2.1: every collaborator is passed
 * in via `RoundTripAdapterDeps`. `createDefaultRoundTripDeps` wires the real
 * functions for the FUTURE route; `resolveServiceUserId` stays injected so the
 * global-vs-per-org owner decision remains deferred (design doc §12.1).
 *
 * UNWIRED: no route imports this module, and the adapter functions require
 * explicit `deps` (there is no default that reaches a live DB), so importing
 * this file cannot materialize anything. The current `POST /program/edit`
 * regeneration path is untouched.
 *
 * See docs/phase-2-external-surgical-edit.md §4 (adapters) and §10 (PR 2.2).
 */

import type { ChatProgram } from "../training-system-service";
import {
  createTrainingSystemFromProgram,
  getFullTrainingSystem,
  dbSystemToProgramStructure,
} from "../training-system-service";
import { getProgramStructure } from "./mapping";
import type { MaterializationOwnerContext, ResolveServiceUserFn } from "./service";

/** The full training-system row+hierarchy returned by `getFullTrainingSystem`. */
export type FullTrainingSystem = Awaited<ReturnType<typeof getFullTrainingSystem>>;

/** The `ProgramStructure` shape produced by `dbSystemToProgramStructure`. */
export type SerializedProgram = NonNullable<ReturnType<typeof dbSystemToProgramStructure>>;

export interface RoundTripAdapterDeps {
  /** Resolve the real users.id that owns the materialized system. */
  resolveServiceUserId: ResolveServiceUserFn;
  /** Build a training_systems hierarchy from a program (returns at least an id). */
  createSystem: (
    userId: number,
    program: ChatProgram,
    conversationId?: number | null,
    focusMode?: string | null,
  ) => Promise<{ id: number }>;
  /** Load a full training system by id (null/undefined when missing). */
  loadFullSystem: (systemId: number) => Promise<FullTrainingSystem>;
  /** Serialize a full training system back into a ProgramStructure. */
  serializeSystem: (fullSystem: NonNullable<FullTrainingSystem>) => SerializedProgram | null;
}

/**
 * Wire the real internal functions as adapter deps. `resolveServiceUserId` is
 * still injected — this factory does not decide owner granularity. Pure
 * construction: it returns closures and invokes nothing.
 */
export function createDefaultRoundTripDeps(
  resolveServiceUserId: ResolveServiceUserFn,
): RoundTripAdapterDeps {
  return {
    resolveServiceUserId,
    createSystem: (userId, program, conversationId, focusMode) =>
      createTrainingSystemFromProgram(userId, program, conversationId, focusMode),
    loadFullSystem: (systemId) => getFullTrainingSystem(systemId),
    serializeSystem: (fullSystem) => dbSystemToProgramStructure(fullSystem),
  };
}

/**
 * Materialize a validated program into a training system owned by the resolved
 * service user, returning the new system id. Does NOT persist any link on
 * `external_programs` (that is the repository's job, wired later).
 */
export async function materializeExternalProgram(
  program: ChatProgram,
  ownerCtx: MaterializationOwnerContext,
  deps: RoundTripAdapterDeps,
  focusMode?: string | null,
): Promise<{ trainingSystemId: number }> {
  const userId = await deps.resolveServiceUserId(ownerCtx);
  const system = await deps.createSystem(userId, program, null, focusMode ?? null);
  return { trainingSystemId: system.id };
}

/**
 * Re-serialize a materialized training system back into a ProgramStructure.
 * Returns null when the system is missing or produces no serializable program.
 */
export async function reserializeTrainingSystem(
  trainingSystemId: number,
  deps: RoundTripAdapterDeps,
): Promise<SerializedProgram | null> {
  const fullSystem = await deps.loadFullSystem(trainingSystemId);
  if (!fullSystem) return null;
  return deps.serializeSystem(fullSystem);
}

export interface RoundTripResult {
  trainingSystemId: number;
  program: SerializedProgram;
}

/**
 * Full round trip: external `programData` → training_system → ProgramStructure.
 * Validates the blob first (invalid/empty → null, no system created). Intended
 * for a future flagged route + integration equality check; unused today.
 */
export async function roundTripExternalProgram(
  rawProgramData: unknown,
  ownerCtx: MaterializationOwnerContext,
  deps: RoundTripAdapterDeps,
  focusMode?: string | null,
): Promise<RoundTripResult | null> {
  const program = getProgramStructure({ programData: rawProgramData });
  if (!program) return null;

  const { trainingSystemId } = await materializeExternalProgram(program, ownerCtx, deps, focusMode);
  const reserialized = await reserializeTrainingSystem(trainingSystemId, deps);
  if (!reserialized) return null;

  return { trainingSystemId, program: reserialized };
}
