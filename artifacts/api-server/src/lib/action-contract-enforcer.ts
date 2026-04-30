// ======================================================
// TRAINCHAT ACTION CONTRACT ENFORCER
// ======================================================
//
// Enforces the ActionContract after the agent turn completes.
//
// Responsibilities:
//  1. Determine which ResponseType was actually used
//  2. Validate it against the contract's allowedResponseTypes
//  3. Produce an AuditReceipt with full compliance report
//  4. Log violations for observability
//
// This is called at the END of each conversation turn, after:
//  - Mutations have been applied (or not)
//  - The AI response has been generated
//  - Verification has run
//
// ======================================================

import { randomUUID } from "crypto";
import { logger } from "./logger";
import {
  type ActionContract,
  type ResponseType,
  resolveResponseType,
  validateContractCompliance,
} from "./action-contract";
import type { VerificationStatus } from "./mutation-verifier";

// ─── Audit Receipt ─────────────────────────────────────────────────────────────
//
// A full audit trail for one agent turn.
// Stored per-turn and returned in the API response for client-side display.

export interface AuditReceipt {
  receiptId: string;
  timestamp: string;
  userMessage: string;

  // What the contract said MUST happen
  contract: {
    actionType: string;
    targetScope: string;
    confidence: string;
    shouldMutate: boolean;
    shouldPersistConstraint: boolean;
    shouldAskClarification: boolean;
    shouldRebuild: boolean;
    shouldRespondGuidanceOnly: boolean;
    safetyMode: boolean;
    requiredVerification: boolean;
    expectedStateChange: string | null;
    allowedResponseTypes: string[];
    contractReasons: string[];
  };

  // What actually happened
  outcome: {
    actualResponseType: ResponseType;
    mutationApplied: boolean;
    constraintPersisted: boolean;
    clarificationAsked: boolean;
    programRebuilt: boolean;
    verificationStatus: "verified" | "partial" | "unclear" | "not_applicable";
  };

  // Compliance check
  compliance: {
    passed: boolean;
    violations: string[];
  };
}

// ─── Turn Outcome ─────────────────────────────────────────────────────────────
//
// What actually happened during the agent turn.
// Provided by the conversation route after all engines have run.

export interface TurnOutcome {
  mutationApplied: boolean;
  constraintPersisted: boolean;
  clarificationAsked: boolean;
  programRebuilt: boolean;
  verificationStatus: VerificationStatus | "not_applicable";
}

// ─── Enforcer ────────────────────────────────────────────────────────────────

export function enforceActionContract(
  contract: ActionContract,
  outcome: TurnOutcome,
): AuditReceipt {
  // Normalize verification status to what the contract system understands
  const verificationStatus = normalizeVerificationStatus(outcome.verificationStatus);

  // Determine the actual response type based on what occurred
  const actualResponseType = resolveResponseType(
    contract,
    outcome.mutationApplied,
    verificationStatus,
    outcome.clarificationAsked,
    outcome.programRebuilt,
    outcome.constraintPersisted,
  );

  // Validate compliance
  const { violations, passed } = validateContractCompliance(
    contract,
    actualResponseType,
    outcome.mutationApplied,
    verificationStatus,
  );

  const receipt: AuditReceipt = {
    receiptId: randomUUID(),
    timestamp: new Date().toISOString(),
    userMessage: contract.userMessage,

    contract: {
      actionType: contract.actionType,
      targetScope: contract.targetScope,
      confidence: contract.confidence,
      shouldMutate: contract.shouldMutate,
      shouldPersistConstraint: contract.shouldPersistConstraint,
      shouldAskClarification: contract.shouldAskClarification,
      shouldRebuild: contract.shouldRebuild,
      shouldRespondGuidanceOnly: contract.shouldRespondGuidanceOnly,
      safetyMode: contract.safetyMode,
      requiredVerification: contract.requiredVerification,
      expectedStateChange: contract.expectedStateChange,
      allowedResponseTypes: contract.allowedResponseTypes,
      contractReasons: contract.contractReasons,
    },

    outcome: {
      actualResponseType,
      mutationApplied: outcome.mutationApplied,
      constraintPersisted: outcome.constraintPersisted,
      clarificationAsked: outcome.clarificationAsked,
      programRebuilt: outcome.programRebuilt,
      verificationStatus,
    },

    compliance: {
      passed,
      violations,
    },
  };

  logger.info(
    {
      receiptId: receipt.receiptId,
      actionType: contract.actionType,
      actualResponseType,
      passed,
      violations: violations.length > 0 ? violations : undefined,
      mutationApplied: outcome.mutationApplied,
      verificationStatus,
    },
    passed ? "[ActionContractEnforcer] ✓ Contract honored" : "[ActionContractEnforcer] ✗ Contract violated"
  );

  return receipt;
}

// ─── Verification Status Normalizer ──────────────────────────────────────────

function normalizeVerificationStatus(
  status: VerificationStatus | "not_applicable",
): "verified" | "partial" | "unclear" | "not_applicable" {
  if (status === "not_applicable") return "not_applicable";
  if (status === "verified") return "verified";
  if (status === "partial") return "partial";
  return "unclear";
}

// ─── Prompt Directive Generator ───────────────────────────────────────────────
//
// Produces a short prompt directive injected into the AI system prompt
// that enforces the contract at the LLM level.
//
// This is the second layer of enforcement — the first is code-level,
// the second is prompt-level. Together they make it very hard for the
// agent to produce an invalid response type.

export function buildContractPromptDirective(contract: ActionContract): string {
  const lines: string[] = [];
  lines.push(`## AGENT ACTION CONTRACT — THIS IS BINDING`);
  lines.push(`Action required: **${contract.actionType}**`);
  lines.push(`Target scope: **${contract.targetScope}**`);
  lines.push(`Confidence: ${contract.confidence}`);
  lines.push(``);

  if (contract.shouldMutate) {
    lines.push(`✅ shouldMutate = true`);
    lines.push(`   → You MUST apply a real program change. Do NOT just describe what you would do.`);
    lines.push(`   → After applying the change, confirm with a specific description of what changed.`);
    if (contract.expectedStateChange) {
      lines.push(`   → Expected outcome: ${contract.expectedStateChange}`);
    }
  }

  if (contract.shouldPersistConstraint) {
    lines.push(`✅ shouldPersistConstraint = true`);
    lines.push(`   → You MUST explicitly state what preference or constraint was remembered.`);
    lines.push(`   → Use exact language: "I've noted that you [preference]. I'll apply this going forward."`);
  }

  if (contract.shouldAskClarification) {
    lines.push(`✅ shouldAskClarification = true`);
    lines.push(`   → Ask ONE clear, specific clarifying question.`);
    lines.push(`   → Do NOT mutate the program until clarification is received.`);
  }

  if (contract.shouldRebuild) {
    lines.push(`✅ shouldRebuild = true`);
    lines.push(`   → Generate a completely new program from scratch.`);
    lines.push(`   → Do not modify the existing program — create a fresh one.`);
  }

  if (contract.shouldRespondGuidanceOnly) {
    lines.push(`✅ shouldRespondGuidanceOnly = true`);
    lines.push(`   → Answer as a coach. Do NOT modify or pretend to modify any program.`);
    lines.push(`   → Keep answer under 3 sentences unless explanation requires more.`);
  }

  if (contract.safetyMode) {
    lines.push(`⚠️  safetyMode = true`);
    lines.push(`   → The user mentioned pain or injury. Handle with care.`);
    lines.push(`   → Reduce stress on the affected region. Do NOT diagnose.`);
    lines.push(`   → Do NOT give generic safety disclaimers without a coaching action.`);
  }

  if (contract.actionType === "TEMPORARY_ADJUSTMENT") {
    lines.push(`⚠️  TEMPORARY ADJUSTMENT — Today/This Session Only`);
    lines.push(`   → ONLY modify today's session or the current workout.`);
    lines.push(`   → Future weeks and other sessions MUST remain unchanged.`);
    lines.push(`   → Confirm explicitly: "Just for today..." or "This session only..."`);
  }

  lines.push(``);
  lines.push(`Allowed response types: [${contract.allowedResponseTypes.join(", ")}]`);

  if (contract.forbiddenResponseTypes.length > 0) {
    lines.push(`FORBIDDEN:`);
    for (const f of contract.forbiddenResponseTypes) {
      lines.push(`  ❌ "${f}"`);
    }
  }

  lines.push(``);
  lines.push(`NEVER say "I processed your request" or "I applied the change" without showing what specifically changed.`);
  lines.push(`NEVER say "Here's what I would do" when a real program mutation was requested.`);

  return lines.join("\n");
}
