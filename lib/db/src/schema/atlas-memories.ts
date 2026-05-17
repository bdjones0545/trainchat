import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  smallint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const ATLAS_MEMORY_CATEGORIES = [
  "goal",
  "constraint",
  "injury",
  "preference",
  "disliked_exercise",
  "equipment",
  "schedule",
  "sport_context",
  "recovery_pattern",
  "successful_refinement",
  "recurring_request",
  "_extraction_marker",
] as const;

export type AtlasMemoryCategory = (typeof ATLAS_MEMORY_CATEGORIES)[number];

/**
 * Coaching memory signals extracted asynchronously from user conversations.
 *
 * Distinct from userMemoriesTable (onboarding/feedback memories) — these are
 * durable coaching insights mined from chat history by AtlasMemoryExtractor.
 *
 * Status lifecycle: active → superseded | archived
 * Deduplication: normalizedKey — repeated signals raise confidence (max 5).
 */
export const atlasMemoriesTable = pgTable(
  "atlas_memories",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    category: text("category").$type<AtlasMemoryCategory>().notNull(),

    /** Human-readable coaching note ("User reports knee pain on deep squats") */
    summary: text("summary").notNull(),

    /**
     * Dedup key — format: "category:subject_slug"
     * Examples: "injury:knee_deep_squats", "equipment:no_barbell"
     */
    normalizedKey: text("normalized_key").notNull(),

    /** 1 (single casual mention) → 5 (confirmed, repeated, highly specific) */
    confidence: smallint("confidence").notNull().default(2),

    /** 1 (minor preference) → 5 (safety-critical / fundamentally shapes programming) */
    importance: smallint("importance").notNull().default(3),

    /** Conversation the memory was extracted from */
    sourceConversationId: integer("source_conversation_id").references(
      () => conversationsTable.id,
      { onDelete: "set null" },
    ),

    /** Message IDs used as evidence */
    sourceMessageIds: jsonb("source_message_ids").$type<number[]>().default([]),

    /** Arbitrary extra data (raw extraction output, override reason, etc.) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    /** active | superseded | archived */
    status: text("status").notNull().default("active"),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userStatusIdx: index("atlas_memories_user_status_idx").on(table.userId, table.status),
    userCategoryIdx: index("atlas_memories_user_category_idx").on(table.userId, table.category),
    normalizedKeyIdx: index("atlas_memories_normalized_key_idx").on(table.normalizedKey),
    lastSeenAtIdx: index("atlas_memories_last_seen_at_idx").on(table.lastSeenAt),
  }),
);

export const insertAtlasMemorySchema = createInsertSchema(atlasMemoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAtlasMemory = z.infer<typeof insertAtlasMemorySchema>;
export type AtlasMemory = typeof atlasMemoriesTable.$inferSelect;
export type AtlasMemoryStatus = "active" | "superseded" | "archived";
