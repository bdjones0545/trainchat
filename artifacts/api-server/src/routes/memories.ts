import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { listMemories, syncMemoriesFromData } from "../lib/memory";
import { db } from "@workspace/db";
import { userMemoriesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/memories", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);
  res.json(memories.map((m) => ({
    id: m.id,
    userId: m.userId,
    type: m.type,
    subject: m.subject,
    sentiment: m.sentiment,
    confidence: m.confidence,
    source: m.source,
    detail: m.detail,
    status: (m as any).status ?? "active",
    updatedAt: m.updatedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/memories/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const synced = await syncMemoriesFromData(userId);
  res.json({ synced });
});

/**
 * PATCH /api/memories/:id
 *
 * Updates a memory's status or confidence. Ownership is enforced.
 * Used for: mark resolved, mark monitor, downgrade confidence.
 */
const patchMemorySchema = z.object({
  status: z.enum(["active", "monitor", "resolved"]).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
});

router.patch("/memories/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rawId = req.params["id"] as string;
  const memoryId = parseInt(rawId, 10);

  if (isNaN(memoryId)) {
    res.status(400).json({ error: "Invalid memory ID" });
    return;
  }

  const parsed = patchMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const updates = parsed.data;
  if (!updates.status && updates.confidence === undefined) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  try {
    const [existing] = await db
      .select({ id: userMemoriesTable.id })
      .from(userMemoriesTable)
      .where(and(eq(userMemoriesTable.id, memoryId), eq(userMemoriesTable.userId, userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.status) updatePayload.status = updates.status;
    if (updates.confidence !== undefined) updatePayload.confidence = updates.confidence;

    await db
      .update(userMemoriesTable)
      .set(updatePayload)
      .where(and(eq(userMemoriesTable.id, memoryId), eq(userMemoriesTable.userId, userId)));

    logger.info({ userId, memoryId, updates }, "[MemoryPatch] Memory updated");
    res.json({ updated: true, id: memoryId, ...updates });
  } catch (err) {
    logger.error({ err, userId, memoryId }, "[MemoryPatch] Failed");
    res.status(500).json({ error: "Failed to update memory" });
  }
});

/**
 * DELETE /api/memories/:id
 *
 * Removes a single memory entry. Ownership is enforced — users can only
 * delete their own memories. Returns 404 if not found or not owned.
 */
router.delete("/memories/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rawId = req.params["id"] as string;
  const memoryId = parseInt(rawId, 10);

  if (isNaN(memoryId)) {
    res.status(400).json({ error: "Invalid memory ID" });
    return;
  }

  try {
    const deleted = await db
      .delete(userMemoriesTable)
      .where(and(eq(userMemoriesTable.id, memoryId), eq(userMemoriesTable.userId, userId)))
      .returning({ id: userMemoriesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    res.json({ deleted: true, id: memoryId });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

/**
 * POST /api/memories/clear-category
 *
 * Deletes all memory entries of a specific type for the authenticated user.
 * Enables selective memory clearing without wiping everything.
 */
const clearCategorySchema = z.object({
  category: z.string().min(1),
});

router.post("/memories/clear-category", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const parsed = clearCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }

  const { category } = parsed.data;

  const VALID_CATEGORIES = [
    "pain_pattern",
    "exercise_preference",
    "exercise_exclusion",
    "training_preference",
    "volume_response",
    "recovery_pattern",
    "session_preference",
    "split_preference",
    "adherence_pattern",
    "sport_context",
    "time_constraint",
    "communication_preference",
  ];

  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: "Unknown memory category" });
    return;
  }

  try {
    const deleted = await db
      .delete(userMemoriesTable)
      .where(and(eq(userMemoriesTable.userId, userId), eq(userMemoriesTable.type, category)))
      .returning({ id: userMemoriesTable.id });

    logger.info({ userId, category, count: deleted.length }, "[MemoryClearCategory] Category cleared");
    res.json({ deleted: true, category, count: deleted.length });
  } catch (err) {
    logger.error({ err, userId, category }, "[MemoryClearCategory] Failed");
    res.status(500).json({ error: "Failed to clear category" });
  }
});

/**
 * GET /api/memories/insights
 *
 * Returns a curated set of high-confidence memory patterns formatted for
 * display to the user as coach-language insights.
 * Only includes patterns with confidence >= 3 and a recent update.
 */
router.get("/memories/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);

  // Only surface high-confidence patterns that are recent and substantive
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days
  const surface = memories
    .filter((m) => m.confidence >= 3 && m.updatedAt >= cutoff && (m as any).status !== "resolved")
    .sort((a, b) => b.confidence - a.confidence || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  // Build coach-language summaries
  const insights = surface.map((m) => {
    const confidenceLabel = m.confidence >= 5 ? "strong" : m.confidence >= 4 ? "clear" : "emerging";

    return {
      id: m.id,
      type: m.type,
      subject: m.subject,
      sentiment: m.sentiment,
      confidence: m.confidence,
      confidenceLabel,
      detail: m.detail,
      coachMessage: buildCoachMessage(m.type, m.subject, m.sentiment, m.detail),
      updatedAt: m.updatedAt.toISOString(),
    };
  });

  res.json({ insights, total: memories.length });
});

function buildCoachMessage(type: string, subject: string, sentiment: string, detail: string): string {
  if (type === "session_preference" && subject.includes("shorter")) {
    return "You tend to perform better with shorter, focused sessions. This block stays within that window.";
  }
  if (type === "session_preference" && subject.includes("longer")) {
    return "You handle longer sessions well. Fuller training structures are appropriate for you.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance") && sentiment === "positive") {
    return "You show up consistently — progression can be planned with confidence.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance") && sentiment === "negative") {
    return "Consistency has been up and down. Simpler programs that are easier to execute are the priority right now.";
  }
  if (type === "adherence_pattern" && subject.includes("session length fatigue")) {
    return "Longer sessions push your difficulty higher than shorter ones. Lower-priority work is trimmed to protect what matters.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance")) {
    const dayMatch = subject.match(/^(\w+day)/i);
    if (dayMatch) {
      return `${dayMatch[1]} sessions have a high skip rate. They're being kept shorter and simpler.`;
    }
  }
  if (type === "volume_response" && subject.includes("lower body")) {
    return "Your lower-body fatigue rises when volume is high. Lower-body days are kept tighter to protect output quality.";
  }
  if (type === "volume_response" && subject.includes("difficulty") && sentiment === "negative") {
    return "Sessions have been consistently demanding. Volume and intensity are being managed more conservatively.";
  }
  if (type === "volume_response" && sentiment === "positive") {
    return "You handle training load well. Progression can move at a confident pace.";
  }
  if (type === "exercise_preference" && subject.includes("stall")) {
    const exMatch = subject.match(/^(.+?) progression/);
    return exMatch
      ? `${exMatch[1]} has been stalling. Alternatives will be considered before pushing load further.`
      : "A recurring exercise pattern has stalled. Alternatives are being prioritized.";
  }
  if (type === "exercise_preference" && subject.includes("positive response")) {
    const exMatch = subject.match(/^(.+?) positive/);
    return exMatch
      ? `You progress well on ${exMatch[1]}. This movement will stay in future programs.`
      : "An exercise you respond well to is being kept in the program.";
  }
  if (type === "pain_pattern") {
    return "A recurring pain pattern has been noted. Exercise selection and loading are being managed conservatively.";
  }
  if (type === "recovery_pattern" && sentiment === "positive") {
    return "Your recovery is consistently strong. Higher training loads are well-supported.";
  }
  if (type === "recovery_pattern" && sentiment === "negative") {
    return "Recovery has been lagging. Session density is managed to give you enough room to adapt.";
  }
  if (type === "split_preference") {
    return detail.split(".")[0] + ".";
  }
  return detail.split(".")[0] + ".";
}

export default router;
