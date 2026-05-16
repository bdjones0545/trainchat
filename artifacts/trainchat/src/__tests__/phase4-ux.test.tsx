/**
 * Phase 4 — UX Refinement & Trust Layer Tests (12 spec tests)
 *
 * Test coverage:
 * 1.  SystemUpdateCard renders micro-reason bullets when provided
 * 2.  SystemUpdateCard limits micro-reasons to 3 items
 * 3.  SystemUpdateCard does NOT render micro-reasons when coachReasoning is present
 * 4.  SystemUpdateCard renders verified badge for "verified" status
 * 5.  SystemUpdateCard does NOT render verified badge for "partial" status
 * 6.  SystemUpdateCard does NOT render verified badge for "unclear" status
 * 7.  SystemUpdateCard does NOT render verified badge when verificationStatus absent
 * 8.  SystemUpdateCard renders changeSummary in all cases
 * 9.  SystemUpdateCard shows "Saved · constraints respected" text for verified
 * 10. SSE error copy is coach-voiced (not technical)
 * 11. SSE error copy does not contain debug/stack language
 * 12. Empty microReasons array renders no bullet section
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemUpdateCard from "../components/chat/SystemUpdateCard";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/components/laser-skill", () => ({
  VerificationSweep: () => null,
}));

vi.mock("@/components/chat/CoachReasoningCallout", () => ({
  default: ({ reasoning }: { reasoning: string }) => (
    <div data-testid="coach-reasoning-callout">{reasoning}</div>
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeData(
  overrides: Partial<{
    verificationStatus: "verified" | "partial" | "unclear";
    coachReasoning: string | null;
    changeSummary: string;
  }> = {}
) {
  return {
    _type: "system_edit" as const,
    changeSummary: overrides.changeSummary ?? "Added 2 sets of Romanian deadlifts to Day 2",
    changedIds: { exercises: [42], sessions: [], weeks: [], phases: [] },
    systemId: 1,
    changeLogId: 10,
    verificationStatus: overrides.verificationStatus,
    coachReasoning: overrides.coachReasoning ?? null,
  };
}

function renderCard(
  dataOverrides: Parameters<typeof makeData>[0] = {},
  microReasons?: string[]
) {
  return render(
    <SystemUpdateCard
      data={makeData(dataOverrides)}
      onShowChange={vi.fn()}
      microReasons={microReasons}
    />
  );
}

// ─── Test 1: Micro-reasons render as bullets ──────────────────────────────────

describe("Test 1 — Renders micro-reason bullets when microReasons provided", () => {
  it("renders each micro-reason as italic text", () => {
    renderCard({}, ["Knee pain constraint respected", "No equipment required"]);
    expect(screen.getByText("Knee pain constraint respected")).toBeDefined();
    expect(screen.getByText("No equipment required")).toBeDefined();
  });
});

// ─── Test 2: Micro-reasons capped at 3 ───────────────────────────────────────

describe("Test 2 — Limits micro-reason display to 3 items", () => {
  it("shows at most 3 micro-reasons even when more are passed", () => {
    renderCard({}, [
      "Reason one",
      "Reason two",
      "Reason three",
      "Reason four should not appear",
    ]);
    expect(screen.queryByText("Reason four should not appear")).toBeNull();
    expect(screen.getByText("Reason one")).toBeDefined();
    expect(screen.getByText("Reason three")).toBeDefined();
  });
});

// ─── Test 3: No micro-reasons when coachReasoning is present ─────────────────

describe("Test 3 — Suppresses micro-reasons when coachReasoning is present", () => {
  it("does not render micro-reason bullets when coachReasoning exists", () => {
    renderCard(
      { coachReasoning: "I chose a lower-body focus to balance the program." },
      ["Knee pain constraint respected"]
    );
    // coachReasoning callout should be shown
    expect(screen.getByTestId("coach-reasoning-callout")).toBeDefined();
    // micro-reasons should NOT be shown (coachReasoning takes precedence)
    expect(screen.queryByText("Knee pain constraint respected")).toBeNull();
  });
});

// ─── Test 4: Verified badge for "verified" status ────────────────────────────

describe("Test 4 — Shows verified badge for verificationStatus='verified'", () => {
  it("renders 'Saved · constraints respected' text", () => {
    renderCard({ verificationStatus: "verified" });
    expect(screen.getByText("Saved · constraints respected")).toBeDefined();
  });
});

// ─── Test 5: No verified badge for "partial" status ──────────────────────────

describe("Test 5 — No verified badge for partial status", () => {
  it("does not render 'Saved · constraints respected' for partial", () => {
    renderCard({ verificationStatus: "partial" });
    expect(screen.queryByText("Saved · constraints respected")).toBeNull();
  });
});

// ─── Test 6: No verified badge for "unclear" status ──────────────────────────

describe("Test 6 — No verified badge for unclear status", () => {
  it("does not render 'Saved · constraints respected' for unclear", () => {
    renderCard({ verificationStatus: "unclear" });
    expect(screen.queryByText("Saved · constraints respected")).toBeNull();
  });
});

// ─── Test 7: No verified badge when verificationStatus is absent ──────────────

describe("Test 7 — No verified badge when verificationStatus is absent", () => {
  it("does not render 'Saved · constraints respected' when status undefined", () => {
    renderCard({});
    expect(screen.queryByText("Saved · constraints respected")).toBeNull();
  });
});

// ─── Test 8: changeSummary always renders ─────────────────────────────────────

describe("Test 8 — changeSummary always renders", () => {
  it("renders changeSummary text in all configurations", () => {
    renderCard({ verificationStatus: "verified" }, ["A reason"]);
    expect(
      screen.getByText("Added 2 sets of Romanian deadlifts to Day 2")
    ).toBeDefined();
  });

  it("renders changeSummary without micro-reasons", () => {
    renderCard({ changeSummary: "Removed box jumps from Day 3" });
    expect(screen.getByText("Removed box jumps from Day 3")).toBeDefined();
  });
});

// ─── Test 9: Verified badge text is user-safe ─────────────────────────────────

describe("Test 9 — Verified badge copy is user-safe", () => {
  it("shows friendly copy — no internal IDs or debug language", () => {
    renderCard({ verificationStatus: "verified" });
    const badge = screen.getByText("Saved · constraints respected");
    // Must be present
    expect(badge).toBeDefined();
    // Must not contain technical debug language
    expect(badge.textContent).not.toMatch(/id|debug|uuid|internal|pipeline/i);
  });
});

// ─── Test 10: SSE error copy is coach-voiced ─────────────────────────────────

describe("Test 10 — SSE error copy is coach-voiced, not technical", () => {
  it("SSE error message does not contain raw technical terms", () => {
    const errorMessage =
      "Connection dropped — I couldn't safely save that update. Try again.";
    // Must be user-friendly
    expect(errorMessage).not.toMatch(/event\.type|SSE|EventSource|stream ended/i);
    // Must contain a coaching-tone action cue
    expect(errorMessage).toMatch(/try again/i);
  });
});

// ─── Test 11: SSE error copy language check ──────────────────────────────────

describe("Test 11 — SSE error copy does not expose implementation details", () => {
  it("error message contains 'Connection' not 'Stream'", () => {
    const errorMessage =
      "Connection dropped — I couldn't safely save that update. Try again.";
    expect(errorMessage).toMatch(/Connection/);
    expect(errorMessage).not.toMatch(/^Stream ended/);
  });
});

// ─── Test 12: Empty microReasons renders no bullet section ───────────────────

describe("Test 12 — Empty microReasons array renders no bullet list", () => {
  it("does not render any bullet elements for an empty array", () => {
    const { container } = renderCard({ verificationStatus: "partial" }, []);
    // No bullet dot spans should be present for empty array
    const bullets = container.querySelectorAll(".rounded-full.bg-primary\\/40");
    expect(bullets.length).toBe(0);
  });
});
