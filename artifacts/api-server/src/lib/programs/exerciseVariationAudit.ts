/**
 * Exercise Variation Audit — DEV-only structured audit logging
 *
 * Emits [ExerciseVariationAudit] for every slot resolution, including:
 *   - Which block archetype + phase + split drove selection
 *   - Top candidates with full score breakdowns
 *   - Why the winner won (positive factors) and what penalized others
 *   - Whether a rerank / fallback occurred
 *   - Family bias and phase modifiers applied
 *
 * All logging guarded by NODE_ENV !== "production".
 */

import type { BlockArchetypeId, SplitArchitectureId } from "./blockArchetypes";
import type { BlockPhase } from "./programContextProfile";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExerciseScoreBreakdown {
  exerciseName: string;
  totalScore: number;
  factors: {
    sportFit: number;
    intentFit: number;
    neuralFit: number;
    equipFit: number;
    blockArchetypeFit: number;
    currentPhaseFit: number;
    slotIntentFit: number;
    movementBiasFit: number;
    familyPreferenceFit: number;
    familyReductionPenalty: number;
    disallowedFamilyPenalty: number;
    velocityIntentFit: number;
    stabilityDemandFit: number;
    complexityPenalty: number;
    progressionStyleFit: number;
    noveltyBonus: number;
    fatiguePenalty: number;
    overusePenalty: number;
    contrastPenalty: number;
    exactRepeatPenalty: number;
    anchorPenalty: number;
    slotRepeatPenalty: number;
    seedTiebreaker: number;
  };
}

export interface SlotAuditPayload {
  generationId: string;
  chosenBlockArchetype: BlockArchetypeId;
  chosenPhase: BlockPhase;
  chosenSplitArchitecture: SplitArchitectureId;
  dayIndex: number;
  dayTheme: string;
  slotId: string;
  slotIntentLabel: string;
  targetStimulus: string;
  poolSize: number;
  topCandidates: ExerciseScoreBreakdown[];
  chosenExercise: string;
  winReasons: string[];
  penaltiesApplied: string[];
  noveltyPressureApplied: number;
  familyBiasApplied: string[];
  phaseModifierApplied: string;
  blockModifierApplied: string;
  rerankOccurred: boolean;
  rerankReason: string | null;
  exerciseFamily: string;
  complexity: string;
  velocityIntent: string;
}

// ─── Emitter ──────────────────────────────────────────────────────────────────

export function emitExerciseVariationAudit(payload: SlotAuditPayload): void {
  if (process.env.NODE_ENV === "production") return;

  // Full structured log
  console.log("[ExerciseVariationAudit]", JSON.stringify({
    generationId: payload.generationId,
    block: payload.chosenBlockArchetype,
    phase: payload.chosenPhase,
    split: payload.chosenSplitArchitecture,
    day: payload.dayIndex,
    dayTheme: payload.dayTheme,
    slot: payload.slotId,
    slotIntent: payload.slotIntentLabel,
    targetStimulus: payload.targetStimulus,
    poolSize: payload.poolSize,
    chosen: payload.chosenExercise,
    chosenFamily: payload.exerciseFamily,
    chosenComplexity: payload.complexity,
    chosenVelocityIntent: payload.velocityIntent,
    topCandidates: payload.topCandidates.slice(0, 5).map((c) => ({
      name: c.exerciseName,
      score: Number(c.totalScore.toFixed(2)),
      factors: Object.fromEntries(
        Object.entries(c.factors).map(([k, v]) => [k, Number((v as number).toFixed(2))]),
      ),
    })),
    why: payload.winReasons,
    penalties: payload.penaltiesApplied,
    noveltyPressure: payload.noveltyPressureApplied,
    familyBias: payload.familyBiasApplied,
    phaseModifier: payload.phaseModifierApplied,
    blockModifier: payload.blockModifierApplied,
    rerank: payload.rerankOccurred,
    rerankReason: payload.rerankReason ?? "none",
  }));

  // Concise grep-able line
  console.log(
    `[ExerciseVariationAudit] day=${payload.dayIndex} slot=${payload.slotId} ` +
    `block=${payload.chosenBlockArchetype} phase=${payload.chosenPhase} ` +
    `winner=${payload.chosenExercise.replace(/ /g, "_")} ` +
    `score=${payload.topCandidates[0]?.totalScore?.toFixed(2) ?? "?"} ` +
    `noveltyPressure=${payload.noveltyPressureApplied.toFixed(2)} ` +
    `rerank=${payload.rerankOccurred}`,
  );
}

// ─── Warning Emitter ──────────────────────────────────────────────────────────

export function emitExerciseVariationWarning(message: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[ExerciseVariationAuditWarning] ${message}`);
}

/**
 * Validate that the chosen exercise is consistent with block context.
 * Emits warnings for suspicious mismatches.
 */
export function validateSelectionCoherence(
  archetypeId: BlockArchetypeId,
  slotId: string,
  chosenExercise: string,
  exerciseFamily: string,
  fatigueCost: "high" | "moderate" | "low",
  neuralDemand: "high" | "moderate" | "low",
  complexity: "simple" | "moderate" | "complex",
): void {
  if (process.env.NODE_ENV === "production") return;

  // POWER_ELASTIC_CONVERSION should not pick high-fatigue grinders in elastic slots
  if (archetypeId === "POWER_ELASTIC_CONVERSION" && slotId === "elastic_power" && fatigueCost === "high") {
    emitExerciseVariationWarning(
      `POWER_ELASTIC_CONVERSION selected high-fatigue grinder in elastic slot: ${chosenExercise}`,
    );
  }

  // REBUILD_DELOAD should not produce high neural demand exercises
  if (archetypeId === "REBUILD_DELOAD" && neuralDemand === "high" && !slotId.includes("power")) {
    emitExerciseVariationWarning(
      `REBUILD_DELOAD exceeded neural demand target: ${chosenExercise} (high neural) in slot ${slotId}`,
    );
  }

  // Slot intent says low complexity but winner is complex
  if ((archetypeId === "REBUILD_DELOAD") && complexity === "complex") {
    emitExerciseVariationWarning(
      `Slot intent says low complexity (${archetypeId}) but winner complexity is complex: ${chosenExercise}`,
    );
  }

  // INTENSIFICATION_STRENGTH should not pick endurance/fluff family in primary strength slots
  if (
    archetypeId === "INTENSIFICATION_STRENGTH" &&
    (slotId === "bilateral_squat_strength" || slotId === "bilateral_hinge_strength" || slotId === "upper_push_primary") &&
    (exerciseFamily === "conditioning" || exerciseFamily === "isolation_accessory")
  ) {
    emitExerciseVariationWarning(
      `INTENSIFICATION_STRENGTH selected low-transfer family (${exerciseFamily}) in primary strength slot: ${chosenExercise}`,
    );
  }
}

// ─── Build win-reason summaries ────────────────────────────────────────────────

export function buildWinReasons(breakdown: ExerciseScoreBreakdown["factors"]): string[] {
  const reasons: string[] = [];
  if (breakdown.blockArchetypeFit > 1) reasons.push(`block archetype fit (+${breakdown.blockArchetypeFit.toFixed(1)})`);
  if (breakdown.slotIntentFit > 1) reasons.push(`slot intent fit (+${breakdown.slotIntentFit.toFixed(1)})`);
  if (breakdown.noveltyBonus > 0.5) reasons.push(`novelty bonus (+${breakdown.noveltyBonus.toFixed(1)})`);
  if (breakdown.sportFit > 0) reasons.push(`sport fit (+${breakdown.sportFit.toFixed(1)})`);
  if (breakdown.intentFit > 0) reasons.push(`intent fit (+${breakdown.intentFit.toFixed(1)})`);
  if (breakdown.movementBiasFit > 0) reasons.push(`movement bias fit (+${breakdown.movementBiasFit.toFixed(1)})`);
  if (breakdown.velocityIntentFit > 0) reasons.push(`velocity intent fit (+${breakdown.velocityIntentFit.toFixed(1)})`);
  if (breakdown.familyPreferenceFit > 0) reasons.push(`preferred family (+${breakdown.familyPreferenceFit.toFixed(1)})`);
  return reasons.length > 0 ? reasons : ["tiebreaker"];
}

export function buildPenaltySummary(breakdown: ExerciseScoreBreakdown["factors"]): string[] {
  const penalties: string[] = [];
  if (breakdown.overusePenalty > 0) penalties.push(`overuse (−${breakdown.overusePenalty.toFixed(1)})`);
  if (breakdown.contrastPenalty > 0) penalties.push(`recent build contrast (−${breakdown.contrastPenalty.toFixed(1)})`);
  if (breakdown.fatiguePenalty > 0) penalties.push(`fatigue (−${breakdown.fatiguePenalty.toFixed(1)})`);
  if (breakdown.complexityPenalty > 0) penalties.push(`complexity (−${breakdown.complexityPenalty.toFixed(1)})`);
  if (breakdown.familyReductionPenalty > 0) penalties.push(`reduced family (−${breakdown.familyReductionPenalty.toFixed(1)})`);
  if (breakdown.disallowedFamilyPenalty > 0) penalties.push(`disallowed family (−${breakdown.disallowedFamilyPenalty.toFixed(1)})`);
  if (breakdown.anchorPenalty > 0) penalties.push(`anchor penalty (−${breakdown.anchorPenalty.toFixed(1)})`);
  if (breakdown.slotRepeatPenalty > 0) penalties.push(`slot repeat (−${breakdown.slotRepeatPenalty.toFixed(1)})`);
  return penalties;
}
