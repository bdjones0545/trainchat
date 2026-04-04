import { pgTable, text, serial, integer, timestamp, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Long-term training memory entries.
 * Stores durable, high-value coaching observations about a user
 * that persist across sessions and inform future AI recommendations.
 */
export const userMemoriesTable = pgTable("user_memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),

  // "exercise_preference" | "pain_pattern" | "session_preference" |
  // "volume_response" | "split_preference" | "recovery_pattern" | "adherence_pattern"
  type: text("type").notNull(),

  // The specific subject of the memory (e.g. "shoulder pressing", "dumbbell exercises")
  subject: text("subject").notNull(),

  // "positive" | "negative" | "neutral"
  sentiment: text("sentiment").notNull(),

  // 1 (low confidence/single signal) to 5 (high confidence/repeated pattern)
  confidence: smallint("confidence").notNull().default(2),

  // Where this memory originated: "onboarding" | "feedback" | "readiness" | "inferred"
  source: text("source").notNull(),

  // Human-readable coaching summary (injected into AI prompt)
  detail: text("detail").notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserMemorySchema = createInsertSchema(userMemoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserMemory = z.infer<typeof insertUserMemorySchema>;
export type UserMemory = typeof userMemoriesTable.$inferSelect;
