// ─── Research Justification Engine ───────────────────────────────────────────
//
// Phase 5 — Every exercise recommendation explainable through structured evidence.
//
// Justifications are generated from:
//   - Performance need (what quality/limiter is being addressed)
//   - Adaptation target (what the exercise primarily drives)
//   - Research support (evidence strength summary)
//   - Confidence score (composite research confidence)
//   - Population relevance (how well evidence transfers to this athlete)
//
// Avoids generic AI explanations. All output is generated from structured data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExerciseJustification,
  EvidenceStrength,
  PopulationCategory,
} from "./evidence-models.js";
import { getMethodEvidence, getBestEvidenceForAdaptation, getMethodContradictions } from "./method-evidence-graph.js";
import { computeTransferConfidence, resolveAthletePopulation, describeTransferConfidence } from "./population-transfer.js";
import { getTimelineDescription } from "./adaptation-timelines.js";
import { classifyEvidenceStrength, STRENGTH_CONFIDENCE_FLOORS } from "./research-taxonomy.js";

// ─── Exercise → Method → Adaptation Map ───────────────────────────────────────
// Maps known exercises to their primary training method and adaptation target.
// This allows the engine to look up evidence without requiring AI interpretation.

const EXERCISE_EVIDENCE_MAP: Record<string, { method: string; adaptation: string; rationale: string }> = {
  // Sprint / Acceleration
  "resisted sprint 10m": { method: "Resisted Sprint Training", adaptation: "Acceleration", rationale: "Overloads horizontal force production in the acceleration phase" },
  "resisted sprint 20m": { method: "Resisted Sprint Training", adaptation: "Acceleration", rationale: "Extends the overload stimulus through the transition zone" },
  "band resisted sprint": { method: "Resisted Sprint Training", adaptation: "Acceleration", rationale: "Accommodating resistance maintains horizontal force intent" },
  "prowler push 20m": { method: "Resisted Sprint Training", adaptation: "Horizontal Force Production", rationale: "Heavy sled push develops horizontal force application patterns" },
  "wall drive": { method: "Acceleration Development", adaptation: "Acceleration", rationale: "Isolated drill to groove optimal drive-phase mechanics and trunk angle" },
  "a-march": { method: "Acceleration Development", adaptation: "Acceleration", rationale: "Technical drill reinforcing hip flexion mechanics and posture" },
  "a-skip": { method: "Acceleration Development", adaptation: "Acceleration", rationale: "Foundational sprint mechanics pattern with rhythmic coordination" },
  "flying 10m sprint": { method: "Sprinting", adaptation: "Max Velocity", rationale: "Running at max speed through a flying zone develops stride mechanics and neural drive at maximum velocity" },
  "flying 20m sprint": { method: "Sprinting", adaptation: "Max Velocity", rationale: "Longer flying sprint zone increases max velocity exposure volume" },
  "wicket run": { method: "Sprinting", adaptation: "Max Velocity", rationale: "Wickets constrain and teach optimal stride length at maximum speed" },
  "assisted sprint": { method: "Overspeed Training", adaptation: "Max Velocity", rationale: "Supramaximal velocity exposure increases the neural ceiling for stride frequency" },
  "strides 80m": { method: "Sprinting", adaptation: "Max Velocity", rationale: "Progressive acceleration through to max velocity reinforces the speed continuum" },

  // Plyometrics
  "countermovement jump": { method: "Plyometric Training", adaptation: "Lower Body Power", rationale: "Countermovement jump is the primary measure and developer of SSC-driven lower body power" },
  "depth jump": { method: "Elastic Reactive Training", adaptation: "Reactive Strength", rationale: "Depth jumps with short ground contact time are the gold standard stimulus for reactive strength and tendon stiffness" },
  "box jump": { method: "Plyometric Training", adaptation: "Lower Body Power", rationale: "Concentric-dominant jump develops peak power output and confidence in explosive hip extension" },
  "broad jump": { method: "Plyometric Training", adaptation: "Horizontal Power", rationale: "Horizontal jump develops ground reaction force in the anterior direction" },
  "triple hop": { method: "Bounding", adaptation: "Horizontal Power", rationale: "Triple hop for distance integrates elastic power, strength, and coordination over multiple contacts" },
  "loaded cmj": { method: "Contrast Training", adaptation: "Lower Body Power", rationale: "Adding load to the CMJ extends the power stimulus while training movement intent" },
  "pogo jump": { method: "Elastic Reactive Training", adaptation: "Reactive Strength", rationale: "Pogo hops train the ankle stiffness and elastic energy return critical for sprint-speed events" },
  "hurdle hops": { method: "Elastic Reactive Training", adaptation: "Reactive Strength", rationale: "Hurdle contacts demand rapid GCT and aggressive dorsiflexion to maintain stiffness" },
  "ankle hops": { method: "Elastic Reactive Training", adaptation: "Tendon Stiffness", rationale: "Bilateral ankle hops are an accessible entry stimulus for ankle and Achilles stiffness training" },
  "single-leg pogo": { method: "Elastic Reactive Training", adaptation: "Reactive Strength", rationale: "Unilateral reactive hop increases the tissue stress and specificity for sport movements" },
  "repeated bounds": { method: "Bounding", adaptation: "Horizontal Power", rationale: "Continuous bounding loads the hip extension and SSC across multiple contacts at speed" },
  "squat jump (bodyweight)": { method: "Plyometric Training", adaptation: "Lower Body Power", rationale: "Foundational concentric-dominant jump develops power intent and extension pattern" },
  "squat jump": { method: "Rate of Force Development Training", adaptation: "Rate of Force Development", rationale: "Explosive jump squat is a primary ballistic stimulus for RFD development" },
  "medicine ball slam": { method: "Rate of Force Development Training", adaptation: "Rate of Force Development", rationale: "Full-body explosive slam develops tri-planar RFD and upper body ballistic power" },
  "clap push-up": { method: "Rate of Force Development Training", adaptation: "Rate of Force Development", rationale: "Ballistic upper body movement trains explosive upper body RFD" },
  "trap bar jump": { method: "Rate of Force Development Training", adaptation: "Rate of Force Development", rationale: "Loaded jump with trap bar trains the full extension RFD pattern under greater loading" },
  "box squat jump": { method: "Rate of Force Development Training", adaptation: "Rate of Force Development", rationale: "Pause-and-explode eliminates the SSC to isolate concentric starting strength and RFD" },

  // Strength
  "trap bar deadlift": { method: "Maximal Effort Method", adaptation: "Maximal Strength", rationale: "Trap bar neutral grip deadlift develops whole-body maximal strength with reduced lumbar moment" },
  "back squat": { method: "Maximal Effort Method", adaptation: "Maximal Strength", rationale: "Back squat is the primary compound lower body strength exercise with extensive efficacy evidence" },
  "bench press": { method: "Maximal Effort Method", adaptation: "Maximal Strength", rationale: "Bench press develops horizontal pushing force production and upper body maximal strength" },
  "barbell row": { method: "Maximal Effort Method", adaptation: "Maximal Strength", rationale: "Barbell row develops horizontal pulling strength critical for posture and force transfer" },
  "romanian deadlift": { method: "Submaximal Effort Method", adaptation: "Hypertrophy", rationale: "RDL produces long-length hamstring loading under tension — the primary driver of posterior chain hypertrophy" },
  "bulgarian split squat": { method: "Submaximal Effort Method", adaptation: "Hypertrophy", rationale: "Unilateral loading with deep hip flexor stretch drives quad and glute hypertrophy" },
  "dumbbell press": { method: "Submaximal Effort Method", adaptation: "Hypertrophy", rationale: "Greater range of motion than barbell press; increased pec stretch drives hypertrophic response" },
  "goblet squat": { method: "Submaximal Effort Method", adaptation: "Structural Strength", rationale: "Counterbalanced squat allows deep pattern training with goblet load; excellent technique builder" },
  "power clean": { method: "Olympic Weightlifting", adaptation: "Explosive Strength", rationale: "Power clean requires maximal explosive effort in triple extension — the highest RFD resistance exercise" },
  "hang clean": { method: "Olympic Weightlifting", adaptation: "Explosive Strength", rationale: "Starting from hang eliminates the first pull, concentrating stimulus in the explosive second pull" },
  "hang snatch": { method: "Olympic Weightlifting", adaptation: "Explosive Strength", rationale: "Snatch grip and catch position demand full-body coordination and extreme RFD" },
  "heavy deadlift": { method: "Maximal Effort Method", adaptation: "Neural Drive", rationale: "Near-maximal pulling loads are a primary stimulus for motor unit recruitment" },
  "rack pull": { method: "Maximal Effort Method", adaptation: "Neural Drive", rationale: "Partial range allows supramaximal loading to drive neural drive adaptations" },

  // Stability / Trunk
  "plank": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Anti-extension isometric develops deep trunk musculature that protects the spine under load" },
  "pallof press": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Anti-rotation cable press builds lateral stability — critical for force transfer in rotational sport" },
  "dead bug": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Contralateral limb movement with trunk stability directly targets the diaphragm-to-psoas control system" },
  "suitcase carry": { method: "Loaded Carry Training", adaptation: "Trunk Stability", rationale: "Unilateral carry creates lateral trunk demand through real ambulation — functional stability" },
  "copenhagen plank": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Copenhagen plank is the most evidence-supported adductor and lateral trunk stability exercise" },
  "ab wheel rollout": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Progressive rollout develops anterior chain anti-extension capacity under long-lever challenge" },
  "bird dog": { method: "Isometric Training", adaptation: "Trunk Stability", rationale: "Contralateral limb coordination with neutral spine reinforces spinal stability motor patterns" },

  // COD
  "lateral bound with stick": { method: "Plyometric Training", adaptation: "Change of Direction Speed", rationale: "Lateral bound develops braking force and reactive medial-lateral power — primary COD stimulus" },
  "deceleration run 15m": { method: "Acceleration Development", adaptation: "Change of Direction Speed", rationale: "Isolated deceleration sprint trains the eccentric braking capacity that limits COD speed" },
  "505 cod drill": { method: "Acceleration Development", adaptation: "Change of Direction Speed", rationale: "Standardized 5-0-5 test and training tool for 180-degree change of direction" },

  // Aerobic
  "long slow distance run": { method: "Aerobic Base Building", adaptation: "Aerobic Capacity", rationale: "Zone 2 steady state is the foundational aerobic base-building stimulus" },
  "rowing machine zone 2": { method: "Aerobic Base Building", adaptation: "Aerobic Capacity", rationale: "Low-impact aerobic training that develops cardiac output without lower body impact loading" },
  "nasal breathing bike": { method: "Aerobic Base Building", adaptation: "Fat Oxidation", rationale: "Nasal-restricted breathing constrains intensity to Zone 2, optimizing fat oxidation stimulus" },
  "tempo run 5–8km": { method: "Lactate Threshold Training", adaptation: "Lactate Threshold", rationale: "Sustained tempo running at threshold pace is the most direct lactate threshold training stimulus" },
};

// ─── Justification Generator ───────────────────────────────────────────────────

interface JustificationContext {
  sport?: string | null;
  age?: number | null;
  trainingAge?: string | null;
  goal?: string;
  targetQuality?: string;
  limitingFactor?: string;
}

/**
 * Generate a structured, evidence-backed justification for a specific exercise.
 * Falls back gracefully when no exact data is available.
 */
export function generateResearchJustification(
  exercise: string,
  context: JustificationContext
): ExerciseJustification {
  const key = exercise.toLowerCase().trim();
  const exerciseData = EXERCISE_EVIDENCE_MAP[key] ?? findPartialMatch(key);

  const athletePopulation = resolveAthletePopulation({
    sport: context.sport,
    age: context.age,
    trainingAge: context.trainingAge,
  });

  if (!exerciseData) {
    return buildFallbackJustification(exercise, context, athletePopulation);
  }

  const methodEvidence = getMethodEvidence(exerciseData.method);
  const bestFinding = getBestEvidenceForAdaptation(exerciseData.method, exerciseData.adaptation);
  const contradictions = getMethodContradictions(exerciseData.method);

  const rawConfidence = bestFinding?.confidence ?? 70;
  const evidenceStrength = bestFinding?.strength ?? "moderate";
  const evidenceLevel = bestFinding?.primaryLevel ?? "controlled_study";
  const populations = bestFinding?.populationSupport ?? methodEvidence?.primaryPopulations ?? ["college"];

  const transferConfidence = computeTransferConfidence(
    populations as PopulationCategory[],
    athletePopulation
  );

  const compositeConfidence = Math.round(
    rawConfidence * 0.50 +
    transferConfidence * 0.30 +
    (STRENGTH_CONFIDENCE_FLOORS[evidenceStrength] ?? 55) * 0.20
  );

  const transferDescription = describeTransferConfidence(transferConfidence, populations as PopulationCategory[]);

  const performanceNeed = buildPerformanceNeedStatement(
    exercise,
    exerciseData.adaptation,
    context.targetQuality,
    context.limitingFactor
  );

  const evidenceSupportStatement = buildEvidenceSupportStatement(
    exerciseData.method,
    exerciseData.adaptation,
    evidenceStrength,
    rawConfidence
  );

  const timelineNote = getTimelineDescription(exerciseData.adaptation, athletePopulation);

  const contradictionWarning = buildContradictionWarning(
    contradictions,
    exerciseData.adaptation
  );

  return {
    exercise,
    primaryReason: performanceNeed,
    evidenceSupport: `${evidenceSupportStatement}. ${timelineNote}.`,
    populationRelevance: transferDescription,
    targetAdaptation: exerciseData.adaptation,
    confidence: Math.min(97, compositeConfidence),
    evidenceStrength,
    contradictionWarning: contradictionWarning || undefined,
  };
}

/**
 * Generate justifications for a list of exercises.
 */
export function generateBatchJustifications(
  exercises: string[],
  context: JustificationContext
): ExerciseJustification[] {
  return exercises.map((e) => generateResearchJustification(e, context));
}

// ─── Statement Builders ────────────────────────────────────────────────────────

function buildPerformanceNeedStatement(
  exercise: string,
  adaptation: string,
  targetQuality?: string,
  limitingFactor?: string
): string {
  const exerciseData = EXERCISE_EVIDENCE_MAP[exercise.toLowerCase()] ?? findPartialMatch(exercise.toLowerCase());
  const baseRationale = exerciseData?.rationale;

  if (limitingFactor && targetQuality) {
    return `Selected to address ${limitingFactor} by developing ${targetQuality}. ${baseRationale ?? `Targets ${adaptation} directly.`}`;
  }
  if (targetQuality) {
    return `Targets ${targetQuality} — the priority quality for this athlete. ${baseRationale ?? ""}`.trim();
  }
  return baseRationale ?? `Selected to develop ${adaptation} — a primary performance adaptation for this goal.`;
}

function buildEvidenceSupportStatement(
  method: string,
  adaptation: string,
  strength: EvidenceStrength,
  confidence: number
): string {
  const strengthDescriptions: Record<EvidenceStrength, string> = {
    strong: "Strong evidence",
    moderate: "Moderate evidence",
    mixed: "Mixed evidence — benefits are likely but not universal",
    emerging: "Emerging evidence — early findings are promising",
    insufficient: "Limited evidence — selection based on mechanistic reasoning",
  };

  const desc = strengthDescriptions[strength];
  return `${desc} (${confidence}% confidence) supports ${method} for developing ${adaptation}`;
}

function buildContradictionWarning(
  contradictions: ReturnType<typeof getMethodContradictions>,
  adaptation: string
): string | null {
  for (const c of contradictions) {
    const mixed = c.mixedEvidence.find(
      (m) =>
        m.adaptation.toLowerCase().includes(adaptation.toLowerCase().split(" ")[0] ?? "") ||
        adaptation.toLowerCase().includes(m.adaptation.toLowerCase().split(" ")[0] ?? "")
    );
    if (mixed) {
      return `Note: Evidence is mixed for ${mixed.adaptation} (confidence: ${mixed.confidence}%). ${c.resolutionGuidance ?? "Use alongside other methods."}`;
    }
  }
  return null;
}

function buildFallbackJustification(
  exercise: string,
  context: JustificationContext,
  population: PopulationCategory
): ExerciseJustification {
  const targetQuality = context.targetQuality ?? "physical performance";
  return {
    exercise,
    primaryReason: `Selected to support development of ${targetQuality} based on performance profile analysis.`,
    evidenceSupport: "Mechanistic reasoning supports this selection. Specific research data for this exact exercise variant is limited — the selection is based on its training method category.",
    populationRelevance: "Evidence is extrapolated from broadly applicable training method research.",
    targetAdaptation: targetQuality,
    confidence: 65,
    evidenceStrength: "moderate",
  };
}

// ─── Partial Match Lookup ──────────────────────────────────────────────────────

function findPartialMatch(key: string): { method: string; adaptation: string; rationale: string } | null {
  // Try each word in the exercise name against the evidence map keys
  const keyWords = key.split(/[\s-]+/).filter((w) => w.length > 3);
  for (const word of keyWords) {
    for (const [mapKey, data] of Object.entries(EXERCISE_EVIDENCE_MAP)) {
      if (mapKey.includes(word) || word.includes(mapKey.split(" ")[0] ?? "")) {
        return data;
      }
    }
  }
  return null;
}

// ─── Contradiction Engine (Phase 6) ───────────────────────────────────────────

export interface ContradictionSummary {
  topic: string;
  strongConsensus: string[];
  uncertainAreas: string[];
  resolutionGuidance: string;
  shouldSurface: boolean; // whether to show this uncertainty to the athlete
}

/**
 * Retrieve contradictions for a specific training method in a human-readable format.
 * Used by Atlas to communicate uncertainty rather than pretending all evidence is unanimous.
 */
export function getContradictionSummary(methodName: string): ContradictionSummary[] {
  const contradictions = getMethodContradictions(methodName);
  return contradictions.map((c) => ({
    topic: c.topic,
    strongConsensus: c.strongEvidence.map((e) => `${e.adaptation} (${e.confidence}% confidence)`),
    uncertainAreas: [
      ...c.mixedEvidence.map((e) => `${e.adaptation}: mixed evidence (${e.confidence}%)`),
      ...c.emergingEvidence.map((e) => `${e.adaptation}: emerging evidence (${e.confidence}%)`),
    ],
    resolutionGuidance: c.resolutionGuidance ?? "Apply with individualized judgment given the mixed findings.",
    shouldSurface: c.mixedEvidence.length > 0 || c.emergingEvidence.length > 0,
  }));
}

/**
 * Classify all adaptations for a method by evidence category.
 * Returns an object that powers the full Phase 6 contradiction display.
 */
export function classifyMethodEvidence(methodName: string): {
  strongEvidence: Array<{ adaptation: string; confidence: number }>;
  moderateEvidence: Array<{ adaptation: string; confidence: number }>;
  mixedEvidence: Array<{ adaptation: string; confidence: number }>;
  emergingEvidence: Array<{ adaptation: string; confidence: number }>;
  insufficientEvidence: Array<{ adaptation: string; confidence: number }>;
} {
  const method = getMethodEvidence(methodName);
  if (!method) {
    return { strongEvidence: [], moderateEvidence: [], mixedEvidence: [], emergingEvidence: [], insufficientEvidence: [] };
  }

  const result = {
    strongEvidence: [] as Array<{ adaptation: string; confidence: number }>,
    moderateEvidence: [] as Array<{ adaptation: string; confidence: number }>,
    mixedEvidence: [] as Array<{ adaptation: string; confidence: number }>,
    emergingEvidence: [] as Array<{ adaptation: string; confidence: number }>,
    insufficientEvidence: [] as Array<{ adaptation: string; confidence: number }>,
  };

  for (const finding of method.supportedAdaptations) {
    const entry = { adaptation: finding.adaptation, confidence: finding.confidence };
    if (finding.strength === "strong") result.strongEvidence.push(entry);
    else if (finding.strength === "moderate") result.moderateEvidence.push(entry);
    else if (finding.strength === "mixed") result.mixedEvidence.push(entry);
    else if (finding.strength === "emerging") result.emergingEvidence.push(entry);
    else result.insufficientEvidence.push(entry);
  }

  // Also surface contradictory mixed evidence
  for (const contradiction of method.contradictions) {
    for (const mixed of contradiction.mixedEvidence) {
      const exists = result.mixedEvidence.some((e) => e.adaptation === mixed.adaptation);
      if (!exists) result.mixedEvidence.push({ adaptation: mixed.adaptation, confidence: mixed.confidence });
    }
    for (const emerging of contradiction.emergingEvidence) {
      const exists = result.emergingEvidence.some((e) => e.adaptation === emerging.adaptation);
      if (!exists) result.emergingEvidence.push({ adaptation: emerging.adaptation, confidence: emerging.confidence });
    }
  }

  return result;
}
