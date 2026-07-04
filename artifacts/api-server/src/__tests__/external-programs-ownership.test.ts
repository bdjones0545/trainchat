/**
 * external-programs-ownership.test.ts
 *
 * P0 IDOR regression tests for artifacts/api-server/src/routes/external/programs.ts.
 *
 * Before this fix, GET /program/:id, POST /program/edit, and POST /program/explain
 * looked up external_programs by primary key alone — any valid API key could read
 * or edit another tenant's program by iterating integer ids. `findOwnedProgram`
 * now scopes every lookup to the caller's API key (or shared orgId).
 *
 * Strategy:
 *   - Mount the router in a minimal Express app and drive it with supertest.
 *   - Mock the external-api-auth middleware so each test can switch the caller
 *     identity (`authState.apiKey`) without a real key/hash.
 *   - Mock the db so the join query returns a program owned by KEY_A; the
 *     ownership DECISION is exercised for real inside findOwnedProgram.
 *   - Mock generateAIResponse so we can assert it is NEVER reached on a denied
 *     edit (no work is done for a cross-tenant caller).
 *
 * Coverage:
 *   OWN-01  Owner key can GET its own program (200)
 *   OWN-02  Owner key can edit its own program (200)
 *   OWN-03  Owner key can explain its own program (200)
 *   OWN-04  Non-owner (different org) cannot GET → 404 NOT_FOUND (not 403)
 *   OWN-05  Non-owner cannot edit → 404, generateAIResponse never called
 *   OWN-06  Non-owner cannot explain → 404
 *   OWN-07  Key sharing the owner's orgId is allowed (200)
 *   OWN-08  No existence leakage: cross-tenant 404 body === missing-program 404 body
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";
import {
  TRAINING_SYSTEM_LOCK_CLASS,
  EXTERNAL_PROGRAM_LOCK_CLASS,
} from "../lib/advisory-lock";

// ── Hoisted state & mocks ──────────────────────────────────────────────────────

const {
  authState,
  mockDb,
  mockGenerateAIResponse,
  mockMaybeMaterialize,
  mockSurgical,
  mockSurgicalEnabled,
  mockSystemDeps,
  mockReloadTsid,
  mockEmit,
} = vi.hoisted(() => {
  // A fluent Drizzle chain that is itself a Promise resolving to `rows`. Every
  // builder method (.from/.leftJoin/.where/.orderBy/.limit/.values/.returning)
  // returns the same chain, so any query shape used by the route resolves to
  // `rows` when awaited.
  function chainResult(rows: unknown): any {
    const chain: any = Promise.resolve(rows);
    for (const m of [
      "from",
      "leftJoin",
      "innerJoin",
      "where",
      "orderBy",
      "groupBy",
      "limit",
      "set",
      "values",
      "returning",
    ]) {
      chain[m] = vi.fn(() => chain);
    }
    return chain;
  }

  const mockDb: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    // Advisory-lock acquisition (F9) issues tx.execute(sql`SELECT pg_advisory_xact_lock(...)`)
    // inside the blob transaction — a no-op here.
    execute: vi.fn(async () => ({ rows: [] })),
    // Test helper: build a chain resolving to `rows`.
    _rows: chainResult,
  };
  // db.transaction(fn) runs fn with the same mock (tx === db) so grouped writes
  // use the same insert/update spies.
  mockDb.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));

  return {
    // Mutable caller identity injected by the mocked auth middleware.
    authState: { apiKey: null as null | { id: number; orgId: string | null } },
    mockDb,
    mockGenerateAIResponse: vi.fn(),
    mockMaybeMaterialize: vi.fn(
      async (
        _program?: unknown,
        _owner?: unknown,
        _deps?: unknown,
      ): Promise<{
        attempted: boolean;
        materialized: boolean;
        trainingSystemId: number | null;
        reason: string;
      }> => ({
        attempted: false,
        materialized: false,
        trainingSystemId: null,
        reason: "flag_off",
      }),
    ),
    mockSurgical: vi.fn(
      async (
        _params?: unknown,
        _deps?: unknown,
      ): Promise<
        | { ok: true; result: { updatedProgram: unknown; changes: string[]; coachSummary: string } }
        | { ok: false; committed: boolean; stage: string }
      > => ({ ok: false, committed: false, stage: "interpret" }),
    ),
    mockSurgicalEnabled: vi.fn((): boolean => false),
    // Phase 2.5 relational history/revert collaborators (injected via the
    // system-deps factory), controllable per test.
    mockSystemDeps: {
      resolveServiceUserId: vi.fn(async () => 99),
      readChangeHistory: vi.fn(async () => [] as any[]),
      restoreFromChange: vi.fn(async () => ({ changeLogId: 4242 })),
      loadFullSystem: vi.fn(async () => ({ id: 909 }) as any),
      serializeToProgram: vi.fn(() => ({ programName: "Restored", days: [] }) as any),
    },
    // Phase 2.6 fresh-read of the trainingSystemId under the lock.
    mockReloadTsid: vi.fn(async (): Promise<number | null> => null),
    // Phase 2.7 observability emitter.
    mockEmit: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  externalProgramsTable: { id: "id", apiKeyId: "apiKeyId", programData: "programData" },
  externalApiKeysTable: { id: "id", orgId: "orgId" },
  externalProgramVersionsTable: {
    id: "id",
    externalProgramId: "externalProgramId",
    apiKeyId: "apiKeyId",
    programSnapshot: "programSnapshot",
    type: "type",
    instruction: "instruction",
    scope: "scope",
    changeSummary: "changeSummary",
    revertedFromVersionId: "revertedFromVersionId",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ __eq: val })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  // Advisory-lock helper (F9) builds its statement with the sql template tag.
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: strings.join("$"),
    values,
  })),
}));

// Mock the auth middleware so each test controls the caller identity.
vi.mock("../middlewares/external-api-auth", () => ({
  validateExternalApiKey: () => (req: any, _res: any, next: any) => {
    req.apiKey = authState.apiKey;
    req.apiKeyId = authState.apiKey?.id;
    next();
  },
}));

vi.mock("../lib/ai", () => ({
  generateAIResponse: mockGenerateAIResponse,
}));

// Phase 2.3: stub the materialization module so the edit route's flagged
// side-effect call is observable without pulling the real engine/DB.
vi.mock("../lib/external-materialization", () => ({
  isExternalMaterializationEnabled: vi.fn(() => false),
  isExternalSurgicalEditEnabled: mockSurgicalEnabled,
  createDefaultRoundTripDeps: vi.fn(() => ({})),
  createDefaultSurgicalDeps: vi.fn(() => ({})),
  resolveExternalServiceUserId: vi.fn(async () => 1),
  maybeMaterializeOnEdit: mockMaybeMaterialize,
  maybeApplySurgicalExternalEdit: mockSurgical,
  emitExternalEvent: mockEmit,
}));

// Phase 2.5: mock only the relational deps FACTORY (which imports the engine),
// so the pure history/revert dispatcher runs for real while the blob path uses
// the mocked db and the relational path uses controllable fakes.
vi.mock("../lib/external-materialization/history-revert-deps", () => ({
  createHistoryRevertSystemDeps: () => mockSystemDeps,
}));

// Phase 2.6: mock the fresh-read helper (which imports @workspace/db) so the
// lock's re-read is controllable without perturbing the select sequence. The
// serialization lock itself is imported real (transparent — just serializes).
vi.mock("../lib/external-materialization/program-store", () => ({
  reloadExternalTrainingSystemId: mockReloadTsid,
}));

vi.mock("../lib/exercise-service", () => ({
  getSwapCandidates: vi.fn().mockResolvedValue([]),
  findExerciseByName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/swap-backstop-service", () => ({
  resolveSafeSwapBackstop: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const KEY_A = { id: 1, orgId: "org-A" };
const KEY_B_OTHER_ORG = { id: 2, orgId: "org-B" };
const KEY_C_SAME_ORG = { id: 3, orgId: "org-A" };

const PROGRAM_DATA = {
  programName: "Test Program",
  description: "A program",
  whyItWorks: "because",
  progressionStrategy: "linear",
  intelligenceStatus: {},
  days: [],
};

// Program owned by KEY_A; the join yields the owning key's orgId.
const OWNED_ROW = {
  program: {
    id: 100,
    apiKeyId: KEY_A.id,
    programData: PROGRAM_DATA,
    trainingSystemId: null,
    requestContext: { goal: "x" },
    summary: "A program",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  ownerOrgId: KEY_A.orgId,
};

// A version row inserted by snapshot-before-edit / revert (.returning() result).
const INSERTED_VERSION = { id: 500, createdAt: new Date("2026-02-01T00:00:00Z") };

// A stored external_programs row (.returning() result on generate).
const STORED_PROGRAM = { id: 100, generatedAt: new Date("2026-01-01T00:00:00Z") };

// The canonical not-found body every denied/missing lookup must return.
const NOT_FOUND_BODY = {
  success: false,
  data: null,
  meta: null,
  error: { code: "NOT_FOUND", message: "Program not found." },
};

// ── Harness ───────────────────────────────────────────────────────────────────

async function makeApp() {
  const router = (await import("../routes/external/programs")).default;
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

/**
 * Default DB wiring: the program exists and is owned by KEY_A. `select` returns
 * the owned join row (findOwnedProgram); `insert().returning()` yields a version
 * row; `update` resolves. Tests that need a second, differently-shaped select
 * (history list, revert version lookup) queue it with `mockReturnValueOnce`
 * BEFORE the fallback set here is consumed.
 */
function programExists() {
  mockDb.select.mockReturnValue(mockDb._rows([OWNED_ROW]));
  mockDb.insert.mockReturnValue(mockDb._rows([INSERTED_VERSION]));
  mockDb.update.mockReturnValue(mockDb._rows(undefined));
}

/** No such program id in the DB (join returns nothing). */
function programMissing() {
  mockDb.select.mockReturnValue(mockDb._rows([]));
  mockDb.insert.mockReturnValue(mockDb._rows([INSERTED_VERSION]));
  mockDb.update.mockReturnValue(mockDb._rows(undefined));
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) flushes the mockReturnValueOnce queue,
  // so a select sequenced in one test can never contaminate the next.
  vi.resetAllMocks();
  authState.apiKey = null;
  mockGenerateAIResponse.mockResolvedValue({
    structuredData: { ...PROGRAM_DATA },
    changeSummary: ["Adjusted volume"],
    content: "Done.",
  });
  mockMaybeMaterialize.mockResolvedValue({
    attempted: false,
    materialized: false,
    trainingSystemId: null,
    reason: "flag_off",
  });
  mockSurgicalEnabled.mockReturnValue(false);
  mockSurgical.mockResolvedValue({ ok: false, committed: false, stage: "interpret" });
  // resetAllMocks clears the vi.fn impls on mockSystemDeps — re-seed defaults.
  mockSystemDeps.resolveServiceUserId.mockResolvedValue(99);
  mockSystemDeps.readChangeHistory.mockResolvedValue([]);
  mockSystemDeps.restoreFromChange.mockResolvedValue({ changeLogId: 4242 });
  mockSystemDeps.loadFullSystem.mockResolvedValue({ id: 909 });
  mockSystemDeps.serializeToProgram.mockReturnValue({ programName: "Restored", days: [] });
  mockReloadTsid.mockResolvedValue(null);
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("external programs — ownership scoping (P0 IDOR)", () => {
  it("OWN-01: owner key can retrieve its own program", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .get("/api/external/program/100")
      .set("Authorization", "Bearer tc_owner");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.programId).toBe(100);
  });

  it("OWN-02: owner key can edit its own program", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1);
  });

  it("OWN-03: owner key can explain its own program", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .post("/api/external/program/explain")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("OWN-04: non-owner (different org) cannot retrieve → 404 NOT_FOUND, not 403", async () => {
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const res = await supertest(await makeApp())
      .get("/api/external/program/100")
      .set("Authorization", "Bearer tc_intruder");
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(res.body).toEqual(NOT_FOUND_BODY);
  });

  it("OWN-05: non-owner cannot edit → 404 and generation never runs", async () => {
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_intruder")
      .send({ programId: 100, instruction: "sabotage" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    // No program mutation work is done for an unauthorized caller.
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("OWN-06: non-owner cannot explain → 404", async () => {
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const res = await supertest(await makeApp())
      .post("/api/external/program/explain")
      .set("Authorization", "Bearer tc_intruder")
      .send({ programId: 100 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
  });

  it("OWN-07: a key sharing the owner's orgId is allowed", async () => {
    programExists();
    authState.apiKey = KEY_C_SAME_ORG;
    const res = await supertest(await makeApp())
      .get("/api/external/program/100")
      .set("Authorization", "Bearer tc_sameorg");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.programId).toBe(100);
  });

  it("OWN-08: no existence leak — cross-tenant 404 is byte-identical to missing-program 404", async () => {
    // Cross-tenant: program exists but caller is another org.
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const crossTenant = await supertest(await makeApp())
      .get("/api/external/program/100")
      .set("Authorization", "Bearer tc_intruder");

    // Genuinely missing program for the legitimate owner.
    programMissing();
    authState.apiKey = KEY_A;
    const missing = await supertest(await makeApp())
      .get("/api/external/program/999")
      .set("Authorization", "Bearer tc_owner");

    expect(crossTenant.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(crossTenant.body).toEqual(missing.body);
    expect(crossTenant.body).toEqual(NOT_FOUND_BODY);
  });
});

/**
 * Phase 1D — fail loudly when an edit yields no structured program.
 *
 * Previously /program/edit fell back to the unchanged program and reported
 * success when generateAIResponse returned no structuredData — a false-positive
 * edit. It must now return 422 EDIT_FAILED and leave programData untouched.
 *
 *   EDIT-01  no structuredData → 422 EDIT_FAILED, success:false
 *   EDIT-02  no structuredData → programData is NOT updated (db.update unused)
 *   EDIT-03  valid structuredData → 200 with updatedProgram/changes/coachSummary
 *   EDIT-04  ownership is enforced BEFORE generation (cross-tenant → 404, no AI call)
 */
describe("external programs — edit fail-loud on no structuredData (Phase 1D)", () => {
  it("EDIT-01: no structuredData returns 422 EDIT_FAILED with success:false", async () => {
    programExists();
    authState.apiKey = KEY_A;
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: null,
      changeSummary: [],
      content: "I couldn't apply that.",
    });
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "do something impossible" });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe("EDIT_FAILED");
    expect(typeof res.body.error.message).toBe("string");
  });

  it("EDIT-02: no structuredData leaves programData unchanged (db.update not called)", async () => {
    programExists();
    authState.apiKey = KEY_A;
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: null,
      changeSummary: [],
      content: "no-op",
    });
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "unclear" });
    expect(res.status).toBe(422);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("EDIT-03: valid structuredData still returns 200 with the success shape", async () => {
    programExists();
    authState.apiKey = KEY_A;
    // beforeEach default already returns valid structuredData, but be explicit.
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: { ...PROGRAM_DATA },
      changeSummary: ["Reduced volume"],
      content: "Done.",
    });
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("updatedProgram");
    expect(res.body.data).toHaveProperty("changes");
    expect(res.body.data).toHaveProperty("coachSummary");
    expect(res.body.data.changes).toEqual(["Reduced volume"]);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("EDIT-04: ownership is enforced before generation — cross-tenant edit never reaches the AI", async () => {
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_intruder")
      .send({ programId: 100, instruction: "reduce volume" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/**
 * Phase 1C — append-only version history + rollback.
 *
 *   VER-01  edit writes a pre-overwrite version snapshot, before update, with
 *           additive version/changeReceipt fields (existing fields intact)
 *   VER-02  history returns version rows for an owned program
 *   VER-03  history denied cross-tenant → 404 (versions never queried)
 *   VER-04  revert restores the selected snapshot into programData
 *   VER-05  revert writes a new "revert" version row BEFORE restoring
 *   VER-06  revert denied cross-tenant → 404 (no version row, no update)
 *   VER-07  revert with a version from another program → 404 (no write)
 *   VER-08  no-structuredData edit → 422 and NO version row written
 */
describe("external programs — version history & revert (Phase 1C)", () => {
  const OLD_PROGRAM = {
    programName: "Old Program",
    description: "prior state",
    whyItWorks: "prior",
    progressionStrategy: "linear",
    intelligenceStatus: {},
    days: [],
  };

  it("VER-01: edit snapshots the pre-edit program before overwriting, and adds version + changeReceipt", async () => {
    mockDb.select.mockReturnValue(mockDb._rows([OWNED_ROW]));
    const insertChain = mockDb._rows([INSERTED_VERSION]);
    mockDb.insert.mockReturnValue(insertChain);
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: { ...PROGRAM_DATA },
      changeSummary: ["Reduced volume"],
      content: "Done.",
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume", scope: "week" });

    expect(res.status).toBe(200);
    // A snapshot of the PRE-edit program is written as an "edit" version...
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProgramId: 100,
        programSnapshot: PROGRAM_DATA,
        type: "edit",
        instruction: "reduce volume",
        scope: "week",
      }),
    );
    // ...before the program row is overwritten.
    expect(mockDb.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.update.mock.invocationCallOrder[0],
    );
    // Existing success fields remain (backwards-compatible)...
    expect(res.body.data).toHaveProperty("updatedProgram");
    expect(res.body.data.changes).toEqual(["Reduced volume"]);
    expect(res.body.data).toHaveProperty("coachSummary");
    // ...plus the additive version + changeReceipt.
    expect(res.body.data.version).toBe(INSERTED_VERSION.id);
    expect(res.body.data.changeReceipt.versionId).toBe(INSERTED_VERSION.id);
    expect(res.body.data.changeReceipt.type).toBe("edit");
  });

  it("VER-02: history returns version rows for an owned program", async () => {
    const VERSIONS = [
      { versionId: 2, type: "edit", instruction: "b", scope: null, changeSummary: [], createdAt: "2026-02-02" },
      { versionId: 1, type: "edit", instruction: "a", scope: null, changeSummary: [], createdAt: "2026-02-01" },
    ];
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW])) // findOwnedProgram
      .mockReturnValueOnce(mockDb._rows(VERSIONS)); // version list
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_owner");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.programId).toBe(100);
    expect(res.body.data.versions).toHaveLength(2);
    expect(res.body.data.versions[0].versionId).toBe(2);
  });

  it("VER-03: history denied cross-tenant → 404, versions never queried", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([OWNED_ROW])); // findOwnedProgram only
    authState.apiKey = KEY_B_OTHER_ORG;

    const res = await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_intruder");

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    // Only the ownership lookup ran; the version list was never queried.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("VER-04: revert restores the selected snapshot into programData", async () => {
    const VERSION_ROW = { id: 7, externalProgramId: 100, programSnapshot: OLD_PROGRAM, type: "edit" };
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW])) // findOwnedProgram
      .mockReturnValueOnce(mockDb._rows([VERSION_ROW])); // target version
    mockDb.insert.mockReturnValue(mockDb._rows([INSERTED_VERSION]));
    const updateChain = mockDb._rows(undefined);
    mockDb.update.mockReturnValue(updateChain);
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 7 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedProgram).toEqual(OLD_PROGRAM);
    expect(res.body.data.revertedFromVersionId).toBe(7);
    expect(res.body.data.version).toBe(INSERTED_VERSION.id);
    // programData is overwritten with the restored snapshot.
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ programData: OLD_PROGRAM }),
    );
  });

  it("VER-05: revert writes a new 'revert' version row before restoring", async () => {
    const VERSION_ROW = { id: 7, externalProgramId: 100, programSnapshot: OLD_PROGRAM, type: "edit" };
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW]))
      .mockReturnValueOnce(mockDb._rows([VERSION_ROW]));
    const insertChain = mockDb._rows([INSERTED_VERSION]);
    mockDb.insert.mockReturnValue(insertChain);
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 7 });

    expect(res.status).toBe(200);
    // A "revert" snapshot of the CURRENT program is written...
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProgramId: 100,
        programSnapshot: PROGRAM_DATA, // current state before rollback
        type: "revert",
        revertedFromVersionId: 7,
      }),
    );
    // ...before the restore overwrite.
    expect(mockDb.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.update.mock.invocationCallOrder[0],
    );
  });

  it("VER-06: revert denied cross-tenant → 404, no version row, no update", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([OWNED_ROW])); // findOwnedProgram (owned by A)
    mockDb.insert.mockReturnValue(mockDb._rows([INSERTED_VERSION]));
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    authState.apiKey = KEY_B_OTHER_ORG;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_intruder")
      .send({ versionId: 7 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("VER-07: revert with a version from another program → 404, no write", async () => {
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW])) // findOwnedProgram OK
      .mockReturnValueOnce(mockDb._rows([])); // version scoped to THIS program → none
    mockDb.insert.mockReturnValue(mockDb._rows([INSERTED_VERSION]));
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("VER-08: no-structuredData edit → 422 and NO version row written", async () => {
    programExists();
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: null,
      changeSummary: [],
      content: "couldn't apply",
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "impossible" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EDIT_FAILED");
    // Fail-loud precedes any version write.
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/**
 * Phase 1B/1E — creation-time ownership + attribution hardening.
 *
 *   GEN-01  generate stores apiKeyId and attributes AI context to createdBy
 *   GEN-02  stream generate stores apiKeyId
 *   GEN-03  createdBy=null → service user (-1), NOT a silent fallback to user 1
 *   GEN-04  generate writes a "generate_snapshot" baseline version row
 *   GEN-05  a failing baseline snapshot is non-fatal (generation still 201)
 */
describe("external programs — creation & attribution hardening (Phase 1B/1E)", () => {
  const KEY_WITH_CREATOR = { id: 7, orgId: "org-A", createdBy: 42 };
  const KEY_NO_CREATOR = { id: 8, orgId: "org-A", createdBy: null };
  const EXTERNAL_API_SERVICE_USER_ID = -1;

  function setupGenerate() {
    const insertChain = mockDb._rows([STORED_PROGRAM]);
    mockDb.insert.mockReturnValue(insertChain);
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: { ...PROGRAM_DATA },
      changeSummary: [],
      content: "generated",
    });
    return insertChain;
  }

  it("GEN-01: generate stores apiKeyId and attributes AI context to createdBy", async () => {
    const insertChain = setupGenerate();
    authState.apiKey = KEY_WITH_CREATOR;

    const res = await supertest(await makeApp())
      .post("/api/external/program/generate")
      .set("Authorization", "Bearer tc_key")
      .send({ goal: "build strength" });

    expect(res.status).toBe(201);
    // external_programs insert carries the caller's apiKeyId.
    expect(insertChain.values.mock.calls[0][0]).toEqual(
      expect.objectContaining({ apiKeyId: 7 }),
    );
    // AI context is attributed to the key's creator (userId = 3rd arg).
    expect(mockGenerateAIResponse.mock.calls[0][2]).toBe(42);
  });

  it("GEN-02: stream generate stores apiKeyId", async () => {
    const insertChain = setupGenerate();
    authState.apiKey = KEY_WITH_CREATOR;

    const res = await supertest(await makeApp())
      .post("/api/external/program/generate/stream")
      .set("Authorization", "Bearer tc_key")
      .send({ goal: "build strength" });

    expect(res.status).toBe(200);
    expect(insertChain.values.mock.calls[0][0]).toEqual(
      expect.objectContaining({ apiKeyId: 7 }),
    );
  });

  it("GEN-03: createdBy=null attributes to the service user, never silently to user 1", async () => {
    setupGenerate();
    authState.apiKey = KEY_NO_CREATOR;

    const res = await supertest(await makeApp())
      .post("/api/external/program/generate")
      .set("Authorization", "Bearer tc_key")
      .send({ goal: "build strength" });

    expect(res.status).toBe(201);
    const userIdArg = mockGenerateAIResponse.mock.calls[0][2];
    expect(userIdArg).not.toBe(1); // the old silent leak
    expect(userIdArg).toBe(EXTERNAL_API_SERVICE_USER_ID);
  });

  it("GEN-04: generate writes a generate_snapshot baseline version row", async () => {
    const insertChain = setupGenerate();
    authState.apiKey = KEY_WITH_CREATOR;

    await supertest(await makeApp())
      .post("/api/external/program/generate")
      .set("Authorization", "Bearer tc_key")
      .send({ goal: "build strength" });

    // Second insert is the baseline snapshot.
    expect(insertChain.values.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        externalProgramId: STORED_PROGRAM.id,
        apiKeyId: 7,
        type: "generate_snapshot",
      }),
    );
  });

  it("GEN-05: a failing baseline snapshot is non-fatal — generation still returns 201", async () => {
    // First insert (external_programs) succeeds; second (snapshot) rejects.
    const programChain = mockDb._rows([STORED_PROGRAM]);
    const throwingChain: any = { values: vi.fn(() => Promise.reject(new Error("boom"))) };
    mockDb.insert
      .mockReturnValueOnce(programChain)
      .mockReturnValueOnce(throwingChain);
    mockGenerateAIResponse.mockResolvedValue({
      structuredData: { ...PROGRAM_DATA },
      changeSummary: [],
      content: "generated",
    });
    authState.apiKey = KEY_WITH_CREATOR;

    const res = await supertest(await makeApp())
      .post("/api/external/program/generate")
      .set("Authorization", "Bearer tc_key")
      .send({ goal: "build strength" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(throwingChain.values).toHaveBeenCalled();
  });
});

/**
 * Phase 2.3 — lazy materialization on edit (flag-gated, best-effort side effect).
 *
 * The materialization module is mocked; these assert the ROUTE wiring: it is
 * invoked only after ownership passes, and it never changes the edit response.
 *
 *   MAT-01  edit runs materialization after ownership; response stays compatible
 *   MAT-02  cross-tenant edit → 404 and materialization is NEVER attempted
 *   MAT-03  materialization result does not alter the version snapshot / overwrite
 */
describe("external programs — lazy materialization wiring (Phase 2.3)", () => {
  it("MAT-01: owner edit invokes materialization, response stays backwards-compatible", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    // Materialization was invoked once, with the stored program + owner context.
    expect(mockMaybeMaterialize).toHaveBeenCalledTimes(1);
    const [programArg, ownerArg] = mockMaybeMaterialize.mock.calls[0];
    expect(programArg).toMatchObject({ id: 100, trainingSystemId: null });
    expect(ownerArg).toEqual({ apiKeyId: 1, orgId: "org-A" });
    // Existing edit contract is unchanged.
    expect(res.body.data).toHaveProperty("updatedProgram");
    expect(res.body.data).toHaveProperty("changes");
    expect(res.body.data).toHaveProperty("coachSummary");
    expect(res.body.data).toHaveProperty("version");
    expect(res.body.data).toHaveProperty("changeReceipt");
  });

  it("MAT-02: cross-tenant edit → 404 and materialization is never attempted", async () => {
    programExists();
    authState.apiKey = KEY_B_OTHER_ORG;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_intruder")
      .send({ programId: 100, instruction: "sabotage" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    // Ownership gate precedes materialization.
    expect(mockMaybeMaterialize).not.toHaveBeenCalled();
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
  });

  it("MAT-03: a materialized result still writes the version snapshot and overwrite", async () => {
    programExists();
    // Simulate the flag on + a successful materialization.
    mockMaybeMaterialize.mockResolvedValue({
      attempted: true,
      materialized: true,
      trainingSystemId: 909,
      reason: "materialized",
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    // The existing regeneration edit path still runs: LLM called, version row
    // inserted, program overwritten.
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1); // snapshot-before-edit
    expect(mockDb.update).toHaveBeenCalledTimes(1); // programData overwrite
  });
});

/**
 * Phase 2.4 — surgical edit path (flag-gated; falls back to regeneration).
 *
 *   SURG-R01  flag off → regeneration used, surgical never called
 *   SURG-R02  flag on + no trainingSystemId → falls back to regeneration
 *   SURG-R03  flag on + trainingSystemId + surgical success → surgical response,
 *             LLM NOT called, version snapshot + overwrite written
 *   SURG-R04  surgical failure → falls back to regeneration
 *   SURG-R05  cross-tenant edit → 404; neither bridge nor surgical is attempted
 */
describe("external programs — surgical edit wiring (Phase 2.4)", () => {
  const SURGICAL_PROGRAM = { programName: "Surgically Edited", days: [] };

  function enableSurgicalWithSystem() {
    mockSurgicalEnabled.mockReturnValue(true);
    mockMaybeMaterialize.mockResolvedValue({
      attempted: true,
      materialized: true,
      trainingSystemId: 909,
      reason: "materialized",
    });
  }

  it("SURG-R01: flag off → regeneration path, surgical never called", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    expect(mockSurgical).not.toHaveBeenCalled();
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1); // regeneration
  });

  it("SURG-R02: flag on but no trainingSystemId → falls back to regeneration", async () => {
    programExists();
    mockSurgicalEnabled.mockReturnValue(true);
    mockMaybeMaterialize.mockResolvedValue({
      attempted: true,
      materialized: false,
      trainingSystemId: null,
      reason: "failed",
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    expect(mockSurgical).not.toHaveBeenCalled(); // no system → surgical skipped
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1);
  });

  it("SURG-R03: flag on + materialized system + surgical success → surgical response, no LLM", async () => {
    programExists();
    enableSurgicalWithSystem();
    mockSurgical.mockResolvedValue({
      ok: true,
      result: {
        updatedProgram: SURGICAL_PROGRAM,
        changes: ["set Squat 3→2"],
        coachSummary: "Reduced Friday volume.",
      },
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce Friday volume", scope: "week" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Surgical ran with the materialized system id; regeneration did NOT.
    expect(mockSurgical).toHaveBeenCalledTimes(1);
    expect(mockSurgical.mock.calls[0][0]).toMatchObject({ trainingSystemId: 909, instruction: "reduce Friday volume", scope: "week" });
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
    // Response shape is backwards-compatible.
    expect(res.body.data.updatedProgram).toEqual(SURGICAL_PROGRAM);
    expect(res.body.data.changes).toEqual(["set Squat 3→2"]);
    expect(res.body.data).toHaveProperty("coachSummary");
    expect(res.body.data).toHaveProperty("version");
    expect(res.body.data).toHaveProperty("changeReceipt");
    // Version snapshot + overwrite persisted (existing audit pattern).
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("SURG-R04: surgical failure BEFORE relational commit → falls back to regeneration", async () => {
    programExists();
    enableSurgicalWithSystem();
    mockSurgical.mockResolvedValue({ ok: false, committed: false, stage: "interpret" });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    expect(mockSurgical).toHaveBeenCalledTimes(1);
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1); // regeneration fallback
  });

  it("SURG-R06: surgical failure AFTER relational commit → 500 EDIT_PARTIAL, NO regeneration", async () => {
    programExists();
    enableSurgicalWithSystem();
    mockSurgical.mockResolvedValue({ ok: false, committed: true, stage: "serialize" });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("EDIT_PARTIAL");
    // Must NOT fall back to regeneration (would diverge blob vs system).
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("SURG-R05: cross-tenant edit → 404; neither bridge nor surgical attempted", async () => {
    programExists();
    mockSurgicalEnabled.mockReturnValue(true);
    authState.apiKey = KEY_B_OTHER_ORG;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_intruder")
      .send({ programId: 100, instruction: "sabotage" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(mockMaybeMaterialize).not.toHaveBeenCalled();
    expect(mockSurgical).not.toHaveBeenCalled();
    expect(mockGenerateAIResponse).not.toHaveBeenCalled();
  });
});

/**
 * Phase 2.5 — materialized history/revert dispatch (relational backing).
 *
 * The pure dispatcher runs for real; the relational deps factory is mocked
 * (mockSystemDeps). Blob programs still hit external_program_versions (covered
 * by VER-* above); these cover the materialized branch.
 *
 *   MHR-01  materialized history reads the system change log (not blob)
 *   MHR-02  materialized revert restores relationally + persists reserialized blob
 *   MHR-03  materialized revert restore failure → 500, blob NOT overwritten
 *   MHR-04  materialized revert unknown version → 404, blob NOT overwritten
 *   MHR-05  non-materialized history never touches the change log (blob only)
 */
describe("external programs — materialized history/revert (Phase 2.5)", () => {
  const MATERIALIZED_ROW = {
    ...OWNED_ROW,
    program: { ...OWNED_ROW.program, trainingSystemId: 909 },
  };

  it("MHR-01: materialized history reads from the system change log", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW])); // findOwnedProgram
    mockSystemDeps.readChangeHistory.mockResolvedValue([
      { id: 11, source: "ai_edit", scope: "week", changeSummary: "Reduced", requestText: "reduce", restoredFromId: null, createdAt: "2026-02-02" },
    ]);
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_owner");

    expect(res.status).toBe(200);
    expect(mockSystemDeps.readChangeHistory).toHaveBeenCalledWith(99, 909);
    expect(res.body.data.versions[0]).toMatchObject({ versionId: 11, type: "ai_edit" });
  });

  it("MHR-02: materialized revert restores relationally and persists reserialized blob", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW])); // findOwnedProgram
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 11 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSystemDeps.restoreFromChange).toHaveBeenCalledWith(99, 11, 909);
    expect(mockSystemDeps.loadFullSystem).toHaveBeenCalledWith(909);
    expect(mockSystemDeps.serializeToProgram).toHaveBeenCalledTimes(1);
    // Blob overwritten with the reserialized system; NO blob version row inserted.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
    // Backwards-compatible response shape.
    expect(res.body.data).toMatchObject({ programId: 100, revertedFromVersionId: 11, version: 4242 });
    expect(res.body.data).toHaveProperty("updatedProgram");
    expect(res.body.data).toHaveProperty("changeReceipt");
  });

  it("MHR-03: materialized revert restore failure → 500 and blob NOT overwritten", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW]));
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    mockSystemDeps.restoreFromChange.mockRejectedValue(new Error("db exploded"));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 11 });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("REVERT_FAILED");
    expect(mockDb.update).not.toHaveBeenCalled(); // blob untouched → no corruption
  });

  it("MHR-04: materialized revert unknown version → 404, blob NOT overwritten", async () => {
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW]));
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    mockSystemDeps.restoreFromChange.mockRejectedValue(new Error("Change 11 not found or access denied"));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 11 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("MHR-05: non-materialized history uses the blob path (change log untouched)", async () => {
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW])) // findOwnedProgram (trainingSystemId null)
      .mockReturnValueOnce(mockDb._rows([{ versionId: 1, type: "edit" }])); // readBlobVersions
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_owner");

    expect(res.status).toBe(200);
    expect(mockSystemDeps.readChangeHistory).not.toHaveBeenCalled();
    expect(res.body.data.versions[0]).toMatchObject({ versionId: 1 });
  });
});

/**
 * Phase 2.7 — rollout observability + kill switch (route level).
 *
 *   OBS-01  surgical success emits surgical_attempted + surgical_succeeded
 *   OBS-02  kill switch: surgical flag off → no surgical events, regeneration used
 *   OBS-03  materialized history emits history_system; blob history emits history_blob
 *   OBS-04  materialized revert (surgical flag OFF) still works + emits revert_succeeded
 */
describe("external programs — rollout observability & kill switch (Phase 2.7)", () => {
  const MATERIALIZED_ROW = { ...OWNED_ROW, program: { ...OWNED_ROW.program, trainingSystemId: 909 } };

  it("OBS-01: surgical success emits attempted + succeeded", async () => {
    programExists();
    mockSurgicalEnabled.mockReturnValue(true);
    mockMaybeMaterialize.mockResolvedValue({ attempted: true, materialized: true, trainingSystemId: 909, reason: "materialized" });
    mockSurgical.mockResolvedValue({ ok: true, result: { updatedProgram: { programName: "X", days: [] }, changes: [], coachSummary: "ok" } });
    authState.apiKey = KEY_A;

    await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    const events = mockEmit.mock.calls.map((c) => c[0]);
    expect(events).toContain("surgical_attempted");
    expect(events).toContain("surgical_succeeded");
  });

  it("OBS-02: kill switch — surgical flag off → no surgical events, regeneration used", async () => {
    programExists();
    mockSurgicalEnabled.mockReturnValue(false); // flag OFF (kill switch)
    authState.apiKey = KEY_A;

    await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    const events = mockEmit.mock.calls.map((c) => c[0]);
    expect(events).not.toContain("surgical_attempted");
    expect(mockGenerateAIResponse).toHaveBeenCalledTimes(1); // fell back to regeneration
  });

  it("OBS-03: history emits history_system (materialized) / history_blob (blob)", async () => {
    // materialized
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW]));
    mockSystemDeps.readChangeHistory.mockResolvedValue([]);
    authState.apiKey = KEY_A;
    await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_owner");
    expect(mockEmit.mock.calls.map((c) => c[0])).toContain("history_system");

    // blob
    mockEmit.mockClear();
    mockDb.select
      .mockReturnValueOnce(mockDb._rows([OWNED_ROW]))
      .mockReturnValueOnce(mockDb._rows([{ versionId: 1, type: "edit" }]));
    await supertest(await makeApp())
      .get("/api/external/program/100/history")
      .set("Authorization", "Bearer tc_owner");
    expect(mockEmit.mock.calls.map((c) => c[0])).toContain("history_blob");
  });

  it("OBS-04: already-materialized revert is safe with surgical flag OFF and emits revert_succeeded", async () => {
    mockSurgicalEnabled.mockReturnValue(false); // surgical off — dispatcher independent of flag
    mockDb.select.mockReturnValueOnce(mockDb._rows([MATERIALIZED_ROW]));
    mockDb.update.mockReturnValue(mockDb._rows(undefined));
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/100/revert")
      .set("Authorization", "Bearer tc_owner")
      .send({ versionId: 11 });

    expect(res.status).toBe(200);
    expect(mockSystemDeps.restoreFromChange).toHaveBeenCalledWith(99, 11, 909);
    expect(mockEmit.mock.calls.map((c) => c[0])).toContain("revert_succeeded");
  });
});

// ── Advisory locks on the edit blob transactions (audit F9) ───────────────────
//
// The route's two blob transactions must issue pg_advisory_xact_lock as their
// first statements: the surgical path locks (system, program), the fallback
// regeneration path locks (program). Cross-instance serialization semantics
// are proven in advisory-lock-serialization.test.ts; here we prove the route
// actually issues the lock SQL inside its transactions.
describe("external programs — edit blob-transaction advisory locks (F9)", () => {
  const lockCalls = () =>
    (mockDb.execute.mock.calls as Array<[{ __sql?: string; values?: unknown[] }]>)
      .filter(([q]) => q?.__sql?.includes("pg_advisory_xact_lock"))
      .map(([q]) => q.values);

  it("LOCK-R01: fallback regeneration edit locks the external program inside the tx", async () => {
    programExists();
    authState.apiKey = KEY_A;
    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(lockCalls()).toEqual([[EXTERNAL_PROGRAM_LOCK_CLASS, 100]]);
  });

  it("LOCK-R02: surgical edit locks the training system AND the program inside the blob tx", async () => {
    programExists();
    mockSurgicalEnabled.mockReturnValue(true);
    mockMaybeMaterialize.mockResolvedValue({
      attempted: true,
      materialized: true,
      trainingSystemId: 909,
      reason: "materialized",
    });
    mockSurgical.mockResolvedValue({
      ok: true,
      result: {
        updatedProgram: { programName: "Surgically Edited", days: [] },
        changes: ["set Squat 3→2"],
        coachSummary: "Reduced Friday volume.",
      },
    });
    authState.apiKey = KEY_A;

    const res = await supertest(await makeApp())
      .post("/api/external/program/edit")
      .set("Authorization", "Bearer tc_owner")
      .send({ programId: 100, instruction: "reduce volume" });

    expect(res.status).toBe(200);
    // Lock order is fixed (system → program) — the only multi-lock site.
    expect(lockCalls()).toEqual([
      [TRAINING_SYSTEM_LOCK_CLASS, 909],
      [EXTERNAL_PROGRAM_LOCK_CLASS, 100],
    ]);
  });
});
