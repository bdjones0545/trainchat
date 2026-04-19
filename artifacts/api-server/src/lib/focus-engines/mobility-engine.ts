/**
 * Mobility Focus Engine
 *
 * Training focus: range of motion restoration, positional control,
 * joint prep, movement quality, end-range control, tissue tolerance,
 * recovery/restoration flow, and re-entry support.
 *
 * This is NOT "light strength."
 * It operates on its own logic lane — mobility qualities, movement standards,
 * and biomotor development specific to range, control, and restoration.
 *
 * Architecture mirrors the Strength and Speed engines exactly.
 * Same infrastructure, different programming brain.
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
import {
  buildMobilityMonthlyBlockPlan,
  buildMobilityMonthlyBlockContext,
  type MobilityBlockType,
} from "../monthly-block-planner";

// ─── Block Archetypes ─────────────────────────────────────────────────────────

const MOBILITY_BLOCK_ARCHETYPES: BlockArchetypeDescriptor[] = [
  {
    id: "MOBILITY_RESTORE_RANGE",
    label: "Restore Range",
    description: "Passive and active range of motion restoration. Joint-specific stretching, contract-relax PNF, and sustained holds. Targets chronic stiffness and acute range loss. Tissue length is the goal, not strength.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_CONTROL_END_RANGE",
    label: "Control End Range",
    description: "Active ownership of newly restored range. PAILs, RAILs, end-range isometrics, CARs. Trains the nervous system to actively control positions at the limit of available range — turning passive range into usable range.",
    phase: "build",
    neuralDemand: "moderate",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_MOVEMENT_QUALITY_REBUILD",
    label: "Movement Quality Rebuild",
    description: "Integrated multi-joint movement patterns with full expression of range. Compound mobility flows, segmental control, movement standard refinement. Bridges isolated mobility work into functional movement capacity.",
    phase: "build",
    neuralDemand: "moderate",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_JOINT_SPECIFIC_FOCUS",
    label: "Joint-Specific Focus (Hips / Shoulders / Spine)",
    description: "Deep attention to a single joint complex or region. Hip capsule work (all 6 directions), shoulder girdle mobility (GH + scapular), or spinal segmental mobility. Used when one region is a clear limiting factor.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_RECOVERY_FLOW",
    label: "Recovery Flow",
    description: "Low-load, high-range work with parasympathetic emphasis. Yin holds, breathing-integrated stretches, gentle flows. Reduces systemic fatigue, nervous system downregulation, and tissue restoration after high-load training weeks.",
    phase: "deload",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_REENTRY_SUPPORT",
    label: "Re-entry Support",
    description: "Post-injury or post-layoff mobility restoration protocol. Graduated range re-introduction, tissue graded exposure, pain-aware progression. No end-range loading until pain-free baseline is established.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_STIFFNESS_REDUCTION",
    label: "Stiffness Reduction",
    description: "Targeted approach to chronic tissue stiffness. Dynamic warm-ups, loaded stretching, tissue rolling, contract-relax sequences. Addresses morning stiffness, post-training tightness, and athlete-specific tension patterns.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
];

// ─── Movement Families ────────────────────────────────────────────────────────

const MOBILITY_MOVEMENT_FAMILIES: MovementFamilyDescriptor[] = [
  {
    id: "hip_mobility",
    label: "Hip Mobility",
    examples: [
      "Hip CARs", "90/90 Hip Stretch", "90/90 Active Lift", "Pigeon Stretch",
      "Frog Stretch", "Couch Stretch", "Hip Flexor Kneeling Stretch",
      "Hip PAILs/RAILs", "Deep Squat Hip Stretch", "Hip Airplane",
      "Adductor Rockback", "Adductor CARs", "Spiderman Stretch",
    ],
    primaryAdaptation: "hip capsule mobility in all 6 directions, hip flexion/extension/IR/ER range, acetabular-femoral joint health",
  },
  {
    id: "shoulder_mobility",
    label: "Shoulder Mobility",
    examples: [
      "Shoulder CARs", "Wall Slides", "Sleeper Stretch", "Band Shoulder Distraction",
      "Doorway Chest Stretch", "Pec Minor Stretch", "Cross-Body Shoulder Stretch",
      "Overhead Lat Stretch", "Shoulder PAILs/RAILs", "Banded Pass-Through",
    ],
    primaryAdaptation: "glenohumeral IR/ER range, shoulder elevation, posterior capsule flexibility, scapulohumeral rhythm",
  },
  {
    id: "thoracic_spine",
    label: "Thoracic Spine",
    examples: [
      "Thoracic Extension Foam Roll", "Quadruped Thoracic Rotation", "Cat-Cow",
      "Thread the Needle", "Open Book Stretch", "Thoracic CARs",
      "Rib Roll", "Side-Lying T-Spine Rotation", "T-Spine Extension on Ball",
    ],
    primaryAdaptation: "thoracic extension and rotation range, rib cage mobility, segmental spine articulation",
  },
  {
    id: "ankle_mobility",
    label: "Ankle Mobility",
    examples: [
      "Wall Ankle Stretch", "Banded Ankle Distraction", "Ankle CARs",
      "Ankle Circles", "Calf Stretch Straight Knee", "Calf Stretch Bent Knee",
      "Heel Drop", "Toe-Elevated Calf Stretch", "Ankle PAILs/RAILs",
    ],
    primaryAdaptation: "dorsiflexion range, talocrural joint mobility, ankle joint capsule health, squat depth prerequisite",
  },
  {
    id: "trunk_control",
    label: "Trunk Control",
    examples: [
      "Dead Bug", "Dead Bug with Band", "Bird Dog", "Plank Hold",
      "Side Plank", "Pallof Press (anti-rotation)", "Hollow Body Hold",
      "Segmental Rolling", "90/90 Breathing Hold",
    ],
    primaryAdaptation: "anti-extension and anti-rotation control, lumbar stability, trunk stiffness under mobility loads",
  },
  {
    id: "end_range_strength",
    label: "End-Range Strength",
    examples: [
      "Jefferson Curl", "Deep Squat Hold with Load", "Passive Hang",
      "Active Hang", "Copenhagen Plank (adductor end-range)",
      "Hip PAILs/RAILs (loaded isometric)", "Shoulder PAILs/RAILs",
      "Weighted Hip 90/90 Lift", "End-Range Hip Extension Hold",
    ],
    primaryAdaptation: "tissue tolerance at full range, tendon adaptation at end-range, nervous system strength in extended positions",
  },
  {
    id: "positional_control",
    label: "Positional Control",
    examples: [
      "Hip CARs (controlled)", "Shoulder CARs (loaded)", "Ankle CARs",
      "90/90 Active Posterior Lift", "Hip Internal Rotation End-Range Hold",
      "Shoulder IR End-Range Hold", "Thoracic CARs with Dowel",
    ],
    primaryAdaptation: "active control through full range, nervous system ownership of newly acquired range, position specificity",
  },
  {
    id: "breathing_integration",
    label: "Breathing Integration",
    examples: [
      "Diaphragmatic Breathing Drill", "Box Breathing", "Crocodile Breathing",
      "90/90 Breathing Hold", "PRI Hip Shift with Exhale",
      "Supine Breathing Reset", "Exhale-Deepen Stretch Protocol",
    ],
    primaryAdaptation: "range amplification through respiratory mechanics, rib position correction, parasympathetic activation, thoracic mobility",
  },
  {
    id: "tissue_preparation",
    label: "Tissue Preparation",
    examples: [
      "Foam Roll Quads", "Foam Roll IT Band", "Foam Roll Thoracic",
      "Lacrosse Ball Glute Release", "Lacrosse Ball Pec Minor",
      "Calf Foam Roll", "Hamstring Foam Roll",
    ],
    primaryAdaptation: "myofascial tension reduction, tissue pliability, pre-mobility session preparation, blood flow and heat",
  },
  {
    id: "dynamic_mobility_flow",
    label: "Dynamic Mobility Flow",
    examples: [
      "World's Greatest Stretch (flow)", "Inchworm to Squat", "Spiderman Flow",
      "Animal Flow Ground Series", "Sun Salutation (athletic version)",
      "Hip 90/90 Transition Flow", "Groundwork Mobility Sequence",
    ],
    primaryAdaptation: "integrated full-body mobility, movement sequencing and transitions, parasympathetic recovery, movement pattern breadth",
  },
  {
    id: "recovery_restoration",
    label: "Recovery & Restoration",
    examples: [
      "Supine Figure-4 Hold", "Supine Spinal Twist", "Child's Pose",
      "Supported Hip Flexor Hold", "Legs Up the Wall",
      "Recovery Breathing Protocol", "Progressive Relaxation Flow",
      "Gentle Neck Rolls", "Upper Trap Release",
    ],
    primaryAdaptation: "nervous system downregulation, parasympathetic restoration, tissue recovery, pain signal reduction, sleep quality support",
  },
];

// ─── Session Grammar ──────────────────────────────────────────────────────────

const MOBILITY_SESSION_GRAMMAR: SessionGrammarDescriptor = {
  primarySlotCount: 2,
  secondarySlotCount: 4,
  repRangeGuidance: "Holds: 30–90 seconds per position. CARs: 3–5 slow controlled rotations per joint. End-range isometrics: 5–10 second holds at maximal effort (20–40% contraction). Flows: 5–10 minute continuous sequences. Recovery holds: 2–5 minutes per position.",
  restGuidance: "Mobility sessions are low-CNS demand. Between positions: 15–30s. Between blocks: 60–90s. Recovery/restoration sessions have no time pressure — let the nervous system reset fully. Do not rush. Quality of position is the output.",
  intensityGuidance: "Work to comfortable end-range — never into joint pain. For PAILs/RAILs: 20–40% isometric contraction (not maximal). End-range loading: start at minimal load, progress tissue tolerance over weeks. Differentiate: muscle tension (acceptable) vs joint impingement (stop immediately).",
  specialNotes: "Breathing is a primary tool — exhale deeply to deepen passive range, inhale to brace during active control. Passive range BEFORE active control — never train control in a range you haven't yet restored. Track specific joint deficits systematically. CARs are a diagnostic AND training tool. This is NOT recovery cardio — it is structured, targeted, progressive work.",
};

// ─── Continuation Rules ───────────────────────────────────────────────────────

const MOBILITY_CONTINUATION_RULES: ContinuationRuleDescriptor = {
  nextBlockOptions: [
    "MOBILITY_REENTRY_SUPPORT → MOBILITY_RESTORE_RANGE (pain-free baseline established)",
    "MOBILITY_STIFFNESS_REDUCTION → MOBILITY_RESTORE_RANGE (chronic stiffness addressed)",
    "MOBILITY_RESTORE_RANGE → MOBILITY_CONTROL_END_RANGE (range consistently achieved)",
    "MOBILITY_JOINT_SPECIFIC_FOCUS → MOBILITY_CONTROL_END_RANGE (single-joint baseline built)",
    "MOBILITY_CONTROL_END_RANGE → MOBILITY_MOVEMENT_QUALITY_REBUILD (control reliable across sessions)",
    "MOBILITY_MOVEMENT_QUALITY_REBUILD → MOBILITY_END_RANGE_STRENGTH (quality integrated into patterns)",
    "Any block → MOBILITY_RECOVERY_FLOW (high-stress training week, fatigue accumulation, or deload)",
    "MOBILITY_RECOVERY_FLOW → MOBILITY_RESTORE_RANGE or MOBILITY_CONTROL_END_RANGE (after recovery)",
  ],
  progressionDirection: "Tissue preparation → Range restoration → Active control → End-range loading → Integrated movement quality → Maintenance. Increase hold duration before increasing loading. Passive range first, active control second, loaded range third.",
  deescalationTriggers: [
    "Joint pain > 3/10 during holds — immediately regress to lighter input",
    "Pain persisting 24h+ after sessions — shift to recovery/restoration flow",
    "Range regression after previous gains — return to passive restoration work",
    "Compensatory movement patterns appearing — return to joint-specific isolation",
  ],
  adaptationCues: [
    "Range improving 2+ sessions → progress from passive holds to CARs / active control",
    "Active control reliable 3+ sessions → introduce end-range loading (Jefferson curl, loaded holds)",
    "High training fatigue → shift to recovery/restoration flow block",
    "Stiffness complaint → bias toward stiffness_reduction archetype with tissue prep focus",
    "Pain complaint → bias toward reentry_support with controlled range reintroduction",
  ],
};

// ─── Quick Commands ───────────────────────────────────────────────────────────

const MOBILITY_QUICK_COMMANDS: QuickCommandDescriptor[] = [
  { label: "Open hips", intentMapping: "increase_hip_mobility_focus", engineBias: "MOBILITY_RESTORE_RANGE" },
  { label: "Reduce stiffness", intentMapping: "reduce_tissue_stiffness", engineBias: "MOBILITY_STIFFNESS_REDUCTION" },
  { label: "More recovery", intentMapping: "shift_recovery_restoration", engineBias: "MOBILITY_RECOVERY_FLOW" },
  { label: "Shoulder focus", intentMapping: "increase_shoulder_mobility_focus", engineBias: "MOBILITY_JOINT_SPECIFIC_FOCUS" },
  { label: "Improve mobility", intentMapping: "general_mobility_improvement", engineBias: "MOBILITY_MOVEMENT_QUALITY_REBUILD" },
  { label: "Reduce pain", intentMapping: "pain_aware_reentry", engineBias: "MOBILITY_REENTRY_SUPPORT" },
  { label: "More control", intentMapping: "increase_end_range_control", engineBias: "MOBILITY_CONTROL_END_RANGE" },
  { label: "Restore range", intentMapping: "restore_range_of_motion", engineBias: "MOBILITY_RESTORE_RANGE" },
];

// ─── Memory Namespace ─────────────────────────────────────────────────────────

const MOBILITY_MEMORY_NAMESPACE: MemoryNamespaceDescriptor = {
  namespace: "mobility",
  exampleKeys: [
    "hips_priority",
    "shoulder_range_priority",
    "recovery_bias",
    "thoracic_restriction",
    "ankle_limitation",
    "stiffness_pattern",
    "pain_threshold",
    "end_range_control_level",
    "breathing_integration",
  ],
  sharedWithGlobal: false,
};

// ─── Prompt Context ───────────────────────────────────────────────────────────

function buildMobilityPromptContext(userMessage: string, goal?: string, sport?: string, experience?: string): string {
  const lower = userMessage.toLowerCase();

  const emphasisHints: string[] = [];
  let blockTypeHint: MobilityBlockType | undefined;

  if (/hip|hips|groin|pigeon|90.90|couch.stretch|hip.flexor/.test(lower)) {
    emphasisHints.push("User message signals hip mobility intent — bias toward hip complex work: Hip CARs, 90/90 Stretch, Couch Stretch, Frog Stretch, Hip PAILs/RAILs.");
    blockTypeHint = "mobility_hip_focus";
  }
  if (/shoulder|overhead|rotator|sleeper|wall.slide|pec/.test(lower)) {
    emphasisHints.push("User message signals shoulder range intent — bias toward shoulder CARs, wall slides, sleeper stretch, pec minor work, and end-range shoulder control.");
    blockTypeHint = blockTypeHint ?? "mobility_shoulder_focus";
  }
  if (/thoracic|t.spine|upper.back|rotation|rib/.test(lower)) {
    emphasisHints.push("User message signals thoracic spine intent — bias toward T-spine extension/rotation: foam roll, open books, thread the needle, thoracic CARs.");
    blockTypeHint = blockTypeHint ?? "mobility_range_restoration";
  }
  if (/ankle|dorsiflexion|calf|squat.depth/.test(lower)) {
    emphasisHints.push("User message signals ankle mobility intent — bias toward ankle dorsiflexion and foot complex work: wall ankle stretch, banded distraction, ankle CARs.");
    blockTypeHint = blockTypeHint ?? "mobility_range_restoration";
  }
  if (/recover|restore|rest|deload|relax|parasympathetic/.test(lower)) {
    emphasisHints.push("User message signals recovery/restoration intent — bias toward MOBILITY_RECOVERY_FLOW: yin holds, breathing-integrated stretches, gentle flows.");
    blockTypeHint = blockTypeHint ?? "mobility_recovery_flow";
  }
  if (/control|stability|end.range|pails|rails|car|articular/.test(lower)) {
    emphasisHints.push("User message signals end-range control intent — bias toward PAILs/RAILs, CARs, end-range isometrics, and active control work.");
    blockTypeHint = blockTypeHint ?? "mobility_end_range_control";
  }
  if (/stiff|stiffness|tight|tightness|morning/.test(lower)) {
    emphasisHints.push("User message signals stiffness reduction intent — bias toward tissue prep, contract-relax sequences, and dynamic mobility flows.");
    blockTypeHint = blockTypeHint ?? "mobility_stiffness_reduction";
  }
  if (/pain|hurt|injury|return|comeback|re.entry/.test(lower)) {
    emphasisHints.push("User message signals pain/re-entry intent — bias toward MOBILITY_REENTRY_SUPPORT: graduated range, graded exposure, pain-aware progression.");
    blockTypeHint = blockTypeHint ?? "mobility_reentry_support";
  }
  if (/breath|breathing|diaphragm|box.breath/.test(lower)) {
    emphasisHints.push("User message signals breathing integration intent — bias toward breathing drills, 90/90 breathing hold, crocodile breathing, and respiratory mechanics.");
    blockTypeHint = blockTypeHint ?? "mobility_movement_quality";
  }

  const seed = Math.random();
  const mobilityBlockPlan = buildMobilityMonthlyBlockPlan(
    goal ?? userMessage.slice(0, 100),
    sport ?? null,
    experience ?? null,
    seed,
    blockTypeHint,
  );
  const blockContext = buildMobilityMonthlyBlockContext(mobilityBlockPlan);

  return `
[FOCUS MODE: MOBILITY]
Active training focus: Mobility — covering range restoration, positional control, joint-specific focus, movement quality, end-range strength, stiffness reduction, and recovery flow.

THIS IS NOT LIGHT STRENGTH. THIS IS NOT RECOVERY CARDIO. THIS IS NOT A STRETCH LIST.
Mobility work operates on its own biomotor logic lane — it is structured, progressive, adaptive, and agent-driven.

${blockContext}

MOVEMENT FAMILIES available in this mode:
1. Hip Mobility — Hip CARs, 90/90 Stretch, 90/90 Active Lift, Couch Stretch, Hip PAILs/RAILs, Frog Stretch, Adductor Rockback, Adductor CARs, Pigeon Stretch, Deep Squat Hip Stretch, Hip Airplane
2. Shoulder Mobility — Shoulder CARs, Wall Slides, Sleeper Stretch, Band Distraction, Doorway Chest Stretch, Pec Minor Stretch, Cross-Body Shoulder Stretch, Shoulder PAILs/RAILs
3. Thoracic Spine — Thoracic Extension Foam Roll, Cat-Cow, Quadruped Thoracic Rotation, Thread the Needle, Open Book Stretch, Thoracic CARs, Rib Roll, T-Spine Extension on Ball
4. Ankle Mobility — Wall Ankle Stretch, Banded Ankle Distraction, Ankle CARs, Ankle Circles, Calf Stretch Straight Knee, Calf Stretch Bent Knee, Heel Drop, Ankle PAILs/RAILs
5. Trunk Control — Dead Bug, Bird Dog, 90/90 Breathing Hold, Segmental Rolling, Hollow Body Hold, Pallof Press (anti-rotation)
6. End-Range Strength — Jefferson Curl, Deep Squat Hold with Load, Passive/Active Hang, Hip PAILs/RAILs (loaded), Weighted 90/90 Lift, Copenhagen Plank
7. Positional Control — Hip CARs (controlled), Shoulder CARs (loaded), 90/90 Active Posterior Lift, Hip IR End-Range Hold, Shoulder IR End-Range Hold, Thoracic CARs with Dowel
8. Breathing Integration — Diaphragmatic Breathing, Box Breathing, Crocodile Breathing, 90/90 Breathing Hold, PRI Hip Shift with Exhale, Supine Breathing Reset
9. Tissue Preparation — Foam Roll Quads, Thoracic Foam Roll, Lacrosse Ball Glute Release, Lacrosse Ball Pec Minor, Calf Foam Roll, Hamstring Foam Roll
10. Dynamic Mobility Flow — World's Greatest Stretch Flow, Inchworm to Squat, Spiderman Flow, Hip 90/90 Transition Flow, Groundwork Mobility Sequence
11. Recovery & Restoration — Supine Figure-4, Supine Spinal Twist, Child's Pose, Supported Hip Flexor Hold, Legs Up the Wall, Recovery Breathing Protocol

CRITICAL MOBILITY SESSION RULES:
- Breathing is the primary tool — exhale to deepen passive range, inhale to create active control
- Passive range FIRST, then active control — never train control in a range you haven't restored
- NEVER push through joint pain — differentiate muscle tension (acceptable) vs joint impingement (stop)
- Hold durations: 30–90 sec passive, 5–10 sec active isometrics, 3–5 reps for CARs
- Track specific joint deficits — mobility is targeted and systematic, not random

4-WEEK MOBILITY SESSION STRUCTURE:
- Week 1 (Establish): Tissue prep + passive holds, introduce CARs, no end-range loading
- Week 2 (Build): Add active control work, PAILs/RAILs intro, increase hold durations
- Week 3 (Intensify): End-range loading introduced, control work at full range, movement quality integration
- Week 4 (Deload): Recovery/restoration flow emphasis, reduce intensity, consolidate gains

PRIMARY SESSION SKELETON (5-Part Structure):
1. Tissue Prep / Breathing (5–10 min): foam rolling, breathing drill, parasympathetic activation
2. Mobility Activation / CARs (10 min): joint CARs for priority regions, synovial activation
3. Positional Work / End-Range (15 min): holds, PAILs/RAILs, loaded end-range where appropriate
4. Dynamic Movement Integration (10 min): flows, transitions, multi-joint mobility patterns
5. Recovery / Downregulation (5–10 min): gentle holds, breathing reset, nervous system exit

MOBILITY PROGRESSION VARIABLES (NOT just sets/reps):
- Range depth (how far into end-range the work occurs)
- Time under tension (hold duration)
- Control difficulty (passive → active → loaded)
- Positional demand (how many joints simultaneously at end-range)
- Complexity of movement transitions (isolated → multi-joint → flow sequences)

AGENT COACHING LANGUAGE in Mobility mode:
- Reference mobility qualities: end-range, tissue length, joint space, active control, range ownership, capsular vs muscular restriction
- DO NOT default to strength language ("load", "volume", "progressive overload")
- DO NOT default to speed language ("quality", "CNS", "reactive")
- Think and speak in terms of: "own the range, not just reach it"
- Adaptation vocabulary: range depth, hold duration, control demand, positional complexity
${emphasisHints.length > 0 ? "\nLIVE MESSAGE SIGNALS:\n" + emphasisHints.join("\n") : ""}
`.trim();
}

// ─── Adaptation Heuristics ────────────────────────────────────────────────────

function getMobilityAdaptationHeuristics(): string {
  return `
MOBILITY ENGINE — Adaptation Heuristics:
- Pain signal (any session): immediately regress to MOBILITY_REENTRY_SUPPORT, reduce range demand, check for joint impingement vs muscle tension
- Stiffness complaint: shift to MOBILITY_STIFFNESS_REDUCTION — tissue prep focus, contract-relax sequences, dynamic flows before passive holds
- Range improving 2+ sessions: progress from passive holds → PAILs/RAILs → CARs → active control
- Active control reliable 3+ sessions: introduce end-range loading (Jefferson curl, weighted 90/90 lift, loaded shoulder holds)
- High training week (strength or speed): shift to MOBILITY_RECOVERY_FLOW — yin holds, breathing integration, no active loading
- Fatigue accumulation: reduce session length, increase recovery/restoration ratio, prioritize breathing drills
- Easy sessions reported: increase hold duration, add PAILs/RAILs contraction demand, introduce next complexity level
- Hard/painful sessions: hold complexity, increase passive recovery, return to range restoration focus
- Shoulder range limiting overhead patterns: prioritize Shoulder CARs + T-spine rotation before any pressing session
- Hip restriction limiting squat/sprint: prioritize 90/90 + Hip CARs + couch stretch before lower body sessions
- Ankle dorsiflexion limiting squat depth: daily ankle CARs + banded distraction protocol before all squat sessions
- Block transition: move from RESTORE_RANGE → CONTROL_END_RANGE after 3–4 weeks of consistent range gains
`.trim();
}

// ─── Engine Export ────────────────────────────────────────────────────────────

export const mobilityEngine: FocusEngineInterface = {
  focusMode: "mobility",
  label: "Mobility",

  getBlockArchetypes: () => MOBILITY_BLOCK_ARCHETYPES,
  getMovementFamilies: () => MOBILITY_MOVEMENT_FAMILIES,
  getSessionGrammar: () => MOBILITY_SESSION_GRAMMAR,
  getContinuationRules: () => MOBILITY_CONTINUATION_RULES,
  getQuickCommandSemantics: () => MOBILITY_QUICK_COMMANDS,
  getMemoryNamespace: () => MOBILITY_MEMORY_NAMESPACE,

  buildPromptContext: buildMobilityPromptContext,
  getAdaptationHeuristics: getMobilityAdaptationHeuristics,
};
