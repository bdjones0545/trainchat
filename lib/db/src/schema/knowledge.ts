import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const KNOWLEDGE_TYPES = ["philosophy", "exercise", "rule", "sport_template"] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

/**
 * Coaching Knowledge Base
 *
 * Stores structured coaching knowledge injected into the AI system prompt
 * at program-build time. Entries are tagged and retrieved contextually based
 * on user goal, sport, body region, and intent.
 */
export const coachingKnowledgeTable = pgTable("coaching_knowledge", {
  id: serial("id").primaryKey(),

  // Category of knowledge
  type: text("type", { enum: KNOWLEDGE_TYPES }).notNull(),

  // The actual coaching instruction or note
  content: text("content").notNull(),

  // Flexible tags for retrieval (e.g. ["soccer", "strength", "knee"])
  tags: jsonb("tags").$type<string[]>().notNull().default([]),

  // Structured filter fields for targeted retrieval
  sport: text("sport"),
  goal: text("goal"),
  bodyRegion: text("body_region"),
  movementPattern: text("movement_pattern"),
  population: text("population"),
  sourceType: text("source_type").notNull().default("manual"),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCoachingKnowledgeSchema = createInsertSchema(coachingKnowledgeTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCoachingKnowledge = z.infer<typeof insertCoachingKnowledgeSchema>;
export type CoachingKnowledge = typeof coachingKnowledgeTable.$inferSelect;
