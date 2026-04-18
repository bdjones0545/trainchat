/**
 * Edit Engine — Phase 2 + Phase 3 + Phase 4
 *
 * Applies a structured EditPlan to the training system database.
 * Operations are targeted: only the specified IDs and fields are modified.
 *
 * Phase 3: Returns changedIds for frontend change highlighting.
 * Phase 4: Captures before/after snapshots for every change — used by
 *          change-log-service to enable full restore capability.
 *
 * Family Propagation: when an exercise-level change (replace or update) is
 * applied and trainingSystemId is provided, the same change is automatically
 * propagated to all other occurrences of the same exercise name in upcoming
 * and current weeks within the same training system. This keeps the program
 * consistent across weeks when a user adjusts an exercise.
 */

import { db } from "@workspace/db";
import {
  sessionExercises,
  trainingSessions,
  trainingWeeks,
  trainingPhases,
} from "@workspace/db";
import { eq, and, inArray, ne } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan, EditChange } from "./edit-intent-service";
import type { SystemSnapshot } from "./change-log-service";
import { verifyMutation, type MutationVerificationResult } from "./mutation-verifier";
import {
  ensureSessionIdentityUpdated,
  buildIdentityUpdateSummary,
  type PatchedIdentityResult,
} from "./session-identity-sync";

// ─── Allowed field allowlists (safety guard) ─────────────────────────────────

const EXERCISE_ALLOWED_FIELDS = new Set([
  "name", "category", "sets", "reps", "tempo", "rest", "rpe", "notes", "orderIndex",
  // metadata is handled separately via extractPrescriptionUpdates
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

/**
 * Extracts `__prescription_*` special keys from an updates object.
 * These keys signal that the value should be merged into `metadata.prescription`
 * rather than a top-level column.
 *
 * Returns { prescriptionPatch, remainingUpdates }
 */
function extractPrescriptionUpdates(updates: Record<string, unknown>): {
  prescriptionPatch: Record<string, unknown> | null;
  remainingUpdates: Record<string, unknown>;
} {
  const patch: Record<string, unknown> = {};
  const remaining: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (key.startsWith("__prescription_")) {
      const fieldName = key.slice("__prescription_".length);
      patch[fieldName] = value;
    } else {
      remaining[key] = value;
    }
  }

  return {
    prescriptionPatch: Object.keys(patch).length > 0 ? patch : null,
    remainingUpdates: remaining,
  };
}

// ─── Snapshot capture helpers ─────────────────────────────────────────────────

async function snapshotExercise(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, id)).limit(1);
  if (!row) return null;
  const meta = row.metadata as Record<string, unknown> | null;
  const prescription = meta?.prescription as Record<string, unknown> | undefined;
  return {
    name: row.name, category: row.category, sets: row.sets, reps: row.reps,
    tempo: row.tempo, rest: row.rest, rpe: row.rpe, notes: row.notes, orderIndex: row.orderIndex,
    // Include structured prescription fields for clean diffs
    ...(prescription ? { prescriptionLoad: prescription.load, prescriptionHeight: prescription.height, prescriptionDistance: prescription.distance } : {}),
  };
}

async function snapshotSession(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).limit(1);
  if (!row) return null;
  return {
    label: row.label, sessionType: row.sessionType, emphasis: row.emphasis,
    warmupNotes: row.warmupNotes, coachingNotes: row.coachingNotes, isRestDay: row.isRestDay, dayOfWeek: row.dayOfWeek,
  };
}

async function snapshotWeek(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingWeeks).where(eq(trainingWeeks.id, id)).limit(1);
  if (!row) return null;
  return {
    label: row.label, focus: row.focus, volumeLevel: row.volumeLevel, notes: row.notes, status: row.status,
  };
}

async function snapshotPhase(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingPhases).where(eq(trainingPhases.id, id)).limit(1);
  if (!row) return null;
  return {
    name: row.name, goal: row.goal, emphasis: row.emphasis, notes: row.notes, status: row.status,
  };
}

// ─── Apply a single change ────────────────────────────────────────────────────

async function applyChange(change: EditChange): Promise<{ applied: boolean; detail: string; newId?: number }> {
  try {
    switch (change.type) {
      case "add_exercise": {
        if (!change.sessionId || !change.exercise?.name) {
          return { applied: false, detail: `add_exercise missing sessionId or exercise.name` };
        }

        // Determine the next orderIndex for this session
        const existing = await db
          .select({ orderIndex: sessionExercises.orderIndex })
          .from(sessionExercises)
          .where(eq(sessionExercises.trainingSessionId, change.sessionId));
        const maxOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex ?? 0), 0);

        const [inserted] = await db
          .insert(sessionExercises)
          .values({
            trainingSessionId: change.sessionId,
            name: change.exercise.name,
            category: (change.exercise.category as any) ?? "accessory",
            sets: change.exercise.sets ?? 3,
            reps: change.exercise.reps ?? "8-10",
            rest: change.exercise.rest ?? "90s",
            tempo: change.exercise.tempo ?? null,
            notes: change.exercise.notes ?? null,
            orderIndex: maxOrder + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: sessionExercises.id });

        if (!inserted) {
          return { applied: false, detail: `Failed to insert exercise into session ${change.sessionId}` };
        }

        return { applied: true, detail: `Added "${change.exercise.name}" to session ${change.sessionId} (new id:${inserted.id})`, newId: inserted.id };
      }

      case "update_exercise": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for exercise ${change.id}` };
        }

        // Handle INCREMENT/DECREMENT sentinels for sets
        const updatesWithSentinel = { ...change.updates };
        if (updatesWithSentinel.sets === "INCREMENT" || updatesWithSentinel.sets === "DECREMENT") {
          const [existing] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, change.id));
          if (existing) {
            const currentSets = existing.sets ?? 3;
            updatesWithSentinel.sets = updatesWithSentinel.sets === "INCREMENT"
              ? Math.min(currentSets + 1, 6)
              : Math.max(currentSets - 1, 1);
          }
        }

        // Extract __prescription_* keys for metadata merge
        const { prescriptionPatch, remainingUpdates } = extractPrescriptionUpdates(updatesWithSentinel);

        const safeUpdates = filterFields(remainingUpdates, EXERCISE_ALLOWED_FIELDS);

        // If there are prescription metadata updates, merge them into metadata.prescription
        if (prescriptionPatch) {
          const [existing] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, change.id));
          if (existing) {
            const currentMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
            const currentPrescription = (currentMeta.prescription as Record<string, unknown> | null) ?? {};
            const mergedMeta = {
              ...currentMeta,
              prescription: { ...currentPrescription, ...prescriptionPatch },
            };
            (safeUpdates as any).metadata = mergedMeta;
          }
        }

        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in exercise update for ${change.id}` };
        }
        await db
          .update(sessionExercises)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(sessionExercises.id, change.id));
        const appliedFields = [
          ...Object.keys(filterFields(remainingUpdates, EXERCISE_ALLOWED_FIELDS)),
          ...(prescriptionPatch ? Object.keys(prescriptionPatch).map((k) => `prescription.${k}`) : []),
        ];
        return { applied: true, detail: `Updated exercise ${change.id}: ${appliedFields.join(", ")}` };
      }

      case "replace_exercise": {
        if (!change.replacement) {
          return { applied: false, detail: `No replacement data for exercise ${change.id}` };
        }

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

// ─── Changed IDs Extraction ───────────────────────────────────────────────────

export interface ChangedIds {
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}

function extractChangedIds(plan: EditPlan, newExerciseIds: number[] = []): ChangedIds {
  const exercises: number[] = [...newExerciseIds];
  const sessions: number[] = [];
  const weeks: number[] = [];
  const phases: number[] = [];

  for (const change of plan.changes) {
    switch (change.type) {
      case "add_exercise":
        if (change.sessionId) sessions.push(change.sessionId);
        break;
      case "update_exercise":
      case "replace_exercise":
      case "delete_exercise":
        exercises.push(change.id);
        break;
      case "update_session":
        sessions.push(change.id);
        break;
      case "update_week":
        weeks.push(change.id);
        break;
      case "update_phase":
        phases.push(change.id);
        break;
    }
  }

  return { exercises, sessions, weeks, phases };
}

// ─── Snapshot capture for entire plan ────────────────────────────────────────

async function captureBeforeSnapshot(plan: EditPlan): Promise<SystemSnapshot> {
  const snapshot: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };

  for (const change of plan.changes) {
    switch (change.type) {
      case "add_exercise":
        // Nothing exists before the insert — no before snapshot needed
        break;
      case "update_exercise":
      case "replace_exercise":
      case "delete_exercise": {
        const s = await snapshotExercise(change.id);
        if (s) snapshot.exercises[String(change.id)] = s;
        break;
      }
      case "update_session": {
        const s = await snapshotSession(change.id);
        if (s) snapshot.sessions[String(change.id)] = s;
        break;
      }
      case "update_week": {
        const s = await snapshotWeek(change.id);
        if (s) snapshot.weeks[String(change.id)] = s;
        break;
      }
      case "update_phase": {
        const s = await snapshotPhase(change.id);
        if (s) snapshot.phases[String(change.id)] = s;
        break;
      }
    }
  }

  return snapshot;
}

async function captureAfterSnapshot(changedIds: ChangedIds): Promise<SystemSnapshot> {
  const snapshot: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };

  for (const id of changedIds.exercises) {
    const s = await snapshotExercise(id);
    if (s) snapshot.exercises[String(id)] = s;
  }
  for (const id of changedIds.sessions) {
    const s = await snapshotSession(id);
    if (s) snapshot.sessions[String(id)] = s;
  }
  for (const id of changedIds.weeks) {
    const s = await snapshotWeek(id);
    if (s) snapshot.weeks[String(id)] = s;
  }
  for (const id of changedIds.phases) {
    const s = await snapshotPhase(id);
    if (s) snapshot.phases[String(id)] = s;
  }

  return snapshot;
}

// ─── Family Propagation ────────────────────────────────────────────────────────
//
// When a user changes an exercise at the exercise level, that same exercise
// almost always appears in multiple weeks of the program. Without propagation,
// only the targeted instance changes — leaving the program inconsistent.
//
// This function finds all sibling exercise rows (same name, same training system,
// upcoming/current weeks, not the original row) and applies the same mutation.
// "Same session slot" is determined by matching the session label — this ensures
// we don't propagate a change on "Lower Power" exercises into an "Upper Strength"
// session that happens to contain the same exercise name.
//
// NOT every change warrants propagation. The gate below ensures only structural,
// program-wide changes (swaps, regressions, progressions, injury modifications)
// propagate. One-off tweaks (note edits, single set adjustments) stay local.

/**
 * Determines whether a specific change within a plan should propagate to sibling
 * exercise instances in future weeks.
 *
 * Gate rules:
 *  - replace_exercise → ALWAYS propagate (exercise itself changed)
 *  - update_exercise, notes-only → NEVER propagate (personal cue)
 *  - update_exercise, sets INCREMENT/DECREMENT → NEVER propagate (one-off volume)
 *  - update_exercise with intent matching progression/injury family → propagate
 *  - update_exercise with intent matching one-off tweaks → don't propagate
 *  - all other update_exercise → don't propagate (default safe)
 */
function shouldPropagateChange(planIntent: string, change: EditChange): boolean {
  if (change.type === "replace_exercise") {
    return true;
  }

  if (change.type !== "update_exercise") {
    return false;
  }

  const updates = change.updates ?? {};
  const updateKeys = Object.keys(updates).filter((k) => !k.startsWith("__prescription_"));

  // Notes-only → personal cue, stays local
  if (updateKeys.length === 1 && updateKeys[0] === "notes") {
    return false;
  }

  // Sets INCREMENT/DECREMENT → one-off volume adjustment, stays local
  if (
    updateKeys.length === 1 &&
    updateKeys[0] === "sets" &&
    (updates.sets === "INCREMENT" || updates.sets === "DECREMENT")
  ) {
    return false;
  }

  const propagatableIntents = new Set([
    "easier_variation",
    "harder_variation",
    "injury_modification",
    "joint_friendly_modification",
    "add_explosive_emphasis",
    "shoulder_modification",
    "swap_exercise",
    "exercise_swap",
  ]);

  const localOnlyIntents = new Set([
    "increase_sets",
    "reduce_sets",
    "exercise_note",
    "change_rep_range",
  ]);

  if (localOnlyIntents.has(planIntent)) return false;
  if (propagatableIntents.has(planIntent)) return true;

  return false;
}

interface PropagationResult {
  propagatedIds: number[];
  propagatedCount: number;
  skippedCount: number;
}

async function propagateExerciseChangeAcrossWeeks(
  originalExerciseId: number,
  exerciseName: string,
  trainingSystemId: number,
  applyFn: (siblingId: number) => Promise<{ applied: boolean; detail: string }>
): Promise<PropagationResult> {
  try {
    // 1. Resolve the source exercise's session and week
    const [sourceEx] = await db
      .select({
        sessionId: sessionExercises.trainingSessionId,
      })
      .from(sessionExercises)
      .where(eq(sessionExercises.id, originalExerciseId))
      .limit(1);

    if (!sourceEx) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 2. Get source session label
    const [sourceSession] = await db
      .select({ label: trainingSessions.label, weekId: trainingSessions.trainingWeekId })
      .from(trainingSessions)
      .where(eq(trainingSessions.id, sourceEx.sessionId))
      .limit(1);

    if (!sourceSession) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 3. Get source week's weekNumber to only propagate to future weeks
    const [sourceWeek] = await db
      .select({ weekNumber: trainingWeeks.weekNumber, phaseId: trainingWeeks.trainingPhaseId })
      .from(trainingWeeks)
      .where(eq(trainingWeeks.id, sourceSession.weekId))
      .limit(1);

    if (!sourceWeek) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 4. Find all phases in this training system
    const phases = await db
      .select({ id: trainingPhases.id })
      .from(trainingPhases)
      .where(eq(trainingPhases.trainingSystemId, trainingSystemId));

    if (phases.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    const phaseIds = phases.map((p) => p.id);

    // 5. Find all upcoming/current weeks with a higher weekNumber (future weeks)
    const futureWeeks = await db
      .select({ id: trainingWeeks.id, weekNumber: trainingWeeks.weekNumber, status: trainingWeeks.status })
      .from(trainingWeeks)
      .where(
        and(
          inArray(trainingWeeks.trainingPhaseId, phaseIds),
          ne(trainingWeeks.id, sourceSession.weekId)
        )
      );

    // Only propagate to upcoming or current weeks (not completed)
    const eligibleWeekIds = futureWeeks
      .filter((w) => w.status !== "completed" && w.weekNumber > sourceWeek.weekNumber)
      .map((w) => w.id);

    if (eligibleWeekIds.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 6. Find all sessions in those weeks with the same label as the source session
    const targetSessions = await db
      .select({ id: trainingSessions.id, label: trainingSessions.label })
      .from(trainingSessions)
      .where(
        and(
          inArray(trainingSessions.trainingWeekId, eligibleWeekIds),
          eq(trainingSessions.label, sourceSession.label)
        )
      );

    if (targetSessions.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    const targetSessionIds = targetSessions.map((s) => s.id);

    // 7. Find all exercise rows with the same name in those sessions (excluding original)
    const siblingExercises = await db
      .select({ id: sessionExercises.id })
      .from(sessionExercises)
      .where(
        and(
          inArray(sessionExercises.trainingSessionId, targetSessionIds),
          eq(sessionExercises.name, exerciseName),
          ne(sessionExercises.id, originalExerciseId)
        )
      );

    if (siblingExercises.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 8. Apply the change to each sibling
    const propagatedIds: number[] = [];
    let propagatedCount = 0;
    let skippedCount = 0;

    for (const sibling of siblingExercises) {
      const result = await applyFn(sibling.id);
      if (result.applied) {
        propagatedIds.push(sibling.id);
        propagatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { propagatedIds, propagatedCount, skippedCount };
  } catch (err) {
    logger.error({ err, originalExerciseId, exerciseName, trainingSystemId }, "[EditEngine] Family propagation threw — skipping propagation");
    return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export interface ChangeTarget {
  type: "exercise_swap" | "exercise_update" | "exercise_added";
  originalExercise?: string;
  newExercise: string;
  exerciseId: number;
  /** Human-readable description of what specifically changed, e.g. "tempo: → 3-1-X-0" */
  changeDetail?: string;
}

export interface EditResult {
  appliedCount: number;
  skippedCount: number;
  changeSummary: string;
  details: string[];
  changedIds: ChangedIds;
  beforeSnapshot: SystemSnapshot;
  afterSnapshot: SystemSnapshot;
  changeTargets: ChangeTarget[];
  /** Phase 2: Post-mutation verification result */
  verification: MutationVerificationResult;
  /** Sessions whose label/emphasis were auto-patched by the identity sync guard */
  identityPatches: PatchedIdentityResult[];
}

export async function applyEditPlan(plan: EditPlan, intentFamily?: string, trainingSystemId?: number): Promise<EditResult> {
  // Phase 4: Capture state BEFORE applying changes
  const beforeSnapshot = await captureBeforeSnapshot(plan);

  const results: { applied: boolean; detail: string; newId?: number }[] = [];
  for (const change of plan.changes) {
    const result = await applyChange(change);
    results.push(result);
    logger.info({ applied: result.applied, detail: result.detail, changeType: change.type, id: change.id }, "Edit change processed");
  }

  const appliedCount = results.filter((r) => r.applied).length;
  const skippedCount = results.filter((r) => !r.applied).length;

  // Collect IDs for exercises inserted via add_exercise so they appear in changedIds
  const newExerciseIds = results.flatMap((r) => (r.newId ? [r.newId] : []));
  const changedIds = extractChangedIds(plan, newExerciseIds);

  // ── Family Propagation ────────────────────────────────────────────────────
  // For exercise-level replace or update changes, propagate to all sibling
  // occurrences of the same exercise name in upcoming/current weeks of the same
  // training system. This keeps the program consistent after a targeted change.
  let totalPropagated = 0;
  if (trainingSystemId) {
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      const thisResult = results[i];
      if (!thisResult.applied) continue;

      // Smart gate: only propagate structural / program-wide changes
      if (!shouldPropagateChange(plan.intent, change)) {
        logger.info(
          { intent: plan.intent, changeType: change.type, changeId: change.id },
          "[EditEngine] Propagation skipped — change is local/minor"
        );
        continue;
      }

      if (change.type === "replace_exercise") {
        const before = beforeSnapshot.exercises[String(change.id)];
        const originalName = before?.name as string | undefined;
        if (originalName && change.replacement?.name) {
          const replacementName = change.replacement.name;
          const propagation = await propagateExerciseChangeAcrossWeeks(
            change.id,
            originalName,
            trainingSystemId,
            async (siblingId) => {
              return applyChange({
                ...change,
                id: siblingId,
                replacement: change.replacement,
              });
            }
          );
          if (propagation.propagatedCount > 0) {
            changedIds.exercises.push(...propagation.propagatedIds);
            totalPropagated += propagation.propagatedCount;
            logger.info(
              { originalName, replacementName, propagatedCount: propagation.propagatedCount, trainingSystemId },
              "[EditEngine] Propagated exercise replacement to sibling weeks"
            );
          }
        }
      } else if (change.type === "update_exercise") {
        const before = beforeSnapshot.exercises[String(change.id)];
        const exerciseName = before?.name as string | undefined;
        if (exerciseName) {
          const propagation = await propagateExerciseChangeAcrossWeeks(
            change.id,
            exerciseName,
            trainingSystemId,
            async (siblingId) => {
              return applyChange({
                ...change,
                id: siblingId,
              });
            }
          );
          if (propagation.propagatedCount > 0) {
            changedIds.exercises.push(...propagation.propagatedIds);
            totalPropagated += propagation.propagatedCount;
            logger.info(
              { exerciseName, propagatedCount: propagation.propagatedCount, trainingSystemId },
              "[EditEngine] Propagated exercise update to sibling weeks"
            );
          }
        }
      }
    }
  }

  // ── Session Identity Sync (post-mutation guard) ────────────────────────────
  // If the AI's EditPlan made structural changes for an identity-changing
  // transformation but did NOT include an update_session with new label/emphasis,
  // deterministically patch the session identity now using the template matrix.
  const identityPatches = await ensureSessionIdentityUpdated(plan, intentFamily);
  if (identityPatches.length > 0) {
    // Add auto-patched sessions to changedIds so they appear in the after snapshot
    for (const patch of identityPatches) {
      if (!changedIds.sessions.includes(patch.sessionId)) {
        changedIds.sessions.push(patch.sessionId);
      }
    }
    logger.info(
      {
        count: identityPatches.length,
        patches: identityPatches.map((p) => ({
          sessionId: p.sessionId,
          region: p.inferredRegion,
          family: p.intentFamily,
          newLabel: p.newLabel,
        })),
      },
      "[EditEngine] Session identity auto-synced after mutation",
    );
  }

  // Phase 4: Capture state AFTER applying changes
  const afterSnapshot = await captureAfterSnapshot(changedIds);

  // Phase 2: Verify that the intended changes are actually present in the post-mutation state
  const verification = verifyMutation(plan, beforeSnapshot, afterSnapshot, results);
  logger.info(
    { status: verification.status, verified: verification.verifiedChanges.length, missing: verification.missingChanges.length, requiresReview: verification.requiresReview ?? false, intent: plan.intent },
    "[MutationVerifier] Verification complete"
  );

  // Build change targets for frontend highlighting
  const changeTargets: ChangeTarget[] = [];
  for (const change of plan.changes) {
    if (change.type === "replace_exercise") {
      const before = beforeSnapshot.exercises[String(change.id)];
      const after = afterSnapshot.exercises[String(change.id)];
      if (before?.name && after?.name) {
        changeTargets.push({
          type: "exercise_swap",
          originalExercise: before.name as string,
          newExercise: after.name as string,
          exerciseId: change.id,
        });
      }
    } else if (change.type === "update_exercise") {
      const before = beforeSnapshot.exercises[String(change.id)];
      const after = afterSnapshot.exercises[String(change.id)];
      if (after?.name) {
        // Build a specific change detail string from before/after diff
        const changeDetails: string[] = [];
        if (after.tempo && after.tempo !== before?.tempo) {
          changeDetails.push(`tempo → ${after.tempo}`);
        }
        if (after.reps && after.reps !== before?.reps) {
          changeDetails.push(`reps: ${before?.reps ?? "?"} → ${after.reps}`);
        }
        if (after.sets !== undefined && after.sets !== before?.sets) {
          changeDetails.push(`sets: ${before?.sets ?? "?"} → ${after.sets}`);
        }
        if (after.rest && after.rest !== before?.rest) {
          changeDetails.push(`rest: ${before?.rest ?? "?"} → ${after.rest}`);
        }
        changeTargets.push({
          type: "exercise_update",
          originalExercise: before?.name as string | undefined,
          newExercise: after.name as string,
          exerciseId: change.id,
          changeDetail: changeDetails.length > 0 ? changeDetails.join(", ") : undefined,
        });
      }
    }
  }
  // Include newly added exercises
  for (const result of results) {
    if (result.applied && result.newId) {
      const after = afterSnapshot.exercises[String(result.newId)];
      if (after?.name) {
        changeTargets.push({
          type: "exercise_added",
          newExercise: after.name as string,
          exerciseId: result.newId,
        });
      }
    }
  }

  // ── Augment changeSummary with identity update notes and propagation note ─
  const identitySuffix = buildIdentityUpdateSummary(identityPatches);
  const propagationSuffix = totalPropagated > 0
    ? ` Applied to ${totalPropagated} additional week${totalPropagated !== 1 ? "s" : ""} across the program.`
    : "";
  const finalChangeSummary = (plan.changeSummary + identitySuffix + propagationSuffix).trim();

  return {
    appliedCount,
    skippedCount,
    changeSummary: finalChangeSummary,
    details: results.map((r) => r.detail),
    changedIds,
    beforeSnapshot,
    afterSnapshot,
    changeTargets,
    verification,
    identityPatches,
  };
}
