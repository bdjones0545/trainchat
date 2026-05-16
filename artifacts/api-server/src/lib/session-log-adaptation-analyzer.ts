/**
 * Session Log Adaptation Analyzer
 *
 * Input: latest session log + rolling 7–14 day log history
 * Output: structured adaptation signals used to:
 *   - Decide whether to adjust future sessions
 *   - Write change receipts to system_change_log
 *   - Determine the scope of any adjustment
 *
 * Adjustment scope rules:
 *   - One bad session            → no program rewrite
 *   - Pain flag (>=3)            → adjust next similar movement/session
 *   - Repeated fatigue (2–3 log) → reduce next 1–2 sessions volume/intensity
 *   - Repeated easy sessions     → progress next comparable lift/session
 *   - Skipped/partial            → preserve plan, offer shorter or recovery option
 */

import { db, sessionLogsTable, trainingSystems, systemChangeLog } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { logger } from "./logger";

// ─── Output types ──────────────────────────────────────────────────────────

export type FatigueTrend = "accumulating" | "stable" | "recovering";
export type AdjustmentScope = "none" | "next_session_only" | "next_two_sessions" | "pain_specific";

export interface SessionLogAdaptationResult {
  readinessScore: number;
  fatigueTrend: FatigueTrend;
  painFlag: boolean;
  adherenceFlag: boolean;
  progressionFlag: boolean;
  recommendedAdjustmentScope: AdjustmentScope;
  adaptationApplied: boolean;
  adjustmentReason: string | null;
  sessionsAffected: number[];
  exercisesChanged: string[];
  changeReceiptId: number | null;
}

// ─── Rolling helpers ───────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 3;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ─── Core analyzer ────────────────────────────────────────────────────────

export async function analyzeSessionLogAdaptation(
  userId: number,
  latestLog: {
    sessionStatus: string;
    difficultyScore?: number | null;
    energyScore?: number | null;
    painScore?: number | null;
    enjoymentScore?: number | null;
    painAreas?: string[] | null;
    notes?: string | null;
  },
  trainingSystemId?: number | null
): Promise<SessionLogAdaptationResult> {
  const nullResult: SessionLogAdaptationResult = {
    readinessScore: 3,
    fatigueTrend: "stable",
    painFlag: false,
    adherenceFlag: false,
    progressionFlag: false,
    recommendedAdjustmentScope: "none",
    adaptationApplied: false,
    adjustmentReason: null,
    sessionsAffected: [],
    exercisesChanged: [],
    changeReceiptId: null,
  };

  try {
    // Fetch rolling 14-day history (excluding the just-inserted log)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
    const history = await db
      .select({
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        energyScore: sessionLogsTable.energyScore,
        painScore: sessionLogsTable.painScore,
        enjoymentScore: sessionLogsTable.enjoymentScore,
        painAreas: sessionLogsTable.painAreas,
        completedAt: sessionLogsTable.completedAt,
      })
      .from(sessionLogsTable)
      .where(
        and(
          eq(sessionLogsTable.userId, userId),
          gte(sessionLogsTable.completedAt, fourteenDaysAgo)
        )
      )
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(14);

    const completed = history.filter((l) => l.sessionStatus !== "skipped");
    const recent3 = completed.slice(0, 3);

    // ── Compute signals ──────────────────────────────────────────────────

    const latestDiff = latestLog.difficultyScore ?? 3;
    const latestEnergy = latestLog.energyScore ?? 3;
    const latestPain = latestLog.painScore ?? 1;
    const latestPainAreas = (latestLog.painAreas ?? []) as string[];
    const isSkipped = latestLog.sessionStatus === "skipped";
    const isPartial = latestLog.sessionStatus === "partial";

    const avgDiff = avg(recent3.map((l) => l.difficultyScore ?? 3));
    const avgEnergy = avg(recent3.map((l) => l.energyScore ?? 3));
    const fatigueIndex = (avgDiff + (6 - avgEnergy)) / 2;

    // Adherence: skipped/partial in last 14 days
    const totalCount = history.length;
    const skippedOrPartialCount = history.filter(
      (l) => l.sessionStatus === "skipped" || l.sessionStatus === "partial"
    ).length;
    const adherenceRate = totalCount > 0 ? (totalCount - skippedOrPartialCount) / totalCount : 1;

    // Readiness score (1-5): inverse of fatigue composite
    const readinessScore = Math.max(1, Math.min(5, Math.round((6 - fatigueIndex) * 10) / 10));

    // Fatigue trend
    let fatigueTrend: FatigueTrend = "stable";
    if (fatigueIndex >= 4.0 && recent3.length >= 2) {
      fatigueTrend = "accumulating";
    } else if (fatigueIndex <= 2.5 && avgEnergy >= 3.5) {
      fatigueTrend = "recovering";
    }

    const painFlag = latestPain >= 3;
    const adherenceFlag = adherenceRate < 0.65 && totalCount >= 4;

    // Progression: 2+ completed sessions with easy difficulty and good energy
    const easyCount = recent3.filter(
      (l) => (l.difficultyScore ?? 3) <= 2 && (l.energyScore ?? 3) >= 4
    ).length;
    const progressionFlag =
      !isSkipped && !isPartial && !painFlag &&
      easyCount >= 2 &&
      latestDiff <= 2 &&
      latestEnergy >= 4;

    // ── Determine adjustment scope ────────────────────────────────────────

    let scope: AdjustmentScope = "none";
    let adjustmentReason: string | null = null;

    if (painFlag && latestPainAreas.length > 0) {
      scope = "pain_specific";
      const areas = latestPainAreas.join(", ");
      adjustmentReason = `Pain (score ${latestPain}/5) reported in ${areas} — next session adjusted for movement patterns stressing this area.`;
    } else if (fatigueTrend === "accumulating" && recent3.length >= 2) {
      scope = "next_two_sessions";
      adjustmentReason = `Fatigue accumulation detected (index ${fatigueIndex.toFixed(1)}/5 across ${recent3.length} recent sessions) — volume reduced for next 1–2 sessions.`;
    } else if (isSkipped || isPartial) {
      // Preserve plan — no structural change
      scope = "none";
      adjustmentReason = null;
    } else if (progressionFlag) {
      scope = "next_session_only";
      adjustmentReason = `Repeated easy sessions (${easyCount} in a row) — next session progressed slightly to match current capacity.`;
    } else if (latestDiff >= 4 && latestEnergy <= 2) {
      // Single hard+drained session — do NOT rewrite; next-session-intelligence already handles
      scope = "none";
      adjustmentReason = null;
    }

    // ── Write change receipt to system_change_log (if adjustment warranted) ──

    let changeReceiptId: number | null = null;
    if (scope !== "none" && adjustmentReason && trainingSystemId) {
      try {
        const [receipt] = await db
          .insert(systemChangeLog)
          .values({
            userId,
            trainingSystemId,
            source: "workout_feedback",
            intent: scope === "pain_specific" ? "ADJUST_FOR_PAIN"
              : scope === "next_two_sessions" ? "FATIGUE_REDUCTION"
              : "AUTO_PROGRESSION",
            scope: scope === "next_two_sessions" ? "session" : "exercise",
            changeSummary: adjustmentReason,
            isMajorVersion: false,
            decisionMetadata: {
              readinessScore,
              fatigueTrend,
              painFlag,
              adherenceFlag,
              progressionFlag,
              recommendedAdjustmentScope: scope,
              latestDifficultyScore: latestDiff,
              latestEnergyScore: latestEnergy,
              latestPainScore: latestPain,
              latestPainAreas,
              rollingSessionCount: recent3.length,
            },
          })
          .returning({ id: systemChangeLog.id });
        changeReceiptId = receipt?.id ?? null;
      } catch (err) {
        logger.warn({ err, userId }, "[Analyzer] Failed to write change receipt — non-fatal");
      }
    }

    return {
      readinessScore,
      fatigueTrend,
      painFlag,
      adherenceFlag,
      progressionFlag,
      recommendedAdjustmentScope: scope,
      adaptationApplied: scope !== "none" && changeReceiptId !== null,
      adjustmentReason,
      sessionsAffected: [],
      exercisesChanged: [],
      changeReceiptId,
    };
  } catch (err) {
    logger.warn({ err, userId }, "[Analyzer] analyzeSessionLogAdaptation failed — returning nullResult");
    return nullResult;
  }
}

// ─── Session log context builder for agent prompt injection ───────────────

interface RecentLogRow {
  sessionStatus: string | null;
  difficultyScore: number | null;
  energyScore: number | null;
  painScore: number | null;
  enjoymentScore: number | null;
  painAreas: unknown;
  completedAt: Date;
  notes: string | null;
}

function describeLog(log: RecentLogRow, index: number): string {
  const dayLabel = index === 0 ? "Last session" : `${index + 1} sessions ago`;
  const status = log.sessionStatus ?? "completed";

  if (status === "skipped") {
    return `${dayLabel}: Skipped.`;
  }

  const parts: string[] = [`${dayLabel}: ${status}`];

  if (log.difficultyScore != null) {
    const diffLabel =
      log.difficultyScore <= 2 ? "easy" :
      log.difficultyScore >= 4 ? "hard" : "moderate difficulty";
    parts.push(diffLabel);
  }

  if (log.painScore != null && log.painScore >= 3) {
    const painAreas = Array.isArray(log.painAreas) ? (log.painAreas as string[]).join(", ") : null;
    const painLabel = log.painScore >= 4 ? "significant pain" : "moderate discomfort";
    parts.push(painAreas ? `${painLabel} (${painAreas})` : painLabel);
  } else if (log.painScore != null && log.painScore <= 1) {
    parts.push("no pain");
  }

  if (log.energyScore != null) {
    const energyLabel =
      log.energyScore <= 2 ? "drained after" :
      log.energyScore >= 4 ? "good energy after" : null;
    if (energyLabel) parts.push(energyLabel);
  }

  if (log.notes?.trim()) {
    parts.push(`note: "${log.notes.trim().slice(0, 100)}"`);
  }

  return parts.join(", ") + ".";
}

/**
 * Builds a concise coaching-style session log context for injection into
 * the agent system prompt. Shows the last 3 sessions in plain language.
 *
 * Called in conversations.ts to give the coach awareness of recent training
 * without requiring it to query the DB itself.
 */
export async function buildSessionLogContext(userId: number): Promise<string> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const logs = await db
      .select({
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        energyScore: sessionLogsTable.energyScore,
        painScore: sessionLogsTable.painScore,
        enjoymentScore: sessionLogsTable.enjoymentScore,
        painAreas: sessionLogsTable.painAreas,
        completedAt: sessionLogsTable.completedAt,
        notes: sessionLogsTable.notes,
      })
      .from(sessionLogsTable)
      .where(
        and(
          eq(sessionLogsTable.userId, userId),
          gte(sessionLogsTable.completedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(3);

    if (logs.length === 0) return "";

    const lines = logs.map((l, i) => `  • ${describeLog(l as RecentLogRow, i)}`);

    const hasPain = logs.some((l) => (l.painScore ?? 0) >= 3);
    const hasFatigue = logs.some((l) =>
      (l.difficultyScore ?? 0) >= 4 && (l.energyScore ?? 5) <= 2
    );
    const hasMultipleSkips = logs.filter((l) => l.sessionStatus === "skipped").length >= 2;

    const warnings: string[] = [];
    if (hasPain) warnings.push("Pain has been flagged — adjust loading on affected movement patterns.");
    if (hasFatigue) warnings.push("Fatigue signal present — do not push load progression this session.");
    if (hasMultipleSkips) warnings.push("Adherence risk — keep the plan realistic and achievable.");

    const warningBlock = warnings.length > 0
      ? `\nCoach directives from session history:\n${warnings.map((w) => `  → ${w}`).join("\n")}`
      : "";

    return `## RECENT SESSION LOG (last 7 days)\nReference this naturally in your coaching — do not list these verbatim:\n${lines.join("\n")}${warningBlock}`;
  } catch {
    return "";
  }
}
