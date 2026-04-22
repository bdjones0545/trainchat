import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable,
  trainingSystems,
  savedProgramsTable,
  sessionLogsTable,
  exerciseLogsTable,
  activeSessionsTable,
  readinessEntriesTable,
  sessionFeedbackTable,
  userMemoriesTable,
  neuralProfilesTable,
  globalLearningEventsTable,
  pendingClarificationsTable,
  systemAdjustmentEventsTable,
  analyticsEventsTable,
  shareMomentAuditTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── POST /api/clear-memory ────────────────────────────────────────────────────
//
// Wipes all user-specific history, personalization, and training state while
// preserving the user's account, auth credentials, and subscription/billing.
//
// Tables cleared:
//   conversations (cascades → messages, pending_clarifications)
//   training_systems (cascades → phases, weeks, sessions, exercises, change_log, propagation_events, system_adjustment_events)
//   saved_programs (cascades → program_days, exercises)
//   session_logs
//   exercise_logs
//   active_sessions
//   readiness_entries
//   session_feedback
//   user_memories
//   neural_profiles
//   global_learning_events (by userId)
//   pending_clarifications (by userId, also cascades from conversations)
//   system_adjustment_events (by userId)
//   analytics_events (by userId)
//   share_moment_audit (by userId)
//
// Tables preserved:
//   users (account + stripe linkage)
//   user_profiles (basic profile setup)
//   password_reset_tokens (auth)
//   learning_candidates (system-wide, not user-specific)

router.post("/clear-memory", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  logger.info({ userId }, "[ClearCoachMemory] Reset initiated");

  try {
    // ── Gather counts before deletion for audit log ──────────────────────────
    const [
      convRows,
      programRows,
      sessionLogRows,
      exerciseLogRows,
      memoryRows,
      neuralRows,
      readinessRows,
      systemRows,
    ] = await Promise.all([
      db.select().from(conversationsTable).where(eq(conversationsTable.userId, userId)),
      db.select().from(savedProgramsTable).where(eq(savedProgramsTable.userId, userId)),
      db.select().from(sessionLogsTable).where(eq(sessionLogsTable.userId, userId)),
      db.select().from(exerciseLogsTable).where(eq(exerciseLogsTable.userId, userId)),
      db.select().from(userMemoriesTable).where(eq(userMemoriesTable.userId, userId)),
      db.select().from(neuralProfilesTable).where(eq(neuralProfilesTable.userId, userId)),
      db.select().from(readinessEntriesTable).where(eq(readinessEntriesTable.userId, userId)),
      db.select().from(trainingSystems).where(eq(trainingSystems.userId, userId)),
    ]);

    const chatsDeleted = convRows.length;
    const programsDeleted = programRows.length;
    const sessionLogsDeleted = sessionLogRows.length;
    const exerciseLogsDeleted = exerciseLogRows.length;
    const memoriesCleared = memoryRows.length;
    const neuralCleared = neuralRows.length;
    const readinessCleared = readinessRows.length;
    const trainingSysDeleted = systemRows.length;

    // ── Execute deletions in dependency order ────────────────────────────────
    // Delete conversations first — cascade handles messages + pending_clarifications
    await db.delete(conversationsTable).where(eq(conversationsTable.userId, userId));

    // Delete training systems — cascade handles phases, weeks, sessions,
    // session_exercises, system_change_log, propagation_events
    await db.delete(trainingSystems).where(eq(trainingSystems.userId, userId));

    // Delete saved programs — cascade handles program_days, exercises
    await db.delete(savedProgramsTable).where(eq(savedProgramsTable.userId, userId));

    // Delete remaining user-specific rows in parallel
    await Promise.all([
      db.delete(sessionLogsTable).where(eq(sessionLogsTable.userId, userId)),
      db.delete(exerciseLogsTable).where(eq(exerciseLogsTable.userId, userId)),
      db.delete(activeSessionsTable).where(eq(activeSessionsTable.userId, userId)),
      db.delete(readinessEntriesTable).where(eq(readinessEntriesTable.userId, userId)),
      db.delete(sessionFeedbackTable).where(eq(sessionFeedbackTable.userId, userId)),
      db.delete(userMemoriesTable).where(eq(userMemoriesTable.userId, userId)),
      db.delete(neuralProfilesTable).where(eq(neuralProfilesTable.userId, userId)),
      db.delete(pendingClarificationsTable).where(eq(pendingClarificationsTable.userId, userId)),
      db.delete(systemAdjustmentEventsTable).where(eq(systemAdjustmentEventsTable.userId, userId)),
      db.delete(globalLearningEventsTable).where(eq(globalLearningEventsTable.userId, userId)),
      db.delete(analyticsEventsTable).where(eq(analyticsEventsTable.userId, userId)),
      db.delete(shareMomentAuditTable).where(eq(shareMomentAuditTable.userId, userId)),
    ]);

    // ── Audit log ────────────────────────────────────────────────────────────
    logger.info(
      {
        userId,
        resetTriggered: true,
        chatsDeleted,
        programsDeleted,
        sessionLogsDeleted,
        exerciseLogsDeleted,
        memoriesCleared,
        neuralCleared,
        readinessCleared,
        trainingSysDeleted,
        learningStateCleared: true,
        subscriptionPreserved: true,
        accountPreserved: true,
        success: true,
      },
      "[ClearCoachMemoryAudit] Reset complete",
    );

    res.json({
      success: true,
      cleared: {
        chats: chatsDeleted,
        programs: programsDeleted,
        sessionLogs: sessionLogsDeleted,
        exerciseLogs: exerciseLogsDeleted,
        memories: memoriesCleared,
        neuralProfile: neuralCleared,
        readiness: readinessCleared,
        trainingSystems: trainingSysDeleted,
      },
    });
  } catch (err) {
    logger.error({ err, userId }, "[ClearCoachMemory] Reset failed");
    res.status(500).json({ error: "Failed to clear coach memory. Please try again." });
  }
});

export default router;
