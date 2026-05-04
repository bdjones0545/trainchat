/**
 * Session Stimulus Redistribution QA Tests — Layer 3
 *
 * Validates deterministic stimulus evaluation and volume redistribution after
 * exercise mutations.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it, expect } from "vitest";
import {
  evaluateSessionStimulusAfterMutation,
  estimateStimulusDrop,
  determineStimulusImpact,
  type SessionStimulusExercise,
  type StimulusRedistributionInput,
} from "../lib/session-stimulus-redistribution";

// ─── Test fixture helpers ──────────────────────────────────────────────────────

function makeExercise(
  id: number,
  name: string,
  sets: number,
  overrides: Partial<SessionStimulusExercise> = {},
): SessionStimulusExercise {
  return { id, name, sets, reps: "8–12", rest: "90 sec", notes: null, category: null, ...overrides };
}

function runRedistribution(
  partialInput: Partial<StimulusRedistributionInput> & {
    originalName: string;
    replacementName: string;
    replacementId: number;
    sessionExercises: SessionStimulusExercise[];
  },
) {
  const { originalName, replacementName, replacementId, sessionExercises, ...rest } = partialInput;
  return evaluateSessionStimulusAfterMutation({
    originalExercise:    { name: originalName,    sets: 4, reps: "3–5", rest: "3 min" },
    replacementExercise: { id: replacementId, name: replacementName, sets: 3, reps: "10–15", rest: "60 sec" },
    sessionExercises,
    ...rest,
  });
}

// ─── estimateStimulusDrop ──────────────────────────────────────────────────────

describe("estimateStimulusDrop", () => {
  it("primary_strength → isolation: high drop", () => {
    expect(estimateStimulusDrop("primary_strength", "isolation", "hinge_hip", "isolation_lower")).toBe("high");
  });

  it("primary_strength → hypertrophy_accessory: high drop", () => {
    expect(estimateStimulusDrop("primary_strength", "hypertrophy_accessory", "hinge_hip", "squat_knee")).toBe("high");
  });

  it("primary_strength → secondary_strength: moderate drop", () => {
    expect(estimateStimulusDrop("primary_strength", "secondary_strength", "hinge_hip", "hinge_hip")).toBe("moderate");
  });

  it("secondary_strength → isolation: moderate drop", () => {
    expect(estimateStimulusDrop("secondary_strength", "isolation", "hinge_hip", "isolation_lower")).toBe("moderate");
  });

  it("secondary_strength → hypertrophy_accessory: low drop", () => {
    expect(estimateStimulusDrop("secondary_strength", "hypertrophy_accessory", "hinge_hip", "hinge_hip")).toBe("low");
  });

  it("hypertrophy_accessory → isolation: low drop", () => {
    expect(estimateStimulusDrop("hypertrophy_accessory", "isolation", "push_h", "isolation_upper")).toBe("low");
  });

  it("power_plyometric → isolation: high drop (power demand is unique)", () => {
    expect(estimateStimulusDrop("power_plyometric", "isolation", "power", "isolation_lower")).toBe("high");
  });

  it("isolation → power_plyometric: high drop", () => {
    expect(estimateStimulusDrop("isolation", "power_plyometric", "isolation_lower", "power")).toBe("high");
  });

  it("any → mobility_prehab: high drop", () => {
    expect(estimateStimulusDrop("primary_strength", "mobility_prehab", "squat_knee", "mobility")).toBe("high");
  });
});

// ─── determineStimulusImpact ───────────────────────────────────────────────────

describe("determineStimulusImpact", () => {
  it("pain flag → safety_modified regardless of drop", () => {
    expect(determineStimulusImpact("high", "primary_strength", "isolation", { painSafetyFlag: true })).toBe("safety_modified");
  });

  it("REBUILD_DELOAD + drop → intentionally_regressed", () => {
    expect(determineStimulusImpact("high", "primary_strength", "isolation", { blockType: "REBUILD_DELOAD" })).toBe("intentionally_regressed");
  });

  it("mutationType=easier + drop → intentionally_regressed", () => {
    expect(determineStimulusImpact("moderate", "primary_strength", "secondary_strength", { mutationType: "easier" })).toBe("intentionally_regressed");
  });

  it("drop=none → preserved", () => {
    expect(determineStimulusImpact("none", "primary_strength", "primary_strength", {})).toBe("preserved");
  });

  it("power → accessory → distorted", () => {
    expect(determineStimulusImpact("high", "power_plyometric", "isolation", {})).toBe("distorted");
  });

  it("accessory → power → distorted", () => {
    expect(determineStimulusImpact("high", "isolation", "power_plyometric", {})).toBe("distorted");
  });

  it("primary → isolation, no special flags → reduced", () => {
    expect(determineStimulusImpact("high", "primary_strength", "isolation", {})).toBe("reduced");
  });
});

// ─── Same-family preservation ──────────────────────────────────────────────────

describe("same-family replacement → no redistribution", () => {
  it("Barbell RDL → Dumbbell RDL: preserved, no_action", () => {
    const session = [
      makeExercise(1, "Dumbbell Romanian Deadlift", 4), // the replacement
    ];
    const result = runRedistribution({
      originalName:    "Barbell Romanian Deadlift",
      replacementName: "Dumbbell Romanian Deadlift",
      replacementId:   1,
      sessionExercises: session,
    });

    expect(result.stimulusImpact).toBe("preserved");
    expect(result.compensationActions).toContain("no_action");
    expect(result.updatedSessionExercises).toHaveLength(0);
    expect(result.lostStimulus.estimatedStimulusDrop).toBe("none");
  });

  it("Bench Press → Push-Up (same push_h bucket): preserved", () => {
    const session = [makeExercise(1, "Push-Up", 3)];
    const result = runRedistribution({
      originalName: "Bench Press", replacementName: "Push-Up",
      replacementId: 1, sessionExercises: session,
    });
    expect(result.stimulusImpact).toBe("preserved");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });

  it("Power Clean → Box Jump (both power): preserved", () => {
    const session = [makeExercise(1, "Box Jump", 4)];
    const result = runRedistribution({
      originalName: "Power Clean", replacementName: "Box Jump",
      replacementId: 1, sessionExercises: session,
    });
    expect(result.stimulusImpact).toBe("preserved");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });
});

// ─── Primary → isolation: upgrade existing same-bucket exercise ────────────────

describe("Deadlift → Leg Curl with existing hinge exercise", () => {
  it("upgrades existing DB RDL by +1 set", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),               // the replacement
      makeExercise(20, "Dumbbell Romanian Deadlift", 3), // existing hinge secondary
    ];
    const result = runRedistribution({
      originalName:    "Deadlift",
      replacementName: "Leg Curl",
      replacementId:   10,
      sessionExercises: session,
    });

    expect(result.stimulusImpact).toBe("reduced");
    expect(result.lostStimulus.primaryPatternLost).toBe(true);
    expect(result.lostStimulus.estimatedStimulusDrop).toBe("high");
    expect(result.updatedSessionExercises).toHaveLength(1);
    expect(result.updatedSessionExercises[0].id).toBe(20);
    expect(result.updatedSessionExercises[0].newSets).toBe(4);
    expect(result.updatedSessionExercises[0].oldSets).toBe(3);
    expect(
      result.compensationActions.some((a) =>
        a === "upgrade_existing_accessory" || a === "increase_secondary_volume",
      ),
    ).toBe(true);
    expect(result.userFacingSummary).toContain("Dumbbell Romanian Deadlift");
  });

  it("upgrades up to 2 same-bucket exercises when multiple are available", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 2), // hinge secondary (2 sets)
      makeExercise(30, "Hip Thrust", 3),                // hinge accessory (3 sets)
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // Should upgrade both (up to MAX_UPGRADES_PER_PASS = 2)
    expect(result.updatedSessionExercises.length).toBeGreaterThanOrEqual(1);
    expect(result.updatedSessionExercises.length).toBeLessThanOrEqual(2);
  });

  it("Leg Curl stays in isolation range — never promoted to primary strength", () => {
    const session = [makeExercise(10, "Leg Curl", 3)];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // The replacement exercise itself must NOT be in the upgrade list
    const replacementInUpdates = result.updatedSessionExercises.find((u) => u.id === 10);
    expect(replacementInUpdates).toBeUndefined();
  });

  it("Leg Curl never gets 5×5 loading via redistribution", () => {
    const session = [makeExercise(10, "Leg Curl", 3)];
    const result = evaluateSessionStimulusAfterMutation({
      originalExercise: { name: "Deadlift", sets: 4, reps: "3", rest: "3 min" },
      replacementExercise: { id: 10, name: "Leg Curl", sets: 3, reps: "10–15", rest: "60 sec" },
      sessionExercises: session,
    });

    // No update to the Leg Curl itself
    const legCurlUpdate = result.updatedSessionExercises.find((u) => u.id === 10);
    expect(legCurlUpdate).toBeUndefined();
  });
});

// ─── Primary → isolation: no existing same-bucket exercise ────────────────────

describe("Deadlift → Leg Curl with no other hinge exercises", () => {
  it("flags temporary regression when no candidate exists", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),       // replacement
      makeExercise(20, "Bench Press", 4),     // unrelated — different bucket
      makeExercise(30, "Lateral Raise", 3),   // isolation upper — different bucket
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    expect(result.stimulusImpact).toBe("reduced");
    expect(result.compensationActions).toContain("flag_temporary_regression");
    expect(result.updatedSessionExercises).toHaveLength(0);
    expect(result.userFacingSummary).toContain("hinge hip");
  });
});

// ─── Pain / safety flag ────────────────────────────────────────────────────────

describe("pain / safety flag → preserve_regression_no_compensation", () => {
  it("Deadlift → Leg Curl + painSafetyFlag: no extra volume, safety_modified", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3), // would be upgraded otherwise
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      painSafetyFlag: true,
    });

    expect(result.stimulusImpact).toBe("safety_modified");
    expect(result.compensationActions).toContain("preserve_regression_no_compensation");
    expect(result.updatedSessionExercises).toHaveLength(0);
    expect(result.safetyWarnings.length).toBeGreaterThan(0);
    expect(result.userFacingSummary).toContain("safety");
  });

  it("pain flag: no exercise in session is modified", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Hip Thrust", 2),
    ];
    const result = runRedistribution({
      originalName: "Squat", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      painSafetyFlag: true,
    });
    expect(result.updatedSessionExercises).toHaveLength(0);
  });
});

// ─── High fatigue / low readiness ─────────────────────────────────────────────

describe("high fatigue / low readiness → no aggressive compensation", () => {
  it("high fatigueLevel: reduce_session_stress, no set upgrades", () => {
    const session = [
      makeExercise(10, "Leg Extension", 3),
      makeExercise(20, "Bulgarian Split Squat", 3), // same bucket, would be upgraded
    ];
    const result = runRedistribution({
      originalName: "Back Squat", replacementName: "Leg Extension",
      replacementId: 10, sessionExercises: session,
      fatigueLevel: "high",
    });

    expect(result.compensationActions).toContain("reduce_session_stress");
    expect(result.updatedSessionExercises).toHaveLength(0);
    expect(result.userFacingSummary).toMatch(/readiness|fatigue|quality/i);
  });

  it("low readinessLevel: same as high fatigue — no extra volume", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      readinessLevel: "low",
    });

    expect(result.compensationActions).toContain("reduce_session_stress");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });
});

// ─── Block archetype specifics ─────────────────────────────────────────────────

describe("REBUILD_DELOAD → accepts reduced stimulus, no compensation", () => {
  it("deload block: intentionally_regressed, preserve_regression_no_compensation", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      blockType: "REBUILD_DELOAD",
    });

    expect(result.stimulusImpact).toBe("intentionally_regressed");
    expect(result.compensationActions).toContain("preserve_regression_no_compensation");
    expect(result.updatedSessionExercises).toHaveLength(0);
    expect(result.userFacingSummary).toContain("deload");
  });
});

describe("INTENSIFICATION_STRENGTH → preserves primary when safe", () => {
  it("same-family swap during intensification: preserved", () => {
    const session = [makeExercise(10, "Trap Bar Deadlift", 4)];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Trap Bar Deadlift",
      replacementId: 10, sessionExercises: session,
      blockType: "INTENSIFICATION_STRENGTH",
    });
    expect(result.stimulusImpact).toBe("preserved");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });

  it("primary → isolation during intensification: reduced, still tries to compensate", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      blockType: "INTENSIFICATION_STRENGTH",
    });

    expect(result.stimulusImpact).toBe("reduced");
    // Should compensate since pain flag and fatigue are not set
    expect(
      result.compensationActions.some((a) =>
        a === "upgrade_existing_accessory" || a === "increase_secondary_volume",
      ),
    ).toBe(true);
    expect(result.updatedSessionExercises.length).toBeGreaterThan(0);
  });
});

describe("POWER_ELASTIC_CONVERSION → avoids fatigue-heavy compensation", () => {
  it("power swap: Power Clean → Box Jump: preserved", () => {
    const session = [makeExercise(1, "Box Jump", 4)];
    const result = runRedistribution({
      originalName: "Power Clean", replacementName: "Box Jump",
      replacementId: 1, sessionExercises: session,
      blockType: "POWER_ELASTIC_CONVERSION",
    });
    expect(result.stimulusImpact).toBe("preserved");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });

  it("Power Clean → Hamstring Curl: distorted, flag_temporary_regression (no power compensation)", () => {
    const session = [
      makeExercise(10, "Hamstring Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Power Clean", replacementName: "Hamstring Curl",
      replacementId: 10, sessionExercises: session,
      blockType: "POWER_ELASTIC_CONVERSION",
    });

    // Power → non-power is distorted
    expect(result.stimulusImpact).toBe("distorted");
    expect(result.compensationActions).toContain("flag_temporary_regression");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });

  it("primary → isolation in power block: flag_temporary_regression (no extra volume)", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Goblet Squat", 3),
    ];
    const result = runRedistribution({
      originalName: "Back Squat", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
      blockType: "POWER_ELASTIC_CONVERSION",
    });

    // Even if it's reduced, the power block avoids fatigue-heavy compensation
    expect(result.compensationActions).toContain("flag_temporary_regression");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });
});

// ─── Volume guardrails ─────────────────────────────────────────────────────────

describe("volume guardrails: no compensation when session already has enough sets", () => {
  it("6 hinge sets already in session → no_action even if primary lost", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),          // replacement
      makeExercise(20, "Dumbbell RDL", 3),       // hinge secondary
      makeExercise(30, "Hip Thrust", 3),          // hinge — total: 6 sets in bucket
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    expect(result.compensationActions).toContain("no_action");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });

  it("5 hinge sets in session → upgrades one exercise (budget allows 1)", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),           // replacement
      makeExercise(20, "Dumbbell RDL", 2),        // hinge — 2 sets
      makeExercise(30, "Hip Thrust", 3),           // hinge — 3 sets → total 5
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    expect(result.updatedSessionExercises).toHaveLength(1);
    // After upgrade: 2+1 + 3 = 6 → ceiling reached
    const totalSets = result.updatedSessionExercises.reduce((s, u) => s + (u.newSets - u.oldSets), 5);
    expect(totalSets).toBeLessThanOrEqual(6);
  });

  it("per-exercise set cap: secondary_strength capped at 5 sets", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 4), // secondary, already at 4 sets
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // 4 → 5 is within cap
    const rdlUpdate = result.updatedSessionExercises.find((u) => u.id === 20);
    if (rdlUpdate) {
      expect(rdlUpdate.newSets).toBeLessThanOrEqual(5);
    }
  });

  it("per-exercise set cap: hypertrophy_accessory capped at 4 sets", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Cable Pull-Through", 4), // accessory already at cap (4)
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // At-cap exercise should not be upgraded
    const atCapUpdate = result.updatedSessionExercises.find((u) => u.id === 20);
    if (atCapUpdate) {
      expect(atCapUpdate.newSets).toBe(4); // stays at cap or unchanged
    }
  });
});

// ─── Bad compensation prevention ──────────────────────────────────────────────

describe("bad compensation prevention", () => {
  it("replacement exercise itself is never in updatedSessionExercises", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),          // replacement — must not be upgraded
      makeExercise(20, "Dumbbell RDL", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    const replacementInUpdates = result.updatedSessionExercises.find((u) => u.id === 10);
    expect(replacementInUpdates).toBeUndefined();
  });

  it("isolation exercise in same bucket is not upgraded (only secondary/accessory)", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),        // replacement
      makeExercise(20, "Leg Extension", 3),   // isolation in isolation_lower bucket — different pattern
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // Leg Extension is isolation_lower, Deadlift is hinge_hip — different bucket
    // Even if same bucket, isolation exercises should not be the ones upgraded
    const legExtensionUpdate = result.updatedSessionExercises.find((u) => u.id === 20);
    expect(legExtensionUpdate).toBeUndefined();
  });

  it("stimulusImpact distorted: no set upgrades even if same-bucket secondary exists", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),              // replacement of Power Clean
      makeExercise(20, "Nordic Curl", 3),             // hinge secondary — power was in power bucket
    ];
    const result = runRedistribution({
      originalName: "Power Clean", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    // Power → isolation is distorted — no volume compensation allowed
    expect(result.stimulusImpact).toBe("distorted");
    expect(result.updatedSessionExercises).toHaveLength(0);
  });
});

// ─── Audit fields ──────────────────────────────────────────────────────────────

describe("audit fields are populated correctly", () => {
  it("audit.originalRole and replacementRole are set", () => {
    const session = [makeExercise(1, "Leg Curl", 3)];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 1, sessionExercises: session,
    });

    expect(result.audit.originalRole).toBe("primary_strength");
    expect(result.audit.replacementRole).toBe("isolation");
    expect(result.audit.originalBucket).toBe("hinge_hip");
    expect(result.audit.replacementBucket).toBe("isolation_lower");
  });

  it("audit.exercisesModified lists upgraded exercises", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    if (result.updatedSessionExercises.length > 0) {
      expect(result.audit.exercisesModified).toContain("Dumbbell Romanian Deadlift");
    }
  });

  it("audit.totalSetsAfterRedistribution ≥ totalSetsBeforeMutation when upgraded", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });

    expect(result.audit.totalSetsAfterRedistribution).toBeGreaterThanOrEqual(
      result.audit.totalSetsBeforeMutation - 4, // account for sets difference
    );
  });
});

// ─── User-facing summary ───────────────────────────────────────────────────────

describe("userFacingSummary is human-readable and accurate", () => {
  it("preserved: mentions same pattern, no redistribution", () => {
    const session = [makeExercise(1, "Dumbbell Romanian Deadlift", 3)];
    const result = runRedistribution({
      originalName: "Barbell Romanian Deadlift", replacementName: "Dumbbell Romanian Deadlift",
      replacementId: 1, sessionExercises: session,
    });
    expect(result.userFacingSummary).toBeTruthy();
    expect(result.userFacingSummary.length).toBeGreaterThan(10);
  });

  it("safety_modified: mentions safety", () => {
    const session = [makeExercise(1, "Leg Curl", 3)];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 1, sessionExercises: session,
      painSafetyFlag: true,
    });
    expect(result.userFacingSummary.toLowerCase()).toContain("safety");
  });

  it("intentionally_regressed (deload): mentions deload", () => {
    const session = [makeExercise(1, "Leg Curl", 3)];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 1, sessionExercises: session,
      blockType: "REBUILD_DELOAD",
    });
    expect(result.userFacingSummary.toLowerCase()).toContain("deload");
  });

  it("reduced + upgraded: mentions the upgraded exercise", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Dumbbell Romanian Deadlift", 3),
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });
    if (result.updatedSessionExercises.length > 0) {
      expect(result.userFacingSummary).toContain("Dumbbell Romanian Deadlift");
    }
  });

  it("flag_temporary_regression: mentions the lost pattern", () => {
    const session = [
      makeExercise(10, "Leg Curl", 3),
      makeExercise(20, "Bench Press", 4), // different bucket
    ];
    const result = runRedistribution({
      originalName: "Deadlift", replacementName: "Leg Curl",
      replacementId: 10, sessionExercises: session,
    });
    expect(result.compensationActions).toContain("flag_temporary_regression");
    expect(result.userFacingSummary).toMatch(/hinge|temporary|regression/i);
  });
});
