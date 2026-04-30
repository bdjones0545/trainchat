/**
 * AgentThinking — Thinking UX Shell Tests (14 spec tests)
 *
 * Test coverage:
 * 1.  Build mode header for new generation
 * 2.  Update mode for mutation
 * 3.  Guidance mode for guidance-only
 * 4.  Pain/safety mode for pain adjustment
 * 5.  stageNarration renders in feedback line
 * 6.  microReason appends only when safeToShow
 * 7.  Max 3 microReasons per stream
 * 8.  Duplicate microReasons are suppressed
 * 9.  Internal terms never render
 * 10. Active stage updates from SSE events
 * 11. Completed stages show checkmarks
 * 12. Modal behaviour on successful completion (isActiveStage false)
 * 13. Failure state shows honest messages
 * 14. Mobile layout stays compact
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentThinking, {
  combineNarrationAndReasons,
} from "../components/chat/AgentThinking";
import type { BuildStage } from "../hooks/useStreamMessage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderCard(overrides: Partial<Parameters<typeof AgentThinking>[0]> = {}) {
  const defaults = {
    buildStage: "understanding" as BuildStage,
    stageLabel: "Understanding your goal",
    stageHistory: [] as string[],
  };
  return render(<AgentThinking {...defaults} {...overrides} />);
}

// ─── Test 1: Build mode header ─────────────────────────────────────────────

describe("Test 1 — Build mode header for new generation", () => {
  it("shows 'Building your training system' for PROGRAM_GENERATION", () => {
    renderCard({ actionType: "PROGRAM_GENERATION" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Building your training system"
    );
  });

  it("shows correct subheader for BUILD mode", () => {
    renderCard({ actionType: "PROGRAM_GENERATION" });
    expect(screen.getByTestId("agent-thinking-subheader").textContent).toBe(
      "Creating your program"
    );
  });
});

// ─── Test 2: Update mode for mutation ─────────────────────────────────────

describe("Test 2 — Update mode for mutation", () => {
  it("shows 'Updating your program' for APPLY_MUTATION", () => {
    renderCard({ actionType: "APPLY_MUTATION" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Updating your program"
    );
  });

  it("shows 'Updating your program' for DIRECT_MUTATION", () => {
    renderCard({ actionType: "DIRECT_MUTATION", buildStage: "applying" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Updating your program"
    );
  });

  it("shows 'Applying your adjustment' subheader for UPDATE mode", () => {
    renderCard({ actionType: "SESSION_ADJUSTMENT", buildStage: "applying" });
    expect(screen.getByTestId("agent-thinking-subheader").textContent).toBe(
      "Applying your adjustment"
    );
  });
});

// ─── Test 3: Guidance mode ────────────────────────────────────────────────

describe("Test 3 — Guidance mode for guidance-only response", () => {
  it("shows 'Thinking through your question' for GUIDANCE", () => {
    renderCard({ actionType: "GUIDANCE" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Thinking through your question"
    );
  });

  it("shows 'No program changes yet' subheader", () => {
    renderCard({ actionType: "GUIDANCE" });
    expect(screen.getByTestId("agent-thinking-subheader").textContent).toBe(
      "No program changes yet"
    );
  });

  it("shows guidance mode for ASK_CLARIFICATION", () => {
    renderCard({ actionType: "ASK_CLARIFICATION" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Thinking through your question"
    );
  });
});

// ─── Test 4: Pain/safety mode ─────────────────────────────────────────────

describe("Test 4 — Pain/safety mode for pain adjustment", () => {
  it("shows 'Adjusting with care' when safetyMode is true", () => {
    renderCard({ actionType: "APPLY_MUTATION", safetyMode: true });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Adjusting with care"
    );
  });

  it("shows joint-friendly subheader in safety mode", () => {
    renderCard({ actionType: "APPLY_MUTATION", safetyMode: true });
    expect(screen.getByTestId("agent-thinking-subheader").textContent).toBe(
      "Keeping the session useful and joint-friendly"
    );
  });

  it("safety mode overrides UPDATE mode when both apply", () => {
    renderCard({ actionType: "DIRECT_MUTATION", safetyMode: true, buildStage: "applying" });
    expect(screen.getByTestId("agent-thinking-header").textContent).toBe(
      "Adjusting with care"
    );
  });
});

// ─── Test 5: stageNarration renders in feedback line ──────────────────────

describe("Test 5 — stageNarration renders in feedback line", () => {
  it("renders stageNarration text in the feedback section", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping out a 4-day upper/lower split",
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    expect(feedback.textContent).toContain("Mapping out a 4-day upper/lower split");
  });

  it("renders fallback text when no narration or reasons", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: undefined,
      microReasons: [],
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    expect(feedback.textContent).toContain("Working through your request");
  });
});

// ─── Test 6: microReason appends only when safeToShow ─────────────────────

describe("Test 6 — microReason appends only when safeToShow", () => {
  it("shows combined narration + microReason when both present", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping weekly structure",
      microReasons: ["I structured this with golf in mind."],
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    expect(feedback.textContent).toContain("Mapping weekly structure");
    expect(feedback.textContent).toContain("I structured this with golf in mind.");
    // Must be joined with em dash
    expect(feedback.textContent).toContain(" — ");
  });

  it("shows only narration when microReasons is empty (not safeToShow)", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping weekly structure",
      microReasons: [],
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    expect(feedback.textContent).toBe("Mapping weekly structure");
    expect(feedback.textContent).not.toContain(" — ");
  });
});

// ─── Test 7: Max 3 microReasons per stream ────────────────────────────────

describe("Test 7 — Max 3 microReasons per stream", () => {
  it("combineNarrationAndReasons uses only one reason at a time", () => {
    const reasons = [
      "I avoided Belt Squat since you mentioned you don't have one.",
      "I kept this dumbbell-focused since that's the equipment you have available.",
      "I structured this with golf in mind.",
    ];
    const result = combineNarrationAndReasons({
      stageNarration: "Checking constraints",
      microReason: reasons[0],
    });
    // Only one reason combined at a time
    expect(result).toBe("Checking constraints — " + reasons[0]);
    expect(result).not.toContain(reasons[1]);
    expect(result).not.toContain(reasons[2]);
  });

  it("component shows only one reason at a time per stage", () => {
    const reasons = [
      "I avoided Belt Squat since you mentioned you don't have one.",
      "I kept this dumbbell-focused.",
      "I structured this with golf in mind.",
      "One extra reason that should not appear.",
    ];
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "understanding",
      microReasons: reasons,
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    // Should show only the first reason (stage 1 = first unlock)
    expect(feedback.textContent).toContain(reasons[0]);
    expect(feedback.textContent).not.toContain(reasons[1]);
    expect(feedback.textContent).not.toContain(reasons[2]);
    expect(feedback.textContent).not.toContain(reasons[3]);
  });
});

// ─── Test 8: Duplicate microReasons are suppressed ────────────────────────

describe("Test 8 — Duplicate microReasons are suppressed", () => {
  it("does not show the same reason twice in the feedback line", () => {
    const reason = "I avoided Belt Squat since you mentioned you don't have one.";
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "understanding",
      microReasons: [reason],
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    // The reason text should appear exactly once
    const occurrences = (feedback.textContent ?? "").split(reason).length - 1;
    expect(occurrences).toBe(1);
  });
});

// ─── Test 9: Internal terms never render ──────────────────────────────────

describe("Test 9 — Internal terms never render in the card", () => {
  const PROHIBITED = [
    "hardConstraints",
    "actionContract",
    "intentFamily",
    "transformHint",
    "execution planner",
    "mutation verifier",
    "softmax",
    "penalty",
    "exercise-constraint-filter",
    "constraint-memory",
  ];

  it("card body never contains any internal term", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping weekly structure",
      microReasons: [
        "I avoided Belt Squat since you mentioned you don't have one.",
        "I reduced knee-dominant loading based on your knee note.",
      ],
    });
    const card = screen.getByTestId("agent-thinking-card");
    const text = (card.textContent ?? "").toLowerCase();
    for (const term of PROHIBITED) {
      expect(text, `Card must not contain internal term "${term}"`).not.toContain(
        term.toLowerCase()
      );
    }
  });

  it("failure state messages contain no internal terms", () => {
    renderCard({
      buildStage: "saving",
      verificationFailed: true,
    });
    const card = screen.getByTestId("agent-thinking-card");
    const text = (card.textContent ?? "").toLowerCase();
    for (const term of PROHIBITED) {
      expect(text).not.toContain(term.toLowerCase());
    }
  });
});

// ─── Test 10: Active stage updates from SSE events ────────────────────────

describe("Test 10 — Active stage updates", () => {
  it("first step is active when buildStage is 'understanding'", () => {
    renderCard({ actionType: "PROGRAM_GENERATION", buildStage: "understanding" });
    const steps = screen.getByTestId("agent-thinking-steps");
    const activeStep = steps.querySelector("[style*='ping-soft']");
    expect(activeStep).toBeTruthy();
  });

  it("shows pulse indicator on active step", () => {
    const { container } = renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
    });
    const pulsing = container.querySelector("[style*='ping-soft']");
    expect(pulsing).toBeTruthy();
  });

  it("shows feedback line only during active stages", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping your split",
    });
    expect(screen.getByTestId("agent-thinking-feedback")).toBeTruthy();
  });

  it("does not show feedback line when buildStage is 'complete'", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "complete",
      stageNarration: "Done",
    });
    expect(screen.queryByTestId("agent-thinking-feedback")).toBeNull();
  });
});

// ─── Test 11: Completed stages show checkmarks ────────────────────────────

describe("Test 11 — Completed stages show checkmarks", () => {
  it("renders SVG checkmark for completed steps", () => {
    const { container } = renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
    });
    // understanding → completed (planning is past it)
    const checkmarks = container.querySelectorAll("polyline");
    expect(checkmarks.length).toBeGreaterThan(0);
  });

  it("completed step has dimmed text styling", () => {
    const { container } = renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "saving",
    });
    const dimmedSpans = container.querySelectorAll(".text-muted-foreground\\/50");
    expect(dimmedSpans.length).toBeGreaterThan(0);
  });
});

// ─── Test 12: Modal fades out on successful completion ────────────────────

describe("Test 12 — Successful completion behaviour", () => {
  it("does not show feedback or pulse when buildStage is null (idle)", () => {
    renderCard({ buildStage: null, stageNarration: "Done" });
    expect(screen.queryByTestId("agent-thinking-feedback")).toBeNull();
    const { container } = renderCard({ buildStage: null });
    const pulsing = container.querySelector("[style*='ping-soft']");
    expect(pulsing).toBeNull();
  });

  it("card renders without glow when complete", () => {
    const { container } = renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "complete",
    });
    const card = container.firstChild?.childNodes[1] as HTMLElement;
    // Style should not have card-glow-pulse animation
    expect(card?.getAttribute("style") ?? "").not.toContain("card-glow-pulse");
  });
});

// ─── Test 13: Failure states show honest messages ─────────────────────────

describe("Test 13 — Failure state shows honest messages", () => {
  it("shows verification failure message when verificationFailed is true", () => {
    renderCard({ buildStage: "saving", verificationFailed: true });
    const el = screen.getByTestId("agent-thinking-verification-failed");
    expect(el.textContent).toContain("caught a mismatch before saving");
    // The message is coach-voiced honest — it can say "pretend" to be direct
    expect(el.textContent).toContain("not going to pretend it updated");
  });

  it("shows generic failure message when streamFailed is true", () => {
    renderCard({ buildStage: "saving", streamFailed: true });
    const el = screen.getByTestId("agent-thinking-stream-failed");
    expect(el.textContent).toContain("couldn't finish that update cleanly");
  });

  it("verification failure takes precedence over streamFailed", () => {
    renderCard({
      buildStage: "saving",
      verificationFailed: true,
      streamFailed: true,
    });
    expect(screen.getByTestId("agent-thinking-verification-failed")).toBeTruthy();
    expect(screen.queryByTestId("agent-thinking-stream-failed")).toBeNull();
  });

  it("failure messages do not contain internal terms", () => {
    renderCard({ buildStage: "saving", streamFailed: true });
    const el = screen.getByTestId("agent-thinking-stream-failed");
    expect(el.textContent).not.toContain("pipeline");
    expect(el.textContent).not.toContain("verificationFailed");
    expect(el.textContent).not.toContain("editFailure");
  });
});

// ─── Test 14: Mobile layout stays compact ─────────────────────────────────

describe("Test 14 — Mobile layout stays compact", () => {
  it("card has max-width constraint for mobile", () => {
    const { container } = renderCard({ actionType: "PROGRAM_GENERATION", buildStage: "planning" });
    // The card div is a direct child of the outer flex wrapper with max-w class
    const cardDiv = container.querySelector(".max-w-\\[280px\\]");
    expect(cardDiv).toBeTruthy();
  });

  it("step labels are compact text size", () => {
    const { container } = renderCard({ actionType: "PROGRAM_GENERATION", buildStage: "planning" });
    const spans = container.querySelectorAll(".text-\\[11px\\]");
    expect(spans.length).toBeGreaterThan(0);
  });

  it("feedback line text is compact", () => {
    renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Mapping structure",
    });
    const feedback = screen.getByTestId("agent-thinking-feedback");
    const p = feedback.querySelector("p");
    expect(p?.className).toContain("text-[10.5px]");
  });

  it("no scrollable containers appear in the card", () => {
    const { container } = renderCard({
      actionType: "PROGRAM_GENERATION",
      buildStage: "planning",
      stageNarration: "Working through your structure",
      microReasons: [
        "I avoided Belt Squat since you mentioned you don't have one.",
        "I reduced knee-dominant loading based on your knee note.",
        "I structured this with golf in mind.",
      ],
    });
    const scrollable = container.querySelectorAll("[style*='overflow: auto'], [style*='overflow-y: scroll'], .overflow-scroll, .overflow-auto");
    expect(scrollable.length).toBe(0);
  });
});

// ─── combineNarrationAndReasons pure function tests ───────────────────────

describe("combineNarrationAndReasons — pure function", () => {
  it("combines narration and reason with em dash", () => {
    expect(
      combineNarrationAndReasons({
        stageNarration: "Mapping weekly structure",
        microReason: "I structured this with golf in mind.",
      })
    ).toBe("Mapping weekly structure — I structured this with golf in mind.");
  });

  it("returns only narration when reason is absent", () => {
    expect(
      combineNarrationAndReasons({ stageNarration: "Mapping weekly structure" })
    ).toBe("Mapping weekly structure");
  });

  it("returns only reason when narration is absent", () => {
    expect(
      combineNarrationAndReasons({
        microReason: "I avoided Belt Squat since you mentioned you don't have one.",
      })
    ).toBe("I avoided Belt Squat since you mentioned you don't have one.");
  });

  it("returns fallback text when both are absent", () => {
    expect(combineNarrationAndReasons({})).toBe("Working through your request\u2026");
  });

  it("trims whitespace from inputs", () => {
    expect(
      combineNarrationAndReasons({
        stageNarration: "  Mapping  ",
        microReason: "  I avoided Belt Squat.  ",
      })
    ).toBe("Mapping — I avoided Belt Squat.");
  });
});
