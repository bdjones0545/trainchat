import { sql } from "drizzle-orm";
import type { Dbx } from "./db-executor";

/**
 * Postgres advisory locks for cross-instance edit serialization (audit F9).
 *
 * `pg_advisory_xact_lock(classId, objectId)` blocks until the lock is granted
 * and releases AUTOMATICALLY at transaction commit or rollback — there is no
 * unlock call and no session-level lock to leak. That means:
 *   - callers MUST pass a transaction handle (`tx` from `db.transaction`);
 *     issuing it on the module-level client would tie the lock to an arbitrary
 *     pooled connection's implicit transaction and release it immediately.
 *   - the lock is held only for the DB-write portion of an edit. LLM calls and
 *     other slow I/O must happen BEFORE the transaction opens (the PR #14/#15
 *     transaction boundaries already guarantee this).
 *
 * Key strategy: the two-int form gives each domain its own namespace ("class"),
 * so a training-system id can never collide with an external-program id. Ids
 * are int4 serials — used directly, no hashing needed.
 */

/** Lock class for relational training-system edit transactions. ("TC", 1) */
export const TRAINING_SYSTEM_LOCK_CLASS = 0x5443_0001;

/** Lock class for external-program blob write transactions. ("TC", 2) */
export const EXTERNAL_PROGRAM_LOCK_CLASS = 0x5443_0002;

/**
 * Serialize edits to one training system across instances. Blocks until any
 * concurrent holder's transaction finishes; released at commit/rollback.
 */
export async function acquireProgramAdvisoryLock(tx: Dbx, trainingSystemId: number): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${TRAINING_SYSTEM_LOCK_CLASS}, ${trainingSystemId})`,
  );
}

/**
 * Serialize blob (external_programs / external_program_versions) writes for
 * one external program across instances.
 */
export async function acquireExternalProgramBlobLock(tx: Dbx, externalProgramId: number): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${EXTERNAL_PROGRAM_LOCK_CLASS}, ${externalProgramId})`,
  );
}
