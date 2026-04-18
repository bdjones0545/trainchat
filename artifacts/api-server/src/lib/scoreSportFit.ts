/**
 * Sport Fit Scoring Engine
 *
 * Computes how well an exercise matches the physical demands of a sport.
 *
 * Inputs:
 *   - SportDemandProfile (from sport-profiles.ts)
 *   - ExerciseSportMetadata (movementQualities, jointDemands, etc.)
 *
 * Outputs:
 *   - total: number (0–100 normalized score)
 *   - breakdown: per-dimension contributions
 *   - explanation: human-readable strings for agent output
 *   - missingMetadata: flag if exercise tags are sparse (graceful degradation)
 *
 * Design principles:
 *   - Scoring is purely additive — no crashes on missing data
 *   - ProgrammingBias.prioritizeQualities gives a bonus multiplier
 *   - ProgrammingBias.deEmphasizeQualities apply a penalty
 *   - Joint demand matching to injuryBias rewards injury-prevention exercises
 *   - Missing exercise metadata degrades to fallback scoring (family/intent tags)
 */

import type { SportDemandProfile, DemandScore } from "./sport-profiles";

// ─── Exercise Metadata Interface ──────────────────────────────────────────────

/**
 * The sport-relevant tags that any exercise entry can carry.
 * All fields are optional so the scorer degrades gracefully
 * when metadata is incomplete.
 */
export interface ExerciseSportMetadata {
  name: string;
  /** High-level movement pattern cluster (from exerciseExtendedMeta) */
  family?: string;
  /** Legacy sport transfer tags from the exercise library */
  sportTransferTags?: string[];
  /** Intent tags from the exercise library */
  intentTags?: string[];
  /** New extended quality tags */
  movementQualities?: string[];
  jointDemands?: string[];
  energySystemTags?: string[];
  transferTags?: string[];
  sportTags?: string[];
  /** Velocity intent — for energy system alignment */
  velocityIntent?: "slow_grind" | "moderate" | "ballistic" | "explosive";
  /** Whether the exercise is unilateral */
  unilateral?: boolean;
}

// ─── Scoring Output ───────────────────────────────────────────────────────────

export interface SportFitBreakdown {
  qualityMatch: number;        // Score from movementQuality ↔ demandProfile alignment
  priorityBonus: number;       // Bonus from programmingBias.prioritizeQualities
  deEmphasizePenalty: number;  // Penalty from programmingBias.deEmphasizeQualities
  injuryBiasBonus: number;     // Bonus for protective exercises matching injuryBias
  energySystemMatch: number;   // Bonus for aerobic/alactic alignment
  unilateralBonus: number;     // Bonus for unilateral exercises when sport demands it
  fallbackScore: number;       // Fallback score used when metadata is sparse
}

export interface SportFitResult {
  total: number;                            // 0–100 normalized
  breakdown: SportFitBreakdown;
  explanation: string[];                    // Human-readable explanation lines
  missingMetadata: boolean;                 // True if exercise has sparse tags
  confidence: "high" | "medium" | "low";   // How reliable this score is
}

// ─── Quality → DemandProfile Mapping ─────────────────────────────────────────

/**
 * Maps movementQuality tag names to demandProfile keys.
 * Each quality can map to one or more demand dimensions.
 * The score is averaged when multiple dimensions apply.
 */
const QUALITY_TO_DEMAND: Record<string, (keyof SportDemandProfile["demandProfile"])[]> = {
  acceleration:          ["acceleration"],
  max_velocity:          ["maxVelocity"],
  lateral_decel:         ["lateralMovement", "deceleration"],
  cod:                   ["changeOfDirection"],
  deceleration:          ["deceleration"],
  elastic_stiffness:     ["elasticReactivity"],
  reactive_footwork:     ["elasticReactivity", "changeOfDirection"],
  rotation_power:        ["rotation"],
  anti_rotation:         ["antiRotation"],
  overhead_stability:    ["overheadDemand"],
  unilateral_balance:    ["unilateralControl"],
  grip_endurance:        ["gripForearmDemand"],
  trunk_stiffness:       ["antiRotation"],
  aerobic_base:          ["aerobicDemand"],
  repeat_sprint:         ["repeatSprintDemand"],
};

/**
 * Maps jointDemand tags to injuryBias keys.
 * An exercise that trains a joint at high risk in a sport earns
 * an injury-prevention bonus.
 */
const JOINT_TO_INJURY_BIAS: Record<string, keyof SportDemandProfile["injuryBias"]> = {
  ankle_stiffness:   "ankleFoot",
  ankle_stability:   "ankleFoot",
  knee_dominant:     "knee",
  hip_dominant:      "groinHip",
  hip_stability:     "groinHip",
  shoulder_stability: "shoulderElbow",
  elbow_load:        "shoulderElbow",
  wrist_forearm:     "wristHand",
  lumbar_control:    "lowBack",
  hamstring:         "hamstring",
};

/**
 * Maps legacy sportTransferTags to approximate movementQualities.
 * Used as a fallback when movementQualities are missing.
 */
const LEGACY_TRANSFER_TO_QUALITY: Record<string, string[]> = {
  acceleration:           ["acceleration"],
  rotational_power:       ["rotation_power"],
  stiffness:              ["elastic_stiffness"],
  lateral_power:          ["lateral_decel"],
  deceleration:           ["deceleration"],
  cod:                    ["cod"],
  overhead_stability:     ["overhead_stability"],
  trunk_stability:        ["anti_rotation", "trunk_stiffness"],
  unilateral_stability:   ["unilateral_balance"],
  grip_strength:          ["grip_endurance"],
  reactive:               ["reactive_footwork"],
};

/**
 * Maps velocityIntent to aerobic/alactic demand alignment.
 */
const VELOCITY_TO_ENERGY: Record<string, number> = {
  explosive:   3,
  ballistic:   2.5,
  moderate:    1.5,
  slow_grind:  0.5,
};

// ─── Scoring Helpers ──────────────────────────────────────────────────────────

function avgDemand(
  profile: SportDemandProfile,
  dimensionKeys: (keyof SportDemandProfile["demandProfile"])[]
): number {
  if (dimensionKeys.length === 0) return 0;
  const sum = dimensionKeys.reduce((acc, key) => acc + profile.demandProfile[key], 0);
  return sum / dimensionKeys.length;
}

function demandScore(d: DemandScore): number {
  // Map 0–3 DemandScore to contribution weight
  const map: Record<DemandScore, number> = { 0: 0, 1: 2, 2: 5, 3: 8 };
  return map[d];
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

/**
 * Scores how well an exercise fits a sport's physical demands.
 *
 * Returns a 0–100 normalized score with full breakdown and explanation.
 * Never throws — degrades gracefully when metadata is sparse.
 */
export function scoreSportFit(input: {
  sportProfile: SportDemandProfile;
  exercise: ExerciseSportMetadata;
}): SportFitResult {
  const { sportProfile, exercise } = input;
  const breakdown: SportFitBreakdown = {
    qualityMatch: 0,
    priorityBonus: 0,
    deEmphasizePenalty: 0,
    injuryBiasBonus: 0,
    energySystemMatch: 0,
    unilateralBonus: 0,
    fallbackScore: 0,
  };
  const explanationLines: string[] = [];

  // ── Determine metadata completeness ─────────────────────────────────────
  const hasNewTags =
    (exercise.movementQualities?.length ?? 0) > 0 ||
    (exercise.jointDemands?.length ?? 0) > 0;
  const hasLegacyTags =
    (exercise.sportTransferTags?.length ?? 0) > 0 ||
    (exercise.intentTags?.length ?? 0) > 0;
  const missingMetadata = !hasNewTags && !hasLegacyTags;

  // ── Quality Match Score ──────────────────────────────────────────────────
  let qualityTags: string[] = [];

  if (hasNewTags && (exercise.movementQualities?.length ?? 0) > 0) {
    qualityTags = exercise.movementQualities!;
  } else if (exercise.sportTransferTags && exercise.sportTransferTags.length > 0) {
    // Fall back: convert legacy tags to quality tags
    for (const tag of exercise.sportTransferTags) {
      const mapped = LEGACY_TRANSFER_TO_QUALITY[tag];
      if (mapped) qualityTags.push(...mapped);
    }
  }

  let qualityMatchRaw = 0;
  const matchedQualities: string[] = [];
  for (const quality of qualityTags) {
    const demandDims = QUALITY_TO_DEMAND[quality];
    if (!demandDims) continue;
    const avg = avgDemand(sportProfile, demandDims);
    const contribution = demandScore(Math.round(avg) as DemandScore);
    if (contribution > 0) {
      qualityMatchRaw += contribution;
      matchedQualities.push(`${quality} (demand: ${avg.toFixed(1)})`);
    }
  }
  breakdown.qualityMatch = Math.min(qualityMatchRaw, 40); // cap at 40 points

  if (matchedQualities.length > 0) {
    explanationLines.push(
      `Matched ${sportProfile.displayName} demands on: ${matchedQualities.join(", ")}.`
    );
  }

  // ── Priority Bonus ───────────────────────────────────────────────────────
  const prioritySet = new Set(sportProfile.programmingBias.prioritizeQualities);
  const deEmphasizeSet = new Set(sportProfile.programmingBias.deEmphasizeQualities);
  const allExerciseTags = [
    ...(exercise.movementQualities ?? []),
    ...(exercise.transferTags ?? []),
    ...(qualityTags),
  ];
  const uniqueTags = [...new Set(allExerciseTags)];

  let priorityBonus = 0;
  const boostedFor: string[] = [];
  for (const tag of uniqueTags) {
    if (prioritySet.has(tag)) {
      priorityBonus += 4;
      boostedFor.push(tag);
    }
  }
  breakdown.priorityBonus = Math.min(priorityBonus, 20); // cap at 20 points

  if (boostedFor.length > 0) {
    explanationLines.push(
      `Boosted for ${sportProfile.displayName} priority qualities: ${boostedFor.join(", ")}.`
    );
  }

  // ── De-emphasize Penalty ─────────────────────────────────────────────────
  let penalty = 0;
  const penalizedFor: string[] = [];
  for (const tag of uniqueTags) {
    if (deEmphasizeSet.has(tag)) {
      penalty += 4;
      penalizedFor.push(tag);
    }
  }
  breakdown.deEmphasizePenalty = Math.min(penalty, 15); // cap penalty at 15

  if (penalizedFor.length > 0) {
    explanationLines.push(
      `Penalized: ${penalizedFor.join(", ")} de-emphasized for ${sportProfile.displayName}.`
    );
  }

  // ── Injury Bias Bonus ────────────────────────────────────────────────────
  let injuryBonus = 0;
  const protectedJoints: string[] = [];
  for (const jd of exercise.jointDemands ?? []) {
    const biasKey = JOINT_TO_INJURY_BIAS[jd];
    if (!biasKey) continue;
    const biasScore = sportProfile.injuryBias[biasKey];
    if (biasScore >= 2) {
      injuryBonus += biasScore === 3 ? 5 : 3;
      protectedJoints.push(`${jd} (${biasKey})`);
    }
  }
  breakdown.injuryBiasBonus = Math.min(injuryBonus, 15); // cap at 15

  if (protectedJoints.length > 0) {
    explanationLines.push(
      `Injury-prevention bonus: targets high-risk tissue for ${sportProfile.displayName} — ${protectedJoints.join(", ")}.`
    );
  }

  // ── Energy System Match ──────────────────────────────────────────────────
  let energyMatch = 0;
  if (exercise.velocityIntent) {
    const exerciseEnergyScore = VELOCITY_TO_ENERGY[exercise.velocityIntent] ?? 0;
    const sportAerobic = sportProfile.demandProfile.aerobicDemand;
    const sportExplosive = sportProfile.demandProfile.elasticReactivity +
      sportProfile.demandProfile.acceleration;

    // High-velocity exercises match explosive sports; slow exercises match aerobic sports
    if (exercise.velocityIntent === "explosive" || exercise.velocityIntent === "ballistic") {
      if (sportExplosive >= 4) {
        energyMatch = 5;
        explanationLines.push(`Energy system match: explosive movement aligns with ${sportProfile.displayName}'s reactive demands.`);
      }
    } else if (exercise.velocityIntent === "slow_grind") {
      if (sportExplosive >= 5) {
        energyMatch = -3; // Slow exercises penalized for highly reactive sports
      } else {
        energyMatch = 2;
      }
    } else {
      energyMatch = Math.min(Math.round(exerciseEnergyScore), 4);
    }
  }

  // Check energySystemTags
  for (const tag of exercise.energySystemTags ?? []) {
    if (tag === "alactic" && sportProfile.demandProfile.acceleration >= 2) energyMatch += 2;
    if (tag === "aerobic" && sportProfile.demandProfile.aerobicDemand >= 2) energyMatch += 2;
    if (tag === "repeat_sprint" && sportProfile.demandProfile.repeatSprintDemand >= 2) energyMatch += 2;
  }

  breakdown.energySystemMatch = Math.max(Math.min(energyMatch, 10), -5);

  // ── Unilateral Bonus ─────────────────────────────────────────────────────
  if (exercise.unilateral && sportProfile.demandProfile.unilateralControl >= 2) {
    const bonus = sportProfile.demandProfile.unilateralControl === 3 ? 5 : 3;
    breakdown.unilateralBonus = bonus;
    if (bonus > 0) {
      explanationLines.push(`Unilateral exercise bonus: matches ${sportProfile.displayName}'s high single-limb demand.`);
    }
  }

  // ── Fallback Score (when metadata is very sparse) ─────────────────────────
  if (missingMetadata) {
    // Use family and legacy tags to estimate fit
    const familyFit = estimateFamilyFit(exercise.family ?? "", sportProfile);
    breakdown.fallbackScore = familyFit;
    explanationLines.push(
      `Note: Exercise metadata is sparse — score estimated from movement family and intent tags. Enrich movementQualities for accurate scoring.`
    );
  }

  // ── Total Score ──────────────────────────────────────────────────────────
  const rawTotal =
    breakdown.qualityMatch +
    breakdown.priorityBonus -
    breakdown.deEmphasizePenalty +
    breakdown.injuryBiasBonus +
    breakdown.energySystemMatch +
    breakdown.unilateralBonus +
    breakdown.fallbackScore;

  const total = Math.round(Math.max(0, Math.min(100, rawTotal)));

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence: "high" | "medium" | "low" = missingMetadata
    ? "low"
    : qualityTags.length >= 3
    ? "high"
    : "medium";

  return {
    total,
    breakdown,
    explanation: explanationLines,
    missingMetadata,
    confidence,
  };
}

// ─── Fallback Family Estimator ────────────────────────────────────────────────

/**
 * Rough score estimate based on movement family when detailed tags are absent.
 * Prevents scoring crashes and provides a signal for data enrichment logging.
 */
function estimateFamilyFit(family: string, profile: SportDemandProfile): number {
  const f = family.toLowerCase();

  // Families that strongly match high-demand lateral/reactive sports
  if (f.includes("elastic") || f.includes("reactive")) {
    const lateralDemand = profile.demandProfile.lateralMovement + profile.demandProfile.elasticReactivity;
    return lateralDemand >= 4 ? 15 : 8;
  }
  if (f.includes("plyometric")) {
    const explosiveDemand = profile.demandProfile.acceleration + profile.demandProfile.elasticReactivity;
    return explosiveDemand >= 4 ? 14 : 7;
  }
  if (f.includes("ballistic")) {
    return profile.demandProfile.rotation >= 2 ? 10 : 6;
  }
  if (f.includes("unilateral")) {
    return profile.demandProfile.unilateralControl >= 2 ? 12 : 5;
  }
  if (f.includes("rotational") || f.includes("anti_rotation")) {
    return profile.demandProfile.rotation >= 2 || profile.demandProfile.antiRotation >= 2 ? 12 : 4;
  }
  if (f.includes("carry")) {
    return profile.demandProfile.antiRotation >= 2 ? 10 : 5;
  }
  if (f.includes("bilateral") && f.includes("squat")) {
    // Heavy bilateral work is less sport-specific for most court/combat sports
    const strength = profile.demandProfile.acceleration + profile.demandProfile.unilateralControl;
    return strength >= 4 ? 8 : 4;
  }

  return 5; // default minimal fallback
}

// ─── Batch Scoring ────────────────────────────────────────────────────────────

/**
 * Scores a list of exercises against a sport profile and returns them sorted
 * by fit score (highest first).
 */
export function rankExercisesBySportFit(input: {
  sportProfile: SportDemandProfile;
  exercises: ExerciseSportMetadata[];
}): Array<{ exercise: ExerciseSportMetadata; result: SportFitResult }> {
  const { sportProfile, exercises } = input;

  const scored = exercises.map((exercise) => ({
    exercise,
    result: scoreSportFit({ sportProfile, exercise }),
  }));

  scored.sort((a, b) => b.result.total - a.result.total);
  return scored;
}

// ─── Explanation Builder ──────────────────────────────────────────────────────

/**
 * Builds a concise agent-facing explanation for why an exercise ranked
 * highly or lowly for a sport.
 *
 * Used for the "This exercise ranked higher because..." explanations
 * described in Phase 7.
 */
export function buildSportFitExplanation(
  exercise: ExerciseSportMetadata,
  sportProfile: SportDemandProfile,
  result: SportFitResult
): string {
  if (result.explanation.length === 0) {
    return `${exercise.name} has a generic fit score of ${result.total}/100 for ${sportProfile.displayName}.`;
  }

  const topLine = result.total >= 60
    ? `${exercise.name} ranked higher because it supports ${sportProfile.displayName}-specific demands:`
    : result.total >= 35
    ? `${exercise.name} has moderate fit for ${sportProfile.displayName}:`
    : `${exercise.name} has low fit for ${sportProfile.displayName}:`;

  const details = result.explanation.slice(0, 3).join(" ");
  return `${topLine} ${details}`;
}

// ─── Missing Metadata Logger ──────────────────────────────────────────────────

/**
 * Returns exercises that have sparse metadata and need enrichment.
 * Call this during development to identify which exercises need
 * movementQualities, jointDemands, etc. added.
 */
export function findExercisesNeedingEnrichment(
  exercises: ExerciseSportMetadata[]
): string[] {
  return exercises
    .filter((ex) => {
      const hasNew = (ex.movementQualities?.length ?? 0) > 0 || (ex.jointDemands?.length ?? 0) > 0;
      return !hasNew;
    })
    .map((ex) => ex.name);
}
