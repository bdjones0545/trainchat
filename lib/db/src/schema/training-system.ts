import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// ─── Training System (top-level persistent system per user) ─────────────────

export const trainingSystems = pgTable("training_systems", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  overarchingGoal: text("overarching_goal").notNull(),
  trainingStyle: text("training_style").notNull(),
  weeklyFrequency: integer("weekly_frequency").notNull(),
  equipmentAccess: text("equipment_access").notNull(),
  constraints: text("constraints"),

  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),

  currentPhaseId: integer("current_phase_id"),

  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTrainingSystemSchema = createInsertSchema(
  trainingSystems
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrainingSystem = z.infer<typeof insertTrainingSystemSchema>;
export type TrainingSystem = typeof trainingSystems.$inferSelect;

// ─── Training Phase / Block ──────────────────────────────────────────────────

export const trainingPhases = pgTable("training_phases", {
  id: serial("id").primaryKey(),
  trainingSystemId: integer("training_system_id")
    .notNull()
    .references(() => trainingSystems.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  goal: text("goal").notNull(),
  emphasis: text("emphasis"),
  weekCount: integer("week_count").notNull().default(4),
  orderIndex: integer("order_index").notNull().default(0),

  status: text("status", {
    enum: ["upcoming", "current", "completed"],
  })
    .notNull()
    .default("upcoming"),

  notes: text("notes"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTrainingPhaseSchema = createInsertSchema(
  trainingPhases
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrainingPhase = z.infer<typeof insertTrainingPhaseSchema>;
export type TrainingPhase = typeof trainingPhases.$inferSelect;

// ─── Training Week ───────────────────────────────────────────────────────────

export const trainingWeeks = pgTable("training_weeks", {
  id: serial("id").primaryKey(),
  trainingPhaseId: integer("training_phase_id")
    .notNull()
    .references(() => trainingPhases.id, { onDelete: "cascade" }),

  weekNumber: integer("week_number").notNull(),
  label: text("label"),
  focus: text("focus"),
  volumeLevel: text("volume_level", {
    enum: ["low", "moderate", "high", "deload"],
  })
    .notNull()
    .default("moderate"),
  notes: text("notes"),
  orderIndex: integer("order_index").notNull().default(0),

  status: text("status", {
    enum: ["upcoming", "current", "completed"],
  })
    .notNull()
    .default("upcoming"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTrainingWeekSchema = createInsertSchema(trainingWeeks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingWeek = z.infer<typeof insertTrainingWeekSchema>;
export type TrainingWeek = typeof trainingWeeks.$inferSelect;

// ─── Training Session / Day ──────────────────────────────────────────────────

export const trainingSessions = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  trainingWeekId: integer("training_week_id")
    .notNull()
    .references(() => trainingWeeks.id, { onDelete: "cascade" }),

  label: text("label").notNull(),
  sessionType: text("session_type", {
    enum: ["lifting", "conditioning", "mobility", "recovery", "sport", "rest"],
  })
    .notNull()
    .default("lifting"),

  dayOfWeek: integer("day_of_week"),
  emphasis: text("emphasis"),
  warmupNotes: text("warmup_notes"),
  cooldownNotes: text("cooldown_notes"),
  coachingNotes: text("coaching_notes"),
  isRestDay: boolean("is_rest_day").notNull().default(false),

  orderIndex: integer("order_index").notNull().default(0),

  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTrainingSessionSchema = createInsertSchema(
  trainingSessions
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;

// ─── Session Exercise ────────────────────────────────────────────────────────

export const sessionExercises = pgTable("session_exercises", {
  id: serial("id").primaryKey(),
  trainingSessionId: integer("training_session_id")
    .notNull()
    .references(() => trainingSessions.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  category: text("category", {
    enum: ["warmup", "primary", "accessory", "conditioning", "finisher"],
  })
    .notNull()
    .default("primary"),

  sets: integer("sets"),
  reps: text("reps"),
  tempo: text("tempo"),
  rest: text("rest"),
  rpe: text("rpe"),
  notes: text("notes"),

  orderIndex: integer("order_index").notNull().default(0),

  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSessionExerciseSchema = createInsertSchema(
  sessionExercises
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionExercise = z.infer<typeof insertSessionExerciseSchema>;
export type SessionExercise = typeof sessionExercises.$inferSelect;
