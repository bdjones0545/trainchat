/**
 * Action Contract Layer — Spec Tests
 *
 * Covers all 10 tests from the spec:
 *  1. Guidance question does not mutate.
 *  2. Direct command mutates.
 *  3. Temporary wording only affects today.
 *  4. Preference wording persists.
 *  5. Ambiguous pronoun asks clarification.
 *  6. Full rebuild request routes to rebuild.
 *  7. Pain request uses safety mode.
 *  8. Agent never claims success without verification.
 *  9. Response type matches action type.
 * 10. Audit receipt matches final response.
 */

import { describe, it, expect } from "vitest";
import { buildActionContract, resolveResponseType, validateContractCompliance } from "../action-contract";
import { enforceActionContract } from "../action-contract-enforcer";
import type { TurnOutcome } from "../action-contract-enforcer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noMutation(): TurnOutcome {
  return {
    mutationApplied: false,
    constraintPersisted: false,
    clarificationAsked: false,
    programRebuilt: false,
    verificationStatus: "not_applicable",
  };
}

function withMutation(verified = true): TurnOutcome {
  return {
    mutationApplied: true,
    constraintPersisted: false,
    clarificationAsked: false,
    programRebuilt: false,
    verificationStatus: verified ? "verified" : "unclear",
  };
}

function withRebuild(): TurnOutcome {
  return {
    mutationApplied: false,
    constraintPersisted: false,
    clarificationAsked: false,
    programRebuilt: true,
    verificationStatus: "not_applicable",
  };
}

function withClarification(): TurnOutcome {
  return {
    mutationApplied: false,
    constraintPersisted: false,
    clarificationAsked: true,
    programRebuilt: false,
    verificationStatus: "not_applicable",
  };
}

function withConstraint(): TurnOutcome {
  return {
    mutationApplied: false,
    constraintPersisted: true,
    clarificationAsked: false,
    programRebuilt: false,
    verificationStatus: "not_applicable",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — Guidance question does not mutate
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 1: Guidance question does not mutate", () => {
  it("'Why did you choose trap bar deadlift?' → GUIDANCE_ONLY, shouldMutate=false", () => {
    const contract = buildActionContract(
      "Why did you choose trap bar deadlift?",
      true,
    );
    expect(contract.actionType).toBe("GUIDANCE_ONLY");
    expect(contract.shouldMutate).toBe(false);
    expect(contract.shouldRespondGuidanceOnly).toBe(true);
  });

  it("guidance contract allows only guidance_answer response type", () => {
    const contract = buildActionContract(
      "Why did you choose trap bar deadlift?",
      true,
    );
    expect(contract.allowedResponseTypes).toContain("guidance_answer");
    expect(contract.allowedResponseTypes).not.toContain("change_confirmed");
    expect(contract.allowedResponseTypes).not.toContain("rebuild_started");
  });

  it("guidance contract forbids change_confirmed", () => {
    const contract = buildActionContract(
      "How many sets should I do per week?",
      true,
    );
    expect(contract.forbiddenResponseTypes).toContain("change_confirmed");
  });

  it("audit receipt passes when guidance question produces no mutation", () => {
    const contract = buildActionContract("What is progressive overload?", true);
    const receipt = enforceActionContract(contract, noMutation());
    expect(receipt.compliance.passed).toBe(true);
    expect(receipt.outcome.actualResponseType).toBe("guidance_answer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Direct command mutates
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 2: Direct command mutates", () => {
  it("'Remove the leg press from Day 2' → MUTATE_ACTIVE_PROGRAM", () => {
    const contract = buildActionContract(
      "Remove the leg press from Day 2",
      true,
    );
    expect(contract.actionType).toBe("MUTATE_ACTIVE_PROGRAM");
    expect(contract.shouldMutate).toBe(true);
  });

  it("'I don't have a belt squat' → MUTATE_ACTIVE_PROGRAM + shouldPersistConstraint", () => {
    const contract = buildActionContract(
      "I don't have a belt squat",
      true,
    );
    expect(contract.actionType).toBe("MUTATE_ACTIVE_PROGRAM");
    expect(contract.shouldMutate).toBe(true);
    expect(contract.shouldPersistConstraint).toBe(true);
  });

  it("mutation contract requires verification", () => {
    const contract = buildActionContract("Swap bench press for dumbbell press", true);
    expect(contract.requiredVerification).toBe(true);
  });

  it("audit receipt shows change_confirmed when mutation applied and verified", () => {
    const contract = buildActionContract("Remove the leg press", true);
    const receipt = enforceActionContract(contract, withMutation(true));
    expect(receipt.outcome.mutationApplied).toBe(true);
    expect(receipt.outcome.actualResponseType).toBe("change_confirmed");
    expect(receipt.compliance.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Temporary wording only affects today
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 3: Temporary wording only affects today", () => {
  it("'Make today easier' → TEMPORARY_ADJUSTMENT", () => {
    const contract = buildActionContract("Make today easier", true);
    expect(contract.actionType).toBe("TEMPORARY_ADJUSTMENT");
  });

  it("'TEMPORARY_ADJUSTMENT' is not MUTATE_ACTIVE_PROGRAM", () => {
    const contract = buildActionContract("Make this session lighter", true);
    expect(contract.actionType).toBe("TEMPORARY_ADJUSTMENT");
    expect(contract.actionType).not.toBe("MUTATE_ACTIVE_PROGRAM");
  });

  it("temporary contract forbids 'change_confirmed' (must use temporary_adjustment_confirmed)", () => {
    const contract = buildActionContract("Make today easier", true);
    expect(contract.allowedResponseTypes).toContain("temporary_adjustment_confirmed");
    expect(contract.allowedResponseTypes).not.toContain("change_confirmed");
  });

  it("temporary contract scope is 'today'", () => {
    const contract = buildActionContract("Make today easier", true);
    expect(contract.targetScope).toBe("today");
  });

  it("audit receipt uses temporary_adjustment_confirmed when mutation applied", () => {
    const contract = buildActionContract("Make this workout easier today", true);
    const outcome: TurnOutcome = {
      mutationApplied: true,
      constraintPersisted: false,
      clarificationAsked: false,
      programRebuilt: false,
      verificationStatus: "verified",
    };
    const receipt = enforceActionContract(contract, outcome);
    expect(receipt.outcome.actualResponseType).toBe("temporary_adjustment_confirmed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — Preference wording persists
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 4: Preference wording persists", () => {
  it("'I hate lunges' with active program → MUTATE_ACTIVE_PROGRAM + shouldPersistConstraint", () => {
    const contract = buildActionContract("I hate lunges", true);
    expect(contract.shouldPersistConstraint).toBe(true);
    expect(contract.shouldMutate).toBe(true);
    expect(contract.actionType).toBe("MUTATE_ACTIVE_PROGRAM");
  });

  it("'I hate lunges' without active program → PERSIST_CONSTRAINT_ONLY", () => {
    const contract = buildActionContract("I hate lunges", false);
    expect(contract.actionType).toBe("PERSIST_CONSTRAINT_ONLY");
    expect(contract.shouldPersistConstraint).toBe(true);
    expect(contract.shouldMutate).toBe(false);
  });

  it("'I don't like deadlifts' with program → shouldPersistConstraint=true", () => {
    const contract = buildActionContract("I don't like deadlifts", true);
    expect(contract.shouldPersistConstraint).toBe(true);
  });

  it("persist constraint without program produces remembered_preference response", () => {
    const contract = buildActionContract("I hate lunges", false);
    const receipt = enforceActionContract(contract, withConstraint());
    expect(receipt.outcome.actualResponseType).toBe("remembered_preference");
    expect(receipt.compliance.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Ambiguous pronoun asks clarification
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 5: Ambiguous pronoun asks clarification", () => {
  it("'Can I do this instead?' → ASK_CLARIFICATION", () => {
    const contract = buildActionContract("Can I do this instead?", true);
    expect(contract.actionType).toBe("ASK_CLARIFICATION");
    expect(contract.shouldAskClarification).toBe(true);
  });

  it("clarification contract should not mutate", () => {
    const contract = buildActionContract("Can I do this instead?", true);
    expect(contract.shouldMutate).toBe(false);
    expect(contract.shouldRebuild).toBe(false);
  });

  it("clarification response type is clarification_question", () => {
    const contract = buildActionContract("Can I do this instead?", true);
    expect(contract.allowedResponseTypes).toContain("clarification_question");
  });

  it("audit receipt shows clarification_question when clarification asked", () => {
    const contract = buildActionContract("Can I do this instead?", true);
    const receipt = enforceActionContract(contract, withClarification());
    expect(receipt.outcome.actualResponseType).toBe("clarification_question");
    expect(receipt.compliance.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Full rebuild request routes to rebuild
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 6: Full rebuild request routes to rebuild", () => {
  it("'Build me a new 4-day hypertrophy plan' → REBUILD_PROGRAM", () => {
    const contract = buildActionContract("Build me a new 4-day hypertrophy plan", true);
    expect(contract.actionType).toBe("REBUILD_PROGRAM");
    expect(contract.shouldRebuild).toBe(true);
  });

  it("'Start over' → REBUILD_PROGRAM", () => {
    const contract = buildActionContract("Start over, I want a fresh program", true);
    expect(contract.actionType).toBe("REBUILD_PROGRAM");
    expect(contract.shouldRebuild).toBe(true);
  });

  it("rebuild contract allows only rebuild_started response type", () => {
    const contract = buildActionContract("Build me a new program", true);
    expect(contract.allowedResponseTypes).toContain("rebuild_started");
    expect(contract.allowedResponseTypes).not.toContain("change_confirmed");
    expect(contract.allowedResponseTypes).not.toContain("guidance_answer");
  });

  it("audit receipt shows rebuild_started after program is rebuilt", () => {
    const contract = buildActionContract("Build me a new 3-day strength program", false);
    const receipt = enforceActionContract(contract, withRebuild());
    expect(receipt.outcome.actualResponseType).toBe("rebuild_started");
    expect(receipt.compliance.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — Pain request uses safety mode
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 7: Pain request uses safety mode", () => {
  it("'My knee hurts' → SAFETY_RESPONSE + safetyMode=true", () => {
    const contract = buildActionContract("My knee hurts", true);
    expect(contract.actionType).toBe("SAFETY_RESPONSE");
    expect(contract.safetyMode).toBe(true);
  });

  it("'I have shoulder pain' → SAFETY_RESPONSE", () => {
    const contract = buildActionContract("I have shoulder pain", true);
    expect(contract.actionType).toBe("SAFETY_RESPONSE");
    expect(contract.safetyMode).toBe(true);
  });

  it("safety mode forbids generic_safety_disclaimer without coaching action", () => {
    const contract = buildActionContract("My knee hurts", true);
    expect(contract.forbiddenResponseTypes).toContain("generic_safety_disclaimer");
  });

  it("safety mode allows safety_adjustment or clarification_question", () => {
    const contract = buildActionContract("My knee hurts", true);
    expect(contract.allowedResponseTypes).toContain("safety_adjustment");
    expect(contract.allowedResponseTypes).toContain("clarification_question");
  });

  it("safety contract does not allow rebuild_started", () => {
    const contract = buildActionContract("My knee hurts", true);
    expect(contract.allowedResponseTypes).not.toContain("rebuild_started");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Agent never claims success without verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 8: Agent never claims success without verification", () => {
  it("mutation contract requires requiredVerification=true", () => {
    const contract = buildActionContract("Remove squat from day 1", true);
    expect(contract.requiredVerification).toBe(true);
  });

  it("validateContractCompliance flags 'change_confirmed' when verification was 'unclear'", () => {
    const contract = buildActionContract("Swap bench press", true);
    const { violations, passed } = validateContractCompliance(
      contract,
      "change_confirmed",
      true,   // mutationApplied
      "unclear", // but status is unclear
    );
    expect(passed).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("enforcer produces unable_to_verify when mutation applied but verification unclear", () => {
    const contract = buildActionContract("Remove the squat", true);
    const outcome: TurnOutcome = {
      mutationApplied: true,
      constraintPersisted: false,
      clarificationAsked: false,
      programRebuilt: false,
      verificationStatus: "unclear",
    };
    const receipt = enforceActionContract(contract, outcome);
    expect(receipt.outcome.actualResponseType).toBe("unable_to_verify");
  });

  it("enforcer produces unable_to_verify when no mutation applied for mutation contract", () => {
    const contract = buildActionContract("Remove the squat", true);
    const receipt = enforceActionContract(contract, noMutation());
    expect(receipt.outcome.actualResponseType).toBe("unable_to_verify");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9 — Response type matches action type
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 9: Response type matches action type", () => {
  const cases: Array<{
    message: string;
    hasProgram: boolean;
    outcome: TurnOutcome;
    expectedResponseType: string;
  }> = [
    {
      message: "Why did you choose trap bar deadlift?",
      hasProgram: true,
      outcome: noMutation(),
      expectedResponseType: "guidance_answer",
    },
    {
      message: "Remove the leg press",
      hasProgram: true,
      outcome: withMutation(true),
      expectedResponseType: "change_confirmed",
    },
    {
      message: "Make today easier",
      hasProgram: true,
      outcome: {
        mutationApplied: true,
        constraintPersisted: false,
        clarificationAsked: false,
        programRebuilt: false,
        verificationStatus: "verified",
      },
      expectedResponseType: "temporary_adjustment_confirmed",
    },
    {
      message: "I hate lunges",
      hasProgram: false,
      outcome: withConstraint(),
      expectedResponseType: "remembered_preference",
    },
    {
      message: "Can I do this instead?",
      hasProgram: true,
      outcome: withClarification(),
      expectedResponseType: "clarification_question",
    },
    {
      message: "Build me a new 4-day strength plan",
      hasProgram: true,
      outcome: withRebuild(),
      expectedResponseType: "rebuild_started",
    },
    {
      message: "My knee hurts",
      hasProgram: true,
      outcome: {
        mutationApplied: true,
        constraintPersisted: false,
        clarificationAsked: false,
        programRebuilt: false,
        verificationStatus: "verified",
      },
      expectedResponseType: "safety_adjustment",
    },
  ];

  for (const { message, hasProgram, outcome, expectedResponseType } of cases) {
    it(`"${message.slice(0, 40)}" → ${expectedResponseType}`, () => {
      const contract = buildActionContract(message, hasProgram);
      const receipt = enforceActionContract(contract, outcome);
      expect(receipt.outcome.actualResponseType).toBe(expectedResponseType);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10 — Audit receipt matches final response
// ═══════════════════════════════════════════════════════════════════════════════

describe("Test 10: Audit receipt matches final response", () => {
  it("receipt.contract.actionType matches the built contract", () => {
    const contract = buildActionContract("Remove the squat", true);
    const receipt = enforceActionContract(contract, withMutation(true));
    expect(receipt.contract.actionType).toBe(contract.actionType);
  });

  it("receipt.contract.shouldMutate matches the built contract", () => {
    const contract = buildActionContract("Remove the squat", true);
    const receipt = enforceActionContract(contract, withMutation(true));
    expect(receipt.contract.shouldMutate).toBe(contract.shouldMutate);
  });

  it("receipt.outcome.mutationApplied reflects actual turn outcome", () => {
    const contract = buildActionContract("Remove the squat", true);

    const appliedReceipt = enforceActionContract(contract, withMutation(true));
    expect(appliedReceipt.outcome.mutationApplied).toBe(true);

    const notAppliedReceipt = enforceActionContract(contract, noMutation());
    expect(notAppliedReceipt.outcome.mutationApplied).toBe(false);
  });

  it("receipt has a unique receiptId per turn", () => {
    const contract = buildActionContract("Remove the squat", true);
    const receipt1 = enforceActionContract(contract, withMutation(true));
    const receipt2 = enforceActionContract(contract, withMutation(true));
    expect(receipt1.receiptId).not.toBe(receipt2.receiptId);
  });

  it("receipt.compliance.violations is empty when contract is honored", () => {
    const contract = buildActionContract("Why did you choose this exercise?", true);
    const receipt = enforceActionContract(contract, noMutation());
    expect(receipt.compliance.violations).toHaveLength(0);
    expect(receipt.compliance.passed).toBe(true);
  });

  it("receipt.compliance.violations is non-empty when guidance response mutated", () => {
    const contract = buildActionContract("Why did you choose trap bar?", true);
    // Force a compliance violation: guidance contract but mutation was applied
    const badOutcome: TurnOutcome = {
      mutationApplied: true,   // violation: guidance must not mutate
      constraintPersisted: false,
      clarificationAsked: false,
      programRebuilt: false,
      verificationStatus: "verified",
    };
    const receipt = enforceActionContract(contract, badOutcome);
    // The response type will be "change_confirmed" which is forbidden for GUIDANCE_ONLY
    expect(receipt.compliance.passed).toBe(false);
    expect(receipt.compliance.violations.length).toBeGreaterThan(0);
  });

  it("receipt.timestamp is a valid ISO string", () => {
    const contract = buildActionContract("Remove the squat", true);
    const receipt = enforceActionContract(contract, withMutation(true));
    expect(() => new Date(receipt.timestamp).toISOString()).not.toThrow();
  });
});
