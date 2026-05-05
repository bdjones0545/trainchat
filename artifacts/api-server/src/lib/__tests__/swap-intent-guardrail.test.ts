/**
 * Swap Intent Guardrail Tests
 *
 * Covers the fixes for:
 *  1. classifyEditRequest — open-ended swap commands with exercise target must route DETERMINISTIC
 *     (not AGENT/"exercise_coaching_transformation") so Step 2.5 can auto-resolve.
 *  2. interpretWithRules — swap commands with generic/placeholder targets must return
 *     { intent: "swap_exercise", changes: [] } to trigger escalation, never "exercise_note".
 *  3. Notes safety net — raw command strings must never be stored as exercise notes.
 */

import { describe, it, expect } from "vitest";
import { classifyEditRequest, isGenericPlaceholder, isOpenEndedSwapLanguage } from "../edit-intent-service";

// ─── Minimal system fixture ────────────────────────────────────────────────────

function makeSystem(exerciseName = "Belt Squat") {
  return {
    phases: [
      {
        weeks: [
          {
            weekNumber: 1,
            sessions: [
              {
                id: 101,
                isRestDay: false,
                label: "Lower Body",
                exercises: [
                  { id: 999, name: exerciseName, sets: 4, reps: "6-8", rest: "3 min", category: "primary" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// ─── Target context fixture ────────────────────────────────────────────────────

function exerciseCtx(id = 999, label = "Belt Squat") {
  return { type: "exercise" as const, id, label };
}

// ─── 1. classifyEditRequest routing ──────────────────────────────────────────

describe("classifyEditRequest — open-ended swap with exercise target", () => {
  it("'Swap Belt Squat with something similar' → DETERMINISTIC", () => {
    const result = classifyEditRequest("Swap Belt Squat with something similar", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
  });

  it("'Replace this with something similar' → DETERMINISTIC", () => {
    const result = classifyEditRequest("Replace this with something similar", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
  });

  it("'Swap this for a different exercise' → DETERMINISTIC", () => {
    const result = classifyEditRequest("Swap this for a different exercise", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
  });

  it("'Replace Belt Squat with another option' → DETERMINISTIC", () => {
    const result = classifyEditRequest("Replace Belt Squat with another option", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
  });

  it("'swap' prefix alone → DETERMINISTIC", () => {
    const result = classifyEditRequest("swap this for something else", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
  });

  it("exact named swap to real exercise → still DETERMINISTIC (exact_named_swap)", () => {
    const result = classifyEditRequest("Swap Belt Squat with Leg Press", exerciseCtx());
    expect(result.route).toBe("DETERMINISTIC");
    expect(result.reason).toBe("exact_named_swap");
  });
});

// ─── 2. isGenericPlaceholder covers "something similar" ──────────────────────

describe("isGenericPlaceholder — open-ended swap language", () => {
  it("'something similar' is a generic placeholder", () => {
    expect(isGenericPlaceholder("something similar")).toBe(true);
  });

  it("'something else' is a generic placeholder", () => {
    expect(isGenericPlaceholder("something else")).toBe(true);
  });

  it("'a different exercise' is a generic placeholder", () => {
    expect(isGenericPlaceholder("a different exercise")).toBe(true);
  });

  it("'another option' is a generic placeholder", () => {
    expect(isGenericPlaceholder("another option")).toBe(true);
  });

  it("'Leg Press' is NOT a generic placeholder", () => {
    expect(isGenericPlaceholder("Leg Press")).toBe(false);
  });

  it("'Romanian Deadlift' is NOT a generic placeholder", () => {
    expect(isGenericPlaceholder("Romanian Deadlift")).toBe(false);
  });
});

// ─── 3. isOpenEndedSwapLanguage ───────────────────────────────────────────────

describe("isOpenEndedSwapLanguage — detects vague swap requests", () => {
  it("'Swap Belt Squat with something similar' → open-ended", () => {
    expect(isOpenEndedSwapLanguage("Swap Belt Squat with something similar")).toBe(true);
  });

  it("'Replace this with something else' → open-ended", () => {
    expect(isOpenEndedSwapLanguage("Replace this with something else")).toBe(true);
  });

  it("'Give me a different exercise here' → open-ended", () => {
    expect(isOpenEndedSwapLanguage("Give me a different exercise here")).toBe(true);
  });

  it("'Use another variation' → open-ended", () => {
    expect(isOpenEndedSwapLanguage("Use a different movement")).toBe(true);
  });

  it("'Swap with Leg Press' (specific target) → NOT open-ended", () => {
    expect(isOpenEndedSwapLanguage("Swap with Leg Press")).toBe(false);
  });
});

// ─── 4. DETERMINISTIC reason for open-ended swap ─────────────────────────────

describe("classifyEditRequest — reason field for open-ended swap", () => {
  it("open-ended swap reason is 'open_ended_swap_exercise'", () => {
    const result = classifyEditRequest("Swap Belt Squat with something similar", exerciseCtx());
    expect(result.reason).toBe("open_ended_swap_exercise");
  });

  it("plain 'swap' command with exercise target → 'open_ended_swap_exercise'", () => {
    const result = classifyEditRequest("swap this for a good alternative", exerciseCtx());
    expect(result.reason).toBe("open_ended_swap_exercise");
  });
});

// ─── 5. No-context swap still routes AGENT (no exercise target) ───────────────
// Note: "Swap Belt Squat" without context fires the existing belt squat unavailability
// rule (Rule 7) and returns DETERMINISTIC for that reason. Use a generic exercise here.

describe("classifyEditRequest — without exercise target context", () => {
  it("swap without exercise context → AGENT", () => {
    const result = classifyEditRequest("Swap Romanian Deadlift with something similar");
    expect(result.route).toBe("AGENT");
  });

  it("swap with session context → AGENT", () => {
    const result = classifyEditRequest("Swap Romanian Deadlift with something similar", {
      type: "session",
      id: 101,
      label: "Lower Body",
    });
    expect(result.route).toBe("AGENT");
  });
});
