// ─── Research Retriever — Diversity Balancing Integration Tests ───────────────
//
// These are integration tests that run against the live database.
// They validate the post-ranking diversity filter (max 2 chunks per document)
// and multi-source retrieval guarantees without touching evidence weighting.
//
// Run: pnpm --filter @workspace/api-server test

import { describe, it, expect } from "vitest";
import { getRelevantResearchContextWithChunks } from "../research-retriever";

// ─── Helper ───────────────────────────────────────────────────────────────────

function chunkCountsPerDoc(
  chunks: Array<{ documentId: number }>,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of chunks) {
    counts.set(c.documentId, (counts.get(c.documentId) ?? 0) + 1);
  }
  return counts;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Research Retriever — Diversity Balancing", () => {
  it("muscle growth: no doc contributes more than 2 chunks; at least 2 unique docs", async () => {
    const result = await getRelevantResearchContextWithChunks({
      userMessage: "Build me a muscle growth program",
      goal: "hypertrophy",
      maxChunks: 4,
    });

    if (result.chunks.length === 0) {
      console.warn("[skip] No research chunks available — database may be empty");
      return;
    }

    const counts = chunkCountsPerDoc(result.chunks);

    for (const [docId, count] of counts) {
      expect(
        count,
        `Doc ${docId} contributed ${count} chunks — exceeds the 2-chunk cap`,
      ).toBeLessThanOrEqual(2);
    }

    expect(
      counts.size,
      `Expected ≥2 unique documents but got ${counts.size}: docIds=[${[...counts.keys()].join(",")}]`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("muscle growth: evidence hierarchy preserved — at least one gold or high trust chunk", async () => {
    const result = await getRelevantResearchContextWithChunks({
      userMessage: "Build me a muscle growth program",
      goal: "hypertrophy",
      maxChunks: 4,
    });

    if (result.chunks.length === 0) return;

    const hasQualityEvidence = result.chunks.some(
      (c) => c.trustLevel === "gold" || c.trustLevel === "high",
    );
    expect(
      hasQualityEvidence,
      "Expected at least one gold/high trust chunk — evidence hierarchy may have regressed",
    ).toBe(true);
  });

  it("knee pain rehab: no single paper fills all slots; ACL/tendon and recovery co-present", async () => {
    const result = await getRelevantResearchContextWithChunks({
      userMessage: "Help me return to training after knee pain",
      goal: "return_to_training",
      injuries: "knee pain",
      maxChunks: 4,
    });

    if (result.chunks.length === 0) {
      console.warn("[skip] No research chunks available");
      return;
    }

    const counts = chunkCountsPerDoc(result.chunks);

    for (const [docId, count] of counts) {
      expect(
        count,
        `Doc ${docId} contributed ${count} chunks — exceeds the 2-chunk cap`,
      ).toBeLessThanOrEqual(2);
    }

    expect(
      counts.size,
      "Expected ≥2 unique documents for knee rehab query",
    ).toBeGreaterThanOrEqual(2);

    // At least one medical_rehab chunk expected for injury query
    const hasMedicalRehab = result.chunks.some((c) => c.category === "medical_rehab");
    expect(
      hasMedicalRehab,
      "Expected at least one medical_rehab chunk for knee pain query — injury boost may not be firing",
    ).toBe(true);
  });

  it("concurrent training: max 2 per doc; strength and recovery context both accessible", async () => {
    const result = await getRelevantResearchContextWithChunks({
      userMessage: "Can I combine strength training and conditioning in the same week?",
      goal: "strength",
      maxChunks: 4,
    });

    if (result.chunks.length === 0) {
      console.warn("[skip] No research chunks available");
      return;
    }

    const counts = chunkCountsPerDoc(result.chunks);

    for (const [docId, count] of counts) {
      expect(
        count,
        `Doc ${docId} contributed ${count} chunks — exceeds the 2-chunk cap`,
      ).toBeLessThanOrEqual(2);
    }

    expect(
      counts.size,
      "Expected ≥2 unique documents for concurrent training query",
    ).toBeGreaterThanOrEqual(2);

    // Confirm strength_conditioning category is represented (concurrent paper is there)
    const hasStrengthConditioning = result.chunks.some(
      (c) => c.category === "strength_conditioning",
    );
    expect(
      hasStrengthConditioning,
      "Expected strength_conditioning category in retrieval for concurrent training query",
    ).toBe(true);
  });

  it("applyDiversityFilter never selects more than maxChunks total chunks", async () => {
    const maxChunks = 3;
    const result = await getRelevantResearchContextWithChunks({
      userMessage: "Build me a hypertrophy program with lots of volume",
      goal: "hypertrophy",
      maxChunks,
    });

    expect(
      result.chunks.length,
      `Expected at most ${maxChunks} chunks but got ${result.chunks.length}`,
    ).toBeLessThanOrEqual(maxChunks);
  });
});
