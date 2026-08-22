#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_CONFIRMATION="YES_I_CONFIRM_THIS_IS_A_DISPOSABLE_NON_PRODUCTION_CLONE"
readonly BASELINE_CREATED_AT="1787291067035"
readonly BASELINE_HASH="90671ca522eaff4db3faa8e6cdfa4eb59c9904340b43215bb6e1385294e43f4f"
readonly BASELINE_FILE="lib/db/drizzle/0000_current_schema.sql"

fail() {
  printf 'REFUSED: %s\n' "$1" >&2
  exit 1
}

[[ "${TRAINCHAT_REHEARSAL_CLONE_CONFIRMATION:-}" == "$REQUIRED_CONFIRMATION" ]] ||
  fail "set TRAINCHAT_REHEARSAL_CLONE_CONFIRMATION to the documented clone-only confirmation"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "${TRAINCHAT_REHEARSAL_EXPECTED_DATABASE:-}" ]] ||
  fail "TRAINCHAT_REHEARSAL_EXPECTED_DATABASE is required"
[[ -n "${TRAINCHAT_REHEARSAL_EXPECTED_SERVER_ADDRESS:-}" ]] ||
  fail "TRAINCHAT_REHEARSAL_EXPECTED_SERVER_ADDRESS is required"
[[ -f "$BASELINE_FILE" ]] || fail "run from the TrainChat repository root"

if command -v sha256sum >/dev/null 2>&1; then
  actual_hash="$(sha256sum "$BASELINE_FILE" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_hash="$(shasum -a 256 "$BASELINE_FILE" | awk '{print $1}')"
else
  fail "sha256sum or shasum is required to verify the baseline SQL"
fi
[[ "$actual_hash" == "$BASELINE_HASH" ]] ||
  fail "baseline SQL hash differs from the reviewed release baseline"

actual_database="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()')"
[[ "$actual_database" == "$TRAINCHAT_REHEARSAL_EXPECTED_DATABASE" ]] ||
  fail "connected database does not match TRAINCHAT_REHEARSAL_EXPECTED_DATABASE"

actual_server_address="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select coalesce(inet_server_addr()::text, 'local')")"
[[ "$actual_server_address" == "$TRAINCHAT_REHEARSAL_EXPECTED_SERVER_ADDRESS" ]] ||
  fail "connected server does not match TRAINCHAT_REHEARSAL_EXPECTED_SERVER_ADDRESS"

existing_history="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select to_regclass('drizzle.__drizzle_migrations') is not null")"
[[ "$existing_history" == "f" ]] || fail "Drizzle migration history already exists; manual review required"

required_tables="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 <<'SQL'
select count(*)
from (values
  ('users'), ('conversations'), ('messages'), ('training_systems'),
  ('training_sessions'), ('session_exercises'), ('active_sessions'),
  ('external_programs'), ('external_program_versions'),
  ('kevin_app_events'), ('kevin_training_outcomes')
) expected(table_name)
where to_regclass('public.' || quote_ident(expected.table_name)) is not null;
SQL
)"
[[ "$required_tables" == "11" ]] || fail "expected pre-release tables are missing"

chat_turns_exists="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select to_regclass('public.chat_turns') is not null")"
[[ "$chat_turns_exists" == "f" ]] || fail "chat_turns already exists; partial migration review required"

rate_limits_exists="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select to_regclass('public.rate_limit_counters') is not null")"
[[ "$rate_limits_exists" == "f" ]] || fail "rate_limit_counters already exists; partial migration review required"

release_column_count="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 <<'SQL'
select count(*)
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'users' and column_name in (
          'account_deletion_status',
          'account_deletion_requested_at',
          'account_deletion_error'
       ))
       or (table_name = 'external_programs' and column_name = 'training_system_id')
       or (table_name = 'kevin_app_events' and column_name = 'processing_started_at')
       or (table_name = 'kevin_training_outcomes' and column_name in (
         'idempotency_key', 'processing_started_at'
       )));
SQL
)"
[[ "$release_column_count" == "0" ]] ||
  fail "release columns already exist; partial migration review required"

printf 'Target verified as explicit rehearsal clone database: %s\n' "$actual_database"
printf 'Target server address matched the separately supplied clone identity.\n'
printf 'About to create Drizzle metadata and record baseline 0000 as represented.\n'

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v baseline_hash="$BASELINE_HASH" \
  -v baseline_created_at="$BASELINE_CREATED_AT" <<'SQL'
BEGIN;
CREATE SCHEMA drizzle;
CREATE TABLE drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES (:'baseline_hash', :'baseline_created_at'::bigint);
COMMIT;
SQL

printf 'Clone-only baseline history established. Run the normal Drizzle migrate command next.\n'
