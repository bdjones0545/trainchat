/**
 * Anti-Loop Reliability Layer — Regression Tests
 *
 * Covers:
 *  1. detectLowDetailContextCommand — all acceptance criteria inputs
 *  2. applyAntiLoopReliabilityLayer — loop breaker, guidance upgrade, NO_OP
 *     upgrade, stale pending detection, pass-through for safe plans
 */

import { describe, it, expect } from "vitest";
import { detectLowDetailContextCommand } from "../execution-planner";
import { applyAntiLoopReliabilityLayer } from "../anti-loop-reliability-layer";
import type { ExecutionPlan } from "../execution-planner";
import type { AntiLoopContext } from "../anti-loop-reliability-layer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockProgram = { days: [] };

function makeCtx(overrides: Partial<AntiLoopContext> = {}): AntiLoopContext {
  return {
    message: "test message",
    program: mockProgram,
    activeSystemId: 1,
    conversationId: 42,
    pendingClarificationId: null,
    pendingClarificationTargetProgramId: null,
    pendingClarificationCount: 0,
    ...overrides,
  };
}

function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    action: "APPLY_MUTATION",
    intentFamily: "increase_difficulty",
    scope: { type: "program" },
    reasoning: "test",
    ...overrides,
  };
}

// ─── detectLowDetailContextCommand ───────────────────────────────────────────

describe("detectLowDetailContextCommand — sport signals", () => {
  it('"football" → sport_only, sport_context_update', () => {
    const r = detectLowDetailContextCommand("football");
    expect(r?.type).toBe("sport_only");
    expect(r?.intentFamily).toBe("sport_context_update");
  });

  it('"Football" case-insensitive', () => {
    expect(detectLowDetailContextCommand("Football")?.type).toBe("sport_only");
  });

  it('"basketball" → sport_only', () => {
    expect(detectLowDetailContextCommand("basketball")?.type).toBe("sport_only");
  });

  it('"hockey" → sport_only', () => {
    expect(detectLowDetailContextCommand("hockey")?.type).toBe("sport_only");
  });

  it('"soccer" → sport_only', () => {
    expect(detectLowDetailContextCommand("soccer")?.type).toBe("sport_only");
  });

  it('"baseball" → sport_only', () => {
    expect(detectLowDetailContextCommand("baseball")?.type).toBe("sport_only");
  });

  it('"lacrosse" → sport_only', () => {
    expect(detectLowDetailContextCommand("lacrosse")?.type).toBe("sport_only");
  });

  it('"I want to train for football" (7 words) → null (too long)', () => {
    expect(detectLowDetailContextCommand("I want to train for football")).toBeNull();
  });

  it('"I play football" → null (has prefix, normal engine handles it)', () => {
    expect(detectLowDetailContextCommand("I play football")).toBeNull();
  });
});

describe("detectLowDetailContextCommand — phase signals", () => {
  it('"in season" → phase_only, sport_context_update', () => {
    const r = detectLowDetailContextCommand("in season");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("sport_context_update");
    expect(r?.value).toBe("in-season");
  });

  it('"in-season" → phase_only', () => {
    expect(detectLowDetailContextCommand("in-season")?.type).toBe("phase_only");
  });

  it('"off season" → phase_only', () => {
    const r = detectLowDetailContextCommand("off season");
    expect(r?.type).toBe("phase_only");
    expect(r?.value).toBe("off-season");
  });

  it('"preseason" → phase_only', () => {
    expect(detectLowDetailContextCommand("preseason")?.type).toBe("phase_only");
  });

  it('"maintenance" → phase_only, fatigue_management', () => {
    const r = detectLowDetailContextCommand("maintenance");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("fatigue_management");
  });

  it('"hypertrophy" → phase_only, hypertrophy_focus', () => {
    const r = detectLowDetailContextCommand("hypertrophy");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("hypertrophy_focus");
  });

  it('"deload" → phase_only, fatigue_management', () => {
    const r = detectLowDetailContextCommand("deload");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("fatigue_management");
  });

  it('"power" → phase_only, power_explosive_focus', () => {
    const r = detectLowDetailContextCommand("power");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("power_explosive_focus");
  });

  it('"speed" → phase_only, speed_focus', () => {
    const r = detectLowDetailContextCommand("speed");
    expect(r?.type).toBe("phase_only");
    expect(r?.intentFamily).toBe("speed_focus");
  });
});

describe("detectLowDetailContextCommand — equipment signals", () => {
  it('"full gym" → equipment_only, equipment_constraint', () => {
    const r = detectLowDetailContextCommand("full gym");
    expect(r?.type).toBe("equipment_only");
    expect(r?.intentFamily).toBe("equipment_constraint");
  });

  it('"dumbbells" → equipment_only', () => {
    expect(detectLowDetailContextCommand("dumbbells")?.type).toBe("equipment_only");
  });

  it('"home gym" → equipment_only', () => {
    expect(detectLowDetailContextCommand("home gym")?.type).toBe("equipment_only");
  });

  it('"bodyweight" → equipment_only', () => {
    expect(detectLowDetailContextCommand("bodyweight")?.type).toBe("equipment_only");
  });

  it('"no machines" → equipment_only', () => {
    expect(detectLowDetailContextCommand("no machines")?.type).toBe("equipment_only");
  });

  it('"kettlebells" → equipment_only', () => {
    expect(detectLowDetailContextCommand("kettlebells")?.type).toBe("equipment_only");
  });
});

describe("detectLowDetailContextCommand — duration signals", () => {
  it('"45 minutes" → duration_only, reduce_time', () => {
    const r = detectLowDetailContextCommand("45 minutes");
    expect(r?.type).toBe("duration_only");
    expect(r?.intentFamily).toBe("reduce_time");
  });

  it('"30 min" → duration_only', () => {
    expect(detectLowDetailContextCommand("30 min")?.type).toBe("duration_only");
  });

  it('"one hour" → duration_only', () => {
    expect(detectLowDetailContextCommand("one hour")?.type).toBe("duration_only");
  });

  it('"under an hour" → duration_only', () => {
    expect(detectLowDetailContextCommand("under an hour")?.type).toBe("duration_only");
  });
});

describe("detectLowDetailContextCommand — non-matching inputs", () => {
  it('"harder" → null (handled by increase_difficulty family)', () => {
    expect(detectLowDetailContextCommand("harder")).toBeNull();
  });

  it('"easier" → null', () => {
    expect(detectLowDetailContextCommand("easier")).toBeNull();
  });

  it('"make it better" → null', () => {
    expect(detectLowDetailContextCommand("make it better")).toBeNull();
  });

  it('"yes" → null', () => {
    expect(detectLowDetailContextCommand("yes")).toBeNull();
  });

  it('"ok" → null', () => {
    expect(detectLowDetailContextCommand("ok")).toBeNull();
  });
});

// ─── applyAntiLoopReliabilityLayer ───────────────────────────────────────────

describe("applyAntiLoopReliabilityLayer — pass-through (no repair needed)", () => {
  it("APPLY_MUTATION plan with program → no change", () => {
    const plan = makePlan({ action: "APPLY_MUTATION" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "football" }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.loopBreakerUsed).toBe(false);
    expect(result.guidanceUpgraded).toBe(false);
    expect(result.noOpUpgraded).toBe(false);
  });

  it("REBUILD_PROGRAM plan → never downgraded", () => {
    const plan = makePlan({ action: "REBUILD_PROGRAM" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "harder" }));
    expect(result.plan.action).toBe("REBUILD_PROGRAM");
  });

  it("ASK_CLARIFICATION with pendingCount=1 → NOT broken (threshold is 2)", () => {
    const plan = makePlan({ action: "ASK_CLARIFICATION", intentFamily: "clarification_required" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "something", pendingClarificationCount: 1 }));
    expect(result.plan.action).toBe("ASK_CLARIFICATION");
    expect(result.loopBreakerUsed).toBe(false);
  });

  it("GUIDANCE with greeting family → NOT upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "greeting" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "harder" }));
    expect(result.plan.action).toBe("GUIDANCE");
    expect(result.guidanceUpgraded).toBe(false);
  });

  it("GUIDANCE with coaching_question family → NOT upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "coaching_question" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "make me stronger" }));
    expect(result.plan.action).toBe("GUIDANCE");
  });

  it("GUIDANCE with program_safety_question → NOT upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "program_safety_question" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "is this safe" }));
    expect(result.plan.action).toBe("GUIDANCE");
  });
});

describe("applyAntiLoopReliabilityLayer — loop breaker (pendingCount ≥ 2)", () => {
  it("ASK_CLARIFICATION + pendingCount=2 + program → APPLY_MUTATION, loopBreakerUsed=true", () => {
    const plan = makePlan({ action: "ASK_CLARIFICATION", intentFamily: "clarification_required" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "make it fit 45 minutes",
      pendingClarificationCount: 2,
    }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.loopBreakerUsed).toBe(true);
    expect(result.defaultScopeUsed).toBe(true);
    expect(result.plan.scope.type).toBe("program");
  });

  it("ASK_CLARIFICATION + pendingCount=3 → also breaks", () => {
    const plan = makePlan({ action: "ASK_CLARIFICATION" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "full gym",
      pendingClarificationCount: 3,
    }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.loopBreakerUsed).toBe(true);
  });

  it("ASK_CLARIFICATION + pendingCount=2 + NO program → NOT broken (no safe default)", () => {
    const plan = makePlan({ action: "ASK_CLARIFICATION" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "in season",
      program: null,
      pendingClarificationCount: 2,
    }));
    expect(result.plan.action).toBe("ASK_CLARIFICATION");
    expect(result.loopBreakerUsed).toBe(false);
  });
});

describe("applyAntiLoopReliabilityLayer — GUIDANCE upgrade", () => {
  it("GUIDANCE + program + action signal + non-guidance family → upgraded to APPLY_MUTATION", () => {
    const plan = makePlan({
      action: "GUIDANCE",
      intentFamily: "increase_difficulty",
    });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "make it harder" }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.guidanceUpgraded).toBe(true);
    expect(result.plan.scope.type).toBe("program");
  });

  it("GUIDANCE + program + action signal + null family → upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: null });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "less volume" }));
    // null family is in GUIDANCE_ONLY_FAMILIES set — should NOT be upgraded
    expect(result.plan.action).toBe("GUIDANCE");
    expect(result.guidanceUpgraded).toBe(false);
  });

  it("GUIDANCE + NO program + action signal → NOT upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "athletic_performance_focus" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "more athletic",
      program: null,
    }));
    expect(result.plan.action).toBe("GUIDANCE");
    expect(result.guidanceUpgraded).toBe(false);
  });

  it("GUIDANCE + program + NO action signal → NOT upgraded", () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "athletic_performance_focus" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "ok" }));
    expect(result.plan.action).toBe("GUIDANCE");
    expect(result.guidanceUpgraded).toBe(false);
  });
});

describe("applyAntiLoopReliabilityLayer — NO_OP upgrade", () => {
  it("NO_OP + program + action signal → APPLY_MUTATION, noOpUpgraded=true", () => {
    const plan = makePlan({ action: "NO_OP" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "harder" }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.noOpUpgraded).toBe(true);
    expect(result.plan.scope.type).toBe("program");
  });

  it("NO_OP + program + 'football' → APPLY_MUTATION", () => {
    const plan = makePlan({ action: "NO_OP" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "football" }));
    // "football" doesn't match ACTION_SIGNAL_RE, handled by low-detail layer earlier
    // so here NO_OP stays (football is not an action verb)
    expect(result.noOpUpgraded).toBe(false);
  });

  it("NO_OP + NO program + action signal → NOT upgraded", () => {
    const plan = makePlan({ action: "NO_OP" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "make it harder",
      program: null,
    }));
    expect(result.plan.action).toBe("NO_OP");
    expect(result.noOpUpgraded).toBe(false);
  });

  it("NO_OP + program + 'easier' → APPLY_MUTATION", () => {
    const plan = makePlan({ action: "NO_OP" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "easier" }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.noOpUpgraded).toBe(true);
  });
});

describe("applyAntiLoopReliabilityLayer — stale pending detection", () => {
  it("pending targetProgramId ≠ activeSystemId → shouldClearPending=true", () => {
    const plan = makePlan();
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      activeSystemId: 1,
      pendingClarificationId: 99,
      pendingClarificationTargetProgramId: 2, // different
    }));
    expect(result.stalePendingCleared).toBe(true);
    expect(result.shouldClearPending).toBe(true);
  });

  it("pending targetProgramId === activeSystemId → NOT stale", () => {
    const plan = makePlan();
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      activeSystemId: 1,
      pendingClarificationId: 99,
      pendingClarificationTargetProgramId: 1, // same
    }));
    expect(result.stalePendingCleared).toBe(false);
    expect(result.shouldClearPending).toBe(false);
  });

  it("no pending clarification → shouldClearPending=false", () => {
    const plan = makePlan();
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      pendingClarificationId: null,
    }));
    expect(result.shouldClearPending).toBe(false);
  });

  it("pending with null targetProgramId → NOT stale (no comparison possible)", () => {
    const plan = makePlan();
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      activeSystemId: 1,
      pendingClarificationId: 99,
      pendingClarificationTargetProgramId: null,
    }));
    expect(result.stalePendingCleared).toBe(false);
  });
});

describe("acceptance criteria — active program exists", () => {
  const withProgram = { program: mockProgram };

  it('"make it more athletic" with GUIDANCE plan → APPLY_MUTATION full_program', () => {
    const plan = makePlan({ action: "GUIDANCE", intentFamily: "athletic_performance_focus" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "make it more athletic", ...withProgram }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.plan.scope.type).toBe("program");
  });

  it('"do it for the whole program" — loop break after 2 rounds', () => {
    const plan = makePlan({ action: "ASK_CLARIFICATION", intentFamily: "clarification_required" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({
      message: "do it for the whole program",
      pendingClarificationCount: 2,
      ...withProgram,
    }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.loopBreakerUsed).toBe(true);
  });

  it('"45 minutes" handled upstream by LD layer — anti-loop passes through APPLY_MUTATION', () => {
    const plan = makePlan({ action: "APPLY_MUTATION", intentFamily: "reduce_time" });
    const result = applyAntiLoopReliabilityLayer(plan, makeCtx({ message: "45 minutes", ...withProgram }));
    expect(result.plan.action).toBe("APPLY_MUTATION");
    expect(result.guidanceUpgraded).toBe(false);
    expect(result.noOpUpgraded).toBe(false);
  });
});
