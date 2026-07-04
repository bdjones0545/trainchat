/**
 * External-program ↔ training-system mapping (Phase 2.1 foundation).
 *
 * Pure, side-effect-free functions that translate between the external API's
 * jsonb `programData` blob and the shape the relational training-system builder
 * expects. This layer is intentionally UNUSED by any route today — it is the
 * seam a later Phase 2 PR will call to materialize an external program into a
 * `training_systems` hierarchy for surgical editing.
 *
 * See docs/phase-2-external-surgical-edit.md §4–§6.
 */

import type { ChatProgram } from "../training-system-service";

/** Minimal view of an external_programs row this layer reads. */
export interface ExternalProgramRowView {
  id: number;
  programData: unknown;
  trainingSystemId: number | null;
}

/**
 * True once the program has been materialized into a training_systems row.
 * Always false today — nothing sets `trainingSystemId` yet.
 */
export function isMaterialized(
  row: Pick<ExternalProgramRowView, "trainingSystemId">,
): boolean {
  return row.trainingSystemId != null;
}

/**
 * Narrow the untyped `programData` jsonb into the `ChatProgram` shape the
 * training-system builder consumes. Returns `null` when the blob is not a
 * usable program (missing / empty `days`) — callers must fail gracefully rather
 * than coerce. This does not mutate or persist anything.
 */
export function getProgramStructure(
  row: Pick<ExternalProgramRowView, "programData">,
): ChatProgram | null {
  const data = row.programData;
  if (!data || typeof data !== "object") return null;

  const program = data as Partial<ChatProgram>;
  if (
    !Array.isArray(program.days) ||
    program.days.length === 0 ||
    typeof program.programName !== "string" ||
    program.programName.length === 0
  ) {
    return null;
  }

  return program as ChatProgram;
}

/**
 * Whether the blob could be materialized (i.e. it parses to a usable program).
 * Pure — no DB, no side effects.
 */
export function isMaterializable(
  row: Pick<ExternalProgramRowView, "programData">,
): boolean {
  return getProgramStructure(row) !== null;
}

export interface ProgramShapeSummary {
  programName: string;
  dayCount: number;
  exerciseCount: number;
}

/**
 * Small structural summary of a program blob, for logging/telemetry and tests.
 * Returns `null` for a non-program blob.
 */
export function describeProgram(
  row: Pick<ExternalProgramRowView, "programData">,
): ProgramShapeSummary | null {
  const program = getProgramStructure(row);
  if (!program) return null;

  const exerciseCount = program.days.reduce(
    (sum, day) => sum + (Array.isArray(day.exercises) ? day.exercises.length : 0),
    0,
  );

  return {
    programName: program.programName,
    dayCount: program.days.length,
    exerciseCount,
  };
}
