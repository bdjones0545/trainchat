import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── External API Keys ───────────────────────────────────────────────────────
//
// Org-scoped API keys that allow external systems (TrainEfficiency, etc.)
// to call TrainChat's programming intelligence over a secure REST API.
//
// SECURITY: Raw keys are NEVER stored. Only a SHA-256 hash is persisted.
// The key prefix (e.g. "tc_ab12cd") is stored for display/identification only.

export const EXTERNAL_API_PERMISSIONS = [
  "generate_program",
  "edit_program",
  "generate_session",
  "exercise_swap",
  "explain_program",
  "retrieve_program",
  "list_exercises",
  "manage_keys",
] as const;

export type ExternalApiPermission = (typeof EXTERNAL_API_PERMISSIONS)[number];

export const externalApiKeysTable = pgTable("external_api_keys", {
  id: serial("id").primaryKey(),

  orgId: text("org_id"),

  name: text("name").notNull(),

  keyHash: text("key_hash").notNull().unique(),

  prefix: text("prefix").notNull(),

  permissions: jsonb("permissions").$type<ExternalApiPermission[]>().notNull().default([]),

  isActive: boolean("is_active").notNull().default(true),

  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type ExternalApiKey = typeof externalApiKeysTable.$inferSelect;
export type InsertExternalApiKey = typeof externalApiKeysTable.$inferInsert;

// ─── External API Logs ───────────────────────────────────────────────────────
//
// Per-request audit log. Captures enough metadata to debug issues,
// monitor usage, and detect abuse without storing sensitive payloads.

export const externalApiLogsTable = pgTable("external_api_logs", {
  id: serial("id").primaryKey(),

  apiKeyId: integer("api_key_id").references(() => externalApiKeysTable.id, { onDelete: "set null" }),

  endpoint: text("endpoint").notNull(),

  method: text("method").notNull(),

  statusCode: integer("status_code").notNull(),

  latencyMs: integer("latency_ms"),

  requestSize: integer("request_size"),

  responseSize: integer("response_size"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExternalApiLog = typeof externalApiLogsTable.$inferSelect;

// ─── External Programs ───────────────────────────────────────────────────────
//
// Programs generated through the external API are stored here for retrieval.
// This decouples external API program storage from the user-session program
// storage in training_systems.

export const externalProgramsTable = pgTable("external_programs", {
  id: serial("id").primaryKey(),

  apiKeyId: integer("api_key_id").references(() => externalApiKeysTable.id, { onDelete: "set null" }),

  programData: jsonb("program_data").notNull(),

  requestContext: jsonb("request_context"),

  summary: text("summary"),

  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ExternalProgram = typeof externalProgramsTable.$inferSelect;

// ─── External Program Versions ───────────────────────────────────────────────
//
// Append-only version/audit history for external programs. One row is written
// *before* each edit overwrite (Phase 1C) capturing the program state at that
// point, and one row is written before a revert so a rollback is itself
// reversible. This gives change-tracking + rollback parity for the external
// API without yet routing edits through the internal surgical edit-engine
// (Phase 2). Rows cascade-delete with their parent program.

export const EXTERNAL_PROGRAM_VERSION_TYPES = [
  "edit",              // snapshot of the pre-edit program, taken before an edit overwrite
  "revert",            // snapshot of the pre-revert program, taken before a rollback
  "generate_snapshot", // reserved: initial snapshot at generate time
] as const;

export type ExternalProgramVersionType =
  (typeof EXTERNAL_PROGRAM_VERSION_TYPES)[number];

export const externalProgramVersionsTable = pgTable("external_program_versions", {
  id: serial("id").primaryKey(),

  externalProgramId: integer("external_program_id")
    .notNull()
    .references(() => externalProgramsTable.id, { onDelete: "cascade" }),

  // The key that produced this version. Kept for attribution; on key deletion
  // the version row survives (set null) so history is not lost.
  apiKeyId: integer("api_key_id").references(() => externalApiKeysTable.id, {
    onDelete: "set null",
  }),

  // Full program snapshot captured BEFORE the mutation that this row records.
  programSnapshot: jsonb("program_snapshot").notNull(),

  // What kind of event produced this snapshot.
  type: text("type", { enum: EXTERNAL_PROGRAM_VERSION_TYPES })
    .notNull()
    .default("edit"),

  // The edit instruction / scope that triggered the mutation (nullable — a
  // revert has no free-text instruction).
  instruction: text("instruction"),

  scope: text("scope"),

  // Coach-provided summary of the change (array of strings or free text).
  changeSummary: jsonb("change_summary"),

  // For revert rows: the version id whose snapshot was restored.
  revertedFromVersionId: integer("reverted_from_version_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ExternalProgramVersion =
  typeof externalProgramVersionsTable.$inferSelect;
export type InsertExternalProgramVersion =
  typeof externalProgramVersionsTable.$inferInsert;
