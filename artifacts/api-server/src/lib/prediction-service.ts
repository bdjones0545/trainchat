/**
 * Prediction Service — Training Pattern Recognition Engine
 *
 * Reads from existing training data (readiness, sessions, exercise logs,
 * neural profile) to identify likely future outcomes before they become problems.
 *
 * Produces PredictionSignal objects — each has a type, severity, confidence,
 * coaching-language explanation, and a concrete suggested action.
 *
 * No DB writes — predictions are computed in real-time from existing records.
 * No invented signals — everything traces to actual training behavior.
 * Maximum 3 signals returned, sorted by priority.
 *
 * Tone: coach-like, not diagnostic. Anticipatory, not alarming.
 */

import { db, readinessEntriesTable, sessionLogsTable, exerciseLogsTable, neuralProfilesTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PredictionType =
  | "FATIGUE_RISK"
  | "MISSED_SESSION_RISK"
  | "PLATEAU_RISK"
  | "PROGRESSION_OPPORTUNITY"
  | "RECOVERY_DIP_RISK";

export type PredictionSeverity = "low" | "medium" | "high";

export interface PredictionSignal {
  id: string;
  type: PredictionType;
  severity: PredictionSeverity;
  confidence: number;             // 0-1

  title: string;
  explanation: string;            // One-line surface explanation
  evidence: string;               // "Show Why" — detailed supporting evidence
  suggestedAction: string;        // Concrete coaching action
  actionPrompt: string;           // Pre-written message to send to the AI coach
}

export interface PredictionResult {
  predictions: PredictionSignal[];
  generatedAt: Date;
}

// ─── Severity rank for sorting ────────────────────────────────────────────────

const SEVERITY_RANK: Record<PredictionSeverity, number> = { high: 3, medium: 2, low: 1 };

function prioritySort(a: PredictionSignal, b: PredictionSignal): number {
  // Positive types (opportunity) rank lower than risk signals at same severity
  const aIsPositive = a.type === "PROGRESSION_OPPORTUNITY";
  const bIsPositive = b.type === "PROGRESSION_OPPORTUNITY";
  if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) {
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  }
  if (aIsPositive && !bIsPositive) return 1;
  if (!aIsPositive && bIsPositive) return -1;
  return b.confidence - a.confidence;
}

// ─── Trend helpers ────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Returns positive if metric is rising, negative if declining */
function trendDirection(values: number[]): number {
  if (values.length < 2) return 0;
  const half = Math.floor(values.length / 2);
  const early = avg(values.slice(0, half));
  const recent = avg(values.slice(half));
  return recent - early;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generatePredictions(userId: number): Promise<PredictionResult> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  // Fetch all data in parallel
  const [readinessRows, sessionRows, exerciseRows, neuralRows] = await Promise.all([
    db.select().from(readinessEntriesTable)
      .where(and(eq(readinessEntriesTable.userId, userId), gte(readinessEntriesTable.createdAt, fourteenDaysAgo)))
      .orderBy(desc(readinessEntriesTable.createdAt)).limit(20),
    db.select().from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, thirtyDaysAgo)))
      .orderBy(desc(sessionLogsTable.completedAt)).limit(25),
    db.select().from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.loggedAt, thirtyDaysAgo)))
      .orderBy(desc(exerciseLogsTable.loggedAt)).limit(60),
    db.select().from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, userId)).limit(1),
  ]);

  const neuralProfile = neuralRows[0] ?? null;
  const signals: PredictionSignal[] = [];

  // ── 1. FATIGUE RISK ────────────────────────────────────────────────────────
  {
    const recentReadiness = readinessRows.slice(0, 7);
    const sleepScores = recentReadiness.map((r) => r.sleepScore ?? 3).filter(Boolean);
    const sorenessScores = recentReadiness.map((r) => r.sorenessScore ?? 2).filter(Boolean);
    const energyScores = recentReadiness.map((r) => r.energyScore ?? 3).filter(Boolean);

    const avgSleep = avg(sleepScores);
    const avgSoreness = avg(sorenessScores);
    const avgEnergy = avg(energyScores);

    const recentSessions = sessionRows.slice(0, 5);
    const hardSessions = recentSessions.filter((s) => (s.difficultyScore ?? 3) >= 4);
    const consecutiveHard = hardSessions.length;

    const fatigueTriggers: string[] = [];
    let fatigueScore = 0;

    if (avgSoreness >= 3.5) { fatigueTriggers.push(`elevated soreness (avg ${avgSoreness.toFixed(1)}/5)`); fatigueScore += 2; }
    if (avgSleep <= 2.5) { fatigueTriggers.push(`poor sleep (avg ${avgSleep.toFixed(1)}/5)`); fatigueScore += 2; }
    if (avgEnergy <= 2.5) { fatigueTriggers.push(`low energy (avg ${avgEnergy.toFixed(1)}/5)`); fatigueScore += 1; }
    if (consecutiveHard >= 3) { fatigueTriggers.push(`${consecutiveHard} recent high-effort sessions`); fatigueScore += 2; }

    if (fatigueScore >= 2 && fatigueTriggers.length > 0) {
      const severity: PredictionSeverity = fatigueScore >= 4 ? "high" : "medium";
      signals.push({
        id: "fatigue_risk",
        type: "FATIGUE_RISK",
        severity,
        confidence: Math.min(0.95, 0.5 + fatigueScore * 0.1),
        title: "Fatigue accumulating",
        explanation: "Recent data suggests training stress is outpacing recovery.",
        evidence: `Your last ${recentReadiness.length} check-ins show ${fatigueTriggers.join(", ")}. Managing this now protects long-term adaptation.`,
        suggestedAction: "Reduce session volume and lower intensity for your next 1-2 sessions to let recovery catch up.",
        actionPrompt: "My recent check-ins show elevated soreness and reduced energy. Can you reduce the volume and intensity on my next session — keep the structure but make it lighter?",
      });
    }
  }

  // ── 2. MISSED SESSION RISK ─────────────────────────────────────────────────
  {
    const recentSessions = sessionRows.slice(0, 10);
    const skipped = recentSessions.filter((s) => s.sessionStatus === "skipped" || s.sessionStatus === "rescheduled");
    const partial = recentSessions.filter((s) => s.sessionStatus === "partial");
    const missedCount = skipped.length;
    const consistencyScore = neuralProfile?.consistencyScore ?? 100;

    const missedTriggers: string[] = [];
    let missedScore = 0;

    if (missedCount >= 3) { missedTriggers.push(`${missedCount} skipped sessions recently`); missedScore += 3; }
    else if (missedCount >= 2) { missedTriggers.push(`${missedCount} skipped sessions in recent history`); missedScore += 2; }
    if (partial.length >= 2) { missedTriggers.push(`${partial.length} incomplete sessions`); missedScore += 1; }
    if (consistencyScore < 30) { missedTriggers.push("consistency trend below target"); missedScore += 1; }

    if (missedScore >= 2 && missedTriggers.length > 0) {
      const severity: PredictionSeverity = missedScore >= 4 ? "high" : "medium";
      signals.push({
        id: "missed_session_risk",
        type: "MISSED_SESSION_RISK",
        severity,
        confidence: Math.min(0.9, 0.45 + missedScore * 0.12),
        title: "Consistency at risk",
        explanation: "Your recent pattern suggests session completion may be under pressure.",
        evidence: `You've had ${missedTriggers.join(" and ")} in the last ${recentSessions.length} planned sessions. Reducing complexity now makes the next session easier to start.`,
        suggestedAction: "Simplify your next session — shorter, fewer exercises, lower stakes.",
        actionPrompt: "I've been struggling to complete sessions consistently. Can you simplify my next workout — make it shorter and lower in complexity to help me get back into a consistent rhythm?",
      });
    }
  }

  // ── 3. PLATEAU RISK ───────────────────────────────────────────────────────
  {
    // Group exercise logs by exercise name and check for load stagnation
    const exerciseMap = new Map<string, typeof exerciseRows>();
    exerciseRows.forEach((log) => {
      const existing = exerciseMap.get(log.exerciseName) ?? [];
      existing.push(log);
      exerciseMap.set(log.exerciseName, existing);
    });

    let stalledCount = 0;
    let stalledExercises: string[] = [];

    exerciseMap.forEach((logs, name) => {
      if (logs.length < 3) return; // Need at least 3 data points
      const recent = logs.slice(0, 4);
      const loads = recent.map((l) => l.loadUsed ?? 0).filter((l) => l > 0);
      const hasLoad = loads.length >= 3;
      if (!hasLoad) return;

      const loadRange = Math.max(...loads) - Math.min(...loads);
      const hasHardFails = recent.filter((l) => l.completionStatus === "hard" || l.completionStatus === "failed").length >= 2;

      if (loadRange < 2.5 && hasHardFails) {
        stalledCount++;
        stalledExercises.push(name);
      }
    });

    if (stalledCount >= 2) {
      const severity: PredictionSeverity = stalledCount >= 3 ? "high" : "medium";
      signals.push({
        id: "plateau_risk",
        type: "PLATEAU_RISK",
        severity,
        confidence: Math.min(0.85, 0.5 + stalledCount * 0.1),
        title: "Progression plateau forming",
        explanation: "Multiple lifts are showing effort without load increase.",
        evidence: `${stalledExercises.slice(0, 3).join(", ")} ${stalledCount > 3 ? `and ${stalledCount - 3} other${stalledCount - 3 > 1 ? "s" : ""}` : ""} — high effort with no progression over ${stalledCount >= 3 ? "4+" : "3"} sessions. Quality focus or load reset may be needed.`,
        suggestedAction: "Hold current load. Prioritize technique and execution quality before adding weight.",
        actionPrompt: `I seem to be plateauing on a few lifts — high effort, no progression. Can you adjust my next session to focus on quality and hold the current load rather than trying to progress?`,
      });
    }
  }

  // ── 4. PROGRESSION OPPORTUNITY ────────────────────────────────────────────
  {
    const recentReadiness = readinessRows.slice(0, 5);
    const recentSessions = sessionRows.slice(0, 5);
    const completedSessions = recentSessions.filter((s) => s.sessionStatus === "completed");
    // Composite readiness estimate: avg of energy + motivation (both 1-5 scales)
    const avgReadiness = avg(recentReadiness.map((r) => (r.energyScore + r.motivationScore) / 2));

    const recentLogs = exerciseRows.slice(0, 15);
    const easyOrSolid = recentLogs.filter((l) => l.completionStatus === "easy" || l.completionStatus === "solid");
    const qualityRate = recentLogs.length > 0 ? easyOrSolid.length / recentLogs.length : 0;

    const avgDifficulty = avg(recentSessions.map((s) => s.difficultyScore ?? 3));

    const isOpportunity =
      completedSessions.length >= 3 &&
      avgReadiness >= 3.8 &&
      qualityRate >= 0.65 &&
      avgDifficulty <= 3.2 &&
      // Don't surface opportunity if fatigue risk is already detected
      !signals.find((s) => s.type === "FATIGUE_RISK");

    if (isOpportunity) {
      const confidence = Math.min(0.9, 0.55 + qualityRate * 0.3 + (avgReadiness - 3) * 0.1);
      signals.push({
        id: "progression_opportunity",
        type: "PROGRESSION_OPPORTUNITY",
        severity: avgReadiness >= 4.2 ? "medium" : "low",
        confidence,
        title: "Progression opportunity",
        explanation: "Readiness and session quality signal capacity to push forward.",
        evidence: `${completedSessions.length} of ${recentSessions.length} recent sessions completed. Readiness avg ${avgReadiness.toFixed(1)}/5. ${Math.round(qualityRate * 100)}% of recent reps rated solid or easy — conditions are right to increase load.`,
        suggestedAction: "Increase primary lift load by the standard increment next session.",
        actionPrompt: "My recent sessions have been consistently completed with good readiness. Can you progress my primary lifts — I think I'm ready to add load?",
      });
    }
  }

  // ── 5. RECOVERY DIP RISK ──────────────────────────────────────────────────
  {
    // Only surface if fatigue risk is not already present (overlapping signal)
    const hasFatigue = signals.find((s) => s.type === "FATIGUE_RISK");
    if (!hasFatigue) {
      const recentReadiness = readinessRows.slice(0, 7);
      const sleepTrend = trendDirection(recentReadiness.map((r) => r.sleepScore ?? 3).reverse());
      const stressTrend = trendDirection(recentReadiness.map((r) => r.stressScore ?? 3).reverse());

      const avgSleep = avg(recentReadiness.map((r) => r.sleepScore ?? 3));
      const avgStress = avg(recentReadiness.map((r) => r.stressScore ?? 3));

      const isDecliningSleep = sleepTrend < -0.4 && avgSleep <= 3.2;
      const isRisingStress = stressTrend > 0.4 && avgStress >= 3.0;

      const recoveryTriggers: string[] = [];
      let recoveryScore = 0;

      if (isDecliningSleep) { recoveryTriggers.push("sleep quality declining"); recoveryScore += 2; }
      if (isRisingStress) { recoveryTriggers.push("stress trending higher"); recoveryScore += 2; }

      if (recoveryScore >= 2 && recentReadiness.length >= 3) {
        signals.push({
          id: "recovery_dip_risk",
          type: "RECOVERY_DIP_RISK",
          severity: "medium",
          confidence: Math.min(0.8, 0.5 + recoveryScore * 0.1),
          title: "Recovery quality slipping",
          explanation: `${recoveryTriggers.join(" and ")} — worth adjusting before it compounds.`,
          evidence: `Over your last ${recentReadiness.length} check-ins: ${isDecliningSleep ? `sleep dropped toward ${avgSleep.toFixed(1)}/5` : ""}${isDecliningSleep && isRisingStress ? ", " : ""}${isRisingStress ? `stress trending toward ${avgStress.toFixed(1)}/5` : ""}. Addressing early prevents deeper fatigue accumulation.`,
          suggestedAction: "Shift your next session toward lower-stress movements and add a recovery emphasis.",
          actionPrompt: "My sleep has been declining and stress is rising. Can you adjust my next session to be lower stress — reduce the intensity and focus more on recovery-friendly movements?",
        });
      }
    }
  }

  // Sort by priority and cap at 3
  const sorted = signals.sort(prioritySort).slice(0, 3);

  return {
    predictions: sorted,
    generatedAt: now,
  };
}
