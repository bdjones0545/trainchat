import { describe, it, expect } from "vitest";
import {
  conflictsWithPainPattern,
  filterCandidatesByConstraints,
  computeConstraintPenalties,
} from "../exercise-constraint-filter";
import type { HardConstraints } from "../constraint-memory";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConstraints(overrides: Partial<HardConstraints> = {}): HardConstraints {
  return {
    bannedItems: [],
    dislikedItems: [],
    painRegions: [],
    monitorRegions: [],
    sport: null,
    ...overrides,
  };
}

function pool<T extends { name: string }>(names: string[]): T[] {
  return names.map((n) => ({ name: n } as T));
}

// ─── conflictsWithPainPattern ─────────────────────────────────────────────────

describe("conflictsWithPainPattern", () => {
  describe("when painRegions is empty", () => {
    it("returns none", () => {
      const r = conflictsWithPainPattern("Back Squat", []);
      expect(r.severity).toBe("none");
      expect(r.matchedRegion).toBeNull();
      expect(r.matchedPattern).toBeNull();
    });
  });

  describe("knee pain", () => {
    it("flags Back Squat as hard conflict", () => {
      const r = conflictsWithPainPattern("Back Squat", ["knee"]);
      expect(r.severity).toBe("hard");
      expect(r.matchedRegion).toBe("knee");
    });

    it("flags Pause Back Squat as hard conflict (substring match)", () => {
      const r = conflictsWithPainPattern("Pause Back Squat", ["knee"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Bulgarian Split Squat as hard conflict", () => {
      const r = conflictsWithPainPattern("Bulgarian Split Squat", ["knee"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Box Jump as hard conflict", () => {
      const r = conflictsWithPainPattern("Box Jump", ["knee"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Goblet Squat as soft conflict", () => {
      const r = conflictsWithPainPattern("Goblet Squat", ["knee"]);
      expect(r.severity).toBe("soft");
    });

    it("does not flag Deadlift for knee", () => {
      const r = conflictsWithPainPattern("Conventional Deadlift", ["knee"]);
      expect(r.severity).toBe("none");
    });
  });

  describe("shoulder pain", () => {
    it("flags Overhead Press as hard conflict", () => {
      const r = conflictsWithPainPattern("Overhead Press", ["shoulder"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Military Press as hard conflict", () => {
      const r = conflictsWithPainPattern("Military Press", ["shoulder"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Lateral Raise as soft conflict", () => {
      const r = conflictsWithPainPattern("Lateral Raise", ["shoulder"]);
      expect(r.severity).toBe("soft");
    });

    it("does not flag Romanian Deadlift for shoulder", () => {
      const r = conflictsWithPainPattern("Romanian Deadlift", ["shoulder"]);
      expect(r.severity).toBe("none");
    });
  });

  describe("lower back pain", () => {
    it("flags Good Morning as hard conflict", () => {
      const r = conflictsWithPainPattern("Good Morning", ["lower back"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Jefferson Curl as hard conflict", () => {
      const r = conflictsWithPainPattern("Jefferson Curl", ["lower back"]);
      expect(r.severity).toBe("hard");
    });

    it("flags Conventional Deadlift as soft conflict", () => {
      const r = conflictsWithPainPattern("Conventional Deadlift", ["lower back"]);
      expect(r.severity).toBe("soft");
    });

    it("flags Barbell Row as soft conflict", () => {
      const r = conflictsWithPainPattern("Barbell Row", ["lower back"]);
      expect(r.severity).toBe("soft");
    });

    it("does not flag Pull-Up for lower back", () => {
      const r = conflictsWithPainPattern("Pull-Up", ["lower back"]);
      expect(r.severity).toBe("none");
    });
  });

  describe("multiple pain regions", () => {
    it("returns hard if any region produces a hard conflict", () => {
      // shoulder → hard for Overhead Press, knee → soft for Goblet Squat
      const r = conflictsWithPainPattern("Overhead Press", ["knee", "shoulder"]);
      expect(r.severity).toBe("hard");
    });

    it("returns soft when both regions give soft conflicts", () => {
      // knee → soft for Goblet Squat, lower back → soft for Conventional Deadlift
      const r = conflictsWithPainPattern("Goblet Squat", ["knee", "lower back"]);
      expect(r.severity).toBe("soft");
    });

    it("returns none when neither region matches", () => {
      const r = conflictsWithPainPattern("Lat Pulldown", ["knee", "lower back"]);
      expect(r.severity).toBe("none");
    });
  });

  describe("case insensitivity", () => {
    it("matches knee pattern regardless of case in exercise name", () => {
      const r = conflictsWithPainPattern("BACK SQUAT", ["knee"]);
      expect(r.severity).toBe("hard");
    });

    it("matches regardless of case in region name", () => {
      const r = conflictsWithPainPattern("Back Squat", ["KNEE"]);
      expect(r.severity).toBe("hard");
    });
  });

  describe("unknown pain regions", () => {
    it("returns none for unrecognized regions", () => {
      const r = conflictsWithPainPattern("Back Squat", ["elbow crease"]);
      expect(r.severity).toBe("none");
    });
  });
});

// ─── filterCandidatesByConstraints ────────────────────────────────────────────

describe("filterCandidatesByConstraints", () => {
  it("returns original pool when no constraints are set", () => {
    const exercises = pool(["Back Squat", "Deadlift", "Bench Press"]);
    const result = filterCandidatesByConstraints(exercises, makeConstraints());
    expect(result).toHaveLength(3);
  });

  describe("banned items", () => {
    it("removes exactly matching banned exercises", () => {
      const exercises = pool(["Back Squat", "Deadlift", "Bench Press"]);
      const c = makeConstraints({ bannedItems: ["Back Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      expect(result.map((e) => e.name)).not.toContain("Back Squat");
      expect(result).toHaveLength(2);
    });

    it("removes exercises that contain the banned keyword", () => {
      const exercises = pool(["Pause Back Squat", "Low-Bar Back Squat", "Deadlift"]);
      const c = makeConstraints({ bannedItems: ["back squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      expect(result.map((e) => e.name)).not.toContain("Pause Back Squat");
      expect(result.map((e) => e.name)).not.toContain("Low-Bar Back Squat");
      expect(result.map((e) => e.name)).toContain("Deadlift");
    });

    it("falls back to original pool if all candidates are banned (safety guarantee)", () => {
      const exercises = pool(["Back Squat", "Front Squat"]);
      const c = makeConstraints({ bannedItems: ["Back Squat", "Front Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      // Safety fallback: never return empty pool
      expect(result.length).toBeGreaterThan(0);
      expect(result).toHaveLength(2);
    });

    it("returns empty pool unchanged if pool is already empty", () => {
      const result = filterCandidatesByConstraints(pool([]), makeConstraints({ bannedItems: ["Back Squat"] }));
      expect(result).toHaveLength(0);
    });
  });

  describe("disliked items", () => {
    it("removes disliked exercises when alternatives remain", () => {
      const exercises = pool(["Back Squat", "Goblet Squat", "Deadlift"]);
      const c = makeConstraints({ dislikedItems: ["Back Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      expect(result.map((e) => e.name)).not.toContain("Back Squat");
      expect(result).toHaveLength(2);
    });

    it("keeps disliked exercises when they are the only option (safety guarantee)", () => {
      const exercises = pool(["Back Squat"]);
      const c = makeConstraints({ dislikedItems: ["Back Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Back Squat");
    });

    it("applies banned removal before disliked removal", () => {
      const exercises = pool(["Back Squat", "Front Squat", "Deadlift"]);
      const c = makeConstraints({ bannedItems: ["Front Squat"], dislikedItems: ["Back Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      // Front Squat banned, Back Squat disliked, only Deadlift left
      expect(result.map((e) => e.name)).toEqual(["Deadlift"]);
    });
  });

  describe("pain regions", () => {
    it("does NOT pre-filter pain region conflicts (uses penalty scoring instead)", () => {
      // Back Squat conflicts with knee pain but is NOT hard-removed from pool
      const exercises = pool(["Back Squat", "Deadlift"]);
      const c = makeConstraints({ painRegions: ["knee"] });
      const result = filterCandidatesByConstraints(exercises, c);
      // Both exercises remain — pain uses penalties, not hard removal
      expect(result).toHaveLength(2);
    });
  });

  describe("generic type preservation", () => {
    it("preserves additional fields on exercise objects", () => {
      const exercises = [
        { name: "Back Squat", sets: 4 },
        { name: "Deadlift", sets: 3 },
      ];
      const c = makeConstraints({ bannedItems: ["Back Squat"] });
      const result = filterCandidatesByConstraints(exercises, c);
      expect(result).toHaveLength(1);
      expect(result[0].sets).toBe(3);
    });
  });
});

// ─── computeConstraintPenalties ────────────────────────────────────────────────

describe("computeConstraintPenalties", () => {
  it("returns zero penalties when no constraints are set", () => {
    const cp = computeConstraintPenalties("Back Squat", makeConstraints());
    expect(cp.bannedPenalty).toBe(0);
    expect(cp.dislikedPenalty).toBe(0);
    expect(cp.painConflictPenalty).toBe(0);
    expect(cp.painConflict.severity).toBe("none");
  });

  describe("banned penalty", () => {
    it("returns 100 for a banned exercise", () => {
      const c = makeConstraints({ bannedItems: ["Back Squat"] });
      const cp = computeConstraintPenalties("Back Squat", c);
      expect(cp.bannedPenalty).toBe(100);
      expect(cp.dislikedPenalty).toBe(0);
    });

    it("returns 0 for a non-banned exercise", () => {
      const c = makeConstraints({ bannedItems: ["Back Squat"] });
      const cp = computeConstraintPenalties("Deadlift", c);
      expect(cp.bannedPenalty).toBe(0);
    });
  });

  describe("disliked penalty", () => {
    it("returns 6 for a disliked exercise", () => {
      const c = makeConstraints({ dislikedItems: ["Deadlift"] });
      const cp = computeConstraintPenalties("Deadlift", c);
      expect(cp.dislikedPenalty).toBe(6);
      expect(cp.bannedPenalty).toBe(0);
    });

    it("returns 0 disliked penalty when exercise is also banned (banned takes priority)", () => {
      const c = makeConstraints({ bannedItems: ["Back Squat"], dislikedItems: ["Back Squat"] });
      const cp = computeConstraintPenalties("Back Squat", c);
      // Banned check fires first — exercise is banned, so dislikedPenalty should be 0
      expect(cp.bannedPenalty).toBe(100);
      expect(cp.dislikedPenalty).toBe(0);
    });
  });

  describe("pain conflict penalty", () => {
    it("returns 6 for a hard pain conflict (knee / back squat)", () => {
      const c = makeConstraints({ painRegions: ["knee"] });
      const cp = computeConstraintPenalties("Back Squat", c);
      expect(cp.painConflictPenalty).toBe(6);
      expect(cp.painConflict.severity).toBe("hard");
    });

    it("returns 3 for a soft pain conflict (knee / goblet squat)", () => {
      const c = makeConstraints({ painRegions: ["knee"] });
      const cp = computeConstraintPenalties("Goblet Squat", c);
      expect(cp.painConflictPenalty).toBe(3);
      expect(cp.painConflict.severity).toBe("soft");
    });

    it("returns 0 for no pain conflict", () => {
      const c = makeConstraints({ painRegions: ["knee"] });
      const cp = computeConstraintPenalties("Pull-Up", c);
      expect(cp.painConflictPenalty).toBe(0);
      expect(cp.painConflict.severity).toBe("none");
    });

    it("returns 6 for a hard shoulder conflict", () => {
      const c = makeConstraints({ painRegions: ["shoulder"] });
      const cp = computeConstraintPenalties("Overhead Press", c);
      expect(cp.painConflictPenalty).toBe(6);
    });

    it("applies pain penalties even for banned exercises", () => {
      // Pain penalty is independent and always computed
      const c = makeConstraints({ bannedItems: ["Back Squat"], painRegions: ["knee"] });
      const cp = computeConstraintPenalties("Back Squat", c);
      expect(cp.bannedPenalty).toBe(100);
      expect(cp.painConflictPenalty).toBe(6);
    });
  });

  describe("combined constraints", () => {
    it("sums correctly when all penalties fire simultaneously", () => {
      // Different exercise from banned, same exercise has disliked + pain
      const c = makeConstraints({
        bannedItems: ["Front Squat"],
        dislikedItems: ["Goblet Squat"],
        painRegions: ["knee"],
      });
      const cp = computeConstraintPenalties("Goblet Squat", c);
      expect(cp.bannedPenalty).toBe(0);           // not banned
      expect(cp.dislikedPenalty).toBe(6);         // disliked
      expect(cp.painConflictPenalty).toBe(3);     // soft knee conflict
    });
  });

  describe("case insensitivity", () => {
    it("matches banned items case-insensitively", () => {
      const c = makeConstraints({ bannedItems: ["back squat"] });
      const cp = computeConstraintPenalties("Back Squat", c);
      expect(cp.bannedPenalty).toBe(100);
    });

    it("matches disliked items case-insensitively", () => {
      const c = makeConstraints({ dislikedItems: ["DEADLIFT"] });
      const cp = computeConstraintPenalties("Deadlift", c);
      expect(cp.dislikedPenalty).toBe(6);
    });
  });
});
