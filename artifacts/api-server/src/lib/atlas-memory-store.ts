/**
 * AtlasMemoryStore
 *
 * Persists and retrieves Atlas coaching memories from atlas_memories.
 *
 * Deduplication: normalizedKey — repeated signals raise confidence (cap 5).
 * Stale protection: extraction marker expires after 7 days, allowing re-extraction
 * of conversations that have grown significantly.
 *
 * Public API:
 *   getMemoriesForUser(userId, limit?)          → AtlasMemory[]
 *   upsertMemory(userId, memory, convId)        → void
 *   isConversationExtracted(userId, convId)     → boolean
 *   markConversationExtracted(userId, convId)   → void
 *   archiveMemory(userId, memoryId)             → boolean
 */

import { db } from "@workspace/db";
import {
  atlasMemoriesTable,
  type AtlasMemory,
  type AtlasMemoryCategory,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { ExtractedMemory } from "./atlas-memory-extractor";
import { logger } from "./logger";

const EXTRACTION_MARKER_KEY = (conversationId: number) =>
  `_extraction_marker:conv_${conversationId}`;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fetch active coaching memories for a user.
 * Sorted by importance × confidence desc (most impactful first).
 * Excludes internal extraction markers.
 */
export async function getMemoriesForUser(
  userId: number,
  limit = 20,
): Promise<AtlasMemory[]> {
  return db
    .select()
    .from(atlasMemoriesTable)
    .where(
      and(
        eq(atlasMemoriesTable.userId, userId),
        eq(atlasMemoriesTable.status, "active"),
        sql`${atlasMemoriesTable.category} != '_extraction_marker'`,
      ),
    )
    .orderBy(
      desc(sql`${atlasMemoriesTable.importance} * ${atlasMemoriesTable.confidence}`),
    )
    .limit(limit);
}

/**
 * Upsert a single extracted memory.
 *
 * If a record with the same normalizedKey already exists for this user:
 *   - bump confidence +1 (cap 5)
 *   - upgrade summary if the new one is longer/more specific
 *   - take the higher importance score
 *   - refresh lastSeenAt
 * Otherwise, insert as new.
 */
export async function upsertMemory(
  userId: number,
  memory: ExtractedMemory,
  sourceConversationId: number,
): Promise<void> {
  const existing = await db
    .select()
    .from(atlasMemoriesTable)
    .where(
      and(
        eq(atlasMemoriesTable.userId, userId),
        eq(atlasMemoriesTable.normalizedKey, memory.normalizedKey),
        sql`${atlasMemoriesTable.status} != 'archived'`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0]!;
    await db
      .update(atlasMemoriesTable)
      .set({
        confidence: Math.min(5, current.confidence + 1) as 1 | 2 | 3 | 4 | 5,
        summary:
          memory.summary.length > current.summary.length ? memory.summary : current.summary,
        importance: Math.max(current.importance, memory.importance) as 1 | 2 | 3 | 4 | 5,
        sourceConversationId,
        lastSeenAt: new Date(),
      })
      .where(eq(atlasMemoriesTable.id, current.id));
  } else {
    await db.insert(atlasMemoriesTable).values({
      userId,
      category: memory.category as AtlasMemoryCategory,
      summary: memory.summary,
      normalizedKey: memory.normalizedKey,
      confidence: Math.min(5, Math.max(1, memory.confidence)) as 1 | 2 | 3 | 4 | 5,
      importance: Math.min(5, Math.max(1, memory.importance)) as 1 | 2 | 3 | 4 | 5,
      sourceConversationId,
      sourceMessageIds: [],
      metadata: {},
      status: "active",
      lastSeenAt: new Date(),
    });
  }
}

/**
 * Returns true if this conversation has been extracted within the last 7 days.
 * The 7-day window allows re-extraction when conversations have grown.
 */
export async function isConversationExtracted(
  userId: number,
  conversationId: number,
): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const [marker] = await db
    .select({ lastSeenAt: atlasMemoriesTable.lastSeenAt })
    .from(atlasMemoriesTable)
    .where(
      and(
        eq(atlasMemoriesTable.userId, userId),
        eq(atlasMemoriesTable.normalizedKey, EXTRACTION_MARKER_KEY(conversationId)),
      ),
    )
    .limit(1);

  if (!marker) return false;
  return marker.lastSeenAt >= sevenDaysAgo;
}

/** Creates or refreshes the extraction marker for a conversation. */
export async function markConversationExtracted(
  userId: number,
  conversationId: number,
): Promise<void> {
  const key = EXTRACTION_MARKER_KEY(conversationId);

  const [existing] = await db
    .select({ id: atlasMemoriesTable.id })
    .from(atlasMemoriesTable)
    .where(
      and(
        eq(atlasMemoriesTable.userId, userId),
        eq(atlasMemoriesTable.normalizedKey, key),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(atlasMemoriesTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(atlasMemoriesTable.id, existing.id));
  } else {
    await db.insert(atlasMemoriesTable).values({
      userId,
      category: "_extraction_marker",
      summary: `Extraction marker for conversation ${conversationId}`,
      normalizedKey: key,
      confidence: 5,
      importance: 1,
      sourceConversationId: conversationId,
      sourceMessageIds: [],
      metadata: {},
      status: "active",
      lastSeenAt: new Date(),
    });
  }

  logger.debug({ userId, conversationId }, "[AtlasMemoryStore] Marked conversation extracted");
}

/**
 * Archive (soft-delete) a memory by ID.
 * Ownership is enforced — returns false if not found or unauthorized.
 */
export async function archiveMemory(userId: number, memoryId: number): Promise<boolean> {
  const result = await db
    .update(atlasMemoriesTable)
    .set({ status: "archived" })
    .where(
      and(
        eq(atlasMemoriesTable.id, memoryId),
        eq(atlasMemoriesTable.userId, userId),
      ),
    );

  return (result.rowCount ?? 0) > 0;
}
