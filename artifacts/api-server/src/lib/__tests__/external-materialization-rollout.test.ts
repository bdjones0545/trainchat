/**
 * external-materialization-rollout.test.ts
 *
 * Phase 2.7 rollout controls: pilot-gated feature flags, observability
 * counters, and the migration-readiness diagnostic. All pure/DI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isExternalMaterializationEnabled,
  isExternalSurgicalEditEnabled,
  isAnyExternalFlagPotentiallyEnabled,
} from "../external-materialization/feature-flag";
import {
  emitExternalEvent,
  getExternalEventCounts,
  resetExternalEventCounts,
} from "../external-materialization/metrics";
import { checkExternalMaterializationReadiness } from "../external-materialization/readiness";

vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const FLAG_ENVS = [
  "EXTERNAL_MATERIALIZATION_ENABLED",
  "EXTERNAL_SURGICAL_EDIT_ENABLED",
  "EXTERNAL_MATERIALIZATION_PILOT_KEYS",
  "EXTERNAL_MATERIALIZATION_PILOT_ORGS",
  "EXTERNAL_SURGICAL_EDIT_PILOT_KEYS",
  "EXTERNAL_SURGICAL_EDIT_PILOT_ORGS",
];

describe("feature flags — default-off + pilot gating", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of FLAG_ENVS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of FLAG_ENVS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("FLAG-01: both flags OFF by default (even with context)", () => {
    expect(isExternalMaterializationEnabled()).toBe(false);
    expect(isExternalSurgicalEditEnabled()).toBe(false);
    expect(isExternalSurgicalEditEnabled({ apiKeyId: 5, orgId: "org-A" })).toBe(false);
    expect(isAnyExternalFlagPotentiallyEnabled()).toBe(false);
  });

  it("FLAG-02: global env flag enables for everyone", () => {
    process.env.EXTERNAL_SURGICAL_EDIT_ENABLED = "true";
    expect(isExternalSurgicalEditEnabled()).toBe(true);
    expect(isExternalSurgicalEditEnabled({ apiKeyId: 1 })).toBe(true);
    expect(isAnyExternalFlagPotentiallyEnabled()).toBe(true);
  });

  it("FLAG-03: pilot key allowlist enables only listed keys", () => {
    process.env.EXTERNAL_SURGICAL_EDIT_PILOT_KEYS = "7, 9";
    expect(isExternalSurgicalEditEnabled({ apiKeyId: 7 })).toBe(true);
    expect(isExternalSurgicalEditEnabled({ apiKeyId: 8 })).toBe(false);
    expect(isExternalSurgicalEditEnabled()).toBe(false); // no context → global only
    expect(isAnyExternalFlagPotentiallyEnabled()).toBe(true);
  });

  it("FLAG-04: pilot org allowlist enables only listed orgs", () => {
    process.env.EXTERNAL_MATERIALIZATION_PILOT_ORGS = "org-A";
    expect(isExternalMaterializationEnabled({ orgId: "org-A" })).toBe(true);
    expect(isExternalMaterializationEnabled({ orgId: "org-B" })).toBe(false);
  });
});

describe("observability counters", () => {
  beforeEach(() => resetExternalEventCounts());

  it("METRIC-01: emit increments per-event counters", () => {
    emitExternalEvent("surgical_succeeded", { programId: 1 });
    emitExternalEvent("surgical_succeeded", { programId: 2 });
    emitExternalEvent("materialize_failed", { programId: 3 });
    expect(getExternalEventCounts()).toMatchObject({ surgical_succeeded: 2, materialize_failed: 1 });
  });
});

describe("migration-readiness diagnostic", () => {
  it("READY-01: flags off → flags_off, column never probed", async () => {
    const columnExists = vi.fn(async () => true);
    expect(await checkExternalMaterializationReadiness({ anyFlagEnabled: false, columnExists })).toBe("flags_off");
    expect(columnExists).not.toHaveBeenCalled();
  });

  it("READY-02: flags on + column present → ready", async () => {
    expect(
      await checkExternalMaterializationReadiness({ anyFlagEnabled: true, columnExists: async () => true }),
    ).toBe("ready");
  });

  it("READY-03: flags on + column MISSING → missing_migration + warns", async () => {
    const onWarn = vi.fn();
    expect(
      await checkExternalMaterializationReadiness({ anyFlagEnabled: true, columnExists: async () => false, onWarn }),
    ).toBe("missing_migration");
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0][0]).toMatch(/ordered database migrations/);
  });

  it("READY-04: probe error → probe_error (never throws)", async () => {
    const onWarn = vi.fn();
    expect(
      await checkExternalMaterializationReadiness({
        anyFlagEnabled: true,
        columnExists: async () => {
          throw new Error("db down");
        },
        onWarn,
      }),
    ).toBe("probe_error");
    expect(onWarn).toHaveBeenCalled();
  });
});
