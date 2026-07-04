/**
 * external-materialization-surgical.test.ts
 *
 * Unit tests for the Phase 2.4 surgical edit orchestrator
 * (maybeApplySurgicalExternalEdit). All engine collaborators are injected
 * fakes, so no DB/engine/route is exercised. The helper NEVER throws — any
 * failure returns null so the route can fall back to regeneration.
 */

import { describe, it, expect, vi } from "vitest";
import {
  maybeApplySurgicalExternalEdit,
  buildSurgicalEditMessage,
  type SurgicalEditDeps,
} from "../external-materialization/surgical";

const PARAMS = { trainingSystemId: 909, instruction: "reduce Friday volume", scope: "week" };

const UPDATED_PROGRAM = { programName: "Updated", days: [{ dayNumber: 1, name: "D1", exercises: [] }] };

function makeDeps(overrides: Partial<SurgicalEditDeps> = {}) {
  const loadFullSystem = vi.fn(async () => ({ id: 909 }) as any);
  const serializeSystemForPrompt = vi.fn(() => "SYSTEM CONTEXT");
  const interpretEditRequest = vi.fn(async () => ({ intent: "reduce_volume", scope: "week", changes: [{}] }) as any);
  const applyEditPlan = vi.fn(async () => ({ appliedCount: 2, changeSummary: "Reduced Friday volume", details: ["set Squat 3→2"] }) as any);
  const serializeToProgram = vi.fn(() => UPDATED_PROGRAM as any);
  const onError = vi.fn();
  const deps: SurgicalEditDeps = {
    loadFullSystem,
    serializeSystemForPrompt,
    interpretEditRequest,
    applyEditPlan,
    serializeToProgram,
    onError,
    ...overrides,
  };
  return { deps, loadFullSystem, serializeSystemForPrompt, interpretEditRequest, applyEditPlan, serializeToProgram, onError };
}

describe("buildSurgicalEditMessage", () => {
  it("SURG-00: appends scope when present", () => {
    expect(buildSurgicalEditMessage("do x")).toBe("do x");
    expect(buildSurgicalEditMessage("do x", "week")).toBe("do x (scope: week)");
  });
});

describe("maybeApplySurgicalExternalEdit", () => {
  it("SURG-01: success runs interpret + apply and returns the reserialized program", async () => {
    const t = makeDeps();
    const result = await maybeApplySurgicalExternalEdit(PARAMS, t.deps);

    expect(result).toEqual({
      updatedProgram: UPDATED_PROGRAM,
      changes: ["set Squat 3→2"],
      coachSummary: "Reduced Friday volume",
    });
    expect(t.interpretEditRequest).toHaveBeenCalledWith("reduce Friday volume (scope: week)", "SYSTEM CONTEXT");
    expect(t.applyEditPlan).toHaveBeenCalledWith(expect.anything(), undefined, 909);
    expect(t.loadFullSystem).toHaveBeenCalledTimes(2); // pre + post
    expect(t.onError).not.toHaveBeenCalled();
  });

  it("SURG-02: no edit plan → null, apply not called", async () => {
    const t = makeDeps({ interpretEditRequest: vi.fn(async () => null) });
    expect(await maybeApplySurgicalExternalEdit(PARAMS, t.deps)).toBeNull();
    expect(t.applyEditPlan).not.toHaveBeenCalled();
    expect(t.onError).toHaveBeenCalled();
  });

  it("SURG-03: applyEditPlan throws → null (no throw), serialize not called", async () => {
    const serializeToProgram = vi.fn(() => UPDATED_PROGRAM as any);
    const t = makeDeps({
      applyEditPlan: vi.fn(async () => {
        throw new Error("boom");
      }),
      serializeToProgram,
    });
    expect(await maybeApplySurgicalExternalEdit(PARAMS, t.deps)).toBeNull();
    expect(serializeToProgram).not.toHaveBeenCalled();
    expect(t.onError).toHaveBeenCalled();
  });

  it("SURG-04: zero changes applied → null (fall back)", async () => {
    const t = makeDeps({
      applyEditPlan: vi.fn(async () => ({ appliedCount: 0, changeSummary: "", details: [] }) as any),
    });
    expect(await maybeApplySurgicalExternalEdit(PARAMS, t.deps)).toBeNull();
    expect(t.onError).toHaveBeenCalled();
  });

  it("SURG-05: reserialization returns null → null", async () => {
    const t = makeDeps({ serializeToProgram: vi.fn(() => null) });
    expect(await maybeApplySurgicalExternalEdit(PARAMS, t.deps)).toBeNull();
    expect(t.onError).toHaveBeenCalled();
  });

  it("SURG-06: missing system on load → null, interpret not called", async () => {
    const interpretEditRequest = vi.fn(async () => ({ changes: [{}] }) as any);
    const t = makeDeps({ loadFullSystem: vi.fn(async () => null as any), interpretEditRequest });
    expect(await maybeApplySurgicalExternalEdit(PARAMS, t.deps)).toBeNull();
    expect(interpretEditRequest).not.toHaveBeenCalled();
  });
});
