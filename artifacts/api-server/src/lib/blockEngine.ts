/**
 * Block Intelligence Engine
 *
 * Evaluates performance trends across sessions and weeks to determine
 * the current training block health and generate smart recommendations.
 *
 * METRICS:
 *   weeklyComplianceScore   — sessions completed vs planned (0–100)
 *   weeklyFatigueScore      — difficulty + pain + live adjustments (0–100)
 *   painRiskScore           — frequency and severity of pain signals (0–100)
 *   progressMomentumScore   — positive progressions vs holds/regressions (0–100)
 *   blockReadinessScore     — energy + enjoyment trend (0–100)
 *
 * DECISION PRIORITY (safety first):
 *   1. Pain risk (high) → needs_review
 *   2. Fatigue + poor recovery → needs_deload
 *   3. Low compliance → inconsistent
 *   4. Moderate fatigue, stable compliance → fatigued or underrecovered
 *   5. Mixed signals → stable
 *   6. Clean completion + positive momentum → progressing
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockStatus =
  | "progressing"
  | "stable"
  | "fatigued"
  | "underrecovered"
  | "inconsistent"
  | "needs_deload"
  | "needs_review";

export interface SessionData {
  id: number;
  sessionStatus: "completed" | "partial" | "skipped" | string;
  difficultyScore: number | null; // 1–5
  painScore: number | null;       // 1–5
  energyScore: number | null;     // 1–5
  enjoymentScore: number | null;  // 1–5
  actualDuration: number | null;  // minutes
  completedAt: Date;
}

export interface ChangeLogData {
  intent: string | null;
  source: string | null;
  decisionMetadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BlockMetrics {
  sessionCount: number;
  completionRate: number;          // 0–1
  avgDifficulty: number | null;    // 1–5
  avgPain: number | null;          // 1–5
  avgEnergy: number | null;        // 1–5
  avgEnjoyment: number | null;     // 1–5
  hardSessionStreak: number;       // consecutive too_hard sessions
  skippedCount: number;
  partialCount: number;
  painEventCount: number;          // sessions with painScore >= 3
  liveAdjustmentCount: number;     // accepted mid-session load reductions
  progressionCount: number;        // auto_progression events
  regressionCount: number;         // load_reduction events
  // Derived scores (0–100)
  weeklyComplianceScore: number;
  weeklyFatigueScore: number;
  painRiskScore: number;
  progressMomentumScore: number;
  blockReadinessScore: number;
}

export interface BlockRecommendation {
  type:
    | "progress_next_week"
    | "hold_next_week"
    | "reduce_current_week"
    | "deload"
    | "pivot_exercises"
    | "simplify_session"
    | "add_rest";
  scope: "current_week" | "next_week" | "block";
  priority: "low" | "medium" | "high";
  reason: string;
  specifics: string;
}

export interface BlockState {
  status: BlockStatus;
  metrics: BlockMetrics;
  recommendations: BlockRecommendation[];
  confidence: "low" | "medium" | "high";
  summary: string;
  coachInsight: string;
  statusLabel: string;
}

export interface BlockInput {
  recentSessions: SessionData[];
  recentChangeLogs: ChangeLogData[];
  /** Subset of sessions from current week only */
  currentWeekSessions?: SessionData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Metric computation ───────────────────────────────────────────────────────

export function computeBlockMetrics(input: BlockInput): BlockMetrics {
  const { recentSessions, recentChangeLogs, currentWeekSessions } = input;

  // Use current-week sessions if provided for compliance; fall back to all recent
  const complianceSessions = currentWeekSessions ?? recentSessions;

  const sessionCount = complianceSessions.length;
  const completedCount = complianceSessions.filter((s) => s.sessionStatus === "completed").length;
  const partialCount = complianceSessions.filter((s) => s.sessionStatus === "partial").length;
  const skippedCount = complianceSessions.filter((s) => s.sessionStatus === "skipped").length;

  // Only use sessions that were actually attended for quality metrics
  const attendedSessions = recentSessions.filter(
    (s) => s.sessionStatus === "completed" || s.sessionStatus === "partial",
  );

  const avgDifficulty = avg(attendedSessions.map((s) => s.difficultyScore));
  const avgPain = avg(attendedSessions.map((s) => s.painScore));
  const avgEnergy = avg(attendedSessions.map((s) => s.energyScore));
  const avgEnjoyment = avg(attendedSessions.map((s) => s.enjoymentScore));

  const painEventCount = attendedSessions.filter((s) => (s.painScore ?? 1) >= 3).length;

  // Hard session streak (consecutive most-recent sessions with difficultyScore >= 4)
  let hardSessionStreak = 0;
  const sorted = [...attendedSessions].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
  for (const s of sorted) {
    if ((s.difficultyScore ?? 0) >= 4) hardSessionStreak++;
    else break;
  }

  // Count mid-session load reductions from change log (last 7 days)
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentLogs = recentChangeLogs.filter((c) => c.createdAt >= cutoff);
  const liveAdjustmentCount = recentLogs.filter(
    (c) => (c.decisionMetadata as any)?.source === "mid_session_engine",
  ).length;
  const progressionCount = recentLogs.filter((c) => c.intent === "auto_progression").length;
  const regressionCount = recentLogs.filter((c) => c.intent === "load_reduction").length;

  // ── Derived scores ───────────────────────────────────────────────────────────

  // Compliance: 100 if all completed, -20 for each skip, -10 for partial
  const weeklyComplianceScore = clamp(
    sessionCount === 0
      ? 50 // not enough data
      : Math.round(
          ((completedCount + partialCount * 0.5) / Math.max(sessionCount, 1)) * 100,
        ),
  );

  // Fatigue: avg difficulty (normalized to 0–100) + pain penalty + live-adjustment penalty
  const diffNorm = avgDifficulty !== null ? ((avgDifficulty - 1) / 4) * 100 : 50;
  const painNorm = avgPain !== null ? ((avgPain - 1) / 4) * 100 : 0;
  const liveAdjPenalty = Math.min(liveAdjustmentCount * 10, 30);
  const weeklyFatigueScore = clamp(
    Math.round(diffNorm * 0.5 + painNorm * 0.3 + liveAdjPenalty * 0.2),
  );

  // Pain risk: pain events count + average pain score
  const painFreqScore = Math.min(painEventCount * 20, 60);
  const painIntensityScore = avgPain !== null ? ((avgPain - 1) / 4) * 40 : 0;
  const painRiskScore = clamp(Math.round(painFreqScore + painIntensityScore));

  // Progress momentum: ratio of progressions to total logged decisions
  const totalDecisions = progressionCount + regressionCount;
  const progressMomentumScore =
    totalDecisions === 0
      ? 50
      : clamp(Math.round((progressionCount / totalDecisions) * 100));

  // Readiness: based on energy and enjoyment
  const energyNorm = avgEnergy !== null ? ((avgEnergy - 1) / 4) * 100 : 50;
  const enjoyNorm = avgEnjoyment !== null ? ((avgEnjoyment - 1) / 4) * 100 : 50;
  const blockReadinessScore = clamp(Math.round((energyNorm + enjoyNorm) / 2));

  return {
    sessionCount,
    completionRate: sessionCount === 0 ? 0 : completedCount / sessionCount,
    avgDifficulty,
    avgPain,
    avgEnergy,
    avgEnjoyment,
    hardSessionStreak,
    skippedCount,
    partialCount,
    painEventCount,
    liveAdjustmentCount,
    progressionCount,
    regressionCount,
    weeklyComplianceScore,
    weeklyFatigueScore,
    painRiskScore,
    progressMomentumScore,
    blockReadinessScore,
  };
}

// ─── Block status classification ─────────────────────────────────────────────

export function classifyBlockStatus(m: BlockMetrics): BlockStatus {
  // Safety checks first
  if (m.painRiskScore >= 70) return "needs_review";
  if (m.painRiskScore >= 40 && m.weeklyFatigueScore >= 65) return "needs_review";

  // Deload triggers
  const deloadScore =
    (m.weeklyFatigueScore >= 70 ? 3 : 0) +
    (m.hardSessionStreak >= 3 ? 2 : m.hardSessionStreak >= 2 ? 1 : 0) +
    (m.blockReadinessScore <= 35 ? 2 : m.blockReadinessScore <= 45 ? 1 : 0) +
    (m.liveAdjustmentCount >= 3 ? 2 : m.liveAdjustmentCount >= 2 ? 1 : 0) +
    (m.progressMomentumScore <= 30 ? 1 : 0);
  if (deloadScore >= 5) return "needs_deload";

  // Underrecovered: low energy, low enjoyment, high difficulty — but not yet deload territory
  if (m.blockReadinessScore <= 40 && m.weeklyFatigueScore >= 55) return "underrecovered";

  // Fatigued: hard sessions but adequate recovery signals
  if (m.weeklyFatigueScore >= 60) return "fatigued";

  // Inconsistent: low compliance
  if (m.weeklyComplianceScore <= 50) return "inconsistent";
  if (m.skippedCount >= 2) return "inconsistent";

  // Progressing: high compliance + good momentum + manageable fatigue
  if (
    m.weeklyComplianceScore >= 85 &&
    m.progressMomentumScore >= 60 &&
    m.weeklyFatigueScore <= 55 &&
    m.blockReadinessScore >= 55
  ) {
    return "progressing";
  }

  return "stable";
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export function buildRecommendations(
  status: BlockStatus,
  m: BlockMetrics,
): BlockRecommendation[] {
  const recs: BlockRecommendation[] = [];

  switch (status) {
    case "progressing":
      recs.push({
        type: "progress_next_week",
        scope: "next_week",
        priority: "medium",
        reason: "Sessions completed cleanly with positive momentum.",
        specifics: "Increase main lift loads by 2.5–5 lbs and maintain volume.",
      });
      break;

    case "stable":
      recs.push({
        type: "hold_next_week",
        scope: "next_week",
        priority: "low",
        reason: "Signals are mixed — no strong case for progression or reduction.",
        specifics: "Maintain current loads and volume. Watch recovery signals next week.",
      });
      break;

    case "fatigued":
      recs.push({
        type: "reduce_current_week",
        scope: "current_week",
        priority: "high",
        reason: "Difficulty trend elevated — fatigue building within the week.",
        specifics: "Remove one accessory per remaining session. Hold main lift loads steady.",
      });
      recs.push({
        type: "hold_next_week",
        scope: "next_week",
        priority: "medium",
        reason: "Give the system time to absorb training load before progressing.",
        specifics: "Keep next week at the same load and volume as this week.",
      });
      if (m.weeklyFatigueScore >= 75) {
        recs.push({
          type: "add_rest",
          scope: "current_week",
          priority: "medium",
          reason: "Fatigue is high — more rest between sessions needed.",
          specifics: "Add 30–60 seconds of rest to main compound sets this week.",
        });
      }
      break;

    case "underrecovered":
      recs.push({
        type: "reduce_current_week",
        scope: "current_week",
        priority: "high",
        reason: "Energy and recovery signals are down despite training completion.",
        specifics: "Simplify remaining sessions — remove lower-priority accessory work.",
      });
      recs.push({
        type: "hold_next_week",
        scope: "next_week",
        priority: "high",
        reason: "Recovery lag — do not progress until readiness improves.",
        specifics: "Hold next week's volume and load. Prioritize sleep and nutrition.",
      });
      break;

    case "inconsistent":
      recs.push({
        type: "hold_next_week",
        scope: "next_week",
        priority: "high",
        reason: `${m.skippedCount} skipped session(s) this week — insufficient training exposure.`,
        specifics: "Do not progress loads. Prioritize showing up consistently next week.",
      });
      break;

    case "needs_deload":
      recs.push({
        type: "deload",
        scope: "block",
        priority: "high",
        reason: `Fatigue score ${m.weeklyFatigueScore}/100, ${m.hardSessionStreak} hard session streak, readiness low.`,
        specifics: "Reduce loads 15–20%, drop one set per main lift, remove accessories for next week.",
      });
      recs.push({
        type: "reduce_current_week",
        scope: "current_week",
        priority: "high",
        reason: "Start recovery now — do not wait until next week.",
        specifics: "Simplify remaining sessions in the current week immediately.",
      });
      break;

    case "needs_review":
      recs.push({
        type: "pivot_exercises",
        scope: "block",
        priority: "high",
        reason: `Pain risk score ${m.painRiskScore}/100 — repeated discomfort detected.`,
        specifics: "Review exercises causing pain. Consider regressions or safer variations.",
      });
      recs.push({
        type: "reduce_current_week",
        scope: "current_week",
        priority: "high",
        reason: "Pain signals require conservative approach immediately.",
        specifics: "Hold all loads. Remove aggravating movements. Prioritize pain-free options.",
      });
      break;
  }

  return recs;
}

// ─── Human-readable text ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<BlockStatus, string> = {
  progressing: "Progressing",
  stable: "On Track",
  fatigued: "Fatigue Rising",
  underrecovered: "Under-Recovered",
  inconsistent: "Inconsistent",
  needs_deload: "Deload Needed",
  needs_review: "Needs Review",
};

function buildSummary(status: BlockStatus, m: BlockMetrics): string {
  switch (status) {
    case "progressing":
      return "Training is going well — loads and compliance are trending in the right direction.";
    case "stable":
      return "Performance is stable. No major changes needed — continue building consistency.";
    case "fatigued":
      return `Difficulty has been elevated across recent sessions. Fatigue is building${m.hardSessionStreak >= 2 ? ` (${m.hardSessionStreak} hard sessions in a row)` : ""}.`;
    case "underrecovered":
      return "Recovery is lagging — energy and readiness are down relative to training load.";
    case "inconsistent":
      return `${m.skippedCount > 0 ? `${m.skippedCount} session(s) skipped this week. ` : ""}Consistency is the priority right now — not progression.`;
    case "needs_deload":
      return "Accumulated fatigue, live session reductions, and recovery signals all point to a deload week.";
    case "needs_review":
      return "Repeated pain or discomfort signals require attention before continuing to progress.";
  }
}

function buildCoachInsight(status: BlockStatus, m: BlockMetrics, recs: BlockRecommendation[]): string {
  const firstRec = recs[0];
  switch (status) {
    case "progressing":
      return `You are adapting well. ${m.progressionCount > 0 ? `${m.progressionCount} exercise(s) have progressed cleanly. ` : ""}Week ${firstRec ? "2 can advance as planned." : "is on track."}`;
    case "stable":
      return "Hold steady. Consistent effort at this level will set up a stronger push next week.";
    case "fatigued":
      return `This week is becoming dense. ${firstRec?.specifics ?? "Reducing lower-priority work to protect output quality."}`;
    case "underrecovered":
      return `Recovery is lagging. ${firstRec?.specifics ?? "Simplifying the next session to preserve quality."}`;
    case "inconsistent":
      return "Show up first — progression comes from consistent training exposure. Get to the sessions this week.";
    case "needs_deload":
      return `You have accumulated enough fatigue to warrant a lighter week. ${firstRec?.specifics ?? "Reducing load and volume next week."}`;
    case "needs_review":
      return `Discomfort has appeared on ${m.painEventCount} session(s). We need to review the exercise selection before pushing further.`;
  }
}

// ─── Main evaluation function ─────────────────────────────────────────────────

export function evaluateBlockState(input: BlockInput): BlockState {
  if (input.recentSessions.length < 2) {
    return {
      status: "stable",
      metrics: computeBlockMetrics(input),
      recommendations: [],
      confidence: "low",
      summary: "Not enough sessions logged yet to evaluate the block.",
      coachInsight: "Log a few more sessions and the system will start building a picture of your progress.",
      statusLabel: "Building...",
    };
  }

  const metrics = computeBlockMetrics(input);
  const status = classifyBlockStatus(metrics);
  const recommendations = buildRecommendations(status, metrics);
  const summary = buildSummary(status, metrics);
  const coachInsight = buildCoachInsight(status, metrics, recommendations);

  // Confidence: higher with more sessions and diverse signal types
  const signalCount =
    (metrics.avgDifficulty !== null ? 1 : 0) +
    (metrics.avgPain !== null ? 1 : 0) +
    (metrics.avgEnergy !== null ? 1 : 0) +
    (metrics.progressionCount + metrics.regressionCount > 0 ? 1 : 0);

  const confidence: "low" | "medium" | "high" =
    input.recentSessions.length >= 6 && signalCount >= 3
      ? "high"
      : input.recentSessions.length >= 3 && signalCount >= 2
      ? "medium"
      : "low";

  return {
    status,
    metrics,
    recommendations,
    confidence,
    summary,
    coachInsight,
    statusLabel: STATUS_LABEL[status],
  };
}

/**
 * Build a change-log summary string for a block-level decision.
 */
export function buildBlockChangeSummary(
  status: BlockStatus,
  rec: BlockRecommendation,
): string {
  const label = STATUS_LABEL[status];
  switch (rec.type) {
    case "deload":
      return `BLOCK UPDATE — Deload week scheduled. ${rec.specifics}`;
    case "reduce_current_week":
      return `BLOCK UPDATE — Current week volume reduced. Reason: ${rec.reason}`;
    case "hold_next_week":
      return `BLOCK UPDATE — Next week loads held steady. Reason: ${rec.reason}`;
    case "progress_next_week":
      return `BLOCK UPDATE — Next week progression approved. ${rec.specifics}`;
    case "pivot_exercises":
      return `BLOCK UPDATE — Exercise review required. Reason: ${rec.reason}`;
    case "simplify_session":
      return `BLOCK UPDATE — Session simplified. ${rec.specifics}`;
    case "add_rest":
      return `BLOCK UPDATE — Rest periods extended. ${rec.specifics}`;
    default:
      return `BLOCK UPDATE — ${label}: ${rec.reason}`;
  }
}
