// ─── Theme Coherence Validator ────────────────────────────────────────────────
//
// Post-selection audit layer that validates the coherence between:
//   1. Session adaptation fingerprint (the declared theme)
//   2. The exercises actually selected for the session
//
// This module serves two purposes:
//
//   A) Pre-selection scoring guidance
//      computeCoherenceFit() is called inside scoreCandidate() to produce the
//      themeCoherenceFit and compositionConstraintPenalty breakdown dimensions.
//
//   B) Post-selection validation audit
//      runCoherenceAudit() is called after slot selection is complete to log
//      the session coherence score, flag low-coherence sessions, and identify
//      which exercises remapped the session away from its declared theme.
//
// ─── Theme Enforcement Rules ─────────────────────────────────────────────────
//
// For resilience-focused sessions (hamstring/adductor/injury_prevention):
//   • At least one primary exercise must score ≥ 0.7 on the resilience dimensions
//   • Generic bilateral lifts (Rack Pull, Trap Bar DL, Farmers Carry) receive
//     a composition constraint penalty when they are not the session's best fit
//   • Power/elastic exercises receive a soft cap penalty in resilience sessions
//
// Coherence threshold:
//   • ≥ 0.55 → acceptable coherence (no penalty)
//   • 0.35–0.55 → moderate incoherence (logged, small steering penalty)
//   • < 0.35 → low coherence (strong steering penalty + audit flag)
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionAdaptationFingerprint } from "./sessionAdaptationFingerprint";
import { isResilienceFocused } from "./sessionAdaptationFingerprint";
import {
  getExerciseThemeProfile,
  computeExerciseCoherence,
  isGenericCompoundLift,
} from "./exerciseThemeProfiles";

// ─── Pre-selection scoring ─────────────────────────────────────────────────────

export interface CoherenceScoringResult {
  themeCoherenceFit: number;        // −1 to +3: primary coherence dimension
  compositionConstraintPenalty: number; // 0 to −2.5: composition rule violations
}

/**
 * Compute the per-exercise coherence scoring signals for use in scoreCandidate().
 *
 * @param exerciseName - The candidate exercise name
 * @param exerciseFamily - The exercise's family (from getExerciseExtendedMeta)
 * @param fingerprint - The session adaptation fingerprint (parsed once per build)
 * @param slotName - The slot name, used for slot-level coherence weighting
 * @param exerciseIntentTags - The exercise's intentTags from ExerciseMeta
 */
export function computeCoherenceFit(
  exerciseName: string,
  exerciseFamily: string,
  fingerprint: SessionAdaptationFingerprint,
  slotName: string,
  exerciseIntentTags: string[],
): CoherenceScoringResult {
  const profile = getExerciseThemeProfile(exerciseName, exerciseFamily);
  const rawCoherence = computeExerciseCoherence(profile, fingerprint);

  // ── Slot-level coherence weight ────────────────────────────────────────────
  // Not all slots are equally relevant to every theme.
  // Hinge/unilateral slots are most theme-relevant for resilience sessions.
  // Power/elastic slots carry reduced coherence weighting for resilience themes.
  const isResilienceTheme = isResilienceFocused(fingerprint);
  const isPowerSlot = slotName.includes("power") || slotName.includes("elastic");
  const isHingeOrUnilateralSlot =
    slotName.includes("hinge") ||
    slotName.includes("unilateral") ||
    slotName.includes("positional");

  // Boost coherence signal for slots that directly express the theme
  let slotWeight = 1.0;
  if (isResilienceTheme && isHingeOrUnilateralSlot) slotWeight = 1.4;
  if (isResilienceTheme && isPowerSlot) slotWeight = 0.6;

  const weightedCoherence = Math.min(1, rawCoherence * slotWeight);

  // ── themeCoherenceFit: primary steering dimension (−1 to +3) ──────────────
  // High coherence exercises get a meaningful boost (up to +3).
  // Low coherence exercises in high-stake slots get a moderate penalty.
  let themeCoherenceFit = 0;

  if (weightedCoherence >= 0.70) {
    // Strong coherence: up to +3 (equivalent to a strong sportFit signal)
    themeCoherenceFit = 1.0 + (weightedCoherence - 0.70) * (2.0 / 0.30); // 1.0 → 3.0
  } else if (weightedCoherence >= 0.45) {
    // Moderate coherence: +0.5 to +1.5
    themeCoherenceFit = 0.5 + (weightedCoherence - 0.45) * (0.5 / 0.25); // 0.5 → 1.0
  } else if (weightedCoherence >= 0.20) {
    // Weak coherence: flat tiebreaker +0.5
    themeCoherenceFit = 0.5 * (weightedCoherence / 0.20);
  } else if (isResilienceTheme && isHingeOrUnilateralSlot && weightedCoherence < 0.15) {
    // Very low coherence in a theme-critical slot: soft penalty
    themeCoherenceFit = -0.5;
  }

  themeCoherenceFit = Math.max(-1, Math.min(3, themeCoherenceFit));

  // ── compositionConstraintPenalty: theme enforcement rules (0 to −2.5) ──────
  //
  // Resilience sessions: generic compound lifts should not dominate.
  // Power sessions: slow-grind eccentrics should not dominate.
  // These are composition-level rules — not coaching quality violations.
  let compositionConstraintPenalty = 0;

  if (isResilienceTheme) {
    // Rule 1: Generic bilateral compounds are mismatched for resilience sessions
    if (isGenericCompoundLift(exerciseName)) {
      compositionConstraintPenalty += 1.5;
    }

    // Rule 2: Power/elastic exercises are mismatched for resilience sessions
    // (they have a role as primers, but should not dominate the selection pool)
    const isPowerExercise =
      exerciseIntentTags.includes("power") ||
      exerciseIntentTags.includes("elastic") ||
      exerciseIntentTags.includes("speed");
    const hasResilienceContrib =
      (profile.hamstring_resilience ?? 0) > 0.3 ||
      (profile.adductor_resilience ?? 0) > 0.3 ||
      (profile.injury_prevention ?? 0) > 0.3;

    if (isPowerExercise && !hasResilienceContrib && isPowerSlot) {
      // Soft cap only — power primers are still valid in resilience sessions
      compositionConstraintPenalty += 0.75;
    }

    // Rule 3: If this slot is theme-critical AND the exercise contributes nothing
    // to the main resilience dimensions, apply a mild steering penalty
    if (isHingeOrUnilateralSlot && rawCoherence < 0.20) {
      compositionConstraintPenalty += 1.0;
    }
  }

  compositionConstraintPenalty = Math.min(2.5, compositionConstraintPenalty);

  return { themeCoherenceFit, compositionConstraintPenalty };
}

// ─── Post-selection Coherence Audit ───────────────────────────────────────────

export interface ExerciseCoherenceEntry {
  name: string;
  slot: string;
  coherenceScore: number;
  primaryContributions: string[];
  themeGap: number; // fingerprint weight not covered by this exercise
}

export interface CoherenceAuditResult {
  sessionCoherenceScore: number;   // 0–1: overall session coherence
  coherenceGrade: "excellent" | "good" | "acceptable" | "low" | "mismatched";
  dominantTheme: string;
  topContributors: ExerciseCoherenceEntry[];
  lowCoherenceExercises: ExerciseCoherenceEntry[];
  compositionViolations: string[];
  remapSuggestions: string[];
  passed: boolean;
}

const COHERENCE_GRADE_THRESHOLDS = {
  excellent: 0.70,
  good: 0.55,
  acceptable: 0.40,
  low: 0.25,
};

/**
 * Run the post-selection coherence audit for a complete session's exercise set.
 *
 * Called after slot selection to validate that the selected exercises actually
 * express the declared session theme. Logged in non-production environments.
 *
 * @param selectedExercises - Map of slotName → exerciseName for the session
 * @param fingerprint - The session adaptation fingerprint
 * @param sessionIdentity - Human-readable session identity string for logs
 * @param exerciseFamilyMap - Optional map of exerciseName → family for profile lookups
 */
export function runCoherenceAudit(
  selectedExercises: Record<string, string>,
  fingerprint: SessionAdaptationFingerprint,
  sessionIdentity: string,
  exerciseFamilyMap?: Record<string, string>,
): CoherenceAuditResult {
  const entries: ExerciseCoherenceEntry[] = [];

  // Score each selected exercise against the fingerprint
  for (const [slot, exerciseName] of Object.entries(selectedExercises)) {
    if (!exerciseName || slot.startsWith("_") || slot === "block_template_index") continue;

    const family = exerciseFamilyMap?.[exerciseName];
    const profile = getExerciseThemeProfile(exerciseName, family);
    const coherenceScore = computeExerciseCoherence(profile, fingerprint);

    // Find which fingerprint dimensions this exercise covers well
    const primaryContributions: string[] = [];
    for (const [dim, fpWeight] of Object.entries(fingerprint)) {
      const exContrib = (profile as Record<string, number>)[dim] ?? 0;
      if (exContrib >= 0.5 && (fpWeight as number) >= 0.10) {
        primaryContributions.push(`${dim}(${Math.round(exContrib * 100)}%)`);
      }
    }

    // Measure how much of the fingerprint weight is "uncovered" by this exercise
    let uncoveredWeight = 0;
    for (const [dim, fpWeight] of Object.entries(fingerprint)) {
      const exContrib = (profile as Record<string, number>)[dim] ?? 0;
      if (exContrib < 0.30) uncoveredWeight += fpWeight as number;
    }

    entries.push({
      name: exerciseName,
      slot,
      coherenceScore,
      primaryContributions,
      themeGap: Math.round(uncoveredWeight * 100) / 100,
    });
  }

  // Session coherence = average of per-exercise scores, slot-weighted
  const SLOT_WEIGHTS: Record<string, number> = {
    bilateral_hinge_strength: 2.0,
    unilateral_lower: 1.8,
    unilateral_lower_alt: 1.5,
    bilateral_squat_strength: 1.5,
    positional_support: 1.4,
    bilateral_squat_strength_d2: 1.3,
    lower_power: 0.8,
    elastic_power: 0.7,
    conditioning_finisher: 0.6,
    upper_push_primary: 0.8,
    upper_pull_primary: 0.8,
    trunk_anti_rotation: 1.0,
    trunk_anti_extension: 0.8,
  };

  let weightedScore = 0;
  let totalSlotWeight = 0;

  for (const entry of entries) {
    const slotWeight = SLOT_WEIGHTS[entry.slot] ?? 1.0;
    weightedScore += entry.coherenceScore * slotWeight;
    totalSlotWeight += slotWeight;
  }

  const sessionCoherenceScore = totalSlotWeight > 0
    ? Math.min(1, weightedScore / totalSlotWeight)
    : 0;

  // Grade the session
  let coherenceGrade: CoherenceAuditResult["coherenceGrade"];
  if (sessionCoherenceScore >= COHERENCE_GRADE_THRESHOLDS.excellent) {
    coherenceGrade = "excellent";
  } else if (sessionCoherenceScore >= COHERENCE_GRADE_THRESHOLDS.good) {
    coherenceGrade = "good";
  } else if (sessionCoherenceScore >= COHERENCE_GRADE_THRESHOLDS.acceptable) {
    coherenceGrade = "acceptable";
  } else if (sessionCoherenceScore >= COHERENCE_GRADE_THRESHOLDS.low) {
    coherenceGrade = "low";
  } else {
    coherenceGrade = "mismatched";
  }

  const topContributors = [...entries]
    .sort((a, b) => b.coherenceScore - a.coherenceScore)
    .slice(0, 4);

  const lowCoherenceExercises = entries.filter(e => e.coherenceScore < 0.25);

  // Identify composition violations
  const compositionViolations: string[] = [];
  const isResilience = isResilienceFocused(fingerprint);

  if (isResilience) {
    const genericCompounds = entries.filter(e => isGenericCompoundLift(e.name));
    if (genericCompounds.length >= 2) {
      compositionViolations.push(
        `GENERIC_COMPOUND_DOMINANCE: ${genericCompounds.map(e => e.name).join(", ")} — ` +
        `resilience sessions should not be dominated by generic bilateral lifts`
      );
    }
    const hasPrimaryResilienceExercise = entries.some(e => e.coherenceScore >= 0.65);
    if (!hasPrimaryResilienceExercise) {
      compositionViolations.push(
        `NO_PRIMARY_THEME_EXERCISE: No exercise scored ≥0.65 coherence — ` +
        `resilience sessions require at least one strong theme anchor`
      );
    }
  }

  // Remap suggestions for low-coherence exercises
  const remapSuggestions: string[] = [];
  for (const low of lowCoherenceExercises) {
    const dominantDim = Object.entries(fingerprint)
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];
    if (dominantDim) {
      remapSuggestions.push(
        `REMAP ${low.name} (${low.slot}) → exercise with higher ${dominantDim} contribution`
      );
    }
  }

  const dominantTheme = Object.entries(fingerprint)
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ?? "none";

  return {
    sessionCoherenceScore: Math.round(sessionCoherenceScore * 100) / 100,
    coherenceGrade,
    dominantTheme,
    topContributors,
    lowCoherenceExercises,
    compositionViolations,
    remapSuggestions,
    passed: coherenceGrade !== "mismatched",
  };
}

/**
 * Emit the coherence audit to the server log in dev/staging.
 * Called once per program build after all 4 weeks are selected.
 */
export function emitCoherenceAuditLog(
  audit: CoherenceAuditResult,
  sessionIdentity: string,
  weekNumber: number,
): void {
  if (process.env.NODE_ENV === "production") return;

  console.log("[ThemeCoherenceAudit]", JSON.stringify({
    sessionIdentity,
    weekNumber,
    coherenceScore: audit.sessionCoherenceScore,
    grade: audit.coherenceGrade,
    dominantTheme: audit.dominantTheme,
    passed: audit.passed,
    topContributors: audit.topContributors.map(e => ({
      name: e.name,
      slot: e.slot,
      score: Math.round(e.coherenceScore * 100) / 100,
      covers: e.primaryContributions,
    })),
    lowCoherence: audit.lowCoherenceExercises.map(e => ({
      name: e.name,
      slot: e.slot,
      score: Math.round(e.coherenceScore * 100) / 100,
    })),
    compositionViolations: audit.compositionViolations,
    remapSuggestions: audit.remapSuggestions,
  }));
}
