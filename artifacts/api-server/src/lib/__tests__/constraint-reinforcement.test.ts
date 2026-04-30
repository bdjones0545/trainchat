/**
 * Constraint Reinforcement — test suite
 *
 * Verifies the satisfied-constraint shortcut in buildExecutionPlan:
 * when the user restates a constraint that the active program already honors,
 * the planner must return a GUIDANCE + constraintReinforcement plan instead of
 * routing to APPLY_MUTATION and triggering a (pointless) mutation.
 *
 * Tests:
 *  1. Constraint already satisfied, already persisted → reinforcement plan, no mutation
 *  2. Constraint satisfied but NOT yet persisted → still reinforcement, alreadyPersisted=false
 *  3. Constraint NOT satisfied (item IS in program) → normal APPLY_MUTATION path
 *  4. No active program → normal APPLY_MUTATION path (no shortcut)
 *
 * Pure-function helpers:
 *  5. isConstraintAlreadySatisfied — positive, negative, fuzzy match
 *  6. isConstraintAlreadyPersisted — present, absent
 *  7. buildConstraintReinforcementDirective — no internal terms, names constraint, no question
 */

import { describe, it, expect } from "vitest";
import {
  isConstraintAlreadySatisfied,
  isConstraintAlreadyPersisted,
  buildConstraintReinforcementDirective,
  type HardConstraints,
} from "../constraint-memory";
import type { ProgramStructure } from "../ai";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHardConstraints(overrides: Partial<HardConstraints> = {}): HardConstraints {
  return {
    bannedItems: [],
    dislikedItems: [],
    painRegions: [],
    sport: null,
    ...overrides,
  };
}

function makeProgram(exerciseNames: string[]): ProgramStructure {
  return {
    programName: "Test Program",
    description: "Test",
    days: [
      {
        name: "Day 1",
        exercises: exerciseNames.map((name) => ({
          name,
          sets: 3,
          reps: "8-10",
          notes: "",
        })),
      },
    ],
  };
}

// ─── 1. isConstraintAlreadySatisfied ─────────────────────────────────────────

describe("isConstraintAlreadySatisfied", () => {
  it("returns true when banned item is absent from all exercises", () => {
    const program = makeProgram(["Back Squat", "Romanian Deadlift", "Pull-Up"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "belt squat", activeProgram: program })
    ).toBe(true);
  });

  it("returns false when the exercise appears verbatim", () => {
    const program = makeProgram(["Belt Squat", "Romanian Deadlift"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "belt squat", activeProgram: program })
    ).toBe(false);
  });

  it("returns false when the exercise appears as a substring (needle ⊆ hay)", () => {
    const program = makeProgram(["Belt Squat Machine", "Pull-Up"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "belt squat", activeProgram: program })
    ).toBe(false);
  });

  it("returns false when the label is a substring of the exercise name (hay ⊆ needle)", () => {
    // 'leg press' ⊆ 'leg press machine'
    const program = makeProgram(["Leg Press Machine", "Pull-Up"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "leg press machine", activeProgram: program })
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    const program = makeProgram(["BELT SQUAT", "Pull-Up"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "Belt Squat", activeProgram: program })
    ).toBe(false);
  });

  it("returns false for empty label", () => {
    const program = makeProgram(["Back Squat"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "", activeProgram: program })
    ).toBe(false);
  });

  it("handles hyphen/underscore normalization", () => {
    const program = makeProgram(["Back Squat", "Dumbbell Row"]);
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "belt-squat", activeProgram: program })
    ).toBe(true);
  });

  it("checks across all days and exercises", () => {
    const program: ProgramStructure = {
      programName: "Multi-day",
      description: "",
      days: [
        { name: "Day 1", exercises: [{ name: "Back Squat", sets: 3, reps: "5", notes: "" }] },
        { name: "Day 2", exercises: [{ name: "Belt Squat", sets: 3, reps: "8", notes: "" }] },
      ],
    };
    expect(
      isConstraintAlreadySatisfied({ constraintLabel: "belt squat", activeProgram: program })
    ).toBe(false);
  });
});

// ─── 2. isConstraintAlreadyPersisted ─────────────────────────────────────────

describe("isConstraintAlreadyPersisted", () => {
  it("returns true when label matches a bannedItem", () => {
    const hc = makeHardConstraints({ bannedItems: ["Belt Squat"] });
    expect(
      isConstraintAlreadyPersisted({ constraintLabel: "belt squat", hardConstraints: hc })
    ).toBe(true);
  });

  it("returns true when label matches a dislikedItem", () => {
    const hc = makeHardConstraints({ dislikedItems: ["Leg Press"] });
    expect(
      isConstraintAlreadyPersisted({ constraintLabel: "leg press", hardConstraints: hc })
    ).toBe(true);
  });

  it("returns false when constraint is not in memory at all", () => {
    const hc = makeHardConstraints({ bannedItems: ["Cable Machine"] });
    expect(
      isConstraintAlreadyPersisted({ constraintLabel: "belt squat", hardConstraints: hc })
    ).toBe(false);
  });

  it("is case-insensitive and handles substring matching", () => {
    const hc = makeHardConstraints({ bannedItems: ["Belt Squat Machine"] });
    expect(
      isConstraintAlreadyPersisted({ constraintLabel: "belt squat", hardConstraints: hc })
    ).toBe(true);
  });
});

// ─── 3. buildConstraintReinforcementDirective ─────────────────────────────────

describe("buildConstraintReinforcementDirective", () => {
  const directive = buildConstraintReinforcementDirective({
    constraintLabel: "belt squat",
    alreadyPersisted: true,
    intentFamily: "equipment_constraint",
  });

  it("names the constraint explicitly", () => {
    expect(directive.toLowerCase()).toContain("belt squat");
  });

  it("instructs the AI NOT to ask a question", () => {
    expect(directive).toContain("DO NOT ask for clarification");
    expect(directive).toContain("DO NOT ask a question");
    expect(directive).toContain("DO NOT trigger a program rebuild");
    expect(directive).toContain("DO NOT modify anything");
  });

  it("confirms compliance with the current program", () => {
    expect(directive.toLowerCase()).toContain("already");
  });

  it("does not contain prohibited internal terms", () => {
    const prohibited = ["hardConstraints", "intentFamily", "transformHint", "banned", "disliked"];
    for (const term of prohibited) {
      expect(directive).not.toContain(term);
    }
  });

  it("signals alreadyPersisted=true correctly", () => {
    expect(directive.toLowerCase()).toContain("already have that noted");
  });

  it("signals alreadyPersisted=false correctly", () => {
    const d = buildConstraintReinforcementDirective({
      constraintLabel: "leg press",
      alreadyPersisted: false,
      intentFamily: "exercise_dislike_or_preference",
    });
    expect(d.toLowerCase()).toContain("added that to your preferences");
  });
});

// ─── 4. buildExecutionPlan — constraint reinforcement routing ─────────────────

describe("buildExecutionPlan — constraint reinforcement shortcut", () => {
  it("routes to GUIDANCE + constraintReinforcement when belt squat already absent from program", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    // Program has no belt squat; hardConstraints has it as banned
    const program = makeProgram(["Back Squat", "Romanian Deadlift", "Pull-Up", "Dumbbell Row"]);
    const hardConstraints = makeHardConstraints({ bannedItems: ["belt squat"] });

    const plan = await buildExecutionPlan({
      message: "No belt squat, I don't have one",
      userId: "test-user",
      conversationId: "test-conv",
      program,
      pendingClarification: null,
      hardConstraints,
    });

    expect(plan.action).toBe("GUIDANCE");
    expect(plan.constraintReinforcement).toBeDefined();
    expect(plan.constraintReinforcement?.constraintLabel).toMatch(/belt squat/i);
    expect(plan.constraintReinforcement?.alreadyPersisted).toBe(true);
    expect(plan.constraintReinforcement?.promptDirective).toContain("DO NOT ask for clarification");
    expect(plan.mutation).toBeUndefined();
  });

  it("constraint satisfied but NOT yet persisted → still reinforcement, alreadyPersisted=false", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    const program = makeProgram(["Back Squat", "Romanian Deadlift"]);
    // hardConstraints has nothing about belt squat → not persisted yet
    const hardConstraints = makeHardConstraints({});

    const plan = await buildExecutionPlan({
      // "no belt squat" matches the equipment_constraint pattern in the classifier
      message: "no belt squat I don't have one",
      userId: "test-user",
      conversationId: "test-conv",
      program,
      pendingClarification: null,
      hardConstraints,
    });

    expect(plan.action).toBe("GUIDANCE");
    expect(plan.constraintReinforcement).toBeDefined();
    expect(plan.constraintReinforcement?.alreadyPersisted).toBe(false);
    expect(plan.constraintReinforcement?.promptDirective).toContain("added that to your preferences");
  });

  it("constraint NOT satisfied (item IS in program) → normal APPLY_MUTATION, no reinforcement", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    // Belt squat IS in the program — needs mutation
    const program = makeProgram(["Belt Squat", "Romanian Deadlift", "Pull-Up"]);
    const hardConstraints = makeHardConstraints({});

    const plan = await buildExecutionPlan({
      // "no belt squat" matches equipment_constraint — but belt squat IS in the program
      // so isConstraintAlreadySatisfied returns false → shortcut does NOT fire
      // (avoid adding stray equipment words like "machine" that the extractor may grab first)
      message: "no belt squat, can't do it",
      userId: "test-user",
      conversationId: "test-conv",
      program,
      pendingClarification: null,
      hardConstraints,
    });

    // Shortcut should not fire (item is present) → no reinforcement plan
    expect(plan.constraintReinforcement).toBeUndefined();
    // Normal isMutationFamily routing takes over
    expect(plan.action).toBe("APPLY_MUTATION");
  });

  it("no active program → normal APPLY_MUTATION path, no reinforcement", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    const hardConstraints = makeHardConstraints({ bannedItems: ["belt squat"] });

    const plan = await buildExecutionPlan({
      message: "No belt squat, I don't have one",
      userId: "test-user",
      conversationId: "test-conv",
      program: null, // no program
      pendingClarification: null,
      hardConstraints,
    });

    // No program → no reinforcement check possible → build a program
    expect(plan.constraintReinforcement).toBeUndefined();
  });

  it("no hardConstraints supplied → normal APPLY_MUTATION path, no reinforcement", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    const program = makeProgram(["Back Squat", "Romanian Deadlift"]);

    const plan = await buildExecutionPlan({
      message: "No belt squat, I don't have one",
      userId: "test-user",
      conversationId: "test-conv",
      program,
      pendingClarification: null,
      // hardConstraints omitted
    });

    // Without hardConstraints, shortcut doesn't fire
    expect(plan.constraintReinforcement).toBeUndefined();
    expect(plan.action).toBe("APPLY_MUTATION");
  });

  it("exercise dislike constraint already absent → reinforcement", async () => {
    const { buildExecutionPlan } = await import("../execution-planner");

    // "I hate lunges" matches the exercise_dislike_or_preference pattern in the classifier
    const program = makeProgram(["Barbell Row", "Pull-Up", "Cable Row", "Back Squat"]);
    const hardConstraints = makeHardConstraints({ dislikedItems: ["lunges"] });

    const plan = await buildExecutionPlan({
      message: "I hate lunges keep them out of my program",
      userId: "test-user",
      conversationId: "test-conv",
      program,
      pendingClarification: null,
      hardConstraints,
    });

    expect(plan.action).toBe("GUIDANCE");
    expect(plan.constraintReinforcement).toBeDefined();
    // The classifier uses extractExercise which returns "lunge" (matched via "lunges?" pattern)
    expect(plan.constraintReinforcement?.constraintLabel).toMatch(/lung/i);
  });
});
