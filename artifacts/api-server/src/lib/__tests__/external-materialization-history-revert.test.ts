/**
 * external-materialization-history-revert.test.ts
 *
 * Unit tests for the Phase 2.5 history/revert dispatcher. All collaborators are
 * injected fakes; both backings (blob vs relational) are exercised without a DB
 * or engine. Proves dispatch, mapping, and — critically — that a failed
 * relational restore never overwrites the blob.
 */

import { describe, it, expect, vi } from "vitest";
import {
  getExternalProgramHistory,
  revertExternalProgramVersion,
  type HistoryRevertDeps,
} from "../external-materialization/history-revert";

const OLD = { programName: "Old", days: [] };
const RESTORED = { programName: "Restored", days: [] };

const BLOB_VERSION = {
  versionId: 3,
  type: "edit",
  instruction: "x",
  scope: null,
  changeSummary: [],
  revertedFromVersionId: null,
  createdAt: "2026-02-01",
};

const CHANGE_ENTRY = {
  id: 11,
  source: "ai_edit",
  scope: "week",
  changeSummary: "Reduced volume",
  requestText: "reduce volume",
  restoredFromId: null,
  createdAt: new Date("2026-02-02T00:00:00Z"),
};

function makeDeps(overrides: Partial<HistoryRevertDeps> = {}): HistoryRevertDeps {
  return {
    readBlobVersions: vi.fn(async () => [BLOB_VERSION]),
    findBlobVersion: vi.fn(async () => ({ programSnapshot: OLD })),
    writeBlobRevertSnapshot: vi.fn(async () => ({ id: 500, createdAt: new Date("2026-03-01") })),
    overwriteBlob: vi.fn(async () => {}),
    stripInternalFields: (p) => p,
    resolveServiceUserId: vi.fn(async () => 99),
    readChangeHistory: vi.fn(async () => [CHANGE_ENTRY]),
    restoreFromChange: vi.fn(async () => ({ changeLogId: 4242 })),
    loadFullSystem: vi.fn(async () => ({ id: 909 })),
    serializeToProgram: vi.fn(() => RESTORED),
    onError: vi.fn(),
    ...overrides,
  };
}

const BLOB_PROGRAM = { id: 100, programData: {}, trainingSystemId: null };
const MAT_PROGRAM = { id: 100, programData: {}, trainingSystemId: 909 };

describe("getExternalProgramHistory", () => {
  it("HR-01: blob-backed reads external_program_versions", async () => {
    const deps = makeDeps();
    const result = await getExternalProgramHistory(BLOB_PROGRAM, deps);
    expect(result.backing).toBe("blob");
    expect(result.versions).toEqual([BLOB_VERSION]);
    expect(deps.readChangeHistory).not.toHaveBeenCalled();
  });

  it("HR-02: materialized reads system change log and maps entries", async () => {
    const deps = makeDeps();
    const result = await getExternalProgramHistory(MAT_PROGRAM, deps);
    expect(result.backing).toBe("system");
    expect(deps.resolveServiceUserId).toHaveBeenCalledWith(100);
    expect(deps.readChangeHistory).toHaveBeenCalledWith(99, 909);
    expect(deps.readBlobVersions).not.toHaveBeenCalled();
    expect(result.versions[0]).toEqual({
      versionId: 11,
      type: "ai_edit",
      instruction: "reduce volume",
      scope: "week",
      changeSummary: "Reduced volume",
      revertedFromVersionId: null,
      createdAt: CHANGE_ENTRY.createdAt,
    });
  });
});

describe("revertExternalProgramVersion", () => {
  const CTX = { versionId: 7, apiKeyId: 1 };

  it("HR-03: blob-backed writes revert snapshot and overwrites blob", async () => {
    const deps = makeDeps();
    const out = await revertExternalProgramVersion(BLOB_PROGRAM, CTX, deps);
    expect(out).toMatchObject({ ok: true, updatedProgram: OLD, revertedFromVersionId: 7, version: 500, backing: "blob" });
    expect(deps.writeBlobRevertSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.overwriteBlob).toHaveBeenCalledWith(100, OLD);
    expect(deps.restoreFromChange).not.toHaveBeenCalled();
  });

  it("HR-04: blob-backed unknown version → NOT_FOUND, no write", async () => {
    const deps = makeDeps({ findBlobVersion: vi.fn(async () => undefined) });
    const out = await revertExternalProgramVersion(BLOB_PROGRAM, CTX, deps);
    expect(out).toEqual({ ok: false, code: "NOT_FOUND", message: "Version not found." });
    expect(deps.overwriteBlob).not.toHaveBeenCalled();
  });

  it("HR-05: materialized restores relationally, reserializes, persists blob", async () => {
    const deps = makeDeps();
    const out = await revertExternalProgramVersion(MAT_PROGRAM, CTX, deps);
    expect(out).toMatchObject({ ok: true, updatedProgram: RESTORED, revertedFromVersionId: 7, version: 4242, backing: "system" });
    expect(deps.restoreFromChange).toHaveBeenCalledWith(99, 7, 909);
    expect(deps.loadFullSystem).toHaveBeenCalledWith(909);
    expect(deps.overwriteBlob).toHaveBeenCalledWith(100, RESTORED);
    // Materialized revert does NOT write a blob version row.
    expect(deps.writeBlobRevertSnapshot).not.toHaveBeenCalled();
  });

  it("HR-06: materialized restore not-found → NOT_FOUND, blob untouched", async () => {
    const deps = makeDeps({
      restoreFromChange: vi.fn(async () => {
        throw new Error("Change log entry 7 not found or access denied");
      }),
    });
    const out = await revertExternalProgramVersion(MAT_PROGRAM, CTX, deps);
    expect(out).toEqual({ ok: false, code: "NOT_FOUND", message: "Version not found." });
    expect(deps.overwriteBlob).not.toHaveBeenCalled();
  });

  it("HR-07: materialized restore error → REVERT_FAILED, blob untouched", async () => {
    const deps = makeDeps({
      restoreFromChange: vi.fn(async () => {
        throw new Error("db exploded");
      }),
    });
    const out = await revertExternalProgramVersion(MAT_PROGRAM, CTX, deps);
    expect(out).toEqual({ ok: false, code: "REVERT_FAILED", message: "Revert failed." });
    expect(deps.overwriteBlob).not.toHaveBeenCalled();
  });

  it("HR-08: reserialization failure after restore → REVERT_FAILED, blob not corrupted", async () => {
    const deps = makeDeps({ serializeToProgram: vi.fn(() => null) });
    const out = await revertExternalProgramVersion(MAT_PROGRAM, CTX, deps);
    expect(out).toEqual({ ok: false, code: "REVERT_FAILED", message: "Revert failed." });
    expect(deps.overwriteBlob).not.toHaveBeenCalled();
  });
});
