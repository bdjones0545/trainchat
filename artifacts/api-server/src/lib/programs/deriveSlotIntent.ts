/**
 * Slot Intent Derivation — Block Variation Engine
 *
 * Derives block-aware and phase-aware slot intent for each movement slot.
 * The same slot (e.g. bilateral_squat_strength) resolves to different intent
 * objects depending on the block archetype and phase, which then drives
 * exercise ranking in entirely different directions.
 *
 * Architectural principle: Slots are not static labels.
 * They are context-sensitive intents that change what they mean to score highly.
 */

import type { BlockArchetypeId } from "./blockArchetypes";
import type { BlockPhase, ProgramContextProfile } from "./programContextProfile";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VelocityIntent = "slow_grind" | "moderate" | "ballistic" | "explosive";
export type RepStyle = "low_rep_heavy" | "moderate_rep" | "higher_rep_hypertrophy";

export interface SlotIntentResult {
  slotIntentLabel: string;
  targetStimulus: string;
  allowedFamilies: string[];
  reducedFamilies: string[];
  disallowedFamilies: string[];
  targetNeuralDemand: "high" | "moderate" | "low";
  targetFatigueCost: "high" | "moderate" | "low";
  targetStabilityDemand: "low" | "moderate" | "high";
  targetVelocityIntent: VelocityIntent;
  targetRepStyle: RepStyle;
  targetRestStyle: string;
  noveltyTolerance: number;
  preferredFamilies: string[];
  complexityLimit: "low" | "moderate" | "high";
}

// ─── Slot × Archetype × Phase Matrix ─────────────────────────────────────────

type SlotArchetypeKey = `${string}::${BlockArchetypeId}`;
type SlotPhaseMod = Partial<Pick<SlotIntentResult,
  "targetNeuralDemand" | "targetFatigueCost" | "targetStabilityDemand" |
  "targetVelocityIntent" | "targetRepStyle" | "noveltyTolerance" |
  "complexityLimit" | "slotIntentLabel" | "targetStimulus"
>>;

// ─── Phase modifiers applied on top of slot×archetype base ───────────────────

const PHASE_MODS: Record<BlockPhase, SlotPhaseMod> = {
  establish: {
    noveltyTolerance: 0.8,
    complexityLimit: "moderate",
    targetFatigueCost: "moderate",
  },
  build: {
    noveltyTolerance: 0.6,
    complexityLimit: "high",
    targetFatigueCost: "high",
  },
  intensify: {
    noveltyTolerance: 0.2,
    complexityLimit: "moderate",
    targetFatigueCost: "high",
    targetNeuralDemand: "high",
  },
  deload: {
    noveltyTolerance: 0.1,
    complexityLimit: "low",
    targetFatigueCost: "low",
    targetNeuralDemand: "low",
  },
};

// Archetype-specific phase overrides (take precedence)
function getArchetypePhaseOverride(archetypeId: BlockArchetypeId, phase: BlockPhase): SlotPhaseMod {
  if (archetypeId === "REBUILD_DELOAD") {
    return { noveltyTolerance: 0.1, complexityLimit: "low", targetFatigueCost: "low", targetNeuralDemand: "low" };
  }
  if (archetypeId === "POWER_ELASTIC_CONVERSION" && phase === "intensify") {
    return { noveltyTolerance: 0.4, complexityLimit: "moderate", targetFatigueCost: "moderate" };
  }
  if (archetypeId === "INTENSIFICATION_STRENGTH" && phase === "intensify") {
    return { noveltyTolerance: 0.1, complexityLimit: "low" };
  }
  if (archetypeId === "FOUNDATION_ACCUMULATION" && phase === "establish") {
    return { noveltyTolerance: 0.9, complexityLimit: "moderate" };
  }
  return {};
}

// ─── Base Slot × Archetype Definitions ───────────────────────────────────────

function getSlotBase(slotId: string, archetypeId: BlockArchetypeId): SlotIntentResult {
  // Defaults
  const defaults: SlotIntentResult = {
    slotIntentLabel: `${slotId} — general`,
    targetStimulus: "strength",
    allowedFamilies: [],
    reducedFamilies: [],
    disallowedFamilies: [],
    preferredFamilies: [],
    targetNeuralDemand: "moderate",
    targetFatigueCost: "moderate",
    targetStabilityDemand: "moderate",
    targetVelocityIntent: "moderate",
    targetRepStyle: "moderate_rep",
    targetRestStyle: "120–180s",
    noveltyTolerance: 0.5,
    complexityLimit: "moderate",
  };

  const key: SlotArchetypeKey = `${slotId}::${archetypeId}`;

  const SLOT_ARCHETYPE_MATRIX: Record<string, Partial<SlotIntentResult>> = {

    // ── bilateral_squat_strength ──────────────────────────────────────────
    "bilateral_squat_strength::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Primary bilateral squat — maximal force production",
      targetStimulus: "Prioritize force output. Heavy loading, tight technique, progression clarity.",
      preferredFamilies: ["heavy_bilateral_squat", "trap_bar"],
      reducedFamilies: ["elastic_reactive", "plyometric", "unilateral_squat"],
      disallowedFamilies: ["conditioning", "isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "high",
      targetStabilityDemand: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "3–5 min",
      noveltyTolerance: 0.2,
      complexityLimit: "moderate",
    },

    "bilateral_squat_strength::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Dynamic lower force slot — velocity-emphasis squat",
      targetStimulus: "Reinterpret as dynamic lower force. Faster intent, moderate load, explosive variants preferred.",
      preferredFamilies: ["plyometric", "trap_bar", "heavy_bilateral_squat"],
      reducedFamilies: ["isolation_accessory", "conditioning"],
      targetNeuralDemand: "high",
      targetFatigueCost: "moderate",
      targetStabilityDemand: "low",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.6,
      complexityLimit: "moderate",
    },

    "bilateral_squat_strength::FOUNDATION_ACCUMULATION": {
      slotIntentLabel: "Foundational bilateral squat — broad strength base",
      targetStimulus: "Build foundational pattern exposure. Moderate volume. Hypertrophy-supportive variants welcome.",
      preferredFamilies: ["heavy_bilateral_squat", "trap_bar", "unilateral_squat"],
      reducedFamilies: ["elastic_reactive", "plyometric"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "moderate",
      targetStabilityDemand: "moderate",
      targetVelocityIntent: "moderate",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.7,
      complexityLimit: "high",
    },

    "bilateral_squat_strength::REBUILD_DELOAD": {
      slotIntentLabel: "Controlled bilateral squat — movement quality focus",
      targetStimulus: "Lower complexity. Lower neural demand. Prioritize tissue tolerance and controlled tempo.",
      preferredFamilies: ["unilateral_squat", "heavy_bilateral_squat"],
      reducedFamilies: ["plyometric", "elastic_reactive"],
      disallowedFamilies: ["conditioning"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetStabilityDemand: "moderate",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    // ── bilateral_hinge_strength ──────────────────────────────────────────
    "bilateral_hinge_strength::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Primary bilateral hinge — posterior chain maximal loading",
      targetStimulus: "Heavy pull patterns. Maximum posterior chain force. Stable bilateral anchors.",
      preferredFamilies: ["heavy_bilateral_hinge", "trap_bar"],
      reducedFamilies: ["unilateral_hinge", "isolation_accessory"],
      disallowedFamilies: ["conditioning", "elastic_reactive"],
      targetNeuralDemand: "high",
      targetFatigueCost: "high",
      targetStabilityDemand: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "3–5 min",
      noveltyTolerance: 0.2,
      complexityLimit: "moderate",
    },

    "bilateral_hinge_strength::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Dynamic hinge — hip drive and reactive strength",
      targetStimulus: "Hip extension power. Moderate load, higher velocity. Pairs with elastic work.",
      preferredFamilies: ["heavy_bilateral_hinge", "trap_bar", "ballistic"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "moderate",
      targetStabilityDemand: "moderate",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.5,
      complexityLimit: "moderate",
    },

    "bilateral_hinge_strength::FOUNDATION_ACCUMULATION": {
      slotIntentLabel: "Accumulation hinge — posterior chain volume",
      targetStimulus: "Moderate volume, hypertrophy-supportive load. Broad hinge pattern exposure.",
      preferredFamilies: ["heavy_bilateral_hinge", "unilateral_hinge", "trap_bar"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "moderate",
      targetVelocityIntent: "moderate",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.7,
      complexityLimit: "high",
    },

    "bilateral_hinge_strength::REBUILD_DELOAD": {
      slotIntentLabel: "Recovery hinge — low-load posterior chain",
      targetStimulus: "Controlled load. Tissue tolerance. Lower complexity pattern.",
      preferredFamilies: ["unilateral_hinge", "heavy_bilateral_hinge"],
      reducedFamilies: ["plyometric"],
      disallowedFamilies: ["conditioning"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    // ── lower_power ───────────────────────────────────────────────────────
    "lower_power::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Primary power slot — maximal elasticity and reactive output",
      targetStimulus: "Highest velocity expression. Elastic/reactive emphasis. Low fatigue cost.",
      preferredFamilies: ["plyometric", "elastic_reactive", "ballistic"],
      reducedFamilies: ["heavy_bilateral_squat", "isolation_accessory"],
      disallowedFamilies: ["conditioning"],
      targetNeuralDemand: "high",
      targetFatigueCost: "low",
      targetStabilityDemand: "low",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min full reset",
      noveltyTolerance: 0.6,
      complexityLimit: "moderate",
    },

    "lower_power::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Strength-phase power primer — potentiation",
      targetStimulus: "Brief power primer before heavy bilateral. High-quality reps, not max volume.",
      preferredFamilies: ["plyometric", "elastic_reactive"],
      reducedFamilies: ["conditioning", "isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "low",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.3,
      complexityLimit: "moderate",
    },

    "lower_power::FOUNDATION_ACCUMULATION": {
      slotIntentLabel: "Accumulation power exposure — introductory elastic work",
      targetStimulus: "Moderate power volume. Introduce elastic patterns for adaptation base.",
      preferredFamilies: ["plyometric", "elastic_reactive"],
      reducedFamilies: ["conditioning"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "moderate",
      targetVelocityIntent: "ballistic",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.7,
      complexityLimit: "moderate",
    },

    "lower_power::REBUILD_DELOAD": {
      slotIntentLabel: "Deload power — sub-maximal reactive work only",
      targetStimulus: "Low-density reactive work. No high-impact or high tendon load.",
      preferredFamilies: ["elastic_reactive"],
      reducedFamilies: ["plyometric", "ballistic"],
      disallowedFamilies: ["conditioning", "heavy_bilateral_squat"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "low",
      targetVelocityIntent: "moderate",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "90s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    // ── elastic_power ─────────────────────────────────────────────────────
    "elastic_power::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Elastic/reactive slot — primary elastic expression",
      targetStimulus: "High velocity reactive patterns. Tendon-driven output. Full elastic emphasis.",
      preferredFamilies: ["elastic_reactive", "plyometric", "ballistic"],
      disallowedFamilies: ["heavy_bilateral_hinge", "heavy_bilateral_squat", "isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "low",
      targetStabilityDemand: "low",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min full reset",
      noveltyTolerance: 0.7,
      complexityLimit: "moderate",
    },

    "elastic_power::REBUILD_DELOAD": {
      slotIntentLabel: "Deload elastic — minimal tendon load",
      targetStimulus: "Reduced density. Low-impact reactive only. No excessive tendon load.",
      preferredFamilies: ["elastic_reactive"],
      reducedFamilies: ["plyometric", "ballistic"],
      disallowedFamilies: ["heavy_bilateral_squat", "heavy_bilateral_hinge"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetVelocityIntent: "moderate",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "90s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    // ── upper_push_primary ────────────────────────────────────────────────
    "upper_push_primary::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Primary press — stable force production",
      targetStimulus: "Stable pressing pattern. Progression clarity. Lower rep, higher load.",
      preferredFamilies: ["upper_horizontal_push", "upper_vertical_push"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "3–5 min",
      noveltyTolerance: 0.2,
      complexityLimit: "moderate",
    },

    "upper_push_primary::FOUNDATION_ACCUMULATION": {
      slotIntentLabel: "Accumulation press — moderate volume, tissue exposure",
      targetStimulus: "Moderate volume. Hypertrophy-supportive pressing. Broader pattern variety welcome.",
      preferredFamilies: ["upper_horizontal_push", "upper_vertical_push"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "moderate",
      targetVelocityIntent: "moderate",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.7,
      complexityLimit: "high",
    },

    "upper_push_primary::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Power block press — speed-strength intent",
      targetStimulus: "Explosive intent on press. Moderate load with bar speed emphasis.",
      preferredFamilies: ["upper_horizontal_push", "upper_vertical_push", "ballistic"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "moderate",
      targetVelocityIntent: "ballistic",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.5,
      complexityLimit: "moderate",
    },

    "upper_push_primary::REBUILD_DELOAD": {
      slotIntentLabel: "Deload press — tissue tolerance",
      targetStimulus: "Light load. Movement quality. No grind.",
      preferredFamilies: ["upper_horizontal_push"],
      reducedFamilies: ["upper_vertical_push"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetVelocityIntent: "moderate",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.2,
      complexityLimit: "low",
    },

    // ── upper_pull_primary ────────────────────────────────────────────────
    "upper_pull_primary::FOUNDATION_ACCUMULATION": {
      slotIntentLabel: "Accumulation pull — broad posterior chain exposure",
      targetStimulus: "Moderate volume. Hypertrophy-supportive pulling. Broader variety allowed.",
      preferredFamilies: ["upper_horizontal_pull", "upper_vertical_pull"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "moderate",
      targetFatigueCost: "moderate",
      targetVelocityIntent: "moderate",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.8,
      complexityLimit: "high",
    },

    "upper_pull_primary::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Strength block pull — heavy pull pattern",
      targetStimulus: "Heavy pulling. Lat and upper back maximal loading.",
      preferredFamilies: ["upper_horizontal_pull", "upper_vertical_pull"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "3–5 min",
      noveltyTolerance: 0.2,
      complexityLimit: "moderate",
    },

    "upper_pull_primary::REBUILD_DELOAD": {
      slotIntentLabel: "Deload pull — low-load posterior exposure",
      targetStimulus: "Easy pulling. Tissue tolerance.",
      preferredFamilies: ["upper_horizontal_pull", "upper_vertical_pull"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "90s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    // ── unilateral_lower ──────────────────────────────────────────────────
    "unilateral_lower::REBUILD_DELOAD": {
      slotIntentLabel: "Deload unilateral — controlled stability work",
      targetStimulus: "Lower complexity. Lower load. Stability and tissue tolerance focus.",
      preferredFamilies: ["unilateral_squat", "unilateral_hinge"],
      reducedFamilies: ["heavy_bilateral_squat", "plyometric"],
      disallowedFamilies: ["conditioning"],
      targetNeuralDemand: "low",
      targetFatigueCost: "low",
      targetStabilityDemand: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "moderate_rep",
      targetRestStyle: "60–90s",
      noveltyTolerance: 0.1,
      complexityLimit: "low",
    },

    "unilateral_lower::INTENSIFICATION_STRENGTH": {
      slotIntentLabel: "Strength block unilateral — loaded single-leg strength",
      targetStimulus: "Heavy single-leg loading. Strength transfer.",
      preferredFamilies: ["unilateral_squat", "unilateral_hinge"],
      targetNeuralDemand: "high",
      targetFatigueCost: "high",
      targetStabilityDemand: "high",
      targetVelocityIntent: "slow_grind",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "2–3 min",
      noveltyTolerance: 0.3,
      complexityLimit: "moderate",
    },

    // ── rotational_power ──────────────────────────────────────────────────
    "rotational_power::POWER_ELASTIC_CONVERSION": {
      slotIntentLabel: "Rotational power — ballistic rotational expression",
      targetStimulus: "High velocity rotational output. Med ball or cable power.",
      preferredFamilies: ["ballistic", "rotational"],
      reducedFamilies: ["isolation_accessory"],
      targetNeuralDemand: "high",
      targetFatigueCost: "low",
      targetVelocityIntent: "explosive",
      targetRepStyle: "low_rep_heavy",
      targetRestStyle: "90–120s",
      noveltyTolerance: 0.6,
      complexityLimit: "moderate",
    },
  };

  const found = SLOT_ARCHETYPE_MATRIX[key];
  return { ...defaults, ...(found ?? {}) };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Derive the block-aware slot intent for a given slot within the program context.
 * Returns a SlotIntentResult that dictates how exercise ranking should behave.
 */
export function deriveSlotIntent(
  profile: Pick<ProgramContextProfile,
    "blockArchetype" | "currentPhase" | "splitArchitecture" | "neuralDemandProfile" |
    "phaseSpecificModifiers" | "blockSpecificRankingWeights"
  >,
  slotId: string,
): SlotIntentResult {
  const base = getSlotBase(slotId, profile.blockArchetype);

  // Apply phase modifiers on top of archetype base
  const phaseMod = PHASE_MODS[profile.currentPhase] ?? {};
  const archetypePhaseMod = getArchetypePhaseOverride(profile.blockArchetype, profile.currentPhase);

  return {
    ...base,
    // Phase takes precedence, archetype-phase override takes top precedence
    targetNeuralDemand: archetypePhaseMod.targetNeuralDemand ?? phaseMod.targetNeuralDemand ?? base.targetNeuralDemand,
    targetFatigueCost: archetypePhaseMod.targetFatigueCost ?? phaseMod.targetFatigueCost ?? base.targetFatigueCost,
    noveltyTolerance: archetypePhaseMod.noveltyTolerance ?? phaseMod.noveltyTolerance ?? base.noveltyTolerance,
    complexityLimit: archetypePhaseMod.complexityLimit ?? phaseMod.complexityLimit ?? base.complexityLimit,
    slotIntentLabel: archetypePhaseMod.slotIntentLabel ?? base.slotIntentLabel,
    targetStimulus: archetypePhaseMod.targetStimulus ?? base.targetStimulus,
  };
}
