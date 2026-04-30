import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * mutation_audit_receipts — immutable record of every adjustment that was
 * attempted on a training program.
 *
 * One row per adjustment event: written immediately after the mutation
 * pipeline completes, regardless of success or failure.
 *
 * Design rules:
 *   - Append-only. Rows are NEVER updated or deleted.
 *   - Non-blocking. A write failure MUST NOT break the edit pipeline.
 *   - Intent-family-aware. Every row knows its IntentFamily + mutation class.
 *   - before/after are delta name arrays (removed / added exercises).
 *   - beforeProgramSnapshot / afterProgramSnapshot are full SystemSnapshots
 *     stored for undo replay and verification.
 *   - verificationStatus: "verified"|"partial"|"failed"|"noop"|"unclear"
 *   - responseShown is ONLY written when the verifier confirms the change.
 *   - v2 adds: targetScope, persistenceType, mutationType,
 *     beforeProgramSnapshot, afterProgramSnapshot, changedExercises,
 *     repairAttempted, auditReceiptVersion.
 */
export const mutationAuditReceiptsTable = pgTable("mutation_audit_receipts", {
  id: serial("id").primaryKey(),

  /** User who made the adjustment request */
  userId: integer("user_id").notNull(),

  /** Training system the adjustment was applied to (nullable for guest edits) */
  trainingSystemId: integer("training_system_id"),

  /** FK to system_change_log for full snapshot access (nullable) */
  changeLogId: integer("change_log_id"),

  /** FK to conversation row where the request originated (nullable) */
  conversationId: text("conversation_id"),

  /** The raw user message that triggered this adjustment */
  userRequest: text("user_request").notNull(),

  /** Normalized IntentFamily classification */
  intentFamily: text("intent_family").notNull(),

  /**
   * Scope of the target entity that was edited.
   * "exercise" | "session" | "week" | "block" | "system"
   */
  targetScope: text("target_scope"),

  /**
   * How long this change should persist.
   * "permanent" | "temporary" | "session_scope" | "program_scope" |
   * "context_update" | "none"
   */
  persistenceType: text("persistence_type"),

  /**
   * What kind of structural change was performed.
   * "substitute" | "remove" | "add" | "reduce" | "increase" |
   * "reorder" | "reorient" | "deload" | "adapt_env" | "store_context" | "none"
   */
  mutationType: text("mutation_type"),

  /**
   * Exercise / session / block names present BEFORE but gone after.
   * Empty array if nothing was removed.
   */
  before: jsonb("before").$type<string[]>().notNull().default([]),

  /**
   * Exercise / session / block names present AFTER but not before.
   * Empty array if nothing was added.
   */
  after: jsonb("after").$type<string[]>().notNull().default([]),

  /**
   * Structured list of exercise changes from the computed diff.
   * Each entry: { from: string; to: string }
   */
  changedExercises: jsonb("changed_exercises")
    .$type<Array<{ from: string; to: string }>>()
    .notNull()
    .default([]),

  /**
   * Full SystemSnapshot captured BEFORE the mutation.
   * Stored for undo replay and post-hoc verification.
   * Nullable — not all paths capture it (e.g. agent edits in early versions).
   */
  beforeProgramSnapshot: jsonb("before_program_snapshot").$type<Record<string, unknown>>(),

  /**
   * Full SystemSnapshot captured AFTER the mutation.
   * Compared against beforeProgramSnapshot to derive the verified diff.
   */
  afterProgramSnapshot: jsonb("after_program_snapshot").$type<Record<string, unknown>>(),

  /**
   * Constraint keys written to the user profile as a result of this adjustment.
   * Examples: "belt_squat_unavailable", "lunges_disliked", "sport:golf"
   * Empty array if no constraints were persisted.
   */
  persistedConstraints: jsonb("persisted_constraints")
    .$type<string[]>()
    .notNull()
    .default([]),

  /**
   * Outcome of the mutation verifier pass.
   *   verified  — all changes confirmed in post-mutation DB state
   *   partial   — some changes confirmed, some missing
   *   failed    — handler reported success but post-state is unchanged
   *   noop      — zero changes were applied
   *   unclear   — changes applied but cannot be deterministically confirmed
   */
  verificationStatus: text("verification_status", {
    enum: ["verified", "partial", "failed", "noop", "unclear"],
  }).notNull(),

  /**
   * Whether a repair pass was attempted after an initial verification failure.
   * True = the system tried to fix the mutation before giving up.
   */
  repairAttempted: boolean("repair_attempted").notNull().default(false),

  /**
   * The exact text shown to the user after the adjustment.
   * Only written when verificationStatus is "verified" or "partial".
   * Null for "failed", "noop", or "unclear" outcomes.
   */
  responseShown: text("response_shown"),

  /**
   * Source surface that initiated the adjustment.
   * "chat" | "edit_panel" | "quick_command" | "checkin" | "agent"
   */
  source: text("source"),

  /** Focus mode active at the time of the adjustment */
  focusMode: text("focus_mode"),

  /** Schema version — v1 rows have no snapshots; v2+ rows have full snapshots */
  auditReceiptVersion: integer("audit_receipt_version").notNull().default(2),

  /** Flexible bag for extra audit context (scope, appliedCount, skippedCount, etc.) */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MutationAuditReceipt =
  typeof mutationAuditReceiptsTable.$inferSelect;
export type InsertMutationAuditReceipt =
  typeof mutationAuditReceiptsTable.$inferInsert;
