/**
 * Mutation Ontology — Canonical Coaching Command Registry
 *
 * Single source of truth for every mutation family that TrainChat can apply.
 * Maps scattered IntentFamily strings to stable canonical command names, provides
 * metadata (category, default scope, structural requirements, anti-patterns) that
 * drives validation, logging, and deterministic recipe dispatch.
 *
 * Design constraints:
 *  - IntentFamily strings are NEVER renamed here; this is a normalization/alias layer.
 *  - getMutationFamilies() is the authoritative list used by isMutationFamily() in
 *    execution-planner.ts — do not maintain a separate hardcoded list there.
 *  - Every CanonicalMutationCommand must declare minimumStructuralChanges ≥ 1.
 */

import type { IntentFamily } from "./intent-family-engine";

// ─── Mutation Categories ──────────────────────────────────────────────────────

export type MutationCategory =
  | "difficulty_adjustment"
  | "volume_adjustment"
  | "time_adjustment"
  | "strength_specialization"
  | "hypertrophy_specialization"
  | "endurance_conditioning"
  | "athletic_specialization"
  | "mobility_recovery"
  | "structural_modification"
  | "constraint_application"
  | "state_adaptation";

// ─── Canonical Command Names ──────────────────────────────────────────────────

export type CanonicalCommandName =
  | "INCREASE_DIFFICULTY"
  | "DECREASE_DIFFICULTY"
  | "INCREASE_VOLUME"
  | "DECREASE_VOLUME"
  | "REDUCE_TIME"
  | "INCREASE_TIME"
  | "STRENGTH_FOCUS"
  | "HYPERTROPHY_FOCUS"
  | "ENDURANCE_FOCUS"
  | "CONDITIONING_FOCUS"
  | "POWER_EXPLOSIVE_FOCUS"
  | "SPEED_FOCUS"
  | "REACTIVE_FOCUS"
  | "COD_DECEL_FOCUS"
  | "FOOTWORK_RHYTHM_FOCUS"
  | "ATHLETIC_PERFORMANCE_FOCUS"
  | "FATIGUE_MANAGEMENT"
  | "RECOVERY_FOCUS"
  | "MOBILITY_SUPPORT"
  | "ROM_RESTORATION_FOCUS"
  | "TISSUE_STIFFNESS_FOCUS"
  | "TENDON_RESILIENCE_FOCUS"
  | "END_RANGE_CONTROL_FOCUS"
  | "MOBILITY_FLOW_FOCUS"
  | "UNILATERAL_EMPHASIS"
  | "POSTERIOR_CHAIN_EMPHASIS"
  | "TRUNK_CORE_EMPHASIS"
  | "INJURY_MODIFICATION"
  | "JOINT_FRIENDLY_MODIFICATION"
  | "EQUIPMENT_CONSTRAINT"
  | "ADD_EXERCISE"
  | "EXERCISE_SWAP"
  | "EXERCISE_PROGRESSION"
  | "EXERCISE_REGRESSION"
  | "DAY_PROGRESSION"
  | "DAY_REGRESSION"
  | "SESSION_EXPANSION"
  | "SESSION_REDUCTION"
  | "READINESS_LOW"
  | "MISSED_SESSIONS_REENTRY"
  | "ENVIRONMENT_TEMPORARY_SWITCH"
  | "SPORT_CONTEXT_UPDATE"
  | "EXERCISE_DISLIKE_OR_PREFERENCE"
  | "BULK_SESSION_SETS_INCREASE";

// ─── Canonical Command Definition ─────────────────────────────────────────────

export interface CanonicalMutationCommand {
  name: CanonicalCommandName;
  category: MutationCategory;
  description: string;
  defaultScope: "exercise" | "session" | "week" | "program";
  aliases: IntentFamily[];
  minimumStructuralChanges: number;
  antiPatterns: string[];
  aiDirective: string;
}

// ─── Ontology Registry ────────────────────────────────────────────────────────

export const MUTATION_ONTOLOGY: Record<CanonicalCommandName, CanonicalMutationCommand> = {
  INCREASE_DIFFICULTY: {
    name: "INCREASE_DIFFICULTY",
    category: "difficulty_adjustment",
    description: "Raise training demand via load, intensity, rep range, density, or complexity.",
    defaultScope: "session",
    aliases: ["increase_difficulty"],
    minimumStructuralChanges: 1,
    antiPatterns: ["text-only coaching note with no load/rep/rest change", "adding motivation language without structural change"],
    aiDirective: "Apply at least one of: heavier load cue (3-6 rep range), extra set, reduced rest, or added complexity. State specifically what changed and why.",
  },
  DECREASE_DIFFICULTY: {
    name: "DECREASE_DIFFICULTY",
    category: "difficulty_adjustment",
    description: "Reduce training demand via load, volume, rest, or simpler movement selection.",
    defaultScope: "session",
    aliases: ["decrease_difficulty"],
    minimumStructuralChanges: 1,
    antiPatterns: ["removing entire exercises without cause", "dropping intensity below maintenance threshold without fatigue justification"],
    aiDirective: "Apply at least one of: higher rep range (10-15), removed set, extended rest, or regression to simpler variation. Preserve structural integrity.",
  },
  INCREASE_VOLUME: {
    name: "INCREASE_VOLUME",
    category: "volume_adjustment",
    description: "Add sets, reps, or exercises to increase total training volume.",
    defaultScope: "week",
    aliases: ["increase_volume"],
    minimumStructuralChanges: 1,
    antiPatterns: ["coaching note without set/rep change", "description-only session update"],
    aiDirective: "Add at least 1 set to accessory exercises or insert a new accessory exercise. Primary lifts are prioritized and protected.",
  },
  DECREASE_VOLUME: {
    name: "DECREASE_VOLUME",
    category: "volume_adjustment",
    description: "Remove sets, reps, or exercises to reduce total training volume.",
    defaultScope: "week",
    aliases: ["decrease_volume"],
    minimumStructuralChanges: 1,
    antiPatterns: ["removing primary exercises", "zeroing out all volume"],
    aiDirective: "Remove 1 set from accessory exercises. Primary compound lifts must be protected. Never drop below 2 sets per exercise.",
  },
  REDUCE_TIME: {
    name: "REDUCE_TIME",
    category: "time_adjustment",
    description: "Shorten session duration by trimming accessories and finishers.",
    defaultScope: "session",
    aliases: ["reduce_time"],
    minimumStructuralChanges: 1,
    antiPatterns: ["removing primary lifts to save time", "collapsing rest times below safe minimums"],
    aiDirective: "Remove finishers and lower-priority accessories first. Primary and main accessories take priority and must remain.",
  },
  INCREASE_TIME: {
    name: "INCREASE_TIME",
    category: "time_adjustment",
    description: "Extend session duration by adding warm-up, cool-down, or additional exercises.",
    defaultScope: "session",
    aliases: ["increase_time"],
    minimumStructuralChanges: 1,
    antiPatterns: ["adding volume without purpose", "lengthening session without structural rationale"],
    aiDirective: "Add a warm-up block, cool-down, or 1-2 purposeful accessories. Justify each addition with a training rationale.",
  },
  STRENGTH_FOCUS: {
    name: "STRENGTH_FOCUS",
    category: "strength_specialization",
    description: "Shift session toward maximal strength: low reps, heavy load, full rest.",
    defaultScope: "session",
    aliases: ["strength_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["text-only emphasis change", "single coaching note without rep/rest change"],
    aiDirective: "Reduce primary lift reps to 3-6, extend rest to 3-5 min, reduce accessory volume. Load target: 85-92% of max. Apply to ≥ 2 exercises.",
  },
  HYPERTROPHY_FOCUS: {
    name: "HYPERTROPHY_FOCUS",
    category: "hypertrophy_specialization",
    description: "Shift session toward muscle growth: moderate reps, tight rest, isolation work.",
    defaultScope: "session",
    aliases: ["hypertrophy_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["text-only description update", "adding exercises without rep/rest adjustment"],
    aiDirective: "Move primaries to 6-10 reps, 90s rest. Add isolation accessory. Push accessories to 10-15 reps, 60-75s rest.",
  },
  ENDURANCE_FOCUS: {
    name: "ENDURANCE_FOCUS",
    category: "endurance_conditioning",
    description: "Add endurance/aerobic emphasis: conditioning finisher, tighter rest, higher reps.",
    defaultScope: "session",
    aliases: ["endurance_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["finisher without rest/rep adjustment on primaries", "single text update"],
    aiDirective: "Add conditioning finisher, tighten primary rest to 90s, push accessories to 12-15 reps.",
  },
  CONDITIONING_FOCUS: {
    name: "CONDITIONING_FOCUS",
    category: "endurance_conditioning",
    description: "Add metabolic conditioning work: intervals, circuits, energy system development.",
    defaultScope: "session",
    aliases: ["conditioning_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["description-only update", "adding single conditioning note without structural drill"],
    aiDirective: "Add interval/circuit block. Tighten rest across session. Update session emphasis.",
  },
  POWER_EXPLOSIVE_FOCUS: {
    name: "POWER_EXPLOSIVE_FOCUS",
    category: "athletic_specialization",
    description: "Add explosive power emphasis: plyometrics, bar speed cues, power rep range.",
    defaultScope: "session",
    aliases: ["power_explosive_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["tempo note only", "single coaching cue without rep/exercise change"],
    aiDirective: "Add explosive movement (Box Jump, Med Ball Slam). Shift primaries to 2-5 reps at 70-80% with 3-1-X-0 tempo. Full CNS recovery between sets.",
  },
  SPEED_FOCUS: {
    name: "SPEED_FOCUS",
    category: "athletic_specialization",
    description: "Add speed/acceleration work: sprint drills, velocity intent on barbell lifts.",
    defaultScope: "session",
    aliases: ["speed_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["velocity note only without structural sprint drill", "text-only speed cue"],
    aiDirective: "Add sprint drill (30m Acceleration Sprint or Flying 20). Apply velocity intent (X10X tempo) to primary lifts. Limit sprint volume — quality over quantity.",
  },
  REACTIVE_FOCUS: {
    name: "REACTIVE_FOCUS",
    category: "athletic_specialization",
    description: "Improve reactive quality and tendon stiffness: pogo hops, ankle stiffness drills, amortization reduction.",
    defaultScope: "session",
    aliases: ["reactive_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["jumping note without specific contact cue", "generic plyometric addition"],
    aiDirective: "Add Pogo Hops or Ankle Hops (focus: minimal ground contact, rapid rebound). Update session coaching notes to prioritize stiffness cues over power production.",
  },
  COD_DECEL_FOCUS: {
    name: "COD_DECEL_FOCUS",
    category: "athletic_specialization",
    description: "Develop change-of-direction and deceleration mechanics: COD drills, decel strength work.",
    defaultScope: "session",
    aliases: ["cod_decel_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["agility note without structural decel drill", "single coaching cue"],
    aiDirective: "Add COD drill (T-Drill or 5-10-5). Add deceleration strength work (Step-Up Landing or Drop Lunge). Update session for COD quality focus.",
  },
  FOOTWORK_RHYTHM_FOCUS: {
    name: "FOOTWORK_RHYTHM_FOCUS",
    category: "athletic_specialization",
    description: "Develop foot speed, coordination, and rhythm: ladder drills, shuffle patterns.",
    defaultScope: "session",
    aliases: ["footwork_rhythm_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["generic speed note", "text-only footwork cue"],
    aiDirective: "Add Ladder Drill (In-and-Out or Ickey Shuffle). Add Lateral Shuffle Drill. Update session emphasis for footwork quality and contact precision.",
  },
  ATHLETIC_PERFORMANCE_FOCUS: {
    name: "ATHLETIC_PERFORMANCE_FOCUS",
    category: "athletic_specialization",
    description: "General athletic performance emphasis: combines speed, power, and COD elements.",
    defaultScope: "session",
    aliases: ["athletic_performance_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["generic athleticism note", "text-only athletic cue without structural change"],
    aiDirective: "Add explosive opener (Box Jump) + velocity intent on primaries. Update session emphasis for athletic output. Explosive quality takes priority over fatigue accumulation.",
  },
  FATIGUE_MANAGEMENT: {
    name: "FATIGUE_MANAGEMENT",
    category: "difficulty_adjustment",
    description: "Reduce accumulated fatigue by trimming accessory volume and softening intensity.",
    defaultScope: "week",
    aliases: ["fatigue_management"],
    minimumStructuralChanges: 1,
    antiPatterns: ["removing primary lifts", "cutting all accessories without cause"],
    aiDirective: "Drop 1 set from accessories, extend rest, and add recovery coaching note. Primary lifts must remain with controlled intensity.",
  },
  RECOVERY_FOCUS: {
    name: "RECOVERY_FOCUS",
    category: "mobility_recovery",
    description: "Apply deload/recovery week: reduced accessory volume, softened rest, quality focus.",
    defaultScope: "week",
    aliases: ["recovery_focus"],
    minimumStructuralChanges: 1,
    antiPatterns: ["full session conversion to rest day without cause", "removing primary work entirely"],
    aiDirective: "Reduce accessory sets by 1 across the week. Add recovery coaching note: terminate sets well before failure, prioritize tissue quality.",
  },
  MOBILITY_SUPPORT: {
    name: "MOBILITY_SUPPORT",
    category: "mobility_recovery",
    description: "Add mobility/flexibility work to supplement the training session.",
    defaultScope: "session",
    aliases: ["mobility_support"],
    minimumStructuralChanges: 1,
    antiPatterns: ["text-only mobility note", "adding mobility work that conflicts with session's primary goal"],
    aiDirective: "Add 1-2 mobility exercises (hip 90/90, thoracic rotation, ankle CARs) as session opener or closer. Preserve primary session structure.",
  },
  ROM_RESTORATION_FOCUS: {
    name: "ROM_RESTORATION_FOCUS",
    category: "mobility_recovery",
    description: "Restore range of motion with end-range holds, active stretches, and rotational work.",
    defaultScope: "session",
    aliases: ["rom_restoration_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["passive stretch only", "text-only ROM note"],
    aiDirective: "Add Hip 90/90 Stretch and Cat-Cow + Thoracic Rotation. Update session emphasis for ROM quality. At least 2 structural ROM exercises required.",
  },
  TISSUE_STIFFNESS_FOCUS: {
    name: "TISSUE_STIFFNESS_FOCUS",
    category: "mobility_recovery",
    description: "Address tissue quality and stiffness: foam rolling, contract-relax techniques.",
    defaultScope: "session",
    aliases: ["tissue_stiffness_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["passive relaxation only", "aggressive stretching on acutely stiff tissue"],
    aiDirective: "Add Foam Roll Circuit and Contract-Relax Stretch (target stiff muscles). Update session notes to prioritize tissue quality before load.",
  },
  TENDON_RESILIENCE_FOCUS: {
    name: "TENDON_RESILIENCE_FOCUS",
    category: "mobility_recovery",
    description: "Build tendon resilience with heavy isometrics and progressive loading protocols.",
    defaultScope: "session",
    aliases: ["tendon_resilience_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["high-load plyometrics on irritated tendons", "ballistic loading without isometric prep"],
    aiDirective: "Add heavy isometric exercise (Copenhagen Plank or Tibialis Raise). Add slow-eccentric loading (Nordic Curl or Single-Leg Calf Raise). Reduce plyometric volume note if present.",
  },
  END_RANGE_CONTROL_FOCUS: {
    name: "END_RANGE_CONTROL_FOCUS",
    category: "mobility_recovery",
    description: "Develop end-range joint control: PAILs, RAILs, and end-range isometric loading.",
    defaultScope: "session",
    aliases: ["end_range_control_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["passive end-range position only", "end-range loading without active control prep"],
    aiDirective: "Add Hip PAILs/RAILs and Shoulder End-Range Isometric. Update session notes for end-range control priority. Hold positions for 30-60s before applying force.",
  },
  MOBILITY_FLOW_FOCUS: {
    name: "MOBILITY_FLOW_FOCUS",
    category: "mobility_recovery",
    description: "Add movement flow sequences: linked CARs, flow sequences, primal movement patterns.",
    defaultScope: "session",
    aliases: ["mobility_flow_focus"],
    minimumStructuralChanges: 2,
    antiPatterns: ["isolated static stretching presented as flow", "high-load work mixed into flow sequence"],
    aiDirective: "Add Hip CARs (Controlled Articular Rotations) and a Crawling Flow Sequence. Update session emphasis for fluid, connected movement quality.",
  },
  UNILATERAL_EMPHASIS: {
    name: "UNILATERAL_EMPHASIS",
    category: "structural_modification",
    description: "Shift toward single-leg and single-arm work to address imbalances and sport carryover.",
    defaultScope: "session",
    aliases: ["unilateral_emphasis"],
    minimumStructuralChanges: 2,
    antiPatterns: ["removing bilateral primary lifts entirely", "adding unilateral work without justification"],
    aiDirective: "Add Split Squat or Single-Leg RDL (lower body) or Single-Arm Row/Press (upper body). Update session emphasis for unilateral focus. Bilateral primaries may be reduced but not removed.",
  },
  POSTERIOR_CHAIN_EMPHASIS: {
    name: "POSTERIOR_CHAIN_EMPHASIS",
    category: "structural_modification",
    description: "Emphasize hamstrings, glutes, and hip extension work.",
    defaultScope: "session",
    aliases: ["posterior_chain_emphasis"],
    minimumStructuralChanges: 2,
    antiPatterns: ["adding isolation work only without compound hinge", "generic glute note"],
    aiDirective: "Add Romanian Deadlift or Hip Thrust if none exists. Add Nordic Curl or Glute Ham Raise as accessory. Update session emphasis for posterior chain priority.",
  },
  TRUNK_CORE_EMPHASIS: {
    name: "TRUNK_CORE_EMPHASIS",
    category: "structural_modification",
    description: "Add anti-rotation, anti-extension, and trunk stability work.",
    defaultScope: "session",
    aliases: ["trunk_core_emphasis"],
    minimumStructuralChanges: 2,
    antiPatterns: ["crunch-only core work", "isolating rectus abdominis without anti-rotation or lateral stability work"],
    aiDirective: "Add Pallof Press (anti-rotation) and Dead Bug (anti-extension). Add Suitcase Carry if loading is appropriate. Update session for trunk stability priority.",
  },
  INJURY_MODIFICATION: {
    name: "INJURY_MODIFICATION",
    category: "constraint_application",
    description: "Modify programming to work around pain or injury: remove aggravating patterns, add safe alternatives.",
    defaultScope: "session",
    aliases: ["injury_modification"],
    minimumStructuralChanges: 1,
    antiPatterns: ["working through acute pain", "high-load alternatives on injured structures"],
    aiDirective: "Remove or flag aggravating exercises. Add pain-free alternative with appropriate load cue. Add safety coaching note with stop/modify instruction.",
  },
  JOINT_FRIENDLY_MODIFICATION: {
    name: "JOINT_FRIENDLY_MODIFICATION",
    category: "constraint_application",
    description: "Apply joint-friendly modifications: reduce impact, add low-load alternatives.",
    defaultScope: "session",
    aliases: ["joint_friendly_modification"],
    minimumStructuralChanges: 1,
    antiPatterns: ["high-impact patterns on joint-sensitive users", "axial loading without protective cues"],
    aiDirective: "Add joint-friendly alternatives (machine over barbell, incline over flat, neutral grip). Add coaching note for pain-free ROM only.",
  },
  EQUIPMENT_CONSTRAINT: {
    name: "EQUIPMENT_CONSTRAINT",
    category: "constraint_application",
    description: "Adapt programming to available equipment: dumbbell, bodyweight, band substitutions.",
    defaultScope: "session",
    aliases: ["equipment_constraint"],
    minimumStructuralChanges: 1,
    antiPatterns: ["prescribing barbell exercises when unavailable", "assuming equipment without confirmation"],
    aiDirective: "Flag barbell/machine exercises with dumbbell/bodyweight alternatives. Add coaching note specifying equipment constraint. Maintain training intent.",
  },
  ADD_EXERCISE: {
    name: "ADD_EXERCISE",
    category: "structural_modification",
    description: "Insert a single new exercise into a specific session.",
    defaultScope: "session",
    aliases: ["add_exercise"],
    minimumStructuralChanges: 1,
    antiPatterns: ["adding duplicate exercise", "inserting exercise without category or prescription"],
    aiDirective: "Insert 1 exercise with full prescription (sets, reps, rest, category). Avoid duplicating exercises already in the session.",
  },
  EXERCISE_SWAP: {
    name: "EXERCISE_SWAP",
    category: "structural_modification",
    description: "Replace one exercise with another while preserving role and prescription.",
    defaultScope: "exercise",
    aliases: ["exercise_swap"],
    minimumStructuralChanges: 1,
    antiPatterns: ["changing exercise role/category during swap", "swapping without preserving sets/reps"],
    aiDirective: "Replace source exercise with target. Preserve sets, reps, rest, and category. Add substitution note explaining the change.",
  },
  EXERCISE_PROGRESSION: {
    name: "EXERCISE_PROGRESSION",
    category: "difficulty_adjustment",
    description: "Advance an exercise to a harder variation while preserving its role.",
    defaultScope: "exercise",
    aliases: ["exercise_progression"],
    minimumStructuralChanges: 1,
    antiPatterns: ["progression without load/complexity increase", "changing rep range without exercise name change"],
    aiDirective: "Replace with harder variation (e.g. Goblet Squat → Front Squat). Preserve sets. Reduce reps slightly to account for increased difficulty.",
  },
  EXERCISE_REGRESSION: {
    name: "EXERCISE_REGRESSION",
    category: "difficulty_adjustment",
    description: "Step back to a simpler variation while preserving exercise role.",
    defaultScope: "exercise",
    aliases: ["exercise_regression"],
    minimumStructuralChanges: 1,
    antiPatterns: ["regression without rationale", "stepping back without preserving training intent"],
    aiDirective: "Replace with simpler variation (e.g. Deadlift → Romanian Deadlift). Preserve sets. Keep reps the same or increase by 1-2.",
  },
  DAY_PROGRESSION: {
    name: "DAY_PROGRESSION",
    category: "difficulty_adjustment",
    description: "Advance difficulty for an entire training day: heavier reps, extra sets, extended rest.",
    defaultScope: "session",
    aliases: ["day_progression"],
    minimumStructuralChanges: 2,
    antiPatterns: ["text-only difficulty cue", "single exercise change called a day progression"],
    aiDirective: "Shift primary lifts to lower rep range (+5-10% load), add 1 set to primary exercises, extend rest to 2-3 min. Apply to entire day, not single exercise.",
  },
  DAY_REGRESSION: {
    name: "DAY_REGRESSION",
    category: "difficulty_adjustment",
    description: "Reduce difficulty for an entire training day: gentler reps, fewer sets, lighter load.",
    defaultScope: "session",
    aliases: ["day_regression"],
    minimumStructuralChanges: 2,
    antiPatterns: ["removing primary exercises", "cutting all volume without cause"],
    aiDirective: "Shift primary lifts to higher rep range (10-15), reduce primary sets by 1, shorten rest. Apply across entire day.",
  },
  SESSION_EXPANSION: {
    name: "SESSION_EXPANSION",
    category: "volume_adjustment",
    description: "Add more exercises or volume to a session.",
    defaultScope: "session",
    aliases: ["session_expansion"],
    minimumStructuralChanges: 1,
    antiPatterns: ["adding exercises without prescription", "adding more than 3 exercises to an already full session"],
    aiDirective: "Add 1-2 purposeful accessory exercises with full prescription. Justify each addition with training rationale.",
  },
  SESSION_REDUCTION: {
    name: "SESSION_REDUCTION",
    category: "volume_adjustment",
    description: "Remove exercises or trim volume from a session.",
    defaultScope: "session",
    aliases: ["session_reduction"],
    minimumStructuralChanges: 1,
    antiPatterns: ["removing primary exercises", "collapsing session to single exercise"],
    aiDirective: "Remove finishers and lowest-priority accessories first. Primary and main accessories must remain.",
  },
  READINESS_LOW: {
    name: "READINESS_LOW",
    category: "state_adaptation",
    description: "Adapt today's session for low readiness: reduce intensity, extend rest, preserve movement.",
    defaultScope: "session",
    aliases: ["readiness_low"],
    minimumStructuralChanges: 1,
    antiPatterns: ["canceling the session entirely", "removing all primary work without cause"],
    aiDirective: "Reduce load target (60-70% of max), extend rest, add readiness note. Keep session structure intact — move, don't grind.",
  },
  MISSED_SESSIONS_REENTRY: {
    name: "MISSED_SESSIONS_REENTRY",
    category: "state_adaptation",
    description: "Re-entry protocol after missed sessions: conservative load, volume reduction, rebuilding momentum.",
    defaultScope: "session",
    aliases: ["missed_sessions_reentry"],
    minimumStructuralChanges: 1,
    antiPatterns: ["full-intensity return after long absence", "ignoring detraining effect"],
    aiDirective: "Reduce load to 60-70%, cut 1 set from accessories. Add re-entry coaching note: 'First session back — conservative approach, monitor recovery, rebuild over 2 weeks.'",
  },
  ENVIRONMENT_TEMPORARY_SWITCH: {
    name: "ENVIRONMENT_TEMPORARY_SWITCH",
    category: "constraint_application",
    description: "Adapt for a temporary environment change: hotel gym, limited equipment, outdoor.",
    defaultScope: "session",
    aliases: ["environment_temporary_switch"],
    minimumStructuralChanges: 1,
    antiPatterns: ["prescribing full gym equipment in limited environment", "ignoring stated constraint"],
    aiDirective: "Flag equipment-dependent exercises with alternatives. Add travel/environment coaching note. Keep training intent — only the tools change.",
  },
  SPORT_CONTEXT_UPDATE: {
    name: "SPORT_CONTEXT_UPDATE",
    category: "state_adaptation",
    description: "Update programming to align with sport context: in-season load management, competition prep.",
    defaultScope: "program",
    aliases: ["sport_context_update"],
    minimumStructuralChanges: 1,
    antiPatterns: ["ignoring competition schedule", "maintaining high volume during competition week"],
    aiDirective: "Apply sport context: adjust volume and intensity based on in-season/off-season status. Prioritize recovery and performance over volume accumulation.",
  },
  EXERCISE_DISLIKE_OR_PREFERENCE: {
    name: "EXERCISE_DISLIKE_OR_PREFERENCE",
    category: "structural_modification",
    description: "Swap or modify exercises based on user preference or dislike.",
    defaultScope: "exercise",
    aliases: ["exercise_dislike_or_preference"],
    minimumStructuralChanges: 1,
    antiPatterns: ["keeping disliked exercise without offering alternative", "swapping without preserving role"],
    aiDirective: "Replace disliked exercise with preferred alternative preserving role and prescription. Add note acknowledging user preference.",
  },
  BULK_SESSION_SETS_INCREASE: {
    name: "BULK_SESSION_SETS_INCREASE",
    category: "volume_adjustment",
    description: "Add one set to every exercise in a session (bulk volume increase).",
    defaultScope: "session",
    aliases: ["bulk_session_sets_increase"],
    minimumStructuralChanges: 1,
    antiPatterns: ["adding sets to primary lifts without recovery consideration", "ignoring fatigue accumulation"],
    aiDirective: "Add 1 set to every exercise in the session. Primary lifts: apply only if user has established base. Add volume coaching note.",
  },
};

// ─── Intent Family → Canonical Command Map ────────────────────────────────────

export const INTENT_FAMILY_TO_CANONICAL: Partial<Record<IntentFamily, CanonicalCommandName>> = {
  increase_difficulty: "INCREASE_DIFFICULTY",
  decrease_difficulty: "DECREASE_DIFFICULTY",
  increase_volume: "INCREASE_VOLUME",
  decrease_volume: "DECREASE_VOLUME",
  session_expansion: "SESSION_EXPANSION",
  session_reduction: "SESSION_REDUCTION",
  bulk_session_sets_increase: "BULK_SESSION_SETS_INCREASE",
  reduce_time: "REDUCE_TIME",
  increase_time: "INCREASE_TIME",
  strength_focus: "STRENGTH_FOCUS",
  hypertrophy_focus: "HYPERTROPHY_FOCUS",
  endurance_focus: "ENDURANCE_FOCUS",
  conditioning_focus: "CONDITIONING_FOCUS",
  power_explosive_focus: "POWER_EXPLOSIVE_FOCUS",
  speed_focus: "SPEED_FOCUS",
  reactive_focus: "REACTIVE_FOCUS",
  cod_decel_focus: "COD_DECEL_FOCUS",
  footwork_rhythm_focus: "FOOTWORK_RHYTHM_FOCUS",
  athletic_performance_focus: "ATHLETIC_PERFORMANCE_FOCUS",
  fatigue_management: "FATIGUE_MANAGEMENT",
  recovery_focus: "RECOVERY_FOCUS",
  mobility_support: "MOBILITY_SUPPORT",
  rom_restoration_focus: "ROM_RESTORATION_FOCUS",
  tissue_stiffness_focus: "TISSUE_STIFFNESS_FOCUS",
  tendon_resilience_focus: "TENDON_RESILIENCE_FOCUS",
  end_range_control_focus: "END_RANGE_CONTROL_FOCUS",
  mobility_flow_focus: "MOBILITY_FLOW_FOCUS",
  unilateral_emphasis: "UNILATERAL_EMPHASIS",
  posterior_chain_emphasis: "POSTERIOR_CHAIN_EMPHASIS",
  trunk_core_emphasis: "TRUNK_CORE_EMPHASIS",
  injury_modification: "INJURY_MODIFICATION",
  joint_friendly_modification: "JOINT_FRIENDLY_MODIFICATION",
  equipment_constraint: "EQUIPMENT_CONSTRAINT",
  add_exercise: "ADD_EXERCISE",
  exercise_swap: "EXERCISE_SWAP",
  exercise_progression: "EXERCISE_PROGRESSION",
  exercise_regression: "EXERCISE_REGRESSION",
  day_progression: "DAY_PROGRESSION",
  day_regression: "DAY_REGRESSION",
  readiness_low: "READINESS_LOW",
  missed_sessions_reentry: "MISSED_SESSIONS_REENTRY",
  environment_temporary_switch: "ENVIRONMENT_TEMPORARY_SWITCH",
  sport_context_update: "SPORT_CONTEXT_UPDATE",
  exercise_dislike_or_preference: "EXERCISE_DISLIKE_OR_PREFERENCE",
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the full list of IntentFamily strings that route to APPLY_MUTATION.
 * This is the authoritative source — execution-planner.ts must use this
 * instead of a hardcoded local array.
 */
export function getMutationFamilies(): IntentFamily[] {
  return Object.keys(INTENT_FAMILY_TO_CANONICAL) as IntentFamily[];
}

/**
 * Returns true if the given IntentFamily is a mutation family.
 */
export function isMutationFamilyOntology(family: IntentFamily): boolean {
  return family in INTENT_FAMILY_TO_CANONICAL;
}

/**
 * Resolves an IntentFamily to its CanonicalMutationCommand definition.
 * Returns null if the family is not a mutation family (e.g. greeting, guidance).
 */
export function resolveMutationCommand(family: IntentFamily): CanonicalMutationCommand | null {
  const name = INTENT_FAMILY_TO_CANONICAL[family];
  return name ? MUTATION_ONTOLOGY[name] : null;
}

/**
 * Returns the canonical command name for a given IntentFamily.
 */
export function getCanonicalName(family: IntentFamily): CanonicalCommandName | null {
  return INTENT_FAMILY_TO_CANONICAL[family] ?? null;
}

/**
 * Returns the MutationCategory for a given IntentFamily.
 */
export function getMutationCategory(family: IntentFamily): MutationCategory | null {
  const cmd = resolveMutationCommand(family);
  return cmd?.category ?? null;
}

/**
 * Validates that an EditPlan meets the minimum structural change requirement
 * for its canonical command. Returns a list of violations (empty = valid).
 *
 * Structural changes: add_exercise, replace_exercise, delete_exercise, or
 * update_exercise touching sets/reps/tempo/rest.
 */
export function validateOperationsOntology(
  intentFamily: IntentFamily,
  changes: Array<{ type: string; updates?: Record<string, unknown> }>
): string[] {
  const cmd = resolveMutationCommand(intentFamily);
  if (!cmd) return [];

  const structuralKeys = new Set(["sets", "reps", "tempo", "rest"]);
  const structuralCount = changes.filter(c =>
    c.type === "add_exercise" ||
    c.type === "replace_exercise" ||
    c.type === "delete_exercise" ||
    (c.type === "update_exercise" && c.updates &&
      Object.keys(c.updates).some(k => structuralKeys.has(k)))
  ).length;

  const violations: string[] = [];

  if (structuralCount < cmd.minimumStructuralChanges) {
    violations.push(
      `[OntologyTrace] ${cmd.name} requires ≥${cmd.minimumStructuralChanges} structural change(s), got ${structuralCount}. ` +
      `Anti-patterns to avoid: ${cmd.antiPatterns.slice(0, 2).join("; ")}.`
    );
  }

  return violations;
}
