import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const ASSESSMENT_CATEGORIES = [
  "Speed",
  "Power",
  "Strength",
  "Mobility",
  "Conditioning",
  "Recovery",
  "Readiness",
  "Movement Quality",
] as const;

export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];

export const assessmentsTable = pgTable("assessments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").$type<AssessmentCategory>().notNull(),
  description: text("description"),
  metric: text("metric"),
  unit: text("unit"),
  sportRelevance: text("sport_relevance").array(),
  difficulty: text("difficulty"),
  equipmentRequired: text("equipment_required").array(),
  normativeData: jsonb("normative_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assessmentQualityLinksTable = pgTable("assessment_quality_links", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull(),
  qualityName: text("quality_name").notNull(),
  linkType: text("link_type").notNull().default("measures"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentMethodLinksTable = pgTable("assessment_method_links", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull(),
  methodName: text("method_name").notNull(),
  weakness: text("weakness").notNull(),
  priority: integer("priority").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentProductLinksTable = pgTable("assessment_product_links", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull(),
  productName: text("product_name").notNull(),
  role: text("role").notNull().default("recommended"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentExerciseLinksTable = pgTable("assessment_exercise_links", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  weakness: text("weakness").notNull(),
  prescription: text("prescription"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Assessment = typeof assessmentsTable.$inferSelect;
export type InsertAssessment = typeof assessmentsTable.$inferInsert;
export type AssessmentQualityLink = typeof assessmentQualityLinksTable.$inferSelect;
export type AssessmentMethodLink = typeof assessmentMethodLinksTable.$inferSelect;
export type AssessmentProductLink = typeof assessmentProductLinksTable.$inferSelect;
export type AssessmentExerciseLink = typeof assessmentExerciseLinksTable.$inferSelect;
