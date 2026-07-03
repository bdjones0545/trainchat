import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveResponseMode, classifyOrchMutationType, shouldBypassEditEngine, DELOAD_INTENT_FAMILIES, resolveClarificationPendingFamily, formatChoiceCard, formatSafetyRefusal, formatSaveProgram, formatSystemEditData, formatMutationFailureContent } from "../conversation-routing";
import type { AgentSettingsContext } from "../agent-settings-resolver";

// vi.hoisted ensures the mock fn exists before the vi.mock factory runs.
const { mockNormalizeToIntentFamily } = vi.hoisted(() => ({
  mockNormalizeToIntentFamily: vi.fn(),
}));

// Mock normalizeToIntentFamily so resolveClarificationPendingFamily tests are
// isolated from the full intent-classification pipeline.
vi.mock("../intent-family-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("../intent-family-engine")>();
  return { ...original, normalizeToIntentFamily: mockNormalizeToIntentFamily };
});

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

// ─── resolveClarificationPendingFamily ────────────────────────────────────────

describe("resolveClarificationPendingFamily", () => {
  // normalizeToIntentFamily is mocked at module level; reset before each test.
  beforeEach(() => {
    mockNormalizeToIntentFamily.mockReset();
  });

  // ── pass-through (valid non-fallback family) ────────────────────────────────

  it("returns planIntentFamily unchanged when it is a valid non-fallback value", () => {
    expect(resolveClarificationPendingFamily("exercise_swap", "swap my bench", "strength")).toBe("exercise_swap");
    expect(mockNormalizeToIntentFamily).not.toHaveBeenCalled();
  });

  it("returns planIntentFamily when it is any non-empty, non-fallback string", () => {
    expect(resolveClarificationPendingFamily("increase_volume", "add sets", null)).toBe("increase_volume");
    expect(mockNormalizeToIntentFamily).not.toHaveBeenCalled();
  });

  it("does not call normalizeToIntentFamily when family is already resolved", () => {
    resolveClarificationPendingFamily("fatigue_management", "give me a deload", "speed");
    expect(mockNormalizeToIntentFamily).not.toHaveBeenCalled();
  });

  // ── recovery (fallback family) ──────────────────────────────────────────────

  it("calls normalizeToIntentFamily when planIntentFamily is null", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "exercise_swap" });
    const result = resolveClarificationPendingFamily(null, "swap my squat", "strength");
    expect(mockNormalizeToIntentFamily).toHaveBeenCalledWith("swap my squat", "strength");
    expect(result).toBe("exercise_swap");
  });

  it("calls normalizeToIntentFamily when planIntentFamily is undefined", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "increase_volume" });
    const result = resolveClarificationPendingFamily(undefined, "add sets", null);
    expect(mockNormalizeToIntentFamily).toHaveBeenCalledWith("add sets", undefined);
    expect(result).toBe("increase_volume");
  });

  it("calls normalizeToIntentFamily when planIntentFamily is the sentinel 'clarification_required'", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "exercise_swap" });
    const result = resolveClarificationPendingFamily("clarification_required", "change something", "strength");
    expect(mockNormalizeToIntentFamily).toHaveBeenCalled();
    expect(result).toBe("exercise_swap");
  });

  it("calls normalizeToIntentFamily when planIntentFamily is empty string (falsy)", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "coaching_question" });
    const result = resolveClarificationPendingFamily("", "how many sets?", null);
    expect(mockNormalizeToIntentFamily).toHaveBeenCalled();
    expect(result).toBe("coaching_question");
  });

  // ── double-fallback guard ───────────────────────────────────────────────────

  it("returns 'clarification_required' when normalizeToIntentFamily also returns the sentinel", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "clarification_required" });
    const result = resolveClarificationPendingFamily(null, "...", null);
    expect(result).toBe("clarification_required");
  });

  // ── focusMode threading ─────────────────────────────────────────────────────

  it("passes focusMode through to normalizeToIntentFamily", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "speed_focus" });
    resolveClarificationPendingFamily(null, "make it faster", "speed");
    expect(mockNormalizeToIntentFamily).toHaveBeenCalledWith("make it faster", "speed");
  });

  it("passes undefined to normalizeToIntentFamily when focusMode is null", () => {
    mockNormalizeToIntentFamily.mockReturnValue({ family: "coaching_question" });
    resolveClarificationPendingFamily(null, "help me", null);
    expect(mockNormalizeToIntentFamily).toHaveBeenCalledWith("help me", undefined);
  });
});

// ─── formatChoiceCard ─────────────────────────────────────────────────────────

describe("formatChoiceCard", () => {
  const card = {
    prompt: "Which exercise do you mean?",
    choices: [
      { label: "Back squat", action: "back_squat" },
      { label: "Front squat", action: "front_squat" },
      { label: "Goblet squat", action: "goblet_squat" },
    ],
  };

  // ── content ────────────────────────────────────────────────────────────────

  it("prefixes each choice with its 1-based index", () => {
    const { content } = formatChoiceCard(card);
    expect(content).toContain("1. Back squat");
    expect(content).toContain("2. Front squat");
    expect(content).toContain("3. Goblet squat");
  });

  it("opens content with the card prompt", () => {
    const { content } = formatChoiceCard(card);
    expect(content.startsWith("Which exercise do you mean?")).toBe(true);
  });

  it("separates prompt from choices with a blank line", () => {
    const { content } = formatChoiceCard(card);
    expect(content).toContain("Which exercise do you mean?\n\n1.");
  });

  it("handles a single choice", () => {
    const single = { prompt: "Confirm?", choices: [{ label: "Yes", action: "yes" }] };
    const { content } = formatChoiceCard(single);
    expect(content).toBe("Confirm?\n\n1. Yes");
  });

  // ── structuredData ─────────────────────────────────────────────────────────

  it("structuredData is valid JSON", () => {
    const { structuredData } = formatChoiceCard(card);
    expect(() => JSON.parse(structuredData)).not.toThrow();
  });

  it("structuredData _type is 'action_choice_card'", () => {
    const { structuredData } = formatChoiceCard(card);
    expect(JSON.parse(structuredData)._type).toBe("action_choice_card");
  });

  it("structuredData contains the original prompt and choices", () => {
    const { structuredData } = formatChoiceCard(card);
    const parsed = JSON.parse(structuredData);
    expect(parsed.prompt).toBe(card.prompt);
    expect(parsed.choices).toEqual(card.choices);
  });

  it("structuredData spreads the card — no extra fields lost", () => {
    const extended = { prompt: "Pick one", choices: [{ label: "A", action: "a" }] };
    const { structuredData } = formatChoiceCard(extended);
    const parsed = JSON.parse(structuredData);
    expect(parsed).toMatchObject({ _type: "action_choice_card", prompt: "Pick one" });
  });

  // ── label-only rendering (action field not in content) ────────────────────

  it("content uses the label, not the action string", () => {
    const { content } = formatChoiceCard(card);
    expect(content).not.toContain("back_squat");
    expect(content).not.toContain("front_squat");
  });
});

// ─── formatSafetyRefusal ──────────────────────────────────────────────────────

describe("formatSafetyRefusal", () => {
  // ── default message ────────────────────────────────────────────────────────

  it("returns the default message when safetyRefusal is undefined", () => {
    const { content } = formatSafetyRefusal(undefined);
    expect(content).toMatch(/can't design sessions intended to cause pain/i);
  });

  it("returns the default message when safetyRefusal has no message property (undefined arg)", () => {
    const { content } = formatSafetyRefusal(undefined);
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  // ── custom message ─────────────────────────────────────────────────────────

  it("returns the custom message when safetyRefusal.message is provided", () => {
    const { content } = formatSafetyRefusal({ message: "This request is unsafe." });
    expect(content).toBe("This request is unsafe.");
  });

  it("does not fall back to default when a non-empty custom message is given", () => {
    const { content } = formatSafetyRefusal({ message: "Custom refusal." });
    expect(content).not.toMatch(/can't design sessions/i);
  });

  // ── structuredData ─────────────────────────────────────────────────────────

  it("structuredData is valid JSON", () => {
    expect(() => JSON.parse(formatSafetyRefusal(undefined).structuredData)).not.toThrow();
  });

  it("structuredData _type is 'safety_refusal'", () => {
    const { structuredData } = formatSafetyRefusal(undefined);
    expect(JSON.parse(structuredData)._type).toBe("safety_refusal");
  });

  it("structuredData _type is 'safety_refusal' for custom message too", () => {
    const { structuredData } = formatSafetyRefusal({ message: "Stop." });
    expect(JSON.parse(structuredData)._type).toBe("safety_refusal");
  });

  it("structuredData contains no other fields beyond _type", () => {
    const parsed = JSON.parse(formatSafetyRefusal(undefined).structuredData);
    expect(Object.keys(parsed)).toEqual(["_type"]);
  });
});

// ─── formatSaveProgram ────────────────────────────────────────────────────────

describe("formatSaveProgram", () => {
  const program = { programName: "12-Week Strength Block", weeks: 12, days: [] };

  // ── baseContent — success ──────────────────────────────────────────────────

  it("success: baseContent includes the program name", () => {
    const { baseContent } = formatSaveProgram(true, program);
    expect(baseContent).toContain("12-Week Strength Block");
  });

  it("success: baseContent mentions 'saved to your training system'", () => {
    const { baseContent } = formatSaveProgram(true, program);
    expect(baseContent).toMatch(/saved to your training system/i);
  });

  // ── baseContent — failure with program ────────────────────────────────────

  it("failure + program present: baseContent is a system-error message", () => {
    const { baseContent } = formatSaveProgram(false, program);
    expect(baseContent).toMatch(/wasn't able to save/i);
  });

  it("failure + program present: baseContent does not include the program name", () => {
    const { baseContent } = formatSaveProgram(false, program);
    expect(baseContent).not.toContain("12-Week Strength Block");
  });

  // ── baseContent — no program ───────────────────────────────────────────────

  it("no program (null): baseContent is a 'nothing to save yet' message", () => {
    const { baseContent } = formatSaveProgram(false, null);
    expect(baseContent).toMatch(/no program ready to save/i);
  });

  it("no program (undefined): baseContent is a 'nothing to save yet' message", () => {
    const { baseContent } = formatSaveProgram(false, undefined);
    expect(baseContent).toMatch(/no program ready to save/i);
  });

  // ── structuredData ─────────────────────────────────────────────────────────

  it("structuredData is the JSON-serialized program when program exists", () => {
    const { structuredData } = formatSaveProgram(true, program);
    expect(structuredData).not.toBeNull();
    expect(JSON.parse(structuredData!)).toMatchObject({ programName: "12-Week Strength Block" });
  });

  it("structuredData is null when no program", () => {
    expect(formatSaveProgram(false, null).structuredData).toBeNull();
    expect(formatSaveProgram(false, undefined).structuredData).toBeNull();
  });

  it("structuredData is non-null even on failure if program was present", () => {
    const { structuredData } = formatSaveProgram(false, program);
    expect(structuredData).not.toBeNull();
  });

  // ── three outcomes are distinct ────────────────────────────────────────────

  it("success and failure messages are different strings", () => {
    const success = formatSaveProgram(true, program).baseContent;
    const failure = formatSaveProgram(false, program).baseContent;
    expect(success).not.toBe(failure);
  });

  it("failure-with-program and no-program messages are different strings", () => {
    const failureWithProgram = formatSaveProgram(false, program).baseContent;
    const noProgram = formatSaveProgram(false, null).baseContent;
    expect(failureWithProgram).not.toBe(noProgram);
  });
});

// ─── formatSystemEditData ─────────────────────────────────────────────────────

describe("formatSystemEditData", () => {
  const base = {
    changeSummary: "Swapped bench press for dumbbell press",
    changedIds: { exercises: [42], sessions: [], weeks: [], phases: [] },
    systemId: 7,
    changeLogId: 99,
    verificationStatus: "verified",
    coachReasoning: "Equipment constraint applied.",
  };

  it("_type is always 'system_edit'", () => {
    expect(formatSystemEditData(base)._type).toBe("system_edit");
  });

  it("preserves changeSummary", () => {
    expect(formatSystemEditData(base).changeSummary).toBe(base.changeSummary);
  });

  it("preserves changedIds (by reference)", () => {
    expect(formatSystemEditData(base).changedIds).toBe(base.changedIds);
  });

  it("preserves systemId", () => {
    expect(formatSystemEditData(base).systemId).toBe(7);
  });

  it("preserves changeLogId when set", () => {
    expect(formatSystemEditData(base).changeLogId).toBe(99);
  });

  it("preserves changeLogId when null", () => {
    const result = formatSystemEditData({ ...base, changeLogId: null });
    expect(result.changeLogId).toBeNull();
  });

  it("preserves changeLogId when undefined", () => {
    const result = formatSystemEditData({ ...base, changeLogId: undefined });
    expect(result.changeLogId).toBeUndefined();
  });

  it("preserves verificationStatus", () => {
    expect(formatSystemEditData(base).verificationStatus).toBe("verified");
  });

  it("preserves coachReasoning when set", () => {
    expect(formatSystemEditData(base).coachReasoning).toBe("Equipment constraint applied.");
  });

  it("preserves coachReasoning when null", () => {
    const result = formatSystemEditData({ ...base, coachReasoning: null });
    expect(result.coachReasoning).toBeNull();
  });

  it("result serializes to valid JSON", () => {
    expect(() => JSON.stringify(formatSystemEditData(base))).not.toThrow();
  });

  it("serialized JSON contains _type: 'system_edit'", () => {
    const parsed = JSON.parse(JSON.stringify(formatSystemEditData(base)));
    expect(parsed._type).toBe("system_edit");
  });
});

// ─── formatMutationFailureContent ────────────────────────────────────────────

describe("formatMutationFailureContent", () => {
  // ── verb selection ─────────────────────────────────────────────────────────

  it("'add' → 'add that exercise'", () => {
    expect(formatMutationFailureContent("add")).toContain("add that exercise");
  });

  it("'remove' → 'remove that exercise'", () => {
    expect(formatMutationFailureContent("remove")).toContain("remove that exercise");
  });

  it("'swap' → 'swap that exercise'", () => {
    expect(formatMutationFailureContent("swap")).toContain("swap that exercise");
  });

  it("unknown type → 'apply that change'", () => {
    expect(formatMutationFailureContent("progression")).toContain("apply that change");
  });

  it("null → 'apply that change'", () => {
    expect(formatMutationFailureContent(null)).toContain("apply that change");
  });

  it("undefined → 'apply that change'", () => {
    expect(formatMutationFailureContent(undefined)).toContain("apply that change");
  });

  // ── message invariants ─────────────────────────────────────────────────────

  it("always starts with \"I wasn't able to\"", () => {
    for (const t of ["add", "remove", "swap", null]) {
      expect(formatMutationFailureContent(t)).toMatch(/^I wasn't able to/);
    }
  });

  it("always mentions that program was not modified", () => {
    expect(formatMutationFailureContent("add")).toMatch(/program hasn't been modified/i);
  });

  it("add and remove messages are different strings", () => {
    expect(formatMutationFailureContent("add")).not.toBe(formatMutationFailureContent("remove"));
  });
});
