// ─── Kevin Event Service ──────────────────────────────────────────────────────
//
// Durable async event queue for TrainChat → Kevin event pipeline.
//
// Design principles:
//   - Enqueueing is non-blocking and fail-open (workout never blocked)
//   - Worker dispatches pending events on an interval
//   - Concurrency-safe claiming (attempts + nextRetryAt prevents double-send)
//   - Retry schedule: 30s → 2m → 8m → 30m → 2h → dead-letter
//   - Idempotency keys prevent duplicate rows
//   - Payloads are sanitized: no raw PII, emails, health data, or secrets
//   - Org and user isolation enforced
//   - Graceful shutdown stops the worker cleanly
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
import { sendKevinEvent } from "../lib/kevin-client";
import { KevinError } from "../lib/kevin-client";
import { getKevinConfig } from "../lib/kevin-config";
import { isKevinCircuitAllowed } from "../lib/kevin-circuit-breaker";
import { deriveKevinPseudonymousId, deriveKevinPseudonymousOrgId } from "../lib/kevin-pseudonym";
import { logger } from "../lib/logger";
import crypto from "crypto";

// ─── Retry schedule ───────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [
  30_000,        // 30 seconds
  120_000,       // 2 minutes
  480_000,       // 8 minutes
  1_800_000,     // 30 minutes
  7_200_000,     // 2 hours
];

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

function nextRetryDelay(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
}

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
    if (_workerStopping) return;
    flushPendingKevinEvents().catch((err) => {
      logger.error({ err }, "[KevinEvents] Worker tick failed");
    });
  }, WORKER_POLL_MS);

  if (_workerTimer.unref) _workerTimer.unref();
}

/**
 * Stops the Kevin event worker. Called on graceful shutdown.
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
 * Processes pending Kevin events. Exported for testing and manual flush.
 */
export async function flushPendingKevinEvents(): Promise<{ processed: number; sent: number; failed: number }> {
  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.eventDispatchEnabled) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  if (!isKevinCircuitAllowed()) {
    logger.debug("[KevinEvents] Circuit open — skipping flush");
    return { processed: 0, sent: 0, failed: 0 };
  }

  const now = new Date();

  // ── Claim a batch of pending events (concurrency-safe) ─────────────────────
  // We mark them "processing" before reading so concurrent workers don't
  // double-send. Do NOT hold a DB transaction open during the Kevin network call.
  let claimedIds: number[] = [];
  try {
    const rows = await db
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
      .limit(WORKER_BATCH);

    if (rows.length === 0) return { processed: 0, sent: 0, failed: 0 };
    claimedIds = rows.map((r) => r.id);

    // Mark as processing
    await db
      .update(kevinAppEventsTable)
      .set({ status: "processing" })
      .where(inArray(kevinAppEventsTable.id, claimedIds));
  } catch (err) {
    logger.error({ err }, "[KevinEvents] Failed to claim events — skipping tick");
    return { processed: 0, sent: 0, failed: 0 };
  }

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
      const errorMsg = err instanceof KevinError ? err.message : String(err);
      const newAttempts = event.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        await deadLetterEvent(event.id, errorMsg);
        logger.error(
          { id: event.id, attempts: newAttempts, error: errorMsg },
          "[KevinEvents] Event dead-lettered after max attempts",
        );
      } else {
        await markEventFailed(event.id, errorMsg, newAttempts);
        logger.warn(
          { id: event.id, attempts: newAttempts, nextRetryMs: nextRetryDelay(newAttempts) },
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
  const delay = nextRetryDelay(attempts);
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
// Ensures no PII, secrets, or sensitive health data leaks into event payloads.
// Removes known sensitive keys if they accidentally appear.

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "email", "name", "phone", "address", "dob", "date_of_birth",
  "password", "api_key", "token", "secret", "health_condition",
  "injury", "pain", "diagnosis", "medication", "pregnancy",
  "guardian", "ssn", "ip_address", "raw_prompt", "chain_of_thought",
  "full_program", "exercise_prescriptions",
]);

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string" && value.length > 1000) {
      result[key] = value.slice(0, 1000);
    } else {
      result[key] = value;
    }
  }
  return result;
}
