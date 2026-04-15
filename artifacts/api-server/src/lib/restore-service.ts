/**
 * Restore Service — Phase 4
 *
 * Allows safe restoration of prior entity states captured in the change log.
 * Restoration always creates a new change log entry (never overwrites history).
 * This ensures the audit trail is preserved and the user can undo a restore.
 *
 * Restore is SCOPED: we restore only the entities touched by the original change.
 * Other parts of the program are unaffected.
 *
 * Future extensibility:
 * - Scoped restore by entity type (only restore exercises, not the session)
 * - Batch restore from a version milestone
 * - Restore to "last major version"
 */

import { db } from "@workspace/db";
import {
  sessionExercises,
  trainingSessions,
  trainingWeeks,
  trainingPhases,
  systemChangeLog,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getChangeDetail, createChangeLogEntry } from "./change-log-service";
import type { SystemSnapshot } from "./change-log-service";
import { verifyRestoration } from "./mutation-verifier";

// ─── Restore a prior state ────────────────────────────────────────────────────

export interface RestoreResult {
  changeLogId: number;
  restoredCount: number;
  changeSummary: string;
  changedIds: {
    exercises: number[];
    sessions: number[];
    weeks: number[];
    phases: number[];
  };
  verificationStatus: "verified" | "partial" | "failed" | "noop" | "unclear";
}

export async function restoreFromChange(
  userId: number,
  changeId: number,
  trainingSystemId: number
): Promise<RestoreResult> {
  // 1. Load the original change detail
  const original = await getChangeDetail(userId, changeId);
  if (!original) {
    throw new Error(`Change log entry ${changeId} not found or access denied`);
  }

  if (!original.beforeSnapshot) {
    throw new Error(`Change ${changeId} has no before snapshot — cannot restore`);
  }

  // 2. Capture current state as our "before" snapshot for the restore entry
  const currentSnapshot = await captureCurrentState(original.beforeSnapshot);

  // 3. Apply the before snapshot (restore the prior state)
  const restoredIds = await applySnapshot(original.beforeSnapshot);

  // Phase 2: Verify the restoration — capture actual post-restore state and compare to expected
  const postRestoreState = await captureCurrentState(original.beforeSnapshot);
  const restoreVerification = verifyRestoration(original.beforeSnapshot, postRestoreState);
  logger.info(
    { status: restoreVerification.status, matched: restoreVerification.verifiedCount, total: restoreVerification.totalCount },
    "[MutationVerifier] Restore verification complete"
  );

  // 4. Build a coach-oriented restore summary
  const itemCount = restoredIds.exercises.length + restoredIds.sessions.length +
    restoredIds.weeks.length + restoredIds.phases.length;

  const originalDate = original.createdAt.toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const targetDesc = original.targetLabel
    ? `"${original.targetLabel}"`
    : scopeLabel(original.scope);

  const changeSummary = `Restored ${targetDesc} to its state from ${originalDate}. ${itemCount} item${itemCount !== 1 ? "s" : ""} reverted. The prior change (${original.changeSummary.slice(0, 80)}${original.changeSummary.length > 80 ? "…" : ""}) has been undone.`;

  // 5. Create a new change log entry for the restore action (includes verification result)
  const newChangeLogId = await createChangeLogEntry({
    userId,
    trainingSystemId,
    source: "restore",
    intent: "restore",
    scope: original.scope as any,
    changeSummary,
    isMajorVersion: true,
    targetType: original.targetType ?? undefined,
    targetId: original.targetId ?? undefined,
    targetLabel: original.targetLabel ?? undefined,
    beforeSnapshot: currentSnapshot,
    afterSnapshot: original.beforeSnapshot,
    appliedCount: itemCount,
    skippedCount: 0,
    restoredFromId: changeId,
    decisionMetadata: {
      originalIntent: original.intent,
      originalScope: original.scope,
      restoredFromId: changeId,
      verification: {
        status: restoreVerification.status,
        verifiedCount: restoreVerification.verifiedCount,
        totalCount: restoreVerification.totalCount,
        summary: restoreVerification.summary,
      },
    },
  } as any);

  logger.info(
    { userId, changeId, newChangeLogId, restoredCount: itemCount, verificationStatus: restoreVerification.status },
    "Restore completed"
  );

  return {
    changeLogId: newChangeLogId,
    restoredCount: itemCount,
    changeSummary,
    changedIds: restoredIds,
    verificationStatus: restoreVerification.status,
  };
}

// ─── Apply a before snapshot to the DB ───────────────────────────────────────

async function applySnapshot(snapshot: SystemSnapshot): Promise<{
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}> {
  const restored = { exercises: [] as number[], sessions: [] as number[], weeks: [] as number[], phases: [] as number[] };

  // Restore exercises
  for (const [idStr, fields] of Object.entries(snapshot.exercises ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    try {
      await db
        .update(sessionExercises)
        .set({ ...fields, updatedAt: new Date() } as any)
        .where(eq(sessionExercises.id, id));
      restored.exercises.push(id);
    } catch (err) {
      logger.error({ err, id, fields }, "Failed to restore exercise");
    }
  }

  // Restore sessions
  for (const [idStr, fields] of Object.entries(snapshot.sessions ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    try {
      await db
        .update(trainingSessions)
        .set({ ...fields, updatedAt: new Date() } as any)
        .where(eq(trainingSessions.id, id));
      restored.sessions.push(id);
    } catch (err) {
      logger.error({ err, id, fields }, "Failed to restore session");
    }
  }

  // Restore weeks
  for (const [idStr, fields] of Object.entries(snapshot.weeks ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    try {
      await db
        .update(trainingWeeks)
        .set({ ...fields, updatedAt: new Date() } as any)
        .where(eq(trainingWeeks.id, id));
      restored.weeks.push(id);
    } catch (err) {
      logger.error({ err, id, fields }, "Failed to restore week");
    }
  }

  // Restore phases
  for (const [idStr, fields] of Object.entries(snapshot.phases ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    try {
      await db
        .update(trainingPhases)
        .set({ ...fields, updatedAt: new Date() } as any)
        .where(eq(trainingPhases.id, id));
      restored.phases.push(id);
    } catch (err) {
      logger.error({ err, id, fields }, "Failed to restore phase");
    }
  }

  return restored;
}

// ─── Capture current state for the given entity IDs ──────────────────────────
// We re-use the before snapshot's entity IDs to know what to capture.

async function captureCurrentState(originalBefore: SystemSnapshot): Promise<SystemSnapshot> {
  const current: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };

  for (const idStr of Object.keys(originalBefore.exercises ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    const [row] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, id)).limit(1);
    if (row) {
      current.exercises[idStr] = {
        name: row.name, category: row.category, sets: row.sets, reps: row.reps,
        tempo: row.tempo, rest: row.rest, rpe: row.rpe, notes: row.notes,
      };
    }
  }

  for (const idStr of Object.keys(originalBefore.sessions ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    const [row] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).limit(1);
    if (row) {
      current.sessions[idStr] = {
        label: row.label, sessionType: row.sessionType, emphasis: row.emphasis,
        warmupNotes: row.warmupNotes, coachingNotes: row.coachingNotes, isRestDay: row.isRestDay,
      };
    }
  }

  for (const idStr of Object.keys(originalBefore.weeks ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    const [row] = await db.select().from(trainingWeeks).where(eq(trainingWeeks.id, id)).limit(1);
    if (row) {
      current.weeks[idStr] = {
        label: row.label, focus: row.focus, volumeLevel: row.volumeLevel, notes: row.notes,
      };
    }
  }

  for (const idStr of Object.keys(originalBefore.phases ?? {})) {
    const id = Number(idStr);
    if (!id) continue;
    const [row] = await db.select().from(trainingPhases).where(eq(trainingPhases.id, id)).limit(1);
    if (row) {
      current.phases[idStr] = {
        name: row.name, goal: row.goal, emphasis: row.emphasis, notes: row.notes,
      };
    }
  }

  return current;
}

function scopeLabel(scope: string): string {
  const map: Record<string, string> = {
    exercise: "the exercise",
    session: "the session",
    week: "the week",
    block: "the block",
    system: "the program",
  };
  return map[scope] ?? "the item";
}
