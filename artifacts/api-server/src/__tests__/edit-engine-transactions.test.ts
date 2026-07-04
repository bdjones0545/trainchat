/**
 * edit-engine-transactions.test.ts — Hardening PR 2 (DR-0006 / audit F8)
 *
 * Proves that surgical-edit persistence is transactional:
 *
 *   TC-01  applyEditPlan applies a successful edit through ONE db.transaction;
 *          no write escapes to the module-level db
 *   TC-02  a mid-edit write failure rolls the WHOLE edit back and returns a
 *          zero-applied result (no throw — caller contract preserved); the
 *          afterSnapshot equals the beforeSnapshot and verification is "noop",
 *          so no caller can write a change-log row that claims success
 *   TC-03  no module-level db activity occurs between tx-begin and tx-commit —
 *          add-exercise duplicate resolution (the LLM-capable path) and all
 *          snapshot reads happen strictly outside the transaction
 *   TC-04  add_exercise inserts + post-write verification run on the
 *          transaction handle (the re-read sees the uncommitted insert)
 *
 * These are unit-level proofs: the mock records which handle (module db vs
 * transaction tx) every operation went through and that the transaction
 * wrapper rejects on failure. Real-Postgres rollback is covered by the
 * integration lane (TESTING.md §CI split).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared recording state (referenced lazily by the mock factories) ─────────

interface Op {
  via: "db" | "tx";
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  values?: Record<string, unknown>;
}

const events: string[] = [];
const ops: Op[] = [];

const state = {
  // Row stores returned by table tag. Updates mutate exerciseRows[0] so the
  // before/after snapshots show a real diff for the verifier.
  exerciseRows: [] as Record<string, unknown>[],
  sessionRows: [] as Record<string, unknown>[],
  // fail the Nth WRITE (insert/update/delete) into the given table (1-based)
  failOnWrite: null as { table: string; call: number } | null,
  writeCounts: {} as Record<string, number>,
};

let idSeq = 9000;

// eq/and capture their arguments so the db mock can filter rows by id —
// needed for the add_exercise post-write re-read to find the inserted row.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: true, col, val })),
  and: vi.fn((...conds: unknown[]) => ({ __and: conds })),
  inArray: vi.fn(),
  ne: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/openai-models", () => ({
  OPENAI_MODELS: { EDIT_ENGINE: "test-model" },
}));

vi.mock("../lib/propagation-engine", () => ({
  buildPropagationPlan: vi.fn(),
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
  const trainingSessions = { _tag: "trainingSessions", id: {}, label: {}, sessionType: {}, emphasis: {}, warmupNotes: {}, coachingNotes: {}, isRestDay: {}, dayOfWeek: {}, trainingWeekId: {} };
  const trainingWeeks = { _tag: "trainingWeeks", id: {}, weekNumber: {}, label: {}, focus: {}, volumeLevel: {}, notes: {}, status: {}, trainingPhaseId: {} };
  const trainingPhases = { _tag: "trainingPhases", id: {}, name: {}, goal: {}, emphasis: {}, notes: {}, status: {}, trainingSystemId: {} };
  const trainingSystems = { _tag: "trainingSystems", id: {}, metadata: {}, equipmentAccess: {}, constraints: {}, overarchingGoal: {} };
  const exerciseLibrary = { _tag: "exerciseLibrary", id: {}, name: {}, isActive: {}, movementPattern: {}, role: {}, description: {}, intentTags: {} };
  const globalLearningEventsTable = { _tag: "globalLearningEventsTable" };
  const learningCandidatesTable = { _tag: "learningCandidatesTable", id: {}, key: {}, promoted: {}, dismissed: {}, evidenceCount: {} };

  // Extract every eq() value from a (possibly and()-wrapped) condition
  function eqValues(cond: unknown): unknown[] {
    if (!cond || typeof cond !== "object") return [];
    const c = cond as Record<string, unknown>;
    if (c.__eq) return [c.val];
    if (Array.isArray(c.__and)) return (c.__and as unknown[]).flatMap(eqValues);
    return [];
  }

  function rowsFor(tag: string | undefined, cond: unknown): Record<string, unknown>[] {
    const all =
      tag === "sessionExercises" ? state.exerciseRows :
      tag === "trainingSessions" ? state.sessionRows :
      [];
    // If the condition carries an id matching stored rows, filter to it
    // (covers eq(table.id, n) lookups like snapshots and post-write re-reads).
    const vals = eqValues(cond);
    const byId = all.filter((r) => vals.includes(r.id));
    return byId.length > 0 ? byId : all;
  }

  function makeSelect(via: "db" | "tx") {
    return vi.fn(() => {
      const q: { _table?: { _tag: string }; _cond?: unknown } = {};
      const chain: any = Object.assign(q, {
        from: vi.fn((t: { _tag: string }) => { q._table = t; return chain; }),
        where: vi.fn((cond: unknown) => { q._cond = cond; return chain; }),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        leftJoin: vi.fn(() => chain),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => {
          const tag = q._table?._tag;
          events.push(`select:${via}:${tag}`);
          ops.push({ via, kind: "select", table: tag ?? "unknown" });
          // Snapshot reads copy fields at read time, so returning live row
          // objects still yields distinct before/after snapshots.
          return Promise.resolve(rowsFor(tag, q._cond)).then(res, rej);
        },
      });
      return chain;
    });
  }

  function recordWrite(via: "db" | "tx", kind: Op["kind"], tag: string, values?: Record<string, unknown>): Promise<void> {
    events.push(`${kind}:${via}:${tag}`);
    ops.push({ via, kind, table: tag, values });
    state.writeCounts[tag] = (state.writeCounts[tag] ?? 0) + 1;
    if (state.failOnWrite?.table === tag && state.writeCounts[tag] === state.failOnWrite.call) {
      return Promise.reject(new Error("simulated write failure"));
    }
    return Promise.resolve();
  }

  function makeInsert(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        const p = recordWrite(via, "insert", table._tag, vals);
        return {
          returning: vi.fn(() => p.then(() => {
            const row = { id: idSeq++, ...vals };
            if (table._tag === "sessionExercises") state.exerciseRows.push(row);
            return [row];
          })),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
        };
      }),
    }));
  }

  function makeUpdate(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      set: vi.fn((vals: Record<string, unknown>) => ({
        where: vi.fn((cond: unknown) => {
          const p = recordWrite(via, "update", table._tag, vals).then(() => {
            // Apply to the id-matched row so after-snapshots see the change
            if (table._tag === "sessionExercises") {
              const vals2 = eqValues(cond);
              const target = state.exerciseRows.find((r) => vals2.includes(r.id)) ?? state.exerciseRows[0];
              if (target) Object.assign(target, vals);
            }
            return [];
          });
          return { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej) };
        }),
      })),
    }));
  }

  function makeDelete(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      where: vi.fn(() => recordWrite(via, "delete", table._tag)),
    }));
  }

  const tx = {
    select: makeSelect("tx"),
    insert: makeInsert("tx"),
    update: makeUpdate("tx"),
    delete: makeDelete("tx"),
  };

  const db = {
    select: makeSelect("db"),
    insert: makeInsert("db"),
    update: makeUpdate("db"),
    delete: makeDelete("db"),
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      events.push("tx-begin");
      try {
        const result = await fn(tx);
        events.push("tx-commit");
        return result;
      } catch (err) {
        events.push("tx-rollback");
        throw err;
      }
    }),
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
import type { EditPlan } from "../lib/edit-intent-service";
import { db } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetState(overrides: Partial<typeof state> = {}) {
  events.length = 0;
  ops.length = 0;
  state.exerciseRows = [
    { id: 5, name: "Back Squat", category: "primary", sets: 4, reps: "8", rest: "2 min", tempo: null, rpe: null, notes: null, orderIndex: 0, metadata: null, trainingSessionId: 11 },
    { id: 6, name: "RDL", category: "secondary", sets: 3, reps: "10", rest: "90s", tempo: null, rpe: null, notes: null, orderIndex: 1, metadata: null, trainingSessionId: 11 },
  ];
  state.sessionRows = [];
  state.failOnWrite = null;
  state.writeCounts = {};
  Object.assign(state, overrides);
  vi.clearAllMocks();
}

const updatePlan: EditPlan = {
  intent: "update_prescription",
  scope: "exercise",
  changeSummary: "Set squat reps to 5.",
  changes: [{ type: "update_exercise", id: 5, updates: { reps: "5" } }],
} as EditPlan;

const dbWrites = () => ops.filter((o) => o.via === "db" && o.kind !== "select");
const txWrites = () => ops.filter((o) => o.via === "tx" && o.kind !== "select");
const betweenTx = () => {
  const begin = events.indexOf("tx-begin");
  const end = events.findIndex((e) => e === "tx-commit" || e === "tx-rollback");
  return events.slice(begin + 1, end === -1 ? undefined : end);
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("transactional surgical edits (DR-0006 / audit F8)", () => {
  beforeEach(() => resetState());

  // ── TC-01 ──────────────────────────────────────────────────────────────────
  it("TC-01: a successful edit applies through one transaction with no module-db writes", async () => {
    const result = await applyEditPlan(updatePlan);

    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect((db.transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(events).toContain("tx-commit");

    // The mutation ran on the transaction handle; nothing wrote via module db
    expect(txWrites().map((o) => `${o.kind}:${o.table}`)).toContain("update:sessionExercises");
    expect(dbWrites()).toHaveLength(0);

    // Real verifier sees the reps diff in the after snapshot
    expect(result.verification.status).not.toBe("noop");
    expect(result.afterSnapshot.exercises["5"]?.reps).toBe("5");
    expect(result.beforeSnapshot.exercises["5"]?.reps).toBe("8");
  });

  // ── TC-02 ──────────────────────────────────────────────────────────────────
  it("TC-02: a mid-edit write failure rolls back the whole edit and returns zero-applied", async () => {
    const twoChangePlan: EditPlan = {
      intent: "update_prescription",
      scope: "session",
      changeSummary: "Update two exercises.",
      changes: [
        { type: "update_exercise", id: 5, updates: { reps: "5" } },
        { type: "update_exercise", id: 6, updates: { reps: "6" } },
      ],
    } as EditPlan;
    resetState({ failOnWrite: { table: "sessionExercises", call: 2 } });

    const result = await applyEditPlan(twoChangePlan);

    // Rolled back, not thrown — the caller contract is preserved
    expect(events).toContain("tx-rollback");
    expect(events).not.toContain("tx-commit");
    expect(result.appliedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.details.every((d) => d.includes("Rolled back"))).toBe(true);

    // No partial mutation is reported: after === before, nothing changed
    expect(result.afterSnapshot).toEqual(result.beforeSnapshot);
    expect(result.changedIds).toEqual({ exercises: [], sessions: [], weeks: [], phases: [] });
    expect(result.changeTargets).toHaveLength(0);

    // Verification is "noop" — a caller writing a change-log row from this
    // result records appliedCount 0 / no-op, never a success claim
    expect(result.verification.status).toBe("noop");

    // Every write attempt was inside the transaction → real Postgres rolls
    // all of them back; nothing escaped to the module-level db
    expect(dbWrites()).toHaveLength(0);
    expect(txWrites().length).toBeGreaterThan(0);
  });

  // ── TC-03 ──────────────────────────────────────────────────────────────────
  it("TC-03: no module-level db activity happens inside the transaction window", async () => {
    const addPlan: EditPlan = {
      intent: "add_exercise",
      scope: "session",
      changeSummary: "Add pallof press.",
      changes: [
        { type: "add_exercise", sessionId: 11, exercise: { name: "Pallof Press", category: "trunk", sets: 3, reps: "10", rest: "60s" } },
      ],
    } as EditPlan;

    await applyEditPlan(addPlan);

    // Duplicate-safe resolution (the LLM-capable path) reads via module db
    // BEFORE the transaction opens
    const txBegin = events.indexOf("tx-begin");
    expect(txBegin).toBeGreaterThan(-1);
    const resolveReads = events.filter((e) => e.startsWith("select:db:trainingSessions"));
    expect(resolveReads.length).toBeGreaterThan(0);
    for (const e of resolveReads) {
      expect(events.indexOf(e)).toBeLessThan(txBegin);
    }

    // Inside the transaction window, every event is on the tx handle
    const inside = betweenTx();
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((e) => e.includes(":tx:"))).toBe(true);
  });

  // ── TC-04 ──────────────────────────────────────────────────────────────────
  it("TC-04: add_exercise insert and post-write verification both run on the tx handle", async () => {
    const addPlan: EditPlan = {
      intent: "add_exercise",
      scope: "session",
      changeSummary: "Add pallof press.",
      changes: [
        { type: "add_exercise", sessionId: 11, exercise: { name: "Pallof Press", category: "trunk", sets: 3, reps: "10", rest: "60s" } },
      ],
    } as EditPlan;

    const result = await applyEditPlan(addPlan);

    expect(result.appliedCount).toBe(1);
    const insert = ops.find((o) => o.kind === "insert" && o.table === "sessionExercises");
    expect(insert?.via).toBe("tx");
    // The post-write verification re-read happened inside the tx (it must see
    // the uncommitted insert)
    const insideSelects = betweenTx().filter((e) => e === "select:tx:sessionExercises");
    expect(insideSelects.length).toBeGreaterThan(0);
    expect(events).toContain("tx-commit");
    expect(dbWrites()).toHaveLength(0);
  });
});
