\set ON_ERROR_STOP on
\pset pager off

-- SELECT-only verification after clone baseline + incremental migration.

SELECT current_database() AS database_name,
       current_setting('server_version') AS postgres_version;

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
  AND con.conname IN (
    'chat_turns_pkey',
    'chat_turns_conversation_id_conversations_id_fk',
    'chat_turns_user_id_users_id_fk',
    'external_programs_training_system_id_training_systems_id_fk',
    'rate_limit_counters_key_window_start_pk'
  )
ORDER BY con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_chat_turns_conversation_client_turn',
    'rate_limit_counters_expires_at_idx',
    'idx_kevin_events_processing',
    'idx_kevin_outcomes_idempotency',
    'idx_kevin_outcomes_processing'
  )
ORDER BY indexname;

SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;

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

SELECT count(*) AS external_program_training_system_orphan_count
FROM public.external_programs p
LEFT JOIN public.training_systems s ON s.id = p.training_system_id
WHERE p.training_system_id IS NOT NULL AND s.id IS NULL;

SELECT count(*) AS outcome_idempotency_null_count
FROM public.kevin_training_outcomes
WHERE idempotency_key IS NULL;

SELECT count(*) AS outcome_idempotency_duplicate_group_count
FROM (
  SELECT idempotency_key
  FROM public.kevin_training_outcomes
  GROUP BY idempotency_key
  HAVING count(*) > 1
) duplicate_groups;

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
UNION ALL SELECT 'rate_limit_counters', count(*) FROM public.rate_limit_counters
UNION ALL SELECT 'chat_turns', count(*) FROM public.chat_turns
UNION ALL SELECT 'billing_linked_users', count(*) FROM public.users
  WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
ORDER BY table_name;
