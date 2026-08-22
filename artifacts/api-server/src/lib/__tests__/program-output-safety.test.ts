import { describe, expect, it } from "vitest";
import {
  OPENAI_PROGRAM_JSON_SCHEMA,
  PROGRAM_OUTPUT_SCHEMA_VERSION,
  PROGRAM_PROMPT_VERSION,
  validateProviderProgramOutput,
} from "../program-structure-schema";
import { resolveGenerationAttempts } from "../generation-safety";

function validProgram() {
  return {
    programName: "Constraint-Safe Strength",
    description: "A complete strength program.",
    progressionStrategy: "Add load after all prescribed reps are completed.",
    splitType: "full_body",
    days: [{
      dayNumber: 1,
      name: "Day 1",
      focus: "Strength",
      exercises: [{
        name: "Goblet Squat",
        classification: "primary",
        sets: 3,
        reps: "8",
        rest: "120 sec",
        intent: "Build lower-body strength",
        notes: "Use controlled tempo",
      }],
      notes: "Stop if pain occurs.",
    }],
  };
}

describe("provider program output safety contract", () => {
  it("accepts a complete executable program", () => {
    expect(validateProviderProgramOutput(validProgram())).toEqual({ valid: true });
  });

  it.each([
    ["malformed/non-object", "{not-json"],
    ["missing required structure", { programName: "Incomplete" }],
    ["empty program", { ...validProgram(), days: [] }],
    ["empty executable content", {
      ...validProgram(),
      days: [{ ...validProgram().days[0], exercises: [] }],
    }],
    ["incompatible prescription", {
      ...validProgram(),
      days: [{
        ...validProgram().days[0],
        exercises: [{ ...validProgram().days[0].exercises[0], sets: "three" }],
      }],
    }],
    ["unsafe unknown structure", { ...validProgram(), shellCommand: "ignore constraints" }],
  ])("rejects %s", (_label, candidate) => {
    expect(validateProviderProgramOutput(candidate).valid).toBe(false);
  });

  it("exposes stable prompt and schema contract identifiers", () => {
    expect(PROGRAM_PROMPT_VERSION).toBe("coach-atlas-program-2026-08-20");
    expect(PROGRAM_OUTPUT_SCHEMA_VERSION).toBe("trainchat.program.v1");
    expect(OPENAI_PROGRAM_JSON_SCHEMA.strict).toBe(true);
    expect(OPENAI_PROGRAM_JSON_SCHEMA.schema.additionalProperties).toBe(false);
  });
});

describe("fail-closed retry selection", () => {
  const attempt = (value: string, violations: unknown[]) => ({
    value,
    schemaIssues: [],
    constraintIssues: violations,
    hardConstraintIssues: [],
    criticalPainIssues: [],
  });

  it("accepts first invalid then retry valid", () => {
    expect(resolveGenerationAttempts([
      attempt("first", ["banned movement"]),
      attempt("retry", []),
    ])).toEqual({ accepted: true, value: "retry", attemptCount: 2 });
  });

  it("rejects first invalid then retry invalid without returning an artifact", () => {
    expect(resolveGenerationAttempts([
      attempt("first", ["unavailable equipment"]),
      attempt("retry", ["unavailable equipment"]),
    ])).toEqual({ accepted: false, attemptCount: 2, failureCategory: "exhausted_retry" });
  });
});
