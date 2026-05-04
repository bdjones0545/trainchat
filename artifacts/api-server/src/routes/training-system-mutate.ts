/**
 * Live Program Mutate Route — Right-Sidebar Direct Mutations
 *
 * POST /api/training-system/mutate
 *   Dedicated endpoint for sidebar-sourced program mutations (Add Exercise,
 *   Remove Exercise) that bypass the chat stream entirely.
 *
 *   Callers: right-sidebar session pills ("Add Exercise") and exercise card
 *   remove buttons in LiveProgramPanel.
 *
 *   Response contract:
 *     { success, verified, operation, sessionId, exerciseName,
 *       updatedSession, receipt, message }
 *
 *   This endpoint never creates chat messages and never emits chat failure
 *   bubbles — all feedback is returned in the structured response for the
 *   panel to render as a local toast.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import {
  sessionExercises,
  trainingSessions,
  trainingWeeks,
  trainingPhases,
  trainingSystems,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { getActiveTrainingSystem } from "../lib/training-system-service";
import { applyEditPlan } from "../lib/edit-engine";
import { autoFillExerciseName } from "../lib/architect-patch-generator";
import type { EditPlan } from "../lib/edit-intent-service";
import {
  buildMutationSuccessReceipt,
  buildMutationFailureReceipt,
} from "../lib/architect-patch-generator";

const router: IRouter = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────

const MutateRequestBody = z.object({
  mutationSource: z.enum(["live_program_panel", "exercise_card_button", "quick_action_chip"]),
  operation: z.enum(["add_exercise", "remove_exercise"]),
  /** 0-indexed position of the session within the current week (ordered by orderIndex) */
  dayIndex: z.number().int().min(0).optional(),
  /** DB exercise ID — required for remove_exercise */
  exerciseId: z.number().int().positive().optional(),
  focusMode: z.enum(["strength", "speed", "mobility"]).optional(),
  /** Optional plain-text hint to guide exercise selection */
  intentText: z.string().max(200).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Re-reads a session with its exercises from DB after a mutation. */
async function readSessionWithExercises(sessionId: number) {
  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const exercises = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.trainingSessionId, sessionId))
    .orderBy(asc(sessionExercises.orderIndex));

  return {
    id: session.id,
    label: session.label ?? null,
    sessionType: session.sessionType ?? null,
    emphasis: session.emphasis ?? null,
    dayOfWeek: session.dayOfWeek ?? null,
    exercises: exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets ?? 3,
      reps: ex.reps ?? "8-10",
      rest: ex.rest ?? "90s",
      category: ex.category ?? null,
      notes: ex.notes ?? null,
      orderIndex: ex.orderIndex ?? 0,
    })),
  };
}

/**
 * Verifies that an exerciseId belongs to the authenticated user's active system
 * and returns the trainingSessionId it lives in.
 */
async function verifyExerciseOwnership(
  exerciseId: number,
  userId: number,
  focusMode?: string | null,
): Promise<{ sessionId: number; name: string } | null> {
  const [ex] = await db
    .select({
      id: sessionExercises.id,
      name: sessionExercises.name,
      trainingSessionId: sessionExercises.trainingSessionId,
    })
    .from(sessionExercises)
    .where(eq(sessionExercises.id, exerciseId))
    .limit(1);

  if (!ex) return null;

  // Walk up: session → week → phase → system → user
  const [session] = await db
    .select({ id: trainingSessions.id, trainingWeekId: trainingSessions.trainingWeekId })
    .from(trainingSessions)
    .where(eq(trainingSessions.id, ex.trainingSessionId))
    .limit(1);
  if (!session) return null;

  const [week] = await db
    .select({ id: trainingWeeks.id, trainingPhaseId: trainingWeeks.trainingPhaseId })
    .from(trainingWeeks)
    .where(eq(trainingWeeks.id, session.trainingWeekId))
    .limit(1);
  if (!week) return null;

  const [phase] = await db
    .select({ id: trainingPhases.id, trainingSystemId: trainingPhases.trainingSystemId })
    .from(trainingPhases)
    .where(eq(trainingPhases.id, week.trainingPhaseId))
    .limit(1);
  if (!phase) return null;

  const [system] = await db
    .select({ id: trainingSystems.id, userId: trainingSystems.userId })
    .from(trainingSystems)
    .where(eq(trainingSystems.id, phase.trainingSystemId))
    .limit(1);
  if (!system || system.userId !== userId) return null;

  return { sessionId: ex.trainingSessionId, name: ex.name };
}

// ─── POST /api/training-system/mutate ────────────────────────────────────────

router.post("/training-system/mutate", requireAuth, async (req, res): Promise<void> => {
  const parsed = MutateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body.", issues: parsed.error.issues });
    return;
  }

  const userId = req.session.userId!;
  const { mutationSource, operation, dayIndex, exerciseId, focusMode, intentText } = parsed.data;

  logger.info(
    { userId, mutationSource, operation, dayIndex, exerciseId, focusMode },
    "[LiveProgramMutate:Received] Sidebar direct mutation request"
  );

  try {
    // ── ADD EXERCISE ──────────────────────────────────────────────────────────
    if (operation === "add_exercise") {
      if (dayIndex === undefined) {
        res.status(400).json({ error: "dayIndex is required for add_exercise." });
        return;
      }

      // 1. Resolve the active training system
      const activeSystem = await getActiveTrainingSystem(userId, focusMode ?? null);
      if (!activeSystem) {
        res.status(404).json({ error: "No active training system found." });
        return;
      }

      // Focus mismatch guard
      if (focusMode) {
        const systemFocus = ((activeSystem.metadata as any)?.focusMode ?? "strength") as string;
        if (systemFocus !== focusMode) {
          logger.error(
            { userId, focusMode, systemFocus, systemId: activeSystem.id },
            "[LiveProgramMutate:FocusMismatch] Rejected — would mutate wrong focus lane"
          );
          res.status(409).json({
            error: `Focus mismatch: requested '${focusMode}' but active system is '${systemFocus}'.`,
          });
          return;
        }
      }

      // 2. Get current week + sessions
      if (!activeSystem.currentPhaseId) {
        res.status(404).json({ error: "No active phase found in training system." });
        return;
      }

      const [currentPhase] = await db
        .select()
        .from(trainingPhases)
        .where(
          and(
            eq(trainingPhases.id, activeSystem.currentPhaseId),
            eq(trainingPhases.status, "current"),
          )
        )
        .limit(1);

      if (!currentPhase) {
        res.status(404).json({ error: "No current phase found." });
        return;
      }

      const [currentWeek] = await db
        .select()
        .from(trainingWeeks)
        .where(
          and(
            eq(trainingWeeks.trainingPhaseId, currentPhase.id),
            eq(trainingWeeks.status, "current"),
          )
        )
        .limit(1);

      if (!currentWeek) {
        res.status(404).json({ error: "No current week found." });
        return;
      }

      // 3. Find the session at dayIndex (ordered by orderIndex)
      const sessions = await db
        .select()
        .from(trainingSessions)
        .where(eq(trainingSessions.trainingWeekId, currentWeek.id))
        .orderBy(asc(trainingSessions.orderIndex));

      const targetSession = sessions[dayIndex];
      if (!targetSession) {
        res.status(404).json({
          error: `No session found at dayIndex ${dayIndex}. Week has ${sessions.length} session(s).`,
        });
        return;
      }

      logger.info(
        {
          userId,
          sessionId: targetSession.id,
          sessionLabel: targetSession.label,
          dayIndex,
          systemId: activeSystem.id,
        },
        "[LiveProgramMutate:SessionResolved] Target session resolved"
      );

      // 4. Pick exercise name via autoFillExerciseName
      const { name: exerciseName, reason: fillReason } = autoFillExerciseName(
        targetSession.label,
        targetSession.sessionType,
        focusMode ?? null,
      );

      logger.info(
        { userId, exerciseName, fillReason, sessionLabel: targetSession.label },
        "[LiveProgramMutate:ExercisePicked] Auto-fill selected exercise"
      );

      // 5. Build EditPlan and call applyEditPlan
      const plan: EditPlan = {
        intent: "add_exercise",
        scope: "session",
        changeSummary: `Add ${exerciseName} to ${targetSession.label ?? `Day ${dayIndex + 1}`}`,
        changes: [
          {
            type: "add_exercise",
            id: targetSession.id,
            sessionId: targetSession.id,
            exercise: {
              name: exerciseName,
              category: "accessory",
              sets: 3,
              reps: "8-10",
              rest: "90s",
              notes: fillReason,
            },
            reason: `Added via right-sidebar (${mutationSource}). ${fillReason}`,
          },
        ],
        _debugRoute: {
          openaiCalled: false,
          openaiSucceeded: false,
          pathUsed: "deterministic",
        },
      };

      const editResult = await applyEditPlan(plan, "add_exercise", activeSystem.id);

      logger.info(
        {
          userId,
          sessionId: targetSession.id,
          appliedCount: editResult.appliedCount,
          skippedCount: editResult.skippedCount,
          verificationStatus: editResult.verification.status,
          changeSummary: editResult.changeSummary,
        },
        "[LiveProgramMutate:ApplyResult] applyEditPlan completed"
      );

      const success = editResult.appliedCount > 0;
      const verified = editResult.verification.status === "verified";

      // 6. Re-read updated session for immediate panel refresh
      const updatedSession = await readSessionWithExercises(targetSession.id);

      // 7. Build receipt
      const receipt = success
        ? buildMutationSuccessReceipt({
            action: "add_exercise",
            sessionId: targetSession.id,
            exerciseName,
            verified,
            sessionLabel: targetSession.label ?? `Day ${dayIndex + 1}`,
          })
        : buildMutationFailureReceipt(
            editResult.changeSummary ?? "Exercise was not applied.",
          );

      logger.info(
        {
          userId,
          success,
          verified,
          exerciseName,
          sessionId: targetSession.id,
          mutationSource,
          receiptSuccess: receipt.success,
        },
        "[LiveProgramMutate:Receipt] Mutation receipt built"
      );

      res.json({
        success,
        verified,
        operation: "add_exercise",
        sessionId: targetSession.id,
        exerciseName,
        updatedSession,
        receipt,
        message: success
          ? `Added ${exerciseName} to ${targetSession.label ?? `Day ${dayIndex + 1}`}.`
          : "Exercise could not be added — try again.",
      });
      return;
    }

    // ── REMOVE EXERCISE ───────────────────────────────────────────────────────
    if (operation === "remove_exercise") {
      if (!exerciseId) {
        res.status(400).json({ error: "exerciseId is required for remove_exercise." });
        return;
      }

      // 1. Verify ownership
      const ownership = await verifyExerciseOwnership(exerciseId, userId, focusMode ?? null);
      if (!ownership) {
        res.status(403).json({ error: "Exercise not found or does not belong to your active program." });
        return;
      }

      const { sessionId, name: exerciseName } = ownership;

      logger.info(
        { userId, exerciseId, exerciseName, sessionId, mutationSource },
        "[LiveProgramMutate:RemoveExercise] Removing exercise"
      );

      // 2. Delete the exercise row
      await db
        .delete(sessionExercises)
        .where(eq(sessionExercises.id, exerciseId));

      logger.info(
        { userId, exerciseId, exerciseName, sessionId },
        "[LiveProgramMutate:RemoveExercise:Deleted] Exercise row deleted"
      );

      // 3. Re-read updated session
      const updatedSession = await readSessionWithExercises(sessionId);

      // 4. Build receipt
      const receipt = buildMutationSuccessReceipt({
        action: "delete_exercise",
        sessionId,
        exerciseName,
        verified: true,
      });

      res.json({
        success: true,
        verified: true,
        operation: "remove_exercise",
        sessionId,
        exerciseName,
        updatedSession,
        receipt,
        message: `Removed ${exerciseName} from the session.`,
      });
      return;
    }

    // Should not reach here due to schema validation
    res.status(400).json({ error: "Unrecognised operation." });
  } catch (err) {
    logger.error(
      { err, userId, operation, mutationSource, dayIndex, exerciseId },
      "[LiveProgramMutate:Error] Unhandled error in sidebar mutation"
    );
    res.status(500).json({
      success: false,
      error: "Mutation failed due to an internal error.",
      message: "Something went wrong — nothing changed. Please try again.",
    });
  }
});

export default router;
