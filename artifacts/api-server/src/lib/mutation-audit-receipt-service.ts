/**
 * Mutation Audit Receipt Service
 *
 * Writes and queries MutationAuditReceipts — the immutable per-adjustment
 * records that prove (or disprove) every change made to a training program.
 *
 * Design rules:
 *   - writeAuditReceipt() is ALWAYS non-blocking and never throws.
 *     A write failure must not propagate into the edit pipeline.
 *   - Reads are simple and paginated — no complex joins.
 *   - before/after are delta arrays, not full snapshots.
 *   - verificationStatus is derived from editResult counters, OR passed
 *     explicitly when the mutation-verifier has run.
 */

import { db, mutationAuditReceiptsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";
import type { SystemSnapshot } from "./change-log-service";
import type { VerificationStatus } from "./mutation-verifier";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AuditReceiptSource =
  | "chat"
  | "edit_panel"
  | "quick_command"
  | "checkin"
  | "agent";

export interface WriteAuditReceiptParams {
  userId: number;
  trainingSystemId?: number;
  changeLogId?: number;
  conversationId?: string;
  userRequest: string;
  intentFamily: string;
  beforeSnapshot: SystemSnapshot;
  afterSnapshot: SystemSnapshot;
  persistedConstraints?: string[];
  verificationStatus: VerificationStatus;
  responseShown?: string | null;
  source?: AuditReceiptSource;
  focusMode?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditReceiptRow {
  id: number;
  userId: number;
  trainingSystemId: number | null;
  changeLogId: number | null;
  conversationId: string | null;
  userRequest: string;
  intentFamily: string;
  before: string[];
  after: string[];
  persistedConstraints: string[];
  verificationStatus: string;
  responseShown: string | null;
  source: string | null;
  focusMode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Snapshot delta extraction ────────────────────────────────────────────────

function extractExerciseNames(snapshot: SystemSnapshot): Set<string> {
  const names = new Set<string>();
  for (const entity of Object.values(snapshot.exercises)) {
    const name = entity?.name;
    if (typeof name === "string" && name.trim()) {
      names.add(name.trim());
    }
  }
  return names;
}

/**
 * Compute the delta between two snapshots:
 *   before = names present before but gone after (removed exercises)
 *   after  = names present after but not before (added exercises)
 */
export function computeSnapshotDelta(
  beforeSnapshot: SystemSnapshot,
  afterSnapshot: SystemSnapshot,
): { before: string[]; after: string[] } {
  const beforeNames = extractExerciseNames(beforeSnapshot);
  const afterNames = extractExerciseNames(afterSnapshot);

  return {
    before: [...beforeNames].filter((n) => !afterNames.has(n)).sort(),
    after: [...afterNames].filter((n) => !beforeNames.has(n)).sort(),
  };
}

/**
 * Derive verification status from edit result counters when the
 * mutation-verifier hasn't been explicitly run.
 */
export function deriveVerificationStatus(
  appliedCount: number,
  skippedCount: number,
): VerificationStatus {
  if (appliedCount > 0 && skippedCount === 0) return "verified";
  if (appliedCount > 0 && skippedCount > 0) return "partial";
  if (appliedCount === 0 && skippedCount > 0) return "failed";
  return "noop";
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Write a mutation audit receipt to the database.
 * Fire-and-forget — always resolves, never rejects.
 * Returns the new receipt ID, or null on failure.
 */
export async function writeAuditReceipt(
  params: WriteAuditReceiptParams,
): Promise<number | null> {
  try {
    const delta = computeSnapshotDelta(
      params.beforeSnapshot,
      params.afterSnapshot,
    );

    const [inserted] = await db
      .insert(mutationAuditReceiptsTable)
      .values({
        userId: params.userId,
        trainingSystemId: params.trainingSystemId ?? null,
        changeLogId: params.changeLogId ?? null,
        conversationId: params.conversationId ?? null,
        userRequest: params.userRequest,
        intentFamily: params.intentFamily,
        before: delta.before,
        after: delta.after,
        persistedConstraints: params.persistedConstraints ?? [],
        verificationStatus: params.verificationStatus,
        responseShown: params.responseShown ?? null,
        source: params.source ?? null,
        focusMode: params.focusMode ?? null,
        metadata: params.metadata ?? null,
      })
      .returning({ id: mutationAuditReceiptsTable.id });

    logger.debug(
      {
        receiptId: inserted?.id,
        intentFamily: params.intentFamily,
        verificationStatus: params.verificationStatus,
        before: delta.before,
        after: delta.after,
        persistedConstraints: params.persistedConstraints ?? [],
        userId: params.userId,
      },
      "[MutationAuditReceipt] Written",
    );

    return inserted?.id ?? null;
  } catch (err) {
    logger.error(
      { err, userId: params.userId, intentFamily: params.intentFamily },
      "[MutationAuditReceipt] Write failed (non-fatal)",
    );
    return null;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Get the most recent receipts for a training system, newest first.
 * Returns up to `limit` rows (default 20).
 */
export async function getReceiptsForSystem(
  trainingSystemId: number,
  limit = 20,
): Promise<AuditReceiptRow[]> {
  try {
    const rows = await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.trainingSystemId, trainingSystemId))
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit);

    return rows as AuditReceiptRow[];
  } catch (err) {
    logger.error(
      { err, trainingSystemId },
      "[MutationAuditReceipt] getReceiptsForSystem failed",
    );
    return [];
  }
}

/**
 * Get the most recent receipts for a user across all systems.
 */
export async function getReceiptsForUser(
  userId: number,
  limit = 20,
): Promise<AuditReceiptRow[]> {
  try {
    const rows = await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.userId, userId))
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit);

    return rows as AuditReceiptRow[];
  } catch (err) {
    logger.error(
      { err, userId },
      "[MutationAuditReceipt] getReceiptsForUser failed",
    );
    return [];
  }
}

/**
 * Get a single receipt by ID (for inspection / replay UI).
 */
export async function getReceiptById(
  id: number,
): Promise<AuditReceiptRow | null> {
  try {
    const [row] = await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.id, id))
      .limit(1);

    return (row as AuditReceiptRow) ?? null;
  } catch (err) {
    logger.error(
      { err, id },
      "[MutationAuditReceipt] getReceiptById failed",
    );
    return null;
  }
}

/**
 * Get only failed/noop receipts for a user — useful for surfacing
 * mutations that didn't land so the UI can offer a retry.
 */
export async function getFailedReceiptsForUser(
  userId: number,
  limit = 10,
): Promise<AuditReceiptRow[]> {
  try {
    const rows = await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(
        and(
          eq(mutationAuditReceiptsTable.userId, userId),
          // Drizzle doesn't have inArray for enum values without raw SQL,
          // so we query failed rows specifically
          eq(mutationAuditReceiptsTable.verificationStatus, "failed"),
        ),
      )
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit);

    return rows as AuditReceiptRow[];
  } catch (err) {
    logger.error(
      { err, userId },
      "[MutationAuditReceipt] getFailedReceiptsForUser failed",
    );
    return [];
  }
}
