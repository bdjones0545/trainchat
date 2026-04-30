/**
 * Adaptive Micro-Reasoning Layer
 *
 * Generates short, truthful, coach-voiced explanations for key decisions
 * made during program generation or mutation.
 *
 * Rules (strictly enforced):
 *  1. Every reason is backed by actual system state — never invented.
 *  2. No internal system terminology exposed (no "hardConstraints",
 *     "penalty", "filter", "banned", "scoring", "engine", etc.).
 *  3. Each reason is one sentence, ≤ 20 words.
 *  4. Maximum 3 reasons per call.
 *  5. safeToShow is false when no evidence supports any reason.
 */

import type { HardConstraints } from "./constraint-memory";
import type { ActionContract } from "./action-contract";
import type { AdjustmentMutationPlan } from "./execution-planner";
import type { MutationVerificationResult } from "./mutation-verifier";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PenaltyRecord {
  exercise: string;
  reason: "banned" | "disliked" | "pain_region";
}

export interface MicroReasonContext {
  /** Primary training goal (strength, hypertrophy, athletic_performance, …) */
  goal?: string | null;
  /** Sport detected from user context (golf, rugby, swimming, …) */
  sport?: string | null;
  /** Equipment level or free-text description ("full_gym", "home_limited", "hotel gym") */
  equipmentProfile?: string | null;
  /** Persisted user hard constraints from cross-turn memory */
  hardConstraints?: HardConstraints | null;
  /** Action contract built for this turn */
  actionContract?: ActionContract | null;
  /** Mutation plan produced by the execution planner */
  mutationPlan?: AdjustmentMutationPlan | null;
  /** Mutation verification outcome */
  verificationResult?: MutationVerificationResult | null;
  /** Exercise names that were actually selected for the program */
  selectedExercises?: string[];
  /** Exercise names that were excluded due to constraints */
  filteredExercises?: string[];
  /** Exercises that received constraint-related scoring adjustments */
  penaltiesApplied?: PenaltyRecord[];
}

export interface MicroReasonEvidence {
  /** Category key — only used in dev audit logs, never shown to users */
  reasonType: string;
  /** Which system field this reason came from */
  evidenceSource: string;
  /** The actual value that triggered this reason */
  evidenceValue: unknown;
}

export interface MicroReasonResult {
  /** Coach-safe sentences to show in the UI (max 3) */
  reasons: string[];
  /** Backing evidence for each reason — for dev audit and alignment checks */
  evidence: MicroReasonEvidence[];
  /** false when no evidence was found for any reason — caller must not show them */
  safeToShow: boolean;
}

// ─── Guard: prohibited internal terms ────────────────────────────────────────
//
// Prevents technical language from leaking into user-facing reasons.
// Any reason that contains one of these strings is discarded.

const PROHIBITED_TERMS = [
  "hardConstraints",
  "softmax",
  "scoreCandidate",
  "penalty",
  "filter",
  "pool",
  "banned",
  "disliked",
  "equipment_level",
  "full_gym",
  "home_limited",
  "dumbbells_only",
  "bodyweight_only",
  "exercise-variation-engine",
  "constraint-memory",
  "micro-reasoning",
];

function isSafe(reason: string): boolean {
  const lower = reason.toLowerCase();
  return !PROHIBITED_TERMS.some((term) => lower.includes(term.toLowerCase()));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Readable label for a pain region. */
function painLabel(region: string): string {
  const map: Record<string, string> = {
    knee: "knee",
    shoulder: "shoulder",
    "lower back": "lower back",
    back: "lower back",
    hip: "hip",
    wrist: "wrist",
    elbow: "elbow",
    ankle: "ankle",
  };
  return map[region.toLowerCase().trim()] ?? region.toLowerCase().trim();
}

/** Readable emphasis label for a sport. */
function sportEmphasis(sport: string): string {
  const map: Record<string, string> = {
    golf: "rotational hip and core strength",
    swimming: "shoulder stability and pulling strength",
    rugby: "explosive power and contact strength",
    football: "speed, power, and reactive strength",
    soccer: "endurance, speed, and lower-body power",
    basketball: "vertical power and reactive agility",
    tennis: "rotational strength and court movement",
    baseball: "rotational power and shoulder health",
    cycling: "lower-body endurance and hip drive",
    rowing: "posterior chain strength and pulling endurance",
    wrestling: "full-body strength and positional control",
    climbing: "grip strength and upper-body pulling",
    volleyball: "vertical power and shoulder stability",
    martial_arts: "power, agility, and posterior chain strength",
    hockey: "lower-body power and lateral quickness",
    crossfit: "broad conditioning and movement efficiency",
  };
  const key = sport.toLowerCase().replace(/[_\s]+/g, "_");
  return map[key] ?? "sport-specific movement quality";
}

/** True when the equipment string signals a constrained environment. */
function isConstrainedEquipment(profile: string): boolean {
  return /home|dumbbell|hotel|travel|bodyweight|limited|minimal/i.test(profile);
}

/** True when a term reads like equipment (not an exercise name). */
function looksLikeEquipment(term: string): boolean {
  return /squat rack|barbell|cable|machine|belt squat|smith|sled|pull.?up bar|trap bar|hex bar|kettlebell|rings|specialty/i.test(term);
}

/** Capitalise the first letter of a string. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Individual reason generators ─────────────────────────────────────────────
//
// Each returns { reason: string; evidence: MicroReasonEvidence } | null.
// null means insufficient evidence — caller skips this reason.

interface ReasonCandidate {
  reason: string;
  evidence: MicroReasonEvidence;
}

function bannedItemReason(
  bannedItems: string[],
  filteredExercises: string[],
): ReasonCandidate | null {
  // Evidence: something was actually in bannedItems
  if (bannedItems.length === 0) return null;

  // Choose the most specific item to name in the reason
  const item = bannedItems[0];

  const reason = looksLikeEquipment(item)
    ? `I avoided ${cap(item)} since you mentioned you don't have one.`
    : `I left out ${cap(item)} since you asked me to avoid it.`;

  return {
    reason,
    evidence: {
      reasonType: "banned_item",
      evidenceSource: "hardConstraints.bannedItems",
      evidenceValue: bannedItems,
    },
  };
}

function dislikedItemReason(
  dislikedItems: string[],
  penaltiesApplied: PenaltyRecord[],
): ReasonCandidate | null {
  if (dislikedItems.length === 0) return null;

  const item = dislikedItems[0];
  const reason = `I skipped ${cap(item)} since you mentioned you prefer to avoid it.`;

  return {
    reason,
    evidence: {
      reasonType: "disliked_item",
      evidenceSource: "hardConstraints.dislikedItems",
      evidenceValue: dislikedItems,
    },
  };
}

function painRegionReason(
  painRegions: string[],
): ReasonCandidate | null {
  if (painRegions.length === 0) return null;

  const region = painLabel(painRegions[0]);

  // Phrasing table by region
  const phrases: Record<string, string> = {
    knee: `I reduced knee-dominant loading based on your knee note.`,
    shoulder: `I kept overhead loading minimal based on your shoulder note.`,
    "lower back": `I avoided high-spinal-load exercises based on your lower back note.`,
    hip: `I worked around deep hip flexion based on your hip note.`,
    wrist: `I kept extreme wrist positions minimal based on your wrist note.`,
    elbow: `I reduced elbow-stress exercises based on your elbow note.`,
    ankle: `I avoided high-impact landing work based on your ankle note.`,
  };

  const reason = phrases[region] ?? `I adjusted loading around your ${region} note.`;

  return {
    reason,
    evidence: {
      reasonType: "pain_region",
      evidenceSource: "hardConstraints.painRegions",
      evidenceValue: painRegions,
    },
  };
}

function sportBiasReason(sport: string | null | undefined): ReasonCandidate | null {
  if (!sport) return null;

  const label = sportLabel(sport);
  const emphasis = sportEmphasis(sport);
  const reason = `I structured this with ${label} in mind, emphasizing ${emphasis}.`;

  return {
    reason,
    evidence: {
      reasonType: "sport_bias",
      evidenceSource: "sport",
      evidenceValue: sport,
    },
  };
}

/** Convert a sport string to a human-readable label. */
function sportLabel(sport: string): string {
  return sport.toLowerCase().replace(/_/g, " ");
}

function equipmentProfileReason(
  equipmentProfile: string | null | undefined,
): ReasonCandidate | null {
  if (!equipmentProfile) return null;
  if (!isConstrainedEquipment(equipmentProfile)) return null;

  const isHome = /home/i.test(equipmentProfile);
  const isHotel = /hotel|travel/i.test(equipmentProfile);
  const isDumbbells = /dumbbell/i.test(equipmentProfile);
  const isBodyweight = /bodyweight/i.test(equipmentProfile);

  let reason: string;
  if (isHotel) {
    reason = "I kept this dumbbell and bodyweight-based since you're training away from home.";
  } else if (isDumbbells) {
    reason = "I kept this dumbbell-focused since that's the equipment you have available.";
  } else if (isBodyweight) {
    reason = "I built this around bodyweight movements since no equipment is available.";
  } else if (isHome) {
    reason = "I used common equipment to fit your home setup.";
  } else {
    reason = "I used exercises that match your available equipment.";
  }

  return {
    reason,
    evidence: {
      reasonType: "equipment_profile",
      evidenceSource: "equipmentProfile",
      evidenceValue: equipmentProfile,
    },
  };
}

function mutationReason(
  mutationPlan: AdjustmentMutationPlan | null | undefined,
  verificationResult: MutationVerificationResult | null | undefined,
): ReasonCandidate | null {
  if (!mutationPlan || !verificationResult) return null;

  // Only generate if mutation was verified
  if (!verificationResult.verified) return null;

  const { mutationType, intentFamily } = mutationPlan;

  const reasonByIntent: Partial<Record<string, string>> = {
    exercise_swap: "I swapped the exercise to something that fits your current setup better.",
    adjust_for_pain: "I adjusted the exercises to reduce stress on the affected area.",
    reduce_fatigue: "I lightened the session to give your body more room to recover.",
    increase_intensity: "I increased the challenge to match where you are right now.",
    equipment_constraint: "I rebuilt the session around the equipment you have available.",
    deload_week: "I dialled back the intensity this week to let you recover fully.",
    change_frequency: "I adjusted the training frequency to fit your schedule.",
    add_exercise: "I added an exercise that supports your goal without overloading the session.",
    remove_exercise: "I removed that exercise and balanced the rest of the session accordingly.",
  };

  const reason = reasonByIntent[intentFamily] ?? reasonByIntent[mutationType] ?? null;
  if (!reason) return null;

  return {
    reason,
    evidence: {
      reasonType: "mutation",
      evidenceSource: "mutationPlan.intentFamily",
      evidenceValue: { intentFamily, mutationType, verifiedChanges: verificationResult.verifiedChanges },
    },
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Builds at most 3 micro-reasons for key decisions made during this turn.
 *
 * Only includes reasons backed by real system state. Returns safeToShow:false
 * when no evidence is found — callers must check this before displaying.
 *
 * Reason priority order (first 3 with evidence are used):
 *   1. Banned items        → "I avoided X since you don't have one."
 *   2. Pain regions        → "I reduced knee-dominant loading…"
 *   3. Sport bias          → "I structured this with golf in mind…"
 *   4. Equipment profile   → "I kept this dumbbell-focused…"
 *   5. Disliked items      → "I skipped X since you prefer to avoid it."
 *   6. Mutation outcome    → "I swapped the exercise to fit your setup."
 */
export function buildMicroReasons(ctx: MicroReasonContext): MicroReasonResult {
  const {
    goal,
    sport,
    equipmentProfile,
    hardConstraints,
    mutationPlan,
    verificationResult,
    selectedExercises = [],
    filteredExercises = [],
    penaltiesApplied = [],
  } = ctx;

  const banned = hardConstraints?.bannedItems ?? [];
  const disliked = hardConstraints?.dislikedItems ?? [];
  const painRegions = hardConstraints?.painRegions ?? [];

  // Collect all candidate reasons in priority order
  const candidates: ReasonCandidate[] = [
    bannedItemReason(banned, filteredExercises),
    painRegionReason(painRegions),
    sportBiasReason(sport),
    equipmentProfileReason(equipmentProfile),
    dislikedItemReason(disliked, penaltiesApplied),
    mutationReason(mutationPlan, verificationResult),
  ].filter((r): r is ReasonCandidate => r !== null);

  // Apply safety filter — remove any reason containing prohibited terms
  const safe = candidates.filter((c) => isSafe(c.reason));

  // Cap at 3
  const selected = safe.slice(0, 3);

  if (selected.length === 0) {
    return { reasons: [], evidence: [], safeToShow: false };
  }

  return {
    reasons: selected.map((c) => c.reason),
    evidence: selected.map((c) => c.evidence),
    safeToShow: true,
  };
}
