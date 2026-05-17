/**
 * Atlas Memories Routes
 *
 * GET    /api/atlas/memories                          — list user's active coaching memories
 * POST   /api/atlas/memories/extract/:conversationId  — extract memories from a conversation
 * DELETE /api/atlas/memories/:id                      — archive a memory
 *
 * Extraction is designed fire-and-forget: responds immediately with
 * { status: "extracting" } and continues in setImmediate so it never
 * blocks the chat load path.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import { messagesTable, conversationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { extractMemoriesFromConversation } from "../lib/atlas-memory-extractor";
import {
  getMemoriesForUser,
  upsertMemory,
  isConversationExtracted,
  markConversationExtracted,
  archiveMemory,
} from "../lib/atlas-memory-store";

const router: IRouter = Router();

/**
 * GET /api/atlas/memories
 *
 * Returns active coaching memories sorted by importance × confidence.
 * Excludes internal extraction markers.
 */
router.get("/atlas/memories", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const memories = await getMemoriesForUser(userId, 20);
    res.json(
      memories.map((m) => ({
        id: m.id,
        category: m.category,
        summary: m.summary,
        normalizedKey: m.normalizedKey,
        confidence: m.confidence,
        importance: m.importance,
        lastSeenAt: m.lastSeenAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "[atlas/memories] Failed to load memories");
    res.status(500).json({ error: "Failed to load memories" });
  }
});

const extractParamsSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

/**
 * POST /api/atlas/memories/extract/:conversationId
 *
 * Triggers async memory extraction for a conversation.
 * Idempotent — skips silently if already extracted within 7 days.
 * Returns immediately; extraction runs in setImmediate.
 */
router.post(
  "/atlas/memories/extract/:conversationId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const parsed = extractParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }
    const { conversationId } = parsed.data;

    // Verify ownership
    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.userId, userId),
        ),
      )
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Skip if recently extracted
    const alreadyDone = await isConversationExtracted(userId, conversationId);
    if (alreadyDone) {
      res.json({ processed: false, reason: "already_extracted", memoriesAdded: 0 });
      return;
    }

    // Fetch messages
    const messages = await db
      .select({
        id: messagesTable.id,
        role: messagesTable.role,
        content: messagesTable.content,
      })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    if (messages.length < 2) {
      res.json({ processed: false, reason: "not_enough_messages", memoriesAdded: 0 });
      return;
    }

    // Respond immediately so the client is never blocked
    res.json({ processed: true, memoriesAdded: -1, status: "extracting" });

    // Run extraction asynchronously after the response is sent
    setImmediate(async () => {
      try {
        const extracted = await extractMemoriesFromConversation(
          conversationId,
          messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        );

        for (const memory of extracted) {
          await upsertMemory(userId, memory, conversationId);
        }

        await markConversationExtracted(userId, conversationId);

        logger.info(
          { userId, conversationId, memoriesAdded: extracted.length },
          "[atlas/memories] Extraction complete",
        );
      } catch (err) {
        logger.error(
          { userId, conversationId, err },
          "[atlas/memories] Background extraction failed",
        );
      }
    });
  },
);

const deleteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * DELETE /api/atlas/memories/:id
 *
 * Archives a memory (soft-delete). Useful for user-initiated correction.
 * Ownership enforced.
 */
router.delete("/atlas/memories/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const parsed = deleteParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid memory ID" });
    return;
  }

  const archived = await archiveMemory(userId, parsed.data.id);
  if (!archived) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
