/**
 * Propagation Engine — Safe Later-Week Adjustment System
 *
 * When a user edits an exercise, this engine decides whether and how to apply
 * compatible changes to matching future weeks — without corrupting progression,
 * deleting user-specific tuning, or flattening block intent.
 *
 * Phases implemented:
 *  1. PropagationMode type + determinePropagationMode()
 *  2. findEligibleFutureMatches() — database-backed eligibility check
 *  3. assessPropagationSafety() — safety scoring
 *  4. applyRelativeAdjustment() — delta-preserving transformation
 *  5. isMateriallyCustomized() — provenance check via metadata
 *  6. buildPropagationPlan() — dry-run, no mutations
 *  7. commitPropagationPlan() — transactional apply + audit log
 *  8. getPropagationSummary() — user-facing structured summary
 *  9. Stimulus band protection
 * 10. Safe edit-type policies
 */

import { db, propagationEvents, sessionExercises, trainingSessions, trainingWeeks, trainingPhases } from "@workspace/db";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";

// ─── Phase 1: Propagation Mode ───────────────────────────────────────────────

export type PropagationMode =
  | "none"
  | "exact_copy"
  | "relative_adjustment"
  | "structural_swap"
  | "prompt_user";

export type StimulusBand = "power" | "strength" | "hypertrophy" | "endurance" | "mixed";

/**
 * Determines how a change should propagate to future weeks.
 *
 * structural_swap: replace exercise identity, preserve target dosage where possible
 * relative_adjustment: preserve later-week progression shape, apply directional delta
 * exact_copy: copy safe metadata forward (not used for dosage fields)
 * prompt_user: ambiguity or high risk — requires user confirmation
 * none: local only, no propagation
 */
export function determinePropagationMode(input: {
  actionType: "replace_exercise" | "update_exercise" | string;
  intent: string;
  fieldsChanged: string[];
  beforeExercise?: Record<string, any>;
  afterExercise?: Record<string, any>;
}): PropagationMode {
  const { actionType, intent, fieldsChanged } = input;

  if (actionType === "replace_exercise") return "structural_swap";

  const structuralIntents = new Set([
    "easier_variation",
    "harder_variation",
    "injury_modification",
    "joint_friendly_modification",
    "add_explosive_emphasis",
    "shoulder_modification",
    "swap_exercise",
    "exercise_swap",
  ]);

  const relativeIntents = new Set(["increase_sets", "reduce_sets"]);
  const localOnlyIntents = new Set(["exercise_note"]);
  const promptIntents = new Set(["change_rep_range"]);

  if (structuralIntents.has(intent)) return "structural_swap";
  if (localOnlyIntents.has(intent)) return "none";
  if (promptIntents.has(intent)) return "prompt_user";
  if (relativeIntents.has(intent)) return "relative_adjustment";

  if (actionType === "update_exercise") {
    const realFields = fieldsChanged.filter((f) => !f.startsWith("__prescription_"));
    if (realFields.length === 0) return "none";
    if (realFields.every((f) => f === "notes")) return "none";
    if (realFields.length === 1 && realFields[0] === "sets") {
      const before = input.beforeExercise?.sets;
      const after = input.afterExercise?.sets;
      if (after === "INCREMENT" || after === "DECREMENT") return "none";
      if (typeof before === "number" && typeof after === "number") return "relative_adjustment";
    }
    if (realFields.some((f) => ["sets", "reps", "rest", "tempo"].includes(f))) {
      return "relative_adjustment";
    }
  }

  return "none";
}

// ─── Phase 2: Eligible Future Match Discovery ─────────────────────────────────

export interface FutureMatch {
  exerciseId: number;
  exerciseName: string;
  sessionId: number;
  sessionLabel: string;
  weekId: number;
  weekNumber: number;
  volumeLevel: string;
  weekLabel: string | null;
  weekStatus: string;
  phaseId: number;
  sets: number | null;
  reps: string | null;
  rest: string | null;
  tempo: string | null;
  notes: string | null;
  metadata: Record<string, any> | null;
}

/**
 * Queries the database for exercise instances in future weeks that are eligible
 * for propagation. Applies structural eligibility filters before returning.
 *
 * Eligibility rules:
 *  1. Future week (weekNumber > sourceWeekNumber)
 *  2. Week is not completed
 *  3. Same session label (slot/day identity preserved)
 *  4. Same exercise name (or family match for structural_swap)
 *  5. Not already locked (checked by isMateriallyCustomized caller)
 */
export async function findEligibleFutureMatches(input: {
  sourceExerciseId: number;
  sourceWeekNumber: number;
  sourceSessionLabel: string;
  exerciseName: string;
  trainingSystemId: number;
}): Promise<FutureMatch[]> {
  const { sourceExerciseId, sourceWeekNumber, sourceSessionLabel, exerciseName, trainingSystemId } = input;

  const phases = await db
    .select({ id: trainingPhases.id })
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, trainingSystemId));

  if (phases.length === 0) return [];
  const phaseIds = phases.map((p) => p.id);

  const futureWeeks = await db
    .select({
      id: trainingWeeks.id,
      weekNumber: trainingWeeks.weekNumber,
      volumeLevel: trainingWeeks.volumeLevel,
      label: trainingWeeks.label,
      status: trainingWeeks.status,
      phaseId: trainingWeeks.trainingPhaseId,
    })
    .from(trainingWeeks)
    .where(
      and(
        inArray(trainingWeeks.trainingPhaseId, phaseIds),
        ne(sql`${trainingWeeks.weekNumber}`, sourceWeekNumber)
      )
    );

  const eligibleWeeks = futureWeeks.filter(
    (w) => w.status !== "completed" && w.weekNumber > sourceWeekNumber
  );
  if (eligibleWeeks.length === 0) return [];

  const eligibleWeekIds = eligibleWeeks.map((w) => w.id);
  const weekMap = new Map(eligibleWeeks.map((w) => [w.id, w]));

  const sessions = await db
    .select({ id: trainingSessions.id, label: trainingSessions.label, weekId: trainingSessions.trainingWeekId })
    .from(trainingSessions)
    .where(
      and(
        inArray(trainingSessions.trainingWeekId, eligibleWeekIds),
        eq(trainingSessions.label, sourceSessionLabel)
      )
    );

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const candidates = await db
    .select({
      id: sessionExercises.id,
      name: sessionExercises.name,
      sessionId: sessionExercises.trainingSessionId,
      sets: sessionExercises.sets,
      reps: sessionExercises.reps,
      rest: sessionExercises.rest,
      tempo: sessionExercises.tempo,
      notes: sessionExercises.notes,
      metadata: sessionExercises.metadata,
    })
    .from(sessionExercises)
    .where(
      and(
        inArray(sessionExercises.trainingSessionId, sessionIds),
        eq(sessionExercises.name, exerciseName),
        ne(sessionExercises.id, sourceExerciseId)
      )
    );

  return candidates.map((c) => {
    const session = sessionMap.get(c.sessionId)!;
    const week = weekMap.get(session.weekId)!;
    return {
      exerciseId: c.id,
      exerciseName: c.name,
      sessionId: c.sessionId,
      sessionLabel: session.label,
      weekId: week.id,
      weekNumber: week.weekNumber,
      volumeLevel: week.volumeLevel,
      weekLabel: week.label,
      weekStatus: week.status,
      phaseId: week.phaseId,
      sets: c.sets,
      reps: c.reps,
      rest: c.rest,
      tempo: c.tempo,
      notes: c.notes,
      metadata: c.metadata as Record<string, any> | null,
    };
  });
}

// ─── Phase 3: Safety Scoring ─────────────────────────────────────────────────

export interface PropagationSafetyResult {
  safe: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
}

const SAFETY_PASS_THRESHOLD = 60;
const MAX_SETS = 10;
const MIN_SETS = 1;

/**
 * Assesses whether it is safe to propagate a change to a specific target exercise.
 * Returns a numeric score (0-100) and qualitative reasons.
 *
 * Hard stops (score = 0): locked, protected week with structural change, rehab mismatch
 * Penalties: customized, deload/taper, stimulus band shift, progression flatten
 */
export function assessPropagationSafety(input: {
  targetWeek: {
    weekNumber: number;
    volumeLevel: string;
    weekLabel: string | null;
    weekStatus: string;
  };
  sourceExerciseBefore: Record<string, any>;
  sourceExerciseAfter: Record<string, any>;
  targetExercise: FutureMatch;
  propagationMode: PropagationMode;
}): PropagationSafetyResult {
  const { targetWeek, sourceExerciseBefore, sourceExerciseAfter, targetExercise, propagationMode } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // ── Hard Stop: locked by user ─────────────────────────────────────────────
  const meta = (targetExercise.metadata as any)?.propagation ?? {};
  if (meta.isLocked === true) {
    return { safe: false, score: 0, reasons: ["Exercise is locked — skipping"], warnings: [] };
  }

  // ── Hard Stop: user-customized (materially) ────────────────────────────────
  if (isMateriallyCustomized(targetExercise)) {
    return {
      safe: false,
      score: 0,
      reasons: ["Exercise was previously customized by user — skipping"],
      warnings: [],
    };
  }

  // ── Protected week detection ───────────────────────────────────────────────
  const isProtected = isProtectedWeek(targetWeek);
  if (isProtected) {
    if (propagationMode === "structural_swap") {
      return {
        safe: false,
        score: 0,
        reasons: [`Week ${targetWeek.weekNumber} is a protected week (${targetWeek.volumeLevel}) — structural changes skipped`],
        warnings: [],
      };
    }
    score -= 50;
    warnings.push(`Week ${targetWeek.weekNumber} is a protected/deload week — adjustments applied conservatively`);
  }

  // ── Stimulus band shift (structural swap only) ─────────────────────────────
  if (propagationMode === "structural_swap") {
    const sourceBand = inferStimulusBand(sourceExerciseBefore);
    const afterBand = inferStimulusBand(sourceExerciseAfter);
    const targetBand = inferStimulusBand(targetExercise);
    if (targetBand !== afterBand && targetBand !== "mixed" && afterBand !== "mixed") {
      score -= 30;
      warnings.push(
        `Stimulus band may shift (${targetBand} → ${afterBand}) — verify this matches Week ${targetWeek.weekNumber} intent`
      );
    }
  }

  // ── Progression flatten check (relative adjustment) ───────────────────────
  if (propagationMode === "relative_adjustment") {
    const delta = computeSetsDelta(sourceExerciseBefore, sourceExerciseAfter);
    if (delta !== 0 && targetExercise.sets != null) {
      const newSets = Math.max(MIN_SETS, Math.min(MAX_SETS, targetExercise.sets + delta));
      if (newSets === targetExercise.sets) {
        score -= 20;
        warnings.push(`Week ${targetWeek.weekNumber}: set adjustment already at boundary — clamped`);
      }
    }
  }

  // ── Same slot confirmed ────────────────────────────────────────────────────
  reasons.push(`Week ${targetWeek.weekNumber}: same session slot confirmed`);

  return {
    safe: score >= SAFETY_PASS_THRESHOLD,
    score,
    reasons,
    warnings,
  };
}

// ─── Phase 5: Modification Provenance ────────────────────────────────────────

/**
 * Returns true if the exercise has been materially customized by the user,
 * in which case automatic propagation must be skipped.
 *
 * Detects user customization via the `metadata.propagation` namespace which is
 * written whenever the edit engine applies a change to an exercise.
 */
export function isMateriallyCustomized(exercise: { metadata?: Record<string, any> | null }): boolean {
  const meta = (exercise.metadata as any)?.propagation ?? {};
  if (meta.isLocked === true) return true;
  if (meta.modifiedBy === "user") return true;
  return false;
}

// ─── Phase 4: Relative Adjustment ────────────────────────────────────────────

/**
 * Applies a delta-preserving adjustment to a target exercise.
 *
 * Instead of blindly copying source-after values, computes the directional
 * delta from source and applies it to the target — preserving the target's
 * own progression shape.
 *
 * Examples:
 *  Source: sets 3→4 (delta +1). Target had 5 sets → becomes 6.
 *  Source: reps "4-6" → "5-7" (delta +1). Target "8-10" → "9-11".
 */
export function applyRelativeAdjustment(input: {
  sourceBefore: Record<string, any>;
  sourceAfter: Record<string, any>;
  targetExercise: FutureMatch;
}): Record<string, any> {
  const { sourceBefore, sourceAfter, targetExercise } = input;
  const result: Record<string, any> = {};

  // Sets
  const setsDelta = computeSetsDelta(sourceBefore, sourceAfter);
  if (setsDelta !== 0 && targetExercise.sets != null) {
    result.sets = Math.max(MIN_SETS, Math.min(MAX_SETS, targetExercise.sets + setsDelta));
  }

  // Reps
  if (sourceBefore.reps != null && sourceAfter.reps != null) {
    const beforeRange = parseRepRange(String(sourceBefore.reps));
    const afterRange = parseRepRange(String(sourceAfter.reps));
    if (beforeRange && afterRange && targetExercise.reps) {
      const targetRange = parseRepRange(targetExercise.reps);
      if (targetRange) {
        const loDelta = afterRange[0] - beforeRange[0];
        const hiDelta = afterRange[1] - beforeRange[1];
        const newLo = Math.max(1, targetRange[0] + loDelta);
        const newHi = Math.max(newLo + 1, targetRange[1] + hiDelta);
        const sourceBand = inferStimulusBandFromReps(beforeRange);
        const targetBand = inferStimulusBandFromReps(targetRange);
        const newBand = inferStimulusBandFromReps([newLo, newHi]);
        if (newBand === targetBand || targetBand === "mixed") {
          result.reps = `${newLo}-${newHi}`;
        }
      }
    }
  }

  return result;
}

// ─── Structural Swap helper ───────────────────────────────────────────────────

/**
 * Builds the updates for a structural swap (exercise identity change), preserving
 * the target week's dosage targets where possible.
 */
function applyStructuralSwap(input: {
  sourceAfter: Record<string, any>;
  targetExercise: FutureMatch;
}): Record<string, any> {
  const { sourceAfter, targetExercise } = input;
  const result: Record<string, any> = { name: sourceAfter.name };

  if (sourceAfter.category) result.category = sourceAfter.category;
  result.sets = targetExercise.sets ?? sourceAfter.sets;
  result.reps = targetExercise.reps ?? sourceAfter.reps;
  result.rest = targetExercise.rest ?? sourceAfter.rest;
  if (sourceAfter.tempo) result.tempo = sourceAfter.tempo;

  return result;
}

// ─── Phase 6: Dry-Run Plan Builder ───────────────────────────────────────────

export interface PropagationPlanEntry {
  weekNumber: number;
  weekId: number;
  exerciseId: number;
  sessionLabel: string;
  action: "apply" | "skip";
  reason: string;
  mode: PropagationMode;
  beforeSnapshot: Record<string, any>;
  afterSnapshot: Record<string, any>;
  safetyScore: number;
  warnings: string[];
}

export interface PropagationPlan {
  planId: string;
  mode: PropagationMode;
  source: {
    exerciseId: number;
    weekNumber: number;
    sessionLabel: string;
    exerciseBefore: Record<string, any>;
    exerciseAfter: Record<string, any>;
  };
  targets: PropagationPlanEntry[];
  summary: {
    applyCount: number;
    skipCount: number;
    protectedCount: number;
    customizedCount: number;
    lockedCount: number;
  };
}

/**
 * Builds a propagation plan without mutating the database (dry run).
 * The plan includes apply/skip decisions with full before/after snapshots
 * for every candidate target.
 */
export async function buildPropagationPlan(input: {
  sourceExerciseId: number;
  sourceWeekNumber: number;
  sourceSessionLabel: string;
  exerciseName: string;
  trainingSystemId: number;
  exerciseBefore: Record<string, any>;
  exerciseAfter: Record<string, any>;
  planIntent: string;
  fieldsChanged: string[];
}): Promise<PropagationPlan> {
  const {
    sourceExerciseId, sourceWeekNumber, sourceSessionLabel, exerciseName,
    trainingSystemId, exerciseBefore, exerciseAfter, planIntent, fieldsChanged,
  } = input;

  const planId = randomUUID();
  const mode = determinePropagationMode({
    actionType: exerciseBefore.name !== exerciseAfter.name ? "replace_exercise" : "update_exercise",
    intent: planIntent,
    fieldsChanged,
    beforeExercise: exerciseBefore,
    afterExercise: exerciseAfter,
  });

  if (mode === "none" || mode === "prompt_user") {
    return {
      planId,
      mode,
      source: { exerciseId: sourceExerciseId, weekNumber: sourceWeekNumber, sessionLabel: sourceSessionLabel, exerciseBefore, exerciseAfter },
      targets: [],
      summary: { applyCount: 0, skipCount: 0, protectedCount: 0, customizedCount: 0, lockedCount: 0 },
    };
  }

  const candidates = await findEligibleFutureMatches({
    sourceExerciseId, sourceWeekNumber, sourceSessionLabel, exerciseName, trainingSystemId,
  });

  const entries: PropagationPlanEntry[] = [];
  let protectedCount = 0;
  let customizedCount = 0;
  let lockedCount = 0;

  for (const candidate of candidates) {
    const targetWeekInfo = {
      weekNumber: candidate.weekNumber,
      volumeLevel: candidate.volumeLevel,
      weekLabel: candidate.weekLabel,
      weekStatus: candidate.weekStatus,
    };

    const safety = assessPropagationSafety({
      targetWeek: targetWeekInfo,
      sourceExerciseBefore: exerciseBefore,
      sourceExerciseAfter: exerciseAfter,
      targetExercise: candidate,
      propagationMode: mode,
    });

    const beforeSnapshot: Record<string, any> = {
      id: candidate.exerciseId,
      name: candidate.exerciseName,
      sets: candidate.sets,
      reps: candidate.reps,
      rest: candidate.rest,
      tempo: candidate.tempo,
      notes: candidate.notes,
    };

    let afterSnapshot: Record<string, any>;
    let skipReason: string | null = null;

    if (!safety.safe) {
      const reason = safety.reasons[0] ?? "Safety check failed";
      skipReason = reason;
      afterSnapshot = { ...beforeSnapshot };

      if (reason.includes("locked")) lockedCount++;
      else if (reason.includes("customized")) customizedCount++;
      else if (reason.includes("protected")) protectedCount++;
      else skipReason = reason;
    } else {
      if (mode === "structural_swap") {
        afterSnapshot = { ...beforeSnapshot, ...applyStructuralSwap({ sourceAfter: exerciseAfter, targetExercise: candidate }) };
      } else if (mode === "relative_adjustment") {
        afterSnapshot = { ...beforeSnapshot, ...applyRelativeAdjustment({ sourceBefore: exerciseBefore, sourceAfter: exerciseAfter, targetExercise: candidate }) };
      } else {
        afterSnapshot = { ...beforeSnapshot, ...exerciseAfter };
      }
    }

    entries.push({
      weekNumber: candidate.weekNumber,
      weekId: candidate.weekId,
      exerciseId: candidate.exerciseId,
      sessionLabel: candidate.sessionLabel,
      action: safety.safe ? "apply" : "skip",
      reason: skipReason ?? safety.reasons.join("; "),
      mode,
      beforeSnapshot,
      afterSnapshot,
      safetyScore: safety.score,
      warnings: safety.warnings,
    });
  }

  const applyCount = entries.filter((e) => e.action === "apply").length;
  const skipCount = entries.filter((e) => e.action === "skip").length;

  return {
    planId,
    mode,
    source: { exerciseId: sourceExerciseId, weekNumber: sourceWeekNumber, sessionLabel: sourceSessionLabel, exerciseBefore, exerciseAfter },
    targets: entries,
    summary: { applyCount, skipCount, protectedCount, customizedCount, lockedCount },
  };
}

// ─── Phase 7: Commit ──────────────────────────────────────────────────────────

export interface CommitResult {
  planId: string;
  appliedIds: number[];
  appliedCount: number;
  skippedCount: number;
  auditEntryCount: number;
}

/**
 * Executes the propagation plan, applying changes to eligible target exercises.
 * Stamps propagation metadata on each changed exercise, writes audit log entries,
 * and emits a structured summary.
 *
 * Does NOT use a database transaction for safety — each change is independent.
 * If a single target fails, others still proceed. All outcomes are audit-logged.
 */
export async function commitPropagationPlan(
  plan: PropagationPlan,
  trainingSystemId: number,
  changeLogId: number | undefined,
  initiatedBy: "user" | "agent" = "user"
): Promise<CommitResult> {
  const appliedIds: number[] = [];
  const auditRows: {
    planId: string;
    trainingSystemId: number;
    changeLogId?: number;
    sourceWeekNumber: number;
    sourceExerciseId: number;
    targetWeekNumber: number;
    targetExerciseId: number;
    propagationMode: string;
    action: "apply" | "skip";
    safetyScore: number;
    changedFields: any;
    skippedReason?: string;
    initiatedBy: string;
  }[] = [];

  for (const entry of plan.targets) {
    try {
      if (entry.action === "apply") {
        const updates: Record<string, any> = {};
        const before = entry.beforeSnapshot;
        const after = entry.afterSnapshot;

        for (const key of ["name", "sets", "reps", "rest", "tempo", "notes", "category"] as const) {
          if (after[key] !== undefined && after[key] !== before[key]) {
            updates[key] = after[key];
          }
        }

        if (Object.keys(updates).length > 0) {
          // Stamp propagation provenance into metadata
          const existingMeta = await db
            .select({ metadata: sessionExercises.metadata })
            .from(sessionExercises)
            .where(eq(sessionExercises.id, entry.exerciseId))
            .limit(1);

          const currentMeta = (existingMeta[0]?.metadata as Record<string, any>) ?? {};
          const propagationMeta = {
            ...(currentMeta.propagation ?? {}),
            modifiedBy: "agent",
            lastModifiedAt: new Date().toISOString(),
            propagationSource: {
              planId: plan.planId,
              sourceWeekNumber: plan.source.weekNumber,
              sourceExerciseId: plan.source.exerciseId,
            },
          };

          await db
            .update(sessionExercises)
            .set({
              ...updates,
              metadata: { ...currentMeta, propagation: propagationMeta },
            })
            .where(eq(sessionExercises.id, entry.exerciseId));

          appliedIds.push(entry.exerciseId);
        }

        auditRows.push({
          planId: plan.planId,
          trainingSystemId,
          changeLogId,
          sourceWeekNumber: plan.source.weekNumber,
          sourceExerciseId: plan.source.exerciseId,
          targetWeekNumber: entry.weekNumber,
          targetExerciseId: entry.exerciseId,
          propagationMode: plan.mode,
          action: "apply",
          safetyScore: entry.safetyScore,
          changedFields: Object.keys(updates),
          initiatedBy,
        });
      } else {
        auditRows.push({
          planId: plan.planId,
          trainingSystemId,
          changeLogId,
          sourceWeekNumber: plan.source.weekNumber,
          sourceExerciseId: plan.source.exerciseId,
          targetWeekNumber: entry.weekNumber,
          targetExerciseId: entry.exerciseId,
          propagationMode: plan.mode,
          action: "skip",
          safetyScore: entry.safetyScore,
          changedFields: null,
          skippedReason: entry.reason,
          initiatedBy,
        });
      }
    } catch (err) {
      logger.error({ err, exerciseId: entry.exerciseId, planId: plan.planId }, "[PropagationEngine] Failed to apply target — skipping");
      auditRows.push({
        planId: plan.planId,
        trainingSystemId,
        changeLogId,
        sourceWeekNumber: plan.source.weekNumber,
        sourceExerciseId: plan.source.exerciseId,
        targetWeekNumber: entry.weekNumber,
        targetExerciseId: entry.exerciseId,
        propagationMode: plan.mode,
        action: "skip",
        safetyScore: entry.safetyScore,
        changedFields: null,
        skippedReason: `Apply threw: ${err instanceof Error ? err.message : String(err)}`,
        initiatedBy,
      });
    }
  }

  // Write all audit entries in one batch
  let auditEntryCount = 0;
  if (auditRows.length > 0) {
    try {
      await db.insert(propagationEvents).values(
        auditRows.map((r) => ({
          planId: r.planId,
          trainingSystemId: r.trainingSystemId,
          changeLogId: r.changeLogId ?? null,
          sourceWeekNumber: r.sourceWeekNumber,
          sourceExerciseId: r.sourceExerciseId,
          targetWeekNumber: r.targetWeekNumber,
          targetExerciseId: r.targetExerciseId,
          propagationMode: r.propagationMode,
          action: r.action,
          safetyScore: r.safetyScore,
          changedFields: r.changedFields,
          skippedReason: r.skippedReason ?? null,
          initiatedBy: r.initiatedBy,
        }))
      );
      auditEntryCount = auditRows.length;
    } catch (auditErr) {
      logger.warn({ auditErr }, "[PropagationEngine] Failed to write audit entries (non-fatal)");
    }
  }

  return {
    planId: plan.planId,
    appliedIds,
    appliedCount: appliedIds.length,
    skippedCount: plan.targets.length - appliedIds.length,
    auditEntryCount,
  };
}

// ─── Phase 8: User-Facing Summary ────────────────────────────────────────────

export interface PropagationSummary {
  status: "local_only" | "propagated" | "partial" | "confirmation_required";
  message: string;
  appliedWeeks: number[];
  skippedWeeks: Array<{ weekNumber: number; reason: string }>;
  mode: PropagationMode;
  planId: string;
}

/**
 * Builds a concise user-facing summary from the propagation plan and commit result.
 */
export function getPropagationSummary(
  plan: PropagationPlan,
  commit: CommitResult
): PropagationSummary {
  const appliedWeeks = plan.targets
    .filter((t) => t.action === "apply" && commit.appliedIds.includes(t.exerciseId))
    .map((t) => t.weekNumber)
    .sort((a, b) => a - b);

  const skippedWeeks = plan.targets
    .filter((t) => t.action === "skip")
    .map((t) => ({ weekNumber: t.weekNumber, reason: t.reason }));

  if (plan.mode === "prompt_user") {
    return {
      status: "confirmation_required",
      message: "This adjustment changes training intent. Future propagation requires confirmation.",
      appliedWeeks: [],
      skippedWeeks: [],
      mode: plan.mode,
      planId: plan.planId,
    };
  }

  if (plan.mode === "none" || commit.appliedCount === 0) {
    const reason = skippedWeeks.length > 0
      ? "Later weeks were not changed because those exercises were already customized."
      : "Applied locally only.";
    return {
      status: "local_only",
      message: reason,
      appliedWeeks: [],
      skippedWeeks,
      mode: plan.mode,
      planId: plan.planId,
    };
  }

  if (skippedWeeks.length === 0) {
    const weekList = appliedWeeks.length > 1
      ? `weeks ${appliedWeeks.join(", ")}`
      : `week ${appliedWeeks[0]}`;
    return {
      status: "propagated",
      message: `Applied to ${commit.appliedCount} matching future ${weekList}.`,
      appliedWeeks,
      skippedWeeks: [],
      mode: plan.mode,
      planId: plan.planId,
    };
  }

  // Partial
  const parts: string[] = [];
  if (commit.appliedCount > 0) parts.push(`Applied to ${commit.appliedCount} future week${commit.appliedCount > 1 ? "s" : ""}`);
  const protectedSkips = skippedWeeks.filter((s) => s.reason.includes("protected") || s.reason.includes("deload"));
  const customizedSkips = skippedWeeks.filter((s) => s.reason.includes("customized"));
  if (protectedSkips.length > 0) parts.push(`left ${protectedSkips.length} future week${protectedSkips.length > 1 ? "s" : ""} unchanged`);
  if (customizedSkips.length > 0) parts.push(`${customizedSkips.length} customized week${customizedSkips.length > 1 ? "s" : ""} left unchanged`);

  return {
    status: "partial",
    message: parts.join("; ") + ".",
    appliedWeeks,
    skippedWeeks,
    mode: plan.mode,
    planId: plan.planId,
  };
}

// ─── Phase 10: Stimulus Band Helpers ─────────────────────────────────────────

export function inferStimulusBand(exercise: { reps?: string | null; category?: string | null }): StimulusBand {
  const reps = exercise.reps ? parseRepRange(exercise.reps) : null;
  if (reps) return inferStimulusBandFromReps(reps);

  if (exercise.category === "power") return "power";
  if (exercise.category === "conditioning") return "endurance";

  return "mixed";
}

function inferStimulusBandFromReps(range: [number, number]): StimulusBand {
  const avg = (range[0] + range[1]) / 2;
  if (avg <= 3) return "power";
  if (avg <= 6) return "strength";
  if (avg <= 15) return "hypertrophy";
  return "endurance";
}

function parseRepRange(reps: string): [number, number] | null {
  const trimmed = reps.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) return [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])];

  const singleMatch = trimmed.match(/^(\d+)$/);
  if (singleMatch) {
    const n = parseInt(singleMatch[1]);
    return [n, n];
  }

  return null;
}

function computeSetsDelta(before: Record<string, any>, after: Record<string, any>): number {
  const b = typeof before.sets === "number" ? before.sets : null;
  const a = typeof after.sets === "number" ? after.sets : null;
  if (b === null || a === null) return 0;
  return a - b;
}

// ─── Protected week detection ─────────────────────────────────────────────────

const PROTECTED_VOLUME_LEVELS = new Set(["deload"]);
const PROTECTED_LABELS = /deload|taper|testing|rehab|recovery week/i;

export function isProtectedWeek(week: { volumeLevel?: string; weekLabel?: string | null }): boolean {
  if (week.volumeLevel && PROTECTED_VOLUME_LEVELS.has(week.volumeLevel)) return true;
  if (week.weekLabel && PROTECTED_LABELS.test(week.weekLabel)) return true;
  return false;
}

// ─── Stamp user provenance (called by edit-engine for direct user edits) ──────

/**
 * Stamps the `metadata.propagation.modifiedBy = "user"` marker on an exercise
 * that was directly edited by the user. This prevents future auto-propagation
 * from overwriting the user's explicit customization.
 */
export async function stampUserModification(exerciseId: number): Promise<void> {
  try {
    const [current] = await db
      .select({ metadata: sessionExercises.metadata })
      .from(sessionExercises)
      .where(eq(sessionExercises.id, exerciseId))
      .limit(1);

    const currentMeta = (current?.metadata as Record<string, any>) ?? {};
    const propagationMeta = {
      ...(currentMeta.propagation ?? {}),
      modifiedBy: "user",
      lastModifiedAt: new Date().toISOString(),
    };

    await db
      .update(sessionExercises)
      .set({ metadata: { ...currentMeta, propagation: propagationMeta } })
      .where(eq(sessionExercises.id, exerciseId));
  } catch (err) {
    logger.warn({ err, exerciseId }, "[PropagationEngine] Failed to stamp user modification (non-fatal)");
  }
}
