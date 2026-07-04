import { db } from "@workspace/db";

/**
 * Minimal DB executor type: either the module-level Drizzle client or a
 * transaction handle from `db.transaction`. Persistence helpers on the
 * surgical-edit path accept this so their reads and writes participate in
 * the caller's transaction instead of escaping to the module-level `db`
 * (DR-0006 / release-audit F8). Same pattern as PR #14 for generation.
 */
export type Dbx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
