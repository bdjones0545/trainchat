/**
 * Athlete DNA Synthesis Layer (T007)
 *
 * Builds a persistent, deterministic athlete identity model from
 * profile data + behavioral signals. Outputs a compact identity
 * string per dimension that Atlas injects into context.
 *
 * Architecture: fully deterministic — no AI calls, no DB reads,
 * runs synchronously from the calibration payload.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AthleteDNA {
  recoveryIdentity: string;
  fatigueIdentity: string;
  progressionIdentity: string;
  coachingIdentity: string;
  adherenceIdentity: string;
  adaptationResponsiveness: string;
  generatedAt: string;
}

export interface PrecisionDimensions {
  contextCompleteness: number;    // 0-30
  behavioralProfile: number;      // 0-20
  recoveryConfidence: number;     // 0-15
  adaptationCertainty: number;    // 0-15
  memorySignals: number;          // 0-10
  longitudinalExperience: number; // 0-10
}

export interface CoachingPrecisionResult {
  score: number;
  dimensions: PrecisionDimensions;
  tier: "basic" | "context_aware" | "adaptive" | "performance_intelligence";
  tierLabel: string;
  tierDescription: string;
}

export interface AthleteLearnedSummary {
  understood: string[];
  implications: string[];
}

interface ProfileInput {
  experienceLevel?: string | null;
  yearsTraining?: number | null;
  primaryGoal?: string | null;
  trainingGoal?: string | null;
  injuries?: string | null;
  equipmentAccess?: string | null;
  daysPerWeek?: number | null;
  sessionDuration?: number | null;
  sportFocus?: string | null;
  exercisesToAvoid?: string | null;
  scheduleConsistency?: string | null;
  recoveryConsistency?: string | null;
  coachingStylePreference?: string | null;
  autoregulationComfort?: string | null;
  motivationStyle?: string | null;
  confidenceUnderFatigue?: string | null;
  trainingAggression?: string | null;
  exerciseConfidence?: string | null;
}

// ─── Coaching Precision System ────────────────────────────────────────────────

const TIER_MAP: Record<string, { label: string; description: string }> = {
  basic: {
    label: "Basic Coaching",
    description: "Generic adaptations only",
  },
  context_aware: {
    label: "Context-Aware Coaching",
    description: "Better exercise and recovery decisions",
  },
  adaptive: {
    label: "Adaptive Coaching",
    description: "Atlas can personalize progression and fatigue management",
  },
  performance_intelligence: {
    label: "Performance Intelligence",
    description: "Longitudinal adaptation, predictive recovery, and athlete-specific coaching",
  },
};

export function calculateCoachingPrecision(profile: ProfileInput): CoachingPrecisionResult {
  const d: PrecisionDimensions = {
    contextCompleteness: 0,
    behavioralProfile: 0,
    recoveryConfidence: 0,
    adaptationCertainty: 0,
    memorySignals: 0,
    longitudinalExperience: 0,
  };

  const goal = profile.primaryGoal ?? profile.trainingGoal;

  // 1. Context completeness (max 30)
  if (profile.experienceLevel) d.contextCompleteness += 5;
  if (profile.yearsTraining != null && profile.yearsTraining >= 0) d.contextCompleteness += 3;
  if (goal) d.contextCompleteness += 8;
  if (profile.injuries !== undefined && profile.injuries !== null) d.contextCompleteness += 5;
  if (profile.equipmentAccess) d.contextCompleteness += 5;
  if (profile.daysPerWeek != null) d.contextCompleteness += 2;
  if (profile.sessionDuration != null) d.contextCompleteness += 2;

  // 2. Behavioral profile (max 20)
  if (profile.scheduleConsistency) d.behavioralProfile += 10;
  if (profile.trainingAggression) d.behavioralProfile += 5;
  if (profile.motivationStyle) d.behavioralProfile += 5;

  // 3. Recovery confidence (max 15)
  if (profile.recoveryConsistency) d.recoveryConfidence += 10;
  if (profile.confidenceUnderFatigue) d.recoveryConfidence += 5;

  // 4. Adaptation certainty (max 15)
  if (profile.autoregulationComfort) d.adaptationCertainty += 8;
  if (profile.exerciseConfidence) d.adaptationCertainty += 7;

  // 5. Memory signals (max 10)
  if (profile.sportFocus) d.memorySignals += 5;
  if (profile.exercisesToAvoid) d.memorySignals += 5;

  // 6. Longitudinal experience (max 10)
  const years = profile.yearsTraining ?? 0;
  if (years >= 5) d.longitudinalExperience = 10;
  else if (years >= 2) d.longitudinalExperience = 7;
  else if (years >= 1) d.longitudinalExperience = 5;
  else if (years > 0) d.longitudinalExperience = 3;

  const score = Math.min(
    100,
    d.contextCompleteness + d.behavioralProfile + d.recoveryConfidence +
    d.adaptationCertainty + d.memorySignals + d.longitudinalExperience,
  );

  let tier: CoachingPrecisionResult["tier"];
  if (score >= 76) tier = "performance_intelligence";
  else if (score >= 51) tier = "adaptive";
  else if (score >= 26) tier = "context_aware";
  else tier = "basic";

  return {
    score,
    dimensions: d,
    tier,
    tierLabel: TIER_MAP[tier].label,
    tierDescription: TIER_MAP[tier].description,
  };
}

// ─── Athlete DNA Builder ──────────────────────────────────────────────────────

export function buildAthleteDNA(profile: ProfileInput): AthleteDNA {
  return {
    recoveryIdentity: buildRecoveryIdentity(profile),
    fatigueIdentity: buildFatigueIdentity(profile),
    progressionIdentity: buildProgressionIdentity(profile),
    coachingIdentity: buildCoachingIdentity(profile),
    adherenceIdentity: buildAdherenceIdentity(profile),
    adaptationResponsiveness: buildAdaptationResponsiveness(profile),
    generatedAt: new Date().toISOString(),
  };
}

function buildRecoveryIdentity(p: ProfileInput): string {
  const recovery = (p.recoveryConsistency ?? "").toLowerCase();
  const confidence = (p.confidenceUnderFatigue ?? "").toLowerCase();

  if (recovery.includes("prioriti")) {
    return confidence.includes("high") || confidence.includes("back off")
      ? "Strong recovery focus / high fatigue awareness"
      : "Recovery-prioritized / moderate fatigue tolerance";
  }
  if (recovery.includes("often over") || recovery.includes("inconsist")) {
    return "Inconsistent recovery — elevated deload sensitivity";
  }
  if (recovery.includes("balanced")) {
    return "Balanced recovery approach — standard deload cycles";
  }
  return "Recovery profile unknown — adaptive defaults applied";
}

function buildFatigueIdentity(p: ProfileInput): string {
  const confidence = (p.confidenceUnderFatigue ?? "").toLowerCase();
  const aggression = (p.trainingAggression ?? "").toLowerCase();

  if (confidence.includes("low") || confidence.includes("push through") || aggression.includes("all-out")) {
    return "High fatigue accumulation risk — autoregulation strongly recommended";
  }
  if (confidence.includes("high") && (aggression.includes("moderate") || aggression.includes("conservative"))) {
    return "Stable fatigue responder — predictable adaptation window";
  }
  if (aggression.includes("aggressive")) {
    return "High effort tendency — fatigue monitoring active";
  }
  return "Moderate fatigue tolerance — standard deload protocols";
}

function buildProgressionIdentity(p: ProfileInput): string {
  const level = (p.experienceLevel ?? "").toLowerCase();
  const years = p.yearsTraining ?? 0;
  const aggression = (p.trainingAggression ?? "").toLowerCase();

  if (level === "advanced" || years >= 5) {
    return aggression.includes("aggressive") || aggression.includes("all-out")
      ? "Advanced / high-intensity progressive overload"
      : "Advanced / wave and block periodization responder";
  }
  if (level === "intermediate" || years >= 2) {
    return "Intermediate — transitioning to undulating periodization";
  }
  return "Beginner / early-intermediate — linear progression phase";
}

function buildCoachingIdentity(p: ProfileInput): string {
  const autoregulation = (p.autoregulationComfort ?? "").toLowerCase();
  const style = (p.coachingStylePreference ?? "").toLowerCase();
  const motivation = (p.motivationStyle ?? "").toLowerCase();

  if (autoregulation.includes("feel") || style.includes("direct")) {
    return "Autoregulation-driven — responds to feel-based coaching cues";
  }
  if (autoregulation.includes("structure") || autoregulation.includes("plan") || style.includes("structure")) {
    return "Structure-dependent — thrives with defined targets and clear progressions";
  }
  if (motivation.includes("competitive") || motivation.includes("performance")) {
    return "Performance-motivated — responds to benchmarks and challenge progressions";
  }
  if (motivation.includes("habit") || motivation.includes("intrinsic")) {
    return "Intrinsically motivated — consistency-first coaching approach";
  }
  return "Coaching style flexible — mix of feel and structure applied";
}

function buildAdherenceIdentity(p: ProfileInput): string {
  const schedule = (p.scheduleConsistency ?? "").toLowerCase();

  if (schedule.includes("highly") || schedule.includes("very consistent")) {
    return "High adherence — reliable training stimulus, progressive overload predictable";
  }
  if (schedule.includes("variable") || schedule.includes("unpredictable")) {
    return "Variable adherence — adaptive programming with deload buffers required";
  }
  if (schedule.includes("mostly")) {
    return "Good adherence — minor schedule flexibility built into program structure";
  }
  return "Adherence unknown — adaptive program defaults applied";
}

function buildAdaptationResponsiveness(p: ProfileInput): string {
  const autoregulation = (p.autoregulationComfort ?? "").toLowerCase();
  const confidence = (p.exerciseConfidence ?? "").toLowerCase();
  const aggression = (p.trainingAggression ?? "").toLowerCase();

  if (confidence.includes("high") && (autoregulation.includes("feel") || autoregulation.includes("mix"))) {
    return "Responds well to autoregulation — high training IQ, self-directed";
  }
  if (aggression.includes("conservative") || confidence.includes("low") || confidence.includes("guidance")) {
    return "Conservative responder — gradual overload, high technique emphasis";
  }
  if (confidence.includes("varies")) {
    return "Movement-dependent responder — confidence calibrated per exercise group";
  }
  return "Standard adaptation responder — structured progressive overload";
}

// ─── "What Atlas Learned" Summary ─────────────────────────────────────────────

export function buildAtlasLearnedSummary(profile: ProfileInput): AthleteLearnedSummary {
  const understood: string[] = [];
  const implications: string[] = [];
  const goal = profile.primaryGoal ?? profile.trainingGoal;

  if (profile.experienceLevel || profile.yearsTraining != null) {
    const years = profile.yearsTraining;
    const level = profile.experienceLevel;
    understood.push(
      `Training background: ${level ? `${level} level` : "established athlete"}${years != null ? `, ${years} year${years === 1 ? "" : "s"} of experience` : ""}`,
    );
    if (years != null && years >= 4) {
      implications.push("Exercise complexity and loading targets increased to match training age");
    } else if (years != null && years < 2) {
      implications.push("Volume progression paced conservatively — rapid initial adaptation expected");
    }
  }

  if (goal) {
    understood.push(`Primary training goal: ${goal}`);
    implications.push(`All programming biased toward ${goal.toLowerCase()} as the primary performance driver`);
  }

  if (profile.injuries) {
    understood.push(`Injury constraints: ${profile.injuries}`);
    implications.push("Exercises loading reported areas permanently filtered — safe alternatives substituted");
  }

  if (profile.equipmentAccess) {
    understood.push(`Equipment access: ${profile.equipmentAccess}`);
    implications.push(`Exercise selection locked to ${profile.equipmentAccess.toLowerCase()} — no equipment assumptions made`);
  }

  if (profile.daysPerWeek != null) {
    understood.push(
      `Schedule: ${profile.daysPerWeek} training days per week${profile.sessionDuration ? `, ${profile.sessionDuration}-minute sessions` : ""}`,
    );
  }

  if (profile.scheduleConsistency) {
    const cons = profile.scheduleConsistency.toLowerCase();
    understood.push(`Schedule consistency: ${profile.scheduleConsistency}`);
    if (cons.includes("variable") || cons.includes("unpredictable")) {
      implications.push("Autoregulation added — program adapts to weekly schedule variation automatically");
    }
  }

  if (profile.recoveryConsistency) {
    understood.push(`Recovery profile: ${profile.recoveryConsistency}`);
    const rec = profile.recoveryConsistency.toLowerCase();
    if (rec.includes("often over") || rec.includes("inconsist")) {
      implications.push("Volume progression paced conservatively to protect output quality under irregular recovery");
    }
  }

  if (profile.trainingAggression) {
    understood.push(`Training aggression: ${profile.trainingAggression}`);
    const agg = profile.trainingAggression.toLowerCase();
    if (agg.includes("all-out") || agg.includes("aggressive")) {
      implications.push("Deload frequency increased to offset high-intensity training tendency");
    }
  }

  if (profile.autoregulationComfort) {
    understood.push(`Autoregulation style: ${profile.autoregulationComfort}`);
    const auto = profile.autoregulationComfort.toLowerCase();
    if (auto.includes("feel") || auto.includes("mix")) {
      implications.push("Feel-based intensity cues embedded in session notes — rigid targets loosened");
    } else if (auto.includes("structure") || auto.includes("clear")) {
      implications.push("Defined targets and progression rules added to every session — no ambiguity");
    }
  }

  if (profile.sportFocus) {
    understood.push(`Sport focus: ${profile.sportFocus}`);
    implications.push(`Movement selection and energy system bias optimized for ${profile.sportFocus}`);
  }

  return { understood, implications };
}

// ─── DNA Prompt Injection ─────────────────────────────────────────────────────

/**
 * Builds a compact coaching context string from the athlete DNA
 * suitable for injection into Atlas system prompts.
 */
export function buildDNAPromptContext(dna: AthleteDNA): string {
  return [
    "## ATHLETE DNA — PERSISTENT IDENTITY MODEL",
    `Recovery Identity: ${dna.recoveryIdentity}`,
    `Fatigue Profile: ${dna.fatigueIdentity}`,
    `Progression Identity: ${dna.progressionIdentity}`,
    `Coaching Identity: ${dna.coachingIdentity}`,
    `Adherence Pattern: ${dna.adherenceIdentity}`,
    `Adaptation Responsiveness: ${dna.adaptationResponsiveness}`,
    "",
    "Apply these identity signals to every programming decision. They represent persistent patterns, not momentary states.",
  ].join("\n");
}
