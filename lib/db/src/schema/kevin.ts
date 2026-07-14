import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─────────────────────────────────────────────────────────────────────────────
// Kevin Integration Schema
//
// Kevin is the persistent executive intelligence and institutional-memory
// runtime shared across the TrainEfficiency ecosystem.
//
// TrainChat uses Kevin for:
//   - persistent cross-session memory and preference synthesis
//   - recurring-pattern detection
//   - product and operational intelligence
//   - cross-application context (requires explicit consent)
//
// Kevin DOES NOT:
//   - generate workouts
//   - bypass TrainChat validation or transactions
//   - directly modify user data
//   - receive raw PII or health data
//
// All Kevin features are opt-in via environment flags. When Kevin is
// unavailable, TrainChat degrades gracefully — no workout is ever blocked.
// ─────────────────────────────────────────────────────────────────────────────

// ─── kevin_app_capabilities ──────────────────────────────────────────────────
//
// Controls Kevin functionality per tenant, organization, or application scope.
// Every capability defaults to "observe" on first release.

export const KEVIN_CAPABILITY_MODES = [
  "disabled",
  "observe",
  "recommend",
  "draft",
  "require_approval",
  "auto",
] as const;
export type KevinCapabilityMode = (typeof KEVIN_CAPABILITY_MODES)[number];

export const KEVIN_CAPABILITIES = [
  "training_context",
  "preference_memory",
  "program_generation_context",
  "program_edit_context",
  "exercise_substitution_context",
  "session_feedback_learning",
  "program_outcome_learning",
  "product_signal_intake",
  "support_navigation",
  "cross_application_context",
] as const;
export type KevinCapability = (typeof KEVIN_CAPABILITIES)[number];

export const kevinAppCapabilitiesTable = pgTable(
  "kevin_app_capabilities",
  {
    id: serial("id").primaryKey(),

    scopeType: text("scope_type", {
      enum: ["application", "organization", "user"],
    })
      .notNull()
      .default("application"),

    scopeId: text("scope_id").notNull().default("trainchat"),

    capability: text("capability", { enum: KEVIN_CAPABILITIES }).notNull(),

    approvalMode: text("approval_mode", {
      enum: KEVIN_CAPABILITY_MODES,
    })
      .notNull()
      .default("observe"),

    enabled: boolean("enabled").notNull().default(false),

    updatedBy: text("updated_by"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("idx_kevin_capabilities_scope").on(t.scopeType, t.scopeId, t.capability)],
);

export type KevinAppCapability = typeof kevinAppCapabilitiesTable.$inferSelect;
export type InsertKevinAppCapability =
  typeof kevinAppCapabilitiesTable.$inferInsert;

// ─── kevin_app_events ────────────────────────────────────────────────────────
//
// Durable TrainChat-to-Kevin event queue with retry and dead-letter support.
// Events are enqueued asynchronously and dispatched by the Kevin event worker.
// Payloads are sanitized — no raw PII, emails, or health data.

export const KEVIN_EVENT_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "dead_lettered",
] as const;
export type KevinEventStatus = (typeof KEVIN_EVENT_STATUSES)[number];

export const KEVIN_EVENT_TYPES = [
  "trainchat.user.onboarded",
  "trainchat.program.generated",
  "trainchat.program.edited",
  "trainchat.session.generated",
  "trainchat.session.regenerated",
  "trainchat.exercise.substituted",
  "trainchat.feedback.submitted",
  "trainchat.session.completed",
  "trainchat.program.completed",
  "trainchat.program.abandoned",
  "trainchat.external_api.generated",
  "trainchat.external_api.edited",
] as const;
export type KevinEventType = (typeof KEVIN_EVENT_TYPES)[number];

export const kevinAppEventsTable = pgTable(
  "kevin_app_events",
  {
    id: serial("id").primaryKey(),

    applicationId: text("application_id").notNull().default("trainchat"),

    orgId: text("org_id"),

    userIdPseudonymous: text("user_id_pseudonymous").notNull(),

    eventType: text("event_type", { enum: KEVIN_EVENT_TYPES }).notNull(),

    entityType: text("entity_type"),

    entityId: text("entity_id"),

    // Sanitized summary payload — no PII, emails, health data
    payload: jsonb("payload").notNull().default({}),

    idempotencyKey: text("idempotency_key").notNull().unique(),

    status: text("status", { enum: KEVIN_EVENT_STATUSES })
      .notNull()
      .default("pending"),

    attempts: integer("attempts").notNull().default(0),

    lastError: text("last_error"),

    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),

    traceId: text("trace_id"),

    origin: text("origin"),

    depth: integer("depth").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    sentAt: timestamp("sent_at", { withTimezone: true }),

    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_kevin_events_status").on(t.status, t.nextRetryAt),
    index("idx_kevin_events_user").on(t.userIdPseudonymous),
  ],
);

export type KevinAppEvent = typeof kevinAppEventsTable.$inferSelect;
export type InsertKevinAppEvent = typeof kevinAppEventsTable.$inferInsert;

// ─── kevin_context_requests ───────────────────────────────────────────────────
//
// Audit log for optional Kevin context fetched before generation or editing.
// Records what was asked, what was returned, and how long it took.
// Does NOT store hidden prompts or raw chain-of-thought.

export const KEVIN_CONTEXT_WORKFLOWS = [
  "program_generation",
  "session_generation",
  "program_edit",
  "session_edit",
  "exercise_substitution",
  "feedback_interpretation",
  "onboarding_assistance",
  "support_navigation",
] as const;
export type KevinContextWorkflow = (typeof KEVIN_CONTEXT_WORKFLOWS)[number];

export const KEVIN_CONTEXT_STATUSES = [
  "success",
  "empty",
  "disabled",
  "consent_required",
  "unavailable",
  "timeout",
  "failed",
  "blocked_loop",
] as const;
export type KevinContextStatus = (typeof KEVIN_CONTEXT_STATUSES)[number];

export const kevinContextRequestsTable = pgTable(
  "kevin_context_requests",
  {
    id: serial("id").primaryKey(),

    applicationId: text("application_id").notNull().default("trainchat"),

    orgId: text("org_id"),

    userIdPseudonymous: text("user_id_pseudonymous").notNull(),

    workflow: text("workflow", {
      enum: KEVIN_CONTEXT_WORKFLOWS,
    }).notNull(),

    entityType: text("entity_type"),

    entityId: text("entity_id"),

    // Summary of the question asked (not raw prompt)
    questionSummary: text("question_summary"),

    // Summary of the response (not raw memory documents)
    responseSummary: text("response_summary"),

    memoriesCount: integer("memories_count").notNull().default(0),

    confidence: integer("confidence"),

    durationMs: integer("duration_ms"),

    status: text("status", { enum: KEVIN_CONTEXT_STATUSES })
      .notNull()
      .default("pending" as any),

    traceId: text("trace_id"),

    depth: integer("depth").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_kevin_ctx_user").on(t.userIdPseudonymous)],
);

export type KevinContextRequest =
  typeof kevinContextRequestsTable.$inferSelect;
export type InsertKevinContextRequest =
  typeof kevinContextRequestsTable.$inferInsert;

// ─── kevin_training_outcomes ─────────────────────────────────────────────────
//
// Records what happened after a Kevin-informed recommendation or generated
// session. Acceptance ≠ completion; completion ≠ positive adaptation.
// Only outcomes TrainChat can actually observe are recorded here.

export const KEVIN_OUTCOME_TYPES = [
  "generated",
  "accepted_without_change",
  "edited_before_use",
  "exercise_replaced",
  "session_started",
  "session_completed",
  "session_partially_completed",
  "session_skipped",
  "program_completed",
  "program_abandoned",
  "feedback_positive",
  "feedback_negative",
  "too_easy",
  "too_hard",
  "too_long",
  "too_short",
  "equipment_unavailable",
  "exercise_disliked",
  "exercise_preferred",
] as const;
export type KevinOutcomeType = (typeof KEVIN_OUTCOME_TYPES)[number];

export const KEVIN_FORWARD_STATUSES = [
  "pending",
  "processing",
  "forwarded",
  "failed",
  "skipped",
  "dead_lettered",
] as const;
export type KevinForwardStatus = (typeof KEVIN_FORWARD_STATUSES)[number];

export const kevinTrainingOutcomesTable = pgTable(
  "kevin_training_outcomes",
  {
    id: serial("id").primaryKey(),

    applicationId: text("application_id").notNull().default("trainchat"),

    orgId: text("org_id"),

    userIdPseudonymous: text("user_id_pseudonymous").notNull(),

    contextRequestId: integer("context_request_id").references(
      () => kevinContextRequestsTable.id,
      { onDelete: "set null" },
    ),

    entityType: text("entity_type"),

    entityId: text("entity_id"),

    outcomeType: text("outcome_type", { enum: KEVIN_OUTCOME_TYPES }).notNull(),

    // Categorical result summary — no clinical inference
    resultSummary: jsonb("result_summary"),

    wasUseful: boolean("was_useful"),

    wasModified: boolean("was_modified"),

    completionStatus: text("completion_status"),

    forwardStatus: text("forward_status", {
      enum: KEVIN_FORWARD_STATUSES,
    })
      .notNull()
      .default("pending"),

    forwardAttempts: integer("forward_attempts").notNull().default(0),

    lastForwardError: text("last_forward_error"),

    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),

    traceId: text("trace_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),

    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_kevin_outcomes_user").on(t.userIdPseudonymous),
    index("idx_kevin_outcomes_fwd").on(t.forwardStatus),
  ],
);

export type KevinTrainingOutcome =
  typeof kevinTrainingOutcomesTable.$inferSelect;
export type InsertKevinTrainingOutcome =
  typeof kevinTrainingOutcomesTable.$inferInsert;

// ─── kevin_app_signals ────────────────────────────────────────────────────────
//
// Receives product, support, quality, and operational signals FROM Kevin.
// Signals are evidence only — Kevin cannot directly change workouts, billing,
// consents, or any user data via signals.

export const KEVIN_SIGNAL_TYPES = [
  "preference.pattern.detected",
  "adherence.pattern.detected",
  "program.quality.concern",
  "repeated.edit.pattern",
  "exercise.dislike.pattern",
  "session.duration.pattern",
  "generation.failure.pattern",
  "external_api.failure.pattern",
  "product.support.signal",
  "environment.change",
  "architecture.change",
  "integration.failure",
  "memory.conflict",
] as const;
export type KevinSignalType = (typeof KEVIN_SIGNAL_TYPES)[number];

export const KEVIN_SIGNAL_STATUSES = [
  "received",
  "routed",
  "reviewed",
  "dismissed",
  "blocked",
] as const;
export type KevinSignalStatus = (typeof KEVIN_SIGNAL_STATUSES)[number];

export const KEVIN_SIGNAL_RISK_CLASSES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type KevinSignalRiskClass = (typeof KEVIN_SIGNAL_RISK_CLASSES)[number];

export const kevinAppSignalsTable = pgTable(
  "kevin_app_signals",
  {
    id: serial("id").primaryKey(),

    externalSignalId: text("external_signal_id"),

    applicationId: text("application_id").notNull().default("trainchat"),

    orgId: text("org_id"),

    signalType: text("signal_type", { enum: KEVIN_SIGNAL_TYPES }).notNull(),

    entityType: text("entity_type"),

    entityId: text("entity_id"),

    title: text("title"),

    summary: text("summary"),

    // Structured evidence — no executable code, SQL, or arbitrary routes
    evidence: jsonb("evidence"),

    confidence: integer("confidence"),

    riskClass: text("risk_class", {
      enum: KEVIN_SIGNAL_RISK_CLASSES,
    }).default("low"),

    status: text("status", { enum: KEVIN_SIGNAL_STATUSES })
      .notNull()
      .default("received"),

    routedTo: text("routed_to"),

    traceId: text("trace_id"),

    depth: integer("depth").notNull().default(0),

    parentId: text("parent_id"),

    origin: text("origin"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    routedAt: timestamp("routed_at", { withTimezone: true }),

    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_kevin_signals_status").on(t.status),
    index("idx_kevin_signals_type").on(t.signalType),
  ],
);

export type KevinAppSignal = typeof kevinAppSignalsTable.$inferSelect;
export type InsertKevinAppSignal = typeof kevinAppSignalsTable.$inferInsert;

// ─── kevin_memory_consents ────────────────────────────────────────────────────
//
// Records whether a user or organization allows persistent Kevin memory.
// Cross-application context defaults to "not_requested" and must never be
// enabled automatically. TrainChat and TrainEfficiency users must NOT be
// linked solely because their email addresses match.

export const KEVIN_CONSENT_STATUSES = [
  "granted",
  "denied",
  "revoked",
  "not_requested",
] as const;
export type KevinConsentStatus = (typeof KEVIN_CONSENT_STATUSES)[number];

export const KEVIN_MEMORY_TYPES = [
  "training_preferences",
  "exercise_preferences",
  "equipment_preferences",
  "schedule_preferences",
  "communication_preferences",
  "program_history_summary",
  "cross_application_context",
] as const;
export type KevinMemoryType = (typeof KEVIN_MEMORY_TYPES)[number];

export const kevinMemoryConsentsTable = pgTable(
  "kevin_memory_consents",
  {
    id: serial("id").primaryKey(),

    scopeType: text("scope_type", {
      enum: ["user", "organization"],
    })
      .notNull()
      .default("user"),

    scopeId: text("scope_id").notNull(),

    memoryType: text("memory_type", { enum: KEVIN_MEMORY_TYPES }).notNull(),

    consentStatus: text("consent_status", { enum: KEVIN_CONSENT_STATUSES })
      .notNull()
      .default("not_requested"),

    grantedAt: timestamp("granted_at", { withTimezone: true }),

    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_kevin_consents_scope").on(
      t.scopeType,
      t.scopeId,
      t.memoryType,
    ),
  ],
);

export type KevinMemoryConsent = typeof kevinMemoryConsentsTable.$inferSelect;
export type InsertKevinMemoryConsent =
  typeof kevinMemoryConsentsTable.$inferInsert;

// ─── kevin_identity_links ─────────────────────────────────────────────────────
//
// Future: links a TrainChat user to a global Kevin subject_id for
// cross-application context (e.g. TrainEfficiency ↔ TrainChat).
//
// IMPORTANT: Cross-application memory requires:
//   - explicit consent (kevin_memory_consents.cross_application_context = granted)
//   - an approved link record here
//   - matching ownership or organizational authority
//   - revocation support
//
// Users MUST NOT be linked solely because their email addresses match.
// This table is created now but NO link creation endpoints exist yet.
// link_status defaults to "pending" and no code activates it in Phase 0–10.

export const KEVIN_LINK_STATUSES = [
  "pending",
  "approved",
  "revoked",
  "rejected",
] as const;
export type KevinLinkStatus = (typeof KEVIN_LINK_STATUSES)[number];

export const kevinIdentityLinksTable = pgTable(
  "kevin_identity_links",
  {
    id: serial("id").primaryKey(),

    globalSubjectId: text("global_subject_id"),

    applicationId: text("application_id").notNull().default("trainchat"),

    applicationUserId: integer("application_user_id").references(
      () => usersTable.id,
      { onDelete: "cascade" },
    ),

    linkStatus: text("link_status", { enum: KEVIN_LINK_STATUSES })
      .notNull()
      .default("pending"),

    linkMethod: text("link_method"),

    consentStatus: text("consent_status", { enum: KEVIN_CONSENT_STATUSES })
      .notNull()
      .default("not_requested"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_kevin_links_user").on(t.applicationUserId),
    index("idx_kevin_links_subject").on(t.globalSubjectId),
  ],
);

export type KevinIdentityLink = typeof kevinIdentityLinksTable.$inferSelect;
export type InsertKevinIdentityLink =
  typeof kevinIdentityLinksTable.$inferInsert;
