// ─── Kevin Event Service ──────────────────────────────────────────────────────
//
// Durable async event queue for TrainChat → Kevin event pipeline.
//
// Design principles:
//   - Enqueueing is non-blocking and fail-open (workout never blocked)
//   - Worker dispatches pending events on an interval
//   - Claiming is ATOMIC via SELECT … FOR UPDATE SKIP LOCKED inside a
//     transaction, so no two instances or overlapping ticks claim the same row
//   - Stale "processing" rows (crash between claim and send) are recovered via
//     processing_started_at, never lost
//   - Retry schedule: 30s → 2m → 8m → 30m → 2h → dead-letter (first retry is 30s)
//   - Local/config failures (KEVIN_NOT_CONFIGURED / KEVIN_CIRCUIT_OPEN /
//     KEVIN_DISABLED) release the row WITHOUT consuming the retry budget
//   - Idempotency keys prevent duplicate rows
//   - Payloads are sanitized: no raw PII, emails, health data, or secrets
//   - Org and user isolation enforced
//   - Graceful shutdown drains the in-flight tick before exit
//
// Event enqueueing fires from production workflow hooks, never from
// duplicate or non-production code paths.

import { db } from "@workspace/db";
import {
  kevinAppEventsTable,
  type KevinEventType,
  type InsertKevinAppEvent,
} from "@workspace/db";
import { eq, and, lte, isNull, or, inArray } from "drizzle-orm";
import { sendKevinEvent, KevinError } from "../lib/kevin-client";
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

// Recover rows stuck in "processing" longer than this (crash between claim and
// send/mark). Keyed on processing_started_at, never created_at.
const STALE_PROCESSING_MINUTES = 10;

// ─── Sanitized event summaries ─────────────────────────────────────────────────
//
// These are the ONLY fields that may be included in Kevin event payloads.
// Raw workout prescriptions, user names, emails, health data, and secrets
// are NEVER included.

export interface ProgramGeneratedSummary {
  goal_category: string;
  session_duration_minutes?: number;
  exercise_count?: number;
  movement_categories?: string[];
  generation_source: "authenticated_app" | "external_api" | "guest";
  kevin_context_used: boolean;
  weekly_frequency?: number;
  training_style?: string;
}

export interface ProgramEditedSummary {
  edit_type: string;
  scope: string;
  kevin_context_used: boolean;
}

export interface SessionFeedbackSummary {
  difficulty_score: number;
  energy_score: number;
  overall_sentiment: "positive" | "neutral" | "negative";
}

export interface ExerciseSubstitutedSummary {
  substitution_reason?: string;
  category?: string;
}

export interface UserOnboardedSummary {
  goal_category?: string;
  experience_level?: string;
}

export type KevinEventSummary =
  | ProgramGeneratedSummary
  | ProgramEditedSummary
  | SessionFeedbackSummary
  | ExerciseSubstitutedSummary
  | UserOnboardedSummary
  | Record<string, unknown>;

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export interface EnqueueKevinEventInput {
  userId: number;
  orgId?: string;
  eventType: KevinEventType;
  entityType?: string;
  entityId?: string;
  summary: KevinEventSummary;
  /** Stable idempotency key — use deterministic inputs, e.g. `program_generated:${programId}` */
  idempotencyKey?: string;
  traceId?: string;
  origin?: string;
  depth?: number;
}

/**
 * Enqueues a Kevin event for async dispatch.
 * Non-blocking — errors are logged but never thrown to the caller.
 * The original workout workflow is never affected by enqueue failures.
 */
export async function enqueueKevinEvent(
  input: EnqueueKevinEventInput,
): Promise<void> {
  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.eventDispatchEnabled) {
    return; // silently skip — Kevin is disabled
  }

  // ── Recursion guard ───────────────────────────────────────────────────────
  const depth = input.depth ?? 0;
  if (depth > 3) {
    logger.warn(
      { depth, eventType: input.eventType },
      "[KevinEvents] Depth > 3 — skipping event enqueue to prevent loop",
    );
    return;
  }

  const userIdPseudonymous = deriveKevinPseudonymousId(input.userId);
  const orgIdPseudonymous = input.orgId
    ? deriveKevinPseudonymousOrgId(input.orgId)
    : null;
  const traceId = input.traceId ?? crypto.randomUUID();
  const idempotencyKey =
    input.idempotencyKey ??
    `${config.applicationId}:${input.eventType}:${traceId}`;

  try {
    await db
      .insert(kevinAppEventsTable)
      .values({
        applicationId: config.applicationId,
        orgId: orgIdPseudonymous,
        userIdPseudonymous,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: sanitizePayload(input.summary as Record<string, unknown>),
        idempotencyKey,
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
        traceId,
        origin: input.origin ?? "trainchat_generation",
        depth,
      } satisfies Omit<InsertKevinAppEvent, "id" | "createdAt" | "sentAt" | "deadLetteredAt" | "lastError">)
      .onConflictDoNothing(); // idempotency — duplicate key = already enqueued

    logger.info(
      { eventType: input.eventType, idempotencyKey },
      "[KevinEvents] Event enqueued",
    );
  } catch (err) {
    // Never throw — the workout must continue
    logger.error(
      { err, eventType: input.eventType },
      "[KevinEvents] Failed to enqueue event — continuing without Kevin",
    );
  }
}

// ─── Dispatch worker ──────────────────────────────────────────────────────────

const WORKER_POLL_MS = 15_000;  // poll every 15s
const WORKER_BATCH = 10;         // process up to 10 events per tick

let _workerTimer: ReturnType<typeof setInterval> | null = null;
let _workerStopping = false;
// The in-flight flush, tracked so (a) overlapping ticks never run concurrently
// and (b) graceful shutdown can await the current iteration before exiting.
let _activeFlush: Promise<unknown> | null = null;

/**
 * Starts the Kevin event dispatch worker.
 * Called once from index.ts after startup. Safe to call multiple times.
 */
export function startKevinEventWorker(): void {
  if (_workerTimer) {
    logger.warn("[KevinEvents] Worker already running — skipping duplicate start");
    return;
  }

  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.eventDispatchEnabled) {
    logger.info("[KevinEvents] Event dispatch disabled — worker not started");
    return;
  }

  _workerStopping = false;
  logger.info({ pollMs: WORKER_POLL_MS }, "[KevinEvents] Starting event dispatch worker");

  _workerTimer = setInterval(() => {
    // Never overlap: skip this tick while a previous flush is still running or
    // while shutting down.
    if (_workerStopping || _activeFlush) return;
    _activeFlush = flushPendingKevinEvents()
      .catch((err) => {
        logger.error({ err }, "[KevinEvents] Worker tick failed");
      })
      .finally(() => {
        _activeFlush = null;
      });
  }, WORKER_POLL_MS);

  if (_workerTimer.unref) _workerTimer.unref();
}

/**
 * Stops the Kevin event worker (synchronous). Prevents further ticks but does
 * not wait for an in-flight flush — use drainKevinEventWorker for that.
 */
export function stopKevinEventWorker(): void {
  _workerStopping = true;
  if (_workerTimer) {
    clearInterval(_workerTimer);
    _workerTimer = null;
    logger.info("[KevinEvents] Event dispatch worker stopped");
  }
}

/**
 * Graceful stop: prevent new ticks and await the in-flight flush so no claimed
 * row is abandoned mid-dispatch. Used by the process shutdown sequence.
 */
export async function drainKevinEventWorker(): Promise<void> {
  stopKevinEventWorker();
  if (_activeFlush) {
    try {
      await _activeFlush;
    } catch {
      // errors are already logged inside the tick
    }
  }
}

/**
 * Processes pending Kevin events. Exported for testing and manual flush.
 */
export async function flushPendingKevinEvents(): Promise<{ processed: number; sent: number; failed: number }> {
  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.eventDispatchEnabled) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  // Not configured → don't claim anything (claiming then failing would burn
  // retry budget on KEVIN_NOT_CONFIGURED). Wait for configuration instead.
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    logger.debug("[KevinEvents] Hermes not configured — skipping flush");
    return { processed: 0, sent: 0, failed: 0 };
  }
  if (!isKevinCircuitAllowed()) {
    logger.debug("[KevinEvents] Circuit open — skipping flush");
    return { processed: 0, sent: 0, failed: 0 };
  }

  const now = new Date();

  // ── Recover stale "processing" rows (H3) ───────────────────────────────────
  // A crash between claim and send/mark leaves rows stuck in "processing".
  // Reclaim any whose processing_started_at is older than the timeout (or NULL,
  // for legacy rows). NEVER uses created_at — only processing_started_at
  // determines staleness, so legitimately in-flight rows are never reclaimed.
  const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60_000);
  await db
    .update(kevinAppEventsTable)
    .set({ status: "pending", nextRetryAt: now })
    .where(
      and(
        eq(kevinAppEventsTable.status, "processing"),
        or(
          isNull(kevinAppEventsTable.processingStartedAt),
          lte(kevinAppEventsTable.processingStartedAt, staleThreshold),
        ),
      ),
    )
    .catch((err: unknown) => {
      logger.warn({ err }, "[KevinEvents] Stale-processing recovery failed — continuing");
    });

  // ── Atomically claim a batch (H2) ──────────────────────────────────────────
  // SELECT … FOR UPDATE SKIP LOCKED inside a transaction, then flip to
  // "processing" + stamp processing_started_at. Concurrent instances and
  // overlapping ticks skip each other's locked rows, so no row is ever claimed
  // twice. The network call happens AFTER the transaction commits (locks are not
  // held across it).
  let claimedIds: number[] = [];
  try {
    claimedIds = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: kevinAppEventsTable.id })
        .from(kevinAppEventsTable)
        .where(
          and(
            or(
              eq(kevinAppEventsTable.status, "pending"),
              eq(kevinAppEventsTable.status, "failed"),
            ),
            or(
              isNull(kevinAppEventsTable.nextRetryAt),
              lte(kevinAppEventsTable.nextRetryAt, now),
            ),
          ),
        )
        .limit(WORKER_BATCH)
        .for("update", { skipLocked: true });

      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);

      await tx
        .update(kevinAppEventsTable)
        .set({ status: "processing", processingStartedAt: now })
        .where(inArray(kevinAppEventsTable.id, ids));

      return ids;
    });
  } catch (err) {
    logger.error({ err }, "[KevinEvents] Failed to claim events — skipping tick");
    return { processed: 0, sent: 0, failed: 0 };
  }

  if (claimedIds.length === 0) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  // ── Dispatch each event ────────────────────────────────────────────────────
  const events = await db
    .select()
    .from(kevinAppEventsTable)
    .where(inArray(kevinAppEventsTable.id, claimedIds));

  for (const event of events) {
    try {
      await sendKevinEvent({
        userIdPseudonymous: event.userIdPseudonymous,
        orgId: event.orgId ?? undefined,
        eventType: event.eventType,
        entityType: event.entityType ?? undefined,
        entityId: event.entityId ?? undefined,
        summary: event.payload as Record<string, unknown>,
        idempotencyKey: event.idempotencyKey,
        traceId: event.traceId ?? crypto.randomUUID(),
        origin: event.origin ?? "trainchat_generation",
        depth: event.depth,
      });

      await markEventSent(event.id);
      sent++;
    } catch (err) {
      // Local/config failure (not configured, circuit half-open probe rejection,
      // disabled) never reached Kevin → release the claim WITHOUT consuming the
      // retry budget. The row returns to pending for a later tick.
      const code = err instanceof KevinError ? err.code : undefined;
      if (isKevinLocalNonRetryCode(code)) {
        await releaseEventToPending(event.id).catch(() => {});
        logger.debug(
          { id: event.id, code },
          "[KevinEvents] Local failure — released without consuming retry budget",
        );
        continue;
      }

      const errorMsg = err instanceof KevinError ? err.message : String(err);
      const newAttempts = event.attempts + 1;

      if (kevinShouldDeadLetter(newAttempts)) {
        await deadLetterEvent(event.id, errorMsg);
        logger.error(
          { id: event.id, attempts: newAttempts, error: errorMsg },
          "[KevinEvents] Event dead-lettered after max attempts",
        );
      } else {
        await markEventFailed(event.id, errorMsg, newAttempts);
        logger.warn(
          { id: event.id, attempts: newAttempts, nextRetryMs: kevinNextRetryDelay(newAttempts) },
          "[KevinEvents] Event dispatch failed — will retry",
        );
      }
      failed++;
    }
  }

  return { processed: claimedIds.length, sent, failed };
}

// ─── State transitions ────────────────────────────────────────────────────────

export async function markEventSent(id: number): Promise<void> {
  await db
    .update(kevinAppEventsTable)
    .set({ status: "sent", sentAt: new Date(), lastError: null })
    .where(eq(kevinAppEventsTable.id, id));
}

export async function markEventFailed(
  id: number,
  error: string,
  attempts: number,
): Promise<void> {
  const delay = kevinNextRetryDelay(attempts);
  const nextRetryAt = new Date(Date.now() + delay);

  await db
    .update(kevinAppEventsTable)
    .set({
      status: "failed",
      attempts,
      lastError: error.slice(0, 500),
      nextRetryAt,
    })
    .where(eq(kevinAppEventsTable.id, id));
}

export async function deadLetterEvent(id: number, error: string): Promise<void> {
  await db
    .update(kevinAppEventsTable)
    .set({
      status: "dead_lettered",
      lastError: error.slice(0, 500),
      deadLetteredAt: new Date(),
    })
    .where(eq(kevinAppEventsTable.id, id));
}

/**
 * Releases a claimed event back to "pending" without consuming its retry budget.
 * Used when dispatch failed for a LOCAL reason (not configured / circuit open /
 * disabled) — the event never reached Kevin, so it is not a real failure.
 */
export async function releaseEventToPending(id: number): Promise<void> {
  await db
    .update(kevinAppEventsTable)
    .set({ status: "pending", processingStartedAt: null, nextRetryAt: new Date() })
    .where(eq(kevinAppEventsTable.id, id));
}

// ─── Queue stats (for admin diagnostics) ─────────────────────────────────────

export async function getKevinEventQueueStats(): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLettered: number;
}> {
  const rows = await db
    .select({
      status: kevinAppEventsTable.status,
    })
    .from(kevinAppEventsTable);

  const counts = { pending: 0, processing: 0, sent: 0, failed: 0, deadLettered: 0 };
  for (const r of rows) {
    if (r.status === "pending") counts.pending++;
    else if (r.status === "processing") counts.processing++;
    else if (r.status === "sent") counts.sent++;
    else if (r.status === "failed") counts.failed++;
    else if (r.status === "dead_lettered") counts.deadLettered++;
  }
  return counts;
}

// ─── Payload sanitization ─────────────────────────────────────────────────────
//
// Recursive ALLOWLIST (H5) — only these categorical/operational keys are ever
// forwarded to Kevin, at any nesting depth. Anything else (PII, health data,
// secrets, raw text, full programs, unknown future keys) is dropped. New
// legitimate event fields MUST be added here or they will be silently dropped
// (drops are logged via onDropped for visibility). Shared foundation:
// sanitizeKevinPayload — the outcome service uses the same walker.
//
// Union of the typed *Summary interfaces above plus the fields set by callers
// (program-build-service, session-feedback).
const KEVIN_EVENT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "goal_category",
  "session_duration_minutes",
  "exercise_count",
  "movement_categories",
  "generation_source",
  "kevin_context_used",
  "weekly_frequency",
  "training_style",
  "edit_type",
  "scope",
  "difficulty_score",
  "energy_score",
  "overall_sentiment",
  "substitution_reason",
  "category",
  "experience_level",
]);

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeKevinPayload(payload, {
    allow: KEVIN_EVENT_ALLOWED_KEYS,
    onDropped: (key, reason) =>
      logger.debug({ key, reason }, "[KevinEvents] Dropped non-allowlisted payload key"),
  });
}
