/**
 * external-materialization-repository.test.ts
 *
 * Unit tests for ExternalProgramRepository. The Drizzle client is injected as a
 * typed fake, so no live DB is touched and no `@workspace/db` module mock is
 * needed. Verifies the repository issues the expected additive queries.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ExternalProgramRepository,
  type ExternalProgramDb,
} from "../external-materialization/repository";

/** A chainable Drizzle fake: select→from→where→limit(rows); update→set→where. */
function makeFakeDb(selectRows: unknown[]) {
  const selectChain: any = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(async () => selectRows),
  };
  const updateChain: any = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => undefined),
  };
  const db = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  };
  return { db: db as unknown as ExternalProgramDb, selectChain, updateChain, raw: db };
}

describe("ExternalProgramRepository", () => {
  it("REPO-01: findById returns the first row", async () => {
    const row = { id: 5, programData: {}, trainingSystemId: null };
    const { db, raw, selectChain } = makeFakeDb([row]);
    const repo = new ExternalProgramRepository(db);

    const result = await repo.findById(5);

    expect(result).toBe(row);
    expect(raw.select).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
  });

  it("REPO-02: findById returns undefined when no row exists", async () => {
    const { db } = makeFakeDb([]);
    const repo = new ExternalProgramRepository(db);
    expect(await repo.findById(999)).toBeUndefined();
  });

  it("REPO-03: linkTrainingSystem sets training_system_id via update", async () => {
    const { db, raw, updateChain } = makeFakeDb([]);
    const repo = new ExternalProgramRepository(db);

    await repo.linkTrainingSystem(5, 42);

    expect(raw.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith({ trainingSystemId: 42 });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  it("REPO-04: updateProgramData writes the new projection", async () => {
    const { db, updateChain } = makeFakeDb([]);
    const repo = new ExternalProgramRepository(db);
    const programData = { programName: "P", days: [] };

    await repo.updateProgramData(5, programData);

    expect(updateChain.set).toHaveBeenCalledWith({ programData });
  });
});
