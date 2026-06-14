// ─── Performance Intelligence Types (frontend) ───────────────────────────────
// Mirror of the backend engine types. Keep in sync with
// artifacts/api-server/src/lib/performance-intelligence/index.ts

export interface PrioritizedQuality {
  quality: string;
  score: number;
  reason: string;
  priority: number;
}

export interface LimitingFactor {
  factor: string;
  detail: string;
  severity: "critical" | "moderate" | "minor";
  sourceAssessment?: string;
}

/** Phase 7 — multi-dimensional research confidence breakdown */
export interface ResearchConfidenceScore {
  profileMatch: number;
  researchSupport: number;
  populationTransfer: number;
  adaptationRelevance: number;
  composite: number;
  evidenceStrength: string;
  evidenceLevel: string;
}

export interface RankedMethod {
  method: string;
  confidence: number;
  targetQuality: string;
  rationale: string;
  /** Phase 7 — multi-dimensional research confidence breakdown */
  researchConfidence?: ResearchConfidenceScore;
  /** Phase 7 — short evidence summary sentence */
  evidenceSummary?: string;
  /** Phase 7 — whether contradictory evidence exists */
  hasContradictions?: boolean;
}

export interface ExercisePool {
  tier1: string[];
  tier2: string[];
  substitutions: string[];
  progressions: string[];
  regressions: string[];
}

export interface ExerciseReason {
  exercise: string;
  targetQuality: string;
  method: string;
  limitingFactor?: string;
  expectedAdaptation: string;
  confidence: number;
}

export interface AdaptationForecast {
  primary: string[];
  secondary: string[];
  timeline: string;
}

/** Phase 7 — research intelligence output surfaced in the API response */
export interface ResearchIntelligenceOutput {
  methods: Array<{
    method: string;
    targetQuality: string;
    rationale: string;
    confidence: number;
    researchConfidence: ResearchConfidenceScore;
    evidenceSummary: string;
    evidenceStrength: string;
    hasContradictions: boolean;
  }>;
  exerciseJustifications: Array<{
    exercise: string;
    primaryMechanism: string;
    evidenceLevel: string;
    transferNotes: string;
    contradictions?: string;
  }>;
  adaptationTimelines: Array<{ adaptation: string; timeline: string }>;
  populationContext: {
    athletePopulation: string;
    populationLabel: string;
  };
  systemConfidence: number;
  evidenceQualityNote: string;
}

export interface PerformanceProfile {
  goal: string;
  sport: string | null;
  focusMode: string | null;
  priorityQualities: PrioritizedQuality[];
  limitingFactors: LimitingFactor[];
  recommendedMethods: RankedMethod[];
  equipmentOpportunities: string[];
  recommendedExercisePool: ExercisePool;
  riskFactors: string[];
  expectedAdaptations: AdaptationForecast;
  exerciseRationale: ExerciseReason[];
  confidence: number;
  version: number;
  /** Phase 7 — research intelligence layer output */
  researchIntelligence?: ResearchIntelligenceOutput;
}
