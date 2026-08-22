CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"email" text,
	"password_hash" text,
	"name" text,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_status" text DEFAULT 'active' NOT NULL,
	"billing_interval" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_end" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"account_deletion_status" text,
	"account_deletion_requested_at" timestamp with time zone,
	"account_deletion_error" text,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_device_id_unique" UNIQUE("device_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"training_goal" text NOT NULL,
	"experience_level" text NOT NULL,
	"training_style" text NOT NULL,
	"days_per_week" integer NOT NULL,
	"session_duration" integer NOT NULL,
	"equipment_access" text NOT NULL,
	"injuries" text,
	"sport_focus" text,
	"exercise_preferences" text,
	"exercises_to_avoid" text,
	"years_training" integer,
	"calibration_score" integer DEFAULT 0,
	"secondary_sports" text,
	"position_or_role" text,
	"schedule_consistency" text,
	"recovery_consistency" text,
	"coaching_style_preference" text,
	"autoregulation_comfort" text,
	"motivation_style" text,
	"confidence_under_fatigue" text,
	"training_aggression" text,
	"exercise_confidence" text,
	"coaching_precision_score" integer DEFAULT 0,
	"athlete_dna" jsonb,
	"coaching_precision_history" jsonb,
	"notification_preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"training_system_id" integer,
	"training_week_id" integer,
	"training_session_id" integer,
	"saved_program_id" integer,
	"day_number" integer,
	"session_date" date NOT NULL,
	"focus_mode" text DEFAULT 'strength' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_turn_id" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"response_payload" text,
	"quota_charged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"structured_data" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_day_id" integer NOT NULL,
	"name" text NOT NULL,
	"sets" integer,
	"reps" text,
	"rest" text,
	"notes" text,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"day_number" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "saved_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"conversation_id" integer,
	"name" text NOT NULL,
	"description" text,
	"week_number" integer DEFAULT 1,
	"block_label" text,
	"parent_program_id" integer,
	"version_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"sleep_score" smallint NOT NULL,
	"energy_score" smallint NOT NULL,
	"soreness_score" smallint NOT NULL,
	"stress_score" smallint NOT NULL,
	"motivation_score" smallint NOT NULL,
	"pain_score" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"saved_program_id" integer,
	"difficulty_score" smallint NOT NULL,
	"pain_response_score" smallint NOT NULL,
	"energy_response_score" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"sentiment" text NOT NULL,
	"confidence" smallint DEFAULT 2 NOT NULL,
	"source" text NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"saved_program_id" integer,
	"training_system_id" integer,
	"training_week_id" integer,
	"training_session_id" integer,
	"conversation_id" integer,
	"day_number" integer,
	"session_type" text DEFAULT 'workout' NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_status" text DEFAULT 'completed',
	"difficulty_score" real,
	"pain_score" real,
	"energy_score" real,
	"enjoyment_score" smallint,
	"actual_duration" real,
	"pain_areas" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"teaser_uses_count" integer DEFAULT 0 NOT NULL,
	"onboarding_started_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"first_program_generated_at" timestamp with time zone,
	"paywall_shown_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"linked_user_id" integer,
	"metadata" jsonb,
	"ab_variant" text DEFAULT 'control',
	CONSTRAINT "guest_sessions_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"device_id" text,
	"guest_session_id" integer,
	"user_id" integer,
	"properties" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "propagation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"training_system_id" integer NOT NULL,
	"change_log_id" integer,
	"source_week_number" integer NOT NULL,
	"source_exercise_id" integer NOT NULL,
	"target_week_number" integer NOT NULL,
	"target_exercise_id" integer NOT NULL,
	"propagation_mode" text NOT NULL,
	"action" text NOT NULL,
	"safety_score" integer DEFAULT 0 NOT NULL,
	"changed_fields" jsonb,
	"skipped_reason" text,
	"initiated_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_session_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'primary' NOT NULL,
	"sets" integer,
	"reps" text,
	"tempo" text,
	"rest" text,
	"rpe" text,
	"notes" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_change_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"training_system_id" integer NOT NULL,
	"source" text DEFAULT 'ai_edit' NOT NULL,
	"intent" text NOT NULL,
	"scope" text NOT NULL,
	"change_summary" text NOT NULL,
	"request_text" text,
	"is_major_version" boolean DEFAULT false NOT NULL,
	"version_label" text,
	"target_type" text,
	"target_id" integer,
	"target_label" text,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"restored_from_id" integer,
	"decision_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_system_id" integer NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"emphasis" text,
	"week_count" integer DEFAULT 4 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_week_id" integer NOT NULL,
	"label" text NOT NULL,
	"session_type" text DEFAULT 'lifting' NOT NULL,
	"day_of_week" integer,
	"emphasis" text,
	"warmup_notes" text,
	"cooldown_notes" text,
	"coaching_notes" text,
	"is_rest_day" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"conversation_id" integer,
	"name" text NOT NULL,
	"overarching_goal" text NOT NULL,
	"training_style" text NOT NULL,
	"weekly_frequency" integer NOT NULL,
	"equipment_access" text NOT NULL,
	"constraints" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_phase_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_phase_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" text,
	"focus" text,
	"volume_level" text DEFAULT 'moderate' NOT NULL,
	"notes" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"movement_pattern" text NOT NULL,
	"body_region" text,
	"role" text,
	"unilateral" boolean DEFAULT false NOT NULL,
	"primary_muscle" text NOT NULL,
	"secondary_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty_level" text DEFAULT 'intermediate' NOT NULL,
	"neural_demand" text DEFAULT 'moderate',
	"time_cost" text DEFAULT 'moderate',
	"intent_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sport_transfer_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"joint_stress_profile" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_id" text,
	"easier_variations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"harder_variations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_library_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "coaching_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sport" text,
	"goal" text,
	"body_region" text,
	"movement_pattern" text,
	"population" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"exercise_name" text NOT NULL,
	"program_id" integer,
	"day_number" integer,
	"order_index" integer,
	"load_used" real,
	"reps_completed" integer,
	"sets_completed" integer,
	"rpe" real,
	"completion_status" text DEFAULT 'solid' NOT NULL,
	"exercise_role" text DEFAULT 'compound',
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neural_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"consistency_score" real DEFAULT 0 NOT NULL,
	"progression_score" real DEFAULT 0 NOT NULL,
	"recovery_score" real DEFAULT 0 NOT NULL,
	"total_sessions_completed" integer DEFAULT 0 NOT NULL,
	"neural_connections" integer DEFAULT 0 NOT NULL,
	"unlocked_milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"graph_state" jsonb,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neural_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "global_learning_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"event_type" text NOT NULL,
	"route_used" text,
	"intent_type" text,
	"edit_subtype" text,
	"program_goal" text,
	"sport" text,
	"training_level" text,
	"ui_page" text,
	"target_scope" text,
	"normalized_request_key" text,
	"mutation_applied" boolean,
	"validator_passed" boolean,
	"followup_action" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"summary" text NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"recommendation" text DEFAULT 'needs_more_data' NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"promoted_at" timestamp with time zone,
	"dismissed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_clarifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"target_program_id" integer,
	"target_session_id" integer,
	"original_request" text NOT NULL,
	"intent_family" text NOT NULL,
	"pending_aspect" text NOT NULL,
	"partial_edit_plan" text,
	"clarification_question" text NOT NULL,
	"edit_subtype" text,
	"edit_intent" text,
	"turns_remaining" integer DEFAULT 2 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"category" text,
	"subject" text,
	"message" text NOT NULL,
	"metadata" jsonb,
	"email_sent" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "share_moment_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"moment_type" text NOT NULL,
	"trigger_source" text NOT NULL,
	"data_source" text,
	"share_card_generated" boolean DEFAULT false NOT NULL,
	"share_action_used" text,
	"caption_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_adjustment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"training_system_id" integer,
	"focus_mode" text DEFAULT 'strength' NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"scope" text,
	"source" text,
	"visible_priority" text DEFAULT 'medium' NOT NULL,
	"is_new" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutation_audit_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"training_system_id" integer,
	"change_log_id" integer,
	"conversation_id" text,
	"user_request" text NOT NULL,
	"intent_family" text NOT NULL,
	"target_scope" text,
	"persistence_type" text,
	"mutation_type" text,
	"before" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"after" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before_program_snapshot" jsonb,
	"after_program_snapshot" jsonb,
	"persisted_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" text NOT NULL,
	"repair_attempted" boolean DEFAULT false NOT NULL,
	"response_shown" text,
	"source" text,
	"focus_mode" text,
	"audit_receipt_version" integer DEFAULT 2 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text NOT NULL,
	"trust_level" text DEFAULT 'high' NOT NULL,
	"chunk_type" text DEFAULT 'summary' NOT NULL,
	"applicability_class" text,
	"embedding" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_discovery_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"source" text,
	"query_set" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidates_found" integer DEFAULT 0 NOT NULL,
	"candidates_stored" integer DEFAULT 0 NOT NULL,
	"duplicates_skipped" integer DEFAULT 0 NOT NULL,
	"librarian_reviewed" integer DEFAULT 0 NOT NULL,
	"approved_suggested" integer DEFAULT 0 NOT NULL,
	"needs_review" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"authors" text,
	"year" integer,
	"source" text NOT NULL,
	"journal" text,
	"url" text,
	"doi" text,
	"category" text NOT NULL,
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"population_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_type" text,
	"trust_level" text DEFAULT 'high' NOT NULL,
	"confidence" text DEFAULT 'moderate' NOT NULL,
	"abstract" text,
	"plain_language_summary" text,
	"coaching_implications" text,
	"programming_implications" text,
	"safety_considerations" text,
	"limitations" text,
	"contraindications" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"librarian_recommendation" text,
	"librarian_admin_notes" text,
	"warning_flags" jsonb,
	"is_foundational" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "research_paper_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"authors" text,
	"year" integer,
	"journal" text,
	"doi" text,
	"pubmed_id" text,
	"semantic_scholar_id" text,
	"abstract" text,
	"source_url" text,
	"source_api" text,
	"category" text NOT NULL,
	"discovery_query" text,
	"citation_count" integer,
	"publication_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"librarian_recommendation" text,
	"trust_level" text,
	"confidence" text,
	"warning_flags" jsonb,
	"librarian_notes" text,
	"duplicate_of_document_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"normalized_key" text NOT NULL,
	"confidence" smallint DEFAULT 2 NOT NULL,
	"importance" smallint DEFAULT 3 NOT NULL,
	"source_conversation_id" integer,
	"source_message_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "external_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "external_api_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key_id" integer,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer,
	"request_size" integer,
	"response_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_program_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_program_id" integer NOT NULL,
	"api_key_id" integer,
	"program_snapshot" jsonb NOT NULL,
	"type" text DEFAULT 'edit' NOT NULL,
	"instruction" text,
	"scope" text,
	"change_summary" jsonb,
	"reverted_from_version_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key_id" integer,
	"program_data" jsonb NOT NULL,
	"training_system_id" integer,
	"request_context" jsonb,
	"summary" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitepaper_publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"subtitle" text,
	"abstract" text,
	"body_json" jsonb,
	"citations_json" jsonb,
	"seo_metadata_json" jsonb,
	"keywords" text[],
	"estimated_pages" text,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whitepaper_publications_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "whitepaper_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_generate" boolean DEFAULT true NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitepaper_topic_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"subtitle" text,
	"thesis" text,
	"target_audience" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whitepaper_topic_queue_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_directory" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category" text NOT NULL,
	"subcategory" text,
	"description" text,
	"primary_use" text,
	"sports" text[],
	"age_groups" text[],
	"cost_tier" text,
	"portability" text,
	"equipment_required" text,
	"website" text,
	"image_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_exercise_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"exercise_name" text NOT NULL,
	"weakness" text NOT NULL,
	"prescription" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_method_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"method_name" text NOT NULL,
	"weakness" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_product_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"role" text DEFAULT 'recommended' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_quality_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"quality_name" text NOT NULL,
	"link_type" text DEFAULT 'measures' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"metric" text,
	"unit" text,
	"sport_relevance" text[],
	"difficulty" text,
	"equipment_required" text[],
	"normative_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"training_system_id" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"goal" text,
	"sport" text,
	"position" text,
	"training_age" text,
	"focus_mode" text,
	"priority_qualities" jsonb,
	"limiting_factors" jsonb,
	"recommended_methods" jsonb,
	"equipment_opportunities" jsonb,
	"recommended_exercise_pool" jsonb,
	"risk_factors" jsonb,
	"expected_adaptations" jsonb,
	"source_assessments" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "kevin_app_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_type" text DEFAULT 'application' NOT NULL,
	"scope_id" text DEFAULT 'trainchat' NOT NULL,
	"capability" text NOT NULL,
	"approval_mode" text DEFAULT 'observe' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_app_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" text DEFAULT 'trainchat' NOT NULL,
	"org_id" text,
	"user_id_pseudonymous" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"trace_id" text,
	"origin" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	CONSTRAINT "kevin_app_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "kevin_app_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_signal_id" text,
	"application_id" text DEFAULT 'trainchat' NOT NULL,
	"org_id" text,
	"signal_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"title" text,
	"summary" text,
	"evidence" jsonb,
	"confidence" integer,
	"risk_class" text DEFAULT 'low',
	"status" text DEFAULT 'received' NOT NULL,
	"routed_to" text,
	"trace_id" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"parent_id" text,
	"origin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"routed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kevin_context_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" text DEFAULT 'trainchat' NOT NULL,
	"org_id" text,
	"user_id_pseudonymous" text NOT NULL,
	"workflow" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"question_summary" text,
	"response_summary" text,
	"memories_count" integer DEFAULT 0 NOT NULL,
	"confidence" integer,
	"duration_ms" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"trace_id" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_identity_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"global_subject_id" text,
	"application_id" text DEFAULT 'trainchat' NOT NULL,
	"application_user_id" integer,
	"link_status" text DEFAULT 'pending' NOT NULL,
	"link_method" text,
	"consent_status" text DEFAULT 'not_requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kevin_memory_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_type" text DEFAULT 'user' NOT NULL,
	"scope_id" text NOT NULL,
	"memory_type" text NOT NULL,
	"consent_status" text DEFAULT 'not_requested' NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_training_outcomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" text DEFAULT 'trainchat' NOT NULL,
	"org_id" text,
	"user_id_pseudonymous" text NOT NULL,
	"context_request_id" integer,
	"entity_type" text,
	"entity_id" text,
	"outcome_type" text NOT NULL,
	"result_summary" jsonb,
	"was_useful" boolean,
	"was_modified" boolean,
	"completion_status" text,
	"idempotency_key" text NOT NULL,
	"forward_status" text DEFAULT 'pending' NOT NULL,
	"forward_attempts" integer DEFAULT 0 NOT NULL,
	"last_forward_error" text,
	"next_retry_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"forwarded_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_training_system_id_training_systems_id_fk" FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_program_day_id_program_days_id_fk" FOREIGN KEY ("program_day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_program_id_saved_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."saved_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_programs" ADD CONSTRAINT "saved_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_programs" ADD CONSTRAINT "saved_programs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_entries" ADD CONSTRAINT "readiness_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propagation_events" ADD CONSTRAINT "propagation_events_training_system_id_training_systems_id_fk" FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_training_session_id_training_sessions_id_fk" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_change_log" ADD CONSTRAINT "system_change_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_change_log" ADD CONSTRAINT "system_change_log_training_system_id_training_systems_id_fk" FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_phases" ADD CONSTRAINT "training_phases_training_system_id_training_systems_id_fk" FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_training_week_id_training_weeks_id_fk" FOREIGN KEY ("training_week_id") REFERENCES "public"."training_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_systems" ADD CONSTRAINT "training_systems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_systems" ADD CONSTRAINT "training_systems_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_weeks" ADD CONSTRAINT "training_weeks_training_phase_id_training_phases_id_fk" FOREIGN KEY ("training_phase_id") REFERENCES "public"."training_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neural_profiles" ADD CONSTRAINT "neural_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_clarifications" ADD CONSTRAINT "pending_clarifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_clarifications" ADD CONSTRAINT "pending_clarifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_submissions" ADD CONSTRAINT "support_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_memories" ADD CONSTRAINT "atlas_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_memories" ADD CONSTRAINT "atlas_memories_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_api_keys" ADD CONSTRAINT "external_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_api_logs" ADD CONSTRAINT "external_api_logs_api_key_id_external_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."external_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_program_versions" ADD CONSTRAINT "external_program_versions_external_program_id_external_programs_id_fk" FOREIGN KEY ("external_program_id") REFERENCES "public"."external_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_program_versions" ADD CONSTRAINT "external_program_versions_api_key_id_external_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."external_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_programs" ADD CONSTRAINT "external_programs_api_key_id_external_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."external_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_programs" ADD CONSTRAINT "external_programs_training_system_id_training_systems_id_fk" FOREIGN KEY ("training_system_id") REFERENCES "public"."training_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitepaper_publications" ADD CONSTRAINT "whitepaper_publications_topic_id_whitepaper_topic_queue_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."whitepaper_topic_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_identity_links" ADD CONSTRAINT "kevin_identity_links_application_user_id_users_id_fk" FOREIGN KEY ("application_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_training_outcomes" ADD CONSTRAINT "kevin_training_outcomes_context_request_id_kevin_context_requests_id_fk" FOREIGN KEY ("context_request_id") REFERENCES "public"."kevin_context_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_turns_conversation_client_turn" ON "chat_turns" USING btree ("conversation_id","client_turn_id");--> statement-breakpoint
CREATE INDEX "atlas_memories_user_status_idx" ON "atlas_memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "atlas_memories_user_category_idx" ON "atlas_memories" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "atlas_memories_normalized_key_idx" ON "atlas_memories" USING btree ("normalized_key");--> statement-breakpoint
CREATE INDEX "atlas_memories_last_seen_at_idx" ON "atlas_memories" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_kevin_capabilities_scope" ON "kevin_app_capabilities" USING btree ("scope_type","scope_id","capability");--> statement-breakpoint
CREATE INDEX "idx_kevin_events_status" ON "kevin_app_events" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_kevin_events_user" ON "kevin_app_events" USING btree ("user_id_pseudonymous");--> statement-breakpoint
CREATE INDEX "idx_kevin_events_processing" ON "kevin_app_events" USING btree ("status","processing_started_at");--> statement-breakpoint
CREATE INDEX "idx_kevin_signals_status" ON "kevin_app_signals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kevin_signals_type" ON "kevin_app_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "idx_kevin_ctx_user" ON "kevin_context_requests" USING btree ("user_id_pseudonymous");--> statement-breakpoint
CREATE INDEX "idx_kevin_links_user" ON "kevin_identity_links" USING btree ("application_user_id");--> statement-breakpoint
CREATE INDEX "idx_kevin_links_subject" ON "kevin_identity_links" USING btree ("global_subject_id");--> statement-breakpoint
CREATE INDEX "idx_kevin_consents_scope" ON "kevin_memory_consents" USING btree ("scope_type","scope_id","memory_type");--> statement-breakpoint
CREATE INDEX "idx_kevin_outcomes_user" ON "kevin_training_outcomes" USING btree ("user_id_pseudonymous");--> statement-breakpoint
CREATE INDEX "idx_kevin_outcomes_fwd" ON "kevin_training_outcomes" USING btree ("forward_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_kevin_outcomes_idempotency" ON "kevin_training_outcomes" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_kevin_outcomes_processing" ON "kevin_training_outcomes" USING btree ("forward_status","processing_started_at");