/**
 * Memory Dominance System
 *
 * Upgrades agent memory from passive → governing.
 *
 * Priority hierarchy (highest to lowest):
 *   1. HARD CONSTRAINTS   — injury, equipment limits (from long-term memories, confidence >= 4)
 *   2. ACTIVE SIGNALS     — pain, fatigue, adherence, difficulty (from recent session logs)
 *   3. BLOCK STRUCTURE    — the scheduled program
 *   4. ORIGINAL INTENT    — the user's stated goal
 *
 * Produces a `memoryDominanceContext` string that is injected into
 * the AI system prompt BEFORE the adaptive context, so these signals
 * can override conflicting block prescriptions.
 *
 * Examples:
 *   IF memory.pain includes "knee" → override squat/lunge intensity regardless of block phase
 *   IF fatigueTrend high → hold intensity progression regardless of week number
 */

import { db, userMemoriesTable, sessionLogsTable, userProfilesTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { logger } from "./logger";

// ─── Movement patterns affected by injury area (strength mode) ─────────────

const INJURY_PATTERN_MAP: Record<string, string[]> = {
  knee: ["squats", "lunges", "leg press", "jump landings", "step-ups", "box jumps"],
  shoulder: ["overhead pressing", "lateral raises", "upright rows", "pull-ups at heavy load"],
  "lower back": ["heavy deadlifts", "good mornings", "back extensions", "barbell rows at high load"],
  hip: ["deep hip flexion", "lateral cutting movements", "full-depth split squats"],
  wrist: ["barbell pressing", "front rack positions", "loaded wrist extension"],
  elbow: ["tricep extensions at extreme range", "heavy barbell curls"],
  ankle: ["jump landings", "calf raises at high load", "lateral change-of-direction drills"],
  neck: ["overhead pressing", "heavy shrugs", "direct neck loading"],
  "upper back": ["heavy shrug variations", "high-bar squat at max load"],
};

// ─── Movement patterns affected by injury area (speed/footwork mode) ────────

const SPEED_INJURY_PATTERN_MAP: Record<string, string[]> = {
  knee: ["deceleration sprints", "change-of-direction drills", "COD cuts at full speed", "depth drops", "single-leg landing drills"],
  hamstring: ["max-intent sprints", "flying sprint exposures", "resisted sprints", "Nordic hamstring curls at high load", "bounding and linear acceleration"],
  "lower back": ["resisted sled sprints with forward lean", "heavy bounding", "high-volume acceleration blocks"],
  hip: ["lateral COD drills", "crossover step patterns", "hip flexor-dominant acceleration postures", "split-stance reactive drills"],
  groin: ["lateral shuffle drills", "lateral bounding", "crossover patterns", "wide-stance COD drills"],
  ankle: ["stiffness hop series", "pogo hops at high volume", "ankle-loaded plyometrics", "uneven surface footwork drills"],
  achilles: ["stiffness hops", "ankle hops", "pogo series", "any high-frequency ground contact drills", "sprint acceleration at full intent"],
  calf: ["stiffness hops at volume", "max-velocity sprint exposures", "plyometric push-off drills"],
  foot: ["pogo hops", "ladder footwork at high speed", "barefoot sprint drills"],
  tendon: ["high-frequency plyometric contacts", "max-velocity sprint work", "resisted sprint starts", "depth drops"],
  "shin splint": ["high-speed ladder work", "repetitive sprint starts", "interval sprint conditioning"],
};

function getAffectedPatterns(subject: string): string[] {
  const s = subject.toLowerCase();
  for (const [area, patterns] of Object.entries(INJURY_PATTERN_MAP)) {
    if (s.includes(area)) return patterns;
  }
  return [];
}

function getAffectedPatternsForMode(subject: string, focusMode?: string | null): string[] {
  const s = subject.toLowerCase();
  if (focusMode === "speed") {
    for (const [area, patterns] of Object.entries(SPEED_INJURY_PATTERN_MAP)) {
      if (s.includes(area)) return patterns;
    }
    // Fallback to standard map for areas not in speed map
    for (const [area, patterns] of Object.entries(INJURY_PATTERN_MAP)) {
      if (s.includes(area)) return patterns;
    }
    return [];
  }
  return getAffectedPatterns(subject);
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HardConstraint {
  type: "injury" | "equipment";
  subject: string;
  detail: string;
  affectedPatterns: string[];
  confidence: number;
}

export interface ActiveSignal {
  type: "pain" | "fatigue" | "adherence" | "difficulty";
  severity: "high" | "moderate";
  detail: string;
  overrideStrength: number; // 1-5
}

export interface MemoryDominanceResult {
  hardConstraints: HardConstraint[];
  activeSignals: ActiveSignal[];
  overrideDirective: string | null;
  memoryDominanceContext: string;
}

// ─── Rolling window helpers ────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function resolveMemoryConstraints(userId: number, focusMode?: string | null): Promise<MemoryDominanceResult> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 21);

  const [memories, recentLogs] = await Promise.all([
    db
      .select()
      .from(userMemoriesTable)
      .where(eq(userMemoriesTable.userId, userId)),
    db
      .select({
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        painScore: sessionLogsTable.painScore,
        energyScore: sessionLogsTable.energyScore,
        painAreas: sessionLogsTable.painAreas,
      })
      .from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, windowStart)))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(10),
  ]);

  // ── TIER 1: Hard Constraints ─────────────────────────────────────────────

  const hardConstraints: HardConstraint[] = [];

  // Injury / pain memories (high confidence = established pattern)
  for (const m of memories) {
    if (m.type === "pain_pattern" && m.sentiment === "negative" && m.confidence >= 4) {
      hardConstraints.push({
        type: "injury",
        subject: m.subject,
        detail: m.detail,
        affectedPatterns: getAffectedPatternsForMode(m.subject, focusMode),
        confidence: m.confidence,
      });
    }
    // Equipment avoidance memories
    if (m.type === "exercise_preference" && m.sentiment === "negative" && m.confidence >= 4) {
      hardConstraints.push({
        type: "equipment",
        subject: m.subject,
        detail: m.detail,
        affectedPatterns: [],
        confidence: m.confidence,
      });
    }
  }

  // ── TIER 2: Active Signals ───────────────────────────────────────────────

  const activeSignals: ActiveSignal[] = [];
  const completed = recentLogs.filter((l) => l.sessionStatus !== "skipped");

  if (completed.length >= 3) {
    const avgDiff = avg(completed.map((l) => l.difficultyScore ?? 3));
    const avgEnergy = avg(completed.map((l) => l.energyScore ?? 3));
    const painFreq = completed.filter((l) => (l.painScore ?? 0) >= 3).length / completed.length;
    const adherenceRate = recentLogs.length > 0 ? completed.length / recentLogs.length : 1;
    const fatigueComposite = (avgDiff + (6 - avgEnergy)) / 2;

    // Collect unique pain areas from recent sessions
    const recentPainAreas = [
      ...new Set(
        completed
          .flatMap((l) => (l.painAreas ?? []) as string[])
          .filter(Boolean)
      ),
    ];

    if (painFreq >= 0.4) {
      const detail = recentPainAreas.length > 0
        ? `Pain reported in ${Math.round(painFreq * 100)}% of recent sessions — particularly in: ${recentPainAreas.join(", ")}. Regardless of block phase, avoid aggressive loading on these patterns.`
        : `Pain reported in ${Math.round(painFreq * 100)}% of recent sessions. Conservative loading required across high-stress movements.`;
      activeSignals.push({
        type: "pain",
        severity: painFreq >= 0.6 ? "high" : "moderate",
        detail,
        overrideStrength: painFreq >= 0.6 ? 5 : 4,
      });
    }

    if (fatigueComposite >= 3.8) {
      activeSignals.push({
        type: "fatigue",
        severity: fatigueComposite >= 4.3 ? "high" : "moderate",
        detail: `Fatigue accumulation detected — avg difficulty ${avgDiff.toFixed(1)}/5, avg energy after sessions ${avgEnergy.toFixed(1)}/5. Hold or reduce intensity regardless of scheduled progression.`,
        overrideStrength: fatigueComposite >= 4.3 ? 4 : 3,
      });
    }

    if (adherenceRate < 0.65) {
      activeSignals.push({
        type: "adherence",
        severity: "moderate",
        detail: `Adherence ${Math.round(adherenceRate * 100)}% over last 3 weeks — program volume may be exceeding what the user can consistently execute. Prioritize simplicity and sustainability.`,
        overrideStrength: 3,
      });
    }

    if (avgDiff >= 4.4) {
      activeSignals.push({
        type: "difficulty",
        severity: "high",
        detail: `Sessions consistently rated very hard (avg ${avgDiff.toFixed(1)}/5). Load progression should be paused — maintain current stimulus until difficulty normalizes below 4.`,
        overrideStrength: 4,
      });
    }
  }

  // ── Build AI override directive ──────────────────────────────────────────

  const lines: string[] = [];

  if (hardConstraints.length > 0) {
    lines.push("## MEMORY OVERRIDE — HARD CONSTRAINTS");
    lines.push("These override any conflicting block prescription. Apply unconditionally:");
    for (const c of hardConstraints) {
      if (c.affectedPatterns.length > 0) {
        lines.push(`• ${c.subject.toUpperCase()}: ${c.detail}`);
        lines.push(`  → Affected movements to manage carefully: ${c.affectedPatterns.join(", ")}`);
      } else {
        lines.push(`• ${c.detail}`);
      }
    }
    lines.push("");
  }

  if (activeSignals.length > 0) {
    lines.push("## MEMORY OVERRIDE — ACTIVE SIGNALS");
    lines.push("These apply regardless of the current block phase:");
    for (const s of activeSignals) {
      lines.push(`• ${s.type.toUpperCase()} [${s.severity.toUpperCase()}]: ${s.detail}`);
    }
    lines.push("");
    lines.push(
      "If the scheduled block says 'increase load' but the signals above indicate fatigue or pain, HOLD or REDUCE instead. Memory governs block prescription when they conflict."
    );
    lines.push("");
  }

  const overrideDirective = lines.length > 0 ? lines.join("\n") : null;

  return {
    hardConstraints,
    activeSignals,
    overrideDirective,
    memoryDominanceContext: overrideDirective ?? "",
  };
}

/**
 * Structured memory write from session log data.
 * Called after every session log to keep rolling metrics current.
 */
export async function updateStructuredMemoryFromLog(
  userId: number,
  log: {
    sessionStatus: string;
    difficultyScore?: number | null;
    painScore?: number | null;
    energyScore?: number | null;
    enjoymentScore?: number | null;
    painAreas?: string[] | null;
  }
): Promise<void> {
  try {
    // Fetch last 7 session logs for rolling computation
    const recentLogs = await db
      .select({
        sessionStatus: sessionLogsTable.sessionStatus,
        difficultyScore: sessionLogsTable.difficultyScore,
        painScore: sessionLogsTable.painScore,
        energyScore: sessionLogsTable.energyScore,
        enjoymentScore: sessionLogsTable.enjoymentScore,
        completedAt: sessionLogsTable.completedAt,
      })
      .from(sessionLogsTable)
      .where(eq(sessionLogsTable.userId, userId))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(7);

    const completed = recentLogs.filter((l) => l.sessionStatus !== "skipped");
    if (completed.length < 2) return;

    const adherenceRate = recentLogs.length > 0 ? completed.length / recentLogs.length : 1;
    const avgDifficulty = avg(completed.map((l) => l.difficultyScore ?? 3));
    const avgEnergy = avg(completed.map((l) => l.energyScore ?? 3));
    const avgEnjoyment = avg(completed.map((l) => l.enjoymentScore ?? 3));
    const fatigueScore = (avgDifficulty + (6 - avgEnergy)) / 2;

    const summary = {
      adherenceRate: Math.round(adherenceRate * 100),
      avgDifficulty: Math.round(avgDifficulty * 10) / 10,
      avgEnergy: Math.round(avgEnergy * 10) / 10,
      avgEnjoyment: Math.round(avgEnjoyment * 10) / 10,
      fatigueScore: Math.round(fatigueScore * 10) / 10,
      sessionCount: recentLogs.length,
      completedCount: completed.length,
      updatedAt: new Date().toISOString(),
    };

    // Upsert as a structured memory entry (detail stores JSON summary)
    const existing = await db
      .select()
      .from(userMemoriesTable)
      .where(
        and(
          eq(userMemoriesTable.userId, userId),
          eq(userMemoriesTable.type, "volume_response"),
          eq(userMemoriesTable.subject, "rolling_session_metrics")
        )
      )
      .limit(1);

    const detail = `Rolling metrics (last ${recentLogs.length} sessions): adherence ${summary.adherenceRate}%, avg difficulty ${summary.avgDifficulty}/5, avg energy ${summary.avgEnergy}/5, fatigue index ${summary.fatigueScore}/5.`;

    if (existing.length > 0) {
      await db
        .update(userMemoriesTable)
        .set({
          confidence: Math.min(5, Math.floor(completed.length / 2) + 2) as any,
          detail,
          updatedAt: new Date(),
        })
        .where(eq(userMemoriesTable.id, existing[0].id));
    } else {
      await db.insert(userMemoriesTable).values({
        userId,
        type: "volume_response",
        subject: "rolling_session_metrics",
        sentiment: fatigueScore >= 4 ? "negative" : fatigueScore <= 2.5 ? "positive" : "neutral",
        confidence: 3 as any,
        source: "feedback",
        detail,
      });
    }

    // Write a fatigue pattern memory if consistently high
    if (fatigueScore >= 4.2 && completed.length >= 3) {
      const fatigueExisting = await db
        .select()
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.userId, userId),
            eq(userMemoriesTable.type, "volume_response"),
            eq(userMemoriesTable.subject, "fatigue_accumulation_pattern")
          )
        )
        .limit(1);

      const fatigueDetail = `User has shown consistent fatigue accumulation (index ${fatigueScore.toFixed(1)}/5 across ${completed.length} sessions). Reduce volume or extend deload cycles when this pattern emerges.`;

      if (fatigueExisting.length > 0) {
        await db
          .update(userMemoriesTable)
          .set({ detail: fatigueDetail, confidence: Math.min(5, (fatigueExisting[0].confidence ?? 3) + 1) as any, updatedAt: new Date() })
          .where(eq(userMemoriesTable.id, fatigueExisting[0].id));
      } else {
        await db.insert(userMemoriesTable).values({
          userId,
          type: "volume_response",
          subject: "fatigue_accumulation_pattern",
          sentiment: "negative",
          confidence: 3 as any,
          source: "feedback",
          detail: fatigueDetail,
        });
      }
    }

    // Write adherence memory if low
    if (adherenceRate < 0.65 && recentLogs.length >= 5) {
      const adhExisting = await db
        .select()
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.userId, userId),
            eq(userMemoriesTable.type, "adherence_pattern"),
            eq(userMemoriesTable.subject, "session_completion_rate")
          )
        )
        .limit(1);

      const adhDetail = `User completion rate ${summary.adherenceRate}% (${summary.completedCount}/${summary.sessionCount} sessions). Program volume or schedule complexity may be exceeding what's executable consistently.`;

      if (adhExisting.length > 0) {
        await db
          .update(userMemoriesTable)
          .set({ detail: adhDetail, updatedAt: new Date() })
          .where(eq(userMemoriesTable.id, adhExisting[0].id));
      } else {
        await db.insert(userMemoriesTable).values({
          userId,
          type: "adherence_pattern",
          subject: "session_completion_rate",
          sentiment: "negative",
          confidence: 3 as any,
          source: "feedback",
          detail: adhDetail,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "[MemoryDominance] updateStructuredMemoryFromLog failed — non-fatal");
  }
}
