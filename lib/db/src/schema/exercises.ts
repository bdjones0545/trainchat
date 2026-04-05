import {
  pgTable,
  text,
  serial,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Exercise Library ─────────────────────────────────────────────────────────
// Structured exercise intelligence layer. Scalable to 1500+ exercises.
// Supports movement classification, swap clusters, progressions, and constraints.

export const exerciseLibrary = pgTable("exercise_library", {
  id: serial("id").primaryKey(),

  // Identity
  name: text("name").notNull().unique(),

  // Movement classification
  movementPattern: text("movement_pattern").notNull(),
  // Values: squat | hinge | push_horizontal | push_vertical |
  //         pull_horizontal | pull_vertical | carry | core_anti_extension |
  //         core_anti_rotation | core_anti_lateral | core_flexion | core_rotation |
  //         power_explosive | iso_chest | iso_shoulders | iso_arms |
  //         iso_legs | iso_back | conditioning | plyometric | mobility |
  //         activation | smr | rehab | sport_performance | med_ball | sled

  // Broad category
  bodyRegion: text("body_region"),
  // Values: upper_body | lower_body | full_body | core

  // Unilateral vs bilateral flag
  unilateral: boolean("unilateral").notNull().default(false),

  // Muscle targeting
  primaryMuscle: text("primary_muscle").notNull(),
  secondaryMuscles: jsonb("secondary_muscles")
    .$type<string[]>()
    .notNull()
    .default([]),

  // Equipment requirements (array — exercise may support multiple)
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  // Values: barbell | dumbbell | cable | machine | bodyweight |
  //         kettlebell | band | trap_bar | rings | trx | sled | med_ball | foam_roller | lacrosse_ball

  // Difficulty / skill demand
  difficultyLevel: text("difficulty_level").notNull().default("intermediate"),
  // Values: beginner | intermediate | advanced | elite

  // Programming intent
  intentTags: jsonb("intent_tags").$type<string[]>().notNull().default([]),
  // Values: strength | hypertrophy | power | endurance | rehab | athletic | fat_loss | mobility | activation | smr | sport_performance

  // Joint stress flags for injury-aware filtering
  jointStressProfile: jsonb("joint_stress_profile")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Values: knee_dominant | hip_dominant | spine_load | low_back_stress |
  //         shoulder_dominant | elbow_stress | wrist_stress | low_impact | no_impact | ankle_stress

  // Flexible tags for population, context, and special attributes
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Values: home_gym | outdoor | unilateral | bilateral | beginner_friendly | older_adult |
  //         youth_athlete | shoulder_sensitive | knee_sensitive | low_back_sensitive |
  //         low_impact | high_impact | sport_specific | athletic | warm_up | cool_down |
  //         corrective | bodyweight_only | minimal_equipment | bilateral | tempo_based

  // ── Swap Cluster System ──
  // Exercises sharing a clusterId are direct swap candidates (same function, different equipment/variation)
  clusterId: text("cluster_id"),

  // ── Progression Links ──
  // Names of easier exercises (regressions)
  easierVariations: jsonb("easier_variations")
    .$type<string[]>()
    .notNull()
    .default([]),

  // Names of harder exercises (progressions)
  harderVariations: jsonb("harder_variations")
    .$type<string[]>()
    .notNull()
    .default([]),

  // Coaching cue / brief description
  description: text("description"),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ExerciseLibraryEntry = typeof exerciseLibrary.$inferSelect;
export type InsertExerciseLibraryEntry = typeof exerciseLibrary.$inferInsert;
