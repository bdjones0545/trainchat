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
    message = "Rest counts as part of the plan. I'm holding your current progression in place — nothing advances until you're back on track. If skipping becomes a pattern, I can simplify your schedule to make it more executable.";
    flags.push({ type: "skipped_session", detail: "Session was skipped" });
    return { headline, message, flags };
  }

  if (sessionStatus === "rescheduled") {
    headline = "Session rescheduled — noted";
    message = "Noted. If you consistently need to shift sessions around, let me know and I can restructure your weekly layout so the schedule fits how your week actually runs.";
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
    headline = "Partial session — load was high";
    message = `The work you completed counts. The difficulty and energy data suggest this was over your current capacity. I'll hold progression next session and keep the load where it is until it starts feeling manageable.`;
  } else if (isPartial) {
    headline = "Partial session — noted";
    message = `The main work is what matters — accessories can be trimmed. If you're consistently running short on time, I can tighten the session structure to fit your window better. No change to progression for now.`;
  } else if (flags.find((f) => f.type === "pain_trigger") && hasPainAreas) {
    const areaText = formatPainAreas(painAreas!);
    headline = `Pain flagged — ${areaText}`;
    message = `I've recorded the ${areaText} discomfort. I'll avoid aggressive loading on that movement pattern in your next session. If it shows up again, let me know and I can substitute exercises that take pressure off that area.`;
  } else if (flags.find((f) => f.type === "pain_trigger")) {
    headline = "Discomfort flagged — monitoring";
    message = `I've noted the pain signal. I'll keep the next session conservative on load — no progression step until this clears. If you know what area or movement caused it, mention it so I can adjust accordingly.`;
  } else if (flags.find((f) => f.type === "overload")) {
    headline = "Session was demanding — holding load";
    message = `High difficulty with low energy post-session is an overload signal. I'll keep the same load next session rather than stepping up — let your body absorb this one before we progress.`;
  } else if (flags.find((f) => f.type === "progression_candidate")) {
    headline = "Strong session — ready to step up";
    message = `Sessions feeling easy with high post-session energy is a clear signal to progress. I'll add a small load or volume increment next session to match where your body actually is.`;
  } else if (flags.find((f) => f.type === "low_enjoyment")) {
    headline = "Logged — low enjoyment noted";
    message = `Noted. Consistent low enjoyment is worth addressing — it's harder to stay consistent when the work doesn't feel right. If this pattern continues, I can rotate exercises or adjust the session format to keep things engaging.`;
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
    message = `Logged${diffLabel}. Progression stays on track — keep showing up consistently.`;
  }

  return { headline, message, flags };
}
