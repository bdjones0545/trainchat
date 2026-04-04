/**
 * TrainChat Insights & Proactive Suggestions Service (Phase 5)
 *
 * Generates intelligent, coach-like proactive suggestions based on:
 * - recent readiness trends
 * - session feedback patterns
 * - long-term memory
 * - adherence signals
 *
 * Suggestions are non-spammy, high-value, and actionable.
 */

import { db, readinessEntriesTable, sessionFeedbackTable, savedProgramsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { type MemoryEntry } from "./memory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightType =
  | "deload_suggestion"
  | "progression_ready"
  | "pain_warning"
  | "consistency_positive"
  | "schedule_review"
  | "sleep_impact"
  | "recovery_strength"
  | "tolerance_building"
  | "program_evolution";

export interface TrainingInsight {
  type: InsightType;
  title: string;
  body: string;
  priority: number; // 1-5 (5 = most urgent/important)
  triggerSource: string;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86400000;
}

// ─── Insight generators ───────────────────────────────────────────────────────

function analyzeReadiness(
  entries: { sleepScore: number; energyScore: number; sorenessScore: number; stressScore: number; motivationScore: number; painScore: number; createdAt: Date }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];
  if (entries.length < 3) return insights;

  const recent = entries.slice(0, 5);
  const sleepAvg = avg(recent.map((e) => e.sleepScore));
  const energyAvg = avg(recent.map((e) => e.energyScore));
  const sorenessAvg = avg(recent.map((e) => e.sorenessScore));
  const stressAvg = avg(recent.map((e) => e.stressScore));
  const painAvg = avg(recent.map((e) => e.painScore));
  const motivationAvg = avg(recent.map((e) => e.motivationScore));

  // Deload suggestion — multiple poor readiness days
  const composite = (sleepAvg + energyAvg + motivationAvg + (6 - sorenessAvg) + (6 - stressAvg)) / 5;
  if (composite < 2.6 && recent.length >= 3) {
    insights.push({
      type: "deload_suggestion",
      title: "Consider a lighter week",
      body: `You've had several low-readiness check-ins recently. A lighter week — reduced volume, lower intensity — will likely accelerate recovery and set up better training quality next week.`,
      priority: 4,
      triggerSource: "readiness_trend",
    });
  }

  // Sleep impact warning
  if (sleepAvg < 2.4 && recent.length >= 3) {
    insights.push({
      type: "sleep_impact",
      title: "Sleep quality is affecting your recovery",
      body: `Your recent sleep scores are low. Poor sleep directly limits training adaptation. I'd suggest keeping sessions shorter and less intense until sleep improves.`,
      priority: 4,
      triggerSource: "sleep_trend",
    });
  }

  // Recovery strength — strong readiness
  if (composite >= 4.2 && recent.length >= 4) {
    insights.push({
      type: "recovery_strength",
      title: "You're recovering well",
      body: `Your readiness has been consistently strong. This is a good window to push training quality — your body is primed to adapt.`,
      priority: 2,
      triggerSource: "readiness_trend",
    });
  }

  // Pain warning — recurring pain scores
  if (painAvg >= 3.0 && recent.length >= 3) {
    insights.push({
      type: "pain_warning",
      title: "Recurring discomfort pattern",
      body: `You've reported elevated pain in several check-ins. Worth reviewing which movements may be contributing. I can adjust your program to reduce joint stress.`,
      priority: 5,
      triggerSource: "pain_trend",
    });
  }

  return insights;
}

function analyzeFeedback(
  entries: { difficultyScore: number; painResponseScore: number; energyResponseScore: number; createdAt: Date }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];
  if (entries.length < 2) return insights;

  const difficultyAvg = avg(entries.map((e) => e.difficultyScore));
  const painAvg = avg(entries.map((e) => e.painResponseScore));
  const energyAvg = avg(entries.map((e) => e.energyResponseScore));

  // Progression ready
  if (difficultyAvg <= 2.3 && energyAvg >= 4.0 && entries.length >= 3) {
    insights.push({
      type: "progression_ready",
      title: "Ready to progress",
      body: `You've been handling sessions well — feeling strong after training. This is a solid signal to add a small load increment or volume increase next week.`,
      priority: 3,
      triggerSource: "feedback_tolerance",
    });
  }

  // Tolerance building
  if (difficultyAvg >= 3.5 && difficultyAvg < 4.5 && energyAvg >= 3.0 && entries.length >= 3) {
    insights.push({
      type: "tolerance_building",
      title: "Building tolerance well",
      body: `Sessions are appropriately challenging and you're responding well. Current programming is in the right zone — stay the course.`,
      priority: 1,
      triggerSource: "feedback_difficulty",
    });
  }

  // Struggling
  if (difficultyAvg >= 4.5 || (painAvg >= 3.5 && entries.length >= 2)) {
    insights.push({
      type: "deload_suggestion",
      title: "Sessions may be too demanding",
      body: `Your recent feedback suggests sessions are exceeding your current capacity. Pulling back on intensity or volume will help your body keep up with the work.`,
      priority: 5,
      triggerSource: "feedback_difficulty",
    });
  }

  return insights;
}

function analyzeAdherence(
  feedback: { createdAt: Date }[],
  savedPrograms: { createdAt: Date }[]
): TrainingInsight[] {
  const insights: TrainingInsight[] = [];

  if (feedback.length >= 4) {
    const earliest = feedback[feedback.length - 1];
    const latest = feedback[0];
    const daySpan = Math.max(1, daysSince(earliest.createdAt));
    const sessionsPerWeek = (feedback.length / daySpan) * 7;

    if (sessionsPerWeek >= 3.5) {
      insights.push({
        type: "consistency_positive",
        title: "Strong training consistency",
        body: `You've been showing up consistently. That's the single biggest driver of long-term progress. Keep it up.`,
        priority: 2,
        triggerSource: "adherence_streak",
      });
    } else if (sessionsPerWeek < 1.8 && daySpan >= 14) {
      insights.push({
        type: "schedule_review",
        title: "Training frequency is lower than planned",
        body: `Your session log suggests you're training less frequently than your program calls for. A simpler format with fewer required sessions might improve adherence.`,
        priority: 3,
        triggerSource: "adherence_pattern",
      });
    }
  }

  // Program evolution suggestion — if saved programs exist and newest is old
  if (savedPrograms.length > 0) {
    const latestProgram = savedPrograms[0];
    const daysSinceProgram = daysSince(latestProgram.createdAt);
    if (daysSinceProgram >= 28) {
      insights.push({
        type: "program_evolution",
        title: "Time to evolve your program",
        body: `Your current program is about ${Math.round(daysSinceProgram / 7)} weeks old. Most training blocks benefit from a refresh — progressive overload, exercise rotation, or a new phase — around the 4-week mark.`,
        priority: 3,
        triggerSource: "program_age",
      });
    }
  }

  return insights;
}

function analyzeMemories(memories: MemoryEntry[]): TrainingInsight[] {
  const insights: TrainingInsight[] = [];

  const highConfidencePain = memories.filter(
    (m) => m.type === "pain_pattern" && m.confidence >= 4 && m.sentiment === "negative"
  );
  if (highConfidencePain.length >= 2) {
    insights.push({
      type: "pain_warning",
      title: "Multiple pain patterns on record",
      body: `You have a history of recurring discomfort in ${highConfidencePain.length} movement areas. I'm actively programming around these. Let me know if any new patterns emerge.`,
      priority: 3,
      triggerSource: "memory_pain_patterns",
    });
  }

  const adherenceNeg = memories.find(
    (m) => m.type === "adherence_pattern" && m.sentiment === "negative" && m.confidence >= 3
  );
  if (adherenceNeg) {
    insights.push({
      type: "schedule_review",
      title: "Adherence pattern detected",
      body: `Based on your training history, consistency has been a challenge. Shorter, more realistic sessions may help — sustainable beats ambitious-but-incomplete.`,
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
  return result.slice(0, 4); // Cap at 4 insights — avoid overwhelming the user
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate proactive insights for a user based on all available data.
 */
export async function generateInsights(
  userId: number,
  memories: MemoryEntry[] = []
): Promise<TrainingInsight[]> {
  const [readiness, feedback, programs] = await Promise.all([
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
      .select({ id: savedProgramsTable.id, createdAt: savedProgramsTable.createdAt })
      .from(savedProgramsTable)
      .where(eq(savedProgramsTable.userId, userId))
      .orderBy(desc(savedProgramsTable.createdAt))
      .limit(5),
  ]);

  const readinessInsights = analyzeReadiness(readiness);
  const feedbackInsights = analyzeFeedback(feedback);
  const adherenceInsights = analyzeAdherence(feedback, programs);
  const memoryInsights = analyzeMemories(memories);

  const all = [...readinessInsights, ...feedbackInsights, ...adherenceInsights, ...memoryInsights];
  return deduplicateInsights(all);
}

/**
 * Build a concise prompt line for AI system context.
 * Used to hint the AI about current proactive suggestions without bloating the prompt.
 */
export function buildInsightPromptHint(insights: TrainingInsight[]): string {
  if (insights.length === 0) return "";
  const top = insights.filter((i) => i.priority >= 3).slice(0, 2);
  if (top.length === 0) return "";
  const lines = top.map((i) => `- ${i.title}: ${i.body}`);
  return `\n## PROACTIVE AGENT SUGGESTIONS\n${lines.join("\n")}\nIf relevant to the conversation, reference these naturally — but only when it adds value.`;
}
