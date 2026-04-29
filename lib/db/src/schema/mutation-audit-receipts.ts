import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
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
 *   - Intent-family-aware. Every row knows its IntentFamily classification.
 *   - Before/after are delta arrays (names that were removed / added), not
 *     full snapshots. Full snapshots live in system_change_log.
 *   - persistedConstraints lists constraint keys written to the user profile
 *     as a result of this adjustment (e.g. "belt_squat_unavailable").
 *   - verificationStatus follows the MutationVerificationResult contract:
 *     "verified" | "partial" | "failed" | "noop" | "unclear"
 *   - responseShown captures the exact text surfaced to the user after the
 *     adjustment. NEVER written unless the mutation verifier has confirmed.
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
   * Exercise / session / block names that were present BEFORE and are now gone.
   * Computed as: names in beforeSnapshot.exercises not in afterSnapshot.exercises.
   * Empty array if nothing was removed.
   */
  before: jsonb("before").$type<string[]>().notNull().default([]),

  /**
   * Exercise / session / block names that are present AFTER but were not before.
   * Computed as: names in afterSnapshot.exercises not in beforeSnapshot.exercises.
   * Empty array if nothing was added.
   */
  after: jsonb("after").$type<string[]>().notNull().default([]),

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
