/**
 * Phase 3 — Coaching Quality Tests
 *
 * Covers the deterministic coaching intelligence improvements from Phase 3:
 *
 *  1. validatePainConstraints  — PAIN_RISK_MAP deterministic checks (constraint-memory.ts)
 *  2. sortExercisesCoachOrder  — Session exercise ordering after mutations (exercise-service.ts)
 *  3. Intent family routing    — Deterministic patterns for fatigue, strength, hypertrophy,
 *                                athletic/explosive (intent-family-engine.ts, no mock needed)
 *  4. Vague-guard no-regression — "make it better" / "improve it" must never become a mutation
 *
 * Test philosophy: no DB calls, no LLM calls, no network.
 * All functions under test are pure or have DB dependencies mocked out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @workspace/db before importing DB-dependent modules ──────────────────
// exercise-service.ts and constraint-memory.ts both import from @workspace/db
// at the module level. We mock the module so imports resolve without a real DB.
vi.mock("@workspace/db", () => ({
  db: {},
  exerciseLibrary: {},
}));

import { validatePainConstraints, type PainConstraintWarning } from "../constraint-memory";
import { sortExercisesCoachOrder } from "../exercise-service";
import { normalizeToIntentFamily } from "../intent-family-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ProgramStructure-shaped object for testing. */
function makeProgram(...exerciseNames: string[]) {
  return {
    days: [
      {
        dayIndex: 0,
        label: "Day 1",
        theme: "Test",
        exercises: exerciseNames.map((name) => ({
          name,
          sets: 3,
          reps: "8-10",
          rest: "90s",
          notes: "",
          coachNote: "",
        })),
      },
    ],
  };
}

/** Build a minimal HardConstraints-shaped object for testing. */
function makeConstraints(
  painRegions: string[] = [],
  monitorRegions: string[] = [],
  bannedItems: string[] = [],
) {
  return {
    bannedItems,
    dislikedItems: [],
    painRegions,
    monitorRegions,
    sport: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. validatePainConstraints
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePainConstraints — shoulder pain", () => {
  it("Upright Row with shoulder pain → critical warning", () => {
    const program = makeProgram("Upright Row");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    const w = warnings.find((x: PainConstraintWarning) => x.exerciseName === "Upright Row");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("critical");
    expect(w?.painRegion).toBe("shoulder");
  });

  it("Behind Neck Press with shoulder pain → critical warning", () => {
    const program = makeProgram("Behind Neck Press");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    const w = warnings.find((x: PainConstraintWarning) => x.exerciseName === "Behind Neck Press");
    expect(w?.severity).toBe("critical");
  });

  it("Overhead Press with shoulder pain → monitor warning (not critical)", () => {
    const program = makeProgram("Overhead Press");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    const w = warnings.find((x: PainConstraintWarning) => x.exerciseName === "Overhead Press");
    expect(w?.severity).toBe("warning");
  });

  it("Goblet Squat with shoulder pain → no warning (safe exercise)", () => {
    const program = makeProgram("Goblet Squat");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBe(0);
  });
});

describe("validatePainConstraints — lower back pain", () => {
  it("Good Morning with lower back pain → critical warning", () => {
    const program = makeProgram("Good Morning");
    const constraints = makeConstraints(["lower back"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe("critical");
    expect(warnings[0].painRegion).toBe("lower back");
  });

  it("Conventional Deadlift with lower back pain → monitor warning", () => {
    const program = makeProgram("Conventional Deadlift");
    const constraints = makeConstraints(["lower back"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe("warning");
  });

  it("Push-Up with lower back pain → no warning", () => {
    const program = makeProgram("Push-Up");
    const constraints = makeConstraints(["lower back"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBe(0);
  });
});

describe("validatePainConstraints — wrist pain", () => {
  it("Front Squat with wrist pain → critical (front rack position)", () => {
    const program = makeProgram("Front Squat");
    const constraints = makeConstraints(["wrist"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe("critical");
  });

  it("Back Squat with wrist pain → no warning (no front rack)", () => {
    const program = makeProgram("Back Squat");
    const constraints = makeConstraints(["wrist"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBe(0);
  });
});

describe("validatePainConstraints — knee pain (monitor region)", () => {
  it("Box Jump with knee in monitor region → warning", () => {
    const program = makeProgram("Box Jump");
    const constraints = makeConstraints([], ["knee"]); // monitor, not pain
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe("warning");
  });

  it("Goblet Squat with knee in monitor region → no warning", () => {
    const program = makeProgram("Goblet Squat");
    const constraints = makeConstraints([], ["knee"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBe(0);
  });
});

describe("validatePainConstraints — no active regions", () => {
  it("No pain regions → no warnings even for high-risk exercises", () => {
    const program = makeProgram("Upright Row", "Good Morning", "Front Squat");
    const constraints = makeConstraints([], []);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBe(0);
  });

  it("Shoulder monitor region fires warnings (not hard blocks)", () => {
    const program = makeProgram("Overhead Press");
    const constraints = makeConstraints([], ["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe("warning");
  });

  it("Multiple exercises — each is checked independently", () => {
    const program = makeProgram("Upright Row", "Overhead Press", "Goblet Squat");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    const names = warnings.map((w: PainConstraintWarning) => w.exerciseName);
    expect(names).toContain("Upright Row");
    expect(names).toContain("Overhead Press");
    expect(names).not.toContain("Goblet Squat");
  });

  it("Critical takes precedence over monitor for same exercise", () => {
    // "Upright Row" is critical for shoulder — should not get a second monitor warning
    const program = makeProgram("Upright Row");
    const constraints = makeConstraints(["shoulder"]);
    const warnings = validatePainConstraints(program as any, constraints as any);
    const uprightWarnings = warnings.filter(
      (w: PainConstraintWarning) => w.exerciseName === "Upright Row" && w.painRegion === "shoulder"
    );
    // Exactly one warning for this combo (critical, not a duplicate monitor entry)
    expect(uprightWarnings.length).toBe(1);
    expect(uprightWarnings[0].severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. sortExercisesCoachOrder
// ─────────────────────────────────────────────────────────────────────────────

describe("sortExercisesCoachOrder — canonical session ordering", () => {
  it("Power/plyometric before primary strength", () => {
    const exercises = [
      { name: "Back Squat", role: "primary_strength" },
      { name: "Box Jump", role: "power_explosive" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Box Jump");
    expect(sorted[1].name).toBe("Back Squat");
  });

  it("Primary strength before hypertrophy accessories", () => {
    const exercises = [
      { name: "Leg Curl", role: "hypertrophy_accessory" },
      { name: "Deadlift", role: "primary_strength" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Deadlift");
    expect(sorted[1].name).toBe("Leg Curl");
  });

  it("Secondary compound before unilateral work", () => {
    const exercises = [
      { name: "Split Squat", role: "unilateral_strength" },
      { name: "Romanian Deadlift", role: "secondary_compound" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Romanian Deadlift");
    expect(sorted[1].name).toBe("Split Squat");
  });

  it("Core/trunk after accessories, before conditioning", () => {
    const exercises = [
      { name: "Sled Push", role: "conditioning" },
      { name: "Pallof Press", role: "trunk_core" },
      { name: "Leg Curl", role: "hypertrophy_accessory" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Leg Curl");
    expect(sorted[1].name).toBe("Pallof Press");
    expect(sorted[2].name).toBe("Sled Push");
  });

  it("Mobility/prep as finisher (last in session)", () => {
    const exercises = [
      { name: "Hip 90/90 Rotation", role: "mobility_prep" },
      { name: "Back Squat", role: "primary_strength" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Back Squat");
    expect(sorted[1].name).toBe("Hip 90/90 Rotation");
  });

  it("Full canonical order: power → primary → secondary → unilateral → accessory → core → conditioning → mobility", () => {
    const exercises = [
      { name: "Hip Flexor Stretch", role: "mobility_prep" },
      { name: "Romanian Deadlift", role: "secondary_compound" },
      { name: "Med Ball Slam", role: "power_explosive" },
      { name: "Pallof Press", role: "trunk_core" },
      { name: "Back Squat", role: "primary_strength" },
      { name: "Sled Push", role: "conditioning" },
      { name: "Leg Curl", role: "hypertrophy_accessory" },
      { name: "Bulgarian Split Squat", role: "unilateral_strength" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Med Ball Slam");         // power
    expect(sorted[1].name).toBe("Back Squat");            // primary
    expect(sorted[2].name).toBe("Romanian Deadlift");     // secondary
    expect(sorted[3].name).toBe("Bulgarian Split Squat"); // unilateral
    expect(sorted[4].name).toBe("Leg Curl");              // accessory
    expect(sorted[5].name).toBe("Pallof Press");          // core
    expect(sorted[6].name).toBe("Sled Push");             // conditioning
    expect(sorted[7].name).toBe("Hip Flexor Stretch");    // mobility
  });

  it("Does NOT mutate the original array", () => {
    const exercises = [
      { name: "Leg Curl", role: "hypertrophy_accessory" },
      { name: "Box Jump", role: "power_explosive" },
    ];
    const originalFirst = exercises[0].name;
    sortExercisesCoachOrder(exercises);
    expect(exercises[0].name).toBe(originalFirst); // original unchanged
  });

  it("Unknown roles sort to end of session", () => {
    const exercises = [
      { name: "Mystery Move", role: "some_unrecognized_role" },
      { name: "Back Squat", role: "primary_strength" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Back Squat");
    expect(sorted[1].name).toBe("Mystery Move");
  });

  it("Null/undefined role sorts to end of session", () => {
    const exercises = [
      { name: "No-Role Exercise", role: null },
      { name: "Box Jump", role: "power_explosive" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    expect(sorted[0].name).toBe("Box Jump");
    expect(sorted[1].name).toBe("No-Role Exercise");
  });

  it("Stable sort — equal-role exercises preserve relative order", () => {
    const exercises = [
      { name: "Bench Press", role: "primary_strength" },
      { name: "Back Squat", role: "primary_strength" },
    ];
    const sorted = sortExercisesCoachOrder(exercises);
    // Both are primary_strength; relative order preserved
    expect(sorted[0].name).toBe("Bench Press");
    expect(sorted[1].name).toBe("Back Squat");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Intent routing — deterministic intent-family-engine tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Intent routing — fatigue / deload management", () => {
  // The intent-family-engine maps deload phrases to recovery_focus or fatigue_management.
  // Both are valid deload-related families — the execution planner's PRE_CLASSIFY_PATTERNS
  // also catch short deload phrases before reaching the intent engine.
  // These tests verify the phrases are NOT misrouted to a structural mutation family.
  const DELOAD_FAMILIES = new Set(["fatigue_management", "recovery_focus"]);

  it("'deload' → a fatigue or deload family (not a structural mutation)", () => {
    const result = normalizeToIntentFamily("deload");
    expect(DELOAD_FAMILIES.has(result.family)).toBe(true);
  });

  it("'deload week' → a fatigue or deload family", () => {
    const result = normalizeToIntentFamily("deload week");
    expect(DELOAD_FAMILIES.has(result.family)).toBe(true);
  });

  it("'recovery week' → a fatigue or deload family", () => {
    const result = normalizeToIntentFamily("recovery week");
    expect(DELOAD_FAMILIES.has(result.family)).toBe(true);
  });

  it("'give me a deload' → a fatigue or deload family", () => {
    const result = normalizeToIntentFamily("give me a deload");
    expect(DELOAD_FAMILIES.has(result.family)).toBe(true);
  });

  it("'I need a recovery week' → a fatigue or deload family", () => {
    const result = normalizeToIntentFamily("I need a recovery week");
    expect(DELOAD_FAMILIES.has(result.family)).toBe(true);
  });

  it("deload phrases do NOT route to increase_difficulty or rebuild families", () => {
    const structuralFamilies = new Set([
      "increase_difficulty",
      "increase_volume",
      "session_expansion",
      "new_program_request",
      "power_explosive_focus",
    ]);
    const result = normalizeToIntentFamily("deload week");
    expect(structuralFamilies.has(result.family)).toBe(false);
  });
});

describe("Intent routing — strength and hypertrophy focus", () => {
  it("'more strength work' → strength_focus", () => {
    expect(normalizeToIntentFamily("add more strength work").family).toBe("strength_focus");
  });

  it("'more hypertrophy' → hypertrophy_focus", () => {
    expect(normalizeToIntentFamily("more hypertrophy").family).toBe("hypertrophy_focus");
  });

  it("'build more muscle' → hypertrophy_focus", () => {
    expect(normalizeToIntentFamily("build more muscle").family).toBe("hypertrophy_focus");
  });

  it("'add more muscle' → hypertrophy_focus", () => {
    expect(normalizeToIntentFamily("add more muscle").family).toBe("hypertrophy_focus");
  });
});

describe("Intent routing — athletic / explosive (no-regression)", () => {
  it("'more explosive' → power_explosive_focus", () => {
    expect(normalizeToIntentFamily("more explosive").family).toBe("power_explosive_focus");
  });

  it("'make it more explosive' → power_explosive_focus", () => {
    expect(normalizeToIntentFamily("make it more explosive").family).toBe("power_explosive_focus");
  });

  it("'more athletic' → athletic_performance_focus", () => {
    expect(normalizeToIntentFamily("more athletic").family).toBe("athletic_performance_focus");
  });

  it("'make it more athletic' → athletic_performance_focus", () => {
    expect(normalizeToIntentFamily("make it more athletic").family).toBe(
      "athletic_performance_focus"
    );
  });

  it("'add some grit' → directional coaching family (caught by execution planner if LLM falls through)", () => {
    // "Add some grit" has clear coaching direction. The intent-family-engine alone may
    // return clarification_required, but DIRECTIONAL_INFERENCE_PATTERNS in execution-planner
    // catch this before the LLM is called and route to athletic_performance_focus.
    // Both outcomes are acceptable — what matters is it is NOT silently mutating to a
    // random family without coaching direction.
    const result = normalizeToIntentFamily("add some grit");
    const DIRECTIONAL_OR_CLARIFICATION = new Set([
      "athletic_performance_focus",
      "power_explosive_focus",
      "conditioning_focus",
      "clarification_required", // acceptable — execution planner catches before LLM
    ]);
    expect(DIRECTIONAL_OR_CLARIFICATION.has(result.family)).toBe(true);
  });
});

describe("Intent routing — difficulty adjustment", () => {
  it("'make it harder' → increase_difficulty", () => {
    expect(normalizeToIntentFamily("make it harder").family).toBe("increase_difficulty");
  });

  it("'make it easier' → decrease_difficulty", () => {
    expect(normalizeToIntentFamily("make it easier").family).toBe("decrease_difficulty");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Vague-guard no-regression — direction-free phrases must never become mutations
// ─────────────────────────────────────────────────────────────────────────────

describe("Vague improvement guard — no-regression", () => {
  const MUTATION_FAMILIES = new Set([
    "increase_difficulty",
    "decrease_difficulty",
    "increase_volume",
    "decrease_volume",
    "reduce_time",
    "increase_time",
    "strength_focus",
    "hypertrophy_focus",
    "endurance_focus",
    "conditioning_focus",
    "power_explosive_focus",
    "athletic_performance_focus",
    "fatigue_management",
    "session_expansion",
    "session_reduction",
    "add_exercise",
    "exercise_swap",
  ]);

  it("'make it better' does NOT route to a direct mutation family", () => {
    const result = normalizeToIntentFamily("make it better");
    // Must not silently mutate — should be clarification_required or coaching_question
    expect(MUTATION_FAMILIES.has(result.family)).toBe(false);
  });

  it("'improve it' does NOT route to a direct mutation family", () => {
    const result = normalizeToIntentFamily("improve it");
    expect(MUTATION_FAMILIES.has(result.family)).toBe(false);
  });

  it("'optimize it' does NOT route to a direct mutation family", () => {
    const result = normalizeToIntentFamily("optimize it");
    expect(MUTATION_FAMILIES.has(result.family)).toBe(false);
  });

  it("'make it better' does NOT route to increase_difficulty specifically", () => {
    expect(normalizeToIntentFamily("make it better").family).not.toBe("increase_difficulty");
  });
});
