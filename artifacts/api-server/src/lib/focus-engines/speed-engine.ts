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

function buildSpeedPromptContext(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  const emphasisHints: string[] = [];
  if (/accelerat|first.step|drive.phase|start/.test(lower)) {
    emphasisHints.push("User message signals acceleration intent — bias toward SPEED_ACCELERATION_DEV, block/resisted work, drive phase mechanics.");
  }
  if (/agility|cut|change.of.direction|cod|reactive/.test(lower)) {
    emphasisHints.push("User message signals reactive/COD intent — bias toward SPEED_REACTIVE_AGILITY, sport-specific patterns, deceleration control.");
  }
  if (/jump|elastic|plyometric|bound|hop|ssc/.test(lower)) {
    emphasisHints.push("User message signals elastic output intent — bias toward SPEED_ELASTIC_OUTPUT, plyometrics, SSC development.");
  }
  if (/footwork|ladder|rhythm|coordination/.test(lower)) {
    emphasisHints.push("User message signals footwork/rhythm intent — bias toward SPEED_FOOTWORK_RHYTHM, pattern work, timing.");
  }
  if (/recover|tendon|tissue|hamstring|return/.test(lower)) {
    emphasisHints.push("User message signals return-to-speed or tissue care intent — bias toward SPEED_RETURN_RECOVERY, sub-maximal work.");
  }

  return `
[FOCUS MODE: SPEED / FOOTWORK]
Active training focus: Speed & Footwork — covering acceleration, max velocity, change of direction, elastic/reactive output, footwork, deceleration control, and return-to-speed.

THIS IS NOT STRENGTH WITH MORE JUMPS. Speed work operates on its own biomotor logic.

BLOCK ARCHETYPES available in this mode:
- Acceleration Development: drive phase, 0–30m, resisted starts, full recovery
- Maximum Velocity: flying sprints, 30–60m, stride mechanics
- Reactive Agility & COD: direction change, decision speed, sport-specific reads
- Elastic & Plyometric Output: SSC, ankle stiffness, reactive strength index
- Footwork & Rhythm: ladder, coordination, foot contact quality
- Return-to-Speed / Tissue Prep: sub-max work, tendon health, decel reintroduction

MOVEMENT GRAMMAR for this mode:
- Speed work is CNS-dominant — ALWAYS first in session, never after heavy lifting
- Volume is LOW — quality of effort over quantity of reps
- Full recovery between max-intent efforts (2–6 min)
- Acceleration warm-up required: A-walks → A-skips → build-ups
- Never combine max-intensity speed with max-intensity strength on same day

SESSION STRUCTURE:
- 1 primary speed quality (acceleration OR max velocity OR COD — not all three)
- 2–3 supporting qualities (footwork, elastic work, or decel drills)
- Conditioning/fitness work only at session END, never before speed

AGENT BEHAVIOR in Speed mode:
- Responses and examples bias toward sprint mechanics, reactive qualities, agility, footwork, and speed-strength transfer
- Coaching language references speed qualities: ground contact, stride rate, elasticity, COD angle, reactive decision time
- Do NOT default to strength-first language or load-based prescriptions
- Think in terms of "qualities first, fitness second"
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
