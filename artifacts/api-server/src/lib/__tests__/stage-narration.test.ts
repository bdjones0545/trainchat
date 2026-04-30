/**
 * Tests for buildStageNarration
 *
 * Covers:
 *  1. Build flow (PROGRAM_GENERATION) — goal + days context
 *  2. Build flow with sport context
 *  3. Build flow with limited equipment
 *  4. Build flow with pain context
 *  5. Mutation flow (APPLY_MUTATION) — swap
 *  6. Mutation flow — remove
 *  7. Mutation flow — add
 *  8. Mutation flow — pain adjustment
 *  9. Guidance flow (GUIDANCE)
 * 10. Early stages (understanding + loading) — keyword hints only
 * 11. Missing context fallbacks (no goal, no days)
 * 12. Never exposes internal system terms
 * 13. Rebuild flow (REBUILD_PROGRAM)
 * 14. buildStageEvent includes narration field when context provided
 * 15. buildStageEvent omits narration field when no context
 * 16. All stages produce non-empty narration for a full build context
 */

import { describe, it, expect } from "vitest";
import { buildStageNarration, type NarrationContext } from "../stage-narration";
import { buildStageEvent } from "../build-pipeline";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fullBuildCtx: NarrationContext = {
  action: "PROGRAM_GENERATION",
  intentFamily: "program_design",
  goal: "strength",
  daysPerWeek: 4,
  equipment: "barbell",
  sport: null,
  sessionDuration: 60,
  hasPain: false,
  userMessageHint: "build me a 4-day strength program",
};

const sportBuildCtx: NarrationContext = {
  action: "PROGRAM_GENERATION",
  intentFamily: "program_design",
  goal: "athletic_performance",
  daysPerWeek: 5,
  equipment: "barbell",
  sport: "basketball",
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "build a basketball training program",
};

const limitedEquipCtx: NarrationContext = {
  action: "PROGRAM_GENERATION",
  intentFamily: "program_design",
  goal: "hypertrophy",
  daysPerWeek: 3,
  equipment: "home gym",
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "home gym program",
};

const painBuildCtx: NarrationContext = {
  action: "PROGRAM_GENERATION",
  intentFamily: "program_design",
  goal: "strength",
  daysPerWeek: 4,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: true,
  userMessageHint: "build a program, I have a bad knee",
};

const swapCtx: NarrationContext = {
  action: "APPLY_MUTATION",
  intentFamily: "exercise_swap",
  mutationType: "swap",
  goal: null,
  daysPerWeek: null,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "swap squats for leg press",
};

const removeCtx: NarrationContext = {
  action: "APPLY_MUTATION",
  intentFamily: "remove_exercise",
  mutationType: "remove",
  goal: null,
  daysPerWeek: null,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "remove Romanian deadlifts",
};

const addCtx: NarrationContext = {
  action: "APPLY_MUTATION",
  intentFamily: "add_exercise",
  mutationType: "add",
  goal: null,
  daysPerWeek: null,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "add face pulls",
};

const painMutationCtx: NarrationContext = {
  action: "APPLY_MUTATION",
  intentFamily: "injury_modification",
  mutationType: null,
  goal: null,
  daysPerWeek: null,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: true,
  userMessageHint: "my shoulder hurts",
};

const guidanceCtx: NarrationContext = {
  action: "GUIDANCE",
  intentFamily: "coaching_question",
  mutationType: null,
  goal: null,
  daysPerWeek: null,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "why do I need rest days",
};

const earlyCtx: NarrationContext = {
  action: "",
  userMessageHint: "build me a 4-day strength program",
};

const rebuildCtx: NarrationContext = {
  action: "REBUILD_PROGRAM",
  intentFamily: null,
  goal: "hypertrophy",
  daysPerWeek: 3,
  equipment: null,
  sport: null,
  sessionDuration: null,
  hasPain: false,
  userMessageHint: "restructure to 3-day split",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Forbidden internal terms that should never appear in narration. */
const FORBIDDEN_TERMS = [
  "execPlan", "intentFamily", "SSE", "buildStageEvent", "mutation.type",
  "PROGRAM_GENERATION", "APPLY_MUTATION", "DIRECT_MUTATION", "GUIDANCE",
  "extractedConstraints", "classifyIntent", "pipeline", "handler",
];

function assertNoInternalTerms(text: string) {
  for (const term of FORBIDDEN_TERMS) {
    expect(text.toLowerCase()).not.toContain(term.toLowerCase());
  }
}

// ─── Test 1: Build flow — goal + days context ─────────────────────────────────

describe("buildStageNarration — build flow (PROGRAM_GENERATION)", () => {
  it("understanding: uses build keyword hint", () => {
    const text = buildStageNarration("understanding", earlyCtx);
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(5);
  });

  it("classifying: includes goal and day count", () => {
    const text = buildStageNarration("classifying", fullBuildCtx);
    expect(text).toMatch(/4-day/);
    expect(text).toMatch(/strength/i);
  });

  it("planning: references days or session structure", () => {
    const text = buildStageNarration("planning", fullBuildCtx);
    expect(text).toMatch(/4-day|4 sessions|recovery|split|minutes/i);
  });

  it("applying: mentions selecting lifts or balance", () => {
    const text = buildStageNarration("applying", fullBuildCtx);
    expect(text).toMatch(/lift|balance|select|accessory/i);
  });

  it("validating: final check language", () => {
    const text = buildStageNarration("validating", fullBuildCtx);
    expect(text).toMatch(/check|final|balance|4-day/i);
  });

  it("saving: 'active system' or 'your program'", () => {
    const text = buildStageNarration("saving", fullBuildCtx);
    expect(text).toMatch(/program|system/i);
  });
});

// ─── Test 2: Build flow with sport context ────────────────────────────────────

describe("buildStageNarration — sport context", () => {
  it("planning: references sport", () => {
    const text = buildStageNarration("planning", sportBuildCtx);
    expect(text).toMatch(/basketball/i);
  });

  it("applying: mentions sport transfer", () => {
    const text = buildStageNarration("applying", sportBuildCtx);
    expect(text).toMatch(/basketball/i);
  });
});

// ─── Test 3: Build flow with limited equipment ────────────────────────────────

describe("buildStageNarration — limited equipment", () => {
  it("planning: produces valid coaching text (may use split or equipment language)", () => {
    const text = buildStageNarration("planning", limitedEquipCtx);
    expect(text).toBeTruthy();
    expect(text.trim().length).toBeGreaterThan(5);
    assertNoInternalTerms(text);
  });

  it("applying: references equipment constraint", () => {
    const text = buildStageNarration("applying", limitedEquipCtx);
    expect(text).toMatch(/equipment|available/i);
  });
});

// ─── Test 4: Build flow with pain ────────────────────────────────────────────

describe("buildStageNarration — pain context in build", () => {
  it("understanding: acknowledges careful approach", () => {
    const text = buildStageNarration("understanding", painBuildCtx);
    expect(text).toMatch(/careful|around/i);
  });

  it("planning: pain-aware language", () => {
    const text = buildStageNarration("planning", painBuildCtx);
    expect(text).toMatch(/affected|area|load|reduce|away/i);
  });

  it("applying: keeps session productive", () => {
    const text = buildStageNarration("applying", painBuildCtx);
    expect(text).toMatch(/area|stress|productive|affected/i);
  });
});

// ─── Test 5: Mutation flow — swap ────────────────────────────────────────────

describe("buildStageNarration — swap mutation", () => {
  it("understanding: swap-specific confirmation", () => {
    const text = buildStageNarration("understanding", swapCtx);
    expect(text).toMatch(/swap|out/i);
  });

  it("classifying: swap planning language", () => {
    const text = buildStageNarration("classifying", swapCtx);
    expect(text).toMatch(/swap/i);
  });

  it("planning: finding replacement", () => {
    const text = buildStageNarration("planning", swapCtx);
    expect(text).toMatch(/replacement|movement/i);
  });

  it("applying: applying the swap", () => {
    const text = buildStageNarration("applying", swapCtx);
    expect(text).toMatch(/swap|applying/i);
  });

  it("saving: mutation-specific save language", () => {
    const text = buildStageNarration("saving", swapCtx);
    expect(text).toMatch(/change|updated|saving/i);
  });
});

// ─── Test 6: Mutation flow — remove ──────────────────────────────────────────

describe("buildStageNarration — remove mutation", () => {
  it("planning: remove-specific language", () => {
    const text = buildStageNarration("planning", removeCtx);
    expect(text).toMatch(/remove|removal/i);
  });

  it("applying: adjusting volume", () => {
    const text = buildStageNarration("applying", removeCtx);
    expect(text).toMatch(/remov|adjust|volume/i);
  });
});

// ─── Test 7: Mutation flow — add ─────────────────────────────────────────────

describe("buildStageNarration — add mutation", () => {
  it("planning: add-specific language", () => {
    const text = buildStageNarration("planning", addCtx);
    expect(text).toMatch(/addition|place|volume/i);
  });

  it("applying: adding in session", () => {
    const text = buildStageNarration("applying", addCtx);
    expect(text).toMatch(/adding|session/i);
  });
});

// ─── Test 8: Mutation flow — pain adjustment ──────────────────────────────────

describe("buildStageNarration — pain mutation", () => {
  it("understanding: careful approach", () => {
    const text = buildStageNarration("understanding", painMutationCtx);
    expect(text).toMatch(/careful|around/i);
  });

  it("planning: safer alternatives language", () => {
    const text = buildStageNarration("planning", painMutationCtx);
    expect(text).toMatch(/safer|alternative|stress|area/i);
  });

  it("applying: reducing stress on area", () => {
    const text = buildStageNarration("applying", painMutationCtx);
    expect(text).toMatch(/area|stress|productive/i);
  });

  it("validating: pain-check language", () => {
    const text = buildStageNarration("validating", painMutationCtx);
    expect(text).toMatch(/stress|adjust|correct/i);
  });
});

// ─── Test 9: Guidance flow ────────────────────────────────────────────────────

describe("buildStageNarration — guidance flow", () => {
  it("classifying: organizing factors language", () => {
    const text = buildStageNarration("classifying", guidanceCtx);
    expect(text).toMatch(/organiz|factor|question/i);
  });

  it("applying: working through the answer", () => {
    const text = buildStageNarration("applying", guidanceCtx);
    expect(text).toMatch(/answer|working/i);
  });

  it("saving: wrapping up language", () => {
    const text = buildStageNarration("saving", guidanceCtx);
    expect(text).toMatch(/wrap/i);
  });
});

// ─── Test 10: Early stages — keyword hints only ───────────────────────────────

describe("buildStageNarration — early stages (understanding, loading)", () => {
  it("understanding with build hint", () => {
    const text = buildStageNarration("understanding", { action: "", userMessageHint: "build me a program" });
    expect(text).toMatch(/build|start/i);
  });

  it("understanding with pain hint", () => {
    const text = buildStageNarration("understanding", { action: "", userMessageHint: "my knee is sore" });
    expect(text).toMatch(/careful|around/i);
  });

  it("understanding with swap hint", () => {
    const text = buildStageNarration("understanding", { action: "", userMessageHint: "swap squats for leg press" });
    expect(text).toMatch(/swap/i);
  });

  it("loading with build action", () => {
    const text = buildStageNarration("loading", { action: "PROGRAM_GENERATION" });
    expect(text).toMatch(/profile|history/i);
  });

  it("loading with mutation action", () => {
    const text = buildStageNarration("loading", { action: "APPLY_MUTATION" });
    expect(text).toMatch(/program|current/i);
  });
});

// ─── Test 11: Missing context fallbacks ──────────────────────────────────────

describe("buildStageNarration — fallbacks when context missing", () => {
  it("classifying with no goal or days", () => {
    const text = buildStageNarration("classifying", { action: "PROGRAM_GENERATION" });
    expect(text).toBeTruthy();
    expect(text).toMatch(/structure|training|program/i);
  });

  it("planning with no days or goal", () => {
    const text = buildStageNarration("planning", { action: "PROGRAM_GENERATION" });
    expect(text).toBeTruthy();
    expect(text).toMatch(/split|structure|balance|recovery/i);
  });

  it("applying with no context at all", () => {
    const text = buildStageNarration("applying", { action: "" });
    expect(text).toBeTruthy();
  });
});

// ─── Test 12: No internal system terms ───────────────────────────────────────

describe("buildStageNarration — no internal terminology", () => {
  const stages: Array<"understanding" | "loading" | "classifying" | "planning" | "applying" | "validating" | "saving"> = [
    "understanding", "loading", "classifying", "planning", "applying", "validating", "saving"
  ];

  for (const stage of stages) {
    it(`${stage} stage — no internal terms`, () => {
      const text = buildStageNarration(stage, fullBuildCtx);
      assertNoInternalTerms(text);
    });
  }

  it("mutation stage narration — no internal terms", () => {
    const text = buildStageNarration("applying", swapCtx);
    assertNoInternalTerms(text);
  });
});

// ─── Test 13: Rebuild flow ────────────────────────────────────────────────────

describe("buildStageNarration — rebuild flow", () => {
  it("classifying: redesign language", () => {
    const text = buildStageNarration("classifying", rebuildCtx);
    expect(text).toMatch(/3-day|restructur|rebuild|program/i);
  });

  it("planning: restructuring split", () => {
    const text = buildStageNarration("planning", rebuildCtx);
    expect(text).toMatch(/restructur|split|3-day/i);
  });

  it("saving: 'updated program' language", () => {
    const text = buildStageNarration("saving", rebuildCtx);
    expect(text).toMatch(/updated|ready|program/i);
  });
});

// ─── Test 14: buildStageEvent includes narration when context provided ────────

describe("buildStageEvent narration integration", () => {
  it("includes narration field when narrationCtx provided", () => {
    const event = buildStageEvent("planning", "CREATE_PROGRAM", "PROGRAM_GENERATION", fullBuildCtx);
    expect(event).toHaveProperty("narration");
    expect(typeof event.narration).toBe("string");
    expect((event.narration as string).length).toBeGreaterThan(5);
  });

  it("narration matches expected build-planning content", () => {
    const event = buildStageEvent("planning", "CREATE_PROGRAM", "PROGRAM_GENERATION", fullBuildCtx);
    expect(event.narration as string).toMatch(/4-day|4 sessions|recovery|split|minutes/i);
  });
});

// ─── Test 15: buildStageEvent omits narration when no context ─────────────────

describe("buildStageEvent without narration context", () => {
  it("omits narration field when no context provided", () => {
    const event = buildStageEvent("planning", "CREATE_PROGRAM", "PROGRAM_GENERATION");
    expect(event).not.toHaveProperty("narration");
  });

  it("still has type, stage, and step fields", () => {
    const event = buildStageEvent("planning", "CREATE_PROGRAM", "PROGRAM_GENERATION");
    expect(event.type).toBe("stage");
    expect(event.stage).toBe("planning");
    expect(typeof event.step).toBe("string");
  });
});

// ─── Test 16: All stages produce non-empty narration for full build ───────────

describe("buildStageNarration — all stages produce output for full build context", () => {
  const stages: Array<"understanding" | "loading" | "classifying" | "planning" | "applying" | "validating" | "saving"> = [
    "understanding", "loading", "classifying", "planning", "applying", "validating", "saving"
  ];

  for (const stage of stages) {
    it(`${stage} returns non-empty string`, () => {
      const text = buildStageNarration(stage, fullBuildCtx);
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(5);
    });
  }
});
