// ─── Research Intelligence Engine ─────────────────────────────────────────────
//
// Main orchestrator for the Research Intelligence Layer.
//
// Reasoning flow:
//   Assessment + Goal + Sport + Constraints
//     ↓
//   Performance Profile (Phase 5)
//     ↓
//   Research Intelligence Layer (this module)
//     ↓
//   Training Method Selection (evidence-weighted)
//     ↓
//   Exercise Selection (research-backed)
//     ↓
//   Adaptation Forecast (timeline-grounded)
//
// All functions are pure — no DB, no AI calls, no async.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Re-exports ───────────────────────────────────────────────────────────────
export type {
  EvidenceLevel,
  EvidenceStrength,
  PopulationCategory,
  TransferLevel,
  ResearchFinding,
  ContradictoryFinding,
  TrainingMethodEvidence,
  AdaptationTimelineEntry,
  PopulationTransferScore,
  PopulationTransferRecord,
  ResearchConfidenceScore,
  ExerciseJustification,
  ResearchSource,
  NormalizedEvidence,
} from "./evidence-models.js";

export { ADAPTATION_TIMELINES, getAdaptationTimeline, getAdjustedTimeline, getTimelineDescription, formatAdaptationTimeline } from "./adaptation-timelines.js";
export { METHOD_EVIDENCE_GRAPH, getMethodEvidence, getBestEvidenceForAdaptation, getMethodContradictions, getMethodTopEvidenceStrength } from "./method-evidence-graph.js";
export { resolveAthletePopulation, getPopulationTransfer, computeTransferConfidence, describeTransferConfidence, formatPopulationLabel, classifyTransferLevel } from "./population-transfer.js";
export { computeResearchSupportScore, computeAggregatedResearchScore, computeAdaptationRelevance, buildCompositeConfidence, scoreMethodConfidence, formatConfidenceBreakdown, describeConfidenceLevel, compositeToEvidenceStrength } from "./research-confidence.js";
export { generateResearchJustification, generateBatchJustifications, getContradictionSummary, classifyMethodEvidence } from "./research-justifications.js";
export { registerIngestionSource, getRegisteredSources, getEnabledSources, classifyEffectSizeAsStrength, estimateConfidenceFromEffectSize } from "./ingestion-architecture.js";
export { classifyEvidenceStrength, weightedConfidence, aggregateEvidenceConfidence, measureEvidenceConsistency, EVIDENCE_LEVEL_WEIGHTS, STRENGTH_CONFIDENCE_FLOORS, STRENGTH_CONFIDENCE_CEILINGS } from "./research-taxonomy.js";

// ─── Types ────────────────────────────────────────────────────────────────────

import type {
  ResearchConfidenceScore,
  ExerciseJustification,
  PopulationCategory,
  EvidenceStrength,
} from "./evidence-models.js";
import { getMethodEvidence, getBestEvidenceForAdaptation, getMethodTopEvidenceStrength } from "./method-evidence-graph.js";
import { resolveAthletePopulation, computeTransferConfidence, formatPopulationLabel } from "./population-transfer.js";
import { scoreMethodConfidence, formatConfidenceBreakdown, describeConfidenceLevel } from "./research-confidence.js";
import { generateResearchJustification, classifyMethodEvidence } from "./research-justifications.js";
import { getTimelineDescription } from "./adaptation-timelines.js";
import { classifyEvidenceStrength } from "./research-taxonomy.js";

// ─── Core Interfaces ──────────────────────────────────────────────────────────

export interface ResearchEnhancedMethod {
  method: string;
  targetQuality: string;
  rationale: string;
  /** Original profile match score from the performance intelligence engine */
  profileMatchScore: number;
  /** Full research confidence breakdown (Phase 7) */
  researchConfidence: ResearchConfidenceScore;
  /** The composite score — replaces the old single-number confidence */
  confidence: number;
  /** Short evidence summary for coaching output */
  evidenceSummary: string;
  /** Evidence strength classification */
  evidenceStrength: EvidenceStrength;
  /** Whether mixed/contradictory evidence exists for key claims */
  hasContradictions: boolean;
}

export interface ResearchEnhancedExercise {
  exercise: string;
  justification: ExerciseJustification;
}

export interface ResearchIntelligenceOutput {
  methods: ResearchEnhancedMethod[];
  exerciseJustifications: ExerciseJustification[];
  adaptationTimelines: Array<{ adaptation: string; timeline: string }>;
  populationContext: {
    athletePopulation: PopulationCategory;
    populationLabel: string;
  };
  systemConfidence: number;
  evidenceQualityNote: string;
}

// ─── Profile Input (mirrors PerformanceProfileInput for independence) ──────────

export interface ResearchProfileInput {
  goal: string;
  sport?: string | null;
  age?: number | null;
  trainingAge?: string | null;
  methods: Array<{ method: string; confidence: number; targetQuality: string; rationale: string }>;
  priorityQualities: Array<{ quality: string; score: number }>;
  tier1Exercises?: string[];
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Run the Research Intelligence Layer over a set of training method recommendations.
 * Upgrades single-number confidence to multi-dimensional evidence-weighted scores.
 *
 * Called from the Performance Intelligence Engine after method selection.
 */
export function applyResearchIntelligence(input: ResearchProfileInput): ResearchIntelligenceOutput {
  const athletePopulation = resolveAthletePopulation({
    sport: input.sport,
    age: input.age,
    trainingAge: input.trainingAge,
  });

  const goalKey = normalizeGoalKey(input.goal);

  // ─── Upgrade method confidence scores ────────────────────────────────────
  const methods: ResearchEnhancedMethod[] = input.methods.map((m) => {
    const methodEvidence = getMethodEvidence(m.method);
    const bestFinding = getBestEvidenceForAdaptation(m.method, m.targetQuality);

    const rawEvidenceConfidence = bestFinding?.confidence ?? m.confidence;
    const evidenceStrength = bestFinding?.strength ?? getMethodTopEvidenceStrength(m.method);
    const evidenceLevel = bestFinding?.primaryLevel ?? "systematic_review";
    const populationSupport = (bestFinding?.populationSupport ?? methodEvidence?.primaryPopulations ?? []) as PopulationCategory[];

    const transferConfidence = computeTransferConfidence(populationSupport, athletePopulation);

    const researchConfidence = scoreMethodConfidence({
      existingProfileMatch: m.confidence,
      evidenceStrength,
      evidenceLevel,
      rawEvidenceConfidence,
      populationTransfer: transferConfidence,
      targetAdaptation: m.targetQuality,
      goalKey,
    });

    const contradictions = classifyMethodEvidence(m.method);
    const hasContradictions = contradictions.mixedEvidence.length > 0 || contradictions.emergingEvidence.length > 0;

    const evidenceSummary = buildEvidenceSummary(
      m.method,
      m.targetQuality,
      evidenceStrength,
      rawEvidenceConfidence,
      researchConfidence.composite
    );

    return {
      method: m.method,
      targetQuality: m.targetQuality,
      rationale: m.rationale,
      profileMatchScore: m.confidence,
      researchConfidence,
      confidence: researchConfidence.composite,
      evidenceSummary,
      evidenceStrength,
      hasContradictions,
    };
  }).sort((a, b) => b.confidence - a.confidence);

  // ─── Generate exercise justifications ─────────────────────────────────────
  const context = {
    sport: input.sport,
    age: input.age,
    trainingAge: input.trainingAge,
    goal: input.goal,
    targetQuality: input.priorityQualities[0]?.quality,
  };

  const exerciseJustifications: ExerciseJustification[] = (input.tier1Exercises ?? [])
    .map((exercise) => generateResearchJustification(exercise, context));

  // ─── Build adaptation timelines ───────────────────────────────────────────
  const adaptationTimelines = input.priorityQualities.slice(0, 4).map((q) => ({
    adaptation: q.quality,
    timeline: getTimelineDescription(q.quality, athletePopulation),
  }));

  // ─── Compute system-wide confidence ───────────────────────────────────────
  const systemConfidence = methods.length > 0
    ? Math.round(methods.slice(0, 3).reduce((sum, m) => sum + m.confidence, 0) / Math.min(3, methods.length))
    : 70;

  const evidenceQualityNote = buildEvidenceQualityNote(methods);

  return {
    methods,
    exerciseJustifications,
    adaptationTimelines,
    populationContext: {
      athletePopulation,
      populationLabel: formatPopulationLabel(athletePopulation),
    },
    systemConfidence,
    evidenceQualityNote,
  };
}

// ─── System Prompt Section Builder ───────────────────────────────────────────

/**
 * Build a Research Intelligence section for the AI system prompt.
 * This injects evidence reasoning into Atlas so it can explain selections.
 */
export function buildResearchIntelligencePromptSection(output: ResearchIntelligenceOutput): string {
  const methodsList = output.methods
    .slice(0, 4)
    .map((m) => {
      const contradictionNote = m.hasContradictions ? " ⚠ Mixed evidence on some claims" : "";
      return `  • ${m.method}: ${m.confidence}% | ${formatConfidenceBreakdown(m.researchConfidence)}${contradictionNote}`;
    })
    .join("\n");

  const timelinesList = output.adaptationTimelines
    .slice(0, 3)
    .map((t) => `  • ${t.adaptation}: ${t.timeline}`)
    .join("\n");

  const exerciseJustList = output.exerciseJustifications
    .slice(0, 4)
    .map((j) => `  • ${j.exercise}: ${j.primaryReason} [${j.evidenceStrength}, ${j.confidence}%]`)
    .join("\n");

  return `
══════════════════════════════════════════
RESEARCH INTELLIGENCE LAYER
══════════════════════════════════════════

Population Context: ${output.populationContext.populationLabel}
System Confidence: ${output.systemConfidence}%
${output.evidenceQualityNote}

EVIDENCE-WEIGHTED METHOD CONFIDENCE:
${methodsList}

ADAPTATION TIMELINES (evidence-grounded):
${timelinesList}

${exerciseJustList ? `EXERCISE JUSTIFICATIONS (structured evidence):\n${exerciseJustList}\n` : ""}
CONFIDENCE BREAKDOWN FORMAT:
  Performance Match × Research Support × Population Transfer × Adaptation Relevance

COACHING DIRECTIVE:
When explaining exercise or method selection, reference the research confidence scores above.
When mixed evidence exists (⚠), communicate uncertainty rather than false consensus.
Use the adaptation timelines to set accurate expectations with athletes.
══════════════════════════════════════════`.trim();
}

// ─── API Response Builder ─────────────────────────────────────────────────────

/**
 * Build the API response shape for the /api/performance-profile endpoint.
 * Extends the performance profile with research intelligence data.
 */
export function buildResearchIntelligenceApiResponse(output: ResearchIntelligenceOutput) {
  return {
    methods: output.methods.map((m) => ({
      method: m.method,
      targetQuality: m.targetQuality,
      confidence: m.confidence,
      breakdown: {
        profileMatch: m.researchConfidence.profileMatch,
        researchSupport: m.researchConfidence.researchSupport,
        populationTransfer: m.researchConfidence.populationTransfer,
        adaptationRelevance: m.researchConfidence.adaptationRelevance,
      },
      evidenceSummary: m.evidenceSummary,
      evidenceStrength: m.evidenceStrength,
      hasContradictions: m.hasContradictions,
      confidenceLabel: describeConfidenceLevel(m.confidence),
    })),
    exerciseJustifications: output.exerciseJustifications.map((j) => ({
      exercise: j.exercise,
      primaryReason: j.primaryReason,
      evidenceSupport: j.evidenceSupport,
      populationRelevance: j.populationRelevance,
      targetAdaptation: j.targetAdaptation,
      confidence: j.confidence,
      evidenceStrength: j.evidenceStrength,
      contradictionWarning: j.contradictionWarning,
    })),
    adaptationTimelines: output.adaptationTimelines,
    populationContext: output.populationContext,
    systemConfidence: output.systemConfidence,
    evidenceQualityNote: output.evidenceQualityNote,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeGoalKey(goal: string): string {
  const g = goal.toLowerCase().replace(/[_\s]/g, "");
  if (g.includes("strength")) return "strength";
  if (g.includes("athletic") || g.includes("sport") || g.includes("performance")) return "athletic_performance";
  if (g.includes("hyper") || g.includes("muscle") || g.includes("mass")) return "hypertrophy";
  if (g.includes("fat") || g.includes("weight") || g.includes("loss") || g.includes("lean")) return "fat_loss";
  if (g.includes("endurance") || g.includes("cardio") || g.includes("aerobic")) return "endurance";
  if (g.includes("power") || g.includes("explosive")) return "power";
  return "general_fitness";
}

function buildEvidenceSummary(
  method: string,
  adaptation: string,
  strength: EvidenceStrength,
  rawConfidence: number,
  compositeConfidence: number
): string {
  const strengthDescriptions: Record<EvidenceStrength, string> = {
    strong: "Strong evidence",
    moderate: "Moderate evidence",
    mixed: "Mixed evidence",
    emerging: "Emerging evidence",
    insufficient: "Limited evidence",
  };

  return `${strengthDescriptions[strength]} for ${method} → ${adaptation} (${compositeConfidence}% composite confidence)`;
}

function buildEvidenceQualityNote(methods: ResearchEnhancedMethod[]): string {
  const avgConfidence = methods.length
    ? Math.round(methods.reduce((sum, m) => sum + m.confidence, 0) / methods.length)
    : 70;

  const hasContradictions = methods.some((m) => m.hasContradictions);
  const topStrength = methods[0]?.evidenceStrength ?? "moderate";

  const qualityDesc = classifyEvidenceStrength(avgConfidence);

  let note = `Evidence quality: ${qualityDesc} (avg composite: ${avgConfidence}%)`;
  if (hasContradictions) {
    note += " — some methods have mixed findings; see breakdown for details";
  }
  return note;
}
