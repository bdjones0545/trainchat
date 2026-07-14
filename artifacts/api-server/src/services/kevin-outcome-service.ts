// ─── Kevin Outcome Service ─────────────────────────────────────────────────────
//
// Records and forwards training outcomes to Kevin for learning.
//
// Key distinctions (per spec):
//   - "user accepted the workout" ≠ "user completed the workout successfully"
//   - Completion ≠ positive adaptation
//   - Only outcomes TrainChat can actually observe are recorded
//   - Clinical outcomes are NEVER inferred
//   - Forwarding failure NEVER affects user feedback submission or session completion
//
// Outcome forwarding is:
//   - Asynchronous
//   - Non-blocking
//   - Fail-open

import { db } from "@workspace/db";
import {
  kevinTrainingOutcomesTable,
  type KevinOutcomeType,
  type InsertKevinTrainingOutcome,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendKevinOutcome } from "../lib/kevin-client";
import { KevinError } from "../lib/kevin-client";
import { getKevinConfig } from "../lib/kevin-config";
import { deriveKevinPseudonymousId, deriveKevinPseudonymousOrgId } from "../lib/kevin-pseudonym";
import { logger } from "../lib/logger";
import crypto from "crypto";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RecordKevinOutcomeInput {
  userId: number;
  orgId?: string;
  outcomeType: KevinOutcomeType;
  entityType?: string;
  entityId?: string;
  contextRequestId?: number;
  /** Categorical result summary — no clinical inference, no PII */
  resultSummary?: Record<string, unknown>;
  wasUseful?: boolean;
  wasModified?: boolean;
  completionStatus?: string;
  traceId?: string;
}

/**
 * Records a training outcome locally and schedules async forwarding to Kevin.
 * Non-blocking — the calling workflow is never affected by outcome errors.
 */
export async function recordKevinOutcome(
  input: RecordKevinOutcomeInput,
): Promise<void> {
  const config = getKevinConfig();
  if (!config.integrationEnabled) return;

  const userIdPseudonymous = deriveKevinPseudonymousId(input.userId);
  const orgIdPseudonymous = input.orgId
    ? deriveKevinPseudonymousOrgId(input.orgId)
    : null;
  const traceId = input.traceId ?? crypto.randomUUID();

  let outcomeId: number | undefined;

  // ── Persist locally first ─────────────────────────────────────────────────
  try {
    const [row] = await db
      .insert(kevinTrainingOutcomesTable)
      .values({
        applicationId: config.applicationId,
        orgId: orgIdPseudonymous,
        userIdPseudonymous,
        contextRequestId: input.contextRequestId,
        entityType: input.entityType,
        entityId: input.entityId,
        outcomeType: input.outcomeType,
        resultSummary: sanitizeOutcomeSummary(input.resultSummary ?? {}),
        wasUseful: input.wasUseful,
        wasModified: input.wasModified,
        completionStatus: input.completionStatus,
        forwardStatus: "pending",
        forwardAttempts: 0,
        traceId,
      } satisfies Omit<InsertKevinTrainingOutcome, "id" | "createdAt" | "forwardedAt" | "lastForwardError">)
      .returning({ id: kevinTrainingOutcomesTable.id });
    outcomeId = row?.id;
  } catch (err) {
    // Never block the caller
    logger.error({ err, outcomeType: input.outcomeType }, "[KevinOutcome] Failed to record outcome — skipping");
    return;
  }

  // ── Forward to Kevin asynchronously ───────────────────────────────────────
  if (config.outcomeForwardingEnabled && outcomeId !== undefined) {
    forwardOutcomeAsync(outcomeId, {
      userIdPseudonymous,
      orgId: orgIdPseudonymous ?? undefined,
      outcomeType: input.outcomeType,
      entityType: input.entityType,
      entityId: input.entityId,
      contextRequestId: input.contextRequestId,
      resultSummary: sanitizeOutcomeSummary(input.resultSummary ?? {}),
      wasUseful: input.wasUseful,
      wasModified: input.wasModified,
      completionStatus: input.completionStatus,
      traceId,
    }).catch((err: unknown) => {
      logger.warn({ err, outcomeId }, "[KevinOutcome] Async forwarding failed — outcome remains locally recorded");
    });
  }
}

// ─── Async forwarding ─────────────────────────────────────────────────────────

async function forwardOutcomeAsync(
  outcomeId: number,
  payload: {
    userIdPseudonymous: string;
    orgId?: string;
    outcomeType: string;
    entityType?: string;
    entityId?: string;
    contextRequestId?: number;
    resultSummary: Record<string, unknown>;
    wasUseful?: boolean;
    wasModified?: boolean;
    completionStatus?: string;
    traceId: string;
  },
): Promise<void> {
  try {
    await sendKevinOutcome({
      ...payload,
      contextRequestId: payload.contextRequestId !== undefined
        ? String(payload.contextRequestId)
        : undefined,
    });

    await db
      .update(kevinTrainingOutcomesTable)
      .set({
        forwardStatus: "sent",
        forwardedAt: new Date(),
        lastForwardError: null,
      })
      .where(eq(kevinTrainingOutcomesTable.id, outcomeId));

    logger.info(
      { outcomeId, outcomeType: payload.outcomeType },
      "[KevinOutcome] Outcome forwarded to Kevin",
    );
  } catch (err) {
    const errMsg = err instanceof KevinError ? err.message : String(err);
    const attempts = 1;

    await db
      .update(kevinTrainingOutcomesTable)
      .set({
        forwardStatus: "failed",
        forwardAttempts: attempts,
        lastForwardError: errMsg.slice(0, 500),
      })
      .where(eq(kevinTrainingOutcomesTable.id, outcomeId));

    // Don't rethrow — forwarding failure must not affect user
  }
}

// ─── Convenience factories ────────────────────────────────────────────────────
//
// These helpers encode the semantic distinctions required by the spec.

/**
 * Records that a program was generated (not yet accepted or used).
 */
export function recordProgramGenerated(
  userId: number,
  entityId: string,
  extras: { kevinContextUsed: boolean; trainingSystemId?: number },
): void {
  recordKevinOutcome({
    userId,
    outcomeType: "generated",
    entityType: "program",
    entityId,
    resultSummary: { kevin_context_used: extras.kevinContextUsed },
    wasModified: false,
  }).catch(() => {});
}

/**
 * Records session feedback — distinguishes sentiment from clinical outcome.
 */
export function recordSessionFeedbackOutcome(
  userId: number,
  entityId: string,
  scores: { difficulty: number; energy: number; pain: number },
  contextRequestId?: number,
): void {
  // Convert numeric scores to observable sentiments — no clinical inference
  const overallSentiment =
    scores.difficulty <= 3 && scores.energy >= 3 ? "positive"
    : scores.difficulty >= 4 ? "negative"
    : "neutral";

  const outcomeType: KevinOutcomeType =
    overallSentiment === "positive" ? "feedback_positive" : "feedback_negative";

  recordKevinOutcome({
    userId,
    outcomeType,
    entityType: "session",
    entityId,
    contextRequestId,
    resultSummary: {
      difficulty_level: scores.difficulty >= 4 ? "high" : scores.difficulty <= 2 ? "low" : "moderate",
      energy_response: scores.energy >= 4 ? "good" : scores.energy <= 2 ? "poor" : "moderate",
      overall_sentiment: overallSentiment,
    },
    wasUseful: overallSentiment === "positive",
  }).catch(() => {});
}

/**
 * Records that a session was completed (observable event — not clinical outcome).
 */
export function recordSessionCompleted(
  userId: number,
  entityId: string,
  contextRequestId?: number,
): void {
  recordKevinOutcome({
    userId,
    outcomeType: "session_completed",
    entityType: "session",
    entityId,
    contextRequestId,
    completionStatus: "completed",
    wasUseful: undefined, // completion ≠ positive adaptation
  }).catch(() => {});
}

/**
 * Records that an exercise was replaced.
 */
export function recordExerciseSubstituted(
  userId: number,
  entityId: string,
  wasUserInitiated: boolean,
): void {
  recordKevinOutcome({
    userId,
    outcomeType: "exercise_replaced",
    entityType: "exercise",
    entityId,
    wasModified: wasUserInitiated,
    resultSummary: { user_initiated: wasUserInitiated },
  }).catch(() => {});
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

const FORBIDDEN_OUTCOME_KEYS = new Set([
  "email", "name", "phone", "address", "dob", "injury_detail",
  "diagnosis", "medication", "raw_text", "prompt", "api_key", "token",
]);

function sanitizeOutcomeSummary(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summary)) {
    if (FORBIDDEN_OUTCOME_KEYS.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}
