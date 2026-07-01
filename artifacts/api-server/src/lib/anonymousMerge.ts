/**
 * anonymousMerge.ts
 *
 * Handles migrating data from an anonymous user account to a registered one.
 * Called when:
 *   - An anonymous user signs up (upgrade their own account in-place)
 *   - An anonymous user logs into an existing registered account (merge data)
 *
 * Fix for DR-0025: the entire merge now runs inside a single DB transaction.
 * All child tables are reassigned to targetUserId BEFORE the anonymous user row
 * is deleted, preventing the cascade wipe that previously silently lost memory,
 * profile, readiness, and log data.
 *
 * Conflict policies:
 *   - user_profiles:   target's existing profile wins; anonymous profile discarded.
 *   - neural_profiles: XP and session counts are additive; scores take the max;
 *                      milestones are unioned; target's graph state is kept.
 *   - All other tables: rows are reassigned unconditionally (no unique constraint).
 */

import {
  db,
  usersTable,
  conversationsTable,
  trainingSystems,
  userMemoriesTable,
  atlasMemoriesTable,
  userProfilesTable,
  neuralProfilesTable,
  readinessEntriesTable,
  sessionFeedbackTable,
  sessionLogsTable,
  exerciseLogsTable,
  activeSessionsTable,
  pendingClarificationsTable,
  savedProgramsTable,
  passwordResetTokensTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export type MergeResult = {
  conversationsMerged: number;
  systemsMerged: number;
  memoriesMerged: number;
  atlasMemoriesMerged: number;
  /** true = anonymous profile moved to target; false = target already had one (anon discarded) */
  profileMerged: boolean;
  /** true = anonymous neural data was applied to target (moved or merged) */
  neuralProfileMerged: boolean;
  readinessEntriesMerged: number;
  sessionFeedbackMerged: number;
  sessionLogsMerged: number;
  exerciseLogsMerged: number;
  activeSessionsMerged: number;
  pendingClarificationsMerged: number;
  savedProgramsMerged: number;
  passwordResetTokensMerged: number;
};

const EMPTY_RESULT: MergeResult = {
  conversationsMerged: 0,
  systemsMerged: 0,
  memoriesMerged: 0,
  atlasMemoriesMerged: 0,
  profileMerged: false,
  neuralProfileMerged: false,
  readinessEntriesMerged: 0,
  sessionFeedbackMerged: 0,
  sessionLogsMerged: 0,
  exerciseLogsMerged: 0,
  activeSessionsMerged: 0,
  pendingClarificationsMerged: 0,
  savedProgramsMerged: 0,
  passwordResetTokensMerged: 0,
};

/**
 * Migrate all data from an anonymous user into a registered target user,
 * then delete the anonymous user row.
 *
 * The entire operation runs inside a single DB transaction. If any step fails,
 * the transaction rolls back and the anonymous user's data is preserved intact.
 *
 * Two paths:
 *   - anonymousUserId === targetUserId: in-place upgrade (registration on same device).
 *     Returns immediately with zero counts — no rows moved, no rows deleted.
 *   - anonymousUserId !== targetUserId: login-merge (different device / cleared session).
 *     All child tables are reassigned before the anonymous user row is deleted.
 */
export async function mergeAnonymousToRegistered(
  anonymousUserId: number,
  targetUserId: number,
): Promise<MergeResult> {
  if (anonymousUserId === targetUserId) {
    // In-place upgrade: the anonymous user registered on the same device.
    // Their userId is unchanged; nothing needs to move.
    return EMPTY_RESULT;
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
    return EMPTY_RESULT;
  }

  // tx has the same interface as db for DML; cast to any to satisfy Drizzle's PgTransaction type
  const result = await db.transaction(async (tx: any) => {
    // ── Step 1: Reassign all simple child tables ─────────────────────────────
    // No unique constraints on userId in these tables — a plain UPDATE is safe.
    // Executed sequentially to stay within a single transaction connection.

    const updatedConvos = await tx
      .update(conversationsTable)
      .set({ userId: targetUserId })
      .where(eq(conversationsTable.userId, anonymousUserId))
      .returning({ id: conversationsTable.id });

    const updatedSystems = await tx
      .update(trainingSystems)
      .set({ userId: targetUserId })
      .where(eq(trainingSystems.userId, anonymousUserId))
      .returning({ id: trainingSystems.id });

    const updatedMemories = await tx
      .update(userMemoriesTable)
      .set({ userId: targetUserId })
      .where(eq(userMemoriesTable.userId, anonymousUserId))
      .returning({ id: userMemoriesTable.id });

    const updatedAtlas = await tx
      .update(atlasMemoriesTable)
      .set({ userId: targetUserId })
      .where(eq(atlasMemoriesTable.userId, anonymousUserId))
      .returning({ id: atlasMemoriesTable.id });

    const updatedReadiness = await tx
      .update(readinessEntriesTable)
      .set({ userId: targetUserId })
      .where(eq(readinessEntriesTable.userId, anonymousUserId))
      .returning({ id: readinessEntriesTable.id });

    const updatedFeedback = await tx
      .update(sessionFeedbackTable)
      .set({ userId: targetUserId })
      .where(eq(sessionFeedbackTable.userId, anonymousUserId))
      .returning({ id: sessionFeedbackTable.id });

    const updatedSessionLogs = await tx
      .update(sessionLogsTable)
      .set({ userId: targetUserId })
      .where(eq(sessionLogsTable.userId, anonymousUserId))
      .returning({ id: sessionLogsTable.id });

    const updatedExerciseLogs = await tx
      .update(exerciseLogsTable)
      .set({ userId: targetUserId })
      .where(eq(exerciseLogsTable.userId, anonymousUserId))
      .returning({ id: exerciseLogsTable.id });

    const updatedActiveSessions = await tx
      .update(activeSessionsTable)
      .set({ userId: targetUserId })
      .where(eq(activeSessionsTable.userId, anonymousUserId))
      .returning({ id: activeSessionsTable.id });

    const updatedClarifications = await tx
      .update(pendingClarificationsTable)
      .set({ userId: targetUserId })
      .where(eq(pendingClarificationsTable.userId, anonymousUserId))
      .returning({ id: pendingClarificationsTable.id });

    const updatedSavedPrograms = await tx
      .update(savedProgramsTable)
      .set({ userId: targetUserId })
      .where(eq(savedProgramsTable.userId, anonymousUserId))
      .returning({ id: savedProgramsTable.id });

    // Anonymous users should not have password reset tokens, but migrate
    // defensively to prevent any orphaned rows surviving the DELETE below.
    const updatedResetTokens = await tx
      .update(passwordResetTokensTable)
      .set({ userId: targetUserId })
      .where(eq(passwordResetTokensTable.userId, anonymousUserId))
      .returning({ id: passwordResetTokensTable.id });

    // ── Step 2: user_profiles — preserve target; discard anonymous ───────────
    // Policy: if the target user already has an athlete profile it is more
    // authoritative (registered account, completed onboarding). Discard the
    // anonymous profile rather than overwriting the target's data.
    let profileMerged = false;
    const [targetProfile] = await tx
      .select({ id: userProfilesTable.id })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, targetUserId));

    if (targetProfile) {
      // Target already has a profile — discard the anonymous one
      await tx
        .delete(userProfilesTable)
        .where(eq(userProfilesTable.userId, anonymousUserId));
    } else {
      // No conflict — reassign the anonymous profile to the target
      const updated = await tx
        .update(userProfilesTable)
        .set({ userId: targetUserId })
        .where(eq(userProfilesTable.userId, anonymousUserId))
        .returning({ id: userProfilesTable.id });
      profileMerged = updated.length > 0;
    }

    // ── Step 3: neural_profiles — additive XP merge ──────────────────────────
    // neural_profiles has a UNIQUE constraint on userId, so we cannot reassign
    // the anonymous row if the target already has a profile.
    //
    // Merge policy when both profiles exist:
    //   xp                   → additive   (anonymous effort carries over)
    //   level                → max         (never demote)
    //   consistencyScore     → max         (represents demonstrated capability)
    //   progressionScore     → max
    //   recoveryScore        → max
    //   totalSessionsCompleted → additive  (every session counts)
    //   neuralConnections    → additive
    //   unlockedMilestones   → union       (earned milestones are never lost)
    //   graphState           → keep target (richer, more established connectivity)
    //
    // Rationale: XP and counts represent real effort; capability scores are not
    // simply additive; the graph state reflects the target's training history and
    // is more structurally meaningful than the anonymous user's.
    let neuralProfileMerged = false;
    const [anonNeural] = await tx
      .select()
      .from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, anonymousUserId));

    if (anonNeural) {
      const [targetNeural] = await tx
        .select()
        .from(neuralProfilesTable)
        .where(eq(neuralProfilesTable.userId, targetUserId));

      if (targetNeural) {
        // Both profiles exist — merge into target's row, then delete anonymous
        const mergedMilestones = Array.from(
          new Set([...targetNeural.unlockedMilestones, ...anonNeural.unlockedMilestones]),
        );
        await tx
          .update(neuralProfilesTable)
          .set({
            xp: targetNeural.xp + anonNeural.xp,
            level: Math.max(targetNeural.level, anonNeural.level),
            consistencyScore: Math.max(
              targetNeural.consistencyScore,
              anonNeural.consistencyScore,
            ),
            progressionScore: Math.max(
              targetNeural.progressionScore,
              anonNeural.progressionScore,
            ),
            recoveryScore: Math.max(targetNeural.recoveryScore, anonNeural.recoveryScore),
            totalSessionsCompleted:
              targetNeural.totalSessionsCompleted + anonNeural.totalSessionsCompleted,
            neuralConnections: targetNeural.neuralConnections + anonNeural.neuralConnections,
            unlockedMilestones: mergedMilestones,
            lastUpdated: new Date(),
          })
          .where(eq(neuralProfilesTable.userId, targetUserId));

        await tx
          .delete(neuralProfilesTable)
          .where(eq(neuralProfilesTable.userId, anonymousUserId));
      } else {
        // No conflict — reassign the anonymous profile to the target
        await tx
          .update(neuralProfilesTable)
          .set({ userId: targetUserId })
          .where(eq(neuralProfilesTable.userId, anonymousUserId));
      }
      neuralProfileMerged = true;
    }

    // ── Step 4: Delete the anonymous user row ────────────────────────────────
    // All child rows have been reassigned or explicitly deleted above.
    // The cascade fires on an empty set — no data is lost.
    await tx.delete(usersTable).where(eq(usersTable.id, anonymousUserId));

    return {
      conversationsMerged: updatedConvos.length,
      systemsMerged: updatedSystems.length,
      memoriesMerged: updatedMemories.length,
      atlasMemoriesMerged: updatedAtlas.length,
      profileMerged,
      neuralProfileMerged,
      readinessEntriesMerged: updatedReadiness.length,
      sessionFeedbackMerged: updatedFeedback.length,
      sessionLogsMerged: updatedSessionLogs.length,
      exerciseLogsMerged: updatedExerciseLogs.length,
      activeSessionsMerged: updatedActiveSessions.length,
      pendingClarificationsMerged: updatedClarifications.length,
      savedProgramsMerged: updatedSavedPrograms.length,
      passwordResetTokensMerged: updatedResetTokens.length,
    };
  });

  logger.info(
    { anonymousUserId, targetUserId, ...result },
    "anonymousMerge: complete",
  );

  return result;
}
