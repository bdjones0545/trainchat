import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trainingGoal: text("training_goal").notNull(),
  experienceLevel: text("experience_level").notNull(),
  trainingStyle: text("training_style").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  sessionDuration: integer("session_duration").notNull(),
  equipmentAccess: text("equipment_access").notNull(),
  injuries: text("injuries"),
  sportFocus: text("sport_focus"),
  exercisePreferences: text("exercise_preferences"),
  exercisesToAvoid: text("exercises_to_avoid"),
  yearsTraining: integer("years_training"),
  calibrationScore: integer("calibration_score").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
