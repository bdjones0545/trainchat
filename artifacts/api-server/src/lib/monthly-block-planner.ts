/**
 * Monthly Block Planner — Hierarchical Programming Layer 1
 *
 * The program generation hierarchy:
 *   MONTH defines the mission
 *   WEEK  defines the emphasis
 *   DAY   defines the session role
 *   EXERCISE serves the day
 *
 * This module is the first layer. It selects a MonthlyBlockPlan that defines:
 *   - What adaptation target this block is chasing
 *   - What volume/intensity profile governs the block
 *   - What neural demand profile is appropriate
 *   - What progression philosophy drives load management
 *   - What special framing applies (sport, population, goal)
 *
 * The selected plan is passed to the weekly-block-planner and then the
 * session generator, so every layer inherits this mission.
 */

import {
  RANGE_PROGRESSION_MODEL,
  MOBILITY_SESSION_CAPS_BY_WEEK,
} from "./focus-engines/mobility-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthlyBlockType =
  | "accumulation"
  | "intensification"
  | "strength_emphasis"
  | "power_conversion"
  | "work_capacity"
  | "re_entry_resilience"
  | "hypertrophy_support";

export type SpecialPopBlockType =
  | "resilience_block"
  | "control_block"
  | "re_entry_block"
  | "low_impact_strength";

export interface MonthlyBlockPlan {
  blockType: MonthlyBlockType | SpecialPopBlockType;
  displayName: string;
  missionStatement: string;
  primaryAdaptation: string;
  secondaryAdaptation: string;
  volumeProfile: "high" | "moderate" | "low";
  intensityProfile: "high" | "moderate" | "low";
  neuralDemandProfile: "high" | "moderate" | "low";
  progressionPhilosophy: string;
  sportGoalBias: string;
  specialPopulationFraming?: string;
  isSpecialPopulation: boolean;
  keyPrinciples: string[];
  weekProgressionArc: string;
}

// ─── Block Definitions ───────────────────────────────────────────────────────

const STANDARD_BLOCKS: Record<MonthlyBlockType, Omit<MonthlyBlockPlan, "blockType" | "sportGoalBias" | "weekProgressionArc">> = {
  accumulation: {
    displayName: "Accumulation Block",
    missionStatement: "Build the training volume foundation — expose the body to broad movement competency at moderate intensity before intensification begins.",
    primaryAdaptation: "Volume tolerance and movement pattern reinforcement",
    secondaryAdaptation: "Muscular hypertrophy and work capacity baseline",
    volumeProfile: "high",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Weekly volume progression via set/rep addition. Load increases only when reps are completed cleanly across all sets.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Higher rep ranges (8–15) with moderate loads build tissue capacity for intensification",
      "Session variety matters — expose all patterns each week at different angles",
      "Fatigue management is the constraint — not max intensity",
      "Technical mastery during moderate loads creates the ceiling for future intensification",
    ],
  },

  intensification: {
    displayName: "Intensification Block",
    missionStatement: "Convert accumulated volume into expressed strength — fewer reps, heavier loads, higher neural demand, peak performance.",
    primaryAdaptation: "Maximal strength and neuromuscular efficiency",
    secondaryAdaptation: "Rate of force development and motor unit recruitment",
    volumeProfile: "moderate",
    intensityProfile: "high",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Load increases weekly. Rep ranges drop (3–6). Wave loading or linear progression from 80%–90%+ 1RM. Volume decreases as intensity rises.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Heavy primary lifts come early when CNS is fresh — no fatigue carryover",
      "Power work must precede heavy loading on the same day",
      "Session volume is LOWER than accumulation — quality over quantity",
      "Deload week is mandatory after intensification peak",
    ],
  },

  strength_emphasis: {
    displayName: "Strength Emphasis Block",
    missionStatement: "Build absolute strength as the primary outcome — this block is specifically engineered for maximal force production development.",
    primaryAdaptation: "Maximal strength across primary movement patterns",
    secondaryAdaptation: "Structural robustness and connective tissue tolerance",
    volumeProfile: "moderate",
    intensityProfile: "high",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Progressive overload via load increases. Work up to top sets. Back-off sets for volume stimulus. Frequency of heavy bilateral patterns: 2–3x per week.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Every session has a clear strength focus — no session is 'maintenance'",
      "Bilateral primary lifts are the cornerstone of every training day",
      "Accessory work is structural — it supports the primary lifts, not replaces them",
      "Recovery between sessions must be adequate to express maximal strength",
    ],
  },

  power_conversion: {
    displayName: "Power Conversion Block",
    missionStatement: "Convert strength into power — train force production at speed. This block is about rate of force development, not just strength.",
    primaryAdaptation: "Rate of force development and explosive power output",
    secondaryAdaptation: "Sport-specific force application and reactive strength",
    volumeProfile: "moderate",
    intensityProfile: "moderate",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Contrast training pairs heavy strength with explosive power. Plyometric volume stays LOW (quality over quantity). Strength loads stay 70–85% for force-velocity curve work.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Power work always first — plyometrics and throws before any loading",
      "Contrast pairs: heavy squat/DL followed immediately by explosive equivalent",
      "Low volumes per explosive set (3–5 reps) with full recovery",
      "Session density is LOWER — more time between sets for full nervous system recovery",
    ],
  },

  work_capacity: {
    displayName: "Work Capacity Block",
    missionStatement: "Build the engine — develop the capacity to sustain high-quality work over longer sessions and repeated efforts.",
    primaryAdaptation: "Aerobic capacity, lactate threshold, and muscular endurance",
    secondaryAdaptation: "Movement efficiency and metabolic conditioning",
    volumeProfile: "high",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Progressive density — same work in less time, or more work in same time. Circuit density, reduced rest, or interval volume increases each week.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Energy system work is explicitly named — not just 'cardio'",
      "Strength sessions must preserve quality — do not sacrifice movement pattern for fatigue",
      "Active recovery sessions are part of the program, not optional additions",
      "Session RPE targets are stated — not just completion-based",
    ],
  },

  re_entry_resilience: {
    displayName: "Re-Entry & Resilience Block",
    missionStatement: "Return to training systematically — rebuild movement confidence, tissue tolerance, and work capacity before challenging loads are introduced.",
    primaryAdaptation: "Movement pattern re-establishment and tissue resilience",
    secondaryAdaptation: "Work capacity baseline and joint preparation",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Submaximal loading across all sessions. No max efforts. Volume and intensity increase conservatively across the 4-week arc. Prioritize competency over load.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "No exercise should produce next-day soreness — if it does, volume was too high",
      "Every session begins with movement quality work, not loading",
      "Bilateral strength patterns use conservative loads until single-leg confidence is established",
      "This block succeeds if the athlete ends it more prepared, not more fatigued",
    ],
  },

  hypertrophy_support: {
    displayName: "Hypertrophy Support Block",
    missionStatement: "Maximize muscle growth stimulus — high volume, moderate intensity, varied exercises, mechanical tension combined with metabolic stress.",
    primaryAdaptation: "Muscle hypertrophy via mechanical tension and metabolic stress",
    secondaryAdaptation: "Structural balance and movement pattern breadth",
    volumeProfile: "high",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Double progression: add reps first, then load. Sets progress from 3 to 4–5 across the block. Pump work and isolation supported alongside compound foundation.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Rep ranges: 6–12 primary, 10–20 accessory — not max strength rep ranges",
      "Mind-muscle connection and full range of motion prioritized over load",
      "Session variety: different angles, grips, and modalities per week",
      "Recovery supports growth — session density must allow quality muscle stimulus",
    ],
  },
};

const SPECIAL_POP_BLOCKS: Record<SpecialPopBlockType, Omit<MonthlyBlockPlan, "blockType" | "sportGoalBias" | "weekProgressionArc">> = {
  resilience_block: {
    displayName: "Resilience Block",
    missionStatement: "Rebuild physical resilience — focus on structural integrity, joint health, and movement confidence in a safe, progressive framework.",
    primaryAdaptation: "Connective tissue resilience and joint preparation",
    secondaryAdaptation: "Low-load movement competency and body awareness",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Progressive loading within pain-free range only. Weekly RPE targets cap at 6/10. Isometric holds before dynamic loading.",
    isSpecialPopulation: true,
    specialPopulationFraming: "Safe and conservative — all exercise selection prioritizes joint health, pain-free range, and gradual load introduction.",
    keyPrinciples: [
      "No exercise causes pain — immediately modify or substitute",
      "Isometric loading precedes dynamic loading across all planes",
      "Bilateral before unilateral — stability established before asymmetry is loaded",
      "Success is measured in how good the athlete feels, not what they lift",
    ],
  },

  control_block: {
    displayName: "Movement Control Block",
    missionStatement: "Establish neuromuscular control and movement quality before load is applied — quality of movement is the output.",
    primaryAdaptation: "Motor control and neuromuscular coordination",
    secondaryAdaptation: "Proprioception and kinesthetic awareness",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Competency-based: progress to next variation only when current variation is pain-free and well-controlled. Load is never the driver.",
    isSpecialPopulation: true,
    specialPopulationFraming: "Control-oriented — exercises selected for proprioceptive demand, not load. Each exercise chosen to build movement confidence.",
    keyPrinciples: [
      "Slow eccentric tempos on all exercises to build body awareness",
      "Unilateral patterns only after bilateral patterns are established",
      "Breathing and bracing are explicitly coached in every set",
      "Progress is movement quality, not weight on the bar",
    ],
  },

  re_entry_block: {
    displayName: "Re-Entry Block",
    missionStatement: "Safely re-enter structured training — reestablish movement patterns and work capacity tolerance at appropriate loading for this population.",
    primaryAdaptation: "Movement reestablishment and work capacity tolerance",
    secondaryAdaptation: "Tissue preparation for future loading",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Conservative and individual — every decision is guided by subjective feedback. Volume increases only when previous sessions are tolerated without excess fatigue.",
    isSpecialPopulation: true,
    specialPopulationFraming: "Re-entry protocol — exercises and progressions are selected specifically for safe return to training. No ego lifting.",
    keyPrinciples: [
      "No high-impact or high-velocity movements in initial weeks",
      "Bodyweight and light resistance mastered before external load",
      "Recovery between sessions is as important as the sessions themselves",
      "This block ends when the athlete reports consistent session tolerance, not a fixed date",
    ],
  },

  low_impact_strength: {
    displayName: "Low-Impact Strength Block",
    missionStatement: "Build real strength without joint stress — use low-impact modalities to develop strength in a safe, sustainable framework.",
    primaryAdaptation: "Muscular strength via low-impact movement patterns",
    secondaryAdaptation: "Structural resilience and functional independence",
    volumeProfile: "moderate",
    intensityProfile: "moderate",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Slow and steady load increases. Rep range: 10–15 to emphasize time under tension over absolute load. Focus on range of motion before load.",
    isSpecialPopulation: true,
    specialPopulationFraming: "Low-impact protocol — plyometrics, high-velocity movements, and high-load bilateral patterns are excluded. Strength is built via controlled, joint-friendly progressions.",
    keyPrinciples: [
      "No plyometrics, jumping, or high-impact movements",
      "Seated or supported variations prioritized over standing/unsupported where appropriate",
      "Full range of motion before adding load — never sacrifice ROM for weight",
      "Consistent session structure reduces cognitive and physical overwhelm",
    ],
  },
};

// ─── Block Selection Logic ────────────────────────────────────────────────────

function selectBlockType(
  goal: string | null,
  sport: string | null,
  experience: string | null,
  isSpecialPopulation: boolean,
  seed: number,
): MonthlyBlockType {
  const g = (goal ?? "").toLowerCase();
  const e = (experience ?? "").toLowerCase();

  // Beginner/re-entry always gets accumulation or re_entry_resilience
  const isBeginner = e.includes("beginner") || e.includes("new") || e.includes("just starting");
  if (isBeginner) {
    return seed < 0.5 ? "accumulation" : "re_entry_resilience";
  }

  // Explicit strength goal
  if (g.includes("strength") && !g.includes("power") && !g.includes("sport")) {
    return seed < 0.4 ? "strength_emphasis" : "intensification";
  }

  // Explicit power/athletic goal
  if (g.includes("power") || g.includes("explosive") || g.includes("athletic")) {
    return seed < 0.5 ? "power_conversion" : "intensification";
  }

  // Explicit hypertrophy/muscle goal
  if (
    g.includes("muscle") || g.includes("hypertrophy") || g.includes("size") ||
    g.includes("bulk") || g.includes("mass") || g.includes("bodybuilding")
  ) {
    return seed < 0.4 ? "hypertrophy_support" : "accumulation";
  }

  // Conditioning/endurance goal
  if (
    g.includes("conditioning") || g.includes("endurance") || g.includes("cardio") ||
    g.includes("stamina") || g.includes("fitness") || g.includes("weight loss")
  ) {
    return seed < 0.5 ? "work_capacity" : "accumulation";
  }

  // Sport-specific — use context to pick block type
  const s = (sport ?? "").toLowerCase();
  const isCombatSport = s.includes("mma") || s.includes("boxing") || s.includes("wrestling");
  const isExplosiveSport = s.includes("football") || s.includes("basketball") || s.includes("rugby") || s.includes("lacrosse") || s.includes("hockey");
  const isRotationalSport = s.includes("tennis") || s.includes("golf") || s.includes("baseball");
  const isEnduranceSport = s.includes("swim") || s.includes("cycling") || s.includes("rowing") || s.includes("triathlon");

  if (isCombatSport) return seed < 0.4 ? "work_capacity" : "power_conversion";
  if (isExplosiveSport) return seed < 0.5 ? "power_conversion" : "accumulation";
  if (isRotationalSport) return seed < 0.4 ? "accumulation" : "strength_emphasis";
  if (isEnduranceSport) return seed < 0.4 ? "work_capacity" : "accumulation";

  // General fitness — rotate through block types based on seed for variety
  const generalOptions: MonthlyBlockType[] = ["accumulation", "work_capacity", "hypertrophy_support", "strength_emphasis"];
  return generalOptions[Math.floor(seed * generalOptions.length)];
}

function selectSpecialPopBlockType(
  goal: string | null,
  experience: string | null,
  seed: number,
): SpecialPopBlockType {
  const g = (goal ?? "").toLowerCase();
  const e = (experience ?? "").toLowerCase();

  if (e.includes("return") || e.includes("re-entry") || g.includes("return") || g.includes("comeback")) {
    return "re_entry_block";
  }
  if (g.includes("strength") || g.includes("muscle")) {
    return "low_impact_strength";
  }
  if (e.includes("beginner") || e.includes("new")) {
    return seed < 0.5 ? "re_entry_block" : "control_block";
  }
  return seed < 0.33 ? "resilience_block" : seed < 0.66 ? "control_block" : "low_impact_strength";
}

function buildWeekProgressionArc(
  blockType: MonthlyBlockType | SpecialPopBlockType,
  sport: string | null,
): string {
  switch (blockType) {
    case "accumulation":
      return "Week 1: Establish (Pattern learning, moderate volume) → Week 2: Build (Volume increase, +1 set per session) → Week 3: Peak Volume (Maximum tolerable volume, loaded positions) → Week 4: Deload (50% volume, maintain movement quality)";

    case "intensification":
      return "Week 1: Establish (80% loads, technique reinforcement) → Week 2: Build (85% loads, top-set focus) → Week 3: Intensify (90%+ loads, peak expression) → Week 4: Deload (60% loads, full recovery)";

    case "strength_emphasis":
      return "Week 1: Establish (Heavy singles and triples, technique priority) → Week 2: Build (Working sets 80–85%, volume accumulation) → Week 3: Intensify (Peak strength expression, 90%+ sets) → Week 4: Deload (Technical deload, movement quality, 60% loads)";

    case "power_conversion":
      return "Week 1: Establish (Contrast pairs introduced, moderate loads, high power output) → Week 2: Build (Increased contrast density, 75–82% strength loads) → Week 3: Intensify (Peak contrast, 85% strength with max explosiveness) → Week 4: Deload (Low volume, power preservation, 60–65% loads)";

    case "work_capacity":
      return "Week 1: Establish (Density baseline, work:rest ratios set) → Week 2: Build (Volume increase OR rest reduction) → Week 3: Peak Density (Maximum work output, highest density) → Week 4: Recovery (Active recovery, movement quality, reduced session demands)";

    case "re_entry_resilience":
      return "Week 1: Establish (Conservative loads, technique, RPE 5–6) → Week 2: Build (Confidence loads, RPE 6–7) → Week 3: Challenge (Moderate challenge, RPE 7–7.5) → Week 4: Consolidate (Maintain gains, prepare for next block)";

    case "hypertrophy_support":
      return "Week 1: Establish (3 working sets, moderate loads, feel positions) → Week 2: Build (4 working sets, load increase where reps achieved) → Week 3: Intensify (4–5 working sets, peak hypertrophy stimulus) → Week 4: Deload (2–3 sets, technique and pump, no failure)";

    case "resilience_block":
    case "control_block":
    case "re_entry_block":
      return "Week 1: Foundation (Movement quality, pain-free range, RPE ≤5) → Week 2: Build (Small volume increase, maintain quality) → Week 3: Challenge (Progressive load within safe limits, RPE ≤7) → Week 4: Consolidate (Maintain, assess readiness for next block)";

    case "low_impact_strength":
      return "Week 1: Establish (Learn positions, 3 × 12–15, RPE 5–6) → Week 2: Build (Add set or reps, RPE 6–7) → Week 3: Load (Increase resistance where quality allows) → Week 4: Consolidate (Steady state, focus on form and feel)";

    default:
      return "Week 1: Establish → Week 2: Build → Week 3: Intensify → Week 4: Deload";
  }
}

function buildSportGoalBias(
  blockType: MonthlyBlockType | SpecialPopBlockType,
  sport: string | null,
  goal: string | null,
): string {
  const s = (sport ?? "").toLowerCase();
  const g = (goal ?? "").toLowerCase();

  if (s.includes("football")) {
    return "Bias toward acceleration-first sessions, anaerobic conditioning, heavy bilateral lower emphasis, collision-transfer trunk work";
  }
  if (s.includes("basketball")) {
    return "Bias toward reactive plyometrics, deceleration mechanics, single-leg strength, explosive court conditioning";
  }
  if (s.includes("soccer")) {
    return "Bias toward hamstring/adductor resilience (Nordic curls, Copenhagen), single-leg patterns, aerobic + RSA conditioning";
  }
  if (s.includes("hockey")) {
    return "Bias toward lateral force production, rotational power, edge-mechanics transfer, adductor resilience";
  }
  if (s.includes("baseball") || s.includes("softball")) {
    return "Bias toward med ball rotational power, arm care (face pull, external rotation), pull-dominant upper, short-sprint conditioning";
  }
  if (s.includes("tennis") || s.includes("golf")) {
    return "Bias toward rotational med ball power, hip and thoracic mobility, structural upper pulling, no plyometrics";
  }
  if (s.includes("mma") || s.includes("boxing") || s.includes("wrestling")) {
    return "Bias toward work capacity conditioning rounds, rotational and anti-rotation trunk, structural resilience, aerobic base";
  }

  if (g.includes("strength")) return "Bias toward bilateral compound movements, heavy loading patterns, structural accessory work";
  if (g.includes("power") || g.includes("explosive")) return "Bias toward plyometric and power development, contrast training, speed-strength continuum";
  if (g.includes("muscle") || g.includes("hypertrophy")) return "Bias toward mechanical tension, varied rep ranges, full range of motion priority";
  if (g.includes("conditioning") || g.includes("endurance")) return "Bias toward energy system development, named interval work, aerobic and anaerobic capacity";
  if (g.includes("weight loss") || g.includes("fat loss")) return "Bias toward metabolic conditioning, compound movements, higher density sessions";

  return "Bias toward balanced movement pattern development, athletic performance principles, multi-plane stability";
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function buildMonthlyBlockPlan(
  goal: string | null,
  sport: string | null,
  experience: string | null,
  seed: number,
  isSpecialPopulation: boolean = false,
  blockTypeOverride?: string,
): MonthlyBlockPlan {
  const blockType: MonthlyBlockType | SpecialPopBlockType = blockTypeOverride
    ? (blockTypeOverride as MonthlyBlockType | SpecialPopBlockType)
    : isSpecialPopulation
      ? selectSpecialPopBlockType(goal, experience, seed)
      : selectBlockType(goal, sport, experience, isSpecialPopulation, seed);

  const baseDefinition = isSpecialPopulation
    ? SPECIAL_POP_BLOCKS[blockType as SpecialPopBlockType]
    : STANDARD_BLOCKS[blockType as MonthlyBlockType];

  const sportGoalBias = buildSportGoalBias(blockType, sport, goal);
  const weekProgressionArc = buildWeekProgressionArc(blockType, sport);

  const plan: MonthlyBlockPlan = {
    blockType,
    ...baseDefinition,
    sportGoalBias,
    weekProgressionArc,
  };

  // Audit log
  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:MonthlyBlock]", JSON.stringify({
      blockType,
      displayName: (plan as any).displayName,
      primaryAdaptation: (plan as any).primaryAdaptation,
      volumeProfile: plan.volumeProfile,
      intensityProfile: plan.intensityProfile,
      neuralDemandProfile: plan.neuralDemandProfile,
      isSpecialPopulation,
      sport: sport ?? "none",
      goal: goal ?? "none",
      seed: Number(seed.toFixed(4)),
    }));
  }

  return plan;
}

/**
 * Builds a MonthlyBlockPlan directly from a known block type (bypasses selection logic).
 * Used by the hierarchical refine engine when the user explicitly requests a block shift.
 */
export function buildMonthlyBlockPlanForType(
  blockType: MonthlyBlockType | SpecialPopBlockType,
  sport: string | null,
  goal: string | null,
): MonthlyBlockPlan {
  const isSpecial = blockType in SPECIAL_POP_BLOCKS;
  const baseDefinition = isSpecial
    ? SPECIAL_POP_BLOCKS[blockType as SpecialPopBlockType]
    : STANDARD_BLOCKS[blockType as MonthlyBlockType];

  const sportGoalBias = buildSportGoalBias(blockType, sport, goal);
  const weekProgressionArc = buildWeekProgressionArc(blockType, sport);

  return {
    blockType,
    ...baseDefinition,
    sportGoalBias,
    weekProgressionArc,
  };
}

// ─── Speed Block System ───────────────────────────────────────────────────────

export type SpeedBlockType =
  | "speed_acceleration_development"
  | "speed_max_velocity"
  | "speed_cod_deceleration"
  | "speed_reactive_footwork"
  | "speed_return_to_speed"
  | "speed_endurance_capacity";

const SPEED_BLOCKS: Record<SpeedBlockType, Omit<MonthlyBlockPlan, "blockType" | "sportGoalBias" | "weekProgressionArc">> = {
  speed_acceleration_development: {
    displayName: "Acceleration Development Block",
    missionStatement: "Build first-step power and drive-phase mechanics — horizontal force application, acceleration posture, and short-distance sprint quality at 0–30m.",
    primaryAdaptation: "Horizontal force production, drive phase mechanics, first-step acceleration",
    secondaryAdaptation: "Sprint posture, ground contact mechanics, rate of force development",
    volumeProfile: "moderate",
    intensityProfile: "high",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Weekly sprint volume increases by 10–15%. Distance stays short (10–30m). Resisted load is reduced as free-sprint quality improves. Full recovery between every effort — CNS freshness is the constraint.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Acceleration work is ALWAYS first in the session — never after fatigue",
      "Short distances only (10–30m) — acceleration mechanics degrade past 30m",
      "Full recovery between efforts (2–4 min) — no conditioning effect intended",
      "Resisted starts (sled, band) paired with free sprints for contrast",
      "Wall drills and falling starts build the mechanics before maximal intent",
    ],
  },
  speed_max_velocity: {
    displayName: "Maximum Velocity Block",
    missionStatement: "Develop top-end speed mechanics — stride cycle, front-side drive, upright sprint posture, and reactive ground contact at 30–60m+ distances.",
    primaryAdaptation: "Top-end speed, stride mechanics, flight phase efficiency",
    secondaryAdaptation: "Ankle stiffness, elastic ground contact, neuromuscular coordination",
    volumeProfile: "moderate",
    intensityProfile: "high",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Flying sprint volume builds weekly (total meters). Ground contact quality is the metric — not effort. Wicket runs and stride rhythm drills precede max-intent sprints. Full recovery essential.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Flying starts (20m run-up) allow full acceleration before velocity window",
      "Wicket runs groove stride rhythm before max-intent flying sprints",
      "Focus on front-side mechanics — thigh separation, knee drive, ankle dorsiflexion",
      "Volume is low: 4–8 × 20–40m max effort per session",
      "Elastic support work (ankle hops, pogo series) reinforces stiffness qualities",
    ],
  },
  speed_cod_deceleration: {
    displayName: "COD & Deceleration Block",
    missionStatement: "Build the mechanics and strength to decelerate efficiently, absorb force at the penultimate step, and re-accelerate out of direction changes — the most trainable speed quality in team sport.",
    primaryAdaptation: "Deceleration absorption, COD mechanics, re-acceleration out of cuts",
    secondaryAdaptation: "Posterior chain eccentric strength, knee stability, lateral force production",
    volumeProfile: "moderate",
    intensityProfile: "moderate",
    neuralDemandProfile: "high",
    progressionPhilosophy: "Closed-skill drills first (pre-planned cuts), reactive drills added in Week 3+. Intensity progresses from body-weight mechanics at controlled speed to full-speed reactive patterns. Nordic and landing work support tissue tolerance.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Deceleration mechanics must be established before reactive/open-skill drills",
      "Plant mechanics (penultimate step, shin angle) are the trainable COD variable",
      "Nordic curls and landing strength are non-negotiable structural support",
      "Pre-planned drills (5-10-5, T-drill) before reactive mirror/shadow drills",
      "Sport-specific cut patterns introduced in Week 3–4 only",
    ],
  },
  speed_reactive_footwork: {
    displayName: "Reactive Footwork & Rhythm Block",
    missionStatement: "Develop coordination, neuromuscular timing, and open-skill agility — the bridge between trained speed qualities and game-speed execution.",
    primaryAdaptation: "Reactive decision speed, foot contact quality, coordination under speed",
    secondaryAdaptation: "Pattern recognition, timing, multi-directional athletic expression",
    volumeProfile: "high",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Pattern complexity increases weekly. Week 1: simple bilateral patterns. Week 2: alternating/lateral complexity. Week 3: reactive external stimulus. Week 4: sport-specific integration. Lower fatigue cost allows higher session frequency.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Footwork is low-load — volume can be higher than sprint sessions",
      "Ladder, cone, and shadow drills develop the coordination quality",
      "Reactive element (visual cue, partner, ball) introduced in Week 2–3",
      "Foot contact quality > speed of pattern — rushing patterns defeats the purpose",
      "Can be programmed on non-sprint days — excellent active recovery tool",
    ],
  },
  speed_return_to_speed: {
    displayName: "Return-to-Speed Block",
    missionStatement: "Rebuild speed qualities conservatively after time off, injury, or high load accumulation — prioritizing tissue tolerance, deceleration reintroduction, and sub-maximal sprint exposure before returning to full intent.",
    primaryAdaptation: "Tissue resilience, sub-maximal sprint mechanics, tendon preparation",
    secondaryAdaptation: "Movement quality restoration, deceleration confidence, tissue conditioning",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Sprint intensity caps at 70–80% in Week 1–2, rising to 85–90% in Week 3. Volume is low. Tissue prep drills (Nordic, hamstring isometrics, calf conditioning) precede any sprint work. No reactive or COD drills until Week 3.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "No session should produce the next-day hamstring or calf soreness — if it does, too much",
      "Tissue prep (Nordic, isometric hamstring, calf march) is mandatory — not optional",
      "Sprint intensity: Week 1 = 70%, Week 2 = 80%, Week 3 = 85–90%, Week 4 = gradual re-entry to full intent",
      "COD and reactive work reintroduced no earlier than Week 3",
      "This block succeeds if the athlete ends it more resilient, not more fatigued",
    ],
  },
  speed_endurance_capacity: {
    displayName: "Speed Endurance Block",
    missionStatement: "Develop the capacity to repeat high-quality sprint efforts — build lactate tolerance, aerobic speed reserve, and repeat-sprint ability for sport competition demands.",
    primaryAdaptation: "Repeat sprint ability, lactate tolerance, aerobic speed reserve",
    secondaryAdaptation: "Sprint mechanics under accumulating fatigue, mental resilience, pacing",
    volumeProfile: "high",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Tempo runs at 60–75% build the aerobic base first. Flying 30m repeats at 90% add speed stimulus. Incomplete rest intervals train the repeat-sprint quality. Volume builds by 10–15% per week. Mechanics quality is the check — if form deteriorates, rest is insufficient.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Speed endurance is NOT fitness work — sprint mechanics must be maintained throughout",
      "Tempo runs (60–75%) are the aerobic base — not max effort",
      "Incomplete recovery (45–90s) teaches repeat-sprint tolerance",
      "Absolute top-end speed is not the target here — sustained sprint quality is",
      "Mechanics under fatigue is the adaptation — not just getting through the reps",
    ],
  },
};

export function buildSpeedMonthlyBlockPlan(
  goal: string | null,
  sport: string | null,
  experience: string | null,
  seed: number,
  blockTypeOverride?: string,
): MonthlyBlockPlan & { blockType: SpeedBlockType } {
  const g = (goal ?? "").toLowerCase();
  const e = (experience ?? "").toLowerCase();

  let blockType: SpeedBlockType;

  if (blockTypeOverride && blockTypeOverride in SPEED_BLOCKS) {
    blockType = blockTypeOverride as SpeedBlockType;
  } else if (e.includes("return") || e.includes("recovery") || e.includes("rehab") || g.includes("return")) {
    blockType = "speed_return_to_speed";
  } else if (g.includes("endurance") || g.includes("repeat sprint") || g.includes("conditioning")) {
    blockType = "speed_endurance_capacity";
  } else if (g.includes("agility") || g.includes("footwork") || g.includes("reactive")) {
    blockType = seed < 0.5 ? "speed_cod_deceleration" : "speed_reactive_footwork";
  } else if (g.includes("acceleration") || g.includes("first step") || g.includes("drive phase")) {
    blockType = "speed_acceleration_development";
  } else if (g.includes("top speed") || g.includes("max velocity") || g.includes("sprint")) {
    blockType = "speed_max_velocity";
  } else if (e.includes("beginner") || e.includes("new")) {
    blockType = seed < 0.5 ? "speed_return_to_speed" : "speed_reactive_footwork";
  } else {
    // Standard progression: default to acceleration first, then build from there
    const options: SpeedBlockType[] = [
      "speed_acceleration_development",
      "speed_reactive_footwork",
      "speed_cod_deceleration",
      "speed_max_velocity",
    ];
    blockType = options[Math.floor(seed * options.length)];
  }

  const baseDefinition = SPEED_BLOCKS[blockType];
  const sportGoalBias = buildSpeedSportBias(blockType, sport, goal);
  const weekProgressionArc = buildSpeedWeekArc(blockType);

  const plan = {
    blockType,
    ...baseDefinition,
    sportGoalBias,
    weekProgressionArc,
  } as MonthlyBlockPlan & { blockType: SpeedBlockType };

  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:SpeedMonthlyBlock]", JSON.stringify({
      blockType,
      displayName: (plan as any).displayName,
      primaryAdaptation: (plan as any).primaryAdaptation,
      sport: sport ?? "none",
      goal: goal ?? "none",
      seed: Number(seed.toFixed(4)),
    }));
  }

  return plan;
}

function buildSpeedSportBias(blockType: SpeedBlockType, sport: string | null, goal: string | null): string {
  const s = (sport ?? "").toLowerCase();

  if (s.includes("soccer") || s.includes("football") && !s.includes("american")) {
    return "Bias toward acceleration-COD integration, repeat sprint ability, hamstring resilience (Nordic curls, Copenhagen), and in-game reactive agility patterns";
  }
  if (s.includes("basketball")) {
    return "Bias toward lateral COD speed, deceleration mechanics, reactive footwork, court-width sprint patterns, and plyometric power in the vertical plane";
  }
  if (s.includes("football") || s.includes("rugby") || s.includes("lacrosse")) {
    return "Bias toward linear acceleration (0–20m), first-step explosion, sprint-to-cut sequences, and collision-position sprint mechanics";
  }
  if (s.includes("tennis") || s.includes("badminton") || s.includes("squash")) {
    return "Bias toward split-step reactivity, lateral acceleration, T-pattern COD, and repeat-sprint footwork within the court dimension";
  }
  if (s.includes("hockey")) {
    return "Bias toward lateral crossover speed, edge-mechanics transfer, explosive starts, and repeat-sprint conditioning across short distances";
  }
  if (s.includes("track") || s.includes("sprint")) {
    return "Bias toward pure acceleration mechanics (drive phase), max velocity development, and speed endurance for repeat-sprint or race-pace preparation";
  }

  switch (blockType) {
    case "speed_acceleration_development":
      return "Bias toward resisted starts, wall drills, falling starts, short sprint distances, and full-recovery effort structure";
    case "speed_max_velocity":
      return "Bias toward flying sprints, wicket runs, stride rhythm, ankle stiffness, and elastic ground contact quality";
    case "speed_cod_deceleration":
      return "Bias toward penultimate-step mechanics, COD strength (Nordic, landing), pre-planned agility drills, and decel-to-re-accelerate patterns";
    case "speed_reactive_footwork":
      return "Bias toward ladder patterns, cone touch drills, shadow work, partner-reactive patterns, and open-skill timing";
    case "speed_return_to_speed":
      return "Bias toward tissue prep (Nordic, calf march, hamstring isometrics), sub-maximal sprint exposure, and conservative volume management";
    case "speed_endurance_capacity":
      return "Bias toward tempo runs, flying 30m repeats, incomplete-rest repeat sprints, and mechanics-under-fatigue maintenance";
    default:
      return "Bias toward speed quality development, sprint mechanics, and reactive athletic output";
  }
}

function buildSpeedWeekArc(blockType: SpeedBlockType): string {
  switch (blockType) {
    case "speed_acceleration_development":
      return "Week 1: Establish (Wall drills, falling starts, RPE 85%, 10–20m) → Week 2: Build (Add resisted starts, 10–30m, maintain quality) → Week 3: Intensify (Full acceleration intent, 20–30m, contrast sled + free sprint) → Week 4: Deload (50% volume, mechanics review, 10–20m)";
    case "speed_max_velocity":
      return "Week 1: Establish (Wicket runs, build-up runs, 30m flying at 90%) → Week 2: Build (Flying 20–30m at 95%, stride rhythm emphasis) → Week 3: Intensify (Flying 30–40m full intent, ground contact quality focus) → Week 4: Deload (50% volume, wicket review, low-intent build-ups)";
    case "speed_cod_deceleration":
      return "Week 1: Establish (Pre-planned drills at 75% speed, decel mechanics, Nordic intro) → Week 2: Build (Pre-planned at 90%, cut angle progression, landing strength) → Week 3: Intensify (Reactive cues introduced, full-speed planned drills, decel-to-re-accelerate) → Week 4: Deload (Planned drills only, low volume, mechanics review)";
    case "speed_reactive_footwork":
      return "Week 1: Establish (Simple ladder patterns, bilateral footwork, deliberate pace) → Week 2: Build (Alternating and lateral complexity, add cone patterns) → Week 3: Intensify (Reactive element added, partner or visual cue, speed up patterns) → Week 4: Deload (Low-complexity patterns, coordination review, sport-specific light integration)";
    case "speed_return_to_speed":
      return "Week 1: Foundation (Tissue prep only, 70% sprint intent, short distances 10–20m) → Week 2: Build (80% intent, add decel drills, increase tissue prep) → Week 3: Challenge (85–90% intent, reintroduce COD prep, short reactive footwork) → Week 4: Consolidate (90% intent, assess readiness for acceleration or max velocity block)";
    case "speed_endurance_capacity":
      return "Week 1: Establish (Tempo runs at 65–70%, short distances, full focus on mechanics) → Week 2: Build (Tempo volume +15%, add flying 30m at 90%, incomplete rest) → Week 3: Intensify (Repeat sprint sets, 45–60s rest, mechanics under fatigue emphasis) → Week 4: Recovery (Reduce volume 50%, maintain sprint quality, aerobic consolidation)";
    default:
      return "Week 1: Establish → Week 2: Build → Week 3: Intensify → Week 4: Deload";
  }
}

export function buildSpeedMonthlyBlockContext(plan: MonthlyBlockPlan): string {
  return `## SPEED MONTHLY BLOCK PLAN — SPEED/FOOTWORK ENGINE LAYER 1
Block Type: ${plan.displayName}
Mission: ${plan.missionStatement}

PRIMARY ADAPTATION TARGET: ${plan.primaryAdaptation}
SECONDARY ADAPTATION TARGET: ${plan.secondaryAdaptation}

VOLUME PROFILE: ${plan.volumeProfile.toUpperCase()} | INTENSITY PROFILE: ${plan.intensityProfile.toUpperCase()} | NEURAL DEMAND: ${plan.neuralDemandProfile.toUpperCase()}

PROGRESSION PHILOSOPHY:
${plan.progressionPhilosophy}

SPORT/GOAL BIAS:
${plan.sportGoalBias}

FOUR-WEEK ARC:
${plan.weekProgressionArc}

KEY SPEED PROGRAMMING PRINCIPLES FOR THIS BLOCK:
${plan.keyPrinciples.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}

// ─── Mobility Block System ────────────────────────────────────────────────────

export type MobilityBlockType =
  | "mobility_range_restoration"
  | "mobility_end_range_control"
  | "mobility_movement_quality"
  | "mobility_hip_focus"
  | "mobility_shoulder_focus"
  | "mobility_spine_focus"
  | "mobility_ankle_focus"
  | "mobility_stiffness_reduction"
  | "mobility_recovery_flow"
  | "mobility_reentry_support";

const MOBILITY_BLOCKS: Record<MobilityBlockType, Omit<MonthlyBlockPlan, "blockType" | "sportGoalBias" | "weekProgressionArc">> = {
  mobility_range_restoration: {
    displayName: "Range Restoration Block",
    missionStatement: "Restore passive and active range of motion across priority joints. Establish the movement ceiling that control and loading work will build upon.",
    primaryAdaptation: "Passive tissue length and joint capsule mobility",
    secondaryAdaptation: "Nervous system exposure to new range positions, pain-free range development",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Increase hold duration each week before increasing range demand. Passive holds precede active control. Week 1: 30s holds → Week 2: 45s holds → Week 3: 60–90s holds + contract-relax → Week 4: recovery/consolidation.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Passive range is the prerequisite — you cannot control range you haven't first reached",
      "Hold duration is the primary progression variable, not load or reps",
      "Breathing amplifies range — exhale to deepen every passive hold",
      "Never force a joint — steady, sustained tension is more effective than aggressive pushing",
      "Track which joints are limiting movement and address them systematically each session",
    ],
  },

  mobility_end_range_control: {
    displayName: "End-Range Control Block",
    missionStatement: "Train the nervous system to actively own newly restored range. Convert passive flexibility into active mobility through isometric control at the limit of available range.",
    primaryAdaptation: "Active control at end-range through PAILs, RAILs, and CARs",
    secondaryAdaptation: "Nervous system ownership of range, joint stability in extended positions",
    volumeProfile: "moderate",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Begin with 20% isometric contraction effort, build to 40% over 4 weeks. CARs are the diagnostic tool — if range decreases in active CARs vs passive, prioritize control work. Loaded end-range introduced only in Week 3+ when control is reliable.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Passive range means nothing if you cannot actively control it — own the range, don't just reach it",
      "PAILs = Progressive Angular Isometric Loading (push into restriction) — builds tissue at new range",
      "RAILs = Regressive Angular Isometric Loading (pull away from restriction) — activates joint control",
      "CARs are the primary training AND assessment tool — perform daily",
      "Progress contraction intensity weekly: 20% → 30% → 40% — never maximal effort in early weeks",
    ],
  },

  mobility_movement_quality: {
    displayName: "Movement Quality Block",
    missionStatement: "Integrate restored range and control into functional movement patterns. Build compound mobility that transfers to athletic and daily movement demands.",
    primaryAdaptation: "Multi-joint mobility integration and movement pattern quality",
    secondaryAdaptation: "Movement sequencing, positional transitions, movement standard fluency",
    volumeProfile: "moderate",
    intensityProfile: "moderate",
    neuralDemandProfile: "moderate",
    progressionPhilosophy: "Start with slow, deliberate movement flows. Progress to more complex transitions and longer sequences. Week 3 integrates dynamic flows with loaded positions. Movement quality is the metric, not duration or reps.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Isolated joint work precedes integrated movement — establish the components before the compound",
      "Flows are trained, not improvised — session structure matters as much as individual exercises",
      "Slow, controlled transitions expose weaknesses in positional control across joints",
      "World's Greatest Stretch and Spiderman flows are diagnostic — note where movement quality breaks down",
      "Movement quality work is the bridge from mobility training to athletic performance",
    ],
  },

  mobility_hip_focus: {
    displayName: "Hip Focus Block",
    missionStatement: "Systematically develop hip mobility in all 6 directions — flexion, extension, internal rotation, external rotation, abduction, adduction. Build the foundation for lower body movement quality.",
    primaryAdaptation: "Hip capsule mobility across all planes, acetabular-femoral joint health",
    secondaryAdaptation: "Hip-related lower back tension reduction, squat depth and stride length improvement",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Address all 6 hip directions each week. CARs are the daily foundation. Prioritize the most restricted direction per athlete. Week 2+ introduces PAILs/RAILs for the most restricted range. Week 3 adds active control and loaded end-range progressions.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Hip CARs are the cornerstone — they assess AND develop range simultaneously",
      "The 90/90 position is the hip mobility studio — it exposes both internal and external rotation",
      "Couch stretch addresses the most restricted hip flexor pattern in desk-bound athletes",
      "Internal rotation is the most neglected hip direction — address it explicitly",
      "Adductor restriction is common — Frog Stretch and Adductor Rockback address it directly",
    ],
  },

  mobility_shoulder_focus: {
    displayName: "Shoulder Focus Block",
    missionStatement: "Restore and develop shoulder complex mobility — glenohumeral joint, scapular control, thoracic contribution. Address the chain from thoracic extension through GH internal/external rotation.",
    primaryAdaptation: "Glenohumeral IR/ER range, shoulder elevation, posterior capsule flexibility",
    secondaryAdaptation: "Scapulohumeral rhythm, overhead capacity, pressing and pulling pattern prerequisite",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "T-spine mobility always precedes shoulder-specific work — the thorax drives shoulder range. Shoulder CARs daily as foundation. Sleeper stretch for posterior capsule. Wall slides for scapular control. Weeks 3–4 introduce loaded end-range shoulder work.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Shoulder mobility begins with thoracic extension — T-spine work first every session",
      "Shoulder CARs are the daily diagnostic and training tool",
      "Posterior capsule tightness (sleeper stretch) is the most common overhead limitation",
      "Pec minor restriction drives scapular protraction — address it before pressing volume",
      "Wall slides train the scapular upward rotation pattern that overhead work demands",
    ],
  },

  mobility_spine_focus: {
    displayName: "Spinal Mobility Block",
    missionStatement: "Restore and develop segmental spinal mobility — thoracic extension, thoracic rotation, and lumbar safe range. Builds the foundation for rotational power, overhead capacity, and postural health.",
    primaryAdaptation: "Thoracic extension, thoracic rotation, segmental spinal articulation",
    secondaryAdaptation: "Rib cage expansion, diaphragmatic breathing quality, lumbar decompression",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Foam roller thoracic extension is the entry point. Segment-by-segment articulation builds from T4 to T10. Rotation work follows extension — always. Breathing integration amplifies thoracic range via rib cage expansion.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Thoracic extension must precede thoracic rotation — you cannot rotate what you cannot extend",
      "Segment-by-segment approach: work one vertebral level at a time on the foam roller",
      "Cat-Cow is a diagnostic tool — identify which segments are restricted and target them",
      "Breathing is the most underused tool for thoracic mobility — rib expansion drives T-spine range",
      "Never attempt lumbar rotation — all rotation work should occur in the thoracic spine",
    ],
  },

  mobility_ankle_focus: {
    displayName: "Ankle Mobility Block",
    missionStatement: "Restore ankle dorsiflexion range — the most commonly restricted mobility prerequisite for squatting, landing, and sprinting. Address calves, soleus, and talocrural joint capsule.",
    primaryAdaptation: "Ankle dorsiflexion range, talocrural joint mobility, squat depth prerequisite",
    secondaryAdaptation: "Calf and Achilles tissue length, foot arch control, single-leg landing mechanics",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Daily ankle CARs are the minimum effective dose. Banded distraction addresses the joint capsule (not just the muscle). Wall stretch addresses gastrocnemius, bent-knee stretch addresses soleus. Heel drops build tissue tolerance. Week 3+ introduces loaded dorsiflexion work.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Ankle restriction has two causes: tight calves (muscular) and restricted joint capsule (structural) — treat both",
      "Banded ankle distraction is the most effective tool for capsular restriction",
      "Measure progress: knee-to-wall distance is the gold standard dorsiflexion test",
      "Daily practice matters more than session volume — short daily work beats weekly sessions",
      "Calf and Achilles health is inseparable from ankle dorsiflexion — single-leg calf raises support both",
    ],
  },

  mobility_stiffness_reduction: {
    displayName: "Stiffness Reduction Block",
    missionStatement: "Address chronic tissue stiffness and morning tightness through targeted dynamic warm-up, contract-relax sequences, and tissue preparation work. Reduce barriers to range access.",
    primaryAdaptation: "Myofascial tissue pliability, chronic stiffness reduction, range access improvement",
    secondaryAdaptation: "Blood flow and tissue temperature, nervous system readiness for mobility work",
    volumeProfile: "moderate",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Tissue prep (foam rolling, lacrosse ball) before all stretching in this block. Contract-relax sequences are more effective than passive holds for chronic stiffness — use them first. Dynamic movements follow tissue prep. Progress by reducing the time needed to access range.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "Foam rolling and tissue work precede all stretching — you cannot stretch effectively through stiff tissue",
      "Contract-relax (PNF) beats passive holds for chronic stiffness — contract 5–10s, release, deepen",
      "Dynamic movements (World's Greatest Stretch, hip flow) are more effective than static holds for morning stiffness",
      "Heat application before mobility work dramatically accelerates range access",
      "Stiffness is a signal — address the training week context (high volume = more recovery bias)",
    ],
  },

  mobility_recovery_flow: {
    displayName: "Recovery Flow Block",
    missionStatement: "Parasympathetic restoration through gentle, sustained holds and breathing-integrated movement. Reduces systemic fatigue, nervous system stress, and tissue soreness after high-load training phases.",
    primaryAdaptation: "Nervous system downregulation, tissue recovery, pain signal reduction",
    secondaryAdaptation: "Passive range maintenance, breathing quality, sleep preparation",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "No progression in the traditional sense — this block is recovery-driven. Hold duration and breathing quality are the focus. Sessions are 20–30 minutes. No active loading, no PAILs/RAILs intensity. Pure restoration.",
    isSpecialPopulation: false,
    keyPrinciples: [
      "This block is NOT lazy — it serves the highest-quality recovery function in the program",
      "5-minute+ holds in key positions (yin yoga style) drive deep nervous system restoration",
      "Breathing IS the training stimulus in this block — diaphragmatic breath count is the metric",
      "No loading, no isometric contractions — pure passive restoration",
      "Use after heavy training weeks, during competition season, or when energy/readiness is low",
    ],
  },

  mobility_reentry_support: {
    displayName: "Re-Entry Support Block",
    missionStatement: "Safely reintroduce movement to post-injury or post-layoff athletes. Graduated range exposure, graded tissue loading, and pain-aware progression before any active mobility training begins.",
    primaryAdaptation: "Pain-free range re-establishment, tissue graded exposure, movement confidence",
    secondaryAdaptation: "Nervous system desensitization to movement, tissue resilience baseline",
    volumeProfile: "low",
    intensityProfile: "low",
    neuralDemandProfile: "low",
    progressionPhilosophy: "Session 1: identify the pain-free range and work only within it. Week 1: passive holds at 50% of pain-free range. Week 2: reach toward pain-free limit. Week 3: hold at pain-free end range. No PAILs/RAILs or loading until Week 4+ and only if pain-free. Progress is driven by subjective pain feedback, not protocol.",
    isSpecialPopulation: true,
    specialPopulationFraming: "Re-entry protocol — all exercise selection and progression is guided by pain-free range. Differentiate joint pain (stop) from muscle tension (acceptable). No end-range loading until 3+ sessions are pain-free.",
    keyPrinciples: [
      "Pain-free range is sacred — never push past it regardless of schedule or program week",
      "Differentiate joint pain from muscle tension: joint pain = stop immediately, muscle tension = work with caution",
      "CARs at reduced range are the assessment tool — use them to track pain-free range progress",
      "Progress in this block is measured in millimeters of range, not weeks of protocol",
      "Success = the athlete ends this block more confident in their movement, not more fatigued",
    ],
  },
};

function selectMobilityBlockType(
  goal: string | null,
  sport: string | null,
  experience: string | null,
  seed: number,
): MobilityBlockType {
  const g = (goal ?? "").toLowerCase();
  const e = (experience ?? "").toLowerCase();

  if (e.includes("return") || e.includes("re-entry") || e.includes("injury") || g.includes("return") || g.includes("pain")) {
    return "mobility_reentry_support";
  }
  if (g.includes("hip") || g.includes("90/90") || g.includes("couch") || g.includes("pigeon")) {
    return "mobility_hip_focus";
  }
  if (g.includes("shoulder") || g.includes("overhead") || g.includes("rotator")) {
    return "mobility_shoulder_focus";
  }
  if (g.includes("spine") || g.includes("thoracic") || g.includes("back") || g.includes("rotation")) {
    return "mobility_spine_focus";
  }
  if (g.includes("ankle") || g.includes("dorsiflexion") || g.includes("squat depth") || g.includes("calf")) {
    return "mobility_ankle_focus";
  }
  if (g.includes("stiff") || g.includes("tight") || g.includes("morning")) {
    return "mobility_stiffness_reduction";
  }
  if (g.includes("recover") || g.includes("restore") || g.includes("rest") || g.includes("deload")) {
    return "mobility_recovery_flow";
  }
  if (g.includes("control") || g.includes("car") || g.includes("pails") || g.includes("end-range")) {
    return "mobility_end_range_control";
  }
  if (g.includes("movement") || g.includes("quality") || g.includes("flow")) {
    return "mobility_movement_quality";
  }

  const generalOptions: MobilityBlockType[] = [
    "mobility_range_restoration",
    "mobility_hip_focus",
    "mobility_movement_quality",
    "mobility_end_range_control",
    "mobility_stiffness_reduction",
  ];
  return generalOptions[Math.floor(seed * generalOptions.length)];
}

function buildMobilityWeekArc(blockType: MobilityBlockType): string {
  switch (blockType) {
    case "mobility_range_restoration":
      return "Week 1: Establish (30s holds, tissue prep, CARs intro) → Week 2: Build (45s holds, contract-relax sequences, increase joint coverage) → Week 3: Intensify (60–90s holds, PAILs/RAILs intro, breathing integration) → Week 4: Deload (Recovery flow, consolidate gains, reduced session length)";
    case "mobility_end_range_control":
      return "Week 1: Establish (20% PAILs/RAILs contraction, CARs at full passive range) → Week 2: Build (25–30% contraction, add loaded CARs) → Week 3: Intensify (35–40% contraction, introduce end-range loading) → Week 4: Deload (CARs only, no loading, maintenance holds)";
    case "mobility_movement_quality":
      return "Week 1: Establish (slow deliberate flows, note breakdown points) → Week 2: Build (add complexity to transitions, time under position) → Week 3: Intensify (full compound flows, loaded positions where appropriate) → Week 4: Deload (simple flows only, breathing emphasis, integration review)";
    case "mobility_hip_focus":
      return "Week 1: Establish (CARs in all 6 directions, 90/90 holds 45s) → Week 2: Build (identify most restricted direction, couch stretch + frog, extend hold to 60s) → Week 3: Intensify (PAILs/RAILs for most restricted direction, weighted 90/90 lift) → Week 4: Deload (CARs maintenance, passive holds, recovery flow)";
    case "mobility_shoulder_focus":
      return "Week 1: Establish (Shoulder CARs, T-spine extension, sleeper stretch 30s) → Week 2: Build (Wall slides, pec minor, increase to 45s holds) → Week 3: Intensify (Shoulder PAILs/RAILs, banded work, 60s holds) → Week 4: Deload (CARs only, light passive holds, recovery integration)";
    case "mobility_spine_focus":
      return "Week 1: Establish (Cat-cow, foam roll thoracic, open books) → Week 2: Build (Segment-by-segment foam roll, quadruped rotation, rib roll) → Week 3: Intensify (Thoracic CARs, breathing integration, side-lying rotation) → Week 4: Deload (Gentle flow only, breathing priority, no active loading)";
    case "mobility_ankle_focus":
      return "Week 1: Establish (Ankle CARs, wall ankle stretch, calf stretch both versions) → Week 2: Build (Banded distraction, increase dorsiflexion challenge, heel drops) → Week 3: Intensify (Ankle PAILs/RAILs, loaded dorsiflexion position) → Week 4: Deload (Daily CARs, maintenance stretches, no loading)";
    case "mobility_stiffness_reduction":
      return "Week 1: Establish (Tissue prep first, contract-relax sequences, 10 min dynamic flow) → Week 2: Build (Add passive holds after dynamic work, extend tissue prep) → Week 3: Intensify (Full protocol: prep → dynamic → passive → active control) → Week 4: Deload (Dynamic flow only, breathing integration, nervous system reset)";
    case "mobility_recovery_flow":
      return "Week 1: Foundation (5-min holds, breathing priority, full-body gentle flow) → Week 2: Deepen (Identify 2–3 high-priority holds, 5–8 min each) → Week 3: Maintain (Same protocol, add breathing reset) → Week 4: Consolidate (Light maintenance, assess readiness for active mobility work)";
    case "mobility_reentry_support":
      return "Week 1: Foundation (Pain-free CARs only, 50% range, tissue prep) → Week 2: Build (Approach pain-free end range, hold 20s) → Week 3: Challenge (Hold at pain-free limit 30–45s, introduce active control) → Week 4: Consolidate (Assess readiness for MOBILITY_RESTORE_RANGE or MOBILITY_END_RANGE_CONTROL)";
    default:
      return "Week 1: Establish → Week 2: Build → Week 3: Intensify → Week 4: Deload";
  }
}

function buildMobilityGoalBias(blockType: MobilityBlockType, sport: string | null, goal: string | null): string {
  const s = (sport ?? "").toLowerCase();

  if (s.includes("soccer") || s.includes("football") && !s.includes("american")) {
    return "Bias toward hip mobility (all directions), adductor range, hamstring flexibility, and ankle dorsiflexion for deep sprint mechanics and kicking patterns";
  }
  if (s.includes("basketball")) {
    return "Bias toward ankle dorsiflexion (landing depth), hip internal rotation, thoracic rotation for court vision, and shoulder mobility for overhead passing";
  }
  if (s.includes("football") || s.includes("rugby")) {
    return "Bias toward hip flexor restoration, thoracic rotation for collision posture, shoulder complex integrity, and spinal decompression after contact loading";
  }
  if (s.includes("baseball") || s.includes("softball") || s.includes("tennis") || s.includes("golf")) {
    return "Bias toward thoracic rotation (maximal rotation range), hip internal rotation, shoulder IR/ER balance, and spinal derotation protocols";
  }
  if (s.includes("swimming") || s.includes("volleyball")) {
    return "Bias toward shoulder complex mobility (all planes), thoracic extension for streamline/spike position, and hip flexor restoration from repetitive kicking or jump loading";
  }
  if (s.includes("gymnastics") || s.includes("dance") || s.includes("martial")) {
    return "Bias toward global range restoration, end-range control work, hip splits preparation, and shoulder hypermobility control";
  }

  switch (blockType) {
    case "mobility_range_restoration":
      return "Bias toward longest-held restriction patterns, passive hold durations, and systematic joint-by-joint range restoration";
    case "mobility_end_range_control":
      return "Bias toward PAILs/RAILs at highest-priority joint restrictions, loaded CARs, and end-range isometric holds";
    case "mobility_movement_quality":
      return "Bias toward compound mobility flows, multi-joint transition patterns, and movement standard integration";
    case "mobility_hip_focus":
      return "Bias toward hip CARs, 90/90 system, couch stretch, frog stretch, and hip PAILs/RAILs for the most restricted direction";
    case "mobility_shoulder_focus":
      return "Bias toward shoulder CARs, T-spine extension prerequisite, sleeper stretch, wall slides, and shoulder PAILs/RAILs";
    case "mobility_spine_focus":
      return "Bias toward segmental thoracic mobilization, thoracic CARs, breathing integration, and rotation work after extension is established";
    case "mobility_ankle_focus":
      return "Bias toward dorsiflexion protocols, banded distraction, calf tissue work, and daily ankle CARs";
    case "mobility_stiffness_reduction":
      return "Bias toward tissue prep, contract-relax sequences, dynamic flows first, and progressive deepening into passive holds";
    case "mobility_recovery_flow":
      return "Bias toward parasympathetic restoration, long passive holds, breathing protocols, and systemic recovery emphasis";
    case "mobility_reentry_support":
      return "Bias toward pain-free range mapping, conservative progression, CARs as assessment, and graduated tissue exposure";
    default:
      return "Bias toward systematic joint health, range acquisition, active control development, and integrated movement quality";
  }
}

export function buildMobilityMonthlyBlockPlan(
  goal: string | null,
  sport: string | null,
  experience: string | null,
  seed: number,
  blockTypeOverride?: string,
): MonthlyBlockPlan & { blockType: MobilityBlockType } {
  const blockType: MobilityBlockType =
    blockTypeOverride && blockTypeOverride in MOBILITY_BLOCKS
      ? (blockTypeOverride as MobilityBlockType)
      : selectMobilityBlockType(goal, sport, experience, seed);

  const baseDefinition = MOBILITY_BLOCKS[blockType];
  const sportGoalBias = buildMobilityGoalBias(blockType, sport, goal);
  const weekProgressionArc = buildMobilityWeekArc(blockType);

  const plan = {
    blockType,
    ...baseDefinition,
    sportGoalBias,
    weekProgressionArc,
  } as MonthlyBlockPlan & { blockType: MobilityBlockType };

  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:MobilityMonthlyBlock]", JSON.stringify({
      blockType,
      displayName: (plan as any).displayName,
      primaryAdaptation: (plan as any).primaryAdaptation,
      sport: sport ?? "none",
      goal: goal ?? "none",
      seed: Number(seed.toFixed(4)),
    }));
  }

  return plan;
}

export function buildMobilityMonthlyBlockContext(plan: MonthlyBlockPlan): string {
  const weekProgressionRows = RANGE_PROGRESSION_MODEL.map(w => {
    const caps = MOBILITY_SESSION_CAPS_BY_WEEK[w.week];
    return [
      `WEEK ${w.week} — ${w.label}`,
      `  Range depth: ${w.rangeDepth} | Hold target: ${w.holdDurationRange[0]}–${w.holdDurationRange[1]}s | Complexity: ${w.complexityLevel} | Control demand: ${w.controlDemand}`,
      `  Control:Range ratio: ${w.controlToRangeRatio} | Session cap: ${caps.maxSessionMinutes} min | TUT cap: ${caps.maxTUTMinutes} min | Max exercises: ${caps.maxExercises}`,
      `  PAILs/RAILs: ${w.pailsRailsAllowed ? "Allowed" : "Not yet — passive range first"} | End-range loading: ${w.endRangeLoadingAllowed ? "Allowed where control is verified" : "Not yet"}`,
      `  Session directives:`,
      w.keyDirectives.map(d => `    • ${d}`).join("\n"),
    ].join("\n");
  }).join("\n\n");

  const blockId = (plan as MonthlyBlockPlan & { blockType?: string }).blockType;
  const continuationMap: Record<string, string> = {
    mobility_range_restoration: "After 4 weeks: progress to mobility_end_range_control (passive range consistently achieved, CARs smooth) OR a joint-specific focus block if one area is clearly limiting.",
    mobility_end_range_control: "After 4 weeks: progress to mobility_movement_quality (active control reliable in 3+ joint directions). If gains plateau, return to mobility_range_restoration for targeted passive work.",
    mobility_movement_quality: "After 4 weeks: cycle back to sport-specific mobility emphasis OR enter maintenance (2x/week CARs + 1 flow session). Consider integrating mobility blocks alongside strength blocks.",
    mobility_hip_focus: "After 4 weeks: progress to mobility_end_range_control (hip control block) or mobility_movement_quality if hip range is now reliable across all 6 directions.",
    mobility_shoulder_focus: "After 4 weeks: progress to mobility_end_range_control (shoulder PAILs/RAILs emphasis). Reassess T-spine — if still limiting, add mobility_spine_focus block.",
    mobility_spine_focus: "After 4 weeks: progress to mobility_movement_quality (thoracic range integrated into pattern work) or mobility_shoulder_focus if shoulder complex is the next limiter.",
    mobility_ankle_focus: "After 4 weeks: progress to mobility_movement_quality (ankle range integrated into squat and sprint mechanics). Maintain daily: CARs + banded distraction protocol.",
    mobility_stiffness_reduction: "After 4 weeks: progress to mobility_range_restoration (tissue now responsive, ready for systematic range work). Keep tissue prep elevated at 10-12 min every session.",
    mobility_recovery_flow: "After 4 weeks: assess readiness for active work. Return to mobility_range_restoration OR mobility_end_range_control based on current range and control state.",
    mobility_reentry_support: "After 4 weeks: if pain-free CARs achieved across all target joints, progress to mobility_stiffness_reduction or mobility_range_restoration at 70% range demand.",
  };
  const continuationNote = blockId && continuationMap[blockId]
    ? continuationMap[blockId]
    : "After this block: assess range and control state. Select next block based on the most limited mobility quality.";

  return `## MOBILITY MONTHLY BLOCK PLAN — MOBILITY ENGINE LAYER 1
Block Type: ${plan.displayName}
Mission: ${plan.missionStatement}

PRIMARY ADAPTATION TARGET: ${plan.primaryAdaptation}
SECONDARY ADAPTATION TARGET: ${plan.secondaryAdaptation}

VOLUME PROFILE: ${plan.volumeProfile.toUpperCase()} | INTENSITY PROFILE: ${plan.intensityProfile.toUpperCase()} | NEURAL DEMAND: ${plan.neuralDemandProfile.toUpperCase()}

PROGRESSION PHILOSOPHY:
${plan.progressionPhilosophy}

SPORT/GOAL BIAS:
${plan.sportGoalBias}
${plan.specialPopulationFraming ? `\nSPECIAL FRAMING:\n${plan.specialPopulationFraming}` : ""}
FOUR-WEEK RANGE/CONTROL PROGRESSION (from Mobility Intelligence Layer):
${weekProgressionRows}

BLOCK-TYPE WEEK ARC (exercise sequencing specifics):
${plan.weekProgressionArc}

KEY MOBILITY PROGRAMMING PRINCIPLES FOR THIS BLOCK:
${plan.keyPrinciples.map((p, i) => `${i + 1}. ${p}`).join("\n")}

CONTINUATION BLOCK INTELLIGENCE:
${continuationNote}`;
}

/**
 * Returns a concise block context string suitable for injection into AI prompts.
 */
export function buildMonthlyBlockContext(plan: MonthlyBlockPlan): string {
  return `## MONTHLY BLOCK PLAN — HIERARCHICAL PROGRAMMING LAYER 1
Block Type: ${plan.displayName}
Mission: ${plan.missionStatement}

PRIMARY ADAPTATION TARGET: ${plan.primaryAdaptation}
SECONDARY ADAPTATION TARGET: ${plan.secondaryAdaptation}

VOLUME PROFILE: ${plan.volumeProfile.toUpperCase()} | INTENSITY PROFILE: ${plan.intensityProfile.toUpperCase()} | NEURAL DEMAND: ${plan.neuralDemandProfile.toUpperCase()}

PROGRESSION PHILOSOPHY:
${plan.progressionPhilosophy}

SPORT/GOAL BIAS:
${plan.sportGoalBias}
${plan.specialPopulationFraming ? `\nSPECIAL POPULATION FRAMING:\n${plan.specialPopulationFraming}` : ""}
FOUR-WEEK ARC:
${plan.weekProgressionArc}

KEY PROGRAMMING PRINCIPLES FOR THIS BLOCK:
${plan.keyPrinciples.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}
