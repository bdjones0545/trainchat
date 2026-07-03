import { describe, it, expect } from "vitest";
import { resolveResponseMode, classifyOrchMutationType, shouldBypassEditEngine, DELOAD_INTENT_FAMILIES } from "../conversation-routing";
import type { AgentSettingsContext } from "../agent-settings-resolver";

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
    expect(resolveResponseMode("GUIDANCE", "increase_volume")).toBe("COACHING_RESPONSE");
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

// ─── shouldBypassEditEngine ───────────────────────────────────────────────────

// Minimal AgentSettingsContext stub — only the behavior fields the helper reads.
function makeSettings(
  overrides: Partial<AgentSettingsContext["behavior"]> = {},
): AgentSettingsContext {
  return {
    behavior: {
      memoryPersonalization: false,
      proactiveInsights: false,
      requireApprovalStructural: false,
      requireApprovalDeload: false,
      autoAdjustRecommendations: true,
      executionPermission: "apply_mutation",
      ...overrides,
    },
    training: {},
  } as AgentSettingsContext;
}

describe("shouldBypassEditEngine", () => {
  // ── null (proceed) ──────────────────────────────────────────────────────────

  it("returns null when no gate applies (all defaults)", () => {
    expect(shouldBypassEditEngine(makeSettings(), "volume_adjustment" as any, undefined)).toBeNull();
  });

  it("returns null for minor mutation with requireApprovalStructural=true", () => {
    const settings = makeSettings({ requireApprovalStructural: true });
    expect(shouldBypassEditEngine(settings, "increase_volume", "minor")).toBeNull();
  });

  it("returns null for structural mutation when requireApprovalStructural=false", () => {
    expect(shouldBypassEditEngine(makeSettings(), "increase_volume", "structural")).toBeNull();
  });

  it("returns null for deload family when requireApprovalDeload=false", () => {
    expect(shouldBypassEditEngine(makeSettings(), "fatigue_management", undefined)).toBeNull();
  });

  it("returns null for non-deload family when requireApprovalDeload=true", () => {
    const settings = makeSettings({ requireApprovalDeload: true });
    expect(shouldBypassEditEngine(settings, "increase_volume", undefined)).toBeNull();
  });

  it("returns null when intentFamily is null and requireApprovalDeload=true", () => {
    const settings = makeSettings({ requireApprovalDeload: true });
    expect(shouldBypassEditEngine(settings, null, undefined)).toBeNull();
  });

  // ── suggest_only ────────────────────────────────────────────────────────────

  it("returns 'suggest_only' when executionPermission is suggest_only", () => {
    const settings = makeSettings({ executionPermission: "suggest_only" });
    expect(shouldBypassEditEngine(settings, "increase_volume", undefined)).toBe("suggest_only");
  });

  it("suggest_only takes priority over requireApprovalDeload", () => {
    const settings = makeSettings({
      executionPermission: "suggest_only",
      requireApprovalDeload: true,
    });
    expect(shouldBypassEditEngine(settings, "fatigue_management", undefined)).toBe("suggest_only");
  });

  it("suggest_only takes priority over requireApprovalStructural", () => {
    const settings = makeSettings({
      executionPermission: "suggest_only",
      requireApprovalStructural: true,
    });
    expect(shouldBypassEditEngine(settings, "increase_volume", "structural")).toBe("suggest_only");
  });

  // ── requireApprovalDeload ───────────────────────────────────────────────────

  it("returns 'requireApprovalDeload' for fatigue_management when gate is on", () => {
    const settings = makeSettings({ requireApprovalDeload: true });
    expect(shouldBypassEditEngine(settings, "fatigue_management", undefined)).toBe("requireApprovalDeload");
  });

  it("returns 'requireApprovalDeload' for recovery_focus when gate is on", () => {
    const settings = makeSettings({ requireApprovalDeload: true });
    expect(shouldBypassEditEngine(settings, "recovery_focus", undefined)).toBe("requireApprovalDeload");
  });

  it("requireApprovalDeload takes priority over requireApprovalStructural", () => {
    const settings = makeSettings({
      requireApprovalDeload: true,
      requireApprovalStructural: true,
    });
    expect(shouldBypassEditEngine(settings, "fatigue_management", "structural")).toBe("requireApprovalDeload");
  });

  // ── requireApprovalStructural ───────────────────────────────────────────────

  it("returns 'requireApprovalStructural' for structural mutation when gate is on", () => {
    const settings = makeSettings({ requireApprovalStructural: true });
    expect(shouldBypassEditEngine(settings, "increase_volume", "structural")).toBe("requireApprovalStructural");
  });

  it("returns null for undefined orchMutationType with requireApprovalStructural=true", () => {
    const settings = makeSettings({ requireApprovalStructural: true });
    expect(shouldBypassEditEngine(settings, "increase_volume", undefined)).toBeNull();
  });

  // ── DELOAD_INTENT_FAMILIES constant ────────────────────────────────────────

  it("DELOAD_INTENT_FAMILIES contains fatigue_management and recovery_focus", () => {
    expect(DELOAD_INTENT_FAMILIES.has("fatigue_management")).toBe(true);
    expect(DELOAD_INTENT_FAMILIES.has("recovery_focus")).toBe(true);
  });

  it("DELOAD_INTENT_FAMILIES does not contain non-deload families", () => {
    expect(DELOAD_INTENT_FAMILIES.has("increase_volume")).toBe(false);
    expect(DELOAD_INTENT_FAMILIES.has("coaching_question")).toBe(false);
  });
});
