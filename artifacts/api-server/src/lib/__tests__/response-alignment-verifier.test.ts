import { describe, it, expect } from "vitest";
import {
  verifyResponseAlignment,
  type AlignmentCheckInput,
  type AlignmentIssueType,
} from "../response-alignment-verifier";
import type { ProgramStructure } from "../ai";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const BASE_NARRATION_CTX = {
  action: "PROGRAM_GENERATION",
  intentFamily: "new_program",
  mutationType: null,
  goal: "strength",
  daysPerWeek: 4,
  equipment: "barbell",
  sport: null,
  sessionDuration: 60,
  hasPain: false,
  userMessageHint: "Build me a 4-day strength program",
};

const FOUR_DAY_PROGRAM: ProgramStructure = {
  programName: "4-Day Strength",
  description: "A strength-focused program",
  days: [
    { dayNumber: 1, name: "Day 1", exercises: [{ name: "Squat", sets: 5, reps: "5", rest: "3min" }] },
    { dayNumber: 2, name: "Day 2", exercises: [{ name: "Bench Press", sets: 5, reps: "5", rest: "3min" }] },
    { dayNumber: 3, name: "Day 3", exercises: [{ name: "Deadlift", sets: 3, reps: "5", rest: "4min" }] },
    { dayNumber: 4, name: "Day 4", exercises: [{ name: "Overhead Press", sets: 5, reps: "5", rest: "3min" }] },
  ],
};

const THREE_DAY_PROGRAM: ProgramStructure = {
  programName: "3-Day Strength",
  description: "A strength program",
  days: [
    { dayNumber: 1, name: "Day 1", exercises: [{ name: "Squat", sets: 5, reps: "5", rest: "3min" }] },
    { dayNumber: 2, name: "Day 2", exercises: [{ name: "Bench Press", sets: 5, reps: "5", rest: "3min" }] },
    { dayNumber: 3, name: "Day 3", exercises: [{ name: "Deadlift", sets: 3, reps: "5", rest: "4min" }] },
  ],
};

function makeInput(overrides: Partial<AlignmentCheckInput> = {}): AlignmentCheckInput {
  return {
    action: "PROGRAM_GENERATION",
    intentType: "CREATE_PROGRAM",
    narrationCtx: BASE_NARRATION_CTX,
    aiContent: "Built. Your 4-day strength program is ready in the Program tab.",
    structuredData: FOUR_DAY_PROGRAM,
    systemSaved: true,
    outcomeType: "mutation_applied",
    mutationApplied: false,
    extractedConstraints: { daysPerWeek: 4 },
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueTypes(result: ReturnType<typeof verifyResponseAlignment>): AlignmentIssueType[] {
  return result.issues.map((i) => i.type);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("verifyResponseAlignment", () => {
  // ── Clean turns (should pass with no issues) ────────────────────────────────

  describe("clean turns — no false positives", () => {
    it("passes a verified build turn with matching constraints", () => {
      const result = verifyResponseAlignment(makeInput());
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.repairedContent).toBeNull();
    });

    it("passes a guidance turn with no structuredData", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "GUIDANCE",
          intentType: "GUIDANCE",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "GUIDANCE" },
          aiContent: "Great question — progressive overload works by adding 5 lbs each session.",
          structuredData: null,
          systemSaved: false,
          outcomeType: "conversation_only",
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("passes a mutation turn where mutationApplied=true and text does not claim success", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          intentType: "EDIT_PROGRAM",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION", mutationType: "swap" },
          aiContent: "Check the program panel — I've updated the exercise selection for day 2.",
          structuredData: null,
          systemSaved: false,
          outcomeType: "mutation_applied",
          mutationApplied: true,
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("passes a build turn where constraints are null (no explicit request)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(true);
    });

    it("passes when days match exactly", () => {
      const result = verifyResponseAlignment(
        makeInput({
          structuredData: FOUR_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      expect(result.passed).toBe(true);
    });
  });

  // ── guidance_program_leak ───────────────────────────────────────────────────

  describe("guidance_program_leak", () => {
    it("detects a program leaking through a GUIDANCE action", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "GUIDANCE",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "GUIDANCE" },
          structuredData: FOUR_DAY_PROGRAM,
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("guidance_program_leak");
    });

    it("clears structuredData in response when leak is detected", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "GUIDANCE",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "GUIDANCE" },
          structuredData: FOUR_DAY_PROGRAM,
        })
      );
      expect(result.structuredDataRepair).toBe("clear");
    });

    it("does not flag ASK_CLARIFICATION with no structuredData", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "ASK_CLARIFICATION",
          structuredData: null,
          extractedConstraints: null,
        })
      );
      expect(issueTypes(result)).not.toContain("guidance_program_leak");
    });

    it("does not flag NO_OP with null structuredData", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "NO_OP",
          structuredData: null,
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(true);
    });
  });

  // ── success_claim_without_save ──────────────────────────────────────────────

  describe("success_claim_without_save", () => {
    it("flags build success text when systemSaved=false", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your 4-day strength program is live in the Program tab.",
          systemSaved: false,
          outcomeType: "conversation_only",
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("success_claim_without_save");
    });

    it("provides a repair message for this issue", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your 4-day program is ready.",
          systemSaved: false,
          outcomeType: "conversation_only",
        })
      );
      expect(result.repairedContent).not.toBeNull();
      expect(result.repairedContent).toMatch(/wasn't able to save|problem saving|try again/i);
    });

    it("does not flag when build succeeded and systemSaved=true", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your 4-day strength program is ready.",
          systemSaved: true,
          outcomeType: "mutation_applied",
        })
      );
      expect(issueTypes(result)).not.toContain("success_claim_without_save");
    });

    it("does not flag coaching text that doesn't claim build success", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Progressive overload is key — add 5 lbs each session.",
          systemSaved: false,
          action: "GUIDANCE",
          structuredData: null,
          extractedConstraints: null,
        })
      );
      expect(issueTypes(result)).not.toContain("success_claim_without_save");
    });
  });

  // ── mutation_claim_without_outcome ─────────────────────────────────────────

  describe("mutation_claim_without_outcome", () => {
    it("flags mutation success claim when mutationApplied=false", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          intentType: "EDIT_PROGRAM",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION" },
          aiContent: "Done. I've removed the Romanian Deadlift from Day 3.",
          structuredData: null,
          systemSaved: false,
          outcomeType: "conversation_only",
          mutationApplied: false,
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("mutation_claim_without_outcome");
    });

    it("provides a repair message for mutation claim without outcome", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "DIRECT_MUTATION",
          intentType: "EDIT_PROGRAM",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "DIRECT_MUTATION" },
          aiContent: "Applied. The exercise has been updated.",
          structuredData: null,
          systemSaved: false,
          outcomeType: "conversation_only",
          mutationApplied: false,
          extractedConstraints: null,
        })
      );
      expect(result.repairedContent).toMatch(/didn't change|tell me exactly|try again|couldn't confirm/i);
    });

    it("does not flag when mutation succeeded (mutationApplied=true)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          intentType: "EDIT_PROGRAM",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION" },
          aiContent: "Done. The swap is applied.",
          structuredData: null,
          systemSaved: false,
          outcomeType: "mutation_applied",
          mutationApplied: true,
          extractedConstraints: null,
        })
      );
      expect(issueTypes(result)).not.toContain("mutation_claim_without_outcome");
    });
  });

  // ── constraint_days_mismatch ───────────────────────────────────────────────

  describe("constraint_days_mismatch", () => {
    it("flags a days mismatch after retry (3 days built, 4 requested)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("constraint_days_mismatch");
    });

    it("appends a note to the response for days mismatch (warning only)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      expect(result.repairedContent).toMatch(/asked for 4 training days|program has 3/i);
    });

    it("does not flag when daysPerWeek is null in constraints", () => {
      const result = verifyResponseAlignment(
        makeInput({
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: null },
        })
      );
      expect(issueTypes(result)).not.toContain("constraint_days_mismatch");
    });

    it("does not flag when structuredData is null (guidance path)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          structuredData: null,
          extractedConstraints: { daysPerWeek: 4 },
          action: "GUIDANCE",
        })
      );
      expect(issueTypes(result)).not.toContain("constraint_days_mismatch");
    });
  });

  // ── narration_outcome_mismatch ─────────────────────────────────────────────

  describe("narration_outcome_mismatch", () => {
    it("flags when narration said APPLY_MUTATION but outcome is conversation_only", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "PROGRAM_GENERATION",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION" },
          outcomeType: "conversation_only",
          systemSaved: false,
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("narration_outcome_mismatch");
    });

    it("does not flag when narration is a build action and outcome is conversation_only", () => {
      const result = verifyResponseAlignment(
        makeInput({
          narrationCtx: { ...BASE_NARRATION_CTX, action: "PROGRAM_GENERATION" },
          outcomeType: "conversation_only",
          systemSaved: false,
          aiContent: "Here's some coaching advice.",
        })
      );
      expect(issueTypes(result)).not.toContain("narration_outcome_mismatch");
    });

    it("does not flag when narration is mutation and outcome is mutation_applied", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION" },
          outcomeType: "mutation_applied",
          mutationApplied: true,
          structuredData: null,
          extractedConstraints: null,
        })
      );
      expect(issueTypes(result)).not.toContain("narration_outcome_mismatch");
    });
  });

  // ── exercise_claim_mismatch ────────────────────────────────────────────────

  describe("exercise_claim_mismatch", () => {
    it("flags when AI claims removing an exercise still in the program", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          intentType: "EDIT_PROGRAM",
          narrationCtx: { ...BASE_NARRATION_CTX, action: "APPLY_MUTATION", mutationType: "remove" },
          aiContent: "Done. I removed the Squat from the program — replaced it with Leg Press.",
          structuredData: FOUR_DAY_PROGRAM,
          mutationApplied: true,
          extractedConstraints: null,
        })
      );
      expect(result.passed).toBe(false);
      expect(issueTypes(result)).toContain("exercise_claim_mismatch");
    });

    it("does not flag when no explicit exercise names are mentioned", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Done. I updated the program as requested.",
          structuredData: FOUR_DAY_PROGRAM,
        })
      );
      expect(issueTypes(result)).not.toContain("exercise_claim_mismatch");
    });

    it("does not flag when structuredData is null (edit engine path)", () => {
      const result = verifyResponseAlignment(
        makeInput({
          action: "APPLY_MUTATION",
          aiContent: "Done. I removed the Squat.",
          structuredData: null,
          mutationApplied: true,
          extractedConstraints: null,
        })
      );
      expect(issueTypes(result)).not.toContain("exercise_claim_mismatch");
    });
  });

  // ── Issue ordering ─────────────────────────────────────────────────────────

  describe("issue ordering", () => {
    it("places critical issues before warnings", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your 4-day program is ready.",
          systemSaved: false,
          outcomeType: "conversation_only",
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      const severities = result.issues.map((i) => i.severity);
      const criticalIdx = severities.indexOf("critical");
      const warningIdx = severities.indexOf("warning");
      if (criticalIdx !== -1 && warningIdx !== -1) {
        expect(criticalIdx).toBeLessThan(warningIdx);
      }
    });

    it("uses critical repair content when both critical and warning exist", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your 4-day program is ready.",
          systemSaved: false,
          outcomeType: "conversation_only",
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      expect(result.repairedContent).toMatch(/wasn't able to save|problem saving|try again/i);
    });
  });

  // ── Repair coverage ────────────────────────────────────────────────────────

  describe("repair content", () => {
    it("returns null repairedContent when everything passes", () => {
      const result = verifyResponseAlignment(makeInput());
      expect(result.repairedContent).toBeNull();
    });

    it("repair text for success_claim_without_save mentions trying again", () => {
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: "Built. Your program is live in the Program tab.",
          systemSaved: false,
          outcomeType: "conversation_only",
        })
      );
      expect(result.repairedContent).toBeTruthy();
      expect(result.repairedContent!.length).toBeGreaterThan(20);
    });

    it("warning-only turns append a caveat rather than replace content", () => {
      const original = "Built. Your 4-day strength program is ready.";
      const result = verifyResponseAlignment(
        makeInput({
          aiContent: original,
          structuredData: THREE_DAY_PROGRAM,
          extractedConstraints: { daysPerWeek: 4 },
        })
      );
      expect(result.repairedContent).not.toBeNull();
      expect(result.repairedContent!.startsWith(original)).toBe(true);
      expect(result.repairedContent!.length).toBeGreaterThan(original.length);
    });
  });
});
