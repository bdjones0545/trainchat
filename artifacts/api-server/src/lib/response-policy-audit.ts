/**
 * Response Policy Audit — DEV-only structured logging for the Response Policy Engine.
 *
 * Gated behind NODE_ENV !== "production" and optional LOG_RESPONSE_POLICY_AUDIT env flag.
 *
 * Usage:
 *   import { auditResponsePolicy } from "./response-policy-audit";
 *   auditResponsePolicy(policy, rawMessage, profile);
 *
 * In production this is a no-op. In development it emits structured log lines
 * that are easily grep-able and parseable.
 */

import { logger } from "./logger";
import type { ResponsePolicy } from "./response-policy-engine";
import type { AgentIntentProfile } from "./language-system";

const IS_DEV = process.env.NODE_ENV !== "production";
const AUDIT_ENABLED = IS_DEV || process.env.LOG_RESPONSE_POLICY_AUDIT === "true";

/**
 * Emit a structured audit log for a resolved ResponsePolicy.
 *
 * Concise format (always emitted in DEV):
 *   [ResponsePolicyAudit] action=MODIFY_PROGRAM scope=CURRENT_BLOCK mode=COACH_CONFIRM_AND_ACT mutation=true confidence=0.84
 *
 * Detailed format (emitted when AUDIT_ENABLED):
 *   Structured JSON via logger.debug
 */
export function auditResponsePolicy(
  policy: ResponsePolicy,
  rawMessage: string,
  profile?: AgentIntentProfile
): void {
  if (!AUDIT_ENABLED) return;

  // ── Concise grep-friendly line ─────────────────────────────────────────────
  logger.info(
    `[ResponsePolicyAudit] action=${policy.actionType} scope=${policy.changeScope} mode=${policy.responseMode} mutation=${policy.programMutationNeeded} confidence=${policy.confidence.toFixed(2)} verbosity=${policy.verbosityLevel} tone=${policy.coachVoiceGuidance.toneProfile}`
  );

  // ── Structured detail ──────────────────────────────────────────────────────
  logger.debug(
    {
      audit: "response_policy",
      rawUserMessage: rawMessage.slice(0, 200),
      structuredIntentSummary: profile
        ? {
            requestType: profile.requestType,
            primaryGoal: profile.primaryGoal,
            recoveryState: profile.recoveryState,
            requestedChanges: profile.requestedChanges.length,
            preserveInstructions: profile.preserveInstructions.length,
            stylePreferences: profile.stylePreferences,
            ambiguityFlags: profile.ambiguityFlags.length,
            contradictions: profile.contradictions.length,
            confidenceScore: profile.confidenceScore,
          }
        : null,
      chosenActionType: policy.actionType,
      chosenChangeScope: policy.changeScope,
      chosenResponseMode: policy.responseMode,
      programMutationNeeded: policy.programMutationNeeded,
      explanationNeeded: policy.explanationNeeded,
      confidence: policy.confidence,
      preserveTargets: policy.preserveTargets,
      verbosityLevel: policy.verbosityLevel,
      coachVoiceGuidance: policy.coachVoiceGuidance,
      finalResponseStrategy: policy.rationale,
    },
    "[ResponsePolicyAudit] Detailed policy resolution"
  );

  // ── Warnings ───────────────────────────────────────────────────────────────
  for (const warning of policy.warnings) {
    logResponsePolicyAuditWarning(
      `[${warning.code}] ${warning.message} | action=${policy.actionType} scope=${policy.changeScope}`
    );
  }
}

/**
 * Log a concise warning line.
 * Format: [ResponsePolicyAuditWarning] <message>
 */
export function logResponsePolicyAuditWarning(message: string): void {
  if (!AUDIT_ENABLED) return;
  logger.warn(`[ResponsePolicyAuditWarning] ${message}`);
}

/**
 * Log a concise info line.
 * Format: [ResponsePolicyAudit] <message>
 */
export function logResponsePolicyAudit(message: string): void {
  if (!AUDIT_ENABLED) return;
  logger.info(`[ResponsePolicyAudit] ${message}`);
}
