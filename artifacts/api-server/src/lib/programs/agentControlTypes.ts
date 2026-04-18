/**
 * Agent Control Types — Typed interface for agent-facing control directives.
 *
 * This module defines the single typed surface the agent uses to steer the
 * generation engine. All control actions must flow through AgentControlDirectives —
 * no direct mutation of scattered scoring internals, no hidden side channels.
 *
 * Architectural principle:
 *   Agent issues directives → engine consumes them → output is steered.
 *   Nothing downstream should read raw scattered state to implement agent intent.
 */

// ─── Visible Spine Pattern Vocabulary ─────────────────────────────────────────

/**
 * Normalized visible spine pattern IDs.
 * Used in visibleSpineOverride to avoid fragile freeform strings.
 * Each ID represents a recognizable sequence of user-visible hero slots.
 */
export const VISIBLE_SPINE_PATTERNS = {
  // Lower-dominant day patterns
  JUMP_SQUAT_HINGE_UNILATERAL_TRUNK:    "jump_squat_hinge_unilateral_trunk",
  JUMP_SQUAT_UNILATERAL_TRUNK:          "jump_squat_unilateral_trunk",
  THROW_HINGE_UNILATERAL_TRUNK:         "throw_hinge_unilateral_trunk",
  ELASTIC_PRIMARY_BILATERAL_SUPPORT:    "elastic_primary_bilateral_support",
  UNILATERAL_PRIMARY_LATERAL_ROTATIONAL:"unilateral_primary_lateral_rotational",
  BILATERAL_FORCE_THEN_SECONDARY_HINGE: "bilateral_force_then_secondary_hinge",
  GRINDY_LOWER_STACK:                   "grindy_lower_stack",
  REACTIVE_LOWER_STACK:                 "reactive_lower_stack",
  LOW_COMPLEXITY_REBUILD_STACK:         "low_complexity_rebuild_stack",
  // Upper-dominant day patterns
  PRESS_PULL_TRUNK_FINISHER:            "press_pull_trunk_finisher",
  VERTICAL_PUSH_PULL_STACK:             "vertical_push_pull_stack",
  HORIZONTAL_PUSH_PULL_STACK:           "horizontal_push_pull_stack",
  ROTATIONAL_UPPER_STACK:               "rotational_upper_stack",
  // Mixed / full-body patterns
  POWER_LOWER_UPPER_TRUNK:              "power_lower_upper_trunk",
  FULL_BODY_ELASTIC_CIRCUIT:            "full_body_elastic_circuit",
} as const;

export type VisibleSpinePatternId = (typeof VISIBLE_SPINE_PATTERNS)[keyof typeof VISIBLE_SPINE_PATTERNS];

// ─── Generation Mode ──────────────────────────────────────────────────────────

export type GenerationMode = "default" | "explore" | "high_variance" | "conservative";

// ─── Control Strength ─────────────────────────────────────────────────────────

/**
 * 0.0 = no effect, 1.0 = maximum effect.
 * Used throughout directives where gradual application is desirable.
 */
export type ControlStrength = number;

// ─── Suppression Duration ────────────────────────────────────────────────────

export type SuppressionDuration = "current_day" | "current_program" | "current_block";

// ─── Perceived Repetition Severity ───────────────────────────────────────────

export type RepetitionSeverity = "low" | "moderate" | "high";

// ─── Target Enum Types ────────────────────────────────────────────────────────

export type NoveltyOverrideTarget = "global" | "visible_slots" | "hero_exercises" | "entire_program";

export type ControlNeuralDemand = "low" | "moderate" | "high";
export type ControlFatigue     = "low" | "moderate" | "high";
export type ControlVelocity    = "low" | "moderate" | "high";

// ─── Sub-directive interfaces ─────────────────────────────────────────────────

export interface VisibleSpineOverride {
  enabled: boolean;
  /** Pattern IDs to actively avoid in visible slot selection. */
  avoidPatterns?: VisibleSpinePatternId[];
  /** Pattern IDs to prefer in visible slot selection. */
  prioritizePatterns?: VisibleSpinePatternId[];
  /** Day indices (0-based) to apply the override to. Omit = all days. */
  targetDayIndices?: number[];
  /** 0.0–1.0 how hard to push the override. Default 0.5. */
  strength?: ControlStrength;
}

export interface SuppressExercises {
  /** Exact exercise names to suppress. */
  exerciseIds?: string[];
  /** Exercise families to suppress. */
  familyIds?: string[];
  /** Day indices to target. Omit = all days. */
  targetDayIndices?: number[];
  /** Slot names to target (e.g. "lower_power", "bilateral_squat_strength"). Omit = all slots. */
  targetSlots?: string[];
  /** Human-readable reason for audit log. */
  reason?: string;
  /** 0.0–1.0 suppression strength. Default 0.7. 1.0 = effective ban. */
  strength?: ControlStrength;
  /** How long suppression stays active. */
  duration?: SuppressionDuration;
}

export interface ForceFamilyDistribution {
  /** Family IDs → boost amount (0.0–3.0). Adds to family bias scores. */
  boosts?: Record<string, number>;
  /** Family IDs → reduction amount (0.0–3.0). Subtracts from family bias scores. */
  reductions?: Record<string, number>;
  /** Family IDs that are hard-banned for this generation. */
  bans?: string[];
  /** Day indices to target. Omit = all days. */
  targetDayIndices?: number[];
  /** Human-readable reason for audit log. */
  reason?: string;
}

export interface DayIdentityOverride {
  dayIndex: number;
  /** Override day's primary focus label. */
  primaryFocus?: string;
  /** Override day's secondary focus label. */
  secondaryFocus?: string;
  /** Families to avoid on this day. */
  avoidFamilies?: string[];
  /** Visible-spine patterns to avoid on this day. */
  avoidPatterns?: VisibleSpinePatternId[];
  /** Visible-spine patterns to prefer on this day. */
  preferredPatterns?: VisibleSpinePatternId[];
  /** Override target neural demand for this day. */
  targetNeuralDemand?: ControlNeuralDemand;
  /** Override target fatigue for this day. */
  targetFatigue?: ControlFatigue;
  /** Override target velocity intent for this day. */
  targetVelocityIntent?: ControlVelocity;
}

export interface NoveltyOverride {
  enabled: boolean;
  /** 0.0–1.0 override novelty pressure. Replaces engine-computed pressure. */
  level?: number;
  /** Which layer to apply novelty pressure to. Default "global". */
  target?: NoveltyOverrideTarget;
  /** Human-readable reason for audit log. */
  reason?: string;
}

export interface RerollStrategyOverride {
  enabled: boolean;
  /** Ordered preferred reroll actions to attempt. Engine uses these before defaults. */
  preferredActions?: Array<"boost_novelty_pressure" | "select_next_split" | "select_next_archetype" | "rerank_visible_slots" | "boost_hero_penalties">;
  /** Maximum reroll attempts. Default uses engine default. */
  maxAttempts?: number;
  /**
   * If variance audit score is already above this threshold, skip reroll.
   * Default uses engine thresholds.
   */
  stopIfVarianceAbove?: number;
}

export interface PerceivedRepetitionFlag {
  /** What kind of repetition was perceived. */
  type: string;
  /** How significant is this repetition. */
  severity: RepetitionSeverity;
  /** Human-readable description for audit log. */
  description: string;
  /** Day indices where repetition is perceived. Omit = program-wide. */
  targetDayIndices?: number[];
}

export interface PreserveInstructions {
  /** Keep the current block identity (archetype). */
  keepBlockIdentity?: boolean;
  /** Keep the current split structure (upper/lower, full-body, etc.). */
  keepSplitArchitecture?: boolean;
  /** Keep all upper-body days unchanged. */
  keepUpperDays?: boolean;
  /** Keep all lower-body days unchanged. */
  keepLowerDays?: boolean;
  /** Specific exercise names to keep in place. */
  keepSpecificExercises?: string[];
  /** Specific family IDs to maintain exposure for. */
  keepSpecificFamilies?: string[];
}

// ─── Primary Directive Interface ──────────────────────────────────────────────

/**
 * AgentControlDirectives — the single agent-facing control surface.
 *
 * All fields are optional and additive. Providing no directives leaves
 * engine behavior exactly as before — no existing callers break.
 *
 * Directives flow: Language System → Response Policy → Agent Control Resolver
 *   → AgentControlDirectives → ProgramContextProfile → all downstream ranking.
 */
export interface AgentControlDirectives {
  /**
   * High-level generation mode.
   * Translated into specific numeric pressure adjustments by the resolver.
   */
  generationMode?: GenerationMode;

  /**
   * Override for visible spine patterns — which day structures the user sees.
   * Controls slot planning / top visible slot reranking.
   */
  visibleSpineOverride?: VisibleSpineOverride;

  /**
   * Suppress specific exercises or families from being selected.
   * Applied as score penalties, not hard deletions (unless strength ≥ 1.0).
   */
  suppressExercises?: SuppressExercises;

  /**
   * Strongly steer exercise family exposure distribution.
   * Layered on top of existing block/phase bias logic.
   */
  forceFamilyDistribution?: ForceFamilyDistribution;

  /**
   * Per-day identity overrides.
   * Modifies slot intent, family biases, neural/fatigue/velocity targets per day.
   */
  dayIdentityOverrides?: DayIdentityOverride[];

  /**
   * Explicit novelty pressure override.
   * Bypasses similarity-computed novelty pressure when agent needs stronger control.
   */
  noveltyOverride?: NoveltyOverride;

  /**
   * Override the reroll strategy when agent knows the issue is visible sameness,
   * not just structural similarity.
   */
  rerollStrategyOverride?: RerollStrategyOverride;

  /**
   * Agent-perceived repetition signals.
   * Routes into stronger hero penalties + visible-slot reranking.
   */
  perceivedRepetitionFlags?: PerceivedRepetitionFlag[];

  /**
   * Things the agent must preserve across the generation.
   * Constrains what the engine is allowed to change.
   */
  preserveInstructions?: PreserveInstructions;

  /**
   * Short human-readable tag for audit logs, identifying what triggered this directive.
   * e.g. "user:same_vibe_less_grindy", "user:more_pop", "user:keep_upper_change_lower"
   */
  explanationTag?: string;
}

// ─── Resolved Controls ────────────────────────────────────────────────────────

/**
 * ResolvedAgentControls — the normalized form consumed by downstream systems.
 *
 * The resolver converts AgentControlDirectives into explicit numeric values
 * and structured lookups so ranking functions never interpret directives directly.
 */
export interface ResolvedAgentControls {
  /** Resolved generation mode (always defined after resolution). */
  resolvedGenerationMode: GenerationMode;

  /**
   * Resolved novelty pressure (0.0–1.0).
   * May come from noveltyOverride, generationMode, or similarity computation.
   */
  resolvedNoveltyPressure: number;

  /**
   * Per-exercise suppression penalties. Key = exercise name, value = penalty (0–10).
   * Applied as heroSuppressionPenalty in scoreCandidate.
   */
  resolvedHeroSuppressionPenalties: Record<string, number>;

  /**
   * Per-family control adjustments. Key = family ID.
   * Positive = boost, negative = reduction, -10 = effective ban.
   */
  resolvedFamilyBiasOverrides: Record<string, number>;

  /**
   * Families that are hard-banned by directive. Heavy penalty applied.
   */
  resolvedBannedFamilies: string[];

  /**
   * Resolved day identity targets, keyed by dayIndex.
   */
  resolvedDayIdentityTargets: Record<number, DayIdentityOverride>;

  /**
   * Resolved visible spine override rules (ready for slot planning).
   */
  resolvedVisibleSpineRules: {
    enabled: boolean;
    avoidPatterns: VisibleSpinePatternId[];
    prioritizePatterns: VisibleSpinePatternId[];
    targetDayIndices: number[];
    strength: number;
  };

  /**
   * Resolved reroll strategy (ready for reroll coordination).
   */
  resolvedRerollStrategy: {
    preferredActions: string[];
    maxAttempts: number;
    stopIfVarianceAbove: number | null;
  };

  /**
   * Whether any significant perceived repetition flags are active.
   */
  hasPerceivedRepetition: boolean;

  /**
   * Severity of perceived repetition. null if no flags.
   */
  perceivedRepetitionSeverity: RepetitionSeverity | null;

  /**
   * Things the engine must not change — preserved from preserve instructions.
   */
  preserveConstraints: {
    blockIdentity: boolean;
    splitArchitecture: boolean;
    upperDays: boolean;
    lowerDays: boolean;
    specificExercises: string[];
    specificFamilies: string[];
  };

  /**
   * The raw directives this was resolved from (for audit logging).
   */
  sourceDirectives: AgentControlDirectives;
}
