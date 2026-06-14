// ─── Research Taxonomy ────────────────────────────────────────────────────────
//
// Phase 1 — Evidence hierarchy, quality weighting, and classification system.
//
// The taxonomy establishes a principled ordering of evidence quality so the
// Research Intelligence Engine can weight findings appropriately, rather than
// treating all evidence as equivalent.
// ─────────────────────────────────────────────────────────────────────────────

import type { EvidenceLevel, EvidenceStrength, PopulationCategory } from "./evidence-models.js";

// ─── Evidence Level Quality Weights ───────────────────────────────────────────
// Higher weight = greater contribution to the final confidence score.
// Based on the standard hierarchy of evidence in sport science.

export const EVIDENCE_LEVEL_WEIGHTS: Record<EvidenceLevel, number> = {
  meta_analysis: 1.00,       // highest: synthesizes multiple high-quality studies
  systematic_review: 0.92,   // structured synthesis without statistical pooling
  position_stand: 0.88,      // NSCA/ACSM: expert consensus on structured evidence
  consensus_statement: 0.84, // panel-derived positions with formal review
  rct: 0.78,                 // gold standard for individual studies
  controlled_study: 0.68,    // controlled without randomization
  cohort_study: 0.56,        // observational longitudinal
  case_series: 0.40,         // small sample, limited generalizability
  expert_opinion: 0.30,      // practitioner consensus, no formal study
};

// ─── Strength → Confidence Floor ──────────────────────────────────────────────
// The minimum raw confidence for each evidence strength category.
// A "strong" finding from a case series is still constrained by study quality.

export const STRENGTH_CONFIDENCE_FLOORS: Record<EvidenceStrength, number> = {
  strong: 78,
  moderate: 58,
  mixed: 35,
  emerging: 18,
  insufficient: 0,
};

export const STRENGTH_CONFIDENCE_CEILINGS: Record<EvidenceStrength, number> = {
  strong: 100,
  moderate: 82,
  mixed: 65,
  emerging: 48,
  insufficient: 25,
};

// ─── Population Specificity Multipliers ───────────────────────────────────────
// Research from sport-specific populations transfers better to similar athletes.
// These multipliers adjust confidence when evidence population ≠ athlete population.

export const POPULATION_SPECIFICITY: Record<PopulationCategory, number> = {
  professional: 1.00,    // highest specificity — elite athletes
  college: 0.95,
  high_school: 0.88,
  team_sport: 0.90,
  individual_sport: 0.88,
  tactical: 0.85,
  male: 0.88,
  female: 0.88,
  recreational: 0.80,
  youth: 0.78,
  masters: 0.75,
  general_fitness: 0.70, // broadest — lowest specificity
};

// ─── Study Duration Adequacy ───────────────────────────────────────────────────
// Research on short adaptations (neural) needs fewer weeks than structural.
// Studies that ran fewer weeks than expected receive a confidence penalty.

export const MINIMUM_ADEQUATE_DURATION_WEEKS: Record<string, number> = {
  "Neural Drive": 2,
  "Rate of Force Development": 3,
  "Acceleration": 3,
  "Max Velocity": 4,
  "Reactive Strength": 4,
  "Lower Body Power": 4,
  "Maximal Strength": 6,
  "Change of Direction Speed": 4,
  "Aerobic Capacity": 8,
  "Lactate Threshold": 6,
  "Hypertrophy": 8,
  "Tendon Stiffness": 10,
  "Injury Resilience": 12,
  "Muscular Endurance": 6,
  "Work Capacity": 6,
};

// ─── Classification Utilities ──────────────────────────────────────────────────

/**
 * Classify a confidence value into an evidence strength label.
 */
export function classifyEvidenceStrength(confidence: number): EvidenceStrength {
  if (confidence >= 78) return "strong";
  if (confidence >= 58) return "moderate";
  if (confidence >= 35) return "mixed";
  if (confidence >= 18) return "emerging";
  return "insufficient";
}

/**
 * Apply evidence level weight to a raw confidence score.
 * A finding from a case series is capped lower than one from a meta-analysis.
 */
export function weightedConfidence(rawConfidence: number, level: EvidenceLevel): number {
  const weight = EVIDENCE_LEVEL_WEIGHTS[level] ?? 0.5;
  const strength = classifyEvidenceStrength(rawConfidence);
  const ceiling = STRENGTH_CONFIDENCE_CEILINGS[strength];
  const weighted = Math.round(rawConfidence * weight);
  return Math.min(ceiling, Math.max(0, weighted));
}

/**
 * Aggregate multiple evidence findings into a single consensus confidence.
 * Uses a weighted average that favors higher-quality evidence.
 */
export function aggregateEvidenceConfidence(
  findings: Array<{ confidence: number; level: EvidenceLevel }>
): number {
  if (findings.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const f of findings) {
    const w = EVIDENCE_LEVEL_WEIGHTS[f.level] ?? 0.5;
    weightedSum += f.confidence * w;
    totalWeight += w;
  }

  return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
}

/**
 * Check whether a body of evidence is internally consistent.
 * Returns a consistency score 0–100 (100 = fully consistent, 0 = highly contradictory).
 */
export function measureEvidenceConsistency(confidences: number[]): number {
  if (confidences.length <= 1) return 100;
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
  const stdDev = Math.sqrt(variance);
  // High std dev = low consistency. Cap at 30 std dev → 0 consistency.
  return Math.max(0, Math.round(100 - (stdDev / 30) * 100));
}
