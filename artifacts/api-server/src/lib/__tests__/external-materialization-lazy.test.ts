/**
 * external-materialization-lazy.test.ts
 *
 * Unit tests for the Phase 2.3 lazy-materialization orchestrator
 * (maybeMaterializeOnEdit) and the per-program service-user resolver. All
 * collaborators are injected fakes — no route, no engine, no live DB.
 */

import { describe, it, expect, vi } from "vitest";
import { maybeMaterializeOnEdit } from "../external-materialization/lazy";
import type { RoundTripAdapterDeps } from "../external-materialization/adapter";
import {
  resolveExternalServiceUserId,
  externalServiceDeviceId,
} from "../external-materialization/service-user";

const OWNER = { apiKeyId: 7, orgId: "org-A" };

const VALID_PROGRAM_DATA = {
  programName: "P",
  days: [{ dayNumber: 1, name: "D1", exercises: [{ name: "Squat", sets: 3, reps: "5", rest: "2m" }] }],
};

/** Adapter deps whose createSystem returns a fixed id; load/serialize unused here. */
function fakeAdapterDeps(createSystem = vi.fn(async () => ({ id: 501 }))): {
  deps: RoundTripAdapterDeps;
  resolveServiceUserId: ReturnType<typeof vi.fn>;
  createSystem: ReturnType<typeof vi.fn>;
} {
  const resolveServiceUserId = vi.fn(async () => 99);
  const deps: RoundTripAdapterDeps = {
    resolveServiceUserId,
    createSystem,
    loadFullSystem: vi.fn(async () => null),
    serializeSystem: vi.fn(() => null),
  };
  return { deps, resolveServiceUserId, createSystem };
}

describe("maybeMaterializeOnEdit", () => {
  it("LAZY-01: flag off → no materialization attempted", async () => {
    const { deps, createSystem } = fakeAdapterDeps();
    const link = vi.fn(async () => {});
    const result = await maybeMaterializeOnEdit(
      { id: 1, programData: VALID_PROGRAM_DATA, trainingSystemId: null },
      OWNER,
      { enabled: false, adapterDeps: deps, link },
    );
    expect(result).toMatchObject({ attempted: false, reason: "flag_off" });
    expect(createSystem).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it("LAZY-02: flag on + no trainingSystemId → materializes once and links id", async () => {
    const { deps, resolveServiceUserId, createSystem } = fakeAdapterDeps();
    const link = vi.fn(async () => {});
    const result = await maybeMaterializeOnEdit(
      { id: 1, programData: VALID_PROGRAM_DATA, trainingSystemId: null },
      OWNER,
      { enabled: true, adapterDeps: deps, link, focusMode: "strength" },
    );
    expect(result).toMatchObject({ attempted: true, materialized: true, trainingSystemId: 501, reason: "materialized" });
    expect(resolveServiceUserId).toHaveBeenCalledWith(OWNER);
    expect(createSystem).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith(1, 501);
  });

  it("LAZY-03: flag on + existing trainingSystemId → no rematerialization", async () => {
    const { deps, createSystem } = fakeAdapterDeps();
    const link = vi.fn(async () => {});
    const result = await maybeMaterializeOnEdit(
      { id: 1, programData: VALID_PROGRAM_DATA, trainingSystemId: 42 },
      OWNER,
      { enabled: true, adapterDeps: deps, link },
    );
    expect(result).toMatchObject({ attempted: false, trainingSystemId: 42, reason: "already_materialized" });
    expect(createSystem).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it("LAZY-04: materialization failure → falls back (no throw), logs, does not link", async () => {
    const createSystem = vi.fn(async () => {
      throw new Error("boom");
    });
    const { deps } = fakeAdapterDeps(createSystem);
    const link = vi.fn(async () => {});
    const onError = vi.fn();
    const result = await maybeMaterializeOnEdit(
      { id: 1, programData: VALID_PROGRAM_DATA, trainingSystemId: null },
      OWNER,
      { enabled: true, adapterDeps: deps, link, onError },
    );
    expect(result).toMatchObject({ attempted: true, materialized: false, reason: "failed" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(link).not.toHaveBeenCalled();
  });

  it("LAZY-05: flag on + unusable program blob → not materializable, no system built", async () => {
    const { deps, createSystem } = fakeAdapterDeps();
    const link = vi.fn(async () => {});
    const result = await maybeMaterializeOnEdit(
      { id: 1, programData: {}, trainingSystemId: null },
      OWNER,
      { enabled: true, adapterDeps: deps, link },
    );
    expect(result).toMatchObject({ attempted: false, reason: "not_materializable" });
    expect(createSystem).not.toHaveBeenCalled();
  });
});

// ── Per-program service-user resolver ─────────────────────────────────────────

function makeUserDb(existingId: number | null) {
  const selectChain: any = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(async () => (existingId == null ? [] : [{ id: existingId }])),
  };
  const insertChain: any = {
    values: vi.fn(() => insertChain),
    returning: vi.fn(async () => [{ id: 777 }]),
  };
  const db = { select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) };
  return { db: db as any, insertChain, raw: db };
}

describe("resolveExternalServiceUserId", () => {
  it("SU-01: builds a stable per-program marker deviceId", () => {
    expect(externalServiceDeviceId(55)).toBe("ext_svc_program_55");
  });

  it("SU-02: returns the existing service user when present (no insert)", async () => {
    const { db, raw } = makeUserDb(321);
    const id = await resolveExternalServiceUserId(55, db);
    expect(id).toBe(321);
    expect(raw.insert).not.toHaveBeenCalled();
  });

  it("SU-03: creates a new anonymous service user when absent", async () => {
    const { db, insertChain } = makeUserDb(null);
    const id = await resolveExternalServiceUserId(55, db);
    expect(id).toBe(777);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: "ext_svc_program_55", isAnonymous: true }),
    );
  });
});
