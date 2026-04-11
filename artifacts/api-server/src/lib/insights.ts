/**
 * TrainChat Proactive Coaching Agent — Insights & Signal Detection
 *
 * Generates intelligent, coach-like proactive recommendations by analyzing:
 * - daily readiness trends
 * - session feedback patterns
 * - adherence vs planned frequency
 * - long-term memory
 *
 * Recommendations are non-spammy, high-value, and fully explainable.
 * Every insight includes a plain-language data rationale ("Show Me Why").
 */

import { db, readinessEntriesTable, sessionFeedbackTable, savedProgramsTable, sessionLogsTable } from "@workspace/db";
import { trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { type MemoryEntry } from "./memory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightType =
  | "deload_suggestion"
  | "progression_ready"
  | "pain_warning"
  | "consistency_positive"
  | "schedule_review"
  | "missed_session_pattern"
  | "sleep_impact"
  | "recovery_strength"
  | "tolerance_building"
  | "program_evolution"
  | "pain_trigger_pattern"
  | "low_engagement_trend";

export interface TrainingInsight {
  type: InsightType;
  title: string;
  body: string;
  /** Plain-language explanation of the data behind this recommendation. */
  whyExplanation: string;
  priority: number; // 1-5 (5 = most urgent/important)
  triggerSource: string;
}

/** Full trend summary computed across recent data. Returned by runProactiveCoachingReview. */
export interface UserTrainingTrendSummary {
  userId: number;
  windowDays: number;

  // Readiness averages (1-5 scale)
  avgReadiness: number;
  avgSleepQuality: number;
  avgStress: number;
  avgSoreness: number;
  avgMotivation: number;
  avgPain: number;

  // Session metrics
  completedSessionCount: number;
  plannedSessionsPerWeek: number;
  actualSessionsPerWeek: number;
  consistencyScore: number; // 0-1 ratio of actual vs planned

  // Signals
  insights: TrainingInsight[];
  generatedAt: Date;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86400000;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// ─── Readiness signal detection ───────────────────────────────────────────────

function analyzeReadiness(
  entries: {
    sleepScore: number;
    energyScore: number;
    sorenessScore: number;
    stressScore: number;
    motivationScore: number;
    painScore: number;
    createdAt: Date;
  }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];
  if (entries.length < 3) return insights;

  const recent = entries.slice(0, 5);
  const n = recent.length;
  const sleepAvg = avg(recent.map((e) => e.sleepScore));
  const energyAvg = avg(recent.map((e) => e.energyScore));
  const sorenessAvg = avg(recent.map((e) => e.sorenessScore));
  const stressAvg = avg(recent.map((e) => e.stressScore));
  const painAvg = avg(recent.map((e) => e.painScore));
  const motivationAvg = avg(recent.map((e) => e.motivationScore));
  const composite = (sleepAvg + energyAvg + motivationAvg + (6 - sorenessAvg) + (6 - stressAvg)) / 5;

  // Deload — multiple poor-readiness days
  if (composite < 2.6 && n >= 3) {
    insights.push({
      type: "deload_suggestion",
      title: "Consider a lighter week",
      body: `You've had several low-readiness check-ins recently. A lighter week — reduced volume, lower intensity — will likely accelerate recovery and set up better training quality next week.`,
      whyExplanation: `Your last ${n} check-ins averaged ${fmt(composite)}/5 overall readiness (sleep ${fmt(sleepAvg)}, energy ${fmt(energyAvg)}, soreness ${fmt(sorenessAvg)}, stress ${fmt(stressAvg)}). Sustained low readiness is a clear signal to reduce training load.`,
      priority: 4,
      triggerSource: "readiness_trend",
    });
  }

  // Sleep impact
  if (sleepAvg < 2.4 && n >= 3) {
    insights.push({
      type: "sleep_impact",
      title: "Sleep quality is affecting your recovery",
      body: `Your recent sleep scores are low. Poor sleep directly limits training adaptation. I'd suggest keeping sessions shorter and less intense until sleep improves.`,
      whyExplanation: `Your last ${n} check-ins averaged ${fmt(sleepAvg)}/5 for sleep quality. Sleep quality below 2.5/5 significantly reduces hormonal recovery and training adaptation.`,
      priority: 4,
      triggerSource: "sleep_trend",
    });
  }

  // Recovery strength — strong readiness window
  if (composite >= 4.2 && n >= 4) {
    insights.push({
      type: "recovery_strength",
      title: "You're recovering well — good window to push",
      body: `Your readiness has been consistently strong. This is a good window to push training quality — your body is primed to adapt.`,
      whyExplanation: `Your last ${n} check-ins averaged ${fmt(composite)}/5 overall readiness (sleep ${fmt(sleepAvg)}, energy ${fmt(energyAvg)}, motivation ${fmt(motivationAvg)}). Sustained high readiness is the best time to increase training stimulus.`,
      priority: 2,
      triggerSource: "readiness_trend",
    });
  }

  // Pain warning
  if (painAvg >= 3.0 && n >= 3) {
    insights.push({
      type: "pain_warning",
      title: "Recurring discomfort pattern",
      body: `You've reported elevated pain in several check-ins. Worth reviewing which movements may be contributing. I can adjust your program to reduce joint stress.`,
      whyExplanation: `Your last ${n} check-ins averaged ${fmt(painAvg)}/5 for pain level. Pain scores above 3/5 consistently reported across multiple days suggest a structural issue worth addressing in programming.`,
      priority: 5,
      triggerSource: "pain_trend",
    });
  }

  return insights;
}

// ─── Session feedback signal detection ────────────────────────────────────────

function analyzeFeedback(
  entries: {
    difficultyScore: number;
    painResponseScore: number;
    energyResponseScore: number;
    createdAt: Date;
  }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];
  if (entries.length < 2) return insights;

  const n = entries.length;
  const diffAvg = avg(entries.map((e) => e.difficultyScore));
  const painAvg = avg(entries.map((e) => e.painResponseScore));
  const energyAvg = avg(entries.map((e) => e.energyResponseScore));

  // Progression ready
  if (diffAvg <= 2.3 && energyAvg >= 4.0 && n >= 3) {
    insights.push({
      type: "progression_ready",
      title: "Ready to progress",
      body: `You've been handling sessions well — feeling strong after training. This is a solid signal to add a small load increment or volume increase next week.`,
      whyExplanation: `Your last ${n} sessions averaged ${fmt(diffAvg)}/5 difficulty and ${fmt(energyAvg)}/5 post-session energy. Sessions feeling easy with high energy output means your body has adapted and is ready for more.`,
      priority: 3,
      triggerSource: "feedback_tolerance",
    });
  }

  // Tolerance building
  if (diffAvg >= 3.5 && diffAvg < 4.5 && energyAvg >= 3.0 && n >= 3) {
    insights.push({
      type: "tolerance_building",
      title: "Building tolerance well",
      body: `Sessions are appropriately challenging and you're responding well. Current programming is in the right zone — stay the course.`,
      whyExplanation: `Your last ${n} sessions averaged ${fmt(diffAvg)}/5 difficulty with ${fmt(energyAvg)}/5 post-session energy. A difficulty of 3.5-4.5 with maintained energy is the ideal training zone for adaptation.`,
      priority: 1,
      triggerSource: "feedback_difficulty",
    });
  }

  // Struggling
  if (diffAvg >= 4.5 || (painAvg >= 3.5 && n >= 2)) {
    const reason =
      diffAvg >= 4.5
        ? `sessions are averaging ${fmt(diffAvg)}/5 difficulty`
        : `post-session pain is averaging ${fmt(painAvg)}/5`;
    insights.push({
      type: "deload_suggestion",
      title: "Sessions may be too demanding",
      body: `Your recent feedback suggests sessions are exceeding your current capacity. Pulling back on intensity or volume will help your body keep up with the work.`,
      whyExplanation: `Your last ${n} sessions show that ${reason}. When training consistently exceeds capacity, recovery suffers and injury risk rises.`,
      priority: 5,
      triggerSource: "feedback_difficulty",
    });
  }

  return insights;
}

// ─── Session log signal detection — real behavior patterns ────────────────────

/**
 * Analyze raw session_logs entries to detect real training behavior patterns.
 * Looks for: recurring pain areas, low engagement trends.
 */
function analyzeSessionLogs(
  logs: {
    sessionStatus: string | null;
    difficultyScore: number | null;
    painScore: number | null;
    energyScore: number | null;
    enjoymentScore: number | null;
    painAreas: string[] | null;
    actualDuration: number | null;
    completedAt: Date;
  }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];
  if (logs.length < 2) return insights;

  const n = logs.length;

  // ── Pain area pattern: same body area flagged in ≥3 sessions ──────────────
  const areaCount: Record<string, number> = {};
  let sessionsWithPain = 0;
  for (const log of logs) {
    if ((log.painScore ?? 0) >= 3 && log.painAreas && log.painAreas.length > 0) {
      sessionsWithPain++;
      for (const area of log.painAreas) {
        areaCount[area] = (areaCount[area] ?? 0) + 1;
      }
    }
  }
  const recurringAreas = Object.entries(areaCount)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([area]) => area);

  if (recurringAreas.length > 0 && sessionsWithPain >= 2) {
    const areaLabels: Record<string, string> = {
      knee: "knee", lower_back: "lower back", shoulder: "shoulder",
      hip: "hip", elbow: "elbow", wrist: "wrist",
      ankle: "ankle", neck: "neck", upper_back: "upper back",
    };
    const topArea = areaLabels[recurringAreas[0]] ?? recurringAreas[0];
    insights.push({
      type: "pain_trigger_pattern",
      title: `${topArea.charAt(0).toUpperCase() + topArea.slice(1)} discomfort recurring across sessions`,
      body: `You've reported ${topArea} discomfort in ${areaCount[recurringAreas[0]]} of your recent sessions. This is a pattern worth addressing — I can adjust movement selection to reduce load on that area.`,
      whyExplanation: `${sessionsWithPain} of your last ${n} sessions included pain reports. ${topArea.charAt(0).toUpperCase() + topArea.slice(1)} showed up in ${areaCount[recurringAreas[0]]} of those. Recurring pain in the same area across multiple sessions is a structural signal, not just soreness.`,
      priority: 5,
      triggerSource: "session_log_pain_pattern",
    });
  }

  // ── Low engagement trend: avg enjoyment ≤ 2 across recent sessions ─────────
  const withEnjoyment = logs.filter((l) => l.enjoymentScore != null);
  if (withEnjoyment.length >= 3) {
    const enjoymentAvg = avg(withEnjoyment.map((l) => l.enjoymentScore!));
    if (enjoymentAvg <= 2.2) {
      insights.push({
        type: "low_engagement_trend",
        title: "Enjoyment has been low recently",
        body: `You've been rating sessions poorly for enjoyment lately. It's easier to stay consistent when training feels good — exercise rotation or a different session format might help.`,
        whyExplanation: `Your last ${withEnjoyment.length} sessions with enjoyment ratings averaged ${fmt(enjoymentAvg)}/5. Sustained low enjoyment often predicts declining adherence over the following weeks.`,
        priority: 3,
        triggerSource: "session_log_enjoyment",
      });
    }
  }

  return insights;
}

// ─── Adherence / consistency signal detection ─────────────────────────────────

function analyzeAdherence(
  feedback: { createdAt: Date }[],
  savedPrograms: { createdAt: Date }[],
  plannedSessionsPerWeek: number | null
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];

  if (feedback.length >= 4) {
    const earliest = feedback[feedback.length - 1];
    const daySpan = Math.max(1, daysSince(earliest.createdAt));
    const actualPerWeek = (feedback.length / daySpan) * 7;

    if (actualPerWeek >= 3.5) {
      insights.push({
        type: "consistency_positive",
        title: "Strong training consistency",
        body: `You've been showing up consistently. That's the single biggest driver of long-term progress. Keep it up.`,
        whyExplanation: `You've logged ${feedback.length} sessions over the last ${Math.round(daySpan)} days — that's ${fmt(actualPerWeek)} sessions/week. Consistent training frequency is the highest-leverage variable for long-term adaptation.`,
        priority: 2,
        triggerSource: "adherence_streak",
      });
    } else if (actualPerWeek < 1.8 && daySpan >= 14) {
      insights.push({
        type: "schedule_review",
        title: "Training frequency is lower than planned",
        body: `Your session log suggests you're training less frequently than your program calls for. A simpler format with fewer required sessions might improve adherence.`,
        whyExplanation: `Over the last ${Math.round(daySpan)} days you've averaged ${fmt(actualPerWeek)} sessions/week${plannedSessionsPerWeek ? ` — your program targets ${plannedSessionsPerWeek}/week` : ""}. The gap between planned and actual training suggests the current format may not fit your schedule.`,
        priority: 3,
        triggerSource: "adherence_pattern",
      });
    }

    // Missed session pattern — planned vs actual gap
    if (
      plannedSessionsPerWeek !== null &&
      actualPerWeek < plannedSessionsPerWeek * 0.6 &&
      daySpan >= 10 &&
      feedback.length >= 2
    ) {
      insights.push({
        type: "missed_session_pattern",
        title: "Missing sessions regularly",
        body: `You're completing fewer sessions than your program is designed for. Restructuring your weekly format around your real availability will produce better results than an ambitious-but-incomplete plan.`,
        whyExplanation: `Your program targets ${plannedSessionsPerWeek} sessions/week. Over the last ${Math.round(daySpan)} days you've averaged ${fmt(actualPerWeek)}/week — ${Math.round((1 - actualPerWeek / plannedSessionsPerWeek) * 100)}% fewer than planned. A sustainable reduced-frequency plan will outperform an ambitious one you can't maintain.`,
        priority: 4,
        triggerSource: "adherence_gap",
      });
    }
  }

  // Program evolution
  if (savedPrograms.length > 0) {
    const daysSinceProgram = daysSince(savedPrograms[0].createdAt);
    if (daysSinceProgram >= 28) {
      insights.push({
        type: "program_evolution",
        title: "Time to evolve your program",
        body: `Your current program is about ${Math.round(daysSinceProgram / 7)} weeks old. Most training blocks benefit from a refresh around the 4-week mark.`,
        whyExplanation: `Your current program was created ${Math.round(daysSinceProgram)} days ago (${fmt(daysSinceProgram / 7, 0)} weeks). After 4 weeks, the body adapts to the same stimuli and progressive overload requires either exercise rotation, rep/set scheme changes, or a new phase emphasis.`,
        priority: 3,
        triggerSource: "program_age",
      });
    }
  }

  return insights;
}

// ─── Long-term memory signal detection ────────────────────────────────────────

function analyzeMemories(memories: MemoryEntry[]): TrainingInsight[] {
  const insights: TrainingInsight[] = [];

  const highConfidencePain = memories.filter(
    (m) => m.type === "pain_pattern" && m.confidence >= 4 && m.sentiment === "negative"
  );
  if (highConfidencePain.length >= 2) {
    insights.push({
      type: "pain_warning",
      title: "Multiple pain patterns on record",
      body: `You have a history of recurring discomfort in ${highConfidencePain.length} movement areas. I'm actively programming around these — let me know if any new patterns emerge.`,
      whyExplanation: `Your training history shows ${highConfidencePain.length} high-confidence recurring discomfort patterns. These have been extracted from your check-ins and session feedback over time.`,
      priority: 3,
      triggerSource: "memory_pain_patterns",
    });
  }

  const adherenceNeg = memories.find(
    (m) => m.type === "adherence_pattern" && m.sentiment === "negative" && m.confidence >= 3
  );
  if (adherenceNeg) {
    insights.push({
      type: "missed_session_pattern",
      title: "Adherence pattern detected",
      body: `Based on your training history, consistency has been a challenge. Shorter, more realistic sessions may help — sustainable beats ambitious-but-incomplete.`,
      whyExplanation: `Your long-term training history shows a recurring pattern of inconsistent attendance. A reduced-complexity plan with fewer required sessions per week often leads to better total training volume over time.`,
      priority: 3,
      triggerSource: "memory_adherence",
    });
  }

  return insights;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateInsights(insights: TrainingInsight[]): TrainingInsight[] {
  const seen = new Set<InsightType>();
  const result: TrainingInsight[] = [];
  const sorted = [...insights].sort((a, b) => b.priority - a.priority);
  for (const insight of sorted) {
    if (!seen.has(insight.type)) {
      seen.add(insight.type);
      result.push(insight);
    }
  }
  return result.slice(0, 5);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate proactive coaching insights for a user based on all available data.
 */
export async function generateInsights(
  userId: number,
  memories: MemoryEntry[] = []
): Promise<TrainingInsight[]> {
  const [readiness, feedback, sessionLogs, programs, activeSystem] = await Promise.all([
    db
      .select()
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(10),
    db
      .select()
      .from(sessionFeedbackTable)
      .where(eq(sessionFeedbackTable.userId, userId))
      .orderBy(desc(sessionFeedbackTable.createdAt))
      .limit(10),
    db
      .select({
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        painScore: sessionLogsTable.painScore,
        energyScore: sessionLogsTable.energyScore,
        enjoymentScore: sessionLogsTable.enjoymentScore,
        painAreas: sessionLogsTable.painAreas,
        actualDuration: sessionLogsTable.actualDuration,
        completedAt: sessionLogsTable.completedAt,
      })
      .from(sessionLogsTable)
      .where(eq(sessionLogsTable.userId, userId))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(10),
    db
      .select({ id: savedProgramsTable.id, createdAt: savedProgramsTable.createdAt })
      .from(savedProgramsTable)
      .where(eq(savedProgramsTable.userId, userId))
      .orderBy(desc(savedProgramsTable.createdAt))
      .limit(5),
    db
      .select({ weeklyFrequency: trainingSystems.weeklyFrequency })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const plannedPerWeek = activeSystem?.weeklyFrequency ?? null;

  const all = [
    ...analyzeReadiness(readiness),
    ...analyzeFeedback(feedback),
    ...analyzeSessionLogs(sessionLogs),
    ...analyzeAdherence(feedback, programs, plannedPerWeek),
    ...analyzeMemories(memories),
  ];

  return deduplicateInsights(all);
}

/**
 * Run a full proactive coaching review and return both insights and a trend summary.
 * Call this after check-in submission, workout completion, or app open.
 */
export async function runProactiveCoachingReview(userId: number, memories: MemoryEntry[] = []): Promise<UserTrainingTrendSummary> {
  const [readiness, feedback, activeSystem] = await Promise.all([
    db
      .select()
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(10),
    db
      .select()
      .from(sessionFeedbackTable)
      .where(eq(sessionFeedbackTable.userId, userId))
      .orderBy(desc(sessionFeedbackTable.createdAt))
      .limit(10),
    db
      .select({ weeklyFrequency: trainingSystems.weeklyFrequency })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const recentReadiness = readiness.slice(0, 7);
  const windowDays =
    recentReadiness.length >= 2
      ? Math.min(30, daysSince(recentReadiness[recentReadiness.length - 1].createdAt))
      : 7;

  const avgSleepQuality = avg(recentReadiness.map((e) => e.sleepScore));
  const avgStress = avg(recentReadiness.map((e) => e.stressScore));
  const avgSoreness = avg(recentReadiness.map((e) => e.sorenessScore));
  const avgMotivation = avg(recentReadiness.map((e) => e.motivationScore));
  const avgPain = avg(recentReadiness.map((e) => e.painScore));
  const avgReadiness =
    (avgSleepQuality + avg(recentReadiness.map((e) => e.energyScore)) + avgMotivation + (6 - avgSoreness) + (6 - avgStress)) / 5;

  const plannedPerWeek = activeSystem?.weeklyFrequency ?? 3;
  const feedbackDaySpan =
    feedback.length >= 2
      ? Math.max(1, daysSince(feedback[feedback.length - 1].createdAt))
      : 7;
  const actualPerWeek = feedback.length >= 1 ? (feedback.length / feedbackDaySpan) * 7 : 0;
  const consistencyScore = Math.min(1, actualPerWeek / Math.max(1, plannedPerWeek));

  const insights = await generateInsights(userId, memories);

  return {
    userId,
    windowDays,
    avgReadiness,
    avgSleepQuality,
    avgStress,
    avgSoreness,
    avgMotivation,
    avgPain,
    completedSessionCount: feedback.length,
    plannedSessionsPerWeek: plannedPerWeek,
    actualSessionsPerWeek: actualPerWeek,
    consistencyScore,
    insights,
    generatedAt: new Date(),
  };
}

/**
 * Build a concise prompt hint for the AI system context.
 */
export function buildInsightPromptHint(insights: TrainingInsight[]): string {
  if (insights.length === 0) return "";
  const top = insights.filter((i) => i.priority >= 3).slice(0, 2);
  if (top.length === 0) return "";
  const lines = top.map((i) => `- ${i.title}: ${i.body}`);
  return `\n## PROACTIVE AGENT SUGGESTIONS\n${lines.join("\n")}\nIf relevant to the conversation, reference these naturally — but only when it adds value.`;
}
