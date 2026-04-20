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
import {
  selectBestMobilityExerciseForSlot,
  buildMobilityLibraryCoverageAudit,
  type MobilitySlotType,
  type MobilityWeekRole,
} from "./mobility-library";

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

// ─── Startup Library Coverage Audit ──────────────────────────────────────────

const _libAudit = buildMobilityLibraryCoverageAudit();
const _weakFamiliesCount = _libAudit.weakFamilies.length;

console.log("[MobilityLibraryCoverageAudit]", JSON.stringify({
  totalExercises: _libAudit.totalExercises,
  familyCoverage: _libAudit.familyCoverage,
  qualityCoverage: _libAudit.qualityCoverage,
  slotCoverage: _libAudit.slotCoverage,
  weekRoleCoverage: _libAudit.weekRoleCoverage,
  clusterDepth: _libAudit.clusterDepth,
  weakFamilies: _libAudit.weakFamilies,
  repeatRiskScore: _libAudit.repeatRiskScore,
  neuralDemandDistribution: _libAudit.neuralDemandDistribution,
  fatigueCostDistribution: _libAudit.fatigueCostDistribution,
  libraryStatus: _weakFamiliesCount === 0 ? "FULL_COVERAGE" : `WEAK_FAMILIES:${_libAudit.weakFamilies.join(",")}`,
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

  // ── Compact day rotation labels (replace verbose block-by-block skeletons) ──
  const allDayLabels: string[] = [];

  // Day 1 — condition-specific, compact label
  if (isHip) {
    allDayLabels.push(`Day 1 — Hip Mobility (Passive Range): Tissue prep (Foam Roll Quads/Glute/IT Band) → 90/90 Breathing Reset → Hip CARs 3× each (diagnostic) → 90/90 Stretch 60s + Couch Stretch 60s + Frog Stretch 60–90s + Adductor Rockback 60s → 90/90 Active Posterior Lift + Hip Airplane (active control) → Supine Figure-4/Spinal Twist (close)`);
  } else if (isShoulder) {
    allDayLabels.push(`Day 1 — Shoulder Mobility (T-Spine First): Tissue prep (Thoracic Foam Roll/Pec Minor Release) → Cat-Cow + Thread the Needle + Open Book (T-spine prep) → Shoulder CARs 3× each (diagnostic) → Sleeper Stretch 60–90s + Doorway Chest Stretch 60s + Overhead Lat Stretch 60s → Wall Slides + Band Shoulder Distraction (active control) → Child's Pose/Breathing Reset (close)`);
  } else if (isThoracic) {
    allDayLabels.push(`Day 1 — Thoracic Spine (Extension Before Rotation): Tissue prep (Thoracic Foam Roll/T-Spine Ball) → Box Breathing reset → Cat-Cow + Thoracic CARs (extension) → Open Book 60s + Thread the Needle 60s + Quadruped Rotation 60s + Side-Lying T-Spine Rotation 60s → Shoulder CARs + World's Greatest Stretch (integration)`);
  } else if (isAnkle) {
    allDayLabels.push(`Day 1 — Ankle Mobility (Dorsiflexion Focus): Tissue prep (Calf/Ham Foam Roll) → Diaphragmatic Breathing reset → Ankle CARs 3× each (diagnostic) → Wall Ankle Stretch 60s + Banded Ankle Distraction 60–90s + Calf Stretch Straight/Bent Knee 60s each + Heel Drop 3×10 → Ankle PAILs/RAILs 2 rounds (20% × 10s) → Deep Squat + Spiderman integration`);
  } else if (isRecovery || isPain) {
    allDayLabels.push(`Day 1 — Recovery Flow (Parasympathetic Reset): Crocodile Breathing 6 breaths + Box Breathing 3 rounds + 90/90 Breathing Hold → Tissue release (Foam Roll Quads/Thoracic/Glute) → Yin holds: Supine Figure-4 2–3 min each + Supported Hip Flexor 90s + Child's Pose 2 min + Legs Up the Wall 3–5 min → World's Greatest Stretch + Cat-Cow flow (gentle) → Supine Breathing Reset (exit)`);
  } else {
    allDayLabels.push(`Day 1 — Full-Body Mobility (Passive Range): Tissue prep (Thoracic Foam Roll/Foam Roll Quads/Lacrosse Glute) → 90/90 Breathing Reset → Hip CARs + 90/90 Stretch 60s + Couch Stretch 60s; Shoulder CARs + Sleeper Stretch 60s + Wall Slides 10×; Thoracic Foam Roll + Cat-Cow + Thread the Needle 60s → 90/90 Active Posterior Lift + Bird Dog (active control) → Spinal Twist + Child's Pose (close)`);
  }

  // Day 2 — always PAILs/RAILs emphasis
  allDayLabels.push(`Day 2 — End-Range Control (PAILs/RAILs + CARs): Tissue prep (primary limiting region, 60s) → Box Breathing reset → Hip/Shoulder/Ankle CARs diagnostic (3× each, note passive vs active gap) → PAILs/RAILs primary joint: passive hold 60s → 20% contraction × 10s → release → RAILs 10s (2 rounds each side) → End-range loading: Jefferson Curl 3×5 + Passive Hang 3×30s + Deep Squat Hold 3×30s → Supine Figure-4 + Breathing Reset (close)`);

  // Day 3 — movement quality + integrated flows
  allDayLabels.push(`Day 3 — Movement Quality + Integrated Flow: Tissue prep (Quads + Thoracic Foam Roll) → Diaphragmatic Breathing + Dead Bug 3×8 + Bird Dog 3×8 → Primary joint: CARs 3× + passive hold 60s + PAILs 10s (×2); Secondary joint: CARs 3× + hold 60s → World's Greatest Stretch 5× each + Spiderman Flow 5× each + Inchworm 8× + 90/90 Transition Flow 5× → Supine Spinal Twist 90s + Supported Hip Flexor 90s + Child's Pose (close)`);

  // Day 4
  allDayLabels.push(`Day 4 — Hip + Shoulder Deep Focus: Tissue prep (Lacrosse Glute/Pec Minor/Thoracic Foam Roll) → 90/90 Breathing reset → Pigeon 90s + Frog 90s + Adductor Rockback 60s + Hip PAILs/RAILs 2 rounds 30% contraction + Hip Airplane 3×5 → Open Book 90s + Banded Pass-Through 3×10 + Overhead Lat 60s + Shoulder PAILs/RAILs 2 rounds 30% → Active Hang 3×30s + Deep Squat Hold 60s + Supine Figure-4 (close)`);

  // Day 5
  allDayLabels.push(`Day 5 — Stiffness Reduction + Dynamic Flow: Tissue prep (IT Band/Ham/Calf Foam Roll) → Contract-relax Ham 60s each + Quad 60s each → Dynamic flow: March to Spiderman 8× + World's Greatest Stretch 5× + Inchworm 8× + Animal Flow 5 min → Yin holds: Couch Stretch 90s + 90/90 Stretch 90s + Sleeper 90s + Child's Pose 90s → Legs Up the Wall 3 min + Breathing Reset (exit)`);

  const dayPlans = allDayLabels.slice(0, sessionCount);

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

// ─── Mobility Session Minimum Depth Rules ─────────────────────────────────────

/**
 * TASK 1 — Minimum session depth by mobility session type.
 * Mirrors SPEED_SESSION_MINIMUM_DEPTH from the speed engine.
 */
export const MOBILITY_SESSION_MINIMUM_DEPTH: Record<string, { min: number; target: number }> = {
  recovery_flow:          { min: 4, target: 5 },
  general_mobility:       { min: 5, target: 6 },
  joint_specific:         { min: 5, target: 6 },
  posture_desk_reset:     { min: 5, target: 6 },
  return_from_pain:       { min: 4, target: 5 },
  performance_mobility:   { min: 5, target: 6 },
};

// ─── Mobility Session Slot Template ───────────────────────────────────────────

/**
 * TASK 2 — The canonical 6-slot progression template for every mobility session.
 * Sessions must FEEL like a flow, not a checklist.
 * Slot order is non-negotiable — each slot prepares the body for the next.
 */
export const MOBILITY_SESSION_SLOT_TEMPLATE = [
  {
    slot: 1,
    label: "Tissue Prep / Soft Activation",
    role: "tissue_prep",
    required: true,
    description: "Foam rolling, soft tissue release, one breathing anchor. Opens the nervous system entry signal — never skipped.",
  },
  {
    slot: 2,
    label: "Controlled Mobility (Slow Range Work)",
    role: "passive_holds",
    required: true,
    description: "Passive holds, CARs, sustained end-range positions. The core range restoration block. Time is the primary variable — not reps.",
  },
  {
    slot: 3,
    label: "Dynamic Mobility / Movement Integration",
    role: "dynamic_flow",
    required: false,
    description: "Continuous movement flows: World's Greatest Stretch, Spiderman Flow, 90/90 Transitions. Integrates range into coordinated movement.",
  },
  {
    slot: 4,
    label: "Joint-Specific Focus Work",
    role: "active_control",
    required: true,
    description: "Deep attention to the primary limiting joint — PAILs/RAILs, CARs, active end-range holds. This is where ownership is built.",
  },
  {
    slot: 5,
    label: "Stability / Control (End-Range or Isometric)",
    role: "active_control",
    required: false,
    description: "End-range isometrics, Bird Dog, Dead Bug, Pallof Press. Trains the nervous system to stabilize at the limit of available range.",
  },
  {
    slot: 6,
    label: "Flow / Breathing / Recovery Finisher",
    role: "recovery_exit",
    required: true,
    description: "Parasympathetic exit — recovery holds, breathing reset, final integration. CNS downregulation is part of the adaptation signal.",
  },
] as const;

// ─── Mobility Drill Bank ───────────────────────────────────────────────────────

/**
 * TASK 4 — Typed drill banks used by expandMobilitySessionIfTooThin().
 * Each category maps to a slot role and session goal.
 */
export const MOBILITY_DRILL_BANK: Record<string, Array<{ name: string; reps: string; notes: string; rest: string; joint?: string }>> = {
  tissue_prep: [
    { name: "Foam Roll Quads", reps: "60 seconds each side", notes: "Move slowly and with control — pause on tight spots and breathe through the position", rest: "15s", joint: "hip" },
    { name: "Thoracic Extension Foam Roll", reps: "60–90 seconds (T4–T10)", notes: "Focus on range quality, not intensity — let gravity do the work", rest: "15s", joint: "spine" },
    { name: "Lacrosse Ball Glute Release", reps: "60 seconds each side", notes: "Explore end range without forcing — breathe through the position", rest: "15s", joint: "hip" },
    { name: "Calf Foam Roll", reps: "60 seconds each side", notes: "Stay relaxed but controlled — pause on dense areas", rest: "15s", joint: "ankle" },
    { name: "Hamstring Foam Roll", reps: "60 seconds each side", notes: "Move slowly and with control — let the tissue release between passes", rest: "15s", joint: "hip" },
    { name: "Lacrosse Ball Pec Minor", reps: "60 seconds each side", notes: "Explore end range without forcing — breathe into the restriction", rest: "15s", joint: "shoulder" },
    { name: "IT Band Foam Roll", reps: "60 seconds each side", notes: "Stay relaxed but controlled — pressure without aggressive forcing", rest: "15s", joint: "hip" },
  ],
  controlled_mobility: [
    { name: "90/90 Hip Stretch", reps: "60 seconds each side", notes: "Exhale to deepen — explore end range without forcing", rest: "15s", joint: "hip" },
    { name: "Couch Stretch", reps: "60 seconds each side", notes: "Posterior pelvic tilt to open hip flexor — breathe through the position", rest: "15s", joint: "hip" },
    { name: "Frog Stretch", reps: "60–90 seconds", notes: "Stay relaxed but controlled — exhale slowly to find more range", rest: "15s", joint: "hip" },
    { name: "Thread the Needle", reps: "60 seconds each side", notes: "Focus on range quality, not intensity — let the shoulder fall naturally", rest: "15s", joint: "spine" },
    { name: "Open Book Stretch", reps: "60 seconds each side", notes: "Move slowly and with control — breathe through the rotation", rest: "15s", joint: "spine" },
    { name: "Sleeper Stretch", reps: "60–90 seconds each side", notes: "Explore end range without forcing — differentiate muscle tension from joint pain", rest: "15s", joint: "shoulder" },
    { name: "Wall Ankle Stretch", reps: "60 seconds each side", notes: "Knee tracks over third toe — breathe through the position", rest: "15s", joint: "ankle" },
    { name: "Pigeon Stretch", reps: "90 seconds each side", notes: "Stay relaxed but controlled — exhale to sink deeper into the position", rest: "15s", joint: "hip" },
    { name: "Adductor Rockback", reps: "60 seconds each side", notes: "Move slowly and with control — feel the inner thigh lengthen on each exhale", rest: "15s", joint: "hip" },
    { name: "Overhead Lat Stretch", reps: "60 seconds each side", notes: "Focus on range quality — breathe through the position", rest: "15s", joint: "shoulder" },
    { name: "Cat-Cow", reps: "10 slow controlled reps", notes: "Move slowly and with control — full spinal flexion and extension each rep", rest: "15s", joint: "spine" },
    { name: "Calf Stretch Straight Knee", reps: "60 seconds each side", notes: "Targets gastrocnemius — breathe through the position", rest: "15s", joint: "ankle" },
    { name: "Calf Stretch Bent Knee", reps: "60 seconds each side", notes: "Targets soleus — explore end range without forcing", rest: "15s", joint: "ankle" },
  ],
  dynamic_mobility: [
    { name: "World's Greatest Stretch", reps: "5 slow transitions each side", notes: "Move slowly and with control — full thoracic rotation at the top", rest: "continuous", joint: "hip" },
    { name: "Spiderman Flow", reps: "5 each side", notes: "Focus on range quality — hip opens fully on each rep", rest: "continuous", joint: "hip" },
    { name: "Inchworm to Squat", reps: "8 slow reps", notes: "Move slowly and with control — pause at full hamstring stretch each rep", rest: "continuous", joint: "hip" },
    { name: "Hip 90/90 Transition Flow", reps: "5 full transitions", notes: "Stay relaxed but controlled — smooth transition, no momentum", rest: "continuous", joint: "hip" },
    { name: "T-Spine Rotation Flow", reps: "10 each side", notes: "Move slowly and with control — breathe through the rotation", rest: "continuous", joint: "spine" },
    { name: "Quadruped Thoracic Rotation", reps: "60 seconds each side", notes: "Focus on range quality — the spine leads, not the arm", rest: "15s", joint: "spine" },
  ],
  joint_focus: [
    { name: "Hip CARs", reps: "3 slow full-circle reps each direction", notes: "Move slowly and with control — note where the range breaks down", rest: "15-30s", joint: "hip" },
    { name: "Shoulder CARs", reps: "3 slow full-circle reps each direction", notes: "Move slowly and with control — diagnostic, note impingement positions", rest: "15-30s", joint: "shoulder" },
    { name: "Ankle CARs", reps: "3 slow full-circle reps each direction", notes: "Explore end range without forcing — note where dorsiflexion limits", rest: "15-30s", joint: "ankle" },
    { name: "Thoracic CARs", reps: "3 each direction", notes: "Move slowly and with control — isolate thoracic from lumbar", rest: "15-30s", joint: "spine" },
    { name: "Hip PAILs/RAILs", reps: "10 seconds at 20% contraction each side", notes: "Move slowly and with control — never force contraction into pain", rest: "30s", joint: "hip" },
    { name: "Shoulder PAILs/RAILs", reps: "10 seconds at 20% contraction each side", notes: "Explore end range without forcing — light effort, not maximal", rest: "30s", joint: "shoulder" },
    { name: "Ankle PAILs/RAILs", reps: "10 seconds at 20% contraction each side", notes: "Stay relaxed but controlled — feel the joint space open", rest: "30s", joint: "ankle" },
    { name: "Doorway Chest Stretch", reps: "60 seconds each side", notes: "Breathe through the position — exhale deepens the anterior capsule release", rest: "15s", joint: "shoulder" },
    { name: "Banded Ankle Distraction", reps: "60–90 seconds each side", notes: "Focus on range quality — joint capsule release takes sustained hold", rest: "15s", joint: "ankle" },
  ],
  stability: [
    { name: "Bird Dog", reps: "3 × 8 slow reps each side", notes: "Stay relaxed but controlled — no lumbar extension compensation", rest: "15s" },
    { name: "Dead Bug", reps: "3 × 8 slow reps each side", notes: "Move slowly and with control — lower back stays in contact with floor", rest: "15s" },
    { name: "90/90 Breathing Hold", reps: "5 deep breath cycles", notes: "Breathe through the position — exhale fully to engage deep core", rest: "30s" },
    { name: "Hip Airplane", reps: "3 × 5 each side", notes: "Move slowly and with control — this trains active hip IR/ER control", rest: "15s", joint: "hip" },
    { name: "90/90 Active Posterior Lift", reps: "3 × 5 each side", notes: "Focus on range quality — active lift reveals nervous system ownership of range", rest: "15s", joint: "hip" },
    { name: "Hollow Body Hold", reps: "3 × 20 seconds", notes: "Stay relaxed but controlled — posterior pelvic tilt maintained throughout", rest: "30s" },
  ],
  breathing: [
    { name: "90/90 Breathing Hold", reps: "5 deep breath cycles", notes: "Breathe through the position — this is your nervous system reset", rest: "30s" },
    { name: "Crocodile Breathing", reps: "6 deep breaths prone", notes: "Move slowly and with control — feel the 360-degree rib expansion on each inhale", rest: "30s" },
    { name: "Box Breathing", reps: "3 rounds (4-4-4-4)", notes: "Stay relaxed but controlled — parasympathetic reset before the recovery exit", rest: "30s" },
    { name: "Supine Breathing Reset", reps: "5 deep breaths", notes: "Focus on range quality — exhale fully, let the body sink into the ground", rest: "30s" },
    { name: "Diaphragmatic Breathing Drill", reps: "5 deep breaths", notes: "Breathe through the position — belly rises first, then rib cage", rest: "30s" },
    { name: "Child's Pose", reps: "90 seconds", notes: "Stay relaxed but controlled — breathe into the back body on each inhale", rest: "15s" },
    { name: "Supine Spinal Twist", reps: "90 seconds each side", notes: "Explore end range without forcing — exhale to deepen the rotation gently", rest: "15s" },
    { name: "Legs Up the Wall", reps: "3–5 minutes", notes: "Move slowly and with control — parasympathetic restoration, no effort required", rest: "none" },
  ],
};

// ─── Detect Mobility Session Type ─────────────────────────────────────────────

function detectMobilitySessionType(sessionName: string): string {
  const lower = sessionName.toLowerCase();
  if (/recover|restor|relax|parasympath|yin/.test(lower)) return "recovery_flow";
  if (/pain|reentry|re-entry|rehab|return/.test(lower)) return "return_from_pain";
  if (/posture|desk|reset|office/.test(lower)) return "posture_desk_reset";
  if (/performance|athletic|sport/.test(lower)) return "performance_mobility";
  if (/hip|shoulder|ankle|spine|thoracic|t-spine|joint/.test(lower)) return "joint_specific";
  return "general_mobility";
}

// ─── expandMobilitySessionIfTooThin ───────────────────────────────────────────

/**
 * Checks if a mobility session meets minimum depth requirements.
 * If not, fills missing slots using library-driven scoring via
 * scoreMobilityCandidateForSlot() — preserving session identity and
 * avoiding repetition.
 *
 * Slot fill order (canonical phase sequence):
 *   breathing → prep → primary_mobility → control → integration → flow
 *
 * Selection is week-role aware: W1 avoids PAILs/isometrics, W4 stays
 * parasympathetic-focused. Exercises are scored against target joint,
 * neural demand, fatigue cost, and prior exposure.
 *
 * Never adds random stretches — all additions are library-validated.
 */
export function expandMobilitySessionIfTooThin(
  session: {
    name?: string;
    exercises?: Array<{ name: string; sets?: number; reps?: string; rest?: string; notes?: string }>;
  },
  sessionType?: string,
  weekNumber?: 1 | 2 | 3 | 4,
  exposedExerciseNames?: Set<string>,
): { expanded: typeof session; expansionsApplied: string[] } {
  const type = sessionType ?? detectMobilitySessionType(session.name ?? "");
  const depthRule = MOBILITY_SESSION_MINIMUM_DEPTH[type] ?? MOBILITY_SESSION_MINIMUM_DEPTH.general_mobility;
  const exercises = [...(session.exercises ?? [])];
  const expansionsApplied: string[] = [];

  if (exercises.length >= depthRule.min) {
    return { expanded: session, expansionsApplied };
  }

  console.log(`[MobilityDepthExpander] Session "${session.name ?? "unnamed"}" has ${exercises.length} exercises — minimum is ${depthRule.min} for type "${type}". Expanding via library scoring...`);

  const existingNames = new Set(exercises.map(e => e.name.toLowerCase()));

  // Map week number to week role for library scoring
  const week = weekNumber ?? 1;
  const weekRole: MobilityWeekRole =
    week === 1 ? "establish"
    : week === 2 ? "build"
    : week === 3 ? "intensify"
    : "deload";

  // Detect primary joint from session name to bias exercise selection
  const lower = (session.name ?? "").toLowerCase();
  const targetJoint: MobilityJoint | undefined =
    /hip|groin|pigeon|frog|adductor/.test(lower) ? "hip"
    : /shoulder|pec|sleeper|overhead/.test(lower) ? "shoulder"
    : /thoracic|t.spine|spine|rotation/.test(lower) ? "spine"
    : /ankle|calf|dorsiflexion/.test(lower) ? "ankle"
    : /breath|nervous|reset/.test(lower) ? "breathing"
    : undefined;

  // Canonical slot fill order — mirrors phase sequence
  const FILL_SLOTS: MobilitySlotType[] = [
    "breathing",
    "prep",
    "primary_mobility",
    "control",
    "integration",
    "flow",
  ];

  for (const slotType of FILL_SLOTS) {
    if (exercises.length >= depthRule.target) break;

    const best = selectBestMobilityExerciseForSlot({
      slotType,
      targetJoint,
      weekRole,
      existingExerciseNames: existingNames,
      exposedExerciseNames,
    });

    if (!best) continue;

    exercises.push({
      name: best.name,
      sets: 1,
      reps: best.reps,
      rest: best.rest,
      notes: best.notes,
    });
    existingNames.add(best.name.toLowerCase());
    expansionsApplied.push(
      `[MobilityDepthExpander] Added "${best.name}" (slot=${slotType}, family=${best.family}, joint=${best.primaryJoint}, weekRole=${weekRole}, type=${type})`
    );
  }

  console.log(`[MobilityDepthExpander] Expansion complete — session now has ${exercises.length} exercises. Applied: ${expansionsApplied.length} additions`);

  return { expanded: { ...session, exercises }, expansionsApplied };
}

// ─── sanitizeAllMobilityNotes ──────────────────────────────────────────────────

/**
 * TASK 5 — Replaces strength/speed contaminated language in exercise notes
 * with mobility-native coaching cues.
 *
 * Targets: load, weight, sets to failure, explosive, max effort, power output.
 */
export function sanitizeAllMobilityNotes(
  exercises: Array<{ name: string; sets?: number; reps?: string; rest?: string; notes?: string }>,
): { sanitized: typeof exercises; replacements: string[] } {
  const replacements: string[] = [];

  const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
    {
      pattern: /\b(add|increase|progressive|heavier)\s+(load|weight|loading)\b/gi,
      replacement: "focus on range quality, not intensity",
      label: "load_language",
    },
    {
      pattern: /\b(sets?\s+to\s+failure|train\s+to\s+failure|until\s+failure)\b/gi,
      replacement: "explore end range without forcing",
      label: "failure_language",
    },
    {
      pattern: /\b(explosive|explosively|maximum\s+speed|max\s+speed)\b/gi,
      replacement: "move slowly and with control",
      label: "explosive_language",
    },
    {
      pattern: /\b(max\s+effort|maximum\s+effort|all.out\s+effort)\b/gi,
      replacement: "breathe through the position",
      label: "max_effort_language",
    },
    {
      pattern: /\b(power\s+output|power\s+production|rate\s+of\s+force)\b/gi,
      replacement: "stay relaxed but controlled",
      label: "power_language",
    },
    {
      pattern: /\b(weight|load|dumbbell|barbell|kettle\s*bell)\s+(press|curl|row|squat|deadlift|thrust)\b/gi,
      replacement: "focus on range quality, not intensity",
      label: "strength_exercise_language",
    },
    {
      pattern: /\b(1rm|one\s+rep\s+max|training\s+max|percentage\s+of\s+max|% of max)\b/gi,
      replacement: "breathe through the position",
      label: "1rm_language",
    },
    {
      pattern: /\b(hypertrophy|muscle\s+size|muscle\s+building|anabolic)\b/gi,
      replacement: "focus on range quality, not intensity",
      label: "hypertrophy_language",
    },
  ];

  const sanitized = exercises.map(ex => {
    if (!ex.notes) return ex;
    let notes = ex.notes;
    for (const { pattern, replacement, label } of SANITIZE_PATTERNS) {
      if (pattern.test(notes)) {
        notes = notes.replace(pattern, replacement);
        replacements.push(`sanitized[${ex.name}]: ${label} → "${replacement}"`);
        pattern.lastIndex = 0;
      }
    }
    return notes !== ex.notes ? { ...ex, notes } : ex;
  });

  return { sanitized, replacements };
}

// ─── scoreMobilitySessionDepth ─────────────────────────────────────────────────

/**
 * TASK 6 — Scores a mobility session on depth, structure, and cleanliness.
 *
 * Score dimensions (100 total):
 *   - Depth requirement met          30 pts
 *   - Prep included                  15 pts
 *   - Mobility progression present   20 pts
 *   - Joint-specific clarity         15 pts
 *   - Stability/control present      10 pts
 *   - No strength/speed bleed        10 pts
 *
 * Pass threshold: 70
 */
export interface MobilitySessionDepthScore {
  total: number;
  passed: boolean;
  breakdown: {
    depthMet: number;
    prepIncluded: number;
    mobilityProgression: number;
    jointSpecificClarity: number;
    stabilityPresent: number;
    noBleed: number;
  };
  details: string[];
}

export function scoreMobilitySessionDepth(
  session: {
    name?: string;
    exercises?: Array<{ name: string; reps?: string; notes?: string }>;
  },
  sessionType?: string,
): MobilitySessionDepthScore {
  const type = sessionType ?? detectMobilitySessionType(session.name ?? "");
  const depthRule = MOBILITY_SESSION_MINIMUM_DEPTH[type] ?? MOBILITY_SESSION_MINIMUM_DEPTH.general_mobility;
  const exercises = session.exercises ?? [];
  const details: string[] = [];
  const breakdown = {
    depthMet: 0,
    prepIncluded: 0,
    mobilityProgression: 0,
    jointSpecificClarity: 0,
    stabilityPresent: 0,
    noBleed: 0,
  };

  // 1. Depth requirement met (30 pts)
  if (exercises.length >= depthRule.min) {
    breakdown.depthMet = 30;
    details.push(`✓ Depth met: ${exercises.length} exercises (min ${depthRule.min})`);
  } else {
    details.push(`✗ Depth NOT met: ${exercises.length} exercises (min ${depthRule.min}) — missing ${depthRule.min - exercises.length}`);
  }

  // 2. Prep included (15 pts) — tissue prep or breathing drill at start
  const PREP_TERMS = /foam\s*roll|lacrosse|tissue|calf\s*roll|hamstring\s*roll|breathing|crocodile|box\s*breath|diaphragm/i;
  const hasPrepExercise = exercises.slice(0, 2).some(e => PREP_TERMS.test(e.name));
  if (hasPrepExercise) {
    breakdown.prepIncluded = 15;
    details.push("✓ Prep included in opening position");
  } else {
    details.push("✗ No tissue prep or breathing drill detected in first 2 slots");
  }

  // 3. Mobility progression present (20 pts) — passive hold → active/control sequence exists
  const PASSIVE_TERMS = /stretch|hold|pigeon|couch|frog|90.90|sleeper|thread|open\s*book|cat.cow/i;
  const ACTIVE_TERMS = /cars|pails|rails|active|airplane|lift|control|flow|inchworm|spiderman|world/i;
  const hasPassive = exercises.some(e => PASSIVE_TERMS.test(e.name));
  const hasActive = exercises.some(e => ACTIVE_TERMS.test(e.name));
  if (hasPassive && hasActive) {
    breakdown.mobilityProgression = 20;
    details.push("✓ Progression present: passive range work + active/CARs work both detected");
  } else if (hasPassive || hasActive) {
    breakdown.mobilityProgression = 10;
    details.push("~ Partial progression: only passive OR active detected — session missing full arc");
  } else {
    details.push("✗ No mobility progression detected — session has neither passive holds nor active CARs/flows");
  }

  // 4. Joint-specific clarity (15 pts) — session targets a clear joint or region
  const JOINT_TERMS = /hip|shoulder|spine|thoracic|ankle|calf|t.spine|pigeon|couch|sleeper|ankle|frog|adductor|pec|doorway/i;
  const jointCount = exercises.filter(e => JOINT_TERMS.test(e.name)).length;
  if (jointCount >= 3) {
    breakdown.jointSpecificClarity = 15;
    details.push(`✓ Joint-specific clarity: ${jointCount} exercises target a clear joint or region`);
  } else if (jointCount >= 1) {
    breakdown.jointSpecificClarity = 8;
    details.push(`~ Weak joint clarity: only ${jointCount} exercises with clear joint targeting`);
  } else {
    details.push("✗ No joint-specific targeting detected — session feels generic");
  }

  // 5. Stability/control present (10 pts)
  const STABILITY_TERMS = /bird\s*dog|dead\s*bug|pallof|bird.dog|90.90\s*breath|hollow|airplane|posterior\s*lift/i;
  const hasStability = exercises.some(e => STABILITY_TERMS.test(e.name));
  if (hasStability) {
    breakdown.stabilityPresent = 10;
    details.push("✓ Stability/control element present");
  } else {
    details.push("~ No dedicated stability/control exercise — session is range-only");
  }

  // 6. No strength/speed bleed (10 pts)
  const BLEED_TERMS = /barbell|squat rack|bench\s*press|deadlift|military\s*press|power\s*clean|explosive|sets\s+to\s+failure|max\s+effort|1rm|hypertrophy/i;
  const bleedExercises = exercises.filter(e => BLEED_TERMS.test(e.name) || BLEED_TERMS.test(e.notes ?? ""));
  if (bleedExercises.length === 0) {
    breakdown.noBleed = 10;
    details.push("✓ Clean: no strength/speed contamination detected");
  } else {
    details.push(`✗ Bleed detected in ${bleedExercises.length} exercise(s): ${bleedExercises.map(e => e.name).join(", ")}`);
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const passed = total >= 70;

  console.log(`[MobilitySessionDepthAudit] "${session.name ?? "unnamed"}" — Score: ${total}/100 (${passed ? "PASS" : "FAIL"})`);

  return { total, passed, breakdown, details };
}

// ─── Mobility Flow Enforcement ─────────────────────────────────────────────────

/**
 * TASK 8 — Validates that exercises in a session follow logical phase ordering.
 * Detects and optionally repairs phase-order violations.
 *
 * Returns the session with exercises reordered to match the canonical
 * slot template if violations are found.
 */
export function enforceMobilityFlowOrder(
  session: {
    name?: string;
    exercises?: Array<{ name: string; sets?: number; reps?: string; rest?: string; notes?: string }>;
  },
): { ordered: typeof session; reorderApplied: boolean; violations: string[] } {
  const exercises = session.exercises ?? [];
  if (exercises.length === 0) return { ordered: session, reorderApplied: false, violations: [] };

  const PHASE_PATTERNS: Array<{ role: string; pattern: RegExp; order: number }> = [
    { role: "tissue_prep",    pattern: /foam\s*roll|lacrosse|tissue|calf\s*roll|hamstring\s*roll|it\s*band|pec\s*minor\s*release/i,  order: 1 },
    { role: "breathing",      pattern: /breath|crocodile|box\s*breath|diaphragm|90.90\s*breath/i,                                    order: 2 },
    { role: "passive_holds",  pattern: /stretch|hold|pigeon|couch|frog|90.90|sleeper|thread|open\s*book|cat.cow|supine\s*figure/i,   order: 3 },
    { role: "cars_active",    pattern: /cars|pails|rails|active\s*(posterior|lift)|airplane|hip\s*pails/i,                           order: 4 },
    { role: "dynamic_flow",   pattern: /flow|inchworm|spiderman|world'?s\s*greatest|ground\s*control|transition/i,                  order: 5 },
    { role: "stability",      pattern: /bird\s*dog|dead\s*bug|pallof|hollow\s*body|90.90\s*breath(?!ing)|posterior\s*lift/i,        order: 6 },
    { role: "recovery_exit",  pattern: /supine\s*twist|legs\s*up|child'?s\s*pose|progressive\s*relax|recovery\s*breath|supine\s*breath|figure.4/i, order: 7 },
  ];

  function getPhaseOrder(ex: { name: string }): number {
    for (const { pattern, order } of PHASE_PATTERNS) {
      if (pattern.test(ex.name)) return order;
    }
    return 4;
  }

  const orderedExercises = [...exercises].sort((a, b) => getPhaseOrder(a) - getPhaseOrder(b));

  const violations: string[] = [];
  for (let i = 0; i < exercises.length; i++) {
    if (exercises[i].name !== orderedExercises[i].name) {
      violations.push(`Position ${i + 1}: "${exercises[i].name}" should come after "${orderedExercises[Math.max(0, i - 1)].name}"`);
    }
  }

  if (violations.length > 0) {
    console.log(`[MobilityFlowEnforcer] "${session.name ?? "unnamed"}" — ${violations.length} ordering violations detected and repaired`);
    return { ordered: { ...session, exercises: orderedExercises }, reorderApplied: true, violations };
  }

  return { ordered: session, reorderApplied: false, violations };
}

// ─── Mobility Response Contract ───────────────────────────────────────────────

/**
 * Builds an explicit JSON response contract for mobility programs.
 * Injected into the system prompt so OpenAI knows the exact output structure.
 * Eliminates parse failures from ambiguous or strength-flavored responses.
 *
 * TASK 3 — Updated to enforce session depth, flow structure, and mobility-native
 * language. Includes full 5–6 item example sessions with real exercise names.
 */
export function buildMobilityResponseContract(_sessionCount: number): string {
  const day1Example = `    {
      "name": "Day 1 — Hip Mobility (Passive Range)",
      "exercises": [
        { "name": "Foam Roll Quads", "sets": 1, "reps": "60 seconds each side", "rest": "15s", "notes": "Move slowly — pause on tight spots, breathe through the position" },
        { "name": "90/90 Breathing Hold", "sets": 1, "reps": "5 deep breath cycles", "rest": "30s", "notes": "Exhale fully, let the hips settle into the floor" },
        { "name": "Hip CARs", "sets": 1, "reps": "3 slow controlled reps each direction", "rest": "15-30s", "notes": "Note sticking points — map active vs passive range gap" },
        { "name": "90/90 Hip Stretch", "sets": 1, "reps": "60 seconds each side", "rest": "15s", "notes": "Exhale to deepen — bias the stiffer side" },
        { "name": "Couch Stretch", "sets": 1, "reps": "60 seconds each side", "rest": "15s", "notes": "Posterior pelvic tilt to open hip flexor — breathe through it" },
        { "name": "Supine Spinal Twist", "sets": 1, "reps": "90 seconds each side", "rest": "15s", "notes": "Exhale to deepen the rotation — stay relaxed" }
      ]
    }`;

  return `## MOBILITY PROGRAM — MANDATORY JSON RESPONSE CONTRACT

⛔ OUTPUT THE COMPLETE JSON PROGRAM NOW. No previews, scaffolds, or prose. Final program only — output it immediately.

You MUST output as a JSON code block. JSON block first, then 1–2 sentence confirmation. Sessions MUST follow: Tissue Prep → Slow Range Work → Dynamic Integration → Joint Focus → Recovery Finisher.

FORBIDDEN: 1–3 stretch lists (too thin); random stretches with no flow; strength-based movements; loading language.

\`\`\`json
{
  "programName": "Hip Mobility & Range Restoration",
  "programSummary": "Brief description of mobility focus, primary joint targets, and progression intent",
  "focusMode": "mobility",
  "days": [
${day1Example}
  ]
}
\`\`\`

SESSION DEPTH: Recovery Flow → min 4, target 5. All others → min 5, target 6.

SESSION NAMES — MUST use mobility-native language (e.g., "Day 1 — Hip Mobility (Passive Range)", "Day 2 — End-Range Control (PAILs/RAILs)", "Day 3 — Movement Quality + Integrated Flow").
PROHIBITED names: Lower Strength, Upper Push, Pull Day, Hypertrophy Day, Leg Day, Squat/Bench/Deadlift Day.

FIELD FORMAT: passive holds → "X seconds each side"; CARs → "X slow controlled reps each direction"; PAILs/RAILs → "X seconds at Y% contraction"; flows → "X transitions each side". Rest required for every exercise. NEVER "X reps" for mobility holds. NEVER loading language (add weight, overload, explosive, max effort). programName MUST reference mobility. programSummary MUST describe mobility qualities.`;
}

// ─── Mobility Output Bleed Validator ──────────────────────────────────────────

const STRENGTH_BLEED_SESSION_PATTERNS_MOBILITY = /\b(lower strength|upper push|upper pull|push day|pull day|hypertrophy|leg day|back.bicep|chest.tricep|upper body strength|lower body strength|strength.day|compound strength|strength.focus|power.lifting|powerlifting|bench.day|squat.day|deadlift.day)\b/i;

const STRENGTH_BLEED_EXERCISE_PATTERNS_MOBILITY = /\b(barbell back squat|conventional deadlift|flat bench press|incline bench press|military press|barbell overhead press|barbell row|weighted pull.up|barbell hip thrust|power clean|hang clean|barbell curl|tricep pushdown|dumbbell press|dumbbell curl|kettlebell swing|box jump|sprint|plyometric jump)\b/i;

const MOBILITY_PROHIBITED_LANGUAGE_PATTERNS = /\b(sets? of \d+ reps?|hypertrophy|max.effort|1rm|training max|percentage of max|explosive|power output|sets? to failure|all.out effort|rate of force)\b/i;

const MOBILITY_PROHIBITED_NOTE_PATTERNS = /\b(add weight|progressive overload|increase load|sets? to failure|train to failure|explosive|max effort|power output|hypertrophy|muscle size|1rm|barbell|dumbbell press|kettlebell swing)\b/i;

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
 * Checks session names, exercise names, rep field language, and notes.
 *
 * TASK 7 — Expanded bleed validator covers:
 * - Strength session names (leg day, push day, hypertrophy, etc.)
 * - Strength exercise names (barbell, dumbbell press, kettlebell swing, sprint, box jump, etc.)
 * - Prohibited rep/note language (explosive, max effort, sets to failure, 1RM, power output)
 * - Reject or repair approach: repairs names in place, rejects if exercises are structural contamination
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
          if (ex.notes && MOBILITY_PROHIBITED_NOTE_PATTERNS.test(ex.notes)) {
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
    rejected: strengthTermsDetected && bleedingExerciseNames.length >= 2,
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

// ─── Mobility Preview / Incomplete Build Response Detector ────────────────────

const MOBILITY_PREVIEW_RESPONSE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /i'?ll\s+build/i, label: "I'll build" },
  { pattern: /here'?s\s+what\s+i'?(?:ll|m)\s+include/i, label: "Here's what I'll include" },
  { pattern: /once\s+(?:we\s+)?(?:have|get|know)/i, label: "Once we know" },
  { pattern: /i'?ll\s+map/i, label: "I'll map" },
  { pattern: /foundation\s+i'?m\s+building/i, label: "foundation I'm building" },
  { pattern: /built\s+a?\s*\d*[- ]?day/i, label: "Built a X-day (false success announcement)" },
  { pattern: /here'?s\s+the\s+foundation/i, label: "here's the foundation" },
  { pattern: /here'?s\s+(?:a\s+)?(?:an?\s+)?(?:overview|outline|preview|scaffold|breakdown)/i, label: "overview/outline language" },
  { pattern: /i'?(?:ll|'m going to)\s+(?:build|design|create|put together|structure)/i, label: "I'll build/design/create" },
  { pattern: /i'?(?:ll|'m going to)\s+(?:include|add|incorporate)/i, label: "I'll include/add" },
  { pattern: /this\s+will\s+be\s+structured/i, label: "this will be structured" },
  { pattern: /check\s+the\s+(?:program|activity)\s+tab/i, label: "check the program tab (false success)" },
  { pattern: /built\s+your/i, label: "built your (false success announcement)" },
  { pattern: /program\s+is\s+ready/i, label: "program is ready (false success announcement)" },
  { pattern: /your\s+plan\s+is\s+ready/i, label: "your plan is ready (false success announcement)" },
  { pattern: /your\s+program\s+is\s+ready/i, label: "your program is ready (false success announcement)" },
  { pattern: /(?:day\s+\d+\s*[:\-—]?\s*(?:we'?ll?|will|i'?ll))/i, label: "day X we'll/will" },
  { pattern: /once\s+you\s+complete\s+your\s+profile/i, label: "once you complete your profile" },
  { pattern: /i'?m\s+building\s+around\s+you/i, label: "I'm building around you" },
];

export interface IncompleteMobilityBuildDetection {
  isPreview: boolean;
  triggerPhrase: string | null;
  confidence: "high" | "low";
}

/**
 * Detects whether a mobility response is a preview/planning response rather than
 * a completed JSON build. Mobility-specific version of detectIncompleteBuildResponse.
 *
 * Two detection paths:
 *   1. Pattern match — mobility-specific preview/false-success phrases
 *   2. Length guard — a response under 400 chars cannot contain a full mobility program
 */
export function detectIncompleteMobilityBuildResponse(text: string): IncompleteMobilityBuildDetection {
  for (const { pattern, label } of MOBILITY_PREVIEW_RESPONSE_PATTERNS) {
    if (pattern.test(text)) {
      return { isPreview: true, triggerPhrase: label, confidence: "high" };
    }
  }
  if (text.length < 400) {
    return {
      isPreview: true,
      triggerPhrase: `short response (${text.length} chars) — not a complete mobility program`,
      confidence: "high",
    };
  }
  return { isPreview: false, triggerPhrase: null, confidence: "low" };
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
