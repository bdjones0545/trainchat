/**
 * External materialization / surgical-edit feature flags (Phase 2.3/2.4) with
 * pilot gating (Phase 2.7).
 *
 * Both flags are OFF by default. Each flag is enabled when EITHER:
 *   - the global env flag is exactly "true"  (env-wide rollout), OR
 *   - the caller's apiKeyId/orgId is in the flag's pilot allowlist (pilot rollout).
 *
 * Pilot allowlists are comma-separated env vars, empty by default:
 *   EXTERNAL_MATERIALIZATION_PILOT_KEYS / _PILOT_ORGS
 *   EXTERNAL_SURGICAL_EDIT_PILOT_KEYS   / _PILOT_ORGS
 *
 * Read at call time so flags/allowlists can be toggled without a rebuild. With
 * no context argument, only the global env flag is consulted (backwards-compat).
 *
 * See docs/phase-2-external-surgical-edit.md §11 and docs/external-api.md.
 */

export const EXTERNAL_MATERIALIZATION_FLAG = "EXTERNAL_MATERIALIZATION_ENABLED";
export const EXTERNAL_SURGICAL_EDIT_FLAG = "EXTERNAL_SURGICAL_EDIT_ENABLED";

export interface FlagContext {
  apiKeyId?: number | null;
  orgId?: string | null;
}

function parseCsv(name: string): Set<string> {
  const raw = process.env[name];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function inPilot(keysEnv: string, orgsEnv: string, ctx?: FlagContext): boolean {
  if (!ctx) return false;
  if (ctx.apiKeyId != null && parseCsv(keysEnv).has(String(ctx.apiKeyId))) return true;
  if (ctx.orgId != null && parseCsv(orgsEnv).has(ctx.orgId)) return true;
  return false;
}

/** Global env flag exactly "true", or the caller is in the materialization pilot. */
export function isExternalMaterializationEnabled(ctx?: FlagContext): boolean {
  if (process.env[EXTERNAL_MATERIALIZATION_FLAG] === "true") return true;
  return inPilot(
    "EXTERNAL_MATERIALIZATION_PILOT_KEYS",
    "EXTERNAL_MATERIALIZATION_PILOT_ORGS",
    ctx,
  );
}

/** Global env flag exactly "true", or the caller is in the surgical-edit pilot. */
export function isExternalSurgicalEditEnabled(ctx?: FlagContext): boolean {
  if (process.env[EXTERNAL_SURGICAL_EDIT_FLAG] === "true") return true;
  return inPilot(
    "EXTERNAL_SURGICAL_EDIT_PILOT_KEYS",
    "EXTERNAL_SURGICAL_EDIT_PILOT_ORGS",
    ctx,
  );
}

/**
 * Whether either flag could be active anywhere (env-wide or via a non-empty
 * pilot allowlist). Used by the startup migration-readiness diagnostic, which
 * has no per-request context.
 */
export function isAnyExternalFlagPotentiallyEnabled(): boolean {
  if (isExternalMaterializationEnabled() || isExternalSurgicalEditEnabled()) return true;
  for (const name of [
    "EXTERNAL_MATERIALIZATION_PILOT_KEYS",
    "EXTERNAL_MATERIALIZATION_PILOT_ORGS",
    "EXTERNAL_SURGICAL_EDIT_PILOT_KEYS",
    "EXTERNAL_SURGICAL_EDIT_PILOT_ORGS",
  ]) {
    if (parseCsv(name).size > 0) return true;
  }
  return false;
}
