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

// ─── Speed Architecture Brief ─────────────────────────────────────────────────

/**
 * Builds a prescriptive architecture brief for speed/footwork program builds.
 * Mirrors the authority level of the strength `buildArchitectureBrief` so the AI
 * does not fall back on the base prompt's strength-centric session structures.
 *
 * Injected into the system prompt as `architectureBriefText` when focusMode === "speed".
 */
export function buildSpeedArchitectureBrief(
  days: number | null,
  goal: string | null,
  userMessage: string,
): string {
  const sessionCount = days ?? 3;
  const lower = userMessage.toLowerCase();

  // ── Detect primary speed sub-intent ──────────────────────────────────────
  const isAcceleration = /accelerat|first.step|drive.phase|start|block.start|wall.drill|sled/.test(lower);
  const isMaxVelocity = /max.vel|top.speed|flying|stride|wicket|upright/.test(lower);
  const isCOD = /agility|cut|change.of.direction|cod|reactive|decel|stop.and.go/.test(lower);
  const isElastic = /jump|elastic|plyometric|bound|hop|ssc|stiffness/.test(lower);
  const isFootwork = /footwork|ladder|rhythm|coordination|shuffle/.test(lower);

  const primaryFocus = isAcceleration
    ? "Acceleration Development"
    : isMaxVelocity
    ? "Maximum Velocity"
    : isCOD
    ? "Reactive Agility & COD"
    : isElastic
    ? "Elastic & Plyometric Output"
    : isFootwork
    ? "Footwork & Rhythm Development"
    : "Acceleration + Elastic Development";

  // ── Day skeletons — rotate speed qualities across the week ────────────────
  const allDaySkeletons = [
    `Day 1 — Acceleration Development:
  Block A — CNS Activation (10 min): Wall March × 2×10, Single-Leg Hip Hinge March × 2×8 each, Ankle Stiffness Prep × 2×12 contacts
  Block B — Acceleration Warm-Up (10 min): A-Walk × 2×20m, A-Skip × 2×20m, Build-Up Run × 3×30m (sub-maximal)
  Block C — Primary Speed Work (20 min): Falling Start × 4–6 efforts × 20–30m, rest 2–4 min between — 95–100% intent
  Block D — Elastic Support (10 min): Stiffness Hops × 3×10 contacts, Pogo Hops × 3×10 contacts, 90s rest
  Block E — Footwork Finisher (10 min): Speed Ladder In-Out × 4, Lateral Shuffle × 4×10m`,

    `Day 2 — Reactive Footwork + Deceleration Control:
  Block A — CNS Activation (10 min): Nordic Hamstring Curl × 2×6, Copenhagen Hip Adductor × 2×8 each, Straight-Leg Calf March × 2×10
  Block B — Speed Warm-Up (10 min): March to Skip to Run × 3×20m, A-Skip × 3×20m, Build-Up Run × 3×30m
  Block C — COD / Reactive Work (20 min): T-Drill × 4–6 efforts full recovery; then Mirror Drill × 4–6 efforts; or 5-10-5 × 4 efforts
  Block D — Deceleration Control (10 min): Single-Leg Decel Landing × 3×5 each, Hip Lock Decel × 3×4 each, Deceleration Sprint Stop × 3×20m
  Block E — Speed-Strength Bridge (10 min): Jump Squat × 3×4 reps, 2 min rest; OR Trap Bar Jump × 3×4 reps`,

    `Day 3 — Elastic Output + Speed Endurance:
  Block A — Tissue Prep (10 min): Isometric Hamstring Hold × 2×30s each, Ankle Stiffness Prep × 2×12, Nordic Drops × 2×5
  Block B — Acceleration Warm-Up (10 min): Wall Drive × 3×8, A-Skip × 3×20m, Flying Build-Up Run × 3×30m
  Block C — Plyometric Elastic (20 min): Lateral Hurdle Hops × 4×6, Skater Jump to Stick × 3×5 each, Linear Bounding × 3×20m, 90s–3 min rest
  Block D — Speed Endurance (10 min): Repeat 30m Sprint × 4–6 efforts × 60–90s recovery, OR Tempo Run × 4×100m at 70–75%
  Block E — Footwork (optional): Speed Ladder Ickey Shuffle × 3, Carioca × 3×10m`,

    `Day 4 — Max Velocity + Footwork:
  Block A — CNS Activation (10 min): Ankle Stiffness Prep × 2×12, A-Walk × 2×20m, Single-Leg Hip Hinge March × 2×8 each
  Block B — Max Velocity Warm-Up (10 min): A-Skip × 3×20m, B-Skip × 3×20m, Build-Up Run × 3×40m (build to max)
  Block C — Max Velocity (20 min): Flying 20m Sprint × 4–6 efforts, 4–6 min full recovery between — 100% intent
  Block D — Footwork (10 min): Speed Ladder Lateral × 4, Zigzag Hops × 4×10m, Carioca × 4×10m
  Block E — Elastic Finisher (10 min): Countermovement Jump to Sprint × 3×3, Skater Jump × 3×5 each`,

    `Day 5 — COD + Acceleration Contrast:
  Block A — CNS Activation (10 min): Wall March × 2×10, Nordic Hamstring Curl × 2×6, Isometric Hamstring Hold × 2×20s each
  Block B — Warm-Up (10 min): A-Walk, A-Skip, Build-Up Run × 3×30m
  Block C — Acceleration Contrast (15 min): Falling Start × 3×20m; contrast with Box Jump × 3×4 reps immediately after each sprint
  Block D — Reactive COD (15 min): L-Drill × 4–6 efforts; then Drop-Step Decel × 3×4 each
  Block E — Finisher (10 min): Lateral Bound × 3×5 each, Alternating Bounds × 3×20m`,
  ];

  const dayPlans = allDaySkeletons.slice(0, sessionCount);

  return `## SPEED / FOOTWORK ARCHITECTURE BRIEF — MANDATORY STRUCTURE

ACTIVE FOCUS: ${primaryFocus}
SESSION COUNT: ${sessionCount}-day speed program
PROGRAM GOAL: ${goal ?? "Speed & acceleration development"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL BUILD CONSTRAINTS — NON-NEGOTIABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. THIS IS A SPEED PROGRAM — NOT strength, NOT conditioning.
   PROHIBITED as primary work: barbell squat, conventional deadlift, bench press,
   pull-up, barbell row, overhead press, or any traditional strength exercise.
   Speed-strength bridge exercises (Jump Squat, Trap Bar Jump) are ONLY used in a
   supporting Block D or E role — never as the session anchor.

2. EXERCISE LANGUAGE — use sprint-specific terms:
   - Sprint/speed efforts → "X efforts × Ym, rest Z min"
   - Plyometric contacts → "X sets × Y contacts, 90s rest"
   - COD drills → "X efforts, full recovery between"
   - Footwork patterns → "X sets × Ym"
   NEVER use "sets of 10 reps" for speed or plyometric work.

3. CNS ORDER — speed and plyometric work is ALWAYS the first high-intensity
   block after warm-up. It is NEVER placed after heavy lifting or fatigue.

4. REST IS MANDATORY:
   - Max-intent sprints (acceleration/max velocity): 2–6 min between efforts
   - Plyometrics: 90s–3 min between sets
   - COD/reactive: full recovery (1.5–3 min) between efforts
   - Footwork/rhythm: 30–60s (lower CNS demand)

5. VOLUME IS LOW — quality beats quantity:
   - Sprint efforts: 4–6 per session maximum at max intent
   - Plyometric contacts: 24–40 total per session (e.g., 4×8 or 3×10)
   - Never add volume without confirming recovery

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRESCRIBED SESSION STRUCTURE — FILL EXACTLY THIS SKELETON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dayPlans.join("\n\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED EXERCISE VOCABULARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Acceleration: Wall March, Wall Drive, Wall A-Skip, Falling Start, Kneeling Start, Sled Sprint, Sled Push, A-Skip, Block Start
Max Velocity: Flying 20m Sprint, B-Skip, Wicket Run, Build-Up Run, Flying Start Sprint, Sprint Mechanics Drill
COD: 5-10-5, L-Drill, Box Drill, 505 Drill, T-Drill, Decel to Re-Accelerate, Single-Leg Decel Landing, Hip Lock Decel, COD Cut Sprint, Backpedal Sprint
Reactive: Mirror Drill, Shadow Footwork, Reactive Agility Drill, Drop-Step Decel, Crossover Step
Footwork: Speed Ladder In-Out, Ickey Shuffle, Lateral Ladder, Linear Ladder, March to Skip to Run, Lateral Shuffle, Carioca, Zigzag Hops
Elastic: Stiffness Hops, Single-Leg Stiffness Hops, Lateral Hurdle Hops, Skater Jump, Skater Jump to Stick, Linear Bounding, Pogo Hops, Ankle Hops, Countermovement Jump to Sprint, Single-Leg Hops, Lateral Bound, Alternating Bounds
Speed-Strength Bridge: Sled Push, Jump Squat, Trap Bar Jump, Power Clean, Countermovement Jump to Sprint
Tissue Prep: Nordic Hamstring Curl, Isometric Hamstring Hold, Straight-Leg Calf March, Single-Leg Hip Hinge March, Ankle Stiffness Prep, Copenhagen Hip Adductor, Build-Up Run`.trim();
}

// ─── Speed Response Contract ──────────────────────────────────────────────────

/**
 * Builds an explicit JSON response contract for speed programs.
 * Injected into the system prompt so OpenAI knows the exact output structure.
 * This eliminates parse failures from ambiguous or prose-heavy responses.
 */
export function buildSpeedResponseContract(sessionCount: number): string {
  const day1Example = `    {
      "name": "Day 1 — Acceleration Development",
      "exercises": [
        {
          "name": "Isometric Hamstring Hold",
          "sets": 2,
          "reps": "30s each leg",
          "rest": "45s",
          "notes": "Tissue prep — posterior chain activation before sprint work, long-lever hamstring tension"
        },
        {
          "name": "Wall March",
          "sets": 3,
          "reps": "10 contacts",
          "rest": "60s",
          "notes": "Drive phase mechanics — tall spine, aggressive knee drive, dorsiflexed foot, sharp arm action"
        },
        {
          "name": "A-Skip",
          "sets": 3,
          "reps": "20m",
          "rest": "60s",
          "notes": "Sprint mechanics warm-up — synchronized knee drive and arm swing, rhythm and timing"
        },
        {
          "name": "Falling Start",
          "sets": 5,
          "reps": "1 effort × 20m",
          "rest": "3 min",
          "notes": "Primary acceleration work — 95–100% intent every rep, lean to breaking point, aggressive first step. Full recovery required"
        },
        {
          "name": "Stiffness Hops",
          "sets": 3,
          "reps": "10 contacts",
          "rest": "90s",
          "notes": "Elastic support — short ground contact, stiff ankle, vertical force. Stop if contact quality or rhythm drops"
        },
        {
          "name": "Speed Ladder In-Out",
          "sets": 4,
          "reps": "1 length",
          "rest": "45s",
          "notes": "Footwork finisher — sharp contacts, stay light, crisp rhythm. Prioritize quality over speed"
        }
      ]
    }`;

  const day2Example = `    {
      "name": "Day 2 — Reactive Footwork + Deceleration Control",
      "exercises": [
        {
          "name": "Nordic Hamstring Curl",
          "sets": 3,
          "reps": "6 reps",
          "rest": "90s",
          "notes": "Tissue prep — eccentric hamstring load, deceleration capacity, protect posterior chain before COD work"
        },
        {
          "name": "A-Skip",
          "sets": 3,
          "reps": "20m",
          "rest": "60s",
          "notes": "Speed mechanics warm-up — arm action, foot strike position, build tempo across sets"
        },
        {
          "name": "T-Drill",
          "sets": 5,
          "reps": "1 effort, full recovery",
          "rest": "2 min",
          "notes": "Primary COD work — sharp cuts, low hip on change, re-accelerate out of every turn. 100% effort each rep"
        },
        {
          "name": "Single-Leg Decel Landing",
          "sets": 3,
          "reps": "5 each leg",
          "rest": "90s",
          "notes": "Deceleration control — stick the landing, knee over toes, absorb through hip. Stop if knee caves"
        },
        {
          "name": "Jump Squat",
          "sets": 3,
          "reps": "4 reps",
          "rest": "2 min",
          "notes": "Speed-strength bridge — explosive intent every rep, land soft, reset before next. Not conditioning"
        },
        {
          "name": "Lateral Hurdle Hops",
          "sets": 3,
          "reps": "6 contacts",
          "rest": "90s",
          "notes": "Elastic support — stiff ankle, minimize ground contact time, stay reactive laterally"
        }
      ]
    }`;

  const exampleDays = sessionCount >= 2 ? [day1Example, day2Example].join(",\n") : day1Example;

  return `## SPEED PROGRAM — MANDATORY JSON RESPONSE CONTRACT

⛔ ABSOLUTE PROHIBITION — READ BEFORE RESPONDING:
You are FORBIDDEN from returning any of the following:
  - A preview, outline, scaffold, or plan of what you will build
  - Prose describing the structure ("Here's the foundation I'm building...")
  - Future-tense promises ("I'll include...", "I'll map...", "I'll build...")
  - Conditional language ("Once you complete your profile...", "Once I have...")
  - Any response that is not the final, complete, fully-populated JSON program

If you return a preview instead of the complete JSON program, it is a CRITICAL FAILURE.
There is no intermediate step. There is no "planning phase." Output the final program NOW.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST output the speed program as a JSON code block in EXACTLY this format.
No prose. No markdown outside the JSON block. Output the JSON block first, then a 1–2 sentence confirmation.

\`\`\`json
{
  "programName": "Speed & Acceleration Development",
  "programSummary": "Brief description of the speed focus, primary quality, and progression intent for this program",
  "focusMode": "speed",
  "days": [
${exampleDays}
  ]
}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION DEPTH — MANDATORY MINIMUM:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVERY session MUST contain at least 5 exercises (target: 5–7).
Do NOT output a session with only 2, 3, or 4 items. That is an incomplete session.

REQUIRED SESSION SLOT ORDER (fill in sequence):
  Slot 1 — Tissue Prep / CNS Activation (1–2 exercises): e.g., Isometric Hamstring Hold, Nordic Hamstring Curl, Ankle Stiffness Prep
  Slot 2 — Sprint Mechanics / Speed Warm-Up (1–2 exercises): e.g., Wall March, A-Skip, March to Skip to Run
  Slot 3 — PRIMARY Speed Quality (1 exercise, max-intent): e.g., Falling Start, Flying 20m Sprint, T-Drill, Skater Jump
  Slot 4 — Secondary Speed / Reactive / COD (1 exercise): e.g., Stiffness Hops, Mirror Drill, Lateral Bound, Lateral Hurdle Hops
  Slot 5 — Footwork / Trunk / Tissue Support (1 exercise): e.g., Speed Ladder In-Out, Single-Leg Hip Hinge March, Copenhagen Hip Adductor
  Slot 6 — Optional Speed-Strength Bridge or Finisher (1 exercise, when appropriate): e.g., Jump Squat, Trap Bar Jump, Pogo Hops

Minimum by session type:
  Acceleration Development → minimum 5, target 6
  Max Velocity → minimum 5, target 6
  Reactive Footwork + Deceleration Control → minimum 5, target 6
  Elastic Output → minimum 5, target 6
  Speed Endurance → minimum 5, target 5
  Return-to-Speed / Tissue Prep → minimum 4, target 5

COACHING NOTES — SPEED-ONLY LANGUAGE:
  ✓ "Focus on execution quality and full recovery"
  ✓ "Stop the rep if posture or contact quality drops"
  ✓ "Prioritize sharp mechanics over fatigue"
  ✓ "Keep sprint output high — this is not conditioning"
  ✗ NEVER write: "Record any weights used", "track progress week-to-week", "add weight when", "increase the load"
  ✗ NEVER use progressive overload or strength-tracking language in speed coach notes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION NAME RULES — NON-NEGOTIABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Day names MUST use speed-native language. Approved formats:
  ✓ "Day 1 — Acceleration Development"
  ✓ "Day 2 — Reactive Footwork + Deceleration Control"
  ✓ "Day 3 — Elastic Output"
  ✓ "Day 4 — Max Velocity + Footwork"
  ✓ "Day 5 — COD + Acceleration Contrast"
  ✓ "Day 1 — Return-to-Speed Tissue Prep"
  ✓ "Day 2 — Footwork & Rhythm"

STRICTLY PROHIBITED session names (causes automatic rejection):
  ✗ Lower Strength
  ✗ Upper Push / Upper Pull
  ✗ Hypertrophy Day
  ✗ Push Day / Pull Day
  ✗ Leg Day
  ✗ Back & Biceps
  ✗ Chest & Triceps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXERCISE FIELD FORMAT RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Sprint efforts: reps = "X efforts × Ym" (e.g., "4 efforts × 20m")
- Flying sprints: reps = "X efforts × Ym flying" (e.g., "5 efforts × 20m flying")
- Plyometric contacts: reps = "X contacts" (e.g., "10 contacts")
- COD drills: reps = "X efforts, full recovery" (e.g., "4 efforts, full recovery")
- Footwork patterns: reps = "X sets × Ym" or "X runs" (e.g., "4 × 10m")
- Rest MUST be included for every exercise
- notes MUST include coaching cue or quality focus
- NEVER write "10 reps" for a sprint or plyometric movement
- programName MUST reference speed (e.g., "Speed & Acceleration", "Footwork & Deceleration")
- programSummary MUST describe speed qualities (not "strength and conditioning")`;
}

// ─── Speed Output Bleed Validator ─────────────────────────────────────────────

// Matches session names contaminated with strength-training language.
// Covers both classic split names (push/pull/legs) and any name that
// uses "strength" as a primary descriptor (e.g. "Upper Strength + ...").
const STRENGTH_BLEED_SESSION_PATTERNS = /\b(lower strength|upper strength|upper push|upper pull|push day|pull day|hypertrophy|leg day|back.bicep|chest.tricep|upper body strength|lower body strength|strength.day|compound strength|strength.focus|power.lifting|powerlifting|structural balance)\b/i;

const STRENGTH_BLEED_EXERCISE_PATTERNS = /\b(barbell back squat|conventional deadlift|flat bench press|incline bench press|military press|barbell overhead press|barbell row|weighted pull.up|barbell hip thrust)\b/i;

export interface SpeedBleedAuditResult {
  strengthTermsDetected: boolean;
  bleedingSessionNames: string[];
  bleedingExerciseNames: string[];
  repairApplied: boolean;
  rejected: boolean;
}

/**
 * Validates speed program output for strength contamination.
 * Checks session names and exercise names for strength-biased language.
 */
export function validateSpeedOutputForBleed(
  structuredData: { programName?: string; days?: Array<{ name?: string; exercises?: Array<{ name: string }> }> },
): SpeedBleedAuditResult {
  const bleedingSessionNames: string[] = [];
  const bleedingExerciseNames: string[] = [];

  if (structuredData.days) {
    for (const day of structuredData.days) {
      if (day.name && STRENGTH_BLEED_SESSION_PATTERNS.test(day.name)) {
        bleedingSessionNames.push(day.name);
      }
      if (day.exercises) {
        for (const ex of day.exercises) {
          if (ex.name && STRENGTH_BLEED_EXERCISE_PATTERNS.test(ex.name)) {
            bleedingExerciseNames.push(ex.name);
          }
        }
      }
    }
  }

  const strengthTermsDetected = bleedingSessionNames.length > 0 || bleedingExerciseNames.length > 0;

  return {
    strengthTermsDetected,
    bleedingSessionNames,
    bleedingExerciseNames,
    repairApplied: false,
    rejected: false,
  };
}

// ─── Speed Output Repair Layer ────────────────────────────────────────────────

type RepairableProgram = {
  programName?: string;
  programSummary?: string;
  focusMode?: string;
  days?: Array<{
    name?: string;
    exercises?: Array<{
      name: string;
      sets?: number;
      reps?: string;
      rest?: string;
      notes?: string;
    }>;
  }>;
};

const SPEED_SESSION_NAME_MAP: Record<string, string> = {
  "lower strength": "Acceleration Development",
  "upper strength": "Elastic Output + Speed-Strength Bridge",
  "upper push": "Elastic Output + Speed-Strength Bridge",
  "upper pull": "Reactive Footwork + Deceleration Control",
  "push day": "Acceleration Development",
  "pull day": "Reactive Footwork + Deceleration Control",
  "hypertrophy": "Elastic Output",
  "leg day": "Acceleration + Elastic Development",
  "lower body strength": "Acceleration Development",
  "upper body strength": "Elastic Output + Speed-Strength Bridge",
  "strength day": "Acceleration Development",
  "structural balance": "Reactive Footwork + Deceleration Control",
};

const SPEED_DEFAULT_REST_BY_EXERCISE_TYPE: Record<string, string> = {
  sprint: "3 min",
  flying: "4 min",
  drill: "2 min",
  hop: "90s",
  jump: "2 min",
  bound: "90s",
  ladder: "45s",
  shuffle: "45s",
  march: "60s",
  skip: "60s",
  walk: "45s",
  run: "2 min",
  decel: "2 min",
  cod: "2 min",
  agility: "2 min",
  curl: "90s",
  hold: "60s",
};

/**
 * Repairs a speed output that is "close but imperfect":
 * - Replaces strength-flavored session names with speed-native names
 * - Fills missing rest fields from speed defaults
 * - Repairs weak/generic program titles
 * - Stamps focusMode = "speed"
 * - Stamps programSummary if missing or generic
 *
 * Returns the repaired program and a list of repairs applied.
 * Repair preserves the real exercise content — it only fixes labeling and metadata.
 */
export function repairSpeedOutput(
  program: RepairableProgram,
  bleedResult: SpeedBleedAuditResult,
): { repaired: RepairableProgram; repairsApplied: string[] } {
  const repaired: RepairableProgram = JSON.parse(JSON.stringify(program)) as RepairableProgram;
  const repairsApplied: string[] = [];

  // ── 1. Stamp focusMode ──────────────────────────────────────────────────────
  if (!repaired.focusMode || repaired.focusMode !== "speed") {
    repaired.focusMode = "speed";
    repairsApplied.push("stamped_focusMode=speed");
  }

  // ── 2. Repair weak/generic program title ───────────────────────────────────
  if (!repaired.programName || /strength|hypertrophy|muscle|lifting/i.test(repaired.programName)) {
    repaired.programName = "Speed & Acceleration Development";
    repairsApplied.push("repaired_programName");
  }

  // ── 3. Repair missing or generic program summary ───────────────────────────
  if (!repaired.programSummary || /strength|hypertrophy|muscle/i.test(repaired.programSummary)) {
    repaired.programSummary = "CNS-dominant speed development program — acceleration mechanics, elastic output, and reactive footwork built on quality-over-volume principles.";
    repairsApplied.push("repaired_programSummary");
  }

  // ── 4. Repair strength-contaminated session names ──────────────────────────
  if (repaired.days) {
    const speedSessionNames = [
      "Day 1 — Acceleration Development",
      "Day 2 — Reactive Footwork + Deceleration Control",
      "Day 3 — Elastic Output",
      "Day 4 — Max Velocity + Footwork",
      "Day 5 — COD + Acceleration Contrast",
    ];
    let sessionIndex = 0;

    repaired.days = repaired.days.map((day, idx) => {
      if (!day.name) {
        const repairName = speedSessionNames[idx] ?? `Day ${idx + 1} — Speed Training`;
        repairsApplied.push(`repaired_missing_session_name[day${idx + 1}]`);
        return { ...day, name: repairName };
      }
      const lowerName = day.name.toLowerCase();
      let repairedName: string | undefined;
      for (const [pattern, replacement] of Object.entries(SPEED_SESSION_NAME_MAP)) {
        if (lowerName.includes(pattern)) {
          repairedName = replacement;
          break;
        }
      }
      if (repairedName) {
        repairsApplied.push(`repaired_session_name[day${idx + 1}]: "${day.name}" → "${repairedName}"`);
        sessionIndex++;
        return { ...day, name: repairedName };
      }
      return day;
    });
  }

  // ── 5. Fill missing rest fields from speed defaults ───────────────────────
  if (repaired.days) {
    for (let d = 0; d < repaired.days.length; d++) {
      const day = repaired.days[d];
      if (day.exercises) {
        for (let e = 0; e < day.exercises.length; e++) {
          const ex = day.exercises[e];
          if (!ex.rest || ex.rest === "" || ex.rest === "—") {
            const lowerName = ex.name.toLowerCase();
            let defaultRest = "90s";
            for (const [keyword, rest] of Object.entries(SPEED_DEFAULT_REST_BY_EXERCISE_TYPE)) {
              if (lowerName.includes(keyword)) {
                defaultRest = rest;
                break;
              }
            }
            repaired.days[d].exercises![e] = { ...ex, rest: defaultRest };
            repairsApplied.push(`filled_rest[day${d + 1},${ex.name}]=${defaultRest}`);
          }
        }
      }
    }
  }

  return { repaired, repairsApplied };
}

// ─── Session Depth Augmentation Layer ────────────────────────────────────────

/** Minimum exercise count by session type name pattern. */
const SPEED_SESSION_MINIMUM_DEPTH: Array<{ pattern: RegExp; minimum: number; target: number }> = [
  { pattern: /return.to.speed|tissue.prep/i, minimum: 4, target: 5 },
  { pattern: /speed.endurance|tempo/i, minimum: 5, target: 5 },
  { pattern: /acceleration/i, minimum: 5, target: 6 },
  { pattern: /max.vel|maximum.vel|flying/i, minimum: 5, target: 6 },
  { pattern: /reactive|footwork|decel/i, minimum: 5, target: 6 },
  { pattern: /elastic|plyometric|bound/i, minimum: 5, target: 6 },
  { pattern: /cod|contrast|agility/i, minimum: 5, target: 6 },
];

type SpeedExerciseTemplate = {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

/**
 * Approved augmentation drills by session type.
 * These are used to fill in missing slots when a session comes back too thin.
 * Grouped by the slot they fill: tissue_prep, mechanics, secondary, footwork, bridge.
 */
const SPEED_AUGMENTATION_BANKS: Record<string, Record<string, SpeedExerciseTemplate[]>> = {
  acceleration: {
    tissue_prep: [
      { name: "Isometric Hamstring Hold", sets: 2, reps: "30s each leg", rest: "45s", notes: "Posterior chain activation — long-lever hamstring tension before sprint work" },
      { name: "Ankle Stiffness Prep", sets: 2, reps: "12 contacts", rest: "45s", notes: "Prep stiff ankle and Achilles tendon for sprint loading" },
    ],
    mechanics: [
      { name: "A-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Sprint mechanics — knee drive, arm swing, synchronized rhythm" },
      { name: "Wall March", sets: 3, reps: "10 contacts", rest: "60s", notes: "Drive phase mechanics — tall spine, dorsiflexed foot, aggressive knee" },
    ],
    secondary: [
      { name: "Stiffness Hops", sets: 3, reps: "10 contacts", rest: "90s", notes: "Elastic support — short contact time, stiff ankle, vertical force. Stop if quality drops" },
      { name: "Pogo Hops", sets: 3, reps: "10 contacts", rest: "90s", notes: "Ankle stiffness and elastic load — fast ground contact, minimal knee bend" },
    ],
    footwork: [
      { name: "Speed Ladder In-Out", sets: 4, reps: "1 length", rest: "45s", notes: "Footwork finisher — sharp contacts, light feet, crisp rhythm" },
      { name: "Single-Leg Hip Hinge March", sets: 2, reps: "8 each leg", rest: "60s", notes: "Posterior chain posture support — hip hinge mechanics, tall spine" },
    ],
    bridge: [
      { name: "Jump Squat", sets: 3, reps: "4 reps", rest: "2 min", notes: "Speed-strength bridge — explosive intent every rep, land soft, reset. Not conditioning" },
    ],
  },
  max_velocity: {
    tissue_prep: [
      { name: "Ankle Stiffness Prep", sets: 2, reps: "12 contacts", rest: "45s", notes: "Achilles/ankle prep for flying sprint mechanics" },
      { name: "Isometric Hamstring Hold", sets: 2, reps: "30s each leg", rest: "45s", notes: "Posterior chain activation — max velocity demands high hamstring output" },
    ],
    mechanics: [
      { name: "A-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Stride mechanics warm-up — front-side drive, knee lift, arm action" },
      { name: "B-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Max velocity drill — hip extension mechanics, hamstring activation in trail leg" },
    ],
    secondary: [
      { name: "Pogo Hops", sets: 3, reps: "10 contacts", rest: "90s", notes: "Elastic stiffness support — vertical force, fast turnover, stiff ankle" },
      { name: "Single-Leg Stiffness Hops", sets: 3, reps: "8 contacts each leg", rest: "90s", notes: "Unilateral elastic load — asymmetrical stiffness quality, stop if quality drops" },
    ],
    footwork: [
      { name: "Carioca", sets: 3, reps: "20m", rest: "45s", notes: "Hip mobility and coordination finisher — stay light, fast hip rotation" },
      { name: "Speed Ladder Lateral", sets: 4, reps: "1 length", rest: "45s", notes: "Lateral footwork quality — quick contacts, upright posture" },
    ],
    bridge: [
      { name: "Countermovement Jump to Sprint", sets: 3, reps: "3 reps", rest: "2 min", notes: "Speed-strength bridge — explosive CMJ into sprint, link elastic to linear speed" },
    ],
  },
  reactive_cod: {
    tissue_prep: [
      { name: "Nordic Hamstring Curl", sets: 3, reps: "6 reps", rest: "90s", notes: "Eccentric hamstring load — deceleration tissue capacity, protect posterior chain" },
      { name: "Copenhagen Hip Adductor", sets: 2, reps: "8 each leg", rest: "60s", notes: "Groin and hip stability prep — lateral force absorption for COD work" },
    ],
    mechanics: [
      { name: "A-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Speed warm-up — arm action, foot strike position, build tempo" },
      { name: "March to Skip to Run", sets: 3, reps: "30m", rest: "60s", notes: "Movement pattern progression — mechanics continuity from drill to sprint" },
    ],
    secondary: [
      { name: "Single-Leg Decel Landing", sets: 3, reps: "5 each leg", rest: "90s", notes: "Deceleration control — stick the landing, knee over toes, absorb through hip" },
      { name: "Lateral Hurdle Hops", sets: 3, reps: "6 contacts", rest: "90s", notes: "Elastic lateral support — stiff ankle, minimize contact time, reactive" },
    ],
    footwork: [
      { name: "Zigzag Hops", sets: 3, reps: "10m", rest: "60s", notes: "Reactive footwork — quick direction changes, stay light, sharp contacts" },
      { name: "Speed Ladder In-Out", sets: 4, reps: "1 length", rest: "45s", notes: "Coordination finisher — sharp foot contacts, upright posture" },
    ],
    bridge: [
      { name: "Jump Squat", sets: 3, reps: "4 reps", rest: "2 min", notes: "Speed-strength bridge — vertical explosion, land soft. Not conditioning" },
    ],
  },
  elastic: {
    tissue_prep: [
      { name: "Ankle Stiffness Prep", sets: 2, reps: "12 contacts", rest: "45s", notes: "Achilles and ankle prep — tendon prep before plyometric loading" },
      { name: "Nordic Drops", sets: 2, reps: "5 reps", rest: "60s", notes: "Eccentric hamstring prep — slow controlled lowering, protect from plyometric overload" },
    ],
    mechanics: [
      { name: "A-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Sprint mechanics warm-up — rhythm and cadence before elastic work" },
      { name: "Wall Drive", sets: 3, reps: "8 each leg", rest: "60s", notes: "Drive phase mechanics — arm drive and hip power activation" },
    ],
    secondary: [
      { name: "Skater Jump to Stick", sets: 3, reps: "5 each leg", rest: "90s", notes: "Lateral elastic load — single-leg landing control, reactive rebound" },
      { name: "Alternating Bounds", sets: 3, reps: "20m", rest: "90s", notes: "Triple extension elastic output — long ground contact, powerful hip drive" },
    ],
    footwork: [
      { name: "Speed Ladder In-Out", sets: 4, reps: "1 length", rest: "45s", notes: "Footwork finisher — fast contacts, stay light after plyometric load" },
      { name: "Single-Leg Hip Hinge March", sets: 2, reps: "8 each leg", rest: "60s", notes: "Posterior chain posture reset — hip hinge pattern after high elastic volume" },
    ],
    bridge: [
      { name: "Countermovement Jump to Sprint", sets: 3, reps: "3 reps", rest: "2 min", notes: "Elastic to linear speed transfer — link plyometric output into sprint acceleration" },
    ],
  },
  return_to_speed: {
    tissue_prep: [
      { name: "Isometric Hamstring Hold", sets: 2, reps: "30s each leg", rest: "45s", notes: "Sub-maximal posterior chain activation — gentle tissue prep, no strain" },
      { name: "Straight-Leg Calf March", sets: 2, reps: "10 each leg", rest: "45s", notes: "Achilles and calf reintroduction — slow controlled loading, monitor for discomfort" },
    ],
    mechanics: [
      { name: "A-Walk", sets: 2, reps: "20m", rest: "45s", notes: "Movement quality restoration — slow deliberate mechanics, re-establish coordination" },
      { name: "A-Skip", sets: 2, reps: "20m", rest: "60s", notes: "Sub-maximal speed mechanics — 60–70% effort, focus on rhythm" },
    ],
    secondary: [
      { name: "Pogo Hops", sets: 2, reps: "8 contacts", rest: "90s", notes: "Low-load tendon reintroduction — short contact, 50–60% effort max. Stop if any discomfort" },
    ],
    footwork: [
      { name: "Speed Ladder In-Out", sets: 3, reps: "1 length", rest: "60s", notes: "Coordination and rhythm restoration — light effort, quality over speed" },
    ],
  },
  default: {
    tissue_prep: [
      { name: "Isometric Hamstring Hold", sets: 2, reps: "30s each leg", rest: "45s", notes: "Posterior chain activation before speed work" },
    ],
    mechanics: [
      { name: "A-Skip", sets: 3, reps: "20m", rest: "60s", notes: "Sprint mechanics warm-up — knee drive, arm action, rhythm" },
    ],
    secondary: [
      { name: "Stiffness Hops", sets: 3, reps: "10 contacts", rest: "90s", notes: "Elastic support — short contact, stiff ankle. Stop if quality drops" },
    ],
    footwork: [
      { name: "Speed Ladder In-Out", sets: 4, reps: "1 length", rest: "45s", notes: "Footwork finisher — sharp contacts, crisp rhythm, light feet" },
      { name: "Single-Leg Hip Hinge March", sets: 2, reps: "8 each leg", rest: "60s", notes: "Posture and posterior chain support — tall spine, hip hinge pattern" },
    ],
    bridge: [
      { name: "Jump Squat", sets: 3, reps: "4 reps", rest: "2 min", notes: "Speed-strength bridge — explosive intent, land soft, reset between reps" },
    ],
  },
};

function getSessionBank(sessionName: string): Record<string, SpeedExerciseTemplate[]> {
  const lower = sessionName.toLowerCase();
  if (/return.to.speed|tissue.prep/i.test(lower)) return SPEED_AUGMENTATION_BANKS.return_to_speed;
  if (/acceleration/i.test(lower)) return SPEED_AUGMENTATION_BANKS.acceleration;
  if (/max.vel|maximum.vel|flying/i.test(lower)) return SPEED_AUGMENTATION_BANKS.max_velocity;
  if (/reactive|footwork|decel|cod/i.test(lower)) return SPEED_AUGMENTATION_BANKS.reactive_cod;
  if (/elastic|plyometric|bound/i.test(lower)) return SPEED_AUGMENTATION_BANKS.elastic;
  return SPEED_AUGMENTATION_BANKS.default;
}

function getSessionMinimum(sessionName: string): { minimum: number; target: number } {
  for (const { pattern, minimum, target } of SPEED_SESSION_MINIMUM_DEPTH) {
    if (pattern.test(sessionName)) return { minimum, target };
  }
  return { minimum: 5, target: 6 };
}

export interface SpeedSessionDepthAudit {
  dayIndex: number;
  sessionName: string;
  exercisesBeforeExpansion: number;
  minimumRequired: number;
  wasExpanded: boolean;
  drillsAdded: string[];
  exercisesAfterExpansion: number;
}

/**
 * Expands a speed session that has fewer exercises than the minimum required.
 * Adds missing drills from the approved augmentation bank, preserving session identity.
 * Returns the expanded day and audit info.
 */
export function expandSpeedSessionIfTooThin(
  day: { name?: string; exercises?: SpeedExerciseTemplate[] },
  dayIndex: number,
): { expanded: typeof day; audit: SpeedSessionDepthAudit } {
  const sessionName = day.name ?? "";
  const { minimum } = getSessionMinimum(sessionName);
  const exercises = day.exercises ?? [];
  const beforeCount = exercises.length;

  const audit: SpeedSessionDepthAudit = {
    dayIndex,
    sessionName,
    exercisesBeforeExpansion: beforeCount,
    minimumRequired: minimum,
    wasExpanded: false,
    drillsAdded: [],
    exercisesAfterExpansion: beforeCount,
  };

  if (beforeCount >= minimum) {
    return { expanded: day, audit };
  }

  const bank = getSessionBank(sessionName);
  const existingNames = new Set(exercises.map((e) => e.name.toLowerCase()));
  const expanded = { ...day, exercises: [...exercises] };

  const SLOT_ORDER = ["tissue_prep", "mechanics", "secondary", "footwork", "bridge"];

  let filled = expanded.exercises.length;
  for (const slot of SLOT_ORDER) {
    if (filled >= minimum) break;
    const drills = bank[slot] ?? SPEED_AUGMENTATION_BANKS.default[slot] ?? [];
    for (const drill of drills) {
      if (filled >= minimum) break;
      if (!existingNames.has(drill.name.toLowerCase())) {
        expanded.exercises.push({ ...drill });
        existingNames.add(drill.name.toLowerCase());
        audit.drillsAdded.push(drill.name);
        filled++;
      }
    }
  }

  audit.wasExpanded = audit.drillsAdded.length > 0;
  audit.exercisesAfterExpansion = expanded.exercises.length;
  return { expanded, audit };
}

// ─── Speed Coach Note Sanitizer ───────────────────────────────────────────────

const STRENGTH_NOTE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /record\s+(any\s+)?weights?\s+used[^.]*\./gi,
    replacement: "Focus on execution quality and full recovery between efforts.",
  },
  {
    pattern: /track\s+(your\s+)?progress\s+week.to.week[^.]*\./gi,
    replacement: "Prioritize sharp mechanics over fatigue — stop if quality drops.",
  },
  {
    pattern: /add\s+weight\s+when[^.]*\./gi,
    replacement: "Keep sprint output high — do not add volume without confirming recovery.",
  },
  {
    pattern: /increase\s+(the\s+)?load[^.]*\./gi,
    replacement: "Prioritize execution quality over increasing demand.",
  },
  {
    pattern: /progressive\s+overload[^.]*\./gi,
    replacement: "Progress by improving mechanics and intent, not by adding load.",
  },
  {
    pattern: /aim\s+for\s+\d+\s*(kg|lbs?|pounds?)[^.]*\./gi,
    replacement: "Focus on execution quality and full recovery.",
  },
  {
    pattern: /(\d+\s*(kg|lbs?)\s*(or\s+more|target))[^.]*\./gi,
    replacement: "Prioritize sharp mechanics — quality beats quantity in speed work.",
  },
];

/**
 * Removes strength-training language from speed session coaching notes.
 * Replaces detected strength-language patterns with speed-native coaching cues.
 * Returns sanitized notes and whether any sanitization was applied.
 */
export function sanitizeSpeedCoachNotes(
  notes: string,
): { sanitized: string; wasModified: boolean } {
  let sanitized = notes;
  let wasModified = false;
  for (const { pattern, replacement } of STRENGTH_NOTE_PATTERNS) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      wasModified = true;
    }
  }
  return { sanitized, wasModified };
}

/**
 * Applies note sanitization across all exercises in all days of a speed program.
 * Returns the sanitized program and a count of notes that were modified.
 */
export function sanitizeAllSpeedNotes(program: RepairableProgram): {
  sanitized: RepairableProgram;
  notesModifiedCount: number;
} {
  const sanitized: RepairableProgram = JSON.parse(JSON.stringify(program)) as RepairableProgram;
  let notesModifiedCount = 0;
  if (sanitized.days) {
    for (const day of sanitized.days) {
      if (day.exercises) {
        for (const ex of day.exercises) {
          if (ex.notes) {
            const result = sanitizeSpeedCoachNotes(ex.notes);
            if (result.wasModified) {
              ex.notes = result.sanitized;
              notesModifiedCount++;
            }
          }
        }
      }
    }
  }
  return { sanitized, notesModifiedCount };
}

// ─── Session Depth Scorer ─────────────────────────────────────────────────────

export interface SpeedSessionDepthScore {
  sessionName: string;
  exerciseCount: number;
  minimumMet: boolean;
  hasTissuePrep: boolean;
  hasPrimarySpeedWork: boolean;
  hasSecondarySupport: boolean;
  hasFootworkOrTrunk: boolean;
  strengthNotesDetected: boolean;
  score: number;
  threshold: number;
  passed: boolean;
}

const TISSUE_PREP_TERMS = /isometric|nordic|hamstring|ankle.stiff|straight.leg.calf|calf.march|hip.hinge.march|copenhagen|nordic.drop/i;
const PRIMARY_SPEED_TERMS = /sprint|falling.start|flying|block.start|kneeling.start|t.drill|5.10.5|l.drill|box.drill|505|skater.jump|countermovement.jump|depth.drop|lateral.bound|bounding/i;
const SECONDARY_SUPPORT_TERMS = /stiffness.hop|pogo|lateral.hurdle|skater|alternating.bound|mirror.drill|reactive|single.leg.decel|hip.lock.decel|jump.squat|trap.bar.jump|power.clean/i;
const FOOTWORK_TRUNK_TERMS = /ladder|carioca|zigzag|shuffle|lateral.shuffle|hip.hinge.march|copenhagen|back.pedal/i;
const STRENGTH_NOTE_TERMS = /record.*weights|track.*progress.*week|add.*weight|increase.*load|progressive.*overload/i;

/**
 * Scores the completeness and quality of a single speed session.
 * Used for logging and post-generation quality gating.
 */
export function scoreSpeedSessionDepth(
  session: { name?: string; exercises?: Array<{ name: string; notes?: string }> },
): SpeedSessionDepthScore {
  const sessionName = session.name ?? "";
  const exercises = session.exercises ?? [];
  const { minimum } = getSessionMinimum(sessionName);

  const allText = exercises.map((e) => `${e.name} ${e.notes ?? ""}`).join(" ");

  const hasTissuePrep = TISSUE_PREP_TERMS.test(allText);
  const hasPrimarySpeedWork = PRIMARY_SPEED_TERMS.test(allText);
  const hasSecondarySupport = SECONDARY_SUPPORT_TERMS.test(allText);
  const hasFootworkOrTrunk = FOOTWORK_TRUNK_TERMS.test(allText);
  const strengthNotesDetected = STRENGTH_NOTE_TERMS.test(exercises.map((e) => e.notes ?? "").join(" "));
  const minimumMet = exercises.length >= minimum;

  let score = 0;
  if (minimumMet) score += 30;
  if (hasTissuePrep) score += 15;
  if (hasPrimarySpeedWork) score += 25;
  if (hasSecondarySupport) score += 15;
  if (hasFootworkOrTrunk) score += 10;
  if (!strengthNotesDetected) score += 5;

  const threshold = 70;
  return {
    sessionName,
    exerciseCount: exercises.length,
    minimumMet,
    hasTissuePrep,
    hasPrimarySpeedWork,
    hasSecondarySupport,
    hasFootworkOrTrunk,
    strengthNotesDetected,
    score,
    threshold,
    passed: score >= threshold,
  };
}

// ─── Incomplete Build Response Detector ──────────────────────────────────────

const PREVIEW_RESPONSE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Future-tense planning / preview language
  { pattern: /here'?s\s+the\s+foundation/i, label: "here's the foundation" },
  { pattern: /i'?ll\s+include/i, label: "I'll include" },
  { pattern: /i'?ll\s+map/i, label: "I'll map" },
  { pattern: /once\s+you\s+complete\s+your\s+profile/i, label: "once you complete your profile" },
  { pattern: /i'?m\s+building\s+around\s+you/i, label: "I'm building around you" },
  { pattern: /this\s+will\s+be\s+structured/i, label: "this will be structured" },
  { pattern: /here'?s\s+what\s+i'?(?:ll|m)\s+build/i, label: "here's what I'll build" },
  { pattern: /here'?s\s+(?:a\s+)?(?:an?\s+)?(?:overview|outline|preview|scaffold|breakdown)/i, label: "overview/outline language" },
  { pattern: /once\s+(?:we\s+)?(?:have|get|know)/i, label: "once we have/know" },
  { pattern: /i'?(?:ll|'m going to)\s+(?:build|design|create|put together|structure)/i, label: "I'll build/design/create" },
  { pattern: /foundation\s+i'?m\s+building/i, label: "foundation I'm building" },
  { pattern: /i'?(?:ll|'m going to)\s+(?:include|add|incorporate)/i, label: "I'll add/incorporate" },
  { pattern: /(?:day\s+\d+\s*[:\-—]?\s*(?:we'?ll?|will|i'?ll))/i, label: "day X we'll/will" },
  // False-success announcement — AI claims it built the program but returned no JSON.
  // e.g. "Built a 3-day speed program... Check the Program tab."
  // This is the most common failure mode: the AI skips the JSON and jumps straight
  // to the confirmation sentence it was told to add AFTER the JSON block.
  { pattern: /built\s+a?\s*\d*[- ]?day/i, label: "built a X-day (false success announcement)" },
  { pattern: /check\s+the\s+(?:program|activity)\s+tab/i, label: "check the program tab (false success)" },
  { pattern: /^built\s+(?:a|your|the)\s+/i, label: "Built a/your/the... (false success announcement)" },
];

export interface IncompleteBuildDetection {
  isPreview: boolean;
  triggerPhrase: string | null;
  confidence: "high" | "low";
}

/**
 * Detects whether a response is a preview/planning response rather than a completed JSON build.
 * Used to gate the strict-retry path: if OpenAI returned a prose outline instead of the
 * JSON artifact, we retry once with an explicit "build only" enforcement instruction.
 *
 * Two detection paths:
 *   1. Pattern match — specific preview/false-success phrases
 *   2. Length guard — a response under 400 chars physically cannot contain a full program
 */
export function detectIncompleteBuildResponse(text: string): IncompleteBuildDetection {
  for (const { pattern, label } of PREVIEW_RESPONSE_PATTERNS) {
    if (pattern.test(text)) {
      return { isPreview: true, triggerPhrase: label, confidence: "high" };
    }
  }
  // Length-based fallback: a real speed/mobility program with exercises, sets, reps, rest,
  // and coaching notes across multiple days will always exceed 400 characters.
  // If the entire response is under 400 chars and has no JSON, it must be a short
  // announcement, a clarifying question, or some other non-build output.
  if (text.length < 400) {
    return { isPreview: true, triggerPhrase: `short response (${text.length} chars) — not a complete program`, confidence: "high" };
  }
  return { isPreview: false, triggerPhrase: null, confidence: "low" };
}

// ─── Speed Generation Failure Classifier ─────────────────────────────────────

export type SpeedFailureType =
  | "prompt_failure"
  | "parse_failure"
  | "preview_failure"
  | "validation_failure"
  | "bleed_failure"
  | "structure_failure"
  | "unknown_failure";

export interface SpeedFailureClassification {
  type: SpeedFailureType;
  description: string;
  retryable: boolean;
}

/**
 * Classifies the root cause of a speed generation failure.
 * Used for targeted diagnostics and retry strategy.
 */
export function classifySpeedGenerationFailure(context: {
  openAICallSucceeded: boolean;
  rawContentAvailable: boolean;
  parsedJsonAvailable: boolean;
  hasDays: boolean;
  bleedDetected: boolean;
  structureComplete: boolean;
}): SpeedFailureClassification {
  if (!context.openAICallSucceeded) {
    return {
      type: "prompt_failure",
      description: "OpenAI API call failed — network, timeout, or rate limit error",
      retryable: true,
    };
  }
  if (!context.rawContentAvailable) {
    return {
      type: "prompt_failure",
      description: "OpenAI returned empty content",
      retryable: true,
    };
  }
  if (!context.parsedJsonAvailable) {
    if (context.rawContentAvailable) {
      return {
        type: "preview_failure",
        description: "OpenAI returned prose/preview content instead of a JSON build artifact — response contract was ignored",
        retryable: true,
      };
    }
    return {
      type: "parse_failure",
      description: "OpenAI did not output a valid JSON block — response contract was ignored",
      retryable: true,
    };
  }
  if (!context.hasDays) {
    return {
      type: "validation_failure",
      description: "JSON parsed but program has no days array — incomplete structure",
      retryable: true,
    };
  }
  if (context.bleedDetected) {
    return {
      type: "bleed_failure",
      description: "Speed program contains strength-contaminated session names or exercises",
      retryable: true,
    };
  }
  if (!context.structureComplete) {
    return {
      type: "structure_failure",
      description: "Program structure is incomplete — missing required fields",
      retryable: true,
    };
  }
  return {
    type: "unknown_failure",
    description: "Speed generation failed for an unclassified reason",
    retryable: true,
  };
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
