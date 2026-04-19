import { Router, type IRouter } from "express";
import { db, readinessEntriesTable, conversationsTable, messagesTable, trainingSystems } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { evaluateAndAdapt } from "../lib/check-in-adaptation";

// ─── Pipeline helpers: chat ack + agent memory ────────────────────────────────

async function postReadinessAckToChat(
  userId: number,
  scores: { energy: number; soreness: number; stress: number; sleep: number; motivation: number; pain: number },
  adaptation: { changesApplied?: number; summary?: string } | null
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

    const changesApplied = adaptation?.changesApplied ?? 0;
    let content = `Got it — ${energyLabel}, ${sorenessLabel} today.`;
    if (changesApplied > 0) {
      content += ` I've adjusted your plan based on today's check-in: ${adaptation?.summary ?? `${changesApplied} change${changesApplied !== 1 ? "s" : ""} applied`}.`;
    } else {
      content += ` Your plan looks appropriate for today's readiness — no adjustments needed.`;
    }

    const structuredData = JSON.stringify({
      _type: "check_in",
      energyScore: scores.energy,
      sorenessScore: scores.soreness,
      stressScore: scores.stress,
      sleepScore: scores.sleep,
      motivationScore: scores.motivation,
      painScore: scores.pain,
      adaptationChanges: changesApplied,
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
  scores: { energy: number; soreness: number; stress: number }
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

    const fatigue =
      scores.soreness >= 4 ? "high"
      : scores.soreness <= 2 ? "low"
      : "moderate";

    const readiness =
      scores.energy >= 4 ? "high"
      : scores.energy <= 2 ? "low"
      : "moderate";

    const updatedMemory = {
      ...existingMemory,
      fatigue,
      readiness,
      lastCheckIn: {
        energy: scores.energy,
        soreness: scores.soreness,
        stress: scores.stress,
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

    // ── Adaptive Check-In Engine ──────────────────────────────────────────────
    // Evaluates readiness signals and proactively adjusts the active training
    // system. Non-blocking — failures never break the check-in save.
    const adaptation = await evaluateAndAdapt(userId, entry.id, {
      sleepScore,
      energyScore,
      sorenessScore,
      stressScore,
      motivationScore,
      painScore,
    }).catch((err) => {
      logger.error({ err, userId }, "Adaptation engine error (non-fatal)");
      return null;
    });

    // ── Pipeline: chat ack + agent memory (fire-and-forget — never block response) ─
    postReadinessAckToChat(userId, {
      energy: energyScore,
      soreness: sorenessScore,
      stress: stressScore,
      sleep: sleepScore,
      motivation: motivationScore,
      pain: painScore,
    }, adaptation as { changesApplied?: number; summary?: string } | null).catch(() => {});

    updateReadinessAgentMemory(userId, {
      energy: energyScore,
      soreness: sorenessScore,
      stress: stressScore,
    }).catch(() => {});

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
