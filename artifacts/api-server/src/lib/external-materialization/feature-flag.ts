/**
 * External materialization feature flag (Phase 2.3).
 *
 * Off by default. When off, the external edit path behaves EXACTLY as before —
 * no materialization is attempted. Read at call time so it can be toggled
 * without a rebuild.
 *
 * See docs/phase-2-external-surgical-edit.md §11 (Rollout Strategy).
 */

export const EXTERNAL_MATERIALIZATION_FLAG = "EXTERNAL_MATERIALIZATION_ENABLED";

/** True only when EXTERNAL_MATERIALIZATION_ENABLED is exactly "true". */
export function isExternalMaterializationEnabled(): boolean {
  return process.env[EXTERNAL_MATERIALIZATION_FLAG] === "true";
}
