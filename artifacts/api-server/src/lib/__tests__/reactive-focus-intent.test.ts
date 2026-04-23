/**
 * Reactive Focus Intent — Unit Tests
 *
 * Verifies that reactive/stiffness/ground-contact commands resolve to
 * the `reactive_focus` intent family and NOT to generic volume/duration
 * reduction families like `decrease_volume`, `reduce_time`, or `session_reduction`.
 *
 * Also verifies that pure shortening commands still resolve correctly
 * to their own families.
 */

import { describe, it, expect } from "vitest";
import { normalizeToIntentFamily } from "../intent-family-engine";

// ─── Task 1: Reactive commands → reactive_focus ───────────────────────────────

describe("reactive_focus intent — core reactive commands", () => {
  it("'Reduce ground contact time' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Reduce ground contact time");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Be more reactive' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Be more reactive");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Make this more elastic' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Make this more elastic");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Improve stiffness' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Improve stiffness");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Improve my reactivity' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Improve my reactivity");
    expect(result.family).toBe("reactive_focus");
  });

  it("'More spring in my step' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("More spring in my step");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Less amortization' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Less amortization");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Quicker off the floor' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Quicker off the floor");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Faster contacts' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Faster contacts");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Quicker contacts' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Quicker contacts");
    expect(result.family).toBe("reactive_focus");
  });

  it("'More bounce' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("More bounce");
    expect(result.family).toBe("reactive_focus");
  });

  it("'I want more elasticity' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("I want more elasticity");
    expect(result.family).toBe("reactive_focus");
  });
});

// ─── Task 2: Ground contact phrasing variations ───────────────────────────────

describe("reactive_focus intent — ground contact phrasing variations", () => {
  it("'Lower ground contact time' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Lower ground contact time");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Improve contact time' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Improve contact time");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Minimize ground contact' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Minimize ground contact");
    expect(result.family).toBe("reactive_focus");
  });

  it("'Shorten contact time on landings' resolves to reactive_focus", () => {
    const result = normalizeToIntentFamily("Shorten contact time on landings");
    expect(result.family).toBe("reactive_focus");
  });
});

// ─── Task 3: Shortening commands still route correctly ────────────────────────

describe("session/volume reduction commands — must NOT resolve to reactive_focus", () => {
  it("'Shorten this block' resolves to session_reduction (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Shorten this block");
    expect(result.family).toBe("session_reduction");
    expect(result.family).not.toBe("reactive_focus");
  });

  it("'Make this session shorter' resolves to reduce_time (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Make this session shorter");
    expect(result.family).toBe("reduce_time");
    expect(result.family).not.toBe("reactive_focus");
  });

  it("'Reduce volume' resolves to decrease_volume (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Reduce volume");
    expect(result.family).toBe("decrease_volume");
    expect(result.family).not.toBe("reactive_focus");
  });

  it("'Cut the sets' resolves to decrease_volume (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Cut the sets");
    expect(result.family).toBe("decrease_volume");
    expect(result.family).not.toBe("reactive_focus");
  });

  it("'Remove some exercises' resolves to session_reduction (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Remove some exercises from this session");
    expect(result.family).toBe("session_reduction");
    expect(result.family).not.toBe("reactive_focus");
  });
});

// ─── Task 4: Semantic separation — reactive ≠ speed ──────────────────────────

describe("reactive_focus intent — does not bleed into speed_focus", () => {
  it("'Get faster' resolves to speed_focus (not reactive_focus)", () => {
    const result = normalizeToIntentFamily("Get faster");
    expect(result.family).toBe("speed_focus");
    expect(result.family).not.toBe("reactive_focus");
  });

  it("'Add sprint training' resolves to speed_focus", () => {
    const result = normalizeToIntentFamily("Add sprint training to this session");
    expect(result.family).toBe("speed_focus");
    expect(result.family).not.toBe("reactive_focus");
  });
});

// ─── Task 5: Confidence and scope ────────────────────────────────────────────

describe("reactive_focus intent — result shape", () => {
  it("reactive command produces a non-low confidence result", () => {
    const result = normalizeToIntentFamily("Reduce ground contact time");
    expect(result.confidence).not.toBe("low");
  });

  it("reactive command with session scope has correct targetScope", () => {
    const result = normalizeToIntentFamily("Reduce contact time in this session");
    expect(result.family).toBe("reactive_focus");
    expect(result.targetScope).toBe("session");
  });
});
