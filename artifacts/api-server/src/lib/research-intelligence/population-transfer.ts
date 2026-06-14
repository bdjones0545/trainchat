// ─── Population Transfer Engine ───────────────────────────────────────────────
//
// Phase 3 — Research does not transfer equally across populations.
//
// When evidence was generated on a population that differs from the athlete,
// the Transfer Engine estimates how much confidence to reduce.
//
// Transfer levels:
//   Direct (100%)   — same population as study
//   Strong (85–99%) — very similar population
//   Moderate (60–84%) — meaningfully different but relevant
//   Weak (30–59%)   — substantially different
//   Insufficient (<30%) — not enough basis to transfer
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PopulationCategory,
  TransferLevel,
  PopulationTransferRecord,
} from "./evidence-models.js";

// ─── Population Transfer Matrix ───────────────────────────────────────────────
// Transfer scores represent how well evidence generated on the SOURCE population
// applies to each TARGET population.

const POPULATION_TRANSFER_MATRIX: PopulationTransferRecord[] = [
  {
    sourcePopulation: "professional",
    transferScores: {
      professional:   { score: 100, transferLevel: "direct",    confidence: 100 },
      college:        { score: 90,  transferLevel: "strong",    confidence: 92, notes: "College to professional gap is small for well-trained athletes" },
      high_school:    { score: 70,  transferLevel: "moderate",  confidence: 80, notes: "Physical maturity and training history differences reduce transfer" },
      team_sport:     { score: 88,  transferLevel: "strong",    confidence: 88, notes: "Strong transfer when sport context is similar" },
      individual_sport: { score: 85, transferLevel: "strong",  confidence: 86 },
      tactical:       { score: 75,  transferLevel: "moderate",  confidence: 78, notes: "Tactical athletes share high training demands but different context" },
      recreational:   { score: 55,  transferLevel: "weak",      confidence: 65, notes: "Training status gap is large; adaptation magnitudes will differ" },
      male:           { score: 88,  transferLevel: "strong",    confidence: 88 },
      female:         { score: 82,  transferLevel: "strong",    confidence: 84, notes: "Most strength/power findings transfer well; some magnitude differences expected" },
      youth:          { score: 52,  transferLevel: "weak",      confidence: 60, notes: "Maturation status fundamentally changes training response" },
      masters:        { score: 60,  transferLevel: "weak",      confidence: 68, notes: "Recovery capacity and hormonal differences reduce transfer" },
      general_fitness: { score: 45, transferLevel: "weak",      confidence: 55 },
    },
  },

  {
    sourcePopulation: "college",
    transferScores: {
      college:        { score: 100, transferLevel: "direct",    confidence: 100 },
      professional:   { score: 88,  transferLevel: "strong",    confidence: 90 },
      high_school:    { score: 78,  transferLevel: "moderate",  confidence: 82, notes: "Younger athletes respond similarly but with more variability" },
      team_sport:     { score: 90,  transferLevel: "strong",    confidence: 92, notes: "Most sport science research is done on college athletes" },
      individual_sport: { score: 88, transferLevel: "strong",  confidence: 90 },
      tactical:       { score: 80,  transferLevel: "strong",    confidence: 82 },
      recreational:   { score: 65,  transferLevel: "moderate",  confidence: 72, notes: "Training status difference limits magnitude transfer" },
      male:           { score: 92,  transferLevel: "strong",    confidence: 92 },
      female:         { score: 85,  transferLevel: "strong",    confidence: 87, notes: "Sex-specific responses to training are generally well-characterized" },
      youth:          { score: 60,  transferLevel: "weak",      confidence: 68 },
      masters:        { score: 65,  transferLevel: "moderate",  confidence: 72 },
      general_fitness: { score: 55, transferLevel: "weak",      confidence: 62 },
    },
  },

  {
    sourcePopulation: "high_school",
    transferScores: {
      high_school:    { score: 100, transferLevel: "direct",    confidence: 100 },
      college:        { score: 82,  transferLevel: "strong",    confidence: 85 },
      professional:   { score: 70,  transferLevel: "moderate",  confidence: 75 },
      team_sport:     { score: 88,  transferLevel: "strong",    confidence: 88 },
      individual_sport: { score: 82, transferLevel: "strong",  confidence: 84 },
      youth:          { score: 78,  transferLevel: "moderate",  confidence: 80, notes: "Maturational differences within this range can be significant" },
      recreational:   { score: 68,  transferLevel: "moderate",  confidence: 74 },
      male:           { score: 90,  transferLevel: "strong",    confidence: 90 },
      female:         { score: 80,  transferLevel: "strong",    confidence: 83 },
      tactical:       { score: 65,  transferLevel: "moderate",  confidence: 70 },
      masters:        { score: 50,  transferLevel: "weak",      confidence: 58 },
      general_fitness: { score: 60, transferLevel: "weak",      confidence: 66 },
    },
  },

  {
    sourcePopulation: "recreational",
    transferScores: {
      recreational:   { score: 100, transferLevel: "direct",    confidence: 100 },
      general_fitness: { score: 88, transferLevel: "strong",   confidence: 90 },
      masters:        { score: 82,  transferLevel: "strong",    confidence: 84, notes: "Recreational adults and masters share similar training history" },
      college:        { score: 70,  transferLevel: "moderate",  confidence: 75 },
      high_school:    { score: 72,  transferLevel: "moderate",  confidence: 77 },
      professional:   { score: 50,  transferLevel: "weak",      confidence: 58 },
      team_sport:     { score: 62,  transferLevel: "weak",      confidence: 68 },
      individual_sport: { score: 65, transferLevel: "moderate", confidence: 70 },
      tactical:       { score: 68,  transferLevel: "moderate",  confidence: 73 },
      male:           { score: 90,  transferLevel: "strong",    confidence: 90 },
      female:         { score: 88,  transferLevel: "strong",    confidence: 90 },
      youth:          { score: 58,  transferLevel: "weak",      confidence: 64 },
    },
  },

  {
    sourcePopulation: "general_fitness",
    transferScores: {
      general_fitness: { score: 100, transferLevel: "direct",  confidence: 100 },
      recreational:   { score: 90,  transferLevel: "strong",   confidence: 92 },
      masters:        { score: 82,  transferLevel: "strong",   confidence: 84 },
      youth:          { score: 72,  transferLevel: "moderate", confidence: 76 },
      high_school:    { score: 68,  transferLevel: "moderate", confidence: 72 },
      college:        { score: 58,  transferLevel: "weak",     confidence: 64 },
      professional:   { score: 42,  transferLevel: "weak",     confidence: 50 },
      team_sport:     { score: 50,  transferLevel: "weak",     confidence: 56 },
      individual_sport: { score: 52, transferLevel: "weak",   confidence: 58 },
      tactical:       { score: 60,  transferLevel: "weak",     confidence: 66 },
      male:           { score: 88,  transferLevel: "strong",   confidence: 88 },
      female:         { score: 88,  transferLevel: "strong",   confidence: 88 },
    },
  },

  {
    sourcePopulation: "team_sport",
    transferScores: {
      team_sport:     { score: 100, transferLevel: "direct",   confidence: 100 },
      college:        { score: 90,  transferLevel: "strong",   confidence: 92 },
      professional:   { score: 86,  transferLevel: "strong",   confidence: 88 },
      high_school:    { score: 80,  transferLevel: "strong",   confidence: 83 },
      individual_sport: { score: 72, transferLevel: "moderate", confidence: 78, notes: "Speed/power adaptations transfer well; sport-specific energy system differences matter" },
      tactical:       { score: 75,  transferLevel: "moderate", confidence: 78 },
      recreational:   { score: 62,  transferLevel: "weak",     confidence: 68 },
      male:           { score: 90,  transferLevel: "strong",   confidence: 90 },
      female:         { score: 82,  transferLevel: "strong",   confidence: 86 },
      youth:          { score: 65,  transferLevel: "moderate", confidence: 70 },
      masters:        { score: 58,  transferLevel: "weak",     confidence: 63 },
      general_fitness: { score: 48, transferLevel: "weak",    confidence: 54 },
    },
  },

  {
    sourcePopulation: "individual_sport",
    transferScores: {
      individual_sport: { score: 100, transferLevel: "direct", confidence: 100 },
      college:        { score: 88,  transferLevel: "strong",   confidence: 90 },
      professional:   { score: 85,  transferLevel: "strong",   confidence: 88 },
      team_sport:     { score: 72,  transferLevel: "moderate", confidence: 78 },
      high_school:    { score: 78,  transferLevel: "moderate", confidence: 82 },
      tactical:       { score: 70,  transferLevel: "moderate", confidence: 74 },
      recreational:   { score: 62,  transferLevel: "weak",     confidence: 68 },
      male:           { score: 90,  transferLevel: "strong",   confidence: 90 },
      female:         { score: 84,  transferLevel: "strong",   confidence: 87 },
      youth:          { score: 65,  transferLevel: "moderate", confidence: 70 },
      masters:        { score: 60,  transferLevel: "weak",     confidence: 65 },
      general_fitness: { score: 48, transferLevel: "weak",    confidence: 53 },
    },
  },

  {
    sourcePopulation: "tactical",
    transferScores: {
      tactical:       { score: 100, transferLevel: "direct",   confidence: 100 },
      professional:   { score: 80,  transferLevel: "strong",   confidence: 83 },
      college:        { score: 78,  transferLevel: "moderate", confidence: 82 },
      team_sport:     { score: 74,  transferLevel: "moderate", confidence: 78 },
      recreational:   { score: 68,  transferLevel: "moderate", confidence: 73 },
      individual_sport: { score: 72, transferLevel: "moderate", confidence: 76 },
      high_school:    { score: 65,  transferLevel: "moderate", confidence: 70 },
      male:           { score: 90,  transferLevel: "strong",   confidence: 90 },
      female:         { score: 80,  transferLevel: "strong",   confidence: 84 },
      youth:          { score: 52,  transferLevel: "weak",     confidence: 58 },
      masters:        { score: 70,  transferLevel: "moderate", confidence: 75 },
      general_fitness: { score: 60, transferLevel: "weak",    confidence: 66 },
    },
  },

  {
    sourcePopulation: "youth",
    transferScores: {
      youth:          { score: 100, transferLevel: "direct",   confidence: 100 },
      high_school:    { score: 80,  transferLevel: "strong",   confidence: 83 },
      general_fitness: { score: 68, transferLevel: "moderate", confidence: 73 },
      recreational:   { score: 60,  transferLevel: "weak",     confidence: 65 },
      college:        { score: 55,  transferLevel: "weak",     confidence: 62 },
      professional:   { score: 42,  transferLevel: "weak",     confidence: 50 },
      team_sport:     { score: 62,  transferLevel: "weak",     confidence: 67 },
      individual_sport: { score: 60, transferLevel: "weak",   confidence: 65 },
      tactical:       { score: 40,  transferLevel: "weak",     confidence: 48 },
      masters:        { score: 35,  transferLevel: "weak",     confidence: 42 },
      male:           { score: 88,  transferLevel: "strong",   confidence: 88 },
      female:         { score: 85,  transferLevel: "strong",   confidence: 87 },
    },
  },

  {
    sourcePopulation: "masters",
    transferScores: {
      masters:        { score: 100, transferLevel: "direct",   confidence: 100 },
      recreational:   { score: 82,  transferLevel: "strong",   confidence: 85 },
      general_fitness: { score: 78, transferLevel: "moderate", confidence: 82 },
      tactical:       { score: 70,  transferLevel: "moderate", confidence: 75 },
      college:        { score: 60,  transferLevel: "weak",     confidence: 66 },
      professional:   { score: 52,  transferLevel: "weak",     confidence: 58 },
      team_sport:     { score: 55,  transferLevel: "weak",     confidence: 60 },
      individual_sport: { score: 58, transferLevel: "weak",   confidence: 63 },
      high_school:    { score: 45,  transferLevel: "weak",     confidence: 52 },
      youth:          { score: 35,  transferLevel: "weak",     confidence: 42 },
      male:           { score: 88,  transferLevel: "strong",   confidence: 88 },
      female:         { score: 88,  transferLevel: "strong",   confidence: 88 },
    },
  },

  {
    sourcePopulation: "male",
    transferScores: {
      male:           { score: 100, transferLevel: "direct",   confidence: 100 },
      female:         { score: 78,  transferLevel: "moderate", confidence: 82, notes: "Relative strength/power adaptations transfer well; absolute magnitudes differ. Sex differences are well-characterized in strength research" },
      college:        { score: 88,  transferLevel: "strong",   confidence: 90 },
      professional:   { score: 86,  transferLevel: "strong",   confidence: 88 },
      recreational:   { score: 78,  transferLevel: "moderate", confidence: 82 },
      team_sport:     { score: 85,  transferLevel: "strong",   confidence: 88 },
      individual_sport: { score: 82, transferLevel: "strong", confidence: 85 },
      tactical:       { score: 82,  transferLevel: "strong",   confidence: 85 },
      high_school:    { score: 80,  transferLevel: "strong",   confidence: 83 },
      youth:          { score: 68,  transferLevel: "moderate", confidence: 73 },
      masters:        { score: 72,  transferLevel: "moderate", confidence: 78 },
      general_fitness: { score: 70, transferLevel: "moderate", confidence: 75 },
    },
  },

  {
    sourcePopulation: "female",
    transferScores: {
      female:         { score: 100, transferLevel: "direct",   confidence: 100 },
      male:           { score: 78,  transferLevel: "moderate", confidence: 82, notes: "Relative adaptations transfer; absolute magnitudes differ due to hormonal differences" },
      college:        { score: 88,  transferLevel: "strong",   confidence: 90 },
      professional:   { score: 84,  transferLevel: "strong",   confidence: 87 },
      recreational:   { score: 80,  transferLevel: "strong",   confidence: 84 },
      team_sport:     { score: 82,  transferLevel: "strong",   confidence: 86 },
      individual_sport: { score: 80, transferLevel: "strong", confidence: 83 },
      high_school:    { score: 80,  transferLevel: "strong",   confidence: 83 },
      youth:          { score: 68,  transferLevel: "moderate", confidence: 74 },
      masters:        { score: 74,  transferLevel: "moderate", confidence: 79 },
      tactical:       { score: 72,  transferLevel: "moderate", confidence: 76 },
      general_fitness: { score: 72, transferLevel: "moderate", confidence: 77 },
    },
  },
];

// ─── Transfer Engine Functions ─────────────────────────────────────────────────

/**
 * Map athlete characteristics to a population category.
 * Used to convert athlete profile data into a lookup key.
 */
export function resolveAthletePopulation(params: {
  sport?: string | null;
  trainingAge?: string | null;
  age?: number | null;
}): PopulationCategory {
  const { sport, trainingAge, age } = params;

  // Age-based classification takes priority
  if (age !== null && age !== undefined) {
    if (age < 14) return "youth";
    if (age < 18) return "high_school";
    if (age < 23) return "college";
    if (age >= 40) return "masters";
  }

  // Training age heuristics
  if (trainingAge) {
    const ta = trainingAge.toLowerCase();
    if (ta.includes("elite") || ta.includes("professional") || ta.includes("national")) {
      return "professional";
    }
    if (ta.includes("college") || ta.includes("university")) return "college";
    if (ta.includes("high school")) return "high_school";
    if (ta.includes("beginner") || ta.includes("novice")) return "recreational";
  }

  // Sport context
  if (sport) {
    const s = sport.toLowerCase();
    const teamSports = ["football", "soccer", "basketball", "rugby", "hockey", "volleyball", "baseball", "lacrosse", "handball"];
    const indSports = ["track", "swimming", "tennis", "golf", "wrestling", "judo", "cycling", "triathlon", "rowing"];
    if (teamSports.some((ts) => s.includes(ts))) return "team_sport";
    if (indSports.some((is) => s.includes(is))) return "individual_sport";
  }

  return "recreational"; // sensible default
}

/**
 * Look up the transfer score from sourcePopulation to targetPopulation.
 */
export function getPopulationTransfer(
  sourcePopulation: PopulationCategory,
  targetPopulation: PopulationCategory
): { score: number; transferLevel: TransferLevel; confidence: number; notes?: string } {
  const record = POPULATION_TRANSFER_MATRIX.find((r) => r.sourcePopulation === sourcePopulation);
  if (!record) return { score: 70, transferLevel: "moderate", confidence: 70 };

  const transfer = record.transferScores[targetPopulation];
  if (!transfer) return { score: 65, transferLevel: "moderate", confidence: 65 };

  return transfer;
}

/**
 * Compute the transfer confidence for a training method recommendation.
 * Accounts for the primary populations where evidence was generated.
 */
export function computeTransferConfidence(
  evidencePopulations: PopulationCategory[],
  athletePopulation: PopulationCategory
): number {
  if (evidencePopulations.length === 0) return 65;

  // Check for direct match first
  if (evidencePopulations.includes(athletePopulation)) return 95;

  // Average transfer from all evidence populations to athlete population
  const scores = evidencePopulations.map((src) => {
    const t = getPopulationTransfer(src, athletePopulation);
    return t.score;
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(Math.min(95, avg));
}

/**
 * Describe transfer confidence in natural language for coaching output.
 */
export function describeTransferConfidence(score: number, sourcePopulations: PopulationCategory[]): string {
  const popLabels = sourcePopulations.slice(0, 2).map(formatPopulationLabel).join(", ");

  if (score >= 90) return `Direct evidence from ${popLabels || "this population"} — high confidence`;
  if (score >= 75) return `Strong transfer from ${popLabels || "similar populations"} — good confidence`;
  if (score >= 60) return `Moderate transfer from ${popLabels} — findings likely applicable with caveats`;
  if (score >= 40) return `Weak transfer from ${popLabels} — apply findings cautiously; different population`;
  return `Very limited transfer from available research populations — use expert judgment`;
}

/**
 * Human-readable label for a population category.
 */
export function formatPopulationLabel(pop: PopulationCategory): string {
  const labels: Record<PopulationCategory, string> = {
    youth: "Youth athletes",
    high_school: "High school athletes",
    college: "College athletes",
    professional: "Professional athletes",
    recreational: "Recreational athletes",
    general_fitness: "General population",
    male: "Male athletes",
    female: "Female athletes",
    team_sport: "Team sport athletes",
    individual_sport: "Individual sport athletes",
    tactical: "Tactical athletes",
    masters: "Masters athletes (40+)",
  };
  return labels[pop] ?? pop;
}

/**
 * Classify a transfer score into a TransferLevel.
 */
export function classifyTransferLevel(score: number): TransferLevel {
  if (score >= 95) return "direct";
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  if (score >= 30) return "weak";
  return "insufficient";
}
