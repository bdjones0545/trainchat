/**
 * anonymousMerge.ts
 *
 * Handles migrating data from an anonymous user account to a registered one.
 * Called when:
 *   - An anonymous user signs up (upgrade their own account in-place)
 *   - An anonymous user logs into an existing registered account (merge data)
 *
 * Merge is idempotent and safe — it logs decisions and never silently duplicates data.
 */

import { db, usersTable, conversationsTable, trainingSystems } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Merge all conversations and training systems from an anonymous user into
 * a registered target user, then mark (or delete) the anonymous user.
 *
 * Safe to call multiple times — if the anonymous user is already gone or
 * has no data, it exits cleanly.
 */
export async function mergeAnonymousToRegistered(
  anonymousUserId: number,
  targetUserId: number,
): Promise<{ conversationsMerged: number; systemsMerged: number }> {
  if (anonymousUserId === targetUserId) {
    // Same account — nothing to merge (e.g., anonymous user registered in-place)
    return { conversationsMerged: 0, systemsMerged: 0 };
  }

  const [anonUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, anonymousUserId));

  if (!anonUser || !anonUser.isAnonymous) {
    logger.warn(
      { anonymousUserId, targetUserId },
      "anonymousMerge: skipping — source user not found or not anonymous",
    );
    return { conversationsMerged: 0, systemsMerged: 0 };
  }

  // Reassign conversations
  const updatedConvos = await db
    .update(conversationsTable)
    .set({ userId: targetUserId })
    .where(eq(conversationsTable.userId, anonymousUserId))
    .returning({ id: conversationsTable.id });

  // Reassign training systems
  const updatedSystems = await db
    .update(trainingSystems)
    .set({ userId: targetUserId })
    .where(eq(trainingSystems.userId, anonymousUserId))
    .returning({ id: trainingSystems.id });

  logger.info(
    {
      anonymousUserId,
      targetUserId,
      conversationsMerged: updatedConvos.length,
      systemsMerged: updatedSystems.length,
    },
    "anonymousMerge: anonymous data merged into registered account",
  );

  // Delete the now-empty anonymous user (clean up, avoid orphaned rows)
  await db.delete(usersTable).where(eq(usersTable.id, anonymousUserId));

  return {
    conversationsMerged: updatedConvos.length,
    systemsMerged: updatedSystems.length,
  };
}
