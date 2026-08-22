# TrainChat production-clone migration rehearsal

Status: **rehearsal package only — not production approval**

This runbook upgrades a disposable, access-controlled clone of the populated
TrainChat database to the schema used by `release/trainchat-conditionally-ready`.
It must not be used against production. The empty-database baseline
`lib/db/drizzle/0000_current_schema.sql` must never be executed against a
populated database.

## Derived schema delta

The Git schema-source diff from production-side commit
`b4bef8cd24b8d7b1e2e42fb31254d09325d6419d` to release commit
`050fb25a8b17a7da8bcb8ef95c862db03f7bc584` changes two Drizzle schema sources:

| Object | Release change | Classification | Reason |
|---|---|---|---|
| `chat_turns` | New table: serial PK; required conversation/user/client-turn/status/quota/created fields; nullable response/completion fields; defaults for status, quota, and creation time | ADDITIVE SAFE | New empty table; existing application data is untouched |
| `chat_turns` conversation FK | FK to `conversations(id)` with cascade delete | ADDITIVE WITH PREFLIGHT | Safe on a newly created empty table; preflight covers a partial pre-existing table |
| `chat_turns` user FK | FK to `users(id)` with cascade delete | ADDITIVE WITH PREFLIGHT | Safe on a newly created empty table; preflight covers a partial pre-existing table |
| `idx_chat_turns_conversation_client_turn` | Unique btree index on `(conversation_id, client_turn_id)` | ADDITIVE WITH PREFLIGHT | Requires duplicate scan if `chat_turns` already exists |
| `users.account_deletion_status` | Nullable text | ADDITIVE SAFE | Existing rows remain null; application interprets null as no deletion workflow |
| `users.account_deletion_requested_at` | Nullable timestamptz | ADDITIVE SAFE | Existing rows remain null |
| `users.account_deletion_error` | Nullable text | ADDITIVE SAFE | Existing rows remain null |

The verified clone comparison found additional release-required objects that
are **not Git schema-source deltas** because they were already modeled at
`b4bef8c`, but are absent from the populated clone:

| Clone reconciliation | Classification | Reason |
|---|---|---|
| `external_programs.training_system_id` plus `ON DELETE SET NULL` FK | ADDITIVE WITH PREFLIGHT | Nullable addition; explicit orphan check precedes FK enforcement |
| `rate_limit_counters` plus composite PK and expiry index | ADDITIVE SAFE | New empty support table; existing application data is untouched |
| `kevin_app_events.processing_started_at` plus processing index | ADDITIVE SAFE | Nullable addition; verified clone has zero event rows |
| `kevin_training_outcomes.processing_started_at` plus processing index | ADDITIVE SAFE | Nullable addition; verified clone has zero outcome rows |
| `kevin_training_outcomes.idempotency_key` plus unique index | DATA MIGRATION REQUIRED for non-empty targets | Added nullable, deterministically backfilled from the row PK, checked for nulls/duplicates, then made NOT NULL and unique; verified clone currently has zero outcome rows |

The clone-only tables `exercise_product_links`, `goal_knowledge_graph`,
`product_method_links`, `training_methods`, and `user_sessions`, together with
the clone-only `product_directory` columns identified by the schema gate, are
retained untouched.

The migration retains clone-only tables and extra `product_directory` columns;
removing those production-schema supersets would be **DESTRUCTIVE / HIGH RISK**
and is not required. No release change drops a table/column or changes an
existing column type. The Kevin outcome idempotency field requires a bounded
data migration only when legacy rows exist; the verified clone currently has
zero such rows.

## Lock and data risk

Known estimates are planning inputs only: the verified clone has 710 users;
conversations ~81, messages ~301, training systems ~69, training sessions ~880,
and session exercises ~5,295.

- Creating `chat_turns` and its indexes affects an empty new table and should be
  short-lived. Catalog locks still require a quiet rehearsal/cutover window.
- Adding nullable `users` columns takes an `ACCESS EXCLUSIVE` table lock but
  does not rewrite existing rows on PostgreSQL 16.
- Adding the nullable `external_programs` column is likewise metadata-only.
- Foreign-key creation scans the referencing tables while taking locks that can
  block concurrent DDL and briefly interact with writes. Expected table sizes
  are small, but actual clone sizes from preflight govern the decision.
- The unique index should be trivial for an empty `chat_turns`; any rows or
  duplicate result in preflight is a stop condition.
- `rate_limit_counters` is created empty, so its primary key and expiry index do
  not scan legacy application data.
- The Kevin processing indexes scan their existing tables. The verified clone
  has zero event/outcome rows; a future non-empty target must use its preflight
  counts to assess lock duration.
- Legacy Kevin outcome rows receive deterministic keys derived only from their
  primary keys. Null and duplicate checks run before the NOT NULL and unique
  enforcement. Any conflicting existing value aborts the transaction.
- Any orphan count above zero is a stop condition. Do not add/validate the FK
  until the data discrepancy is separately reviewed.
- If clone timings or lock observations are material, split column/table
  creation from FK/index validation for a future production plan. This
  rehearsal candidate intentionally remains transactional and fail-closed.

## Drizzle baseline-history strategy

Drizzle ORM 0.45.2 creates `drizzle.__drizzle_migrations` with:

```sql
id serial primary key,
hash text not null,
created_at bigint
```

The installed migrator decides which migrations to run from the greatest
`created_at`. For this release, baseline `0000_current_schema` has journal time
`1787291067035` and SHA-256
`90671ca522eaff4db3faa8e6cdfa4eb59c9904340b43215bb6e1385294e43f4f`.
The clone-only baseline tool verifies that exact file hash before recording the
row. Because isolated Neon clones may retain the database name `neondb`, the
tool also requires the separately verified clone server address and compares it
with `inet_server_addr()`; database name alone is not treated as identity.
Migration `0001_production_release_upgrade` has a later journal time, so a
normal `drizzle-kit migrate` skips 0000 and applies only 0001.

The baseline tool is deliberately noisy and restrictive. It requires an exact
clone confirmation, an expected database name, the expected pre-release tables,
no Drizzle history, no `chat_turns` or `rate_limit_counters`, the expected Kevin
tables, and none of the release columns. A partial migration state fails closed
for manual review.

## Rehearsal procedure

1. Confirm this is a disposable non-production clone, record its owner and
   creation timestamp, source snapshot/restore point, and independently verified
   server address using `select inet_server_addr()::text`. Never use a
   production connection string.
2. Check out `release/trainchat-conditionally-ready` plus the uncommitted
   rehearsal-package changes under review. Confirm the expected release HEAD.
3. Run the SELECT-only preflight and securely retain its metadata/count output:

   ```bash
   psql "$DATABASE_URL" -X -f scripts/release/trainchat_clone_preflight.sql
   ```

4. Compare the clone schema with the expected pre-release shape. Stop for a
   missing expected table, existing/partial release object, duplicate, orphan,
   null violation, existing Drizzle history, or unexplained schema difference.
5. Establish only the represented baseline history on the clone:

   ```bash
   export TRAINCHAT_REHEARSAL_CLONE_CONFIRMATION=YES_I_CONFIRM_THIS_IS_A_DISPOSABLE_NON_PRODUCTION_CLONE
   export TRAINCHAT_REHEARSAL_EXPECTED_DATABASE='<exact clone database name>'
   export TRAINCHAT_REHEARSAL_EXPECTED_SERVER_ADDRESS='<verified clone inet_server_addr()>'
   scripts/release/trainchat_clone_baseline.sh
   ```

6. Run the normal migration path. This must apply 0001 without replaying 0000:

   ```bash
   pnpm --filter @workspace/db migrate
   ```

7. Run the same migrate command again. It must be a no-op and migration history
   must remain exactly two rows with increasing `created_at` values.
8. Run postchecks and compare affected-table row counts with preflight:

   ```bash
   psql "$DATABASE_URL" -X -f scripts/release/trainchat_clone_postcheck.sql
   ```

9. Start the release application against only the clone. Verify `/api/healthz`
   and `/api/readyz` before browser testing.
10. Run the critical journey: anonymous bootstrap, registration/merge, login,
    refresh, logout/login, conversation creation, successful turn, fixed
    `clientTurnId` replay, quota-at-most-once, cross-user rejection, and
    deterministic hard-constraint fallback. Do not invoke live OpenAI or Stripe
    unless separately authorized.
11. Start the old application revision against a separate copy of the migrated
    clone and repeat its login, conversation, program-read/write, and billing
    read paths. Do not point two revisions at the same mutable rehearsal DB.
12. Record migration duration, lock observations, query/test results, and the
    clone restore/disposal outcome. These results inform—but do not authorize—a
    production cutover.

## Stop conditions

Stop without repair if any of the following occurs:

- target identity or clone ownership is ambiguous;
- the target may be production;
- preflight shows existing Drizzle history or a partial release migration;
- an expected pre-release table is absent;
- duplicate, orphan, or null-violation count is nonzero;
- baseline SQL hash differs from the reviewed value;
- migration attempts to execute `0000_current_schema.sql`;
- affected-table counts decrease;
- the second migrate changes schema/history;
- health/readiness, authorization, idempotency, quota, or hard-constraint tests fail;
- old-revision rollback testing issues destructive or incompatible writes.

## Rollback compatibility analysis

**LIKELY BACKWARD COMPATIBLE** by code inspection, not runtime proof.

The old revision uses named columns/Drizzle field mappings rather than positional
row layouts. It does not query `chat_turns` or the account-deletion fields, and
it already models `external_programs.training_system_id`. The release migration
adds only a new table, nullable columns, FKs on new/nullable data, and an index
on the new table. Those objects should be ignored by old auth/session, billing,
conversation, and program queries. The required clone rollback test remains the
runtime gate, particularly for old writes to `external_programs` and `users`.
