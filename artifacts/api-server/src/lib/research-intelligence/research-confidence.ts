// ─── Research Confidence Engine ───────────────────────────────────────────────
//
// Phase 1 — Composite confidence scoring for training method recommendations.
//
// Replaces single-number confidence with a multi-dimensional breakdown:
//   Profile Match × Research Support × Population Transfer × Adaptation Relevance
//
// Weights:
//   profileMatch:         40% — how well the method fits the athlete's quality profile
//   researchSupport:      30% — quality-weighted evidence score
//   populationTransfer:   20% — transfer confidence from study population to athlete
//   adaptationRelevance:  10% — relevance of the targeted adaptation to the athlete's goal
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ResearchConfidenceScore,
  EvidenceStrength,
  PopulationCategory,
} from "./evidence-models.js";
import { EVIDENCE_LEVEL_WEIGHTS, classifyEvidenceStrength } from "./research-taxonomy.js";
import type { EvidenceLevel } from "./evidence-models.js";

// ─── Weight Configuration ─────────────────────────────────────────────────────

const COMPOSITE_WEIGHTS = {
  profileMatch: 0.40,
  researchSupport: 0.30,
  populationTransfer: 0.20,
  adaptationRelevance: 0.10,
} as const;

// ─── Research Support Scoring ─────────────────────────────────────────────────

/**
 * Compute a research support score for a method given its best available
 * evidence level and the strength of that evidence.
 */
export function computeResearchSupportScore(
  evidenceStrength: EvidenceStrength,
  evidenceLevel: EvidenceLevel,
  rawConfidence: number
): number {
  const levelWeight = EVIDENCE_LEVEL_WEIGHTS[evidenceLevel] ?? 0.5;

  // Strength multipliers that scale how much of the raw confidence we accept
  const strengthMultipliers: Record<EvidenceStrength, number> = {
    strong: 1.00,
    moderate: 0.88,
    mixed: 0.68,
    emerging: 0.48,
    insufficient: 0.25,
  };

  const strengthMult = strengthMultipliers[evidenceStrength] ?? 0.5;
  return Math.round(Math.min(100, rawConfidence * levelWeight * strengthMult));
}

/**
 * Compute research support from a list of findings for a method.
 * Uses a quality-weighted aggregation, favouring higher evidence levels.
 */
export function computeAggregatedResearchScore(
  findings: Array<{ confidence: number; strength: EvidenceStrength; level: EvidenceLevel }>
): number {
  if (findings.length === 0) return 40; // neutral default when no evidence data

  let weightedSum = 0;
  let totalWeight = 0;

  for (const f of findings) {
    const levelWeight = EVIDENCE_LEVEL_WEIGHTS[f.level] ?? 0.5;
    const score = computeResearchSupportScore(f.strength, f.level, f.confidence);
    weightedSum += score * levelWeight;
    totalWeight += levelWeight;
  }

  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 40);
}

// ─── Adaptation Relevance Scoring ─────────────────────────────────────────────

const GOAL_ADAPTATION_RELEVANCE: Record<string, Record<string, number>> = {
  strength: {
    "Maximal Strength": 100,
    "Neural Drive": 92,
    "Structural Strength": 88,
    "Rate of Force Development": 70,
    "Trunk Stability": 65,
    "Hypertrophy": 60,
  },
  athletic_performance: {
    "Acceleration": 100,
    "Lower Body Power": 98,
    "Reactive Strength": 95,
    "Rate of Force Development": 92,
    "Max Velocity": 88,
    "Change of Direction Speed": 85,
    "Maximal Strength": 70,
  },
  hypertrophy: {
    "Hypertrophy": 100,
    "Muscular Endurance": 80,
    "Structural Strength": 72,
    "Metabolic Stress": 68,
  },
  fat_loss: {
    "Aerobic Capacity": 100,
    "Work Capacity": 90,
    "Muscular Endurance": 78,
    "Lactate Threshold": 72,
  },
  endurance: {
    "Aerobic Capacity": 100,
    "Lactate Threshold": 98,
    "Running Economy": 90,
    "Fat Oxidation": 82,
    "Muscular Endurance": 75,
  },
  power: {
    "Rate of Force Development": 100,
    "Lower Body Power": 98,
    "Explosive Strength": 95,
    "Neural Drive": 88,
    "Reactive Strength": 82,
    "Maximal Strength": 72,
  },
  general_fitness: {
    "Aerobic Capacity": 85,
    "Structural Strength": 80,
    "Movement Quality": 78,
    "Muscular Endurance": 72,
    "Work Capacity": 68,
  },
};

/**
 * Compute how relevant a method's primary adaptation is to the athlete's goal.
 */
export function computeAdaptationRelevance(
  targetAdaptation: string,
  goalKey: string
): number {
  const relevanceMap = GOAL_ADAPTATION_RELEVANCE[goalKey];
  if (!relevanceMap) return 65; // default neutral relevance

  // Exact match
  if (relevanceMap[targetAdaptation] !== undefined) {
    return relevanceMap[targetAdaptation];
  }

  // Partial match — look for overlapping terms
  for (const [key, score] of Object.entries(relevanceMap)) {
    const terms = key.toLowerCase().split(" ");
    const adaptTerms = targetAdaptation.toLowerCase().split(" ");
    if (terms.some((t) => adaptTerms.includes(t))) {
      return Math.round(score * 0.85);
    }
  }

  return 55; // low relevance
}

// ─── Composite Score Assembly ─────────────────────────────────────────────────

export interface CompositeConfidenceInput {
  profileMatch: number;
  researchSupport: number;
  populationTransfer: number;
  adaptationRelevance: number;
}

/**
 * Assemble a ResearchConfidenceScore from its four component dimensions.
 */
export function buildCompositeConfidence(
  input: CompositeConfidenceInput
): ResearchConfidenceScore {
  const { profileMatch, researchSupport, populationTransfer, adaptationRelevance } = input;
  const w = COMPOSITE_WEIGHTS;

  const composite = Math.round(
    profileMatch * w.profileMatch +
    researchSupport * w.researchSupport +
    populationTransfer * w.populationTransfer +
    adaptationRelevance * w.adaptationRelevance
  );

  return {
    profileMatch: Math.round(profileMatch),
    researchSupport: Math.round(researchSupport),
    populationTransfer: Math.round(populationTransfer),
    adaptationRelevance: Math.round(adaptationRelevance),
    composite: Math.min(99, Math.max(1, composite)),
    breakdown: {
      profileMatchWeight: w.profileMatch,
      researchSupportWeight: w.researchSupport,
      populationTransferWeight: w.populationTransfer,
      adaptationRelevanceWeight: w.adaptationRelevance,
    },
  };
}

/**
 * Build a composite confidence score for a training method recommendation.
 * This is the primary entry point used by the performance intelligence engine
 * when upgrading method confidence from single-number to multi-dimensional.
 */
export function scoreMethodConfidence(params: {
  existingProfileMatch: number;           // from QUALITY_METHOD_MAP confidence
  evidenceStrength: EvidenceStrength;
  evidenceLevel: EvidenceLevel;
  rawEvidenceConfidence: number;
  populationTransfer: number;             // from population transfer engine
  targetAdaptation: string;
  goalKey: string;
}): ResearchConfidenceScore {
  const researchSupport = computeResearchSupportScore(
    params.evidenceStrength,
    params.evidenceLevel,
    params.rawEvidenceConfidence
  );

  const adaptationRelevance = computeAdaptationRelevance(
    params.targetAdaptation,
    params.goalKey
  );

  return buildCompositeConfidence({
    profileMatch: params.existingProfileMatch,
    researchSupport,
    populationTransfer: params.populationTransfer,
    adaptationRelevance,
  });
}

/**
 * Format a ResearchConfidenceScore as a human-readable breakdown string.
 * Used in system prompts and API responses.
 */
export function formatConfidenceBreakdown(score: ResearchConfidenceScore): string {
  return [
    `Performance Match: ${score.profileMatch}`,
    `Research Support: ${score.researchSupport}`,
    `Population Transfer: ${score.populationTransfer}`,
    `Adaptation Relevance: ${score.adaptationRelevance}`,
    `Final Confidence: ${score.composite}`,
  ].join(" | ");
}

/**
 * Produce a plain-language confidence summary for coaching explanations.
 */
export function describeConfidenceLevel(composite: number): string {
  if (composite >= 88) return "Very high confidence — strong evidence with excellent athlete fit";
  if (composite >= 75) return "High confidence — good evidence, well-matched to this athlete";
  if (composite >= 60) return "Moderate confidence — solid rationale with some population caveats";
  if (composite >= 45) return "Mixed confidence — limited direct evidence for this athlete profile";
  return "Low confidence — emerging or insufficient evidence; use with caution";
}

/**
 * Classify a composite score using the evidence strength taxonomy.
 */
export function compositeToEvidenceStrength(composite: number): EvidenceStrength {
  return classifyEvidenceStrength(composite);
}
