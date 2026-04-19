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
import { conversationsTable } from "./conversations";

// ─── Training System (top-level persistent system per user) ─────────────────

export const trainingSystems = pgTable("training_systems", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  conversationId: integer("conversation_id")
    .references(() => conversationsTable.id, { onDelete: "set null" }),

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
    enum: ["warmup", "activation", "power", "primary", "secondary", "accessory", "trunk", "conditioning", "recovery", "finisher"],
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

// ─── System Change Log — Phase 4 ─────────────────────────────────────────────
// One record per edit operation (an operation can touch 1-N entities).
// Stores before/after snapshots for full restore capability.

export const systemChangeLog = pgTable("system_change_log", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  trainingSystemId: integer("training_system_id")
    .notNull()
    .references(() => trainingSystems.id, { onDelete: "cascade" }),

  // Who / what made this change
  source: text("source", {
    enum: ["ai_edit", "quick_action", "initialize", "restore", "auto_adjust", "proactive_agent", "workout_feedback"],
  })
    .notNull()
    .default("ai_edit"),

  // What kind of change
  intent: text("intent").notNull(),
  scope: text("scope", {
    enum: ["exercise", "session", "week", "block", "system"],
  }).notNull(),

  // Human-readable coach explanation
  changeSummary: text("change_summary").notNull(),

  // Original user request text (from the edit drawer / global panel)
  requestText: text("request_text"),

  // Versioning classification
  // true = structural milestone (deload, block refocus, session type change, etc.)
  // false = routine micro-edit (reps, swap exercise, notes)
  isMajorVersion: boolean("is_major_version").notNull().default(false),

  // Optional human label for major milestones, e.g. "Deload Week 2", "Power Block Refocus"
  versionLabel: text("version_label"),

  // Contextual edit target (from Phase 3 EditDrawer — which entity the user tapped)
  targetType: text("target_type"),   // 'exercise' | 'session' | 'week' | 'phase'
  targetId: integer("target_id"),
  targetLabel: text("target_label"),

  // Snapshot maps: { exercises: { "<id>": { name, sets, reps, ... } }, sessions: { ... }, ... }
  // Allows us to restore any combination of affected entities without losing audit trail
  beforeSnapshot: jsonb("before_snapshot"),
  afterSnapshot: jsonb("after_snapshot"),

  // Apply stats
  appliedCount: integer("applied_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),

  // For restore entries: points to the change log entry that this restore reverses
  restoredFromId: integer("restored_from_id"),

  // Extensible: for future wearable/readiness/proactive source metadata
  decisionMetadata: jsonb("decision_metadata"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSystemChangeLogSchema = createInsertSchema(
  systemChangeLog
).omit({ id: true, createdAt: true });
export type InsertSystemChangeLog = z.infer<typeof insertSystemChangeLogSchema>;
export type SystemChangeLog = typeof systemChangeLog.$inferSelect;

// ─── Propagation Events — audit log for cross-week propagation ────────────────
// One record per target exercise that was considered during a propagation plan.
// Stores both applied and skipped decisions so the full reasoning is auditable.

export const propagationEvents = pgTable("propagation_events", {
  id: serial("id").primaryKey(),

  planId: text("plan_id").notNull(),

  trainingSystemId: integer("training_system_id")
    .notNull()
    .references(() => trainingSystems.id, { onDelete: "cascade" }),

  changeLogId: integer("change_log_id"),

  sourceWeekNumber: integer("source_week_number").notNull(),
  sourceExerciseId: integer("source_exercise_id").notNull(),

  targetWeekNumber: integer("target_week_number").notNull(),
  targetExerciseId: integer("target_exercise_id").notNull(),

  propagationMode: text("propagation_mode").notNull(),

  action: text("action", { enum: ["apply", "skip"] }).notNull(),

  safetyScore: integer("safety_score").notNull().default(0),

  changedFields: jsonb("changed_fields"),

  skippedReason: text("skipped_reason"),

  initiatedBy: text("initiated_by").notNull().default("user"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPropagationEventSchema = createInsertSchema(
  propagationEvents
).omit({ id: true, createdAt: true });
export type InsertPropagationEvent = z.infer<typeof insertPropagationEventSchema>;
export type PropagationEvent = typeof propagationEvents.$inferSelect;
