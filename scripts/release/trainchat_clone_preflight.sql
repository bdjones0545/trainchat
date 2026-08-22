\set ON_ERROR_STOP on
\pset pager off

-- SELECT-only production-clone preflight. This file prints metadata, counts,
-- and identifiers only; it never reads customer message/profile content.

SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('server_version') AS postgres_version,
       pg_is_in_recovery() AS is_replica,
       current_setting('transaction_read_only') AS transaction_read_only;

SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       c.relkind AS object_kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (
  ('drizzle', '__drizzle_migrations'),
  ('_system', 'replit_database_migrations_v1'),
  ('public', 'users'),
  ('public', 'conversations'),
  ('public', 'messages'),
  ('public', 'training_systems'),
  ('public', 'training_sessions'),
  ('public', 'session_exercises'),
  ('public', 'active_sessions'),
  ('public', 'external_programs'),
  ('public', 'external_program_versions'),
  ('public', 'chat_turns'),
  ('public', 'rate_limit_counters'),
  ('public', 'kevin_app_events'),
  ('public', 'kevin_training_outcomes')
)
ORDER BY n.nspname, c.relname;

SELECT table_schema, table_name, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE (table_schema = 'public' AND table_name = 'users'
       AND column_name IN (
         'account_deletion_status',
         'account_deletion_requested_at',
         'account_deletion_error'
       ))
   OR (table_schema = 'public' AND table_name = 'external_programs'
       AND column_name = 'training_system_id')
   OR (table_schema = 'public' AND table_name = 'chat_turns')
   OR (table_schema = 'public' AND table_name = 'rate_limit_counters')
   OR (table_schema = 'public' AND table_name = 'kevin_app_events'
       AND column_name = 'processing_started_at')
   OR (table_schema = 'public' AND table_name = 'kevin_training_outcomes'
       AND column_name IN ('idempotency_key', 'processing_started_at'))
ORDER BY table_schema, table_name, ordinal_position;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('chat_turns', 'external_programs', 'rate_limit_counters')
ORDER BY c.relname, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename IN ('chat_turns', 'rate_limit_counters')
       OR indexname IN (
         'idx_chat_turns_conversation_client_turn',
         'idx_kevin_events_processing',
         'idx_kevin_outcomes_idempotency',
         'idx_kevin_outcomes_processing'
       ))
ORDER BY tablename, indexname;

SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle_history_exists
\gset preflight_
\if :preflight_drizzle_history_exists
  SELECT count(*) AS drizzle_history_rows,
         min(created_at) AS first_migration_at,
         max(created_at) AS last_migration_at
  FROM drizzle.__drizzle_migrations;
\else
  SELECT 0::bigint AS drizzle_history_rows,
         NULL::bigint AS first_migration_at,
         NULL::bigint AS last_migration_at;
\endif

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'kevin_training_outcomes'
    AND column_name = 'idempotency_key'
) AS outcome_idempotency_column_exists
\gset preflight_
\if :preflight_outcome_idempotency_column_exists
  SELECT count(*) AS outcome_idempotency_null_count
  FROM public.kevin_training_outcomes
  WHERE idempotency_key IS NULL;
  SELECT count(*) AS outcome_idempotency_duplicate_group_count
  FROM (
    SELECT idempotency_key
    FROM public.kevin_training_outcomes
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING count(*) > 1
  ) duplicate_groups;
\else
  SELECT count(*) AS outcome_rows_requiring_deterministic_backfill
  FROM public.kevin_training_outcomes;
\endif

SELECT to_regclass('public.chat_turns') IS NOT NULL AS chat_turns_exists
\gset preflight_
\if :preflight_chat_turns_exists
  SELECT count(*) AS chat_turn_rows FROM public.chat_turns;
  SELECT conversation_id, client_turn_id, count(*) AS duplicate_count
  FROM public.chat_turns
  GROUP BY conversation_id, client_turn_id
  HAVING count(*) > 1
  ORDER BY duplicate_count DESC, conversation_id, client_turn_id;
  SELECT count(*) AS chat_turn_null_violation_count
  FROM public.chat_turns
  WHERE conversation_id IS NULL OR user_id IS NULL OR client_turn_id IS NULL
     OR status IS NULL OR quota_charged IS NULL OR created_at IS NULL;
  SELECT count(*) AS chat_turn_conversation_orphan_count
  FROM public.chat_turns t
  LEFT JOIN public.conversations c ON c.id = t.conversation_id
  WHERE c.id IS NULL;
  SELECT count(*) AS chat_turn_user_orphan_count
  FROM public.chat_turns t
  LEFT JOIN public.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
\else
  SELECT 0::bigint AS chat_turn_rows,
         0::bigint AS chat_turn_null_violation_count,
         0::bigint AS chat_turn_conversation_orphan_count,
         0::bigint AS chat_turn_user_orphan_count;
\endif

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'external_programs'
    AND column_name = 'training_system_id'
) AS external_training_system_column_exists
\gset preflight_
\if :preflight_external_training_system_column_exists
  SELECT count(*) AS external_program_training_system_orphan_count
  FROM public.external_programs p
  LEFT JOIN public.training_systems s ON s.id = p.training_system_id
  WHERE p.training_system_id IS NOT NULL AND s.id IS NULL;
\else
  SELECT 0::bigint AS external_program_training_system_orphan_count;
\endif

SELECT 'users' AS table_name, count(*) AS row_count FROM public.users
UNION ALL SELECT 'conversations', count(*) FROM public.conversations
UNION ALL SELECT 'messages', count(*) FROM public.messages
UNION ALL SELECT 'training_systems', count(*) FROM public.training_systems
UNION ALL SELECT 'training_sessions', count(*) FROM public.training_sessions
UNION ALL SELECT 'session_exercises', count(*) FROM public.session_exercises
UNION ALL SELECT 'active_sessions', count(*) FROM public.active_sessions
UNION ALL SELECT 'external_programs', count(*) FROM public.external_programs
UNION ALL SELECT 'external_program_versions', count(*) FROM public.external_program_versions
UNION ALL SELECT 'kevin_app_events', count(*) FROM public.kevin_app_events
UNION ALL SELECT 'kevin_training_outcomes', count(*) FROM public.kevin_training_outcomes
UNION ALL SELECT 'billing_linked_users', count(*) FROM public.users
  WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
ORDER BY table_name;

SELECT c.relname AS table_name,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'users', 'conversations', 'messages', 'training_systems',
    'training_sessions', 'session_exercises', 'active_sessions',
    'external_programs', 'external_program_versions', 'chat_turns',
    'rate_limit_counters', 'kevin_app_events', 'kevin_training_outcomes'
  )
ORDER BY c.relname;
