import { Router, type IRouter } from "express";
import { db, readinessEntriesTable, conversationsTable, messagesTable, trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { evaluateCheckIn, applyCheckInAdjustment, determineAdaptationMode, type CheckInScores, type AdaptationMode, computeReadinessScore } from "../lib/check-in-adaptation";
import { upsertMemory } from "../lib/memory";

// ─── Pipeline helpers: chat ack + agent memory ────────────────────────────────

async function postReadinessAckToChat(
  userId: number,
  scores: { energy: number; soreness: number; stress: number; sleep: number; motivation: number; pain: number },
  mode: string | null
): Promise<void> {
  try {
    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);
    if (!recentConvo) return;

    const energyLabel =
      scores.energy >= 4 ? "high energy"
      : scores.energy <= 2 ? "low energy"
      : "moderate energy";

    const sorenessLabel =
      scores.soreness >= 4 ? "high soreness"
      : scores.soreness <= 2 ? "minimal soreness"
      : "moderate soreness";

    let content = `Check-in saved — ${energyLabel}, ${sorenessLabel} today.`;
    if (mode === "TRAIN_AS_PLANNED") {
      content += " Signals look solid — train as planned today.";
    } else if (mode === "LIGHT_MODIFICATION") {
      content += scores.soreness >= 3
        ? " Soreness is elevated — I can make today more recovery-friendly if you'd like."
        : " Recovery is a bit lower — I can reduce accessory volume today if you'd like.";
    } else if (mode === "PAIN_MODIFICATION") {
      content += " Pain flagged — I can adjust today's session to keep things safe and productive.";
    } else if (mode === "RECOVERY_DELOAD") {
      content += " Recovery is lower today. I can reduce today's load if you'd like — the adaptation happens during rest.";
    } else if (mode === "GREEN_LIGHT_PROGRESSION") {
      content += " Everything is dialled in — great day to push for progression. I can update today's session notes.";
    }

    const structuredData = JSON.stringify({
      _type: "check_in",
      energyScore: scores.energy,
      sorenessScore: scores.soreness,
      stressScore: scores.stress,
      sleepScore: scores.sleep,
      motivationScore: scores.motivation,
      painScore: scores.pain,
      adaptationMode: mode,
    });

    await db.insert(messagesTable).values({
      conversationId: recentConvo.id,
      role: "assistant",
      content,
      structuredData,
    });
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, recentConvo.id));
  } catch {
    // Non-fatal
  }
}

// ─── Rolling readiness history + trend computation ────────────────────────────
// Stores last 7 check-in composites, trend direction, and volatility in agentMemory.
// Also detects recovery patterns and writes to memory service after 4+ consistent signals.

async function updateReadinessAgentMemory(
  userId: number,
  scores: CheckInScores
): Promise<void> {
  try {
    const [system] = await db
      .select({ id: trainingSystems.id, metadata: trainingSystems.metadata })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .limit(1);
    if (!system) return;

    // Fetch last 6 prior entries to build a rolling 7-entry window
    const priorEntries = await db
      .select({
        sleepScore: readinessEntriesTable.sleepScore,
        energyScore: readinessEntriesTable.energyScore,
        motivationScore: readinessEntriesTable.motivationScore,
        sorenessScore: readinessEntriesTable.sorenessScore,
        stressScore: readinessEntriesTable.stressScore,
        painScore: readinessEntriesTable.painScore,
        createdAt: readinessEntriesTable.createdAt,
      })
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(6);

    // Build rolling window: current entry + last 6 prior = 7 max
    const windowScores: CheckInScores[] = [
      scores,
      ...priorEntries.map((e) => ({
        sleepScore: e.sleepScore,
        energyScore: e.energyScore,
        sorenessScore: e.sorenessScore,
        stressScore: e.stressScore,
        motivationScore: e.motivationScore,
        painScore: e.painScore,
      })),
    ].slice(0, 7);

    const composites = windowScores.map((s) => computeReadinessScore(s).composite);

    // ── Trend direction ───────────────────────────────────────────────────────
    // Compare recent avg (last 3) vs older avg (entries 4-7)
    let trendDirection: "improving" | "declining" | "stable-high" | "stable-low" | "unstable" | "not_enough_data" = "not_enough_data";

    if (composites.length >= 4) {
      const recentAvg = composites.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = composites.slice(3).reduce((a, b) => a + b, 0) / composites.slice(3).length;

      // Volatility = max - min over the window
      const windowMax = Math.max(...composites);
      const windowMin = Math.min(...composites);
      const volatility = windowMax - windowMin;

      if (volatility >= 8) {
        trendDirection = "unstable";
      } else if (recentAvg > olderAvg + 1.5) {
        trendDirection = "improving";
      } else if (recentAvg < olderAvg - 1.5) {
        trendDirection = "declining";
      } else {
        // Stable — distinguish high vs low
        const overallAvg = composites.reduce((a, b) => a + b, 0) / composites.length;
        trendDirection = overallAvg >= 20 ? "stable-high" : "stable-low";
      }
    } else if (composites.length >= 2) {
      const delta = composites[0] - composites[composites.length - 1];
      if (delta > 2) trendDirection = "improving";
      else if (delta < -2) trendDirection = "declining";
      else trendDirection = composites[0] >= 20 ? "stable-high" : "stable-low";
    }

    // ── Current entry metrics ─────────────────────────────────────────────────
    const current = computeReadinessScore(scores);
    const fatigue =
      scores.sorenessScore >= 4 ? "high"
      : scores.sorenessScore <= 2 ? "low"
      : "moderate";

    const meta = (system.metadata ?? {}) as Record<string, unknown>;
    const existingMemory = (meta.agentMemory ?? {}) as Record<string, unknown>;

    const updatedMemory = {
      ...existingMemory,
      fatigue,
      readiness: current.readinessLevel,
      readinessLevel: current.readinessLevel,
      fatigueRisk: current.fatigueRisk,
      // Rolling 7-day composite scores (newest first)
      rollingReadiness: composites,
      trendDirection,
      // Latest check-in details
      lastCheckIn: {
        sleep: scores.sleepScore,
        energy: scores.energyScore,
        motivation: scores.motivationScore,
        soreness: scores.sorenessScore,
        stress: scores.stressScore,
        pain: scores.painScore,
        composite: current.composite,
        readinessLevel: current.readinessLevel,
        fatigueRisk: current.fatigueRisk,
        trendDirection,
        checkedInAt: new Date().toISOString(),
      },
    };

    await db
      .update(trainingSystems)
      .set({ metadata: { ...meta, agentMemory: updatedMemory } as any })
      .where(eq(trainingSystems.id, system.id));

    // ── Recovery pattern detection ────────────────────────────────────────────
    // Write to memory service after 4+ consistent signals — visible in Coach Memory Panel
    if (windowScores.length >= 4) {
      const last4 = windowScores.slice(0, 4);

      const chronicPoorSleep = last4.every((s) => s.sleepScore <= 2);
      const chronicHighSoreness = last4.every((s) => s.sorenessScore >= 4);
      const chronicLowEnergy = last4.every((s) => s.energyScore <= 2);
      const chronicHighStress = last4.every((s) => s.stressScore >= 4);

      const promises: Promise<void>[] = [];

      if (chronicPoorSleep) {
        promises.push(upsertMemory(userId, {
          type: "recovery_pattern",
          subject: "chronic_poor_sleep",
          detail: "Athlete has logged poor sleep (≤2/5) for 4+ consecutive check-ins. Adjust session density and avoid high-CNS demands on low-sleep days.",
          sentiment: "negative",
          confidence: 0.85,
          source: "readiness",
        }));
      }

      if (chronicHighSoreness) {
        promises.push(upsertMemory(userId, {
          type: "recovery_pattern",
          subject: "chronic_high_soreness",
          detail: "Athlete has reported significant soreness (≥4/5) for 4+ check-ins in a row. This suggests cumulative fatigue — consider reducing accessory volume or programming a deload.",
          sentiment: "negative",
          confidence: 0.85,
          source: "readiness",
        }));
      }

      if (chronicLowEnergy) {
        promises.push(upsertMemory(userId, {
          type: "recovery_pattern",
          subject: "chronic_low_energy",
          detail: "Athlete has reported persistently low energy (≤2/5) across 4+ check-ins. May indicate lifestyle factors (nutrition, stress, recovery) affecting training capacity.",
          sentiment: "negative",
          confidence: 0.8,
          source: "readiness",
        }));
      }

      if (chronicHighStress) {
        promises.push(upsertMemory(userId, {
          type: "recovery_pattern",
          subject: "chronic_high_stress",
          detail: "Athlete has reported high stress (≥4/5) for 4+ consecutive check-ins. Reduce session complexity and avoid adding new technical demands during this period.",
          sentiment: "negative",
          confidence: 0.8,
          source: "readiness",
        }));
      }

      // Declining trend pattern
      if (trendDirection === "declining" && composites.length >= 5) {
        promises.push(upsertMemory(userId, {
          type: "recovery_pattern",
          subject: "declining_readiness_trend",
          detail: "Readiness has been declining across recent check-ins. Training load may be exceeding recovery capacity — consider a deload or reduced-intensity block.",
          sentiment: "negative",
          confidence: 0.75,
          source: "readiness",
        }));
      }

      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }
  } catch {
    // Non-fatal
  }
}

const router: IRouter = Router();

// ─── POST /readiness — save check-in + evaluate (no auto-apply) ───────────────

router.post("/readiness", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore, notes } = req.body;

  if (
    sleepScore === undefined || energyScore === undefined || sorenessScore === undefined ||
    stressScore === undefined || motivationScore === undefined || painScore === undefined
  ) {
    res.status(400).json({ error: "All score fields are required" });
    return;
  }

  const scoreValues = [sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore];
  if (scoreValues.some((s) => typeof s !== "number" || s < 1 || s > 5)) {
    res.status(400).json({ error: "All scores must be integers between 1 and 5" });
    return;
  }

  try {
    const [entry] = await db
      .insert(readinessEntriesTable)
      .values({ userId, sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore, notes: notes ?? null })
      .returning();

    const checkInScores: CheckInScores = { sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore };

    // Evaluate readiness — does NOT apply any plan changes
    const adaptation = await evaluateCheckIn(userId, entry.id, checkInScores).catch((err) => {
      logger.error({ err, userId }, "Adaptation evaluation error (non-fatal)");
      return null;
    });

    // Rolling history + pattern memory + chat ack (fire-and-forget, non-blocking)
    updateReadinessAgentMemory(userId, checkInScores).catch(() => {});
    postReadinessAckToChat(userId, {
      energy: energyScore,
      soreness: sorenessScore,
      stress: stressScore,
      sleep: sleepScore,
      motivation: motivationScore,
      pain: painScore,
    }, adaptation?.mode ?? null).catch(() => {});

    res.status(201).json({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      adaptation: adaptation ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to save readiness entry");
    res.status(500).json({ error: "Failed to save readiness entry" });
  }
});

// ─── POST /readiness/apply-adjustment — user-confirmed plan change ─────────────

router.post("/readiness/apply-adjustment", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { readinessEntryId, scores, mode } = req.body as {
    readinessEntryId: number;
    scores: CheckInScores;
    mode: AdaptationMode;
  };

  if (!readinessEntryId || !scores || !mode) {
    res.status(400).json({ error: "readinessEntryId, scores, and mode are required" });
    return;
  }

  const validModes: AdaptationMode[] = ["TRAIN_AS_PLANNED", "LIGHT_MODIFICATION", "PAIN_MODIFICATION", "RECOVERY_DELOAD", "GREEN_LIGHT_PROGRESSION"];
  if (!validModes.includes(mode)) {
    res.status(400).json({ error: "Invalid adaptation mode" });
    return;
  }

  try {
    const result = await applyCheckInAdjustment(userId, readinessEntryId, scores, mode);
    if (!result) {
      res.status(404).json({ error: "No active training program found" });
      return;
    }
    res.json(result);
  } catch (err) {
    logger.error({ err, userId }, "Failed to apply check-in adjustment");
    res.status(500).json({ error: "Failed to apply adjustment" });
  }
});

// ─── GET /readiness/today-status — badge data for program panel ───────────────
// Returns today's latest check-in adaptation status without requiring full history.
// Used by the program panel to show "Adapted" badge on today's session.

router.get("/readiness/today-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Find the most recent check-in from today
    const entries = await db
      .select()
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(1);

    const latest = entries[0] ?? null;
    if (!latest) {
      res.json({ hasCheckInToday: false, mode: null, composite: null, readinessLevel: null });
      return;
    }

    const latestDateStr = latest.createdAt.toISOString().slice(0, 10);
    const hasCheckInToday = latestDateStr === todayStr;

    const scores: CheckInScores = {
      sleepScore: latest.sleepScore,
      energyScore: latest.energyScore,
      sorenessScore: latest.sorenessScore,
      stressScore: latest.stressScore,
      motivationScore: latest.motivationScore,
      painScore: latest.painScore,
    };

    const { composite, readinessLevel } = computeReadinessScore(scores);

    const mode = determineAdaptationMode(scores);

    res.json({
      hasCheckInToday,
      mode,
      composite,
      readinessLevel,
      checkedInAt: latest.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch today readiness status");
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ─── GET /readiness — history ──────────────────────────────────────────────────

router.get("/readiness", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "7", 10), 30);

  try {
    const entries = await db
      .select()
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.createdAt))
      .limit(limit);

    res.json(entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "Failed to fetch readiness entries");
    res.status(500).json({ error: "Failed to fetch readiness entries" });
  }
});

export default router;
