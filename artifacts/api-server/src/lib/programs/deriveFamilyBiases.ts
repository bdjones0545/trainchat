/**
 * Family Bias Derivation — Block Variation Engine
 *
 * Maps block archetype + phase to exercise family preference/reduction/ban signals.
 * These signals are fed into the extended scoring dimensions (familyPreferenceFit,
 * familyReductionPenalty, disallowedFamilyPenalty).
 *
 * Exercise "families" represent movement pattern clusters, not muscle groups.
 */

import type { BlockArchetypeId } from "./blockArchetypes";
import type { BlockPhase, ProgramContextProfile } from "./programContextProfile";
import type { ResolvedAgentControls } from "./agentControlTypes";

// ─── Family Taxonomy ───────────────────────────────────────────────────────────

/**
 * All recognized exercise families. Add new families here as the exercise pool grows.
 * These strings must match the EXERCISE_FAMILY_MAP entries in exerciseExtendedMeta.ts.
 */
export const EXERCISE_FAMILIES = [
  "heavy_bilateral_squat",       // back squat, front squat, low-bar, safety bar
  "heavy_bilateral_hinge",       // conv. deadlift, sumo, rack pull, snatch-grip
  "trap_bar",                    // trap bar deadlift, hex bar, hex RDL
  "goblet_tempo_squat",          // goblet squat, tempo squat, heel-elevated goblet
  "unilateral_squat",            // BSS, RFESS, lunge, step-up, reverse lunge
  "unilateral_hinge",            // single-leg RDL, kickstand RDL, SL hip thrust
  "plyometric",                  // box jump, broad jump, vertical jump, depth drop
  "elastic_reactive",            // pogo, hurdle hops, skipping, ankle stiffness work
  "ballistic",                   // med ball slam, rotational throw, scoop toss
  "upper_horizontal_push",       // bench press, incline bench, DB press, push-up
  "upper_vertical_push",         // overhead press, push press, landmine press
  "upper_horizontal_pull",       // barbell row, DB row, cable row, chest-supported
  "upper_vertical_pull",         // pull-up, chin-up, lat pulldown
  "trunk_stability",             // Pallof press, anti-extension, plank, Copenhagen
  "rotational",                  // landmine rotation, cable rotation, band rotation
  "conditioning",                // sled, KB swings, farmers carry, assault bike
  "isolation_accessory",         // curls, tricep pushdowns, lateral raises
  "positional",                  // face pull, band ER, scapular stability
] as const;

export type ExerciseFamily = (typeof EXERCISE_FAMILIES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FamilyBiasResult {
  /** Families that score bonus points */
  boostedFamilies: string[];
  /** Families that receive a negative modifier */
  reducedFamilies: string[];
  /** Families that are effectively disallowed (heavy penalty) */
  bannedFamilies: string[];
  /**
   * Numeric bias for each family.
   * Positive = bonus, negative = penalty.
   * Range: −6 (hard ban) to +3 (strong preference).
   */
  familyBiasScores: Record<string, number>;
}

// ─── Archetype × Phase Matrix ─────────────────────────────────────────────────

function getArchetypePhaseFamily(
  archetypeId: BlockArchetypeId,
  phase: BlockPhase,
): Omit<FamilyBiasResult, "familyBiasScores"> {
  const base = ARCHETYPE_FAMILY_BASE[archetypeId];
  const phaseOverride = ARCHETYPE_PHASE_OVERRIDES[`${archetypeId}::${phase}`];

  return {
    boostedFamilies: [...new Set([...base.boostedFamilies, ...(phaseOverride?.extraBoosts ?? [])])],
    reducedFamilies: [...new Set([...base.reducedFamilies, ...(phaseOverride?.extraReductions ?? [])])],
    bannedFamilies: [...new Set([...base.bannedFamilies, ...(phaseOverride?.extraBans ?? [])])],
  };
}

// ─── Archetype Family Bases ────────────────────────────────────────────────────

const ARCHETYPE_FAMILY_BASE: Record<BlockArchetypeId, Omit<FamilyBiasResult, "familyBiasScores">> = {

  FOUNDATION_ACCUMULATION: {
    // Broad exposure — general strength + hypertrophy-supportive patterns
    boostedFamilies: [
      "heavy_bilateral_squat",
      "heavy_bilateral_hinge",
      "unilateral_squat",
      "unilateral_hinge",
      "upper_horizontal_push",
      "upper_vertical_push",
      "upper_horizontal_pull",
      "upper_vertical_pull",
      "trunk_stability",
    ],
    reducedFamilies: [
      "elastic_reactive",
      "plyometric",
      "isolation_accessory",
    ],
    bannedFamilies: [],
  },

  INTENSIFICATION_STRENGTH: {
    // Heavy bilateral emphasis — stable, high-force, high-transfer
    boostedFamilies: [
      "heavy_bilateral_squat",
      "heavy_bilateral_hinge",
      "trap_bar",
      "upper_horizontal_push",
      "upper_horizontal_pull",
      "upper_vertical_pull",
      "trunk_stability",
    ],
    reducedFamilies: [
      "elastic_reactive",
      "isolation_accessory",
      "ballistic",
      "conditioning",
    ],
    bannedFamilies: [],
  },

  POWER_ELASTIC_CONVERSION: {
    // Reactive, ballistic, explosive — reduce grinding
    boostedFamilies: [
      "plyometric",
      "elastic_reactive",
      "ballistic",
      "rotational",
      "unilateral_squat",        // Single-leg for reactive transfer
      "unilateral_hinge",
    ],
    reducedFamilies: [
      "heavy_bilateral_squat",   // Reduce grind volume
      "heavy_bilateral_hinge",
      "isolation_accessory",
      "conditioning",            // Not the primary focus
    ],
    bannedFamilies: [],
  },

  REBUILD_DELOAD: {
    // Recovery — controlled, low-complexity, tissue tolerance
    boostedFamilies: [
      "unilateral_squat",
      "unilateral_hinge",
      "trunk_stability",
      "goblet_tempo_squat",
      "positional",
      "upper_horizontal_pull",   // Easy pull patterns OK
    ],
    reducedFamilies: [
      "heavy_bilateral_squat",
      "heavy_bilateral_hinge",
      "plyometric",
      "ballistic",
      "conditioning",
    ],
    bannedFamilies: [
      "elastic_reactive",        // No high-tendon-load elastic work
    ],
  },
};

// ─── Phase Overrides ───────────────────────────────────────────────────────────

interface PhaseOverride {
  extraBoosts?: string[];
  extraReductions?: string[];
  extraBans?: string[];
}

const ARCHETYPE_PHASE_OVERRIDES: Record<string, PhaseOverride> = {
  // Foundation + intensify: ramp up strength bias
  "FOUNDATION_ACCUMULATION::intensify": {
    extraBoosts: ["heavy_bilateral_squat", "heavy_bilateral_hinge"],
    extraReductions: ["isolation_accessory"],
  },

  // Foundation + deload: back off to easier patterns
  "FOUNDATION_ACCUMULATION::deload": {
    extraBoosts: ["goblet_tempo_squat", "positional"],
    extraReductions: ["heavy_bilateral_squat", "heavy_bilateral_hinge"],
  },

  // Intensification + intensify: maximum heavy bilateral
  "INTENSIFICATION_STRENGTH::intensify": {
    extraBoosts: ["heavy_bilateral_squat", "heavy_bilateral_hinge", "trap_bar"],
    extraReductions: ["unilateral_squat", "unilateral_hinge"],
  },

  // Intensification + deload: back off but keep patterns familiar
  "INTENSIFICATION_STRENGTH::deload": {
    extraBoosts: ["goblet_tempo_squat", "unilateral_squat"],
    extraReductions: ["heavy_bilateral_squat"],
    extraBans: ["heavy_bilateral_hinge"],
  },

  // Power + realize: maximum elastic and reactive output
  "POWER_ELASTIC_CONVERSION::intensify": {
    extraBoosts: ["elastic_reactive", "plyometric", "ballistic"],
    extraReductions: ["heavy_bilateral_squat", "heavy_bilateral_hinge"],
  },

  // Power + establish: introduce elastic patterns gently
  "POWER_ELASTIC_CONVERSION::establish": {
    extraBoosts: ["unilateral_squat", "unilateral_hinge"],
    extraReductions: ["elastic_reactive"],
  },

  // Rebuild + any phase: stay in easy territory
  "REBUILD_DELOAD::establish": {
    extraBoosts: ["goblet_tempo_squat", "positional"],
    extraBans: ["plyometric", "ballistic"],
  },
  "REBUILD_DELOAD::build": {
    extraBoosts: ["unilateral_squat", "trunk_stability"],
    extraBans: ["plyometric", "ballistic"],
  },
  "REBUILD_DELOAD::intensify": {
    extraBoosts: ["unilateral_squat", "goblet_tempo_squat"],
    extraBans: ["plyometric", "ballistic", "elastic_reactive"],
  },
  "REBUILD_DELOAD::deload": {
    extraBoosts: ["positional", "trunk_stability"],
    extraBans: ["plyometric", "ballistic", "elastic_reactive", "heavy_bilateral_squat"],
  },
};

// ─── Score Builder ────────────────────────────────────────────────────────────

function buildFamilyBiasScores(
  boosted: string[],
  reduced: string[],
  banned: string[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const family of EXERCISE_FAMILIES) {
    scores[family] = 0;
  }
  for (const f of boosted) {
    scores[f] = (scores[f] ?? 0) + 2;
  }
  for (const f of reduced) {
    scores[f] = (scores[f] ?? 0) - 1.5;
  }
  for (const f of banned) {
    scores[f] = (scores[f] ?? 0) - 6;
  }
  return scores;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Derive exercise family biases from the program context profile.
 * Called once per slot scoring pass.
 *
 * If the profile contains resolved agent controls with family bias overrides,
 * those are layered on top of the archetype/phase base biases.
 * The agent control layer never replaces — it adds on top.
 */
export function deriveFamilyBiases(
  profile: Pick<ProgramContextProfile, "blockArchetype" | "currentPhase" | "resolvedAgentControls">,
): FamilyBiasResult {
  const { boostedFamilies, reducedFamilies, bannedFamilies } =
    getArchetypePhaseFamily(profile.blockArchetype, profile.currentPhase);

  const familyBiasScores = buildFamilyBiasScores(boostedFamilies, reducedFamilies, bannedFamilies);

  // ── Agent Control Layer: family bias overrides ────────────────────────────
  const controls: ResolvedAgentControls | undefined = profile.resolvedAgentControls;
  if (controls) {
    // Apply numeric overrides from agent control resolver
    for (const [family, delta] of Object.entries(controls.resolvedFamilyBiasOverrides)) {
      familyBiasScores[family] = (familyBiasScores[family] ?? 0) + delta;
    }

    // Hard-ban families from agent control
    for (const family of controls.resolvedBannedFamilies) {
      if (!bannedFamilies.includes(family)) {
        bannedFamilies.push(family);
      }
      // Override score to hard-ban level regardless of what archetype/phase said
      familyBiasScores[family] = -10;
    }

    // Update boosted/reduced lists based on overrides for transparency in audit
    for (const [family, score] of Object.entries(controls.resolvedFamilyBiasOverrides)) {
      if (score > 0 && !boostedFamilies.includes(family)) {
        boostedFamilies.push(family);
      } else if (score < 0 && !reducedFamilies.includes(family) && !bannedFamilies.includes(family)) {
        reducedFamilies.push(family);
      }
    }
  }

  return {
    boostedFamilies,
    reducedFamilies,
    bannedFamilies,
    familyBiasScores,
  };
}

/**
 * Derive family biases with explicit agent controls (for callers that have
 * controls available separately, not inside the profile).
 */
export function deriveFamilyBiasesWithControls(
  profile: Pick<ProgramContextProfile, "blockArchetype" | "currentPhase">,
  resolvedControls?: ResolvedAgentControls,
): FamilyBiasResult {
  return deriveFamilyBiases({ ...profile, resolvedAgentControls: resolvedControls });
}

/**
 * Quick lookup: what is the bias score for a specific exercise family
 * given a precomputed FamilyBiasResult?
 */
export function getFamilyBiasScore(biases: FamilyBiasResult, family: string): number {
  return biases.familyBiasScores[family] ?? 0;
}
