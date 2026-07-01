/**
 * auth.test.ts
 *
 * Route-level unit tests for artifacts/api-server/src/routes/auth.ts.
 *
 * Strategy:
 *   - Mount the router in a minimal Express app with an injected mock session.
 *   - Use supertest to fire real HTTP requests — this exercises body parsing,
 *     route matching, error serialisation, and status codes exactly as Express
 *     would in production.
 *   - Mock every I/O boundary (db, bcrypt, email, Stripe, anonymousMerge,
 *     session-activation) so tests are deterministic and fast with no external
 *     dependencies.
 *
 * IMPORTANT — mock isolation:
 *   vi.clearAllMocks() does NOT flush the mockReturnValueOnce queue, which
 *   contaminates subsequent tests. The global beforeEach calls
 *   vi.resetAllMocks() (which does flush the queue) and then re-sets all
 *   default mock implementations. Each test therefore starts from a known-clean
 *   mock state.
 *
 * Coverage targets (from TESTING.md Priority 1 and Priority 2):
 *   TC-01  Bootstrap — returns existing session user (idempotent)
 *   TC-02  Bootstrap — invalid deviceId → 400
 *   TC-03  Bootstrap — creates anonymous user for new deviceId
 *   TC-04  Bootstrap — resumes anonymous user for known deviceId
 *   TC-05  Bootstrap — sets session.userId directly (no activateAuthSession)
 *   TC-06  Register — 400 on invalid body
 *   TC-07  Register — 409 when email taken by registered user
 *   TC-08  Register — upgrades anonymous user in-place when deviceId matches anon user
 *   TC-09  Register — creates fresh account when no anon user found for deviceId
 *   TC-10  Register — calls activateAuthSession (L-12 session fixation prevention)
 *   TC-11  Register — fires welcome email fire-and-forget (does not block response)
 *   TC-12  Register — 201 status with public user shape (no passwordHash)
 *   TC-13  Login — 400 on invalid body
 *   TC-14  Login — 401 when user not found
 *   TC-15  Login — 401 when user is anonymous (no passwordHash)
 *   TC-16  Login — 401 on wrong password
 *   TC-17  Login — calls activateAuthSession on success (L-12)
 *   TC-18  Login — triggers mergeAnonymousToRegistered when deviceId matches anon user
 *   TC-19  Login — does NOT merge when deviceId points to the same user
 *   TC-20  Login — response includes onboardingComplete and omits passwordHash
 *   TC-21  Logout — destroys session and clears cookie
 *   TC-22  GET /auth/me — 401 when not authenticated
 *   TC-23  GET /auth/me — 401 when session userId has no matching user row
 *   TC-24  GET /auth/me — onboardingComplete=true for anonymous users
 *   TC-25  GET /auth/me — calls resolveOnboardingComplete for registered users
 *   TC-26  DELETE /account — 401 when not authenticated
 *   TC-27  DELETE /account — 404 when user row not found
 *   TC-28  DELETE /account — deletes user row and clears session
 *   TC-29  PATCH /account — 401 when not authenticated
 *   TC-30  PATCH /account — 400 on blank name
 *   TC-31  PATCH /account — updates name and returns updated fields
 *   TC-32  Forgot-password — 400 on invalid email
 *   TC-33  Forgot-password — always returns generic message (anti-enumeration)
 *   TC-34  Forgot-password — sends reset email in background when user exists
 *   TC-35  Forgot-password — rate limiting returns generic message silently
 *   TC-36  Reset-password — 400 on short password (< 8 chars)
 *   TC-37  Reset-password — 400 when token not found
 *   TC-38  Reset-password — 400 when token already used
 *   TC-39  Reset-password — 400 when token expired
 *   TC-40  Reset-password — hashes new password and marks token used on success
 *   TC-41  Reset-password — destroys session on success
 *   TC-42  Validate-reset-token — 400 when token param absent
 *   TC-43  Validate-reset-token — { valid: false, reason: 'invalid' } not found
 *   TC-44  Validate-reset-token — { valid: false, reason: 'used' } already used
 *   TC-45  Validate-reset-token — { valid: false, reason: 'expired' } expired
 *   TC-46  Validate-reset-token — { valid: true } when valid
 *   TC-47  Rate limiter — skipped in test environment (NODE_ENV=test)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import express from "express";
import supertest from "supertest";

// ── vi.hoisted() ──────────────────────────────────────────────────────────────
//
// vi.mock() factories are hoisted before module evaluation. Any variable they
// reference must also be hoisted so it exists before the factory runs.

const {
  mockActivateAuthSession,
  mockMergeAnonymousToRegistered,
  mockSendWelcomeEmail,
  mockSendPasswordResetEmail,
  mockBcryptHash,
  mockBcryptCompare,
  mockDb,
} = vi.hoisted(() => {
  // ── Drizzle chain builders ─────────────────────────────────────────────────
  //
  // Each builder returns a fluent mock chain that ends in a Promise so route
  // handlers can await the final call. We attach extra methods on the returned
  // Promise where auth.ts chains beyond .where() (e.g. .limit()) or beyond
  // .where() for updates (e.g. .returning()).

  function selectChain(rows: unknown[]) {
    // .where() → Promise<rows> with optional .limit() attached
    const whereResult: any = Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    });
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(whereResult),
      limit: vi.fn().mockResolvedValue(rows),
    };
  }

  function insertChain(rows: unknown[]) {
    return {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
    };
  }

  function updateChain(rows: unknown[] = []) {
    // .where() → awaitable (bare update) AND supports .returning()
    const whereResult: any = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue(rows),
    });
    return {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(whereResult),
    };
  }

  function deleteChain() {
    return { where: vi.fn().mockResolvedValue(undefined) };
  }

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
  };

  return {
    mockActivateAuthSession: vi.fn(),
    mockMergeAnonymousToRegistered: vi.fn(),
    mockSendWelcomeEmail: vi.fn(),
    mockSendPasswordResetEmail: vi.fn(),
    mockBcryptHash: vi.fn(),
    mockBcryptCompare: vi.fn(),
    mockDb,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  usersTable: { id: "id", email: "email", deviceId: "deviceId", isAnonymous: "isAnonymous" },
  userProfilesTable: {
    userId: "userId",
    trainingGoal: "trainingGoal",
    experienceLevel: "experienceLevel",
    trainingStyle: "trainingStyle",
    daysPerWeek: "daysPerWeek",
    sessionDuration: "sessionDuration",
    equipmentAccess: "equipmentAccess",
  },
  passwordResetTokensTable: {
    id: "id",
    userId: "userId",
    tokenHash: "tokenHash",
    expiresAt: "expiresAt",
    usedAt: "usedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ __eq: val })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  gt: vi.fn((_col: unknown, val: unknown) => ({ __gt: val })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: mockBcryptHash, compare: mockBcryptCompare },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/anonymousMerge", () => ({
  mergeAnonymousToRegistered: mockMergeAnonymousToRegistered,
}));

vi.mock("../lib/session-activation", () => ({
  activateAuthSession: mockActivateAuthSession,
}));

vi.mock("../lib/email", () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
  sendPasswordResetEmail: mockSendPasswordResetEmail,
}));

vi.mock("../lib/stripeClient", () => ({
  getUncachableStripeClient: vi.fn().mockResolvedValue({
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({ status: "canceled" }),
      cancel: vi.fn().mockResolvedValue({}),
    },
  }),
}));

// ── Test app factory ──────────────────────────────────────────────────────────

type MockSession = {
  userId?: number;
  save: Mock;
  destroy: Mock;
  regenerate: Mock;
};

function makeMockSession(initial: Partial<MockSession> = {}): MockSession {
  return {
    save: vi.fn((cb: (err?: unknown) => void) => cb()),
    destroy: vi.fn((cb?: (err?: unknown) => void) => { cb?.(); }),
    regenerate: vi.fn((cb: (err?: unknown) => void) => cb()),
    ...initial,
  };
}

import authRouter from "../routes/auth";

function makeApp(session: MockSession) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = session;
    next();
  });
  app.use("/api", authRouter);
  return supertest(app);
}

// ── DB mock helper ────────────────────────────────────────────────────────────
//
// setupSelects configures mockDb.select to return successive chain objects.
// Uses mockImplementation (not mockReturnValueOnce) so vi.resetAllMocks()
// clears it cleanly without contaminating other tests.

function setupSelects(...results: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => mockDb._selectChain(results[call++] ?? []));
}

// ── Global beforeEach ─────────────────────────────────────────────────────────
//
// vi.resetAllMocks() flushes both mock call history AND mockReturnValueOnce
// queues, preventing contamination between tests. We then restore the default
// implementations that route handlers rely on.

beforeEach(() => {
  vi.resetAllMocks();
  // Restore default implementations cleared by resetAllMocks
  mockActivateAuthSession.mockResolvedValue(undefined);
  mockMergeAnonymousToRegistered.mockResolvedValue({});
  mockSendWelcomeEmail.mockResolvedValue(undefined);
  mockSendPasswordResetEmail.mockResolvedValue(undefined);
  mockBcryptHash.mockResolvedValue("$2b$12$mockedhash");
  mockBcryptCompare.mockResolvedValue(true);
});

// ── Shared fixtures ──────────────────────────────────────────────────────────

const ANON_USER = {
  id: 10,
  email: null,
  name: null,
  deviceId: "device-abc",
  isAnonymous: true,
  onboardingComplete: true,
  createdAt: new Date("2024-01-01"),
  passwordHash: null,
  plan: "free",
  stripeSubscriptionId: null,
};

const REG_USER = {
  id: 42,
  email: "alice@example.com",
  name: "Alice",
  deviceId: "device-xyz",
  isAnonymous: false,
  onboardingComplete: true,
  createdAt: new Date("2024-01-01"),
  passwordHash: "$2b$12$realhashedpassword",
  plan: "free",
  stripeSubscriptionId: null,
};

const COMPLETE_PROFILE = {
  trainingGoal: "strength",
  experienceLevel: "intermediate",
  trainingStyle: "gym",
  daysPerWeek: 4,
  sessionDuration: 60,
  equipmentAccess: "full",
};

const VALID_TOKEN_RECORD = {
  id: 1,
  userId: REG_USER.id,
  tokenHash: "", // hash is computed in each test
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  usedAt: null,
};

// ── TC-01 through TC-05: POST /auth/bootstrap ─────────────────────────────────

describe("POST /auth/bootstrap", () => {
  it("TC-01: returns existing user when session is already active", async () => {
    const session = makeMockSession({ userId: ANON_USER.id });
    setupSelects([ANON_USER]);

    const res = await makeApp(session)
      .post("/api/auth/bootstrap")
      .send({ deviceId: "device-abc" });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ANON_USER.id);
    expect(res.body.user.isAnonymous).toBe(true);
  });

  it("TC-02: returns 400 on missing deviceId", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/bootstrap")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deviceId/i);
  });

  it("TC-02b: returns 400 on deviceId shorter than 8 chars", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/bootstrap")
      .send({ deviceId: "short" });
    expect(res.status).toBe(400);
  });

  it("TC-03: creates a new anonymous user when deviceId is unknown", async () => {
    const session = makeMockSession();
    setupSelects([]); // no existing user for device
    const ins = mockDb._insertChain([ANON_USER]);
    mockDb.insert.mockReturnValue(ins);

    const res = await makeApp(session)
      .post("/api/auth/bootstrap")
      .send({ deviceId: "device-abc" });

    expect(res.status).toBe(200);
    expect(res.body.user.isAnonymous).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    const [insertedValues] = ins.values.mock.calls[0];
    expect(insertedValues.isAnonymous).toBe(true);
    expect(insertedValues.deviceId).toBe("device-abc");
  });

  it("TC-04: resumes existing anonymous user when deviceId is known", async () => {
    const session = makeMockSession();
    setupSelects([ANON_USER]);

    const res = await makeApp(session)
      .post("/api/auth/bootstrap")
      .send({ deviceId: "device-abc" });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ANON_USER.id);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("TC-05: sets session.userId directly without calling activateAuthSession", async () => {
    // Bootstrap is anonymous — session fixation is not a concern here because
    // there is no prior authenticated session being inherited by an attacker.
    const session = makeMockSession();
    setupSelects([ANON_USER]);

    await makeApp(session)
      .post("/api/auth/bootstrap")
      .send({ deviceId: "device-abc" });

    expect(mockActivateAuthSession).not.toHaveBeenCalled();
    expect(session.save).toHaveBeenCalled();
  });
});

// ── TC-06 through TC-12: POST /auth/register ──────────────────────────────────

describe("POST /auth/register", () => {
  it("TC-06: returns 400 when body is missing required fields", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "bad" }); // missing password and name
    expect(res.status).toBe(400);
  });

  it("TC-07: returns 409 when email is taken by a registered user", async () => {
    setupSelects([REG_USER]); // email conflict
    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "password123", name: "Bob" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });

  it("TC-08: upgrades anonymous user in-place when deviceId matches anon user", async () => {
    const upgraded = { ...ANON_USER, ...REG_USER };
    // (1) email conflict check → none; (2) device anon lookup → ANON_USER
    setupSelects([], [ANON_USER]);
    const upd = mockDb._updateChain([upgraded]);
    mockDb.update.mockReturnValue(upd);

    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", name: "Alice", deviceId: "device-abc" });

    expect(res.status).toBe(201);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    const [setValues] = upd.set.mock.calls[0];
    expect(setValues.isAnonymous).toBe(false);
  });

  it("TC-09: creates a fresh account when deviceId matches a non-anonymous user", async () => {
    // (1) email conflict check → none; (2) device lookup → registered (not anon)
    setupSelects([], [REG_USER]);
    mockDb.insert.mockReturnValue(mockDb._insertChain([REG_USER]));

    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "bob@example.com", password: "password123", name: "Bob", deviceId: "device-xyz" });

    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("TC-09b: creates a fresh account when no deviceId is provided", async () => {
    setupSelects([]); // no email conflict
    mockDb.insert.mockReturnValue(mockDb._insertChain([REG_USER]));

    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", name: "New" });

    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("TC-10: calls activateAuthSession on success (L-12 session fixation prevention)", async () => {
    const session = makeMockSession();
    setupSelects([]); // no email conflict
    mockDb.insert.mockReturnValue(mockDb._insertChain([REG_USER]));

    await makeApp(session)
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", name: "New" });

    expect(mockActivateAuthSession).toHaveBeenCalledWith(session, REG_USER.id);
  });

  it("TC-11: fires welcome email as fire-and-forget (response is 201 even if email fails)", async () => {
    setupSelects([]); // no email conflict
    mockDb.insert.mockReturnValue(mockDb._insertChain([REG_USER]));
    mockSendWelcomeEmail.mockRejectedValue(new Error("SMTP down"));

    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", name: "New" });

    expect(res.status).toBe(201);
  });

  it("TC-12: returns 201 with public user shape and no passwordHash", async () => {
    setupSelects([]); // no email conflict
    mockDb.insert.mockReturnValue(mockDb._insertChain([REG_USER]));

    const res = await makeApp(makeMockSession())
      .post("/api/auth/register")
      .send({ email: "alice@example.com", password: "password123", name: "Alice" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: REG_USER.id, email: REG_USER.email, isAnonymous: false });
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

// ── TC-13 through TC-20: POST /auth/login ─────────────────────────────────────
//
// NOTE on resolveOnboardingComplete:
//   The helper short-circuits immediately when currentFlag is true (no db call).
//   REG_USER.onboardingComplete = true → login makes exactly ONE select (user
//   lookup) when no deviceId is present, or TWO selects (+ device anon lookup)
//   when a deviceId is present.

describe("POST /auth/login", () => {
  it("TC-13: returns 400 when body is missing required fields", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "alice@example.com" }); // missing password
    expect(res.status).toBe(400);
  });

  it("TC-14: returns 401 when user is not found", async () => {
    setupSelects([]); // no user
    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("TC-15: returns 401 when user is anonymous (no passwordHash)", async () => {
    setupSelects([ANON_USER]);
    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "anon@example.com", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("TC-16: returns 401 when password does not match", async () => {
    mockBcryptCompare.mockResolvedValue(false);
    setupSelects([REG_USER]);
    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("TC-17: calls activateAuthSession on success (L-12 session fixation prevention)", async () => {
    const session = makeMockSession();
    // REG_USER.onboardingComplete=true → no profile select needed
    // No deviceId → no device anon select needed. Total: 1 select.
    setupSelects([REG_USER]);

    await makeApp(session)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "correctpass" });

    expect(mockActivateAuthSession).toHaveBeenCalledWith(session, REG_USER.id);
  });

  it("TC-18: triggers mergeAnonymousToRegistered when deviceId matches a different anon user", async () => {
    // REG_USER.onboardingComplete=true → no profile select.
    // With deviceId → device anon lookup runs. Total: 2 selects.
    const otherAnon = { ...ANON_USER, id: 99 };
    setupSelects([REG_USER], [otherAnon]);

    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "pass", deviceId: "device-abc" });

    expect(res.status).toBe(200);
    expect(mockMergeAnonymousToRegistered).toHaveBeenCalledWith(99, REG_USER.id);
  });

  it("TC-19: does NOT merge when deviceId user is the same as the logged-in user", async () => {
    // Same id as REG_USER — no merge should fire
    const sameUser = { ...ANON_USER, id: REG_USER.id };
    setupSelects([REG_USER], [sameUser]);

    await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "pass", deviceId: "device-xyz" });

    expect(mockMergeAnonymousToRegistered).not.toHaveBeenCalled();
  });

  it("TC-20: response includes onboardingComplete and does not leak passwordHash", async () => {
    setupSelects([REG_USER]); // 1 select; no deviceId → no 2nd select
    const res = await makeApp(makeMockSession())
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "pass" });

    expect(res.status).toBe(200);
    expect(typeof res.body.user.onboardingComplete).toBe("boolean");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.id).toBe(REG_USER.id);
  });
});

// ── TC-21: POST /auth/logout ──────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("TC-21: destroys session, clears cookie, returns { success: true }", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    const res = await makeApp(session).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(session.destroy).toHaveBeenCalled();
  });
});

// ── TC-22 through TC-25: GET /auth/me ────────────────────────────────────────

describe("GET /auth/me", () => {
  it("TC-22: returns 401 when not authenticated (no session.userId)", async () => {
    const res = await makeApp(makeMockSession()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("session_expired");
  });

  it("TC-23: returns 401 when session userId has no matching user row", async () => {
    const session = makeMockSession({ userId: 999 });
    setupSelects([]); // user not found
    const res = await makeApp(session).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("TC-24: returns onboardingComplete=true for anonymous users without checking profile", async () => {
    const session = makeMockSession({ userId: ANON_USER.id });
    setupSelects([ANON_USER]);

    const res = await makeApp(session).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
    expect(res.body.isAnonymous).toBe(true);
    // Only 1 select (user lookup) — no profile check for anonymous users
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("TC-25: calls resolveOnboardingComplete for registered users (self-heals flag)", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    const userFlagFalse = { ...REG_USER, onboardingComplete: false };
    // (1) user lookup; (2) profile lookup inside resolveOnboardingComplete
    setupSelects([userFlagFalse], [COMPLETE_PROFILE]);
    mockDb.update.mockReturnValue(mockDb._updateChain()); // self-heal update

    const res = await makeApp(session).get("/api/auth/me");

    expect(res.status).toBe(200);
    // Profile is complete → resolves to true
    expect(res.body.onboardingComplete).toBe(true);
  });
});

// ── TC-26 through TC-28: DELETE /account ──────────────────────────────────────

describe("DELETE /account", () => {
  it("TC-26: returns 401 when not authenticated", async () => {
    const res = await makeApp(makeMockSession()).delete("/api/account");
    expect(res.status).toBe(401);
  });

  it("TC-27: returns 404 when user row is not found", async () => {
    const session = makeMockSession({ userId: 999 });
    setupSelects([]); // user not found (DELETE uses .limit(1))

    const res = await makeApp(session).delete("/api/account");

    expect(res.status).toBe(404);
    expect(session.destroy).toHaveBeenCalled();
  });

  it("TC-28: deletes user row, destroys session, returns success", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    const noSubUser = { ...REG_USER, stripeSubscriptionId: null };
    setupSelects([noSubUser]);
    mockDb.delete.mockReturnValue(mockDb._deleteChain());

    const res = await makeApp(session).delete("/api/account");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
    expect(session.destroy).toHaveBeenCalled();
  });
});

// ── TC-29 through TC-31: PATCH /account ──────────────────────────────────────

describe("PATCH /account", () => {
  it("TC-29: returns 401 when not authenticated", async () => {
    const res = await makeApp(makeMockSession()).patch("/api/account").send({ name: "Alice" });
    expect(res.status).toBe(401);
  });

  it("TC-30: returns 400 when name is blank", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    const res = await makeApp(session).patch("/api/account").send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("TC-31: updates name and returns { id, name, email }", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    const updated = { id: REG_USER.id, name: "Alicia", email: REG_USER.email };
    mockDb.update.mockReturnValue(mockDb._updateChain([updated]));

    const res = await makeApp(session).patch("/api/account").send({ name: "Alicia" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alicia");
    expect(res.body.id).toBe(REG_USER.id);
  });
});

// ── TC-32 through TC-35: POST /auth/forgot-password ──────────────────────────

describe("POST /auth/forgot-password", () => {
  it("TC-32: returns 400 on invalid email format", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("TC-33: always returns generic message even when email does not exist (anti-enumeration)", async () => {
    // Background setImmediate finds no user — no email should be sent.
    setupSelects([]); // no user found in background work

    const res = await makeApp(makeMockSession())
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);

    // Wait for the setImmediate callback AND its async work to complete.
    await vi.waitFor(
      () => expect(mockDb.select).toHaveBeenCalled(),
      { timeout: 2000 },
    );
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("TC-34: sends reset email in background when user exists", async () => {
    // Background setImmediate: (1) user lookup, (2) delete old tokens, (3) insert new token
    setupSelects([REG_USER]);
    mockDb.delete.mockReturnValue(mockDb._deleteChain());
    mockDb.insert.mockReturnValue(mockDb._insertChain([]));

    const res = await makeApp(makeMockSession())
      .post("/api/auth/forgot-password")
      .send({ email: "alice@example.com" });

    expect(res.status).toBe(200);

    await vi.waitFor(
      () => expect(mockSendPasswordResetEmail).toHaveBeenCalled(),
      { timeout: 2000 },
    );

    const [{ email, resetUrl }] = mockSendPasswordResetEmail.mock.calls[0];
    expect(email).toBe(REG_USER.email);
    expect(resetUrl).toContain("reset-password?token=");
  });

  it("TC-35: rate limiting returns generic message without sending email", async () => {
    // Use a unique email to avoid interference from other tests' rate-limit state.
    const rateLimitEmail = `ratelimit-${Date.now()}@test.com`;

    // Requests 1–5 are within the limit.
    // Each hits the setImmediate which calls select (no user found → no email).
    setupSelects([], [], [], [], [], []); // 6 selects, all empty

    for (let i = 0; i < 5; i++) {
      await makeApp(makeMockSession())
        .post("/api/auth/forgot-password")
        .send({ email: rateLimitEmail });
    }

    vi.resetAllMocks();
    // Restore defaults after manual reset
    mockSendPasswordResetEmail.mockResolvedValue(undefined);

    // 6th request should be rate-limited — no select, no email
    const res = await makeApp(makeMockSession())
      .post("/api/auth/forgot-password")
      .send({ email: rateLimitEmail });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

// ── TC-36 through TC-41: POST /auth/reset-password ───────────────────────────

const RAW_TOKEN = "a".repeat(64);

describe("POST /auth/reset-password", () => {
  it("TC-36: returns 400 when password is shorter than 8 characters", async () => {
    const res = await makeApp(makeMockSession())
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8/);
  });

  it("TC-37: returns 400 when token is not found", async () => {
    setupSelects([]); // token not found
    const res = await makeApp(makeMockSession())
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "newpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("TC-38: returns 400 when token has already been used", async () => {
    setupSelects([{ ...VALID_TOKEN_RECORD, usedAt: new Date(Date.now() - 1000) }]);
    const res = await makeApp(makeMockSession())
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "newpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it("TC-39: returns 400 when token has expired", async () => {
    setupSelects([{ ...VALID_TOKEN_RECORD, expiresAt: new Date(Date.now() - 1000), usedAt: null }]);
    const res = await makeApp(makeMockSession())
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "newpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("TC-40: hashes new password, updates user, marks token used on success", async () => {
    setupSelects([VALID_TOKEN_RECORD]);
    // Two update calls: (1) set new passwordHash, (2) mark token used
    mockDb.update.mockReturnValue(mockDb._updateChain());

    const res = await makeApp(makeMockSession())
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "newStrongPassword!" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been reset/i);
    expect(mockBcryptHash).toHaveBeenCalledWith("newStrongPassword!", 12);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("TC-41: destroys the current session after successful password reset", async () => {
    const session = makeMockSession({ userId: REG_USER.id });
    setupSelects([VALID_TOKEN_RECORD]);
    mockDb.update.mockReturnValue(mockDb._updateChain());

    await makeApp(session)
      .post("/api/auth/reset-password")
      .send({ token: RAW_TOKEN, password: "newStrongPassword!" });

    expect(session.destroy).toHaveBeenCalled();
  });
});

// ── TC-42 through TC-46: GET /auth/validate-reset-token ──────────────────────

const QUERY_TOKEN = "b".repeat(64);

describe("GET /auth/validate-reset-token", () => {
  it("TC-42: returns 400 { valid: false, reason: 'missing' } when no token param", async () => {
    const res = await makeApp(makeMockSession()).get("/api/auth/validate-reset-token");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ valid: false, reason: "missing" });
  });

  it("TC-43: { valid: false, reason: 'invalid' } when token not found", async () => {
    setupSelects([]);
    const res = await makeApp(makeMockSession())
      .get(`/api/auth/validate-reset-token?token=${QUERY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "invalid" });
  });

  it("TC-44: { valid: false, reason: 'used' } when token already used", async () => {
    setupSelects([{ id: 1, expiresAt: new Date(Date.now() + 3600000), usedAt: new Date() }]);
    const res = await makeApp(makeMockSession())
      .get(`/api/auth/validate-reset-token?token=${QUERY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "used" });
  });

  it("TC-45: { valid: false, reason: 'expired' } when token expired", async () => {
    setupSelects([{ id: 1, expiresAt: new Date(Date.now() - 1000), usedAt: null }]);
    const res = await makeApp(makeMockSession())
      .get(`/api/auth/validate-reset-token?token=${QUERY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "expired" });
  });

  it("TC-46: { valid: true } when token is valid, unused, and not expired", async () => {
    setupSelects([{ id: 1, expiresAt: new Date(Date.now() + 3600000), usedAt: null }]);
    const res = await makeApp(makeMockSession())
      .get(`/api/auth/validate-reset-token?token=${QUERY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });
});

// ── TC-47: Auth rate limiter ──────────────────────────────────────────────────

describe("Auth rate limiter", () => {
  it("TC-47: rate limiter is skipped in test environment (NODE_ENV=test)", async () => {
    // The authRateLimiter has skip: () => NODE_ENV === 'test'.
    // If active, 21 rapid requests would yield 429 on the 21st.
    // In test mode, all should reach the handler (user not found → 401).
    setupSelects(...Array.from({ length: 21 }, () => []));

    const results = await Promise.all(
      Array.from({ length: 21 }, () =>
        makeApp(makeMockSession())
          .post("/api/auth/login")
          .send({ email: "test@example.com", password: "pass" }),
      ),
    );

    expect(results.every((r) => r.status !== 429)).toBe(true);
    expect(results.every((r) => r.status === 401)).toBe(true);
  });
});
