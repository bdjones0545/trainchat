/**
 * Default wiring for the Phase 2.7 migration-readiness diagnostic (imports db).
 * Kept separate from the pure `readiness.ts` so its unit tests don't need a DB.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { isAnyExternalFlagPotentiallyEnabled } from "./feature-flag";
import {
  checkExternalMaterializationReadiness,
  type ReadinessStatus,
} from "./readiness";

/**
 * Best-effort startup diagnostic: warn (do not throw) if the external
 * materialization/surgical flags could be active but migration 0002 has not
 * been applied. Safe to call unconditionally at boot.
 */
export async function runExternalMaterializationReadinessCheck(): Promise<ReadinessStatus> {
  return checkExternalMaterializationReadiness({
    anyFlagEnabled: isAnyExternalFlagPotentiallyEnabled(),
    columnExists: async () => {
      const res = (await db.execute(
        sql`SELECT 1 FROM information_schema.columns
            WHERE table_name = 'external_programs'
              AND column_name = 'training_system_id'
            LIMIT 1`,
      )) as unknown as { rows?: unknown[] };
      const rows = res?.rows ?? [];
      return Array.isArray(rows) && rows.length > 0;
    },
    onWarn: (message) => logger.warn({ subsystem: "external-materialization" }, message),
  });
}
