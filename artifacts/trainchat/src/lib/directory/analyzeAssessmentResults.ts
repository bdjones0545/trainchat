import { ASSESSMENTS, getAssessmentByName, type Assessment } from "@/data/directory/assessments";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssessmentInput {
  assessmentName: string;
  score: string | number;
  unit?: string;
}

export interface AssessmentAnalysis {
  assessment: Assessment;
  scoreLabel: string;
  performanceTier: "elite" | "good" | "average" | "below";
  detectedWeaknesses: string[];
  relevantQualities: string[];
  recommendedMethods: Array<{ method: string; priority: number }>;
  recommendedProducts: Array<{ product: string; role: string }>;
  recommendedExercises: Array<{ exercise: string; prescription: string }>;
  expectedAdaptation: string;
  narrative: string;
}

// ─── Tier Classification ───────────────────────────────────────────────────────

function classifyTier(assessment: Assessment, score: string | number): "elite" | "good" | "average" | "below" {
  const scoreStr = String(score).toLowerCase().trim();
  const nd = assessment.normativeData;

  // Heuristic: if user passes a textual tier label, use it directly
  if (["elite", "good", "average", "below"].includes(scoreStr)) {
    return scoreStr as "elite" | "good" | "average" | "below";
  }

  // Try to classify numeric scores for time-based tests (lower = better)
  const timeBased = ["Speed", "Conditioning"].includes(assessment.category) && assessment.unit === "seconds";
  const numericScore = parseFloat(scoreStr);

  if (!isNaN(numericScore) && nd) {
    if (timeBased) {
      // For timed tests, extract the threshold from normative strings
      const eliteThreshold = nd.elite ? parseFloat(nd.elite.replace(/[^0-9.]/g, "")) : Infinity;
      const goodThreshold = nd.good ? parseFloat(nd.good.split("–")[1]?.replace(/[^0-9.]/g, "") ?? "Infinity") : Infinity;
      const avgThreshold = nd.average ? parseFloat(nd.average.split("–")[1]?.replace(/[^0-9.]/g, "") ?? "Infinity") : Infinity;

      if (numericScore <= eliteThreshold) return "elite";
      if (numericScore <= goodThreshold) return "good";
      if (numericScore <= avgThreshold) return "average";
      return "below";
    } else {
      // For distance/force tests, higher = better — pull the lower bound
      const eliteThreshold = nd.elite ? parseFloat(nd.elite.replace(/[^0-9.]/g, "")) : 0;
      const goodThreshold = nd.good ? parseFloat(nd.good.split("–")[0]?.replace(/[^0-9.]/g, "") ?? "0") : 0;
      const avgThreshold = nd.average ? parseFloat(nd.average.split("–")[0]?.replace(/[^0-9.]/g, "") ?? "0") : 0;

      if (numericScore >= eliteThreshold) return "elite";
      if (numericScore >= goodThreshold) return "good";
      if (numericScore >= avgThreshold) return "average";
      return "below";
    }
  }

  // Default to below if we can't classify
  return "below";
}

// ─── Narrative Generator ──────────────────────────────────────────────────────

function generateNarrative(assessment: Assessment, tier: "elite" | "good" | "average" | "below", weaknesses: string[]): string {
  const tierPhrases: Record<string, string> = {
    elite: `This result places you in the elite tier for ${assessment.name}. Maintain this quality with periodic reassessment and continue your current programming.`,
    good: `Your ${assessment.name} score is above average and reflects a solid physical base. Minor refinements to training methods can push this into the elite range.`,
    average: `Your ${assessment.name} result indicates a meaningful development opportunity. Targeted training focused on ${weaknesses[0] ?? "the relevant qualities"} will drive the fastest improvement.`,
    below: `Your ${assessment.name} score indicates a significant gap that should be prioritized in your programming. Addressing ${weaknesses.slice(0, 2).join(" and ")} through the recommended methods below will produce the most impactful gains.`,
  };

  return tierPhrases[tier] ?? tierPhrases.average;
}

// ─── Main Utility ─────────────────────────────────────────────────────────────

export function analyzeAssessmentResults(input: AssessmentInput): AssessmentAnalysis | null {
  const assessment = getAssessmentByName(input.assessmentName);
  if (!assessment) return null;

  const tier = classifyTier(assessment, input.score);
  const scoreLabel = `${input.score}${input.unit ?? (assessment.unit !== "qualitative" ? ` ${assessment.unit}` : "")}`;

  // Weaknesses: pull from method links if tier is not elite
  const detectedWeaknesses =
    tier === "elite"
      ? []
      : [...new Set(assessment.methods.map((m) => m.weakness))];

  // Relevant qualities: all measured qualities; flag as weak if not elite
  const relevantQualities = assessment.qualities.map((q) => q.quality);

  // Methods: filtered by tier (below/average = all; good = top 2; elite = none)
  const methodLimit = tier === "elite" ? 0 : tier === "good" ? 2 : assessment.methods.length;
  const recommendedMethods = assessment.methods
    .sort((a, b) => a.priority - b.priority)
    .slice(0, methodLimit)
    .map((m) => ({ method: m.method, priority: m.priority }));

  // Products
  const recommendedProducts = assessment.products.map((p) => ({ product: p.product, role: p.role }));

  // Exercises: all if not elite, none if elite
  const recommendedExercises =
    tier === "elite"
      ? []
      : assessment.exercises.map((e) => ({ exercise: e.exercise, prescription: e.prescription }));

  const narrative = generateNarrative(assessment, tier, detectedWeaknesses);

  return {
    assessment,
    scoreLabel,
    performanceTier: tier,
    detectedWeaknesses,
    relevantQualities,
    recommendedMethods,
    recommendedProducts,
    recommendedExercises,
    expectedAdaptation: assessment.expectedAdaptation,
    narrative,
  };
}

// ─── Batch Analysis ───────────────────────────────────────────────────────────

export function analyzeMultipleAssessments(inputs: AssessmentInput[]): AssessmentAnalysis[] {
  return inputs.flatMap((input) => {
    const result = analyzeAssessmentResults(input);
    return result ? [result] : [];
  });
}

// ─── Priority Weakness Finder ─────────────────────────────────────────────────

export function findPriorityWeaknesses(
  inputs: AssessmentInput[]
): { quality: string; count: number; assessments: string[] }[] {
  const qualityMap = new Map<string, string[]>();

  for (const input of inputs) {
    const analysis = analyzeAssessmentResults(input);
    if (!analysis || analysis.performanceTier === "elite") continue;

    for (const quality of analysis.relevantQualities) {
      const existing = qualityMap.get(quality) ?? [];
      qualityMap.set(quality, [...existing, analysis.assessment.name]);
    }
  }

  return [...qualityMap.entries()]
    .map(([quality, assessments]) => ({ quality, count: assessments.length, assessments }))
    .sort((a, b) => b.count - a.count);
}

// ─── Example Pathways ────────────────────────────────────────────────────────

export interface AssessmentPathway {
  assessmentName: string;
  weakness: string;
  quality: string;
  method: string;
  exercise: string;
  adaptation: string;
}

export function getExamplePathways(): AssessmentPathway[] {
  const examples: Array<{ id: number; weaknessIdx: number }> = [
    { id: 1, weaknessIdx: 0 },  // 10 Yard Sprint → Acceleration
    { id: 7, weaknessIdx: 0 },  // CMJ → Lower Body Power
    { id: 13, weaknessIdx: 2 }, // IMTP → RFD
    { id: 11, weaknessIdx: 0 }, // RSI → Reactive Strength
    { id: 5, weaknessIdx: 0 },  // 505 COD → COD Speed
    { id: 21, weaknessIdx: 0 }, // VO2 Max → Aerobic Capacity
  ];

  return examples.flatMap(({ id, weaknessIdx }) => {
    const a = ASSESSMENTS.find((x) => x.id === id);
    if (!a || !a.methods[weaknessIdx] || !a.exercises[0] || !a.qualities[0]) return [];
    return [{
      assessmentName: a.name,
      weakness: a.methods[weaknessIdx].weakness,
      quality: a.qualities[0].quality,
      method: a.methods[weaknessIdx].method,
      exercise: a.exercises[0].exercise,
      adaptation: a.expectedAdaptation,
    }];
  });
}
