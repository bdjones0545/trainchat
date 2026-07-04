/**
 * advisory-lock-serialization.test.ts — Hardening PR 3 (audit F9)
 *
 * Proves the Postgres advisory-lock behavior of the edit transaction:
 *
 *   TC-01  applyEditPlan issues pg_advisory_xact_lock(class, trainingSystemId)
 *          as the first statement INSIDE the transaction, before any write
 *   TC-02  two concurrent edits to the SAME training system serialize: the
 *          second blocks at the lock and performs no writes until the first
 *          transaction commits
 *   TC-03  concurrent edits to DIFFERENT training systems do not block each
 *          other: the second completes while the first is still mid-transaction
 *   TC-04  a failed edit releases the lock through rollback — a queued edit on
 *          the same system proceeds afterwards
 *   TC-05  no trainingSystemId → no lock SQL issued (chat-path behavior
 *          unchanged)
 *
 * The db mock implements advisory-lock semantics faithfully at the unit level:
 * per-key FIFO grant, blocking acquire, automatic release at transaction
 * commit/rollback. Real-Postgres behavior is covered by the integration lane
 * (TESTING.md §CI split).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared recording state (referenced lazily by the mock factories) ─────────

const events: string[] = [];

const state = {
  exerciseRows: [] as Record<string, unknown>[],
  // Pause the Nth write (1-based, global) until resumePause() — lets a test
  // hold one edit mid-transaction while another edit runs.
  pauseOnWriteCall: null as number | null,
  writeCount: 0,
  // Fail the Nth write (1-based, global).
  failOnWriteCall: null as number | null,
};

let pauseGate: { promise: Promise<void>; resolve: () => void };
function newPauseGate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  pauseGate = { promise, resolve };
}
newPauseGate();

// ── Fake advisory-lock manager: per-key FIFO, released at tx end ─────────────

const lockTails = new Map<string, Promise<void>>();

function acquireFakeLock(key: string, releases: Array<() => void>): Promise<void> {
  const prev = lockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  lockTails.set(key, prev.then(() => held));
  releases.push(release);
  return prev; // granted once every earlier holder has released
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: true, col, val })),
  and: vi.fn((...conds: unknown[]) => ({ __and: conds })),
  inArray: vi.fn(),
  ne: vi.fn(),
  // Capture template text + parameters so execute() can recognize the lock
  // call and extract its key.
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    text: strings.join("$"),
    values,
  })),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/openai-models", () => ({
  OPENAI_MODELS: { EDIT_ENGINE: "test-model" },
}));

vi.mock("../lib/propagation-engine", () => ({
  buildPropagationPlan: vi.fn(async () => ({
    planId: "test-plan",
    mode: "none",
    source: {},
    targets: [],
    summary: { applyCount: 0, skipCount: 0, protectedCount: 0, customizedCount: 0, lockedCount: 0 },
  })),
  commitPropagationPlan: vi.fn(),
  getPropagationSummary: vi.fn(),
  stampUserModification: vi.fn(async () => {}),
}));

vi.mock("../lib/session-identity-sync", () => ({
  ensureSessionIdentityUpdated: vi.fn(async () => []),
  buildIdentityUpdateSummary: vi.fn(() => ""),
}));

vi.mock("../lib/prescription-remap", () => ({
  remapPrescriptionIfNeeded: vi.fn(() => ({ sets: 3, reps: "8-10", rest: "90s" })),
}));

vi.mock("../lib/session-stimulus-redistribution", () => ({
  evaluateSessionStimulusAfterMutation: vi.fn(() => ({
    updatedSessionExercises: [],
    userFacingSummary: null,
  })),
}));

vi.mock("@workspace/db", () => {
  const sessionExercises = { _tag: "sessionExercises", id: {}, name: {}, sets: {}, reps: {}, rest: {}, tempo: {}, notes: {}, rpe: {}, category: {}, metadata: {}, orderIndex: {}, trainingSessionId: {} };
  const trainingSessions = { _tag: "trainingSessions", id: {}, label: {}, trainingWeekId: {} };
  const trainingWeeks = { _tag: "trainingWeeks", id: {}, weekNumber: {}, trainingPhaseId: {} };
  const trainingPhases = { _tag: "trainingPhases", id: {}, trainingSystemId: {} };
  const trainingSystems = { _tag: "trainingSystems", id: {} };
  const exerciseLibrary = { _tag: "exerciseLibrary" };
  const globalLearningEventsTable = { _tag: "globalLearningEventsTable" };
  const learningCandidatesTable = { _tag: "learningCandidatesTable" };

  function eqValues(cond: unknown): unknown[] {
    if (!cond || typeof cond !== "object") return [];
    const c = cond as Record<string, unknown>;
    if (c.__eq) return [c.val];
    if (Array.isArray(c.__and)) return (c.__and as unknown[]).flatMap(eqValues);
    return [];
  }

  function rowsFor(tag: string | undefined, cond: unknown): Record<string, unknown>[] {
    const all = tag === "sessionExercises" ? state.exerciseRows : [];
    const vals = eqValues(cond);
    const byId = all.filter((r) => vals.includes(r.id));
    return byId.length > 0 ? byId : all;
  }

  async function recordWrite(txId: number, kind: string, tag: string): Promise<void> {
    state.writeCount += 1;
    const call = state.writeCount;
    events.push(`${kind}#${txId}:${tag}`);
    if (state.pauseOnWriteCall === call) {
      events.push(`write-paused#${txId}`);
      await pauseGate.promise;
    }
    if (state.failOnWriteCall === call) {
      throw new Error("simulated write failure");
    }
  }

  function makeTx(txId: number, releases: Array<() => void>) {
    return {
      select: vi.fn(() => {
        const q: { _table?: { _tag: string }; _cond?: unknown } = {};
        const chain: any = Object.assign(q, {
          from: vi.fn((t: { _tag: string }) => { q._table = t; return chain; }),
          where: vi.fn((cond: unknown) => { q._cond = cond; return chain; }),
          orderBy: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          innerJoin: vi.fn(() => chain),
          leftJoin: vi.fn(() => chain),
          then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(rowsFor(q._table?._tag, q._cond)).then(res, rej),
        });
        return chain;
      }),
      insert: vi.fn((table: { _tag: string }) => ({
        values: vi.fn(() => {
          const p = recordWrite(txId, "insert", table._tag);
          return {
            returning: vi.fn(() => p.then(() => [{ id: 999 }])),
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
          };
        }),
      })),
      update: vi.fn((table: { _tag: string }) => ({
        set: vi.fn(() => ({
          where: vi.fn(() => {
            const p = recordWrite(txId, "update", table._tag);
            return { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej) };
          }),
        })),
      })),
      delete: vi.fn((table: { _tag: string }) => ({
        where: vi.fn(() => recordWrite(txId, "delete", table._tag)),
      })),
      execute: vi.fn(async (query: { text?: string; values?: unknown[] }) => {
        if (query?.text?.includes("pg_advisory_xact_lock")) {
          const key = (query.values ?? []).join(":");
          events.push(`lock-wait#${txId}:${key}`);
          await acquireFakeLock(key, releases);
          events.push(`lock-acquired#${txId}:${key}`);
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
  }

  let txSeq = 0;

  const db = {
    // Module-level (outside-tx) reads: snapshots. No writes should occur here.
    select: makeTx(0, []).select,
    insert: vi.fn(() => { throw new Error("module-db insert outside tx"); }),
    update: vi.fn(() => { throw new Error("module-db update outside tx"); }),
    delete: vi.fn(() => { throw new Error("module-db delete outside tx"); }),
    execute: vi.fn(() => { throw new Error("module-db execute outside tx"); }),
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
      const txId = ++txSeq;
      const releases: Array<() => void> = [];
      const tx = makeTx(txId, releases);
      events.push(`tx-begin#${txId}`);
      try {
        const result = await fn(tx);
        events.push(`tx-commit#${txId}`);
        return result;
      } catch (err) {
        events.push(`tx-rollback#${txId}`);
        throw err;
      } finally {
        // Postgres releases xact advisory locks at COMMIT/ROLLBACK.
        for (const release of releases) release();
      }
    }),
    _resetTxSeq: () => { txSeq = 0; },
  };

  return {
    db,
    sessionExercises,
    trainingSessions,
    trainingWeeks,
    trainingPhases,
    trainingSystems,
    exerciseLibrary,
    globalLearningEventsTable,
    learningCandidatesTable,
  };
});

// Import after mocks are registered
import { applyEditPlan } from "../lib/edit-engine";
import { TRAINING_SYSTEM_LOCK_CLASS } from "../lib/advisory-lock";
import type { EditPlan } from "../lib/edit-intent-service";
import { db } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function plan(exerciseId: number): EditPlan {
  return {
    intent: "update_prescription",
    scope: "exercise",
    changeSummary: `Update exercise ${exerciseId}.`,
    changes: [{ type: "update_exercise", id: exerciseId, updates: { reps: "5" } }],
  } as EditPlan;
}

function resetState() {
  events.length = 0;
  state.exerciseRows = [
    { id: 5, name: "Back Squat", category: "primary", sets: 4, reps: "8", rest: "2 min", tempo: null, rpe: null, notes: null, orderIndex: 0, metadata: null, trainingSessionId: 11 },
    { id: 6, name: "RDL", category: "secondary", sets: 3, reps: "10", rest: "90s", tempo: null, rpe: null, notes: null, orderIndex: 1, metadata: null, trainingSessionId: 11 },
  ];
  state.pauseOnWriteCall = null;
  state.failOnWriteCall = null;
  state.writeCount = 0;
  lockTails.clear();
  newPauseGate();
  (db as any)._resetTxSeq();
  vi.clearAllMocks();
}

async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`condition timeout; events=${JSON.stringify(events)}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

const lockKey = (systemId: number) => `${TRAINING_SYSTEM_LOCK_CLASS}:${systemId}`;
const firstIndex = (prefix: string) => events.findIndex((e) => e.startsWith(prefix));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("advisory-lock serialization for edits (audit F9)", () => {
  beforeEach(() => resetState());

  // ── TC-01 ──────────────────────────────────────────────────────────────────
  it("TC-01: lock SQL is issued inside the transaction, before any write, with the right key", async () => {
    const result = await applyEditPlan(plan(5), undefined, 42);

    expect(result.appliedCount).toBe(1);
    const begin = events.indexOf("tx-begin#1");
    const acquired = events.indexOf(`lock-acquired#1:${lockKey(42)}`);
    const firstWrite = firstIndex("update#1:");
    const commit = events.indexOf("tx-commit#1");

    expect(begin).toBeGreaterThan(-1);
    expect(acquired).toBeGreaterThan(begin);      // inside the transaction
    expect(firstWrite).toBeGreaterThan(acquired); // before any write
    expect(commit).toBeGreaterThan(firstWrite);   // released at commit
  });

  // ── TC-02 ──────────────────────────────────────────────────────────────────
  it("TC-02: concurrent edits to the SAME system serialize on the lock", async () => {
    state.pauseOnWriteCall = 1; // hold edit #1 mid-transaction, lock held

    const p1 = applyEditPlan(plan(5), undefined, 42);
    await until(() => events.some((e) => e.startsWith("write-paused#1")));

    const p2 = applyEditPlan(plan(6), undefined, 42);
    await until(() => events.some((e) => e.startsWith(`lock-wait#2:${lockKey(42)}`)));
    // Give edit #2 every chance to (incorrectly) proceed
    await new Promise((r) => setTimeout(r, 25));

    // Edit #2 is parked at the lock: not acquired, zero writes
    expect(events.some((e) => e.startsWith("lock-acquired#2"))).toBe(false);
    expect(events.some((e) => e.startsWith("update#2:"))).toBe(false);

    pauseGate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.appliedCount).toBe(1);
    expect(r2.appliedCount).toBe(1);

    // Strict ordering: edit #1 committed before edit #2 got the lock
    expect(events.indexOf("tx-commit#1")).toBeLessThan(firstIndex("lock-acquired#2"));
  });

  // ── TC-03 ──────────────────────────────────────────────────────────────────
  it("TC-03: concurrent edits to DIFFERENT systems do not block each other", async () => {
    state.pauseOnWriteCall = 1; // hold edit #1 (system 42) mid-transaction

    const p1 = applyEditPlan(plan(5), undefined, 42);
    await until(() => events.some((e) => e.startsWith("write-paused#1")));

    // Edit #2 targets system 43 — must complete while #1 is still open
    const r2 = await applyEditPlan(plan(6), undefined, 43);
    expect(r2.appliedCount).toBe(1);
    expect(events).toContain("tx-commit#2");
    expect(events).not.toContain("tx-commit#1"); // #1 still mid-transaction

    pauseGate.resolve();
    const r1 = await p1;
    expect(r1.appliedCount).toBe(1);
  });

  // ── TC-04 ──────────────────────────────────────────────────────────────────
  it("TC-04: rollback releases the lock — a queued same-system edit proceeds", async () => {
    state.failOnWriteCall = 1; // edit #1's only write fails → tx rollback

    const r1 = await applyEditPlan(plan(5), undefined, 42);
    expect(events).toContain("tx-rollback#1");
    expect(r1.appliedCount).toBe(0);

    // Lock released by rollback: the next edit on the same system acquires it
    const r2 = await applyEditPlan(plan(6), undefined, 42);
    expect(r2.appliedCount).toBe(1);
    expect(events.some((e) => e.startsWith(`lock-acquired#2:${lockKey(42)}`))).toBe(true);
    expect(events).toContain("tx-commit#2");
  });

  // ── TC-05 ──────────────────────────────────────────────────────────────────
  it("TC-05: edits without a trainingSystemId issue no lock SQL (chat path unchanged)", async () => {
    const result = await applyEditPlan(plan(5));
    expect(result.appliedCount).toBe(1);
    expect(events.some((e) => e.startsWith("lock-wait#"))).toBe(false);
    expect(events).toContain("tx-commit#1");
  });
});
