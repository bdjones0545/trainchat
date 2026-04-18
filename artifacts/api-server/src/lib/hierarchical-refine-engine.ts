/**
 * Hierarchical Refine Engine
 *
 * Applies week-scope or block-scope refinements to an existing training system.
 * This is the counterpart to the session-scope path (interpretEditRequest + applyEditPlan).
 *
 * Week scope:  mutates exercises in a single week's sessions (reps / rest / emphasis)
 * Block scope: rebuilds the block type, mutates ALL sessions, patches system metadata
 *
 * Returns a HierarchicalRefineResult that conversations.ts uses to build the
 * coaching response and persist the change log entry.
 */

import {
  db,
  sessionExercises,
  trainingSessions,
  trainingSystems,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

import { logger } from "./logger";
import { getFullTrainingSystem } from "./training-system-service";
import {
  buildMonthlyBlockPlanForType,
  type MonthlyBlockType,
  type SpecialPopBlockType,
} from "./monthly-block-planner";
import {
  resolveRefinementScope,
  type ScopeResolution,
  inferBlockTypeFromMessage,
  inferTransformationFromMessage,
} from "./refinement-scope-resolver";

type FullTrainingSystem = NonNullable<Awaited<ReturnType<typeof getFullTrainingSystem>>>;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HierarchicalRefineResult {
  applied: boolean;
  changeSummary: string;
  sessionCount: number;
  exerciseCount: number;
  scopeLabel: string;
  scopeResolution: ScopeResolution;
  failureReason?: string;
}

// ─── Transformation Mappings ──────────────────────────────────────────────────
// Maps a transformation type string to the (reps, rest) pair applied to each exercise.

interface ExercisePrescription {
  reps?: string;
  rest?: string;
}

function prescriptionForTransformation(type: string): ExercisePrescription {
  switch (type) {
    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
      return { rest: "30-60 sec" };

    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      return { reps: "3-5", rest: "2-3 min" };

    case "strength":
    case "strength_focus":
    case "increase_difficulty":
      return { reps: "3-6", rest: "2-4 min" };

    case "hypertrophy":
    case "hypertrophy_focus":
    case "increase_volume":
      return { reps: "8-12", rest: "60-90 sec" };

    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
    case "decrease_difficulty":
    case "decrease_volume":
      return { reps: "8-12", rest: "2-3 min" };

    case "reduce_time":
      return { rest: "30-45 sec" };

    default:
      return { rest: "90 sec" };
  }
}

// Maps transformation type → (session label suffix, emphasis text)

function sessionIdentityForTransformation(type: string): { label: string; emphasis: string } {
  switch (type) {
    case "power":
    case "power_explosive_focus":
    case "speed_focus":
      return { label: "Power & Explosive Strength", emphasis: "Rate of force development, contrast training" };

    case "strength":
    case "strength_focus":
    case "increase_difficulty":
      return { label: "Strength Development", emphasis: "Progressive overload, bilateral compound movements" };

    case "hypertrophy":
    case "hypertrophy_focus":
    case "increase_volume":
      return { label: "Hypertrophy & Volume", emphasis: "Mechanical tension, high time under tension" };

    case "endurance":
    case "endurance_focus":
    case "conditioning_focus":
      return { label: "Conditioning & Work Capacity", emphasis: "Energy system development, aerobic base" };

    case "recovery":
    case "recovery_focus":
    case "fatigue_management":
      return { label: "Active Recovery", emphasis: "Tissue quality, parasympathetic restoration" };

    case "reduce_time":
      return { label: "Efficiency Session", emphasis: "High density, minimal rest protocols" };

    default:
      return { label: "Training Session", emphasis: "General athletic development" };
  }
}

// Maps block type string to a base transformation type
function transformationForBlockType(blockType: string): string {
  const map: Record<string, string> = {
    power_conversion: "power",
    strength_emphasis: "strength",
    hypertrophy_support: "hypertrophy",
    work_capacity: "endurance",
    re_entry_resilience: "recovery",
    accumulation: "hypertrophy",
    intensification: "strength",
  };
  return map[blockType] ?? "recovery";
}

// ─── Week Scope ───────────────────────────────────────────────────────────────

async function applyWeekScope(
  systemId: number,
  fullSystem: FullTrainingSystem,
  resolution: ScopeResolution,
  userMessage: string,
): Promise<HierarchicalRefineResult> {
  const transformation =
    resolution.derivedTransformation ?? inferTransformationFromMessage(userMessage);

  // Identify target week(s)
  const targetWeekNumber = resolution.targetWeekNumber;
  const weeksToMutate = targetWeekNumber
    ? fullSystem.phases
        .flatMap((p) => p.weeks)
        .filter((w) => w.weekNumber === targetWeekNumber)
    : fullSystem.phases
        .flatMap((p) => p.weeks)
        .slice(-1); // default to most recent week if unspecified

  if (weeksToMutate.length === 0) {
    return {
      applied: false,
      changeSummary: "Could not find the target week in the current program.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "week",
      scopeResolution: resolution,
      failureReason: "target_week_not_found",
    };
  }

  const prescription = prescriptionForTransformation(transformation);
  const identity = sessionIdentityForTransformation(transformation);
  const weekLabel = targetWeekNumber ? `Week ${targetWeekNumber}` : "current week";

  let exerciseCount = 0;
  let sessionCount = 0;

  for (const week of weeksToMutate) {
    for (const session of week.sessions) {
      if (session.isRestDay) continue;

      // Update all exercises in this session
      const exerciseIds = session.exercises
        .map((e) => e.id)
        .filter((id): id is number => id != null);

      if (exerciseIds.length > 0) {
        await db
          .update(sessionExercises)
          .set({
            ...(prescription.reps !== undefined ? { reps: prescription.reps } : {}),
            ...(prescription.rest !== undefined ? { rest: prescription.rest } : {}),
          })
          .where(inArray(sessionExercises.id, exerciseIds));

        exerciseCount += exerciseIds.length;
      }

      // Update session label + emphasis
      await db
        .update(trainingSessions)
        .set({ label: identity.label, emphasis: identity.emphasis })
        .where(eq(trainingSessions.id, session.id));

      sessionCount++;
    }
  }

  const changeSummary = `${weekLabel} shifted to ${transformation} focus — updated ${sessionCount} session${sessionCount !== 1 ? "s" : ""} (${exerciseCount} exercise prescription${exerciseCount !== 1 ? "s" : ""} adjusted).`;

  logger.info(
    { systemId, transformation, weekLabel, sessionCount, exerciseCount },
    "[HierarchicalRefine] Week scope applied"
  );

  return {
    applied: true,
    changeSummary,
    sessionCount,
    exerciseCount,
    scopeLabel: weekLabel,
    scopeResolution: resolution,
  };
}

// ─── Block Scope ──────────────────────────────────────────────────────────────

async function applyBlockScope(
  systemId: number,
  fullSystem: FullTrainingSystem,
  resolution: ScopeResolution,
  userMessage: string,
): Promise<HierarchicalRefineResult> {
  // Determine new block type
  const rawBlockType =
    resolution.derivedTransformation ?? inferBlockTypeFromMessage(userMessage) ?? "re_entry_resilience";

  const blockType = rawBlockType as MonthlyBlockType | SpecialPopBlockType;

  // Derive the matching transformation for exercises
  const transformation = transformationForBlockType(rawBlockType);

  // Build the new monthly block plan for metadata
  const newBlockPlan = buildMonthlyBlockPlanForType(
    blockType,
    (fullSystem.system.metadata as any)?.sport ?? null,
    (fullSystem.system.metadata as any)?.goal ?? null,
  );

  const prescription = prescriptionForTransformation(transformation);
  const identity = sessionIdentityForTransformation(transformation);

  let exerciseCount = 0;
  let sessionCount = 0;

  // Apply to ALL sessions across ALL weeks
  for (const phase of fullSystem.phases) {
    for (const week of phase.weeks) {
      for (const session of week.sessions) {
        if (session.isRestDay) continue;

        const exerciseIds = session.exercises
          .map((e) => e.id)
          .filter((id): id is number => id != null);

        if (exerciseIds.length > 0) {
          await db
            .update(sessionExercises)
            .set({
              ...(prescription.reps !== undefined ? { reps: prescription.reps } : {}),
              ...(prescription.rest !== undefined ? { rest: prescription.rest } : {}),
            })
            .where(inArray(sessionExercises.id, exerciseIds));

          exerciseCount += exerciseIds.length;
        }

        await db
          .update(trainingSessions)
          .set({ label: identity.label, emphasis: identity.emphasis })
          .where(eq(trainingSessions.id, session.id));

        sessionCount++;
      }
    }
  }

  // Update system metadata with new block info
  const currentMetadata = (fullSystem.system.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = {
    ...currentMetadata,
    blockType: newBlockPlan.blockType,
    blockDisplayName: newBlockPlan.displayName,
    blockMission: newBlockPlan.missionStatement,
    primaryAdaptation: newBlockPlan.primaryAdaptation,
    blockUpdatedAt: new Date().toISOString(),
  };

  await db
    .update(trainingSystems)
    .set({ metadata: updatedMetadata })
    .where(eq(trainingSystems.id, systemId));

  const changeSummary = `Block shifted to **${newBlockPlan.displayName}** — ${newBlockPlan.primaryAdaptation.toLowerCase()}. Updated ${sessionCount} session${sessionCount !== 1 ? "s" : ""} (${exerciseCount} exercise prescription${exerciseCount !== 1 ? "s" : ""}) across the full program.`;

  logger.info(
    { systemId, blockType, transformation, sessionCount, exerciseCount, displayName: newBlockPlan.displayName },
    "[HierarchicalRefine] Block scope applied"
  );

  return {
    applied: true,
    changeSummary,
    sessionCount,
    exerciseCount,
    scopeLabel: `block (${newBlockPlan.displayName})`,
    scopeResolution: resolution,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Runs the hierarchical refinement engine for a given system + user message.
 *
 * The caller has already determined this is week_scope or block_scope via
 * resolveRefinementScope. Pass the resolution in to skip the re-classification.
 */
export async function applyHierarchicalRefinement(opts: {
  systemId: number;
  userId: string;
  userMessage: string;
  scopeResolution: ScopeResolution;
}): Promise<HierarchicalRefineResult> {
  const { systemId, userMessage, scopeResolution } = opts;

  // Load fresh system state
  const fullSystem = await getFullTrainingSystem(systemId);
  if (!fullSystem) {
    return {
      applied: false,
      changeSummary: "Could not load the current training system.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "unknown",
      scopeResolution,
      failureReason: "system_not_found",
    };
  }

  try {
    if (scopeResolution.scope === "week_scope") {
      return await applyWeekScope(systemId, fullSystem, scopeResolution, userMessage);
    }

    if (scopeResolution.scope === "block_scope") {
      return await applyBlockScope(systemId, fullSystem, scopeResolution, userMessage);
    }

    // Should never reach here — only call this for week or block scope
    return {
      applied: false,
      changeSummary: "Session scope requests are handled by the standard edit pipeline.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: "session",
      scopeResolution,
      failureReason: "wrong_scope",
    };
  } catch (err: any) {
    logger.error(
      { err: err?.message, stack: err?.stack, scope: scopeResolution.scope, systemId },
      "[HierarchicalRefine] Error applying refinement"
    );

    return {
      applied: false,
      changeSummary: "Something went wrong applying that change — your program is unchanged.",
      sessionCount: 0,
      exerciseCount: 0,
      scopeLabel: scopeResolution.scope,
      scopeResolution,
      failureReason: "engine_error",
    };
  }
}

/**
 * Convenience wrapper that also handles scope classification.
 * Use this when you don't have a pre-resolved scope.
 */
export async function applyHierarchicalRefinementWithClassification(opts: {
  systemId: number;
  userId: string;
  userMessage: string;
  currentWeekNumber?: number;
}): Promise<HierarchicalRefineResult & { scope: string }> {
  const resolution = resolveRefinementScope(opts.userMessage, {
    currentWeekNumber: opts.currentWeekNumber,
  });

  const result = await applyHierarchicalRefinement({
    systemId: opts.systemId,
    userId: opts.userId,
    userMessage: opts.userMessage,
    scopeResolution: resolution,
  });

  return { ...result, scope: resolution.scope };
}
