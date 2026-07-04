/**
 * external-materialization-adapter.test.ts
 *
 * Unit tests for the Phase 2.2 round-trip adapter. Every collaborator is an
 * injected fake that faithfully simulates the DB round trip in memory, so the
 * tests prove the adapter's orchestration + field preservation without a live
 * DB, engine, or route. No production path is exercised.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createDefaultRoundTripDeps,
  materializeExternalProgram,
  reserializeTrainingSystem,
  roundTripExternalProgram,
  type RoundTripAdapterDeps,
} from "../external-materialization/adapter";
import type { ChatProgram } from "../training-system-service";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PROGRAM: ChatProgram = {
  programName: "Round Trip Program",
  description: "desc",
  splitType: "upper/lower",
  progressionStrategy: "linear",
  days: [
    {
      dayNumber: 1,
      name: "Day 1",
      focus: "lower",
      exercises: [
        { name: "Back Squat", sets: 3, reps: "5", rest: "2m" },
        { name: "RDL", sets: 3, reps: "8", rest: "90s" },
      ],
    },
    {
      dayNumber: 2,
      name: "Day 2",
      focus: "upper",
      exercises: [{ name: "Bench Press", sets: 3, reps: "5", rest: "2m" }],
    },
  ],
};

/**
 * A faithful in-memory fake of the materialize → load → serialize round trip.
 * `createSystem` stores the program under a new id; `loadFullSystem` returns a
 * wrapper; `serializeSystem` reconstructs a ProgramStructure from the stored
 * program — so a real round trip preserves name/days/exercises.
 */
function makeFakeDeps() {
  const store = new Map<number, ChatProgram>();
  let nextId = 100;

  const resolveServiceUserId = vi.fn(async () => 99);
  const createSystem = vi.fn(async (_userId: number, program: ChatProgram) => {
    const id = nextId++;
    store.set(id, program);
    return { id };
  });
  const loadFullSystem = vi.fn(async (id: number) =>
    store.has(id) ? ({ id, __program: store.get(id) } as any) : null,
  );
  const serializeSystem = vi.fn((full: any) => {
    const p: ChatProgram = full.__program;
    return {
      programName: p.programName,
      description: p.description ?? "",
      splitType: p.splitType,
      progressionStrategy: p.progressionStrategy,
      days: p.days.map((d) => ({
        dayNumber: d.dayNumber,
        name: d.name,
        focus: d.focus,
        notes: d.notes,
        exercises: d.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          rest: e.rest,
          classification: e.classification,
          intent: e.intent,
          notes: e.notes,
        })),
      })),
    };
  });

  const deps: RoundTripAdapterDeps = {
    resolveServiceUserId,
    createSystem,
    loadFullSystem,
    serializeSystem,
  };
  return { deps, store, resolveServiceUserId, createSystem, loadFullSystem, serializeSystem };
}

const OWNER = { apiKeyId: 7, orgId: "org-A" };

// ── Round trip ────────────────────────────────────────────────────────────────

describe("round-trip adapter", () => {
  it("RT-01: ProgramStructure → training_system → ProgramStructure preserves name/days/exercises", async () => {
    const { deps } = makeFakeDeps();
    const result = await roundTripExternalProgram(PROGRAM, OWNER, deps, "strength");

    expect(result).not.toBeNull();
    expect(result!.program.programName).toBe("Round Trip Program");
    expect(result!.program.days).toHaveLength(2);
    expect(result!.program.days[0].exercises.map((e) => e.name)).toEqual(["Back Squat", "RDL"]);
    expect(result!.program.days[1].exercises.map((e) => e.name)).toEqual(["Bench Press"]);
    const totalExercises = result!.program.days.reduce((n, d) => n + d.exercises.length, 0);
    expect(totalExercises).toBe(3);
  });

  it("RT-02: materializeExternalProgram resolves the service user and creates a system", async () => {
    const { deps, resolveServiceUserId, createSystem } = makeFakeDeps();
    const { trainingSystemId } = await materializeExternalProgram(PROGRAM, OWNER, deps, "strength");

    expect(trainingSystemId).toBe(100);
    // Service-user ownership is injected — resolver called with the owner ctx,
    // and the resolved userId (99) is what builds the system.
    expect(resolveServiceUserId).toHaveBeenCalledWith(OWNER);
    expect(createSystem).toHaveBeenCalledWith(99, PROGRAM, null, "strength");
  });

  it("RT-03: reserializeTrainingSystem returns null for a missing system", async () => {
    const { deps } = makeFakeDeps();
    expect(await reserializeTrainingSystem(999, deps)).toBeNull();
  });

  it("RT-04: roundTrip returns null for invalid/empty program data (no system created)", async () => {
    const { deps, createSystem } = makeFakeDeps();
    expect(await roundTripExternalProgram({}, OWNER, deps)).toBeNull();
    expect(await roundTripExternalProgram(null, OWNER, deps)).toBeNull();
    expect(await roundTripExternalProgram({ programName: "P", days: [] }, OWNER, deps)).toBeNull();
    expect(createSystem).not.toHaveBeenCalled();
  });

  it("RT-05: round trip preserves prescription fields (sets/reps/rest)", async () => {
    const { deps } = makeFakeDeps();
    const result = await roundTripExternalProgram(PROGRAM, OWNER, deps);
    const squat = result!.program.days[0].exercises[0];
    expect(squat).toMatchObject({ name: "Back Squat", sets: 3, reps: "5", rest: "2m" });
  });

  it("RT-06: createDefaultRoundTripDeps wires functions without invoking them", () => {
    const resolveServiceUserId = vi.fn(async () => 1);
    const deps = createDefaultRoundTripDeps(resolveServiceUserId);
    expect(typeof deps.createSystem).toBe("function");
    expect(typeof deps.loadFullSystem).toBe("function");
    expect(typeof deps.serializeSystem).toBe("function");
    expect(deps.resolveServiceUserId).toBe(resolveServiceUserId);
    // Constructing deps must not resolve a user or touch the DB.
    expect(resolveServiceUserId).not.toHaveBeenCalled();
  });
});
