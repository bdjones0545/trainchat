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

const MOBILITY_BLOCK_ARCHETYPES: BlockArchetypeDescriptor[] = [
  {
    id: "MOBILITY_RESTORE_RANGE",
    label: "Restore Range",
    description: "Passive and active range of motion restoration. Joint-specific stretching, contract-relax, PNF, and sustained holds. Targets stiffness and range loss.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_POSITIONAL_CONTROL",
    label: "Positional Control",
    description: "Active stability within restored range. PAILs/RAILs, end-range isometrics, CARs (Controlled Articular Rotations). Trains the nervous system to own new range.",
    phase: "build",
    neuralDemand: "moderate",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_JOINT_PREP",
    label: "Joint Preparation",
    description: "Pre-training and pre-session joint readiness. Synovial fluid activation, controlled movement through full range, banded distractions. Primes joints for load.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_MOVEMENT_QUALITY",
    label: "Movement Quality",
    description: "Integrated movement patterns with full expression of range. Compound mobility flows, segmental control, movement standard refinement.",
    phase: "build",
    neuralDemand: "moderate",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_END_RANGE_STRENGTH",
    label: "End-Range Strength",
    description: "Loading through full available range. Deadbugs, Jefferson curls, deep squat holds with load, hanging work. Builds tissue tolerance at new range.",
    phase: "intensify",
    neuralDemand: "moderate",
    fatigueProfile: "moderate",
  },
  {
    id: "MOBILITY_RECOVERY_RESTORATION",
    label: "Recovery & Restoration Flow",
    description: "Low-load, high-range work with parasympathetic emphasis. Yin holds, breathing-integrated stretches, gentle flows. Reduces systemic fatigue.",
    phase: "deload",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
  {
    id: "MOBILITY_REENTRY",
    label: "Re-entry Support",
    description: "Post-injury or post-layoff mobility restoration protocol. Graduated range re-introduction, tissue graded exposure, pain-aware progression.",
    phase: "establish",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
];

// ─── Movement Families ────────────────────────────────────────────────────────

const MOBILITY_MOVEMENT_FAMILIES: MovementFamilyDescriptor[] = [
  {
    id: "hip_complex",
    label: "Hip Complex",
    examples: ["90/90 hip stretch", "Pigeon pose", "Hip CARs", "Couch stretch", "Frog stretch", "Deep squat hold"],
    primaryAdaptation: "hip flexion/extension/internal rotation range, hip capsule mobility",
  },
  {
    id: "thoracic_spine",
    label: "Thoracic Spine",
    examples: ["T-spine rotations", "Cat-cow", "Open books", "Thread the needle", "T-spine CARs"],
    primaryAdaptation: "thoracic extension and rotation range, rib cage mobility",
  },
  {
    id: "ankle_foot",
    label: "Ankle & Foot",
    examples: ["Ankle dorsiflexion drill", "Banded ankle distraction", "Calf stretches", "Ankle CARs", "Foot rolling"],
    primaryAdaptation: "dorsiflexion range, ankle joint mobility, arch control",
  },
  {
    id: "shoulder_complex",
    label: "Shoulder Complex",
    examples: ["Shoulder CARs", "Band pull-aparts", "Sleeper stretch", "Wall slides", "Banded distraction"],
    primaryAdaptation: "glenohumeral internal/external rotation, shoulder elevation range",
  },
  {
    id: "spine_lumbar",
    label: "Lumbar Spine",
    examples: ["Child's pose", "Lumbar rotations", "Prone press", "Knee-to-chest stretch", "Jefferson curl"],
    primaryAdaptation: "lumbar flexion/extension range, spinal segment mobility",
  },
  {
    id: "end_range_loading",
    label: "End-Range Loading",
    examples: ["Jefferson curl", "Deep squat hold with load", "Hanging (passive/active)", "Copenhagen plank", "Copenhagen hip adduction"],
    primaryAdaptation: "tissue tolerance at full range, tendon adaptation at end-range",
  },
  {
    id: "movement_flows",
    label: "Movement Flows",
    examples: ["Sun salutation", "Animal flows", "Yoga flow sequences", "Ground-based locomotion", "Segmental rolling"],
    primaryAdaptation: "integrated mobility, movement sequencing, parasympathetic recovery",
  },
  {
    id: "breathing_integration",
    label: "Breathing Integration",
    examples: ["Diaphragmatic breathing in stretch", "Box breathing", "Exhale-deepen holds", "PRI exercises"],
    primaryAdaptation: "range amplification through respiratory mechanics, rib position correction",
  },
];

// ─── Session Grammar ──────────────────────────────────────────────────────────

const MOBILITY_SESSION_GRAMMAR: SessionGrammarDescriptor = {
  primarySlotCount: 2,
  secondarySlotCount: 4,
  repRangeGuidance: "Holds: 30–90 seconds per position. CARs: 3–5 controlled rotations per joint. End-range isometrics: 5–10 second holds. Flows: 5–10 minute continuous sequences.",
  restGuidance: "Mobility sessions are low-CNS demand. Rest between holds: 15–30 seconds. Between blocks: 60–90 seconds. No rush — quality over volume.",
  intensityGuidance: "Work to comfortable end-range — never into pain. For PAILs/RAILs: 20–40% isometric contraction effort. End-range loading: start very light, progress tissue tolerance gradually over weeks.",
  specialNotes: "Breathing is a tool — use exhale to deepen range. Passive range first, then active control. Track specific joint deficits and address them systematically. Never push through joint pain — differentiate between muscle tension and joint discomfort.",
};

// ─── Continuation Rules ───────────────────────────────────────────────────────

const MOBILITY_CONTINUATION_RULES: ContinuationRuleDescriptor = {
  nextBlockOptions: [
    "MOBILITY_RESTORE_RANGE → MOBILITY_POSITIONAL_CONTROL (when range is recovered)",
    "MOBILITY_POSITIONAL_CONTROL → MOBILITY_END_RANGE_STRENGTH (when control is established)",
    "MOBILITY_JOINT_PREP → MOBILITY_MOVEMENT_QUALITY (after joint readiness is reliable)",
    "Any block → MOBILITY_RECOVERY_RESTORATION (high stress weeks or training overload)",
    "MOBILITY_REENTRY → MOBILITY_RESTORE_RANGE → MOBILITY_POSITIONAL_CONTROL",
  ],
  progressionDirection: "Range restoration → Active control → End-range loading → Integrated movement quality → Maintenance. Increase hold duration before increasing loading.",
  deescalationTriggers: ["Joint pain > 3/10 during holds", "Pain lasting 24h+ after sessions", "Range regression after gains"],
  adaptationCues: ["Range improving over 2+ sessions → progress to active control work", "Control improving → introduce end-range loading", "High fatigue week → shift to recovery/restoration flow"],
};

// ─── Quick Commands ───────────────────────────────────────────────────────────

const MOBILITY_QUICK_COMMANDS: QuickCommandDescriptor[] = [
  { label: "Open hips", intentMapping: "increase_hip_mobility_focus", engineBias: "MOBILITY_RESTORE_RANGE" },
  { label: "Reduce stiffness", intentMapping: "reduce_tissue_stiffness", engineBias: "MOBILITY_RECOVERY_RESTORATION" },
  { label: "More recovery", intentMapping: "shift_recovery_restoration", engineBias: "MOBILITY_RECOVERY_RESTORATION" },
  { label: "Joint-friendly", intentMapping: "increase_joint_friendly", engineBias: "MOBILITY_JOINT_PREP" },
  { label: "Restore range", intentMapping: "restore_range_of_motion", engineBias: "MOBILITY_RESTORE_RANGE" },
];

// ─── Memory Namespace ─────────────────────────────────────────────────────────

const MOBILITY_MEMORY_NAMESPACE: MemoryNamespaceDescriptor = {
  namespace: "mobility",
  exampleKeys: ["hips_priority", "shoulder_range_priority", "recovery_bias", "thoracic_restriction", "ankle_limitation"],
  sharedWithGlobal: false,
};

// ─── Prompt Context ───────────────────────────────────────────────────────────

function buildMobilityPromptContext(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  const emphasisHints: string[] = [];
  if (/hip|hips|groin|pigeon|90.90/.test(lower)) {
    emphasisHints.push("User message signals hip mobility intent — bias toward MOBILITY_RESTORE_RANGE and hip complex work.");
  }
  if (/shoulder|overhead|rotator|sleeper/.test(lower)) {
    emphasisHints.push("User message signals shoulder range intent — bias toward shoulder complex mobility and end-range control.");
  }
  if (/thoracic|t.spine|upper.back|rotation/.test(lower)) {
    emphasisHints.push("User message signals thoracic spine intent — bias toward T-spine extension/rotation work.");
  }
  if (/ankle|dorsiflexion|calf|squat.depth/.test(lower)) {
    emphasisHints.push("User message signals ankle mobility intent — bias toward ankle dorsiflexion and foot complex work.");
  }
  if (/recover|restore|rest|deload|relax/.test(lower)) {
    emphasisHints.push("User message signals recovery/restoration intent — bias toward MOBILITY_RECOVERY_RESTORATION flow.");
  }
  if (/control|stability|end.range|strength.*range|pails|rails/.test(lower)) {
    emphasisHints.push("User message signals end-range control intent — bias toward MOBILITY_POSITIONAL_CONTROL and end-range loading.");
  }

  return `
[FOCUS MODE: MOBILITY]
Active training focus: Mobility — covering range restoration, positional control, joint prep, movement quality, end-range strength, and recovery flow.

THIS IS NOT LIGHT STRENGTH. Mobility work operates on its own biomotor logic.

BLOCK ARCHETYPES available in this mode:
- Restore Range: passive and active ROM restoration, PNF, contract-relax, sustained holds
- Positional Control: PAILs/RAILs, CARs, end-range isometrics, nervous system ownership of range
- Joint Preparation: joint readiness, synovial activation, banded distractions, pre-session prep
- Movement Quality: integrated flows, segmental control, movement standard refinement
- End-Range Strength: loading at full range, Jefferson curl, deep squat holds, tissue tolerance
- Recovery & Restoration Flow: low-load high-range, breathing-integrated, parasympathetic
- Re-entry Support: post-injury graduated re-introduction, pain-aware progression

MOVEMENT GRAMMAR for this mode:
- Breathing is a primary tool — exhale to deepen range, inhale to brace in end-range
- Passive range BEFORE active control — restore range, then own it
- Never push into joint pain — distinguish muscle tension from joint impingement
- Track specific joint deficits systematically — mobility is targeted, not random
- Hold durations: 30–90 seconds for passive, 5–10 seconds for active isometrics

SESSION STRUCTURE:
- 2 primary joint/movement targets (most restricted or highest priority)
- 3–5 supporting work (related joints or movement flows)
- Breathing integration: 1–2 dedicated breathing/parasympathetic blocks

AGENT BEHAVIOR in Mobility mode:
- Responses and examples bias toward range, joint control, restoration, movement quality, and tissue tolerance
- Coaching language references mobility qualities: end-range, tissue length, joint space, active control, restoration
- Do NOT default to strength-first or speed-first language
- Think in terms of "own the range, not just reach it"
${emphasisHints.length > 0 ? "\nLIVE MESSAGE SIGNALS:\n" + emphasisHints.join("\n") : ""}
`.trim();
}

// ─── Adaptation Heuristics ────────────────────────────────────────────────────

function getMobilityAdaptationHeuristics(): string {
  return `
MOBILITY ENGINE — Adaptation Heuristics:
- Range improving over 2+ sessions: progress from passive holds to active control (CARs, PAILs/RAILs)
- Active control reliable in 3+ sessions: introduce end-range loading
- Joint pain > 3/10 during holds: immediately regress to lighter input, check breathing and tension
- Range regression after gains: return to passive work, check for compensatory patterns
- High training week (strength or speed): shift to MOBILITY_RECOVERY_RESTORATION flow
- Shoulder range limiting overhead patterns: prioritize shoulder CARs + T-spine rotation before session
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
