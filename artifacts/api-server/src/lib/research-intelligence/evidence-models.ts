// ─── Evidence Models ──────────────────────────────────────────────────────────
//
// Phase 1 — Core type system for the Research Intelligence Engine.
//
// Designed to support: meta-analyses, systematic reviews, position stands,
// consensus statements, RCTs, and individual studies without hardcoding
// around individual papers.
//
// All types are pure interfaces — no runtime dependencies.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Evidence Hierarchy ───────────────────────────────────────────────────────

/**
 * The level of a research source, ordered from highest to lowest validity.
 * Meta-analyses and systematic reviews sit at the top because they synthesize
 * multiple studies. Position stands represent expert consensus. Individual
 * study designs rank below synthesis documents.
 */
export type EvidenceLevel =
  | "meta_analysis"       // synthesizes multiple RCTs or controlled studies
  | "systematic_review"   // structured review without statistical pooling
  | "position_stand"      // NSCA / ACSM / professional org positions
  | "consensus_statement" // expert panel agreements
  | "rct"                 // randomized controlled trial
  | "controlled_study"    // controlled without randomization
  | "cohort_study"        // observational longitudinal
  | "case_series"         // small-sample descriptive
  | "expert_opinion";     // practitioner consensus, not formal study

/**
 * Qualitative summary of how consistent and strong the evidence base is.
 * Used to communicate uncertainty to coaches and athletes.
 */
export type EvidenceStrength =
  | "strong"       // consistent across multiple high-quality studies
  | "moderate"     // good evidence with some methodological limitations
  | "mixed"        // conflicting findings exist in the literature
  | "emerging"     // early / preliminary evidence, not yet replicated widely
  | "insufficient"; // too little evidence to draw reliable conclusions

// ─── Population Descriptors ───────────────────────────────────────────────────

export type PopulationCategory =
  | "youth"             // typically <18
  | "high_school"       // 14–18
  | "college"           // 18–22
  | "professional"      // elite trained adults
  | "recreational"      // non-athlete trained adults
  | "general_fitness"   // untrained / general population
  | "male"
  | "female"
  | "team_sport"        // field/court sports
  | "individual_sport"  // track, swimming, wrestling
  | "tactical"          // military, law enforcement
  | "masters";          // 40+

export type TransferLevel =
  | "direct"      // same population as source (100%)
  | "strong"      // very similar population (85–99%)
  | "moderate"    // somewhat different population (60–84%)
  | "weak"        // substantially different population (30–59%)
  | "insufficient"; // too different to make reliable inference (<30%)

// ─── Core Research Primitives ─────────────────────────────────────────────────

/**
 * A single research finding linking a training exposure to an adaptation.
 * Multiple findings make up the evidence record for a training method.
 */
export interface ResearchFinding {
  adaptation: string;
  strength: EvidenceStrength;
  confidence: number;              // 0–100, represents current scientific consensus
  primaryLevel: EvidenceLevel;     // highest level of evidence supporting this finding
  populationSupport: PopulationCategory[];
  notes?: string;                  // caveats, moderating variables, effect size context
}

/**
 * A contradictory finding — represents disagreement within the literature.
 * The Research Intelligence Engine surfaces these to avoid false certainty.
 */
export interface ContradictoryFinding {
  topic: string;
  strongEvidence: Array<{ adaptation: string; confidence: number; notes?: string }>;
  mixedEvidence: Array<{ adaptation: string; confidence: number; notes?: string }>;
  emergingEvidence: Array<{ adaptation: string; confidence: number; notes?: string }>;
  insufficientEvidence: Array<{ adaptation: string; confidence: number; notes?: string }>;
  resolutionGuidance?: string; // how to navigate this disagreement in practice
}

/**
 * The full evidence record for a single training method.
 * This is the core of the Training Method Evidence Graph (Phase 2).
 */
export interface TrainingMethodEvidence {
  method: string;
  category: MethodCategory;
  supportedAdaptations: ResearchFinding[];
  contradictions: ContradictoryFinding[];
  minimumEffectiveWeeks: number;
  expectedWeeks: number;
  optimalWeeks: number;
  primaryPopulations: PopulationCategory[];
  equipmentRequired: boolean;
  intensityRange: "low" | "moderate" | "high" | "maximal";
  fatigueRating: 1 | 2 | 3 | 4 | 5; // 1 = minimal, 5 = very high
  technicalDemand: "low" | "moderate" | "high";
}

export type MethodCategory =
  | "speed_power"
  | "strength"
  | "plyometric"
  | "aerobic"
  | "anaerobic"
  | "mobility_flexibility"
  | "neuromuscular"
  | "structural";

/**
 * Adaptation timeline with evidence confidence and population-specific notes.
 * Powers the Adaptation Timeline Engine (Phase 4).
 */
export interface AdaptationTimelineEntry {
  adaptation: string;
  noticeableWeeks: number;   // first measurable signal
  meaningfulWeeks: number;   // practically significant change
  substantialWeeks: number;  // near-ceiling development under optimal conditions
  confidence: number;        // confidence in these timeline estimates (0–100)
  primaryEvidenceLevel: EvidenceLevel;
  populationModifiers: Array<{
    population: PopulationCategory;
    modifier: number;          // multiplier on timeline (e.g. 0.8 = faster, 1.2 = slower)
    notes: string;
  }>;
  limitingVariables: string[]; // what slows or accelerates this timeline
}

/**
 * Population-to-population research transfer score.
 * Used when the athlete's population differs from where the evidence was generated.
 */
export interface PopulationTransferRecord {
  sourcePopulation: PopulationCategory;
  transferScores: Partial<Record<PopulationCategory, PopulationTransferScore>>;
}

export interface PopulationTransferScore {
  score: number;            // 0–100
  transferLevel: TransferLevel;
  confidence: number;       // confidence in this transfer estimate
  notes?: string;
}

/**
 * Composite confidence score for a training method recommendation.
 * The Research Intelligence Engine replaces single-number confidence with this
 * breakdown, making reasoning transparent and multi-dimensional.
 */
export interface ResearchConfidenceScore {
  profileMatch: number;         // how well method fits athlete's quality profile (0–100)
  researchSupport: number;      // quality-weighted evidence score (0–100)
  populationTransfer: number;   // transfer confidence from source population (0–100)
  adaptationRelevance: number;  // relevance of adaptation to athlete's goal (0–100)
  composite: number;            // weighted combination (0–100)
  breakdown: {
    profileMatchWeight: number;
    researchSupportWeight: number;
    populationTransferWeight: number;
    adaptationRelevanceWeight: number;
  };
}

/**
 * A structured, evidence-backed exercise justification.
 * Every exercise recommendation should be explainable through this interface.
 * Powers the Research Justification Engine (Phase 5).
 */
export interface ExerciseJustification {
  exercise: string;
  primaryReason: string;          // performance need this exercise addresses
  evidenceSupport: string;        // natural language evidence summary
  populationRelevance: string;    // how relevant this is for the athlete's population
  targetAdaptation: string;       // the adaptation this exercise primarily drives
  confidence: number;             // overall confidence in this recommendation (0–100)
  evidenceStrength: EvidenceStrength;
  contradictionWarning?: string;  // if mixed evidence exists for this exercise's claim
}

// ─── Future Ingestion Architecture (Phase 8) ──────────────────────────────────

/**
 * Represents a research source that can be ingested into the evidence graph.
 * Structured to accommodate: PubMed, NSCA, ACSM, systematic reviews, etc.
 */
export interface ResearchSource {
  id: string;
  type: EvidenceLevel;
  title: string;
  year: number;
  authors?: string[];
  doi?: string;
  journal?: string;
  populations: PopulationCategory[];
  adaptationsStudied: string[];
  methodsStudied: string[];
  sampleSize?: number;
  durationWeeks?: number;
  effectSizes?: Record<string, number>; // Cohen's d or similar per outcome
  rawAbstract?: string;
  ingestionStatus: "pending" | "extracted" | "normalized" | "integrated";
}

/**
 * Normalized evidence unit extracted from a ResearchSource.
 * The bridge between raw ingested research and the evidence graph.
 */
export interface NormalizedEvidence {
  sourceId: string;
  sourceType: EvidenceLevel;
  method: string;
  adaptation: string;
  effectMagnitude: "trivial" | "small" | "moderate" | "large" | "very_large";
  confidence: number;
  populations: PopulationCategory[];
  durationWeeks: number;
  extractedAt: string; // ISO date
}
