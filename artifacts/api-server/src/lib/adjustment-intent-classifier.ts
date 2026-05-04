/**
 * Adjustment Intent Classifier
 *
 * Richer classification layer on top of the intent family engine.
 * Produces a structured output shape with extracted entities, persistence
 * type, mutation type, safety flags, and clarification requirements.
 *
 * Used by planAdjustmentExecution() to build a precise execution plan
 * that the mutation verifier can validate deterministically.
 *
 * Core rule: classification never triggers mutations. It only describes intent.
 */

import {
  normalizeToIntentFamily,
  type IntentFamily,
  type IntentFamilyResult,
} from "./intent-family-engine";
import type { FocusMode } from "./focus-engines/engine-interface";

// ─── Output Shape ─────────────────────────────────────────────────────────────

export type PersistenceType =
  | "permanent"      // stored constraint — affects all future programs
  | "temporary"      // today / this session only
  | "session_scope"  // current session only, permanent record
  | "program_scope"  // whole active program, no future rebuild
  | "context_update" // updates user context / preferences
  | "none";          // informational / no persistence needed

export type MutationType =
  | "substitute"              // swap one exercise for another
  | "remove"                  // delete an exercise or block
  | "add"                     // insert an exercise or block
  | "reduce"                  // reduce sets/reps/load/rest
  | "increase"                // increase sets/reps/load/rest
  | "reorder"                 // change exercise order
  | "reorient"                // shift training emphasis / bias
  | "deload"                  // reduce volume+intensity systematically
  | "adapt_env"               // adapt session to temporary environment
  | "store_context"           // store preference/context, no structural change
  | "bulk_session_adjustment" // deterministic bulk set delta across all exercises in a session
  | "none";

export type SafetyFlag =
  | "pain_adjacent"       // user mentions pain/discomfort — do not increase load
  | "injury_risk"         // re-entry or high-fatigue — conservative approach required
  | "deconditioning"      // extended break — assume fitness loss
  | "temporary_only"      // must NOT write permanent constraint
  | "preference_stored"   // user preference must be recorded for future programs
  | "sport_bias_required" // sport context must influence exercise selection
  | "no_rebuild"          // must NOT trigger full program rebuild
  | "clarify_before_act"; // must ask before mutating

export interface ExtractedEntities {
  targetExercise?: string;        // e.g. "lunges", "deadlift"
  targetEquipment?: string;       // e.g. "barbell", "cable machine"
  targetBodyRegion?: string;      // e.g. "knee", "shoulder", "hip"
  targetSport?: string;           // e.g. "golf", "basketball", "bjj"
  breakDuration?: string;         // e.g. "two weeks", "a month"
  environment?: string;           // e.g. "hotel", "home", "garage"
  preferenceDirection?: "like" | "dislike" | "avoid" | "prefer";
  readinessSignal?: string;       // e.g. "low HRV", "bad sleep", "feeling flat"
  intensityModifier?: "reduce" | "increase" | "maintain";
}

export interface AdjustmentIntentClassification {
  intentFamily: IntentFamily;
  confidence: "high" | "medium" | "low";
  targetScope: string;
  extractedEntities: ExtractedEntities;
  persistenceType: PersistenceType;
  mutationType: MutationType;
  requiresClarification: boolean;
  clarificationQuestion?: string;
  safetyFlags: SafetyFlag[];
  familyResult: IntentFamilyResult;
  debugInfo?: Record<string, unknown>;
}

// ─── Entity Extractors ────────────────────────────────────────────────────────

const EXERCISE_NAMES = [
  "lunges?", "deadlifts?", "squats?", "burpees?", "bench press",
  "pull.?ups?", "push.?ups?", "planks?", "sit.?ups?", "crunches?",
  "rdls?", "romanian deadlifts?", "hip thrusts?", "leg press",
  "leg curls?", "leg extensions?", "rows?", "pull.?downs?",
  "overhead press", "shoulder press", "curls?", "tricep",
  "dips?", "step.?ups?", "box jumps?", "kettlebell swings?",
];

const EQUIPMENT_NAMES = [
  "barbell", "dumbbell", "cable", "machine", "resistance band",
  "kettlebell", "belt squat", "smith machine", "trap bar",
  "pull.?up bar", "rings", "bodyweight",
];

const BODY_REGIONS = [
  "knee", "hip", "shoulder", "lower back", "back", "elbow",
  "wrist", "ankle", "neck", "quad", "hamstring", "glute",
  "calf", "chest", "lats?", "bicep", "tricep", "core", "spine",
];

const SPORTS = [
  "golf", "football", "soccer", "basketball", "baseball", "tennis",
  "hockey", "volleyball", "rugby", "swimming", "cycling", "running",
  "track", "wrestling", "bjj", "jiu.?jitsu", "mma", "boxing",
  "lacrosse", "cricket", "squash", "padel", "pickleball", "rowing",
  "triathlon", "cross.?fit",
];

const ENVIRONMENTS = [
  "hotel", "home", "garage", "basement", "park", "outside", "airbnb",
  "travel", "on the road", "away",
];

function extractExercise(msg: string): string | undefined {
  for (const name of EXERCISE_NAMES) {
    const match = msg.match(new RegExp(`\\b(${name})\\b`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractEquipment(msg: string): string | undefined {
  for (const eq of EQUIPMENT_NAMES) {
    const match = msg.match(new RegExp(`\\b(${eq}s?)\\b`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractBodyRegion(msg: string): string | undefined {
  for (const region of BODY_REGIONS) {
    const match = msg.match(new RegExp(`\\b(${region}s?)\\b`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractSport(msg: string): string | undefined {
  for (const sport of SPORTS) {
    const match = msg.match(new RegExp(`\\b(${sport})\\b`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractEnvironment(msg: string): string | undefined {
  for (const env of ENVIRONMENTS) {
    const match = msg.match(new RegExp(`\\b(${env})\\b`, "i"));
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function extractBreakDuration(msg: string): string | undefined {
  const match = msg.match(
    /\b(a week|two weeks?|three weeks?|a month|two months?|(\d+)\s*(days?|weeks?|months?))\b/i
  );
  return match ? match[0] : undefined;
}

function extractReadinessSignal(msg: string): string | undefined {
  const signals = [
    "low hrv", "bad sleep", "poor sleep", "low energy", "feeling flat",
    "feeling off", "tired", "exhausted", "sluggish", "low motivation",
    "not feeling it", "worn out", "run down",
  ];
  const lower = msg.toLowerCase();
  return signals.find((s) => lower.includes(s));
}

function extractPreferenceDirection(
  msg: string
): "like" | "dislike" | "avoid" | "prefer" | undefined {
  const lower = msg.toLowerCase();
  if (/\b(hate|dislike|can.?t stand|don.?t like|loathe|despise)\b/i.test(msg)) return "dislike";
  if (/\b(avoid|prefer not|would rather not|i.?d rather not)\b/i.test(msg)) return "avoid";
  if (/\b(prefer|like better|enjoy more)\b/i.test(msg)) return "prefer";
  if (/\b(like|enjoy|love)\b/i.test(lower)) return "like";
  return undefined;
}

// ─── Persistence + Mutation Resolution per Family ────────────────────────────

interface FamilyPolicy {
  persistence: PersistenceType;
  mutation: MutationType;
  safetyFlags: SafetyFlag[];
}

const FAMILY_POLICIES: Partial<Record<IntentFamily, FamilyPolicy>> = {
  readiness_low: {
    persistence: "temporary",
    mutation: "deload",
    safetyFlags: ["temporary_only", "no_rebuild"],
  },
  missed_sessions_reentry: {
    persistence: "session_scope",
    mutation: "deload",
    safetyFlags: ["injury_risk", "deconditioning", "no_rebuild"],
  },
  environment_temporary_switch: {
    persistence: "temporary",
    mutation: "adapt_env",
    safetyFlags: ["temporary_only", "no_rebuild"],
  },
  sport_context_update: {
    persistence: "context_update",
    mutation: "reorient",
    safetyFlags: ["sport_bias_required", "no_rebuild"],
  },
  exercise_dislike_or_preference: {
    persistence: "permanent",
    mutation: "substitute",
    safetyFlags: ["preference_stored"],
  },
  fatigue_management: {
    persistence: "session_scope",
    mutation: "reduce",
    safetyFlags: ["no_rebuild"],
  },
  recovery_focus: {
    persistence: "session_scope",
    mutation: "deload",
    safetyFlags: ["no_rebuild"],
  },
  injury_modification: {
    persistence: "permanent",
    mutation: "substitute",
    safetyFlags: ["pain_adjacent", "preference_stored"],
  },
  joint_friendly_modification: {
    persistence: "permanent",
    mutation: "substitute",
    safetyFlags: ["pain_adjacent", "preference_stored"],
  },
  equipment_constraint: {
    persistence: "permanent",
    mutation: "substitute",
    safetyFlags: ["preference_stored"],
  },
  exercise_swap: {
    persistence: "session_scope",
    mutation: "substitute",
    safetyFlags: [],
  },
  exercise_progression: {
    persistence: "session_scope",
    mutation: "substitute",
    safetyFlags: [],
  },
  exercise_regression: {
    persistence: "session_scope",
    mutation: "substitute",
    safetyFlags: [],
  },
  increase_difficulty: {
    persistence: "program_scope",
    mutation: "increase",
    safetyFlags: [],
  },
  decrease_difficulty: {
    persistence: "program_scope",
    mutation: "reduce",
    safetyFlags: [],
  },
  increase_volume: {
    persistence: "program_scope",
    mutation: "increase",
    safetyFlags: [],
  },
  decrease_volume: {
    persistence: "program_scope",
    mutation: "reduce",
    safetyFlags: [],
  },
  session_expansion: {
    persistence: "session_scope",
    mutation: "add",
    safetyFlags: [],
  },
  session_reduction: {
    persistence: "session_scope",
    mutation: "reduce",
    safetyFlags: [],
  },
  add_exercise: {
    persistence: "session_scope",
    mutation: "add",
    safetyFlags: [],
  },
  bulk_session_sets_increase: {
    persistence: "session_scope",
    mutation: "bulk_session_adjustment",
    safetyFlags: [],
  },
  mobility_support: {
    persistence: "session_scope",
    mutation: "add",
    safetyFlags: [],
  },
  clarification_required: {
    persistence: "none",
    mutation: "none",
    safetyFlags: ["clarify_before_act"],
  },
};

function resolveFamilyPolicy(family: IntentFamily): FamilyPolicy {
  return FAMILY_POLICIES[family] ?? {
    persistence: "program_scope",
    mutation: "reorient",
    safetyFlags: [],
  };
}

// ─── Clarification Logic ─────────────────────────────────────────────────────

function needsClarification(
  family: IntentFamily,
  entities: ExtractedEntities,
  scope: string,
): { required: boolean; question?: string } {
  if (family === "clarification_required") {
    return {
      required: true,
      question: "Could you give me a bit more detail about what you'd like to change?",
    };
  }

  if (
    family === "exercise_swap" &&
    !entities.targetExercise
  ) {
    return {
      required: true,
      question: "Which exercise would you like me to swap out, and do you have a preference for what replaces it?",
    };
  }

  if (
    family === "sport_context_update" &&
    !entities.targetSport
  ) {
    return {
      required: true,
      question: "Which sport or activity are you training for? This helps me orient your program correctly.",
    };
  }

  if (
    family === "exercise_dislike_or_preference" &&
    !entities.targetExercise &&
    !entities.targetEquipment
  ) {
    return {
      required: true,
      question: "Which exercise or equipment type would you like me to adjust? For example: 'I hate lunges' or 'I prefer dumbbells over barbells'.",
    };
  }

  return { required: false };
}

// ─── Main Classifier ──────────────────────────────────────────────────────────

export function classifyAdjustmentIntent(
  message: string,
  focusMode?: FocusMode,
): AdjustmentIntentClassification {
  const familyResult = normalizeToIntentFamily(message, focusMode);
  const { family, confidence, targetScope } = familyResult;

  const entities: ExtractedEntities = {
    targetExercise: extractExercise(message),
    targetEquipment: extractEquipment(message),
    targetBodyRegion: extractBodyRegion(message),
    targetSport: extractSport(message),
    breakDuration: extractBreakDuration(message),
    environment: extractEnvironment(message),
    preferenceDirection: extractPreferenceDirection(message),
    readinessSignal: extractReadinessSignal(message),
  };

  const policy = resolveFamilyPolicy(family);
  const clarification = needsClarification(family, entities, targetScope);

  return {
    intentFamily: family,
    confidence,
    targetScope,
    extractedEntities: entities,
    persistenceType: policy.persistence,
    mutationType: policy.mutation,
    requiresClarification: clarification.required,
    clarificationQuestion: clarification.question,
    safetyFlags: policy.safetyFlags,
    familyResult,
    debugInfo: {
      matchedPatterns: familyResult.matchedPatterns,
      scopeSource: familyResult.scopeSource,
    },
  };
}
