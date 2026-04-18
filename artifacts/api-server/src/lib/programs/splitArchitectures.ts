/**
 * Split Architectures — Block Variation Engine Layer 2
 *
 * Defines the weekly split structures that determine rhythm, balance, and
 * day-to-day variety. Each split maps to an existing session template variant
 * in program-architecture-engine.ts via a `variationSeedRange`.
 *
 * Split architectures are scored and selected AFTER the block archetype is
 * chosen, constrained by archetype preferences and banned combinations.
 */

import type { SplitArchitectureId } from "./blockArchetypes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayTemplate {
  dayIndex: number;
  label: string;
  primaryPattern: string;
  neuralDemand: "high" | "moderate" | "low";
  elasticExposure: boolean;
}

export interface SplitArchitecture {
  id: SplitArchitectureId;
  label: string;
  weeklyRhythmDescription: string;
  trainingDaysSupported: number[];

  dayTemplates: DayTemplate[];

  /** Variance seed range that selects this split's template in the architecture engine */
  variationSeedRange: [number, number];

  maxHighNeuralDays: number;
  lowerUpperBalance: "lower_heavy" | "upper_heavy" | "balanced";
  pushPullBalance: "push_heavy" | "pull_heavy" | "balanced";

  /** Goals this split suits */
  suitableGoals: string[];

  /** Block archetypes this split pairs well with */
  pairedArchetypes: SplitArchitectureId[];

  /** Adjacency constraint: e.g. no two high-neural days back to back */
  adjacencyRules: string[];

  elasticExposureRules: string;
  conditioningPlacementRules: string;

  /** Tags for fingerprinting */
  splitTags: string[];
}

// ─── Split Definitions ────────────────────────────────────────────────────────

export const SPLIT_ARCHITECTURES: Record<SplitArchitectureId, SplitArchitecture> = {

  LOWER_UPPER_4DAY: {
    id: "LOWER_UPPER_4DAY",
    label: "Lower / Upper — 4 Day",
    weeklyRhythmDescription: "Classic lower/upper alternation: Lower (high) → Upper (moderate) → Lower (moderate) → Upper (high). Bilateral lower emphasis balanced with structural upper pulling.",
    trainingDaysSupported: [4],
    dayTemplates: [
      { dayIndex: 0, label: "Lower — Squat Primary", primaryPattern: "squat", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 1, label: "Upper — Push/Pull", primaryPattern: "upper_push", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 2, label: "Lower — Hinge Primary", primaryPattern: "hinge", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 3, label: "Upper — Pull/Push", primaryPattern: "upper_pull", neuralDemand: "high", elasticExposure: false },
    ],
    variationSeedRange: [0.0, 0.33],
    maxHighNeuralDays: 2,
    lowerUpperBalance: "balanced",
    pushPullBalance: "balanced",
    suitableGoals: ["strength", "hypertrophy", "general fitness"],
    pairedArchetypes: [],
    adjacencyRules: ["No two high-neural days adjacent"],
    elasticExposureRules: "Elastic/plyometric work on Day 1 only — lower squat session when CNS is freshest",
    conditioningPlacementRules: "No conditioning on Day 1 (high neural). Day 4 finisher only if volume allows.",
    splitTags: ["lower_upper", "4day", "alternation"],
  },

  FULL_BODY_3DAY: {
    id: "FULL_BODY_3DAY",
    label: "Full Body — 3 Day",
    weeklyRhythmDescription: "Three full-body sessions with pattern rotation: lower-dominant → upper-dominant → integrated. Natural recovery windows between sessions.",
    trainingDaysSupported: [3],
    dayTemplates: [
      { dayIndex: 0, label: "Lower-Dominant Full Body", primaryPattern: "squat", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 1, label: "Upper-Dominant Full Body", primaryPattern: "upper_push", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 2, label: "Integrated Full Body", primaryPattern: "hinge", neuralDemand: "moderate", elasticExposure: false },
    ],
    variationSeedRange: [0.0, 0.5],
    maxHighNeuralDays: 1,
    lowerUpperBalance: "balanced",
    pushPullBalance: "balanced",
    suitableGoals: ["general fitness", "athletic", "conditioning", "re-entry", "accumulation"],
    pairedArchetypes: [],
    adjacencyRules: ["48h minimum between sessions ideal — true 3-day per week"],
    elasticExposureRules: "Elastic work on Day 1 only at full intensity; Day 3 sub-maximal elastic optional",
    conditioningPlacementRules: "Conditioning finisher on Day 3 only if session density allows",
    splitTags: ["full_body", "3day", "integrated"],
  },

  HIGH_LOW_4DAY: {
    id: "HIGH_LOW_4DAY",
    label: "High / Low Neural — 4 Day",
    weeklyRhythmDescription: "High-neural sessions alternate with low-neural recovery sessions: Power/Strength → Structural → Power/Strength → Structural. Peak CNS output on high days.",
    trainingDaysSupported: [4],
    dayTemplates: [
      { dayIndex: 0, label: "High Neural — Power + Strength", primaryPattern: "squat", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 1, label: "Low Neural — Structural", primaryPattern: "upper_pull", neuralDemand: "low", elasticExposure: false },
      { dayIndex: 2, label: "High Neural — Strength + Power", primaryPattern: "hinge", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 3, label: "Low Neural — Structural + Unilateral", primaryPattern: "unilateral_lower", neuralDemand: "low", elasticExposure: false },
    ],
    variationSeedRange: [0.33, 0.67],
    maxHighNeuralDays: 2,
    lowerUpperBalance: "lower_heavy",
    pushPullBalance: "pull_heavy",
    suitableGoals: ["strength", "power", "athletic", "sport"],
    pairedArchetypes: [],
    adjacencyRules: ["High-neural days must not be adjacent — always separated by low-neural session"],
    elasticExposureRules: "Full plyometric/contrast work on both high-neural days",
    conditioningPlacementRules: "Conditioning only on low-neural days — never adds fatigue to high-neural sessions",
    splitTags: ["high_low", "4day", "neural_periodization"],
  },

  ATHLETIC_TOTAL_BODY_4DAY: {
    id: "ATHLETIC_TOTAL_BODY_4DAY",
    label: "Athletic Total Body — 4 Day",
    weeklyRhythmDescription: "Four athletically-sequenced total-body sessions with differentiated themes: Power-dominant → Upper structural → Strength + conditioning → Recovery athletic.",
    trainingDaysSupported: [4],
    dayTemplates: [
      { dayIndex: 0, label: "Power Development + Lower Strength", primaryPattern: "power", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 1, label: "Upper Structural + Trunk", primaryPattern: "upper_push", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 2, label: "Lower Strength + Conditioning", primaryPattern: "hinge", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 3, label: "Athletic Recovery + Unilateral", primaryPattern: "unilateral_lower", neuralDemand: "low", elasticExposure: false },
    ],
    variationSeedRange: [0.67, 1.0],
    maxHighNeuralDays: 2,
    lowerUpperBalance: "lower_heavy",
    pushPullBalance: "balanced",
    suitableGoals: ["athletic", "power", "sport", "explosive", "speed"],
    pairedArchetypes: [],
    adjacencyRules: ["Day 1 (power) and Day 3 (strength) must not be consecutive calendar days"],
    elasticExposureRules: "Full elastic/reactive work on Days 1 and 3 — contrast protocol supported",
    conditioningPlacementRules: "Sport conditioning on Day 3 only — after strength work when accumulated fatigue is acceptable",
    splitTags: ["athletic", "total_body", "4day", "power_emphasis"],
  },

  LOWER_UPPER_POWER_HYPERTROPHY: {
    id: "LOWER_UPPER_POWER_HYPERTROPHY",
    label: "Lower / Upper — Power + Hypertrophy",
    weeklyRhythmDescription: "Lower/upper split with dedicated hypertrophy volume: Lower Power → Upper Strength → Lower Hypertrophy → Upper Pump. Power and volume in one week.",
    trainingDaysSupported: [4],
    dayTemplates: [
      { dayIndex: 0, label: "Lower Power + Strength", primaryPattern: "squat", neuralDemand: "high", elasticExposure: true },
      { dayIndex: 1, label: "Upper Strength + Pull", primaryPattern: "upper_pull", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 2, label: "Lower Volume + Unilateral", primaryPattern: "hinge", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 3, label: "Upper Volume + Push", primaryPattern: "upper_push", neuralDemand: "moderate", elasticExposure: false },
    ],
    variationSeedRange: [0.0, 0.5],
    maxHighNeuralDays: 1,
    lowerUpperBalance: "balanced",
    pushPullBalance: "pull_heavy",
    suitableGoals: ["hypertrophy", "muscle", "size", "bodybuilding", "general fitness"],
    pairedArchetypes: [],
    adjacencyRules: ["Day 1 and Day 2 can be consecutive — different primary patterns"],
    elasticExposureRules: "Elastic work on Day 1 (power session) only",
    conditioningPlacementRules: "No dedicated conditioning — pump finishers on Days 3 and 4 are acceptable",
    splitTags: ["lower_upper", "hypertrophy", "4day", "volume_emphasis"],
  },

  MOVEMENT_FAMILY_SPLIT: {
    id: "MOVEMENT_FAMILY_SPLIT",
    label: "Movement Family Split",
    weeklyRhythmDescription: "Sessions organized by primary movement family: Rotational/Pull → Squat/Hinge → Upper Structural. Ideal for rotational and skill sports with specific carry-over needs.",
    trainingDaysSupported: [3, 4],
    dayTemplates: [
      { dayIndex: 0, label: "Rotational Power + Lower", primaryPattern: "rotational", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 1, label: "Upper Pull + Structural", primaryPattern: "upper_pull", neuralDemand: "moderate", elasticExposure: false },
      { dayIndex: 2, label: "Hip Strength + Lateral", primaryPattern: "hinge", neuralDemand: "low", elasticExposure: false },
      { dayIndex: 3, label: "Full Rotational Integration", primaryPattern: "rotational", neuralDemand: "low", elasticExposure: false },
    ],
    variationSeedRange: [0.5, 1.0],
    maxHighNeuralDays: 0,
    lowerUpperBalance: "balanced",
    pushPullBalance: "pull_heavy",
    suitableGoals: ["rotational sport", "tennis", "golf", "baseball", "endurance", "corrective"],
    pairedArchetypes: [],
    adjacencyRules: ["Rotational sessions should not be adjacent to avoid cumulative load on thoracic spine"],
    elasticExposureRules: "No plyometric elastic work — rotational med ball power only",
    conditioningPlacementRules: "No gym conditioning — sport sessions provide adequate conditioning volume",
    splitTags: ["movement_family", "rotational", "skill_sport", "corrective"],
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * DEV-only: Validate that no split architecture's maxHighNeuralDays is exceeded
 * by its day templates, and that required/optional slot rules are coherent.
 */
export function validateSplitArchitectures(): void {
  if (process.env.NODE_ENV === "production") return;

  for (const split of Object.values(SPLIT_ARCHITECTURES)) {
    const highNeuralCount = split.dayTemplates.filter((d) => d.neuralDemand === "high").length;
    if (highNeuralCount > split.maxHighNeuralDays) {
      console.warn(
        `[BlockRulesAuditWarning] ${split.id} dayTemplates exceed maxHighNeuralDays: ` +
        `${highNeuralCount} high-neural days vs max ${split.maxHighNeuralDays}`,
      );
    }

    if (split.id === "MOVEMENT_FAMILY_SPLIT") {
      const hasElastic = split.dayTemplates.some((d) => d.elasticExposure);
      if (hasElastic) {
        console.warn(
          `[BlockRulesAuditWarning] ${split.id} has elasticExposure=true but should not have full plyometric work`,
        );
      }
    }
  }
}
