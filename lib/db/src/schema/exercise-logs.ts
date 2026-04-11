import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const exerciseLogsTable = pgTable("exercise_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  exerciseName: text("exercise_name").notNull(),

  programId: integer("program_id"),
  dayNumber: integer("day_number"),
  orderIndex: integer("order_index"),

  loadUsed: real("load_used"),
  repsCompleted: integer("reps_completed"),
  setsCompleted: integer("sets_completed"),
  rpe: real("rpe"),

  completionStatus: text("completion_status", {
    enum: ["easy", "solid", "hard", "failed"],
  })
    .notNull()
    .default("solid"),

  exerciseRole: text("exercise_role", {
    enum: ["power", "compound", "unilateral", "accessory", "prep", "trunk"],
  }).default("compound"),

  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExerciseLogSchema = createInsertSchema(exerciseLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertExerciseLog = z.infer<typeof insertExerciseLogSchema>;
export type ExerciseLog = typeof exerciseLogsTable.$inferSelect;
