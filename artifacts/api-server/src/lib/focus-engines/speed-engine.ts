/**
 * Speed / Footwork Focus Engine
 *
 * Training focus: acceleration, max velocity, change of direction,
 * elastic/reactive output, footwork/rhythm/timing, deceleration control,
 * and return-to-speed tissue prep.
 *
 * This is NOT "strength with more jumps."
 * It operates on its own logic lane — speed qualities, tempo-based loading,
 * and biomotor development specific to sprint/reactive/agility demands.
 */

import type {
  FocusEngineInterface,
  BlockArchetypeDescriptor,
  MovementFamilyDescriptor,
  SessionGrammarDescriptor,
  ContinuationRuleDescriptor,
  QuickCommandDescriptor,
  MemoryNamespaceDescriptor,
} from "./engine-interface";
import { buildSpeedMonthlyBlockPlan, buildSpeedMonthlyBlockContext, type SpeedBlockType } from "../monthly-block-planner";

// ─── Block Archetypes ─────────────────────────────────────────────────────────

const SPEED_BLOCK_ARCHETYPES: BlockArchetypeDescriptor[] = [
  {
    id: "SPEED_ACCELERATION_DEV",
    label: "Acceleration Development",
    description: "Drive phase mechanics, first-step power, short sprint distances (0–30m). High CNS load, full recovery between efforts. Block and resisted starts.",
    phase: "establish",
    neuralDemand: "high",
    fatigueProfile: "moderate",
  },
  {
    id: "SPEED_MAX_VELOCITY",
    label: "Maximum Velocity",
    description: "Flying sprints, stride mechanics, front-side drive. Distances 30–60m. Full recovery. Speed endurance contrasts.",
    phase: "build",
    neuralDemand: "high",
    fatigueProfile: "moderate",
  },
  {
    id: "SPEED_REACTIVE_AGILITY",
    label: "Reactive Agility & COD",
    description: "Change of direction mechanics, reactive decision-making, footwork patterns, deceleration control. Sport-specific pattern integration.",
    phase: "realize",
    neuralDemand: "high",
    fatigueProfile: "moderate",
  },
  {
    id: "SPEED_ELASTIC_OUTPUT",
    label: "Elastic & Plyometric Output",
    description: "SSC (stretch-shortening cycle) development. Depth drops, reactive jumps, bounding, ankle stiffness. Short ground contact emphasis.",
    phase: "build",
    neuralDemand: "high",
    fatigueProfile: "moderate",
  },
  {
    id: "SPEED_FOOTWORK_RHYTHM",
    label: "Footwork & Rhythm Development",
    description: "Ladder work, coordination patterns, rhythm and timing, foot contact quality. Ties into game-speed pattern recognition.",
    phase: "establish",
    neuralDemand: "moderate",
    fatigueProfile: "low",
  },
  {
    id: "SPEED_RETURN_RECOVERY",
    label: "Return-to-Speed / Tissue Prep",
    description: "Sub-maximal speed work, tendon and tissue preparation, movement quality restoration, deceleration reintroduction. Used after load spikes or injury return.",
    phase: "deload",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
];

// ─── Movement Families ────────────────────────────────────────────────────────

const SPEED_MOVEMENT_FAMILIES: MovementFamilyDescriptor[] = [
  {
    id: "acceleration_drills",
    label: "Acceleration Drills",
    examples: ["Block starts", "Resisted sprints", "Wall drives", "Falling starts", "Push-up starts"],
    primaryAdaptation: "first-step power, drive phase mechanics, horizontal force production",
  },
  {
    id: "max_velocity_sprints",
    label: "Maximum Velocity Sprints",
    examples: ["Flying 30s", "Flying 20s", "Build-up runs", "Wicket runs"],
    primaryAdaptation: "top-end speed, stride mechanics, front-side drive",
  },
  {
    id: "change_of_direction",
    label: "Change of Direction",
    examples: ["Pro agility", "5-10-5", "T-drill", "L-cone", "Box drill", "Planted cuts"],
    primaryAdaptation: "deceleration absorption, penultimate step mechanics, re-acceleration",
  },
  {
    id: "reactive_agility",
    label: "Reactive Agility",
    examples: ["Mirror drills", "Reactive cone drills", "Sport-specific reads", "Ball-drop reactions"],
    primaryAdaptation: "decision speed, anticipation, open-skill agility",
  },
  {
    id: "plyometrics_elastic",
    label: "Plyometric & Elastic",
    examples: ["Pogo hops", "Ankle hops", "Depth drops", "Box jumps", "Bounding", "Single-leg hops"],
    primaryAdaptation: "stretch-shortening cycle, ankle stiffness, reactive strength index",
  },
  {
    id: "footwork_rhythm",
    label: "Footwork & Rhythm",
    examples: ["Ladder patterns", "Cone touches", "Shuffle patterns", "In-and-outs", "Ickey shuffles"],
    primaryAdaptation: "foot contact quality, coordination, neuromuscular timing",
  },
  {
    id: "deceleration_control",
    label: "Deceleration Control",
    examples: ["Braking sprints", "Controlled cuts", "Landing mechanics", "Nordic drops"],
    primaryAdaptation: "posterior chain decel capacity, knee stability under load, eccentric tendon health",
  },
  {
    id: "speed_strength",
    label: "Speed-Strength Transfer",
    examples: ["Power clean", "Jump squat", "Split jerk", "Trap bar jump", "Banded deadlift"],
    primaryAdaptation: "rate of force development, strength-to-speed bridge",
  },
];

// ─── Session Grammar ──────────────────────────────────────────────────────────

const SPEED_SESSION_GRAMMAR: SessionGrammarDescriptor = {
  primarySlotCount: 1,
  secondarySlotCount: 3,
  repRangeGuidance: "Sprint efforts: 2–6 per set, full recovery. Plyos: 3–5 reps (quality over quantity). COD: 3–6 reps per set. All speed work MUST be done fresh (post-warm-up, pre-fatigue).",
  restGuidance: "Acceleration: 2–4 min per effort. Max velocity: 4–6 min. Plyos: 90s–3 min. Footwork: 30–60s (lower CNS demand). FULL recovery before max-effort repeats.",
  intensityGuidance: "Speed sessions: 95–100% intent on primary efforts. Sub-maximal work at 70–85% effort only in return-to-speed blocks. Never combine heavy strength with max-intent speed on same day.",
  specialNotes: "Speed work is CNS-dominant — schedule first in session, never after heavy lifting. Volume is LOW — quality of movement > quantity. Always include a thorough acceleration warm-up (A-walks, A-skips, build-ups).",
};

// ─── Continuation Rules ───────────────────────────────────────────────────────

const SPEED_CONTINUATION_RULES: ContinuationRuleDescriptor = {
  nextBlockOptions: [
    "SPEED_RETURN_RECOVERY → SPEED_ACCELERATION_DEV (after injury or deload)",
    "SPEED_ACCELERATION_DEV → SPEED_MAX_VELOCITY",
    "SPEED_ACCELERATION_DEV + SPEED_FOOTWORK_RHYTHM → SPEED_REACTIVE_AGILITY",
    "SPEED_MAX_VELOCITY → SPEED_ELASTIC_OUTPUT",
    "SPEED_REACTIVE_AGILITY → SPEED_ELASTIC_OUTPUT (late-phase sport integration)",
    "Any block → SPEED_RETURN_RECOVERY (after load spike, high soreness, or injury)",
  ],
  progressionDirection: "Tissue prep → Acceleration → Max velocity → Reactive/COD → Elastic output. Increase sprint distance/volume by 10% weekly. Never increase both distance AND intensity simultaneously.",
  deescalationTriggers: ["Hamstring tightness or pain reports", "Readiness < 55 for 2+ sessions", "Tendon load soreness persisting 48h+", "Ground contact times degrading"],
  adaptationCues: ["Sprint times improving → progress to next distance", "Fatigue accumulation → increase recovery duration", "COD errors increasing → reduce reactive demand, return to closed drills"],
};

// ─── Quick Commands ───────────────────────────────────────────────────────────

const SPEED_QUICK_COMMANDS: QuickCommandDescriptor[] = [
  { label: "More acceleration", intentMapping: "increase_acceleration_emphasis", engineBias: "SPEED_ACCELERATION_DEV" },
  { label: "More reactive", intentMapping: "increase_reactive_elastic", engineBias: "SPEED_ELASTIC_OUTPUT" },
  { label: "Reduce tendon load", intentMapping: "reduce_tendon_stress", engineBias: "SPEED_RETURN_RECOVERY" },
  { label: "More footwork", intentMapping: "increase_footwork_rhythm", engineBias: "SPEED_FOOTWORK_RHYTHM" },
  { label: "Recovery focus", intentMapping: "shift_recovery", engineBias: "SPEED_RETURN_RECOVERY" },
];

// ─── Memory Namespace ─────────────────────────────────────────────────────────

const SPEED_MEMORY_NAMESPACE: MemoryNamespaceDescriptor = {
  namespace: "speed",
  exampleKeys: ["acceleration_focus", "decel_sensitivity", "tendon_load_concern", "sport_position_speed_demand", "sprint_volume_tolerance"],
  sharedWithGlobal: false,
};

// ─── Prompt Context ───────────────────────────────────────────────────────────

function buildSpeedPromptContext(userMessage: string, goal?: string, sport?: string, experience?: string): string {
  const lower = userMessage.toLowerCase();

  // Determine which speed block type best matches the user's current message
  const emphasisHints: string[] = [];
  let blockTypeHint: SpeedBlockType | undefined;

  if (/accelerat|first.step|drive.phase|start|block.start|wall.drill|sled/.test(lower)) {
    emphasisHints.push("User message signals ACCELERATION intent — use speed_acceleration_development block: wall drills, falling starts, sled sprints, resisted acceleration, drive phase mechanics.");
    blockTypeHint = "speed_acceleration_development";
  }
  if (/max.vel|top.speed|flying.sprint|stride|wicket|upright/.test(lower)) {
    emphasisHints.push("User message signals MAX VELOCITY intent — use speed_max_velocity block: flying sprints (20–40m), wicket runs, B-Skip, stride mechanics, stiffness hops.");
    blockTypeHint = blockTypeHint ?? "speed_max_velocity";
  }
  if (/agility|cut|change.of.direction|cod|reactive|decel|stop.and.go/.test(lower)) {
    emphasisHints.push("User message signals COD/REACTIVE intent — use speed_cod_deceleration or speed_reactive_footwork block: T-drill, L-drill, mirror drill, 505, decel-to-re-accelerate, single-leg decel landing.");
    blockTypeHint = blockTypeHint ?? "speed_cod_deceleration";
  }
  if (/jump|elastic|plyometric|bound|hop|ssc|stiffness/.test(lower)) {
    emphasisHints.push("User message signals ELASTIC OUTPUT intent — include stiffness hops, skater jumps, lateral hurdle hops, linear bounding, countermovement jump to sprint.");
  }
  if (/footwork|ladder|rhythm|coordination|shuffle/.test(lower)) {
    emphasisHints.push("User message signals FOOTWORK/RHYTHM intent — use speed_reactive_footwork block: speed ladder (in-out, Ickey, lateral), shadow footwork, mirror drill, box drill.");
    blockTypeHint = blockTypeHint ?? "speed_reactive_footwork";
  }
  if (/recover|tendon|tissue|hamstring|return|rehab|comeback/.test(lower)) {
    emphasisHints.push("User message signals RETURN-TO-SPEED intent — use speed_return_to_speed block: Nordic curls, isometric hamstring hold, straight-leg calf march, ankle stiffness prep, build-up runs at 70–80%.");
    blockTypeHint = blockTypeHint ?? "speed_return_to_speed";
  }
  if (/endurance|repeat.sprint|conditioning|conditioning.speed/.test(lower)) {
    emphasisHints.push("User message signals SPEED ENDURANCE intent — use speed_endurance_capacity block: tempo runs, repeat 30m sprints, 150m speed endurance runs, incomplete recovery intervals.");
    blockTypeHint = blockTypeHint ?? "speed_endurance_capacity";
  }

  // Generate a speed-specific monthly block plan to inject as the periodization layer
  const seed = Math.random();
  const speedBlockPlan = buildSpeedMonthlyBlockPlan(
    goal ?? userMessage.slice(0, 100),
    sport ?? null,
    experience ?? null,
    seed,
    blockTypeHint,
  );
  const blockContext = buildSpeedMonthlyBlockContext(speedBlockPlan);

  return `
[FOCUS MODE: SPEED / FOOTWORK]
Active training focus: Speed & Footwork — acceleration, max velocity, COD, elastic/reactive output, footwork, deceleration control, return-to-speed.

THIS IS NOT STRENGTH WITH MORE JUMPS. Speed work operates on its own biomotor logic lane.

${blockContext}

MOVEMENT FAMILIES available in this mode:
1. Acceleration Drills — Wall March, Wall Drive, Wall A-Skip, Falling Start, Kneeling Start, Sled Sprint, Sled Push, A-Skip, Acceleration Drill
2. Max Velocity — Flying 20m Sprint, B-Skip, Wicket Run, Build-Up Run, Flying Start Sprint, Sprint Mechanics Drill
3. COD & Deceleration — 5-10-5, L-Drill, Box Drill, 505 Drill, T-Drill, Decel to Re-Accelerate, Single-Leg Decel Landing, Hip Lock Decel, Deceleration Sprint Stop, COD Cut Sprint, Backpedal Sprint
4. Reactive Agility — Mirror Drill, Shadow Footwork, Reactive Agility Drill, Drop-Step Decel, Crossover Step
5. Footwork & Rhythm — Speed Ladder In-Out, Ickey Shuffle, Lateral Ladder, Linear Ladder, March to Skip to Run, Lateral Shuffle, Carioca, Zigzag Hops
6. Elastic & Plyometric — Stiffness Hops, Single-Leg Stiffness Hops, Lateral Hurdle Hops, Skater Jump, Skater Jump to Stick, Linear Bounding, Pogo Hops, Ankle Hops, Countermovement Jump to Sprint, Single-Leg Hops, Lateral Bound, Alternating Bounds
7. Speed-Strength Transfer — Sled Push, Jump Squat, Trap Bar Jump, Power Clean, Countermovement Jump to Sprint
8. Return-to-Speed Tissue Prep — Nordic Hamstring Curl, Isometric Hamstring Hold, Straight-Leg Calf March, Single-Leg Hip Hinge March, Ankle Stiffness Prep, Copenhagen Hip Adductor, Build-Up Run
9. Speed Endurance — Tempo Run, Repeat 30m Sprint, 150m Speed Endurance Run, Assault Bike Sprint

CRITICAL SPEED SESSION RULES:
- Speed work is CNS-dominant — ALWAYS first in session, never after heavy lifting or high fatigue
- Volume is LOW — 4–8 max-intent sprints per session. Quality beats quantity every time
- Full recovery between max-intent efforts: acceleration = 2–4 min, max velocity = 4–6 min
- Mandatory acceleration warm-up: A-walks → Wall March → A-Skip → Build-Up → full sprint
- Never combine max-intensity speed with max-intensity strength on the same day

4-WEEK SPEED SESSION STRUCTURE:
- Week 1 (Establish): mechanics drills + sub-maximal speed exposure (80–85%)
- Week 2 (Build): add 1–2 sprints, progress distance or complexity
- Week 3 (Intensify): full intent, introduce reactive/COD element, contrast pairs
- Week 4 (Deload): 50% volume, mechanics review, no max intent

PRIMARY SESSION SKELETON:
1. Tissue Prep + CNS Activation (Nordic, ankle stiffness, single-leg work) — 10 min
2. Acceleration Warm-Up Series (march → skip → build-ups) — 10 min
3. Primary Speed Quality (1 quality only: acceleration OR max velocity OR COD) — 20 min
4. Secondary/Supporting Qualities (footwork, elastic, or decel work) — 15 min
5. Conditioning / Fitness finisher (only if in speed endurance block) — 10 min

AGENT COACHING LANGUAGE in Speed mode:
- Reference speed qualities: ground contact time, stride rate, elasticity, COD angle, drive phase, front-side mechanics, reactive decision time
- Do NOT default to strength language ("sets and reps") — use sprint-specific language ("efforts", "reps at X%", "distances", "contact quality")
- Qualities first, fitness second
${emphasisHints.length > 0 ? "\nLIVE MESSAGE SIGNALS:\n" + emphasisHints.join("\n") : ""}
`.trim();
}

// ─── Adaptation Heuristics ────────────────────────────────────────────────────

function getSpeedAdaptationHeuristics(): string {
  return `
SPEED ENGINE — Adaptation Heuristics:
- Sprint time improvements (3+ sessions): progress to next distance or block
- Tendon soreness persisting 48h+: immediately move to SPEED_RETURN_RECOVERY
- Ground contact quality degrading: reduce plyometric volume 30–40%
- COD errors increasing: return to closed (pre-planned) drill emphasis before re-introducing reactive
- Hamstring tightness signals: cut max-intent sprint volume by 50%, add decel control work
- In-season adjustment: reduce training sprint volume by 40%, maintain intensity (no volume creep)
`.trim();
}

// ─── Engine Export ────────────────────────────────────────────────────────────

export const speedEngine: FocusEngineInterface = {
  focusMode: "speed",
  label: "Speed / Footwork",

  getBlockArchetypes: () => SPEED_BLOCK_ARCHETYPES,
  getMovementFamilies: () => SPEED_MOVEMENT_FAMILIES,
  getSessionGrammar: () => SPEED_SESSION_GRAMMAR,
  getContinuationRules: () => SPEED_CONTINUATION_RULES,
  getQuickCommandSemantics: () => SPEED_QUICK_COMMANDS,
  getMemoryNamespace: () => SPEED_MEMORY_NAMESPACE,

  buildPromptContext: buildSpeedPromptContext,
  getAdaptationHeuristics: getSpeedAdaptationHeuristics,
};
