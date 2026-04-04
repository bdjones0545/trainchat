import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const savedProgramsTable = pgTable("saved_programs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => conversationsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSavedProgramSchema = createInsertSchema(savedProgramsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedProgram = z.infer<typeof insertSavedProgramSchema>;
export type SavedProgram = typeof savedProgramsTable.$inferSelect;

export const programDaysTable = pgTable("program_days", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => savedProgramsTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
});

export const insertProgramDaySchema = createInsertSchema(programDaysTable).omit({ id: true });
export type InsertProgramDay = z.infer<typeof insertProgramDaySchema>;
export type ProgramDay = typeof programDaysTable.$inferSelect;

export const exercisesTable = pgTable("exercises", {
  id: serial("id").primaryKey(),
  programDayId: integer("program_day_id").notNull().references(() => programDaysTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sets: integer("sets"),
  reps: text("reps"),
  rest: text("rest"),
  notes: text("notes"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertExerciseSchema = createInsertSchema(exercisesTable).omit({ id: true });
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercisesTable.$inferSelect;
