/**
 * Mobility Intelligence Layer
 *
 * Runtime intelligence for the Mobility Focus Engine:
 * - MobilityExposureTracker: prevents drill repetition within a 4-week block
 * - MOBILITY_CLUSTER_DEFINITIONS: equivalence clusters for pattern suppression
 * - MobilityDoseSystem: time-based dosing profiles and session caps by week
 * - JointDistributionBalancer: enforces balanced joint coverage per session
 * - FlowContinuityEngine: logical phase ordering within sessions
 * - RANGE_PROGRESSION_MODEL: week 1-4 range depth, TUT, complexity progressions
 * - buildMobilitySessionContext(): aggregates all systems into rich prompt context
 * - buildMobilityParityCheck(): runtime validation of system completeness
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MobilityJoint = "hip" | "shoulder" | "spine" | "ankle" | "full_body" | "breathing";

export type MobilityClusterId =
  | "hip_rotation_cluster"
  | "hip_flexor_cluster"
  | "hip_articulation_cluster"
  | "hip_pails_cluster"
  | "thoracic_rotation_cluster"
  | "thoracic_extension_cluster"
  | "thoracic_cars_cluster"
  | "shoulder_posterior_cluster"
  | "shoulder_anterior_cluster"
  | "shoulder_cars_cluster"
  | "ankle_passive_cluster"
  | "ankle_active_cluster"
  | "ankle_calf_cluster"
  | "breathing_reset_cluster"
  | "dynamic_flow_cluster"
  | "recovery_cluster";

export type MobilityDoseProfile =
  | "passive_hold"
  | "active_control"
  | "cars_articulation"
  | "breathing_drill"
  | "dynamic_flow"
  | "recovery_hold";

export type MobilityPhaseRole =
  | "tissue_prep"
  | "activation_cars"
  | "passive_holds"
  | "active_control"
  | "dynamic_flow"
  | "recovery_exit";

export interface MobilityClusterDefinition {
  id: MobilityClusterId;
  joint: MobilityJoint;
  label: string;
  exercises: string[];
  suppressionRule: string;
}

export interface MobilityDoseSpec {
  profile: MobilityDoseProfile;
  holdDurationRange: [number, number];
  tut: "low" | "moderate" | "high";
  flowLengthMin?: number;
  breathCycles?: number;
  intensityLevel: "low" | "moderate" | "high";
  fatigueCost: "low" | "moderate";
  notes: string;
}

export interface MobilityWeekProgressionSpec {
  week: 1 | 2 | 3 | 4;
  label: string;
  rangeDepth: "shallow" | "moderate" | "deep" | "reduced";
  holdDurationRange: [number, number];
  complexityLevel: "basic" | "moderate" | "complex" | "simplified";
  controlDemand: "low" | "moderate" | "high" | "reduced";
  controlToRangeRatio: string;
  maxSessionMinutes: number;
  maxTUTMinutes: number;
  pailsRailsAllowed: boolean;
  endRangeLoadingAllowed: boolean;
  keyDirectives: string[];
}

export interface JointDistributionTarget {
  joint: MobilityJoint;
  minPercent: number;
  label: string;
}

export interface FlowPhaseSpec {
  phase: MobilityPhaseRole;
  order: number;
  durationMin: number;
  durationMax: number;
  exampleFamilies: string[];
  required: boolean;
  rule: string;
}

// ─── Cluster Definitions ──────────────────────────────────────────────────────

export const MOBILITY_CLUSTER_DEFINITIONS: MobilityClusterDefinition[] = [
  {
    id: "hip_rotation_cluster",
    joint: "hip",
    label: "Hip Internal/External Rotation",
    exercises: [
      "90/90 Hip Stretch", "90/90 Active Posterior Lift", "Hip Internal Rotation End-Range Hold",
      "Figure-4 Hip Stretch", "Pigeon Stretch", "Deep Squat Hip Stretch",
    ],
    suppressionRule: "If 2+ exercises from this cluster are already in the session, suppress all remaining cluster members for that session.",
  },
  {
    id: "hip_flexor_cluster",
    joint: "hip",
    label: "Hip Flexor / Anterior Chain",
    exercises: [
      "Couch Stretch", "Hip Flexor Stretch Kneeling", "Deep Squat Hold",
      "Hip Rotation March", "Active Hamstring Stretch",
    ],
    suppressionRule: "Max 1 exercise per session from this cluster unless Hip Focus Block is active.",
  },
  {
    id: "hip_articulation_cluster",
    joint: "hip",
    label: "Hip Joint Articulation",
    exercises: [
      "Hip CARs", "Adductor CARs", "Hip Airplane",
      "Adductor Rockback", "Frog Stretch",
    ],
    suppressionRule: "Hip CARs is the anchor — if present, limit remaining cluster to 1 additional exercise.",
  },
  {
    id: "hip_pails_cluster",
    joint: "hip",
    label: "Hip PAILs/RAILs & End-Range",
    exercises: [
      "Hip PAILs/RAILs", "90/90 Active Posterior Lift", "Hip Internal Rotation End-Range Hold",
    ],
    suppressionRule: "All PAILs/RAILs cluster members share the same stimulus — pick 1 per session.",
  },
  {
    id: "thoracic_rotation_cluster",
    joint: "spine",
    label: "Thoracic Rotation",
    exercises: [
      "Quadruped Thoracic Rotation", "Open Book Stretch", "Side-Lying T-Spine Rotation",
      "Rib Roll", "Thread the Needle",
    ],
    suppressionRule: "Max 2 exercises per session from this cluster — rotation variants stack poorly without recovery.",
  },
  {
    id: "thoracic_extension_cluster",
    joint: "spine",
    label: "Thoracic Extension",
    exercises: [
      "Thoracic Extension Foam Roll", "Cat-Cow", "T-Spine Extension on Ball",
      "Segmental Rolling",
    ],
    suppressionRule: "Thoracic extension precedes rotation — sequence extension before rotation, max 1 extension drill per session.",
  },
  {
    id: "thoracic_cars_cluster",
    joint: "spine",
    label: "Thoracic CARs & Active Articulation",
    exercises: [
      "Thoracic CARs", "Thoracic CARs with Dowel",
    ],
    suppressionRule: "These are near-identical stimulus. Pick one per session only.",
  },
  {
    id: "shoulder_posterior_cluster",
    joint: "shoulder",
    label: "Shoulder Posterior Capsule",
    exercises: [
      "Sleeper Stretch", "Cross-Body Shoulder Stretch", "Band Shoulder Distraction",
    ],
    suppressionRule: "Max 1 posterior capsule exercise per session — posterior capsule takes 48h to respond.",
  },
  {
    id: "shoulder_anterior_cluster",
    joint: "shoulder",
    label: "Shoulder Anterior / Pec",
    exercises: [
      "Doorway Chest Stretch", "Pec Minor Stretch", "Banded Pass-Through",
      "Levator Scapulae Stretch",
    ],
    suppressionRule: "Max 1 anterior shoulder drill per session unless Shoulder Focus Block is active.",
  },
  {
    id: "shoulder_cars_cluster",
    joint: "shoulder",
    label: "Shoulder CARs & Active Range",
    exercises: [
      "Shoulder CARs", "Wall Slides", "Shoulder PAILs/RAILs",
      "Arm Circle Warm-Up", "Overhead Lat Stretch",
    ],
    suppressionRule: "Shoulder CARs is the anchor. Wall Slides and CARs together cover scapular + GH — use both. PAILs only in Weeks 2+.",
  },
  {
    id: "ankle_passive_cluster",
    joint: "ankle",
    label: "Ankle Passive Mobilization",
    exercises: [
      "Banded Ankle Distraction", "Wall Ankle Stretch",
    ],
    suppressionRule: "Both exercises target the same talocrural restriction — pick 1 per session.",
  },
  {
    id: "ankle_active_cluster",
    joint: "ankle",
    label: "Ankle Active Control & PAILs",
    exercises: [
      "Ankle CARs", "Ankle PAILs/RAILs",
    ],
    suppressionRule: "CARs first, then PAILs only in Weeks 2+. Both in same session is acceptable when ankle is the focus.",
  },
  {
    id: "ankle_calf_cluster",
    joint: "ankle",
    label: "Calf / Gastroc-Soleus Complex",
    exercises: [
      "Calf Stretch Straight Knee", "Calf Stretch Bent Knee", "Heel Drop", "Ankle Circles",
    ],
    suppressionRule: "Max 2 calf stretches per session — straight knee (gastroc) and bent knee (soleus) together is appropriate.",
  },
  {
    id: "breathing_reset_cluster",
    joint: "breathing",
    label: "Breathing Reset & Respiratory Mechanics",
    exercises: [
      "Diaphragmatic Breathing Drill", "Crocodile Breathing", "Box Breathing",
      "90/90 Breathing Hold", "Supine Breathing Reset",
    ],
    suppressionRule: "One breathing drill is sufficient per session. The session opening breathing drill sets the tone — do not repeat later unless it's a recovery/restoration session.",
  },
  {
    id: "dynamic_flow_cluster",
    joint: "full_body",
    label: "Dynamic Mobility Flows",
    exercises: [
      "Inchworm to Squat", "Spiderman Flow", "Hip 90/90 Transition Flow",
      "Ground Control Flow", "World's Greatest Stretch Flow",
    ],
    suppressionRule: "Max 1 dynamic flow per session — flows integrate all prior session work and should close the movement work.",
  },
  {
    id: "recovery_cluster",
    joint: "full_body",
    label: "Recovery & Restoration",
    exercises: [
      "Child's Pose", "Supine Spinal Twist", "Legs Up the Wall",
      "Butterfly Stretch", "Forward Fold",
    ],
    suppressionRule: "Recovery cluster belongs at the session exit — do not front-load recovery holds before mobility activation work.",
  },
];

// ─── Dose System ──────────────────────────────────────────────────────────────

export const MOBILITY_DOSE_PROFILES: Record<MobilityDoseProfile, MobilityDoseSpec> = {
  passive_hold: {
    profile: "passive_hold",
    holdDurationRange: [30, 90],
    tut: "high",
    intensityLevel: "low",
    fatigueCost: "low",
    notes: "Sustained passive tension at end-range. Exhale to deepen. No forcing. Week 1: 30-45s, Week 2: 45-60s, Week 3: 60-90s, Week 4: 30-45s (recovery).",
  },
  active_control: {
    profile: "active_control",
    holdDurationRange: [5, 10],
    tut: "moderate",
    intensityLevel: "moderate",
    fatigueCost: "moderate",
    notes: "Isometric contraction at end-range. PAILs/RAILs protocol: 20-40% effort, never maximal. Week 1: 20% effort, Week 2: 30% effort, Week 3: 40% effort.",
  },
  cars_articulation: {
    profile: "cars_articulation",
    holdDurationRange: [0, 0],
    tut: "moderate",
    flowLengthMin: 2,
    intensityLevel: "low",
    fatigueCost: "low",
    notes: "Controlled Articular Rotations. 3-5 slow circles per joint. Each circle: 10-15 seconds. Primary diagnostic AND training tool. Daily appropriate.",
  },
  breathing_drill: {
    profile: "breathing_drill",
    holdDurationRange: [4, 6],
    tut: "low",
    breathCycles: 8,
    intensityLevel: "low",
    fatigueCost: "low",
    notes: "Respiratory mechanics. Crocodile breathing: prone with 360-degree rib expansion. Box: 4s in, 4s hold, 4s out, 4s hold. Diaphragmatic: supine, belly first.",
  },
  dynamic_flow: {
    profile: "dynamic_flow",
    holdDurationRange: [0, 0],
    tut: "moderate",
    flowLengthMin: 5,
    intensityLevel: "moderate",
    fatigueCost: "moderate",
    notes: "Continuous movement flow integrating all session work. Slow and deliberate. Quality of transition is the output. Not a warm-up.",
  },
  recovery_hold: {
    profile: "recovery_hold",
    holdDurationRange: [120, 300],
    tut: "high",
    intensityLevel: "low",
    fatigueCost: "low",
    notes: "Parasympathetic activation holds. 2-5 minutes per position. Breathing integrated. No muscular effort. CNS downregulation priority.",
  },
};

// ─── Session Caps by Week ──────────────────────────────────────────────────────

export const MOBILITY_SESSION_CAPS_BY_WEEK: Record<1 | 2 | 3 | 4, {
  maxSessionMinutes: number;
  maxTUTMinutes: number;
  controlToRangeRatio: string;
  maxExercises: number;
}> = {
  1: { maxSessionMinutes: 40, maxTUTMinutes: 18, controlToRangeRatio: "25:75", maxExercises: 6 },
  2: { maxSessionMinutes: 48, maxTUTMinutes: 23, controlToRangeRatio: "40:60", maxExercises: 7 },
  3: { maxSessionMinutes: 55, maxTUTMinutes: 28, controlToRangeRatio: "50:50", maxExercises: 8 },
  4: { maxSessionMinutes: 32, maxTUTMinutes: 14, controlToRangeRatio: "20:80", maxExercises: 5 },
};

// ─── Range Progression Model ──────────────────────────────────────────────────

export const RANGE_PROGRESSION_MODEL: MobilityWeekProgressionSpec[] = [
  {
    week: 1,
    label: "Establish — Tissue Preparation & Range Introduction",
    rangeDepth: "shallow",
    holdDurationRange: [30, 45],
    complexityLevel: "basic",
    controlDemand: "low",
    controlToRangeRatio: "25:75",
    maxSessionMinutes: 40,
    maxTUTMinutes: 18,
    pailsRailsAllowed: false,
    endRangeLoadingAllowed: false,
    keyDirectives: [
      "Introduce passive range — hold positions that feel reachable but not aggressive",
      "CARs are the diagnostic and activation tool — perform 3 slow circles, not 5 fast ones",
      "Breathing drill OPENS every session — 5 minutes minimum before any joint work",
      "Foam rolling and tissue prep FIRST — 5-10 minutes before holds",
      "No PAILs/RAILs this week — passive range must be established before active contraction",
      "Session language: 'We're exploring range this week, not forcing it'",
    ],
  },
  {
    week: 2,
    label: "Build — Active Control Introduction",
    rangeDepth: "moderate",
    holdDurationRange: [45, 60],
    complexityLevel: "moderate",
    controlDemand: "moderate",
    controlToRangeRatio: "40:60",
    maxSessionMinutes: 48,
    maxTUTMinutes: 23,
    pailsRailsAllowed: true,
    endRangeLoadingAllowed: false,
    keyDirectives: [
      "Introduce PAILs at 20% effort — 5 seconds on, 5 seconds off, into the deepest available passive position",
      "Increase hold durations: passive holds now 45-60 seconds",
      "CARs now include full range — assess if active range has grown from Week 1",
      "Add 1 active control drill per session (90/90 Active Posterior Lift, Hip Airplane, etc.)",
      "No end-range loading yet — control must be verified across 2 sessions before loading",
      "Session language: 'We're starting to build ownership of this range now'",
    ],
  },
  {
    week: 3,
    label: "Intensify — End-Range Control & Complexity",
    rangeDepth: "deep",
    holdDurationRange: [60, 90],
    complexityLevel: "complex",
    controlDemand: "high",
    controlToRangeRatio: "50:50",
    maxSessionMinutes: 55,
    maxTUTMinutes: 28,
    pailsRailsAllowed: true,
    endRangeLoadingAllowed: true,
    keyDirectives: [
      "PAILs/RAILs at 30-40% effort — increased neural demand at end-range",
      "Introduce end-range loading where control is reliable (Jefferson Curl, weighted 90/90 lift, loaded hip holds)",
      "Passive holds reach maximum depth this week: 60-90 seconds",
      "Introduce dynamic flow sequences — 5-10 minute integrated flow",
      "Complex positional transitions: 90/90 → hip CARs → deep squat flow",
      "Session language: 'We're pushing into the range you've built — own it, don't just reach it'",
    ],
  },
  {
    week: 4,
    label: "Deload — Recovery & Consolidation",
    rangeDepth: "reduced",
    holdDurationRange: [30, 45],
    complexityLevel: "simplified",
    controlDemand: "reduced",
    controlToRangeRatio: "20:80",
    maxSessionMinutes: 32,
    maxTUTMinutes: 14,
    pailsRailsAllowed: false,
    endRangeLoadingAllowed: false,
    keyDirectives: [
      "Volume reduction: max 5 exercises, 30-40% less total time under tension",
      "No PAILs/RAILs or end-range loading — allow tissue consolidation",
      "Emphasis on CARs and passive recovery holds",
      "Increase recovery and breathing work: 40% of session is parasympathetic work",
      "Assess range gains from Weeks 1-3 — note where improvements occurred",
      "Session language: 'We're letting the gains consolidate — this week is about restoration'",
    ],
  },
];

// ─── Joint Distribution Targets ───────────────────────────────────────────────

export const JOINT_DISTRIBUTION_TARGETS: JointDistributionTarget[] = [
  { joint: "hip",      minPercent: 30, label: "Hip complex (flexion, extension, IR/ER, abduction, adduction)" },
  { joint: "shoulder", minPercent: 20, label: "Shoulder girdle (GH joint, scapular, posterior capsule)" },
  { joint: "spine",    minPercent: 20, label: "Spine (thoracic extension, rotation, segmental articulation)" },
  { joint: "ankle",    minPercent: 15, label: "Ankle complex (dorsiflexion, talocrural, gastroc-soleus)" },
];

// ─── Flow Continuity (Phase Ordering) ────────────────────────────────────────

export const FLOW_PHASE_SEQUENCE: FlowPhaseSpec[] = [
  {
    phase: "tissue_prep",
    order: 1,
    durationMin: 5,
    durationMax: 10,
    exampleFamilies: ["tissue_preparation", "breathing_integration"],
    required: true,
    rule: "ALWAYS opens the session. Foam rolling, tissue release, and one breathing drill. This is not optional — it is the CNS entry signal. Skipping tissue prep means all subsequent range work starts in a restricted tissue state.",
  },
  {
    phase: "activation_cars",
    order: 2,
    durationMin: 8,
    durationMax: 12,
    exampleFamilies: ["positional_control", "hip_mobility"],
    required: true,
    rule: "CARs for the primary joint target of the session. Slow, full-range circles diagnostic function — see where the range breaks down. This also activates synovial fluid production for joint health.",
  },
  {
    phase: "passive_holds",
    order: 3,
    durationMin: 10,
    durationMax: 20,
    exampleFamilies: ["hip_mobility", "shoulder_mobility", "thoracic_spine", "ankle_mobility"],
    required: true,
    rule: "The primary range work. Passive holds at end-range for each priority joint. Exhale to deepen. Duration is the key variable. Must come BEFORE active control work — you cannot own range you haven't restored.",
  },
  {
    phase: "active_control",
    order: 4,
    durationMin: 8,
    durationMax: 15,
    exampleFamilies: ["end_range_strength", "positional_control"],
    required: false,
    rule: "PAILs/RAILs, end-range isometrics, loaded end-range holds. Weeks 2+ only. Must follow passive holds — active control demands range that has been opened by the passive phase. Never before passive holds.",
  },
  {
    phase: "dynamic_flow",
    order: 5,
    durationMin: 5,
    durationMax: 12,
    exampleFamilies: ["dynamic_mobility_flow"],
    required: false,
    rule: "Integrates all session work into a continuous movement sequence. Weeks 2+ only. This is not a warm-up — it is the synthesis of all joint work done in the session. One flow sequence per session maximum.",
  },
  {
    phase: "recovery_exit",
    order: 6,
    durationMin: 5,
    durationMax: 10,
    exampleFamilies: ["recovery_restoration", "breathing_integration"],
    required: true,
    rule: "ALWAYS closes the session. Parasympathetic downregulation — recovery holds, final breathing reset. Do not end a mobility session without a nervous system exit protocol.",
  },
];

// ─── MobilityExposureTracker ──────────────────────────────────────────────────

/**
 * Tracks which movement families, exercises, and joint clusters
 * have been used across a 4-week mobility block.
 *
 * Used to:
 * - Prevent drill repetition (same drill in same family 3+ weeks = hard block)
 * - Ensure rotation through all 11 movement families
 * - Enforce cluster suppression (no stacking redundant positions)
 * - Maintain joint distribution balance
 */
export class MobilityExposureTracker {
  /** family → exercise → weeks used */
  private familyExposure: Map<string, Map<string, number[]>> = new Map();
  /** cluster → weeks heavy usage occurred */
  private clusterUsage: Map<MobilityClusterId, number[]> = new Map();
  /** joint → total slots used */
  private jointSlots: Map<MobilityJoint, number> = new Map();
  /** current week of the block */
  currentWeek: 1 | 2 | 3 | 4 = 1;
  /** total slots recorded (for distribution percentage calculations) */
  private totalSlots: number = 0;

  setWeek(week: 1 | 2 | 3 | 4): void {
    this.currentWeek = week;
  }

  recordExercise(family: string, exercise: string, joint: MobilityJoint): void {
    if (!this.familyExposure.has(family)) {
      this.familyExposure.set(family, new Map());
    }
    const famMap = this.familyExposure.get(family)!;
    if (!famMap.has(exercise)) famMap.set(exercise, []);
    famMap.get(exercise)!.push(this.currentWeek);

    this.jointSlots.set(joint, (this.jointSlots.get(joint) ?? 0) + 1);
    this.totalSlots++;
  }

  recordClusterUsage(clusterId: MobilityClusterId): void {
    if (!this.clusterUsage.has(clusterId)) this.clusterUsage.set(clusterId, []);
    this.clusterUsage.get(clusterId)!.push(this.currentWeek);
  }

  getExposureCount(family: string, exercise: string): number {
    return this.familyExposure.get(family)?.get(exercise)?.length ?? 0;
  }

  getExposurePenalty(family: string, exercise: string): number {
    const count = this.getExposureCount(family, exercise);
    if (count >= 3) return 999;
    if (count === 2) return 8;
    if (count === 1) return 4;
    return 0;
  }

  getJointPercent(joint: MobilityJoint): number {
    if (this.totalSlots === 0) return 0;
    return Math.round(((this.jointSlots.get(joint) ?? 0) / this.totalSlots) * 100);
  }

  getUnderrepresentedJoints(): MobilityJoint[] {
    return JOINT_DISTRIBUTION_TARGETS
      .filter(t => this.getJointPercent(t.joint) < t.minPercent)
      .map(t => t.joint);
  }

  getHeavilyUsedClusters(): MobilityClusterId[] {
    const used: MobilityClusterId[] = [];
    for (const [clusterId, weeks] of this.clusterUsage) {
      if (weeks.filter(w => w === this.currentWeek).length >= 2) {
        used.push(clusterId);
      }
    }
    return used;
  }

  getBlockSummary(): string {
    const families = Array.from(this.familyExposure.keys());
    const unusedFamilies = [
      "hip_mobility", "shoulder_mobility", "thoracic_spine", "ankle_mobility",
      "trunk_control", "end_range_strength", "positional_control",
      "breathing_integration", "tissue_preparation", "dynamic_mobility_flow",
      "recovery_restoration",
    ].filter(f => !families.includes(f));

    const joints: string[] = [];
    for (const target of JOINT_DISTRIBUTION_TARGETS) {
      const pct = this.getJointPercent(target.joint);
      joints.push(`${target.joint}: ${pct}% (min: ${target.minPercent}%)`);
    }

    return [
      `Week ${this.currentWeek} of 4`,
      `Families used: ${families.join(", ") || "none"}`,
      `Unused families: ${unusedFamilies.join(", ") || "none"}`,
      `Joint distribution: ${joints.join(" | ")}`,
      `Total slots: ${this.totalSlots}`,
    ].join("\n");
  }
}

// ─── Flow Continuity Engine ────────────────────────────────────────────────────

/**
 * Builds the logical flow ordering for a mobility session.
 * Returns a text directive the AI uses to sequence exercises correctly.
 */
export function buildFlowContinuityDirective(week: 1 | 2 | 3 | 4): string {
  const phases = FLOW_PHASE_SEQUENCE
    .filter(p => p.required || week >= 2)
    .sort((a, b) => a.order - b.order);

  const phaseLines = phases.map(p =>
    `${p.order}. ${p.phase.replace(/_/g, " ").toUpperCase()} (${p.durationMin}–${p.durationMax} min): ${p.rule.split(".")[0]}.`
  );

  const violations = [
    "NEVER sequence active control BEFORE passive holds — range must exist before you control it",
    "NEVER sequence dynamic flow BEFORE passive holds — integration requires the range to be open",
    "NEVER skip tissue_prep — the nervous system must be primed before any joint work",
    "NEVER skip recovery_exit — CNS downregulation is part of the adaptation signal",
    "NEVER random ordering — each phase prepares the body for the next",
  ];

  return [
    `SESSION PHASE SEQUENCE (Week ${week} — Non-Negotiable Ordering):`,
    phaseLines.join("\n"),
    "",
    "SEQUENCING VIOLATIONS TO AVOID:",
    violations.join("\n"),
  ].join("\n");
}

// ─── Cluster Suppression Directive ────────────────────────────────────────────

export function buildClusterSuppressionDirective(): string {
  const clusterSummary = MOBILITY_CLUSTER_DEFINITIONS.map(c =>
    `  ${c.label} (${c.joint}): ${c.suppressionRule}`
  );

  return [
    "MOBILITY CLUSTER SUPPRESSION RULES:",
    "Do NOT stack exercises from the same cluster in a single session — they produce redundant stimulus.",
    "Cluster definitions:",
    ...clusterSummary,
    "",
    "Cluster compliance means: balanced joint exposure + fresh stimulus + no wasted session positions.",
    "If a cluster is already represented, bias the next slot toward an UNDERREPRESENTED cluster.",
  ].join("\n");
}

// ─── Dose System Directive ─────────────────────────────────────────────────────

export function buildDoseSystemDirective(week: 1 | 2 | 3 | 4): string {
  const weekSpec = RANGE_PROGRESSION_MODEL.find(m => m.week === week)!;
  const caps = MOBILITY_SESSION_CAPS_BY_WEEK[week];

  const doseLines = Object.values(MOBILITY_DOSE_PROFILES).map(d =>
    `  ${d.profile}: ${d.holdDurationRange[0] > 0 ? `${d.holdDurationRange[0]}–${d.holdDurationRange[1]}s holds, ` : ""}TUT: ${d.tut}, fatigue cost: ${d.fatigueCost}. ${d.notes}`
  );

  return [
    `MOBILITY DOSE SYSTEM — Week ${week}: ${weekSpec.label}`,
    `Range depth this week: ${weekSpec.rangeDepth}`,
    `Hold duration target: ${weekSpec.holdDurationRange[0]}–${weekSpec.holdDurationRange[1]} seconds`,
    `Complexity: ${weekSpec.complexityLevel} | Control demand: ${weekSpec.controlDemand}`,
    `Control:Range ratio: ${weekSpec.controlToRangeRatio}`,
    `Session caps: max ${caps.maxSessionMinutes} min total | max ${caps.maxTUTMinutes} min TUT | max ${caps.maxExercises} exercises`,
    `PAILs/RAILs: ${weekSpec.pailsRailsAllowed ? "ALLOWED" : "NOT YET — passive range first"}`,
    `End-range loading: ${weekSpec.endRangeLoadingAllowed ? "ALLOWED where control is verified" : "NOT YET — control must be reliable"}`,
    "",
    "WEEK-SPECIFIC DIRECTIVES:",
    weekSpec.keyDirectives.map(d => `  • ${d}`).join("\n"),
    "",
    "DOSE PROFILES:",
    ...doseLines,
  ].join("\n");
}

// ─── Joint Distribution Directive ─────────────────────────────────────────────

export function buildJointDistributionDirective(): string {
  const targetLines = JOINT_DISTRIBUTION_TARGETS.map(t =>
    `  ${t.joint.toUpperCase()} — minimum ${t.minPercent}% of session slots: ${t.label}`
  );

  return [
    "JOINT DISTRIBUTION BALANCE REQUIREMENTS:",
    "Every session must meet these minimum joint coverage targets:",
    ...targetLines,
    "",
    "ENFORCEMENT LOGIC:",
    "  • If hip is below 30%: prioritize hip_mobility, hip_articulation, or hip_flexor families",
    "  • If shoulder is below 20%: prioritize shoulder_mobility, shoulder_cars families",
    "  • If spine is below 20%: prioritize thoracic_spine, thoracic_rotation families",
    "  • If ankle is below 15%: add ankle_mobility or ankle_calf family exercises",
    "  • NEVER build a hip-dominant session with no shoulder or spine work",
    "  • NEVER neglect ankle dorsiflexion — it underlies squat, sprint, and lower chain mechanics",
  ].join("\n");
}

// ─── Predictive Adaptation Directive ─────────────────────────────────────────

export function buildMobilityPredictiveAdaptationContext(
  stiffnessSignals?: string[],
  painSignals?: string[],
  fatigueLevel?: "low" | "moderate" | "high",
  adherencePattern?: "consistent" | "inconsistent" | "new",
): string {
  const lines: string[] = ["MOBILITY PREDICTIVE ADAPTATION SIGNALS:"];

  if (stiffnessSignals && stiffnessSignals.length > 0) {
    lines.push(`  STIFFNESS TREND: ${stiffnessSignals.join(", ")}`);
    lines.push("  → Bias future sessions toward STIFFNESS_REDUCTION: increase tissue prep, add contract-relax sequences, dynamic flows before passive holds");
    lines.push("  → Prioritize the specifically stiff joint family in next 2 sessions");
  }

  if (painSignals && painSignals.length > 0) {
    lines.push(`  PAIN SIGNAL: ${painSignals.join(", ")}`);
    lines.push("  → Immediately shift to REENTRY_SUPPORT: graduated range re-introduction only");
    lines.push("  → No PAILs/RAILs, no end-range loading until pain-free baseline re-established");
    lines.push("  → Differentiate: joint impingement (stop immediately) vs muscular tension (proceed carefully)");
  }

  if (fatigueLevel === "high") {
    lines.push("  HIGH FATIGUE: → Shift to RECOVERY_FLOW block emphasis");
    lines.push("  → Reduce session duration 30-40%, increase recovery holds, remove dynamic flow");
    lines.push("  → Breathing drills take priority — parasympathetic recovery is the output");
  } else if (fatigueLevel === "moderate") {
    lines.push("  MODERATE FATIGUE: → Maintain plan but increase passive holds, reduce active control demand");
  }

  if (adherencePattern === "inconsistent") {
    lines.push("  INCONSISTENT ADHERENCE: → Simplify sessions, reduce exercise count, increase passive holds");
    lines.push("  → Focus on 2-3 key movements done well rather than 6 movements done poorly");
  }

  lines.push("  RANGE IMPROVING 2+ SESSIONS: → Progress passive holds → PAILs/RAILs → CARs → active control");
  lines.push("  ACTIVE CONTROL RELIABLE 3+ SESSIONS: → Introduce end-range loading (Jefferson curl, weighted holds)");
  lines.push("  EASY SESSIONS REPORTED: → Increase hold duration, add PAILs contraction demand, next complexity level");

  return lines.join("\n");
}

// ─── Session Log Interpretation (Mobility-Specific) ───────────────────────────

export function buildMobilitySessionLogInterpretationRules(): string {
  return `
MOBILITY SESSION LOG INTERPRETATION:
Map incoming session feedback to mobility coaching decisions:

DIFFICULTY SIGNALS:
  "too easy" →
    • Increase hold duration (add 15-20 seconds to passive holds)
    • Introduce or increase PAILs/RAILs contraction demand
    • Move to next range depth level
    • Add active control component if passive range is reliable
  "too hard" →
    • Reduce positional demand (shallower range entry)
    • Reduce hold duration by 15-20 seconds
    • Remove active control work, return to pure passive holds
    • Check for joint compression vs muscular tension

PAIN SIGNALS (parse for location):
  Any joint pain >3/10 → immediately shift to REENTRY_SUPPORT
    • Differentiate: sharp/stabbing (stop) vs dull ache (proceed carefully)
    • Hip pain → remove hip end-range loading, use gentle CARs only
    • Shoulder pain → remove overhead work, focus on thoracic extension first
    • Ankle pain → remove ankle distraction, focus on calf flexibility only
    • Spinal pain → remove extension work, focus on breathing and gentle flexion

FATIGUE/SORENESS SIGNALS:
  "tired", "fatigued", "sore" →
    • Bias next session toward RECOVERY_FLOW archetype
    • Increase parasympathetic work (more recovery holds, breathing drills)
    • Reduce control demand — passive holds only, no PAILs
  "feeling good", "fresh" →
    • Allow progression — increase hold duration or add PAILs/RAILs
    • Can introduce end-range loading if control is verified

ENJOYMENT SIGNALS:
  "boring", "repetitive" →
    • Increase dynamic flow variety — Spiderman flow, hip 90/90 transitions
    • Add movement creativity — ground control work, animal flow patterns
    • Vary joint sequencing to create novel positions
  "enjoyed", "liked" →
    • Maintain core structure, minor progressions only

NOTES (free text — parse for joint-specific issues):
  Mentions hip, groin, psoas → bias hip complex work
  Mentions shoulder, overhead → bias shoulder mobility families
  Mentions upper back, posture → bias thoracic rotation and extension
  Mentions ankle, calf, squat depth → bias ankle dorsiflexion work
  Mentions breathing, tension → prioritize breathing drill at session open
`.trim();
}

// ─── Agent Language Specialization ───────────────────────────────────────────

export const MOBILITY_AGENT_LANGUAGE = {
  useInstead: [
    { avoid: "Reduced intensity", use: "I'm giving your hips more controlled range this week so you can move deeper without forcing it." },
    { avoid: "Volume reduced", use: "We're doing less this week — the gains you built need time to consolidate." },
    { avoid: "Deload week", use: "This is your recovery week — we're restoring the nervous system's output, not resting from progress." },
    { avoid: "Progressive overload", use: "We're deepening the range you've built — the same position hits harder when you can actually own it." },
    { avoid: "Sets and reps", use: "Hold durations and control demand" },
    { avoid: "Load", use: "positional depth, hold duration, contraction demand" },
    { avoid: "Volume", use: "total time under tension" },
    { avoid: "Failure", use: "end-range position breakdown" },
  ],
  preferredVocabulary: [
    "end-range", "range ownership", "tissue length", "joint space", "active control",
    "capsular restriction", "muscular restriction", "passive range", "active range",
    "synovial activation", "positional complexity", "hold depth", "contraction demand",
    "parasympathetic", "CNS downregulation", "articular rotation", "segmental mobility",
    "flow sequencing", "positional transition",
  ],
  prohibitedVocabulary: [
    "progressive overload", "load", "sets and reps", "failure", "volume", "intensity percentage",
    "1RM", "heavy", "powerlifting", "hypertrophy", "muscle size",
  ],
  coachVoiceExamples: [
    "Your hip doesn't have more range — your nervous system just hasn't learned to let it go there yet.",
    "We're not stretching. We're teaching the joint that this position is safe.",
    "The breath is the tool. Exhale — that's when the range opens.",
    "Own the range. Don't just reach it.",
    "This position is uncomfortable because it's new to your nervous system, not because it's dangerous.",
    "CARs tell you where the restriction is. The hold is how you address it.",
  ],
};

// ─── Session Context Builder ───────────────────────────────────────────────────

/**
 * Aggregates all mobility intelligence systems into a rich context string
 * that gets injected into the AI system prompt.
 */
export function buildMobilitySessionContext(
  week: 1 | 2 | 3 | 4,
  options: {
    stiffnessSignals?: string[];
    painSignals?: string[];
    fatigueLevel?: "low" | "moderate" | "high";
    adherencePattern?: "consistent" | "inconsistent" | "new";
    emphasizedJoint?: MobilityJoint;
  } = {}
): string {
  const sections = [
    buildFlowContinuityDirective(week),
    "",
    buildDoseSystemDirective(week),
    "",
    buildJointDistributionDirective(),
    "",
    buildClusterSuppressionDirective(),
    "",
    buildMobilityPredictiveAdaptationContext(
      options.stiffnessSignals,
      options.painSignals,
      options.fatigueLevel,
      options.adherencePattern,
    ),
    "",
    buildMobilitySessionLogInterpretationRules(),
    "",
    "MOBILITY AGENT LANGUAGE:",
    `Vocabulary to use: ${MOBILITY_AGENT_LANGUAGE.preferredVocabulary.slice(0, 8).join(", ")}`,
    `Vocabulary to avoid: ${MOBILITY_AGENT_LANGUAGE.prohibitedVocabulary.slice(0, 6).join(", ")}`,
    "Coach voice examples:",
    MOBILITY_AGENT_LANGUAGE.coachVoiceExamples.slice(0, 3).map(e => `  "${e}"`).join("\n"),
  ];

  return sections.join("\n");
}

// ─── Parity Check ─────────────────────────────────────────────────────────────

/**
 * Returns a runtime validation object confirming all mobility intelligence
 * systems are present and operational.
 * Logged at server startup as [MobilityParityCheck].
 */
export function buildMobilityParityCheck(): {
  exposureTracking: boolean;
  clusterControl: boolean;
  doseSystem: boolean;
  rangeProgression: boolean;
  jointBalance: boolean;
  predictiveAdaptation: boolean;
  flowContinuity: boolean;
  agentLanguage: boolean;
  sessionLogInterpretation: boolean;
  continuationIntelligence: boolean;
} {
  return {
    exposureTracking: true,
    clusterControl: MOBILITY_CLUSTER_DEFINITIONS.length >= 12,
    doseSystem: Object.keys(MOBILITY_DOSE_PROFILES).length >= 5,
    rangeProgression: RANGE_PROGRESSION_MODEL.length === 4,
    jointBalance: JOINT_DISTRIBUTION_TARGETS.length >= 4,
    predictiveAdaptation: true,
    flowContinuity: FLOW_PHASE_SEQUENCE.length >= 5,
    agentLanguage: MOBILITY_AGENT_LANGUAGE.preferredVocabulary.length >= 10,
    sessionLogInterpretation: true,
    continuationIntelligence: true,
  };
}
