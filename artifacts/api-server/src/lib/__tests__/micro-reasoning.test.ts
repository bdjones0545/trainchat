import { describe, it, expect } from "vitest";
import { buildMicroReasons, type MicroReasonContext } from "../micro-reasoning";
import type { HardConstraints } from "../constraint-memory";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConstraints(overrides: Partial<HardConstraints> = {}): HardConstraints {
  return {
    bannedItems: [],
    dislikedItems: [],
    painRegions: [],
    sport: null,
    ...overrides,
  };
}

const EMPTY_CTX: MicroReasonContext = {};

// ─── Spec test 1: Belt Squat unavailable ─────────────────────────────────────

describe("Spec test 1 — Belt Squat unavailable", () => {
  it("generates a reason that mentions Belt Squat", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
    });
    expect(result.safeToShow).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0].toLowerCase()).toContain("belt squat");
  });

  it("reason says the item was avoided, not banned", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
    });
    const reason = result.reasons[0].toLowerCase();
    // Must reference avoidance in natural language
    expect(reason).toMatch(/avoided|left out|skipped/);
  });

  it("evidence points to the correct source", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
    });
    expect(result.evidence[0].evidenceSource).toContain("bannedItems");
  });
});

// ─── Spec test 2: Home gym ───────────────────────────────────────────────────

describe("Spec test 2 — Home gym equipment", () => {
  it("generates a reason mentioning dumbbell bias for dumbbells_only", () => {
    const result = buildMicroReasons({
      equipmentProfile: "dumbbells_only",
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/dumbbell|home|bodyweight/);
  });

  it("generates a reason for home_limited equipment", () => {
    const result = buildMicroReasons({
      equipmentProfile: "home_limited",
    });
    expect(result.safeToShow).toBe(true);
  });

  it("generates a reason for hotel/travel context", () => {
    const result = buildMicroReasons({
      equipmentProfile: "hotel gym",
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/dumbbell|bodyweight|away from home/);
  });

  it("does NOT generate an equipment reason for full gym", () => {
    // full_gym is NOT a constrained environment
    const result = buildMicroReasons({
      equipmentProfile: "full_gym",
    });
    // If only equipment is set and it's full_gym, there's no reason to generate
    expect(result.reasons.every((r) => !r.toLowerCase().includes("full_gym"))).toBe(true);
  });
});

// ─── Spec test 3: Golf ───────────────────────────────────────────────────────

describe("Spec test 3 — Golf sport context", () => {
  it("generates a reason mentioning rotational or core emphasis", () => {
    const result = buildMicroReasons({ sport: "golf" });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/golf|rotation|core/);
  });

  it("mentions the sport name in the reason", () => {
    const result = buildMicroReasons({ sport: "golf" });
    expect(result.reasons[0].toLowerCase()).toContain("golf");
  });

  it("generates an appropriate reason for swimming", () => {
    const result = buildMicroReasons({ sport: "swimming" });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/swim|shoulder|pull/);
  });

  it("generates an appropriate reason for rugby", () => {
    const result = buildMicroReasons({ sport: "rugby" });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/rugby|power|strength/);
  });
});

// ─── Spec test 4: Knee pain ──────────────────────────────────────────────────

describe("Spec test 4 — Knee pain region", () => {
  it("generates a reason mentioning reduced knee-dominant loading", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ painRegions: ["knee"] }),
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/knee/);
  });

  it("reason references a note or adjustment, not a penalty", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ painRegions: ["knee"] }),
    });
    const reason = result.reasons[0].toLowerCase();
    expect(reason).toMatch(/note|adjusted|reduced|minimal/);
  });

  it("generates a shoulder reason for shoulder pain", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ painRegions: ["shoulder"] }),
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toContain("shoulder");
  });

  it("generates a lower back reason", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ painRegions: ["lower back"] }),
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toMatch(/lower back/);
  });
});

// ─── Spec test 5: No evidence → no reason generated ─────────────────────────

describe("Spec test 5 — No evidence", () => {
  it("returns safeToShow:false when context is empty", () => {
    const result = buildMicroReasons(EMPTY_CTX);
    expect(result.safeToShow).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.evidence).toHaveLength(0);
  });

  it("returns safeToShow:false for full_gym with no other context", () => {
    const result = buildMicroReasons({ equipmentProfile: "full_gym" });
    expect(result.safeToShow).toBe(false);
  });

  it("returns safeToShow:false when hardConstraints are all empty", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints(),
    });
    expect(result.safeToShow).toBe(false);
  });
});

// ─── Spec test 6: Maximum 3 reasons shown ────────────────────────────────────

describe("Spec test 6 — Maximum 3 reasons", () => {
  it("never returns more than 3 reasons even with many evidence sources", () => {
    const result = buildMicroReasons({
      sport: "golf",
      equipmentProfile: "home_limited",
      hardConstraints: makeConstraints({
        bannedItems: ["Belt Squat", "Cable Machine"],
        dislikedItems: ["Leg Press"],
        painRegions: ["knee", "shoulder"],
      }),
    });
    expect(result.reasons.length).toBeLessThanOrEqual(3);
  });

  it("evidence array has the same length as reasons array", () => {
    const result = buildMicroReasons({
      sport: "rugby",
      equipmentProfile: "hotel gym",
      hardConstraints: makeConstraints({
        bannedItems: ["Belt Squat"],
        painRegions: ["knee"],
      }),
    });
    expect(result.reasons.length).toBe(result.evidence.length);
  });
});

// ─── Spec test 7: No internal terms appear ───────────────────────────────────

describe("Spec test 7 — No internal terms in reasons", () => {
  const PROHIBITED = [
    "hardConstraints",
    "softmax",
    "scoreCandidate",
    "penalty",
    "filter",
    "pool",
    "banned",
    "disliked",
    "equipment_level",
    "full_gym",
    "home_limited",
    "dumbbells_only",
    "exercise-variation-engine",
    "constraint-memory",
  ];

  function checkReasons(reasons: string[]): void {
    for (const reason of reasons) {
      const lower = reason.toLowerCase();
      for (const term of PROHIBITED) {
        expect(lower, `Reason "${reason}" must not contain "${term}"`).not.toContain(term.toLowerCase());
      }
    }
  }

  it("no internal terms in banned item reason", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
    });
    checkReasons(result.reasons);
  });

  it("no internal terms in pain region reason", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ painRegions: ["knee"] }),
    });
    checkReasons(result.reasons);
  });

  it("no internal terms in sport reason", () => {
    const result = buildMicroReasons({ sport: "golf" });
    checkReasons(result.reasons);
  });

  it("no internal terms in equipment reason", () => {
    const result = buildMicroReasons({ equipmentProfile: "home_limited" });
    checkReasons(result.reasons);
  });

  it("no internal terms in disliked item reason", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ dislikedItems: ["Leg Press"] }),
    });
    checkReasons(result.reasons);
  });

  it("no internal terms when all reason types fire simultaneously", () => {
    const result = buildMicroReasons({
      sport: "golf",
      equipmentProfile: "home_limited",
      hardConstraints: makeConstraints({
        bannedItems: ["Belt Squat"],
        dislikedItems: ["Leg Press"],
        painRegions: ["knee"],
      }),
    });
    checkReasons(result.reasons);
  });
});

// ─── Spec test 8: Unsupported reasons are never shown ────────────────────────

describe("Spec test 8 — No unsupported reasons", () => {
  it("returns safeToShow:false when there is no evidence", () => {
    const result = buildMicroReasons({});
    expect(result.safeToShow).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("evidence array is empty when safeToShow is false", () => {
    const result = buildMicroReasons({ goal: "strength" });
    // goal alone without sport/equipment/constraints provides no reason basis
    expect(result.reasons.length).toBe(result.evidence.length);
    if (!result.safeToShow) {
      expect(result.evidence).toHaveLength(0);
    }
  });

  it("each reason has matching evidence of the right type", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
      sport: "golf",
    });
    // Reasons and evidence must be 1:1
    expect(result.reasons.length).toBe(result.evidence.length);
    for (const ev of result.evidence) {
      expect(ev.reasonType).toBeTruthy();
      expect(ev.evidenceSource).toBeTruthy();
      expect(ev.evidenceValue).toBeDefined();
    }
  });
});

// ─── Additional coverage ─────────────────────────────────────────────────────

describe("Priority ordering", () => {
  it("banned items reason comes before sport reason", () => {
    const result = buildMicroReasons({
      sport: "golf",
      hardConstraints: makeConstraints({ bannedItems: ["Belt Squat"] }),
    });
    const types = result.evidence.map((e) => e.reasonType);
    const bannedIdx = types.indexOf("banned_item");
    const sportIdx = types.indexOf("sport_bias");
    // banned_item should come first
    if (bannedIdx !== -1 && sportIdx !== -1) {
      expect(bannedIdx).toBeLessThan(sportIdx);
    }
  });

  it("pain region comes before sport", () => {
    const result = buildMicroReasons({
      sport: "golf",
      hardConstraints: makeConstraints({ painRegions: ["knee"] }),
    });
    const types = result.evidence.map((e) => e.reasonType);
    const painIdx = types.indexOf("pain_region");
    const sportIdx = types.indexOf("sport_bias");
    if (painIdx !== -1 && sportIdx !== -1) {
      expect(painIdx).toBeLessThan(sportIdx);
    }
  });
});

describe("Disliked items", () => {
  it("generates a reason for a disliked exercise", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ dislikedItems: ["Leg Press"] }),
    });
    expect(result.safeToShow).toBe(true);
    const reason = result.reasons.join(" ").toLowerCase();
    expect(reason).toContain("leg press");
  });

  it("reason avoids internal language for disliked items", () => {
    const result = buildMicroReasons({
      hardConstraints: makeConstraints({ dislikedItems: ["Leg Press"] }),
    });
    // Must say something like "prefer to avoid" not "disliked"
    const reason = result.reasons[0].toLowerCase();
    expect(reason).not.toContain("disliked");
    expect(reason).toMatch(/avoid|prefer|skip/);
  });
});

describe("Mutation path", () => {
  it("generates a reason when mutation and verification are both present and verified", () => {
    const result = buildMicroReasons({
      mutationPlan: {
        mutationType: "substitute",
        targetScope: "session",
        intentFamily: "exercise_swap" as any,
        aiDirective: "",
        scopeGuidance: "",
        safetyFlags: [],
        extractedEntities: {} as any,
        persistenceType: "permanent",
      },
      verificationResult: {
        status: "verified",
        verified: true,
        requestedMutationType: "substitute",
        summary: "swap complete",
        userSafeSummary: "swap applied",
        expectedChanges: ["swap"],
        verifiedChanges: ["swap"],
        missingChanges: [],
      },
    });
    expect(result.safeToShow).toBe(true);
    expect(result.reasons[0].toLowerCase()).not.toContain("mutation");
  });

  it("does NOT generate a mutation reason when verification failed", () => {
    const result = buildMicroReasons({
      mutationPlan: {
        mutationType: "substitute",
        targetScope: "session",
        intentFamily: "exercise_swap" as any,
        aiDirective: "",
        scopeGuidance: "",
        safetyFlags: [],
        extractedEntities: {} as any,
        persistenceType: "permanent",
      },
      verificationResult: {
        status: "failed",
        verified: false,
        requestedMutationType: "substitute",
        summary: "failed",
        userSafeSummary: "failed",
        expectedChanges: [],
        verifiedChanges: [],
        missingChanges: ["swap"],
      },
    });
    // No evidence → no reason
    expect(result.safeToShow).toBe(false);
  });
});
