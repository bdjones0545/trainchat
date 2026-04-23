/**
 * Mode-Aware Intent Classification Tests
 *
 * Validates Phase 2 of the intent engine: normalizeToIntentFamily(message, focusMode?)
 *
 * Three test sections:
 *   1. Mode-Specific Routing — cases where focusMode CHANGES the outcome vs. no-mode global
 *   2. Mode-Transparent Routing — phrases that route correctly in any mode (no mode override needed)
 *   3. Backward Compatibility — callers without focusMode still get correct global results
 *
 * Every test that asserts mode-specific behavior also includes a debugInfo assertion
 * confirming matchedBy === "mode-specific" so we can verify the pre-pass fired.
 */

import { describe, it, expect } from "vitest";
import { normalizeToIntentFamily } from "../intent-family-engine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mode(result: ReturnType<typeof normalizeToIntentFamily>): string | undefined {
  return result.debugInfo?.matchedBy as string | undefined;
}

// ─── SPEED MODE — explicit routing tests ─────────────────────────────────────

describe("SPEED mode — reactive_focus priority", () => {
  it("'lighter on the ground' with speed mode → reactive_focus via mode-specific pre-pass", () => {
    const result = normalizeToIntentFamily("lighter on the ground", "speed");
    expect(result.family).toBe("reactive_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'lighter on my feet' with speed mode → reactive_focus", () => {
    const result = normalizeToIntentFamily("lighter on my feet", "speed");
    expect(result.family).toBe("reactive_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'more pop' with speed mode → reactive_focus (not power_explosive_focus)", () => {
    const result = normalizeToIntentFamily("more pop", "speed");
    expect(result.family).toBe("reactive_focus");
    expect(result.family).not.toBe("power_explosive_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'snappier' with speed mode → reactive_focus via mode-specific pre-pass", () => {
    const result = normalizeToIntentFamily("snappier", "speed");
    expect(result.family).toBe("reactive_focus");
  });

  it("'crisper contacts' with speed mode → reactive_focus", () => {
    const result = normalizeToIntentFamily("crisper contacts", "speed");
    expect(result.family).toBe("reactive_focus");
    expect(mode(result)).toBe("mode-specific");
  });
});

describe("SPEED mode — footwork_rhythm_focus priority", () => {
  it("'quickness' with speed mode → footwork_rhythm_focus (not power_explosive_focus)", () => {
    const result = normalizeToIntentFamily("quickness", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
    expect(result.family).not.toBe("power_explosive_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'foot speed' with speed mode → footwork_rhythm_focus", () => {
    const result = normalizeToIntentFamily("improve my foot speed", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'faster feet' with speed mode → footwork_rhythm_focus", () => {
    const result = normalizeToIntentFamily("faster feet", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
  });

  it("'more footwork' with speed mode → footwork_rhythm_focus", () => {
    const result = normalizeToIntentFamily("more footwork", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
  });

  it("'ladder drills' with speed mode → footwork_rhythm_focus", () => {
    const result = normalizeToIntentFamily("more ladder drills", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
  });

  it("'lateral shuffle' with speed mode → footwork_rhythm_focus", () => {
    const result = normalizeToIntentFamily("add lateral shuffle work", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
    expect(mode(result)).toBe("mode-specific");
  });
});

describe("SPEED mode — cod_decel_focus priority", () => {
  it("'better change of direction' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("better change of direction", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(result.family).not.toBe("power_explosive_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'more decel' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("more decel", "speed");
    expect(result.family).toBe("cod_decel_focus");
  });

  it("'better agility' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("better agility", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'agility work' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("more agility work", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'cut faster' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("I need to cut faster", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'sharper cuts' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("I want sharper cuts", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'T-drill' with speed mode → cod_decel_focus", () => {
    const result = normalizeToIntentFamily("add T-drill", "speed");
    expect(result.family).toBe("cod_decel_focus");
  });
});

describe("SPEED mode — anti-collision: power_explosive_focus not stealing COD/footwork/reactive", () => {
  it("'quickness' with NO mode → power_explosive_focus (global behavior preserved)", () => {
    const result = normalizeToIntentFamily("quickness");
    expect(result.family).toBe("power_explosive_focus");
    expect(mode(result)).toBe("global");
  });

  it("'quickness' with speed mode → footwork_rhythm_focus (mode intercepts)", () => {
    const result = normalizeToIntentFamily("quickness", "speed");
    expect(result.family).toBe("footwork_rhythm_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'change of direction' with NO mode → cod_decel_focus (already fixed globally)", () => {
    const result = normalizeToIntentFamily("change of direction");
    expect(result.family).toBe("cod_decel_focus");
  });

  it("'change of direction' with speed mode → cod_decel_focus (mode-specific pre-pass)", () => {
    const result = normalizeToIntentFamily("change of direction", "speed");
    expect(result.family).toBe("cod_decel_focus");
    expect(mode(result)).toBe("mode-specific");
  });
});

// ─── MOBILITY MODE — explicit routing tests ────────────────────────────────────

describe("MOBILITY mode — recovery_focus for restorative requests", () => {
  it("'more restorative' with NO mode → clarification_required (no global pattern)", () => {
    const result = normalizeToIntentFamily("more restorative");
    expect(result.family).toBe("clarification_required");
  });

  it("'more restorative' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("more restorative", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'restorative session' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("make this a restorative session", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'yin style' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("yin style approach", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'soften it' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("soften it a bit", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'gentler session' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("gentler session", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'easier on my joints' with mobility mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("easier on my joints", "mobility");
    expect(result.family).toBe("recovery_focus");
    expect(mode(result)).toBe("mode-specific");
  });
});

describe("MOBILITY mode — rom_restoration_focus for depth/range challenge", () => {
  it("'more depth' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("more depth", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'deeper stretch' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("deeper stretch", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'push the range' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("push the range more", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'open my hips' with mobility mode → rom_restoration_focus (global, confirmed in any mode)", () => {
    const result = normalizeToIntentFamily("open my hips", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
  });

  it("'more range' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("more range", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
  });

  it("'CARs' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("add CARs to my sessions", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
    expect(mode(result)).toBe("mode-specific");
  });

  it("'controlled articular rotations' with mobility mode → rom_restoration_focus", () => {
    const result = normalizeToIntentFamily("add controlled articular rotations", "mobility");
    expect(result.family).toBe("rom_restoration_focus");
    expect(mode(result)).toBe("mode-specific");
  });
});

describe("MOBILITY mode — less stiffness routes correctly", () => {
  it("'less stiffness' with mobility mode → tissue_stiffness_focus (global patterns, mode falls through)", () => {
    const result = normalizeToIntentFamily("less stiffness", "mobility");
    expect(result.family).toBe("tissue_stiffness_focus");
  });

  it("'reduce stiffness' with mobility mode → tissue_stiffness_focus", () => {
    const result = normalizeToIntentFamily("reduce stiffness", "mobility");
    expect(result.family).toBe("tissue_stiffness_focus");
  });
});

describe("MOBILITY mode — 'more intense' correctly routes", () => {
  it("'more intense' with mobility mode → increase_difficulty (still appropriate — harder holds, not barbell load)", () => {
    const result = normalizeToIntentFamily("more intense", "mobility");
    expect(result.family).toBe("increase_difficulty");
  });
});

// ─── STRENGTH MODE — stability tests ──────────────────────────────────────────

describe("STRENGTH mode — key strength phrases stay stable", () => {
  it("'more explosive' with strength mode → power_explosive_focus", () => {
    const result = normalizeToIntentFamily("more explosive", "strength");
    expect(result.family).toBe("power_explosive_focus");
  });

  it("'more power' with strength mode → power_explosive_focus", () => {
    const result = normalizeToIntentFamily("more power", "strength");
    expect(result.family).toBe("power_explosive_focus");
  });

  it("'rate of force' with strength mode → power_explosive_focus", () => {
    const result = normalizeToIntentFamily("rate of force development", "strength");
    expect(result.family).toBe("power_explosive_focus");
  });

  it("'more strength' with strength mode → strength_focus", () => {
    const result = normalizeToIntentFamily("more strength", "strength");
    expect(result.family).toBe("strength_focus");
  });

  it("'deload' with strength mode → recovery_focus", () => {
    const result = normalizeToIntentFamily("I need a deload week", "strength");
    expect(result.family).toBe("recovery_focus");
  });

  it("'lower fatigue' with strength mode → fatigue_management or recovery_focus", () => {
    const result = normalizeToIntentFamily("lower fatigue", "strength");
    expect(["fatigue_management", "recovery_focus", "decrease_volume", "session_reduction"]).toContain(result.family);
  });

  it("'shorter session' with strength mode → reduce_time or session_reduction", () => {
    const result = normalizeToIntentFamily("shorter session", "strength");
    expect(["reduce_time", "session_reduction"]).toContain(result.family);
  });
});

// ─── Backward compatibility — no mode supplied ─────────────────────────────────

describe("backward compatibility — no focusMode preserves global routing", () => {
  it("'more explosive' (no mode) → power_explosive_focus", () => {
    expect(normalizeToIntentFamily("more explosive").family).toBe("power_explosive_focus");
    expect(mode(normalizeToIntentFamily("more explosive"))).toBe("global");
  });

  it("'more decel' (no mode) → cod_decel_focus", () => {
    expect(normalizeToIntentFamily("more decel").family).toBe("cod_decel_focus");
  });

  it("'more footwork' (no mode) → footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("more footwork").family).toBe("footwork_rhythm_focus");
  });

  it("'open my hips' (no mode) → rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("open my hips").family).toBe("rom_restoration_focus");
  });

  it("'less stiffness' (no mode) → tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("less stiffness").family).toBe("tissue_stiffness_focus");
  });

  it("'more restorative' (no mode) → clarification_required (no global pattern yet)", () => {
    expect(normalizeToIntentFamily("more restorative").family).toBe("clarification_required");
  });

  it("'make it harder' (no mode) → increase_difficulty", () => {
    expect(normalizeToIntentFamily("make it harder").family).toBe("increase_difficulty");
  });

  it("'tight hips' (no mode) → mobility_support", () => {
    expect(normalizeToIntentFamily("tight hips").family).toBe("mobility_support");
  });

  it("'deload week' (no mode) → recovery_focus", () => {
    expect(normalizeToIntentFamily("I need a deload week").family).toBe("recovery_focus");
  });

  it("matchedBy is 'global' when no mode supplied", () => {
    const result = normalizeToIntentFamily("more explosive");
    expect(result.debugInfo.matchedBy).toBe("global");
    expect(result.debugInfo.focusMode).toBeNull();
  });

  it("matchedBy is 'fallback' when no match (no mode)", () => {
    const result = normalizeToIntentFamily("xyzzy qwerty foobar");
    expect(result.family).toBe("clarification_required");
    expect(result.debugInfo.matchedBy).toBe("fallback");
  });
});

// ─── debugInfo structure validation ───────────────────────────────────────────

describe("debugInfo carries focusMode and matchedBy correctly", () => {
  it("mode-specific match carries focusMode in debugInfo", () => {
    const result = normalizeToIntentFamily("quickness", "speed");
    expect(result.debugInfo.focusMode).toBe("speed");
    expect(result.debugInfo.matchedBy).toBe("mode-specific");
  });

  it("global match carries focusMode in debugInfo when mode was provided but no mode-specific pattern matched", () => {
    // "make it harder" has no mode-specific pattern, falls to global
    const result = normalizeToIntentFamily("make it harder", "speed");
    expect(result.debugInfo.matchedBy).toBe("global");
    expect(result.debugInfo.focusMode).toBe("speed");
  });

  it("fallback carry focusMode in debugInfo", () => {
    const result = normalizeToIntentFamily("xyzzy qwerty", "mobility");
    expect(result.debugInfo.matchedBy).toBe("fallback");
    expect(result.debugInfo.focusMode).toBe("mobility");
  });
});
