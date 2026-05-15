import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  /**
   * Legacy calibration score (0-100). Kept for backward compatibility.
   * New precision scoring uses coachingPrecisionScore.
   */
  calibrationScore: integer("calibration_score").default(0),
  /**
   * Secondary sports — JSON array of sport IDs (e.g. ["pickleball", "golf"]).
   * Stored as text (JSON-serialized). Optional. Falls back gracefully when null.
   */
  secondarySports: text("secondary_sports"),
  /**
   * Position or role within the primary sport.
   * Optional. Falls back gracefully when null.
   */
  positionOrRole: text("position_or_role"),

  // ─── Behavioral Athlete Profile (T005) ────────────────────────────────────
  /**
   * How consistently the athlete follows their training schedule.
   * Values: "Highly consistent" | "Mostly consistent" | "Variable week-to-week" | "Often unpredictable"
   */
  scheduleConsistency: text("schedule_consistency"),
  /**
   * How the athlete approaches recovery relative to training.
   * Values: "Prioritize recovery" | "Balanced approach" | "Inconsistent recovery" | "Often overtrain"
   */
  recoveryConsistency: text("recovery_consistency"),
  /**
   * Preferred coaching style and communication cadence.
   * Values: "Direct" | "Explanatory" | "Motivational" | "Minimal"
   */
  coachingStylePreference: text("coaching_style_preference"),
  /**
   * Comfort level with self-regulating training intensity by feel.
   * Values: "Train by feel" | "Mix of both" | "Follow the plan" | "Need clear structure"
   */
  autoregulationComfort: text("autoregulation_comfort"),
  /**
   * Primary motivation driver for training.
   * Values: "Intrinsic" | "Performance" | "Competitive" | "Habit"
   */
  motivationStyle: text("motivation_style"),
  /**
   * How the athlete performs and decides under accumulated fatigue.
   * Values: "High" | "Moderate" | "Low — push through anyway" | "Back off when fatigued"
   */
  confidenceUnderFatigue: text("confidence_under_fatigue"),
  /**
   * How aggressively the athlete tends to train relative to program targets.
   * Values: "Conservative" | "Moderate" | "Aggressive" | "All-out always"
   */
  trainingAggression: text("training_aggression"),
  /**
   * Athlete's confidence in their own exercise technique and judgment.
   * Values: "High" | "Moderate" | "Low — prefer guidance" | "Varies by movement"
   */
  exerciseConfidence: text("exercise_confidence"),

  // ─── Coaching Precision System (T003) ─────────────────────────────────────
  /**
   * Multi-dimensional coaching precision score (0-100).
   * Replaces legacy calibrationScore as the primary intelligence metric.
   * Tiers: 0-25 Basic | 26-50 Context-Aware | 51-75 Adaptive | 76-100 Performance Intelligence
   */
  coachingPrecisionScore: integer("coaching_precision_score").default(0),

  // ─── Athlete DNA (T007) ───────────────────────────────────────────────────
  /**
   * Deterministic athlete identity model synthesized from profile + behavioral signals.
   * Updated on each calibration. Used for Atlas context injection and forecast engine.
   */
  athleteDNA: jsonb("athlete_dna"),

  /**
   * Rolling history of coaching precision scores with timestamps.
   * Used for T006 dynamic precision evolution and T009 intelligence timeline.
   * Array of { score, dimensions, generatedAt }
   */
  coachingPrecisionHistory: jsonb("coaching_precision_history"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
