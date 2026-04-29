/**
 * Adjustment Response Templates
 *
 * Specific, per-family response strings for confirmed program mutations.
 * Never generic. Never say "I've applied the change" without specifics.
 *
 * Core rule: a template is ONLY used after DB verification confirms the
 * mutation occurred. If verification fails, use the failure template.
 *
 * Templates support token substitution via {token} placeholders.
 */

import type { IntentFamily } from "./intent-family-engine";
import type { VerificationStatus } from "./mutation-verifier";

// ─── Template Token Map ───────────────────────────────────────────────────────

export interface ResponseTokens {
  sessionLabel?: string;       // e.g. "Lower Body A"
  dayNumber?: number;          // 1-based day number
  exerciseName?: string;       // exercise that was changed
  replacementName?: string;    // what it was replaced with
  setsRemoved?: number;        // number of sets removed
  exercisesRemoved?: number;   // number of exercises removed
  breakDuration?: string;      // e.g. "two weeks"
  sport?: string;              // e.g. "golf"
  environment?: string;        // e.g. "hotel"
  readinessSignal?: string;    // e.g. "low HRV"
  preferenceItem?: string;     // exercise/equipment disliked or preferred
  verifiedChangeCount?: number;
  totalChangeCount?: number;
}

// ─── Template Definitions ────────────────────────────────────────────────────

type FamilyTemplates = {
  verified: string;
  partial: string;
  failed: string;
  noop?: string;
  unclear?: string;
};

const FAMILY_RESPONSE_TEMPLATES: Partial<Record<IntentFamily, FamilyTemplates>> = {

  readiness_low: {
    verified:
      "Got it — I've lightened today's session to match where you're at. " +
      "{exercisesRemoved, number, ::unit/exercise} {exercisesRemoved > 1 ? 'exercises' : 'exercise'} trimmed and sets reduced. " +
      "Your full program is untouched — this is just today. Go at your own pace.",
    partial:
      "I've made some adjustments to today's session based on your readiness. " +
      "Some changes applied — the session is lighter than usual. " +
      "Your program for the rest of the week stays the same.",
    failed:
      "I wasn't able to confirm the session adjustment in your program. " +
      "The session may be unchanged — let me know if you'd like me to try again.",
  },

  missed_sessions_reentry: {
    verified:
      "Welcome back. I've set up a re-entry session for you — volume is reduced by roughly a third " +
      "and the load is a bit lighter than where you left off. " +
      "{breakDuration ? 'After ' + breakDuration + ' off, ' : ''}this protects against a spike in soreness. " +
      "From next week your program resumes normal progression.",
    partial:
      "I've partially adjusted your re-entry session. Some reductions applied — " +
      "please take it conservative on any unchanged exercises as well.",
    failed:
      "I couldn't confirm the re-entry adjustments were saved. " +
      "Your session may be at full intensity — please ease in regardless.",
  },

  environment_temporary_switch: {
    verified:
      "Done — today's session is adapted for {environment ? environment : 'your current environment'}. " +
      "Barbell and machine work has been swapped for dumbbell and bodyweight alternatives. " +
      "Your regular program is completely unchanged and will be waiting for you when you're back.",
    partial:
      "I've adapted most of today's session for {environment ? environment : 'your current environment'}. " +
      "A few exercises may still require checking — review before you start. " +
      "Your main program is unaffected.",
    failed:
      "I couldn't confirm the session adaptation was saved. " +
      "Your session may still show your normal gym exercises — let me know and I'll retry.",
  },

  sport_context_update: {
    verified:
      "Updated. I've noted your {sport ? sport : 'sport'} context and adjusted the exercise " +
      "selection and session emphasis in your current program to better support your sport demands. " +
      "Future programs will also reflect this context.",
    partial:
      "I've updated part of your program to reflect your {sport ? sport : 'sport'} context. " +
      "Some sessions may still need adjusting — let me know if you'd like me to review any specific day.",
    failed:
      "I wasn't able to confirm the sport context update in your program. " +
      "Your program may be unchanged. Let me know if you'd like to try again.",
  },

  exercise_dislike_or_preference: {
    verified:
      "{exerciseName ? 'I\\'ve removed ' + exerciseName + ' from your program ' : 'I\\'ve noted your preference '}" +
      "and replaced it with a suitable alternative that keeps the same movement pattern. " +
      "I've also stored this preference so it won't appear in future programs.",
    partial:
      "I've removed {exerciseName ? exerciseName : 'the exercise'} from the current session. " +
      "It may still appear in other sessions — let me know if you want me to clear it program-wide.",
    failed:
      "I wasn't able to confirm the exercise was removed from your program. " +
      "It may still be there — let me know and I'll retry.",
  },

  fatigue_management: {
    verified:
      "I've reduced the load on your current session — {exercisesRemoved, number, ::unit/exercise} " +
      "{exercisesRemoved === 1 ? 'accessory' : 'accessories'} out and sets trimmed on the remaining work. " +
      "Primary movements are still there. This should take the edge off without losing the week.",
    partial:
      "Partial reduction applied — some accessories removed and sets reduced. " +
      "The session is lighter, though not fully restructured.",
    failed:
      "The fatigue adjustments couldn't be confirmed. Your session may be at its original volume.",
  },

  recovery_focus: {
    verified:
      "Today's session has been shifted to a recovery focus — intensity is down, " +
      "volume is reduced, and the work is lower-demand. " +
      "Performance sessions in your program are untouched.",
    partial:
      "Some recovery adjustments applied. The session is lighter — " +
      "take it easy on any unchanged exercises as well.",
    failed:
      "I couldn't confirm the recovery adjustments were applied. " +
      "Your session may still be at full intensity.",
  },

  injury_modification: {
    verified:
      "I've modified your program to work around {targetBodyRegion ? targetBodyRegion : 'the affected area'}. " +
      "{exerciseName ? exerciseName + ' has been replaced' : 'Problematic exercises have been swapped'} " +
      "with pain-safe alternatives. This constraint is saved — it applies to future programs too.",
    partial:
      "Some modifications applied for {targetBodyRegion ? targetBodyRegion : 'the affected area'}. " +
      "Review any unchanged exercises and skip anything that causes discomfort.",
    failed:
      "I couldn't confirm the injury modifications were saved. " +
      "Please exercise caution with anything that's been causing discomfort.",
  },

  equipment_constraint: {
    verified:
      "Done — I've swapped all exercises that require unavailable equipment " +
      "to alternatives you can actually do. The movement patterns are preserved.",
    partial:
      "Most equipment-dependent exercises have been swapped. " +
      "A few may still need adjustment — check before you start.",
    failed:
      "I couldn't confirm the equipment substitutions were applied. " +
      "Your program may still include exercises requiring unavailable equipment.",
  },

  exercise_swap: {
    verified:
      "{exerciseName ? exerciseName : 'The exercise'} has been swapped for " +
      "{replacementName ? replacementName : 'an appropriate alternative'} in your program.",
    partial:
      "The exercise swap was partially applied. Check the session to confirm the change looks right.",
    failed:
      "I couldn't confirm the exercise swap. Your program may still show the original exercise.",
  },

  increase_difficulty: {
    verified:
      "Done — I've increased the difficulty in your program. " +
      "Expect heavier loads, fewer rest periods, or more complex movement patterns.",
    partial:
      "Some difficulty increases applied. A full review of the session is recommended.",
    failed:
      "I couldn't confirm the difficulty increase was saved to your program.",
  },

  decrease_difficulty: {
    verified:
      "Your program has been dialed back. " +
      "Loads are reduced, rest is extended, and the regressions are in place.",
    partial:
      "Some difficulty reductions applied. The session should feel slightly easier.",
    failed:
      "I couldn't confirm the difficulty reduction was applied to your program.",
  },

  increase_volume: {
    verified:
      "Volume increased. I've added work to your program — " +
      "more sets, exercises, or both depending on the session structure.",
    partial:
      "Some volume was added. Not all sessions were updated — let me know if you want more.",
    failed:
      "I couldn't confirm the volume increase was saved to your program.",
  },

  decrease_volume: {
    verified:
      "Volume reduced. I've trimmed sets and accessories — the core work is still there.",
    partial:
      "Some volume reduction applied. A few sessions may still be unchanged.",
    failed:
      "I couldn't confirm the volume reduction was saved to your program.",
  },

  session_expansion: {
    verified:
      "Session expanded — I've added {exerciseName ? exerciseName : 'relevant exercises'} " +
      "to Day {dayNumber ? dayNumber : 'the session'} while keeping the structure clean.",
    partial:
      "Some exercises were added. The session is fuller, though not all additions applied.",
    failed:
      "I couldn't confirm the session expansion was saved.",
  },

  session_reduction: {
    verified:
      "Session trimmed — accessories removed and sets reduced. " +
      "Primary lifts are intact on Day {dayNumber ? dayNumber : 'the session'}.",
    partial:
      "Partial reduction applied. The session is shorter but may not be fully cut.",
    failed:
      "I couldn't confirm the session reduction was saved to your program.",
  },

  add_exercise: {
    verified:
      "{exerciseName ? exerciseName : 'The exercise'} has been added to " +
      "Day {dayNumber ? dayNumber : 'the session'}.",
    partial:
      "The exercise was partially added. Check the session to confirm it appears correctly.",
    failed:
      "I couldn't confirm the exercise was added to your program.",
  },
};

// ─── Fallback Template ────────────────────────────────────────────────────────

const FALLBACK_TEMPLATE: FamilyTemplates = {
  verified:
    "Your program has been updated. {verifiedChangeCount} change{verifiedChangeCount === 1 ? '' : 's'} confirmed.",
  partial:
    "Some changes were applied — {verifiedChangeCount} of {totalChangeCount} confirmed in your program.",
  failed:
    "I wasn't able to confirm your program was updated. The change may not have been applied — let me know if you'd like to try again.",
};

// ─── Token Substitution ───────────────────────────────────────────────────────

function applyTokens(template: string, tokens: ResponseTokens): string {
  return template
    .replace(/\{sessionLabel\}/g, tokens.sessionLabel ?? "the session")
    .replace(/\{dayNumber\}/g, tokens.dayNumber != null ? String(tokens.dayNumber) : "the session")
    .replace(/\{exerciseName\}/g, tokens.exerciseName ?? "the exercise")
    .replace(/\{replacementName\}/g, tokens.replacementName ?? "an appropriate alternative")
    .replace(/\{setsRemoved\}/g, tokens.setsRemoved != null ? String(tokens.setsRemoved) : "some")
    .replace(/\{exercisesRemoved\}/g, tokens.exercisesRemoved != null ? String(tokens.exercisesRemoved) : "")
    .replace(/\{breakDuration\}/g, tokens.breakDuration ?? "")
    .replace(/\{sport\}/g, tokens.sport ?? "your sport")
    .replace(/\{environment\}/g, tokens.environment ?? "your current environment")
    .replace(/\{readinessSignal\}/g, tokens.readinessSignal ?? "low readiness")
    .replace(/\{preferenceItem\}/g, tokens.preferenceItem ?? "the exercise")
    .replace(/\{verifiedChangeCount\}/g, tokens.verifiedChangeCount != null ? String(tokens.verifiedChangeCount) : "")
    .replace(/\{totalChangeCount\}/g, tokens.totalChangeCount != null ? String(tokens.totalChangeCount) : "")
    .replace(/\{targetBodyRegion\}/g, tokens.exerciseName ?? "the affected area");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a specific response string for a given intent family + verification status.
 * Always returns a non-generic, specific response.
 * Must only be called AFTER DB verification has been completed.
 */
export function getAdjustmentResponse(
  intentFamily: IntentFamily,
  verificationStatus: VerificationStatus,
  tokens: ResponseTokens = {},
): string {
  const templates = FAMILY_RESPONSE_TEMPLATES[intentFamily] ?? FALLBACK_TEMPLATE;
  const raw =
    (templates as Record<string, string | undefined>)[verificationStatus] ??
    templates.failed;
  return applyTokens(raw, tokens);
}

/**
 * Returns a failure response that should be used when the mutation verifier
 * reports "failed" or "noop" — never claims the change was applied.
 */
export function getFailureResponse(intentFamily: IntentFamily): string {
  const templates = FAMILY_RESPONSE_TEMPLATES[intentFamily] ?? FALLBACK_TEMPLATE;
  return templates.failed;
}

/**
 * Returns a clarification prompt string — not a mutation response.
 * Used when the classifier determines the intent needs more info.
 */
export function getClarificationPrompt(
  intentFamily: IntentFamily,
  defaultQuestion?: string,
): string {
  const familyPrompts: Partial<Record<IntentFamily, string>> = {
    exercise_swap:
      "Which exercise would you like me to swap out, and do you have a preference for what replaces it?",
    sport_context_update:
      "Which sport or activity are you training for? This helps me orient your program correctly.",
    exercise_dislike_or_preference:
      "Which exercise or equipment type would you like me to adjust? For example: 'I hate lunges' or 'I prefer dumbbells over barbells'.",
    clarification_required:
      "Could you give me a bit more detail about what you'd like to change?",
    injury_modification:
      "Which area is bothering you, and what kind of movements cause discomfort? I'll adjust the program to work around it.",
  };
  return familyPrompts[intentFamily] ?? defaultQuestion ?? "Could you tell me more about what you'd like to adjust?";
}

/**
 * Returns a human-readable label for a given intent family.
 * Used in logging, UI, and coaching explanations.
 */
export function getIntentFamilyLabel(intentFamily: IntentFamily): string {
  const labels: Partial<Record<IntentFamily, string>> = {
    readiness_low: "Readiness Adjustment",
    missed_sessions_reentry: "Re-Entry Deload",
    environment_temporary_switch: "Temporary Environment Adaptation",
    sport_context_update: "Sport Context Update",
    exercise_dislike_or_preference: "Exercise Preference",
    fatigue_management: "Fatigue Management",
    recovery_focus: "Recovery Focus",
    injury_modification: "Injury Modification",
    joint_friendly_modification: "Joint-Friendly Modification",
    equipment_constraint: "Equipment Constraint",
    exercise_swap: "Exercise Swap",
    exercise_progression: "Exercise Progression",
    exercise_regression: "Exercise Regression",
    increase_difficulty: "Difficulty Increase",
    decrease_difficulty: "Difficulty Decrease",
    increase_volume: "Volume Increase",
    decrease_volume: "Volume Decrease",
    session_expansion: "Session Expansion",
    session_reduction: "Session Reduction",
    add_exercise: "Exercise Added",
    mobility_support: "Mobility Support",
    strength_focus: "Strength Focus",
    hypertrophy_focus: "Hypertrophy Focus",
    conditioning_focus: "Conditioning Focus",
    clarification_required: "Clarification Needed",
  };
  return labels[intentFamily] ?? intentFamily.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
