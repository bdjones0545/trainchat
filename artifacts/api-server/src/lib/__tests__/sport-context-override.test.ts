/**
 * Sport-Context Pronoun Override — Regression Tests
 *
 * Verifies that messages like "make it for hockey" are correctly detected as
 * program-level sport-context refinements, and never routed as exercise edits.
 *
 * Tests both:
 *  1. detectSportContextCommand — pure detection function
 *  2. Explicit exercise-target guard — should prevent override
 */

import { describe, it, expect } from "vitest";
import { detectSportContextCommand } from "../execution-planner";

// ─── detectSportContextCommand — detection ────────────────────────────────────

describe("detectSportContextCommand — program-level sport patterns", () => {
  it('"Make it for hockey" → detected, sport=hockey', () => {
    const r = detectSportContextCommand("Make it for hockey");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("hockey");
  });

  it('"make it for hockey" (lowercase) → detected', () => {
    const r = detectSportContextCommand("make it for hockey");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("hockey");
  });

  it('"MAKE IT FOR HOCKEY" (uppercase) → detected', () => {
    const r = detectSportContextCommand("MAKE IT FOR HOCKEY");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("hockey");
  });

  it('"Make this for football" → detected, sport=football', () => {
    const r = detectSportContextCommand("Make this for football");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("football");
  });

  it('"Gear it toward basketball" → detected, sport=basketball', () => {
    const r = detectSportContextCommand("Gear it toward basketball");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("basketball");
  });

  it('"Geared toward tennis" → detected, sport=tennis', () => {
    const r = detectSportContextCommand("Geared toward tennis");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("tennis");
  });

  it('"This is for hockey" → detected, sport=hockey', () => {
    const r = detectSportContextCommand("This is for hockey");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("hockey");
  });

  it('"for soccer" → detected, sport=soccer', () => {
    const r = detectSportContextCommand("for soccer");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("soccer");
  });

  it('"for football" → detected, sport=football', () => {
    const r = detectSportContextCommand("for football");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("football");
  });

  it('"Optimize it for basketball" → detected', () => {
    const r = detectSportContextCommand("Optimize it for basketball");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("basketball");
  });

  it('"Tailor it to lacrosse" → detected', () => {
    const r = detectSportContextCommand("Tailor it to lacrosse");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("lacrosse");
  });

  it('"Build it for baseball" → detected', () => {
    const r = detectSportContextCommand("Build it for baseball");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("baseball");
  });

  it('"Design this for volleyball" → detected', () => {
    const r = detectSportContextCommand("Design this for volleyball");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("volleyball");
  });

  it('"Gear it toward golf" → detected', () => {
    const r = detectSportContextCommand("Gear it toward golf");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("golf");
  });

  it('"Gear it towards wrestling" (with s) → detected', () => {
    const r = detectSportContextCommand("Gear it towards wrestling");
    expect(r).not.toBeNull();
    expect(r?.sport).toBe("wrestling");
  });
});

// ─── Explicit exercise target guard ───────────────────────────────────────────

describe("detectSportContextCommand — explicit exercise target blocks override", () => {
  it('"Make this exercise for hockey" → null (explicit exercise target)', () => {
    expect(detectSportContextCommand("Make this exercise for hockey")).toBeNull();
  });

  it('"Make exercise 2 more hockey-specific" → null', () => {
    expect(detectSportContextCommand("Make exercise 2 more hockey-specific")).toBeNull();
  });

  it('"The first exercise — change it to hockey" → null', () => {
    expect(detectSportContextCommand("The first exercise — change it to hockey")).toBeNull();
  });

  it('"The exercise for hockey" → null', () => {
    expect(detectSportContextCommand("The exercise for hockey")).toBeNull();
  });

  it('"First exercise for soccer" → null', () => {
    expect(detectSportContextCommand("First exercise for soccer")).toBeNull();
  });
});

// ─── Non-matching inputs ───────────────────────────────────────────────────────

describe("detectSportContextCommand — non-matching inputs", () => {
  it('"hockey" (bare sport name) → null (handled by detectLowDetailContextCommand)', () => {
    // Bare names have no verb pattern — handled upstream by LD layer
    expect(detectSportContextCommand("hockey")).toBeNull();
  });

  it('"football" (bare) → null', () => {
    expect(detectSportContextCommand("football")).toBeNull();
  });

  it('"make it harder" (no sport) → null', () => {
    expect(detectSportContextCommand("make it harder")).toBeNull();
  });

  it('"make it better" (no sport) → null', () => {
    expect(detectSportContextCommand("make it better")).toBeNull();
  });

  it('"increase volume" → null', () => {
    expect(detectSportContextCommand("increase volume")).toBeNull();
  });

  it('"What sport should I train for?" → null', () => {
    expect(detectSportContextCommand("What sport should I train for?")).toBeNull();
  });

  it('"I play hockey" (no sport-context verb) → null', () => {
    // "I play hockey" — no context verb pattern, handled by regular intent engine
    expect(detectSportContextCommand("I play hockey")).toBeNull();
  });

  it('"Can you add a hockey drill?" → null (no pronoun/program verb)', () => {
    expect(detectSportContextCommand("Can you add a hockey drill?")).toBeNull();
  });

  it('"ok" → null', () => {
    expect(detectSportContextCommand("ok")).toBeNull();
  });
});

// ─── Acceptance criteria ──────────────────────────────────────────────────────

describe("acceptance criteria — sport-context pronoun override", () => {
  const ACCEPTANCE_CASES: Array<{ message: string; expectedSport: string }> = [
    { message: "Make it for hockey", expectedSport: "hockey" },
    { message: "Make this for football", expectedSport: "football" },
    { message: "Gear it toward basketball", expectedSport: "basketball" },
    { message: "Geared toward soccer", expectedSport: "soccer" },
    { message: "This is for lacrosse", expectedSport: "lacrosse" },
    { message: "for golf", expectedSport: "golf" },
    { message: "for tennis", expectedSport: "tennis" },
    { message: "for wrestling", expectedSport: "wrestling" },
    { message: "for track", expectedSport: "track" },
    { message: "Optimize it for sprinting", expectedSport: "sprinting" },
  ];

  for (const { message, expectedSport } of ACCEPTANCE_CASES) {
    it(`"${message}" → detected as sport=${expectedSport}`, () => {
      const r = detectSportContextCommand(message);
      expect(r).not.toBeNull();
      expect(r?.sport).toBe(expectedSport);
    });
  }
});
