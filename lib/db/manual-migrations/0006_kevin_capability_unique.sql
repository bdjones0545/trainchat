-- ─── 0006: Kevin capability uniqueness ───────────────────────────────────────
--
-- Fixes H4: seedKevinCapabilities() used ON CONFLICT DO NOTHING against a
-- NON-unique index, so every server startup (per instance) re-inserted a full
-- set of capability rows — unbounded growth. This migration deduplicates the
-- table and upgrades idx_kevin_capabilities_scope to a UNIQUE index so the seed
-- becomes genuinely idempotent.
--
-- Idempotent and safe to re-run. Wrapped in a transaction so a failure leaves
-- the table unchanged.

BEGIN;

-- 1. Remove duplicate rows, keeping the lowest id per
--    (scope_type, scope_id, capability). Deleted rows are redundant seed copies
--    with identical default values; no distinct configuration is lost. (If an
--    admin had edited approval_mode/enabled on a duplicate, the surviving lowest
--    id wins — verify admin-set capability modes after applying; see rollback.)
DELETE FROM "kevin_app_capabilities" a
USING "kevin_app_capabilities" b
WHERE a."scope_type" = b."scope_type"
  AND a."scope_id"   = b."scope_id"
  AND a."capability" = b."capability"
  AND a."id" > b."id";

-- 2. Replace the non-unique index with a UNIQUE index of the same name so the
--    ORM's onConflictDoNothing({ target: [...] }) has a real arbiter.
DROP INDEX IF EXISTS "idx_kevin_capabilities_scope";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_kevin_capabilities_scope"
  ON "kevin_app_capabilities" ("scope_type", "scope_id", "capability");

COMMIT;

-- ─── Rollback / recovery ─────────────────────────────────────────────────────
-- The dedup DELETE is not reversible (duplicate rows are dropped), but the
-- retained row is the earliest-seeded one and duplicates carried identical
-- default values, so no meaningful state is lost. To revert the schema change
-- (restore the previous non-unique index) without restoring duplicates:
--
--   BEGIN;
--   DROP INDEX IF EXISTS "idx_kevin_capabilities_scope";
--   CREATE INDEX IF NOT EXISTS "idx_kevin_capabilities_scope"
--     ON "kevin_app_capabilities" ("scope_type", "scope_id", "capability");
--   COMMIT;
--
-- If step 1 must be audited before running, first inspect duplicates with:
--   SELECT scope_type, scope_id, capability, count(*)
--   FROM kevin_app_capabilities
--   GROUP BY 1,2,3 HAVING count(*) > 1;
