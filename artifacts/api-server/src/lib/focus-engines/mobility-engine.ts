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

// ─── Mobility Architecture Brief ──────────────────────────────────────────────

/**
 * Builds a prescriptive architecture brief for mobility program builds.
 * Mirrors the authority level of the strength `buildArchitectureBrief` so the AI
 * does not fall back on the base prompt's strength-centric session structures.
 *
 * Injected into the system prompt as `architectureBriefText` when focusMode === "mobility".
 */
export function buildMobilityArchitectureBrief(
  days: number | null,
  goal: string | null,
  userMessage: string,
): string {
  const sessionCount = days ?? 3;
  const lower = userMessage.toLowerCase();

  // ── Detect primary mobility sub-intent ───────────────────────────────────
  const isHip = /hip|hips|groin|pigeon|90.90|couch.stretch|hip.flexor|adductor|frog/.test(lower);
  const isShoulder = /shoulder|overhead|rotator|sleeper|wall.slide|pec|deltoid|capsule/.test(lower);
  const isThoracic = /thoracic|t.spine|upper.back|rotation|rib|spine|spinal/.test(lower);
  const isAnkle = /ankle|dorsiflexion|calf|squat.depth|foot|plantarflexion/.test(lower);
  const isRecovery = /recover|restore|rest|deload|relax|parasympathetic/.test(lower);
  const isControl = /control|stability|end.range|pails|rails|car|articular/.test(lower);
  const isStiffness = /stiff|stiffness|tight|tightness|morning|locked.up/.test(lower);
  const isPain = /pain|hurt|injury|return|comeback|re.entry|sensitive|achy/.test(lower);

  const primaryFocus = isPain
    ? "Re-entry Support (pain-aware)"
    : isRecovery
    ? "Recovery Flow"
    : isControl
    ? "End-Range Control"
    : isStiffness
    ? "Stiffness Reduction"
    : isHip
    ? "Hip Mobility"
    : isShoulder
    ? "Shoulder Mobility"
    : isThoracic
    ? "Thoracic Spine Mobility"
    : isAnkle
    ? "Ankle Mobility"
    : "Full-Body Mobility — Range + Control";

  // ── Day skeletons — cycle through mobility qualities across the week ──────
  const allDaySkeletons: string[] = [];

  // Day 1 — always anchored in tissue prep + primary passive range work
  if (isHip) {
    allDaySkeletons.push(`Day 1 — Hip Mobility (Passive Range):
  Block A — Tissue Prep (10 min): Foam Roll Quads × 60s each, Lacrosse Ball Glute Release × 60s each, IT Band Foam Roll × 60s each
  Block B — Breathing Reset (5 min): 90/90 Breathing Hold × 3 deep breaths, Crocodile Breathing × 6 breaths prone
  Block C — Hip Passive Range (25 min):
    Hip CARs × 3 slow full-circle reps each direction (diagnostic — note sticking points)
    90/90 Hip Stretch × 60s each side (bias internal rotation side if stiffer)
    Couch Stretch × 60s each side (hip flexor / quad bias)
    Frog Stretch × 60–90s sustained hold
    Adductor Rockback × 60s each side
  Block D — Active Control (10 min): 90/90 Active Posterior Lift × 3×5 reps each side; Hip Airplane × 3×5 each
  Block E — Close (5 min): Supine Spinal Twist × 60s each, Supine Figure-4 Hold × 60s each`);
  } else if (isShoulder) {
    allDaySkeletons.push(`Day 1 — Shoulder Mobility (T-Spine First):
  Block A — Tissue Prep (10 min): Thoracic Extension Foam Roll × 60–90s (T4–T10), Lacrosse Ball Pec Minor × 60s each
  Block B — Thoracic First (15 min): Cat-Cow × 10 slow reps; Thread the Needle × 60s each; Open Book Stretch × 60s each
  Block C — Shoulder Passive Range (20 min):
    Shoulder CARs × 3 slow full-circle reps each (diagnostic)
    Sleeper Stretch × 60–90s each (posterior capsule)
    Doorway Chest Stretch × 60s each (pec minor / anterior capsule)
    Cross-Body Shoulder Stretch × 60s each
    Overhead Lat Stretch × 60s each
  Block D — Active Control (10 min): Wall Slides × 3×10 slow; Band Shoulder Distraction × 3×30s each
  Block E — Close (5 min): Supine Breathing Reset × 5 deep breaths, Child's Pose × 60s`);
  } else if (isThoracic) {
    allDaySkeletons.push(`Day 1 — Thoracic Spine (Extension Before Rotation):
  Block A — Tissue Prep (10 min): Thoracic Extension Foam Roll × 90s (T4–T10); T-Spine Extension on Ball × 60s
  Block B — Breathing Anchor (5 min): Box Breathing 4-4-4-4 × 3 rounds; Rib Roll × 30s each side
  Block C — Thoracic Extension (15 min): Cat-Cow × 10 slow reps; Thoracic CARs × 3 each direction; Thoracic Extension Foam Roll pass × 2
  Block D — Thoracic Rotation (15 min): Open Book Stretch × 60s each; Thread the Needle × 60s each; Quadruped Thoracic Rotation × 60s each; Side-Lying T-Spine Rotation × 60s each
  Block E — Integration (10 min): Shoulder CARs × 3 each (T-spine feeds shoulder range); World's Greatest Stretch × 3 each side`);
  } else if (isAnkle) {
    allDaySkeletons.push(`Day 1 — Ankle Mobility (Dorsiflexion Focus):
  Block A — Tissue Prep (10 min): Calf Foam Roll × 60s each; Hamstring Foam Roll × 60s each
  Block B — Breathing Reset (5 min): Diaphragmatic Breathing Drill × 5 breaths
  Block C — Ankle Passive Range (25 min):
    Ankle CARs × 3 slow full-circle reps each direction (diagnostic)
    Wall Ankle Stretch × 60s each (dorsiflexion)
    Banded Ankle Distraction × 60–90s each (joint capsule)
    Calf Stretch Straight Knee × 60s each (gastrocnemius)
    Calf Stretch Bent Knee × 60s each (soleus)
    Heel Drop × 3×10 slow eccentric reps
  Block D — Active Control (10 min): Ankle PAILs/RAILs × 2 rounds each side (20% contraction × 10s); Ankle Circles × 10 each direction
  Block E — Integration (10 min): Deep Squat Hip Stretch × 60s (tests ankle + hip combined); Spiderman Stretch × 60s each`);
  } else if (isRecovery || isPain) {
    allDaySkeletons.push(`Day 1 — Recovery Flow (Parasympathetic Reset):
  Block A — Breathing Anchor (10 min): Crocodile Breathing × 6 breaths; Box Breathing 4-4-4-4 × 3 rounds; 90/90 Breathing Hold × 3 breaths
  Block B — Tissue Release (10 min): Foam Roll Quads × 60s each; Thoracic Extension Foam Roll × 60s; Lacrosse Ball Glute × 60s
  Block C — Yin Holds (25 min):
    Supine Figure-4 Hold × 2–3 min each side
    Supported Hip Flexor Hold × 90s each
    Child's Pose × 2 min
    Supine Spinal Twist × 90s each
    Legs Up the Wall × 3–5 min
  Block D — Gentle Flow (10 min): World's Greatest Stretch × 3 each (slow); Cat-Cow × 10 slow; Hip 90/90 Transition Flow × 5 transitions
  Block E — Exit (5 min): Supine Breathing Reset × 5 breaths; Progressive Relaxation`);
  } else {
    allDaySkeletons.push(`Day 1 — Full-Body Mobility (Passive Range):
  Block A — Tissue Prep (10 min): Thoracic Extension Foam Roll × 60s; Foam Roll Quads × 60s each; Lacrosse Ball Glute × 60s each
  Block B — Breathing Reset (5 min): 90/90 Breathing Hold × 3 breaths; Crocodile Breathing × 5 breaths
  Block C — Joint-Specific Passive Range (25 min):
    Hip CARs × 3 each (diagnostic) → 90/90 Stretch × 60s each → Couch Stretch × 60s each
    Shoulder CARs × 3 each → Sleeper Stretch × 60s each → Wall Slides × 10 slow
    Thoracic Extension Foam Roll → Cat-Cow × 10 → Thread the Needle × 60s each
  Block D — Active Control (10 min): 90/90 Active Posterior Lift × 3×5 each; Bird Dog × 3×10 slow
  Block E — Close (5 min): Supine Spinal Twist × 60s each; Child's Pose × 60s`);
  }

  // Day 2 — active control / PAILs-RAILs emphasis
  allDaySkeletons.push(`Day 2 — End-Range Control (PAILs/RAILs + CARs):
  Block A — Tissue Prep (8 min): Foam Roll primary limiting region × 60s; contract-relax sequence × 2
  Block B — Breathing Reset (5 min): Box Breathing 4-4-4-4 × 3 rounds; exhale-deepen practice
  Block C — CARs Diagnostic (10 min): Hip CARs × 3 each (slow, full range); Shoulder CARs × 3 each; Ankle CARs × 3 each
    Note active vs passive range gap — this determines PAILs need
  Block D — PAILs / RAILs Work (20 min):
    Hip: 90/90 passive hold × 60s → PAILs 20% contraction × 10s → release → RAILs × 10s; repeat × 2 each side
    Shoulder (if limited): Sleeper Stretch × 60s → Shoulder PAILs/RAILs × 10s each; repeat × 2 each
    Ankle (if limited): Banded Distraction × 60s → Ankle PAILs/RAILs × 10s each; repeat × 2 each
  Block E — End-Range Loading (10 min): Jefferson Curl × 3×5 slow; Passive Hang × 3×30s; Deep Squat Hold with Load × 3×30s
  Block F — Recovery Close (7 min): Supine Figure-4 × 90s each; Supine Breathing Reset × 5 breaths`);

  // Day 3 — movement quality + integrated flows
  allDaySkeletons.push(`Day 3 — Movement Quality + Integrated Flow:
  Block A — Tissue Prep (8 min): Foam Roll quads + thoracic; contract-relax hamstrings × 60s each
  Block B — Breathing + Activation (7 min): Diaphragmatic Breathing × 5 breaths; Dead Bug × 3×8 slow; Bird Dog × 3×8 slow
  Block C — Joint-Specific Isolation (15 min):
    Primary limiting joint: full CARs × 3 + passive hold × 60s + PAILs × 10s (repeat twice)
    Secondary limiting joint: CARs × 3 + passive hold × 60s
  Block D — Integrated Mobility Flow (15 min):
    World's Greatest Stretch × 5 each side (full slow sequence)
    Spiderman Flow × 5 each side
    Inchworm to Squat × 8 slow reps
    Hip 90/90 Transition Flow × 5 full transitions
  Block E — Recovery Close (10 min): Supine Spinal Twist × 90s each; Supported Hip Flexor Hold × 90s each; Child's Pose × 60s`);

  // Day 4+ (if more sessions requested)
  allDaySkeletons.push(`Day 4 — Hip + Shoulder Deep Focus:
  Block A — Tissue Prep (10 min): Lacrosse Ball Glute × 60s each; Foam Roll Thoracic × 60s; Pec Minor Release × 60s each
  Block B — Breathing Reset (5 min): 90/90 Breathing Hold × 3 breaths; Crocodile Breathing × 5
  Block C — Hip Deep Focus (20 min):
    Pigeon Stretch × 90s each; Frog Stretch × 90s; Adductor Rockback × 60s each
    Hip PAILs/RAILs × 2 rounds each side at 30% contraction
    Hip Airplane × 3×5 each (active IR/ER control)
  Block D — Shoulder Deep Focus (15 min):
    Open Book Stretch × 90s each; Banded Pass-Through × 3×10; Overhead Lat Stretch × 60s each
    Shoulder PAILs/RAILs × 2 rounds each at 30% contraction
  Block E — Integration (10 min): Active Hang × 3×30s; Deep Squat Hold × 60s; Supine Figure-4 × 60s each`);

  allDaySkeletons.push(`Day 5 — Stiffness Reduction + Dynamic Flow:
  Block A — Heat + Tissue (10 min): Foam Roll IT Band × 60s each; Hamstring Foam Roll × 60s each; Calf Foam Roll × 60s each
  Block B — Contract-Relax Sequence (10 min): Hamstring contract-relax × 60s each; Quad contract-relax × 60s each
  Block C — Dynamic Flow Sequence (15 min):
    March to Spiderman × 8 each; World's Greatest Stretch × 5 each; Inchworm Walkout × 8; Animal Flow Ground × 5 min
  Block D — Passive Yin Holds (15 min):
    Couch Stretch × 90s each; 90/90 Stretch × 90s each; Sleeper Stretch × 90s each; Child's Pose × 90s
  Block E — Recovery Exit (10 min): Supine Spinal Twist × 90s each; Legs Up the Wall × 3 min; Breathing Reset × 5 breaths`);

  const dayPlans = allDaySkeletons.slice(0, sessionCount);

  return `## MOBILITY ARCHITECTURE BRIEF — MANDATORY STRUCTURE

ACTIVE FOCUS: ${primaryFocus}
SESSION COUNT: ${sessionCount}-day mobility program
PROGRAM GOAL: ${goal ?? "Mobility — range restoration and positional control"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL BUILD CONSTRAINTS — NON-NEGOTIABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. THIS IS A MOBILITY PROGRAM — NOT light strength, NOT conditioning, NOT a stretch list.
   PROHIBITED as session anchors: barbell lifts, bench press, pull-ups, squats with heavy load,
   running, cardio, or any traditional strength/conditioning exercise.
   End-range loading (Jefferson Curl, Passive Hang, Deep Squat Hold) is only used in a
   supporting end-range control block — NEVER as the primary session anchor.

2. EXERCISE LANGUAGE — use mobility-specific terms:
   - Passive holds → "X seconds per side"
   - CARs → "X slow controlled reps each direction"
   - PAILs/RAILs → "X seconds at Y% contraction — 20% effort Week 1–2, 30% Week 3, 40% Week 4"
   - Flows → "X minutes continuous flow" or "X transitions"
   NEVER prescribe "sets of 10 reps" for mobility holds — time is the primary variable.

3. PASSIVE BEFORE ACTIVE — the non-negotiable sequence:
   Tissue prep → Passive holds → CARs → PAILs/RAILs → End-range loading → Integrated flows
   Never train active control in a range not yet passively available.

4. BREATHING IS A TOOL:
   - Exhale to deepen passive holds (inhale = brace, exhale = release and sink deeper)
   - Include a breathing anchor (90/90 Breathing Hold, Crocodile Breathing, or Box Breathing)
     in every session — it is NOT optional

5. JOINT PAIN PROTOCOL:
   - Work within pain-free range ONLY
   - Sharp/stabbing = stop immediately
   - Dull ache at end-range = acceptable, reduce range if >3/10
   - Never load into pain

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRESCRIBED SESSION STRUCTURE — FILL EXACTLY THIS SKELETON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dayPlans.join("\n\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED EXERCISE VOCABULARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hip: Hip CARs, 90/90 Stretch, 90/90 Active Posterior Lift, Couch Stretch, Frog Stretch, Pigeon Stretch, Adductor Rockback, Hip PAILs/RAILs, Hip Airplane, Deep Squat Hip Stretch, Spiderman Hip Stretch, Hip Flexor Kneeling Stretch
Shoulder: Shoulder CARs, Wall Slides, Sleeper Stretch, Band Shoulder Distraction, Doorway Chest Stretch, Cross-Body Shoulder Stretch, Overhead Lat Stretch, Shoulder PAILs/RAILs, Banded Pass-Through, Pec Minor Stretch
Thoracic: Thoracic Extension Foam Roll, Cat-Cow, Thread the Needle, Open Book Stretch, Quadruped Thoracic Rotation, Thoracic CARs, Thoracic CARs with Dowel, Side-Lying T-Spine Rotation, T-Spine Extension on Ball
Ankle: Wall Ankle Stretch, Banded Ankle Distraction, Ankle CARs, Ankle PAILs/RAILs, Calf Stretch Straight Knee, Calf Stretch Bent Knee, Heel Drop
Trunk: Dead Bug, Bird Dog, 90/90 Breathing Hold, Segmental Rolling, Hollow Body Hold, Pallof Press
End-Range: Jefferson Curl, Deep Squat Hold with Load, Passive Hang, Active Hang, Copenhagen Plank, Weighted 90/90 Posterior Lift
Breathing: Diaphragmatic Breathing Drill, Box Breathing, Crocodile Breathing, 90/90 Breathing Hold, Supine Breathing Reset, Exhale-Deepen Stretch Protocol
Tissue Prep: Foam Roll Quads/Thoracic/IT Band/Hamstring/Calf, Lacrosse Ball Glute/Pec Minor
Dynamic Flow: World's Greatest Stretch, Inchworm to Squat, Spiderman Flow, Hip 90/90 Transition Flow, Ground Control Flow
Recovery: Supine Figure-4 Hold, Supine Spinal Twist, Child's Pose, Supported Hip Flexor Hold, Legs Up the Wall`.trim();
}

// ─── Mobility Response Contract ───────────────────────────────────────────────

/**
 * Builds an explicit JSON response contract for mobility programs.
 * Injected into the system prompt so OpenAI knows the exact output structure.
 * Eliminates parse failures from ambiguous or strength-flavored responses.
 */
export function buildMobilityResponseContract(sessionCount: number): string {
  const exampleDays = Array.from({ length: Math.min(sessionCount, 2) }, (_, i) => {
    const dayNames = [
      "Day 1 — Hip Mobility (Passive Range)",
      "Day 2 — End-Range Control (PAILs/RAILs)",
      "Day 3 — Movement Quality + Integrated Flow",
      "Day 4 — Hip + Shoulder Deep Focus",
      "Day 5 — Stiffness Reduction + Dynamic Flow",
    ];
    return `    {
      "name": "${dayNames[i] ?? `Day ${i + 1} — Mobility Training`}",
      "exercises": [
        {
          "name": "Hip CARs",
          "sets": 1,
          "reps": "3 slow controlled reps each direction",
          "rest": "15-30s",
          "notes": "Diagnostic — note sticking points, map active vs passive range gap"
        },
        {
          "name": "90/90 Hip Stretch",
          "sets": 1,
          "reps": "60 seconds each side",
          "rest": "15s",
          "notes": "Bias internal rotation side if stiffer — exhale to deepen on each breath"
        },
        {
          "name": "Couch Stretch",
          "sets": 1,
          "reps": "60 seconds each side",
          "rest": "15s",
          "notes": "Hip flexor / anterior capsule — posterior pelvic tilt to deepen range"
        }
      ]
    }`;
  }).join(",\n");

  return `## MOBILITY PROGRAM — MANDATORY JSON RESPONSE CONTRACT

You MUST output the mobility program as a JSON code block in EXACTLY this format.
No prose. No markdown outside the JSON block. Output the JSON block first, then a 1–2 sentence confirmation.

\`\`\`json
{
  "programName": "Hip Mobility & Range Restoration",
  "programSummary": "Brief description of the mobility focus, primary joint targets, and progression intent for this program",
  "focusMode": "mobility",
  "days": [
${exampleDays}
  ]
}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION NAME RULES — NON-NEGOTIABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Day names MUST use mobility-native language. Approved formats:
  ✓ "Day 1 — Hip Mobility (Passive Range)"
  ✓ "Day 2 — End-Range Control (PAILs/RAILs)"
  ✓ "Day 3 — Movement Quality + Integrated Flow"
  ✓ "Day 4 — Thoracic Spine + Shoulder Release"
  ✓ "Day 5 — Stiffness Reduction + Dynamic Flow"
  ✓ "Day 1 — Recovery Flow (Parasympathetic Reset)"
  ✓ "Day 2 — Ankle Mobility (Dorsiflexion Focus)"

STRICTLY PROHIBITED session names (causes automatic rejection):
  ✗ Lower Strength
  ✗ Upper Push / Upper Pull
  ✗ Hypertrophy Day
  ✗ Push Day / Pull Day
  ✗ Leg Day
  ✗ Back & Biceps
  ✗ Chest & Triceps
  ✗ Squat Day / Bench Day / Deadlift Day

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXERCISE FIELD FORMAT RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Passive holds: reps = "X seconds each side" or "X seconds"
- CARs: reps = "X slow controlled reps each direction"
- PAILs/RAILs: reps = "X seconds at Y% contraction (20% effort Week 1-2)"
- Flows: reps = "X minutes continuous flow" or "X transitions each side"
- Breathing: reps = "X deep breaths" or "X rounds"
- Rest MUST be included for every exercise (use "15-30s" for holds, "continuous" for flows)
- notes MUST include a coaching cue specific to the mobility goal
- NEVER write "X reps" for a mobility hold — time is the primary variable
- programName MUST reference mobility (e.g., "Hip Mobility", "Thoracic + Shoulder Release")
- programSummary MUST describe mobility qualities (not "strength and conditioning")`;
}

// ─── Mobility Output Bleed Validator ──────────────────────────────────────────

const STRENGTH_BLEED_SESSION_PATTERNS_MOBILITY = /\b(lower strength|upper push|upper pull|push day|pull day|hypertrophy|leg day|back.bicep|chest.tricep|upper body strength|lower body strength|strength.day|compound strength|strength.focus|power.lifting|powerlifting|bench.day|squat.day|deadlift.day)\b/i;

const STRENGTH_BLEED_EXERCISE_PATTERNS_MOBILITY = /\b(barbell back squat|conventional deadlift|flat bench press|incline bench press|military press|barbell overhead press|barbell row|weighted pull.up|barbell hip thrust|power clean|hang clean|barbell curl|tricep pushdown)\b/i;

const MOBILITY_PROHIBITED_LANGUAGE_PATTERNS = /\b(sets? of \d+ reps?|hypertrophy|max.effort|1rm|training max|percentage of max)\b/i;

export interface MobilityBleedAuditResult {
  strengthTermsDetected: boolean;
  bleedingSessionNames: string[];
  bleedingExerciseNames: string[];
  prohibitedLanguageFound: boolean;
  repairApplied: boolean;
  rejected: boolean;
}

/**
 * Validates mobility program output for strength contamination.
 * Checks session names, exercise names, and rep field language.
 */
export function validateMobilityOutputForBleed(
  structuredData: {
    programName?: string;
    days?: Array<{ name?: string; exercises?: Array<{ name: string; reps?: string; notes?: string }> }>;
  },
): MobilityBleedAuditResult {
  const bleedingSessionNames: string[] = [];
  const bleedingExerciseNames: string[] = [];
  let prohibitedLanguageFound = false;

  if (structuredData.days) {
    for (const day of structuredData.days) {
      if (day.name && STRENGTH_BLEED_SESSION_PATTERNS_MOBILITY.test(day.name)) {
        bleedingSessionNames.push(day.name);
      }
      if (day.exercises) {
        for (const ex of day.exercises) {
          if (ex.name && STRENGTH_BLEED_EXERCISE_PATTERNS_MOBILITY.test(ex.name)) {
            bleedingExerciseNames.push(ex.name);
          }
          if (ex.reps && MOBILITY_PROHIBITED_LANGUAGE_PATTERNS.test(ex.reps)) {
            prohibitedLanguageFound = true;
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
    prohibitedLanguageFound,
    repairApplied: false,
    rejected: false,
  };
}

// ─── Mobility Output Repair Layer ─────────────────────────────────────────────

type RepairableMobilityProgram = {
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

const MOBILITY_SESSION_NAME_MAP: Record<string, string> = {
  "lower strength": "Hip Mobility + End-Range Control",
  "upper push": "Shoulder Mobility + Thoracic Release",
  "upper pull": "Thoracic Spine + Shoulder Flow",
  "push day": "Hip Mobility (Passive Range)",
  "pull day": "Thoracic Mobility + Breathing Integration",
  "hypertrophy": "End-Range Control (PAILs/RAILs)",
  "leg day": "Lower Body Mobility Flow",
  "lower body strength": "Hip + Ankle Mobility",
  "upper body strength": "Shoulder + Thoracic Release",
  "strength day": "Full-Body Mobility — Range Restoration",
  "bench day": "Shoulder Mobility + Pec Release",
  "squat day": "Hip + Ankle Mobility Flow",
  "deadlift day": "Posterior Chain Mobility",
};

const MOBILITY_DEFAULT_REST_BY_EXERCISE_TYPE: Record<string, string> = {
  cars: "15-30s",
  pails: "30s",
  rails: "30s",
  hold: "15-30s",
  stretch: "15s",
  flow: "continuous",
  breathing: "30s",
  foam: "15s",
  roll: "15s",
  hang: "60s",
  press: "30s",
  squat: "30s",
  curl: "30s",
  bird: "15s",
  dead: "15s",
  plank: "30s",
};

/**
 * Repairs a mobility output that is "close but imperfect":
 * - Replaces strength-flavored session names with mobility-native names
 * - Fills missing rest fields from mobility defaults
 * - Repairs weak/generic program titles
 * - Stamps focusMode = "mobility"
 * - Stamps programSummary if missing or strength-flavored
 *
 * Repair preserves real exercise content — only fixes labeling and metadata.
 */
export function repairMobilityOutput(
  program: RepairableMobilityProgram,
  bleedResult: MobilityBleedAuditResult,
): { repaired: RepairableMobilityProgram; repairsApplied: string[] } {
  const repaired: RepairableMobilityProgram = JSON.parse(JSON.stringify(program)) as RepairableMobilityProgram;
  const repairsApplied: string[] = [];

  // ── 1. Stamp focusMode ──────────────────────────────────────────────────────
  if (!repaired.focusMode || repaired.focusMode !== "mobility") {
    repaired.focusMode = "mobility";
    repairsApplied.push("stamped_focusMode=mobility");
  }

  // ── 2. Repair weak/generic program title ───────────────────────────────────
  if (!repaired.programName || /strength|hypertrophy|muscle|lifting|powerlifting/i.test(repaired.programName)) {
    repaired.programName = "Mobility — Range Restoration & Positional Control";
    repairsApplied.push("repaired_programName");
  }

  // ── 3. Repair missing or strength-flavored program summary ─────────────────
  if (!repaired.programSummary || /strength|hypertrophy|muscle|lifting/i.test(repaired.programSummary)) {
    repaired.programSummary = "Progressive mobility program — passive range restoration, CARs, PAILs/RAILs end-range control, and breathing-integrated joint preparation built on tissue-length and positional control principles.";
    repairsApplied.push("repaired_programSummary");
  }

  // ── 4. Repair strength-contaminated session names ──────────────────────────
  if (repaired.days) {
    const mobilitySessionNames = [
      "Day 1 — Hip Mobility (Passive Range)",
      "Day 2 — End-Range Control (PAILs/RAILs)",
      "Day 3 — Movement Quality + Integrated Flow",
      "Day 4 — Hip + Shoulder Deep Focus",
      "Day 5 — Stiffness Reduction + Dynamic Flow",
    ];

    repaired.days = repaired.days.map((day, idx) => {
      if (!day.name) {
        const repairName = mobilitySessionNames[idx] ?? `Day ${idx + 1} — Mobility Training`;
        repairsApplied.push(`repaired_missing_session_name[day${idx + 1}]`);
        return { ...day, name: repairName };
      }
      const lowerName = day.name.toLowerCase();
      let repairedName: string | undefined;
      for (const [pattern, replacement] of Object.entries(MOBILITY_SESSION_NAME_MAP)) {
        if (lowerName.includes(pattern)) {
          repairedName = replacement;
          break;
        }
      }
      if (repairedName) {
        repairsApplied.push(`repaired_session_name[day${idx + 1}]: "${day.name}" → "${repairedName}"`);
        return { ...day, name: repairedName };
      }
      return day;
    });
  }

  // ── 5. Fill missing rest fields from mobility defaults ─────────────────────
  if (repaired.days) {
    for (let d = 0; d < repaired.days.length; d++) {
      const day = repaired.days[d];
      if (day.exercises) {
        for (let e = 0; e < day.exercises.length; e++) {
          const ex = day.exercises[e];
          if (!ex.rest || ex.rest === "" || ex.rest === "—") {
            const lowerName = ex.name.toLowerCase();
            let defaultRest = "15-30s";
            for (const [keyword, rest] of Object.entries(MOBILITY_DEFAULT_REST_BY_EXERCISE_TYPE)) {
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

// ─── Mobility Generation Failure Classifier ───────────────────────────────────

export type MobilityFailureType =
  | "prompt_failure"
  | "parse_failure"
  | "validation_failure"
  | "bleed_failure"
  | "structure_failure"
  | "unknown_failure";

export interface MobilityFailureClassification {
  type: MobilityFailureType;
  description: string;
  retryable: boolean;
}

/**
 * Classifies the root cause of a mobility generation failure.
 * Used for targeted diagnostics and retry strategy.
 */
export function classifyMobilityGenerationFailure(context: {
  openAICallSucceeded: boolean;
  rawContentAvailable: boolean;
  parsedJsonAvailable: boolean;
  hasDays: boolean;
  bleedDetected: boolean;
  structureComplete: boolean;
}): MobilityFailureClassification {
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
    return {
      type: "parse_failure",
      description: "OpenAI did not output a valid JSON block — mobility response contract was ignored",
      retryable: true,
    };
  }
  if (!context.hasDays) {
    return {
      type: "validation_failure",
      description: "JSON parsed but mobility program has no days array — incomplete structure",
      retryable: true,
    };
  }
  if (context.bleedDetected) {
    return {
      type: "bleed_failure",
      description: "Mobility program contains strength-contaminated session names or exercises",
      retryable: true,
    };
  }
  if (!context.structureComplete) {
    return {
      type: "structure_failure",
      description: "Mobility program structure is incomplete — missing required fields",
      retryable: true,
    };
  }
  return {
    type: "unknown_failure",
    description: "Mobility generation failed for an unclassified reason",
    retryable: true,
  };
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
