/**
 * Edit Engine — Phase 2
 *
 * Applies a structured EditPlan to the training system database.
 * Operations are targeted: only the specified IDs and fields are modified.
 * All other parts of the program remain untouched.
 */

import { db } from "@workspace/db";
import {
  sessionExercises,
  trainingSessions,
  trainingWeeks,
  trainingPhases,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan, EditChange } from "./edit-intent-service";

// ─── Allowed field allowlists (safety guard) ─────────────────────────────────

const EXERCISE_ALLOWED_FIELDS = new Set([
  "name", "category", "sets", "reps", "tempo", "rest", "rpe", "notes", "orderIndex",
]);

const SESSION_ALLOWED_FIELDS = new Set([
  "label", "sessionType", "emphasis", "warmupNotes", "cooldownNotes",
  "coachingNotes", "isRestDay", "dayOfWeek",
]);

const WEEK_ALLOWED_FIELDS = new Set([
  "label", "focus", "volumeLevel", "notes", "status",
]);

const PHASE_ALLOWED_FIELDS = new Set([
  "name", "goal", "emphasis", "notes", "status",
]);

function filterFields(updates: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  return filtered;
}

// ─── Apply a single change ────────────────────────────────────────────────────

async function applyChange(change: EditChange): Promise<{ applied: boolean; detail: string }> {
  try {
    switch (change.type) {
      case "update_exercise": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for exercise ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, EXERCISE_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in exercise update for ${change.id}` };
        }
        await db
          .update(sessionExercises)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(sessionExercises.id, change.id));
        return { applied: true, detail: `Updated exercise ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      case "replace_exercise": {
        if (!change.replacement) {
          return { applied: false, detail: `No replacement data for exercise ${change.id}` };
        }

        // Fetch existing exercise to preserve session linkage and order
        const [existing] = await db
          .select()
          .from(sessionExercises)
          .where(eq(sessionExercises.id, change.id));

        if (!existing) {
          return { applied: false, detail: `Exercise ${change.id} not found` };
        }

        const replacement = change.replacement;
        await db
          .update(sessionExercises)
          .set({
            name: replacement.name,
            category: (replacement.category as any) ?? existing.category,
            sets: replacement.sets ?? existing.sets,
            reps: replacement.reps ?? existing.reps,
            rest: replacement.rest ?? existing.rest,
            tempo: replacement.tempo ?? null,
            notes: replacement.notes ?? null,
            updatedAt: new Date(),
          })
          .where(eq(sessionExercises.id, change.id));

        return { applied: true, detail: `Replaced exercise ${change.id} with "${replacement.name}"` };
      }

      case "delete_exercise": {
        await db.delete(sessionExercises).where(eq(sessionExercises.id, change.id));
        return { applied: true, detail: `Deleted exercise ${change.id}` };
      }

      case "update_session": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for session ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, SESSION_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in session update for ${change.id}` };
        }
        await db
          .update(trainingSessions)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingSessions.id, change.id));
        return { applied: true, detail: `Updated session ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      case "update_week": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for week ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, WEEK_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in week update for ${change.id}` };
        }
        await db
          .update(trainingWeeks)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingWeeks.id, change.id));
        return { applied: true, detail: `Updated week ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      case "update_phase": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for phase ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, PHASE_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in phase update for ${change.id}` };
        }
        await db
          .update(trainingPhases)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingPhases.id, change.id));
        return { applied: true, detail: `Updated phase ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      default:
        return { applied: false, detail: `Unknown change type: ${(change as any).type}` };
    }
  } catch (err) {
    logger.error({ err, change }, "Failed to apply change");
    return { applied: false, detail: `Error applying change: ${String(err)}` };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export interface EditResult {
  appliedCount: number;
  skippedCount: number;
  changeSummary: string;
  details: string[];
}

export async function applyEditPlan(plan: EditPlan): Promise<EditResult> {
  const results: { applied: boolean; detail: string }[] = [];

  for (const change of plan.changes) {
    const result = await applyChange(change);
    results.push(result);
    logger.info({ applied: result.applied, detail: result.detail, changeType: change.type, id: change.id }, "Edit change processed");
  }

  const appliedCount = results.filter((r) => r.applied).length;
  const skippedCount = results.filter((r) => !r.applied).length;

  return {
    appliedCount,
    skippedCount,
    changeSummary: plan.changeSummary,
    details: results.map((r) => r.detail),
  };
}
