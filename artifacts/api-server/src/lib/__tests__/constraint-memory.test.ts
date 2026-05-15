/**
 * Constraint Memory Enforcement — test suite
 *
 * Tests cover all exported pure functions in constraint-memory.ts.
 * `persistConstraintsFromTurn` (async, DB-dependent) is tested separately
 * via integration-level assertions on the module's internal logic paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadHardConstraints,
  buildConstraintEnforcementDirective,
  validateAgainstHardConstraints,
  type HardConstraints,
} from "../constraint-memory";
import type { MemoryEntry } from "../memory";
import { verifyResponseAlignment } from "../response-alignment-verifier";
import type { AlignmentCheckInput } from "../response-alignment-verifier";
import type { ProgramStructure } from "../ai";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseDate = new Date("2025-01-01T00:00:00Z");

function makeMemory(overrides: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: 1,
    userId: 42,
    type: "exercise_preference",
    subject: "test",
    sentiment: "negative",
    confidence: 4,
    source: "conversation",
    detail: "Test memory",
    status: "active",
    updatedAt: baseDate,
    createdAt: baseDate,
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
          rest: "90s",
          notes: "",
        })),
      },
    ],
  } as unknown as ProgramStructure;
}

function makeAlignmentInput(
  overrides: Partial<AlignmentCheckInput> = {}
): AlignmentCheckInput {
  return {
    action: "PROGRAM_GENERATION",
    intentType: "CREATE_PROGRAM",
    narrationCtx: {
      action: "CREATE_PROGRAM",
    },
    aiContent: "Here is your new program.",
    structuredData: null,
    systemSaved: true,
    outcomeType: "mutation_applied",
    mutationApplied: false,
    extractedConstraints: null,
    hardConstraints: null,
    ...overrides,
  };
}

// ─── loadHardConstraints ──────────────────────────────────────────────────────

describe("loadHardConstraints", () => {
  it("returns empty constraints when memories array is empty", () => {
    const result = loadHardConstraints([]);
    expect(result.bannedItems).toEqual([]);
    expect(result.dislikedItems).toEqual([]);
    expect(result.painRegions).toEqual([]);
    expect(result.sport).toBeNull();
  });

  it("extracts banned equipment from _unavailable subjects", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "exercise_preference",
        subject: "belt_squat_unavailable",
        sentiment: "negative",
      }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.bannedItems).toContain("belt squat");
    expect(result.dislikedItems).toHaveLength(0);
  });

  it("extracts disliked exercises from _disliked subjects", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "exercise_preference",
        subject: "lunges_disliked",
        sentiment: "negative",
      }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.dislikedItems).toContain("lunges");
    expect(result.bannedItems).toHaveLength(0);
  });

  it("ignores positive exercise preference memories", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "exercise_preference",
        subject: "deadlift_favorite",
        sentiment: "positive",
      }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.bannedItems).toHaveLength(0);
    expect(result.dislikedItems).toHaveLength(0);
  });

  it("extracts pain regions from pain_pattern memories", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "pain_pattern",
        subject: "knee",
        sentiment: "negative",
      }),
      makeMemory({
        type: "pain_pattern",
        subject: "lower_back",
        sentiment: "negative",
        id: 2,
      }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.painRegions).toContain("knee");
    expect(result.painRegions).toContain("lower back");
  });

  it("extracts sport context from sport_context memories", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "sport_context",
        subject: "golf",
        sentiment: "neutral",
      }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.sport).toBe("golf");
  });

  it("handles all constraint types simultaneously", () => {
    const memories: MemoryEntry[] = [
      makeMemory({ id: 1, type: "exercise_preference", subject: "cable_machine_unavailable", sentiment: "negative" }),
      makeMemory({ id: 2, type: "exercise_preference", subject: "burpees_disliked", sentiment: "negative" }),
      makeMemory({ id: 3, type: "pain_pattern", subject: "shoulder", sentiment: "negative" }),
      makeMemory({ id: 4, type: "sport_context", subject: "bjj", sentiment: "neutral" }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.bannedItems).toContain("cable machine");
    expect(result.dislikedItems).toContain("burpees");
    expect(result.painRegions).toContain("shoulder");
    expect(result.sport).toBe("bjj");
  });

  it("does NOT add neutral pain_pattern memories to painRegions", () => {
    const memories: MemoryEntry[] = [
      makeMemory({ type: "pain_pattern", subject: "hip", sentiment: "positive" }),
    ];
    const result = loadHardConstraints(memories);
    expect(result.painRegions).toHaveLength(0);
  });
});

// ─── buildConstraintEnforcementDirective ─────────────────────────────────────

describe("buildConstraintEnforcementDirective", () => {
  it("returns null when no constraints are set", () => {
    const constraints: HardConstraints = {
      bannedItems: [],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    expect(buildConstraintEnforcementDirective(constraints)).toBeNull();
  });

  it("includes banned items section when bannedItems is non-empty", () => {
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Belt squat");
    expect(directive).toContain("unavailable");
    expect(directive).toContain("NEVER");
  });

  it("includes disliked items section when dislikedItems is non-empty", () => {
    const constraints: HardConstraints = {
      bannedItems: [],
      dislikedItems: ["lunges"],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Lunges");
    expect(directive).toContain("AVOID");
  });

  it("includes pain region section when painRegions is non-empty", () => {
    const constraints: HardConstraints = {
      bannedItems: [],
      dislikedItems: [],
      painRegions: ["knee"],
      monitorRegions: [],
      sport: null,
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Knee");
    expect(directive).toContain("Pain/limitation");
  });

  it("includes sport context when sport is set", () => {
    const constraints: HardConstraints = {
      bannedItems: [],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: "golf",
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Golf");
    expect(directive).toContain("Sport context");
  });

  it("includes the PERSISTED USER CONSTRAINTS header", () => {
    const constraints: HardConstraints = {
      bannedItems: ["barbell"],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).toContain("PERSISTED USER CONSTRAINTS");
    expect(directive).toContain("ABSOLUTE");
  });

  it("includes all sections when all constraints are populated", () => {
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: ["lunges"],
      painRegions: ["knee"],
      monitorRegions: [],
      sport: "golf",
    };
    const directive = buildConstraintEnforcementDirective(constraints);
    expect(directive).toContain("Belt squat");
    expect(directive).toContain("Lunges");
    expect(directive).toContain("Knee");
    expect(directive).toContain("Golf");
  });
});

// ─── validateAgainstHardConstraints ──────────────────────────────────────────

describe("validateAgainstHardConstraints", () => {
  it("returns empty array when there are no hard constraints", () => {
    const program = makeProgram(["Barbell Squat", "Romanian Deadlift", "Bench Press"]);
    const constraints: HardConstraints = { bannedItems: [], dislikedItems: [], painRegions: [], monitorRegions: [], sport: null };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(0);
  });

  it("detects a banned item present in the program", () => {
    const program = makeProgram(["Belt Squat", "Romanian Deadlift"]);
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe("banned_item");
    expect(violations[0].exerciseName).toBe("Belt Squat");
    expect(violations[0].matchedConstraint).toBe("belt squat");
  });

  it("detects a disliked item present in the program", () => {
    const program = makeProgram(["Walking Lunges", "Hip Thrust"]);
    const constraints: HardConstraints = {
      bannedItems: [],
      dislikedItems: ["lunges"],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe("disliked_item");
    expect(violations[0].exerciseName).toBe("Walking Lunges");
  });

  it("returns empty array when constraints exist but none match the program", () => {
    const program = makeProgram(["Barbell Squat", "Pull-Up", "Bench Press"]);
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: ["lunges"],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(0);
  });

  it("detects multiple violations across multiple days", () => {
    const program: ProgramStructure = {
      programName: "Test",
      description: "Test",
      days: [
        {
          name: "Day 1",
          exercises: [
            { name: "Belt Squat", sets: 3, reps: "10", rest: "90s", notes: "" },
          ],
        },
        {
          name: "Day 2",
          exercises: [
            { name: "Walking Lunges", sets: 3, reps: "12", rest: "60s", notes: "" },
          ],
        },
      ],
    } as unknown as ProgramStructure;

    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: ["lunges"],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(2);
    const types = violations.map((v) => v.violationType);
    expect(types).toContain("banned_item");
    expect(types).toContain("disliked_item");
  });

  it("matches case-insensitively", () => {
    const program = makeProgram(["BELT SQUAT"]);
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(1);
  });

  it("handles substring matching (belt squat matches Belt Squat Machine)", () => {
    const program = makeProgram(["Belt Squat Machine"]);
    const constraints: HardConstraints = {
      bannedItems: ["belt squat"],
      dislikedItems: [],
      painRegions: [],
      monitorRegions: [],
      sport: null,
    };
    const violations = validateAgainstHardConstraints(program, constraints);
    expect(violations).toHaveLength(1);
    expect(violations[0].exerciseName).toBe("Belt Squat Machine");
  });
});

// ─── Alignment verifier — persisted_constraint_violation ─────────────────────

describe("verifyResponseAlignment — persisted_constraint_violation", () => {
  it("passes when no hard constraints are provided", () => {
    const program = makeProgram(["Belt Squat", "Lunges"]);
    const input = makeAlignmentInput({
      action: "PROGRAM_GENERATION",
      structuredData: program,
      hardConstraints: null,
    });
    const result = verifyResponseAlignment(input);
    const constraintIssues = result.issues.filter((i) => i.type === "persisted_constraint_violation");
    expect(constraintIssues).toHaveLength(0);
  });

  it("passes when program does not contain banned items", () => {
    const program = makeProgram(["Barbell Squat", "Romanian Deadlift"]);
    const input = makeAlignmentInput({
      action: "PROGRAM_GENERATION",
      structuredData: program,
      hardConstraints: {
        bannedItems: ["belt squat"],
        dislikedItems: [],
        painRegions: [],
        monitorRegions: [],
        sport: null,
      },
    });
    const result = verifyResponseAlignment(input);
    const constraintIssues = result.issues.filter((i) => i.type === "persisted_constraint_violation");
    expect(constraintIssues).toHaveLength(0);
  });

  it("flags critical issue when banned item appears in program", () => {
    const program = makeProgram(["Belt Squat", "Romanian Deadlift"]);
    const input = makeAlignmentInput({
      action: "PROGRAM_GENERATION",
      structuredData: program,
      hardConstraints: {
        bannedItems: ["belt squat"],
        dislikedItems: [],
        painRegions: [],
        monitorRegions: [],
        sport: null,
      },
    });
    const result = verifyResponseAlignment(input);
    const constraintIssues = result.issues.filter((i) => i.type === "persisted_constraint_violation");
    expect(constraintIssues).toHaveLength(1);
    expect(constraintIssues[0].severity).toBe("critical");
    expect(result.passed).toBe(false);
  });

  it("produces repair content naming the banned item", () => {
    const program = makeProgram(["Belt Squat"]);
    const input = makeAlignmentInput({
      action: "PROGRAM_GENERATION",
      structuredData: program,
      hardConstraints: {
        bannedItems: ["belt squat"],
        dislikedItems: [],
        painRegions: [],
        monitorRegions: [],
        sport: null,
      },
    });
    const result = verifyResponseAlignment(input);
    expect(result.repairedContent).not.toBeNull();
    expect(result.repairedContent).toContain("belt squat");
    expect(result.repairedContent).toContain("isn't available");
  });

  it("does not check guidance-only turns (no structuredData)", () => {
    const input = makeAlignmentInput({
      action: "GUIDANCE",
      structuredData: null,
      hardConstraints: {
        bannedItems: ["belt squat"],
        dislikedItems: [],
        painRegions: [],
        monitorRegions: [],
        sport: null,
      },
    });
    const result = verifyResponseAlignment(input);
    const constraintIssues = result.issues.filter((i) => i.type === "persisted_constraint_violation");
    expect(constraintIssues).toHaveLength(0);
  });

  it("skips constraint check for APPLY_MUTATION without structuredData", () => {
    const input = makeAlignmentInput({
      action: "APPLY_MUTATION",
      structuredData: null,
      hardConstraints: {
        bannedItems: ["barbell"],
        dislikedItems: [],
        painRegions: [],
        monitorRegions: [],
        sport: null,
      },
    });
    const result = verifyResponseAlignment(input);
    const constraintIssues = result.issues.filter((i) => i.type === "persisted_constraint_violation");
    expect(constraintIssues).toHaveLength(0);
  });
});

// ─── Round-trip: memory → constraints → directive → validation ────────────────

describe("round-trip: memory → constraints → directive → validation", () => {
  it("persists belt squat constraint and correctly detects violation in program", () => {
    // Simulate what would be in the DB after user says "I don't have a belt squat"
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "exercise_preference",
        subject: "belt_squat_unavailable",
        sentiment: "negative",
        detail: "Belt squat is unavailable — never include it in any program.",
      }),
    ];

    // Load hard constraints (as done at request time)
    const hardConstraints = loadHardConstraints(memories);
    expect(hardConstraints.bannedItems).toContain("belt squat");

    // Build directive (as injected into transformHint)
    const directive = buildConstraintEnforcementDirective(hardConstraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Belt squat");

    // Check if AI "forgot" and included belt squat anyway
    const program = makeProgram(["Belt Squat", "Leg Press", "Romanian Deadlift"]);
    const violations = validateAgainstHardConstraints(program, hardConstraints);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe("banned_item");
  });

  it("persists golf sport context and includes it in directive", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "sport_context",
        subject: "golf",
        sentiment: "neutral",
        detail: "User plays golf — include rotational strength...",
      }),
    ];

    const hardConstraints = loadHardConstraints(memories);
    expect(hardConstraints.sport).toBe("golf");

    const directive = buildConstraintEnforcementDirective(hardConstraints);
    expect(directive).not.toBeNull();
    expect(directive).toContain("Golf");

    // Sport context doesn't cause validation violations — only prompt-level enforcement
    const program = makeProgram(["Pallof Press", "Romanian Deadlift"]);
    const violations = validateAgainstHardConstraints(program, hardConstraints);
    expect(violations).toHaveLength(0);
  });

  it("respects disliked exercise and detects it in program", () => {
    const memories: MemoryEntry[] = [
      makeMemory({
        type: "exercise_preference",
        subject: "burpees_disliked",
        sentiment: "negative",
        detail: "User dislikes burpees — avoid unless explicitly requested.",
      }),
    ];

    const hardConstraints = loadHardConstraints(memories);
    expect(hardConstraints.dislikedItems).toContain("burpees");

    const program = makeProgram(["Burpees", "Box Jump", "Assault Bike"]);
    const violations = validateAgainstHardConstraints(program, hardConstraints);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe("disliked_item");
    expect(violations[0].matchedConstraint).toBe("burpees");
  });
});
