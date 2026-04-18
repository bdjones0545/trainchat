/**
 * Block Archetypes — Block Variation Engine Layer 1
 *
 * Defines the four high-level training archetypes that drive program feel,
 * split selection, exercise weighting, and set/rep/rest profiles.
 *
 * Each archetype maps to one or more existing MonthlyBlockTypes so the
 * existing monthly-block-planner output remains valid — we just choose
 * which block type to invoke with more precision and with anti-repetition.
 */

import type { MonthlyBlockType } from "../monthly-block-planner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockArchetypeId =
  | "FOUNDATION_ACCUMULATION"
  | "INTENSIFICATION_STRENGTH"
  | "POWER_ELASTIC_CONVERSION"
  | "REBUILD_DELOAD";

export type BlockPhase = "establish" | "build" | "intensify" | "realize" | "deload";

export type NeuralDemandProfile = "high" | "moderate" | "low";
export type FatigueProfile = "high" | "moderate" | "low";
export type ProgressionStyle =
  | "volume_ladder"
  | "load_wave"
  | "contrast_density"
  | "conservative_submaximal";

export interface SetRepProfile {
  primaryRepRange: [number, number];
  primarySetRange: [number, number];
  secondaryRepRange: [number, number];
  secondarySetRange: [number, number];
  restPrimary: string;
  restSecondary: string;
  intensity: string;
}

export interface SlotWeightAdjustment {
  slot: string;
  modifier: number;
}

export type MovementBias =
  | "bilateral_strength"
  | "unilateral_dominance"
  | "elastic_reactive"
  | "rotational_power"
  | "submaximal_volume"
  | "structural_tissue"
  | "contrast_pairs";

export type SplitArchitectureId =
  | "LOWER_UPPER_4DAY"
  | "FULL_BODY_3DAY"
  | "HIGH_LOW_4DAY"
  | "ATHLETIC_TOTAL_BODY_4DAY"
  | "LOWER_UPPER_POWER_HYPERTROPHY"
  | "MOVEMENT_FAMILY_SPLIT";

export interface BlockArchetype {
  id: BlockArchetypeId;
  label: string;
  shortLabel: string;
  description: string;
  introCopyTemplate: string;

  /** MonthlyBlockType(s) this archetype can map to — first is default */
  primaryMonthlyBlockTypes: MonthlyBlockType[];

  /** User goals this archetype suits best (partial match) */
  suitableGoals: string[];
  unsuitableGoals: string[];

  /** Experience levels */
  suitableTrainingAges: Array<"beginner" | "novice" | "intermediate" | "advanced">;

  /** How many days/week this fits (min, max) */
  suitableScheduleRange: [number, number];

  /** Recovery/fatigue compatibility */
  suitableRecoveryProfiles: Array<"fresh" | "normal" | "fatigued" | "overtrained">;

  /** Split architectures this archetype prefers */
  preferredSplitArchitectures: SplitArchitectureId[];
  bannedSplitArchitectures: SplitArchitectureId[];

  /** Adjust slot pick scoring within this archetype */
  slotWeightAdjustments: SlotWeightAdjustment[];

  /** Movement modalities this archetype emphasizes */
  movementBiases: MovementBias[];

  neuralDemandProfile: NeuralDemandProfile;
  fatigueProfile: FatigueProfile;
  setRepProfile: SetRepProfile;
  progressionStyle: ProgressionStyle;

  /** Tags used for similarity fingerprinting */
  variationTags: string[];

  /** Block-aware scoring hints for exercise ranking */
  blockIntentBoosts: Array<"power" | "strength" | "hypertrophy" | "endurance" | "stability" | "mobility" | "speed" | "elastic" | "rotational">;
}

// ─── Archetype Definitions ────────────────────────────────────────────────────

export const BLOCK_ARCHETYPES: Record<BlockArchetypeId, BlockArchetype> = {

  FOUNDATION_ACCUMULATION: {
    id: "FOUNDATION_ACCUMULATION",
    label: "Foundation Accumulation Block",
    shortLabel: "Foundation Accumulation",
    description: "High-volume foundation work across all movement patterns at moderate intensity. Builds tissue tolerance, work capacity, and broad movement exposure before intensification begins.",
    introCopyTemplate: "This block is your foundation — broad exposure across all patterns, building the volume base your body needs before intensity climbs. Every rep is about competency and tolerance, not max effort.",
    primaryMonthlyBlockTypes: ["accumulation", "hypertrophy_support"],
    suitableGoals: ["general fitness", "hypertrophy", "muscle", "size", "conditioning", "work capacity", "athletic", "sport"],
    unsuitableGoals: ["peak strength", "powerlifting", "max strength test", "competition"],
    suitableTrainingAges: ["beginner", "novice", "intermediate", "advanced"],
    suitableScheduleRange: [3, 5],
    suitableRecoveryProfiles: ["fresh", "normal", "fatigued"],
    preferredSplitArchitectures: ["FULL_BODY_3DAY", "LOWER_UPPER_4DAY", "LOWER_UPPER_POWER_HYPERTROPHY"],
    bannedSplitArchitectures: [],
    slotWeightAdjustments: [
      { slot: "bilateral_squat_strength", modifier: 0.8 },
      { slot: "bilateral_hinge_strength", modifier: 0.8 },
      { slot: "unilateral_lower", modifier: 1.4 },
      { slot: "elastic_power", modifier: 0.6 },
    ],
    movementBiases: ["submaximal_volume", "unilateral_dominance", "structural_tissue"],
    neuralDemandProfile: "moderate",
    fatigueProfile: "high",
    setRepProfile: {
      primaryRepRange: [8, 12],
      primarySetRange: [3, 5],
      secondaryRepRange: [10, 15],
      secondarySetRange: [3, 4],
      restPrimary: "90–120 sec",
      restSecondary: "60–90 sec",
      intensity: "65–78% 1RM",
    },
    progressionStyle: "volume_ladder",
    variationTags: ["accumulation", "volume", "moderate_intensity", "broad_exposure"],
    blockIntentBoosts: ["hypertrophy", "stability", "endurance"],
  },

  INTENSIFICATION_STRENGTH: {
    id: "INTENSIFICATION_STRENGTH",
    label: "Intensification Strength Block",
    shortLabel: "Intensification Strength",
    description: "Heavy bilateral compound emphasis at low rep ranges with high rest. Fewer fluff movements, tighter accessory selection, maximum neural demand on primary lifts.",
    introCopyTemplate: "This block is about expressing strength — heavy loads, short rep ranges, and long recovery between efforts. Less volume, more intent. Every set matters.",
    primaryMonthlyBlockTypes: ["intensification", "strength_emphasis"],
    suitableGoals: ["strength", "powerlifting", "strong", "force", "heavy", "power", "athletic"],
    unsuitableGoals: ["fat loss", "weight loss", "cardio", "conditioning", "endurance", "muscle tone"],
    suitableTrainingAges: ["intermediate", "advanced"],
    suitableScheduleRange: [3, 5],
    suitableRecoveryProfiles: ["fresh", "normal"],
    preferredSplitArchitectures: ["HIGH_LOW_4DAY", "LOWER_UPPER_4DAY", "ATHLETIC_TOTAL_BODY_4DAY"],
    bannedSplitArchitectures: ["MOVEMENT_FAMILY_SPLIT"],
    slotWeightAdjustments: [
      { slot: "bilateral_squat_strength", modifier: 1.6 },
      { slot: "bilateral_hinge_strength", modifier: 1.6 },
      { slot: "lower_power", modifier: 1.0 },
      { slot: "unilateral_lower", modifier: 0.7 },
      { slot: "conditioning_finisher", modifier: 0.3 },
    ],
    movementBiases: ["bilateral_strength"],
    neuralDemandProfile: "high",
    fatigueProfile: "moderate",
    setRepProfile: {
      primaryRepRange: [2, 5],
      primarySetRange: [4, 6],
      secondaryRepRange: [5, 8],
      secondarySetRange: [3, 4],
      restPrimary: "3–5 min",
      restSecondary: "2–3 min",
      intensity: "80–92% 1RM",
    },
    progressionStyle: "load_wave",
    variationTags: ["intensification", "heavy", "low_rep", "high_rest", "bilateral"],
    blockIntentBoosts: ["strength", "power"],
  },

  POWER_ELASTIC_CONVERSION: {
    id: "POWER_ELASTIC_CONVERSION",
    label: "Power + Elastic Conversion Block",
    shortLabel: "Power + Elastic Conversion",
    description: "Elastic reactive work (jumps, bounds, throws), contrast pairs, and dynamic effort loading at high velocity. Lower fatigue accumulation, higher velocity intent, minimal grinding.",
    introCopyTemplate: "This block is about speed and power — every rep has velocity intent. Contrast pairs potentiate your nervous system, reactive plyometrics develop your elastic engine, and fatigue is deliberately managed so you stay sharp.",
    primaryMonthlyBlockTypes: ["power_conversion"],
    suitableGoals: ["power", "explosive", "athletic", "speed", "sport", "jump", "sprint"],
    unsuitableGoals: ["hypertrophy", "muscle size", "fat loss", "cardio", "endurance only"],
    suitableTrainingAges: ["intermediate", "advanced"],
    suitableScheduleRange: [3, 5],
    suitableRecoveryProfiles: ["fresh", "normal"],
    preferredSplitArchitectures: ["ATHLETIC_TOTAL_BODY_4DAY", "HIGH_LOW_4DAY", "FULL_BODY_3DAY"],
    bannedSplitArchitectures: ["LOWER_UPPER_POWER_HYPERTROPHY", "MOVEMENT_FAMILY_SPLIT"],
    slotWeightAdjustments: [
      { slot: "lower_power", modifier: 2.0 },
      { slot: "elastic_power", modifier: 2.0 },
      { slot: "rotational_power", modifier: 1.5 },
      { slot: "bilateral_squat_strength", modifier: 1.0 },
      { slot: "bilateral_hinge_strength", modifier: 1.0 },
      { slot: "conditioning_finisher", modifier: 0.5 },
    ],
    movementBiases: ["elastic_reactive", "contrast_pairs", "rotational_power"],
    neuralDemandProfile: "high",
    fatigueProfile: "low",
    setRepProfile: {
      primaryRepRange: [3, 5],
      primarySetRange: [3, 5],
      secondaryRepRange: [4, 8],
      secondarySetRange: [3, 4],
      restPrimary: "3–5 min (full CNS recovery)",
      restSecondary: "2–3 min",
      intensity: "70–85% 1RM + explosive work at max intent",
    },
    progressionStyle: "contrast_density",
    variationTags: ["power", "elastic", "contrast", "velocity", "plyometric"],
    blockIntentBoosts: ["power", "elastic", "speed"],
  },

  REBUILD_DELOAD: {
    id: "REBUILD_DELOAD",
    label: "Rebuild / Deload Block",
    shortLabel: "Rebuild + Deload",
    description: "Lower fatigue, reduced slot density, submaximal loading, movement quality emphasis, and structural tissue restoration. Designed to supercompensate and reset readiness.",
    introCopyTemplate: "This block is active recovery — intentionally lower demands so your body can supercompensate. Every session should finish with energy left in the tank. This is where the adaptation from hard work actually happens.",
    primaryMonthlyBlockTypes: ["re_entry_resilience"],
    suitableGoals: ["recovery", "deload", "re-entry", "comeback", "return", "maintenance", "general fitness"],
    unsuitableGoals: ["peak strength", "max power", "competition", "intensification"],
    suitableTrainingAges: ["beginner", "novice", "intermediate", "advanced"],
    suitableScheduleRange: [2, 4],
    suitableRecoveryProfiles: ["fatigued", "overtrained", "normal"],
    preferredSplitArchitectures: ["FULL_BODY_3DAY", "MOVEMENT_FAMILY_SPLIT"],
    bannedSplitArchitectures: ["HIGH_LOW_4DAY"],
    slotWeightAdjustments: [
      { slot: "lower_power", modifier: 0.3 },
      { slot: "elastic_power", modifier: 0.2 },
      { slot: "bilateral_squat_strength", modifier: 0.7 },
      { slot: "bilateral_hinge_strength", modifier: 0.7 },
      { slot: "unilateral_lower", modifier: 1.2 },
      { slot: "trunk_anti_rotation", modifier: 1.2 },
    ],
    movementBiases: ["structural_tissue", "submaximal_volume"],
    neuralDemandProfile: "low",
    fatigueProfile: "low",
    setRepProfile: {
      primaryRepRange: [8, 15],
      primarySetRange: [2, 3],
      secondaryRepRange: [12, 20],
      secondarySetRange: [2, 3],
      restPrimary: "60–90 sec",
      restSecondary: "45–60 sec",
      intensity: "50–70% 1RM",
    },
    progressionStyle: "conservative_submaximal",
    variationTags: ["deload", "recovery", "submaximal", "tissue_quality", "low_neural"],
    blockIntentBoosts: ["stability", "mobility"],
  },
};

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * DEV-only: Check archetypes for contradictory preferred/banned splits.
 * Logs [BlockRulesAuditWarning] for any conflicts found.
 */
export function validateArchetypeCoherence(): void {
  if (process.env.NODE_ENV === "production") return;

  for (const archetype of Object.values(BLOCK_ARCHETYPES)) {
    const preferred = new Set(archetype.preferredSplitArchitectures);
    const banned = new Set(archetype.bannedSplitArchitectures);
    const conflicts = [...preferred].filter((s) => banned.has(s));

    if (conflicts.length > 0) {
      console.warn(
        `[BlockRulesAuditWarning] ${archetype.id} has contradictory preferred/banned split: ${conflicts.join(", ")}`,
      );
    }

    if (archetype.id === "REBUILD_DELOAD") {
      if (archetype.neuralDemandProfile !== "low") {
        console.warn(
          `[BlockRulesAuditWarning] ${archetype.id} neuralDemandProfile should be "low" — got "${archetype.neuralDemandProfile}"`,
        );
      }
      if (archetype.fatigueProfile !== "low") {
        console.warn(
          `[BlockRulesAuditWarning] ${archetype.id} fatigueProfile should be "low" — got "${archetype.fatigueProfile}"`,
        );
      }
    }
  }
}
