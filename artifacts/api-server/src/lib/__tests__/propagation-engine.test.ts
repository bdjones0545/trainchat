/**
 * Propagation Engine — Unit Tests
 *
 * These tests verify the safety, correctness, and decision logic of the
 * propagation engine without hitting the database.
 */

import { describe, it, expect } from "vitest";
import {
  determinePropagationMode,
  assessPropagationSafety,
  applyRelativeAdjustment,
  isMateriallyCustomized,
  getPropagationSummary,
  isProtectedWeek,
  inferStimulusBand,
  type FutureMatch,
  type PropagationPlan,
} from "../propagation-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFutureMatch(overrides: Partial<FutureMatch> = {}): FutureMatch {
  return {
    exerciseId: 100,
    exerciseName: "Barbell Squat",
    sessionId: 10,
    sessionLabel: "Lower Power",
    weekId: 5,
    weekNumber: 3,
    volumeLevel: "moderate",
    weekLabel: null,
    weekStatus: "upcoming",
    phaseId: 1,
    sets: 4,
    reps: "3-5",
    rest: "3 min",
    tempo: null,
    notes: null,
    metadata: null,
    ...overrides,
  };
}

function makeWeekInfo(overrides: Partial<{ weekNumber: number; volumeLevel: string; weekLabel: string | null; weekStatus: string }> = {}) {
  return {
    weekNumber: 3,
    volumeLevel: "moderate",
    weekLabel: null,
    weekStatus: "upcoming",
    ...overrides,
  };
}

// ─── Phase 1: determinePropagationMode ───────────────────────────────────────

describe("determinePropagationMode", () => {
  it("replace_exercise → structural_swap regardless of intent", () => {
    expect(determinePropagationMode({
      actionType: "replace_exercise",
      intent: "exercise_note",
      fieldsChanged: ["name"],
    })).toBe("structural_swap");
  });

  it("easier_variation → structural_swap", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "easier_variation",
      fieldsChanged: ["name"],
    })).toBe("structural_swap");
  });

  it("harder_variation → structural_swap", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "harder_variation",
      fieldsChanged: ["sets", "reps"],
    })).toBe("structural_swap");
  });

  it("injury_modification → structural_swap", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "injury_modification",
      fieldsChanged: ["name"],
    })).toBe("structural_swap");
  });

  it("exercise_note → none", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "exercise_note",
      fieldsChanged: ["notes"],
    })).toBe("none");
  });

  it("notes-only update → none", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "some_other_intent",
      fieldsChanged: ["notes"],
    })).toBe("none");
  });

  it("increase_sets → relative_adjustment", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "increase_sets",
      fieldsChanged: ["sets"],
    })).toBe("relative_adjustment");
  });

  it("reduce_sets → relative_adjustment", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "reduce_sets",
      fieldsChanged: ["sets"],
    })).toBe("relative_adjustment");
  });

  it("change_rep_range → prompt_user", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "change_rep_range",
      fieldsChanged: ["reps"],
    })).toBe("prompt_user");
  });

  it("sets INCREMENT → none (one-off volume)", () => {
    expect(determinePropagationMode({
      actionType: "update_exercise",
      intent: "some_intent",
      fieldsChanged: ["sets"],
      beforeExercise: { sets: 3 },
      afterExercise: { sets: "INCREMENT" },
    })).toBe("none");
  });
});

// ─── Phase 3: assessPropagationSafety ────────────────────────────────────────

describe("assessPropagationSafety", () => {
  it("passes for a clean upcoming week with structural_swap", () => {
    const result = assessPropagationSafety({
      targetWeek: makeWeekInfo(),
      sourceExerciseBefore: { name: "Barbell Squat", reps: "3-5" },
      sourceExerciseAfter: { name: "Front Squat", reps: "3-5" },
      targetExercise: makeFutureMatch(),
      propagationMode: "structural_swap",
    });
    expect(result.safe).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it("hard-stops for a deload week with structural_swap", () => {
    const result = assessPropagationSafety({
      targetWeek: makeWeekInfo({ volumeLevel: "deload" }),
      sourceExerciseBefore: { name: "Barbell Squat" },
      sourceExerciseAfter: { name: "Front Squat" },
      targetExercise: makeFutureMatch({ weekNumber: 4, volumeLevel: "deload" }),
      propagationMode: "structural_swap",
    });
    expect(result.safe).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toMatch(/protected/i);
  });

  it("hard-stops for a locked exercise", () => {
    const result = assessPropagationSafety({
      targetWeek: makeWeekInfo(),
      sourceExerciseBefore: { name: "Barbell Squat" },
      sourceExerciseAfter: { name: "Front Squat" },
      targetExercise: makeFutureMatch({ metadata: { propagation: { isLocked: true } } }),
      propagationMode: "structural_swap",
    });
    expect(result.safe).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toMatch(/locked/i);
  });

  it("hard-stops for a user-customized exercise", () => {
    const result = assessPropagationSafety({
      targetWeek: makeWeekInfo(),
      sourceExerciseBefore: { name: "Barbell Squat" },
      sourceExerciseAfter: { name: "Front Squat" },
      targetExercise: makeFutureMatch({ metadata: { propagation: { modifiedBy: "user" } } }),
      propagationMode: "structural_swap",
    });
    expect(result.safe).toBe(false);
    expect(result.score).toBe(0);
  });

  it("passes for relative_adjustment on moderate week", () => {
    const result = assessPropagationSafety({
      targetWeek: makeWeekInfo(),
      sourceExerciseBefore: { name: "Barbell Squat", sets: 3 },
      sourceExerciseAfter: { name: "Barbell Squat", sets: 4 },
      targetExercise: makeFutureMatch({ sets: 4 }),
      propagationMode: "relative_adjustment",
    });
    expect(result.safe).toBe(true);
  });
});

// ─── Phase 4: applyRelativeAdjustment ────────────────────────────────────────

describe("applyRelativeAdjustment", () => {
  it("applies +1 set delta to future week", () => {
    const result = applyRelativeAdjustment({
      sourceBefore: { sets: 3 },
      sourceAfter: { sets: 4 },
      targetExercise: makeFutureMatch({ sets: 5 }),
    });
    expect(result.sets).toBe(6);
  });

  it("applies -1 set delta to future week", () => {
    const result = applyRelativeAdjustment({
      sourceBefore: { sets: 4 },
      sourceAfter: { sets: 3 },
      targetExercise: makeFutureMatch({ sets: 5 }),
    });
    expect(result.sets).toBe(4);
  });

  it("clamps sets at MAX_SETS (10)", () => {
    const result = applyRelativeAdjustment({
      sourceBefore: { sets: 3 },
      sourceAfter: { sets: 5 },
      targetExercise: makeFutureMatch({ sets: 9 }),
    });
    expect(result.sets).toBe(10);
  });

  it("clamps sets at MIN_SETS (1)", () => {
    const result = applyRelativeAdjustment({
      sourceBefore: { sets: 4 },
      sourceAfter: { sets: 2 },
      targetExercise: makeFutureMatch({ sets: 2 }),
    });
    expect(result.sets).toBe(1);
  });

  it("applies rep range delta within same stimulus band", () => {
    const result = applyRelativeAdjustment({
      sourceBefore: { reps: "4-6" },
      sourceAfter: { reps: "5-7" },
      targetExercise: makeFutureMatch({ reps: "6-8" }),
    });
    expect(result.reps).toBe("7-9");
  });

  it("does not shift reps across stimulus bands", () => {
    // 3-5 (strength) → 10-12 (hypertrophy) would be a band shift
    const result = applyRelativeAdjustment({
      sourceBefore: { reps: "3-5" },
      sourceAfter: { reps: "10-12" },
      targetExercise: makeFutureMatch({ reps: "4-6" }),
    });
    // target is strength band; new reps would be hypertrophy → rejected
    expect(result.reps).toBeUndefined();
  });
});

// ─── Phase 5: isMateriallyCustomized ─────────────────────────────────────────

describe("isMateriallyCustomized", () => {
  it("returns false for exercise with no metadata", () => {
    expect(isMateriallyCustomized({ metadata: null })).toBe(false);
  });

  it("returns false for agent-modified exercise", () => {
    expect(isMateriallyCustomized({
      metadata: { propagation: { modifiedBy: "agent" } },
    })).toBe(false);
  });

  it("returns true for user-modified exercise", () => {
    expect(isMateriallyCustomized({
      metadata: { propagation: { modifiedBy: "user" } },
    })).toBe(true);
  });

  it("returns true for locked exercise", () => {
    expect(isMateriallyCustomized({
      metadata: { propagation: { isLocked: true } },
    })).toBe(true);
  });
});

// ─── Protected week detection ─────────────────────────────────────────────────

describe("isProtectedWeek", () => {
  it("marks deload volumeLevel as protected", () => {
    expect(isProtectedWeek({ volumeLevel: "deload" })).toBe(true);
  });

  it("marks label containing 'deload' as protected", () => {
    expect(isProtectedWeek({ weekLabel: "Deload Week" })).toBe(true);
  });

  it("marks label containing 'taper' as protected", () => {
    expect(isProtectedWeek({ weekLabel: "Taper Week 1" })).toBe(true);
  });

  it("marks label containing 'testing' as protected", () => {
    expect(isProtectedWeek({ weekLabel: "Testing Week" })).toBe(true);
  });

  it("does not mark normal week as protected", () => {
    expect(isProtectedWeek({ volumeLevel: "moderate", weekLabel: "Week 3" })).toBe(false);
  });
});

// ─── Phase 8: getPropagationSummary ──────────────────────────────────────────

describe("getPropagationSummary", () => {
  const emptyCommit = {
    planId: "test-plan",
    appliedIds: [],
    appliedCount: 0,
    skippedCount: 0,
    auditEntryCount: 0,
  };

  function makePlan(overrides: Partial<PropagationPlan> = {}): PropagationPlan {
    return {
      planId: "test-plan",
      mode: "structural_swap",
      source: {
        exerciseId: 1,
        weekNumber: 1,
        sessionLabel: "Lower Power",
        exerciseBefore: { name: "Barbell Squat" },
        exerciseAfter: { name: "Front Squat" },
      },
      targets: [],
      summary: { applyCount: 0, skipCount: 0, protectedCount: 0, customizedCount: 0, lockedCount: 0 },
      ...overrides,
    };
  }

  it("returns local_only when mode is none", () => {
    const plan = makePlan({ mode: "none" });
    const summary = getPropagationSummary(plan, emptyCommit);
    expect(summary.status).toBe("local_only");
    expect(summary.message).toMatch(/locally only/i);
  });

  it("returns confirmation_required when mode is prompt_user", () => {
    const plan = makePlan({ mode: "prompt_user" });
    const summary = getPropagationSummary(plan, emptyCommit);
    expect(summary.status).toBe("confirmation_required");
    expect(summary.message).toMatch(/confirmation/i);
  });

  it("returns propagated with correct week count", () => {
    const plan = makePlan({
      targets: [
        { weekNumber: 2, weekId: 2, exerciseId: 101, sessionLabel: "Lower Power", action: "apply", reason: "", mode: "structural_swap", beforeSnapshot: {}, afterSnapshot: {}, safetyScore: 90, warnings: [] },
        { weekNumber: 3, weekId: 3, exerciseId: 102, sessionLabel: "Lower Power", action: "apply", reason: "", mode: "structural_swap", beforeSnapshot: {}, afterSnapshot: {}, safetyScore: 85, warnings: [] },
      ],
      summary: { applyCount: 2, skipCount: 0, protectedCount: 0, customizedCount: 0, lockedCount: 0 },
    });
    const commit = { planId: "test-plan", appliedIds: [101, 102], appliedCount: 2, skippedCount: 0, auditEntryCount: 2 };
    const summary = getPropagationSummary(plan, commit);
    expect(summary.status).toBe("propagated");
    expect(summary.appliedWeeks).toEqual([2, 3]);
    expect(summary.message).toMatch(/2 matching future/i);
  });

  it("returns partial when some weeks were skipped", () => {
    const plan = makePlan({
      targets: [
        { weekNumber: 2, weekId: 2, exerciseId: 101, sessionLabel: "Lower Power", action: "apply", reason: "", mode: "structural_swap", beforeSnapshot: {}, afterSnapshot: {}, safetyScore: 90, warnings: [] },
        { weekNumber: 3, weekId: 3, exerciseId: 102, sessionLabel: "Lower Power", action: "skip", reason: "Week 3 is a protected week (deload)", mode: "structural_swap", beforeSnapshot: {}, afterSnapshot: {}, safetyScore: 0, warnings: [] },
      ],
      summary: { applyCount: 1, skipCount: 1, protectedCount: 1, customizedCount: 0, lockedCount: 0 },
    });
    const commit = { planId: "test-plan", appliedIds: [101], appliedCount: 1, skippedCount: 1, auditEntryCount: 2 };
    const summary = getPropagationSummary(plan, commit);
    expect(summary.status).toBe("partial");
    expect(summary.skippedWeeks).toHaveLength(1);
  });

  it("returns local_only with customization message when all future weeks were customized", () => {
    const plan = makePlan({
      targets: [
        { weekNumber: 2, weekId: 2, exerciseId: 101, sessionLabel: "Lower Power", action: "skip", reason: "Exercise was previously customized by user — skipping", mode: "structural_swap", beforeSnapshot: {}, afterSnapshot: {}, safetyScore: 0, warnings: [] },
      ],
      summary: { applyCount: 0, skipCount: 1, protectedCount: 0, customizedCount: 1, lockedCount: 0 },
    });
    const summary = getPropagationSummary(plan, emptyCommit);
    expect(summary.status).toBe("local_only");
    expect(summary.message).toMatch(/customized/i);
  });
});

// ─── Stimulus band ────────────────────────────────────────────────────────────

describe("inferStimulusBand", () => {
  it("power for reps 1-3", () => {
    expect(inferStimulusBand({ reps: "1-3" })).toBe("power");
  });

  it("strength for reps 3-5", () => {
    expect(inferStimulusBand({ reps: "3-5" })).toBe("strength");
  });

  it("hypertrophy for reps 8-12", () => {
    expect(inferStimulusBand({ reps: "8-12" })).toBe("hypertrophy");
  });

  it("endurance for reps 15-20", () => {
    expect(inferStimulusBand({ reps: "15-20" })).toBe("endurance");
  });

  it("power for category=power", () => {
    expect(inferStimulusBand({ category: "power" })).toBe("power");
  });

  it("mixed for no reps and no power category", () => {
    expect(inferStimulusBand({})).toBe("mixed");
  });
});
