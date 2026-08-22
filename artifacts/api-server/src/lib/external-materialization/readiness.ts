/**
 * Migration-readiness diagnostic for the external materialized path (Phase 2.7).
 *
 * If either flag could be active but the `external_programs.training_system_id`
 * column is missing (manual migration 0002 not applied), materialization would
 * fail on every attempt and silently fall back. This surfaces that as a loud,
 * actionable startup warning. It is a DIAGNOSTIC only — never throws, never
 * blocks startup, and does not change request behavior (materialization already
 * fails-soft to the blob path).
 *
 * Pure + DI so it is unit-testable without a DB.
 */

export type ReadinessStatus = "flags_off" | "ready" | "missing_migration" | "probe_error";

export interface ReadinessDeps {
  /** True if either flag could be enabled (env-wide or via a pilot allowlist). */
  anyFlagEnabled: boolean;
  /** Probe whether external_programs.training_system_id exists. */
  columnExists: () => Promise<boolean>;
  onWarn?: (message: string) => void;
}

export async function checkExternalMaterializationReadiness(
  deps: ReadinessDeps,
): Promise<ReadinessStatus> {
  if (!deps.anyFlagEnabled) return "flags_off";

  let exists: boolean;
  try {
    exists = await deps.columnExists();
  } catch {
    // Probe failure must not block startup or requests.
    deps.onWarn?.(
      "external materialization readiness probe failed; could not verify external_programs.training_system_id",
    );
    return "probe_error";
  }

  if (!exists) {
    deps.onWarn?.(
      "External materialization/surgical flags are enabled but external_programs.training_system_id is MISSING. " +
        "Apply the ordered database migrations (pnpm --filter @workspace/db migrate). " +
        "Until then, materialized edits fail-soft to the LLM regeneration path.",
    );
    return "missing_migration";
  }

  return "ready";
}
