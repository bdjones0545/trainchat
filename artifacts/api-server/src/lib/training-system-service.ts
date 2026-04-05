import { db } from "@workspace/db";
import {
  trainingSystems,
  trainingPhases,
  trainingWeeks,
  trainingSessions,
  sessionExercises,
  userProfilesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { UserProfile } from "@workspace/db";
import {
  selectSessionExercises,
  type SessionType,
  type GoalType as CoachGoalType,
  type ExperienceTier as CoachExperienceTier,
  type EquipmentLevel as CoachEquipmentLevel,
} from "./coach-select";
import { detectInjuryFlags, normalizeExperience } from "./training-intelligence";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExerciseTemplate {
  name: string;
  category: "warmup" | "primary" | "accessory" | "conditioning" | "finisher";
  sets: number;
  reps: string;
  rest: string;
  tempo?: string;
  notes?: string;
}

export interface SessionTemplate {
  label: string;
  sessionType: "lifting" | "conditioning" | "mobility" | "recovery" | "sport" | "rest";
  emphasis: string;
  dayOfWeek: number;
  warmupNotes: string;
  coachingNotes: string;
  exercises: ExerciseTemplate[];
}

// ─── Goal / Style Normalizers ────────────────────────────────────────────────

function normalizeGoal(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower.includes("strength") || lower.includes("strong")) return "strength";
  if (lower.includes("muscle") || lower.includes("hypertrophy") || lower.includes("size")) return "hypertrophy";
  if (lower.includes("fat") || lower.includes("weight") || lower.includes("lean")) return "fat_loss";
  if (lower.includes("athletic") || lower.includes("sport") || lower.includes("performance")) return "athletic";
  if (lower.includes("endur") || lower.includes("cardio") || lower.includes("conditioning")) return "endurance";
  return "general_fitness";
}

function normalizeEquipment(equipment: string): string {
  const lower = equipment.toLowerCase();
  if (lower.includes("full") || lower.includes("gym") || lower.includes("barbell")) return "full_gym";
  if (lower.includes("dumbbell") || lower.includes("home")) return "dumbbells";
  if (lower.includes("body") || lower.includes("calisthenics") || lower.includes("no equipment")) return "bodyweight";
  if (lower.includes("minimal") || lower.includes("resistance")) return "minimal";
  return "full_gym";
}

// ─── Exercise Libraries ──────────────────────────────────────────────────────

const exerciseLibrary: Record<string, Record<string, ExerciseTemplate[][]>> = {
  full_gym: {
    strength: [
      // Push days
      [
        { name: "Barbell Back Squat", category: "primary", sets: 4, reps: "5", rest: "3-4 min", notes: "Focus on bracing and bar path" },
        { name: "Romanian Deadlift", category: "primary", sets: 3, reps: "6-8", rest: "2-3 min", notes: "Controlled eccentric, hip hinge emphasis" },
        { name: "Bulgarian Split Squat", category: "accessory", sets: 3, reps: "8 each", rest: "90 sec" },
        { name: "Leg Press", category: "accessory", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Leg Curl", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Calf Raise", category: "finisher", sets: 4, reps: "15-20", rest: "45 sec" },
      ],
      // Pull days
      [
        { name: "Barbell Bench Press", category: "primary", sets: 4, reps: "5", rest: "3-4 min", notes: "Tuck elbows 45°, drive feet into floor" },
        { name: "Overhead Press", category: "primary", sets: 3, reps: "6-8", rest: "2-3 min" },
        { name: "Incline Dumbbell Press", category: "accessory", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Tricep Pushdown", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Lateral Raise", category: "accessory", sets: 4, reps: "12-15", rest: "45 sec" },
        { name: "Face Pull", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec", notes: "External rotation at top" },
      ],
      // Deadlift/Back days
      [
        { name: "Conventional Deadlift", category: "primary", sets: 4, reps: "4-5", rest: "4-5 min", notes: "Treat as a full pull, not just a leg drive" },
        { name: "Barbell Row", category: "primary", sets: 3, reps: "6-8", rest: "2-3 min" },
        { name: "Pull-Up / Lat Pulldown", category: "accessory", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Seated Cable Row", category: "accessory", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Barbell Curl", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Hammer Curl", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
    ],
    hypertrophy: [
      [
        { name: "Barbell Back Squat", category: "primary", sets: 4, reps: "8-10", rest: "2 min", notes: "Moderate weight, emphasize feel and control" },
        { name: "Hack Squat or Leg Press", category: "primary", sets: 3, reps: "10-12", rest: "2 min" },
        { name: "Bulgarian Split Squat", category: "accessory", sets: 3, reps: "10-12 each", rest: "90 sec", notes: "Slow 3s eccentric" },
        { name: "Leg Extension", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Lying Leg Curl", category: "accessory", sets: 4, reps: "10-12", rest: "60 sec" },
        { name: "Standing Calf Raise", category: "finisher", sets: 4, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Barbell Bench Press", category: "primary", sets: 4, reps: "8-10", rest: "2 min" },
        { name: "Incline Dumbbell Press", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Cable Fly", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec", notes: "Full stretch at bottom" },
        { name: "Overhead Press", category: "accessory", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Lateral Raise", category: "accessory", sets: 4, reps: "15-20", rest: "45 sec" },
        { name: "Tricep Overhead Extension", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Deadlift or Trap Bar Deadlift", category: "primary", sets: 3, reps: "8-10", rest: "2-3 min" },
        { name: "Barbell Row", category: "primary", sets: 4, reps: "8-10", rest: "90 sec" },
        { name: "Weighted Pull-Up or Lat Pulldown", category: "accessory", sets: 3, reps: "8-12", rest: "90 sec" },
        { name: "Single-Arm Dumbbell Row", category: "accessory", sets: 3, reps: "10-12 each", rest: "60 sec" },
        { name: "Incline Dumbbell Curl", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Face Pull", category: "finisher", sets: 4, reps: "15-20", rest: "45 sec" },
      ],
    ],
    fat_loss: [
      [
        { name: "Goblet Squat", category: "primary", sets: 4, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Walking Lunge", category: "accessory", sets: 3, reps: "12 each", rest: "60 sec" },
        { name: "Step-Up", category: "accessory", sets: 3, reps: "12 each", rest: "45 sec" },
        { name: "Plank", category: "finisher", sets: 3, reps: "30-45 sec", rest: "30 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 4, reps: "12-15", rest: "60 sec" },
        { name: "Push-Up Variation", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
        { name: "Dumbbell Shoulder Press", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Lateral Raise", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
        { name: "Tricep Dip or Pushdown", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Dumbbell Row", category: "primary", sets: 4, reps: "12-15", rest: "60 sec" },
        { name: "Lat Pulldown", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Cable Row", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Curl", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
        { name: "Dead Bug", category: "finisher", sets: 3, reps: "8 each side", rest: "30 sec" },
      ],
    ],
    general_fitness: [
      [
        { name: "Barbell or Goblet Squat", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Romanian Deadlift", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Leg Press", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Calf Raise", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Bench Press", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Overhead Press", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Lateral Raise", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
        { name: "Tricep Extension", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Deadlift", category: "primary", sets: 3, reps: "8-10", rest: "2 min" },
        { name: "Lat Pulldown or Pull-Up", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Seated Row", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Curl", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
    ],
    athletic: [
      [
        { name: "Box Squat", category: "primary", sets: 5, reps: "3", rest: "3 min", notes: "Explosive concentric" },
        { name: "Power Clean", category: "primary", sets: 4, reps: "3", rest: "3 min" },
        { name: "Romanian Deadlift", category: "accessory", sets: 3, reps: "8", rest: "90 sec" },
        { name: "Nordic Curl or Leg Curl", category: "accessory", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Single-Leg Box Jump", category: "conditioning", sets: 3, reps: "5 each", rest: "90 sec" },
      ],
      [
        { name: "Bench Press", category: "primary", sets: 4, reps: "5", rest: "3 min" },
        { name: "Pull-Up", category: "primary", sets: 4, reps: "6-8", rest: "2 min" },
        { name: "Push Press", category: "accessory", sets: 3, reps: "5", rest: "2 min" },
        { name: "Dumbbell Row", category: "accessory", sets: 3, reps: "8 each", rest: "60 sec" },
        { name: "Med Ball Slam", category: "conditioning", sets: 3, reps: "8-10", rest: "60 sec" },
      ],
      [
        { name: "Trap Bar Deadlift", category: "primary", sets: 4, reps: "4-5", rest: "3-4 min" },
        { name: "Front Squat", category: "primary", sets: 3, reps: "5", rest: "3 min" },
        { name: "Hip Thrust", category: "accessory", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Broad Jump", category: "conditioning", sets: 4, reps: "5", rest: "90 sec" },
        { name: "Sled Push or Sprint Interval", category: "conditioning", sets: 4, reps: "20m", rest: "2 min" },
      ],
    ],
  },
  dumbbells: {
    strength: [
      [
        { name: "Dumbbell Goblet Squat", category: "primary", sets: 4, reps: "8-10", rest: "2 min" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 4, reps: "8-10", rest: "2 min" },
        { name: "Dumbbell Lunge", category: "accessory", sets: 3, reps: "10 each", rest: "90 sec" },
        { name: "Dumbbell Step-Up", category: "accessory", sets: 3, reps: "10 each", rest: "90 sec" },
        { name: "Calf Raise (single-leg)", category: "finisher", sets: 3, reps: "12-15 each", rest: "45 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 4, reps: "8-10", rest: "2 min" },
        { name: "Dumbbell Overhead Press", category: "primary", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Dumbbell Lateral Raise", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Tricep Extension", category: "finisher", sets: 3, reps: "12-15", rest: "60 sec" },
      ],
      [
        { name: "Dumbbell Row", category: "primary", sets: 4, reps: "8-10 each", rest: "90 sec" },
        { name: "Dumbbell Curl", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Chest-Supported Row", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Face Pull (band or cable)", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
    ],
    hypertrophy: [
      [
        { name: "Dumbbell Goblet Squat", category: "primary", sets: 4, reps: "12-15", rest: "90 sec" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 3, reps: "12-15", rest: "90 sec" },
        { name: "Dumbbell Lunge", category: "accessory", sets: 3, reps: "12 each", rest: "60 sec" },
        { name: "Dumbbell Step-Up", category: "accessory", sets: 3, reps: "12 each", rest: "60 sec" },
        { name: "Dumbbell Calf Raise", category: "finisher", sets: 4, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 4, reps: "10-12", rest: "90 sec" },
        { name: "Incline Dumbbell Press", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Dumbbell Fly", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Overhead Press", category: "accessory", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Dumbbell Lateral Raise", category: "finisher", sets: 4, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Dumbbell Row", category: "primary", sets: 4, reps: "10-12 each", rest: "60 sec" },
        { name: "Incline Dumbbell Row", category: "primary", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Dumbbell Bicep Curl", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
        { name: "Hammer Curl", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
        { name: "Rear Delt Fly", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
    ],
    fat_loss: [
      [
        { name: "Dumbbell Goblet Squat", category: "primary", sets: 4, reps: "15", rest: "60 sec" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 3, reps: "15", rest: "60 sec" },
        { name: "Dumbbell Reverse Lunge", category: "accessory", sets: 3, reps: "12 each", rest: "45 sec" },
        { name: "Plank", category: "finisher", sets: 3, reps: "30-45 sec", rest: "30 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 4, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Shoulder Press", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dumbbell Lateral Raise", category: "accessory", sets: 3, reps: "15", rest: "45 sec" },
        { name: "Mountain Climber", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
      [
        { name: "Dumbbell Row", category: "primary", sets: 4, reps: "12-15 each", rest: "60 sec" },
        { name: "Dumbbell Bicep Curl", category: "accessory", sets: 3, reps: "15", rest: "45 sec" },
        { name: "Dumbbell Tricep Kickback", category: "accessory", sets: 3, reps: "15", rest: "45 sec" },
        { name: "Hollow Hold", category: "finisher", sets: 3, reps: "20-30 sec", rest: "30 sec" },
      ],
    ],
    general_fitness: [
      [
        { name: "Dumbbell Squat", category: "primary", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Dumbbell Lunge", category: "accessory", sets: 3, reps: "10 each", rest: "60 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Dumbbell Shoulder Press", category: "primary", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Dumbbell Tricep Extension", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Dumbbell Row", category: "primary", sets: 3, reps: "12 each", rest: "60 sec" },
        { name: "Dumbbell Curl", category: "accessory", sets: 3, reps: "12", rest: "45 sec" },
        { name: "Rear Delt Fly", category: "finisher", sets: 3, reps: "15", rest: "45 sec" },
      ],
    ],
    athletic: [
      [
        { name: "Dumbbell Jump Squat", category: "primary", sets: 4, reps: "5", rest: "2 min", notes: "Explosive" },
        { name: "Dumbbell Romanian Deadlift", category: "primary", sets: 4, reps: "8", rest: "90 sec" },
        { name: "Dumbbell Reverse Lunge", category: "accessory", sets: 3, reps: "8 each", rest: "60 sec" },
        { name: "Dumbbell Step-Up Jump", category: "conditioning", sets: 3, reps: "6 each", rest: "90 sec" },
      ],
      [
        { name: "Dumbbell Bench Press", category: "primary", sets: 4, reps: "6-8", rest: "90 sec" },
        { name: "Dumbbell Row", category: "primary", sets: 4, reps: "6-8 each", rest: "90 sec" },
        { name: "Dumbbell Push Press", category: "accessory", sets: 3, reps: "6", rest: "2 min" },
        { name: "Dumbbell Lateral Bound", category: "conditioning", sets: 3, reps: "5 each", rest: "90 sec" },
      ],
      [
        { name: "Dumbbell Single-Leg Deadlift", category: "primary", sets: 4, reps: "8 each", rest: "90 sec" },
        { name: "Dumbbell Hip Thrust", category: "primary", sets: 4, reps: "10-12", rest: "90 sec" },
        { name: "Dumbbell Rotational Row", category: "accessory", sets: 3, reps: "8 each", rest: "60 sec" },
        { name: "Broad Jump", category: "conditioning", sets: 4, reps: "5", rest: "90 sec" },
      ],
    ],
  },
  bodyweight: {
    strength: [
      [
        { name: "Pistol Squat or Assisted Pistol", category: "primary", sets: 4, reps: "5-8 each", rest: "2 min" },
        { name: "Nordic Curl or Glute-Ham Raise", category: "primary", sets: 3, reps: "5-8", rest: "2 min" },
        { name: "Bulgarian Split Squat", category: "accessory", sets: 3, reps: "8-10 each", rest: "90 sec" },
        { name: "Hip Thrust (single-leg)", category: "accessory", sets: 3, reps: "12 each", rest: "60 sec" },
      ],
      [
        { name: "Push-Up Variation (weighted/archer)", category: "primary", sets: 4, reps: "8-12", rest: "2 min" },
        { name: "Dip", category: "primary", sets: 4, reps: "8-10", rest: "2 min" },
        { name: "Pike Push-Up", category: "accessory", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Diamond Push-Up", category: "finisher", sets: 3, reps: "12-15", rest: "60 sec" },
      ],
      [
        { name: "Pull-Up", category: "primary", sets: 4, reps: "6-8", rest: "2 min" },
        { name: "Chin-Up", category: "primary", sets: 3, reps: "8-10", rest: "90 sec" },
        { name: "Inverted Row", category: "accessory", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Hanging Knee Raise", category: "finisher", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
    ],
    hypertrophy: [
      [
        { name: "Bulgarian Split Squat", category: "primary", sets: 4, reps: "12-15 each", rest: "90 sec" },
        { name: "Hip Thrust", category: "primary", sets: 4, reps: "15-20", rest: "90 sec" },
        { name: "Walking Lunge", category: "accessory", sets: 3, reps: "15 each", rest: "60 sec" },
        { name: "Glute Bridge Pulse", category: "finisher", sets: 3, reps: "20-25", rest: "45 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 4, reps: "15-20", rest: "90 sec" },
        { name: "Dip", category: "primary", sets: 3, reps: "12-15", rest: "90 sec" },
        { name: "Wide Push-Up", category: "accessory", sets: 3, reps: "15-20", rest: "60 sec" },
        { name: "Decline Push-Up", category: "finisher", sets: 3, reps: "12-15", rest: "60 sec" },
      ],
      [
        { name: "Pull-Up", category: "primary", sets: 4, reps: "8-12", rest: "90 sec" },
        { name: "Inverted Row", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Australian Pull-Up", category: "accessory", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Bicep Curl (towel or band)", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
    ],
    fat_loss: [
      [
        { name: "Squat Jump", category: "primary", sets: 4, reps: "15", rest: "45 sec" },
        { name: "Reverse Lunge", category: "primary", sets: 3, reps: "12 each", rest: "45 sec" },
        { name: "Glute Bridge", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
        { name: "Mountain Climber", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 4, reps: "15-20", rest: "45 sec" },
        { name: "Burpee", category: "conditioning", sets: 3, reps: "10", rest: "60 sec" },
        { name: "Tricep Dip", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
        { name: "Plank to Push-Up", category: "finisher", sets: 3, reps: "10", rest: "45 sec" },
      ],
      [
        { name: "Pull-Up or Inverted Row", category: "primary", sets: 3, reps: "10-12", rest: "60 sec" },
        { name: "Superman Hold", category: "accessory", sets: 3, reps: "10-12", rest: "45 sec" },
        { name: "Hollow Hold", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
    ],
    general_fitness: [
      [
        { name: "Squat", category: "primary", sets: 3, reps: "15", rest: "60 sec" },
        { name: "Reverse Lunge", category: "primary", sets: 3, reps: "12 each", rest: "60 sec" },
        { name: "Glute Bridge", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Dip or Tricep Push-Up", category: "accessory", sets: 3, reps: "12", rest: "45 sec" },
      ],
      [
        { name: "Pull-Up or Inverted Row", category: "primary", sets: 3, reps: "8-10", rest: "60 sec" },
        { name: "Plank", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
    ],
    athletic: [
      [
        { name: "Squat Jump", category: "primary", sets: 5, reps: "5", rest: "2 min", notes: "Max effort" },
        { name: "Pistol Squat", category: "primary", sets: 4, reps: "5 each", rest: "90 sec" },
        { name: "Single-Leg Hip Thrust", category: "accessory", sets: 3, reps: "10 each", rest: "60 sec" },
        { name: "Lateral Bound", category: "conditioning", sets: 4, reps: "5 each", rest: "90 sec" },
      ],
      [
        { name: "Explosive Push-Up", category: "primary", sets: 4, reps: "8", rest: "90 sec" },
        { name: "Pull-Up", category: "primary", sets: 4, reps: "6-8", rest: "90 sec" },
        { name: "Dip", category: "accessory", sets: 3, reps: "10", rest: "60 sec" },
        { name: "Med Ball Slam (or Plyo Push-Up)", category: "conditioning", sets: 3, reps: "8", rest: "90 sec" },
      ],
      [
        { name: "Broad Jump", category: "primary", sets: 4, reps: "5", rest: "2 min" },
        { name: "Nordic Curl", category: "primary", sets: 3, reps: "5-8", rest: "2 min" },
        { name: "Sprint Interval or Hill Sprint", category: "conditioning", sets: 5, reps: "10 sec", rest: "50 sec" },
        { name: "Burpee Broad Jump", category: "conditioning", sets: 3, reps: "8", rest: "90 sec" },
      ],
    ],
  },
  minimal: {
    strength: [
      [
        { name: "Resistance Band Squat", category: "primary", sets: 4, reps: "10-12", rest: "90 sec" },
        { name: "Resistance Band Romanian Deadlift", category: "primary", sets: 3, reps: "10-12", rest: "90 sec" },
        { name: "Reverse Lunge", category: "accessory", sets: 3, reps: "10 each", rest: "60 sec" },
      ],
      [
        { name: "Push-Up (weighted or elevated)", category: "primary", sets: 4, reps: "10-12", rest: "90 sec" },
        { name: "Resistance Band Press", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Band Lateral Raise", category: "finisher", sets: 3, reps: "15", rest: "45 sec" },
      ],
      [
        { name: "Pull-Up or Band Pull-Apart", category: "primary", sets: 4, reps: "8-12", rest: "90 sec" },
        { name: "Resistance Band Row", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Band Bicep Curl", category: "finisher", sets: 3, reps: "15", rest: "45 sec" },
      ],
    ],
    hypertrophy: [
      [
        { name: "Band Squat", category: "primary", sets: 4, reps: "15-20", rest: "60 sec" },
        { name: "Band Romanian Deadlift", category: "primary", sets: 4, reps: "15-20", rest: "60 sec" },
        { name: "Glute Bridge with Band", category: "accessory", sets: 3, reps: "20-25", rest: "45 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 4, reps: "15-20", rest: "60 sec" },
        { name: "Band Chest Press", category: "primary", sets: 3, reps: "15-20", rest: "60 sec" },
        { name: "Band Tricep Extension", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Band Row", category: "primary", sets: 4, reps: "15-20", rest: "60 sec" },
        { name: "Band Lat Pulldown", category: "primary", sets: 3, reps: "15-20", rest: "60 sec" },
        { name: "Band Curl", category: "finisher", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
    ],
    fat_loss: [
      [
        { name: "Band Squat", category: "primary", sets: 4, reps: "20", rest: "45 sec" },
        { name: "Reverse Lunge", category: "accessory", sets: 3, reps: "15 each", rest: "45 sec" },
        { name: "Mountain Climber", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 4, reps: "15-20", rest: "45 sec" },
        { name: "Band Press", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
        { name: "Plank", category: "finisher", sets: 3, reps: "30 sec", rest: "30 sec" },
      ],
      [
        { name: "Band Row", category: "primary", sets: 4, reps: "15-20", rest: "45 sec" },
        { name: "Band Curl", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
        { name: "Hollow Hold", category: "finisher", sets: 3, reps: "20-30 sec", rest: "30 sec" },
      ],
    ],
    general_fitness: [
      [
        { name: "Band Squat", category: "primary", sets: 3, reps: "15", rest: "60 sec" },
        { name: "Glute Bridge", category: "accessory", sets: 3, reps: "15-20", rest: "45 sec" },
      ],
      [
        { name: "Push-Up", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Band Shoulder Press", category: "accessory", sets: 3, reps: "12-15", rest: "45 sec" },
      ],
      [
        { name: "Band Row", category: "primary", sets: 3, reps: "12-15", rest: "60 sec" },
        { name: "Band Curl", category: "finisher", sets: 3, reps: "15", rest: "45 sec" },
      ],
    ],
    athletic: [
      [
        { name: "Squat Jump", category: "primary", sets: 5, reps: "5", rest: "2 min" },
        { name: "Band Squat", category: "accessory", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Lateral Bound", category: "conditioning", sets: 4, reps: "5 each", rest: "90 sec" },
      ],
      [
        { name: "Explosive Push-Up", category: "primary", sets: 4, reps: "8", rest: "90 sec" },
        { name: "Band Row", category: "accessory", sets: 3, reps: "12", rest: "60 sec" },
        { name: "Burpee", category: "conditioning", sets: 3, reps: "10", rest: "60 sec" },
      ],
      [
        { name: "Broad Jump", category: "primary", sets: 4, reps: "5", rest: "2 min" },
        { name: "Sprint Interval", category: "conditioning", sets: 5, reps: "10 sec", rest: "50 sec" },
      ],
    ],
  },
};

// ─── Session Template Builder ────────────────────────────────────────────────

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const splitMaps: Record<number, { label: string; sessionType: "lifting" | "conditioning" | "mobility" | "recovery" | "rest"; coachSessionType: SessionType; emphasis: string; dayOfWeek: number }[]> = {
  2: [
    { label: "Full Body A", sessionType: "lifting", coachSessionType: "full_body_a", emphasis: "Squat, horizontal push, horizontal pull", dayOfWeek: 1 },
    { label: "Full Body B", sessionType: "lifting", coachSessionType: "full_body_b", emphasis: "Hinge, vertical pull, vertical push", dayOfWeek: 4 },
  ],
  3: [
    { label: "Lower Body", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Squat & hinge patterns — full posterior chain", dayOfWeek: 1 },
    { label: "Upper Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press with shoulder stability", dayOfWeek: 3 },
    { label: "Upper Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Vertical & horizontal pull, arm accessory", dayOfWeek: 5 },
  ],
  4: [
    { label: "Lower A — Squat Focus", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Quad-dominant squat patterns, hinge accessory", dayOfWeek: 1 },
    { label: "Upper A — Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press, shoulder stability", dayOfWeek: 2 },
    { label: "Lower B — Hinge Focus", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Hinge-dominant, posterior chain, unilateral legs", dayOfWeek: 4 },
    { label: "Upper B — Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Vertical & horizontal pull, arm accessory", dayOfWeek: 5 },
  ],
  5: [
    { label: "Lower A — Squat Focus", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Quad-dominant movements", dayOfWeek: 1 },
    { label: "Upper A — Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press", dayOfWeek: 2 },
    { label: "Lower B — Hinge Focus", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Posterior chain & hinge patterns", dayOfWeek: 3 },
    { label: "Upper B — Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Rows, pull-ups, and arm work", dayOfWeek: 4 },
    { label: "Full Body Power / Conditioning", sessionType: "lifting", coachSessionType: "conditioning", emphasis: "Power, speed, and work capacity", dayOfWeek: 6 },
  ],
  6: [
    { label: "Push A", sessionType: "lifting", coachSessionType: "push", emphasis: "Chest, front delts, triceps", dayOfWeek: 1 },
    { label: "Pull A", sessionType: "lifting", coachSessionType: "pull", emphasis: "Back, rear delts, biceps", dayOfWeek: 2 },
    { label: "Legs A", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Squat-dominant lower body", dayOfWeek: 3 },
    { label: "Push B", sessionType: "lifting", coachSessionType: "push", emphasis: "Incline, overhead, triceps", dayOfWeek: 4 },
    { label: "Pull B", sessionType: "lifting", coachSessionType: "pull", emphasis: "Deadlift, rows, biceps", dayOfWeek: 5 },
    { label: "Legs B", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Hinge-dominant lower body", dayOfWeek: 6 },
  ],
};

function buildPhaseConfig(goal: string, daysPerWeek: number): {
  phaseName: string;
  phaseGoal: string;
  emphasis: string;
  weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[];
} {
  const configs: Record<string, { phaseName: string; phaseGoal: string; emphasis: string; weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[] }> = {
    strength: {
      phaseName: "Foundation Strength Block",
      phaseGoal: "Build foundational strength across primary movement patterns",
      emphasis: "Progressive overload on compound lifts. Prioritize form and bar speed.",
      weekConfigs: [
        { label: "Week 1 — Introduction", focus: "Establish baseline loads and technique", volumeLevel: "moderate" },
        { label: "Week 2 — Build", focus: "Increase intensity, maintain bar speed", volumeLevel: "moderate" },
        { label: "Week 3 — Accumulation", focus: "Push loads progressively across all main lifts", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Reduce volume, prime CNS for next block", volumeLevel: "deload" },
      ],
    },
    hypertrophy: {
      phaseName: "Hypertrophy Accumulation Block",
      phaseGoal: "Maximize muscle growth through volume and metabolic stress",
      emphasis: "High volume, moderate intensity. Prioritize mind-muscle connection and range of motion.",
      weekConfigs: [
        { label: "Week 1 — Base Volume", focus: "Establish training volume and movement quality", volumeLevel: "moderate" },
        { label: "Week 2 — Volume Build", focus: "Add sets and intensification techniques", volumeLevel: "moderate" },
        { label: "Week 3 — Peak Volume", focus: "Maximum training stimulus before deload", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Recover and consolidate muscle adaptations", volumeLevel: "deload" },
      ],
    },
    fat_loss: {
      phaseName: "Fat Loss & Conditioning Block",
      phaseGoal: "Maintain lean muscle while creating a training-driven caloric deficit",
      emphasis: "Higher rep ranges, shorter rest periods, superset-friendly structure.",
      weekConfigs: [
        { label: "Week 1 — Adaptation", focus: "Build work capacity and movement patterns", volumeLevel: "moderate" },
        { label: "Week 2 — Progression", focus: "Increase density and intensity", volumeLevel: "high" },
        { label: "Week 3 — Peak Intensity", focus: "Maximum conditioning stimulus", volumeLevel: "high" },
        { label: "Week 4 — Active Recovery", focus: "Lower intensity, maintain movement quality", volumeLevel: "low" },
      ],
    },
    athletic: {
      phaseName: "Athletic Foundation Block",
      phaseGoal: "Build power, speed, and multi-directional athleticism",
      emphasis: "Explosive movements, sport-specific patterns, power development.",
      weekConfigs: [
        { label: "Week 1 — Technical Foundation", focus: "Movement quality and power mechanics", volumeLevel: "moderate" },
        { label: "Week 2 — Power Build", focus: "Increase explosive loading", volumeLevel: "moderate" },
        { label: "Week 3 — Power Peak", focus: "Peak power output and speed", volumeLevel: "high" },
        { label: "Week 4 — Taper", focus: "Maintain sharpness, reduce fatigue", volumeLevel: "low" },
      ],
    },
    endurance: {
      phaseName: "Aerobic Base Block",
      phaseGoal: "Build aerobic capacity and work capacity across energy systems",
      emphasis: "Zone 2 work, tempo efforts, and supporting strength work.",
      weekConfigs: [
        { label: "Week 1 — Aerobic Introduction", focus: "Establish aerobic base", volumeLevel: "moderate" },
        { label: "Week 2 — Volume Build", focus: "Extend training duration and frequency", volumeLevel: "moderate" },
        { label: "Week 3 — Intensification", focus: "Add tempo work and threshold efforts", volumeLevel: "high" },
        { label: "Week 4 — Recovery", focus: "Reduce load, consolidate aerobic adaptations", volumeLevel: "low" },
      ],
    },
    general_fitness: {
      phaseName: "General Fitness Foundation Block",
      phaseGoal: "Build all-around fitness, movement quality, and consistent training habits",
      emphasis: "Balanced strength, conditioning, and mobility work.",
      weekConfigs: [
        { label: "Week 1 — Foundation", focus: "Establish movement patterns and baseline fitness", volumeLevel: "moderate" },
        { label: "Week 2 — Progression", focus: "Build work capacity and confidence", volumeLevel: "moderate" },
        { label: "Week 3 — Accumulation", focus: "Peak training volume for the block", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Active recovery and consolidation", volumeLevel: "deload" },
      ],
    },
  };

  return configs[goal] ?? configs.general_fitness;
}

function getSystemName(goal: string, style: string): string {
  const goalLabel: Record<string, string> = {
    strength: "Strength",
    hypertrophy: "Hypertrophy",
    fat_loss: "Fat Loss",
    athletic: "Athletic Performance",
    endurance: "Endurance",
    general_fitness: "General Fitness",
  };
  return `${goalLabel[goal] ?? "Training"} System`;
}

function getWarmupNotes(sessionType: string, emphasis: string): string {
  if (sessionType === "rest") return "";
  if (emphasis.toLowerCase().includes("squat") || emphasis.toLowerCase().includes("lower") || emphasis.toLowerCase().includes("leg")) {
    return "5 min: hip circles, leg swings, bodyweight squats, glute bridges × 10, band walks × 10 each direction";
  }
  if (emphasis.toLowerCase().includes("push") || emphasis.toLowerCase().includes("press") || emphasis.toLowerCase().includes("chest")) {
    return "5 min: shoulder circles, band pull-aparts × 15, wall slides × 10, light band press × 15";
  }
  if (emphasis.toLowerCase().includes("pull") || emphasis.toLowerCase().includes("row") || emphasis.toLowerCase().includes("back")) {
    return "5 min: thoracic rotation, band pull-aparts × 15, face pulls × 15, dead hang or scapular pulls × 10";
  }
  return "5 min: dynamic stretching, joint circles, activation movements for primary muscle groups";
}

function getCoachingNotes(goal: string, weekIndex: number, dayLabel: string): string {
  if (goal === "strength") {
    if (weekIndex === 3) return "Deload week — reduce all weights by 40-50%. Focus on perfect technique and recovery.";
    return `Log your weights for every set. Progressive overload is the primary driver here — even adding 2.5kg to a main lift is a win.`;
  }
  if (goal === "hypertrophy") {
    return `Leave 1-2 reps in reserve (RIR) on working sets. Slow eccentrics (2-3s down) will increase time under tension.`;
  }
  if (goal === "fat_loss") {
    return `Rest periods are part of the stimulus — keep them tight. Aim for controlled breathing and consistent pace.`;
  }
  if (goal === "athletic") {
    return `Quality over quantity on power work. CNS fatigue is real — rest fully between explosive efforts.`;
  }
  return `Focus on execution quality. Record any weights used so you can track progress week-to-week.`;
}

// ─── Main Service Functions ───────────────────────────────────────────────────

export async function getActiveTrainingSystem(userId: number) {
  const [system] = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

  return system ?? null;
}

export async function getFullTrainingSystem(systemId: number) {
  const [system] = await db
    .select()
    .from(trainingSystems)
    .where(eq(trainingSystems.id, systemId));

  if (!system) return null;

  const phases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, systemId))
    .orderBy(trainingPhases.orderIndex);

  const phasesWithContent = await Promise.all(
    phases.map(async (phase) => {
      const weeks = await db
        .select()
        .from(trainingWeeks)
        .where(eq(trainingWeeks.trainingPhaseId, phase.id))
        .orderBy(trainingWeeks.orderIndex);

      const weeksWithContent = await Promise.all(
        weeks.map(async (week) => {
          const sessions = await db
            .select()
            .from(trainingSessions)
            .where(eq(trainingSessions.trainingWeekId, week.id))
            .orderBy(trainingSessions.orderIndex);

          const sessionsWithExercises = await Promise.all(
            sessions.map(async (session) => {
              const exercises = await db
                .select()
                .from(sessionExercises)
                .where(eq(sessionExercises.trainingSessionId, session.id))
                .orderBy(sessionExercises.orderIndex);
              return { ...session, exercises };
            })
          );

          return { ...week, sessions: sessionsWithExercises };
        })
      );

      return { ...phase, weeks: weeksWithContent };
    })
  );

  return { ...system, phases: phasesWithContent };
}

export async function getTodaySession(userId: number) {
  const system = await getActiveTrainingSystem(userId);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  const [currentWeek] = await db
    .select()
    .from(trainingWeeks)
    .where(and(eq(trainingWeeks.trainingPhaseId, currentPhase.id), eq(trainingWeeks.status, "current")));

  if (!currentWeek) return null;

  const dayOfWeek = new Date().getDay();

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.trainingWeekId, currentWeek.id))
    .orderBy(trainingSessions.orderIndex);

  const todaySession = sessions.find((s) => s.dayOfWeek === dayOfWeek) ?? sessions[0] ?? null;

  if (!todaySession) return null;

  const exercises = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.trainingSessionId, todaySession.id))
    .orderBy(sessionExercises.orderIndex);

  return { ...todaySession, exercises, currentWeek, currentPhase };
}

export async function getCurrentWeek(userId: number) {
  const system = await getActiveTrainingSystem(userId);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  const [currentWeek] = await db
    .select()
    .from(trainingWeeks)
    .where(and(eq(trainingWeeks.trainingPhaseId, currentPhase.id), eq(trainingWeeks.status, "current")));

  if (!currentWeek) return null;

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.trainingWeekId, currentWeek.id))
    .orderBy(trainingSessions.orderIndex);

  const sessionsWithExercises = await Promise.all(
    sessions.map(async (session) => {
      const exercises = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.trainingSessionId, session.id))
        .orderBy(sessionExercises.orderIndex);
      return { ...session, exercises };
    })
  );

  return { ...currentWeek, sessions: sessionsWithExercises, phase: currentPhase };
}

export async function getBlockSummary(userId: number) {
  const system = await getActiveTrainingSystem(userId);
  if (!system) return null;

  const phases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, system.id))
    .orderBy(trainingPhases.orderIndex);

  const currentPhase = phases.find((p) => p.status === "current") ?? phases[0] ?? null;

  let currentWeekNum = 1;
  if (currentPhase) {
    const weeks = await db
      .select()
      .from(trainingWeeks)
      .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
      .orderBy(trainingWeeks.orderIndex);

    const cw = weeks.find((w) => w.status === "current");
    if (cw) currentWeekNum = cw.weekNumber;
  }

  return { system, phases, currentPhase, currentWeekNumber: currentWeekNum };
}

export async function initializeTrainingSystem(userId: number): Promise<typeof trainingSystems.$inferSelect> {
  const [existingSystem] = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

  if (existingSystem) return existingSystem;

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const goal = profile ? normalizeGoal(profile.trainingGoal) : "general_fitness";
  const equipment = profile ? normalizeEquipment(profile.equipmentAccess) : "full_gym";
  const daysPerWeek = profile?.daysPerWeek ?? 3;
  const trainingStyle = profile?.trainingStyle ?? "balanced";
  const experience = profile ? normalizeExperience(profile.experienceLevel ?? "intermediate") : "intermediate";
  const injuryFlags = detectInjuryFlags(profile?.injuries ?? null);

  // Map local normalised goal/equipment to coach-select types
  const coachGoal: CoachGoalType =
    goal === "athletic" ? "athletic_performance" :
    (goal as CoachGoalType);
  const coachEquipment: CoachEquipmentLevel =
    equipment === "dumbbells" ? "dumbbells_only" :
    equipment === "minimal" ? "home_limited" :
    (equipment as CoachEquipmentLevel);

  const phaseConfig = buildPhaseConfig(goal, daysPerWeek);
  const systemName = getSystemName(goal, trainingStyle);

  const [system] = await db.insert(trainingSystems).values({
    userId,
    name: systemName,
    overarchingGoal: profile?.trainingGoal ?? "Build fitness and improve health",
    trainingStyle: profile?.trainingStyle ?? "Balanced strength and conditioning",
    weeklyFrequency: daysPerWeek,
    equipmentAccess: profile?.equipmentAccess ?? "Full gym",
    constraints: profile?.injuries ?? null,
    status: "active",
  }).returning();

  const [phase] = await db.insert(trainingPhases).values({
    trainingSystemId: system.id,
    name: phaseConfig.phaseName,
    goal: phaseConfig.phaseGoal,
    emphasis: phaseConfig.emphasis,
    weekCount: 4,
    orderIndex: 0,
    status: "current",
    notes: null,
  }).returning();

  await db.update(trainingSystems).set({ currentPhaseId: phase.id }).where(eq(trainingSystems.id, system.id));

  const splitDays = splitMaps[Math.min(daysPerWeek, 6)] ?? splitMaps[3];

  for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
    const weekConfig = phaseConfig.weekConfigs[weekIdx];
    const weekNumber = weekIdx + 1;
    const isDeload = weekConfig.volumeLevel === "deload";

    const [week] = await db.insert(trainingWeeks).values({
      trainingPhaseId: phase.id,
      weekNumber,
      label: weekConfig.label,
      focus: weekConfig.focus,
      volumeLevel: weekConfig.volumeLevel,
      status: weekIdx === 0 ? "current" : "upcoming",
      orderIndex: weekIdx,
    }).returning();

    for (let sessionIdx = 0; sessionIdx < splitDays.length; sessionIdx++) {
      const splitDay = splitDays[sessionIdx];

      const [session] = await db.insert(trainingSessions).values({
        trainingWeekId: week.id,
        label: splitDay.label,
        sessionType: splitDay.sessionType,
        dayOfWeek: splitDay.dayOfWeek,
        emphasis: splitDay.emphasis,
        warmupNotes: getWarmupNotes(splitDay.sessionType, splitDay.emphasis),
        coachingNotes: getCoachingNotes(goal, weekIdx, splitDay.label),
        isRestDay: false,
        orderIndex: sessionIdx,
      }).returning();

      // ── Intelligent coach selection from the 620-exercise DB ──
      // Each week gets the correct week-number scaling (volume, intensity, deload).
      // The coach engine applies NSCA hierarchy, goal-matched prescriptions,
      // equipment filtering, and injury-aware selection automatically.
      const coachExercises = await selectSessionExercises({
        sessionType: splitDay.coachSessionType,
        goal: coachGoal,
        experience: experience as CoachExperienceTier,
        equipment: coachEquipment,
        injuryFlags: injuryFlags.map(String),
        weekNumber: isDeload ? 4 : weekNumber,
      });

      // Deload: keep only the first 60% of exercises (primary + one secondary)
      const exercisesToInsert = isDeload
        ? coachExercises.slice(0, Math.max(Math.ceil(coachExercises.length * 0.6), 2))
        : coachExercises;

      for (let exIdx = 0; exIdx < exercisesToInsert.length; exIdx++) {
        const ex = exercisesToInsert[exIdx];

        // Map CoachExercise role to the DB's category enum
        const category: ExerciseTemplate["category"] =
          ex.role === "explosive" ? "warmup" :
          ex.role === "primary"   ? "primary" :
          ex.role === "secondary" ? "accessory" :
          ex.role === "conditioning" ? "conditioning" :
          "accessory";

        await db.insert(sessionExercises).values({
          trainingSessionId: session.id,
          name: ex.name,
          category,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest,
          tempo: null,
          notes: ex.notes,
          orderIndex: exIdx,
        });
      }
    }
  }

  return system;
}
