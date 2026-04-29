/**
 * Adjustment Intent Family Engine — Regression Tests
 *
 * 9 core scenarios + extended coverage across:
 *   1. readiness_low          — today-only low energy / bad sleep
 *   2. missed_sessions_reentry — returning after a break
 *   3. environment_temporary_switch — hotel / home / travel TODAY
 *   4. sport_context_update   — sport declaration or update
 *   5. exercise_dislike_or_preference — dislike, avoid, prefer signals
 *
 * Anti-routing guards:
 *   - "I'm tired" must NOT → fatigue_management (that's overtraining)
 *   - "hotel today" must NOT → equipment_constraint (that's permanent)
 *   - "I play golf" must NOT → clarification_required
 *   - "I hate lunges" must NOT → clarification_required
 *
 * Classifier tests: AdjustmentIntentClassification output shape
 * Constraint verifier tests: verifyConstraintCompliance output
 */

import { describe, it, expect } from "vitest";
import { normalizeToIntentFamily } from "../intent-family-engine";
import { classifyAdjustmentIntent } from "../adjustment-intent-classifier";
import { verifyConstraintCompliance } from "../mutation-verifier";
import type { SystemSnapshot } from "../../lib/change-log-service";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeSnapshot(exercises: Record<string, unknown>): SystemSnapshot {
  return {
    exercises: exercises as SystemSnapshot["exercises"],
    sessions: {},
    weeks: {},
    phases: {},
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. readiness_low
// ═══════════════════════════════════════════════════════════════════════════════

describe("readiness_low — core detection", () => {
  it("'I'm tired today' → readiness_low", () => {
    expect(normalizeToIntentFamily("I'm tired today").family).toBe("readiness_low");
  });

  it("'Low energy today' → readiness_low", () => {
    expect(normalizeToIntentFamily("Low energy today").family).toBe("readiness_low");
  });

  it("'I didn't sleep well last night' → readiness_low", () => {
    expect(normalizeToIntentFamily("I didn't sleep well last night").family).toBe("readiness_low");
  });

  it("'My HRV is low today' → readiness_low", () => {
    expect(normalizeToIntentFamily("My HRV is low today").family).toBe("readiness_low");
  });

  it("'Feeling flat' → readiness_low", () => {
    expect(normalizeToIntentFamily("Feeling flat").family).toBe("readiness_low");
  });

  it("'Not feeling it today' → readiness_low", () => {
    expect(normalizeToIntentFamily("Not feeling it today").family).toBe("readiness_low");
  });

  it("'I'm exhausted' → readiness_low", () => {
    expect(normalizeToIntentFamily("I'm exhausted").family).toBe("readiness_low");
  });

  it("'Bad recovery today' → readiness_low", () => {
    expect(normalizeToIntentFamily("Bad recovery today").family).toBe("readiness_low");
  });
});

// ── Anti-routing: tired ≠ fatigue_management ─────────────────────────────────

describe("readiness_low — anti-routing guard", () => {
  it("'I'm tired today' must NOT route to fatigue_management", () => {
    const result = normalizeToIntentFamily("I'm tired today");
    expect(result.family).not.toBe("fatigue_management");
  });

  it("'Low energy today' must NOT route to fatigue_management", () => {
    const result = normalizeToIntentFamily("Low energy today");
    expect(result.family).not.toBe("fatigue_management");
  });
});

// ── Classifier output ─────────────────────────────────────────────────────────

describe("classifyAdjustmentIntent — readiness_low output shape", () => {
  it("returns correct persistence and mutation types", () => {
    const result = classifyAdjustmentIntent("I'm tired today, can we lighten it?");
    expect(result.intentFamily).toBe("readiness_low");
    expect(result.persistenceType).toBe("temporary");
    expect(result.mutationType).toBe("deload");
    expect(result.safetyFlags).toContain("temporary_only");
    expect(result.safetyFlags).toContain("no_rebuild");
    expect(result.requiresClarification).toBe(false);
  });

  it("extracts readiness signal", () => {
    const result = classifyAdjustmentIntent("I'm tired today");
    expect(result.extractedEntities.readinessSignal).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. missed_sessions_reentry
// ═══════════════════════════════════════════════════════════════════════════════

describe("missed_sessions_reentry — core detection", () => {
  it("'I missed a week' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("I missed a week").family).toBe("missed_sessions_reentry");
  });

  it("'Haven't trained in two weeks' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("Haven't trained in two weeks").family).toBe("missed_sessions_reentry");
  });

  it("'Coming back from a break' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("Coming back from a break").family).toBe("missed_sessions_reentry");
  });

  it("'Getting back into it' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("Getting back into it").family).toBe("missed_sessions_reentry");
  });

  it("'Took some time off' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("Took some time off").family).toBe("missed_sessions_reentry");
  });

  it("'Ease back in' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("I want to ease back in").family).toBe("missed_sessions_reentry");
  });

  it("'Resuming my program' → missed_sessions_reentry", () => {
    expect(normalizeToIntentFamily("I'm resuming my program after a break").family).toBe("missed_sessions_reentry");
  });
});

// ── Classifier output ─────────────────────────────────────────────────────────

describe("classifyAdjustmentIntent — missed_sessions_reentry output shape", () => {
  it("returns correct persistence and mutation types", () => {
    const result = classifyAdjustmentIntent("I haven't trained in two weeks — coming back now");
    expect(result.intentFamily).toBe("missed_sessions_reentry");
    expect(result.persistenceType).toBe("session_scope");
    expect(result.mutationType).toBe("deload");
    expect(result.safetyFlags).toContain("injury_risk");
    expect(result.safetyFlags).toContain("deconditioning");
    expect(result.safetyFlags).toContain("no_rebuild");
    expect(result.requiresClarification).toBe(false);
  });

  it("extracts break duration when present", () => {
    const result = classifyAdjustmentIntent("I took two weeks off and I'm coming back");
    expect(result.intentFamily).toBe("missed_sessions_reentry");
    expect(result.extractedEntities.breakDuration).toMatch(/two weeks?/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. environment_temporary_switch
// ═══════════════════════════════════════════════════════════════════════════════

describe("environment_temporary_switch — core detection", () => {
  it("'I'm at a hotel today' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("I'm at a hotel today").family).toBe("environment_temporary_switch");
  });

  it("'Hotel gym' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("Hotel gym workout").family).toBe("environment_temporary_switch");
  });

  it("'Traveling for work this week' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("Traveling for work this week").family).toBe("environment_temporary_switch");
  });

  it("'Training at home today' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("Training at home today").family).toBe("environment_temporary_switch");
  });

  it("'Can't get to the gym today' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("Can't get to the gym today").family).toBe("environment_temporary_switch");
  });

  it("'I'm on the road' → environment_temporary_switch", () => {
    expect(normalizeToIntentFamily("I'm on the road").family).toBe("environment_temporary_switch");
  });
});

// ── Anti-routing: hotel today ≠ equipment_constraint ─────────────────────────

describe("environment_temporary_switch — anti-routing guard", () => {
  it("'Hotel gym today' must NOT route to equipment_constraint", () => {
    const result = normalizeToIntentFamily("Hotel gym today");
    expect(result.family).not.toBe("equipment_constraint");
  });

  it("'Traveling for work' must NOT route to equipment_constraint", () => {
    const result = normalizeToIntentFamily("Traveling for work");
    expect(result.family).not.toBe("equipment_constraint");
  });
});

// ── Classifier output ─────────────────────────────────────────────────────────

describe("classifyAdjustmentIntent — environment_temporary_switch output shape", () => {
  it("returns correct persistence and mutation types", () => {
    const result = classifyAdjustmentIntent("I'm at a hotel today — can you adapt my session?");
    expect(result.intentFamily).toBe("environment_temporary_switch");
    expect(result.persistenceType).toBe("temporary");
    expect(result.mutationType).toBe("adapt_env");
    expect(result.safetyFlags).toContain("temporary_only");
    expect(result.safetyFlags).toContain("no_rebuild");
    expect(result.requiresClarification).toBe(false);
  });

  it("extracts environment when present", () => {
    const result = classifyAdjustmentIntent("I'm at a hotel today");
    expect(result.extractedEntities.environment).toBe("hotel");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. sport_context_update
// ═══════════════════════════════════════════════════════════════════════════════

describe("sport_context_update — core detection", () => {
  it("'I play golf' → sport_context_update", () => {
    expect(normalizeToIntentFamily("I play golf").family).toBe("sport_context_update");
  });

  it("'I'm a basketball player' → sport_context_update", () => {
    expect(normalizeToIntentFamily("I'm a basketball player").family).toBe("sport_context_update");
  });

  it("'Training for soccer season' → sport_context_update", () => {
    expect(normalizeToIntentFamily("Training for soccer season").family).toBe("sport_context_update");
  });

  it("'I do BJJ' → sport_context_update", () => {
    expect(normalizeToIntentFamily("I do bjj").family).toBe("sport_context_update");
  });

  it("'I'm a runner' → sport_context_update", () => {
    expect(normalizeToIntentFamily("I'm a runner").family).toBe("sport_context_update");
  });

  it("'This program is for tennis' → sport_context_update", () => {
    expect(normalizeToIntentFamily("This program is for tennis").family).toBe("sport_context_update");
  });
});

// ── Anti-routing: sport ≠ clarification_required ─────────────────────────────

describe("sport_context_update — anti-routing guard", () => {
  it("'I play golf' must NOT route to clarification_required", () => {
    const result = normalizeToIntentFamily("I play golf");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'I'm a basketball player' must NOT route to clarification_required", () => {
    const result = normalizeToIntentFamily("I'm a basketball player");
    expect(result.family).not.toBe("clarification_required");
  });
});

// ── Classifier output ─────────────────────────────────────────────────────────

describe("classifyAdjustmentIntent — sport_context_update output shape", () => {
  it("returns correct persistence and mutation types", () => {
    const result = classifyAdjustmentIntent("I play golf and want my program to reflect that");
    expect(result.intentFamily).toBe("sport_context_update");
    expect(result.persistenceType).toBe("context_update");
    expect(result.mutationType).toBe("reorient");
    expect(result.safetyFlags).toContain("sport_bias_required");
    expect(result.safetyFlags).toContain("no_rebuild");
    expect(result.requiresClarification).toBe(false);
  });

  it("extracts target sport", () => {
    const result = classifyAdjustmentIntent("I play golf");
    expect(result.extractedEntities.targetSport).toBe("golf");
  });

  it("stores sport in constraintsToPersist via planAdjustmentExecution", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "I play golf",
      activeProgram: null,
    });
    expect(plan.constraintsToPersist.sport).toBe("golf");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. exercise_dislike_or_preference
// ═══════════════════════════════════════════════════════════════════════════════

describe("exercise_dislike_or_preference — core detection", () => {
  it("'I hate lunges' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("I hate lunges").family).toBe("exercise_dislike_or_preference");
  });

  it("'Remove all deadlifts from my program' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("Remove all deadlifts from my program").family).toBe("exercise_dislike_or_preference");
  });

  it("'I prefer dumbbells over barbells' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("I prefer dumbbells over barbells").family).toBe("exercise_dislike_or_preference");
  });

  it("'No lunges please' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("No lunges please").family).toBe("exercise_dislike_or_preference");
  });

  it("'I can't stand burpees' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("I can't stand burpees").family).toBe("exercise_dislike_or_preference");
  });

  it("'I dislike running' → exercise_dislike_or_preference", () => {
    expect(normalizeToIntentFamily("I dislike running").family).toBe("exercise_dislike_or_preference");
  });
});

// ── Anti-routing: dislike ≠ clarification_required ────────────────────────────

describe("exercise_dislike_or_preference — anti-routing guard", () => {
  it("'I hate lunges' must NOT route to clarification_required", () => {
    const result = normalizeToIntentFamily("I hate lunges");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'I prefer dumbbells' must NOT route to exercise_swap", () => {
    const result = normalizeToIntentFamily("I prefer dumbbells over barbells");
    expect(result.family).not.toBe("exercise_swap");
  });
});

// ── Classifier output ─────────────────────────────────────────────────────────

describe("classifyAdjustmentIntent — exercise_dislike_or_preference output shape", () => {
  it("returns correct persistence (permanent) and mutation type (substitute)", () => {
    const result = classifyAdjustmentIntent("I hate lunges");
    expect(result.intentFamily).toBe("exercise_dislike_or_preference");
    expect(result.persistenceType).toBe("permanent");
    expect(result.mutationType).toBe("substitute");
    expect(result.safetyFlags).toContain("preference_stored");
    expect(result.requiresClarification).toBe(false);
  });

  it("extracts target exercise", () => {
    const result = classifyAdjustmentIntent("I hate lunges");
    expect(result.extractedEntities.targetExercise).toBe("lunges");
  });

  it("extracts dislike preference direction", () => {
    const result = classifyAdjustmentIntent("I hate lunges");
    expect(result.extractedEntities.preferenceDirection).toBe("dislike");
  });

  it("extracts prefer direction", () => {
    const result = classifyAdjustmentIntent("I prefer dumbbells over barbells");
    expect(result.extractedEntities.preferenceDirection).toBe("prefer");
  });

  it("stores dislike in constraintsToPersist via planAdjustmentExecution", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "I hate lunges",
      activeProgram: null,
    });
    expect(plan.constraintsToPersist.dislikedExercises).toContain("lunges");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. verifyConstraintCompliance — banned equipment
// ═══════════════════════════════════════════════════════════════════════════════

describe("verifyConstraintCompliance — banned equipment", () => {
  it("detects banned equipment in snapshot", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "Barbell Back Squat", equipment: "barbell" },
      "2": { id: 2, name: "DB Romanian Deadlift", equipment: "dumbbell" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "equipment_constraint",
      afterSnapshot: snapshot,
      bannedEquipment: ["barbell"],
    });

    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].rule).toBe("banned_equipment");
    expect(result.violations[0].exerciseName).toMatch(/barbell/i);
  });

  it("passes when banned equipment is absent", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "DB Romanian Deadlift", equipment: "dumbbell" },
      "2": { id: 2, name: "DB Press", equipment: "dumbbell" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "equipment_constraint",
      afterSnapshot: snapshot,
      bannedEquipment: ["barbell"],
    });

    expect(result.compliant).toBe(true);
    expect(result.violations.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. verifyConstraintCompliance — required exercises
// ═══════════════════════════════════════════════════════════════════════════════

describe("verifyConstraintCompliance — required exercises", () => {
  it("flags missing required exercise", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "DB Press", equipment: "dumbbell" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "add_exercise",
      afterSnapshot: snapshot,
      requiredExercises: ["pull-up"],
    });

    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.rule === "required_exercise_missing")).toBe(true);
  });

  it("passes when required exercise is present", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "Pull-Up", equipment: "bodyweight" },
      "2": { id: 2, name: "DB Press", equipment: "dumbbell" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "add_exercise",
      afterSnapshot: snapshot,
      requiredExercises: ["pull-up"],
    });

    expect(result.compliant).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. verifyConstraintCompliance — banned movement patterns
// ═══════════════════════════════════════════════════════════════════════════════

describe("verifyConstraintCompliance — banned movement patterns", () => {
  it("detects exercise matching banned pattern", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "Belt Squat", equipment: "belt_squat_machine" },
      "2": { id: 2, name: "DB Press", equipment: "dumbbell" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "equipment_constraint",
      afterSnapshot: snapshot,
      bannedExercisePatterns: ["belt squat"],
    });

    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.rule === "banned_movement_pattern")).toBe(true);
  });

  it("passes when banned pattern is absent", () => {
    const snapshot = makeSnapshot({
      "1": { id: 1, name: "Leg Press", equipment: "machine" },
    });

    const result = verifyConstraintCompliance({
      intentFamily: "equipment_constraint",
      afterSnapshot: snapshot,
      bannedExercisePatterns: ["belt squat"],
    });

    expect(result.compliant).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. planAdjustmentExecution — routing and shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("planAdjustmentExecution — execution plan shape", () => {
  it("routes readiness_low to APPLY_MUTATION", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "I'm tired today",
      activeProgram: null,
    });
    expect(plan.action).toBe("APPLY_MUTATION");
    expect(plan.mutationPlan?.intentFamily).toBe("readiness_low");
    expect(plan.mutationPlan?.persistenceType).toBe("temporary");
    expect(plan.verificationRequired).toBe(true);
    expect(plan.uiUpdateRequired).toBe(true);
  });

  it("routes environment_temporary_switch to APPLY_MUTATION", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "I'm at a hotel today",
      activeProgram: null,
    });
    expect(plan.action).toBe("APPLY_MUTATION");
    expect(plan.mutationPlan?.intentFamily).toBe("environment_temporary_switch");
    expect(plan.mutationPlan?.persistenceType).toBe("temporary");
  });

  it("routes missed_sessions_reentry to APPLY_MUTATION with injury_risk flag", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "Coming back from a break",
      activeProgram: null,
    });
    expect(plan.action).toBe("APPLY_MUTATION");
    expect(plan.mutationPlan?.safetyFlags).toContain("injury_risk");
  });

  it("routes clarification_required to ASK_CLARIFICATION", async () => {
    const { planAdjustmentExecution } = await import("../execution-planner");
    const plan = planAdjustmentExecution({
      message: "xkcd 1234",
      activeProgram: null,
    });
    expect(plan.action).toBe("ASK_CLARIFICATION");
    expect(plan.mutationPlan).toBeNull();
    expect(plan.verificationRequired).toBe(false);
  });
});
