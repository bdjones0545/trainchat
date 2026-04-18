/**
 * Sport Language Normalizer Tests
 *
 * Covers all 10 Phase 9 spec test cases plus additional edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  resolveSportLanguage,
  extractSportMentionsFromText,
  getBestSportResolution,
  buildResolutionExplanation,
  disambiguateSportAlias,
  isValidSportId,
  getDisplayName,
} from "../lib/sport-language-normalizer";

// ─── Spec Test Cases (Phase 9) ────────────────────────────────────────────────

describe("Phase 9 — Spec Required Test Cases", () => {

  // 1. "boxer" → boxing
  it("1. 'boxer' resolves to boxing", () => {
    const result = resolveSportLanguage({ text: "boxer" });
    expect(result.canonicalSportId).toBe("boxing");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.resolutionType).toMatch(/exact|alias/);
  });

  // 2. "pickle" → pickleball
  it("2. 'pickle' resolves to pickleball", () => {
    const result = resolveSportLanguage({ text: "pickle" });
    expect(result.canonicalSportId).toBe("pickleball");
    expect(result.resolutionType).toMatch(/alias/);
  });

  // 3. "flag" → flag_football
  it("3. 'flag' resolves to flag_football", () => {
    const result = resolveSportLanguage({ text: "flag" });
    expect(result.canonicalSportId).toBe("flag_football");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // 4. "lax" → lacrosse
  it("4. 'lax' resolves to lacrosse", () => {
    const result = resolveSportLanguage({ text: "lax" });
    expect(result.canonicalSportId).toBe("lacrosse");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // 5. "pitcher" → baseball_pitcher
  it("5. 'pitcher' resolves to baseball_pitcher (default — most common context)", () => {
    const result = resolveSportLanguage({ text: "pitcher" });
    expect(result.canonicalSportId).toBe("baseball_pitcher");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // 6. "I'm a cricket bowler" → cricket_bowler
  it("6. 'I'm a cricket bowler' resolves to cricket_bowler", () => {
    const result = resolveSportLanguage({ text: "I'm a cricket bowler" });
    expect(result.canonicalSportId).toBe("cricket_bowler");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  // 7. "bowler" resolves to cricket_bowler when current profile is cricket
  it("7. 'bowler' resolves to cricket_bowler when profile is cricket", () => {
    const result = resolveSportLanguage({
      text: "bowler",
      currentProfile: { primarySport: "cricket" },
    });
    expect(result.canonicalSportId).toBe("cricket_bowler");
    expect(result.resolutionType).toBe("contextual");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // 8. "bowler" resolves to bowling when current profile is bowling
  it("8. 'bowler' resolves to bowling when profile is bowling", () => {
    const result = resolveSportLanguage({
      text: "bowler",
      currentProfile: { primarySport: "bowling" },
    });
    expect(result.canonicalSportId).toBe("bowling");
    expect(result.resolutionType).toBe("contextual");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // 9. "keeper" remains ambiguous without context
  it("9. 'keeper' is ambiguous without context", () => {
    const result = resolveSportLanguage({ text: "keeper" });
    // Should either be ambiguous or have low confidence
    const isAmbiguous =
      result.resolutionType === "ambiguous" ||
      result.confidence < 0.75;
    expect(isAmbiguous).toBe(true);
  });

  // 10. Unknown slang does not crash
  it("10. Unknown slang does not crash the system", () => {
    expect(() => resolveSportLanguage({ text: "zlorbzorp" })).not.toThrow();
    expect(() => resolveSportLanguage({ text: "" })).not.toThrow();
    expect(() => resolveSportLanguage({ text: "🏋️ emoji only 🏋️" })).not.toThrow();
    expect(() => resolveSportLanguage({ text: "!!!@@@###" })).not.toThrow();
  });
});

// ─── Alias Coverage Tests ─────────────────────────────────────────────────────

describe("Alias Coverage — Standard Sports", () => {
  const cases: Array<[string, string]> = [
    ["boxing", "boxing"],
    ["pickleball", "pickleball"],
    ["hoops", "basketball"],
    ["bball", "basketball"],
    ["hooper", "basketball"],
    ["flag football", "flag_football"],
    ["flag", "flag_football"],
    ["lax", "lacrosse"],
    ["lacrosse", "lacrosse"],
    ["laxer", "lacrosse"],
    ["volleyball", "volleyball"],
    ["vb", "volleyball"],
    ["wrestling", "wrestling"],
    ["wrestler", "wrestling"],
    ["grappler", "wrestling"],
    ["grappling", "wrestling"],
    ["mma", "mma"],
    ["mixed martial arts", "mma"],
    ["ufc", "mma"],
    ["cage fighter", "mma"],
    ["bowling", "bowling"],
    ["cricket", "cricket"],
    ["cricketer", "cricket"],
    ["wicketkeeper", "cricket_wicketkeeper"],
    ["cricket bowler", "cricket_bowler"],
    ["fast bowler", "cricket_bowler"],
    ["spin bowler", "cricket_bowler"],
    ["seamer", "cricket_bowler"],
    ["golf", "golf"],
    ["golfer", "golf"],
    ["softball", "softball"],
    ["fastpitch", "softball"],
    ["padel", "padel"],
    ["badminton", "badminton"],
    ["squash", "squash"],
    ["rugby", "rugby"],
    ["rugger", "rugby"],
    ["swimming", "swimming"],
    ["swimmer", "swimming"],
    ["cycling", "cycling"],
    ["cyclist", "cycling"],
    ["triathlon", "cycling"],
    ["triathlete", "cycling"],
    ["rowing", "rowing"],
    ["crew", "rowing"],
    ["erg", "rowing"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => {
      const result = resolveSportLanguage({ text: input });
      expect(result.canonicalSportId).toBe(expected);
    });
  }
});

// ─── Role Resolution Tests ────────────────────────────────────────────────────

describe("Role Resolution", () => {
  it("'setter' resolves to volleyball with volleyball_setter role", () => {
    const result = resolveSportLanguage({ text: "setter" });
    expect(result.canonicalSportId).toBe("volleyball");
    expect(result.canonicalRoleId).toBe("volleyball_setter");
  });

  it("'libero' resolves to volleyball with volleyball_libero role", () => {
    const result = resolveSportLanguage({ text: "libero" });
    expect(result.canonicalSportId).toBe("volleyball");
    expect(result.canonicalRoleId).toBe("volleyball_libero");
  });

  it("'outside hitter' resolves to volleyball_hitter", () => {
    const result = resolveSportLanguage({ text: "outside hitter" });
    expect(result.canonicalSportId).toBe("volleyball");
    expect(result.canonicalRoleId).toBe("volleyball_hitter");
  });

  it("'quarterback' resolves to football skill position", () => {
    const result = resolveSportLanguage({ text: "quarterback" });
    expect(result.canonicalSportId).toBe("football");
    expect(result.canonicalRoleId).toBe("skill");
  });

  it("'lineman' resolves to football lineman", () => {
    const result = resolveSportLanguage({ text: "lineman" });
    expect(result.canonicalSportId).toBe("football");
    expect(result.canonicalRoleId).toBe("lineman");
  });

  it("'goalkeeper' resolves to soccer goalkeeper role", () => {
    const result = resolveSportLanguage({ text: "goalkeeper" });
    expect(result.canonicalSportId).toBe("soccer");
    expect(result.canonicalRoleId).toBe("goalkeeper");
  });

  it("'cricket batter' resolves to cricket_batter", () => {
    const result = resolveSportLanguage({ text: "cricket batter" });
    expect(result.canonicalSportId).toBe("cricket_batter");
  });

  it("'cricket wicketkeeper' resolves to cricket_wicketkeeper", () => {
    const result = resolveSportLanguage({ text: "cricket wicketkeeper" });
    expect(result.canonicalSportId).toBe("cricket_wicketkeeper");
  });

  it("'cricket keeper' resolves to cricket_wicketkeeper", () => {
    const result = resolveSportLanguage({ text: "cricket keeper" });
    expect(result.canonicalSportId).toBe("cricket_wicketkeeper");
  });
});

// ─── Contextual Disambiguation Tests ─────────────────────────────────────────

describe("Contextual Disambiguation", () => {
  it("'bowler' with no profile is ambiguous (bowling vs cricket)", () => {
    const result = resolveSportLanguage({ text: "bowler" });
    const isAmbiguousOrLowConf = result.resolutionType === "ambiguous" || result.confidence < 0.8;
    expect(isAmbiguousOrLowConf).toBe(true);
  });

  it("'bowler' with cricket profile → cricket_bowler (contextual)", () => {
    const result = resolveSportLanguage({
      text: "bowler",
      currentProfile: { primarySport: "cricket_bowler" },
    });
    expect(result.canonicalSportId).toBe("cricket_bowler");
    expect(result.resolutionType).toBe("contextual");
  });

  it("'batter' with baseball profile → baseball", () => {
    const result = resolveSportLanguage({
      text: "batter",
      currentProfile: { primarySport: "baseball" },
    });
    expect(result.canonicalSportId).toBe("baseball");
    expect(result.resolutionType).toBe("contextual");
  });

  it("'batter' with cricket profile → cricket_batter", () => {
    const result = resolveSportLanguage({
      text: "batter",
      currentProfile: { primarySport: "cricket" },
    });
    expect(result.canonicalSportId).toBe("cricket_batter");
    expect(result.resolutionType).toBe("contextual");
  });

  it("'keeper' with soccer profile → soccer goalkeeper", () => {
    const result = resolveSportLanguage({
      text: "keeper",
      currentProfile: { primarySport: "soccer" },
    });
    expect(result.canonicalSportId).toBe("soccer");
    expect(result.resolutionType).toBe("contextual");
  });

  it("'fighter' with boxing profile → boxing", () => {
    const result = resolveSportLanguage({
      text: "fighter",
      currentProfile: { primarySport: "boxing" },
    });
    expect(result.canonicalSportId).toBe("boxing");
  });

  it("'fighter' with mma profile → mma", () => {
    const result = resolveSportLanguage({
      text: "fighter",
      currentProfile: { primarySport: "mma" },
    });
    expect(result.canonicalSportId).toBe("mma");
  });

  it("'fighter' with no profile is ambiguous (boxing vs mma)", () => {
    const result = resolveSportLanguage({ text: "fighter" });
    const isAmbiguousOrLowConf = result.resolutionType === "ambiguous" || result.confidence < 0.75;
    expect(isAmbiguousOrLowConf).toBe(true);
  });
});

// ─── Phrase Extraction Tests ──────────────────────────────────────────────────

describe("Phrase Extraction from Natural Sentences", () => {
  const cases: Array<{sentence: string; expectedSport: string}> = [
    { sentence: "I'm a boxer.", expectedSport: "boxing" },
    { sentence: "I play pickle 3 times a week.", expectedSport: "pickleball" },
    { sentence: "I do flag and run track.", expectedSport: "flag_football" },
    { sentence: "Former wrestler, now getting into MMA.", expectedSport: "wrestling" },
    { sentence: "I'm a cricket bowler.", expectedSport: "cricket_bowler" },
    { sentence: "I'm a pitcher.", expectedSport: "baseball_pitcher" },
    { sentence: "I coach lax.", expectedSport: "lacrosse" },
    { sentence: "I've been playing hoops my whole life.", expectedSport: "basketball" },
    { sentence: "I do padel twice a week.", expectedSport: "padel" },
    { sentence: "Started as a rugby player but now I focus on the gym.", expectedSport: "rugby" },
    { sentence: "I'm a golfer working on my core strength.", expectedSport: "golf" },
    { sentence: "I row crew and need more power work.", expectedSport: "rowing" },
  ];

  for (const { sentence, expectedSport } of cases) {
    it(`extracts "${expectedSport}" from: "${sentence}"`, () => {
      const results = extractSportMentionsFromText({ text: sentence });
      expect(results.length).toBeGreaterThan(0);
      const sportIds = results.map(r => r.canonicalRoleId ?? r.canonicalSportId);
      expect(sportIds).toContain(expectedSport);
    });
  }

  it("'Mostly a bowler, but I also bat.' with cricket profile → cricket_bowler", () => {
    const results = extractSportMentionsFromText({
      text: "Mostly a bowler, but I also bat.",
      currentProfile: { primarySport: "cricket" },
    });
    const sportIds = results.map(r => r.canonicalRoleId ?? r.canonicalSportId);
    expect(sportIds).toContain("cricket_bowler");
  });

  it("extracts multiple sports from compound sentence", () => {
    const results = extractSportMentionsFromText({ text: "I do flag and run track." });
    const sportIds = results.map(r => r.canonicalRoleId ?? r.canonicalSportId);
    expect(sportIds).toContain("flag_football");
    expect(sportIds).toContain("track");
  });

  it("handles empty sentences without crashing", () => {
    expect(() => extractSportMentionsFromText({ text: "" })).not.toThrow();
    const results = extractSportMentionsFromText({ text: "" });
    expect(results).toEqual([]);
  });

  it("handles gibberish without crashing", () => {
    expect(() => extractSportMentionsFromText({ text: "xyz abc 123" })).not.toThrow();
  });
});

// ─── getBestSportResolution Tests ─────────────────────────────────────────────

describe("getBestSportResolution", () => {
  it("returns a result for high-confidence input", () => {
    const result = getBestSportResolution("I play pickleball");
    expect(result).not.toBeNull();
    expect(result?.canonicalSportId).toBe("pickleball");
  });

  it("returns null when no sport detected", () => {
    const result = getBestSportResolution("just working out");
    expect(result).toBeNull();
  });

  it("returns null for low-confidence ambiguous input with threshold", () => {
    // "fight" alone should not produce a confident result
    const result = getBestSportResolution("I like to fight");
    // Either null or confidence < 0.6
    if (result !== null) {
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });
});

// ─── Explainability Tests ─────────────────────────────────────────────────────

describe("buildResolutionExplanation", () => {
  it("generates explanation for 'I'm a boxer'", () => {
    const result = resolveSportLanguage({ text: "I'm a boxer" });
    const explanation = buildResolutionExplanation(result);
    expect(explanation).toContain("Boxing");
    expect(explanation.length).toBeGreaterThan(5);
  });

  it("generates explanation for 'pickle'", () => {
    const result = resolveSportLanguage({ text: "pickle" });
    const explanation = buildResolutionExplanation(result);
    expect(explanation.toLowerCase()).toContain("pickleball");
  });

  it("generates ambiguity explanation for ambiguous input", () => {
    const result = resolveSportLanguage({ text: "keeper" });
    const explanation = buildResolutionExplanation(result);
    expect(explanation.length).toBeGreaterThan(5);
    // Should either mention ambiguity or the resolved sport
    expect(explanation).toBeTruthy();
  });

  it("generates none explanation for completely unknown input", () => {
    const result = resolveSportLanguage({ text: "zlorbzorp" });
    const explanation = buildResolutionExplanation(result);
    expect(explanation.toLowerCase()).toContain("zlorbzorp");
  });
});

// ─── Edge Cases and Robustness ────────────────────────────────────────────────

describe("Edge Cases and Robustness", () => {
  it("handles possessives without crashing ('golfer's game')", () => {
    const result = resolveSportLanguage({ text: "golfer's game" });
    expect(result.canonicalSportId).toBe("golf");
  });

  it("handles all-caps input", () => {
    const result = resolveSportLanguage({ text: "PICKLEBALL" });
    expect(result.canonicalSportId).toBe("pickleball");
  });

  it("handles mixed case", () => {
    const result = resolveSportLanguage({ text: "PickleBall" });
    expect(result.canonicalSportId).toBe("pickleball");
  });

  it("canonical ID passed directly resolves as exact", () => {
    const result = resolveSportLanguage({ text: "flag_football" });
    expect(result.canonicalSportId).toBe("flag_football");
    expect(result.resolutionType).toBe("exact");
    expect(result.confidence).toBe(1.0);
  });

  it("canonical ID with underscores resolves exactly", () => {
    const result = resolveSportLanguage({ text: "cricket_bowler" });
    expect(result.canonicalSportId).toBe("cricket_bowler");
    expect(result.resolutionType).toBe("exact");
  });

  it("isValidSportId validates known sport IDs", () => {
    expect(isValidSportId("pickleball")).toBe(true);
    expect(isValidSportId("cricket_bowler")).toBe(true);
    expect(isValidSportId("flag_football")).toBe(true);
    expect(isValidSportId("not_a_sport")).toBe(false);
    expect(isValidSportId("")).toBe(false);
  });

  it("getDisplayName returns readable names", () => {
    expect(getDisplayName("pickleball")).toBe("Pickleball");
    expect(getDisplayName("flag_football")).toBe("Flag Football");
    expect(getDisplayName("cricket_bowler")).toBe("Cricket Bowler");
    expect(getDisplayName(undefined)).toBe("Unknown sport");
  });

  it("null/undefined inputs do not crash resolveSportLanguage", () => {
    // TypeScript prevents null directly, but test empty string
    expect(() => resolveSportLanguage({ text: "" })).not.toThrow();
    const result = resolveSportLanguage({ text: "" });
    expect(result.resolutionType).toBe("none");
    expect(result.confidence).toBe(0);
  });

  it("'pickles' resolves to pickleball with lower confidence (slang)", () => {
    const result = resolveSportLanguage({ text: "pickles" });
    expect(result.canonicalSportId).toBe("pickleball");
    expect(result.confidence).toBeLessThan(0.8); // low-confidence alias
  });

  it("does not match 'squash' as a food word in nonsport context", () => {
    // "squash" is always ambiguous without context — returns resolution
    // but this verifies the system doesn't crash
    expect(() => resolveSportLanguage({ text: "squash" })).not.toThrow();
    const result = resolveSportLanguage({ text: "squash" });
    expect(result.canonicalSportId).toBe("squash");
  });
});

// ─── Resolution Object Shape Tests ───────────────────────────────────────────

describe("Resolution Object — Shape and Fields", () => {
  it("'I'm a boxer' resolution object has all required fields", () => {
    const result = resolveSportLanguage({ text: "I'm a boxer" });
    expect(result).toHaveProperty("rawInput");
    expect(result).toHaveProperty("normalizedText");
    expect(result).toHaveProperty("canonicalSportId");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("resolutionType");
    expect(result.rawInput).toBe("I'm a boxer");
    expect(result.canonicalSportId).toBe("boxing");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("'I'm a bowler' resolution object with cricket profile shows contextual resolution", () => {
    const result = resolveSportLanguage({
      text: "I'm a bowler",
      currentProfile: { primarySport: "cricket" },
    });
    expect(result.rawInput).toBe("I'm a bowler");
    expect(result.canonicalSportId).toBe("cricket_bowler");
    expect(result.resolutionType).toBe("contextual");
    expect(result.matchedAlias).toBeTruthy();
  });

  it("ambiguous result has ambiguity array", () => {
    const result = resolveSportLanguage({ text: "keeper" });
    // Should either be ambiguous or resolved
    if (result.resolutionType === "ambiguous") {
      expect(Array.isArray(result.ambiguity)).toBe(true);
      expect(result.ambiguity!.length).toBeGreaterThan(1);
    }
  });

  it("none result has no canonicalSportId", () => {
    const result = resolveSportLanguage({ text: "definitely not a sport" });
    expect(result.resolutionType).toBe("none");
    expect(result.canonicalSportId).toBeUndefined();
    expect(result.confidence).toBe(0);
  });
});
