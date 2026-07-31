import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the insert chain so we can assert the seed uses an explicit conflict
// target (H4). Without a unique constraint + target, the old seed inserted a
// fresh serial-PK row on every startup. vi.hoisted keeps these usable inside the
// hoisted vi.mock factory.
const { insert, values, onConflictDoNothing, KEVIN_CAPABILITIES } = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn((_arg?: { target?: unknown[] }) => undefined);
  const values = vi.fn((_arg?: Record<string, unknown>) => ({ onConflictDoNothing }));
  const insert = vi.fn((_arg?: unknown) => ({ values }));
  return {
    insert,
    values,
    onConflictDoNothing,
    KEVIN_CAPABILITIES: ["program_generation_context", "program_edit_context"] as const,
  };
});

vi.mock("@workspace/db", () => ({
  db: { insert },
  kevinAppCapabilitiesTable: {
    scopeType: "scope_type",
    scopeId: "scope_id",
    capability: "capability",
  },
  KEVIN_CAPABILITIES,
}));

vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { seedKevinCapabilities } from "../kevin-capability-service";

describe("seedKevinCapabilities idempotency (H4)", () => {
  beforeEach(() => {
    insert.mockClear();
    values.mockClear();
    onConflictDoNothing.mockClear();
  });

  it("inserts one row per capability with onConflictDoNothing targeting the unique columns", async () => {
    await seedKevinCapabilities();

    expect(insert).toHaveBeenCalledTimes(KEVIN_CAPABILITIES.length);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(KEVIN_CAPABILITIES.length);

    // Every conflict clause must specify the (scope_type, scope_id, capability)
    // target — this is what makes re-seeding a no-op instead of a duplicate row.
    for (const call of onConflictDoNothing.mock.calls) {
      const arg = call[0];
      expect(arg).toBeDefined();
      expect(arg?.target).toEqual(["scope_type", "scope_id", "capability"]);
    }
  });

  it("seeds each capability with observe mode and disabled by default", async () => {
    await seedKevinCapabilities();
    for (const call of values.mock.calls) {
      expect(call[0]).toMatchObject({
        scopeType: "application",
        scopeId: "trainchat",
        approvalMode: "observe",
        enabled: false,
      });
    }
  });
});
