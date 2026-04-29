import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  real,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Learning Event Types ──────────────────────────────────────────────────────

export const GLOBAL_LEARNING_EVENT_TYPES = [
  "edit_request",
  "route_decision",
  "mutation_success",
  "mutation_failure",
  "clarification_required",
  "clarification_resolved",
  "user_reverted_change",
  "user_accepted_change",
  "program_followup_edit",
  "session_completion",
  "session_skip",
  "session_feedback",
  "readiness_checkin",
  "adaptation_applied",
  "paywall_conversion",
  "exercise_substitution_accepted",
  "exercise_substitution_rejected",
] as const;

export type GlobalLearningEventType = (typeof GLOBAL_LEARNING_EVENT_TYPES)[number];

// ─── Learning Candidate Types ──────────────────────────────────────────────────

export const LEARNING_CANDIDATE_TYPES = [
  "routing_rule_update",
  "default_execution_rule",
  "exercise_relationship_update",
  "anti_pattern_rule",
  "transformation_rule_update",
  "prompt_guidance_update",
  "validator_rule_update",
  "clarification_policy_update",
] as const;

export type LearningCandidateType = (typeof LEARNING_CANDIDATE_TYPES)[number];

// ─── Risk / Recommendation Levels ─────────────────────────────────────────────

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RECOMMENDATION_TYPES = [
  "review",
  "safe_to_promote",
  "needs_more_data",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

// ─── global_learning_events ────────────────────────────────────────────────────
//
// Structured signals emitted from product interactions. NOT raw logs —
// each row captures a typed, normalized event with contextual fields.
// This table is append-only; the live agent never reads from it.

export const globalLearningEventsTable = pgTable("global_learning_events", {
  id: serial("id").primaryKey(),

  userId: integer("user_id"),

  eventType: text("event_type", {
    enum: GLOBAL_LEARNING_EVENT_TYPES,
  }).notNull(),

  // Which routing path handled this interaction
  routeUsed: text("route_used", {
    enum: ["deterministic", "openai", "library_progression", "rule_based", "structured_intent"],
  }),

  // Classified intent label (e.g. "ADJUST_DIFFICULTY")
  intentType: text("intent_type"),

  // Sub-category for edit requests (e.g. "increase_difficulty", "add_volume")
  editSubtype: text("edit_subtype"),

  // Contextual program metadata at the time of the event
  programGoal: text("program_goal"),
  sport: text("sport"),
  trainingLevel: text("training_level"),

  // Where in the UI the event originated
  uiPage: text("ui_page"),

  // What scope was targeted (e.g. "session", "week", "exercise")
  targetScope: text("target_scope"),

  // Normalized request key produced by the normalization layer
  // e.g. "increase_difficulty_general", "expand_session_volume_day"
  normalizedRequestKey: text("normalized_request_key"),

  // Whether the AI/system attempted a mutation
  mutationApplied: boolean("mutation_applied"),

  // Whether the response passed structural validators
  validatorPassed: boolean("validator_passed"),

  // What the user did next (e.g. "accepted", "reverted", "followup_edit")
  followupAction: text("followup_action"),

  // Flexible bag for event-specific extra data
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GlobalLearningEvent =
  typeof globalLearningEventsTable.$inferSelect;
export type InsertGlobalLearningEvent =
  typeof globalLearningEventsTable.$inferInsert;

// ─── learning_candidates ───────────────────────────────────────────────────────
//
// Surfaced improvement suggestions produced by aggregation pipelines.
// Candidates are NEVER automatically applied to the core system.
// They require explicit admin review (or tightly constrained auto-promotion
// limited to very low-risk, high-confidence routing/UX tweaks).

export const learningCandidatesTable = pgTable("learning_candidates", {
  id: serial("id").primaryKey(),

  type: text("type", { enum: LEARNING_CANDIDATE_TYPES }).notNull(),

  // The normalized pattern key this candidate is about
  key: text("key").notNull(),

  // Human-readable summary of the suggested improvement
  summary: text("summary").notNull(),

  // How many distinct events support this candidate
  evidenceCount: integer("evidence_count").notNull().default(0),

  // 0–1 score derived from success/failure/revert rates
  confidenceScore: real("confidence_score").notNull().default(0),

  // Safety sensitivity classification
  riskLevel: text("risk_level", { enum: RISK_LEVELS })
    .notNull()
    .default("medium"),

  // Admin action recommendation
  recommendation: text("recommendation", {
    enum: RECOMMENDATION_TYPES,
  })
    .notNull()
    .default("needs_more_data"),

  // Whether this candidate has been promoted (reviewed and accepted)
  promoted: boolean("promoted").notNull().default(false),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),

  // Whether this candidate was dismissed without promotion
  dismissed: boolean("dismissed").notNull().default(false),

  // Supporting stats and contextual data
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LearningCandidate =
  typeof learningCandidatesTable.$inferSelect;
export type InsertLearningCandidate =
  typeof learningCandidatesTable.$inferInsert;
