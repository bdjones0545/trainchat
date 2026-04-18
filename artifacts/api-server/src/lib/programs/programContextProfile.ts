/**
 * ProgramContextProfile — Unified Derived Context Object
 *
 * Produced after block archetype, phase, and split architecture are chosen.
 * This is the SINGLE SOURCE OF TRUTH passed into slot planning and exercise ranking.
 * No downstream function should consume raw scattered state.
 *
 * Architectural principle:
 *   Block engine sets the context.
 *   Exercise engine obeys the context.
 */

import type { BlockArchetypeId, SplitArchitectureId, BlockArchetype } from "./blockArchetypes";
import type { SplitArchitecture } from "./splitArchitectures";
import type { UserConstraints } from "./blockScoring";
import { BLOCK_ARCHETYPES } from "./blockArchetypes";
import { SPLIT_ARCHITECTURES } from "./splitArchitectures";
import type { AgentControlDirectives, ResolvedAgentControls } from "./agentControlTypes";
import { resolveAgentControlDirectives } from "./agentControlResolver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockPhase = "establish" | "build" | "intensify" | "deload";

export type ProgramMode = "strength" | "speed" | "general";

/** A per-slot context snapshot derived for a specific slot+day within a build. */
export interface SlotContextSnapshot {
  dayIndex: number;
  dayTheme: string;
  slotId: string;
  slotIntent: string;
}

/**
 * The unified program context profile. Created once per generation, passed
 * into all downstream slot planning and exercise ranking functions.
 */
export interface ProgramContextProfile {
  // ── Block identity ──────────────────────────────────────────────────────
  blockArchetype: BlockArchetypeId;
  blockArchetypeLabel: string;
  blockArchetypeObj: BlockArchetype;

  // ── Phase ───────────────────────────────────────────────────────────────
  currentPhase: BlockPhase;

  // ── Split ───────────────────────────────────────────────────────────────
  splitArchitecture: SplitArchitectureId;
  splitArchitectureLabel: string;
  splitArchitectureObj: SplitArchitecture;

  // ── User context ────────────────────────────────────────────────────────
  mode: ProgramMode;
  goal: string | null;
  sport: string | null;
  daysPerWeek: number;
  equipmentConstraints: "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight";
  sportTags: string[];

  // ── Block-derived movement guidance ─────────────────────────────────────
  movementBiases: string[];
  neuralDemandProfile: "high" | "moderate" | "low";
  fatigueProfile: "high" | "moderate" | "low";
  progressionStyle: string;

  // ── Set/rep/rest from archetype set/rep profile ──────────────────────────
  primaryRepsLow: number;
  primaryRepsHigh: number;
  primarySetsLow: number;
  primarySetsHigh: number;
  restProfilePrimary: string;
  restProfileSecondary: string;

  // ── Novelty pressure ────────────────────────────────────────────────────
  /**
   * 0.0 = no pressure (fresh build, no history)
   * 1.0 = maximum pressure (too similar to recent builds)
   */
  noveltyPressure: number;

  // ── Injury / external constraints (reserved for future) ─────────────────
  injuryConstraints: string[];
  sessionDurationConstraint: "short" | "standard" | "long";

  // ── Phase-specific modifiers ────────────────────────────────────────────
  phaseSpecificModifiers: {
    intensityBias: "ramp_up" | "maintain" | "peak" | "back_off";
    volumeBias: "low" | "moderate" | "high";
    complexityTolerance: "low" | "moderate" | "high";
    noveltyTolerance: "low" | "moderate" | "high";
    lowFatigue: boolean;
  };

  // ── Block-level slot adjustments ────────────────────────────────────────
  blockSpecificSlotAdjustments: Array<{
    slot: string;
    modifier: number;
    reason: string;
  }>;

  // ── Block-level ranking weight overrides ────────────────────────────────
  blockSpecificRankingWeights: {
    blockArchetypeFitWeight: number;
    slotIntentFitWeight: number;
    movementBiasFitWeight: number;
    familyPreferenceFitWeight: number;
    complexityPenaltyWeight: number;
    velocityIntentFitWeight: number;
    noveltyBonusWeight: number;
  };

  // ── Generation metadata ─────────────────────────────────────────────────
  generationId: string;
  variationSeed: number;

  // ── Agent Control Layer ──────────────────────────────────────────────────
  /**
   * Raw agent control directives provided for this generation.
   * Undefined means no directives were issued.
   */
  agentControlDirectives?: AgentControlDirectives;

  /**
   * Resolved agent controls — the normalized, numeric form consumed by
   * all downstream ranking and slot-planning functions.
   * Always defined after buildProgramContextProfile runs.
   */
  resolvedAgentControls?: ResolvedAgentControls;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildProgramContextProfile(params: {
  archetypeId: BlockArchetypeId;
  splitId: SplitArchitectureId;
  constraints: UserConstraints;
  currentPhase: BlockPhase;
  noveltyPressure: number;
  variationSeed: number;
  generationId: string;
  agentControlDirectives?: AgentControlDirectives;
}): ProgramContextProfile {
  const { archetypeId, splitId, constraints, currentPhase, noveltyPressure, variationSeed, generationId, agentControlDirectives } = params;

  // Resolve agent control directives if provided.
  // Resolution happens here, once per generation, before any downstream function runs.
  const resolvedAgentControls = agentControlDirectives
    ? resolveAgentControlDirectives(agentControlDirectives, noveltyPressure)
    : undefined;

  // If agent controls override novelty pressure, use the resolved value.
  const effectiveNoveltyPressure = resolvedAgentControls?.resolvedNoveltyPressure ?? noveltyPressure;

  const archetype = BLOCK_ARCHETYPES[archetypeId];
  const split = SPLIT_ARCHITECTURES[splitId];
  const setRepProfile = archetype.setRepProfile;

  // Detect mode from goal/sport
  const combined = ((constraints.goal ?? "") + " " + (constraints.sport ?? "")).toLowerCase();
  const mode: ProgramMode =
    combined.includes("speed") || combined.includes("explosive") || combined.includes("sprint") ? "speed" :
    combined.includes("strength") || combined.includes("powerlifting") ? "strength" :
    "general";

  // Extract sport tags from sport string
  const sportTags = constraints.sport
    ? constraints.sport.toLowerCase().split(/[\s,/]+/).filter((t) => t.length > 2)
    : [];

  // Phase-specific modifiers derived from phase + archetype
  const phaseSpecificModifiers = derivePhaseModifiersForProfile(archetypeId, currentPhase);

  // Rest profiles from set/rep metadata
  const restProfilePrimary = setRepProfile.restPrimary;
  const restProfileSecondary = archetype.id === "REBUILD_DELOAD" ? "60–90s" :
    archetype.id === "FOUNDATION_ACCUMULATION" ? "90–120s" : "120–180s";

  // Block-level slot adjustments (from archetype definition)
  const blockSpecificSlotAdjustments = archetype.slotWeightAdjustments.map((adj) => ({
    slot: adj.slot,
    modifier: adj.modifier,
    reason: `${adj.slot} modifier ${adj.modifier > 0 ? "+" : ""}${adj.modifier}`,
  }));

  // Ranking weight overrides per archetype
  const blockSpecificRankingWeights = deriveRankingWeights(archetypeId);

  return {
    blockArchetype: archetypeId,
    blockArchetypeLabel: archetype.label,
    blockArchetypeObj: archetype,
    currentPhase,
    splitArchitecture: splitId,
    splitArchitectureLabel: split.label,
    splitArchitectureObj: split,
    mode,
    goal: constraints.goal,
    sport: constraints.sport,
    daysPerWeek: constraints.daysPerWeek,
    equipmentConstraints: constraints.equipmentLevel,
    sportTags,
    movementBiases: archetype.movementBiases,
    neuralDemandProfile: archetype.neuralDemandProfile,
    fatigueProfile: archetype.fatigueProfile,
    progressionStyle: archetype.progressionStyle,
    primaryRepsLow: setRepProfile.primaryRepRange[0],
    primaryRepsHigh: setRepProfile.primaryRepRange[1],
    primarySetsLow: setRepProfile.primarySetRange[0],
    primarySetsHigh: setRepProfile.primarySetRange[1],
    restProfilePrimary,
    restProfileSecondary,
    noveltyPressure: effectiveNoveltyPressure,
    injuryConstraints: [],
    sessionDurationConstraint: "standard",
    phaseSpecificModifiers,
    blockSpecificSlotAdjustments,
    blockSpecificRankingWeights,
    generationId,
    variationSeed,
    agentControlDirectives,
    resolvedAgentControls,
  };
}

// ─── Phase Modifier Derivation ────────────────────────────────────────────────

export interface PhaseModifiers {
  intensityBias: "ramp_up" | "maintain" | "peak" | "back_off";
  volumeBias: "low" | "moderate" | "high";
  complexityTolerance: "low" | "moderate" | "high";
  noveltyTolerance: "low" | "moderate" | "high";
  lowFatigue: boolean;
}

export function derivePhaseModifiersForProfile(
  archetypeId: BlockArchetypeId,
  phase: BlockPhase,
): PhaseModifiers {
  // Phase baseline
  const phaseBase: Record<BlockPhase, PhaseModifiers> = {
    establish: {
      intensityBias: "ramp_up",
      volumeBias: "moderate",
      complexityTolerance: "moderate",
      noveltyTolerance: "high",
      lowFatigue: false,
    },
    build: {
      intensityBias: "maintain",
      volumeBias: "high",
      complexityTolerance: "high",
      noveltyTolerance: "moderate",
      lowFatigue: false,
    },
    intensify: {
      intensityBias: "peak",
      volumeBias: "moderate",
      complexityTolerance: "moderate",
      noveltyTolerance: "low",
      lowFatigue: false,
    },
    deload: {
      intensityBias: "back_off",
      volumeBias: "low",
      complexityTolerance: "low",
      noveltyTolerance: "low",
      lowFatigue: true,
    },
  };

  const base = { ...phaseBase[phase] };

  // Archetype overrides
  if (archetypeId === "REBUILD_DELOAD") {
    base.complexityTolerance = "low";
    base.noveltyTolerance = "low";
    base.lowFatigue = true;
    base.volumeBias = "low";
  } else if (archetypeId === "POWER_ELASTIC_CONVERSION" && phase === "intensify") {
    base.noveltyTolerance = "moderate"; // Allow reactive variety at peak
    base.complexityTolerance = "moderate";
  } else if (archetypeId === "INTENSIFICATION_STRENGTH" && phase === "intensify") {
    base.noveltyTolerance = "low"; // Tightest selection during peak strength
    base.complexityTolerance = "low";
  } else if (archetypeId === "FOUNDATION_ACCUMULATION" && phase === "establish") {
    base.noveltyTolerance = "high"; // Broadest exposure in accumulation
    base.complexityTolerance = "moderate";
  }

  return base;
}

// ─── Ranking Weight Derivation ────────────────────────────────────────────────

function deriveRankingWeights(archetypeId: BlockArchetypeId): ProgramContextProfile["blockSpecificRankingWeights"] {
  const defaults = {
    blockArchetypeFitWeight: 1.0,
    slotIntentFitWeight: 1.0,
    movementBiasFitWeight: 1.0,
    familyPreferenceFitWeight: 1.0,
    complexityPenaltyWeight: 1.0,
    velocityIntentFitWeight: 1.0,
    noveltyBonusWeight: 1.0,
  };

  if (archetypeId === "INTENSIFICATION_STRENGTH") {
    return {
      ...defaults,
      blockArchetypeFitWeight: 1.5,    // Stronger archetype control
      slotIntentFitWeight: 1.5,        // Slot specificity matters most
      noveltyBonusWeight: 0.5,         // Less novelty pressure — stability first
      complexityPenaltyWeight: 0.5,    // Complex lifts allowed
      velocityIntentFitWeight: 0.5,    // Slower grinds preferred
    };
  }
  if (archetypeId === "POWER_ELASTIC_CONVERSION") {
    return {
      ...defaults,
      velocityIntentFitWeight: 2.0,    // Velocity is the primary dimension
      blockArchetypeFitWeight: 1.5,
      noveltyBonusWeight: 1.5,         // Reactive variety encouraged
      slotIntentFitWeight: 1.5,
    };
  }
  if (archetypeId === "FOUNDATION_ACCUMULATION") {
    return {
      ...defaults,
      noveltyBonusWeight: 1.5,         // Broad exposure encouraged
      familyPreferenceFitWeight: 1.2,
      complexityPenaltyWeight: 0.8,    // Moderate complexity OK
    };
  }
  if (archetypeId === "REBUILD_DELOAD") {
    return {
      ...defaults,
      complexityPenaltyWeight: 2.0,    // Heavy complexity penalty
      noveltyBonusWeight: 0.5,         // Familiar patterns preferred
      velocityIntentFitWeight: 0.3,    // Not chasing velocity
      blockArchetypeFitWeight: 2.0,    // Archetype must dominate
    };
  }

  return defaults;
}
