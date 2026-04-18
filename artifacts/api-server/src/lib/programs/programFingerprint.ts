/**
 * Program Fingerprint — Extended Canonical Representation
 *
 * Expands the base ProgramFingerprint (similarity.ts) with richer signal:
 *   - day themes and ordering
 *   - per-day exercise families
 *   - family distribution counts (bilateral/unilateral/upper/elastic/trunk/etc)
 *   - slot ordering fingerprint
 *   - neural demand distribution across slots
 *
 * This fingerprint is the single source of truth for variance comparison.
 * It is NOT a replacement for the base ProgramFingerprint used by blockScoring —
 * it is a richer supplement used exclusively by the ProgramVarianceAudit system.
 */

import type { BlockArchetypeId, SplitArchitectureId } from "./blockArchetypes";
import type { BlockPhase } from "./programContextProfile";
import { getExerciseFamily } from "./exerciseExtendedMeta";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DayFingerprint {
  dayIndex: number;
  theme: string;
  primaryPattern: string;
  neuralDemand: "high" | "moderate" | "low";
  hasElasticExposure: boolean;
  primaryExercise: string;
  primaryExerciseFamily: string;
  secondaryExercise?: string;
  secondaryExerciseFamily?: string;
}

export interface FamilyDistribution {
  bilateralSqat: number;
  bilateralHinge: number;
  trapBar: number;
  gobletTempo: number;
  unilateralSquat: number;
  unilateralHinge: number;
  plyometric: number;
  elasticReactive: number;
  ballistic: number;
  upperHorizontalPush: number;
  upperVerticalPush: number;
  upperHorizontalPull: number;
  upperVerticalPull: number;
  trunkStability: number;
  rotational: number;
  conditioning: number;
  isolationAccessory: number;
  positional: number;
}

export interface ExtendedProgramFingerprint {
  // ── Identity ────────────────────────────────────────────────────────────
  generationId: string;
  generatedAt: number;

  // ── Block / Phase ────────────────────────────────────────────────────────
  blockArchetype: BlockArchetypeId;
  currentPhase: BlockPhase;
  progressionStyle: string;
  neuralDemandProfile: "high" | "moderate" | "low";
  fatigueProfile: "high" | "moderate" | "low";

  // ── Split ────────────────────────────────────────────────────────────────
  splitArchitecture: SplitArchitectureId;
  weeklyRhythm: string;
  daysPerWeek: number;

  // ── Day Themes ───────────────────────────────────────────────────────────
  dayThemes: string[];
  dayPrimaryPatterns: string[];
  dayNeuralSequence: Array<"high" | "moderate" | "low">;
  dayElasticMap: boolean[];
  days: DayFingerprint[];

  // ── Slot Fingerprint ─────────────────────────────────────────────────────
  slotOrderKey: string;
  primaryExercisesBySlot: Record<string, string>;
  primaryFamiliesBySlot: Record<string, string>;

  // ── Top Primary Movements ────────────────────────────────────────────────
  topPrimaryExercises: string[];
  topPrimaryFamilies: string[];

  // ── Family Distribution Counts ───────────────────────────────────────────
  familyDistribution: FamilyDistribution;

  // ── Structural Summary ───────────────────────────────────────────────────
  bilateralLowerCount: number;
  unilateralLowerCount: number;
  upperPushCount: number;
  upperPullCount: number;
  rotationalCount: number;
  elasticCount: number;
  trunkCount: number;
  conditioningCount: number;
  lowerUpperRatio: number;

  // ── Variation Tags ───────────────────────────────────────────────────────
  variationTags: string[];
}

// ─── Family mapping helpers ───────────────────────────────────────────────────

function isBilateralLower(family: string): boolean {
  return family === "heavy_bilateral_squat" || family === "heavy_bilateral_hinge" || family === "trap_bar" || family === "goblet_tempo_squat";
}

function isUnilateralLower(family: string): boolean {
  return family === "unilateral_squat" || family === "unilateral_hinge";
}

function isUpperPush(family: string): boolean {
  return family === "upper_horizontal_push" || family === "upper_vertical_push";
}

function isUpperPull(family: string): boolean {
  return family === "upper_horizontal_pull" || family === "upper_vertical_pull";
}

function isElastic(family: string): boolean {
  return family === "plyometric" || family === "elastic_reactive" || family === "ballistic";
}

function isTrunk(family: string): boolean {
  return family === "trunk_stability" || family === "rotational" || family === "positional";
}

function isConditioning(family: string): boolean {
  return family === "conditioning";
}

function countFamilyHits(families: string[], predicate: (f: string) => boolean): number {
  return families.filter(predicate).length;
}

// ─── Family Distribution Builder ─────────────────────────────────────────────

function buildFamilyDistribution(allFamilies: string[]): FamilyDistribution {
  const count = (f: string) => allFamilies.filter((x) => x === f).length;
  return {
    bilateralSqat: count("heavy_bilateral_squat"),
    bilateralHinge: count("heavy_bilateral_hinge"),
    trapBar: count("trap_bar"),
    gobletTempo: count("goblet_tempo_squat"),
    unilateralSquat: count("unilateral_squat"),
    unilateralHinge: count("unilateral_hinge"),
    plyometric: count("plyometric"),
    elasticReactive: count("elastic_reactive"),
    ballistic: count("ballistic"),
    upperHorizontalPush: count("upper_horizontal_push"),
    upperVerticalPush: count("upper_vertical_push"),
    upperHorizontalPull: count("upper_horizontal_pull"),
    upperVerticalPull: count("upper_vertical_pull"),
    trunkStability: count("trunk_stability"),
    rotational: count("rotational"),
    conditioning: count("conditioning"),
    isolationAccessory: count("isolation_accessory"),
    positional: count("positional"),
  };
}

// ─── Slot Order Key ───────────────────────────────────────────────────────────

/**
 * Build a deterministic string key from the ordered slot-to-exercise mapping.
 * Two programs with the same slot assignments produce the same key.
 */
function buildSlotOrderKey(slots: Record<string, unknown>): string {
  const ordered = Object.entries(slots)
    .filter(([, ex]) => typeof ex === "string")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, ex]) => `${slot}:${(ex as string).replace(/\s+/g, "_").toLowerCase()}`);
  return ordered.join("|");
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export interface BuildExtendedFingerprintParams {
  generationId: string;
  blockArchetype: BlockArchetypeId;
  currentPhase: BlockPhase;
  progressionStyle: string;
  neuralDemandProfile: "high" | "moderate" | "low";
  fatigueProfile: "high" | "moderate" | "low";
  splitArchitecture: SplitArchitectureId;
  weeklyRhythm: string;
  daysPerWeek: number;
  dayTemplates: Array<{
    dayIndex: number;
    label: string;
    primaryPattern: string;
    neuralDemand: "high" | "moderate" | "low";
    elasticExposure: boolean;
  }>;
  slotSelections: Record<string, unknown>;
  variationTags: string[];
}

export function buildExtendedFingerprint(params: BuildExtendedFingerprintParams): ExtendedProgramFingerprint {
  const {
    generationId, blockArchetype, currentPhase, progressionStyle,
    neuralDemandProfile, fatigueProfile, splitArchitecture, weeklyRhythm,
    daysPerWeek, dayTemplates, slotSelections, variationTags,
  } = params;

  // Day-level fingerprints
  const SLOT_BY_DAY_PATTERN: Record<string, string> = {
    squat: "bilateral_squat_strength",
    hinge: "bilateral_hinge_strength",
    power: "lower_power",
    upper_push: "upper_push_primary",
    upper_pull: "upper_pull_primary",
    unilateral_lower: "unilateral_lower",
  };

  const days: DayFingerprint[] = dayTemplates.map((dt) => {
    const primarySlot = SLOT_BY_DAY_PATTERN[dt.primaryPattern] ?? "bilateral_squat_strength";
    const primaryEx = slotSelections[primarySlot] ?? slotSelections["bilateral_squat_strength"] ?? "";
    const primaryFamily = primaryEx ? getExerciseFamily(primaryEx) : "heavy_bilateral_squat";
    const secondarySlot = dt.primaryPattern.includes("upper") ? "upper_pull_primary" : "unilateral_lower";
    const secondaryEx = slotSelections[secondarySlot];
    const secondaryFamily = secondaryEx ? getExerciseFamily(secondaryEx) : undefined;
    return {
      dayIndex: dt.dayIndex,
      theme: dt.label,
      primaryPattern: dt.primaryPattern,
      neuralDemand: dt.neuralDemand,
      hasElasticExposure: dt.elasticExposure,
      primaryExercise: primaryEx,
      primaryExerciseFamily: primaryFamily,
      secondaryExercise: secondaryEx,
      secondaryExerciseFamily: secondaryFamily,
    };
  });

  // Primary slot mapping
  const PRIMARY_SLOTS = [
    "lower_power",
    "bilateral_squat_strength",
    "bilateral_hinge_strength",
    "upper_push_primary",
    "upper_pull_primary",
    "unilateral_lower",
    "unilateral_lower_alt",
    "trunk_anti_rotation",
    "trunk_anti_extension",
    "rotational_power",
    "elastic_power",
    "conditioning_finisher",
  ];

  const primaryExercisesBySlot: Record<string, string> = {};
  const primaryFamiliesBySlot: Record<string, string> = {};
  for (const slot of PRIMARY_SLOTS) {
    const ex = slotSelections[slot];
    if (ex) {
      primaryExercisesBySlot[slot] = ex;
      primaryFamiliesBySlot[slot] = getExerciseFamily(ex);
    }
  }

  const allFamilies = Object.values(primaryFamiliesBySlot);
  const allExercises = Object.values(primaryExercisesBySlot).filter(Boolean);

  const topPrimaryExercises = [
    slotSelections["bilateral_squat_strength"],
    slotSelections["bilateral_hinge_strength"],
    slotSelections["lower_power"],
    slotSelections["upper_push_primary"],
    slotSelections["upper_pull_primary"],
  ].filter(Boolean).slice(0, 5);

  const topPrimaryFamilies = topPrimaryExercises.map((ex) => getExerciseFamily(ex));

  const familyDistribution = buildFamilyDistribution(allFamilies);
  const bilateralLowerCount = countFamilyHits(allFamilies, isBilateralLower);
  const unilateralLowerCount = countFamilyHits(allFamilies, isUnilateralLower);
  const upperPushCount = countFamilyHits(allFamilies, isUpperPush);
  const upperPullCount = countFamilyHits(allFamilies, isUpperPull);
  const rotationalCount = allFamilies.filter((f) => f === "rotational").length;
  const elasticCount = countFamilyHits(allFamilies, isElastic);
  const trunkCount = countFamilyHits(allFamilies, isTrunk);
  const conditioningCount = countFamilyHits(allFamilies, isConditioning);

  const totalLower = bilateralLowerCount + unilateralLowerCount;
  const totalUpper = upperPushCount + upperPullCount;
  const lowerUpperRatio = (totalLower + totalUpper) > 0
    ? totalLower / (totalLower + totalUpper)
    : 0.5;

  return {
    generationId,
    generatedAt: Date.now(),
    blockArchetype,
    currentPhase,
    progressionStyle,
    neuralDemandProfile,
    fatigueProfile,
    splitArchitecture,
    weeklyRhythm: weeklyRhythm.slice(0, 80),
    daysPerWeek,
    dayThemes: dayTemplates.map((d) => d.label),
    dayPrimaryPatterns: dayTemplates.map((d) => d.primaryPattern),
    dayNeuralSequence: dayTemplates.map((d) => d.neuralDemand),
    dayElasticMap: dayTemplates.map((d) => d.elasticExposure),
    days,
    slotOrderKey: buildSlotOrderKey(slotSelections),
    primaryExercisesBySlot,
    primaryFamiliesBySlot,
    topPrimaryExercises,
    topPrimaryFamilies,
    familyDistribution,
    bilateralLowerCount,
    unilateralLowerCount,
    upperPushCount,
    upperPullCount,
    rotationalCount,
    elasticCount,
    trunkCount,
    conditioningCount,
    lowerUpperRatio,
    variationTags,
  };
}

// ─── History Store ────────────────────────────────────────────────────────────

const EXTENDED_FINGERPRINT_HISTORY: ExtendedProgramFingerprint[] = [];
const MAX_EXTENDED_HISTORY = 10;

export function recordExtendedFingerprint(fp: ExtendedProgramFingerprint): void {
  EXTENDED_FINGERPRINT_HISTORY.push(fp);
  while (EXTENDED_FINGERPRINT_HISTORY.length > MAX_EXTENDED_HISTORY) {
    EXTENDED_FINGERPRINT_HISTORY.shift();
  }
}

export function getRecentExtendedFingerprints(n = 5): ExtendedProgramFingerprint[] {
  return EXTENDED_FINGERPRINT_HISTORY.slice(-n);
}

export function getExtendedFingerprintHistory(): ExtendedProgramFingerprint[] {
  return [...EXTENDED_FINGERPRINT_HISTORY];
}
