/**
 * External program history/revert dispatcher (Phase 2.5).
 *
 * Unifies /program/:id/history and /program/:id/revert across the two backings:
 *   - trainingSystemId == null  → blob-backed (external_program_versions), exactly
 *     as before (Phase 1C). Preserved byte-for-byte.
 *   - trainingSystemId != null  → relational (system_change_log + restoreFromChange);
 *     after a relational restore, the system is reloaded, reserialized to the
 *     external program blob, and the blob is persisted so future reads stay
 *     compatible.
 *
 * Pure orchestration over injected deps (type-only imports) — unit-testable
 * without a DB/engine. The route only checks ownership and calls these.
 *
 * NOTE (Phase 2.6): the relational restore + reserialize + blob overwrite are
 * separate statements with no wrapping transaction. On a failure AFTER the
 * relational restore, the blob is left UNCHANGED (never overwritten with a
 * partial/garbage value) — no silent corruption — but the blob can transiently
 * lag the restored system. Atomicity is Phase 2.6.
 *
 * See docs/phase-2-external-surgical-edit.md §7 (Rollback) and §10 (PR 2.5).
 */

export interface OwnedProgramView {
  id: number;
  programData: unknown;
  trainingSystemId: number | null;
}

/** One history entry, shape-identical across both backings (backwards-compatible). */
export interface ExternalVersionEntry {
  versionId: number;
  type: string;
  instruction: string | null;
  scope: string | null;
  changeSummary: unknown;
  revertedFromVersionId: number | null;
  createdAt: Date | string | null;
}

/** A relational change-log entry (subset used here). */
export interface ChangeHistoryEntry {
  id: number;
  source: string;
  scope: string;
  changeSummary: string;
  requestText: string | null;
  restoredFromId: number | null;
  createdAt: Date;
}

export interface HistoryRevertDeps {
  // ── blob backing ──
  readBlobVersions: (programId: number) => Promise<ExternalVersionEntry[]>;
  findBlobVersion: (
    programId: number,
    versionId: number,
  ) => Promise<{ programSnapshot: unknown } | undefined>;
  writeBlobRevertSnapshot: (input: {
    programId: number;
    apiKeyId: number | null;
    currentProgramData: unknown;
    versionId: number;
  }) => Promise<{ id: number; createdAt: Date | null }>;
  overwriteBlob: (programId: number, programData: unknown) => Promise<void>;
  stripInternalFields: (program: unknown) => unknown;
  // ── relational backing ──
  resolveServiceUserId: (programId: number) => Promise<number>;
  readChangeHistory: (userId: number, trainingSystemId: number) => Promise<ChangeHistoryEntry[]>;
  restoreFromChange: (
    userId: number,
    changeId: number,
    trainingSystemId: number,
  ) => Promise<{ changeLogId: number }>;
  loadFullSystem: (trainingSystemId: number) => Promise<unknown | null | undefined>;
  serializeToProgram: (fullSystem: unknown) => unknown | null;
  onError?: (err: unknown, stage: string) => void;
}

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found|access denied/i.test(msg);
}

// ── History ────────────────────────────────────────────────────────────────

export interface HistoryResult {
  versions: ExternalVersionEntry[];
  backing: "blob" | "system";
}

export async function getExternalProgramHistory(
  owned: OwnedProgramView,
  deps: HistoryRevertDeps,
): Promise<HistoryResult> {
  if (owned.trainingSystemId == null) {
    return { versions: await deps.readBlobVersions(owned.id), backing: "blob" };
  }

  const userId = await deps.resolveServiceUserId(owned.id);
  const entries = await deps.readChangeHistory(userId, owned.trainingSystemId);
  const versions: ExternalVersionEntry[] = entries.map((e) => ({
    versionId: e.id,
    type: e.source,
    instruction: e.requestText,
    scope: e.scope,
    changeSummary: e.changeSummary,
    revertedFromVersionId: e.restoredFromId,
    createdAt: e.createdAt,
  }));
  return { versions, backing: "system" };
}

// ── Revert ─────────────────────────────────────────────────────────────────

export interface RevertContext {
  versionId: number;
  apiKeyId: number | null;
}

export interface RevertChangeReceipt {
  versionId: number | null;
  type: "revert";
  revertedFromVersionId: number;
  snapshotAt: Date | string | null;
}

export type RevertOutcome =
  | {
      ok: true;
      updatedProgram: unknown;
      revertedFromVersionId: number;
      version: number | null;
      changeReceipt: RevertChangeReceipt;
      backing: "blob" | "system";
    }
  | { ok: false; code: "NOT_FOUND"; message: string }
  | { ok: false; code: "REVERT_FAILED"; message: string };

export async function revertExternalProgramVersion(
  owned: OwnedProgramView,
  ctx: RevertContext,
  deps: HistoryRevertDeps,
): Promise<RevertOutcome> {
  const { versionId, apiKeyId } = ctx;

  // ── Blob backing (Phase 1C behavior, preserved exactly) ──
  if (owned.trainingSystemId == null) {
    const version = await deps.findBlobVersion(owned.id, versionId);
    if (!version) {
      return { ok: false, code: "NOT_FOUND", message: "Version not found." };
    }
    const revert = await deps.writeBlobRevertSnapshot({
      programId: owned.id,
      apiKeyId,
      currentProgramData: owned.programData,
      versionId,
    });
    const restoredProgram = deps.stripInternalFields(version.programSnapshot);
    await deps.overwriteBlob(owned.id, restoredProgram);
    return {
      ok: true,
      updatedProgram: restoredProgram,
      revertedFromVersionId: versionId,
      version: revert.id,
      changeReceipt: {
        versionId: revert.id,
        type: "revert",
        revertedFromVersionId: versionId,
        snapshotAt: revert.createdAt,
      },
      backing: "blob",
    };
  }

  // ── Relational backing ──
  const trainingSystemId = owned.trainingSystemId;
  let restore: { changeLogId: number };
  try {
    const userId = await deps.resolveServiceUserId(owned.id);
    restore = await deps.restoreFromChange(userId, versionId, trainingSystemId);
  } catch (err) {
    deps.onError?.(err, "restore");
    // The relational restore failed → the blob is left UNCHANGED (no corruption).
    if (isNotFoundError(err)) {
      return { ok: false, code: "NOT_FOUND", message: "Version not found." };
    }
    return { ok: false, code: "REVERT_FAILED", message: "Revert failed." };
  }

  // Reserialize the restored system into the blob. On failure, do NOT overwrite
  // the blob (never persist a partial/garbage value).
  try {
    const fullSystem = await deps.loadFullSystem(trainingSystemId);
    if (!fullSystem) {
      deps.onError?.(new Error("system missing after restore"), "reload");
      return { ok: false, code: "REVERT_FAILED", message: "Revert failed." };
    }
    const updatedProgram = deps.serializeToProgram(fullSystem);
    if (!updatedProgram) {
      deps.onError?.(new Error("could not reserialize system"), "serialize");
      return { ok: false, code: "REVERT_FAILED", message: "Revert failed." };
    }
    await deps.overwriteBlob(owned.id, updatedProgram);
    return {
      ok: true,
      updatedProgram,
      revertedFromVersionId: versionId,
      version: restore.changeLogId ?? null,
      changeReceipt: {
        versionId: restore.changeLogId ?? null,
        type: "revert",
        revertedFromVersionId: versionId,
        snapshotAt: null,
      },
      backing: "system",
    };
  } catch (err) {
    deps.onError?.(err, "persist");
    return { ok: false, code: "REVERT_FAILED", message: "Revert failed." };
  }
}
