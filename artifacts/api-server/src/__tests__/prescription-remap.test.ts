/**
 * Prescription Remap QA Tests
 *
 * Validates the prescription remap layer across known cross-family exercise
 * replacement scenarios. These tests catch the core bug: a replacement exercise
 * inheriting a prescription that belongs to a different movement family or role.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it, expect } from "vitest";
import {
  remapPrescriptionIfNeeded,
  classifyExerciseRole,
  classifyMovementBucket,
  isSameFamilyAndRole,
  PRESCRIPTION_REMAP_QA_CASES,
  applyPrescriptionContextModifiers,
  clampRepsMin,
  ROLE_DEFAULTS,
} from "../lib/prescription-remap";
import type { DefaultPrescription, ExerciseRole, PrescriptionContext } from "../lib/prescription-remap";

// ─── Role classification ───────────────────────────────────────────────────────

describe("classifyExerciseRole", () => {
  const cases: Array<[string, string]> = [
    ["Deadlift", "primary_strength"],
    ["Barbell Back Squat", "primary_strength"],
    ["Barbell Bench Press", "primary_strength"],
    ["Barbell Romanian Deadlift", "primary_strength"],
    ["Dumbbell Romanian Deadlift", "secondary_strength"],
    ["Trap Bar Deadlift", "primary_strength"],
    ["Power Clean", "power_plyometric"],
    ["Box Jump", "power_plyometric"],
    ["Leg Curl", "isolation"],
    ["Seated Leg Curl", "isolation"],
    ["Hamstring Curl", "isolation"],
    ["Leg Extension", "isolation"],
    ["Lateral Raise", "isolation"],
    ["Biceps Curl", "isolation"],
    ["Triceps Pressdown", "isolation"],
    ["Skull Crusher", "isolation"],
    ["Dumbbell Fly", "isolation"],
    ["Rear Delt Raise", "isolation"],
    ["Dumbbell Bench Press", "hypertrophy_accessory"],
    ["Cable Row", "hypertrophy_accessory"],
    ["Push-Up", "hypertrophy_accessory"],
    ["Hip Flexor Flow", "mobility_prehab"],
  ];

  for (const [name, expectedRole] of cases) {
    it(`classifies "${name}" as ${expectedRole}`, () => {
      expect(classifyExerciseRole(name)).toBe(expectedRole);
    });
  }
});

// ─── Movement bucket classification ───────────────────────────────────────────

describe("classifyMovementBucket", () => {
  const cases: Array<[string, string]> = [
    ["Deadlift", "hinge_hip"],
    ["Romanian Deadlift", "hinge_hip"],
    ["Hip Thrust", "hinge_hip"],
    ["Leg Curl", "isolation_lower"],
    ["Leg Extension", "isolation_lower"],
    ["Calf Raise", "isolation_lower"],
    ["Back Squat", "squat_knee"],
    ["Lunge", "squat_knee"],
    ["Bench Press", "push_h"],
    ["Push-Up", "push_h"],
    ["Overhead Press", "push_v"],
    ["Barbell Row", "pull_h"],
    ["Pull-Up", "pull_v"],
    ["Lat Pulldown", "pull_v"],
    ["Power Clean", "power"],
    ["Box Jump", "power"],
    ["Lateral Raise", "isolation_upper"],
    ["Triceps Pressdown", "isolation_upper"],
    ["Biceps Curl", "isolation_upper"],
  ];

  for (const [name, expectedBucket] of cases) {
    it(`classifies "${name}" into bucket ${expectedBucket}`, () => {
      expect(classifyMovementBucket(name)).toBe(expectedBucket);
    });
  }
});

// ─── Same-family check ─────────────────────────────────────────────────────────

describe("isSameFamilyAndRole", () => {
  it("Barbell RDL → Dumbbell RDL: same family", () => {
    expect(isSameFamilyAndRole("Barbell Romanian Deadlift", "Dumbbell Romanian Deadlift")).toBe(true);
  });

  it("Deadlift → Leg Curl: different family", () => {
    expect(isSameFamilyAndRole("Deadlift", "Leg Curl")).toBe(false);
  });

  it("Back Squat → Leg Extension: different family", () => {
    expect(isSameFamilyAndRole("Back Squat", "Leg Extension")).toBe(false);
  });

  it("Bench Press → Triceps Pressdown: different family", () => {
    expect(isSameFamilyAndRole("Bench Press", "Triceps Pressdown")).toBe(false);
  });

  it("Power Clean → Box Jump: same family (both power)", () => {
    expect(isSameFamilyAndRole("Power Clean", "Box Jump")).toBe(true);
  });

  it("Power Clean → Hamstring Curl: different family", () => {
    expect(isSameFamilyAndRole("Power Clean", "Hamstring Curl")).toBe(false);
  });

  it("Bench Press → Push-Up: same bucket (push_h), both treated as same family", () => {
    expect(isSameFamilyAndRole("Bench Press", "Push-Up")).toBe(true);
  });

  it("Barbell Row → Cable Row: same pull_h bucket", () => {
    expect(isSameFamilyAndRole("Barbell Row", "Cable Row")).toBe(true);
  });
});

// ─── Full remap QA cases from spec ────────────────────────────────────────────

describe("remapPrescriptionIfNeeded — spec QA cases", () => {
  for (const tc of PRESCRIPTION_REMAP_QA_CASES) {
    it(tc.label, () => {
      const result = remapPrescriptionIfNeeded({
        originalName: tc.original,
        replacementName: tc.replacement,
        existingSets: 3,
        existingReps: "3",
        existingRest: "2–3 min",
      });

      expect(result.remapped).toBe(tc.expectedRemapped);

      if (tc.expectedRepMin !== undefined) {
        const minRepsInResult = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
        expect(minRepsInResult).toBeGreaterThanOrEqual(tc.expectedRepMin);
      }
    });
  }
});

// ─── Isolation guardrail ───────────────────────────────────────────────────────

describe("isolation guardrail", () => {
  it("Deadlift → Leg Curl: result reps must be >= 6", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("Squat → Leg Extension: result reps must be >= 6", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Back Squat",
      replacementName: "Leg Extension",
      existingSets: 5,
      existingReps: "2",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("Bench Press → Triceps Pressdown: result reps must be >= 6", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Bench Press",
      replacementName: "Triceps Pressdown",
      existingSets: 3,
      existingReps: "3",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("Lateral Raise: isolation preserve guardrail — existing 3 reps → upgraded", () => {
    // Same family preserve, but existing reps violate isolation guardrail
    const result = remapPrescriptionIfNeeded({
      originalName: "Lateral Raise",
      replacementName: "Front Raise",
      existingSets: 3,
      existingReps: "3",
      existingRest: "90s",
    });
    // remapped because guardrail fires even on preserve
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });
});

// ─── Power exercises preserve low reps ────────────────────────────────────────

describe("power exercises", () => {
  it("Power Clean → Box Jump: not remapped, preserves low reps", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Power Clean",
      replacementName: "Box Jump",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(false);
    expect(result.sets).toBe(4);
    expect(result.reps).toBe("3");
  });

  it("Power Clean → Hamstring Curl: remapped, reps increase to isolation range", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Power Clean",
      replacementName: "Hamstring Curl",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });
});

// ─── Same-family preserve ─────────────────────────────────────────────────────

describe("same-family preserve", () => {
  it("Barbell RDL → Dumbbell RDL: preserves existing prescription exactly", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Barbell Romanian Deadlift",
      replacementName: "Dumbbell Romanian Deadlift",
      existingSets: 4,
      existingReps: "6-8",
      existingRest: "2 min",
    });
    expect(result.remapped).toBe(false);
    expect(result.sets).toBe(4);
    expect(result.reps).toBe("6-8");
    expect(result.rest).toBe("2 min");
  });

  it("Barbell Squat → Goblet Squat: same squat_knee bucket, preserves prescription", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Barbell Back Squat",
      replacementName: "Goblet Squat",
      existingSets: 4,
      existingReps: "5",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(false);
  });

  it("Bench Press → Push-Up: same push_h bucket, preserves prescription", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Bench Press",
      replacementName: "Push-Up",
      existingSets: 4,
      existingReps: "5",
      existingRest: "3 min",
    });
    expect(result.remapped).toBe(false);
  });
});

// ─── Rationale messaging ──────────────────────────────────────────────────────

describe("rationale messaging", () => {
  it("cross-family replacement includes a rationale", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 3,
      existingReps: "3",
      existingRest: "3 min",
    });
    expect(result.rationale).toBeTruthy();
    expect(result.rationale).toContain("isolation");
  });

  it("same-family replacement has no rationale", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Barbell Romanian Deadlift",
      replacementName: "Dumbbell Romanian Deadlift",
      existingSets: 3,
      existingReps: "6-8",
      existingRest: "2 min",
    });
    expect(result.rationale).toBeNull();
  });
});

// ─── clampRepsMin helper ───────────────────────────────────────────────────────

describe("clampRepsMin", () => {
  it("clamps range string lower bound — result is single number when lo meets hi", () => {
    // "3–5" clamped to min 5: lo becomes 5, hi is already 5 → collapsed to "5"
    expect(clampRepsMin("3–5", 5)).toBe("5");
  });

  it("clamps lower bound without touching upper bound when hi > min", () => {
    // "3–8" clamped to min 5: lo becomes 5, hi stays 8
    expect(clampRepsMin("3–8", 5)).toBe("5–8");
  });

  it("raises lower bound without changing upper bound", () => {
    expect(clampRepsMin("8–12", 10)).toBe("10–12");
  });

  it("leaves range untouched when already >= min", () => {
    expect(clampRepsMin("10–15", 8)).toBe("10–15");
  });

  it("clamps single-number rep string", () => {
    expect(clampRepsMin("3", 6)).toBe("6");
  });

  it("leaves single-number rep string untouched when >= min", () => {
    expect(clampRepsMin("8", 6)).toBe("8");
  });

  it("skips time-based strings — sec suffix", () => {
    expect(clampRepsMin("30–45 sec", 10)).toBe("30–45 sec");
  });

  it("skips time-based strings — min suffix", () => {
    expect(clampRepsMin("2–3 min", 5)).toBe("2–3 min");
  });
});

// ─── applyPrescriptionContextModifiers — block archetypes ─────────────────────

describe("applyPrescriptionContextModifiers — FOUNDATION_ACCUMULATION", () => {
  it("primary_strength: moderate reps (6–10), controlled rest", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "FOUNDATION_ACCUMULATION",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
    expect(result.appliedModifiers).toContain("block:FOUNDATION_ACCUMULATION");
    expect(result.rationaleAdditions.join(" ")).toContain("accumulation");
  });

  it("isolation: biased toward 12–20 reps", () => {
    const base = ROLE_DEFAULTS["isolation"];
    const result = applyPrescriptionContextModifiers(base, "isolation", {
      blockType: "FOUNDATION_ACCUMULATION",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(10);
    expect(result.appliedModifiers).toContain("block:FOUNDATION_ACCUMULATION");
  });

  it("hypertrophy_accessory: reps in 10–15 range", () => {
    const base = ROLE_DEFAULTS["hypertrophy_accessory"];
    const result = applyPrescriptionContextModifiers(base, "hypertrophy_accessory", {
      blockType: "FOUNDATION_ACCUMULATION",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(10);
  });
});

describe("applyPrescriptionContextModifiers — INTENSIFICATION_STRENGTH", () => {
  it("primary_strength: lower reps (2–5), longer rest", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "INTENSIFICATION_STRENGTH",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(2);
    expect(minReps).toBeLessThanOrEqual(5);
    expect(result.appliedModifiers).toContain("block:INTENSIFICATION_STRENGTH");
    expect(result.rationaleAdditions.join(" ")).toContain("intensification");
  });

  it("isolation: does NOT drop to strength-rep ranges — keeps 10–15", () => {
    const base = ROLE_DEFAULTS["isolation"];
    const result = applyPrescriptionContextModifiers(base, "isolation", {
      blockType: "INTENSIFICATION_STRENGTH",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(8);
  });

  it("hypertrophy_accessory: stays in support range 8–12, not strength rep range", () => {
    const base = ROLE_DEFAULTS["hypertrophy_accessory"];
    const result = applyPrescriptionContextModifiers(base, "hypertrophy_accessory", {
      blockType: "INTENSIFICATION_STRENGTH",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("secondary_strength: moderate reps (4–8), moderate-long rest", () => {
    const base = ROLE_DEFAULTS["secondary_strength"];
    const result = applyPrescriptionContextModifiers(base, "secondary_strength", {
      blockType: "INTENSIFICATION_STRENGTH",
    });
    expect(result.appliedModifiers).toContain("block:INTENSIFICATION_STRENGTH");
  });
});

describe("applyPrescriptionContextModifiers — POWER_ELASTIC_CONVERSION", () => {
  it("power_plyometric: low reps, long rest, highest priority", () => {
    const base = ROLE_DEFAULTS["power_plyometric"];
    const result = applyPrescriptionContextModifiers(base, "power_plyometric", {
      blockType: "POWER_ELASTIC_CONVERSION",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeLessThanOrEqual(5);
    expect(result.appliedModifiers).toContain("block:POWER_ELASTIC_CONVERSION");
    expect(result.rationaleAdditions.join(" ")).toContain("power");
  });

  it("isolation: reduces sets to avoid fatigue accumulation", () => {
    const base = ROLE_DEFAULTS["isolation"];
    const result = applyPrescriptionContextModifiers(base, "isolation", {
      blockType: "POWER_ELASTIC_CONVERSION",
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(3);
  });

  it("hypertrophy_accessory: reduced sets to control fatigue footprint", () => {
    const base = ROLE_DEFAULTS["hypertrophy_accessory"];
    const result = applyPrescriptionContextModifiers(base, "hypertrophy_accessory", {
      blockType: "POWER_ELASTIC_CONVERSION",
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(3);
  });

  it("primary_strength: moderate-low volume (3 sets) to avoid fatigue interference", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "POWER_ELASTIC_CONVERSION",
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(4);
  });
});

describe("applyPrescriptionContextModifiers — REBUILD_DELOAD", () => {
  it("primary_strength: fewer sets, higher reps, shorter rest", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "REBUILD_DELOAD",
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(4);
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(5);
    expect(result.appliedModifiers).toContain("block:REBUILD_DELOAD");
    expect(result.rationaleAdditions.join(" ")).toContain("deload");
  });

  it("isolation: 2 sets, technique-focused reps", () => {
    const base = ROLE_DEFAULTS["isolation"];
    const result = applyPrescriptionContextModifiers(base, "isolation", {
      blockType: "REBUILD_DELOAD",
    });
    expect(result.prescription.sets).toBe(2);
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("secondary_strength: 2 sets, controlled reps", () => {
    const base = ROLE_DEFAULTS["secondary_strength"];
    const result = applyPrescriptionContextModifiers(base, "secondary_strength", {
      blockType: "REBUILD_DELOAD",
    });
    expect(result.prescription.sets).toBe(2);
  });
});

// ─── applyPrescriptionContextModifiers — exercise position ────────────────────

describe("applyPrescriptionContextModifiers — exercise position", () => {
  it("early: no modification to base prescription", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      exercisePosition: "early",
    });
    expect(result.prescription.sets).toBe(base.sets);
    expect(result.appliedModifiers.filter((m) => m.startsWith("position:"))).toHaveLength(0);
  });

  it("middle: no modification to base prescription", () => {
    const base = ROLE_DEFAULTS["secondary_strength"];
    const result = applyPrescriptionContextModifiers(base, "secondary_strength", {
      exercisePosition: "middle",
    });
    expect(result.prescription.sets).toBe(base.sets);
    expect(result.appliedModifiers.filter((m) => m.startsWith("position:"))).toHaveLength(0);
  });

  it("late: sets reduced by 1 (min 2)", () => {
    const base = ROLE_DEFAULTS["hypertrophy_accessory"]; // 3 sets
    const result = applyPrescriptionContextModifiers(base, "hypertrophy_accessory", {
      exercisePosition: "late",
    });
    expect(result.prescription.sets).toBe(2);
    expect(result.appliedModifiers).toContain("position:late");
    expect(result.rationaleAdditions.join(" ")).toContain("late-session");
  });

  it("late: sets don't go below 2", () => {
    const twoSetBase: DefaultPrescription = { sets: 2, reps: "10–15", rest: "45 sec" };
    const result = applyPrescriptionContextModifiers(twoSetBase, "isolation", {
      exercisePosition: "late",
    });
    expect(result.prescription.sets).toBe(2);
  });

  it("late + FOUNDATION_ACCUMULATION primary: block applied first, then position reduces sets", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "FOUNDATION_ACCUMULATION",
      exercisePosition: "late",
    });
    // FOUNDATION gives 4 sets, late reduces to 3
    expect(result.prescription.sets).toBe(3);
    expect(result.appliedModifiers).toContain("block:FOUNDATION_ACCUMULATION");
    expect(result.appliedModifiers).toContain("position:late");
  });
});

// ─── applyPrescriptionContextModifiers — user level ───────────────────────────

describe("applyPrescriptionContextModifiers — user level", () => {
  it("beginner: caps sets at 3 for primary_strength", () => {
    const base = ROLE_DEFAULTS["primary_strength"]; // 4 sets
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      userLevel: "beginner",
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(3);
    expect(result.appliedModifiers).toContain("level:beginner:sets_capped");
  });

  it("beginner: raises rep floor to 5 for primary_strength (no very low reps)", () => {
    const lowRepBase: DefaultPrescription = { sets: 4, reps: "2–4", rest: "3 min" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "primary_strength", {
      userLevel: "beginner",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(5);
    expect(result.appliedModifiers).toContain("level:beginner:reps_floor");
  });

  it("beginner: raises rep floor to 8 for hypertrophy_accessory", () => {
    const lowRepBase: DefaultPrescription = { sets: 3, reps: "5–8", rest: "75 sec" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "hypertrophy_accessory", {
      userLevel: "beginner",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(8);
  });

  it("beginner: raises rep floor to 10 for isolation", () => {
    const lowRepBase: DefaultPrescription = { sets: 3, reps: "6–8", rest: "60 sec" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "isolation", {
      userLevel: "beginner",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(10);
  });

  it("intermediate: no modification to base prescription", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      userLevel: "intermediate",
    });
    expect(result.prescription.sets).toBe(base.sets);
    expect(result.prescription.reps).toBe(base.reps);
    expect(result.appliedModifiers.filter((m) => m.startsWith("level:"))).toHaveLength(0);
  });

  it("advanced: no modification (block type drives loading, not level alone)", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      userLevel: "advanced",
    });
    expect(result.prescription.sets).toBe(base.sets);
    expect(result.appliedModifiers.filter((m) => m.startsWith("level:"))).toHaveLength(0);
  });

  it("beginner + INTENSIFICATION_STRENGTH: sets capped at 3, reps floored for safety", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      blockType: "INTENSIFICATION_STRENGTH",
      userLevel: "beginner",
    });
    // Block applies first (4 sets, 2–5 reps), then beginner caps to 3 sets and floors reps to 5
    expect(result.prescription.sets).toBeLessThanOrEqual(3);
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(5);
    expect(result.appliedModifiers).toContain("block:INTENSIFICATION_STRENGTH");
    expect(result.appliedModifiers).toContain("level:beginner:sets_capped");
  });
});

// ─── applyPrescriptionContextModifiers — fatigue / readiness ─────────────────

describe("applyPrescriptionContextModifiers — fatigue / readiness", () => {
  it("high fatigue: reduces sets by 1", () => {
    const base = ROLE_DEFAULTS["primary_strength"]; // 4 sets
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      fatigueLevel: "high",
    });
    expect(result.prescription.sets).toBe(3);
    expect(result.appliedModifiers).toContain("readiness:reduced_sets");
    expect(result.rationaleAdditions.join(" ")).toContain("readiness");
  });

  it("low readiness: same as high fatigue — reduces sets by 1", () => {
    const base = ROLE_DEFAULTS["secondary_strength"]; // 3 sets
    const result = applyPrescriptionContextModifiers(base, "secondary_strength", {
      readiness: "low",
    });
    expect(result.prescription.sets).toBe(2);
    expect(result.appliedModifiers).toContain("readiness:reduced_sets");
  });

  it("high fatigue: avoids max-effort low reps for primary_strength (floor 5)", () => {
    const lowRepBase: DefaultPrescription = { sets: 4, reps: "2–3", rest: "3 min" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "primary_strength", {
      fatigueLevel: "high",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(5);
    expect(result.appliedModifiers).toContain("readiness:reps_floor");
  });

  it("high fatigue: avoids max-effort low reps for hypertrophy_accessory (floor 8)", () => {
    const lowRepBase: DefaultPrescription = { sets: 3, reps: "5–8", rest: "75 sec" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "hypertrophy_accessory", {
      fatigueLevel: "high",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(8);
  });

  it("moderate fatigue: no modification", () => {
    const base = ROLE_DEFAULTS["primary_strength"];
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      fatigueLevel: "moderate",
    });
    expect(result.prescription.sets).toBe(base.sets);
    expect(result.appliedModifiers.filter((m) => m.startsWith("readiness:"))).toHaveLength(0);
  });

  it("sets don't go below 2 even with high fatigue", () => {
    const twoSetBase: DefaultPrescription = { sets: 2, reps: "10–15", rest: "60 sec" };
    const result = applyPrescriptionContextModifiers(twoSetBase, "isolation", {
      fatigueLevel: "high",
    });
    expect(result.prescription.sets).toBe(2);
  });
});

// ─── applyPrescriptionContextModifiers — pain / safety flag ──────────────────

describe("applyPrescriptionContextModifiers — pain / safety flag", () => {
  it("hasPainFlag: reduces sets by 1", () => {
    const base = ROLE_DEFAULTS["primary_strength"]; // 4 sets
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      hasPainFlag: true,
    });
    expect(result.prescription.sets).toBe(3);
    expect(result.appliedModifiers).toContain("safety:reduced_sets");
    expect(result.safetyWarnings.length).toBeGreaterThan(0);
    expect(result.rationaleAdditions.join(" ")).toContain("safety");
  });

  it("hasPainFlag: raises rep floor to 6 for primary_strength (no max-effort loading)", () => {
    const lowRepBase: DefaultPrescription = { sets: 4, reps: "2–3", rest: "3 min" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "primary_strength", {
      hasPainFlag: true,
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
    expect(result.appliedModifiers).toContain("safety:reps_floor_6");
  });

  it("hasPainFlag: does NOT increase intensity (sets never go up)", () => {
    const base: DefaultPrescription = { sets: 3, reps: "8–12", rest: "60 sec" };
    const result = applyPrescriptionContextModifiers(base, "hypertrophy_accessory", {
      hasPainFlag: true,
    });
    expect(result.prescription.sets).toBeLessThanOrEqual(3);
  });

  it("hasPainFlag: sets don't go below 2", () => {
    const twoSetBase: DefaultPrescription = { sets: 2, reps: "10–15", rest: "45 sec" };
    const result = applyPrescriptionContextModifiers(twoSetBase, "isolation", {
      hasPainFlag: true,
    });
    expect(result.prescription.sets).toBe(2);
  });

  it("hasPainFlag: safety warning is populated", () => {
    const base = ROLE_DEFAULTS["secondary_strength"];
    const result = applyPrescriptionContextModifiers(base, "secondary_strength", {
      hasPainFlag: true,
    });
    expect(result.safetyWarnings.length).toBeGreaterThan(0);
    expect(result.safetyWarnings.join(" ")).toContain("Pain/safety flag");
  });
});

// ─── Guardrails override bad modifier outcomes ────────────────────────────────

describe("guardrails always override modifier outcomes", () => {
  it("INTENSIFICATION_STRENGTH + isolation: guardrail prevents reps dropping below 6", () => {
    // Even if block somehow produces low reps, guardrail must win.
    const lowRepBase: DefaultPrescription = { sets: 3, reps: "3–5", rest: "3 min" };
    const result = applyPrescriptionContextModifiers(lowRepBase, "isolation", {
      blockType: "INTENSIFICATION_STRENGTH",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("pain flag + isolation: guardrail enforced even with pain modifier", () => {
    const result = applyPrescriptionContextModifiers(
      ROLE_DEFAULTS["isolation"],
      "isolation",
      { hasPainFlag: true },
    );
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("fatigue + hypertrophy_accessory: isolation guardrail fires as final gate", () => {
    const edgeCaseBase: DefaultPrescription = { sets: 3, reps: "5–8", rest: "75 sec" };
    const result = applyPrescriptionContextModifiers(edgeCaseBase, "hypertrophy_accessory", {
      fatigueLevel: "high",
    });
    const minReps = parseInt(result.prescription.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
  });

  it("multiple stress modifiers stack: late + high fatigue + pain — sets minimum 2", () => {
    const base = ROLE_DEFAULTS["primary_strength"]; // 4 sets
    const result = applyPrescriptionContextModifiers(base, "primary_strength", {
      exercisePosition: "late",
      fatigueLevel: "high",
      hasPainFlag: true,
    });
    // late: 4→3, fatigue: 3→2, pain: 2 (floor hit) → stays at 2
    expect(result.prescription.sets).toBe(2);
  });
});

// ─── remapPrescriptionIfNeeded — with context (end-to-end) ───────────────────

describe("remapPrescriptionIfNeeded — with context", () => {
  it("Deadlift → Leg Curl + INTENSIFICATION_STRENGTH: keeps isolation in support range", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
      context: { blockType: "INTENSIFICATION_STRENGTH" },
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(8);
    expect(result.appliedModifiers).toContain("block:INTENSIFICATION_STRENGTH");
    expect(result.contextRationale).toContain("intensification");
  });

  it("Back Squat → Leg Extension + FOUNDATION_ACCUMULATION: becomes higher-rep accessory work", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Back Squat",
      replacementName: "Leg Extension",
      existingSets: 4,
      existingReps: "4",
      existingRest: "3 min",
      context: { blockType: "FOUNDATION_ACCUMULATION" },
    });
    expect(result.remapped).toBe(true);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(10);
    expect(result.contextRationale).toContain("accumulation");
  });

  it("Power Clean → Box Jump + POWER_ELASTIC_CONVERSION: low reps, long rest preserved", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Power Clean",
      replacementName: "Box Jump",
      existingSets: 4,
      existingReps: "3",
      existingRest: "2–3 min",
      context: { blockType: "POWER_ELASTIC_CONVERSION" },
    });
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeLessThanOrEqual(5);
    expect(result.appliedModifiers).toContain("block:POWER_ELASTIC_CONVERSION");
    expect(result.contextRationale).toContain("power");
  });

  it("Bench Press → Push-Up + late session + low readiness: reduces stress", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Bench Press",
      replacementName: "Push-Up",
      existingSets: 4,
      existingReps: "5",
      existingRest: "3 min",
      context: { exercisePosition: "late", readiness: "low" },
    });
    // late: −1 set, low readiness: −1 set more
    expect(result.sets).toBeDefined();
    expect(result.sets).toBeLessThanOrEqual(3);
    expect(result.appliedModifiers).toContain("position:late");
    expect(result.appliedModifiers).toContain("readiness:reduced_sets");
  });

  it("Barbell RDL → Dumbbell RDL (same family) + context still applies context modifier", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Barbell Romanian Deadlift",
      replacementName: "Dumbbell Romanian Deadlift",
      existingSets: 4,
      existingReps: "6–8",
      existingRest: "2 min",
      context: { blockType: "REBUILD_DELOAD" },
    });
    // Layer 1: same family → not remapped
    // Layer 2: REBUILD_DELOAD reduces sets to 3
    expect(result.sets).toBeLessThanOrEqual(4);
    expect(result.appliedModifiers).toContain("block:REBUILD_DELOAD");
    expect(result.contextRationale).toContain("deload");
  });

  it("remap + context: notes include both remap rationale and context rationale", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
      context: { blockType: "FOUNDATION_ACCUMULATION" },
    });
    expect(result.rationale).toBeTruthy();
    expect(result.contextRationale).toBeTruthy();
    // Both should be present and non-overlapping
    expect(result.rationale).toContain("isolation");
    expect(result.contextRationale).toContain("accumulation");
  });

  it("no context: contextRationale is null and appliedModifiers is empty", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 3,
      existingReps: "5",
      existingRest: "2 min",
    });
    expect(result.contextRationale).toBeNull();
    expect(result.appliedModifiers).toHaveLength(0);
  });

  it("beginner + hasPainFlag: multiple modifiers all apply, sets safely capped", () => {
    const result = remapPrescriptionIfNeeded({
      originalName: "Deadlift",
      replacementName: "Leg Curl",
      existingSets: 4,
      existingReps: "3",
      existingRest: "3 min",
      context: { userLevel: "beginner", hasPainFlag: true },
    });
    expect(result.sets).toBeLessThanOrEqual(3);
    const minReps = parseInt(result.reps.match(/(\d+)/)?.[1] ?? "0", 10);
    expect(minReps).toBeGreaterThanOrEqual(6);
    expect(result.appliedModifiers.some((m) => m.startsWith("safety:"))).toBe(true);
  });
});
