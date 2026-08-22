import { describe, expect, it } from "vitest";
import type { ProgramStructure } from "../ai";
import { validateProgramAgainstConstraints } from "../ai";
import { resolveGenerationAttempts } from "../generation-safety";
import {
  repairProgramEquipmentConstraints,
  validateProgramEquipmentConstraints,
} from "../program-equipment-safety";
import type { ExtractedConstraints } from "../intent";
import { validatePainConstraints } from "../constraint-memory";
import { classifyConversationOutcome } from "../../services/conversation-execution-service";

function program(names: string[]): ProgramStructure {
  return {
    programName: "Constraint-safe fallback",
    description: "A strength program for the configured equipment.",
    progressionStrategy: "Add reps before load.",
    splitType: "full_body",
    days: [{
      dayNumber: 1,
      name: "Day 1",
      focus: "Strength",
      exercises: names.map((name) => ({
        name,
        classification: "Primary",
        sets: 3,
        reps: "8",
        rest: "90 sec",
        intent: "Build strength safely.",
        notes: "Use controlled technique.",
      })),
      notes: "Stop if pain occurs.",
    }],
  };
}

const constraints = (equipment: string): ExtractedConstraints => ({
  sportFocus: null,
  primaryGoal: "strength",
  daysPerWeek: 1,
  sessionDuration: null,
  equipment,
  experienceLevel: null,
  trainingBias: null,
  limitations: null,
  locationContext: null,
  seasonContext: null,
  gameFrequencyPerWeek: null,
  practiceFrequencyPerWeek: null,
  userAge: null,
  isOlderAdult: false,
});

describe("deterministic fallback equipment boundary", () => {
  it("accepts dumbbell-compatible selections", () => {
    expect(validateProgramEquipmentConstraints(program([
      "Goblet Squat",
      "Dumbbell Romanian Deadlift",
      "Dumbbell Floor Press",
      "Dead Bug",
    ]), "only dumbbells")).toEqual([]);
  });

  it.each([
    "Back Squat",
    "Conventional Deadlift",
    "Barbell Bench Press",
    "Band-Assisted Pull-Up",
    "Cable Row",
    "Leg Press",
    "Kettlebell Swing",
    "Medicine Ball Slam",
    "Dumbbell Bench Press",
    "Bulgarian Split Squat",
    "Step-Up",
    "Dead Hang",
  ])("rejects %s for dumbbells only", (name) => {
    expect(validateProgramEquipmentConstraints(program([name]), "only dumbbells"))
      .toEqual([expect.objectContaining({ exerciseName: name, equipmentLevel: "dumbbells_only" })]);
  });

  it("enforces representative existing home and bodyweight modes", () => {
    expect(validateProgramEquipmentConstraints(program(["Goblet Squat", "Band Pull-Apart"]), "home gym"))
      .toEqual([]);
    expect(validateProgramEquipmentConstraints(program(["Back Squat"]), "home gym")).toHaveLength(1);
    expect(validateProgramEquipmentConstraints(program(["Push-Up", "Dead Bug"]), "bodyweight")).toEqual([]);
    expect(validateProgramEquipmentConstraints(program(["Dumbbell Romanian Deadlift"]), "bodyweight")).toHaveLength(1);
  });

  it("fails closed for unknown non-prep exercises under a restricted mode", () => {
    expect(validateProgramEquipmentConstraints(program(["Imaginary Quantum Rack Pull"]), "only dumbbells"))
      .toEqual([expect.objectContaining({ exerciseName: "Imaginary Quantum Rack Pull" })]);
  });

  it("routes equipment issues through the canonical extracted-constraint validator", () => {
    expect(validateProgramAgainstConstraints(program(["Back Squat"]), constraints("only dumbbells")))
      .toContainEqual(expect.objectContaining({ field: "equipment" }));
  });

  it("re-selects incompatible deterministic choices from the canonical catalogue", () => {
    const repaired = repairProgramEquipmentConstraints(program([
      "Back Squat",
      "Conventional Deadlift",
      "Band-Assisted Pull-Up",
    ]), "only dumbbells");
    expect(repaired).not.toBeNull();
    expect(validateProgramEquipmentConstraints(repaired!, "only dumbbells")).toEqual([]);
    expect(repaired!.days[0].exercises.map((exercise) => exercise.name)).not.toEqual([
      "Back Squat",
      "Conventional Deadlift",
      "Band-Assisted Pull-Up",
    ]);
  });

  it("rejects invalid provider attempts and an invalid fallback without returning an artifact", () => {
    const candidate = program(["Back Squat"]);
    const equipmentIssues = validateProgramEquipmentConstraints(candidate, "only dumbbells");
    expect(resolveGenerationAttempts([
      { value: candidate, schemaIssues: [], constraintIssues: [], hardConstraintIssues: equipmentIssues, criticalPainIssues: [] },
      { value: candidate, schemaIssues: [], constraintIssues: [], hardConstraintIssues: equipmentIssues, criticalPainIssues: [] },
      { value: candidate, schemaIssues: [], constraintIssues: [], hardConstraintIssues: equipmentIssues, criticalPainIssues: [] },
    ])).toEqual({ accepted: false, attemptCount: 3, failureCategory: "exhausted_retry" });
  });

  it("keeps fallback artifacts inside the existing critical pain boundary", () => {
    const issues = validatePainConstraints(program(["Good Morning"]), {
      bannedItems: [],
      dislikedItems: [],
      painRegions: ["lower back"],
      monitorRegions: [],
      sport: null,
    });
    expect(issues).toContainEqual(expect.objectContaining({
      exerciseName: "Good Morning",
      painRegion: "lower back",
      severity: "critical",
    }));
  });

  it("classifies an impossible fallback as a non-chargeable terminal safety rejection", () => {
    expect(classifyConversationOutcome({
      outcomeType: "true_failure",
      failureCategory: "hard_constraint_violation",
      systemSaved: false,
    })).toEqual(expect.objectContaining({
      kind: "safety_rejection",
      category: "hard_constraint_violation",
      chargeQuota: false,
    }));
  });
});
