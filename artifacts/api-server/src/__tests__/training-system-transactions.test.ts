/**
 * training-system-transactions.test.ts — Hardening PR 1 (DR-0006)
 *
 * Proves that program-generation persistence is transactional:
 *
 *   TC-01  createTrainingSystemFromProgram — full hierarchy persists through
 *          ONE db.transaction; no write escapes to the module-level db
 *   TC-02  createTrainingSystemFromProgram — a mid-insert failure rejects,
 *          the transaction rolls back, and no write ran outside it
 *   TC-03  createTrainingSystemFromProgram — archiving the previous
 *          same-focus system happens INSIDE the transaction
 *   TC-04  upsertTrainingSystemFromProgram — delete-existing-phases +
 *          recreate all run inside one transaction
 *   TC-05  upsertTrainingSystemFromProgram — failure after the phase delete
 *          rolls back (the user's program is never destroyed)
 *   TC-06  initializeTrainingSystem — exercise-library selection happens
 *          BEFORE the transaction opens (no reads inside the write tx)
 *   TC-07  generateContinuationPhase — closing the old phase and creating
 *          the new block commit together; selection happens before the tx
 *
 * These are unit-level proofs: the mock records which handle (module db vs
 * transaction tx) every write went through, and that the transaction wrapper
 * rejects on failure. Real-Postgres rollback behavior is covered by the
 * integration lane (TESTING.md §CI split).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared recording state (referenced lazily by the mock factories) ─────────

interface WriteOp {
  via: "db" | "tx";
  kind: "insert" | "update" | "delete";
  table: string;
  values?: Record<string, unknown>;
}

const events: string[] = [];
const ops: WriteOp[] = [];

const state = {
  // rows returned by module-level db.select, keyed by table tag
  activeSystems: [] as Record<string, unknown>[],
  phases: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  sessionLogs: [] as Record<string, unknown>[],
  // rows returned by tx.select (upsert reads existing phases inside the tx)
  txPhases: [] as Record<string, unknown>[],
  // fail the Nth insert into the given table (1-based)
  failOnInsert: null as { table: string; call: number } | null,
  insertCounts: {} as Record<string, number>,
};

let idSeq = 1000;

// ── drizzle-orm operators — call-safe no-ops (mock tables are plain objects) ──

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// coach-select reads the exercise library — record the event so tests can
// assert selection happens before the transaction opens.
vi.mock("../lib/coach-select", () => ({
  selectSessionExercises: vi.fn(async () => {
    events.push("select-exercises");
    return [
      { name: "Back Squat", role: "primary", sets: 4, reps: "5", rest: "3 min", notes: "" },
      { name: "RDL", role: "secondary", sets: 3, reps: "8", rest: "2 min", notes: "" },
      { name: "Plank", role: "accessory", sets: 3, reps: "45 sec", rest: "1 min", notes: "" },
    ];
  }),
}));

vi.mock("../lib/training-intelligence", () => ({
  EXERCISE_LIBRARY: [],
  detectInjuryFlags: vi.fn(() => []),
  normalizeExperience: vi.fn(() => "intermediate"),
}));

vi.mock("../lib/strength-week-expression", () => ({
  selectStrengthVariantFromLibrary: vi.fn(() => null),
  auditExerciseVariantSelection: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const trainingSystems = { _tag: "trainingSystems", id: {}, userId: {}, status: {}, conversationId: {}, currentPhaseId: {}, metadata: {} };
  const trainingPhases = { _tag: "trainingPhases", id: {}, trainingSystemId: {}, status: {}, orderIndex: {} };
  const trainingWeeks = { _tag: "trainingWeeks", id: {}, trainingPhaseId: {}, status: {}, weekNumber: {}, orderIndex: {} };
  const trainingSessions = { _tag: "trainingSessions", id: {}, trainingWeekId: {}, orderIndex: {} };
  const sessionExercises = { _tag: "sessionExercises", id: {}, trainingSessionId: {}, orderIndex: {} };
  const userProfilesTable = { _tag: "userProfilesTable", id: {}, userId: {} };
  const sessionLogsTable = { _tag: "sessionLogsTable", id: {}, userId: {}, sessionStatus: {}, difficultyScore: {}, painScore: {}, energyScore: {}, completedAt: {} };
  const activeSessionsTable = { _tag: "activeSessionsTable", id: {}, userId: {} };

  // Awaitable + chainable select builder. Resolves based on table tag + handle.
  function makeSelect(via: "db" | "tx") {
    return vi.fn(() => {
      const q: Record<string, unknown> & { _table?: { _tag: string } } = {};
      const chain = Object.assign(q, {
        from: vi.fn((t: { _tag: string }) => { q._table = t; return chain; }),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => {
          const tag = q._table?._tag;
          let rows: Record<string, unknown>[] = [];
          if (tag === "trainingSystems") rows = state.activeSystems;
          else if (tag === "trainingPhases") rows = via === "tx" ? state.txPhases : state.phases;
          else if (tag === "userProfilesTable") rows = state.profiles;
          else if (tag === "sessionLogsTable") rows = state.sessionLogs;
          return Promise.resolve(rows).then(res, rej);
        },
      });
      return chain;
    });
  }

  function makeInsert(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        const tag = table._tag;
        state.insertCounts[tag] = (state.insertCounts[tag] ?? 0) + 1;
        const shouldFail =
          state.failOnInsert?.table === tag &&
          state.insertCounts[tag] === state.failOnInsert.call;
        ops.push({ via, kind: "insert", table: tag, values: vals });
        const p = shouldFail
          ? Promise.reject(new Error("simulated insert failure"))
          : Promise.resolve([{ id: idSeq++, ...vals }]);
        return {
          returning: vi.fn(() => p),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            p.then(res, rej),
        };
      }),
    }));
  }

  function makeUpdate(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      set: vi.fn((vals: Record<string, unknown>) => ({
        where: vi.fn(() => {
          ops.push({ via, kind: "update", table: table._tag, values: vals });
          return Promise.resolve([]);
        }),
      })),
    }));
  }

  function makeDelete(via: "db" | "tx") {
    return vi.fn((table: { _tag: string }) => ({
      where: vi.fn(() => {
        ops.push({ via, kind: "delete", table: table._tag });
        return Promise.resolve([]);
      }),
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
    trainingSystems,
    trainingPhases,
    trainingWeeks,
    trainingSessions,
    sessionExercises,
    userProfilesTable,
    sessionLogsTable,
    activeSessionsTable,
  };
});

// Import after mocks are registered
import {
  createTrainingSystemFromProgram,
  upsertTrainingSystemFromProgram,
  initializeTrainingSystem,
  generateContinuationPhase,
  type ChatProgram,
} from "../lib/training-system-service";
import { db } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

const program: ChatProgram = {
  programName: "Speed Block A",
  description: "Two-day speed program",
  splitType: "speed",
  days: [
    {
      dayNumber: 1,
      name: "Day 1 — Acceleration",
      focus: "acceleration",
      exercises: [
        { name: "Sled Sprint", sets: 5, reps: "20m", rest: "2 min" },
        { name: "Broad Jump", sets: 3, reps: "3", rest: "90 sec" },
      ],
    },
    {
      dayNumber: 2,
      name: "Day 2 — Max Velocity",
      focus: "top speed",
      exercises: [{ name: "Flying 20s", sets: 4, reps: "20m", rest: "3 min" }],
    },
  ],
};

function resetState(overrides: Partial<typeof state> = {}) {
  events.length = 0;
  ops.length = 0;
  state.activeSystems = [];
  state.phases = [];
  state.profiles = [];
  state.sessionLogs = [];
  state.txPhases = [];
  state.failOnInsert = null;
  state.insertCounts = {};
  Object.assign(state, overrides);
  vi.clearAllMocks();
}

const dbWrites = () => ops.filter((o) => o.via === "db");
const txWrites = () => ops.filter((o) => o.via === "tx");
const txInserts = (table: string) =>
  ops.filter((o) => o.via === "tx" && o.kind === "insert" && o.table === table);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("transactional program generation (DR-0006)", () => {
  beforeEach(() => resetState());

  // ── TC-01 ──────────────────────────────────────────────────────────────────
  it("TC-01: createTrainingSystemFromProgram persists the full hierarchy in ONE transaction", async () => {
    const system = await createTrainingSystemFromProgram(1, program, null, "speed");

    expect(system).toBeDefined();
    expect((db.transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    // Every row of the hierarchy went through the transaction handle
    expect(txInserts("trainingSystems")).toHaveLength(1);
    expect(txInserts("trainingPhases")).toHaveLength(1);
    expect(txInserts("trainingWeeks")).toHaveLength(4);
    expect(txInserts("trainingSessions")).toHaveLength(4 * program.days.length);
    // 4 weeks × (2 + 1) exercises across the two days
    expect(txInserts("sessionExercises")).toHaveLength(4 * 3);

    // No write escaped to the module-level db
    expect(dbWrites()).toHaveLength(0);
    expect(events).toContain("tx-commit");
  });

  // ── TC-02 ──────────────────────────────────────────────────────────────────
  it("TC-02: a mid-insert failure rejects and rolls the whole build back", async () => {
    resetState({ failOnInsert: { table: "sessionExercises", call: 5 } });

    await expect(
      createTrainingSystemFromProgram(1, program, null, "speed"),
    ).rejects.toThrow("simulated insert failure");

    expect(events).toContain("tx-rollback");
    expect(events).not.toContain("tx-commit");
    // Every write attempt was inside the transaction, so the real database
    // rolls all of them back — nothing ran on the module-level db.
    expect(dbWrites()).toHaveLength(0);
    expect(txWrites().length).toBeGreaterThan(0);
  });

  // ── TC-03 ──────────────────────────────────────────────────────────────────
  it("TC-03: archiving the previous same-focus system happens inside the transaction", async () => {
    resetState({
      activeSystems: [{ id: 3, status: "active", metadata: { focusMode: "speed" } }],
    });

    await createTrainingSystemFromProgram(1, program, null, "speed");

    const archiveOps = ops.filter(
      (o) => o.kind === "update" && o.table === "trainingSystems" && o.values?.status === "archived",
    );
    expect(archiveOps).toHaveLength(1);
    expect(archiveOps[0].via).toBe("tx");
  });

  // ── TC-04 ──────────────────────────────────────────────────────────────────
  it("TC-04: upsert deletes existing phases and recreates everything inside one transaction", async () => {
    resetState({
      activeSystems: [{ id: 7, status: "active", metadata: { focusMode: "speed" } }],
      txPhases: [{ id: 71 }, { id: 72 }],
    });

    const result = await upsertTrainingSystemFromProgram(1, program, "speed", null);

    expect(result.isUpdate).toBe(true);
    expect((db.transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    const deletes = ops.filter((o) => o.kind === "delete" && o.table === "trainingPhases");
    expect(deletes).toHaveLength(2);
    expect(deletes.every((o) => o.via === "tx")).toBe(true);

    expect(txInserts("trainingPhases")).toHaveLength(1);
    expect(txInserts("trainingWeeks")).toHaveLength(4);
    expect(dbWrites()).toHaveLength(0);
    expect(events).toContain("tx-commit");
  });

  it("preserves a profile-review warning for an ordinary program edit", async () => {
    resetState({
      activeSystems: [{ id: 7, status: "active", metadata: { focusMode: "speed" }, needsReview: true }],
      txPhases: [{ id: 71 }],
    });

    await upsertTrainingSystemFromProgram(1, program, "speed", null);

    const systemUpdate = ops.find(
      (operation) => operation.kind === "update" && operation.table === "trainingSystems"
        && operation.values?.name === program.programName,
    );
    expect(systemUpdate?.values?.needsReview).toBeUndefined();
  });

  it("clears review metadata only for an explicit compatible reconciliation", async () => {
    resetState({
      activeSystems: [{ id: 7, status: "active", metadata: { focusMode: "speed" }, needsReview: true }],
      txPhases: [{ id: 71 }],
    });

    await upsertTrainingSystemFromProgram(
      1,
      program,
      "speed",
      null,
      null,
      { resolvesProfileReview: true },
    );

    const systemUpdate = ops.find(
      (operation) => operation.kind === "update" && operation.table === "trainingSystems"
        && operation.values?.name === program.programName,
    );
    expect(systemUpdate?.values).toMatchObject({
      needsReview: false,
      reviewReasons: null,
      markedNeedsReviewAt: null,
    });
  });

  // ── TC-05 ──────────────────────────────────────────────────────────────────
  it("TC-05: upsert failure after the phase delete rolls back — the program is never destroyed", async () => {
    resetState({
      activeSystems: [{ id: 7, status: "active", metadata: { focusMode: "speed" } }],
      txPhases: [{ id: 71 }],
      failOnInsert: { table: "trainingWeeks", call: 2 },
    });

    await expect(
      upsertTrainingSystemFromProgram(1, program, "speed", null),
    ).rejects.toThrow("simulated insert failure");

    expect(events).toContain("tx-rollback");
    expect(events).not.toContain("tx-commit");
    // The destructive delete ran inside the tx, so rollback restores it.
    const deletes = ops.filter((o) => o.kind === "delete" && o.table === "trainingPhases");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].via).toBe("tx");
    expect(dbWrites()).toHaveLength(0);
  });

  // ── TC-06 ──────────────────────────────────────────────────────────────────
  it("TC-06: initializeTrainingSystem pre-selects exercises BEFORE the transaction opens", async () => {
    const system = await initializeTrainingSystem(1);

    expect(system).toBeDefined();
    const txBegin = events.indexOf("tx-begin");
    const lastSelect = events.lastIndexOf("select-exercises");
    expect(txBegin).toBeGreaterThan(-1);
    expect(lastSelect).toBeGreaterThan(-1);
    // All exercise-library reads happened before the write transaction opened
    expect(lastSelect).toBeLessThan(txBegin);

    expect(txInserts("trainingSystems")).toHaveLength(1);
    expect(txInserts("trainingWeeks")).toHaveLength(4);
    expect(dbWrites()).toHaveLength(0);
    expect(events).toContain("tx-commit");
  });

  // ── TC-07 ──────────────────────────────────────────────────────────────────
  it("TC-07: generateContinuationPhase closes the old phase and creates the new block atomically", async () => {
    resetState({
      activeSystems: [
        { id: 9, status: "active", currentPhaseId: 90, metadata: { focusMode: "strength" } },
      ],
      phases: [
        {
          id: 90,
          status: "current",
          orderIndex: 0,
          name: "Foundation Block",
          metadata: { blockType: "FOUNDATION_ACCUMULATION" },
        },
      ],
    });

    const newPhase = await generateContinuationPhase(1, { mode: "next" });

    expect(newPhase).toBeDefined();
    expect((db.transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    // Selection ran before the tx opened
    const txBegin = events.indexOf("tx-begin");
    expect(events.lastIndexOf("select-exercises")).toBeLessThan(txBegin);

    // Mark-completed writes moved INSIDE the transaction: a failed build can
    // no longer close out the old phase without creating the new one.
    const completedOps = ops.filter(
      (o) => o.kind === "update" && o.values?.status === "completed",
    );
    expect(completedOps.length).toBe(2); // weeks + phase
    expect(completedOps.every((o) => o.via === "tx")).toBe(true);

    expect(txInserts("trainingPhases")).toHaveLength(1);
    expect(txInserts("trainingWeeks")).toHaveLength(4);
    expect(dbWrites()).toHaveLength(0);
    expect(events).toContain("tx-commit");
  });

  // ── TC-08 ──────────────────────────────────────────────────────────────────
  it("TC-08: continuation failure rolls back the old-phase close-out too", async () => {
    resetState({
      activeSystems: [
        { id: 9, status: "active", currentPhaseId: 90, metadata: { focusMode: "strength" } },
      ],
      phases: [
        {
          id: 90,
          status: "current",
          orderIndex: 0,
          name: "Foundation Block",
          metadata: { blockType: "FOUNDATION_ACCUMULATION" },
        },
      ],
      failOnInsert: { table: "trainingSessions", call: 3 },
    });

    await expect(generateContinuationPhase(1, { mode: "next" })).rejects.toThrow(
      "simulated insert failure",
    );

    expect(events).toContain("tx-rollback");
    expect(events).not.toContain("tx-commit");
    // The completed-status updates were inside the tx → rolled back with it.
    const completedOps = ops.filter(
      (o) => o.kind === "update" && o.values?.status === "completed",
    );
    expect(completedOps.every((o) => o.via === "tx")).toBe(true);
    expect(dbWrites()).toHaveLength(0);
  });
});
