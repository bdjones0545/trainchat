// ─── Adaptation Timeline Engine ───────────────────────────────────────────────
//
// Phase 4 — Evidence-grounded timelines for 15+ physical adaptations.
//
// Timeline structure:
//   noticeableWeeks  — first measurable signal in training data
//   meaningfulWeeks  — practically significant change in performance
//   substantialWeeks — near-ceiling development under optimal conditions
//
// Population modifiers adjust timelines for different athlete profiles.
// Confidence scores reflect how replicable these timelines are in the literature.
// ─────────────────────────────────────────────────────────────────────────────

import type { AdaptationTimelineEntry, PopulationCategory } from "./evidence-models.js";

// ─── Timeline Database ────────────────────────────────────────────────────────

export const ADAPTATION_TIMELINES: AdaptationTimelineEntry[] = [

  {
    adaptation: "Acceleration",
    noticeableWeeks: 2,
    meaningfulWeeks: 4,
    substantialWeeks: 10,
    confidence: 88,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "high_school", modifier: 0.90, notes: "Younger athletes adapt slightly faster; high variability" },
      { population: "professional", modifier: 1.10, notes: "Elite athletes show smaller relative improvements; ceiling effect" },
      { population: "recreational", modifier: 0.85, notes: "Untrained individuals see larger early gains due to low baseline" },
      { population: "masters", modifier: 1.20, notes: "Slower neural and structural adaptation rates" },
    ],
    limitingVariables: [
      "Sprint volume and intensity accumulation",
      "Concurrent strength training adequacy",
      "Technical mechanics correction timeline",
      "Recovery quality between sessions",
    ],
  },

  {
    adaptation: "Max Velocity",
    noticeableWeeks: 3,
    meaningfulWeeks: 6,
    substantialWeeks: 14,
    confidence: 82,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "professional", modifier: 1.20, notes: "Marginal gains at elite level — smaller improvements, longer timelines" },
      { population: "recreational", modifier: 0.80, notes: "Larger improvements possible from low baseline" },
      { population: "youth", modifier: 0.85, notes: "Adaptation interacts with maturational development" },
    ],
    limitingVariables: [
      "Reactive strength and tendon stiffness development",
      "Stride mechanics quality",
      "Overspeed exposure frequency",
      "Maximal sprint distance and volume",
    ],
  },

  {
    adaptation: "Change of Direction Speed",
    noticeableWeeks: 3,
    meaningfulWeeks: 5,
    substantialWeeks: 12,
    confidence: 80,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "recreational", modifier: 0.85, notes: "Larger gains early due to technique learning" },
      { population: "professional", modifier: 1.15, notes: "Elite athletes already optimized; improvement more gradual" },
      { population: "youth", modifier: 0.80, notes: "High trainability due to motor learning receptivity" },
    ],
    limitingVariables: [
      "Eccentric strength development for deceleration",
      "Reactive plyometric capacity",
      "Sport-specific COD pattern complexity",
      "Braking mechanics refinement",
    ],
  },

  {
    adaptation: "Vertical Jump / Lower Body Power",
    noticeableWeeks: 2,
    meaningfulWeeks: 4,
    substantialWeeks: 10,
    confidence: 90,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "youth", modifier: 0.80, notes: "High motor learning receptivity; maturational phase matters" },
      { population: "professional", modifier: 1.15, notes: "Smaller magnitude improvements at elite baseline" },
      { population: "masters", modifier: 1.25, notes: "Power adaptations slower and smaller in magnitude" },
      { population: "recreational", modifier: 0.80, notes: "Fastest improvements — lowest initial level" },
    ],
    limitingVariables: [
      "Plyometric volume and intensity progression",
      "Concurrent strength training base",
      "Reactive strength index baseline",
      "Neuromuscular fatigue management",
    ],
  },

  {
    adaptation: "Horizontal Power",
    noticeableWeeks: 3,
    meaningfulWeeks: 5,
    substantialWeeks: 12,
    confidence: 80,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "recreational", modifier: 0.85, notes: "Fast early gains from technique and strength" },
      { population: "professional", modifier: 1.10, notes: "More marginal improvements at elite baseline" },
    ],
    limitingVariables: [
      "Resisted sprint load progression",
      "Bounding volume and distance",
      "Force-velocity profile balance",
      "Horizontal force vector coaching quality",
    ],
  },

  {
    adaptation: "Maximal Strength",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 16,
    confidence: 96,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "recreational", modifier: 0.70, notes: "Fastest and largest relative improvements in untrained individuals" },
      { population: "youth", modifier: 0.80, notes: "Strong adaptations but primarily neural in pre-pubescent" },
      { population: "professional", modifier: 1.30, notes: "Smallest relative improvements; ceiling effects common" },
      { population: "masters", modifier: 1.20, notes: "Strength adaptations occur but at a slower rate; still highly trainable" },
      { population: "female", modifier: 0.90, notes: "Similar relative strength gains; smaller absolute baseline differences" },
    ],
    limitingVariables: [
      "Progressive overload adherence",
      "Protein intake and nutrition adequacy",
      "Sleep quality and recovery",
      "Training age and baseline strength level",
      "Neural adaptation ceiling reached around 6–8 weeks",
    ],
  },

  {
    adaptation: "Relative Strength",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 16,
    confidence: 88,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "recreational", modifier: 0.75, notes: "Fastest relative strength gains from low baseline" },
      { population: "professional", modifier: 1.30, notes: "Hard to improve relative strength at elite level" },
      { population: "masters", modifier: 1.20, notes: "More challenging due to lower anabolic hormone environment" },
    ],
    limitingVariables: [
      "Caloric intake relative to training demand",
      "Concurrent hypertrophy goals (opposing)",
      "Training age ceiling proximity",
    ],
  },

  {
    adaptation: "Rate of Force Development",
    noticeableWeeks: 2,
    meaningfulWeeks: 4,
    substantialWeeks: 8,
    confidence: 86,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "recreational", modifier: 0.75, notes: "Large early neural gains" },
      { population: "professional", modifier: 1.20, notes: "Small marginal RFD improvements at elite level" },
      { population: "masters", modifier: 1.25, notes: "Slower motor unit recruitment adaptation" },
      { population: "youth", modifier: 0.85, notes: "Good trainability; maturational interactions exist" },
    ],
    limitingVariables: [
      "Explosive intent in training (effort quality matters more than load)",
      "Maximal strength base development",
      "Plyometric training volume",
      "Rest interval adequacy between RFD-focused sets",
    ],
  },

  {
    adaptation: "Tendon Stiffness",
    noticeableWeeks: 6,
    meaningfulWeeks: 10,
    substantialWeeks: 20,
    confidence: 78,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "youth", modifier: 0.75, notes: "Tendons adapt faster in younger athletes during growth" },
      { population: "masters", modifier: 1.35, notes: "Tendon adaptation rates decrease with age" },
      { population: "professional", modifier: 1.10, notes: "Already-adapted tendons show smaller incremental changes" },
    ],
    limitingVariables: [
      "Reactive plyometric volume and contact time",
      "Isometric loading frequency",
      "Blood flow and nutrition to tendon tissue",
      "Previous tendinopathy history",
    ],
  },

  {
    adaptation: "Elasticity",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 16,
    confidence: 76,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "youth", modifier: 0.80, notes: "High elastic energy utilization potential; fast adaptations" },
      { population: "masters", modifier: 1.30, notes: "Tendon compliance increases with age, impairing elastic return" },
      { population: "professional", modifier: 1.10, notes: "Already highly developed in elite sprinters and jumpers" },
    ],
    limitingVariables: [
      "Ground contact time reduction in training",
      "Ankle and Achilles stiffness development",
      "SSC cycle efficiency coaching",
      "Footwear and surface interaction",
    ],
  },

  {
    adaptation: "Work Capacity",
    noticeableWeeks: 3,
    meaningfulWeeks: 6,
    substantialWeeks: 12,
    confidence: 84,
    primaryEvidenceLevel: "systematic_review",
    populationModifiers: [
      { population: "recreational", modifier: 0.75, notes: "Large gains possible from very low baseline" },
      { population: "general_fitness", modifier: 0.70, notes: "Fastest relative improvements from untrained state" },
      { population: "professional", modifier: 1.20, notes: "Already high baseline; improvements are marginal" },
      { population: "masters", modifier: 1.15, notes: "Slower adaptation with adequate response" },
    ],
    limitingVariables: [
      "Training volume progression rate",
      "Recovery between sessions",
      "Concurrent energy system training",
    ],
  },

  {
    adaptation: "Aerobic Capacity",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 20,
    confidence: 92,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "recreational", modifier: 0.70, notes: "Fastest VO2 Max improvements due to very low baseline; 15–20% improvements common" },
      { population: "general_fitness", modifier: 0.65, notes: "Largest relative improvements possible" },
      { population: "professional", modifier: 1.35, notes: "Elite aerobic athletes are near their genetic ceiling; marginal improvements only" },
      { population: "masters", modifier: 1.20, notes: "VO2 Max trainability persists but at lower rate in older adults" },
      { population: "youth", modifier: 0.80, notes: "High relative adaptations; absolute values scale with body size" },
    ],
    limitingVariables: [
      "Training volume accumulation rate",
      "Sleep quality and recovery management",
      "Genetic VO2 Max ceiling proximity",
      "Altitude and environmental factors",
    ],
  },

  {
    adaptation: "Muscular Endurance",
    noticeableWeeks: 3,
    meaningfulWeeks: 6,
    substantialWeeks: 12,
    confidence: 86,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "recreational", modifier: 0.80, notes: "Fast improvements from low baseline" },
      { population: "general_fitness", modifier: 0.75, notes: "Large magnitude improvements possible" },
      { population: "professional", modifier: 1.15, notes: "Already trained; smaller relative gains" },
    ],
    limitingVariables: [
      "Training volume and rep range selection",
      "Rest interval management",
      "Metabolic conditioning integration",
    ],
  },

  {
    adaptation: "Hypertrophy",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 16,
    confidence: 92,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "recreational", modifier: 0.70, notes: "Fastest muscle growth in novice trainees — 'newbie gains'" },
      { population: "youth", modifier: 0.75, notes: "Excellent hypertrophic response during adolescence with anabolic hormone support" },
      { population: "masters", modifier: 1.30, notes: "Hypertrophy is still achievable but slower; anabolic resistance in older muscle" },
      { population: "female", modifier: 1.10, notes: "Similar relative hypertrophy; smaller absolute increases" },
      { population: "professional", modifier: 1.25, notes: "Already near ceiling; marginal hypertrophy from highly trained base" },
    ],
    limitingVariables: [
      "Protein intake (1.6–2.2g/kg recommended)",
      "Caloric surplus adequacy",
      "Sleep quality (GH release timing)",
      "Progressive overload continuity",
      "Training history and prior stimulus",
    ],
  },

  {
    adaptation: "Injury Resilience",
    noticeableWeeks: 6,
    meaningfulWeeks: 12,
    substantialWeeks: 24,
    confidence: 78,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "high_school", modifier: 0.85, notes: "Strong injury prevention evidence in youth sport contexts (ACL, hamstring)" },
      { population: "masters", modifier: 1.30, notes: "Tissue remodelling and injury resilience take longer in older athletes" },
      { population: "professional", modifier: 1.00, notes: "Already high baseline; maintenance is the key goal" },
      { population: "recreational", modifier: 0.90, notes: "Good baseline improvement possible with structured training" },
    ],
    limitingVariables: [
      "Eccentric training volume and consistency",
      "Sleep and recovery quality",
      "Prior injury history",
      "Progressive return-to-sport protocol adherence",
      "Multi-joint coordination pattern quality",
    ],
  },

  {
    adaptation: "Lactate Threshold",
    noticeableWeeks: 4,
    meaningfulWeeks: 8,
    substantialWeeks: 16,
    confidence: 88,
    primaryEvidenceLevel: "meta_analysis",
    populationModifiers: [
      { population: "recreational", modifier: 0.75, notes: "Large early gains from low baseline threshold" },
      { population: "individual_sport", modifier: 1.10, notes: "Already adapted; incremental improvements require more volume" },
      { population: "professional", modifier: 1.25, notes: "Very high starting threshold; small further improvements possible" },
    ],
    limitingVariables: [
      "Threshold-specific training volume",
      "Consistency of aerobic work at intensity",
      "Race/competition specificity",
    ],
  },
];

// ─── Timeline Lookup Interface ─────────────────────────────────────────────────

/**
 * Retrieve a timeline entry for a specific adaptation by name.
 */
export function getAdaptationTimeline(
  adaptationName: string
): AdaptationTimelineEntry | null {
  const key = adaptationName.toLowerCase().trim();
  return (
    ADAPTATION_TIMELINES.find(
      (t) =>
        t.adaptation.toLowerCase() === key ||
        t.adaptation.toLowerCase().includes(key) ||
        key.includes(t.adaptation.toLowerCase().split(" ")[0] ?? "")
    ) ?? null
  );
}

/**
 * Get adjusted timeline weeks for a specific population.
 * Returns {noticeable, meaningful, substantial} adjusted by population modifier.
 */
export function getAdjustedTimeline(
  adaptationName: string,
  population: PopulationCategory
): { noticeableWeeks: number; meaningfulWeeks: number; substantialWeeks: number; confidence: number } | null {
  const timeline = getAdaptationTimeline(adaptationName);
  if (!timeline) return null;

  const modifier = timeline.populationModifiers.find((m) => m.population === population)?.modifier ?? 1.0;

  return {
    noticeableWeeks: Math.round(timeline.noticeableWeeks * modifier),
    meaningfulWeeks: Math.round(timeline.meaningfulWeeks * modifier),
    substantialWeeks: Math.round(timeline.substantialWeeks * modifier),
    confidence: timeline.confidence,
  };
}

/**
 * Format a timeline entry into a natural-language coaching statement.
 */
export function formatAdaptationTimeline(
  entry: AdaptationTimelineEntry,
  population?: PopulationCategory
): string {
  if (!population) {
    return `${entry.adaptation}: noticeable in ${entry.noticeableWeeks}w, meaningful at ${entry.meaningfulWeeks}w, substantial at ${entry.substantialWeeks}w`;
  }

  const adjusted = getAdjustedTimeline(entry.adaptation, population);
  if (!adjusted) return `${entry.adaptation}: ${entry.meaningfulWeeks}–${entry.substantialWeeks}w`;

  return `${entry.adaptation}: noticeable ~${adjusted.noticeableWeeks}w, meaningful ~${adjusted.meaningfulWeeks}w, substantial ~${adjusted.substantialWeeks}w`;
}

/**
 * Get a concise timeline description for use in coaching explanations.
 */
export function getTimelineDescription(adaptationName: string, population?: PopulationCategory): string {
  const timeline = getAdaptationTimeline(adaptationName);
  if (!timeline) return "Timeline varies — typically 4–12 weeks for initial adaptation";

  if (population) {
    const adjusted = getAdjustedTimeline(adaptationName, population);
    if (adjusted) {
      return `Expect first results in ${adjusted.noticeableWeeks}–${adjusted.meaningfulWeeks} weeks, with meaningful gains by week ${adjusted.meaningfulWeeks}–${adjusted.substantialWeeks}`;
    }
  }

  return `Expect first results in ${timeline.noticeableWeeks}–${timeline.meaningfulWeeks} weeks, with meaningful gains by week ${timeline.meaningfulWeeks}–${timeline.substantialWeeks}`;
}
