/**
 * Age-Aware Programming Layer — Unit Tests
 *
 * Covers:
 *   1. Age extraction from user input (extractConstraints)
 *   2. Special population detection (detectSpecialPopulation)
 *   3. Age-aware constraint contract behavior (isOlderAdult flag)
 *   4. Sport+age integration detection
 */

import { describe, it, expect } from "vitest";
import { extractConstraints } from "../intent";
import { detectSpecialPopulation, sanitizeOlderAdultProgram } from "../special-populations-engine";

// ─── Task 1: Age extraction from natural language ─────────────────────────────

describe("extractConstraints — age extraction", () => {
  it("extracts age from '65 year old pickleball player'", () => {
    const c = extractConstraints("I am a 65 year old pickleball player give me a 3 day program");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from 'I am 65'", () => {
    const c = extractConstraints("I am 65 and want a 3 day program");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from 'I'm 65'", () => {
    const c = extractConstraints("I'm 65, pickleball player");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from '65yo'", () => {
    const c = extractConstraints("65yo golfer, 3 day program");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from '72yo golfer'", () => {
    const c = extractConstraints("72yo golfer with knee pain and limited equipment");
    expect(c.userAge).toBe(72);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from '42-year-old baseball player'", () => {
    const c = extractConstraints("I'm a 42-year-old baseball player give me a 4 day plan");
    expect(c.userAge).toBe(42);
    expect(c.isOlderAdult).toBe(false);
  });

  it("extracts age from 'female, 58, limited equipment'", () => {
    const c = extractConstraints("female, 58, limited equipment, 3 day program");
    expect(c.userAge).toBe(58);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from 'I'm 61 and have knee pain'", () => {
    const c = extractConstraints("I'm 61 and have knee pain, give me a program");
    expect(c.userAge).toBe(61);
    expect(c.isOlderAdult).toBe(true);
  });

  it("extracts age from '28 year old explosive football plan'", () => {
    const c = extractConstraints("I'm 28 and want a 4 day explosive football off-season plan");
    expect(c.userAge).toBe(28);
    expect(c.isOlderAdult).toBe(false);
  });

  it("does NOT confuse training days with age", () => {
    const c = extractConstraints("give me a 3 day strength program");
    expect(c.userAge).toBeNull();
    expect(c.daysPerWeek).toBe(3);
  });

  it("does NOT confuse rep counts with age", () => {
    const c = extractConstraints("I want 4 sets of 12 reps");
    expect(c.userAge).toBeNull();
  });

  it("extracts age from 'in my 60s'", () => {
    const c = extractConstraints("I'm in my 60s and want a safe program");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });

  it("defaults age to 65 for 'senior' references", () => {
    const c = extractConstraints("program for a senior who plays golf");
    expect(c.userAge).toBe(65);
    expect(c.isOlderAdult).toBe(true);
  });
});

// ─── Task 2: Special population detection ────────────────────────────────────

describe("detectSpecialPopulation — older adult detection", () => {
  it("detects 65-year-old pickleball player as older_adult", () => {
    const p = detectSpecialPopulation("I am a 65 year old pickleball player give me a 3 day program", "athletic_performance");
    expect(p).not.toBeNull();
    expect(p!.primaryTag).toBe("older_adult");
    expect(p!.ageFlag).toBe(65);
  });

  it("detects sport context for pickleball player", () => {
    const p = detectSpecialPopulation("I am a 65 year old pickleball player give me a 3 day program", null);
    expect(p).not.toBeNull();
    expect(p!.sportContext).toBe("pickleball");
  });

  it("detects 72-year-old golfer with knee pain as older_adult + pain_sensitive", () => {
    const p = detectSpecialPopulation("72 year old golfer with knee pain and limited equipment", null);
    expect(p).not.toBeNull();
    expect(p!.tags).toContain("older_adult");
    expect(p!.tags).toContain("pain_sensitive");
    expect(p!.ageFlag).toBe(72);
    expect(p!.sportContext).toBe("golf");
    expect(p!.isConservative).toBe(true); // 72 >= 70
  });

  it("does NOT flag 28-year-old as special population", () => {
    const p = detectSpecialPopulation("I'm 28 and want a 4 day explosive football off-season plan", "athletic_performance");
    expect(p).toBeNull();
  });

  it("returns null for 58-year-old (SP engine threshold is 60+ — age bias handled via constraint contract)", () => {
    // detectSpecialPopulation uses 60+ as the older_adult threshold.
    // 58-year-olds get mild joint-friendly bias through the constraint contract (isOlderAdult=true in intent.ts)
    // but do NOT route through the SP engine architecture path.
    const p = detectSpecialPopulation("58 year old former lifter, advanced, wants to keep heavy trap bar deadlifts", null);
    expect(p).toBeNull();
  });

  it("detects sport context for golf", () => {
    const p = detectSpecialPopulation("72yo golfer with knee pain", null);
    expect(p).not.toBeNull();
    expect(p!.sportContext).toBe("golf");
  });

  it("detects sport context for tennis", () => {
    const p = detectSpecialPopulation("I am 63 and play tennis twice a week", null);
    expect(p).not.toBeNull();
    expect(p!.sportContext).toBe("tennis");
  });

  it("sets isConservative for age 70+", () => {
    const p = detectSpecialPopulation("72 year old golfer", null);
    expect(p).not.toBeNull();
    expect(p!.isConservative).toBe(true);
  });

  it("does NOT set isConservative for age 65 (no other flags)", () => {
    const p = detectSpecialPopulation("65 year old pickleball player", null);
    expect(p).not.toBeNull();
    expect(p!.isConservative).toBe(false);
  });
});

// ─── Task 3: Age-aware constraint behavior ────────────────────────────────────

describe("extractConstraints — isOlderAdult behavior", () => {
  it("sets isOlderAdult=true for age 50", () => {
    const c = extractConstraints("I'm 50 and want a strength program");
    expect(c.isOlderAdult).toBe(true);
  });

  it("sets isOlderAdult=true for age 65", () => {
    const c = extractConstraints("65 year old pickleball player");
    expect(c.isOlderAdult).toBe(true);
  });

  it("sets isOlderAdult=false for age 49", () => {
    const c = extractConstraints("I am 49, want a strength program");
    expect(c.isOlderAdult).toBe(false);
  });

  it("sets isOlderAdult=false for age 28", () => {
    const c = extractConstraints("I am 28 years old football player");
    expect(c.isOlderAdult).toBe(false);
  });
});

// ─── Task 3b: Post-generation safety filter ──────────────────────────────────

function makeProgram(...dayExercises: Array<Array<{ name: string; reps?: string }>>): Record<string, unknown> {
  return {
    programName: "Test Program",
    days: dayExercises.map((exs, i) => ({
      dayNumber: i + 1,
      name: `Day ${i + 1}`,
      exercises: exs.map(e => ({ name: e.name, reps: e.reps ?? "8-10", sets: 3, rest: "90 sec" })),
    })),
  };
}

describe("sanitizeOlderAdultProgram — safety filter", () => {
  const MSG_60 = "I am a 60 year old pickleball player give me a 3 day program";
  const MSG_YOUNG = "I am 28 years old football player give me a program";

  it("replaces Box Jump with Box Step-Up for older adult", () => {
    const p = makeProgram([{ name: "Box Jump", reps: "3-4" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Box Step-Up (slow, controlled)");
    expect((r.days as any)[0].exercises[0].reps).toBe("8-10");
  });

  it("replaces Pull-Up (unscaled) with Lat Pulldown for older adult", () => {
    const p = makeProgram([{ name: "Pull-Up", reps: "8-10" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Lat Pulldown (controlled)");
  });

  it("does NOT replace Assisted Pull-Up for older adult", () => {
    const p = makeProgram([{ name: "Assisted Pull-Up", reps: "10-12" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Assisted Pull-Up"); // unchanged
  });

  it("replaces Bulgarian Split Squat for older adult", () => {
    const p = makeProgram([{ name: "Bulgarian Split Squat", reps: "8-10 each side" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Rear-Foot Elevated Split Squat (supported)");
  });

  it("replaces Power Clean for older adult", () => {
    const p = makeProgram([{ name: "Power Clean", reps: "3-4" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Trap Bar Deadlift (controlled)");
  });

  it("replaces Conventional Deadlift at 1-6 reps for older adult", () => {
    const p = makeProgram([{ name: "Conventional Deadlift", reps: "4-6" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Trap Bar Deadlift (controlled)");
    expect((r.days as any)[0].exercises[0].reps).toBe("8-10");
  });

  it("does NOT replace Conventional Deadlift at 8-12 reps for older adult", () => {
    const p = makeProgram([{ name: "Conventional Deadlift", reps: "8-12" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Conventional Deadlift"); // unchanged
  });

  it("does NOT replace any exercises for a 28-year-old", () => {
    const p = makeProgram([{ name: "Box Jump", reps: "3-4" }, { name: "Power Clean", reps: "3-5" }]);
    const r = sanitizeOlderAdultProgram(p, MSG_YOUNG);
    expect((r.days as any)[0].exercises[0].name).toBe("Box Jump"); // unchanged
    expect((r.days as any)[0].exercises[1].name).toBe("Power Clean"); // unchanged
  });

  it("does not mutate the original program", () => {
    const p = makeProgram([{ name: "Box Jump", reps: "3-4" }]);
    const original = JSON.stringify(p);
    sanitizeOlderAdultProgram(p, MSG_60);
    expect(JSON.stringify(p)).toBe(original); // unchanged
  });

  it("handles programs with multiple days and exercises", () => {
    const p = makeProgram(
      [{ name: "Box Jump", reps: "3-4" }, { name: "Trap Bar Deadlift", reps: "8-10" }],
      [{ name: "Pull-Up", reps: "6-8" }, { name: "Lat Pulldown", reps: "10-12" }],
      [{ name: "Bulgarian Split Squat", reps: "10-12" }, { name: "Step-Up", reps: "10-12" }],
    );
    const r = sanitizeOlderAdultProgram(p, MSG_60);
    expect((r.days as any)[0].exercises[0].name).toBe("Box Step-Up (slow, controlled)");
    expect((r.days as any)[0].exercises[1].name).toBe("Trap Bar Deadlift"); // unchanged (not in prohibited list)
    expect((r.days as any)[1].exercises[0].name).toBe("Lat Pulldown (controlled)"); // Pull-Up → Lat Pulldown
    expect((r.days as any)[1].exercises[1].name).toBe("Lat Pulldown"); // unchanged
    expect((r.days as any)[2].exercises[0].name).toBe("Rear-Foot Elevated Split Squat (supported)"); // BSS → RFESS
    expect((r.days as any)[2].exercises[1].name).toBe("Step-Up"); // unchanged
  });
});

// ─── Task 4: Sport extraction alongside age ───────────────────────────────────

describe("extractConstraints — sport extraction with age", () => {
  it("extracts pickleball + age from 65-year-old request", () => {
    const c = extractConstraints("I am a 65 year old pickleball player give me a 3 day program");
    expect(c.sportFocus).toBe("pickleball");
    expect(c.userAge).toBe(65);
    expect(c.daysPerWeek).toBe(3);
  });

  it("extracts golf + age 72", () => {
    const c = extractConstraints("72 year old golfer with knee pain and limited equipment");
    expect(c.sportFocus).toBe("golf");
    expect(c.userAge).toBe(72);
  });

  it("extracts football + age 28", () => {
    const c = extractConstraints("I'm 28 and want a 4 day explosive football off-season plan");
    expect(c.sportFocus).toBe("american_football");
    expect(c.userAge).toBe(28);
    expect(c.daysPerWeek).toBe(4);
  });
});
