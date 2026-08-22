import { z } from "zod";
import type { CoachBehaviorSettings } from "./agent-settings-resolver";

export const TRAINING_GOALS = ["muscle_gain", "fat_loss", "strength", "endurance", "general_fitness", "sport_performance"] as const;
export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "elite"] as const;
export const TRAINING_STYLES = ["bodybuilding", "powerlifting", "crossfit", "calisthenics", "general_strength", "cardio", "hybrid"] as const;
export const DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;
export const SESSION_DURATIONS = [30, 45, 60, 75, 90] as const;

const boundedOptionalText = z.string().trim().max(1000).nullable().optional();

export const profileSettingsSchema = z.object({
  trainingGoal: z.enum(TRAINING_GOALS),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  trainingStyle: z.enum(TRAINING_STYLES),
  daysPerWeek: z.number().int().refine((v) => (DAYS_PER_WEEK as readonly number[]).includes(v), "must be one of 2, 3, 4, 5, 6"),
  sessionDuration: z.number().int().refine((v) => (SESSION_DURATIONS as readonly number[]).includes(v), "must be one of 30, 45, 60, 75, 90"),
  equipmentAccess: z.string().trim().min(1).max(1000),
  injuries: boundedOptionalText,
  sportFocus: boundedOptionalText,
  exercisePreferences: boundedOptionalText,
  exercisesToAvoid: boundedOptionalText,
}).strict();

/**
 * Calibration writes only a subset of the full profile, but every field it
 * persists must still obey the exact same product contract as Settings.
 */
export const calibrationProfileFieldsSchema = z.object({
  experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  primaryGoal: z.enum(TRAINING_GOALS).optional(),
  injuries: boundedOptionalText,
  equipmentAccess: z.string().trim().min(1).max(1000).optional(),
  daysPerWeek: z.number().int().refine((v) => (DAYS_PER_WEEK as readonly number[]).includes(v), "must be one of 2, 3, 4, 5, 6").optional(),
  sessionDuration: z.number().int().refine((v) => (SESSION_DURATIONS as readonly number[]).includes(v), "must be one of 30, 45, 60, 75, 90").optional(),
  sportFocus: boundedOptionalText,
  exercisesToAvoid: boundedOptionalText,
}).strict();

export const coachSettingsSchema = z.object({
  conciseResponses: z.boolean(),
  proactiveInsights: z.boolean(),
  autoAdjustRecommendations: z.boolean(),
  memoryPersonalization: z.boolean(),
  coachingStyle: z.enum(["direct", "supportive", "analytical"]),
  explanationDepth: z.enum(["minimal", "balanced", "detailed"]),
  trainingAggression: z.enum(["conservative", "balanced", "aggressive", "competition"]),
  requireApprovalStructural: z.boolean(),
  requireApprovalDeload: z.boolean(),
  adaptFromReadiness: z.boolean(),
  adaptFromMissedSessions: z.boolean(),
}).strict();

export const DEFAULT_COACH_SETTINGS: CoachBehaviorSettings = {
  conciseResponses: false,
  proactiveInsights: true,
  autoAdjustRecommendations: true,
  memoryPersonalization: true,
  coachingStyle: "supportive",
  explanationDepth: "balanced",
  trainingAggression: "balanced",
  requireApprovalStructural: false,
  requireApprovalDeload: false,
  adaptFromReadiness: true,
  adaptFromMissedSessions: true,
};

export type ProfileConstraintSnapshot = {
  trainingGoal: string;
  daysPerWeek: number;
  equipmentAccess: string;
  injuries: string | null;
  exercisesToAvoid: string | null;
};

export function changedProgramConstraints(before: ProfileConstraintSnapshot, after: ProfileConstraintSnapshot): string[] {
  const changed: string[] = [];
  if (before.trainingGoal !== after.trainingGoal) changed.push("training_goal");
  if (before.daysPerWeek !== after.daysPerWeek) changed.push("training_frequency");
  if (before.equipmentAccess.trim().toLowerCase() !== after.equipmentAccess.trim().toLowerCase()) changed.push("equipment_access");
  if ((before.injuries ?? "").trim().toLowerCase() !== (after.injuries ?? "").trim().toLowerCase()) changed.push("injury_or_pain_constraint");
  if ((before.exercisesToAvoid ?? "").trim().toLowerCase() !== (after.exercisesToAvoid ?? "").trim().toLowerCase()) changed.push("exercise_exclusions");
  return changed;
}
