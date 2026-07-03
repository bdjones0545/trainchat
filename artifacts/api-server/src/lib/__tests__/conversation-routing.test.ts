import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveResponseMode, classifyOrchMutationType, shouldBypassEditEngine, DELOAD_INTENT_FAMILIES, resolveClarificationPendingFamily, formatChoiceCard } from "../conversation-routing";
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
