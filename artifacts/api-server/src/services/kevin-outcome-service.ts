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
// Outcome lifecycle:
//   pending → processing → forwarded
//                       ↘ failed (→ retry) → dead_lettered after the retries are exhausted
//
// Worker design mirrors the Kevin event worker (same retry schedule, batch
// claim, circuit-breaker, concurrency-safe state transitions).

import { db } from "@workspace/db";
import {
  kevinTrainingOutcomesTable,
  type KevinOutcomeType,
  type InsertKevinTrainingOutcome,
} from "@workspace/db";
import { eq, and, lte, isNull, or, inArray } from "drizzle-orm";
import { sendKevinOutcome, KevinError } from "../lib/kevin-client";
import { getKevinConfig } from "../lib/kevin-config";
import { isKevinCircuitAllowed } from "../lib/kevin-circuit-breaker";
import { deriveKevinPseudonymousId, deriveKevinPseudonymousOrgId } from "../lib/kevin-pseudonym";
import { sanitizeKevinPayload } from "../lib/kevin-payload-sanitizer";
import {
  kevinNextRetryDelay,
  kevinShouldDeadLetter,
  isKevinLocalNonRetryCode,
} from "../lib/kevin-retry";
import { logger } from "../lib/logger";
import crypto from "crypto";

const WORKER_POLL_MS = 30_000;   // poll every 30s (outcomes are lower-frequency)
const WORKER_BATCH = 10;
const STALE_PROCESSING_MINUTES = 10; // recover rows stuck in "processing"

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
  /**
   * Stable idempotency key. Defaults to a per-row value derived from traceId.
   * Pass a deterministic key (e.g. `session_completed:${sessionId}`) to make
   * repeated records of the same logical outcome a no-op at the DB layer.
   */
  idempotencyKey?: string;
}

/**
 * Records a training outcome locally and marks it pending for the worker.
 * Non-blocking — the calling workflow is never affected by outcome errors.
 */
export async function recordKevinOutcome(
  input: RecordKevinOutcomeInput,
): Promise<void> {
  const config = getKevinConfig();
  if (!config.integrationEnabled) return;
  // Outcomes are staged for EXPORT to Kevin, so they need a real salt to derive a
  // safe pseudonym. Without one, skip cleanly rather than letting the strict
  // derive throw (fail-open). In normal operation outcomeForwarding implies the
  // boot gate already required the salt, so this only trips on a misconfig.
  if (!config.pseudonymSalt) {
    logger.debug("[KevinOutcome] No pseudonym salt configured — skipping outcome staging");
    return;
  }

  const userIdPseudonymous = deriveKevinPseudonymousId(input.userId);
  const orgIdPseudonymous = input.orgId
    ? deriveKevinPseudonymousOrgId(input.orgId)
    : null;
  const traceId = input.traceId ?? crypto.randomUUID();
  // Stable per-row idempotency key, forwarded to Kevin so a duplicate dispatch
  // (crash between send and mark-forwarded) is deduped. UNIQUE at the DB layer.
  const idempotencyKey =
    input.idempotencyKey ?? `${config.applicationId}:outcome:${traceId}`;

  try {
    await db
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
        idempotencyKey,
        forwardStatus: "pending",
        forwardAttempts: 0,
        nextRetryAt: new Date(),
        traceId,
      } satisfies Omit<InsertKevinTrainingOutcome, "id" | "createdAt" | "forwardedAt" | "deadLetteredAt" | "processingStartedAt">)
      // Duplicate logical outcome (same idempotency key) is a harmless no-op.
      .onConflictDoNothing({ target: kevinTrainingOutcomesTable.idempotencyKey })
      .catch((err: unknown) => {
        logger.error({ err, outcomeType: input.outcomeType }, "[KevinOutcome] Failed to record outcome — skipping");
      });
  } catch {
    // Never block the caller
  }
}

// ─── Durable retry worker ─────────────────────────────────────────────────────

let _outcomeWorkerTimer: ReturnType<typeof setInterval> | null = null;
let _outcomeWorkerStopping = false;
// In-flight flush — tracked so overlapping ticks never run concurrently and
// graceful shutdown can await the current iteration.
let _outcomeActiveFlush: Promise<unknown> | null = null;

/**
 * Starts the Kevin outcome forwarding worker.
 * Called once from index.ts after startup. Safe to call multiple times.
 */
export function startKevinOutcomeWorker(): void {
  if (_outcomeWorkerTimer) {
    logger.warn("[KevinOutcome] Worker already running — skipping duplicate start");
    return;
  }

  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.outcomeForwardingEnabled) {
    logger.info("[KevinOutcome] Outcome forwarding disabled — worker not started");
    return;
  }

  _outcomeWorkerStopping = false;
  logger.info({ pollMs: WORKER_POLL_MS }, "[KevinOutcome] Starting outcome forwarding worker");

  _outcomeWorkerTimer = setInterval(() => {
    // Never overlap: skip while a previous flush is still running or shutting down.
    if (_outcomeWorkerStopping || _outcomeActiveFlush) return;
    _outcomeActiveFlush = flushPendingKevinTrainingOutcomes()
      .catch((err) => {
        logger.error({ err }, "[KevinOutcome] Worker tick failed");
      })
      .finally(() => {
        _outcomeActiveFlush = null;
      });
  }, WORKER_POLL_MS);

  if (_outcomeWorkerTimer.unref) _outcomeWorkerTimer.unref();
}

/**
 * Stops the Kevin outcome worker (synchronous). Prevents further ticks but does
 * not wait for an in-flight flush — use drainKevinOutcomeWorker for that.
 */
export function stopKevinOutcomeWorker(): void {
  _outcomeWorkerStopping = true;
  if (_outcomeWorkerTimer) {
    clearInterval(_outcomeWorkerTimer);
    _outcomeWorkerTimer = null;
    logger.info("[KevinOutcome] Outcome forwarding worker stopped");
  }
}

/**
 * Graceful stop: prevent new ticks and await the in-flight flush so no claimed
 * outcome is abandoned mid-forward. Used by the process shutdown sequence.
 */
export async function drainKevinOutcomeWorker(): Promise<void> {
  stopKevinOutcomeWorker();
  if (_outcomeActiveFlush) {
    try {
      await _outcomeActiveFlush;
    } catch {
      // errors are already logged inside the tick
    }
  }
}

/**
 * Processes pending outcomes. Exported for testing and manual flush.
 */
export async function flushPendingKevinTrainingOutcomes(): Promise<{
  processed: number;
  forwarded: number;
  failed: number;
}> {
  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.outcomeForwardingEnabled) {
    return { processed: 0, forwarded: 0, failed: 0 };
  }
  // Not configured → don't claim (claiming then failing would burn retry budget
  // on KEVIN_NOT_CONFIGURED).
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    logger.debug("[KevinOutcome] Hermes not configured — skipping flush");
    return { processed: 0, forwarded: 0, failed: 0 };
  }
  if (!isKevinCircuitAllowed()) {
    logger.debug("[KevinOutcome] Circuit open — skipping flush");
    return { processed: 0, forwarded: 0, failed: 0 };
  }

  const now = new Date();

  // ── Recover stale "processing" rows (M7) ───────────────────────────────────
  // Keyed on processing_started_at (NOT created_at) so a legitimately in-flight
  // outcome is never reclaimed and re-forwarded. NULL covers legacy rows.
  const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60_000);
  await db
    .update(kevinTrainingOutcomesTable)
    .set({ forwardStatus: "pending", nextRetryAt: now })
    .where(
      and(
        eq(kevinTrainingOutcomesTable.forwardStatus, "processing"),
        or(
          isNull(kevinTrainingOutcomesTable.processingStartedAt),
          lte(kevinTrainingOutcomesTable.processingStartedAt, staleThreshold),
        ),
      ),
    )
    .catch((err: unknown) => {
      logger.warn({ err }, "[KevinOutcome] Stale-processing recovery failed — continuing");
    });

  // ── Atomically claim a batch (H2) ──────────────────────────────────────────
  // SELECT … FOR UPDATE SKIP LOCKED inside a transaction, then flip to
  // "processing" + stamp processing_started_at, so no outcome is claimed twice
  // across instances or overlapping ticks.
  let claimedIds: number[] = [];
  try {
    claimedIds = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: kevinTrainingOutcomesTable.id })
        .from(kevinTrainingOutcomesTable)
        .where(
          and(
            or(
              eq(kevinTrainingOutcomesTable.forwardStatus, "pending"),
              eq(kevinTrainingOutcomesTable.forwardStatus, "failed"),
            ),
            or(
              isNull(kevinTrainingOutcomesTable.nextRetryAt),
              lte(kevinTrainingOutcomesTable.nextRetryAt, now),
            ),
          ),
        )
        .limit(WORKER_BATCH)
        .for("update", { skipLocked: true });

      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);

      await tx
        .update(kevinTrainingOutcomesTable)
        .set({ forwardStatus: "processing", processingStartedAt: now })
        .where(inArray(kevinTrainingOutcomesTable.id, ids));

      return ids;
    });
  } catch (err) {
    logger.error({ err }, "[KevinOutcome] Failed to claim outcomes — skipping tick");
    return { processed: 0, forwarded: 0, failed: 0 };
  }

  if (claimedIds.length === 0) return { processed: 0, forwarded: 0, failed: 0 };

  // ── Load and dispatch ──────────────────────────────────────────────────────
  const outcomes = await db
    .select()
    .from(kevinTrainingOutcomesTable)
    .where(inArray(kevinTrainingOutcomesTable.id, claimedIds));

  let forwarded = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    try {
      await sendKevinOutcome({
        userIdPseudonymous: outcome.userIdPseudonymous,
        orgId: outcome.orgId ?? undefined,
        outcomeType: outcome.outcomeType,
        entityType: outcome.entityType ?? undefined,
        entityId: outcome.entityId ?? undefined,
        contextRequestId: outcome.contextRequestId !== null && outcome.contextRequestId !== undefined
          ? String(outcome.contextRequestId)
          : undefined,
        resultSummary: (outcome.resultSummary as Record<string, unknown>) ?? {},
        wasUseful: outcome.wasUseful ?? undefined,
        wasModified: outcome.wasModified ?? undefined,
        completionStatus: outcome.completionStatus ?? undefined,
        traceId: outcome.traceId ?? crypto.randomUUID(),
        idempotencyKey: outcome.idempotencyKey,
      });

      await markOutcomeForwarded(outcome.id);
      forwarded++;
    } catch (err) {
      // Local/config failure never reached Kevin → release WITHOUT consuming the
      // retry budget.
      const code = err instanceof KevinError ? err.code : undefined;
      if (isKevinLocalNonRetryCode(code)) {
        await releaseOutcomeToPending(outcome.id).catch(() => {});
        logger.debug(
          { id: outcome.id, code },
          "[KevinOutcome] Local failure — released without consuming retry budget",
        );
        continue;
      }

      const errorMsg = err instanceof KevinError ? err.message : String(err);
      const newAttempts = outcome.forwardAttempts + 1;

      if (kevinShouldDeadLetter(newAttempts)) {
        await deadLetterOutcome(outcome.id, errorMsg);
        logger.error(
          { id: outcome.id, attempts: newAttempts, error: errorMsg },
          "[KevinOutcome] Outcome dead-lettered after max attempts",
        );
      } else {
        await markOutcomeFailed(outcome.id, errorMsg, newAttempts);
        logger.warn(
          { id: outcome.id, attempts: newAttempts, nextRetryMs: kevinNextRetryDelay(newAttempts) },
          "[KevinOutcome] Outcome forward failed — will retry",
        );
      }
      failed++;
    }
  }

  return { processed: claimedIds.length, forwarded, failed };
}

// ─── State transitions ────────────────────────────────────────────────────────

export async function markOutcomeForwarded(id: number): Promise<void> {
  await db
    .update(kevinTrainingOutcomesTable)
    .set({ forwardStatus: "forwarded", forwardedAt: new Date(), lastForwardError: null })
    .where(eq(kevinTrainingOutcomesTable.id, id));
}

export async function markOutcomeFailed(
  id: number,
  error: string,
  attempts: number,
): Promise<void> {
  const delay = kevinNextRetryDelay(attempts);
  await db
    .update(kevinTrainingOutcomesTable)
    .set({
      forwardStatus: "failed",
      forwardAttempts: attempts,
      lastForwardError: error.slice(0, 500),
      nextRetryAt: new Date(Date.now() + delay),
    })
    .where(eq(kevinTrainingOutcomesTable.id, id));
}

export async function deadLetterOutcome(id: number, error: string): Promise<void> {
  await db
    .update(kevinTrainingOutcomesTable)
    .set({
      forwardStatus: "dead_lettered",
      lastForwardError: error.slice(0, 500),
      deadLetteredAt: new Date(),
    })
    .where(eq(kevinTrainingOutcomesTable.id, id));
}

/**
 * Releases a claimed outcome back to "pending" without consuming its retry
 * budget. Used when the forward failed for a LOCAL reason (not configured /
 * circuit open / disabled) — it never reached Kevin, so it is not a real failure.
 */
export async function releaseOutcomeToPending(id: number): Promise<void> {
  await db
    .update(kevinTrainingOutcomesTable)
    .set({ forwardStatus: "pending", processingStartedAt: null, nextRetryAt: new Date() })
    .where(eq(kevinTrainingOutcomesTable.id, id));
}

// ─── Admin: manual dead-letter retry ──────────────────────────────────────────

/**
 * Resets a dead-lettered outcome to pending so the worker retries it.
 * Admin-only. Preserves the record and logs the admin action.
 */
export async function retryDeadLetteredOutcome(
  id: number,
  adminEmail: string,
): Promise<void> {
  await db
    .update(kevinTrainingOutcomesTable)
    .set({
      forwardStatus: "pending",
      forwardAttempts: 0,
      lastForwardError: `Manually retried by admin (${adminEmail})`,
      nextRetryAt: new Date(),
      deadLetteredAt: null,
    })
    .where(
      and(
        eq(kevinTrainingOutcomesTable.id, id),
        eq(kevinTrainingOutcomesTable.forwardStatus, "dead_lettered"),
      ),
    );

  logger.info({ id, adminEmail }, "[KevinOutcome] Dead-lettered outcome reset to pending by admin");
}

// ─── Queue stats ──────────────────────────────────────────────────────────────

export async function getKevinOutcomeQueueStats(): Promise<{
  pending: number;
  processing: number;
  forwarded: number;
  failed: number;
  deadLettered: number;
  skipped: number;
}> {
  const rows = await db
    .select({ forwardStatus: kevinTrainingOutcomesTable.forwardStatus })
    .from(kevinTrainingOutcomesTable);

  const counts = { pending: 0, processing: 0, forwarded: 0, failed: 0, deadLettered: 0, skipped: 0 };
  for (const r of rows) {
    if (r.forwardStatus === "pending") counts.pending++;
    else if (r.forwardStatus === "processing") counts.processing++;
    else if (r.forwardStatus === "forwarded") counts.forwarded++;
    else if (r.forwardStatus === "failed") counts.failed++;
    else if (r.forwardStatus === "dead_lettered") counts.deadLettered++;
    else if (r.forwardStatus === "skipped") counts.skipped++;
  }
  return counts;
}

// ─── Convenience factories ────────────────────────────────────────────────────

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
 * difficulty/energy/pain: 1–5 numeric scores from the user.
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

  // Choose a specific outcome type that matches the observed score pattern
  let outcomeType: KevinOutcomeType;
  if (scores.difficulty >= 4) {
    outcomeType = "too_hard";
  } else if (scores.difficulty <= 2) {
    outcomeType = "too_easy";
  } else if (overallSentiment === "positive") {
    outcomeType = "feedback_positive";
  } else {
    outcomeType = "feedback_negative";
  }

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
 * Note: completed ≠ effective or positive adaptation.
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
//
// Recursive ALLOWLIST (H5) — shares the same walker as event payloads
// (sanitizeKevinPayload). Only these categorical result-summary keys are
// forwarded to Kevin, at any depth; everything else (PII, health data, secrets,
// raw text, full programs, unknown keys) is dropped. New legitimate summary
// fields MUST be added here (drops are logged via onDropped).
// Exactly the categorical keys the outcome factories emit into resultSummary
// (recordSessionFeedbackOutcome, recordContextOutcome, recordExerciseSubstituted).
// difficulty_level/energy_response are the OUTCOME-side categorical names — not
// the event-side numeric difficulty_score/energy_score. New fields must be added
// here explicitly (drops are logged via onDropped).
const KEVIN_OUTCOME_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "kevin_context_used",
  "user_initiated",
  "overall_sentiment",
  "difficulty_level",
  "energy_response",
  "completion_status",
]);

function sanitizeOutcomeSummary(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeKevinPayload(summary, {
    allow: KEVIN_OUTCOME_ALLOWED_KEYS,
    onDropped: (key, reason) =>
      logger.debug({ key, reason }, "[KevinOutcome] Dropped non-allowlisted summary key"),
  });
}
