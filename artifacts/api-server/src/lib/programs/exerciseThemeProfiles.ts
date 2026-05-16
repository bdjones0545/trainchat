// ─── Exercise Theme Contribution Profiles ────────────────────────────────────
//
// Maps every exercise name to its contribution scores across adaptation dimensions.
// Scores are on a 0–1 scale: 1.0 = this exercise IS this adaptation target,
// 0.0 = no contribution to that dimension.
//
// These profiles power the themeCoherenceFit scoring dimension in scoreCandidate():
//   coherence_score = Σ (fingerprint[dim] × profile[dim]) for all shared dimensions
//
// Design principles:
//   • Scores reflect WHAT THE EXERCISE ACTUALLY TRAINS at the tissue/quality level
//   • A Rack Pull has high bilateral_strength (0.9) but LOW hamstring_resilience (0.15)
//     because it removes the lengthened hamstring range of motion
//   • A Nordic Curl has high hamstring_resilience (0.95) but low bilateral_strength (0.1)
//   • Unknown exercises fall back to safe defaults based on their family
// ─────────────────────────────────────────────────────────────────────────────

import type { AdaptationDimension } from "./sessionAdaptationFingerprint";

export type ExerciseThemeProfile = Partial<Record<AdaptationDimension, number>>;

// ─── Profile Registry ─────────────────────────────────────────────────────────

const EXERCISE_THEME_PROFILES: Record<string, ExerciseThemeProfile> = {

  // ══════════════════════════════════════════════════════════════════════════
  // HEAVY BILATERAL SQUAT FAMILY
  // — strong quad_dominant + bilateral_strength, some hip_strength
  // ══════════════════════════════════════════════════════════════════════════

  "Back Squat":                          { quad_dominant: 0.80, bilateral_strength: 0.90, hip_strength: 0.45, posterior_chain_strength: 0.35 },
  "Front Squat":                         { quad_dominant: 0.90, bilateral_strength: 0.80, hip_strength: 0.35, trunk_stability: 0.40 },
  "Pause Back Squat":                    { quad_dominant: 0.80, bilateral_strength: 0.85, isometric_loading: 0.60, hip_strength: 0.40 },
  "Safety Bar Squat":                    { quad_dominant: 0.80, bilateral_strength: 0.80, trunk_stability: 0.35 },
  "Box Squat":                           { quad_dominant: 0.70, bilateral_strength: 0.75, isometric_loading: 0.50, hip_strength: 0.45 },
  "Low-Bar Back Squat":                  { bilateral_strength: 0.90, quad_dominant: 0.70, posterior_chain_strength: 0.45 },
  "Cambered Bar Squat":                  { quad_dominant: 0.75, bilateral_strength: 0.80, trunk_stability: 0.45 },
  "Heel-Elevated Back Squat":            { quad_dominant: 0.90, bilateral_strength: 0.70 },
  "Heel-Elevated Goblet Squat":          { quad_dominant: 0.80, bilateral_strength: 0.50, trunk_stability: 0.30 },
  "Goblet Squat (heavy)":                { quad_dominant: 0.75, bilateral_strength: 0.55, trunk_stability: 0.40 },
  "Trap Bar Deadlift (squat-mode, low handles)": { quad_dominant: 0.60, bilateral_strength: 0.85, hip_strength: 0.50, posterior_chain_strength: 0.40 },
  "Trap Bar Deadlift (low handles)":     { quad_dominant: 0.55, bilateral_strength: 0.85, hip_strength: 0.50, posterior_chain_strength: 0.45 },
  "Zercher Squat":                       { quad_dominant: 0.70, bilateral_strength: 0.75, trunk_stability: 0.55 },
  "Hack Squat (machine)":                { quad_dominant: 0.90, bilateral_strength: 0.65 },
  "Leg Press (as primary)":              { quad_dominant: 0.85, bilateral_strength: 0.55, glute_development: 0.30 },
  "Hatfield Squat":                      { quad_dominant: 0.80, bilateral_strength: 0.85, posterior_chain_strength: 0.35 },
  "Tempo Back Squat (3-1-1)":            { quad_dominant: 0.80, bilateral_strength: 0.80, eccentric_loading: 0.70, isometric_loading: 0.50 },
  "Belt Squat":                          { quad_dominant: 0.85, bilateral_strength: 0.70, injury_prevention: 0.35 },

  // ══════════════════════════════════════════════════════════════════════════
  // HEAVY BILATERAL HINGE FAMILY
  // — high bilateral_strength + posterior_chain_strength
  // KEY DISTINCTION: Hamstring contribution varies critically by ROM
  //   Full-ROM hinges (RDL, Conventional DL) = high hamstring_resilience
  //   Shortened hinges (Rack Pull) = very low hamstring_resilience
  // ══════════════════════════════════════════════════════════════════════════

  "Conventional Deadlift":               { bilateral_strength: 0.90, posterior_chain_strength: 0.80, hamstring_resilience: 0.50, hip_strength: 0.65, glute_development: 0.55 },
  "Sumo Deadlift":                       { bilateral_strength: 0.90, posterior_chain_strength: 0.70, hip_strength: 0.70, glute_development: 0.60, adductor_resilience: 0.40, hamstring_resilience: 0.35 },
  "Romanian Deadlift":                   { hamstring_resilience: 0.75, eccentric_loading: 0.65, posterior_chain_strength: 0.80, hip_strength: 0.60, glute_development: 0.55, bilateral_strength: 0.65 },
  "Romanian Deadlift (heavy)":           { hamstring_resilience: 0.80, eccentric_loading: 0.70, posterior_chain_strength: 0.85, hip_strength: 0.65, glute_development: 0.55, bilateral_strength: 0.70 },
  "Stiff-Leg Deadlift":                  { hamstring_resilience: 0.80, eccentric_loading: 0.75, posterior_chain_strength: 0.80, hip_strength: 0.55, bilateral_strength: 0.65 },
  "Snatch-Grip Deadlift":                { bilateral_strength: 0.85, posterior_chain_strength: 0.75, hamstring_resilience: 0.50, hip_strength: 0.55 },
  "Trap Bar Deadlift":                   { bilateral_strength: 0.90, posterior_chain_strength: 0.60, hip_strength: 0.50, quad_dominant: 0.40, hamstring_resilience: 0.25 },
  "Hex Bar Deadlift":                    { bilateral_strength: 0.90, posterior_chain_strength: 0.60, hip_strength: 0.50, quad_dominant: 0.40, hamstring_resilience: 0.25 },
  "Hex Bar RDL":                         { hamstring_resilience: 0.65, eccentric_loading: 0.55, posterior_chain_strength: 0.75, hip_strength: 0.55, bilateral_strength: 0.70 },
  "Rack Pull (from knee)":               { bilateral_strength: 0.90, posterior_chain_strength: 0.55, hip_strength: 0.50, hamstring_resilience: 0.15 },
  "Good Morning":                        { hamstring_resilience: 0.65, eccentric_loading: 0.60, posterior_chain_strength: 0.70, hip_strength: 0.50, bilateral_strength: 0.55 },
  "Dumbbell Romanian Deadlift":          { hamstring_resilience: 0.70, eccentric_loading: 0.60, posterior_chain_strength: 0.70, hip_strength: 0.55, bilateral_strength: 0.50 },
  "Kettlebell Deadlift":                 { posterior_chain_strength: 0.60, hip_strength: 0.55, bilateral_strength: 0.55, hamstring_resilience: 0.30 },
  "Hip Thrust (barbell)":                { glute_development: 0.95, hip_strength: 0.90, hamstring_resilience: 0.35, posterior_chain_strength: 0.55, bilateral_strength: 0.50 },

  // ══════════════════════════════════════════════════════════════════════════
  // UNILATERAL SQUAT FAMILY
  // ══════════════════════════════════════════════════════════════════════════

  "Bulgarian Split Squat":               { quad_dominant: 0.80, unilateral_balance: 0.85, bilateral_strength: 0.55, hip_strength: 0.45, glute_development: 0.55 },
  "Rear-Foot Elevated Split Squat (RFESS)": { quad_dominant: 0.80, unilateral_balance: 0.85, bilateral_strength: 0.55, hip_strength: 0.45, glute_development: 0.55 },
  "Elevated Split Squat (barbell)":      { quad_dominant: 0.80, unilateral_balance: 0.80, bilateral_strength: 0.60, hip_strength: 0.45 },
  "Lateral Step-Up":                     { quad_dominant: 0.55, unilateral_balance: 0.80, frontal_plane: 0.65, glute_development: 0.45 },
  "Single-Leg Squat to Box":             { quad_dominant: 0.75, unilateral_balance: 0.90, deceleration: 0.60, injury_prevention: 0.45 },
  "Reverse Lunge":                       { quad_dominant: 0.65, unilateral_balance: 0.80, hip_strength: 0.40, glute_development: 0.40 },
  "Deficit Reverse Lunge":               { quad_dominant: 0.70, unilateral_balance: 0.80, eccentric_loading: 0.50, hip_strength: 0.40 },
  "Walking Lunge (weighted)":            { quad_dominant: 0.65, unilateral_balance: 0.80, hip_strength: 0.40, glute_development: 0.40 },
  "Lateral Lunge":                       { frontal_plane: 0.80, adductor_resilience: 0.65, unilateral_balance: 0.75, quad_dominant: 0.45 },
  "Cossack Squat":                       { frontal_plane: 0.85, adductor_resilience: 0.75, unilateral_balance: 0.80, quad_dominant: 0.40 },
  "Step-Up with Knee Drive":             { quad_dominant: 0.60, unilateral_balance: 0.80, hip_strength: 0.45, glute_development: 0.35 },
  "Step-Up (front, loaded)":             { quad_dominant: 0.60, unilateral_balance: 0.80, hip_strength: 0.40 },
  "Heel-Elevated Goblet Split Squat":    { quad_dominant: 0.80, unilateral_balance: 0.75, bilateral_strength: 0.40 },

  // ══════════════════════════════════════════════════════════════════════════
  // UNILATERAL HINGE FAMILY
  // — this family expresses the clearest hamstring_resilience signal
  // ══════════════════════════════════════════════════════════════════════════

  "Single-Leg Romanian Deadlift":        { hamstring_resilience: 0.85, unilateral_balance: 0.90, hip_strength: 0.75, posterior_chain_strength: 0.65, eccentric_loading: 0.65, injury_prevention: 0.50 },
  "Single-Leg Hip Thrust":               { glute_development: 0.90, hip_strength: 0.85, unilateral_balance: 0.80, hamstring_resilience: 0.35, injury_prevention: 0.35 },
  "Single-Leg Deadlift (KB)":            { hamstring_resilience: 0.75, unilateral_balance: 0.90, hip_strength: 0.65, posterior_chain_strength: 0.55, eccentric_loading: 0.55 },
  "Kickstand RDL":                       { hamstring_resilience: 0.70, unilateral_balance: 0.75, hip_strength: 0.65, posterior_chain_strength: 0.60, eccentric_loading: 0.55 },
  "Single-Leg Good Morning":             { hamstring_resilience: 0.65, unilateral_balance: 0.80, posterior_chain_strength: 0.55, eccentric_loading: 0.55, trunk_stability: 0.40 },
  "Hip Hinge to Single-Leg RDL":         { hamstring_resilience: 0.65, unilateral_balance: 0.80, hip_strength: 0.55, posterior_chain_strength: 0.50 },
  "Nordics (Nordic Hamstring Curl)":     { hamstring_resilience: 0.95, eccentric_loading: 0.95, injury_prevention: 0.85, posterior_chain_strength: 0.55, isometric_loading: 0.40 },
  "Glute-Ham Raise":                     { hamstring_resilience: 0.90, eccentric_loading: 0.85, posterior_chain_strength: 0.70, injury_prevention: 0.70 },

  // ══════════════════════════════════════════════════════════════════════════
  // ELASTIC / REACTIVE / PLYOMETRIC
  // — high elastic_reactivity, some quad_dominant, low hamstring/injury
  // ══════════════════════════════════════════════════════════════════════════

  "Box Jump":                            { elastic_reactivity: 0.85, quad_dominant: 0.45, bilateral_strength: 0.20, deceleration: 0.40 },
  "Box Jump (step-down)":                { elastic_reactivity: 0.70, quad_dominant: 0.40, deceleration: 0.35, injury_prevention: 0.25 },
  "Broad Jump":                          { elastic_reactivity: 0.85, quad_dominant: 0.40, bilateral_strength: 0.20 },
  "Vertical Jump (countermovement)":     { elastic_reactivity: 0.85, quad_dominant: 0.40, bilateral_strength: 0.20 },
  "Depth Jump":                          { elastic_reactivity: 0.90, quad_dominant: 0.40, deceleration: 0.55, injury_prevention: 0.25 },
  "Trap Bar Jump (loaded)":              { elastic_reactivity: 0.70, bilateral_strength: 0.55, hip_strength: 0.40 },
  "Jump Squat (barbell, 30% 1RM)":       { elastic_reactivity: 0.75, bilateral_strength: 0.40, quad_dominant: 0.50 },
  "Banded Jump Squat":                   { elastic_reactivity: 0.75, quad_dominant: 0.45, bilateral_strength: 0.35 },
  "Hex Bar Jump (loaded)":               { elastic_reactivity: 0.70, bilateral_strength: 0.55, hip_strength: 0.40 },
  "Lateral Bound":                       { elastic_reactivity: 0.80, frontal_plane: 0.70, unilateral_balance: 0.60, deceleration: 0.45 },
  "Skater Bound":                        { elastic_reactivity: 0.80, frontal_plane: 0.75, unilateral_balance: 0.65, deceleration: 0.50 },
  "Lateral Box Jump":                    { elastic_reactivity: 0.80, frontal_plane: 0.65, deceleration: 0.50 },
  "Single-Leg Box Jump":                 { elastic_reactivity: 0.75, unilateral_balance: 0.80, deceleration: 0.65, injury_prevention: 0.40 },
  "Single-Leg Broad Jump":               { elastic_reactivity: 0.75, unilateral_balance: 0.80, deceleration: 0.55 },
  "Hurdle Hop":                          { elastic_reactivity: 0.85, bilateral_strength: 0.20 },
  "Pogo Jump":                           { elastic_reactivity: 0.75, injury_prevention: 0.30 },
  "Pogo Hops":                           { elastic_reactivity: 0.75, injury_prevention: 0.30 },
  "Ankle Hop (series)":                  { elastic_reactivity: 0.75, injury_prevention: 0.30 },
  "Ankle Stiffness Drill":               { elastic_reactivity: 0.65, injury_prevention: 0.45 },
  "Reactive Broad Jump (stick landing)": { elastic_reactivity: 0.80, deceleration: 0.65, unilateral_balance: 0.45 },
  "Reactive Lateral Bound (stop and go)":{ elastic_reactivity: 0.80, frontal_plane: 0.70, deceleration: 0.65 },
  "Reactive Box Jump (step off to jump)":{ elastic_reactivity: 0.85, deceleration: 0.55 },
  "Reactive Pogo to Bound (2 pogos then launch)": { elastic_reactivity: 0.85, bilateral_strength: 0.20 },
  "Triple Bound":                        { elastic_reactivity: 0.85, unilateral_balance: 0.55, deceleration: 0.50 },
  "Power Skip (for distance)":           { elastic_reactivity: 0.80, unilateral_balance: 0.55 },
  "Approach Jump to Box":                { elastic_reactivity: 0.80, deceleration: 0.50 },
  "Approach Broad Jump (3-step)":        { elastic_reactivity: 0.80, bilateral_strength: 0.20 },
  "Standing Long Jump":                  { elastic_reactivity: 0.80, bilateral_strength: 0.20 },
  "Countermovement Jump (max height)":   { elastic_reactivity: 0.85, quad_dominant: 0.40 },
  "Med-Ball Scoop Toss":                 { elastic_reactivity: 0.70, hip_strength: 0.55, rotational_power: 0.40 },

  // ══════════════════════════════════════════════════════════════════════════
  // CARRIES / LOADED LOCOMOTION
  // — trunk_stability dominant, low theme-specific signal
  // ══════════════════════════════════════════════════════════════════════════

  "Farmers Carry":                       { trunk_stability: 0.75, general_conditioning: 0.50, bilateral_strength: 0.30 },
  "Suitcase Carry":                      { trunk_stability: 0.80, frontal_plane: 0.60, general_conditioning: 0.45 },
  "Trap Bar Carry":                      { trunk_stability: 0.75, general_conditioning: 0.50, bilateral_strength: 0.35 },
  "Zercher Carry":                       { trunk_stability: 0.80, bilateral_strength: 0.35, general_conditioning: 0.40 },
  "Overhead Carry":                      { trunk_stability: 0.80, shoulder_health: 0.60, general_conditioning: 0.40 },

  // ══════════════════════════════════════════════════════════════════════════
  // TRUNK / CORE
  // ══════════════════════════════════════════════════════════════════════════

  "Pallof Press":                        { trunk_stability: 0.85, rotational_power: 0.55 },
  "Half-Kneeling Pallof Press":          { trunk_stability: 0.85, rotational_power: 0.55, unilateral_balance: 0.40 },
  "Ab Wheel Rollout":                    { trunk_stability: 0.85, eccentric_loading: 0.55 },
  "Dead Bug":                            { trunk_stability: 0.80, injury_prevention: 0.40 },
  "Copenhagen Plank":                    { adductor_resilience: 0.90, frontal_plane: 0.85, trunk_stability: 0.55, injury_prevention: 0.80 },
  "Copenhagen Adduction":                { adductor_resilience: 0.90, frontal_plane: 0.85, injury_prevention: 0.80, isometric_loading: 0.60 },
  "Landmine Rotation":                   { rotational_power: 0.85, trunk_stability: 0.70 },
  "Cable Chop":                          { rotational_power: 0.85, trunk_stability: 0.65 },
  "Med Ball Rotational Throw":           { rotational_power: 0.90, elastic_reactivity: 0.55, trunk_stability: 0.50 },
  "RKC Plank":                           { trunk_stability: 0.85, isometric_loading: 0.75 },

  // ══════════════════════════════════════════════════════════════════════════
  // UPPER PUSH
  // ══════════════════════════════════════════════════════════════════════════

  "Bench Press":                         { upper_push_strength: 0.90, bilateral_strength: 0.70 },
  "Overhead Press":                      { upper_push_strength: 0.90, bilateral_strength: 0.65, shoulder_health: 0.35 },
  "Dumbbell Bench Press":                { upper_push_strength: 0.85, bilateral_strength: 0.60, shoulder_health: 0.30 },
  "Incline Bench Press":                 { upper_push_strength: 0.85, bilateral_strength: 0.65 },
  "Push-Up (weighted)":                  { upper_push_strength: 0.75, trunk_stability: 0.35, shoulder_health: 0.30 },
  "Push Press":                          { upper_push_strength: 0.85, elastic_reactivity: 0.55, bilateral_strength: 0.65 },

  // ══════════════════════════════════════════════════════════════════════════
  // UPPER PULL
  // ══════════════════════════════════════════════════════════════════════════

  "Pull-Up (weighted)":                  { upper_pull_strength: 0.90, bilateral_strength: 0.65, shoulder_health: 0.35 },
  "Chin-Up":                             { upper_pull_strength: 0.85, bilateral_strength: 0.60 },
  "Barbell Row":                         { upper_pull_strength: 0.85, bilateral_strength: 0.65, posterior_chain_strength: 0.35 },
  "Cable Row":                           { upper_pull_strength: 0.80, bilateral_strength: 0.55, shoulder_health: 0.30 },
  "Dumbbell Row":                        { upper_pull_strength: 0.80, unilateral_balance: 0.40 },
  "Face Pull":                           { shoulder_health: 0.85, upper_pull_strength: 0.55, injury_prevention: 0.50 },
  "Band Pull-Apart":                     { shoulder_health: 0.80, injury_prevention: 0.50, upper_pull_strength: 0.35 },
};

// ─── Family Fallback Profiles ─────────────────────────────────────────────────
// When an exercise is not found in the registry, fall back to family-level defaults.

const FAMILY_FALLBACK_PROFILES: Record<string, ExerciseThemeProfile> = {
  heavy_bilateral_squat:  { quad_dominant: 0.75, bilateral_strength: 0.80, hip_strength: 0.40 },
  heavy_bilateral_hinge:  { posterior_chain_strength: 0.75, bilateral_strength: 0.80, hip_strength: 0.55, hamstring_resilience: 0.40 },
  unilateral_squat:       { quad_dominant: 0.65, unilateral_balance: 0.80, hip_strength: 0.40 },
  unilateral_hinge:       { hamstring_resilience: 0.75, unilateral_balance: 0.85, hip_strength: 0.65, eccentric_loading: 0.55 },
  elastic_reactive:       { elastic_reactivity: 0.80, quad_dominant: 0.30 },
  plyometric:             { elastic_reactivity: 0.80, quad_dominant: 0.35 },
  ballistic:              { elastic_reactivity: 0.75, bilateral_strength: 0.35 },
  carry:                  { trunk_stability: 0.75, general_conditioning: 0.45 },
  upper_push:             { upper_push_strength: 0.85, bilateral_strength: 0.60 },
  upper_pull:             { upper_pull_strength: 0.85, bilateral_strength: 0.55 },
  trunk:                  { trunk_stability: 0.85 },
  rotational:             { rotational_power: 0.85, trunk_stability: 0.60 },
  hip_dominant:           { glute_development: 0.80, hip_strength: 0.75, posterior_chain_strength: 0.55 },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns every canonical exercise name in the theme profile registry.
 * Used by the Session Description Integrity Validator to build its name-matching index.
 */
export function getKnownExerciseNames(): string[] {
  return Object.keys(EXERCISE_THEME_PROFILES);
}

/**
 * Returns the theme contribution profile for an exercise.
 * Falls back to family-level defaults when the exact name is not in the registry.
 */
export function getExerciseThemeProfile(
  exerciseName: string,
  exerciseFamily?: string,
): ExerciseThemeProfile {
  const direct = EXERCISE_THEME_PROFILES[exerciseName];
  if (direct) return direct;

  if (exerciseFamily) {
    const familyFallback = FAMILY_FALLBACK_PROFILES[exerciseFamily];
    if (familyFallback) return familyFallback;
  }

  return {};
}

/**
 * Compute a coherence score [0, 1] between an exercise profile and a fingerprint.
 *
 * Formula: weighted dot product of shared dimensions, normalized by fingerprint weight.
 * A score of 1.0 means the exercise perfectly expresses every dimension the session targets.
 * A score of 0.0 means the exercise contributes nothing to any targeted dimension.
 */
export function computeExerciseCoherence(
  profile: ExerciseThemeProfile,
  fingerprint: Partial<Record<string, number>>,
): number {
  let score = 0;
  let totalWeight = 0;

  for (const [dim, fpWeight] of Object.entries(fingerprint)) {
    totalWeight += fpWeight as number;
    const exContrib = (profile as Record<string, number>)[dim] ?? 0;
    score += (fpWeight as number) * exContrib;
  }

  if (totalWeight === 0) return 0;
  return Math.min(1, score / totalWeight);
}

/**
 * Returns true when an exercise is a "generic compound" that doesn't express
 * resilience or tissue-specific adaptation — used for composition constraint checks.
 *
 * Exercises in this category are valid training stimuli but should not DOMINATE
 * a session themed around resilience/injury-prevention.
 */
export function isGenericCompoundLift(exerciseName: string): boolean {
  const GENERIC_COMPOUNDS = new Set([
    "Rack Pull (from knee)",
    "Trap Bar Deadlift",
    "Hex Bar Deadlift",
    "Farmers Carry",
    "Trap Bar Carry",
    "Zercher Carry",
    "Jump Squat (barbell, 30% 1RM)",
    "Hex Bar Jump (loaded)",
    "Banded Jump Squat",
    "Sumo Deadlift",
    "Conventional Deadlift",
  ]);
  return GENERIC_COMPOUNDS.has(exerciseName);
}
