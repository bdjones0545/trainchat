/**
 * Small data-access helper for the Phase 2.6 concurrency path.
 *
 * A fresh read of an external program's current trainingSystemId, used INSIDE
 * the per-program lock so a request observes any link written by a concurrent
 * request that already materialized the program (idempotent materialization).
 */

import { db, externalProgramsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Re-read the current trainingSystemId link for a program (null if unlinked). */
export async function reloadExternalTrainingSystemId(
  programId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ trainingSystemId: externalProgramsTable.trainingSystemId })
    .from(externalProgramsTable)
    .where(eq(externalProgramsTable.id, programId))
    .limit(1);
  return row?.trainingSystemId ?? null;
}
