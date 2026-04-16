// ─── TrainChat Exercise Intelligence Layer ────────────────────────────────────
//
// A queryable exercise decision system. Not a flat list — a structured
// decision engine for intelligent selection, substitution, addition,
// and progression/regression across all constraint dimensions.
//
// ⚠️  TRANSITIONAL LAYER — DO NOT ADD NEW LOGIC HERE
//
// This module is an in-memory exercise catalogue (~100 exercises) that
// predates the DB exercise library (exercise-service.ts). It remains active
// as a fallback for cases where the DB library does not return candidates.
//
// Migration target: All exercise metadata (sessionRole, fatigueCost,
// prescriptions, progressionTo/From chains) should be migrated to DB fields
// in the exerciseLibrary table. Once that migration is complete, this module
// can be retired.
//
// Until migration: exercise-service.ts (DB) is the PRIMARY source of truth.
// This module is a SECONDARY fallback only.
//
// Used by:
//   - mutation-engine.ts          (fallback swap/add when DB has no candidate)
//   - exercise-redistribution.ts  (replacement and addition logic)
//   - ai.ts                       (atomic edit guidance)
//
// Exports:
//   queryExercises()     — multi-factor exercise search
//   findSubstitute()     — purpose-preserving swap engine
//   findAdditions()      — intelligent category-based additions
//   getProgression()     — harder variant of an exercise
//   getRegression()      — easier variant of an exercise
//   getPrescription()    — goal-specific sets/reps/rest

import { logger } from "./logger";
import {
  MovementPattern,
  GoalType,
  ExperienceTier,
  EquipmentLevel,
  JointStress,
  EquipmentTag,
  DifficultyLevel,
} from "./training-intelligence";

// ─── Expanded Schema ──────────────────────────────────────────────────────────

export type PrimaryMuscle =
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "chest"
  | "upper_chest"
  | "lats"
  | "upper_back"
  | "rear_delts"
  | "front_delts"
  | "side_delts"
  | "traps"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "spinal_erectors"
  | "hip_flexors"
  | "adductors"
  | "full_body";

export type SessionRole =
  | "main_lift"             // Tier-1 anchor compound — primary training stimulus
  | "secondary_compound"    // Tier-2 multi-joint — high value but secondary
  | "hypertrophy_accessory" // Tier-3 volume — isolation or targeted accessory
  | "power_work"            // Explosive — must be placed early when CNS is fresh
  | "trunk_work"            // Core/anti-rotation/carry — session integrity
  | "mobility_reset"        // Low-fatigue quality movement — often end of session
  | "finisher";             // High-rep, low-skill, metabolic — session end

export type AdditionCategory =
  | "core"
  | "calves"
  | "hamstrings"
  | "glutes"
  | "rear_delts"
  | "power"
  | "conditioning"
  | "carries"
  | "mobility"
  | "arms_bicep"
  | "arms_tricep"
  | "shoulders_lateral"
  | "upper_back";

export interface GoalPrescription {
  sets: number;
  reps: string;
  rest: string;
  intent: string;
}

export interface ExerciseIntelligence {
  name: string;
  pattern: MovementPattern;
  primaryMuscle: PrimaryMuscle;
  secondaryMuscles: PrimaryMuscle[];
  sessionRole: SessionRole;
  equipment: EquipmentTag[];
  difficulty: DifficultyLevel;
  fatigueCost: 1 | 2 | 3 | 4 | 5;    // 1=low, 5=very high
  skillRequirement: 1 | 2 | 3 | 4 | 5; // 1=minimal, 5=highly technical
  jointStress: JointStress[];
  goalBias: GoalType[];
  isUnilateral: boolean;
  isAthletic: boolean;
  tempoRelevant: boolean;
  progressionFrom?: string;   // easier exercise this progresses from
  progressionTo?: string;     // harder exercise this leads to
  relatedExercises: string[]; // same role, different angle or equipment
  additionCategory?: AdditionCategory[]; // used for category-based additions
  prescriptions: Partial<Record<GoalType, GoalPrescription>>;
  coachingCue: string;
}

// ─── Exercise Intelligence Library ───────────────────────────────────────────

export const EXERCISE_INTELLIGENCE: ExerciseIntelligence[] = [

  // ═══════════════════════════════════════════════════════════════
  //  SQUAT PATTERNS
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Back Squat",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings", "spinal_erectors"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 5, skillRequirement: 3, jointStress: ["knee_dominant", "spine_load"],
    goalBias: ["strength", "hypertrophy", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Goblet Squat", progressionTo: "Pause Back Squat",
    relatedExercises: ["Front Squat", "Box Squat", "Safety Bar Squat"],
    prescriptions: {
      strength: { sets: 5, reps: "3-5", rest: "3-4 min", intent: "Load heavy, full recovery between sets" },
      hypertrophy: { sets: 4, reps: "6-10", rest: "2 min", intent: "Control the eccentric, drive out of the hole" },
      athletic_performance: { sets: 4, reps: "3-5", rest: "3 min", intent: "Express strength — fast concentric" },
    },
    coachingCue: "Brace hard before unracking — ribs down, abs out, maintain throughout descent",
  },
  {
    name: "Front Squat",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes", "upper_back"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "advanced",
    fatigueCost: 4, skillRequirement: 4, jointStress: ["knee_dominant", "spine_load", "wrist_stress"],
    goalBias: ["strength", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Goblet Squat", progressionTo: undefined,
    relatedExercises: ["Back Squat", "Safety Bar Squat"],
    prescriptions: {
      strength: { sets: 4, reps: "3-5", rest: "3 min", intent: "Elbows high throughout — upright torso is the whole point" },
      athletic_performance: { sets: 3, reps: "4-6", rest: "2-3 min", intent: "Clean-specific transfer — receive position" },
    },
    coachingCue: "Aggressive upper-back tightness and elbows high throughout — if elbows drop, the bar goes forward",
  },
  {
    name: "Goblet Squat",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes", "abs"],
    sessionRole: "secondary_compound", equipment: ["dumbbell", "kettlebell"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["general_fitness", "hypertrophy", "fat_loss"],
    isUnilateral: false, isAthletic: false, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Back Squat",
    relatedExercises: ["Leg Press", "Bulgarian Split Squat"],
    additionCategory: [],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Use the weight as counterbalance — sit deep" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Quality over load — full ROM every rep" },
    },
    coachingCue: "Hold the weight at chest height and sit into it — depth is the whole point of the goblet",
  },
  {
    name: "Bulgarian Split Squat",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings", "adductors"],
    sessionRole: "secondary_compound", equipment: ["dumbbell", "barbell", "bodyweight"], difficulty: "intermediate",
    fatigueCost: 4, skillRequirement: 2, jointStress: ["knee_dominant", "hip_stress"],
    goalBias: ["hypertrophy", "athletic_performance", "general_fitness"],
    isUnilateral: true, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Step-Up", progressionTo: undefined,
    relatedExercises: ["Rear-Foot Elevated Split Squat", "Walking Lunge"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "10-12 each side", rest: "90 sec", intent: "Front foot far enough forward that shin stays vertical" },
      athletic_performance: { sets: 4, reps: "8 each side", rest: "2 min", intent: "Drive power through the front heel — transfer to sprint mechanics" },
      general_fitness: { sets: 3, reps: "10 each side", rest: "75 sec", intent: "Knee tracks over the toe — control the descent" },
    },
    coachingCue: "Front foot far enough forward that shin stays mostly vertical at the bottom",
  },
  {
    name: "Leg Press",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings"],
    sessionRole: "secondary_compound", equipment: ["machine"], difficulty: "beginner",
    fatigueCost: 3, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Hack Squat", "Smith Machine Squat"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-15", rest: "90 sec", intent: "Full ROM — don't lock out the knees at the top" },
      general_fitness: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Slow the descent, controlled throughout" },
    },
    coachingCue: "Full ROM — don't let the sled lock out or bounce at the bottom",
  },
  {
    name: "Step-Up",
    pattern: "squat", primaryMuscle: "quads", secondaryMuscles: ["glutes"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell", "bodyweight", "barbell"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["general_fitness", "athletic_performance", "fat_loss"],
    isUnilateral: true, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Bulgarian Split Squat",
    relatedExercises: ["Walking Lunge", "Reverse Lunge"],
    additionCategory: [],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "8-10 each side", rest: "90 sec", intent: "Drive through the heel of the elevated leg — hip extension at top" },
      general_fitness: { sets: 3, reps: "12 each side", rest: "60 sec", intent: "Control the descent — don't bounce off the lower foot" },
    },
    coachingCue: "Drive through the heel of the elevated leg — resist using the back foot",
  },

  // ═══════════════════════════════════════════════════════════════
  //  HINGE PATTERNS
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Conventional Deadlift",
    pattern: "hinge", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "spinal_erectors", "traps", "quads"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 5, skillRequirement: 3, jointStress: ["spine_load", "low_back_stress", "hip_stress"],
    goalBias: ["strength", "hypertrophy", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Trap Bar Deadlift", progressionTo: "Deficit Deadlift",
    relatedExercises: ["Sumo Deadlift", "Rack Pull"],
    prescriptions: {
      strength: { sets: 5, reps: "3-5", rest: "4-5 min", intent: "Bar over mid-foot, lat tension before the pull — max intent" },
      hypertrophy: { sets: 4, reps: "5-8", rest: "3 min", intent: "Control the setup — technical precision drives the adaptation" },
      athletic_performance: { sets: 4, reps: "3-5", rest: "3-4 min", intent: "Force expression — fast concentric phase" },
    },
    coachingCue: "Bar stays over mid-foot throughout — lats tight before pulling, think 'protect your armpits'",
  },
  {
    name: "Romanian Deadlift",
    pattern: "hinge", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "spinal_erectors"],
    sessionRole: "secondary_compound", equipment: ["barbell", "dumbbell"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 2, jointStress: ["low_back_stress", "hip_stress"],
    goalBias: ["hypertrophy", "strength", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Good Morning", progressionTo: "Conventional Deadlift",
    relatedExercises: ["Single-Leg RDL", "Stiff-Leg Deadlift"],
    additionCategory: ["hamstrings"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "10-12", rest: "90 sec", intent: "Feel the hamstring stretch at bottom — bar close to legs throughout" },
      strength: { sets: 4, reps: "6-8", rest: "2 min", intent: "Hip hinge — not a squat, not a back extension" },
      athletic_performance: { sets: 3, reps: "8-10", rest: "90 sec", intent: "Eccentric control — builds hamstring resilience for sport" },
    },
    coachingCue: "Push hips back until you feel the hamstring pull — then drive hips forward at top",
  },
  {
    name: "Trap Bar Deadlift",
    pattern: "hinge", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "quads", "traps", "spinal_erectors"],
    sessionRole: "main_lift", equipment: ["trap_bar"], difficulty: "beginner",
    fatigueCost: 4, skillRequirement: 2, jointStress: ["spine_load"],
    goalBias: ["strength", "athletic_performance", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Goblet Squat", progressionTo: "Conventional Deadlift",
    relatedExercises: ["Conventional Deadlift", "Safety Bar Squat"],
    prescriptions: {
      strength: { sets: 4, reps: "4-6", rest: "3-4 min", intent: "More upright torso than conventional — drive floor away" },
      athletic_performance: { sets: 4, reps: "4-6", rest: "3 min", intent: "Great for athletes — more quad involvement, less lumbar stress" },
      general_fitness: { sets: 3, reps: "8-10", rest: "2 min", intent: "Low technical demand — focus on posture and drive" },
    },
    coachingCue: "More upright torso than conventional — think 'squat with your hips, pull with your grip'",
  },
  {
    name: "Hip Thrust",
    pattern: "hinge", primaryMuscle: "glutes", secondaryMuscles: ["hamstrings", "quads"],
    sessionRole: "secondary_compound", equipment: ["barbell", "dumbbell", "machine", "bodyweight"], difficulty: "beginner",
    fatigueCost: 3, skillRequirement: 1, jointStress: ["hip_stress"],
    goalBias: ["hypertrophy", "athletic_performance", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Glute Bridge", progressionTo: undefined,
    relatedExercises: ["Glute Bridge", "Single-Leg Hip Thrust"],
    additionCategory: ["glutes"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-15", rest: "75 sec", intent: "Full hip extension at top — posterior pelvic tilt, squeeze hard" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Drive through heels — squeeze glutes hard at the top" },
      athletic_performance: { sets: 4, reps: "8-10", rest: "90 sec", intent: "Loaded hip extension — direct transfer to sprint power" },
    },
    coachingCue: "Drive through the heels — full hip extension at the top with a strong glute squeeze",
  },
  {
    name: "Single-Leg Romanian Deadlift",
    pattern: "hinge", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "abs"],
    sessionRole: "secondary_compound", equipment: ["dumbbell", "kettlebell", "bodyweight"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 3, jointStress: ["hip_stress"],
    goalBias: ["athletic_performance", "hypertrophy", "general_fitness"],
    isUnilateral: true, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Romanian Deadlift", progressionTo: undefined,
    relatedExercises: ["Romanian Deadlift", "Hip Thrust"],
    additionCategory: ["hamstrings", "glutes"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "10 each side", rest: "90 sec", intent: "Balance is secondary to the hip hinge — focus on the hamstring load" },
      hypertrophy: { sets: 3, reps: "12 each side", rest: "75 sec", intent: "Slow eccentric — feel the hamstring stretch at the bottom" },
    },
    coachingCue: "Hip hinge dominant — the balance challenge is secondary to the posterior chain loading",
  },
  {
    name: "Glute Bridge",
    pattern: "hinge", primaryMuscle: "glutes", secondaryMuscles: ["hamstrings"],
    sessionRole: "hypertrophy_accessory", equipment: ["bodyweight", "barbell", "dumbbell"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["hip_stress"],
    goalBias: ["general_fitness", "fat_loss", "hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Hip Thrust",
    relatedExercises: ["Hip Thrust"],
    additionCategory: ["glutes"],
    prescriptions: {
      general_fitness: { sets: 3, reps: "15-20", rest: "60 sec", intent: "Posterior pelvic tilt at top — squeeze glutes hard" },
      hypertrophy: { sets: 3, reps: "15-20", rest: "60 sec", intent: "Slow and controlled — feel the glute contract, not the hamstring" },
    },
    coachingCue: "Posterior pelvic tilt at top — don't just push your hips up, squeeze hard at the top",
  },
  {
    name: "Kettlebell Swing",
    pattern: "hinge", primaryMuscle: "glutes", secondaryMuscles: ["hamstrings", "spinal_erectors", "traps"],
    sessionRole: "finisher", equipment: ["kettlebell"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 2, jointStress: ["low_back_stress", "hip_stress"],
    goalBias: ["athletic_performance", "fat_loss", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Hip Thrust", progressionTo: "Power Clean",
    relatedExercises: ["Romanian Deadlift"],
    additionCategory: ["conditioning", "glutes"],
    prescriptions: {
      athletic_performance: { sets: 4, reps: "15-20", rest: "60 sec", intent: "Hip hinge not a squat — power comes from glutes, not the arms" },
      fat_loss: { sets: 4, reps: "20-25", rest: "45 sec", intent: "Metabolic — maintain quality at speed" },
      general_fitness: { sets: 3, reps: "15-20", rest: "60 sec", intent: "Hip drive, not a shoulder raise — the bell floats, you don't pull" },
    },
    coachingCue: "Power comes from the hip hinge — the arms guide the bell, not pull it",
  },
  {
    name: "Nordic Hamstring Curl",
    pattern: "iso_legs", primaryMuscle: "hamstrings", secondaryMuscles: ["glutes"],
    sessionRole: "hypertrophy_accessory", equipment: ["bodyweight"], difficulty: "advanced",
    fatigueCost: 4, skillRequirement: 3, jointStress: ["knee_dominant"],
    goalBias: ["athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Leg Curl", progressionTo: undefined,
    relatedExercises: ["Seated Leg Curl", "Lying Leg Curl"],
    additionCategory: ["hamstrings"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "5-8", rest: "2-3 min", intent: "Maximum eccentric control — lower as slowly as possible, pull up with hip extension" },
    },
    coachingCue: "Lower as slowly as possible — the eccentric is the point. Pull yourself up with hip extension, not a band",
  },
  {
    name: "Seated Leg Curl",
    pattern: "iso_legs", primaryMuscle: "hamstrings", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["machine"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["hypertrophy", "athletic_performance"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Nordic Hamstring Curl",
    relatedExercises: ["Lying Leg Curl", "Nordic Hamstring Curl"],
    additionCategory: ["hamstrings"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Seated provides more stretch — slow eccentric every rep" },
      athletic_performance: { sets: 3, reps: "10-12", rest: "75 sec", intent: "Hamstring resilience — control the lowering phase" },
    },
    coachingCue: "Seated provides the most hamstring stretch position — control the return every rep",
  },

  // ═══════════════════════════════════════════════════════════════
  //  HORIZONTAL PUSH
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Barbell Bench Press",
    pattern: "push_horizontal", primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 4, skillRequirement: 3, jointStress: ["shoulder_dominant", "elbow_stress"],
    goalBias: ["strength", "hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Dumbbell Bench Press", progressionTo: "Pause Bench Press",
    relatedExercises: ["Incline Barbell Press", "Close-Grip Bench Press"],
    prescriptions: {
      strength: { sets: 5, reps: "3-5", rest: "3-4 min", intent: "Retract scapula, slight arch — maximize stability" },
      hypertrophy: { sets: 4, reps: "6-10", rest: "2 min", intent: "Controlled descent, touch-and-go — feel the chest throughout" },
    },
    coachingCue: "Slight arch, retract scapula, elbows ~45-60° from torso — bar to lower chest",
  },
  {
    name: "Dumbbell Bench Press",
    pattern: "push_horizontal", primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    sessionRole: "secondary_compound", equipment: ["dumbbell"], difficulty: "beginner",
    fatigueCost: 3, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Push-Up", progressionTo: "Barbell Bench Press",
    relatedExercises: ["Incline Dumbbell Press", "Barbell Bench Press"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-12", rest: "90 sec", intent: "Greater ROM than barbell — feel the stretch at the bottom" },
      general_fitness: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Controlled descent — elbows ~45° from torso" },
    },
    coachingCue: "Greater ROM than barbell allows — control the stretch at the bottom, don't let shoulders fold forward",
  },
  {
    name: "Incline Dumbbell Press",
    pattern: "push_horizontal", primaryMuscle: "upper_chest", secondaryMuscles: ["front_delts", "triceps"],
    sessionRole: "secondary_compound", equipment: ["dumbbell"], difficulty: "beginner",
    fatigueCost: 3, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Push-Up", progressionTo: "Incline Barbell Press",
    relatedExercises: ["Barbell Bench Press", "Incline Barbell Press"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-12", rest: "90 sec", intent: "30-45° incline — upper chest emphasis, not front delt" },
      general_fitness: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Controlled tempo — elbows slightly flared out at the top" },
    },
    coachingCue: "30-45° angle — if the bench is higher than that, it becomes a shoulder press",
  },
  {
    name: "Push-Up",
    pattern: "push_horizontal", primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps", "abs"],
    sessionRole: "hypertrophy_accessory", equipment: ["bodyweight"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["shoulder_dominant", "wrist_stress"],
    goalBias: ["general_fitness", "fat_loss"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Dumbbell Bench Press",
    relatedExercises: ["Ring Push-Up", "Archer Push-Up"],
    prescriptions: {
      general_fitness: { sets: 3, reps: "12-20", rest: "60 sec", intent: "Straight line from heel to head — full ROM" },
      fat_loss: { sets: 3, reps: "15-25", rest: "45 sec", intent: "Keep quality at volume — don't let the hips sag" },
    },
    coachingCue: "Rigid plank from heel to head — squeeze glutes to protect the lower back",
  },
  {
    name: "Landmine Press",
    pattern: "push_horizontal", primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    sessionRole: "secondary_compound", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 2, skillRequirement: 2, jointStress: ["shoulder_dominant"],
    goalBias: ["athletic_performance", "general_fitness"],
    isUnilateral: true, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Dumbbell Bench Press", progressionTo: undefined,
    relatedExercises: ["Dumbbell Bench Press", "Barbell Bench Press"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "10 each side", rest: "75 sec", intent: "Shoulder-friendly arc — good for overhead-sensitive athletes" },
      general_fitness: { sets: 3, reps: "10-12 each side", rest: "75 sec", intent: "Natural arc — great shoulder-friendly pressing option" },
    },
    coachingCue: "Follow the natural arc of the bar — not straight up, it goes in a slight arc forward and up",
  },

  // ═══════════════════════════════════════════════════════════════
  //  VERTICAL PUSH
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Barbell Overhead Press",
    pattern: "push_vertical", primaryMuscle: "front_delts", secondaryMuscles: ["side_delts", "triceps", "traps"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 4, skillRequirement: 3, jointStress: ["shoulder_dominant", "spine_load", "elbow_stress"],
    goalBias: ["strength", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Dumbbell Shoulder Press", progressionTo: "Push Press",
    relatedExercises: ["Dumbbell Shoulder Press", "Push Press"],
    prescriptions: {
      strength: { sets: 5, reps: "3-5", rest: "3 min", intent: "Full lockout at top — slight lean acceptable but control the descent" },
      athletic_performance: { sets: 4, reps: "4-6", rest: "2-3 min", intent: "Overhead strength transfers to throwing, overhead athletes" },
    },
    coachingCue: "Bar in front, not behind the neck — full lockout at top, slight forward lean at the bottom is fine",
  },
  {
    name: "Dumbbell Shoulder Press",
    pattern: "push_vertical", primaryMuscle: "front_delts", secondaryMuscles: ["side_delts", "triceps"],
    sessionRole: "secondary_compound", equipment: ["dumbbell"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Barbell Overhead Press",
    relatedExercises: ["Barbell Overhead Press", "Arnold Press"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-12", rest: "75 sec", intent: "Neutral or pronated grip — don't force range if it hurts" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Full ROM — don't short-stroke the reps" },
    },
    coachingCue: "Neutral or pronated grip — do not force range of motion past what's comfortable",
  },
  {
    name: "Arnold Press",
    pattern: "push_vertical", primaryMuscle: "front_delts", secondaryMuscles: ["side_delts", "rear_delts", "triceps"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell"], difficulty: "intermediate",
    fatigueCost: 2, skillRequirement: 2, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Dumbbell Shoulder Press", "Lateral Raise"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "10-12", rest: "75 sec", intent: "Slow rotation — hits all three delt heads through the range" },
    },
    coachingCue: "Controlled rotation on the way up and down — the rotation is what makes this exercise valuable",
  },

  // ═══════════════════════════════════════════════════════════════
  //  HORIZONTAL PULL
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Barbell Row",
    pattern: "pull_horizontal", primaryMuscle: "upper_back", secondaryMuscles: ["lats", "rear_delts", "biceps", "spinal_erectors"],
    sessionRole: "main_lift", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 4, skillRequirement: 3, jointStress: ["low_back_stress", "spine_load"],
    goalBias: ["strength", "hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: false,
    progressionFrom: "Dumbbell Row", progressionTo: undefined,
    relatedExercises: ["Pendlay Row", "Chest-Supported Row"],
    prescriptions: {
      strength: { sets: 4, reps: "4-6", rest: "3 min", intent: "Chest up, drive elbows back — not just pulling the bar" },
      hypertrophy: { sets: 4, reps: "6-10", rest: "2 min", intent: "Full retraction at top — pause and squeeze before lowering" },
    },
    coachingCue: "Chest up, elbows drive back — think about pulling your elbows through the wall behind you",
  },
  {
    name: "Dumbbell Row",
    pattern: "pull_horizontal", primaryMuscle: "lats", secondaryMuscles: ["upper_back", "rear_delts", "biceps"],
    sessionRole: "secondary_compound", equipment: ["dumbbell"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: [],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: true, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Inverted Row", progressionTo: "Barbell Row",
    relatedExercises: ["Chest-Supported Row", "Seated Cable Row"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "10-12 each side", rest: "75 sec", intent: "Full retraction at top — don't let the shoulder roll forward" },
      general_fitness: { sets: 3, reps: "12-15 each side", rest: "60 sec", intent: "Maintain flat back — elbow drives to hip, not to ceiling" },
    },
    coachingCue: "Full retraction at top — don't let the shoulder roll forward on the descent",
  },
  {
    name: "Chest-Supported Row",
    pattern: "pull_horizontal", primaryMuscle: "upper_back", secondaryMuscles: ["rear_delts", "biceps"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell", "machine"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: [],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Barbell Row",
    relatedExercises: ["Dumbbell Row", "Seated Cable Row"],
    additionCategory: ["upper_back"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Chest support eliminates lower back involvement — pure rowing stimulus" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Controlled, full retraction — pause at the top" },
    },
    coachingCue: "Chest pad eliminates lower back involvement — focus on the retraction entirely",
  },
  {
    name: "Seated Cable Row",
    pattern: "pull_horizontal", primaryMuscle: "lats", secondaryMuscles: ["upper_back", "biceps"],
    sessionRole: "hypertrophy_accessory", equipment: ["cable"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: [],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Barbell Row",
    relatedExercises: ["Dumbbell Row", "Chest-Supported Row"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Drive elbows past the torso — don't lean back excessively" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Constant tension — control the return, don't let the stack drop" },
    },
    coachingCue: "Drive elbows past the torso — don't lean back excessively to pull more weight",
  },
  {
    name: "Face Pull",
    pattern: "iso_shoulders", primaryMuscle: "rear_delts", secondaryMuscles: ["upper_back", "traps"],
    sessionRole: "hypertrophy_accessory", equipment: ["cable", "band"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["general_fitness", "hypertrophy", "strength"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Rear Delt Fly", "Band Pull-Apart"],
    additionCategory: ["rear_delts", "upper_back"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "15-20", rest: "60 sec", intent: "External rotation emphasis — pull to forehead, elbows high and wide" },
      general_fitness: { sets: 3, reps: "15-20", rest: "45 sec", intent: "Critical for shoulder health in any pressing program" },
    },
    coachingCue: "Pull to the forehead with elbows high and wide — external rotation is the whole point",
  },

  // ═══════════════════════════════════════════════════════════════
  //  VERTICAL PULL
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Pull-Up",
    pattern: "pull_vertical", primaryMuscle: "lats", secondaryMuscles: ["upper_back", "rear_delts", "biceps"],
    sessionRole: "main_lift", equipment: ["bodyweight"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 2, jointStress: ["shoulder_dominant", "elbow_stress"],
    goalBias: ["strength", "hypertrophy", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Lat Pulldown", progressionTo: "Weighted Pull-Up",
    relatedExercises: ["Chin-Up", "Weighted Pull-Up", "Lat Pulldown"],
    prescriptions: {
      strength: { sets: 4, reps: "5-8", rest: "2-3 min", intent: "Full hang at bottom — dead hang before each rep activates the lats" },
      hypertrophy: { sets: 4, reps: "8-12", rest: "90 sec", intent: "Full ROM — dead hang at bottom, chin clearly over bar at top" },
      athletic_performance: { sets: 4, reps: "6-10", rest: "2 min", intent: "Body control and relative strength — key for most sports" },
    },
    coachingCue: "Full dead hang at the bottom — lats engage at the bottom, not halfway up",
  },
  {
    name: "Weighted Pull-Up",
    pattern: "pull_vertical", primaryMuscle: "lats", secondaryMuscles: ["upper_back", "biceps"],
    sessionRole: "main_lift", equipment: ["barbell", "dumbbell"], difficulty: "advanced",
    fatigueCost: 4, skillRequirement: 3, jointStress: ["shoulder_dominant", "elbow_stress"],
    goalBias: ["strength", "hypertrophy"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Pull-Up", progressionTo: undefined,
    relatedExercises: ["Pull-Up", "Chin-Up"],
    prescriptions: {
      strength: { sets: 5, reps: "3-5", rest: "3 min", intent: "Reduce weight before reducing ROM — full range always" },
      hypertrophy: { sets: 4, reps: "6-8", rest: "2-3 min", intent: "Slow eccentric — weight is heavy enough if 8 is genuinely hard" },
    },
    coachingCue: "Reduce weight before reducing range of motion — a partial pull-up with more weight is cheating yourself",
  },
  {
    name: "Lat Pulldown",
    pattern: "pull_vertical", primaryMuscle: "lats", secondaryMuscles: ["upper_back", "biceps"],
    sessionRole: "secondary_compound", equipment: ["cable", "machine"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Pull-Up",
    relatedExercises: ["Pull-Up", "Chin-Up", "Straight-Arm Pulldown"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "10-12", rest: "75 sec", intent: "Pull to upper chest — depress scapula before initiating" },
      general_fitness: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Don't pull behind the neck — upper chest is the target" },
    },
    coachingCue: "Depress the scapula (pull shoulders down away from ears) before initiating the pull",
  },
  {
    name: "Chin-Up",
    pattern: "pull_vertical", primaryMuscle: "lats", secondaryMuscles: ["biceps", "upper_back"],
    sessionRole: "secondary_compound", equipment: ["bodyweight"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 2, jointStress: ["shoulder_dominant", "elbow_stress"],
    goalBias: ["hypertrophy", "strength", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Lat Pulldown", progressionTo: "Weighted Pull-Up",
    relatedExercises: ["Pull-Up", "Lat Pulldown"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "8-12", rest: "90 sec", intent: "Supinated grip recruits biceps more — better for arm development" },
      general_fitness: { sets: 3, reps: "8-12", rest: "90 sec", intent: "Full ROM — dead hang at the bottom, chin over bar at top" },
    },
    coachingCue: "Supinated grip brings the biceps in more than pull-ups — use this to your advantage",
  },

  // ═══════════════════════════════════════════════════════════════
  //  POWER / EXPLOSIVE
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Power Clean",
    pattern: "power_explosive", primaryMuscle: "full_body", secondaryMuscles: ["glutes", "hamstrings", "traps", "front_delts"],
    sessionRole: "power_work", equipment: ["barbell"], difficulty: "advanced",
    fatigueCost: 4, skillRequirement: 5, jointStress: ["wrist_stress", "spine_load"],
    goalBias: ["athletic_performance", "strength"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Hang Power Clean", progressionTo: undefined,
    relatedExercises: ["Hang Power Clean", "Push Press"],
    additionCategory: ["power"],
    prescriptions: {
      athletic_performance: { sets: 5, reps: "2-3", rest: "3-4 min", intent: "Maximum intent on every rep — not a cardio exercise. Full recovery." },
      strength: { sets: 4, reps: "3", rest: "3-4 min", intent: "Technical quality first — load is secondary to bar path and positions" },
    },
    coachingCue: "Maximum bar speed — meet the bar high, don't let it crash down on you",
  },
  {
    name: "Hang Power Clean",
    pattern: "power_explosive", primaryMuscle: "full_body", secondaryMuscles: ["glutes", "hamstrings", "traps"],
    sessionRole: "power_work", equipment: ["barbell"], difficulty: "intermediate",
    fatigueCost: 3, skillRequirement: 4, jointStress: ["wrist_stress"],
    goalBias: ["athletic_performance", "strength"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Box Jump", progressionTo: "Power Clean",
    relatedExercises: ["Power Clean", "Push Press"],
    additionCategory: ["power"],
    prescriptions: {
      athletic_performance: { sets: 4, reps: "3-4", rest: "3 min", intent: "Hips back, violent extension — meet the bar high. Teach triple extension." },
    },
    coachingCue: "Hips back, then violent hip extension — the arms guide the bar up, they don't pull it",
  },
  {
    name: "Box Jump",
    pattern: "power_explosive", primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings", "calves"],
    sessionRole: "power_work", equipment: ["bodyweight"], difficulty: "intermediate",
    fatigueCost: 2, skillRequirement: 2, jointStress: ["knee_dominant", "hip_stress"],
    goalBias: ["athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Broad Jump", progressionTo: "Depth Jump",
    relatedExercises: ["Broad Jump", "Dumbbell Jump Squat"],
    additionCategory: ["power"],
    prescriptions: {
      athletic_performance: { sets: 4, reps: "4-5", rest: "2-3 min", intent: "Land softly — absorb force through the whole chain. Full reset between reps." },
    },
    coachingCue: "Land softly and reset between reps — this isn't about rep speed, it's about power quality",
  },
  {
    name: "Medicine Ball Slam",
    pattern: "power_explosive", primaryMuscle: "full_body", secondaryMuscles: ["abs", "lats", "front_delts"],
    sessionRole: "power_work", equipment: ["bodyweight"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["spine_load"],
    goalBias: ["athletic_performance", "fat_loss"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Hang Power Clean",
    relatedExercises: ["Box Jump", "Push Press"],
    additionCategory: ["power", "conditioning"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "8-10", rest: "90 sec", intent: "Full body extension then aggressive flexion — max intent every rep" },
      fat_loss: { sets: 4, reps: "10-15", rest: "60 sec", intent: "Metabolic — keep quality at volume" },
    },
    coachingCue: "Reach tall overhead first — then slam the ball as hard as possible. Total effort every rep.",
  },

  // ═══════════════════════════════════════════════════════════════
  //  ISOLATION: ARMS
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Barbell Curl",
    pattern: "iso_arms", primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    sessionRole: "hypertrophy_accessory", equipment: ["barbell"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["elbow_stress", "wrist_stress"],
    goalBias: ["hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Dumbbell Curl", progressionTo: undefined,
    relatedExercises: ["Dumbbell Curl", "Hammer Curl", "Preacher Curl"],
    additionCategory: ["arms_bicep"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "10-12", rest: "60 sec", intent: "Elbows stay at the sides — no swinging. Squeeze at the top." },
    },
    coachingCue: "Elbows stay pinned to your sides — if they swing forward, you're using your anterior delt, not your bicep",
  },
  {
    name: "Hammer Curl",
    pattern: "iso_arms", primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["elbow_stress"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Barbell Curl", "Dumbbell Curl"],
    additionCategory: ["arms_bicep"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Neutral grip targets brachialis — adds arm thickness and elbow strength" },
    },
    coachingCue: "Neutral grip targets the brachialis — this is what adds thickness to the arms, not just peak",
  },
  {
    name: "Tricep Pushdown",
    pattern: "iso_arms", primaryMuscle: "triceps", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["cable"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["elbow_stress"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Skull Crusher",
    relatedExercises: ["Overhead Tricep Extension", "Skull Crusher"],
    additionCategory: ["arms_tricep"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Elbows stay at sides — lockout at the bottom, slow eccentric" },
    },
    coachingCue: "Elbows stay pinned to your sides throughout — if they flare, you're using chest",
  },
  {
    name: "Overhead Tricep Extension",
    pattern: "iso_arms", primaryMuscle: "triceps", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell", "cable", "barbell"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["elbow_stress", "shoulder_dominant"],
    goalBias: ["hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: "Tricep Pushdown", progressionTo: "Skull Crusher",
    relatedExercises: ["Skull Crusher", "Tricep Pushdown"],
    additionCategory: ["arms_tricep"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Long head stretch position — keep upper arms close to ears throughout" },
    },
    coachingCue: "Upper arms stay close to ears — the long head stretch is what makes this exercise valuable",
  },

  // ═══════════════════════════════════════════════════════════════
  //  ISOLATION: SHOULDERS
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Lateral Raise",
    pattern: "iso_shoulders", primaryMuscle: "side_delts", secondaryMuscles: ["traps"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell", "cable", "machine"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Cable Lateral Raise", "Arnold Press", "Face Pull"],
    additionCategory: ["shoulders_lateral"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "15-20", rest: "60 sec", intent: "Lead with the elbow, pinky up slightly — don't shrug at the top" },
    },
    coachingCue: "Lead with the elbow, slight forward lean — stop at shoulder height, not above",
  },
  {
    name: "Rear Delt Fly",
    pattern: "iso_shoulders", primaryMuscle: "rear_delts", secondaryMuscles: ["upper_back"],
    sessionRole: "hypertrophy_accessory", equipment: ["dumbbell", "cable", "machine"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["shoulder_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Face Pull", "Band Pull-Apart"],
    additionCategory: ["rear_delts"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "15-20", rest: "60 sec", intent: "Maintain scapular retraction throughout — feel the rear delt squeeze" },
    },
    coachingCue: "Maintain scapular retraction throughout — this is about the rear delt, not momentum",
  },

  // ═══════════════════════════════════════════════════════════════
  //  ISOLATION: LEGS
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Calf Raise",
    pattern: "iso_legs", primaryMuscle: "calves", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["machine", "dumbbell", "bodyweight", "barbell"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["hypertrophy", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: "Single-Leg Calf Raise",
    relatedExercises: ["Single-Leg Calf Raise", "Seated Calf Raise"],
    additionCategory: ["calves"],
    prescriptions: {
      hypertrophy: { sets: 4, reps: "15-20", rest: "60 sec", intent: "Full ROM — pause at the bottom for a stretch, squeeze hard at the top" },
      general_fitness: { sets: 3, reps: "15-20", rest: "45 sec", intent: "Full stretch at the bottom — calves respond to range more than many muscles" },
    },
    coachingCue: "Pause at the bottom — calves respond to full range more than most muscles. Squeeze hard at the top.",
  },
  {
    name: "Single-Leg Calf Raise",
    pattern: "iso_legs", primaryMuscle: "calves", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["bodyweight", "dumbbell"], difficulty: "intermediate",
    fatigueCost: 1, skillRequirement: 1, jointStress: [],
    goalBias: ["hypertrophy", "athletic_performance"],
    isUnilateral: true, isAthletic: true, tempoRelevant: true,
    progressionFrom: "Calf Raise", progressionTo: undefined,
    relatedExercises: ["Calf Raise"],
    additionCategory: ["calves"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "15-20 each side", rest: "60 sec", intent: "More stretch than bilateral — let the heel drop fully below the step" },
      athletic_performance: { sets: 3, reps: "15-20 each side", rest: "60 sec", intent: "Unilateral calf strength — important for ankle stability and acceleration" },
    },
    coachingCue: "Let the heel drop fully below the step at the bottom — more stretch = more growth",
  },
  {
    name: "Leg Extension",
    pattern: "iso_legs", primaryMuscle: "quads", secondaryMuscles: [],
    sessionRole: "hypertrophy_accessory", equipment: ["machine"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["hypertrophy"],
    isUnilateral: false, isAthletic: false, tempoRelevant: true,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Leg Press", "Bulgarian Split Squat"],
    prescriptions: {
      hypertrophy: { sets: 3, reps: "12-15", rest: "60 sec", intent: "Full extension with a peak contraction — slow eccentric every rep" },
    },
    coachingCue: "Full extension at the top with a deliberate pause — the peak contraction is where quad development happens",
  },

  // ═══════════════════════════════════════════════════════════════
  //  CORE / TRUNK
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Dead Bug",
    pattern: "core", primaryMuscle: "abs", secondaryMuscles: ["hip_flexors"],
    sessionRole: "trunk_work", equipment: ["bodyweight"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: ["low_back_stress"],
    goalBias: ["general_fitness", "strength"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Hollow Body Hold",
    relatedExercises: ["Plank", "Ab Wheel Rollout", "Pallof Press"],
    additionCategory: ["core"],
    prescriptions: {
      general_fitness: { sets: 3, reps: "8 each side", rest: "60 sec", intent: "Lower back presses into the floor throughout — no gap ever" },
      athletic_performance: { sets: 3, reps: "8-10 each side", rest: "60 sec", intent: "Anti-extension stability — the foundation of all athletic core training" },
    },
    coachingCue: "Lower back stays pressed into the floor the entire time — if you feel your back lift, reset",
  },
  {
    name: "Pallof Press",
    pattern: "core", primaryMuscle: "obliques", secondaryMuscles: ["abs"],
    sessionRole: "trunk_work", equipment: ["cable", "band"], difficulty: "beginner",
    fatigueCost: 1, skillRequirement: 1, jointStress: [],
    goalBias: ["athletic_performance", "general_fitness"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Dead Bug", "Copenhagen Plank", "Suitcase Carry"],
    additionCategory: ["core"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "10-12 each side", rest: "60 sec", intent: "Resist rotation completely — the challenge is staying still, not moving fast" },
      general_fitness: { sets: 3, reps: "10-12 each side", rest: "60 sec", intent: "Anti-rotation — the core's primary function in most sports" },
    },
    coachingCue: "Resist the cable pulling you — the goal is to stay completely still throughout",
  },
  {
    name: "Ab Wheel Rollout",
    pattern: "core", primaryMuscle: "abs", secondaryMuscles: ["lats", "spinal_erectors"],
    sessionRole: "trunk_work", equipment: ["bodyweight"], difficulty: "intermediate",
    fatigueCost: 2, skillRequirement: 2, jointStress: ["low_back_stress", "wrist_stress"],
    goalBias: ["strength", "hypertrophy"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Dead Bug", progressionTo: undefined,
    relatedExercises: ["Dead Bug", "Plank"],
    additionCategory: ["core"],
    prescriptions: {
      strength: { sets: 3, reps: "8-10", rest: "75 sec", intent: "Posterior pelvic tilt first — brace before initiating, maintain neutral spine throughout" },
      hypertrophy: { sets: 3, reps: "10-12", rest: "60 sec", intent: "Full extension — feel the lat and abs working together" },
    },
    coachingCue: "Posterior pelvic tilt before you roll out — if your lower back dips at any point, you've gone too far",
  },
  {
    name: "Copenhagen Plank",
    pattern: "core", primaryMuscle: "adductors", secondaryMuscles: ["obliques", "abs"],
    sessionRole: "trunk_work", equipment: ["bodyweight"], difficulty: "advanced",
    fatigueCost: 2, skillRequirement: 2, jointStress: ["hip_stress"],
    goalBias: ["athletic_performance"],
    isUnilateral: true, isAthletic: true, tempoRelevant: false,
    progressionFrom: "Pallof Press", progressionTo: undefined,
    relatedExercises: ["Pallof Press", "Suitcase Carry"],
    additionCategory: ["core"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "20-30 sec each side", rest: "75 sec", intent: "Adductor and oblique integration — key for groin health in athletes" },
    },
    coachingCue: "Rigid from head to heel of the top leg — the adductor is doing the work, not the hip flexor",
  },

  // ═══════════════════════════════════════════════════════════════
  //  CARRIES
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Farmer Carry",
    pattern: "carry", primaryMuscle: "forearms", secondaryMuscles: ["traps", "abs", "quads"],
    sessionRole: "trunk_work", equipment: ["dumbbell", "kettlebell", "barbell"], difficulty: "beginner",
    fatigueCost: 3, skillRequirement: 1, jointStress: ["spine_load"],
    goalBias: ["general_fitness", "athletic_performance", "strength"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: "Suitcase Carry",
    relatedExercises: ["Suitcase Carry"],
    additionCategory: ["carries", "core"],
    prescriptions: {
      general_fitness: { sets: 3, reps: "30-40m", rest: "90 sec", intent: "Tall posture, short strides — full-body integration" },
      athletic_performance: { sets: 3, reps: "40m", rest: "90 sec", intent: "Loaded carry builds real-world strength — grip, core, posture" },
      strength: { sets: 3, reps: "30m", rest: "90 sec", intent: "As heavy as posture allows — this is functional strength" },
    },
    coachingCue: "Tall posture, short strides — if your posture breaks down, the weight is too heavy",
  },
  {
    name: "Suitcase Carry",
    pattern: "carry", primaryMuscle: "obliques", secondaryMuscles: ["forearms", "traps", "abs"],
    sessionRole: "trunk_work", equipment: ["dumbbell", "kettlebell"], difficulty: "beginner",
    fatigueCost: 2, skillRequirement: 1, jointStress: ["spine_load"],
    goalBias: ["general_fitness", "athletic_performance"],
    isUnilateral: true, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Farmer Carry", "Pallof Press"],
    additionCategory: ["carries", "core"],
    prescriptions: {
      athletic_performance: { sets: 3, reps: "30-40m each side", rest: "90 sec", intent: "Anti-lateral flexion — resist the lean completely" },
      general_fitness: { sets: 3, reps: "30m each side", rest: "75 sec", intent: "Walk tall — the challenge is resisting the side lean" },
    },
    coachingCue: "Resist the lean to the loaded side completely — your spine should be perfectly neutral",
  },

  // ═══════════════════════════════════════════════════════════════
  //  CONDITIONING
  // ═══════════════════════════════════════════════════════════════

  {
    name: "Assault Bike Intervals",
    pattern: "conditioning", primaryMuscle: "full_body", secondaryMuscles: [],
    sessionRole: "finisher", equipment: ["machine"], difficulty: "beginner",
    fatigueCost: 4, skillRequirement: 1, jointStress: [],
    goalBias: ["fat_loss", "general_fitness", "athletic_performance"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Rowing Machine Intervals", "Sled Push"],
    additionCategory: ["conditioning"],
    prescriptions: {
      fat_loss: { sets: 8, reps: "20 sec on / 40 sec off", rest: "40 sec", intent: "Max effort on, full rest off — HIIT protocol" },
      athletic_performance: { sets: 5, reps: "30 sec on / 90 sec off", rest: "90 sec", intent: "True alactic interval — full power each bout" },
      general_fitness: { sets: 5, reps: "30 sec on / 60 sec off", rest: "60 sec", intent: "Aerobic development — maintain pace across all bouts" },
    },
    coachingCue: "Max effort on every interval — the bike doesn't lie. Don't pace yourself.",
  },
  {
    name: "Sled Push",
    pattern: "conditioning", primaryMuscle: "quads", secondaryMuscles: ["glutes", "calves", "front_delts"],
    sessionRole: "finisher", equipment: ["machine"], difficulty: "beginner",
    fatigueCost: 4, skillRequirement: 1, jointStress: ["knee_dominant"],
    goalBias: ["athletic_performance", "fat_loss"],
    isUnilateral: false, isAthletic: true, tempoRelevant: false,
    progressionFrom: undefined, progressionTo: undefined,
    relatedExercises: ["Assault Bike Intervals", "Battle Ropes"],
    additionCategory: ["conditioning"],
    prescriptions: {
      athletic_performance: { sets: 5, reps: "20m", rest: "2 min", intent: "Drive through the balls of the feet — stay low and powerful" },
      fat_loss: { sets: 6, reps: "20m", rest: "90 sec", intent: "Constant power output — no coasting" },
    },
    coachingCue: "Stay low with a forward lean — power from the legs, arms stabilize",
  },
];

// ─── Query System ──────────────────────────────────────────────────────────────

export interface ExerciseQuery {
  pattern?: MovementPattern;
  primaryMuscle?: PrimaryMuscle;
  additionCategory?: AdditionCategory;
  sessionRole?: SessionRole;
  equipment?: EquipmentLevel;
  goal?: GoalType;
  maxFatigueCost?: number;
  maxSkillRequirement?: number;
  excludeJointStress?: JointStress[];
  preferUnilateral?: boolean;
  preferAthletic?: boolean;
  excludeNames?: string[];
  experience?: ExperienceTier;
  limit?: number;
}

export interface QueryResult {
  exercise: ExerciseIntelligence;
  score: number;
  selectionReason: string;
}

const EQUIPMENT_TAGS: Record<EquipmentLevel, EquipmentTag[]> = {
  full_gym: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "trap_bar"],
  dumbbells_only: ["dumbbell", "bodyweight", "band", "kettlebell"],
  home_limited: ["dumbbell", "bodyweight", "band", "kettlebell"],
  bodyweight: ["bodyweight", "band"],
};

export function queryExercises(query: ExerciseQuery): QueryResult[] {
  const allowedEquipment = query.equipment ? EQUIPMENT_TAGS[query.equipment] : null;
  const excludeNames = new Set((query.excludeNames ?? []).map((n) => n.toLowerCase()));
  const experienceOrder: Record<ExperienceTier, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  const userLevel = query.experience ? experienceOrder[query.experience] : 2;

  const candidates = EXERCISE_INTELLIGENCE.filter((ex) => {
    if (query.pattern && ex.pattern !== query.pattern) return false;
    if (query.primaryMuscle && ex.primaryMuscle !== query.primaryMuscle &&
        !ex.secondaryMuscles.includes(query.primaryMuscle)) return false;
    if (query.additionCategory && !ex.additionCategory?.includes(query.additionCategory)) return false;
    if (query.sessionRole && ex.sessionRole !== query.sessionRole) return false;

    if (allowedEquipment) {
      const hasEquipment = ex.equipment.some((eq) => allowedEquipment.includes(eq));
      if (!hasEquipment) return false;
    }

    if (query.experience) {
      const exLevel = experienceOrder[ex.difficulty];
      if (exLevel > userLevel + 1) return false; // allow one level above
    }

    if (query.maxFatigueCost && ex.fatigueCost > query.maxFatigueCost) return false;
    if (query.maxSkillRequirement && ex.skillRequirement > query.maxSkillRequirement) return false;

    if (query.excludeJointStress?.length) {
      const hasConflict = ex.jointStress.some((s) => query.excludeJointStress!.includes(s));
      if (hasConflict) return false;
    }

    if (excludeNames.has(ex.name.toLowerCase())) return false;

    return true;
  });

  // Score each candidate
  const scored: QueryResult[] = candidates.map((ex) => {
    let score = 50;
    const reasons: string[] = [];

    // Goal alignment
    if (query.goal && ex.goalBias.includes(query.goal)) {
      score += 20;
      reasons.push(`goal-aligned for ${query.goal}`);
    }

    // Unilateral preference
    if (query.preferUnilateral === true && ex.isUnilateral) {
      score += 10;
      reasons.push("unilateral");
    } else if (query.preferUnilateral === false && !ex.isUnilateral) {
      score += 5;
    }

    // Athletic preference
    if (query.preferAthletic && ex.isAthletic) {
      score += 8;
      reasons.push("athletic movement");
    }

    // Fatigue cost — lower is better when maxFatigueCost is set
    if (query.maxFatigueCost) {
      score += (query.maxFatigueCost - ex.fatigueCost) * 3;
    }

    // Difficulty match
    if (query.experience) {
      const exLevel = experienceOrder[ex.difficulty];
      if (exLevel === userLevel) { score += 8; reasons.push("experience-matched difficulty"); }
      if (exLevel < userLevel) { score -= 3; } // slightly under-challenging
    }

    const reason = reasons.length > 0
      ? `${reasons.join(", ")} (score: ${score})`
      : `Pattern match (score: ${score})`;

    return { exercise: ex, score, selectionReason: reason };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  return sorted.slice(0, query.limit ?? sorted.length);
}

// ─── Prescription Engine ──────────────────────────────────────────────────────

export function getPrescription(
  exercise: ExerciseIntelligence,
  goal: GoalType,
  experience: ExperienceTier,
): GoalPrescription {
  // Try exact goal match first
  if (exercise.prescriptions[goal]) {
    return exercise.prescriptions[goal]!;
  }

  // Try adjacent goals
  const fallbackOrder: GoalType[] = [
    "hypertrophy", "strength", "general_fitness", "athletic_performance", "fat_loss",
  ];

  for (const fallback of fallbackOrder) {
    if (exercise.prescriptions[fallback]) {
      return exercise.prescriptions[fallback]!;
    }
  }

  // Default prescription based on session role
  const defaults: Record<SessionRole, GoalPrescription> = {
    main_lift: { sets: 4, reps: "5-8", rest: "3 min", intent: "Primary stimulus — technical quality over load" },
    secondary_compound: { sets: 3, reps: "8-12", rest: "2 min", intent: "Supporting compound — control the movement" },
    hypertrophy_accessory: { sets: 3, reps: "12-15", rest: "75 sec", intent: "Accessory volume — feel the target muscle" },
    power_work: { sets: 4, reps: "3-5", rest: "3 min", intent: "Maximum intent — full recovery between sets" },
    trunk_work: { sets: 3, reps: "10-12 each side", rest: "60 sec", intent: "Quality over quantity" },
    mobility_reset: { sets: 2, reps: "10-15 each side", rest: "45 sec", intent: "Controlled, quality movement" },
    finisher: { sets: 3, reps: "15-20", rest: "60 sec", intent: "End of session — push the metabolic work" },
  };

  return defaults[exercise.sessionRole];
}

// ─── Substitution Engine ──────────────────────────────────────────────────────

export type SubstitutionReason =
  | "pain"          // joint conflict
  | "equipment"     // equipment unavailable
  | "fatigue"       // too fatiguing, need lower-cost option
  | "preference"    // user dislike
  | "swap"          // user-requested swap (preserve role)
  | "progression"   // step up in difficulty
  | "regression";   // step down in difficulty

export interface SubstitutionRequest {
  originalName: string;
  reason: SubstitutionReason;
  goal: GoalType;
  equipment: EquipmentLevel;
  experience: ExperienceTier;
  injuryFlags: JointStress[];
  sessionRole: SessionRole;
  excludeNames?: string[];
}

export interface SubstitutionResult {
  chosen: ExerciseIntelligence | null;
  prescription: GoalPrescription | null;
  rationale: string;
  alternativesConsidered: string[];
}

export function findSubstitute(req: SubstitutionRequest): SubstitutionResult {
  const original = EXERCISE_INTELLIGENCE.find(
    (e) => e.name.toLowerCase() === req.originalName.toLowerCase()
  );

  // Try progression/regression first if that's the reason
  if (req.reason === "progression" && original?.progressionTo) {
    const prog = EXERCISE_INTELLIGENCE.find((e) => e.name === original.progressionTo);
    if (prog) {
      return {
        chosen: prog,
        prescription: getPrescription(prog, req.goal, req.experience),
        rationale: `${prog.name} is the natural progression from ${req.originalName}`,
        alternativesConsidered: [],
      };
    }
  }

  if (req.reason === "regression" && original?.progressionFrom) {
    const regr = EXERCISE_INTELLIGENCE.find((e) => e.name === original.progressionFrom);
    if (regr) {
      return {
        chosen: regr,
        prescription: getPrescription(regr, req.goal, req.experience),
        rationale: `${regr.name} is a more manageable regression from ${req.originalName}`,
        alternativesConsidered: [],
      };
    }
  }

  // Build query based on substitution reason
  const query: ExerciseQuery = {
    pattern: original?.pattern as MovementPattern | undefined,
    goal: req.goal,
    equipment: req.equipment,
    experience: req.experience,
    sessionRole: req.sessionRole,
    excludeNames: [...(req.excludeNames ?? []), req.originalName],
    limit: 5,
  };

  if (req.reason === "pain") {
    query.excludeJointStress = req.injuryFlags;
    query.maxFatigueCost = 3; // prefer lower-stress option
  }

  if (req.reason === "fatigue") {
    query.maxFatigueCost = Math.max(1, (original?.fatigueCost ?? 4) - 1);
  }

  const results = queryExercises(query);
  const top5 = results.slice(0, 5);

  if (top5.length === 0) {
    logger.warn(
      { originalName: req.originalName, reason: req.reason },
      "[ExerciseIntelligence] No substitute found — check query constraints"
    );
    return { chosen: null, prescription: null, rationale: "No suitable substitute found for given constraints", alternativesConsidered: [] };
  }

  const chosen = top5[0].exercise;
  const alternatives = top5.slice(1).map((r) => r.exercise.name);

  const reasonPhrases: Record<SubstitutionReason, string> = {
    pain: `Pain-safe substitute — same ${chosen.pattern.replace(/_/g, " ")} pattern, avoids ${req.injuryFlags.map((f) => f.replace(/_/g, " ")).join(", ")}`,
    equipment: `Equipment-available substitute — same movement pattern with available equipment`,
    fatigue: `Lower-fatigue substitute — fatigue cost ${chosen.fatigueCost} vs original ${original?.fatigueCost ?? "?"}`,
    preference: `User-preferred substitute — same role (${chosen.sessionRole.replace(/_/g, " ")}) and pattern`,
    swap: `Direct swap — same movement pattern (${chosen.pattern.replace(/_/g, " ")}), same session role`,
    progression: `Progression from ${req.originalName} — higher difficulty/load potential`,
    regression: `Regression from ${req.originalName} — more manageable for current constraints`,
  };

  logger.info(
    {
      original: req.originalName,
      chosen: chosen.name,
      reason: req.reason,
      alternatives,
      selectionReason: top5[0].selectionReason,
    },
    "[ExerciseIntelligence] Substitute selected"
  );

  return {
    chosen,
    prescription: getPrescription(chosen, req.goal, req.experience),
    rationale: reasonPhrases[req.reason],
    alternativesConsidered: alternatives,
  };
}

// ─── Addition Engine ───────────────────────────────────────────────────────────

export interface AdditionContext {
  category: AdditionCategory;
  goal: GoalType;
  equipment: EquipmentLevel;
  experience: ExperienceTier;
  injuryFlags: JointStress[];
  sessionDurationMinutes: number;
  currentExerciseNames: string[];
  preferAthletic?: boolean;
  limit?: number;
}

export interface AdditionResult {
  additions: Array<{
    exercise: ExerciseIntelligence;
    prescription: GoalPrescription;
    placementNote: string;
    rationale: string;
  }>;
}

const PLACEMENT_NOTES: Record<AdditionCategory, string> = {
  core: "Place at the end of the session after primary and secondary compound work",
  calves: "Add to lower body sessions as an end-of-session accessory",
  hamstrings: "Place after primary hinge movements — avoid before deadlift or squat",
  glutes: "Add to lower body sessions — can be placed after main squats/hinges",
  rear_delts: "Add to pull days or upper days — can superset with push work for efficiency",
  power: "Place at the START of the session when CNS is completely fresh",
  conditioning: "Place at the END of the session after all strength work",
  carries: "Place at the end of sessions or use as a transition between compound movements",
  mobility: "Place at the start as activation or end as reset work",
  arms_bicep: "Add to pull days or upper days — finisher role at session end",
  arms_tricep: "Add to push days or upper days — finisher role at session end",
  shoulders_lateral: "Add to upper or push days — accessory role, place after main compounds",
  upper_back: "Add to pull days or any upper session — pairs well with face pulls",
};

export function findAdditions(ctx: AdditionContext): AdditionResult {
  const maxPerSession = ctx.sessionDurationMinutes < 60 ? 1 : ctx.sessionDurationMinutes < 75 ? 2 : 3;
  const limit = Math.min(ctx.limit ?? 2, maxPerSession);

  const results = queryExercises({
    additionCategory: ctx.category,
    goal: ctx.goal,
    equipment: ctx.equipment,
    experience: ctx.experience,
    excludeJointStress: ctx.injuryFlags.length > 0 ? ctx.injuryFlags : undefined,
    excludeNames: ctx.currentExerciseNames,
    preferAthletic: ctx.preferAthletic,
    maxFatigueCost: ctx.sessionDurationMinutes < 60 ? 2 : undefined,
    limit: limit + 3, // get extras for filtering
  });

  const finalResults = results.slice(0, limit);

  if (finalResults.length === 0) {
    logger.warn({ category: ctx.category, goal: ctx.goal }, "[ExerciseIntelligence] No additions found for category");
    return { additions: [] };
  }

  logger.info(
    {
      category: ctx.category,
      selectedExercises: finalResults.map((r) => r.exercise.name),
      goal: ctx.goal,
    },
    "[ExerciseIntelligence] Additions selected"
  );

  return {
    additions: finalResults.map((r) => ({
      exercise: r.exercise,
      prescription: getPrescription(r.exercise, ctx.goal, ctx.experience),
      placementNote: PLACEMENT_NOTES[ctx.category],
      rationale: r.selectionReason,
    })),
  };
}

// ─── Progression / Regression Lookup ─────────────────────────────────────────

export function getProgression(exerciseName: string): ExerciseIntelligence | null {
  const ex = EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase());
  if (!ex?.progressionTo) return null;
  return EXERCISE_INTELLIGENCE.find((e) => e.name === ex.progressionTo) ?? null;
}

export function getRegression(exerciseName: string): ExerciseIntelligence | null {
  const ex = EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase());
  if (!ex?.progressionFrom) return null;
  return EXERCISE_INTELLIGENCE.find((e) => e.name === ex.progressionFrom) ?? null;
}

export function getRelatedExercises(exerciseName: string, limit = 3): ExerciseIntelligence[] {
  const ex = EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase());
  if (!ex?.relatedExercises.length) return [];
  return ex.relatedExercises
    .slice(0, limit)
    .map((name) => EXERCISE_INTELLIGENCE.find((e) => e.name === name))
    .filter((e): e is ExerciseIntelligence => e !== undefined);
}

// ─── Progression Chain Builder ────────────────────────────────────────────────

export function getFullProgressionChain(exerciseName: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  // Walk backward (easier versions)
  let current = exerciseName;
  const backwards: string[] = [];
  while (current && !visited.has(current)) {
    visited.add(current);
    const ex = EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === current.toLowerCase());
    if (ex?.progressionFrom && !visited.has(ex.progressionFrom)) {
      backwards.unshift(ex.progressionFrom);
      current = ex.progressionFrom;
    } else break;
  }

  // Walk forward (harder versions)
  const visited2 = new Set<string>();
  current = exerciseName;
  const forwards: string[] = [];
  while (current && !visited2.has(current)) {
    visited2.add(current);
    const ex = EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === current.toLowerCase());
    if (ex?.progressionTo && !visited2.has(ex.progressionTo)) {
      forwards.push(ex.progressionTo);
      current = ex.progressionTo;
    } else break;
  }

  return [...backwards, exerciseName, ...forwards];
}

// ─── Goal-Bias Pattern Selector ───────────────────────────────────────────────
// Given a goal + movement pattern, returns the best exercise choice for that combination.

export function selectForGoalAndPattern(
  goal: GoalType,
  pattern: MovementPattern,
  equipment: EquipmentLevel,
  experience: ExperienceTier,
  injuryFlags: JointStress[],
  excludeNames: string[] = [],
): ExerciseIntelligence | null {
  const results = queryExercises({
    pattern,
    goal,
    equipment,
    experience,
    excludeJointStress: injuryFlags,
    excludeNames,
    limit: 1,
  });
  return results[0]?.exercise ?? null;
}

// ─── Lookup by Name ───────────────────────────────────────────────────────────

export function lookupExercise(name: string): ExerciseIntelligence | null {
  return EXERCISE_INTELLIGENCE.find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null;
}
