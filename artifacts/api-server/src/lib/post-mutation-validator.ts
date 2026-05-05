/**
 * Post-Mutation Architecture Light Validator
 *
 * A lightweight, non-blocking structural check that runs AFTER applyEditPlan()
 * or applyHierarchicalRefinement() to surface obvious structural regressions.
 *
 * Rules:
 *  - Does NOT block successful edits.
 *  - Does NOT throw — all errors are caught internally.
 *  - Logs warnings with [ArchLightValidation] tag.
 *  - Returns { warnings: string[] } for optional attachment to systemEdit metadata.
 */

import { logger } from "./logger";

export interface ArchLightWarning {
  type: string;
  message: string;
  severity: "warning" | "info";
}

export interface ArchLightResult {
  warnings: ArchLightWarning[];
  clean: boolean;
}

export interface ArchLightSessionSnapshot {
  id?: number | string;
  name?: string;
  exercises?: Array<{ name?: string; sets?: number; reps?: string; rest?: string; prescription?: string }>;
}

export interface ArchLightInput {
  sessions?: ArchLightSessionSnapshot[];
  /** Optional: entity snapshot keyed by ID (from EditResult.afterSnapshot) */
  entitySessions?: Record<string, Record<string, unknown>>;
  context?: string; // e.g. "non-SSE:direct_edit" | "SSE:hierarchical_refine"
}

/**
 * Validates the post-mutation session/exercise structure for obvious regressions.
 * Safe to call with partial data — missing fields are skipped gracefully.
 */
export function validatePostMutationArchitectureLight(input: ArchLightInput): ArchLightResult {
  const warnings: ArchLightWarning[] = [];

  try {
    const sessions: ArchLightSessionSnapshot[] = input.sessions ?? [];

    // Also accept entity snapshot format from EditResult.afterSnapshot.sessions
    if (sessions.length === 0 && input.entitySessions) {
      for (const raw of Object.values(input.entitySessions)) {
        sessions.push(raw as ArchLightSessionSnapshot);
      }
    }

    if (sessions.length === 0) {
      return { warnings: [], clean: true };
    }

    // ── Check 1: Empty sessions (no exercises at all) ─────────────────────────
    const emptySessions = sessions.filter((s) => !s.exercises || s.exercises.length === 0);
    if (emptySessions.length > 0) {
      const names = emptySessions.map((s) => s.name ?? `session-${s.id ?? "?"}`).join(", ");
      warnings.push({
        type: "empty_session",
        message: `${emptySessions.length} session(s) have no exercises after edit: ${names}`,
        severity: "warning",
      });
    }

    // ── Check 2: Sessions with < 3 exercises (likely truncated) ──────────────
    const thinSessions = sessions.filter((s) => (s.exercises?.length ?? 0) > 0 && (s.exercises?.length ?? 0) < 3);
    if (thinSessions.length > 0) {
      const names = thinSessions.map((s) => s.name ?? `session-${s.id ?? "?"}`).join(", ");
      warnings.push({
        type: "thin_session",
        message: `${thinSessions.length} session(s) have fewer than 3 exercises: ${names}`,
        severity: "info",
      });
    }

    // ── Check 3: All sessions accidentally identical (prescription flattening) ─
    if (sessions.length >= 2) {
      const fingerprints = sessions.map((s) =>
        (s.exercises ?? []).map((e) => `${e.name}:${e.sets}:${e.reps}:${e.rest}`).join("|")
      );
      const uniqueFingerprints = new Set(fingerprints);
      if (uniqueFingerprints.size === 1 && fingerprints[0] !== "") {
        warnings.push({
          type: "session_identity_collapse",
          message: `All ${sessions.length} sessions appear identical after edit — possible prescription flattening`,
          severity: "warning",
        });
      }
    }

    // ── Check 4: All exercises in a session have the same reps (rep flattening) ─
    for (const session of sessions) {
      const exs = session.exercises ?? [];
      if (exs.length >= 3) {
        const reps = exs.map((e) => e.reps ?? "").filter(Boolean);
        const uniqueReps = new Set(reps);
        if (uniqueReps.size === 1 && reps.length === exs.length) {
          warnings.push({
            type: "rep_flattening",
            message: `Session "${session.name ?? session.id}" — all ${exs.length} exercises have identical reps "${[...uniqueReps][0]}"`,
            severity: "info",
          });
        }
      }
    }

    if (warnings.length > 0) {
      logger.warn(
        {
          warnings: warnings.map((w) => ({ type: w.type, message: w.message, severity: w.severity })),
          context: input.context ?? "unknown",
          sessionCount: sessions.length,
        },
        "[ArchLightValidation] Post-mutation structural warnings detected"
      );
    } else {
      logger.info(
        { context: input.context ?? "unknown", sessionCount: sessions.length },
        "[ArchLightValidation] Post-mutation check passed — no structural issues"
      );
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[ArchLightValidation] Validator threw — skipping (non-fatal)");
  }

  return { warnings, clean: warnings.length === 0 };
}
