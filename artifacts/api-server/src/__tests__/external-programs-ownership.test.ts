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

// ── Hoisted state & mocks ──────────────────────────────────────────────────────

const { authState, mockDb, mockGenerateAIResponse } = vi.hoisted(() => {
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

  return {
    // Mutable caller identity injected by the mocked auth middleware.
    authState: { apiKey: null as null | { id: number; orgId: string | null } },
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      // Test helper: build a chain resolving to `rows`.
      _rows: chainResult,
    },
    mockGenerateAIResponse: vi.fn(),
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
    requestContext: { goal: "x" },
    summary: "A program",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  ownerOrgId: KEY_A.orgId,
};

// A version row inserted by snapshot-before-edit / revert (.returning() result).
const INSERTED_VERSION = { id: 500, createdAt: new Date("2026-02-01T00:00:00Z") };

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
