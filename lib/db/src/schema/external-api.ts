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
