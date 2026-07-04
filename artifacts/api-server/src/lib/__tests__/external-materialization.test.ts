/**
 * external-materialization.test.ts
 *
 * Unit tests for the Phase 2.1 materialization FOUNDATION (mapping, service
 * construction/delegation) plus a schema-shape check for the new
 * external_programs.training_system_id column.
 *
 * These exercise additive, unwired infrastructure. No route, no engine, no DB
 * connection, and no production behavior is involved — the service's
 * collaborators are injected fakes.
 */

import { describe, it, expect, vi } from "vitest";
import { externalProgramsTable } from "@workspace/db";
import {
  isMaterialized,
  isMaterializable,
  getProgramStructure,
  describeProgram,
} from "../external-materialization/mapping";
import {
  ExternalMaterializationService,
  type ExternalMaterializationDeps,
} from "../external-materialization/service";
import type { ExternalProgramRepository } from "../external-materialization/repository";

// ── Fixtures ────────────────────────────────────────────────────────────────

const VALID_PROGRAM = {
  programName: "Test Program",
  description: "d",
  days: [
    {
      dayNumber: 1,
      name: "Day 1",
      exercises: [
        { name: "Back Squat", sets: 3, reps: "5", rest: "2m" },
        { name: "RDL", sets: 3, reps: "8", rest: "90s" },
      ],
    },
    { dayNumber: 2, name: "Day 2", exercises: [{ name: "Bench", sets: 3, reps: "5", rest: "2m" }] },
  ],
};

// ── Schema shape ──────────────────────────────────────────────────────────────

describe("schema — external_programs.training_system_id", () => {
  it("SCHEMA-01: the column exists and maps to training_system_id", () => {
    expect(externalProgramsTable.trainingSystemId).toBeDefined();
    expect(externalProgramsTable.trainingSystemId.name).toBe("training_system_id");
  });
});

// ── Mapping layer (pure) ──────────────────────────────────────────────────────

describe("materialization mapping", () => {
  it("MAP-01: isMaterialized reflects trainingSystemId presence", () => {
    expect(isMaterialized({ trainingSystemId: null })).toBe(false);
    expect(isMaterialized({ trainingSystemId: 42 })).toBe(true);
  });

  it("MAP-02: getProgramStructure returns a valid program blob", () => {
    const program = getProgramStructure({ programData: VALID_PROGRAM });
    expect(program).not.toBeNull();
    expect(program?.programName).toBe("Test Program");
    expect(program?.days).toHaveLength(2);
  });

  it("MAP-03: getProgramStructure rejects unusable blobs", () => {
    expect(getProgramStructure({ programData: null })).toBeNull();
    expect(getProgramStructure({ programData: {} })).toBeNull();
    expect(getProgramStructure({ programData: { programName: "P", days: [] } })).toBeNull();
    expect(getProgramStructure({ programData: { days: VALID_PROGRAM.days } })).toBeNull(); // no name
    expect(getProgramStructure({ programData: "nope" })).toBeNull();
  });

  it("MAP-04: isMaterializable mirrors a usable program", () => {
    expect(isMaterializable({ programData: VALID_PROGRAM })).toBe(true);
    expect(isMaterializable({ programData: {} })).toBe(false);
  });

  it("MAP-05: describeProgram counts days and exercises", () => {
    expect(describeProgram({ programData: VALID_PROGRAM })).toEqual({
      programName: "Test Program",
      dayCount: 2,
      exerciseCount: 3,
    });
    expect(describeProgram({ programData: {} })).toBeNull();
  });
});

// ── Service construction & delegation (injected fakes) ────────────────────────

function makeService(overrides: Partial<ExternalMaterializationDeps> = {}) {
  const linkTrainingSystem = vi.fn(async () => {});
  const repository = { linkTrainingSystem } as unknown as ExternalProgramRepository;
  const resolveServiceUserId = vi.fn(async () => 99);
  const createSystem = vi.fn(async () => ({ id: 555 }));
  const svc = new ExternalMaterializationService({
    repository,
    resolveServiceUserId,
    createSystem,
    ...overrides,
  });
  return { svc, linkTrainingSystem, resolveServiceUserId, createSystem };
}

describe("ExternalMaterializationService", () => {
  it("SVC-01: constructs from injected dependencies", () => {
    const { svc } = makeService();
    expect(svc).toBeInstanceOf(ExternalMaterializationService);
  });

  it("SVC-02: isMaterialized delegates to the mapping layer", () => {
    const { svc } = makeService();
    expect(svc.isMaterialized({ trainingSystemId: null })).toBe(false);
    expect(svc.isMaterialized({ trainingSystemId: 3 })).toBe(true);
  });

  it("SVC-03: materialize resolves a user, builds a system, and links it", async () => {
    const { svc, resolveServiceUserId, createSystem, linkTrainingSystem } = makeService();
    const result = await svc.materialize(
      { id: 1, programData: VALID_PROGRAM, trainingSystemId: null },
      { apiKeyId: 7, orgId: "org-A" },
      "strength",
    );
    expect(result).toEqual({ trainingSystemId: 555, alreadyMaterialized: false });
    expect(resolveServiceUserId).toHaveBeenCalledWith({ apiKeyId: 7, orgId: "org-A" });
    expect(createSystem).toHaveBeenCalledWith(99, expect.objectContaining({ programName: "Test Program" }), null, "strength");
    expect(linkTrainingSystem).toHaveBeenCalledWith(1, 555);
  });

  it("SVC-04: materialize is a no-op when already materialized", async () => {
    const { svc, createSystem, linkTrainingSystem } = makeService();
    const result = await svc.materialize(
      { id: 1, programData: VALID_PROGRAM, trainingSystemId: 88 },
      { apiKeyId: null, orgId: null },
    );
    expect(result).toEqual({ trainingSystemId: 88, alreadyMaterialized: true });
    expect(createSystem).not.toHaveBeenCalled();
    expect(linkTrainingSystem).not.toHaveBeenCalled();
  });

  it("SVC-05: materialize throws on an unusable program blob (no side effects)", async () => {
    const { svc, createSystem, linkTrainingSystem } = makeService();
    await expect(
      svc.materialize({ id: 2, programData: {}, trainingSystemId: null }, { apiKeyId: 1, orgId: null }),
    ).rejects.toThrow(/no materializable program data/);
    expect(createSystem).not.toHaveBeenCalled();
    expect(linkTrainingSystem).not.toHaveBeenCalled();
  });
});
