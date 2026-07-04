/**
 * External-program repository (Phase 2.1 foundation).
 *
 * A thin, typed data-access layer over `external_programs` for the future
 * materialization flow. Dependency-injected `db` so it is unit-testable without
 * a live connection and decoupled from the route layer.
 *
 * UNUSED by any route today. The existing `POST /program/edit` path keeps its
 * own inline queries untouched — this repository is the future home for those
 * reads/writes, added now so later Phase 2 PRs are small.
 *
 * See docs/phase-2-external-surgical-edit.md §10 (PR 2.1/2.3).
 */

import { externalProgramsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ExternalProgramRow = typeof externalProgramsTable.$inferSelect;

/**
 * The subset of the real Drizzle client this repository uses. Derived from the
 * actual `@workspace/db` client type (an import-type, erased at runtime) so the
 * repository stays injectable — real `db` in production, a typed fake in tests —
 * without widening to `any`.
 */
type DbClient = typeof import("@workspace/db")["db"];
export type ExternalProgramDb = Pick<DbClient, "select" | "update">;

export class ExternalProgramRepository {
  constructor(private readonly db: ExternalProgramDb) {}

  /** Load a program row by id (no ownership scoping — callers scope upstream). */
  async findById(id: number): Promise<ExternalProgramRow | undefined> {
    const [row] = await this.db
      .select()
      .from(externalProgramsTable)
      .where(eq(externalProgramsTable.id, id))
      .limit(1);
    return row;
  }

  /** Link a program to its materialized training system. Additive; never clears. */
  async linkTrainingSystem(id: number, trainingSystemId: number): Promise<void> {
    await this.db
      .update(externalProgramsTable)
      .set({ trainingSystemId })
      .where(eq(externalProgramsTable.id, id));
  }

  /** Replace the stored program projection (used after a future surgical edit). */
  async updateProgramData(
    id: number,
    programData: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(externalProgramsTable)
      .set({ programData })
      .where(eq(externalProgramsTable.id, id));
  }
}
