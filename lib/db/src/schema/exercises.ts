import {
  pgTable,
  text,
  serial,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Exercise Library ─────────────────────────────────────────────────────────
// Decision-ready movement system. ~50 depth-first exercises.
// Supports swap clusters, progressions, constraint-aware selection, and AI reasoning.

export const exerciseLibrary = pgTable("exercise_library", {
  id: serial("id").primaryKey(),

  // Identity
  name: text("name").notNull().unique(),

  // Movement classification
  // Bucket: knee_dominant | hip_dominant | push_horizontal | push_vertical |
  //         pull_horizontal | pull_vertical | power_explosive | core_anti_extension |
  //         core_anti_rotation | core_rotation | core_lateral | accessory_lower |
  //         accessory_upper | conditioning | mobility_prep
  movementPattern: text("movement_pattern").notNull(),

  // Broad region: upper_body | lower_body | full_body | core
  bodyRegion: text("body_region"),

  // Role in session programming
  // primary_strength | primary_power | unilateral_strength | accessory | conditioning |
  // prep_activation | corrective
  role: text("role"),

  // Unilateral vs bilateral
  unilateral: boolean("unilateral").notNull().default(false),

  // Muscle targeting
  primaryMuscle: text("primary_muscle").notNull(),
  secondaryMuscles: jsonb("secondary_muscles").$type<string[]>().notNull().default([]),

  // Equipment requirements (exercise may support multiple)
  // barbell | dumbbell | cable | machine | bodyweight | kettlebell | band |
  // trap_bar | rings | trx | sled | med_ball | foam_roller
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),

  // Difficulty / skill demand: beginner | intermediate | advanced | elite
  difficultyLevel: text("difficulty_level").notNull().default("intermediate"),

  // Neural demand: low | moderate | high
  neuralDemand: text("neural_demand").default("moderate"),

  // Time cost per set/exercise: low | moderate | high
  timeCost: text("time_cost").default("moderate"),

  // Programming intent tags
  // strength | hypertrophy | power | endurance | rehab | athletic | fat_loss | mobility | activation
  intentTags: jsonb("intent_tags").$type<string[]>().notNull().default([]),

  // Sport transfer tags for sport-specific biasing
  // acceleration | deceleration | change_of_direction | rotational_power | trunk_stability |
  // lower_body_force | upper_body_force | stiffness | landing_control | anti_rotation
  sportTransferTags: jsonb("sport_transfer_tags").$type<string[]>().notNull().default([]),

  // Joint stress profile for injury-aware filtering
  // knee_dominant | hip_dominant | spine_load | low_back_stress | shoulder_dominant |
  // elbow_stress | wrist_stress | low_impact | no_impact | ankle_stress
  jointStressProfile: jsonb("joint_stress_profile").$type<string[]>().notNull().default([]),

  // Flexible context tags
  // beginner_friendly | shoulder_sensitive | knee_sensitive | low_back_sensitive |
  // low_impact | high_impact | time_efficient | removable_when_compressed | low_priority
  tags: jsonb("tags").$type<string[]>().notNull().default([]),

  // ── Swap Cluster System ──
  // Exercises sharing a clusterId are direct swap candidates
  clusterId: text("cluster_id"),

  // ── Progression Links ──
  easierVariations: jsonb("easier_variations").$type<string[]>().notNull().default([]),
  harderVariations: jsonb("harder_variations").$type<string[]>().notNull().default([]),

  // Coaching cue / brief description
  description: text("description"),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExerciseLibraryEntry = typeof exerciseLibrary.$inferSelect;
export type InsertExerciseLibraryEntry = typeof exerciseLibrary.$inferInsert;
