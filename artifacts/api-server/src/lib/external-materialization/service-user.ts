/**
 * Service-user resolution for materialized external programs (Phase 2.3).
 *
 * Materialized systems must be owned by a real `users` row (training_systems.userId
 * is a NOT-NULL FK). We use a dedicated, non-interactive **per-external-program**
 * anonymous service user, keyed by a stable marker deviceId. Rationale:
 *
 *   - It must NOT be a real customer — attributing an external program to a real
 *     user is a data-isolation risk (design doc §9), and worse:
 *     `createTrainingSystemFromProgram` ARCHIVES the owner's existing active
 *     systems for the same focus lane. A shared owner would make external
 *     programs clobber each other; a real owner would archive their own program.
 *   - Per-program isolation guarantees each external program's materialized
 *     system is the only system its owner has, so nothing is ever archived.
 *
 * Idempotent: the marker deviceId is unique, so get-or-create returns the same
 * user on repeat (materialization is also guarded by trainingSystemId upstream).
 *
 * NOTE: this concretely resolves design-doc §12.1 (owner granularity) as
 * "per-program" for now; a per-org variant can replace it later.
 */

import { db as defaultDb, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type DbClient = typeof import("@workspace/db")["db"];

export function externalServiceDeviceId(programId: number): string {
  return `ext_svc_program_${programId}`;
}

/**
 * Get-or-create the dedicated anonymous service user that owns the materialized
 * system for a given external program. Returns the users.id.
 */
export async function resolveExternalServiceUserId(
  programId: number,
  db: Pick<DbClient, "select" | "insert"> = defaultDb,
): Promise<number> {
  const deviceId = externalServiceDeviceId(programId);

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.deviceId, deviceId))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(usersTable)
    .values({ deviceId, isAnonymous: true })
    .returning({ id: usersTable.id });
  return created.id;
}
