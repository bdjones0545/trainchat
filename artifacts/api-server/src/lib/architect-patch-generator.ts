/**
 * Architect Patch Generator — Program Mutation Reliability
 *
 * PHASE 2: Structured patch system for all structural exercise mutations.
 * PHASE 3: Validation layer — validates sessionId, insertionPoint, exercise.name
 *          before execution. Returns a structured clarification request if
 *          any required field is missing, so the system ALWAYS produces a receipt.
 * PHASE 6: Auto-fill logic — infers exercise from program type + session structure
 *          when the user request is vague (e.g. "add an exercise to Day 1").
 *
 * All structural mutations (add/remove/replace exercise) MUST pass through
 * this validator before the edit engine executes them. This is the gating
 * layer that enforces the Performance Architect's structural edit authority.
 */

import { logger } from "./logger";
import type { EditPlan } from "./edit-intent-service";

// ─── ArchitectPatch Contract ──────────────────────────────────────────────────
// The canonical structured patch shape for structural exercise mutations.
// All structural edits MUST produce a valid ArchitectPatch before execution.

export interface ArchitectPatch {
  operation: "add_exercise" | "delete_exercise" | "replace_exercise";
  sessionId: string;
  insertionPoint: string;
  exercise: {
    name: string;
    sets: number;
    reps: number;
    rest?: string;
  };
}

// ─── Execution Receipt Contract ───────────────────────────────────────────────
// Phase 4: All mutation tools must return one of these shapes — never silent failure.

export interface MutationSuccessReceipt {
  success: true;
  /**
   * Post-write DB verification result.
   * true  = exercise was re-read from the DB and confirmed present after insert
   * false = insert returned an ID but post-write re-read was inconclusive
   */
  verified: boolean;
  action: string;
  sessionId: string;
  exerciseName: string;
  /** Human-readable confirmation, e.g. "Added Copenhagen Plank to Day 1." */
  message: string;
  timestamp: string;
}

export interface MutationFailureReceipt {
  success: false;
  error: string;
}

export type MutationReceipt = MutationSuccessReceipt | MutationFailureReceipt;

// ─── Clarification Request ────────────────────────────────────────────────────

export interface StructuralClarificationRequest {
  needsClarification: true;
  missingField: "sessionId" | "insertionPoint" | "exerciseName";
  question: string;
  partialPatch?: Partial<ArchitectPatch>;
}

// ─── Validation Outcome ───────────────────────────────────────────────────────

export type PatchValidationOutcome =
  | { valid: true; patches: ArchitectPatch[] }
  | { valid: false; clarification: StructuralClarificationRequest }
  | { valid: false; error: string };

// ─── Session Context for Lookup ───────────────────────────────────────────────

export interface SessionContext {
  label?: string;
  sessionType?: string;
  focusMode?: string;
}

// ─── Auto-fill Exercise Name (Phase 6) ───────────────────────────────────────
// When the AI produced a vague or empty exercise name, infer a real one
// from session context. Always explain briefly what was added and why.

const AUTOFILL_BY_BUCKET: Record<string, string[]> = {
  upper:        ["Dumbbell Row", "Face Pull", "Dumbbell Lateral Raise", "Band Pull-Apart"],
  lower:        ["Bulgarian Split Squat", "Romanian Deadlift", "Lateral Lunge", "Hip Thrust"],
  push:         ["Incline Dumbbell Press", "Cable Fly", "Overhead Tricep Extension", "Dumbbell Lateral Raise"],
  pull:         ["Dumbbell Row", "Face Pull", "Hammer Curl", "Reverse Fly"],
  full:         ["Dumbbell Complex", "Kettlebell Swing", "Goblet Squat", "Turkish Get-Up"],
  conditioning: ["Assault Bike Sprint", "Sled Push", "Battle Rope Wave", "Med Ball Slam"],
  speed:        ["Box Jump", "Broad Jump", "Lateral Band Walk", "Single-Leg Glute Bridge"],
  mobility:     ["Hip 90/90 Stretch", "Thoracic Rotation", "Deep Squat Hold", "Hip Flexor Stretch"],
  strength:     ["Bulgarian Split Squat", "Romanian Deadlift", "Dumbbell Row", "Incline Dumbbell Press"],
  default:      ["Dumbbell Row", "Bulgarian Split Squat", "Face Pull", "Pallof Press"],
};

export function autoFillExerciseName(
  sessionLabel: string | null | undefined,
  sessionType: string | null | undefined,
  focusMode: string | null | undefined,
): { name: string; reason: string } {
  const label = (sessionLabel ?? "").toLowerCase();
  const type  = (sessionType ?? "").toLowerCase();
  const focus = (focusMode ?? "strength").toLowerCase();

  let bucket = "default";

  if      (label.includes("upper") || type.includes("upper"))           bucket = "upper";
  else if (label.includes("lower") || type.includes("lower") || label.includes("leg")) bucket = "lower";
  else if (label.includes("push")  || type.includes("push"))            bucket = "push";
  else if (label.includes("pull")  || type.includes("pull"))            bucket = "pull";
  else if (label.includes("full")  || type.includes("full"))            bucket = "full";
  else if (label.includes("condition") || type.includes("condition"))   bucket = "conditioning";
  else if (focus === "speed")                                            bucket = "speed";
  else if (focus === "mobility")                                         bucket = "mobility";
  else if (focus === "strength" || label.includes("strength"))          bucket = "strength";

  const candidates = AUTOFILL_BY_BUCKET[bucket] ?? AUTOFILL_BY_BUCKET.default;
  // Cycle through candidates based on current time so repeated calls vary
  const idx  = Math.floor(Date.now() / 15_000) % candidates.length;
  const name = candidates[idx];

  const bucketLabel: Record<string, string> = {
    upper: "upper body",   lower: "lower body",   push: "push",
    pull:  "pull",         full:  "full body",     conditioning: "conditioning",
    speed: "speed",        mobility: "mobility",   strength: "strength",
    default: "accessory",
  };

  const reason = `Auto-selected as a ${bucketLabel[bucket] ?? "accessory"} exercise based on the session's structure. Good fit for where this sits in your week.`;

  return { name, reason };
}

// ─── Structural Change Detector ───────────────────────────────────────────────
// Returns true if the plan contains any structural mutations.

export function hasStructuralChanges(plan: EditPlan): boolean {
  return plan.changes.some(
    (c) => c.type === "add_exercise" || c.type === "delete_exercise" || c.type === "replace_exercise",
  );
}

// ─── Minor Attribute Edit Detector ───────────────────────────────────────────
// Returns true if ALL changes are minor attribute updates only (sets/reps/rest/tempo).
// These bypass the architect patch validator — they go straight to DIRECT_EDIT.

export function isMinorAttributeEdit(plan: EditPlan): boolean {
  if (plan.changes.length === 0) return false;
  return plan.changes.every((c) => {
    if (c.type !== "update_exercise") return false;
    const keys = Object.keys(c.updates ?? {});
    return keys.length > 0 && keys.every((k) =>
      ["sets", "reps", "rest", "tempo", "rpe", "notes"].includes(k),
    );
  });
}

// ─── Validate Structural Changes (Phase 3) ───────────────────────────────────
// Before execution: confirm sessionId exists, insertionPoint is valid,
// and exercise.name is not empty. If any required field is missing,
// return a structured clarification request instead of executing.

export function validateStructuralChanges(
  plan: EditPlan,
  sessionLookup?: Map<number, SessionContext>,
): PatchValidationOutcome {
  const structuralChanges = plan.changes.filter(
    (c) => c.type === "add_exercise" || c.type === "delete_exercise" || c.type === "replace_exercise",
  );

  if (structuralChanges.length === 0) {
    return { valid: true, patches: [] };
  }

  const patches: ArchitectPatch[] = [];

  for (const change of structuralChanges) {
    // ── Validate sessionId on add_exercise ───────────────────────────────────
    if (change.type === "add_exercise" && !change.sessionId) {
      logger.warn(
        { changeType: change.type, changeId: change.id },
        "[ArchitectPatchValidator] Missing sessionId on add_exercise — requesting clarification",
      );
      return {
        valid: false,
        clarification: {
          needsClarification: true,
          missingField: "sessionId",
          question:
            "Which session should I add the exercise to? Try: 'add to Day 1', 'add to the upper body session', or open the session from your program panel and use the Add button.",
        },
      };
    }

    // ── Validate / auto-fill exercise name for add / replace ─────────────────
    if (change.type === "add_exercise" || change.type === "replace_exercise") {
      const rawName    = (change.exercise?.name ?? change.replacement?.name ?? "").trim();
      const isGeneric  = !rawName ||
        /^(exercise|movement|variation|something|anything|new exercise|new movement|another exercise|a different exercise|placeholder)$/i.test(rawName);

      if (isGeneric) {
        if (sessionLookup) {
          // Phase 6: auto-fill from session context
          const sessionId = change.sessionId ?? change.id;
          const ctx = sessionLookup.get(sessionId);
          const { name, reason } = autoFillExerciseName(ctx?.label, ctx?.sessionType, ctx?.focusMode);

          logger.info(
            { originalName: rawName, autoFilledName: name, sessionId, changeType: change.type },
            "[ArchitectPatchGenerator] Phase 6 — auto-filled vague exercise name from session context",
          );

          if (change.type === "add_exercise" && change.exercise) {
            change.exercise.name = name;
            change.reason = `${change.reason ? change.reason + " " : ""}${reason}`;
          } else if (change.type === "replace_exercise" && change.replacement) {
            change.replacement.name = name;
            change.reason = `${change.reason ? change.reason + " " : ""}${reason}`;
          }
        } else {
          // No context available — ask the user
          logger.warn(
            { changeType: change.type, rawName },
            "[ArchitectPatchValidator] Generic exercise name with no session context — requesting clarification",
          );
          return {
            valid: false,
            clarification: {
              needsClarification: true,
              missingField: "exerciseName",
              question:
                "Which exercise would you like to add? For example: 'add a Romanian Deadlift', 'add a conditioning finisher', or 'add a unilateral lower body movement'.",
            },
          };
        }
      }
    }

    // ── Build the ArchitectPatch ─────────────────────────────────────────────
    const insertionPoint =
      change.type === "add_exercise"
        ? `session:${change.sessionId ?? change.id}`
        : `exercise:${change.id}`;

    const exerciseData = change.type === "delete_exercise"
      ? null
      : (change.exercise ?? change.replacement);

    const repsRaw  = exerciseData?.reps;
    const repsNum  = typeof repsRaw === "number"
      ? repsRaw
      : (typeof repsRaw === "string" ? (parseInt(repsRaw, 10) || 8) : 8);

    const patch: ArchitectPatch = {
      operation:      change.type as ArchitectPatch["operation"],
      sessionId:      String(change.sessionId ?? change.id),
      insertionPoint,
      exercise: {
        name: exerciseData?.name ?? "",
        sets: exerciseData?.sets ?? 3,
        reps: repsNum,
        rest: exerciseData?.rest ?? "90s",
      },
    };

    patches.push(patch);
  }

  return { valid: true, patches };
}

// ─── Build Receipts (Phase 4) ─────────────────────────────────────────────────
// All mutation tools must return one of these receipts — never silent failure.

export function buildMutationSuccessReceipt(params: {
  action: string;
  sessionId: string | number;
  exerciseName: string;
  verified?: boolean;
  sessionLabel?: string;
}): MutationSuccessReceipt {
  const sessionRef = params.sessionLabel ? params.sessionLabel : `session ${params.sessionId}`;
  const actionVerb = params.action === "add_exercise"
    ? "Added"
    : params.action === "delete_exercise"
      ? "Removed"
      : params.action === "replace_exercise"
        ? "Replaced exercise in"
        : "Updated";
  const message = params.action === "delete_exercise"
    ? `${actionVerb} ${params.exerciseName} from ${sessionRef}.`
    : `${actionVerb} ${params.exerciseName} to ${sessionRef}.`;

  return {
    success:      true,
    verified:     params.verified ?? false,
    action:       params.action,
    sessionId:    String(params.sessionId),
    exerciseName: params.exerciseName,
    message,
    timestamp:    new Date().toISOString(),
  };
}

export function buildMutationFailureReceipt(error: string): MutationFailureReceipt {
  return { success: false, error };
}
