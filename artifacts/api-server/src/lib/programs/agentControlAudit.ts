/**
 * Agent Control Audit — DEV-only logging for the Agent Control Tools layer.
 *
 * Emits structured audit logs whenever agent controls are present during generation.
 * All logs are suppressed in production. Grep-friendly compact lines included.
 *
 * Log markers:
 *   [AgentControlAudit]        — main per-generation control summary
 *   [AgentControlAuditWarning] — suppression/override conflicts or failures
 */

import type { AgentControlDirectives, ResolvedAgentControls } from "./agentControlTypes";

const DEV = process.env.NODE_ENV !== "production";

// ─── Main Audit Log ───────────────────────────────────────────────────────────

export interface AgentControlAuditPayload {
  generationId: string;
  triggerReason?: string;
  rawDirectives: AgentControlDirectives;
  resolvedControls: ResolvedAgentControls;
  layersConsumed: string[];
  penaltiesApplied: Array<{ target: string; penalty: number; reason: string }>;
  boostsApplied: Array<{ target: string; boost: number; reason: string }>;
  rerollOverrideActive: boolean;
  perceivedRepetitionActive: boolean;
  visibleSpineSummary?: string;
  heroExerciseSummary?: string;
  finalVarianceImproved?: boolean;
}

export function emitAgentControlAudit(payload: AgentControlAuditPayload): void {
  if (!DEV) return;

  const {
    generationId, triggerReason, resolvedControls,
    layersConsumed, penaltiesApplied, boostsApplied,
    rerollOverrideActive, perceivedRepetitionActive,
    visibleSpineSummary, heroExerciseSummary, finalVarianceImproved,
  } = payload;

  const mode = resolvedControls.resolvedGenerationMode;
  const heroSuppressionCount = Object.keys(resolvedControls.resolvedHeroSuppressionPenalties).length;
  const familyBoostCount = Object.values(resolvedControls.resolvedFamilyBiasOverrides).filter((v) => v > 0).length;
  const familyReductionCount = Object.values(resolvedControls.resolvedFamilyBiasOverrides).filter((v) => v < 0).length;
  const bannedFamilyCount = resolvedControls.resolvedBannedFamilies.length;

  // Compact grep-friendly line
  console.log(
    `[AgentControlAudit] generation=${generationId} mode=${mode}` +
    ` heroSuppression=${heroSuppressionCount}` +
    ` familyBoosts=${familyBoostCount} familyReductions=${familyReductionCount} familyBans=${bannedFamilyCount}` +
    ` noveltyPressure=${resolvedControls.resolvedNoveltyPressure.toFixed(2)}` +
    ` visibleSpineOverride=${resolvedControls.resolvedVisibleSpineRules.enabled}` +
    ` rerollOverride=${rerollOverrideActive}` +
    ` perceivedRepetition=${perceivedRepetitionActive}` +
    (triggerReason ? ` trigger=${triggerReason}` : "") +
    (finalVarianceImproved !== undefined ? ` varianceImproved=${finalVarianceImproved}` : "")
  );

  // Detailed payload
  console.log("[AgentControlAudit:Detail]", JSON.stringify({
    generationId,
    triggerReason: triggerReason ?? null,
    mode,
    resolvedNoveltyPressure: resolvedControls.resolvedNoveltyPressure,
    heroSuppressionPenalties: resolvedControls.resolvedHeroSuppressionPenalties,
    familyBiasOverrides: resolvedControls.resolvedFamilyBiasOverrides,
    bannedFamilies: resolvedControls.resolvedBannedFamilies,
    dayIdentityTargetCount: Object.keys(resolvedControls.resolvedDayIdentityTargets).length,
    visibleSpineRules: resolvedControls.resolvedVisibleSpineRules,
    rerollStrategy: resolvedControls.resolvedRerollStrategy,
    perceivedRepetitionSeverity: resolvedControls.perceivedRepetitionSeverity,
    preserveConstraints: resolvedControls.preserveConstraints,
    layersConsumed,
    penaltiesApplied,
    boostsApplied,
    visibleSpineSummary: visibleSpineSummary ?? null,
    heroExerciseSummary: heroExerciseSummary ?? null,
    explanationTag: resolvedControls.sourceDirectives.explanationTag ?? null,
  }));
}

// ─── Warning Logs ─────────────────────────────────────────────────────────────

export function emitAgentControlWarning(
  generationId: string,
  warningType:
    | "suppression_target_not_found"
    | "visible_spine_override_blocked_by_constraints"
    | "day_identity_override_safety_conflict"
    | "high_variance_visible_spine_unchanged"
    | "explore_mode_variance_still_low"
    | "family_ban_blocked_by_required_slot"
    | "reroll_override_exceeded_max_attempts",
  detail: string,
): void {
  if (!DEV) return;

  console.warn(
    `[AgentControlAuditWarning] generation=${generationId} type=${warningType} detail="${detail}"`
  );
}

// ─── Layer Consumption Tracking ───────────────────────────────────────────────

/**
 * Helper: build the layers-consumed list from which parts of the
 * resolved controls were actually used during this generation pass.
 */
export function buildLayersConsumedList(resolvedControls: ResolvedAgentControls): string[] {
  const layers: string[] = [];

  if (resolvedControls.resolvedGenerationMode !== "default") {
    layers.push(`generation_mode:${resolvedControls.resolvedGenerationMode}`);
  }
  if (Object.keys(resolvedControls.resolvedHeroSuppressionPenalties).length > 0) {
    layers.push("hero_suppression");
  }
  if (Object.keys(resolvedControls.resolvedFamilyBiasOverrides).length > 0) {
    layers.push("family_bias_overrides");
  }
  if (resolvedControls.resolvedBannedFamilies.length > 0) {
    layers.push("family_bans");
  }
  if (Object.keys(resolvedControls.resolvedDayIdentityTargets).length > 0) {
    layers.push("day_identity_overrides");
  }
  if (resolvedControls.resolvedVisibleSpineRules.enabled) {
    layers.push("visible_spine_override");
  }
  if (resolvedControls.resolvedRerollStrategy.preferredActions.length > 0) {
    layers.push("reroll_strategy_override");
  }
  if (resolvedControls.hasPerceivedRepetition) {
    layers.push(`perceived_repetition:${resolvedControls.perceivedRepetitionSeverity}`);
  }
  if (
    resolvedControls.preserveConstraints.blockIdentity ||
    resolvedControls.preserveConstraints.splitArchitecture ||
    resolvedControls.preserveConstraints.upperDays ||
    resolvedControls.preserveConstraints.lowerDays ||
    resolvedControls.preserveConstraints.specificExercises.length > 0
  ) {
    layers.push("preserve_constraints");
  }

  return layers;
}
