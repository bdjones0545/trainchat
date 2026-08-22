import { describe, expect, it } from "vitest";
import {
  changedProgramConstraints,
  coachSettingsSchema,
  profileSettingsSchema,
} from "../profile-settings";

const validProfile = {
  trainingGoal: "strength",
  experienceLevel: "intermediate",
  trainingStyle: "general_strength",
  daysPerWeek: 4,
  sessionDuration: 60,
  equipmentAccess: "full gym",
  injuries: null,
  sportFocus: null,
};

const validCoachSettings = {
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

describe("canonical profile validation", () => {
  it("accepts the supported product values", () => {
    expect(profileSettingsSchema.safeParse(validProfile).success).toBe(true);
  });

  it.each([
    ["trainingGoal", "bulk_at_all_costs"],
    ["experienceLevel", "wizard"],
    ["trainingStyle", "unknown"],
    ["daysPerWeek", 7],
    ["sessionDuration", 42],
  ])("rejects unsupported %s", (field, value) => {
    expect(profileSettingsSchema.safeParse({ ...validProfile, [field]: value }).success).toBe(false);
  });

  it("rejects unknown stale-client fields", () => {
    expect(profileSettingsSchema.safeParse({ ...validProfile, hiddenMode: true }).success).toBe(false);
  });
});

describe("program freshness after profile changes", () => {
  it.each([
    ["trainingGoal", "endurance", "training_goal"],
    ["daysPerWeek", 3, "training_frequency"],
    ["equipmentAccess", "dumbbells only", "equipment_access"],
    ["injuries", "active knee pain", "injury_or_pain_constraint"],
    ["exercisesToAvoid", "back squat", "exercise_exclusions"],
  ])("marks a %s change as review-requiring", (field, value, reason) => {
    const before = { ...validProfile, exercisesToAvoid: null };
    const after = { ...before, [field]: value };
    expect(changedProgramConstraints(before, after)).toContain(reason);
  });

  it("does not stale a program for non-conflicting profile changes", () => {
    const before = { ...validProfile, exercisesToAvoid: null };
    const after = { ...before, experienceLevel: "advanced", trainingStyle: "hybrid", sportFocus: "golf" };
    expect(changedProgramConstraints(before, after)).toEqual([]);
  });
});

describe("persisted coaching settings contract", () => {
  it("round-trips the complete cross-device settings object", () => {
    expect(coachSettingsSchema.parse(validCoachSettings)).toEqual(validCoachSettings);
  });

  it("rejects partial or unsupported coaching settings", () => {
    expect(coachSettingsSchema.safeParse({ ...validCoachSettings, coachingStyle: "drill_sergeant" }).success).toBe(false);
    expect(coachSettingsSchema.safeParse({ coachingStyle: "supportive" }).success).toBe(false);
  });
});
