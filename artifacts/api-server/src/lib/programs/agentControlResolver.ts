/**
 * Agent Control Resolver — Translates raw AgentControlDirectives into
 * normalized ResolvedAgentControls consumed by the generation engine.
 *
 * This is the single translation layer between agent intent and engine input.
 * All downstream systems read from ResolvedAgentControls — never from raw directives.
 *
 * Architectural principle:
 *   No downstream function should interpret AgentControlDirectives directly.
 *   They should only consume the resolved, typed, numeric values from this module.
 */

import type {
  AgentControlDirectives,
  ResolvedAgentControls,
  GenerationMode,
  RepetitionSeverity,
  VisibleSpinePatternId,
  DayIdentityOverride,
} from "./agentControlTypes";

// ─── Generation Mode Pressures ────────────────────────────────────────────────

/**
 * How each generation mode maps to numeric pressure values.
 * These are additive modifications to the engine's novelty pressure.
 */
const GENERATION_MODE_NOVELTY_DELTA: Record<GenerationMode, number> = {
  default:      0.0,
  explore:      0.25,
  high_variance: 0.55,
  conservative: -0.25,
};

const GENERATION_MODE_ANCHOR_PENALTY_MULTIPLIER: Record<GenerationMode, number> = {
  default:      1.0,
  explore:      1.4,
  high_variance: 2.0,
  conservative: 0.6,
};

// ─── Suppression Strength → Penalty Scale ────────────────────────────────────

/**
 * Converts a 0.0–1.0 suppression strength into a penalty score
 * that gets applied in the scoreCandidate function.
 * Scale: 0.0 = no effect, 0.5 = moderate (≈3 pts), 1.0 = effective ban (10 pts)
 */
function strengthToPenalty(strength: number): number {
  const clamped = Math.max(0, Math.min(1, strength));
  return clamped * 10;
}

// ─── Perceived Repetition → Pressure Amplification ───────────────────────────

function repetitionSeverityToNoveltyBoost(severity: RepetitionSeverity): number {
  return severity === "high" ? 0.45 : severity === "moderate" ? 0.25 : 0.1;
}

function worstSeverity(severities: RepetitionSeverity[]): RepetitionSeverity | null {
  if (severities.includes("high")) return "high";
  if (severities.includes("moderate")) return "moderate";
  if (severities.includes("low")) return "low";
  return null;
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve raw agent directives into the normalized control object.
 *
 * @param directives - Raw agent directives (may be empty object if none).
 * @param baseNoveltyPressure - Engine-computed novelty pressure before controls.
 * @returns ResolvedAgentControls for downstream consumption.
 */
export function resolveAgentControlDirectives(
  directives: AgentControlDirectives,
  baseNoveltyPressure: number,
): ResolvedAgentControls {

  const mode: GenerationMode = directives.generationMode ?? "default";

  // ── Novelty Pressure Resolution ──────────────────────────────────────────
  let resolvedNoveltyPressure: number;

  if (directives.noveltyOverride?.enabled && directives.noveltyOverride.level !== undefined) {
    // Explicit override takes full precedence
    resolvedNoveltyPressure = Math.max(0, Math.min(1, directives.noveltyOverride.level));
  } else {
    // Start from base and apply mode + perceived repetition amplification
    let pressure = baseNoveltyPressure + GENERATION_MODE_NOVELTY_DELTA[mode];

    // Perceived repetition flags boost novelty pressure further
    if (directives.perceivedRepetitionFlags && directives.perceivedRepetitionFlags.length > 0) {
      const severities = directives.perceivedRepetitionFlags.map((f) => f.severity);
      const worst = worstSeverity(severities);
      if (worst) {
        pressure += repetitionSeverityToNoveltyBoost(worst);
      }
    }

    resolvedNoveltyPressure = Math.max(0, Math.min(1, pressure));
  }

  // ── Hero Suppression Penalties ───────────────────────────────────────────
  const resolvedHeroSuppressionPenalties: Record<string, number> = {};
  if (directives.suppressExercises) {
    const { exerciseIds = [], strength = 0.7 } = directives.suppressExercises;
    const penalty = strengthToPenalty(strength);
    // Also apply mode-based amplification to suppression
    const modeMultiplier = GENERATION_MODE_ANCHOR_PENALTY_MULTIPLIER[mode];

    for (const exerciseId of exerciseIds) {
      resolvedHeroSuppressionPenalties[exerciseId] =
        (resolvedHeroSuppressionPenalties[exerciseId] ?? 0) + penalty * modeMultiplier;
    }

    // Perceived repetition flags also generate hero suppression for mentioned exercises
    for (const flag of directives.perceivedRepetitionFlags ?? []) {
      if (flag.type === "hero_exercise_repeat" || flag.type === "visible_spine_repeat") {
        // These will be amplified by the audit module — no explicit exercise IDs here
        // but the novelty pressure increase handles it at the system level
      }
    }
  }

  // ── Family Bias Overrides ────────────────────────────────────────────────
  const resolvedFamilyBiasOverrides: Record<string, number> = {};
  const resolvedBannedFamilies: string[] = [];

  if (directives.suppressExercises?.familyIds) {
    const { familyIds = [], strength = 0.7 } = directives.suppressExercises;
    const penalty = strengthToPenalty(strength);
    for (const familyId of familyIds) {
      resolvedFamilyBiasOverrides[familyId] =
        (resolvedFamilyBiasOverrides[familyId] ?? 0) - penalty;
    }
  }

  if (directives.forceFamilyDistribution) {
    const { boosts = {}, reductions = {}, bans = [] } = directives.forceFamilyDistribution;

    for (const [family, amount] of Object.entries(boosts)) {
      resolvedFamilyBiasOverrides[family] = (resolvedFamilyBiasOverrides[family] ?? 0) + amount;
    }
    for (const [family, amount] of Object.entries(reductions)) {
      resolvedFamilyBiasOverrides[family] = (resolvedFamilyBiasOverrides[family] ?? 0) - amount;
    }
    for (const family of bans) {
      resolvedBannedFamilies.push(family);
      resolvedFamilyBiasOverrides[family] = -10; // hard ban
    }
  }

  // ── Day Identity Targets ─────────────────────────────────────────────────
  const resolvedDayIdentityTargets: Record<number, DayIdentityOverride> = {};
  for (const override of directives.dayIdentityOverrides ?? []) {
    resolvedDayIdentityTargets[override.dayIndex] = override;
  }

  // ── Visible Spine Rules ──────────────────────────────────────────────────
  const vsOverride = directives.visibleSpineOverride;
  const resolvedVisibleSpineRules = {
    enabled: vsOverride?.enabled ?? false,
    avoidPatterns: (vsOverride?.avoidPatterns ?? []) as VisibleSpinePatternId[],
    prioritizePatterns: (vsOverride?.prioritizePatterns ?? []) as VisibleSpinePatternId[],
    targetDayIndices: vsOverride?.targetDayIndices ?? [],
    strength: vsOverride?.strength ?? 0.5,
  };

  // ── Reroll Strategy ──────────────────────────────────────────────────────
  const rerollOverride = directives.rerollStrategyOverride;
  const resolvedRerollStrategy = {
    preferredActions: rerollOverride?.enabled
      ? (rerollOverride.preferredActions ?? [])
      : [],
    maxAttempts: rerollOverride?.maxAttempts ?? 3,
    stopIfVarianceAbove: rerollOverride?.stopIfVarianceAbove ?? null,
  };

  // ── Perceived Repetition State ───────────────────────────────────────────
  const flags = directives.perceivedRepetitionFlags ?? [];
  const hasPerceivedRepetition = flags.length > 0;
  const perceivedRepetitionSeverity: RepetitionSeverity | null =
    worstSeverity(flags.map((f) => f.severity));

  // ── Preserve Constraints ─────────────────────────────────────────────────
  const pi = directives.preserveInstructions;
  const preserveConstraints = {
    blockIdentity:      pi?.keepBlockIdentity    ?? false,
    splitArchitecture:  pi?.keepSplitArchitecture ?? false,
    upperDays:          pi?.keepUpperDays         ?? false,
    lowerDays:          pi?.keepLowerDays         ?? false,
    specificExercises:  pi?.keepSpecificExercises ?? [],
    specificFamilies:   pi?.keepSpecificFamilies  ?? [],
  };

  return {
    resolvedGenerationMode: mode,
    resolvedNoveltyPressure,
    resolvedHeroSuppressionPenalties,
    resolvedFamilyBiasOverrides,
    resolvedBannedFamilies,
    resolvedDayIdentityTargets,
    resolvedVisibleSpineRules,
    resolvedRerollStrategy,
    hasPerceivedRepetition,
    perceivedRepetitionSeverity,
    preserveConstraints,
    sourceDirectives: directives,
  };
}

/**
 * Returns the anchor penalty multiplier for the resolved generation mode.
 * Used inside scoreCandidate to amplify default-anchor discounting.
 */
export function getAnchorPenaltyMultiplierForMode(mode: GenerationMode): number {
  return GENERATION_MODE_ANCHOR_PENALTY_MULTIPLIER[mode];
}

/**
 * Returns a null-safe resolved control object with all defaults.
 * Use when no agent directives have been provided.
 */
export function buildDefaultResolvedControls(baseNoveltyPressure: number): ResolvedAgentControls {
  return resolveAgentControlDirectives({}, baseNoveltyPressure);
}
