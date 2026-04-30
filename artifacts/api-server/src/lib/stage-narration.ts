/**
 * Stage Narration System
 *
 * Generates human-readable, coach-voiced narration for each SSE build stage.
 * Narration uses real context (goal, split, equipment, sport, mutation type)
 * so every message reflects actual decisions, not generic loading text.
 *
 * Rules:
 *  - First person ("I'm…"), simple and confident
 *  - 1–2 sentences per stage, never more
 *  - No internal file names, system architecture, or developer terminology
 *  - Falls back to neutral text when context is missing
 *  - Mutation and build flows are completely separate — never mix
 */

import type { BuildStage } from "./build-pipeline";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface NarrationContext {
  /** execPlan.action — primary routing decision */
  action: string;
  /** Semantic intent family (e.g. "exercise_swap", "pain_adjustment") */
  intentFamily?: string | null;
  /** Mutation sub-type (swap, add, remove, transform, progression) */
  mutationType?: string | null;
  /** Primary training goal (strength, hypertrophy, athletic_performance, …) */
  goal?: string | null;
  /** Requested days per week */
  daysPerWeek?: number | null;
  /** Equipment profile keywords ("home gym", "barbell", "hotel", …) */
  equipment?: string | null;
  /** Sport focus detected or inherited */
  sport?: string | null;
  /** Requested session duration in minutes */
  sessionDuration?: number | null;
  /** True when intent family signals pain or injury */
  hasPain?: boolean;
  /** First ~120 chars of the user message — used for keyword hints in early stages */
  userMessageHint?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBuildAction(action: string): boolean {
  return ["PROGRAM_GENERATION", "REBUILD_PROGRAM", "STRUCTURAL_REBUILD"].includes(action);
}

function isMutationAction(action: string): boolean {
  return ["APPLY_MUTATION", "DIRECT_MUTATION", "SESSION_ADJUSTMENT"].includes(action);
}

function isGuidanceAction(action: string): boolean {
  return ["GUIDANCE", "ASK_CLARIFICATION", "NO_OP"].includes(action);
}

/** Format goal as a readable label. */
function goalLabel(goal: string | null | undefined): string {
  if (!goal) return "training";
  const map: Record<string, string> = {
    strength: "strength",
    hypertrophy: "hypertrophy",
    athletic_performance: "athletic performance",
    power: "power",
    endurance: "endurance",
    fat_loss: "fat loss",
    general_fitness: "general fitness",
    mobility: "mobility",
  };
  return map[goal] ?? goal.replace(/_/g, " ");
}

/** Format sport as a readable label. */
function sportLabel(sport: string | null | undefined): string {
  if (!sport) return "sport";
  return sport.replace(/_/g, " ");
}

/** Detect pain keywords in the user message hint. */
function hasPainHint(hint: string | null | undefined): boolean {
  return /pain|hurt|injury|sore|shoulder|knee|back|hip|wrist|ankle/i.test(hint ?? "");
}

/** Detect swap/replace keywords in the user message hint. */
function hasSwapHint(hint: string | null | undefined): boolean {
  return /swap|replace|substitute|instead|alternative/i.test(hint ?? "");
}

/** Detect remove/cut keywords in the user message hint. */
function hasRemoveHint(hint: string | null | undefined): boolean {
  return /remove|drop|cut|eliminate|take out|get rid/i.test(hint ?? "");
}

/** Detect add keywords in the user message hint. */
function hasAddHint(hint: string | null | undefined): boolean {
  return /add|include|throw in|put in|insert/i.test(hint ?? "");
}

/** Detect build/create keywords in the user message hint. */
function hasBuildHint(hint: string | null | undefined): boolean {
  return /build|create|make|design|generate|new program|start|give me a/i.test(hint ?? "");
}

/** True if equipment string suggests a home or hotel setup. */
function isLimitedEquipment(equipment: string | null | undefined): boolean {
  return /home|hotel|minimal|dumbbell only|bodyweight|no gym/i.test(equipment ?? "");
}

// ─── Stage Narration Builder ──────────────────────────────────────────────────

/**
 * Returns a 1–2 sentence coaching narration for a given build stage.
 * Uses real context when available; falls back to neutral defaults.
 *
 * All text must be coach-voice, first-person, simple language.
 * Never expose internal system terms or file names.
 */
export function buildStageNarration(
  stage: BuildStage,
  ctx: NarrationContext,
): string {
  const { action, intentFamily, mutationType, goal, daysPerWeek, equipment, sport, sessionDuration, hasPain, userMessageHint } = ctx;
  const pain = hasPain || hasPainHint(userMessageHint) || intentFamily === "injury_modification" || intentFamily === "joint_friendly_modification";
  const limited = isLimitedEquipment(equipment);

  // ── UNDERSTANDING ──────────────────────────────────────────────────────────

  if (stage === "understanding") {
    if (pain) return "Got it — I'll work around that carefully.";
    if (hasSwapHint(userMessageHint) || mutationType === "swap" || intentFamily === "exercise_swap")
      return "Got it — I'll swap that out now.";
    if (hasRemoveHint(userMessageHint) || mutationType === "remove" || intentFamily === "remove_exercise")
      return "Got it — I'll remove that from your program.";
    if (hasAddHint(userMessageHint) || mutationType === "add" || intentFamily === "add_exercise")
      return "Got it — I'll fit that in.";
    if (action === "REBUILD_PROGRAM" || action === "STRUCTURAL_REBUILD")
      return "Got it — I'm rebuilding your program with the new setup.";
    if (isBuildAction(action) || hasBuildHint(userMessageHint))
      return "Got it — I'm starting your program build.";
    if (isGuidanceAction(action))
      return "Got it — let me think through that.";
    return "Got it — I'm on it.";
  }

  // ── LOADING ────────────────────────────────────────────────────────────────

  if (stage === "loading") {
    if (isBuildAction(action)) return "Loading your training profile and history.";
    if (isMutationAction(action)) return "Pulling up your current program.";
    if (isGuidanceAction(action)) return "Reviewing your context.";
    return "Gathering context.";
  }

  // ── CLASSIFYING ────────────────────────────────────────────────────────────

  if (stage === "classifying") {
    if (isBuildAction(action)) {
      if (daysPerWeek && goal)
        return `I'm building a ${daysPerWeek}-day ${goalLabel(goal)} program.`;
      if (daysPerWeek)
        return `I'm setting up a ${daysPerWeek}-day training structure.`;
      if (goal)
        return `I'm building a ${goalLabel(goal)} program.`;
      return "I'm mapping out your training structure.";
    }
    if (isMutationAction(action)) {
      if (pain) return "I'm identifying what to adjust for that issue.";
      if (mutationType === "swap" || intentFamily === "exercise_swap")
        return "I'm planning the exercise swap.";
      if (mutationType === "remove") return "I'm planning the removal.";
      if (mutationType === "add") return "I'm planning the addition.";
      return "I'm identifying exactly what to change.";
    }
    if (action === "ASK_CLARIFICATION") return "I need one more detail before I can act on this.";
    if (isGuidanceAction(action)) return "I'm organizing the key factors for your question.";
    return "I'm mapping out what needs to happen.";
  }

  // ── PLANNING ──────────────────────────────────────────────────────────────

  if (stage === "planning") {
    if (isBuildAction(action)) {
      if (sport && daysPerWeek)
        return `I'm choosing a ${daysPerWeek}-day split built around ${sportLabel(sport)} demands.`;
      if (sport)
        return `I'm structuring training around ${sportLabel(sport)} performance demands.`;
      if (pain)
        return "I'm keeping load away from the affected area while maintaining overall training volume.";
      if (daysPerWeek && sessionDuration)
        return `I'm structuring ${daysPerWeek} sessions to fit within ${sessionDuration} minutes each.`;
      if (daysPerWeek && goal)
        return `I'm choosing a ${daysPerWeek}-day split that balances intensity with enough recovery time.`;
      if (daysPerWeek)
        return `I'm structuring a ${daysPerWeek}-day split with enough recovery built in.`;
      if (limited) return "I'm building around what you have available.";
      return "I'm structuring your weekly training split for balance and recovery.";
    }
    if (isMutationAction(action)) {
      if (pain) return "I'm selecting safer alternatives that don't stress that area.";
      if (mutationType === "swap" || intentFamily === "exercise_swap")
        return "I'm finding the best replacement for that movement.";
      if (mutationType === "remove") return "I'm planning how to remove that and adjust the surrounding work.";
      if (mutationType === "add") return "I'm finding the right place and volume for that addition.";
      return "I'm deciding exactly what to change.";
    }
    if (isGuidanceAction(action)) return "I'm thinking through the best answer for you.";
    return "I'm planning the details.";
  }

  // ── APPLYING ──────────────────────────────────────────────────────────────

  if (stage === "applying") {
    if (isBuildAction(action)) {
      if (sport)
        return `I'm selecting movements that transfer to ${sportLabel(sport)} and filling in accessory work for balance.`;
      if (limited)
        return "I'm selecting movements that work with your equipment and balancing all muscle groups.";
      if (pain)
        return "I'm building the program around the affected area — keeping it productive without adding stress.";
      if (goal === "hypertrophy")
        return "I'm selecting your main lifts and filling in volume work to drive growth in each muscle group.";
      if (goal === "strength" || goal === "power")
        return "I'm selecting compound lifts for strength and filling in accessory work to support them.";
      return "I'm selecting your main lifts and filling in accessory work to keep things balanced.";
    }
    if (isMutationAction(action)) {
      if (pain)
        return "I'm removing stress from the affected area and keeping the session as productive as possible.";
      if (mutationType === "swap" || intentFamily === "exercise_swap")
        return "I'm applying the swap and checking the surrounding context holds together.";
      if (mutationType === "remove")
        return "I'm removing that and adjusting volume so nothing else is disrupted.";
      if (mutationType === "add")
        return "I'm adding that in at the right point in your session.";
      return "I'm applying the change to your program.";
    }
    if (isGuidanceAction(action)) return "I'm working through the answer now.";
    return "I'm applying the changes.";
  }

  // ── VALIDATING ────────────────────────────────────────────────────────────

  if (stage === "validating") {
    if (isBuildAction(action)) {
      if (pain)
        return "Checking that stress is properly reduced on the affected area and the program still makes sense.";
      if (daysPerWeek)
        return `Final check — making sure ${daysPerWeek} days works with enough recovery time built in.`;
      return "Final check — making sure everything is balanced and ready to go.";
    }
    if (isMutationAction(action)) {
      if (pain) return "Checking that the adjustment reduces stress correctly.";
      return "Checking that the change was applied correctly.";
    }
    if (isGuidanceAction(action)) return "Reviewing the response.";
    return "Checking everything.";
  }

  // ── SAVING ────────────────────────────────────────────────────────────────

  if (stage === "saving") {
    if (action === "REBUILD_PROGRAM" || action === "STRUCTURAL_REBUILD")
      return "Saving your updated program — it's ready to go.";
    if (isBuildAction(action))
      return "Saving your program — this is now your active system.";
    if (isMutationAction(action))
      return "Saving the change — your program is updated.";
    if (isGuidanceAction(action)) return "Wrapping up.";
    return "Saving.";
  }

  return "";
}
