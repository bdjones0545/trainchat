import { pgTable, text, serial, integer, timestamp, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const readinessEntriesTable = pgTable("readiness_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sleepScore: smallint("sleep_score").notNull(),       // 1-5
  energyScore: smallint("energy_score").notNull(),     // 1-5
  sorenessScore: smallint("soreness_score").notNull(), // 1-5 (1=no soreness, 5=very sore)
  stressScore: smallint("stress_score").notNull(),     // 1-5 (1=low stress, 5=high stress)
  motivationScore: smallint("motivation_score").notNull(), // 1-5
  painScore: smallint("pain_score").notNull(),         // 1-5 (1=no pain, 5=significant pain)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReadinessSchema = createInsertSchema(readinessEntriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReadiness = z.infer<typeof insertReadinessSchema>;
export type ReadinessEntry = typeof readinessEntriesTable.$inferSelect;

export const sessionFeedbackTable = pgTable("session_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  savedProgramId: integer("saved_program_id"), // nullable — feedback can be for any session
  difficultyScore: smallint("difficulty_score").notNull(),    // 1-5 (1=too easy, 5=too hard)
  painResponseScore: smallint("pain_response_score").notNull(), // 1-5 (1=no pain, 5=significant pain)
  energyResponseScore: smallint("energy_response_score").notNull(), // 1-5 (1=drained, 5=energized)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionFeedbackSchema = createInsertSchema(sessionFeedbackTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSessionFeedback = z.infer<typeof insertSessionFeedbackSchema>;
export type SessionFeedback = typeof sessionFeedbackTable.$inferSelect;
