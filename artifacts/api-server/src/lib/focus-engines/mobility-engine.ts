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
 *
 * PARITY STATUS (12-part spec):
 *  1. Exposure Tracking      ✓ MobilityExposureTracker
 *  2. Cluster Control        ✓ MOBILITY_CLUSTER_DEFINITIONS (16 clusters)
 *  3. Dose System            ✓ MOBILITY_DOSE_PROFILES + session caps by week
 *  4. Range/Control Progress ✓ RANGE_PROGRESSION_MODEL (4-week arc)
 *  5. Joint Distribution     ✓ JOINT_DISTRIBUTION_TARGETS
 *  6. Predictive Adaptation  ✓ buildMobilityPredictiveAdaptationContext
 *  7. Session Log Interp.    ✓ buildMobilitySessionLogInterpretationRules
 *  8. Flow Continuity        ✓ FLOW_PHASE_SEQUENCE + buildFlowContinuityDirective
 *  9. Agent Language         ✓ MOBILITY_AGENT_LANGUAGE
 * 10. Continuation Intel.    ✓ MOBILITY_CONTINUATION_RULES (enhanced)
 * 11. Validation             ✓ buildMobilityParityCheck
 * 12. Startup Log            ✓ [MobilityParityCheck] console.log
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
  buildMobilitySessionContext,
  buildMobilityParityCheck,
  buildMobilitySessionLogInterpretationRules,
  buildMobilityPredictiveAdaptationContext,
  MOBILITY_AGENT_LANGUAGE,
  type MobilityJoint,
} from "./mobility-intelligence";
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
    "mobility_reentry_support → mobility_range_restoration (pain-free baseline established for 2+ sessions)",
    "mobility_stiffness_reduction → mobility_range_restoration (chronic stiffness addressed, tissue pliable)",
    "mobility_range_restoration → mobility_end_range_control (passive range consistently achieved, CARs clean)",
    "mobility_hip_focus → mobility_end_range_control (hip passive range built, ready to own it)",
    "mobility_shoulder_focus → mobility_end_range_control (shoulder range reliable, introduce PAILs/RAILs)",
    "mobility_spine_focus → mobility_movement_quality (thoracic range restored, integrate into movement)",
    "mobility_ankle_focus → mobility_movement_quality (dorsiflexion improved, integrate into squat/sprint)",
    "mobility_end_range_control → mobility_movement_quality (control reliable across 3+ sessions)",
    "mobility_movement_quality → [return to sport focus block or maintenance cycling]",
    "Any block → mobility_recovery_flow (high-stress training week, fatigue >7/10, or explicit deload)",
    "mobility_recovery_flow → mobility_range_restoration OR mobility_end_range_control (after recovery week)",
    "ESCALATION RULE: If pain persists >3 sessions → back to mobility_reentry_support immediately",
  ],
  progressionDirection: "Tissue preparation → Passive range restoration → CARs (diagnostic + active) → End-range control (PAILs/RAILs) → End-range loading → Integrated movement quality → Sport/activity transfer. Primary variable: hold duration. Secondary: contraction demand. Tertiary: positional complexity.",
  deescalationTriggers: [
    "Joint pain >3/10 during holds — immediately drop to half range, no active loading",
    "Pain persisting 24h+ after sessions — shift to mobility_recovery_flow for full week",
    "Pain persisting across 3+ sessions — return to mobility_reentry_support framework",
    "Range regression after previous gains — return to passive restoration, add tissue prep",
    "Compensatory movement patterns emerging — return to joint-specific isolation (joint-focus block)",
    "Active CARs range dropping below Week 1 baseline — de-escalate to passive holds only",
    "Fatigue accumulation from concurrent training — mobility_recovery_flow as bridge",
  ],
  adaptationCues: [
    "CARs quality improving (smoother, fuller circle) 2+ sessions → add PAILs/RAILs at 20% effort",
    "Passive range +5–10° measurable improvement → begin active control work at new range",
    "Active control reliable 3+ sessions at current range → introduce end-range loading",
    "Easy sessions reported consistently → increase hold duration (15-20s), add contraction demand",
    "Stiffness complaint (morning or post-training) → bias tissue_preparation + contract-relax → dynamic flow",
    "Pain complaint (any joint) → bias reentry_support, graded range reintroduction, no loading",
    "High training week → shift mobility emphasis to recovery_flow + breathing integration",
    "Sport-specific limitation reported → shift to targeted joint-focus block for 4 weeks",
    "Range gains plateauing → assess if restriction is capsular (need distraction) vs muscular (need holds)",
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
  let emphasizedJoint: MobilityJoint | undefined;

  // ── Intent signal parsing ──────────────────────────────────────────────────
  if (/hip|hips|groin|pigeon|90.90|couch.stretch|hip.flexor|adductor|frog/.test(lower)) {
    emphasisHints.push(
      "HIP INTENT DETECTED — bias toward hip complex work. Priority cluster: hip_rotation_cluster + hip_articulation_cluster. " +
      "Lead with Hip CARs (diagnostic), follow with 90/90 Stretch 45-60s, Couch Stretch, Frog Stretch. " +
      "If Week 2+: introduce Hip PAILs/RAILs at 20% contraction. Check hip internal rotation — most neglected direction.",
    );
    blockTypeHint = "mobility_hip_focus";
    emphasizedJoint = "hip";
  }
  if (/shoulder|overhead|rotator|sleeper|wall.slide|pec|deltoid|capsule/.test(lower)) {
    emphasisHints.push(
      "SHOULDER INTENT DETECTED — T-spine mobility precedes shoulder work (always). " +
      "Lead with thoracic extension foam roll, then Shoulder CARs, Wall Slides, Sleeper Stretch (posterior capsule). " +
      "shoulder_posterior_cluster = max 1 drill. shoulder_cars_cluster = CARs + Wall Slides together is appropriate. " +
      "Week 3+: introduce Shoulder PAILs/RAILs, banded end-range work.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_shoulder_focus";
    emphasizedJoint = "shoulder";
  }
  if (/thoracic|t.spine|upper.back|rotation|rib|spine|spinal/.test(lower)) {
    emphasisHints.push(
      "THORACIC SPINE INTENT DETECTED — extension precedes rotation (always). " +
      "thoracic_extension_cluster first: foam roll T4-T10, Cat-Cow. Then thoracic_rotation_cluster: Open Book, Thread the Needle, Quadruped Rotation. " +
      "Breathing amplifies thoracic range — pair breathing drill with thoracic work. " +
      "Thoracic CARs with dowel in Week 2+. Max 2 rotation variants per session.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_spine_focus";
    emphasizedJoint = "spine";
  }
  if (/ankle|dorsiflexion|calf|squat.depth|foot|plantarflexion/.test(lower)) {
    emphasisHints.push(
      "ANKLE INTENT DETECTED — ankle dorsiflexion is the squat and sprint prerequisite. " +
      "ankle_passive_cluster: pick 1 (Wall Ankle Stretch OR Banded Distraction). " +
      "ankle_active_cluster: Ankle CARs always, PAILs/RAILs in Week 2+. " +
      "ankle_calf_cluster: both Calf Stretch variants together (straight = gastroc, bent = soleus — different muscles). " +
      "Progress: daily CARs → add banded distraction → heel drops → loaded dorsiflexion.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_ankle_focus";
    emphasizedJoint = "ankle";
  }
  if (/recover|restore|rest|deload|relax|parasympathetic|restor/.test(lower)) {
    emphasisHints.push(
      "RECOVERY INTENT DETECTED — shift to mobility_recovery_flow archetype. " +
      "Increase breathing_reset_cluster priority. Recovery holds 2-5 min per position. " +
      "No PAILs/RAILs, no end-range loading. Nervous system downregulation is the goal. " +
      "Session structure: tissue prep → breathing → yin holds → recovery exit. Max 35 min.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_recovery_flow";
  }
  if (/control|stability|end.range|pails|rails|car|articular|own/.test(lower)) {
    emphasisHints.push(
      "END-RANGE CONTROL INTENT DETECTED — active control work is the priority. " +
      "PAILs/RAILs are the primary tool: passive hold first to reach range, then 5-10s isometric at 20-40% effort. " +
      "CARs are diagnostic — slow, full-range circles to assess active vs passive range gap. " +
      "End-range isometrics build tissue tolerance. Passive range MUST exist before control work.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_end_range_control";
  }
  if (/stiff|stiffness|tight|tightness|morning|locked.up/.test(lower)) {
    emphasisHints.push(
      "STIFFNESS INTENT DETECTED — tissue prep before ANY passive holds. " +
      "Foam rolling + contract-relax sequences → dynamic flow → THEN passive holds. " +
      "breathing_reset_cluster opens the session. Stiffness responds to heat + movement, not aggressive forcing. " +
      "Dynamic mobility flow (10 min) before passive positional work differentiates stiffness sessions.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_stiffness_reduction";
  }
  if (/pain|hurt|injury|return|comeback|re.entry|sensitive|achy/.test(lower)) {
    emphasisHints.push(
      "PAIN/REENTRY INTENT DETECTED — mobility_reentry_support framework applies. " +
      "Graded range reintroduction ONLY. Week 1: 50% available range, no PAILs, no loading. " +
      "Differentiate: sharp/stabbing = stop immediately (may be structural). Dull ache = proceed carefully. " +
      "Pain >3/10 = reduce range, increase breathing, no active loading. " +
      "Goal: establish pain-free CARs before any passive end-range holds.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_reentry_support";
  }
  if (/breath|breathing|diaphragm|box.breath|exhale|inhale/.test(lower)) {
    emphasisHints.push(
      "BREATHING INTENT DETECTED — breathing_reset_cluster is the session anchor. " +
      "Crocodile breathing (prone) confirms diaphragm activation. Box breathing (4-4-4-4) for nervous system reset. " +
      "90/90 Breathing Hold is both a breathing drill AND hip position — dual purpose. " +
      "Exhale = range amplifier (deepen passive holds on the out-breath).",
    );
    blockTypeHint = blockTypeHint ?? "mobility_movement_quality";
  }
  if (/movement|quality|flow|sequence|transition/.test(lower)) {
    emphasisHints.push(
      "MOVEMENT QUALITY INTENT DETECTED — dynamic_flow_cluster is the session anchor. " +
      "World's Greatest Stretch and Spiderman Flow are diagnostic — note where movement quality breaks down. " +
      "Slow, deliberate transitions expose joint control gaps. Max 1 dynamic flow sequence per session. " +
      "Flows close the session — all joint work must precede the integrating flow.",
    );
    blockTypeHint = blockTypeHint ?? "mobility_movement_quality";
  }

  // ── Build block plan context ───────────────────────────────────────────────
  const seed = Math.random();
  const mobilityBlockPlan = buildMobilityMonthlyBlockPlan(
    goal ?? userMessage.slice(0, 100),
    sport ?? null,
    experience ?? null,
    seed,
    blockTypeHint,
  );
  const blockContext = buildMobilityMonthlyBlockContext(mobilityBlockPlan);

  // ── Build intelligence system context (week 2 assumed without explicit signal) ─
  const intelligenceContext = buildMobilitySessionContext(2, {
    emphasizedJoint,
  });

  return `
[FOCUS MODE: MOBILITY]
Active training focus: Mobility — range restoration, positional control, joint prep, end-range control, tissue tolerance, recovery flow.

THIS IS NOT LIGHT STRENGTH. THIS IS NOT RECOVERY CARDIO. THIS IS NOT A STRETCH LIST.
Mobility operates on its own biomotor logic lane — structured, progressive, systematic, and agent-driven.

${blockContext}

─────────────────────────────────────────
MOVEMENT FAMILIES available in this mode:
─────────────────────────────────────────
1. Hip Mobility — Hip CARs, 90/90 Stretch, 90/90 Active Posterior Lift, Couch Stretch, Hip PAILs/RAILs, Frog Stretch, Adductor Rockback, Adductor CARs, Pigeon Stretch, Deep Squat Hip Stretch, Hip Airplane, Spiderman Hip Stretch
2. Shoulder Mobility — Shoulder CARs, Wall Slides, Sleeper Stretch, Band Shoulder Distraction, Doorway Chest Stretch, Pec Minor Stretch, Cross-Body Shoulder Stretch, Shoulder PAILs/RAILs, Overhead Lat Stretch, Banded Pass-Through
3. Thoracic Spine — Thoracic Extension Foam Roll, Cat-Cow, Quadruped Thoracic Rotation, Thread the Needle, Open Book Stretch, Thoracic CARs, Thoracic CARs with Dowel, Rib Roll, T-Spine Extension on Ball, Side-Lying T-Spine Rotation
4. Ankle Mobility — Wall Ankle Stretch, Banded Ankle Distraction, Ankle CARs, Ankle PAILs/RAILs, Calf Stretch Straight Knee, Calf Stretch Bent Knee, Heel Drop, Ankle Circles
5. Trunk Control — Dead Bug, Dead Bug with Band, Bird Dog, 90/90 Breathing Hold, Segmental Rolling, Hollow Body Hold, Pallof Press
6. End-Range Strength — Jefferson Curl, Deep Squat Hold with Load, Passive Hang, Active Hang, Copenhagen Plank, Hip PAILs/RAILs (loaded isometric), Weighted 90/90 Posterior Lift
7. Positional Control — Hip CARs (controlled), Shoulder CARs (loaded), 90/90 Active Posterior Lift, Hip IR End-Range Hold, Shoulder IR End-Range Hold, Thoracic CARs with Dowel
8. Breathing Integration — Diaphragmatic Breathing Drill, Box Breathing, Crocodile Breathing, 90/90 Breathing Hold, Supine Breathing Reset, Exhale-Deepen Stretch Protocol
9. Tissue Preparation — Foam Roll Quads, Thoracic Foam Roll, Lacrosse Ball Glute Release, Lacrosse Ball Pec Minor, Calf Foam Roll, Hamstring Foam Roll, IT Band Foam Roll
10. Dynamic Mobility Flow — World's Greatest Stretch Flow, Inchworm to Squat, Spiderman Flow, Hip 90/90 Transition Flow, Ground Control Flow
11. Recovery & Restoration — Supine Figure-4 Hold, Supine Spinal Twist, Child's Pose, Supported Hip Flexor Hold, Legs Up the Wall, Progressive Relaxation Flow

─────────────────────────────────────────
${intelligenceContext}
─────────────────────────────────────────

MOBILITY PROGRESSION VARIABLES (primary input to programming decisions):
- Range depth: how far into end-range the hold or work occurs
- Time under tension: hold duration is the primary volume variable (not reps)
- Control difficulty: passive hold → active isometric → loaded end-range
- Positional complexity: isolated joint → multi-joint → flow sequences
- Contraction demand: 20% effort (Week 2) → 30% (Week 3) → 40% (Week 4 max for PAILs)

AGENT LANGUAGE RULES:
Preferred vocabulary: ${MOBILITY_AGENT_LANGUAGE.preferredVocabulary.join(", ")}
Prohibited vocabulary: ${MOBILITY_AGENT_LANGUAGE.prohibitedVocabulary.join(", ")}
Voice examples:
${MOBILITY_AGENT_LANGUAGE.coachVoiceExamples.map(e => `  "${e}"`).join("\n")}
${emphasisHints.length > 0 ? "\n─────────────────────────────────────────\nLIVE MESSAGE SIGNALS:\n" + emphasisHints.join("\n") : ""}
`.trim();
}

// ─── Adaptation Heuristics ────────────────────────────────────────────────────

function getMobilityAdaptationHeuristics(): string {
  const logInterpretation = buildMobilitySessionLogInterpretationRules();
  const predictiveAdaptation = buildMobilityPredictiveAdaptationContext();

  return `
MOBILITY ENGINE — Adaptation Heuristics:

BLOCK PROGRESSION LADDER (canonical order):
1. mobility_reentry_support → 2. mobility_stiffness_reduction → 3. mobility_range_restoration →
4. [hip/shoulder/spine/ankle focus blocks] → 5. mobility_end_range_control → 6. mobility_movement_quality → maintenance
Recovery bridge: any block → mobility_recovery_flow → resume at appropriate ladder point

CRITICAL PROGRESSION GATES:
- CANNOT progress to active control without 2+ sessions of reliable passive range
- CANNOT introduce PAILs/RAILs before passive range is consistent
- CANNOT introduce end-range loading before active control is reliable in 3+ sessions
- CANNOT run dynamic flows before passive phase is complete in the session
- MUST de-escalate to mobility_reentry_support if pain persists 3+ sessions

JOINT-SPECIFIC ADAPTATION RULES:
- Shoulder range limiting overhead: T-spine extension FIRST (every session), then shoulder CARs + wall slides
- Hip restriction limiting squat/sprint: Hip CARs + 90/90 + Couch Stretch before every lower body session
- Ankle dorsiflexion limiting squat depth: daily Ankle CARs + banded distraction is the daily standard
- Thoracic rotation limiting throwing/rotation: foam roll extension → rotation sequence (always extension before rotation)
- Pain or impingement: graded range reintroduction only, no PAILs, no loading

${predictiveAdaptation}

${logInterpretation}
`.trim();
}

// ─── Startup Parity Check ─────────────────────────────────────────────────────

const _mobilityParityCheck = buildMobilityParityCheck();
const _allSystemsReady = Object.values(_mobilityParityCheck).every(Boolean);

console.log("[MobilityParityCheck]", JSON.stringify({
  ..._mobilityParityCheck,
  allSystemsReady: _allSystemsReady,
  clusterCount: 16,
  movementFamilies: MOBILITY_MOVEMENT_FAMILIES.length,
  blockArchetypes: MOBILITY_BLOCK_ARCHETYPES.length,
  quickCommands: MOBILITY_QUICK_COMMANDS.length,
  parity: _allSystemsReady ? "FULL_PARITY" : "INCOMPLETE",
}));

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
