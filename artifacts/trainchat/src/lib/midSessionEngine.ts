/**
 * Mid-Session Coaching Engine (client-side)
 *
 * Evaluates live set performance as the user logs sets and returns
 * coaching recommendations. Runs instantly in the browser — no round-trip.
 *
 * Rule priority:
 *   1. Pain override (always wins)
 *   2. Fatigue level
 *   3. Exercise-class rules (load_based, power_jump, trunk_prep, velocity, duration)
 *   4. General output trend
 *
 * Safety: never recommends aggressive progression mid-session.
 * In ambiguous cases: maintain, rest more, or reduce slightly.
 */

import { inferLoggingMode } from "./loggingMode";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationStatus =
  | "on_track"
  | "adjust_load"
  | "adjust_volume"
  | "adjust_rest"
  | "review_form"
  | "stop_exercise";

export type FatigueLevel = "low" | "moderate" | "high";

export type ExerciseClass =
  | "load_based"     // squat, deadlift, row, press — weight + reps
  | "power_jump"     // broad jump, box jump, other jumps
  | "velocity"       // med ball, throws, explosive drills
  | "trunk_prep"     // plank, dead bug, pallof press, activation
  | "duration"       // timed holds
  | "completion";    // warm-up flows, mobility

export interface LiveSetData {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

export interface LiveSetInput {
  exerciseName: string;
  category?: string;
  currentSetIndex: number;
  allSets: LiveSetData[];              // all sets including the one just completed
  totalPrescribedSets: number;
  targetLoad: number | null;
  targetReps: number | null;
  lastSessionLoad: number | null;
  lastSessionReps: number | null;
  perceivedDifficulty?: "too_easy" | "just_right" | "too_hard" | null;
  painLevel?: "none" | "mild" | "moderate" | "significant" | null;
}

export interface LiveRecommendation {
  status: RecommendationStatus;
  action: string;
  message: string;
  /** New suggested load for remaining sets, if applicable */
  adjustedLoad: number | null;
  /** New suggested rep count for remaining sets, if applicable */
  adjustedReps: number | null;
  /** Extra rest recommended (seconds) */
  extraRestSec: number | null;
  confidence: "low" | "medium" | "high";
  reason: string;
  /** Whether this warrants an accept/dismiss prompt (has actionable change) */
  isActionable: boolean;
}

/** Accepted live adjustment — stored in session history */
export interface LiveAdjustment {
  exerciseName: string;
  changeType: "load_reduction" | "load_increase" | "volume_reduction" | "rest_increase" | "stop_exercise";
  oldValue: number | string | null;
  newValue: number | string | null;
  reason: string;
  setAppliedAt: number;
  acceptedByUser: boolean;
}

// ─── Exercise class inference ─────────────────────────────────────────────────

export function inferExerciseClass(name: string, category?: string): ExerciseClass {
  const mode = inferLoggingMode(name, category);

  if (mode === "mobility_flow") return "completion";

  const n = name.toLowerCase();

  if (
    n.includes("plank") || n.includes("pallof") || n.includes("dead bug") ||
    n.includes("isometric") || n.includes("bird dog") || n.includes("hollow hold") ||
    n.includes("wall sit") || n.includes("l-sit") || n.includes("boat hold") ||
    category === "activation" || category === "warmup" || category === "recovery"
  ) {
    if (mode === "time_only") return "duration";
    return "trunk_prep";
  }

  if (mode === "distance_reps" || mode === "height_reps") return "power_jump";
  if (mode === "throws_reps") return "velocity";
  if (mode === "time_only") return "duration";
  if (mode === "reps_only") {
    // General jumps / plyometrics → power_jump; bodyweight strength → load_based
    if (
      n.includes("jump") || n.includes("hop") || n.includes("bound") ||
      n.includes("plyometric") || n.includes("reactive")
    ) return "power_jump";
    return "load_based";
  }

  return "load_based";
}

// ─── Fatigue model ────────────────────────────────────────────────────────────

/**
 * Estimates fatigue level from completed sets this session.
 * Lightweight — no external data needed.
 */
export function computeLiveFatigue(
  completedSets: LiveSetData[],
  perceivedDifficulty?: "too_easy" | "just_right" | "too_hard" | null,
  painLevel?: "none" | "mild" | "moderate" | "significant" | null,
): FatigueLevel {
  if (completedSets.length < 2) {
    // Too early to detect fatigue
    if (painLevel === "moderate" || painLevel === "significant") return "moderate";
    if (perceivedDifficulty === "too_hard") return "moderate";
    return "low";
  }

  let score = 0;

  // Pain signals → fatigue
  if (painLevel === "significant") score += 3;
  else if (painLevel === "moderate") score += 2;
  else if (painLevel === "mild") score += 0.5;

  // Session difficulty
  if (perceivedDifficulty === "too_hard") score += 2;
  else if (perceivedDifficulty === "just_right") score += 0;
  else if (perceivedDifficulty === "too_easy") score -= 0.5;

  // Rep drop-off on load-based sets
  const loadSets = completedSets.filter((s) => s.reps !== null && s.weight !== null);
  if (loadSets.length >= 2) {
    const firstReps = loadSets[0].reps!;
    const lastReps = loadSets[loadSets.length - 1].reps!;
    const dropPct = firstReps > 0 ? (firstReps - lastReps) / firstReps : 0;
    if (dropPct >= 0.3) score += 2.5;        // 30%+ drop = significant
    else if (dropPct >= 0.15) score += 1.5;  // 15%+ drop = moderate
    else if (dropPct > 0) score += 0.5;
  }

  if (score >= 3.5) return "high";
  if (score >= 1.5) return "moderate";
  return "low";
}

// ─── Pain override ────────────────────────────────────────────────────────────

export function evaluatePainOverride(
  painLevel: "none" | "mild" | "moderate" | "significant" | null | undefined,
  exerciseName: string,
): LiveRecommendation | null {
  if (!painLevel || painLevel === "none") return null;

  if (painLevel === "mild") {
    return {
      status: "on_track",
      action: "Monitor",
      message: `Mild discomfort noted — reduce range slightly and watch for changes. Stop if it worsens.`,
      adjustedLoad: null,
      adjustedReps: null,
      extraRestSec: null,
      confidence: "medium",
      reason: "Mild pain flagged — monitoring, no load change yet.",
      isActionable: false,
    };
  }

  if (painLevel === "moderate") {
    return {
      status: "adjust_load",
      action: "Reduce load",
      message: `Moderate discomfort — reduce load 10–15% for remaining sets and watch carefully.`,
      adjustedLoad: null, // caller fills in specific value
      adjustedReps: null,
      extraRestSec: 60,
      confidence: "high",
      reason: "Moderate pain override — reduction required.",
      isActionable: true,
    };
  }

  // significant or higher
  return {
    status: "stop_exercise",
    action: "Stop exercise",
    message: `Significant discomfort on ${exerciseName} — stop this movement today. Consider a safer variation or skip.`,
    adjustedLoad: null,
    adjustedReps: null,
    extraRestSec: null,
    confidence: "high",
    reason: "Significant pain override — exercise flagged.",
    isActionable: true,
  };
}

// ─── Load-based rules ─────────────────────────────────────────────────────────

function evaluateLoadBased(input: LiveSetInput, fatigue: FatigueLevel): LiveRecommendation {
  const { allSets, currentSetIndex, targetLoad, lastSessionLoad } = input;
  const completedSets = allSets.filter((s, i) => s.completed && i <= currentSetIndex);
  const remainingSets = allSets.filter((s, i) => !s.completed && i > currentSetIndex);
  const hasRemaining = remainingSets.length > 0;

  // All completed sets with reps data
  const repSets = completedSets.filter((s) => s.reps !== null);
  const firstReps = repSets[0]?.reps ?? null;
  const currentReps = repSets[repSets.length - 1]?.reps ?? null;
  const currentLoad = completedSets[completedSets.length - 1]?.weight ?? null;

  // Rep drop-off detection
  const repDrop = firstReps && currentReps ? firstReps - currentReps : 0;
  const repDropPct = firstReps && firstReps > 0 ? repDrop / firstReps : 0;

  const targetRepsNum = input.targetReps ?? lastSessionLoad ?? null;

  // ── High fatigue: recommend reduce or stop ─────────────────────────────────
  if (fatigue === "high") {
    if (!hasRemaining) {
      return {
        status: "on_track",
        action: "Finished",
        message: "Hard effort today — great work. Full recovery before next session.",
        adjustedLoad: null, adjustedReps: null, extraRestSec: null,
        confidence: "high", reason: "High fatigue, no remaining sets.", isActionable: false,
      };
    }
    const reducedLoad = currentLoad !== null ? Math.round((currentLoad * 0.9) / 2.5) * 2.5 : null;
    return {
      status: "adjust_load",
      action: "Reduce load",
      message: `Performance trending down — reduce to ${reducedLoad ?? "lighter"} lbs for remaining sets.`,
      adjustedLoad: reducedLoad, adjustedReps: null, extraRestSec: 60,
      confidence: "high",
      reason: "High fatigue + rep drop-off detected mid-session.",
      isActionable: reducedLoad !== null,
    };
  }

  // ── Rep drop: reduce load for remaining ─────────────────────────────────────
  if (repDropPct >= 0.25 && hasRemaining && completedSets.length >= 2) {
    const reducedLoad = currentLoad !== null ? Math.round((currentLoad * 0.92) / 2.5) * 2.5 : null;
    return {
      status: "adjust_load",
      action: "Reduce load",
      message: `Reps dropped significantly — reduce load ${reducedLoad ? `to ${reducedLoad} lbs` : "5–10%"} for remaining sets.`,
      adjustedLoad: reducedLoad, adjustedReps: null, extraRestSec: 30,
      confidence: "medium",
      reason: `Rep drop of ${Math.round(repDropPct * 100)}% detected.`,
      isActionable: reducedLoad !== null,
    };
  }

  // ── Moderate fatigue: extra rest ────────────────────────────────────────────
  if (fatigue === "moderate" && hasRemaining) {
    return {
      status: "adjust_rest",
      action: "Rest more",
      message: "Effort is rising — take an extra minute before the next set.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: 60,
      confidence: "medium",
      reason: "Moderate fatigue detected — rest extension recommended.",
      isActionable: true,
    };
  }

  // ── Too easy: small load increase suggestion ────────────────────────────────
  if (input.perceivedDifficulty === "too_easy" && currentSetIndex >= 1 && hasRemaining) {
    const baseLoad = currentLoad ?? targetLoad ?? lastSessionLoad;
    const suggestedLoad = baseLoad !== null ? baseLoad + 5 : null;
    if (suggestedLoad !== null) {
      return {
        status: "adjust_load",
        action: "Add 5 lbs",
        message: `Moving well and feeling easy — add 5 lbs for the next set if technique stays sharp.`,
        adjustedLoad: suggestedLoad, adjustedReps: null, extraRestSec: null,
        confidence: "medium",
        reason: "First sets completed easily — small load bump suggested.",
        isActionable: true,
      };
    }
  }

  // ── On track ────────────────────────────────────────────────────────────────
  const onTrackMsg = completedSets.length === 1
    ? "Good first set — keep the same load and focus on technique."
    : hasRemaining
    ? "On track — keep the same load for remaining sets."
    : "Solid session — well done.";

  return {
    status: "on_track",
    action: "Keep plan",
    message: onTrackMsg,
    adjustedLoad: null, adjustedReps: null, extraRestSec: null,
    confidence: "high", reason: "No concerning signals detected.", isActionable: false,
  };
}

// ─── Power / jump rules ───────────────────────────────────────────────────────

function evaluatePowerJump(input: LiveSetInput, fatigue: FatigueLevel): LiveRecommendation {
  const { allSets, currentSetIndex, totalPrescribedSets } = input;
  const completedSets = allSets.filter((s, i) => s.completed && i <= currentSetIndex);
  const hasRemaining = allSets.some((s, i) => !s.completed && i > currentSetIndex);

  // Distance / height drop (stored in weight field)
  const outputSets = completedSets.filter((s) => s.weight !== null);
  const firstOutput = outputSets[0]?.weight ?? null;
  const lastOutput = outputSets[outputSets.length - 1]?.weight ?? null;
  const outputDrop = firstOutput && lastOutput ? (firstOutput - lastOutput) / firstOutput : 0;

  // High fatigue or user feedback on power = stop or reduce volume
  if (fatigue === "high" || input.perceivedDifficulty === "too_hard") {
    if (hasRemaining && completedSets.length >= 2) {
      return {
        status: "adjust_volume",
        action: "Stop drill early",
        message: "Power output is dropping — end this drill now. Quality beats quantity on jumps.",
        adjustedLoad: null, adjustedReps: null, extraRestSec: null,
        confidence: "high",
        reason: "Fatigue or user difficulty signal — power volume should stop here.",
        isActionable: true,
      };
    }
  }

  // Output declining: hold target, extend rest
  if (outputDrop >= 0.1 && hasRemaining) {
    return {
      status: "adjust_rest",
      action: "Rest longer",
      message: "Output trending down — take an extra 60 seconds and keep the same target. Don't chase distance/height.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: 60,
      confidence: "medium",
      reason: "Power output decline detected — rest extension recommended.",
      isActionable: true,
    };
  }

  if (!hasRemaining) {
    return {
      status: "on_track",
      action: "Drill complete",
      message: "Power work complete — great output. Full rest before the next movement.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: null,
      confidence: "high", reason: "All sets completed.", isActionable: false,
    };
  }

  return {
    status: "on_track",
    action: "Keep plan",
    message: "Clean output — keep the same distance/height target. Crisp takeoff, controlled landing.",
    adjustedLoad: null, adjustedReps: null, extraRestSec: null,
    confidence: "high", reason: "Power output stable.", isActionable: false,
  };
}

// ─── Velocity / med ball rules ────────────────────────────────────────────────

function evaluateVelocity(input: LiveSetInput, fatigue: FatigueLevel): LiveRecommendation {
  const { allSets, currentSetIndex } = input;
  const completedSets = allSets.filter((s, i) => s.completed && i <= currentSetIndex);
  const hasRemaining = allSets.some((s, i) => !s.completed && i > currentSetIndex);

  if (fatigue === "high" && hasRemaining) {
    return {
      status: "adjust_volume",
      action: "Stop drill early",
      message: "Explosive quality declines with fatigue — stop here and reset for the next exercise.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: null,
      confidence: "high", reason: "High fatigue on velocity work.", isActionable: true,
    };
  }

  if (fatigue === "moderate" && hasRemaining) {
    return {
      status: "adjust_rest",
      action: "Rest more",
      message: "Take an extra 45–60 seconds — explosive reps require full recovery to stay powerful.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: 60,
      confidence: "medium", reason: "Moderate fatigue on velocity work.", isActionable: true,
    };
  }

  return {
    status: "on_track",
    action: "Keep plan",
    message: "Good power — maximum intent every rep. Reset fully between reps.",
    adjustedLoad: null, adjustedReps: null, extraRestSec: null,
    confidence: "high", reason: "No signals of decline.", isActionable: false,
  };
}

// ─── Trunk / prep / activation rules ─────────────────────────────────────────

function evaluateTrunkPrep(input: LiveSetInput, fatigue: FatigueLevel): LiveRecommendation {
  const { perceivedDifficulty } = input;

  if (perceivedDifficulty === "too_hard" || fatigue !== "low") {
    return {
      status: "review_form",
      action: "Reduce range",
      message: "Stay at this level and focus on position quality — reduce range slightly if needed.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: null,
      confidence: "medium", reason: "Difficulty or fatigue on trunk/prep work.", isActionable: false,
    };
  }

  if (perceivedDifficulty === "too_easy") {
    return {
      status: "on_track",
      action: "Slow tempo",
      message: "Feeling easy — add 2 seconds of pause or slow the eccentric. Don't jump to more load.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: null,
      confidence: "medium", reason: "Trunk work — progress through control, not load.", isActionable: false,
    };
  }

  return {
    status: "on_track",
    action: "Keep plan",
    message: "Good position — stay controlled. Trunk work quality matters more than reps.",
    adjustedLoad: null, adjustedReps: null, extraRestSec: null,
    confidence: "high", reason: "No signals of concern on trunk/prep work.", isActionable: false,
  };
}

// ─── Duration / timed hold rules ─────────────────────────────────────────────

function evaluateDuration(input: LiveSetInput, fatigue: FatigueLevel): LiveRecommendation {
  const { allSets, currentSetIndex } = input;
  const completedSets = allSets.filter((s, i) => s.completed && i <= currentSetIndex);
  const hasRemaining = allSets.some((s, i) => !s.completed && i > currentSetIndex);

  // Check if hold times are dropping (stored in weight or reps)
  const times = completedSets.map((s) => s.weight ?? s.reps ?? null).filter((t) => t !== null) as number[];
  const timeDrop = times.length >= 2 ? times[0] - times[times.length - 1] : 0;
  const timeDropPct = times[0] && times[0] > 0 ? timeDrop / times[0] : 0;

  if (timeDropPct >= 0.25 && hasRemaining) {
    return {
      status: "review_form",
      action: "Reduce target",
      message: "Hold time declining — drop to a duration you can maintain with perfect position.",
      adjustedLoad: null, adjustedReps: null, extraRestSec: 30,
      confidence: "medium", reason: "Hold time drop detected.", isActionable: false,
    };
  }

  return {
    status: "on_track",
    action: "Keep plan",
    message: "Position before duration — stop if form breaks down before the time is up.",
    adjustedLoad: null, adjustedReps: null, extraRestSec: null,
    confidence: "high", reason: "Timed hold progressing normally.", isActionable: false,
  };
}

// ─── Central evaluation function ─────────────────────────────────────────────

/**
 * The main mid-session engine entry point.
 * Call this after the user completes each set.
 * Returns a recommendation to show inline in the logger.
 */
export function evaluateLiveSetPerformance(input: LiveSetInput): LiveRecommendation {
  const { exerciseName, category, painLevel, perceivedDifficulty, allSets, currentSetIndex } = input;

  const completedSets = allSets.filter((s, i) => s.completed && i <= currentSetIndex);

  // ── 1. Pain override (highest priority) ──────────────────────────────────────
  if (painLevel && painLevel !== "none") {
    const painRec = evaluatePainOverride(painLevel, exerciseName);
    if (painRec) {
      // Fill in specific load for moderate pain if available
      if (painRec.status === "adjust_load" && painRec.adjustedLoad === null) {
        const currentLoad = completedSets[completedSets.length - 1]?.weight ?? null;
        if (currentLoad) {
          painRec.adjustedLoad = Math.round((currentLoad * 0.88) / 2.5) * 2.5;
          painRec.message = `Moderate discomfort — reduce to ${painRec.adjustedLoad} lbs for remaining sets and monitor carefully.`;
        }
      }
      return painRec;
    }
  }

  // ── 2. Fatigue estimate ───────────────────────────────────────────────────────
  const fatigue = computeLiveFatigue(completedSets, perceivedDifficulty, painLevel);

  // ── 3. Exercise-class rules ───────────────────────────────────────────────────
  const exerciseClass = inferExerciseClass(exerciseName, category);

  switch (exerciseClass) {
    case "completion":
      return {
        status: "on_track", action: "Done", message: "Warm-up complete — ready to train.",
        adjustedLoad: null, adjustedReps: null, extraRestSec: null,
        confidence: "high", reason: "Completion-based exercise.", isActionable: false,
      };

    case "trunk_prep":
      return evaluateTrunkPrep(input, fatigue);

    case "duration":
      return evaluateDuration(input, fatigue);

    case "power_jump":
      return evaluatePowerJump(input, fatigue);

    case "velocity":
      return evaluateVelocity(input, fatigue);

    case "load_based":
    default:
      return evaluateLoadBased(input, fatigue);
  }
}
