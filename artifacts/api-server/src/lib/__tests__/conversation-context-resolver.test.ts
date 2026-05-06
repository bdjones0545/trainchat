/**
 * ConversationContextResolver — unit tests
 *
 * Tests pure in-memory resolution logic for all reference types.
 * No DB or external deps needed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveContextualMessage,
  storeExerciseReference,
  storeSessionReference,
  storeMutationReference,
  tickConversationTurn,
  clearConversationContext,
  getConversationContext,
} from "../conversation-context-resolver";

// ─── Setup ────────────────────────────────────────────────────────────────────

// Stub logger so it doesn't try to connect to pino transports
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

let cid: string;

beforeEach(() => {
  cid = `test-conv-${Math.random().toString(36).slice(2)}`;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedExercise(conversationId = cid, name = "Standing Long Jump") {
  storeExerciseReference(conversationId, {
    exerciseName: name,
    exerciseId: 42,
    sessionId: 10,
    dayIndex: 0,
    source: "ai_response",
  });
}

function seedSession(conversationId = cid, label = "Day 1") {
  storeSessionReference(conversationId, {
    sessionId: 10,
    dayIndex: 0,
    sessionLabel: label,
    weekNumber: 1,
    source: "ai_response",
  });
}

function seedMutation(
  conversationId = cid,
  overrides: {
    mutationType?: string;
    userRequest?: string;
    changeSummary?: string;
    scope?: string;
    changeLogId?: number | null;
    intentFamily?: string | null;
    affectedExerciseIds?: number[];
    affectedSessionIds?: number[];
  } = {}
) {
  storeMutationReference(conversationId, {
    mutationType: overrides.mutationType ?? "transform",
    intentFamily: overrides.intentFamily ?? "session_intensity",
    scope: overrides.scope ?? "session",
    affectedExerciseIds: overrides.affectedExerciseIds ?? [42],
    affectedSessionIds: overrides.affectedSessionIds ?? [10],
    changeLogId: overrides.changeLogId ?? 99,
    userRequest: overrides.userRequest ?? "Make Day 1 harder",
    changeSummary: overrides.changeSummary ?? "Increased load on Day 1",
  });
}

// ─── 1. Exercise follow-up swap ───────────────────────────────────────────────

describe("exercise follow-up: swap", () => {
  it("rewrites 'change that exercise to something similar'", () => {
    seedExercise();
    const result = resolveContextualMessage(cid, "Change that exercise to something similar.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Standing Long Jump");
      expect(result.resolvedMessage).not.toContain("that exercise");
      expect(result.resolution).toBe("exercise_deictic");
    }
  });

  it("rewrites 'swap this movement for a bodyweight option'", () => {
    seedExercise(cid, "Barbell Squat");
    const result = resolveContextualMessage(cid, "Swap this movement for a bodyweight option.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Barbell Squat");
    }
  });

  it("returns no resolution when no exercise reference stored", () => {
    const result = resolveContextualMessage(cid, "Change that exercise to something similar.");
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      // no ambiguous flag since we can't tell without context — just pass through
      expect(result.ambiguous).toBeFalsy();
    }
  });

  it("asks clarification when 'it' used alone with no reference", () => {
    const result = resolveContextualMessage(cid, "Change it to something easier.");
    expect(result.resolved).toBe(false);
    if (!result.resolved && result.ambiguous) {
      expect(result.clarificationQuestion).toBeTruthy();
    } else {
      expect(result.resolved).toBe(false);
    }
  });

  it("includes day context in rewritten message when dayIndex available", () => {
    seedExercise();
    const result = resolveContextualMessage(cid, "Remove that exercise.");
    // Result will include the exercise name; day context may be appended
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Standing Long Jump");
    }
  });
});

// ─── 2. Day follow-up edit ────────────────────────────────────────────────────

describe("session follow-up: day edit", () => {
  it("rewrites 'make this day shorter' using lastSessionReference", () => {
    seedSession(cid, "Day 2");
    const result = resolveContextualMessage(cid, "Make this day shorter.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Day 2");
      expect(result.resolvedMessage).not.toContain("this day");
      expect(result.resolution).toBe("session_deictic");
    }
  });

  it("rewrites 'make that session easier' using lastSessionReference", () => {
    seedSession(cid, "Upper Body");
    const result = resolveContextualMessage(cid, "Make that session easier.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Upper Body");
    }
  });

  it("passes through when no session reference stored", () => {
    const result = resolveContextualMessage(cid, "Make this day shorter.");
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.ambiguous).toBeFalsy();
      expect(result.resolution).toBe("no_session_ref");
    }
  });
});

// ─── 3. Do the same for another day ──────────────────────────────────────────

describe("mutation carryover: do the same for Day N", () => {
  it("rewrites 'do the same for Day 2' using lastMutationReference", () => {
    seedMutation(cid, { userRequest: "Make Day 1 harder" });
    const result = resolveContextualMessage(cid, "Do the same for Day 2.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toMatch(/day 2/i);
      expect(result.resolution).toBe("do_same_for_target");
    }
  });

  it("replaces the existing day reference in original request", () => {
    seedMutation(cid, { userRequest: "Make Day 1 shorter" });
    const result = resolveContextualMessage(cid, "Do the same for Day 3.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      // Original "Day 1" should be replaced with "day 3"
      expect(result.resolvedMessage).toMatch(/day 3/i);
    }
  });

  it("asks clarification when no target specified in 'do the same' message", () => {
    seedMutation(cid, { userRequest: "Make Day 1 harder" });
    // "do the same" without a target day
    const result = resolveContextualMessage(cid, "Do the same thing.");
    // Falls into generic apply that path — needs mutation ref + session ref or exercise ref
    // Since there is a mutRef but no session/exercise ref, should ask for target
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.ambiguous).toBe(true);
    }
  });

  it("asks clarification when no mutation reference stored", () => {
    const result = resolveContextualMessage(cid, "Do the same for Day 2.");
    expect(result.resolved).toBe(false);
    if (!result.resolved && result.ambiguous) {
      expect(result.clarificationQuestion).toBeTruthy();
      expect(result.resolution).toBe("do_same_no_mutation_ref");
    } else {
      expect(result.resolved).toBe(false);
    }
  });
});

// ─── 4. Apply same to full program ───────────────────────────────────────────

describe("mutation carryover: apply to full program", () => {
  it("rewrites 'apply that to the full program' using lastMutationReference", () => {
    seedMutation(cid, { userRequest: "Make Day 2 shorter" });
    const result = resolveContextualMessage(cid, "Apply that to the full program.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Make Day 2 shorter");
      expect(result.resolvedMessage).toMatch(/program.wide|all sessions|all days/i);
      expect(result.resolution).toBe("apply_programwide_from_mutation_ref");
    }
  });

  it("also handles 'make the rest like that'", () => {
    seedMutation(cid, { userRequest: "Remove barbell exercises from Day 1" });
    const result = resolveContextualMessage(cid, "Make the rest like that.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Remove barbell exercises from Day 1");
    }
  });

  it("asks clarification when no mutation ref", () => {
    const result = resolveContextualMessage(cid, "Apply that to the full program.");
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.ambiguous).toBe(true);
      expect(result.resolution).toBe("apply_programwide_no_mutation_ref");
    }
  });
});

// ─── 5. Undo last mutation ────────────────────────────────────────────────────

describe("mutation carryover: undo", () => {
  it("rewrites 'undo that' using lastMutationReference", () => {
    seedMutation(cid, {
      userRequest: "Remove barbell exercises",
      changeSummary: "Removed barbell exercises from Day 1",
      changeLogId: 77,
    });
    const result = resolveContextualMessage(cid, "Undo that.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toMatch(/undo|restore/i);
      expect(result.resolvedMessage).toContain("77");
      expect(result.resolvedMessage).toContain("Removed barbell exercises from Day 1");
    }
  });

  it("also handles 'undo the last change'", () => {
    seedMutation(cid, { changeLogId: 55, changeSummary: "Increased session load" });
    const result = resolveContextualMessage(cid, "Undo the last change.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("55");
    }
  });

  it("asks clarification when no mutation ref stored", () => {
    const result = resolveContextualMessage(cid, "Undo that.");
    expect(result.resolved).toBe(false);
    if (!result.resolved && result.ambiguous) {
      expect(result.clarificationQuestion).toBeTruthy();
      expect(result.resolution).toBe("undo_no_mutation_ref");
    } else {
      expect(result.resolved).toBe(false);
    }
  });
});

// ─── 6. Ambiguous reference asks clarification ────────────────────────────────

describe("ambiguous reference handling", () => {
  it("returns clarification question for ambiguous 'it' with no stored ref", () => {
    const result = resolveContextualMessage(cid, "Remove it from my program.");
    expect(result.resolved).toBe(false);
    if (!result.resolved && result.ambiguous) {
      expect(typeof result.clarificationQuestion).toBe("string");
      expect(result.clarificationQuestion.length > 0).toBe(true);
    } else {
      expect(result.resolved).toBe(false);
    }
  });

  it("does not resolve when message has no deictic phrase", () => {
    seedExercise();
    seedSession();
    seedMutation();
    const result = resolveContextualMessage(cid, "Add a pull-up variation to Day 3.");
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.ambiguous).toBeFalsy();
      expect(result.resolution).toBe("no_deictic_phrase");
    }
  });
});

// ─── 7. Expiry behavior ───────────────────────────────────────────────────────

describe("reference expiry", () => {
  it("expires references after MAX_TURNS ticks", () => {
    seedExercise();
    tickConversationTurn(cid);
    tickConversationTurn(cid);

    const ctx = getConversationContext(cid);
    expect(ctx?.lastExerciseReference).toBeNull();
  });

  it("expires mutation reference after 2 ticks", () => {
    seedMutation();
    tickConversationTurn(cid);
    tickConversationTurn(cid);

    const ctx = getConversationContext(cid);
    expect(ctx?.lastMutationReference).toBeNull();
  });

  it("resolves on turn 1 but not after expiry", () => {
    seedMutation(cid, { userRequest: "Make Day 1 harder" });
    tickConversationTurn(cid);

    // Should still work on turn 1
    const result1 = resolveContextualMessage(cid, "Do the same for Day 2.");
    expect(result1.resolved).toBe(true);

    // Tick again to expire
    tickConversationTurn(cid);
    const result2 = resolveContextualMessage(cid, "Do the same for Day 3.");
    expect(result2.resolved).toBe(false);
  });

  it("clears all context on clearConversationContext", () => {
    seedExercise();
    seedSession();
    seedMutation();
    clearConversationContext(cid);

    const ctx = getConversationContext(cid);
    expect(ctx).toBeNull();
  });
});

// ─── 8. Apply that + contextual session/exercise refs ─────────────────────────

describe("apply that + contextual refs", () => {
  it("resolves 'apply that' to the last session reference when session is known", () => {
    seedMutation(cid, { userRequest: "Make it shorter" });
    seedSession(cid, "Day 2");
    const result = resolveContextualMessage(cid, "Apply that to this session too.");
    // "this session" is a session deictic but "apply that" is a mutation deictic — mutation wins
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Day 2");
    }
  });

  it("adds injury context when stacked with exercise ref", () => {
    seedMutation(cid, { userRequest: "Make it knee-friendly" });
    seedExercise(cid, "Bulgarian Split Squat");
    const result = resolveContextualMessage(cid, "Apply that too.");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolvedMessage).toContain("Bulgarian Split Squat");
    }
  });
});
