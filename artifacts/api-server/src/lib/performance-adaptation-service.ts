/**
 * TrainChat Performance Adaptation Service
 *
 * Reads actual logged training performance from exercise_logs and session_logs,
 * computes movement-level and session-level adaptation signals, and builds
 * a structured prompt block that gets appended to the adaptive context.
 *
 * This closes the loop between:
 *   prescribed training → logged performance → future engine decisions
 *
 * Separation of concerns:
 * - adaptation.ts                      → readiness / check-in signals (how athlete feels)
 * - performance-adaptation-service.ts  → actual performance signals (what athlete did)
 * - ai.ts                              → combines all context into final system prompt
 */

import { db, exerciseLogsTable, sessionLogsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MovementTrend {
  exerciseName: string;
  exposureCount: number;
  trend: "improving" | "stalled" | "regressing" | "unclear";
  adaptationHint: "progress" | "hold" | "reduce" | "unclear";
  notes: string;
}

export interface PerformanceAdaptationSummary {
  userId: number;
  windowDays: number;
  hasEnoughData: boolean;
  sessionCount: number;
  exerciseLogCount: number;
  adherenceTrend: "high" | "moderate" | "low" | "unclear";
  fatigueTrend: "rising" | "stable" | "unclear";
  progressionReadiness: "progress" | "hold" | "reduce" | "review";
  keyFindings: string[];
  movementTrends: MovementTrend[];
  engineRelevantFlags: string[];
  promptBlock: string;
  debug: {
    exerciseLogsConsidered: number;
    sessionLogsConsidered: number;
    movementsAnalyzed: number;
    movementsActionable: number;
  };
}

// ── Completion scoring ────────────────────────────────────────────────────────

/**
 * Convert a single exercise completion record into a numeric score.
 * Positive = easy / low RPE → candidate for progression.
 * Negative = hard / failed / high RPE → hold or reduce.
 */
function completionScore(
  status: string | null,
  rpe: number | null | undefined
): number {
  const rpeVal = rpe ?? null;

  if (status === "easy" || (rpeVal !== null && rpeVal <= 5)) return 1;
  if (status === "failed" || (rpeVal !== null && rpeVal >= 9)) return -2;
  if (status === "hard" || (rpeVal !== null && rpeVal >= 7.5)) return -1;
  return 0; // solid — maintain
}

// ── Movement trend analysis ───────────────────────────────────────────────────

function analyzeMovement(
  name: string,
  logs: Array<{
    completionStatus: string | null;
    rpe: number | null | undefined;
    loggedAt: Date;
  }>
): MovementTrend {
  const count = logs.length;

  // Safety: require at least 2 exposures before drawing any conclusion
  if (count < 2) {
    return {
      exerciseName: name,
      exposureCount: count,
      trend: "unclear",
      adaptationHint: "unclear",
      notes: "only 1 exposure — insufficient to determine trend",
    };
  }

  const score = logs.reduce(
    (sum, l) => sum + completionScore(l.completionStatus, l.rpe),
    0
  );

  let trend: MovementTrend["trend"];
  let adaptationHint: MovementTrend["adaptationHint"];
  let notes: string;

  if (score >= 2) {
    trend = "improving";
    adaptationHint = "progress";
    notes = `${count} exposures trending easy — modest progression appropriate (extra reps, sets, or harder variation)`;
  } else if (score <= -3) {
    trend = "regressing";
    adaptationHint = "reduce";
    notes = `${count} exposures trending hard or failed — hold or reduce load`;
  } else if (score <= -1) {
    trend = "stalled";
    adaptationHint = "hold";
    notes = `${count} exposures with some difficulty — maintain current load`;
  } else {
    trend = "stalled";
    adaptationHint = "hold";
    notes = `${count} exposures at solid effort — maintain current progression model`;
  }

  return {
    exerciseName: name,
    exposureCount: count,
    trend,
    adaptationHint,
    notes,
  };
}

// ── Session adherence ─────────────────────────────────────────────────────────

function computeAdherenceTrend(
  sessions: Array<{ sessionStatus: string | null }>
): PerformanceAdaptationSummary["adherenceTrend"] {
  if (sessions.length < 3) return "unclear";

  const completed = sessions.filter(
    (s) => s.sessionStatus === "completed" || s.sessionStatus === "partial"
  ).length;

  const rate = completed / sessions.length;
  if (rate >= 0.8) return "high";
  if (rate >= 0.5) return "moderate";
  return "low";
}

// ── Session fatigue trend ─────────────────────────────────────────────────────

function computeFatigueTrend(
  sessions: Array<{
    difficultyScore: number | null;
    energyScore: number | null;
  }>
): PerformanceAdaptationSummary["fatigueTrend"] {
  const withData = sessions.filter(
    (s) => s.difficultyScore !== null || s.energyScore !== null
  );

  if (withData.length < 4) return "unclear";

  const mid = Math.ceil(withData.length / 2);
  const recent = withData.slice(0, mid);
  const older = withData.slice(mid);

  const recentDiff = avg(recent.map((s) => s.difficultyScore ?? 3));
  const olderDiff = avg(older.map((s) => s.difficultyScore ?? 3));
  const recentEnergy = avg(recent.map((s) => s.energyScore ?? 3));
  const olderEnergy = avg(older.map((s) => s.energyScore ?? 3));

  const difficultyRising = recentDiff - olderDiff > 0.6;
  const energyFalling = olderEnergy - recentEnergy > 0.6;

  if (difficultyRising || energyFalling) return "rising";
  return "stable";
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Global progression readiness ──────────────────────────────────────────────

/**
 * Conservative global readiness signal.
 * Requires repeated positive signals before recommending "progress".
 * Biases toward "hold" when signals are sparse or conflicting.
 */
function computeProgressionReadiness(
  adherence: PerformanceAdaptationSummary["adherenceTrend"],
  fatigue: PerformanceAdaptationSummary["fatigueTrend"],
  movementTrends: MovementTrend[],
  hasEnoughData: boolean
): PerformanceAdaptationSummary["progressionReadiness"] {
  if (!hasEnoughData) return "review";

  // Safety first: fatigue or poor adherence → reduce
  if (adherence === "low") return "reduce";
  if (fatigue === "rising") return "reduce";

  // Unclear signals → conservative hold
  if (adherence === "unclear" && fatigue === "unclear") return "review";

  const actionable = movementTrends.filter((m) => m.adaptationHint !== "unclear");
  const progressCount = actionable.filter((m) => m.adaptationHint === "progress").length;
  const reduceCount = actionable.filter((m) => m.adaptationHint === "reduce").length;

  // Any reduce signals → hold at minimum
  if (reduceCount > 0) return "hold";

  // Require majority of analyzed movements to show readiness
  // (adherence !== "low" and fatigue !== "rising" already guaranteed by early returns above)
  if (actionable.length >= 2 && progressCount / actionable.length >= 0.5) {
    return "progress";
  }

  return "hold";
}

// ── Key findings text ─────────────────────────────────────────────────────────

function buildKeyFindings(
  adherence: PerformanceAdaptationSummary["adherenceTrend"],
  fatigue: PerformanceAdaptationSummary["fatigueTrend"],
  sessions: Array<{ sessionStatus: string | null }>,
  movementTrends: MovementTrend[]
): string[] {
  const findings: string[] = [];

  const total = sessions.length;
  const completed = sessions.filter(
    (s) => s.sessionStatus === "completed" || s.sessionStatus === "partial"
  ).length;
  const skipped = sessions.filter((s) => s.sessionStatus === "skipped").length;

  if (total >= 3) {
    findings.push(
      `Session adherence: ${completed}/${total} sessions completed (${adherence})`
    );
  }

  if (skipped >= 2) {
    findings.push(
      `${skipped} sessions skipped in window — review schedule density or session demands`
    );
  }

  if (fatigue === "rising") {
    findings.push(
      "Session difficulty trending upward or energy declining — fatigue may be accumulating"
    );
  }

  // Lead with the most actionable movement signals
  const progressMvs = movementTrends
    .filter((m) => m.adaptationHint === "progress")
    .slice(0, 3);
  const reduceMvs = movementTrends
    .filter((m) => m.adaptationHint === "reduce")
    .slice(0, 2);

  for (const m of progressMvs) {
    findings.push(`${m.exerciseName}: ${m.notes}`);
  }
  for (const m of reduceMvs) {
    findings.push(`${m.exerciseName}: ${m.notes}`);
  }

  if (findings.length === 0) {
    findings.push(
      "Insufficient performance data in this window to derive specific recommendations"
    );
  }

  return findings;
}

// ── Engine-relevant flags ─────────────────────────────────────────────────────

/**
 * Structured flags that engines can use for downstream decision-making.
 * These are intentionally terse and engine-readable.
 */
function buildEngineFlags(
  adherence: PerformanceAdaptationSummary["adherenceTrend"],
  fatigue: PerformanceAdaptationSummary["fatigueTrend"],
  movementTrends: MovementTrend[],
  sessions: Array<{ sessionStatus: string | null }>
): string[] {
  const flags: string[] = [];

  if (adherence === "low")
    flags.push("LOW_ADHERENCE: reduce volume or simplify session structure");
  if (adherence === "high")
    flags.push("HIGH_ADHERENCE: training tolerance confirmed — standard progression rules apply");
  if (fatigue === "rising")
    flags.push("FATIGUE_RISING: hold or reduce intensity and volume");

  const progressMvs = movementTrends.filter((m) => m.adaptationHint === "progress");
  const reduceMvs = movementTrends.filter((m) => m.adaptationHint === "reduce");

  if (progressMvs.length > 0) {
    flags.push(
      `PROGRESSION_READY: ${progressMvs.slice(0, 4).map((m) => m.exerciseName).join(", ")}`
    );
  }
  if (reduceMvs.length > 0) {
    flags.push(
      `HOLD_OR_REDUCE: ${reduceMvs.slice(0, 3).map((m) => m.exerciseName).join(", ")}`
    );
  }

  const skipped = sessions.filter((s) => s.sessionStatus === "skipped").length;
  if (skipped >= 2) {
    flags.push("REPEATED_SKIPS: consider reducing session count or adjusting modality complexity");
  }

  return flags;
}

// ── Prompt block builder ──────────────────────────────────────────────────────

function buildPromptBlock(
  summary: Omit<PerformanceAdaptationSummary, "promptBlock">
): string {
  if (!summary.hasEnoughData) return "";

  const lines: string[] = [];
  lines.push("## PERFORMANCE MEMORY (recent training outcomes)");
  lines.push(
    `(Last ${summary.windowDays} days — apply these signals like a coach who has read the training log)`
  );
  lines.push("");

  lines.push("### SESSION HISTORY");
  lines.push(
    `Adherence: ${summary.adherenceTrend.toUpperCase()} (${summary.sessionCount} sessions logged)`
  );
  lines.push(`Fatigue trend: ${summary.fatigueTrend}`);
  lines.push(`Global progression readiness: ${summary.progressionReadiness.toUpperCase()}`);
  lines.push("");

  if (summary.keyFindings.length > 0) {
    lines.push("### KEY FINDINGS");
    for (const f of summary.keyFindings) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  const actionableMovements = summary.movementTrends
    .filter((m) => m.adaptationHint !== "unclear")
    .slice(0, 6);

  if (actionableMovements.length > 0) {
    lines.push("### MOVEMENT-LEVEL SIGNALS");
    for (const m of actionableMovements) {
      const hintLabel =
        m.adaptationHint === "progress"
          ? "→ progress difficulty"
          : m.adaptationHint === "reduce"
          ? "→ hold/reduce"
          : "→ maintain";
      lines.push(
        `- ${m.exerciseName} (${m.exposureCount} exposures): ${m.trend} ${hintLabel}`
      );
    }
    lines.push("");
  }

  if (summary.engineRelevantFlags.length > 0) {
    lines.push("### ENGINE FLAGS");
    for (const f of summary.engineRelevantFlags) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  lines.push("### ADAPTATION DIRECTIVE");
  switch (summary.progressionReadiness) {
    case "progress":
      lines.push(
        "PROGRESS: Athlete performance supports modest load or volume progression on key movements."
      );
      lines.push(
        "Apply movement-specific increases — not uniform. Reference specific exercises that earned the progression."
      );
      lines.push(
        'Explain changes naturally: "You\'ve handled the squat work well the last few sessions, so I increased the load modestly this week."'
      );
      break;
    case "reduce":
      lines.push(
        "REDUCE: Adherence or fatigue signals indicate the athlete is not recovering well."
      );
      lines.push(
        "Reduce overall volume, simplify structure, and lower intensity targets."
      );
      lines.push(
        "Preserve training continuity — do not abandon structure. Adjust it."
      );
      lines.push(
        'Reference the data: "Your last few sessions looked more taxing, so I held volume steady instead of pushing harder."'
      );
      break;
    case "hold":
      lines.push(
        "HOLD: Mixed or moderate signals — maintain current loading and structure."
      );
      lines.push(
        "Do not add load or volume this cycle. Consolidate current stimulus before progressing."
      );
      break;
    case "review":
    default:
      lines.push(
        "REVIEW: Insufficient or conflicting performance data — proceed conservatively."
      );
      lines.push(
        "Default to the existing progression model. Do not make aggressive adjustments based on limited logging."
      );
      break;
  }

  lines.push("");
  lines.push(
    "Speak about these adaptations like an intelligent coach, not a data reporter. Natural, specific, and confident."
  );

  return lines.join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a performance-based adaptation summary from logged exercise and session data.
 *
 * @param userId  - The user's numeric ID
 * @param windowDays - How many days of history to consider (default: 14)
 * @returns PerformanceAdaptationSummary including a ready-to-inject promptBlock
 */
export async function buildPerformanceAdaptationContext(
  userId: number,
  windowDays = 14
): Promise<PerformanceAdaptationSummary> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  try {
    const [exerciseLogs, sessionLogs] = await Promise.all([
      db
        .select()
        .from(exerciseLogsTable)
        .where(
          and(
            eq(exerciseLogsTable.userId, userId),
            gte(exerciseLogsTable.loggedAt, windowStart)
          )
        )
        .orderBy(desc(exerciseLogsTable.loggedAt))
        .limit(200),

      db
        .select()
        .from(sessionLogsTable)
        .where(
          and(
            eq(sessionLogsTable.userId, userId),
            gte(sessionLogsTable.completedAt, windowStart)
          )
        )
        .orderBy(desc(sessionLogsTable.completedAt))
        .limit(20),
    ]);

    // Conservative: require meaningful data before making any recommendations
    const hasEnoughData =
      sessionLogs.length >= 3 || exerciseLogs.length >= 5;

    // ── Movement trend analysis ────────────────────────────────────────────────

    const movementMap = new Map<
      string,
      Array<{
        completionStatus: string | null;
        rpe: number | null;
        loggedAt: Date;
      }>
    >();

    for (const log of exerciseLogs) {
      const key = log.exerciseName.toLowerCase().trim();
      if (!movementMap.has(key)) movementMap.set(key, []);
      movementMap.get(key)!.push({
        completionStatus: log.completionStatus ?? null,
        rpe: log.rpe ?? null,
        loggedAt: log.loggedAt,
      });
    }

    const movementTrends: MovementTrend[] = [];
    for (const [name, logs] of movementMap.entries()) {
      // Only analyze movements with 2+ exposures — single data points are noise
      if (logs.length >= 2) {
        movementTrends.push(analyzeMovement(name, logs));
      }
    }

    // Sort: most actionable signals first (progress/reduce > hold > unclear)
    const hintRank: Record<string, number> = {
      progress: 0,
      reduce: 1,
      hold: 2,
      unclear: 3,
    };
    movementTrends.sort(
      (a, b) => (hintRank[a.adaptationHint] ?? 3) - (hintRank[b.adaptationHint] ?? 3)
    );

    // ── Adherence & fatigue ────────────────────────────────────────────────────

    const adherenceTrend = computeAdherenceTrend(sessionLogs);
    const fatigueTrend = computeFatigueTrend(sessionLogs);
    const progressionReadiness = computeProgressionReadiness(
      adherenceTrend,
      fatigueTrend,
      movementTrends,
      hasEnoughData
    );

    // ── Synthesize findings ────────────────────────────────────────────────────

    const keyFindings = buildKeyFindings(
      adherenceTrend,
      fatigueTrend,
      sessionLogs,
      movementTrends
    );
    const engineRelevantFlags = buildEngineFlags(
      adherenceTrend,
      fatigueTrend,
      movementTrends,
      sessionLogs
    );

    const movementsActionable = movementTrends.filter(
      (m) => m.adaptationHint !== "unclear"
    ).length;

    const summaryBase: Omit<PerformanceAdaptationSummary, "promptBlock"> = {
      userId,
      windowDays,
      hasEnoughData,
      sessionCount: sessionLogs.length,
      exerciseLogCount: exerciseLogs.length,
      adherenceTrend,
      fatigueTrend,
      progressionReadiness,
      keyFindings,
      movementTrends,
      engineRelevantFlags,
      debug: {
        exerciseLogsConsidered: exerciseLogs.length,
        sessionLogsConsidered: sessionLogs.length,
        movementsAnalyzed: movementTrends.length,
        movementsActionable,
      },
    };

    const promptBlock = buildPromptBlock(summaryBase);

    logger.info(
      {
        tag: "[PerformanceAdaptation]",
        userId,
        windowDays,
        hasEnoughData,
        sessionCount: sessionLogs.length,
        exerciseLogCount: exerciseLogs.length,
        movementsAnalyzed: movementTrends.length,
        movementsActionable,
        adherenceTrend,
        fatigueTrend,
        progressionReadiness,
        engineFlagCount: engineRelevantFlags.length,
        keyFindingCount: keyFindings.length,
      },
      "[PerformanceAdaptation] Signals computed"
    );

    return { ...summaryBase, promptBlock };
  } catch (err) {
    logger.error(
      { err, userId, tag: "[PerformanceAdaptation]" },
      "[PerformanceAdaptation] Failed to compute performance context — returning empty"
    );

    return {
      userId,
      windowDays,
      hasEnoughData: false,
      sessionCount: 0,
      exerciseLogCount: 0,
      adherenceTrend: "unclear",
      fatigueTrend: "unclear",
      progressionReadiness: "review",
      keyFindings: [],
      movementTrends: [],
      engineRelevantFlags: [],
      promptBlock: "",
      debug: {
        exerciseLogsConsidered: 0,
        sessionLogsConsidered: 0,
        movementsAnalyzed: 0,
        movementsActionable: 0,
      },
    };
  }
}
