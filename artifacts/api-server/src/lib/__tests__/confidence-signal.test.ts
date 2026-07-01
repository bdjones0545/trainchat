/**
 * Confidence Signal Tests
 *
 * Tests for buildConfidenceLine() as specified:
 *  1. Program build → confidence line appears
 *  2. Mutation + verified → confidence line appears
 *  3. Guidance → no confidence line
 *  4. Verification failure → no confidence line
 *  5. Constraint present → constraint-based message
 *  6. No constraints → fallback messages (equipment, safety, general)
 *  7. No internal system terms appear in output
 */

import { describe, it, expect } from "vitest";
import { buildConfidenceLine, type ConfidenceSignalInput } from "../confidence-signal";
import type { HardConstraints } from "../constraint-memory";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHC(overrides: Partial<HardConstraints> = {}): HardConstraints {
  return {
    bannedItems: [],
    dislikedItems: [],
    painRegions: [],
    monitorRegions: [],
    sport: null,
    ...overrides,
  };
}

const verifiedResult = { verified: true };
const failedResult = { verified: false };

function input(overrides: Partial<ConfidenceSignalInput> = {}): ConfidenceSignalInput {
  return {
    hardConstraints: makeHC(),
    equipmentProfile: null,
    safetyMode: false,
    verificationResult: null,
    actionType: "build",
    ...overrides,
  };
}

// ─── 1. Program build → confidence line appears ───────────────────────────────

describe("build action", () => {
  it("returns a non-null string for a basic build with no special context", () => {
    const result = buildConfidenceLine(input({ actionType: "build" }));
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("returns a non-null string even when verificationResult is null (no verifier on builds)", () => {
    const result = buildConfidenceLine(input({ actionType: "build", verificationResult: null }));
    expect(result).not.toBeNull();
  });

  it("returns a non-null string when verificationResult is provided and verified (build override)", () => {
    const result = buildConfidenceLine(input({ actionType: "build", verificationResult: verifiedResult }));
    expect(result).not.toBeNull();
  });
});

// ─── 2. Mutation + verified → confidence line appears ─────────────────────────

describe("mutation action", () => {
  it("returns a non-null string when verificationResult.verified === true", () => {
    const result = buildConfidenceLine(
      input({ actionType: "mutation", verificationResult: verifiedResult })
    );
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("returns null when verificationResult.verified === false", () => {
    const result = buildConfidenceLine(
      input({ actionType: "mutation", verificationResult: failedResult })
    );
    expect(result).toBeNull();
  });

  it("returns null when verificationResult is null (no result available)", () => {
    const result = buildConfidenceLine(
      input({ actionType: "mutation", verificationResult: null })
    );
    expect(result).toBeNull();
  });
});

// ─── 3. Guidance → no confidence line ────────────────────────────────────────

describe("guidance / unsupported actionType", () => {
  it("returns null for actionType='guidance'", () => {
    const result = buildConfidenceLine(
      input({ actionType: "guidance" as any })
    );
    expect(result).toBeNull();
  });

  it("returns null for actionType='clarification'", () => {
    const result = buildConfidenceLine(
      input({ actionType: "clarification" as any })
    );
    expect(result).toBeNull();
  });

  it("returns null for an unknown actionType string", () => {
    const result = buildConfidenceLine(
      input({ actionType: "unknown" as any })
    );
    expect(result).toBeNull();
  });
});

// ─── 4. Verification failure → no confidence line ─────────────────────────────

describe("verification failure guard", () => {
  it("mutation + verified=false → null", () => {
    expect(
      buildConfidenceLine(input({ actionType: "mutation", verificationResult: { verified: false } }))
    ).toBeNull();
  });

  it("mutation + no verification result → null", () => {
    expect(
      buildConfidenceLine(input({ actionType: "mutation", verificationResult: null }))
    ).toBeNull();
  });
});

// ─── 5. Priority: constraint → equipment → safety → general ──────────────────

describe("content priority order", () => {
  it("returns the constraint-based message when bannedItems are present (priority 1)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC({ bannedItems: ["belt squat"] }),
        equipmentProfile: "full gym",
        safetyMode: false,
      })
    );
    expect(result).toBe("Everything is built around your equipment and preferences.");
  });

  it("returns the constraint-based message when dislikedItems are present (priority 1)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC({ dislikedItems: ["lunges"] }),
        equipmentProfile: null,
      })
    );
    expect(result).toBe("Everything is built around your equipment and preferences.");
  });

  it("returns the equipment message when equipmentProfile is set and no constraints (priority 2)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC(),
        equipmentProfile: "home gym",
        safetyMode: false,
      })
    );
    expect(result).toBe("Everything fits the equipment you have available.");
  });

  it("returns the safety message when safetyMode is true and no constraints / equipment (priority 3)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC(),
        equipmentProfile: null,
        safetyMode: true,
      })
    );
    expect(result).toBe("This keeps your training aligned with your current limitations.");
  });

  it("returns the safety message when painRegions are present (priority 3)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC({ painRegions: ["knee"] }),
        equipmentProfile: null,
        safetyMode: false,
      })
    );
    expect(result).toBe("This keeps your training aligned with your current limitations.");
  });

  it("returns the general fallback message when nothing is set (priority 4)", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC(),
        equipmentProfile: null,
        safetyMode: false,
      })
    );
    expect(result).toBe("This is set up to match your goal and training setup.");
  });

  it("constraint takes precedence over equipment+safety", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC({ bannedItems: ["leg press"], dislikedItems: ["lunges"] }),
        equipmentProfile: "full gym",
        safetyMode: true,
      })
    );
    expect(result).toBe("Everything is built around your equipment and preferences.");
  });

  it("equipment takes precedence over safety when no constraints", () => {
    const result = buildConfidenceLine(
      input({
        hardConstraints: makeHC(),
        equipmentProfile: "home gym",
        safetyMode: true,
      })
    );
    expect(result).toBe("Everything fits the equipment you have available.");
  });
});

// ─── 6. No internal system terms ─────────────────────────────────────────────

describe("output cleanliness — no internal system terms", () => {
  const prohibited = [
    "hardConstraints",
    "verificationResult",
    "verifier",
    "constraints",
    "intentFamily",
    "transformHint",
    "banned",
    "disliked",
    "mutation",
    "structuredData",
    "execPlan",
  ];

  const allMessages = [
    buildConfidenceLine(input({ hardConstraints: makeHC({ bannedItems: ["x"] }) })),
    buildConfidenceLine(input({ equipmentProfile: "home gym" })),
    buildConfidenceLine(input({ safetyMode: true })),
    buildConfidenceLine(input()),
  ];

  for (const term of prohibited) {
    it(`output does not contain "${term}"`, () => {
      for (const msg of allMessages) {
        if (msg != null) {
          expect(msg).not.toContain(term);
        }
      }
    });
  }
});

// ─── 7. Max one sentence ──────────────────────────────────────────────────────

describe("output length — max 1 sentence", () => {
  it("general fallback is a single sentence", () => {
    const result = buildConfidenceLine(input())!;
    // A sentence ends with . and there should be only one
    expect(result.split(".").filter(Boolean).length).toBe(1);
  });

  it("constraint message is a single sentence", () => {
    const result = buildConfidenceLine(
      input({ hardConstraints: makeHC({ bannedItems: ["belt squat"] }) })
    )!;
    expect(result.split(".").filter(Boolean).length).toBe(1);
  });
});
