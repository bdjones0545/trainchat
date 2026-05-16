import { describe, it, expect } from "vitest";
import {
  getTitleRelevanceScore,
  estimateResearchTokens,
  deduplicateChunks,
  APPLICABILITY_CLASS_BOOSTS,
  MAX_RESEARCH_TOKENS,
} from "../research-retriever";

// ─── getTitleRelevanceScore ───────────────────────────────────────────────────

describe("getTitleRelevanceScore", () => {
  it("returns 0 when title is undefined", () => {
    expect(getTitleRelevanceScore(undefined, ["hypertrophy", "strength"])).toBe(0);
  });

  it("returns 0 when contextTags is empty", () => {
    expect(getTitleRelevanceScore("Progressive Overload and Hypertrophy", [])).toBe(0);
  });

  it("scores 1 when one tag word appears in the title", () => {
    const score = getTitleRelevanceScore(
      "Progressive Overload for Strength Gains",
      ["progressive_overload"],
    );
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("scores multiple tag matches correctly", () => {
    const score = getTitleRelevanceScore(
      "Hypertrophy, strength, and endurance training review",
      ["hypertrophy", "strength", "endurance"],
    );
    expect(score).toBe(3); // cap at 3
  });

  it("caps title relevance score at 3 regardless of match count", () => {
    const score = getTitleRelevanceScore(
      "Volume intensity recovery progression hypertrophy strength endurance",
      ["volume", "intensity", "recovery", "progression", "hypertrophy", "strength"],
    );
    expect(score).toBe(3);
  });

  it("is case-insensitive", () => {
    const score = getTitleRelevanceScore("HYPERTROPHY TRAINING REVIEW", ["hypertrophy"]);
    expect(score).toBeGreaterThanOrEqual(1);
  });
});

// ─── estimateResearchTokens ───────────────────────────────────────────────────

describe("estimateResearchTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateResearchTokens("")).toBe(0);
  });

  it("estimates ~4 chars per token", () => {
    const text = "a".repeat(400);
    expect(estimateResearchTokens(text)).toBe(100);
  });

  it("rounds up for non-divisible lengths", () => {
    expect(estimateResearchTokens("abc")).toBe(1); // 3 chars → ceil(3/4) = 1
    expect(estimateResearchTokens("abcde")).toBe(2); // 5 chars → ceil(5/4) = 2
  });

  it("MAX_RESEARCH_TOKENS is 1200", () => {
    expect(MAX_RESEARCH_TOKENS).toBe(1200);
  });
});

// ─── APPLICABILITY_CLASS_BOOSTS ───────────────────────────────────────────────

describe("APPLICABILITY_CLASS_BOOSTS", () => {
  it("direct_programming gets the highest boost (+2)", () => {
    expect(APPLICABILITY_CLASS_BOOSTS["direct_programming"]).toBe(2);
  });

  it("explanation_support and foundational_context each get +1", () => {
    expect(APPLICABILITY_CLASS_BOOSTS["explanation_support"]).toBe(1);
    expect(APPLICABILITY_CLASS_BOOSTS["foundational_context"]).toBe(1);
  });

  it("emerging_caution gets a -1 penalty", () => {
    expect(APPLICABILITY_CLASS_BOOSTS["emerging_caution"]).toBe(-1);
  });

  it("weak gets the strongest penalty (-2)", () => {
    expect(APPLICABILITY_CLASS_BOOSTS["weak"]).toBe(-2);
  });

  it("direct_programming outranks weak by 4 score points", () => {
    const gap =
      APPLICABILITY_CLASS_BOOSTS["direct_programming"] - APPLICABILITY_CLASS_BOOSTS["weak"];
    expect(gap).toBe(4);
  });
});

// ─── deduplicateChunks ───────────────────────────────────────────────────────

describe("deduplicateChunks", () => {
  it("returns all chunks when all are unique", () => {
    const chunks = [
      { chunkText: "Progressive overload drives hypertrophy through mechanical tension." },
      { chunkText: "Rest periods of 2-3 minutes optimize strength recovery between sets." },
      { chunkText: "Volume landmarks vary significantly by training age and individual response." },
    ];
    expect(deduplicateChunks(chunks)).toHaveLength(3);
  });

  it("removes chunks with identical leading 90 chars", () => {
    const base = "Progressive overload is the systematic increase of training stimulus over time to drive adaptation.";
    const chunks = [
      { chunkText: base },
      { chunkText: base }, // exact duplicate
      { chunkText: "An entirely different insight about recovery and adaptation windows." },
    ];
    const result = deduplicateChunks(chunks);
    expect(result).toHaveLength(2);
  });

  it("treats leading-text duplicates with minor suffix differences as duplicates", () => {
    const prefix = "x".repeat(90);
    const chunks = [
      { chunkText: prefix + " — version A with extra info." },
      { chunkText: prefix + " — version B with different suffix." },
    ];
    const result = deduplicateChunks(chunks);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateChunks([])).toHaveLength(0);
  });

  it("preserves original object references for unique chunks", () => {
    const chunk = { chunkText: "Unique chunk text", extra: "data" };
    const result = deduplicateChunks([chunk]);
    expect(result[0]).toBe(chunk);
  });
});
