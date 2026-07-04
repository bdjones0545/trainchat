/**
 * program-structure-schema.test.ts — Hardening PR 5 (audit F5)
 *
 * Unit tests for the Zod gate between probabilistic AI output and
 * deterministic persistence. Covers:
 *   - legitimate program outputs (minimal and maximal) still pass
 *   - missing required fields are rejected
 *   - wrong types are rejected
 *   - invalid nested days/exercises are rejected
 *   - lenient-by-design cases (rest days, missing prescriptions, extra keys)
 */

import { describe, it, expect } from "vitest";
import {
  ProgramStructureSchema,
  validateProgramStructure,
} from "../program-structure-schema";

// A maximal fixture mirroring every documented field of the ProgramStructure
// interface in lib/ai.ts — drift guard between the interface and the schema.
const MAXIMAL_PROGRAM = {
  programName: "Off-Season Strength Block",
  description: "4-day upper/lower block",
  progressionStrategy: "Wave loading across weeks",
  splitType: "upper/lower",
  whatChanged: "Increased squat volume",
  whyChanged: "User asked for more leg work",
  expertJudgmentNotes: ["Kept deadlift frequency at 1x due to recovery"],
  whyItWorks: "Balances stimulus and recovery for an intermediate lifter.",
  days: [
    {
      dayNumber: 1,
      name: "Day 1 — Lower Strength",
      focus: "squat pattern",
      notes: "Leave 1-2 reps in reserve",
      sessionFlowNotes: ["Opens with low-friction prep before the main lift."],
      exercises: [
        {
          name: "Back Squat",
          classification: "primary",
          sets: 4,
          reps: "5",
          rest: "3 min",
          intent: "maximal strength",
          notes: "Pause first rep",
        },
      ],
    },
  ],
  intelligenceStatus: {
    periodizationPhase: "Accumulation",
    progressionModel: "Wave Loading",
    adaptationDirective: "Fatigue protection active",
    recoveryStatus: "Recovery protection active",
    behavioralSignals: [{ type: "fatigue", label: "Elevated fatigue reported" }],
  },
  _architectureAudit: {
    usedHardcodedSession: false,
    sessionIdentitySource: "architecture",
    blockOrderSource: "architecture",
    variationSeed: 7,
    archSessionCount: 4,
    sport: null,
  },
};

const MINIMAL_PROGRAM = {
  programName: "Simple Plan",
  days: [{ name: "Day 1", exercises: [{ name: "Push-Up" }] }],
};

describe("ProgramStructureSchema — valid output passes", () => {
  it("accepts a maximal interface-shaped program (drift guard)", () => {
    expect(ProgramStructureSchema.safeParse(MAXIMAL_PROGRAM).success).toBe(true);
  });

  it("accepts a minimal skeleton (name + one named day + one named exercise)", () => {
    expect(validateProgramStructure(MINIMAL_PROGRAM)).toEqual({ valid: true });
  });

  it("accepts a rest day with zero exercises", () => {
    const program = {
      programName: "With Rest",
      days: [
        { name: "Day 1", exercises: [{ name: "Squat", sets: 3, reps: "8", rest: "2 min" }] },
        { name: "Day 2 — Rest", exercises: [] },
      ],
    };
    expect(validateProgramStructure(program)).toEqual({ valid: true });
  });

  it("accepts exercises without prescriptions (mobility/time-only entries)", () => {
    const program = {
      programName: "Mobility Flow",
      days: [{ name: "Day 1", exercises: [{ name: "Couch Stretch", notes: "60s/side" }] }],
    };
    expect(validateProgramStructure(program)).toEqual({ valid: true });
  });

  it("passes through unknown keys added by the pipeline (_buildMeta etc.)", () => {
    const program = {
      ...MINIMAL_PROGRAM,
      _buildMeta: { frequency: 3 },
      someModelExtra: "ignored",
    };
    expect(validateProgramStructure(program)).toEqual({ valid: true });
  });
});

describe("ProgramStructureSchema — missing required fields are rejected", () => {
  it("rejects a program without programName", () => {
    const { programName: _omit, ...rest } = MINIMAL_PROGRAM;
    const result = validateProgramStructure(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.join(" ")).toContain("programName");
  });

  it("rejects a program without days", () => {
    expect(validateProgramStructure({ programName: "No Days" }).valid).toBe(false);
  });

  it("rejects an empty days array (a zero-day program is not a program)", () => {
    expect(validateProgramStructure({ programName: "Empty", days: [] }).valid).toBe(false);
  });

  it("rejects a day without a name", () => {
    const program = { programName: "P", days: [{ exercises: [{ name: "Squat" }] }] };
    expect(validateProgramStructure(program).valid).toBe(false);
  });

  it("rejects a day without an exercises array", () => {
    const program = { programName: "P", days: [{ name: "Day 1" }] };
    expect(validateProgramStructure(program).valid).toBe(false);
  });

  it("rejects an exercise without a name", () => {
    const program = {
      programName: "P",
      days: [{ name: "Day 1", exercises: [{ sets: 3, reps: "8" }] }],
    };
    expect(validateProgramStructure(program).valid).toBe(false);
  });

  it("rejects an empty-string exercise name", () => {
    const program = {
      programName: "P",
      days: [{ name: "Day 1", exercises: [{ name: "" }] }],
    };
    expect(validateProgramStructure(program).valid).toBe(false);
  });
});

describe("ProgramStructureSchema — wrong types are rejected", () => {
  it("rejects non-object candidates", () => {
    expect(validateProgramStructure(null).valid).toBe(false);
    expect(validateProgramStructure("a program").valid).toBe(false);
    expect(validateProgramStructure(42).valid).toBe(false);
    expect(validateProgramStructure([MINIMAL_PROGRAM]).valid).toBe(false);
  });

  it("rejects days as a non-array", () => {
    expect(validateProgramStructure({ programName: "P", days: "monday" }).valid).toBe(false);
  });

  it("rejects a numeric programName", () => {
    expect(
      validateProgramStructure({ programName: 7, days: MINIMAL_PROGRAM.days }).valid,
    ).toBe(false);
  });

  it("rejects string sets when present (present fields must be typed right)", () => {
    const program = {
      programName: "P",
      days: [{ name: "Day 1", exercises: [{ name: "Squat", sets: "three" }] }],
    };
    expect(validateProgramStructure(program).valid).toBe(false);
  });

  it("rejects a non-array expertJudgmentNotes", () => {
    const program = { ...MINIMAL_PROGRAM, expertJudgmentNotes: "note" };
    expect(validateProgramStructure(program).valid).toBe(false);
  });
});

describe("validateProgramStructure — failure reporting", () => {
  it("returns compact path-prefixed issues, capped at 10", () => {
    const manyBadDays = {
      programName: "P",
      days: Array.from({ length: 15 }, () => ({ exercises: "nope" })),
    };
    const result = validateProgramStructure(manyBadDays);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeLessThanOrEqual(10);
      expect(result.issues[0]).toMatch(/^days\./);
    }
  });
});
