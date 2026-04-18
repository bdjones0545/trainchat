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
  /**
   * Primary sport focus — used as the main sport for programming.
   * Existing field: preserved exactly as before for backward compatibility.
   */
  sportFocus: text("sport_focus"),
  exercisePreferences: text("exercise_preferences"),
  exercisesToAvoid: text("exercises_to_avoid"),
  yearsTraining: integer("years_training"),
  calibrationScore: integer("calibration_score").default(0),
  /**
   * Secondary sports — JSON array of sport IDs (e.g. ["pickleball", "golf"]).
   * Stored as text (JSON-serialized). Optional. Falls back gracefully when null.
   * Example: '["pickleball","golf"]'
   */
  secondarySports: text("secondary_sports"),
  /**
   * Position or role within the primary sport.
   * Examples: "bowler" (cricket), "setter" (volleyball), "pitcher" (baseball)
   * Optional. Falls back gracefully when null.
   */
  positionOrRole: text("position_or_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
