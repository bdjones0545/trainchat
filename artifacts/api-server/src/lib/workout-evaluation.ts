/**
 * Workout Completion Evaluation Engine
 *
 * Analyzes post-session feedback and generates a coach-style session recap.
 * Flags patterns that should inform future programming decisions.
 *
 * Tone: supportive, specific, non-judgmental.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = "completed" | "partial" | "skipped" | "rescheduled";

export interface WorkoutCompletionData {
  sessionStatus: SessionStatus;
  difficultyScore?: number | null; // 1-5
  painScore?: number | null;       // 1-5
  energyScore?: number | null;     // 1-5
  enjoymentScore?: number | null;  // 1-5
  actualDuration?: number | null;  // minutes
  painAreas?: string[] | null;
  notes?: string | null;
}

export interface SessionFlag {
  type:
    | "overload"
    | "pain_trigger"
    | "progression_candidate"
    | "time_mismatch"
    | "low_enjoyment"
    | "strong_session"
    | "skipped_session";
  detail: string;
}

export interface SessionRecap {
  headline: string;
  message: string;
  flags: SessionFlag[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPainAreas(areas: string[]): string {
  const labels: Record<string, string> = {
    knee: "knee",
    lower_back: "lower back",
    shoulder: "shoulder",
    hip: "hip",
    elbow: "elbow",
    wrist: "wrist",
    ankle: "ankle",
    neck: "neck",
    upper_back: "upper back",
  };
  return areas.map((a) => labels[a] ?? a).join(", ");
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate a completed workout submission and return a session recap.
 * Deterministic rules — no AI call, runs instantly.
 */
export function evaluateWorkoutCompletion(data: WorkoutCompletionData): SessionRecap {
  const flags: SessionFlag[] = [];
  let headline = "Session logged";
  let message = "Your coach now has a record of this session.";

  const {
    sessionStatus,
    difficultyScore,
    painScore,
    energyScore,
    enjoymentScore,
    painAreas,
    notes,
  } = data;

  // ── Skipped ──────────────────────────────────────────────────────────────
  if (sessionStatus === "skipped") {
    headline = "Session skipped — noted";
    message = "No problem. Rest is part of the plan. If this becomes a pattern, I can simplify your schedule so it fits better.";
    flags.push({ type: "skipped_session", detail: "Session was skipped" });
    return { headline, message, flags };
  }

  if (sessionStatus === "rescheduled") {
    headline = "Session rescheduled — noted";
    message = "Got it. If you consistently need to shift sessions around, let me know and I can restructure your weekly layout.";
    return { headline, message, flags };
  }

  // ── Pain flags ────────────────────────────────────────────────────────────
  const hasPain = (painScore ?? 0) >= 3;
  const highPain = (painScore ?? 0) >= 4;
  const hasPainAreas = painAreas && painAreas.length > 0;

  if (highPain || (hasPain && hasPainAreas)) {
    const areaText = hasPainAreas ? ` in your ${formatPainAreas(painAreas!)}` : "";
    flags.push({
      type: "pain_trigger",
      detail: `Pain reported${areaText} during session`,
    });
  }

  // ── Overload / too hard ───────────────────────────────────────────────────
  const veryHard = (difficultyScore ?? 0) >= 4.5;
  const tooHard = (difficultyScore ?? 0) >= 4;
  const lowEnergy = (energyScore ?? 3) <= 2;

  if (veryHard || (tooHard && lowEnergy)) {
    flags.push({
      type: "overload",
      detail: `Difficulty ${difficultyScore}/5 with energy ${energyScore ?? "not reported"}/5`,
    });
  }

  // ── Low enjoyment ─────────────────────────────────────────────────────────
  if ((enjoymentScore ?? 3) <= 2) {
    flags.push({
      type: "low_enjoyment",
      detail: `Enjoyment rated ${enjoymentScore}/5`,
    });
  }

  // ── Progression candidate ─────────────────────────────────────────────────
  const tooEasy = (difficultyScore ?? 0) <= 2;
  const highEnergy = (energyScore ?? 0) >= 4;

  if (tooEasy && highEnergy) {
    flags.push({
      type: "progression_candidate",
      detail: `Difficulty ${difficultyScore}/5 with high post-session energy`,
    });
  }

  // ── Build headline + message based on dominant signals ────────────────────

  const isPartial = sessionStatus === "partial";

  if (isPartial && flags.find((f) => f.type === "overload")) {
    headline = "Session partially completed — may be slightly overloaded";
    message = `Finishing part of this session still counts as solid work. The difficulty and energy data suggest this session may be slightly over your current capacity. I'll keep that in mind when programming your next block.`;
  } else if (isPartial) {
    headline = "Partial session — noted";
    message = `Completing the main work is what matters. If you're consistently leaving accessories unfinished, I can tighten the session to fit your available time better.`;
  } else if (flags.find((f) => f.type === "pain_trigger") && hasPainAreas) {
    const areaText = formatPainAreas(painAreas!);
    headline = `Pain noted in ${areaText}`;
    message = `I've flagged ${areaText} discomfort from this session. If this comes up again, I can adjust the movement selection to reduce load on that area. Keep an eye on it this week.`;
  } else if (flags.find((f) => f.type === "pain_trigger")) {
    headline = "Discomfort noted during session";
    message = `I've noted the pain response from this session. If it recurs, let me know and I can modify movements that may be contributing.`;
  } else if (flags.find((f) => f.type === "overload")) {
    headline = "Session felt demanding — monitoring fatigue";
    message = `High difficulty with low post-session energy is a signal worth watching. If this is a pattern over the next few sessions, I'll suggest pulling back on intensity or volume slightly.`;
  } else if (flags.find((f) => f.type === "progression_candidate")) {
    headline = "Strong session — ready to progress";
    message = `Sessions feeling easy with high post-session energy is a clear signal your body has adapted. Consider adding a small load increment or volume increase in your next session.`;
  } else if (flags.find((f) => f.type === "low_enjoyment")) {
    headline = "Session logged — noted low enjoyment";
    message = `Thanks for the feedback. Consistent low enjoyment is worth addressing — it's easier to stay consistent when you enjoy the work. If you'd like to shake things up, we can look at exercise rotation.`;
  } else {
    // Default positive complete
    const diffLabel = !difficultyScore
      ? ""
      : difficultyScore <= 2
      ? " — well within your capacity"
      : difficultyScore === 3
      ? " — right at the target zone"
      : " — appropriately challenging";
    headline = "Session complete";
    message = `Session logged${diffLabel}. Keep showing up consistently and the results will follow.`;
  }

  return { headline, message, flags };
}
