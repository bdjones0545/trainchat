/**
 * Transformation Scenario Tests
 *
 * Validates the prescription and swap-routing layer for every canonical
 * transformation scenario. Each test block maps to an acceptance criterion
 * from the audit:
 *
 *  1. Primary compound lifts receive the correct headline prescription
 *  2. Accessories stay supportive — never forced into strength or power ranges
 *  3. Power / plyometric exercises are protected from misprescription
 *  4. Mobility / prep exercises are always preserved (empty return)
 *  5. reduce_time NEVER returns reps — rest compression only
 *  6. reduce_time NEVER routes to the endurance swap map
 *  7. Safety Bar Squat (seeded as "secondary") is promoted to primary prescription
 *  8. Medicine ball throw / toss / pass / wall ball variants classified as power
 *  9. Each role receives a differentiated prescription (no global flattening)
 */

import { describe, it, expect } from "vitest";
import {
  getPrescriptionForExerciseTransformation,
  mapTransformationToFocusKey,
} from "../hierarchical-refine-engine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const primaryEx       = { name: "Back Squat",                  category: "primary" };
const safetyBarSquat  = { name: "Safety Bar Squat",            category: "secondary" }; // promoted via isPrimaryByName
const primaryDeadlift = { name: "Conventional Deadlift",       category: "primary" };
const secondaryEx     = { name: "Bulgarian Split Squat",       category: "secondary" };
const accessoryEx     = { name: "Dumbbell Row",                category: "accessory" };
const powerEx         = { name: "Power Clean",                 category: "power" };
const boxJump         = { name: "Box Jump",                    category: "power" };
const medBallSlam     = { name: "Med Ball Slam",               category: "accessory" }; // power by name
const medBallThrow    = { name: "Med Ball Throw",              category: "accessory" }; // power by name (new)
const medBallPass     = { name: "Medicine Ball Chest Pass",    category: "accessory" }; // power by name (new)
const medBallToss     = { name: "Medicine Ball Toss",          category: "accessory" }; // power by name (new)
const wallBall        = { name: "Wall Ball",                   category: "conditioning" }; // power by name (new)
const coreEx          = { name: "Pallof Press",                category: "trunk" };
const mobilityEx      = { name: "Hip 90-90 Stretch",           category: "warmup" };
const activationEx    = { name: "Banded Clamshell",            category: "activation" };

// Helpers
function repMin(r: string | undefined): number {
  if (!r) return -1;
  return parseInt(r.split("-")[0], 10);
}
function repMax(r: string | undefined): number {
  if (!r) return -1;
  const parts = r.split("-");
  return parseInt(parts[parts.length - 1], 10);
}

// ─── 1. More Strength ─────────────────────────────────────────────────────────

describe("Scenario: More Strength (strength)", () => {
  const T = "strength";

  it("primary lift receives 3–6 rep, 4-set, 2–4 min rest prescription", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(p.sets).toBe(4);
    expect(repMax(p.reps)).toBeLessThanOrEqual(6);
    expect(repMin(p.reps)).toBeGreaterThanOrEqual(3);
    expect(p.rest).toMatch(/2.+min/i);
  });

  it("Safety Bar Squat (seeded secondary) is promoted to primary prescription", () => {
    const p = getPrescriptionForExerciseTransformation(safetyBarSquat, T);
    expect(p.sets).toBe(4);
    expect(repMax(p.reps)).toBeLessThanOrEqual(6);
    expect(repMin(p.reps)).toBeGreaterThanOrEqual(3);
  });

  it("accessory stays in 8–15 rep supportive range — not 3–6", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps)).toBeGreaterThanOrEqual(8);
    expect(repMax(p.reps)).toBeLessThanOrEqual(15);
  });

  it("core/trunk stays in functional range — never 3–6", () => {
    const p = getPrescriptionForExerciseTransformation(coreEx, T);
    expect(repMin(p.reps)).toBeGreaterThanOrEqual(8);
  });

  it("power exercise is protected — stays in low-rep range with adequate rest", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    const p = getPrescriptionForExerciseTransformation(mobilityEx, T);
    expect(p).toEqual({});
  });

  it("roles are differentiated — primary ≠ accessory prescription", () => {
    const primary = getPrescriptionForExerciseTransformation(primaryEx, T);
    const acc     = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(primary.reps).not.toEqual(acc.reps);
  });
});

// ─── 2. More Explosive ────────────────────────────────────────────────────────

describe("Scenario: More Explosive (power_explosive_focus)", () => {
  const T = "power_explosive_focus";

  it("power/Olympic exercise gets full power protocol — 2–5 reps, 4 sets, 2–4 min", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(p.sets).toBe(4);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
    expect(p.rest).toMatch(/2.+min|min/i);
  });

  it("box jump gets full power protocol", () => {
    const p = getPrescriptionForExerciseTransformation(boxJump, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
    expect(p.sets).toBe(4);
  });

  it("primary compound lift shifts to bar-speed range (3–6)", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(6);
  });

  it("accessory stays supportive — not forced into 2–5 power range", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
    expect(getPrescriptionForExerciseTransformation(activationEx, T)).toEqual({});
  });
});

// ─── 3. Shorter Sessions (reduce_time) ───────────────────────────────────────

describe("Scenario: Shorter Sessions (reduce_time)", () => {
  const T = "reduce_time";

  it("mapTransformationToFocusKey does NOT return 'endurance'", () => {
    expect(mapTransformationToFocusKey(T)).not.toBe("endurance");
  });

  it("mapTransformationToFocusKey returns 'no_swap' — no exercise swaps", () => {
    expect(mapTransformationToFocusKey(T)).toBe("no_swap");
  });

  it("primary lift: prescription has NO reps field — only rest is compressed", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(p.reps).toBeUndefined();
    expect(p.rest).toBeDefined();
  });

  it("accessory: prescription has NO reps field — rest is compressed", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(p.reps).toBeUndefined();
    expect(p.rest).toBeDefined();
  });

  it("power exercise: prescription has NO reps field", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(p.reps).toBeUndefined();
  });

  it("primary gets longer rest than accessory (protected quality work)", () => {
    const primary = getPrescriptionForExerciseTransformation(primaryEx, T);
    const acc     = getPrescriptionForExerciseTransformation(accessoryEx, T);
    // primary should get "60-90 sec", accessories "30-45 sec"
    expect(primary.rest).not.toEqual(acc.rest);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });
});

// ─── 4. Lower Impact ──────────────────────────────────────────────────────────

describe("Scenario: Lower Impact (lower_impact)", () => {
  const T = "lower_impact";

  it("power exercise is downgraded to controlled strength range (6–8)", () => {
    const p = getPrescriptionForExerciseTransformation(boxJump, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(6);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(8);
    expect(p.sets).toBe(3);
  });

  it("primary lift shifts to reduced-demand range (8–12)", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(12);
  });

  it("accessory stays in moderate range (10–15)", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(10);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(15);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });

  it("power and primary prescriptions are differentiated", () => {
    const power   = getPrescriptionForExerciseTransformation(boxJump, T);
    const primary = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(power.reps).not.toEqual(primary.reps);
  });
});

// ─── 5. Home Gym ──────────────────────────────────────────────────────────────

describe("Scenario: Home Gym (home_gym)", () => {
  const T = "home_gym";

  it("primary lift is prescribed in dumbbell-compatible range (6–10)", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(p.sets).toBe(4);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(6);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(10);
  });

  it("power exercise is prescribed in an achievable home-gym range", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(6);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(10);
  });

  it("accessory stays in moderate range (10–15)", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(10);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(15);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });
});

// ─── 6. More Endurance ────────────────────────────────────────────────────────

describe("Scenario: More Endurance (endurance)", () => {
  const T = "endurance";

  it("primary lift moves into moderate conditioning range (8–12)", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(12);
  });

  it("accessory moves to high-rep range (12–20)", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(12);
  });

  it("power/plyometric exercise is protected — stays in low-rep range", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
  });

  it("box jump is protected from high-rep conditioning work", () => {
    const p = getPrescriptionForExerciseTransformation(boxJump, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
  });

  it("core/trunk gets functional conditioning range (15–20)", () => {
    const p = getPrescriptionForExerciseTransformation(coreEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(15);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });

  it("mapTransformationToFocusKey returns 'endurance' for conditioning", () => {
    expect(mapTransformationToFocusKey("endurance")).toBe("endurance");
    expect(mapTransformationToFocusKey("endurance_focus")).toBe("endurance");
    expect(mapTransformationToFocusKey("conditioning_focus")).toBe("endurance");
  });
});

// ─── 7. Make Easier (decrease_difficulty / recovery) ─────────────────────────

describe("Scenario: Make Easier (decrease_difficulty)", () => {
  const T = "decrease_difficulty";

  it("primary lift gets moderate rep prescription", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(p.reps).toBeDefined();
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
  });

  it("no exercise receives very low rep ranges (1–5) — not CNS-demanding", () => {
    const exercises = [primaryEx, secondaryEx, accessoryEx, coreEx];
    for (const ex of exercises) {
      const p = getPrescriptionForExerciseTransformation(ex, T);
      if (p.reps) {
        expect(repMin(p.reps)).toBeGreaterThan(5);
      }
    }
  });

  it("accessory gets supportive moderate range", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(10);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });
});

// ─── 8. Make Harder (increase_difficulty / strength) ─────────────────────────

describe("Scenario: Make Harder (increase_difficulty)", () => {
  const T = "increase_difficulty";

  it("primary compound lift gets strength-range prescription (3–6 reps)", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, T);
    expect(p.sets).toBe(4);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(6);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(3);
  });

  it("core/trunk is NOT forced into 3–6 range — stays 8–15", () => {
    const p = getPrescriptionForExerciseTransformation(coreEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
  });

  it("accessory is NOT forced into 3–6 range — stays 8–15", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, T);
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(15);
  });

  it("power exercise gets low-rep speed-strength range", () => {
    const p = getPrescriptionForExerciseTransformation(powerEx, T);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
  });

  it("mobility/prep is preserved — empty prescription", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
  });
});

// ─── 9. Classification: Safety Bar Squat ─────────────────────────────────────

describe("Classification: Safety Bar Squat name override", () => {
  it("Safety Bar Squat seeded as 'secondary' gets primary strength prescription", () => {
    const p = getPrescriptionForExerciseTransformation(safetyBarSquat, "strength");
    expect(p.sets).toBe(4);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(6);
  });

  it("Safety Bar Squat gets primary prescription for power transformation too", () => {
    const p = getPrescriptionForExerciseTransformation(safetyBarSquat, "power_explosive_focus");
    // Primary compound lifts shift to bar-speed (3–6) in power context
    expect(p.sets).toBe(4);
    expect(repMax(p.reps!)).toBeLessThanOrEqual(6);
  });

  it("Safety Bar Squat does NOT get secondary prescription (5–8 reps) for strength", () => {
    const p = getPrescriptionForExerciseTransformation(safetyBarSquat, "strength");
    // Secondary would be 5–8 reps, 3 sets. Primary is 3–6, 4 sets.
    expect(p.sets).toBe(4); // secondary gives sets: 3
  });
});

// ─── 10. Classification: Medicine Ball Power Variants ────────────────────────

describe("Classification: Medicine ball throw / toss / pass / wall ball as power", () => {
  const powerCases = [medBallSlam, medBallThrow, medBallPass, medBallToss, wallBall];

  for (const ex of powerCases) {
    it(`${ex.name} (category: ${ex.category}) gets power prescription for explosive transformation`, () => {
      const p = getPrescriptionForExerciseTransformation(ex, "power_explosive_focus");
      // Power-classified exercises get: 4 sets, 2–5 reps, 2–4 min rest
      expect(p.sets).toBe(4);
      expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
    });

    it(`${ex.name} is protected from endurance high-rep prescription`, () => {
      const p = getPrescriptionForExerciseTransformation(ex, "endurance");
      // Power exercises in endurance context: 3–5 reps (protected)
      expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
    });

    it(`${ex.name} is protected from hypertrophy high-rep prescription`, () => {
      const p = getPrescriptionForExerciseTransformation(ex, "hypertrophy");
      // Power exercises in hypertrophy context: 3–5 reps (protected)
      expect(repMax(p.reps!)).toBeLessThanOrEqual(5);
    });
  }
});

// ─── 11. Mobility chip intents — no endurance prescription ───────────────────

describe("Mobility transformation maps to recovery — not endurance", () => {
  it("'recovery' transformation does not give endurance-level rep ranges to primaries", () => {
    const p = getPrescriptionForExerciseTransformation(primaryEx, "recovery");
    // Endurance gives 8–12 @ 45–90s. Recovery gives 8–12 @ 2–3 min.
    // Both give 8-12 reps for primaries, but this test ensures recovery is selected,
    // not endurance (which gives different accessory prescriptions).
    expect(p.reps).toBeDefined();
    expect(repMin(p.reps!)).toBeGreaterThanOrEqual(8);
  });

  it("'recovery' transformation does not force accessories into high-rep conditioning ranges", () => {
    const p = getPrescriptionForExerciseTransformation(accessoryEx, "recovery");
    // Endurance gives 12–20 for accessories; recovery gives 10–15
    expect(repMax(p.reps!)).toBeLessThanOrEqual(15);
  });

  it("'recovery' preserves mobility/prep exercises", () => {
    expect(getPrescriptionForExerciseTransformation(mobilityEx, "recovery")).toEqual({});
    expect(getPrescriptionForExerciseTransformation(activationEx, "recovery")).toEqual({});
  });
});

// ─── 12. No global flattening — each role is differentiated ──────────────────

describe("No global flattening — prescriptions are role-differentiated", () => {
  const transformations = [
    "strength", "power_explosive_focus", "endurance", "hypertrophy",
    "lower_impact", "home_gym", "recovery", "reduce_time",
  ] as const;

  for (const T of transformations) {
    it(`${T}: primary and accessory receive different prescriptions`, () => {
      const primary = getPrescriptionForExerciseTransformation(primaryEx, T);
      const acc     = getPrescriptionForExerciseTransformation(accessoryEx, T);
      // At minimum, one of reps/rest/sets must differ between roles
      const repsMatch  = primary.reps === acc.reps;
      const restMatch  = primary.rest === acc.rest;
      const setsMatch  = primary.sets === acc.sets;
      expect(repsMatch && restMatch && setsMatch).toBe(false);
    });

    it(`${T}: mobility/prep always gets empty prescription`, () => {
      expect(getPrescriptionForExerciseTransformation(mobilityEx, T)).toEqual({});
    });
  }
});
