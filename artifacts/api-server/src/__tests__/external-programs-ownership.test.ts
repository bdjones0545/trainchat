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
  return {
    // Mutable caller identity injected by the mocked auth middleware.
    authState: { apiKey: null as null | { id: number; orgId: string | null } },
    mockDb: {
      select: vi.fn(),
      update: vi.fn(),
      // Test helpers attached below.
      _selectJoin: (rows: unknown[]) => {
        const chain: any = {
          from: vi.fn(() => chain),
          leftJoin: vi.fn(() => chain),
          where: vi.fn(() =>
            Object.assign(Promise.resolve(rows), {
              limit: vi.fn().mockResolvedValue(rows),
            }),
          ),
          limit: vi.fn().mockResolvedValue(rows),
        };
        return chain;
      },
      _update: () => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      }),
    },
    mockGenerateAIResponse: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  externalProgramsTable: { id: "id", apiKeyId: "apiKeyId", programData: "programData" },
  externalApiKeysTable: { id: "id", orgId: "orgId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ __eq: val })),
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

/** Program row exists in the DB (owned by KEY_A). */
function programExists() {
  mockDb.select.mockReturnValue(mockDb._selectJoin([OWNED_ROW]));
  mockDb.update.mockReturnValue(mockDb._update());
}

/** No such program id in the DB (join returns nothing). */
function programMissing() {
  mockDb.select.mockReturnValue(mockDb._selectJoin([]));
  mockDb.update.mockReturnValue(mockDb._update());
}

beforeEach(() => {
  vi.clearAllMocks();
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
