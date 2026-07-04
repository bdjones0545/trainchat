/**
 * shared-rate-limiter.test.ts — Hardening PR 4 (audit F10)
 *
 * Proves the shared-store rate limiter is correct without process memory:
 *
 *   TC-01  limits are enforced ACROSS separate limiter instances sharing the
 *          store (simulates multiple app instances under autoscale)
 *   TC-02  per-user keys do not leak across users
 *   TC-03  per-API-key keys do not leak across keys
 *   TC-04  expired windows reset the count
 *   TC-05  store failure fails OPEN (request allowed, flagged)
 *   TC-06  middleware: authenticated requests key by user; unauthenticated
 *          requests fall back to IP
 *   TC-07  middleware: 429 with { error, code: "RATE_LIMITED", retryAfter }
 *          and Retry-After / X-RateLimit-* headers
 *   TC-08  protected AI routes (program-edit, share-moments) reject after
 *          their configured budgets
 *   TC-09  opportunistic cleanup deletes expired rows (when sampled)
 *
 * The fake @workspace/db implements INSERT ... ON CONFLICT DO UPDATE counting
 * over a shared in-memory table — the same atomic-upsert semantics Postgres
 * provides. Real-Postgres validation is documented in the PR (manual step).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Shared fake counter table (the "Postgres" all instances share) ───────────

const table = new Map<string, { count: number; expiresAt: number }>();
const state = { failNextInsert: false, deleteCalls: 0, now: null as number | null };

vi.mock("@workspace/db", () => {
  const rateLimitCountersTable = {
    key: { name: "key" },
    windowStart: { name: "window_start" },
    count: { name: "count" },
    expiresAt: { name: "expires_at" },
  };

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((vals: { key: string; windowStart: Date; expiresAt: Date }) => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (state.failNextInsert) {
              state.failNextInsert = false;
              throw new Error("simulated db outage");
            }
            const k = `${vals.key}|${vals.windowStart.getTime()}`;
            const existing = table.get(k);
            const count = (existing?.count ?? 0) + 1;
            table.set(k, { count, expiresAt: vals.expiresAt.getTime() });
            return [{ count }];
          }),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        state.deleteCalls += 1;
        // Use the test-controlled clock when set (TC-04/TC-09 inject time).
        const now = state.now ?? Date.now();
        for (const [k, v] of table) {
          if (v.expiresAt < now) table.delete(k);
        }
        return [];
      }),
    })),
  };

  return { db, rateLimitCountersTable };
});

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SharedRateLimiter, sharedRateLimit, defaultPrincipal } from "../lib/shared-rate-limiter";
import { programEditRateLimiter, shareMomentsRateLimiter } from "../middlewares/ai-rate-limiter";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WINDOW = 60_000;

function resetStore() {
  table.clear();
  state.failNextInsert = false;
  state.deleteCalls = 0;
  state.now = null;
}

/** App with a session-stubbing layer and one rate-limited probe route. */
function makeApp(middleware: express.RequestHandler, userId?: number) {
  const app = express();
  app.use((req, _res, next) => {
    if (userId != null) (req as any).session = { userId };
    next();
  });
  app.post("/probe", middleware, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("SharedRateLimiter store (audit F10)", () => {
  // Disable the probabilistic cleanup except where a test opts in.
  beforeEach(() => {
    resetStore();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });
  afterEach(() => vi.restoreAllMocks());

  // ── TC-01 ──────────────────────────────────────────────────────────────────
  it("TC-01: limits are enforced across separate limiter instances (multi-instance)", async () => {
    // Two SharedRateLimiter instances = two app instances. Same store.
    const instanceA = new SharedRateLimiter();
    const instanceB = new SharedRateLimiter();

    expect((await instanceA.hit("chat:user:7", 3, WINDOW)).allowed).toBe(true);
    expect((await instanceB.hit("chat:user:7", 3, WINDOW)).allowed).toBe(true);
    expect((await instanceA.hit("chat:user:7", 3, WINDOW)).allowed).toBe(true);
    // 4th hit overall — instance B has only seen 1 locally, but the shared
    // count is 4 → blocked. An in-memory limiter would have allowed this.
    expect((await instanceB.hit("chat:user:7", 3, WINDOW)).allowed).toBe(false);
  });

  // ── TC-02 ──────────────────────────────────────────────────────────────────
  it("TC-02: per-user limits do not leak across users", async () => {
    const limiter = new SharedRateLimiter();
    for (let i = 0; i < 3; i++) await limiter.hit("chat:user:1", 3, WINDOW);
    expect((await limiter.hit("chat:user:1", 3, WINDOW)).allowed).toBe(false);
    expect((await limiter.hit("chat:user:2", 3, WINDOW)).allowed).toBe(true);
  });

  // ── TC-03 ──────────────────────────────────────────────────────────────────
  it("TC-03: per-API-key limits do not leak across keys", async () => {
    const limiter = new SharedRateLimiter();
    for (let i = 0; i < 3; i++) await limiter.hit("external:key:11", 3, WINDOW);
    expect((await limiter.hit("external:key:11", 3, WINDOW)).allowed).toBe(false);
    expect((await limiter.hit("external:key:12", 3, WINDOW)).allowed).toBe(true);
  });

  // ── TC-04 ──────────────────────────────────────────────────────────────────
  it("TC-04: an expired window resets the count", async () => {
    let now = 1_000_000_000_000; // window-aligned enough
    const limiter = new SharedRateLimiter(undefined, () => now);

    for (let i = 0; i < 3; i++) await limiter.hit("chat:user:9", 3, WINDOW);
    expect((await limiter.hit("chat:user:9", 3, WINDOW)).allowed).toBe(false);

    // Advance past the window: a new (key, window_start) row → fresh count
    now += WINDOW + 1;
    const fresh = await limiter.hit("chat:user:9", 3, WINDOW);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(2);
  });

  // ── TC-05 ──────────────────────────────────────────────────────────────────
  it("TC-05: store failure fails open (request allowed, flagged)", async () => {
    const limiter = new SharedRateLimiter();
    state.failNextInsert = true;
    const result = await limiter.hit("chat:user:1", 3, WINDOW);
    expect(result.allowed).toBe(true);
    expect(result.failedOpen).toBe(true);
  });

  // ── TC-09 ──────────────────────────────────────────────────────────────────
  it("TC-09: opportunistic cleanup deletes expired rows when sampled", async () => {
    let now = 1_000_000_000_000;
    const limiter = new SharedRateLimiter(undefined, () => now);
    await limiter.hit("chat:user:1", 3, WINDOW); // row expires at now + WINDOW

    now += WINDOW * 2; // the old row is now expired
    state.now = now; // align the fake table's cleanup clock with injected time
    (Math.random as ReturnType<typeof vi.fn>).mockReturnValue(0.0); // force sampling
    await limiter.hit("chat:user:1", 3, WINDOW);
    // allow the fire-and-forget delete to run
    await new Promise((r) => setTimeout(r, 0));

    expect(state.deleteCalls).toBeGreaterThan(0);
    // Only the fresh window's row remains after the expired one was purged
    expect(table.size).toBe(1);
  });
});

describe("sharedRateLimit middleware (audit F10)", () => {
  beforeEach(() => {
    resetStore();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });
  afterEach(() => vi.restoreAllMocks());

  // ── TC-06 ──────────────────────────────────────────────────────────────────
  it("TC-06: keys by session user when present, by IP otherwise", async () => {
    const seen: string[] = [];
    const limiter = new SharedRateLimiter();
    const spy = vi.spyOn(limiter, "hit");
    const mw = sharedRateLimit({ category: "t", max: 5, windowMs: WINDOW, limiter });

    await supertest(makeApp(mw, 42)).post("/probe");
    await supertest(makeApp(mw /* no user */)).post("/probe");

    seen.push(...spy.mock.calls.map((c) => c[0] as string));
    expect(seen[0]).toBe("t:user:42");
    expect(seen[1]).toMatch(/^t:ip:/);
  });

  // ── TC-07 ──────────────────────────────────────────────────────────────────
  it("TC-07: over-limit requests get 429 with the standard shape and headers", async () => {
    const limiter = new SharedRateLimiter();
    const mw = sharedRateLimit({ category: "t", max: 2, windowMs: WINDOW, limiter, message: "Slow down." });
    const app = makeApp(mw, 42);

    expect((await supertest(app).post("/probe")).status).toBe(200);
    expect((await supertest(app).post("/probe")).status).toBe(200);

    const blocked = await supertest(app).post("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "Slow down.",
      code: "RATE_LIMITED",
      retryAfter: expect.any(Number),
    });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("2");
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
  });

  // ── TC-08 ──────────────────────────────────────────────────────────────────
  it("TC-08a: /training-system edit-category routes reject after 30 requests/min", async () => {
    const app = makeApp(programEditRateLimiter, 7);
    for (let i = 0; i < 30; i++) {
      expect((await supertest(app).post("/probe")).status).toBe(200);
    }
    const blocked = await supertest(app).post("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });

  it("TC-08b: share-moments routes reject after 10 requests/min", async () => {
    const app = makeApp(shareMomentsRateLimiter, 7);
    for (let i = 0; i < 10; i++) {
      expect((await supertest(app).post("/probe")).status).toBe(200);
    }
    const blocked = await supertest(app).post("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });

  it("TC-08c: the program-edit budget is shared across edit/mutate/insights (one bucket)", async () => {
    // Same middleware instance guards all three routes with one category, so
    // hitting any mix of them consumes the same 30/min budget. Exhaust it
    // via one app; a "different route" (fresh app, same user) is still blocked.
    const appA = makeApp(programEditRateLimiter, 8);
    for (let i = 0; i < 30; i++) await supertest(appA).post("/probe");
    const appB = makeApp(programEditRateLimiter, 8);
    const blocked = await supertest(appB).post("/probe");
    expect(blocked.status).toBe(429);
  });
});

describe("defaultPrincipal", () => {
  it("prefers the session user over IP", () => {
    const req = { session: { userId: 5 }, ip: "1.2.3.4" } as any;
    expect(defaultPrincipal(req)).toBe("user:5");
  });
  it("falls back to IP when no session user", () => {
    const req = { ip: "1.2.3.4" } as any;
    expect(defaultPrincipal(req)).toBe("ip:1.2.3.4");
  });
});
