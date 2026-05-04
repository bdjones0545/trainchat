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
} from "../lib/prescription-remap";

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
