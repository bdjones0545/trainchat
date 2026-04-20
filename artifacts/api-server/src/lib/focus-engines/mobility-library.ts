/**
 * Mobility Exercise Library
 *
 * Full metadata-driven exercise library for the Mobility Focus Engine.
 * Matches the architecture of Strength and Speed library systems.
 *
 * Architecture:
 *  - MobilityMovementFamily: 10 primary movement families
 *  - MobilityQuality: 9 quality tags per exercise
 *  - MobilitySlotType: 7 session slot positions
 *  - MobilityWeekRole: 4-week expression model (establish/build/intensify/deload)
 *  - neuralDemand / fatigueCost: low / moderate / high
 *  - scoreMobilityCandidateForSlot(): weighted scoring for library-driven selection
 *  - buildMobilityLibraryCoverageAudit(): validation of library coverage
 */

import type { MobilityJoint } from "./mobility-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MobilityMovementFamily =
  | "hip_mobility"
  | "thoracic_mobility"
  | "ankle_mobility"
  | "shoulder_mobility"
  | "spine_control"
  | "breathing_reset"
  | "tissue_prep"
  | "positional_isometric"
  | "dynamic_mobility"
  | "recovery_flow";

export type MobilityQuality =
  | "range_of_motion"
  | "joint_capsule"
  | "soft_tissue"
  | "neuromuscular_control"
  | "stability"
  | "coordination"
  | "decompression"
  | "activation"
  | "recovery";

export type MobilitySlotType =
  | "breathing"
  | "prep"
  | "primary_mobility"
  | "secondary_mobility"
  | "control"
  | "integration"
  | "flow";

export type MobilityWeekRole = "establish" | "build" | "intensify" | "deload";

export type NeuralDemand = "low" | "moderate" | "high";
export type FatigueCost = "low" | "moderate" | "high";

export interface MobilityExercise {
  name: string;
  family: MobilityMovementFamily;
  primaryJoint: MobilityJoint;
  qualities: MobilityQuality[];
  slotCompatibility: MobilitySlotType[];
  neuralDemand: NeuralDemand;
  fatigueCost: FatigueCost;
  weekRoles: MobilityWeekRole[];
  reps: string;
  notes: string;
  rest: string;
  clusterIds?: string[];
}

// ─── Mobility Exercise Library ─────────────────────────────────────────────────

export const MOBILITY_EXERCISE_LIBRARY: MobilityExercise[] = [

  // ── BREATHING RESET ───────────────────────────────────────────────────────

  {
    name: "Crocodile Breathing",
    family: "breathing_reset",
    primaryJoint: "breathing",
    qualities: ["decompression", "recovery", "activation"],
    slotCompatibility: ["breathing", "flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "6 deep breaths prone",
    notes: "Feel 360-degree rib expansion on each inhale — belly and back rise equally. This is your nervous system entry signal.",
    rest: "30s",
    clusterIds: ["breathing_reset_cluster"],
  },
  {
    name: "90/90 Breathing Hold",
    family: "breathing_reset",
    primaryJoint: "breathing",
    qualities: ["decompression", "neuromuscular_control", "recovery"],
    slotCompatibility: ["breathing", "control", "flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 deep breath cycles",
    notes: "Breathe through the position — exhale fully to engage deep core without bracing. This is your nervous system reset.",
    rest: "30s",
    clusterIds: ["breathing_reset_cluster"],
  },
  {
    name: "Box Breathing",
    family: "breathing_reset",
    primaryJoint: "breathing",
    qualities: ["decompression", "recovery"],
    slotCompatibility: ["breathing", "flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 rounds (4-4-4-4)",
    notes: "4 seconds in, 4 hold, 4 out, 4 hold — parasympathetic reset before the recovery exit.",
    rest: "30s",
    clusterIds: ["breathing_reset_cluster"],
  },
  {
    name: "Diaphragmatic Breathing Drill",
    family: "breathing_reset",
    primaryJoint: "breathing",
    qualities: ["decompression", "activation", "recovery"],
    slotCompatibility: ["breathing", "flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 deep breaths",
    notes: "Belly rises first, then rib cage — exhale fully before the next inhale. Hands on belly and chest to confirm pattern.",
    rest: "30s",
    clusterIds: ["breathing_reset_cluster"],
  },
  {
    name: "Supine Breathing Reset",
    family: "breathing_reset",
    primaryJoint: "breathing",
    qualities: ["decompression", "recovery"],
    slotCompatibility: ["breathing", "flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 deep breaths",
    notes: "Exhale fully, let the body sink into the ground between breaths. No effort — purely receptive.",
    rest: "30s",
    clusterIds: ["breathing_reset_cluster"],
  },

  // ── TISSUE PREP ───────────────────────────────────────────────────────────

  {
    name: "Foam Roll Quads",
    family: "tissue_prep",
    primaryJoint: "hip",
    qualities: ["soft_tissue", "activation"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Move slowly and with control — pause on tight spots and breathe through the position.",
    rest: "15s",
  },
  {
    name: "Thoracic Extension Foam Roll",
    family: "tissue_prep",
    primaryJoint: "spine",
    qualities: ["soft_tissue", "range_of_motion"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds (T4–T10)",
    notes: "Focus on range quality, not intensity — let gravity do the work. Move one vertebral level at a time.",
    rest: "15s",
    clusterIds: ["thoracic_extension_cluster"],
  },
  {
    name: "Lacrosse Ball Glute Release",
    family: "tissue_prep",
    primaryJoint: "hip",
    qualities: ["soft_tissue", "decompression"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Explore end range without forcing — breathe through the position and wait for the tissue to release.",
    rest: "15s",
  },
  {
    name: "Calf Foam Roll",
    family: "tissue_prep",
    primaryJoint: "ankle",
    qualities: ["soft_tissue", "activation"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Stay relaxed but controlled — pause on dense areas and breathe through the position.",
    rest: "15s",
  },
  {
    name: "Hamstring Foam Roll",
    family: "tissue_prep",
    primaryJoint: "hip",
    qualities: ["soft_tissue", "decompression"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Move slowly and with control — let the tissue release between passes.",
    rest: "15s",
  },
  {
    name: "Lacrosse Ball Pec Minor",
    family: "tissue_prep",
    primaryJoint: "shoulder",
    qualities: ["soft_tissue", "decompression"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Explore end range without forcing — breathe into the restriction and wait for the release.",
    rest: "15s",
  },
  {
    name: "IT Band Foam Roll",
    family: "tissue_prep",
    primaryJoint: "hip",
    qualities: ["soft_tissue"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Stay relaxed but controlled — pressure without aggressive forcing. Move from hip to knee slowly.",
    rest: "15s",
  },
  {
    name: "Thoracic Foam Roll Side-to-Side",
    family: "tissue_prep",
    primaryJoint: "spine",
    qualities: ["soft_tissue", "range_of_motion"],
    slotCompatibility: ["prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Let the thoracic segment open laterally — exhale to deepen on each pass.",
    rest: "15s",
  },

  // ── HIP MOBILITY ──────────────────────────────────────────────────────────

  {
    name: "90/90 Hip Stretch",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "joint_capsule"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Exhale to deepen — explore end range without forcing. Sit tall through the spine throughout.",
    rest: "15s",
    clusterIds: ["hip_rotation_cluster"],
  },
  {
    name: "Couch Stretch",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Posterior pelvic tilt to open hip flexor — breathe through the position. Don't arch the lower back.",
    rest: "15s",
    clusterIds: ["hip_flexor_cluster"],
  },
  {
    name: "Frog Stretch",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "joint_capsule"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds",
    notes: "Stay relaxed but controlled — exhale slowly to find more range. No forcing.",
    rest: "15s",
    clusterIds: ["hip_articulation_cluster"],
  },
  {
    name: "Pigeon Stretch",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "90 seconds each side",
    notes: "Stay relaxed but controlled — exhale to sink deeper into the position. Back knee should be comfortable.",
    rest: "15s",
    clusterIds: ["hip_rotation_cluster"],
  },
  {
    name: "Hip CARs",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["joint_capsule", "neuromuscular_control", "range_of_motion"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 slow full-circle reps each direction",
    notes: "Move slowly and with control — note where the range breaks down. This is diagnostic AND training.",
    rest: "15-30s",
    clusterIds: ["hip_articulation_cluster"],
  },
  {
    name: "Hip PAILs/RAILs",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "range_of_motion", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "10 seconds at 20% contraction each side",
    notes: "Never force contraction into pain — 20% effort, never maximal. Feel the joint space expand on the relaxation phase.",
    rest: "30s",
    clusterIds: ["hip_pails_cluster"],
  },
  {
    name: "Adductor Rockback",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Move slowly and with control — feel the inner thigh lengthen on each exhale.",
    rest: "15s",
    clusterIds: ["hip_articulation_cluster"],
  },
  {
    name: "90/90 Active Posterior Lift",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "range_of_motion", "activation"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "3 × 5 each side",
    notes: "Active lift reveals nervous system ownership of range — slow lift, full internal rotation at the top.",
    rest: "15s",
    clusterIds: ["hip_pails_cluster", "hip_rotation_cluster"],
  },
  {
    name: "Hip Airplane",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "stability", "coordination"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "3 × 5 each side",
    notes: "Move slowly and with control — this trains active hip IR/ER control in single-leg stance.",
    rest: "15s",
  },
  {
    name: "Figure-4 Hip Stretch",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "joint_capsule"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Exhale to deepen — flex foot to protect knee. Let gravity open the hip external rotators.",
    rest: "15s",
    clusterIds: ["hip_rotation_cluster"],
  },
  {
    name: "Deep Squat Hold",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "joint_capsule"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds",
    notes: "Chest tall, knees track over toes — use door frame for balance if needed. Breathe through the position.",
    rest: "15s",
    clusterIds: ["hip_flexor_cluster"],
  },
  {
    name: "Hip Flexor Stretch Kneeling",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Posterior pelvic tilt first — tuck the pelvis before leaning forward. Don't extend the lower back.",
    rest: "15s",
    clusterIds: ["hip_flexor_cluster"],
  },
  {
    name: "Hip Internal Rotation End-Range Hold",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "neuromuscular_control"],
    slotCompatibility: ["control", "secondary_mobility"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "45–60 seconds each side",
    notes: "Breathe through the position — find your available IR range, then hold it with intent. Slight muscle activation to hold, not passive hang.",
    rest: "20s",
    clusterIds: ["hip_pails_cluster", "hip_rotation_cluster"],
  },
  {
    name: "Adductor CARs",
    family: "hip_mobility",
    primaryJoint: "hip",
    qualities: ["joint_capsule", "neuromuscular_control"],
    slotCompatibility: ["control", "primary_mobility"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "3 slow circles each direction each side",
    notes: "Move slowly and with control — small, precise articulation of the adductor compartment. Feel the femoral head moving.",
    rest: "15s",
    clusterIds: ["hip_articulation_cluster"],
  },

  // ── THORACIC MOBILITY ─────────────────────────────────────────────────────

  {
    name: "Quadruped Thoracic Rotation",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "coordination"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "The spine leads, not the arm — isolate thoracic from lumbar. Only the rib cage rotates.",
    rest: "15s",
    clusterIds: ["thoracic_rotation_cluster"],
  },
  {
    name: "Open Book Stretch",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Move slowly and with control — breathe through the rotation. Stacked knees stay on the ground.",
    rest: "15s",
    clusterIds: ["thoracic_rotation_cluster"],
  },
  {
    name: "Thread the Needle",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Focus on range quality, not intensity — let the shoulder fall naturally. Breathe through the position.",
    rest: "15s",
    clusterIds: ["thoracic_rotation_cluster"],
  },
  {
    name: "Thoracic CARs",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["joint_capsule", "neuromuscular_control", "range_of_motion"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 each direction",
    notes: "Move slowly and with control — isolate thoracic from lumbar. This is diagnostic for segmental mobility.",
    rest: "15-30s",
    clusterIds: ["thoracic_cars_cluster"],
  },
  {
    name: "Thoracic CARs with Dowel",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["joint_capsule", "neuromuscular_control"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "3 each direction",
    notes: "Dowel across shoulders cues isolation of thoracic from lumbar — slow, full articulation each rep.",
    rest: "15-30s",
    clusterIds: ["thoracic_cars_cluster"],
  },
  {
    name: "Side-Lying T-Spine Rotation",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Let the top arm fall with gravity — exhale to deepen the rotation.",
    rest: "15s",
    clusterIds: ["thoracic_rotation_cluster"],
  },
  {
    name: "Rib Roll",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "coordination"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 slow reps each direction",
    notes: "Breathe through the movement — rib cage leads the rotation. This is about segmental articulation.",
    rest: "15s",
    clusterIds: ["thoracic_rotation_cluster"],
  },
  {
    name: "Cat-Cow",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "activation"],
    slotCompatibility: ["primary_mobility", "secondary_mobility", "prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 slow controlled reps",
    notes: "Move slowly and with control — full spinal flexion and extension each rep. Breathe: inhale to extend, exhale to flex.",
    rest: "15s",
    clusterIds: ["thoracic_extension_cluster"],
  },
  {
    name: "T-Spine Extension on Ball",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "soft_tissue", "decompression"],
    slotCompatibility: ["primary_mobility", "prep"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds",
    notes: "Let gravity do the work — arms overhead increases the extension stimulus. Breathe slowly.",
    rest: "15s",
    clusterIds: ["thoracic_extension_cluster"],
  },
  {
    name: "Segmental Rolling",
    family: "thoracic_mobility",
    primaryJoint: "spine",
    qualities: ["soft_tissue", "neuromuscular_control", "coordination"],
    slotCompatibility: ["prep", "primary_mobility"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "5 full rolls from floor to sitting",
    notes: "Move slowly and with control — vertebra by vertebra. Loss of segmental articulation reveals mobility restrictions.",
    rest: "20s",
    clusterIds: ["thoracic_extension_cluster"],
  },

  // ── SHOULDER MOBILITY ─────────────────────────────────────────────────────

  {
    name: "Shoulder CARs",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["joint_capsule", "neuromuscular_control", "range_of_motion"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 slow full-circle reps each direction",
    notes: "Move slowly and with control — note impingement positions. This is diagnostic and therapeutic.",
    rest: "15-30s",
    clusterIds: ["shoulder_cars_cluster"],
  },
  {
    name: "Wall Slides",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["neuromuscular_control", "range_of_motion", "activation"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 slow reps",
    notes: "Keep back of hands and forearms on wall throughout — scapular upward rotation is the output.",
    rest: "15s",
    clusterIds: ["shoulder_cars_cluster"],
  },
  {
    name: "Sleeper Stretch",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "joint_capsule", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds each side",
    notes: "Explore end range without forcing — differentiate muscle tension from joint discomfort.",
    rest: "15s",
    clusterIds: ["shoulder_posterior_cluster"],
  },
  {
    name: "Cross-Body Shoulder Stretch",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Pull the arm across at shoulder height — keep shoulder down, not shrugged.",
    rest: "15s",
    clusterIds: ["shoulder_posterior_cluster"],
  },
  {
    name: "Band Shoulder Distraction",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["joint_capsule", "decompression"],
    slotCompatibility: ["primary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Distraction opens joint capsule — let the band do the work, don't resist it.",
    rest: "15s",
    clusterIds: ["shoulder_posterior_cluster"],
  },
  {
    name: "Doorway Chest Stretch",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Breathe through the position — exhale deepens the anterior capsule release. Three arm positions: low, middle, high.",
    rest: "15s",
    clusterIds: ["shoulder_anterior_cluster"],
  },
  {
    name: "Pec Minor Stretch",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Focus on the coracoid process — this is not a chest stretch. Breathe and let the pec minor release.",
    rest: "15s",
    clusterIds: ["shoulder_anterior_cluster"],
  },
  {
    name: "Banded Pass-Through",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "coordination", "activation"],
    slotCompatibility: ["primary_mobility", "integration"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 slow reps",
    notes: "Grip width determines challenge — start wide. Never force through impingement.",
    rest: "15s",
    clusterIds: ["shoulder_anterior_cluster"],
  },
  {
    name: "Overhead Lat Stretch",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Focus on range quality — breathe through the position. Lat length drives overhead mobility.",
    rest: "15s",
    clusterIds: ["shoulder_cars_cluster"],
  },
  {
    name: "Shoulder PAILs/RAILs",
    family: "shoulder_mobility",
    primaryJoint: "shoulder",
    qualities: ["neuromuscular_control", "range_of_motion", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "10 seconds at 20% contraction each side",
    notes: "Light effort, not maximal — 20% contraction into the restriction. Feel the joint space expand on the relaxation phase.",
    rest: "30s",
    clusterIds: ["shoulder_cars_cluster"],
  },

  // ── ANKLE MOBILITY ────────────────────────────────────────────────────────

  {
    name: "Wall Ankle Stretch",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["range_of_motion", "joint_capsule"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Knee tracks over third toe — breathe through the position. Move foot closer to wall to increase challenge.",
    rest: "15s",
    clusterIds: ["ankle_passive_cluster"],
  },
  {
    name: "Banded Ankle Distraction",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["joint_capsule", "decompression"],
    slotCompatibility: ["primary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60–90 seconds each side",
    notes: "Focus on range quality — joint capsule release takes sustained hold. Feel the talocrural joint open.",
    rest: "15s",
    clusterIds: ["ankle_passive_cluster"],
  },
  {
    name: "Ankle CARs",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["joint_capsule", "neuromuscular_control", "range_of_motion"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 slow full-circle reps each direction",
    notes: "Explore end range without forcing — note where dorsiflexion limits. Slow and deliberate full circle.",
    rest: "15-30s",
    clusterIds: ["ankle_active_cluster"],
  },
  {
    name: "Ankle PAILs/RAILs",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["neuromuscular_control", "range_of_motion", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "10 seconds at 20% contraction each side",
    notes: "Stay relaxed but controlled — feel the joint space open. Light effort into the restricted direction.",
    rest: "30s",
    clusterIds: ["ankle_active_cluster"],
  },
  {
    name: "Calf Stretch Straight Knee",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Targets gastrocnemius — breathe through the position. Heel stays on ground throughout.",
    rest: "15s",
    clusterIds: ["ankle_calf_cluster"],
  },
  {
    name: "Calf Stretch Bent Knee",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["range_of_motion", "soft_tissue"],
    slotCompatibility: ["primary_mobility", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "60 seconds each side",
    notes: "Targets soleus — explore end range without forcing. Slight knee bend changes the muscle being stretched.",
    rest: "15s",
    clusterIds: ["ankle_calf_cluster"],
  },
  {
    name: "Heel Drop",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["range_of_motion", "neuromuscular_control"],
    slotCompatibility: ["primary_mobility", "control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 × 10 slow reps each side",
    notes: "Slow eccentric drop — dorsiflexion under load trains active range. Control every millimeter.",
    rest: "20s",
    clusterIds: ["ankle_calf_cluster"],
  },
  {
    name: "Ankle Circles",
    family: "ankle_mobility",
    primaryJoint: "ankle",
    qualities: ["range_of_motion", "activation"],
    slotCompatibility: ["prep", "secondary_mobility"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 circles each direction each side",
    notes: "Full range without momentum — warm up the talocrural joint before loaded ankle work.",
    rest: "15s",
    clusterIds: ["ankle_calf_cluster"],
  },

  // ── SPINE CONTROL ─────────────────────────────────────────────────────────

  {
    name: "Bird Dog",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["stability", "neuromuscular_control", "coordination"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 × 8 slow reps each side",
    notes: "No lumbar extension compensation — spine stays neutral. Exhale as you extend arm and opposite leg.",
    rest: "15s",
  },
  {
    name: "Dead Bug",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["stability", "neuromuscular_control"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3 × 8 slow reps each side",
    notes: "Move slowly and with control — lower back stays in contact with floor. Exhale as limbs extend.",
    rest: "15s",
  },
  {
    name: "Hollow Body Hold",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["stability", "neuromuscular_control"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "3 × 20 seconds",
    notes: "Posterior pelvic tilt maintained throughout — lower back pressed into floor. Exhale to engage.",
    rest: "30s",
  },
  {
    name: "Pallof Press Isometric",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["stability", "neuromuscular_control"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "3 × 20 seconds each side",
    notes: "Stay relaxed but controlled — anti-rotation stability at the end range of shoulder reach.",
    rest: "20s",
  },
  {
    name: "Jefferson Curl",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "neuromuscular_control", "soft_tissue"],
    slotCompatibility: ["control", "primary_mobility"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["intensify"],
    reps: "3 × 5 slow reps (bodyweight)",
    notes: "Segmental spinal flexion under load — vertebra by vertebra from skull to sacrum. ONLY in Week 3 when control is established.",
    rest: "30s",
  },
  {
    name: "Side-Lying Breathing with Hip Stack",
    family: "spine_control",
    primaryJoint: "spine",
    qualities: ["neuromuscular_control", "decompression", "stability"],
    slotCompatibility: ["control", "breathing"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 deep breath cycles each side",
    notes: "Breathe into the top rib cage — feel lateral rib expansion. This integrates breathing pattern with trunk control.",
    rest: "20s",
  },

  // ── POSITIONAL ISOMETRIC ──────────────────────────────────────────────────

  {
    name: "Isometric Hip Flexor Hold",
    family: "positional_isometric",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "stability", "range_of_motion"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "3 × 30 seconds each side",
    notes: "Hold the end-range hip flexion position with active tension — feel the hip flexors working at their longest length.",
    rest: "20s",
  },
  {
    name: "Isometric Thoracic Rotation Hold",
    family: "positional_isometric",
    primaryJoint: "spine",
    qualities: ["neuromuscular_control", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "3 × 20 seconds each side",
    notes: "Rotate to end range, then press against resistance — isometric contraction without cheating range.",
    rest: "15s",
  },
  {
    name: "Wall Hip Flexion Isometric",
    family: "positional_isometric",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "activation", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify"],
    reps: "3 × 10 seconds each side",
    notes: "Press knee into wall at 90 degrees — active hip flexion isometric. Feel the deep hip flexors fire.",
    rest: "15s",
  },
  {
    name: "Isometric Shoulder External Rotation",
    family: "positional_isometric",
    primaryJoint: "shoulder",
    qualities: ["neuromuscular_control", "stability", "activation"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify"],
    reps: "3 × 10 seconds each side",
    notes: "Press into door frame or wall at end range — rotator cuff control at the limit of available range.",
    rest: "15s",
  },
  {
    name: "Isometric Ankle Dorsiflexion Hold",
    family: "positional_isometric",
    primaryJoint: "ankle",
    qualities: ["neuromuscular_control", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "3 × 20 seconds each side",
    notes: "Hold dorsiflexion end-range against band resistance — train the anterior tibialis to control the acquired range.",
    rest: "15s",
  },
  {
    name: "Copenhagen Hip Adductor Isometric",
    family: "positional_isometric",
    primaryJoint: "hip",
    qualities: ["neuromuscular_control", "stability"],
    slotCompatibility: ["control"],
    neuralDemand: "high",
    fatigueCost: "high",
    weekRoles: ["intensify"],
    reps: "3 × 20 seconds each side",
    notes: "Loaded adductor isometric at end-range abduction — only in Week 3 when hip adductor tolerance is established.",
    rest: "30s",
  },

  // ── DYNAMIC MOBILITY ──────────────────────────────────────────────────────

  {
    name: "World's Greatest Stretch Flow",
    family: "dynamic_mobility",
    primaryJoint: "full_body",
    qualities: ["range_of_motion", "coordination", "activation"],
    slotCompatibility: ["integration"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 slow transitions each side",
    notes: "Move slowly and with control — full thoracic rotation at the top. Hip, spine, ankle all integrate here.",
    rest: "continuous",
    clusterIds: ["dynamic_flow_cluster"],
  },
  {
    name: "Spiderman Flow",
    family: "dynamic_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "coordination"],
    slotCompatibility: ["integration"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "5 each side",
    notes: "Focus on range quality — hip opens fully on each rep. Slow crawl, not a warm-up drill.",
    rest: "continuous",
    clusterIds: ["dynamic_flow_cluster"],
  },
  {
    name: "Inchworm to Squat",
    family: "dynamic_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "coordination", "soft_tissue"],
    slotCompatibility: ["integration"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "8 slow reps",
    notes: "Move slowly and with control — pause at full hamstring stretch each rep. Squat must be controlled.",
    rest: "continuous",
    clusterIds: ["dynamic_flow_cluster"],
  },
  {
    name: "Hip 90/90 Transition Flow",
    family: "dynamic_mobility",
    primaryJoint: "hip",
    qualities: ["range_of_motion", "coordination", "neuromuscular_control"],
    slotCompatibility: ["integration"],
    neuralDemand: "moderate",
    fatigueCost: "low",
    weekRoles: ["build", "intensify"],
    reps: "5 full transitions",
    notes: "Stay relaxed but controlled — smooth transition, no momentum. Each end position gets a 3-second hold.",
    rest: "continuous",
    clusterIds: ["dynamic_flow_cluster"],
  },
  {
    name: "T-Spine Rotation Flow",
    family: "dynamic_mobility",
    primaryJoint: "spine",
    qualities: ["range_of_motion", "coordination"],
    slotCompatibility: ["integration"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "10 each side",
    notes: "Move slowly and with control — breathe through the rotation. Rib cage leads, not the arm.",
    rest: "continuous",
    clusterIds: ["dynamic_flow_cluster"],
  },
  {
    name: "Ground Control Flow",
    family: "dynamic_mobility",
    primaryJoint: "full_body",
    qualities: ["range_of_motion", "coordination", "neuromuscular_control"],
    slotCompatibility: ["integration"],
    neuralDemand: "high",
    fatigueCost: "moderate",
    weekRoles: ["build", "intensify"],
    reps: "5-minute continuous flow",
    notes: "Transitions through hip rotations, side-lying, table-top, and quadruped — this synthesizes all session work.",
    rest: "none",
    clusterIds: ["dynamic_flow_cluster"],
  },

  // ── RECOVERY FLOW ─────────────────────────────────────────────────────────

  {
    name: "Child's Pose",
    family: "recovery_flow",
    primaryJoint: "spine",
    qualities: ["decompression", "recovery", "soft_tissue"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "90 seconds",
    notes: "Stay relaxed but controlled — breathe into the back body on each inhale. Arms can extend or rest alongside body.",
    rest: "15s",
    clusterIds: ["recovery_cluster"],
  },
  {
    name: "Supine Spinal Twist",
    family: "recovery_flow",
    primaryJoint: "spine",
    qualities: ["decompression", "recovery", "range_of_motion"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "90 seconds each side",
    notes: "Explore end range without forcing — exhale to deepen the rotation gently. Arms out in T position.",
    rest: "15s",
    clusterIds: ["recovery_cluster"],
  },
  {
    name: "Legs Up the Wall",
    family: "recovery_flow",
    primaryJoint: "full_body",
    qualities: ["decompression", "recovery"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "3–5 minutes",
    notes: "Move slowly and with control — parasympathetic restoration, no effort required. Breathe naturally.",
    rest: "none",
    clusterIds: ["recovery_cluster"],
  },
  {
    name: "Butterfly Stretch",
    family: "recovery_flow",
    primaryJoint: "hip",
    qualities: ["decompression", "recovery", "range_of_motion"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "90 seconds",
    notes: "Forward fold deepens adductor and inner hip release — breathe slowly and exhale to deepen.",
    rest: "15s",
    clusterIds: ["recovery_cluster"],
  },
  {
    name: "Forward Fold",
    family: "recovery_flow",
    primaryJoint: "spine",
    qualities: ["decompression", "recovery", "soft_tissue"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["establish", "build", "intensify", "deload"],
    reps: "90 seconds",
    notes: "Gentle spinal decompression — slight bend in knees if hamstrings are tight. Head and neck completely relaxed.",
    rest: "15s",
    clusterIds: ["recovery_cluster"],
  },
  {
    name: "Prone Hip Extension Hold",
    family: "recovery_flow",
    primaryJoint: "hip",
    qualities: ["decompression", "recovery", "range_of_motion"],
    slotCompatibility: ["flow"],
    neuralDemand: "low",
    fatigueCost: "low",
    weekRoles: ["deload"],
    reps: "90 seconds each side",
    notes: "Deload-specific recovery hold — gentle anterior hip decompression. No forcing, just gravity and breath.",
    rest: "15s",
    clusterIds: ["recovery_cluster"],
  },
];

// ─── Coverage Audit ────────────────────────────────────────────────────────────

export interface MobilityLibraryCoverageAudit {
  totalExercises: number;
  familyCoverage: Record<MobilityMovementFamily, number>;
  qualityCoverage: Record<MobilityQuality, number>;
  slotCoverage: Record<MobilitySlotType, number>;
  weekRoleCoverage: Record<MobilityWeekRole, number>;
  clusterDepth: number;
  weakFamilies: MobilityMovementFamily[];
  repeatRiskScore: number;
  neuralDemandDistribution: Record<NeuralDemand, number>;
  fatigueCostDistribution: Record<FatigueCost, number>;
}

export function buildMobilityLibraryCoverageAudit(): MobilityLibraryCoverageAudit {
  const lib = MOBILITY_EXERCISE_LIBRARY;

  const familyCoverage = {} as Record<MobilityMovementFamily, number>;
  const qualityCoverage = {} as Record<MobilityQuality, number>;
  const slotCoverage = {} as Record<MobilitySlotType, number>;
  const weekRoleCoverage = {} as Record<MobilityWeekRole, number>;
  const neuralDemandDistribution = { low: 0, moderate: 0, high: 0 };
  const fatigueCostDistribution = { low: 0, moderate: 0, high: 0 };

  for (const ex of lib) {
    familyCoverage[ex.family] = (familyCoverage[ex.family] ?? 0) + 1;
    for (const q of ex.qualities) qualityCoverage[q] = (qualityCoverage[q] ?? 0) + 1;
    for (const s of ex.slotCompatibility) slotCoverage[s] = (slotCoverage[s] ?? 0) + 1;
    for (const w of ex.weekRoles) weekRoleCoverage[w] = (weekRoleCoverage[w] ?? 0) + 1;
    neuralDemandDistribution[ex.neuralDemand]++;
    fatigueCostDistribution[ex.fatigueCost]++;
  }

  const weakFamilies = (Object.keys(familyCoverage) as MobilityMovementFamily[])
    .filter(f => (familyCoverage[f] ?? 0) < 4);

  // Repeat risk: exercises appearing in 2+ clusters / total library
  const clusterParticipants = lib.filter(e => (e.clusterIds?.length ?? 0) >= 2).length;
  const repeatRiskScore = Math.round((clusterParticipants / lib.length) * 100);

  // Cluster depth: average exercises per named cluster across library
  const clusterMap = new Map<string, number>();
  for (const ex of lib) {
    for (const cId of ex.clusterIds ?? []) {
      clusterMap.set(cId, (clusterMap.get(cId) ?? 0) + 1);
    }
  }
  const clusterDepth = clusterMap.size > 0
    ? Math.round(Array.from(clusterMap.values()).reduce((a, b) => a + b, 0) / clusterMap.size)
    : 0;

  return {
    totalExercises: lib.length,
    familyCoverage,
    qualityCoverage,
    slotCoverage,
    weekRoleCoverage,
    clusterDepth,
    weakFamilies,
    repeatRiskScore,
    neuralDemandDistribution,
    fatigueCostDistribution,
  };
}

// ─── scoreMobilityCandidateForSlot ─────────────────────────────────────────────

export interface MobilitySlotRequest {
  slotType: MobilitySlotType;
  targetJoint?: MobilityJoint;
  preferredQualities?: MobilityQuality[];
  weekRole: MobilityWeekRole;
  existingExerciseNames: Set<string>;
  exposedExerciseNames?: Set<string>;
}

export interface MobilityScoreResult {
  exercise: MobilityExercise;
  score: number;
  reasons: string[];
}

/**
 * Scores a single exercise candidate for a given slot request.
 *
 * Scoring dimensions:
 *   - Slot type match (primary gate)          0 or 10 pts
 *   - Target joint match                      0 or 4 pts
 *   - Quality match                           0–3 pts
 *   - Week role availability                  0 or 5 pts (or hard block)
 *   - Neural demand fit for week              0 or 2 pts
 *   - Fatigue cost fit for week               0 or 2 pts
 *   - Already used this session               -999 (hard block)
 *   - Prior exposure penalty                  0 to -6 pts
 *
 * Returns null score (-999) for hard blocks (slot mismatch, week restriction, duplicate).
 */
export function scoreMobilityCandidateForSlot(
  exercise: MobilityExercise,
  request: MobilitySlotRequest,
): MobilityScoreResult {
  const reasons: string[] = [];
  let score = 0;

  // Hard block: duplicate in current session
  if (request.existingExerciseNames.has(exercise.name.toLowerCase())) {
    return { exercise, score: -999, reasons: ["BLOCKED: already in session"] };
  }

  // Hard block: slot type not compatible
  if (!exercise.slotCompatibility.includes(request.slotType)) {
    return { exercise, score: -999, reasons: [`BLOCKED: slot ${request.slotType} not in compatibility [${exercise.slotCompatibility.join(",")}]`] };
  }

  // Hard block: week role not available
  if (!exercise.weekRoles.includes(request.weekRole)) {
    return { exercise, score: -999, reasons: [`BLOCKED: week role ${request.weekRole} not in availability [${exercise.weekRoles.join(",")}]`] };
  }

  // Slot match (confirmed above — bonus for being the right type)
  score += 10;
  reasons.push(`+10 slot match (${request.slotType})`);

  // Week role bonus
  score += 5;
  reasons.push(`+5 week role available (${request.weekRole})`);

  // Target joint match
  if (request.targetJoint) {
    if (exercise.primaryJoint === request.targetJoint) {
      score += 4;
      reasons.push(`+4 joint match (${request.targetJoint})`);
    } else if (exercise.primaryJoint === "full_body" || exercise.primaryJoint === "breathing") {
      score += 1;
      reasons.push(`+1 joint flexible (${exercise.primaryJoint})`);
    } else {
      score -= 1;
      reasons.push(`-1 joint mismatch (${exercise.primaryJoint} vs ${request.targetJoint})`);
    }
  }

  // Quality match
  if (request.preferredQualities && request.preferredQualities.length > 0) {
    const qMatches = exercise.qualities.filter(q => request.preferredQualities!.includes(q));
    const qScore = Math.min(3, qMatches.length);
    if (qScore > 0) {
      score += qScore;
      reasons.push(`+${qScore} quality match (${qMatches.join(",")})`);
    }
  }

  // Neural demand fit for week role
  // establish/deload: prefer low neural → penalize high
  // build: moderate is fine
  // intensify: moderate/high preferred
  const neuralFit = {
    establish: { low: 2, moderate: 0, high: -2 },
    build:     { low: 1, moderate: 2, high: 0 },
    intensify: { low: 0, moderate: 2, high: 2 },
    deload:    { low: 2, moderate: 0, high: -3 },
  }[request.weekRole][exercise.neuralDemand];
  if (neuralFit !== 0) {
    score += neuralFit;
    reasons.push(`${neuralFit > 0 ? "+" : ""}${neuralFit} neural demand (${exercise.neuralDemand} for ${request.weekRole})`);
  }

  // Fatigue cost fit for week role
  const fatigueFit = {
    establish: { low: 2, moderate: 0, high: -2 },
    build:     { low: 1, moderate: 2, high: -1 },
    intensify: { low: 0, moderate: 2, high: 1 },
    deload:    { low: 2, moderate: -1, high: -3 },
  }[request.weekRole][exercise.fatigueCost];
  if (fatigueFit !== 0) {
    score += fatigueFit;
    reasons.push(`${fatigueFit > 0 ? "+" : ""}${fatigueFit} fatigue cost (${exercise.fatigueCost} for ${request.weekRole})`);
  }

  // Exposure penalty: penalize if seen in prior sessions
  if (request.exposedExerciseNames?.has(exercise.name.toLowerCase())) {
    score -= 6;
    reasons.push("-6 prior exposure penalty");
  }

  return { exercise, score, reasons };
}

/**
 * Selects the best exercise from the full library for a given slot request.
 * Returns null if no valid candidates exist (all hard-blocked).
 */
export function selectBestMobilityExerciseForSlot(
  request: MobilitySlotRequest,
): MobilityExercise | null {
  const scores = MOBILITY_EXERCISE_LIBRARY
    .map(ex => scoreMobilityCandidateForSlot(ex, request))
    .filter(r => r.score > -100)
    .sort((a, b) => b.score - a.score);

  return scores.length > 0 ? scores[0].exercise : null;
}

/**
 * Returns all exercises from the library compatible with a given slot type
 * and week role, sorted by score for the given request.
 */
export function getRankedMobilityExercisesForSlot(
  request: MobilitySlotRequest,
): MobilityScoreResult[] {
  return MOBILITY_EXERCISE_LIBRARY
    .map(ex => scoreMobilityCandidateForSlot(ex, request))
    .filter(r => r.score > -100)
    .sort((a, b) => b.score - a.score);
}
