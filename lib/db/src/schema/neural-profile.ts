import { pgTable, serial, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const neuralProfilesTable = pgTable("neural_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),

  consistencyScore: real("consistency_score").notNull().default(0),
  progressionScore: real("progression_score").notNull().default(0),
  recoveryScore: real("recovery_score").notNull().default(0),

  totalSessionsCompleted: integer("total_sessions_completed").notNull().default(0),
  neuralConnections: integer("neural_connections").notNull().default(0),

  unlockedMilestones: jsonb("unlocked_milestones")
    .$type<string[]>()
    .notNull()
    .default([]),

  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNeuralProfileSchema = createInsertSchema(neuralProfilesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertNeuralProfile = z.infer<typeof insertNeuralProfileSchema>;
export type NeuralProfile = typeof neuralProfilesTable.$inferSelect;
