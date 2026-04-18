/**
 * Block Rules Audit — DEV-only structured audit logging
 *
 * Emits structured audit logs on every program generation, allowing engineers
 * to grep for [BlockRulesAudit] to see exactly why a block and split were chosen,
 * what penalties were applied, and whether fallback logic was triggered.
 *
 * All logging is guarded by NODE_ENV !== "production".
 */

import type { BlockArchetypeId, SplitArchitectureId } from "./blockArchetypes";
import type { ArchetypeScore, SplitScore } from "./blockScoring";
import type { UserConstraints } from "./blockScoring";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockRulesAuditPayload {
  generationId: string;
  userId?: string | number | null;
  mode: "strength" | "speed" | "general";
  goal: string | null;
  daysPerWeek: number;
  equipmentSummary: string;
  recentProgramIds: number[];

  archetypeCandidates: ArchetypeScore[];
  chosenArchetype: BlockArchetypeId;
  archetypeRuleHits: string[];
  archetypeRuleMisses: string[];

  splitCandidates: SplitScore[];
  chosenSplit: SplitArchitectureId;
  splitRuleHits: string[];

  slotWeightAdjustmentsApplied: string[];
  movementBiasesApplied: string[];

  similarityScore: number;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  finalProgramFingerprint: string;
}

// ─── Audit Emitter ────────────────────────────────────────────────────────────

/**
 * Emit the full structured audit log for this generation.
 * Also prints a concise one-line summary that can be grepped easily.
 */
export function emitBlockRulesAudit(payload: BlockRulesAuditPayload): void {
  if (process.env.NODE_ENV === "production") return;

  // Full structured log (JSON-parseable)
  console.log("[BlockRulesAudit]", JSON.stringify({
    generationId: payload.generationId,
    userId: payload.userId ?? null,
    mode: payload.mode,
    goal: payload.goal,
    daysPerWeek: payload.daysPerWeek,
    equipment: payload.equipmentSummary,

    archetypes: {
      candidates: payload.archetypeCandidates.map((c) => ({
        id: c.archetypeId,
        score: Number(c.score.toFixed(2)),
        breakdown: c.breakdown,
      })),
      chosen: payload.chosenArchetype,
      ruleHits: payload.archetypeRuleHits,
      ruleMisses: payload.archetypeRuleMisses,
    },

    splits: {
      candidates: payload.splitCandidates.map((c) => ({
        id: c.splitId,
        score: Number(c.score.toFixed(2)),
        breakdown: c.breakdown,
      })),
      chosen: payload.chosenSplit,
      ruleHits: payload.splitRuleHits,
    },

    blockAdjustments: {
      slotWeightAdjustments: payload.slotWeightAdjustmentsApplied,
      movementBiases: payload.movementBiasesApplied,
    },

    similarity: {
      score: Number(payload.similarityScore.toFixed(3)),
      threshold: 0.70,
      isTooSimilar: payload.similarityScore >= 0.70,
    },

    fallback: {
      triggered: payload.fallbackTriggered,
      reason: payload.fallbackReason ?? "none",
    },

    fingerprint: payload.finalProgramFingerprint,
  }));

  // Concise UI-safe summary line
  console.log(
    `[BlockRulesAudit] archetype=${payload.chosenArchetype} split=${payload.chosenSplit} ` +
    `similarity=${payload.similarityScore.toFixed(2)} fallback=${payload.fallbackTriggered}` +
    (payload.fallbackReason ? ` fallbackReason=${payload.fallbackReason}` : ""),
  );
}

/**
 * Emit a DEV audit warning for a broken or contradictory rule.
 * Used by validation helpers in blockArchetypes.ts and splitArchitectures.ts.
 */
export function emitAuditWarning(message: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[BlockRulesAuditWarning] ${message}`);
}

/**
 * Generate a short normalized fingerprint string for logging/comparison.
 * Format: <archetype>/<split>/<top3exercises>/<neuralProfile>
 */
export function buildFingerprintString(
  archetypeId: BlockArchetypeId,
  splitId: SplitArchitectureId,
  topExercises: string[],
  neuralProfile: string,
): string {
  const exerciseAbbrev = topExercises
    .slice(0, 3)
    .map((e) => e.split(" ").map((w) => w[0]).join("").toUpperCase())
    .join("+");
  return `${archetypeId}/${splitId}/${exerciseAbbrev}/${neuralProfile.toUpperCase()}`;
}

/**
 * Generate a unique generation ID for this build.
 */
export function generateAuditId(): string {
  return `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Example Audit Outputs ─────────────────────────────────────────────────────
//
// [BlockRulesAudit] archetype=POWER_ELASTIC_CONVERSION split=ATHLETIC_TOTAL_BODY_4DAY similarity=0.12 fallback=false
// [BlockRulesAudit] archetype=FOUNDATION_ACCUMULATION split=FULL_BODY_3DAY similarity=0.31 fallback=false
// [BlockRulesAudit] archetype=INTENSIFICATION_STRENGTH split=HIGH_LOW_4DAY similarity=0.58 fallback=true fallbackReason=similarity_threshold_exceeded
// [BlockRulesAuditWarning] FOUNDATION_ACCUMULATION has contradictory preferred/banned split: HIGH_LOW_4DAY
// [BlockRulesAuditWarning] Similarity threshold bypassed — score 0.74 ≥ 0.70. Reasons: same archetype; same split
