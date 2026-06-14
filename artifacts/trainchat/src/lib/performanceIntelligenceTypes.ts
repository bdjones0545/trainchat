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

export interface RankedMethod {
  method: string;
  confidence: number;
  targetQuality: string;
  rationale: string;
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
}
