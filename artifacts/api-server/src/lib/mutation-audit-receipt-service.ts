/**
 * Mutation Audit Receipt Service  (v2)
 *
 * Writes and queries MutationAuditReceipts — the immutable per-adjustment
 * records that prove (or disprove) every change made to a training program.
 *
 * v2 additions:
 *   - targetScope, persistenceType, mutationType (from classifier)
 *   - beforeProgramSnapshot / afterProgramSnapshot (full SystemSnapshot)
 *   - changedExercises (structured diff array)
 *   - repairAttempted flag
 *   - auditReceiptVersion field
 *
 * Design rules:
 *   - writeAuditReceipt() is ALWAYS non-blocking and never throws.
 *   - responseShown is ONLY written when verificationStatus is "verified" or "partial".
 *   - Full snapshots enable receipt-based undo without touching the change log.
 */

import { db, mutationAuditReceiptsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";
import type { SystemSnapshot } from "./change-log-service";
import type { VerificationStatus } from "./mutation-verifier";
import type { PersistenceType, MutationType } from "./adjustment-intent-classifier";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AuditReceiptSource =
  | "chat"
  | "edit_panel"
  | "quick_command"
  | "checkin"
  | "agent";

export interface ChangedExerciseEntry {
  from: string;
  to: string;
}

export interface WriteAuditReceiptParams {
  userId: number;
  trainingSystemId?: number;
  changeLogId?: number;
  conversationId?: string;

  /** Raw user message */
  userRequest: string;

  /** Normalized IntentFamily */
  intentFamily: string;

  /** Scope of the targeted entity ("exercise" | "session" | "week" | "block" | "system") */
  targetScope?: string;

  /** How long this change persists */
  persistenceType?: PersistenceType | string;

  /** Structural mutation class */
  mutationType?: MutationType | string;

  /** SystemSnapshot captured before the mutation (for delta + undo) */
  beforeSnapshot: SystemSnapshot;

  /** SystemSnapshot captured after the mutation (for verification) */
  afterSnapshot: SystemSnapshot;

  /**
   * Full SystemSnapshot for undo replay.
   * Pass the same object as beforeSnapshot — it will be stored as JSONB.
   */
  beforeProgramSnapshot?: SystemSnapshot;

  /**
   * Full SystemSnapshot post-mutation.
   */
  afterProgramSnapshot?: SystemSnapshot;

  /**
   * Structured exercise changes from the computed diff.
   */
  changedExercises?: ChangedExerciseEntry[];

  /** Constraint keys persisted to user profile */
  persistedConstraints?: string[];

  /** Outcome from the mutation verifier */
  verificationStatus: VerificationStatus;

  /**
   * Whether a repair pass was attempted after an initial verification failure.
   */
  repairAttempted?: boolean;

  /**
   * Text shown to the user.
   * Only stored when verificationStatus is "verified" or "partial".
   */
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
  targetScope: string | null;
  persistenceType: string | null;
  mutationType: string | null;
  before: string[];
  after: string[];
  changedExercises: ChangedExerciseEntry[];
  beforeProgramSnapshot: Record<string, unknown> | null;
  afterProgramSnapshot: Record<string, unknown> | null;
  persistedConstraints: string[];
  verificationStatus: string;
  repairAttempted: boolean;
  responseShown: string | null;
  source: string | null;
  focusMode: string | null;
  auditReceiptVersion: number;
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
 * Compute the exercise name delta between two snapshots:
 *   before = names present before but gone after  (removed)
 *   after  = names present after but not before   (added)
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
 * Derive a VerificationStatus from raw edit result counters.
 * Use when the mutation verifier hasn't been run explicitly.
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
 *
 * Returns { id, delta } or null on failure.
 */
export async function writeAuditReceipt(
  params: WriteAuditReceiptParams,
): Promise<{ id: number; delta: { before: string[]; after: string[] } } | null> {
  try {
    const delta = computeSnapshotDelta(
      params.beforeSnapshot,
      params.afterSnapshot,
    );

    // Only store responseShown when the mutation is confirmed to have landed
    const isConfirmed =
      params.verificationStatus === "verified" ||
      params.verificationStatus === "partial";

    const [inserted] = await db
      .insert(mutationAuditReceiptsTable)
      .values({
        userId: params.userId,
        trainingSystemId: params.trainingSystemId ?? null,
        changeLogId: params.changeLogId ?? null,
        conversationId: params.conversationId ?? null,
        userRequest: params.userRequest,
        intentFamily: params.intentFamily,
        targetScope: params.targetScope ?? null,
        persistenceType: params.persistenceType ?? null,
        mutationType: params.mutationType ?? null,
        before: delta.before,
        after: delta.after,
        changedExercises: params.changedExercises ?? [],
        beforeProgramSnapshot:
          (params.beforeProgramSnapshot ?? params.beforeSnapshot) as unknown as Record<string, unknown>,
        afterProgramSnapshot:
          (params.afterProgramSnapshot ?? params.afterSnapshot) as unknown as Record<string, unknown>,
        persistedConstraints: params.persistedConstraints ?? [],
        verificationStatus: params.verificationStatus,
        repairAttempted: params.repairAttempted ?? false,
        responseShown: isConfirmed ? (params.responseShown ?? null) : null,
        source: params.source ?? null,
        focusMode: params.focusMode ?? null,
        auditReceiptVersion: 2,
        metadata: params.metadata ?? null,
      })
      .returning({ id: mutationAuditReceiptsTable.id });

    logger.info(
      {
        receiptId: inserted?.id,
        intentFamily: params.intentFamily,
        targetScope: params.targetScope,
        persistenceType: params.persistenceType,
        mutationType: params.mutationType,
        verificationStatus: params.verificationStatus,
        repairAttempted: params.repairAttempted ?? false,
        removedCount: delta.before.length,
        addedCount: delta.after.length,
        changedExercisesCount: (params.changedExercises ?? []).length,
        userId: params.userId,
      },
      "[MutationAuditReceipt] Written",
    );

    return inserted ? { id: inserted.id, delta } : null;
  } catch (err) {
    logger.error(
      { err, userId: params.userId, intentFamily: params.intentFamily },
      "[MutationAuditReceipt] Write failed (non-fatal)",
    );
    return null;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getReceiptsForSystem(
  trainingSystemId: number,
  limit = 20,
): Promise<AuditReceiptRow[]> {
  try {
    return (await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.trainingSystemId, trainingSystemId))
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit)) as AuditReceiptRow[];
  } catch (err) {
    logger.error({ err, trainingSystemId }, "[MutationAuditReceipt] getReceiptsForSystem failed");
    return [];
  }
}

export async function getReceiptsForUser(
  userId: number,
  limit = 20,
): Promise<AuditReceiptRow[]> {
  try {
    return (await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.userId, userId))
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit)) as AuditReceiptRow[];
  } catch (err) {
    logger.error({ err, userId }, "[MutationAuditReceipt] getReceiptsForUser failed");
    return [];
  }
}

export async function getReceiptById(id: number): Promise<AuditReceiptRow | null> {
  try {
    const [row] = await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(eq(mutationAuditReceiptsTable.id, id))
      .limit(1);
    return (row as AuditReceiptRow) ?? null;
  } catch (err) {
    logger.error({ err, id }, "[MutationAuditReceipt] getReceiptById failed");
    return null;
  }
}

export async function getFailedReceiptsForUser(
  userId: number,
  limit = 10,
): Promise<AuditReceiptRow[]> {
  try {
    return (await db
      .select()
      .from(mutationAuditReceiptsTable)
      .where(
        and(
          eq(mutationAuditReceiptsTable.userId, userId),
          eq(mutationAuditReceiptsTable.verificationStatus, "failed"),
        ),
      )
      .orderBy(desc(mutationAuditReceiptsTable.createdAt))
      .limit(limit)) as AuditReceiptRow[];
  } catch (err) {
    logger.error({ err, userId }, "[MutationAuditReceipt] getFailedReceiptsForUser failed");
    return [];
  }
}
