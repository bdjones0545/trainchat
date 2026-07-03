import { describe, it, expect } from "vitest";
import { resolveResponseMode, classifyOrchMutationType } from "../conversation-routing";

// ─── resolveResponseMode ──────────────────────────────────────────────────────

describe("resolveResponseMode", () => {
  // ── ASK_CLARIFICATION ──────────────────────────────────────────────────────

  it("ASK_CLARIFICATION → CLARIFICATION_RESPONSE (intentFamily ignored)", () => {
    expect(resolveResponseMode("ASK_CLARIFICATION", null)).toBe("CLARIFICATION_RESPONSE");
    expect(resolveResponseMode("ASK_CLARIFICATION", "coaching_question")).toBe("CLARIFICATION_RESPONSE");
  });

  // ── GUIDANCE sub-specializations ───────────────────────────────────────────

  it("GUIDANCE + program_safety_question → PROGRAM_SAFETY_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", "program_safety_question")).toBe("PROGRAM_SAFETY_RESPONSE");
  });

  it("GUIDANCE + program_explanation_question → PROGRAM_EXPLANATION_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", "program_explanation_question")).toBe("PROGRAM_EXPLANATION_RESPONSE");
  });

  it("GUIDANCE + coaching_question → COACHING_GUIDANCE_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", "coaching_question")).toBe("COACHING_GUIDANCE_RESPONSE");
  });

  it("GUIDANCE + greeting → GREETING_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", "greeting")).toBe("GREETING_RESPONSE");
  });

  it("GUIDANCE + unrecognized intentFamily → COACHING_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", "sport_context_update")).toBe("COACHING_RESPONSE");
    expect(resolveResponseMode("GUIDANCE", "volume_adjustment")).toBe("COACHING_RESPONSE");
  });

  it("GUIDANCE + null intentFamily → COACHING_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", null)).toBe("COACHING_RESPONSE");
  });

  it("GUIDANCE + undefined intentFamily → COACHING_RESPONSE", () => {
    expect(resolveResponseMode("GUIDANCE", undefined)).toBe("COACHING_RESPONSE");
  });

  // ── Non-GUIDANCE actions always → EXECUTION_RESPONSE ──────────────────────

  it("APPLY_MUTATION → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("APPLY_MUTATION", null)).toBe("EXECUTION_RESPONSE");
  });

  it("REBUILD_PROGRAM → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("REBUILD_PROGRAM", null)).toBe("EXECUTION_RESPONSE");
  });

  it("NO_OP → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("NO_OP", null)).toBe("EXECUTION_RESPONSE");
  });

  it("ACTION_CHOICE_CARD → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("ACTION_CHOICE_CARD", null)).toBe("EXECUTION_RESPONSE");
  });

  it("SAFETY_REFUSAL → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("SAFETY_REFUSAL", null)).toBe("EXECUTION_RESPONSE");
  });

  // ── GUIDANCE intentFamily only applies when action IS GUIDANCE ─────────────

  it("program_safety_question under APPLY_MUTATION still → EXECUTION_RESPONSE", () => {
    expect(resolveResponseMode("APPLY_MUTATION", "program_safety_question")).toBe("EXECUTION_RESPONSE");
  });
});

// ─── classifyOrchMutationType ─────────────────────────────────────────────────

describe("classifyOrchMutationType", () => {
  // ── structural ─────────────────────────────────────────────────────────────

  it("'add' → structural", () => {
    expect(classifyOrchMutationType("add")).toBe("structural");
  });

  it("'remove' → structural", () => {
    expect(classifyOrchMutationType("remove")).toBe("structural");
  });

  it("'swap' → structural", () => {
    expect(classifyOrchMutationType("swap")).toBe("structural");
  });

  // ── minor ──────────────────────────────────────────────────────────────────

  it("'progression' → minor", () => {
    expect(classifyOrchMutationType("progression")).toBe("minor");
  });

  it("'regression' → minor", () => {
    expect(classifyOrchMutationType("regression")).toBe("minor");
  });

  // ── no classification ──────────────────────────────────────────────────────

  it("'transform' → undefined (not structural or minor)", () => {
    expect(classifyOrchMutationType("transform")).toBeUndefined();
  });

  it("null → undefined", () => {
    expect(classifyOrchMutationType(null)).toBeUndefined();
  });

  it("undefined → undefined", () => {
    expect(classifyOrchMutationType(undefined)).toBeUndefined();
  });
});
