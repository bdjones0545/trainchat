import { pgTable, serial, integer, timestamp, text, real, smallint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sessionLogsTable = pgTable("session_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  savedProgramId: integer("saved_program_id"),
  trainingSystemId: integer("training_system_id"),
  trainingWeekId: integer("training_week_id"),
  trainingSessionId: integer("training_session_id"),
  conversationId: integer("conversation_id"),
  dayNumber: integer("day_number"),
  sessionType: text("session_type").notNull().default("workout"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),

  // Completion status
  sessionStatus: text("session_status", {
    enum: ["completed", "partial", "skipped", "rescheduled"],
  }).default("completed"),

  // Scores (1-5 scale)
  difficultyScore: real("difficulty_score"),
  painScore: real("pain_score"),
  energyScore: real("energy_score"),
  enjoymentScore: smallint("enjoyment_score"),

  // Duration (minutes)
  actualDuration: real("actual_duration"),

  // Body areas with discomfort (e.g. ["knee", "lower_back"])
  painAreas: jsonb("pain_areas").$type<string[]>(),

  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionLogSchema = createInsertSchema(sessionLogsTable).omit({ id: true, createdAt: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLog = typeof sessionLogsTable.$inferSelect;
