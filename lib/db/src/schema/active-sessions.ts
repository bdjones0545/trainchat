import { pgTable, serial, integer, timestamp, text, date } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { trainingSystems } from "./training-system";

export const activeSessionsTable = pgTable("active_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trainingSystemId: integer("training_system_id").references(() => trainingSystems.id, { onDelete: "cascade" }),
  trainingWeekId: integer("training_week_id"),
  trainingSessionId: integer("training_session_id"),
  savedProgramId: integer("saved_program_id"),
  dayNumber: integer("day_number"),
  sessionDate: date("session_date").notNull(),
  focusMode: text("focus_mode", {
    enum: ["strength", "speed", "mobility"],
  }).notNull().default("strength"),
  status: text("status", {
    enum: ["in_progress", "completed"],
  }).notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActiveSession = typeof activeSessionsTable.$inferSelect;
