/**
 * TrainChat Adaptation Service
 *
 * Reads recent readiness entries and session feedback from the database,
 * computes trend signals, and builds an adaptive context string that gets
 * injected into the AI system prompt alongside the training intelligence context.
 *
 * Separation of concerns:
 * - training-intelligence.ts  → static rules from profile
 * - adaptation.ts             → dynamic signals from recent behavior
 * - ai.ts                     → combines both into the final system prompt
 */

import { db, readinessEntriesTable, sessionFeedbackTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessEntry {
  id: number;
  userId: number;
  sleepScore: number;
  energyScore: number;
  sorenessScore: number;
  stressScore: number;
  motivationScore: number;
  painScore: number;
  notes: string | null;
  createdAt: Date;
}

export interface SessionFeedbackEntry {
  id: number;
  userId: number;
  savedProgramId: number | null;
  difficultyScore: number;
  painResponseScore: number;
  energyResponseScore: number;
  notes: string | null;
  createdAt: Date;
}

export interface AdaptationContext {
  hasReadiness: boolean;
  hasFeedback: boolean;
  latestReadiness: ReadinessEntry | null;
  recentReadiness: ReadinessEntry[];
  recentFeedback: SessionFeedbackEntry[];
  trends: TrendSignals;
  promptContext: string;
}

export interface TrendSignals {
  overallReadiness: "low" | "moderate" | "high";
  sleepTrend: "poor" | "ok" | "good";
  recoveryTrend: "poor" | "ok" | "good";
  painTrend: "elevated" | "managed" | "none";
  fatigueAccumulation: "high" | "moderate" | "low";
  trainingTolerance: "struggling" | "adapting" | "thriving";
  recommendedAdjustment: "reduce" | "maintain" | "progress";
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchRecentReadiness(userId: number, limit = 7): Promise<ReadinessEntry[]> {
  return db
    .select()
    .from(readinessEntriesTable)
    .where(eq(readinessEntriesTable.userId, userId))
    .orderBy(desc(readinessEntriesTable.createdAt))
    .limit(limit) as Promise<ReadinessEntry[]>;
}

async function fetchRecentFeedback(userId: number, limit = 5): Promise<SessionFeedbackEntry[]> {
  return db
    .select()
    .from(sessionFeedbackTable)
    .where(eq(sessionFeedbackTable.userId, userId))
    .orderBy(desc(sessionFeedbackTable.createdAt))
    .limit(limit) as Promise<SessionFeedbackEntry[]>;
}

// ─── Trend analysis ───────────────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeTrends(
  readiness: ReadinessEntry[],
  feedback: SessionFeedbackEntry[]
): TrendSignals {
  if (readiness.length === 0 && feedback.length === 0) {
    return {
      overallReadiness: "moderate",
      sleepTrend: "ok",
      recoveryTrend: "ok",
      painTrend: "none",
      fatigueAccumulation: "low",
      trainingTolerance: "adapting",
      recommendedAdjustment: "maintain",
    };
  }

  // Readiness signals
  const sleepAvg = avg(readiness.map((r) => r.sleepScore));
  const energyAvg = avg(readiness.map((r) => r.energyScore));
  const sorenessAvg = avg(readiness.map((r) => r.sorenessScore));
  const stressAvg = avg(readiness.map((r) => r.stressScore));
  const motivationAvg = avg(readiness.map((r) => r.motivationScore));
  const painAvg = avg(readiness.map((r) => r.painScore));

  // Overall readiness composite (higher is better; invert soreness/stress)
  const composite = (sleepAvg + energyAvg + motivationAvg + (6 - sorenessAvg) + (6 - stressAvg)) / 5;

  const overallReadiness: TrendSignals["overallReadiness"] =
    composite >= 4 ? "high" : composite >= 2.8 ? "moderate" : "low";

  const sleepTrend: TrendSignals["sleepTrend"] =
    sleepAvg >= 4 ? "good" : sleepAvg >= 2.8 ? "ok" : "poor";

  const recoveryTrend: TrendSignals["recoveryTrend"] =
    sorenessAvg <= 2 ? "good" : sorenessAvg <= 3.5 ? "ok" : "poor";

  const painTrend: TrendSignals["painTrend"] =
    painAvg >= 3.5 ? "elevated" : painAvg >= 2 ? "managed" : "none";

  const fatigueAccumulation: TrendSignals["fatigueAccumulation"] =
    sorenessAvg >= 4 || stressAvg >= 4 ? "high" : sorenessAvg >= 3 || stressAvg >= 3 ? "moderate" : "low";

  // Session feedback signals (if available)
  let trainingTolerance: TrendSignals["trainingTolerance"] = "adapting";
  if (feedback.length >= 2) {
    const difficultyAvg = avg(feedback.map((f) => f.difficultyScore));
    const feedbackPainAvg = avg(feedback.map((f) => f.painResponseScore));
    const energyResponseAvg = avg(feedback.map((f) => f.energyResponseScore));

    if (difficultyAvg >= 4.5 || feedbackPainAvg >= 3.5) {
      trainingTolerance = "struggling";
    } else if (difficultyAvg <= 2.5 && energyResponseAvg >= 4) {
      trainingTolerance = "thriving";
    } else {
      trainingTolerance = "adapting";
    }
  }

  // Recommended adjustment
  let recommendedAdjustment: TrendSignals["recommendedAdjustment"] = "maintain";
  if (
    overallReadiness === "low" ||
    fatigueAccumulation === "high" ||
    trainingTolerance === "struggling" ||
    painTrend === "elevated"
  ) {
    recommendedAdjustment = "reduce";
  } else if (
    overallReadiness === "high" &&
    fatigueAccumulation === "low" &&
    (trainingTolerance === "thriving" || feedback.length === 0)
  ) {
    recommendedAdjustment = "progress";
  }

  return {
    overallReadiness,
    sleepTrend,
    recoveryTrend,
    painTrend,
    fatigueAccumulation,
    trainingTolerance,
    recommendedAdjustment,
  };
}

// ─── Context string builder ────────────────────────────────────────────────────

function buildAdaptationPrompt(
  latest: ReadinessEntry | null,
  trends: TrendSignals,
  recentFeedback: SessionFeedbackEntry[],
  readinessCount: number
): string {
  if (!latest && recentFeedback.length === 0) {
    return ""; // No adaptation data yet — don't inject anything
  }

  const lines: string[] = [];
  lines.push("## ADAPTIVE CONTEXT");
  lines.push("(Live readiness and feedback signals — apply these to inform session recommendations)");
  lines.push("");

  if (latest) {
    const latestDate = new Date(latest.createdAt);
    const hoursAgo = Math.round((Date.now() - latestDate.getTime()) / 3600000);
    const timeLabel = hoursAgo < 2 ? "just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : "yesterday";

    lines.push(`### LATEST READINESS CHECK-IN (${timeLabel})`);
    lines.push(`Sleep: ${scoreLabel(latest.sleepScore, "sleep")}`);
    lines.push(`Energy: ${scoreLabel(latest.energyScore, "energy")}`);
    lines.push(`Soreness: ${scoreLabel(latest.sorenessScore, "soreness")}`);
    lines.push(`Stress: ${scoreLabel(latest.stressScore, "stress")}`);
    lines.push(`Motivation: ${scoreLabel(latest.motivationScore, "motivation")}`);
    lines.push(`Pain: ${scoreLabel(latest.painScore, "pain")}`);
    if (latest.notes) lines.push(`Notes: "${latest.notes}"`);
    lines.push("");
  }

  if (readinessCount >= 3) {
    lines.push(`### RECENT TRENDS (last ${readinessCount} check-ins)`);
    lines.push(`Overall Readiness: ${trends.overallReadiness.toUpperCase()}`);
    lines.push(`Sleep trend: ${trends.sleepTrend}`);
    lines.push(`Recovery trend: ${trends.recoveryTrend}`);
    lines.push(`Fatigue accumulation: ${trends.fatigueAccumulation}`);
    if (trends.painTrend !== "none") lines.push(`Pain trend: ${trends.painTrend}`);
    lines.push("");
  }

  if (recentFeedback.length >= 2) {
    lines.push(`### RECENT SESSION FEEDBACK (last ${recentFeedback.length} sessions)`);
    lines.push(`Training tolerance: ${trends.trainingTolerance}`);
    const lastFeedback = recentFeedback[0];
    if (lastFeedback.notes) lines.push(`Last session note: "${lastFeedback.notes}"`);
    lines.push("");
  }

  // Adaptive directive
  lines.push("### ADAPTIVE DIRECTIVE");
  switch (trends.recommendedAdjustment) {
    case "reduce":
      lines.push("REDUCE: Current signals indicate recovery is compromised. Intelligently reduce session density, intensity, or volume.");
      lines.push("Options: fewer exercises, lower rep ranges, longer rest, swap high-stress exercises for lower-demand alternatives.");
      lines.push("Preserve training continuity — don't abandon structure. Adjust it.");
      if (trends.painTrend === "elevated") {
        lines.push("Pain trend is elevated — be especially conservative with aggravating movement patterns.");
      }
      break;
    case "progress":
      lines.push("PROGRESS: Recovery signals are strong and training tolerance is good. Consider a small load increment or volume addition.");
      lines.push("Stay within the defined progression model — don't overcorrect in the positive direction either.");
      break;
    case "maintain":
    default:
      lines.push("MAINTAIN: Signals are moderate. Execute the plan as designed. No significant adjustments needed.");
      break;
  }

  lines.push("");
  lines.push("Use this context naturally — do not robotically recite every score. Reference it like an intelligent coach who has read the file and is making a considered recommendation.");

  return lines.join("\n");
}

function scoreLabel(score: number, type: string): string {
  const labels: Record<string, string[]> = {
    sleep: ["—", "Very poor", "Poor", "Fair", "Good", "Excellent"],
    energy: ["—", "Very low", "Low", "Moderate", "High", "Very high"],
    soreness: ["—", "None", "Mild", "Moderate", "Significant", "Severe"],
    stress: ["—", "Very low", "Low", "Moderate", "High", "Very high"],
    motivation: ["—", "Very low", "Low", "Moderate", "High", "Very high"],
    pain: ["—", "None", "Mild", "Moderate", "Significant", "Severe"],
  };
  const set = labels[type] ?? ["—", "1", "2", "3", "4", "5"];
  return `${set[score] ?? score} (${score}/5)`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildAdaptationContext(userId: number): Promise<AdaptationContext> {
  const [recentReadiness, recentFeedback] = await Promise.all([
    fetchRecentReadiness(userId, 7),
    fetchRecentFeedback(userId, 5),
  ]);

  const latestReadiness = recentReadiness[0] ?? null;
  const trends = computeTrends(recentReadiness, recentFeedback);
  const promptContext = buildAdaptationPrompt(
    latestReadiness,
    trends,
    recentFeedback,
    recentReadiness.length
  );

  return {
    hasReadiness: recentReadiness.length > 0,
    hasFeedback: recentFeedback.length > 0,
    latestReadiness,
    recentReadiness,
    recentFeedback,
    trends,
    promptContext,
  };
}

// ─── Wearable integration scaffolding ─────────────────────────────────────────
// Interface contracts ready for future wearable data integration.

export interface WearableData {
  source: "apple_health" | "garmin" | "whoop" | "oura" | "fitbit";
  date: string;
  hrv?: number;           // heart rate variability (ms)
  restingHR?: number;     // resting heart rate (bpm)
  sleepDuration?: number; // minutes
  sleepScore?: number;    // 1-100 normalized
  readinessScore?: number; // 1-100 normalized (WHOOP/Oura style)
  trainingLoad?: number;  // arbitrary units
  steps?: number;
}

/**
 * Phase 5 hook: convert wearable data into a readiness entry.
 * Not yet implemented — returns null.
 */
export async function ingestWearableData(
  _userId: number,
  _data: WearableData
): Promise<ReadinessEntry | null> {
  // TODO Phase 5: normalize wearable scores into readiness entry schema
  // and upsert into readiness_entries for the given date
  return null;
}
