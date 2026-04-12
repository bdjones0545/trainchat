/**
 * GET /api/block-intelligence/status
 *
 * Returns the current block status, metrics, recommendations,
 * and coaching insight based on recent session + change-log data.
 */
import { Router, type IRouter } from "express";
import { db, sessionLogsTable, systemChangeLog, trainingSystems } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  evaluateBlockState,
  buildBlockChangeSummary,
  type SessionData,
  type ChangeLogData,
} from "../lib/blockEngine";

const router: IRouter = Router();

// ── GET /api/block-intelligence/status ───────────────────────────────────────

router.get("/block-intelligence/status", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const weeksBack = Math.min(parseInt(String(req.query.weeks ?? "4"), 10), 12);

  const since = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);

  // Fetch recent sessions
  const rawSessions = await db
    .select({
      id: sessionLogsTable.id,
      sessionStatus: sessionLogsTable.sessionStatus,
      difficultyScore: sessionLogsTable.difficultyScore,
      painScore: sessionLogsTable.painScore,
      energyScore: sessionLogsTable.energyScore,
      enjoymentScore: sessionLogsTable.enjoymentScore,
      actualDuration: sessionLogsTable.actualDuration,
      completedAt: sessionLogsTable.completedAt,
    })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, since)))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(30);

  // Fetch recent change log
  const rawChangeLogs = await db
    .select({
      intent: systemChangeLog.intent,
      source: systemChangeLog.source,
      decisionMetadata: systemChangeLog.decisionMetadata,
      createdAt: systemChangeLog.createdAt,
    })
    .from(systemChangeLog)
    .where(and(eq(systemChangeLog.userId, userId), gte(systemChangeLog.createdAt, since)))
    .orderBy(desc(systemChangeLog.createdAt))
    .limit(50);

  const sessions: SessionData[] = rawSessions.map((s) => ({
    ...s,
    sessionStatus: (s.sessionStatus ?? "completed") as SessionData["sessionStatus"],
  }));

  // Current week: sessions from the last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const currentWeekSessions = sessions.filter((s) => s.completedAt >= weekAgo);

  const changeLogs: ChangeLogData[] = rawChangeLogs.map((c) => ({
    intent: c.intent,
    source: c.source,
    decisionMetadata: (c.decisionMetadata as Record<string, unknown>) ?? null,
    createdAt: c.createdAt,
  }));

  const blockState = evaluateBlockState({ recentSessions: sessions, recentChangeLogs: changeLogs, currentWeekSessions });

  res.json({
    status: blockState.status,
    statusLabel: blockState.statusLabel,
    summary: blockState.summary,
    coachInsight: blockState.coachInsight,
    confidence: blockState.confidence,
    recommendations: blockState.recommendations,
    metrics: {
      sessionCount: blockState.metrics.sessionCount,
      completionRate: Math.round(blockState.metrics.completionRate * 100),
      weeklyComplianceScore: blockState.metrics.weeklyComplianceScore,
      weeklyFatigueScore: blockState.metrics.weeklyFatigueScore,
      painRiskScore: blockState.metrics.painRiskScore,
      progressMomentumScore: blockState.metrics.progressMomentumScore,
      blockReadinessScore: blockState.metrics.blockReadinessScore,
      hardSessionStreak: blockState.metrics.hardSessionStreak,
      skippedCount: blockState.metrics.skippedCount,
      liveAdjustmentCount: blockState.metrics.liveAdjustmentCount,
    },
  });
});

// ── POST /api/block-intelligence/evaluate ────────────────────────────────────
// Called internally after session complete to write block decisions to change log.

export async function runBlockEvaluationAndLog(userId: number): Promise<void> {
  try {
    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000); // 4 weeks

    const rawSessions = await db
      .select({
        id: sessionLogsTable.id,
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        painScore: sessionLogsTable.painScore,
        energyScore: sessionLogsTable.energyScore,
        enjoymentScore: sessionLogsTable.enjoymentScore,
        actualDuration: sessionLogsTable.actualDuration,
        completedAt: sessionLogsTable.completedAt,
      })
      .from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, since)))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(20);

    const rawChangeLogs = await db
      .select({
        intent: systemChangeLog.intent,
        source: systemChangeLog.source,
        decisionMetadata: systemChangeLog.decisionMetadata,
        createdAt: systemChangeLog.createdAt,
      })
      .from(systemChangeLog)
      .where(and(eq(systemChangeLog.userId, userId), gte(systemChangeLog.createdAt, since)))
      .orderBy(desc(systemChangeLog.createdAt))
      .limit(30);

    const sessions: SessionData[] = rawSessions.map((s) => ({
      ...s,
      sessionStatus: (s.sessionStatus ?? "completed") as SessionData["sessionStatus"],
    }));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const currentWeekSessions = sessions.filter((s) => s.completedAt >= weekAgo);
    const changeLogs: ChangeLogData[] = rawChangeLogs.map((c) => ({
      intent: c.intent,
      source: c.source,
      decisionMetadata: (c.decisionMetadata as Record<string, unknown>) ?? null,
      createdAt: c.createdAt,
    }));

    const blockState = evaluateBlockState({ recentSessions: sessions, recentChangeLogs: changeLogs, currentWeekSessions });

    // Only write to change log for actionable states that warrant a logged decision
    const logWorthy: typeof blockState.status[] = ["fatigued", "underrecovered", "needs_deload", "needs_review"];
    if (!logWorthy.includes(blockState.status)) return;

    // Avoid duplicate block entries — only write if last block-scope auto_adjust was > 12 hours ago
    const existingBlockLogs = await db
      .select({ createdAt: systemChangeLog.createdAt })
      .from(systemChangeLog)
      .where(
        and(
          eq(systemChangeLog.userId, userId),
          eq(systemChangeLog.source, "auto_adjust"),
          eq(systemChangeLog.scope, "block"),
          gte(systemChangeLog.createdAt, new Date(Date.now() - 12 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);

    if (existingBlockLogs.length > 0) return; // Already logged block state recently

    // Find active training system
    const activeSystem = await db
      .select({ id: trainingSystems.id })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!activeSystem) return;

    // Write the most important recommendation
    const topRec = blockState.recommendations[0];
    if (!topRec) return;

    const summary = buildBlockChangeSummary(blockState.status, topRec);

    await db.insert(systemChangeLog).values({
      userId,
      trainingSystemId: activeSystem.id,
      source: "auto_adjust",
      intent: topRec.type === "progress_next_week"
        ? "auto_progression"
        : topRec.type === "deload"
        ? "deload_signal"
        : "load_reduction",
      scope: topRec.scope === "current_week" || topRec.scope === "next_week" ? "week" : "block",
      changeSummary: summary,
      isMajorVersion: false,
      decisionMetadata: {
        blockStatus: blockState.status,
        statusLabel: blockState.statusLabel,
        confidence: blockState.confidence,
        weeklyFatigueScore: blockState.metrics.weeklyFatigueScore,
        painRiskScore: blockState.metrics.painRiskScore,
        weeklyComplianceScore: blockState.metrics.weeklyComplianceScore,
        progressMomentumScore: blockState.metrics.progressMomentumScore,
        blockReadinessScore: blockState.metrics.blockReadinessScore,
        hardSessionStreak: blockState.metrics.hardSessionStreak,
        whyChanged: blockState.summary,
        coachInsight: blockState.coachInsight,
        topRecommendation: topRec,
      },
    });
  } catch {
    // Non-fatal — block evaluation is best-effort
  }
}

export default router;
