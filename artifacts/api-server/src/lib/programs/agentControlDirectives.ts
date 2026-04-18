/**
 * Agent Control Directives — Builder functions for constructing AgentControlDirectives
 * from language system and response policy signals.
 *
 * This module translates recognized language patterns into typed directives.
 * It is the bridge between the language/policy layer and the control resolver.
 *
 * Callers: response-policy-engine.ts (and optionally ai.ts for direct overrides).
 *
 * Pattern: Each recognized user intent has a dedicated builder that returns
 * a partial AgentControlDirectives object. These are merged before passing
 * to the resolver.
 */

import type { AgentControlDirectives, GenerationMode } from "./agentControlTypes";

// ─── Directive Merging ────────────────────────────────────────────────────────

/**
 * Merge multiple partial directive objects into one.
 * Later entries override earlier ones for scalar fields;
 * arrays are concatenated; Records are merged with later wins.
 */
export function mergeDirectives(
  ...partials: Array<Partial<AgentControlDirectives>>
): AgentControlDirectives {
  const result: AgentControlDirectives = {};

  for (const partial of partials) {
    if (!partial) continue;

    if (partial.generationMode !== undefined) {
      result.generationMode = partial.generationMode;
    }

    if (partial.visibleSpineOverride !== undefined) {
      result.visibleSpineOverride = {
        ...result.visibleSpineOverride,
        ...partial.visibleSpineOverride,
      };
    }

    if (partial.suppressExercises !== undefined) {
      result.suppressExercises = {
        exerciseIds: [
          ...(result.suppressExercises?.exerciseIds ?? []),
          ...(partial.suppressExercises?.exerciseIds ?? []),
        ],
        familyIds: [
          ...(result.suppressExercises?.familyIds ?? []),
          ...(partial.suppressExercises?.familyIds ?? []),
        ],
        targetDayIndices: [
          ...(result.suppressExercises?.targetDayIndices ?? []),
          ...(partial.suppressExercises?.targetDayIndices ?? []),
        ],
        targetSlots: [
          ...(result.suppressExercises?.targetSlots ?? []),
          ...(partial.suppressExercises?.targetSlots ?? []),
        ],
        reason: partial.suppressExercises?.reason ?? result.suppressExercises?.reason,
        strength: partial.suppressExercises?.strength ?? result.suppressExercises?.strength,
        duration: partial.suppressExercises?.duration ?? result.suppressExercises?.duration,
      };
    }

    if (partial.forceFamilyDistribution !== undefined) {
      result.forceFamilyDistribution = {
        boosts: { ...(result.forceFamilyDistribution?.boosts ?? {}), ...(partial.forceFamilyDistribution?.boosts ?? {}) },
        reductions: { ...(result.forceFamilyDistribution?.reductions ?? {}), ...(partial.forceFamilyDistribution?.reductions ?? {}) },
        bans: [...(result.forceFamilyDistribution?.bans ?? []), ...(partial.forceFamilyDistribution?.bans ?? [])],
        targetDayIndices: [
          ...(result.forceFamilyDistribution?.targetDayIndices ?? []),
          ...(partial.forceFamilyDistribution?.targetDayIndices ?? []),
        ],
        reason: partial.forceFamilyDistribution?.reason ?? result.forceFamilyDistribution?.reason,
      };
    }

    if (partial.dayIdentityOverrides !== undefined) {
      const existing = result.dayIdentityOverrides ?? [];
      const incoming = partial.dayIdentityOverrides;
      // Merge by dayIndex: incoming overrides existing for same index
      const map = new Map(existing.map((d) => [d.dayIndex, d]));
      for (const override of incoming) {
        map.set(override.dayIndex, { ...(map.get(override.dayIndex) ?? {}), ...override });
      }
      result.dayIdentityOverrides = [...map.values()];
    }

    if (partial.noveltyOverride !== undefined) {
      result.noveltyOverride = {
        ...result.noveltyOverride,
        ...partial.noveltyOverride,
      };
    }

    if (partial.rerollStrategyOverride !== undefined) {
      result.rerollStrategyOverride = {
        ...result.rerollStrategyOverride,
        ...partial.rerollStrategyOverride,
      };
    }

    if (partial.perceivedRepetitionFlags !== undefined) {
      result.perceivedRepetitionFlags = [
        ...(result.perceivedRepetitionFlags ?? []),
        ...partial.perceivedRepetitionFlags,
      ];
    }

    if (partial.preserveInstructions !== undefined) {
      result.preserveInstructions = {
        ...result.preserveInstructions,
        ...partial.preserveInstructions,
        keepSpecificExercises: [
          ...(result.preserveInstructions?.keepSpecificExercises ?? []),
          ...(partial.preserveInstructions?.keepSpecificExercises ?? []),
        ],
        keepSpecificFamilies: [
          ...(result.preserveInstructions?.keepSpecificFamilies ?? []),
          ...(partial.preserveInstructions?.keepSpecificFamilies ?? []),
        ],
      };
    }

    if (partial.explanationTag !== undefined) {
      result.explanationTag = partial.explanationTag;
    }
  }

  return result;
}

// ─── Language Pattern → Directive Builders ────────────────────────────────────

/**
 * "same vibe but less grindy" / "less grinding" / "less heavy"
 * → preserve block identity, reduce bilateral grinding, increase velocity intent
 */
export function buildLessGrindyDirectives(): Partial<AgentControlDirectives> {
  return {
    preserveInstructions: { keepBlockIdentity: true },
    forceFamilyDistribution: {
      reductions: {
        heavy_bilateral_squat: 1.5,
        heavy_bilateral_hinge: 1.5,
      },
      boosts: {
        elastic_reactive: 1.0,
        plyometric: 0.5,
        unilateral_squat: 0.5,
      },
      reason: "less_grindy: reduce bilateral grinding families",
    },
    visibleSpineOverride: {
      enabled: true,
      avoidPatterns: ["grindy_lower_stack", "bilateral_force_then_secondary_hinge"],
      prioritizePatterns: ["reactive_lower_stack", "unilateral_primary_lateral_rotational"],
      strength: 0.6,
    },
    explanationTag: "user:less_grindy",
  };
}

/**
 * "more pop" / "more explosive" / "more elastic" / "more reactive"
 * → increase elastic/reactive families, suppress slow grinding anchors, raise novelty
 */
export function buildMorePopDirectives(): Partial<AgentControlDirectives> {
  return {
    forceFamilyDistribution: {
      boosts: {
        elastic_reactive: 2.0,
        plyometric: 2.0,
        ballistic: 1.5,
        rotational: 1.0,
      },
      reductions: {
        heavy_bilateral_squat: 1.0,
        heavy_bilateral_hinge: 1.0,
      },
      reason: "more_pop: boost elastic/reactive/ballistic families",
    },
    suppressExercises: {
      familyIds: ["heavy_bilateral_squat", "heavy_bilateral_hinge"],
      strength: 0.4,
      reason: "more_pop: reduce grinding anchor visibility",
    },
    noveltyOverride: {
      enabled: false,
    },
    generationMode: "explore",
    visibleSpineOverride: {
      enabled: true,
      avoidPatterns: ["grindy_lower_stack"],
      prioritizePatterns: ["reactive_lower_stack", "elastic_primary_bilateral_support", "jump_squat_unilateral_trunk"],
      strength: 0.65,
    },
    explanationTag: "user:more_pop",
  };
}

/**
 * "I keep getting the same program" / "this is always the same" / "no variety"
 * → raise perceived repetition flag, use high_variance, trigger suppression
 */
export function buildSameProgramDirectives(): Partial<AgentControlDirectives> {
  return {
    generationMode: "high_variance",
    perceivedRepetitionFlags: [{
      type: "program_identity_repeat",
      severity: "high",
      description: "User reports consistently receiving the same program",
    }],
    noveltyOverride: {
      enabled: true,
      level: 0.85,
      target: "entire_program",
      reason: "user explicitly reported same program perception",
    },
    rerollStrategyOverride: {
      enabled: true,
      preferredActions: ["boost_hero_penalties", "rerank_visible_slots", "select_next_split"],
      maxAttempts: 4,
    },
    visibleSpineOverride: {
      enabled: true,
      avoidPatterns: [
        "jump_squat_hinge_unilateral_trunk",
        "grindy_lower_stack",
        "bilateral_force_then_secondary_hinge",
      ],
      strength: 0.85,
    },
    explanationTag: "user:same_program_reported",
  };
}

/**
 * "keep upper body, change lower days" / "upper is fine, fix lower"
 * → preserve upper days, apply day identity overrides to lower days
 */
export function buildKeepUpperChangeLower(
  lowerDayIndices: number[],
): Partial<AgentControlDirectives> {
  return {
    preserveInstructions: {
      keepUpperDays: true,
      keepSplitArchitecture: true,
    },
    dayIdentityOverrides: lowerDayIndices.map((dayIndex) => ({
      dayIndex,
      avoidPatterns: ["grindy_lower_stack", "bilateral_force_then_secondary_hinge"],
      preferredPatterns: ["reactive_lower_stack", "unilateral_primary_lateral_rotational"],
    })),
    noveltyOverride: {
      enabled: true,
      level: 0.6,
      target: "visible_slots",
      reason: "user requested lower day change only",
    },
    explanationTag: "user:keep_upper_change_lower",
  };
}

/**
 * "keep lower, change upper" / "upper needs work"
 * → preserve lower days, apply novelty pressure to upper days
 */
export function buildKeepLowerChangeUpper(
  upperDayIndices: number[],
): Partial<AgentControlDirectives> {
  return {
    preserveInstructions: {
      keepLowerDays: true,
      keepSplitArchitecture: true,
    },
    dayIdentityOverrides: upperDayIndices.map((dayIndex) => ({
      dayIndex,
      avoidPatterns: ["press_pull_trunk_finisher", "horizontal_push_pull_stack"],
      preferredPatterns: ["vertical_push_pull_stack", "rotational_upper_stack"],
    })),
    noveltyOverride: {
      enabled: true,
      level: 0.55,
      target: "visible_slots",
      reason: "user requested upper day change only",
    },
    explanationTag: "user:keep_lower_change_upper",
  };
}

/**
 * "less complex" / "simpler" / "easier to follow"
 * → conservative mode, reduce complexity, reduce high-neural-demand anchors
 */
export function buildLessComplexDirectives(): Partial<AgentControlDirectives> {
  return {
    generationMode: "conservative",
    suppressExercises: {
      familyIds: ["ballistic", "elastic_reactive"],
      strength: 0.3,
      reason: "less_complex: reduce high-complexity movement families",
    },
    dayIdentityOverrides: [0, 1, 2, 3, 4].map((dayIndex) => ({
      dayIndex,
      targetNeuralDemand: "moderate" as const,
      targetFatigue: "moderate" as const,
    })),
    explanationTag: "user:less_complex",
  };
}

/**
 * Generic perceived repetition signal from any source.
 * Use when audits detect sameness without explicit user utterance.
 */
export function buildRepetitionResponseDirectives(
  severity: "low" | "moderate" | "high",
  targetDayIndices?: number[],
): Partial<AgentControlDirectives> {
  const mode: GenerationMode =
    severity === "high" ? "high_variance" :
    severity === "moderate" ? "explore" :
    "default";

  return {
    generationMode: mode,
    perceivedRepetitionFlags: [{
      type: "auto_detected_visible_repeat",
      severity,
      description: `Auto-detected perceived repetition (severity: ${severity})`,
      targetDayIndices,
    }],
    rerollStrategyOverride: {
      enabled: severity !== "low",
      preferredActions: ["boost_hero_penalties", "rerank_visible_slots"],
      maxAttempts: severity === "high" ? 4 : 3,
    },
    explanationTag: `auto:perceived_repetition_${severity}`,
  };
}

/**
 * Suppress a specific set of exercises by name.
 * Used when the agent explicitly identifies overused heroes.
 */
export function buildHeroSuppressionDirectives(
  exerciseNames: string[],
  strength: number = 0.7,
  reason: string = "hero_suppression",
): Partial<AgentControlDirectives> {
  return {
    suppressExercises: {
      exerciseIds: exerciseNames,
      strength,
      reason,
      duration: "current_program",
    },
    explanationTag: `agent:hero_suppression`,
  };
}

/**
 * "more unilateral" / "more single-leg work"
 */
export function buildMoreUnilateralDirectives(): Partial<AgentControlDirectives> {
  return {
    forceFamilyDistribution: {
      boosts: {
        unilateral_squat: 2.0,
        unilateral_hinge: 1.5,
      },
      reductions: {
        heavy_bilateral_squat: 0.5,
      },
      reason: "more_unilateral: boost single-leg families",
    },
    visibleSpineOverride: {
      enabled: true,
      prioritizePatterns: ["unilateral_primary_lateral_rotational"],
      strength: 0.5,
    },
    explanationTag: "user:more_unilateral",
  };
}

/**
 * "more upper body" / "focus on upper"
 */
export function buildMoreUpperDirectives(): Partial<AgentControlDirectives> {
  return {
    forceFamilyDistribution: {
      boosts: {
        upper_horizontal_push: 1.0,
        upper_vertical_push: 1.0,
        upper_horizontal_pull: 1.0,
        upper_vertical_pull: 1.0,
      },
      reason: "more_upper: boost upper body families",
    },
    explanationTag: "user:more_upper",
  };
}

/**
 * "lower intensity" / "lower fatigue" / "back off a bit"
 * Distinct from deload — the user isn't requesting a full deload,
 * just a less fatiguing session shape.
 */
export function buildLowerIntensityDirectives(): Partial<AgentControlDirectives> {
  return {
    generationMode: "conservative",
    forceFamilyDistribution: {
      reductions: {
        heavy_bilateral_squat: 1.0,
        heavy_bilateral_hinge: 1.0,
        conditioning: 1.0,
      },
      boosts: {
        goblet_tempo_squat: 0.5,
        unilateral_squat: 0.5,
        positional: 0.5,
      },
      reason: "lower_intensity: reduce high-fatigue families",
    },
    dayIdentityOverrides: [0, 1, 2, 3, 4].map((dayIndex) => ({
      dayIndex,
      targetFatigue: "low" as const,
      targetNeuralDemand: "moderate" as const,
    })),
    explanationTag: "user:lower_intensity",
  };
}

// ─── Signal Detection ─────────────────────────────────────────────────────────

/**
 * Detect and build directives from a raw user utterance and style preferences.
 * This is the primary entry point called from the response policy engine.
 *
 * Returns null if no actionable control signals are found.
 */
export function detectAndBuildDirectives(
  sourceUtterance: string,
  stylePreferences: string[],
  preserveInstructions: Array<{ target: string }>,
): AgentControlDirectives | null {
  const lower = sourceUtterance.toLowerCase();
  const partials: Array<Partial<AgentControlDirectives>> = [];

  // ── More pop / elastic ────────────────────────────────────────────────────
  if (
    stylePreferences.includes("more_pop") ||
    /\b(more pop|more elastic|more reactive|more explosive|more springy|more bounce|more athletic|more speed)\b/i.test(lower)
  ) {
    partials.push(buildMorePopDirectives());
  }

  // ── Less grindy ───────────────────────────────────────────────────────────
  if (
    stylePreferences.includes("less_grindy") ||
    /\b(less grindy|less grinding|less heavy|less slow|less slog|lighter feel|not as grindy|without the grind)\b/i.test(lower)
  ) {
    partials.push(buildLessGrindyDirectives());
  }

  // ── Same program perception ───────────────────────────────────────────────
  if (
    /\b(keep getting the same|always the same|no variety|same program|same exercises|same every time|feels identical|never changes|same thing)\b/i.test(lower)
  ) {
    partials.push(buildSameProgramDirectives());
  }

  // ── More unilateral ───────────────────────────────────────────────────────
  if (
    /\b(more unilateral|more single.?leg|more lunges|more split squats|less bilateral)\b/i.test(lower)
  ) {
    partials.push(buildMoreUnilateralDirectives());
  }

  // ── Upper/lower preservation signals ─────────────────────────────────────
  const keepUpperChangeLower =
    /\b(keep (the )?upper|upper (is|looks) (fine|good|great|ok)|change (the )?lower|fix (the )?lower|lower needs|lower days? different)\b/i.test(lower) ||
    preserveInstructions.some((i) => i.target === "upper_body");

  if (keepUpperChangeLower) {
    partials.push(buildKeepUpperChangeLower([1, 2]));
  }

  const keepLowerChangeUpper =
    /\b(keep (the )?lower|lower (is|looks) (fine|good|great|ok)|change (the )?upper|fix (the )?upper|upper needs|upper days? different)\b/i.test(lower) ||
    preserveInstructions.some((i) => i.target === "lower_body");

  if (keepLowerChangeUpper) {
    partials.push(buildKeepLowerChangeUpper([0, 2]));
  }

  // ── Less complex ──────────────────────────────────────────────────────────
  if (
    /\b(less complex|simpler|easier to follow|less complicated|more basic|straightforward|not as technical)\b/i.test(lower)
  ) {
    partials.push(buildLessComplexDirectives());
  }

  // ── Lower intensity ───────────────────────────────────────────────────────
  if (
    /\b(lower intensity|back off a bit|less intense|dial (it )?back|less fatiguing|not as hard today|a bit easier)\b/i.test(lower) &&
    !/\b(deload|recovery week)\b/i.test(lower)
  ) {
    partials.push(buildLowerIntensityDirectives());
  }

  // ── More upper body ───────────────────────────────────────────────────────
  if (
    /\b(more upper|more pressing|more pulling|upper focus|focus (on )?upper)\b/i.test(lower)
  ) {
    partials.push(buildMoreUpperDirectives());
  }

  if (partials.length === 0) return null;

  const merged = mergeDirectives(...partials);
  return Object.keys(merged).length > 0 ? merged : null;
}
