import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const performanceProfilesTable = pgTable("performance_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  trainingSystemId: integer("training_system_id"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),

  // Profile inputs (snapshot what drove this profile)
  goal: text("goal"),
  sport: text("sport"),
  position: text("position"),
  trainingAge: text("training_age"),
  focusMode: text("focus_mode"),

  // Engine outputs (JSON blobs)
  priorityQualities: jsonb("priority_qualities"),
  limitingFactors: jsonb("limiting_factors"),
  recommendedMethods: jsonb("recommended_methods"),
  equipmentOpportunities: jsonb("equipment_opportunities"),
  recommendedExercisePool: jsonb("recommended_exercise_pool"),
  riskFactors: jsonb("risk_factors"),
  expectedAdaptations: jsonb("expected_adaptations"),
  sourceAssessments: jsonb("source_assessments"),

  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PerformanceProfile = typeof performanceProfilesTable.$inferSelect;
export type InsertPerformanceProfile = typeof performanceProfilesTable.$inferInsert;
