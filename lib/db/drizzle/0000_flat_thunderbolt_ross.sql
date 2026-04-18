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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"saved_program_id" integer,
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
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "training_weeks" ADD CONSTRAINT "training_weeks_training_phase_id_training_phases_id_fk" FOREIGN KEY ("training_phase_id") REFERENCES "public"."training_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neural_profiles" ADD CONSTRAINT "neural_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_clarifications" ADD CONSTRAINT "pending_clarifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_clarifications" ADD CONSTRAINT "pending_clarifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_submissions" ADD CONSTRAINT "support_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;