// ─── Behavioral Intelligence Layer ───────────────────────────────────────────
//
// Phase 1 skill addition — Coach Atlas behavioral adaptation layer.
//
// Purpose:
//   Detect recurring user behavior patterns from recent conversation history
//   and emit structured signals that influence coaching tone and programming
//   decisions. Patterns are inferred from the current session and recent
//   message context — no persistent storage required.
//
// NEVER exposed to users. NEVER modifies safety constraints.
// Output is for internal Coach Agent and Progression Intelligence use only.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type BehavioralSignalType =
  | "fatigue_risk"           // User repeatedly signals tiredness, pain, or reduced recovery
  | "under_challenged"       // User repeatedly asks for harder sessions
  | "pain_pattern"           // Recurring mentions of pain, soreness, or avoidance
  | "low_adherence"          // User skips sessions or returns after inactivity
  | "high_motivation"        // Consistent engagement, pushing harder, strong intent signals
  | "goal_instability"       // User changes goals frequently or is unsure of direction
  | "time_constraint_pattern"; // User consistently shortens sessions or requests shorter workouts

export interface BehavioralSignal {
  type: BehavioralSignalType;
  confidence: "low" | "moderate" | "high";
  /**
   * Adjustment hint for Coach Atlas's tone and communication.
   * Never surfaced verbatim — guides how to frame responses.
   */
  coachingAdjustment: string;
  /**
   * Adjustment hint for Programming decisions.
   * Passed to Performance Architect and Progression Intelligence.
   */
  programmingAdjustment: string;
}

export interface BehavioralAnalysisContext {
  /** Most recent user messages in the session (newest first). */
  recentMessages: string[];
  /** User profile fields for baseline context. */
  profile?: {
    injuries?: string | null;
    experienceLevel?: string;
    trainingGoal?: string;
    daysPerWeek?: number;
    sessionDuration?: number;
  };
  /** How many messages back to look. Default: 10. */
  lookbackWindow?: number;
}

export interface BehavioralAnalysisResult {
  signals: BehavioralSignal[];
  /** true if any high-confidence signal was detected */
  hasActionableSignal: boolean;
  /** Primary signal if one dominates; null if no signal or multiple of equal weight */
  primarySignal: BehavioralSignal | null;
  /**
   * Combined programming context string for injection into architecture briefs.
   * Empty string if no signals detected.
   */
  programmingContext: string;
}

// ─── Signal Detection Patterns ───────────────────────────────────────────────

const SIGNAL_PATTERNS: Record<BehavioralSignalType, RegExp[]> = {
  fatigue_risk: [
    /\b(tired|exhausted|drained|wiped|burnt out|burn out|overworked|sore|can't recover|not recovering|too much|reduce|easier|lighter|less volume|taper|deload)\b/i,
    /\b(too hard|too intense|too demanding|struggling to finish|can't complete)\b/i,
  ],
  under_challenged: [
    /\b(too easy|not enough|need more|want harder|make it harder|increase difficulty|push me more|not challenging|boring|bored|want to work harder|add more weight|add more volume)\b/i,
  ],
  pain_pattern: [
    /\b(pain|hurt|hurts|aching|ache|injury|injured|tweak|tweaked|irritated|inflamed|uncomfortable|avoid|aggravate|flare|flare-up)\b/i,
  ],
  low_adherence: [
    /\b(missed|skip|skipped|couldn't make it|wasn't able to|took a break|been away|haven't trained|haven't been|not been training|out of the gym|just got back|returning|re.?entry|starting again|restart)\b/i,
  ],
  high_motivation: [
    /\b(motivated|pumped|ready|let's go|all in|committed|serious|dedicated|want to push|want to work hard|love this|keep going|keep adding|progress|progressing|seeing results)\b/i,
  ],
  goal_instability: [
    /\b(actually|change my mind|different goal|new goal|not sure|reconsidering|pivot|switch to|instead of|maybe|thinking about changing|want to try something different)\b/i,
  ],
  time_constraint_pattern: [
    /\b(shorter|less time|only have|limited time|quick|30 min|20 min|busy|tight schedule|can't spend|no time|time crunch|cut it down|condensed|abbreviated)\b/i,
  ],
};

const SIGNAL_THRESHOLDS: Record<BehavioralSignalType, { moderate: number; high: number }> = {
  fatigue_risk:           { moderate: 1, high: 2 },
  under_challenged:       { moderate: 1, high: 2 },
  pain_pattern:           { moderate: 1, high: 2 },
  low_adherence:          { moderate: 1, high: 1 },
  high_motivation:        { moderate: 2, high: 3 },
  goal_instability:       { moderate: 2, high: 3 },
  time_constraint_pattern:{ moderate: 1, high: 2 },
};

// ─── Signal Definitions ───────────────────────────────────────────────────────

const SIGNAL_DEFINITIONS: Record<BehavioralSignalType, Omit<BehavioralSignal, "confidence">> = {
  fatigue_risk: {
    type: "fatigue_risk",
    coachingAdjustment:
      "Acknowledge the fatigue signal without dwelling on it. Normalize recovery as part of intelligent training. Avoid pushing volume.",
    programmingAdjustment:
      "Reduce baseline volume by 15–25%. Simplify sessions. Prioritize quality over quantity. Consider inserting a deload or re-entry week if signal is high-confidence.",
  },
  under_challenged: {
    type: "under_challenged",
    coachingAdjustment:
      "Validate the desire for more challenge. Increase intensity or complexity deliberately without promising reckless overload.",
    programmingAdjustment:
      "Increase load parameters or complexity one tier. Preserve fatigue management — add intensity before volume. Maintain recovery structure.",
  },
  pain_pattern: {
    type: "pain_pattern",
    coachingAdjustment:
      "Acknowledge the pain signal. Ask one targeted clarifying question if the region is unclear. Route toward pain-safe modifications.",
    programmingAdjustment:
      "Route through pain-safe exercise selection. Flag the affected region as a constraint. Apply movement-based substitutions rather than removal.",
  },
  low_adherence: {
    type: "low_adherence",
    coachingAdjustment:
      "Welcome the user back without judgment. Suggest a re-entry or conservative restart. Do not immediately push max training load.",
    programmingAdjustment:
      "Apply re-entry week logic: reduce volume by 30–40%, use lighter loading, prioritize movement quality. Scale back to 3 days if needed.",
  },
  high_motivation: {
    type: "high_motivation",
    coachingAdjustment:
      "Match the energy appropriately. Channel motivation into structured progression. Do not allow motivation to override recovery logic.",
    programmingAdjustment:
      "Apply systematic progression. Use the user's high motivation to drive load/volume increases — but maintain deload scheduling. Do not skip recovery weeks.",
  },
  goal_instability: {
    type: "goal_instability",
    coachingAdjustment:
      "Gently anchor the user to a direction before building. Ask one clarifying question about priority. Avoid building multiple programs for different goals.",
    programmingAdjustment:
      "Build for the most recently stated goal. Use a general athletic base if goal is unclear. Avoid hyper-specialized programming until goal is stable.",
  },
  time_constraint_pattern: {
    type: "time_constraint_pattern",
    coachingAdjustment:
      "Acknowledge the time constraint directly. Reframe: shorter sessions are valid — quality > duration.",
    programmingAdjustment:
      "Apply minimalist session design: 4–6 exercises, compound-first, no fluff. Target 30–45 min session windows. Remove finishers and optional accessories.",
  },
};

// ─── Analysis Engine ──────────────────────────────────────────────────────────

/**
 * Analyze recent messages to detect recurring behavioral patterns.
 * Returns structured signals for Coach Atlas and Progression Intelligence.
 */
export function analyzeBehavioralSignals(
  ctx: BehavioralAnalysisContext,
): BehavioralAnalysisResult {
  const window = Math.min(ctx.lookbackWindow ?? 10, ctx.recentMessages.length);
  const messages = ctx.recentMessages.slice(0, window);

  if (messages.length === 0) {
    return { signals: [], hasActionableSignal: false, primarySignal: null, programmingContext: "" };
  }

  const matchCounts: Partial<Record<BehavioralSignalType, number>> = {};

  for (const msg of messages) {
    for (const [type, patterns] of Object.entries(SIGNAL_PATTERNS) as [BehavioralSignalType, RegExp[]][]) {
      if (patterns.some((p) => p.test(msg))) {
        matchCounts[type] = (matchCounts[type] ?? 0) + 1;
      }
    }
  }

  const signals: BehavioralSignal[] = [];

  for (const [type, count] of Object.entries(matchCounts) as [BehavioralSignalType, number][]) {
    const threshold = SIGNAL_THRESHOLDS[type];
    const confidence: BehavioralSignal["confidence"] =
      count >= threshold.high ? "high" :
      count >= threshold.moderate ? "moderate" :
      "low";

    if (confidence !== "low") {
      signals.push({
        ...SIGNAL_DEFINITIONS[type],
        confidence,
      });
    }
  }

  // Sort by confidence: high > moderate
  signals.sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  const hasActionableSignal = signals.some((s) => s.confidence === "high");
  const primarySignal = signals.length > 0 ? signals[0] : null;

  // Build programming context string for injection into briefs
  const programmingContext = signals.length > 0
    ? [
        "## BEHAVIORAL INTELLIGENCE SIGNALS",
        "The following patterns were detected from recent user messages. Apply these adjustments:",
        ...signals.map((s) => `- [${s.type.toUpperCase()} — ${s.confidence}] ${s.programmingAdjustment}`),
      ].join("\n")
    : "";

  return { signals, hasActionableSignal, primarySignal, programmingContext };
}

/**
 * Build a coaching tone note for Coach Atlas based on behavioral signals.
 * Injected into the system prompt context for the current turn.
 */
export function buildBehavioralCoachingContext(result: BehavioralAnalysisResult): string {
  if (result.signals.length === 0) return "";
  return [
    "BEHAVIORAL CONTEXT (internal — do not surface directly):",
    ...result.signals.map(
      (s) => `- ${s.type}: ${s.coachingAdjustment}`,
    ),
  ].join("\n");
}
