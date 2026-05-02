import { Router, type IRouter } from "express";
import { db, readinessEntriesTable, conversationsTable, messagesTable, trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { evaluateCheckIn, applyCheckInAdjustment, type CheckInScores, type AdaptationMode } from "../lib/check-in-adaptation";

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
      content += " You look ready for normal training today.";
    } else if (mode === "LIGHT_MODIFICATION") {
      content += scores.soreness >= 3
        ? " Soreness is elevated — I can make today more joint-friendly if you'd like."
        : " Recovery looks a little lower — I can reduce volume today if you'd like.";
    } else if (mode === "PAIN_MODIFICATION") {
      content += " Pain flagged — I can adjust today's session to keep things comfortable.";
    } else if (mode === "RECOVERY_DELOAD") {
      content += " Recovery looks lower today. Let me know if you'd like me to adjust today's plan.";
    } else if (mode === "GREEN_LIGHT_PROGRESSION") {
      content += " Everything looks dialled in today.";
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

    const meta = (system.metadata ?? {}) as Record<string, unknown>;
    const existingMemory = (meta.agentMemory ?? {}) as Record<string, unknown>;

    const composite =
      scores.sleepScore + scores.energyScore + scores.motivationScore +
      (6 - scores.sorenessScore) + (6 - scores.stressScore) + (6 - scores.painScore);

    const readinessLevel =
      composite >= 22 ? "high" : composite >= 16 ? "moderate" : "low";

    const highSoreness = scores.sorenessScore >= 4;
    const highStress = scores.stressScore >= 4;
    const poorSleep = scores.sleepScore <= 2;
    const lowEnergy = scores.energyScore <= 2;
    const fatigueRisk =
      (poorSleep && highSoreness) || (poorSleep && highStress) || (lowEnergy && highSoreness) || composite <= 14
        ? "high"
      : (highSoreness || highStress || poorSleep)
        ? "moderate"
      : "low";

    const fatigue =
      scores.sorenessScore >= 4 ? "high"
      : scores.sorenessScore <= 2 ? "low"
      : "moderate";

    const updatedMemory = {
      ...existingMemory,
      fatigue,
      readiness: readinessLevel,
      readinessLevel,
      fatigueRisk,
      lastCheckIn: {
        sleep: scores.sleepScore,
        energy: scores.energyScore,
        motivation: scores.motivationScore,
        soreness: scores.sorenessScore,
        stress: scores.stressScore,
        pain: scores.painScore,
        composite,
        readinessLevel,
        fatigueRisk,
        checkedInAt: new Date().toISOString(),
      },
    };

    await db
      .update(trainingSystems)
      .set({ metadata: { ...meta, agentMemory: updatedMemory } as any })
      .where(eq(trainingSystems.id, system.id));
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

  const scores = [sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore];
  if (scores.some((s) => typeof s !== "number" || s < 1 || s > 5)) {
    res.status(400).json({ error: "All scores must be integers between 1 and 5" });
    return;
  }

  try {
    const [entry] = await db
      .insert(readinessEntriesTable)
      .values({ userId, sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore, notes: notes ?? null })
      .returning();

    const checkInScores: CheckInScores = { sleepScore, energyScore, sorenessScore, stressScore, motivationScore, painScore };

    // Evaluate readiness and determine mode — does NOT apply any plan changes
    const adaptation = await evaluateCheckIn(userId, entry.id, checkInScores).catch((err) => {
      logger.error({ err, userId }, "Adaptation evaluation error (non-fatal)");
      return null;
    });

    // Update agent memory and post chat ack (fire-and-forget)
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
