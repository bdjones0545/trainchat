/**
 * Pending Clarification Service
 *
 * Manages the lifecycle of pending clarification records that persist
 * unresolved mutation state across conversation turns.
 *
 * When the system asks a clarification question during a refinement/edit
 * flow (e.g. "Should this apply to Day 1 or program-wide?"), a pending
 * clarification record is written to the DB BEFORE the response is returned.
 *
 * On the next turn, the system reads this record first. If the user's
 * reply looks like a resolution (e.g. "Day 1"), the message is classified
 * as CLARIFICATION_FOLLOWUP and routed directly to the pending mutation
 * executor instead of being re-classified from scratch.
 */

import { db, pendingClarificationsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { logger } from "./logger";

export type PendingAspect =
  | "scope"
  | "target_day"
  | "target_session"
  | "target_exercise"
  | "phase_or_block"
  | "confirmation";

export interface WritePendingClarificationInput {
  conversationId: number;
  userId: number;
  targetProgramId?: number | null;
  targetSessionId?: number | null;
  originalRequest: string;
  intentFamily: string;
  pendingAspect: PendingAspect;
  partialEditPlan?: Record<string, unknown> | null;
  clarificationQuestion: string;
  editSubtype?: string | null;
  editIntent?: string | null;
  expiresAfterTurns?: number;
}

/**
 * Write a new pending clarification record for a conversation.
 * Clears any existing active record first — only one can be active at a time.
 */
export async function writePendingClarification(
  input: WritePendingClarificationInput
): Promise<number> {
  // Clear any existing active record for this conversation
  await db
    .update(pendingClarificationsTable)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(pendingClarificationsTable.conversationId, input.conversationId),
        isNull(pendingClarificationsTable.resolvedAt)
      )
    );

  const [record] = await db
    .insert(pendingClarificationsTable)
    .values({
      conversationId: input.conversationId,
      userId: input.userId,
      targetProgramId: input.targetProgramId ?? null,
      targetSessionId: input.targetSessionId ?? null,
      originalRequest: input.originalRequest,
      intentFamily: input.intentFamily,
      pendingAspect: input.pendingAspect,
      partialEditPlan: input.partialEditPlan
        ? JSON.stringify(input.partialEditPlan)
        : null,
      clarificationQuestion: input.clarificationQuestion,
      editSubtype: input.editSubtype ?? null,
      editIntent: input.editIntent ?? null,
      turnsRemaining: input.expiresAfterTurns ?? 2,
    })
    .returning();

  logger.info(
    {
      pendingId: record.id,
      conversationId: input.conversationId,
      originalRequest: input.originalRequest.slice(0, 80),
      intentFamily: input.intentFamily,
      pendingAspect: input.pendingAspect,
      targetProgramId: input.targetProgramId ?? null,
      editSubtype: input.editSubtype ?? null,
      clarificationQuestion: input.clarificationQuestion.slice(0, 100),
    },
    "[PendingClarification] Created pending clarification record"
  );

  return record.id;
}

/**
 * Get the active (unresolved, non-expired) pending clarification for a conversation.
 * Returns null if none exists or if it has expired.
 */
export async function getActivePendingClarification(conversationId: number) {
  const [record] = await db
    .select()
    .from(pendingClarificationsTable)
    .where(
      and(
        eq(pendingClarificationsTable.conversationId, conversationId),
        isNull(pendingClarificationsTable.resolvedAt)
      )
    )
    .orderBy(desc(pendingClarificationsTable.createdAt))
    .limit(1);

  if (!record) return null;

  if (record.turnsRemaining <= 0) {
    await resolvePendingClarification(record.id, "expired");
    logger.info(
      { pendingId: record.id, conversationId },
      "[PendingClarification] Expired — no turns remaining"
    );
    return null;
  }

  return record;
}

/**
 * Mark a pending clarification as resolved.
 */
export async function resolvePendingClarification(
  id: number,
  reason: string = "resolved"
): Promise<void> {
  await db
    .update(pendingClarificationsTable)
    .set({ resolvedAt: new Date() })
    .where(eq(pendingClarificationsTable.id, id));

  logger.info({ pendingId: id, reason }, "[PendingClarification] Resolved");
}

/**
 * Clear all active pending clarifications for a conversation.
 * Called when the user starts a new topic or build session.
 */
export async function clearPendingClarificationsForConversation(
  conversationId: number
): Promise<void> {
  await db
    .update(pendingClarificationsTable)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(pendingClarificationsTable.conversationId, conversationId),
        isNull(pendingClarificationsTable.resolvedAt)
      )
    );

  logger.info(
    { conversationId },
    "[PendingClarification] Cleared all active records for conversation"
  );
}

/**
 * Decrement the turns remaining counter for a pending clarification.
 * When it reaches 0, the record is automatically resolved as expired.
 */
export async function decrementTurnsRemaining(id: number): Promise<void> {
  const [record] = await db
    .select({ turnsRemaining: pendingClarificationsTable.turnsRemaining })
    .from(pendingClarificationsTable)
    .where(eq(pendingClarificationsTable.id, id))
    .limit(1);

  if (!record) return;

  const newCount = record.turnsRemaining - 1;
  await db
    .update(pendingClarificationsTable)
    .set({ turnsRemaining: newCount })
    .where(eq(pendingClarificationsTable.id, id));

  if (newCount <= 0) {
    await resolvePendingClarification(id, "expired_by_turns");
  }

  logger.info(
    { pendingId: id, newTurnsRemaining: newCount },
    "[PendingClarification] Decremented turns remaining"
  );
}

/**
 * Detect whether a user message is likely a clarification answer
 * rather than a new independent intent.
 *
 * Intentionally permissive — short answers, day references, scope words,
 * exercise names, and affirmations all qualify.
 */
export function looksLikeClarificationAnswer(message: string): boolean {
  const lower = message.toLowerCase().trim();

  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  // Very short message (≤6 words) — strong signal it's a direct answer
  if (wordCount <= 6) return true;

  // Day / session / week reference
  if (/\b(day\s*\d+|session\s*\d+|week\s*\d+)\b/i.test(lower)) return true;

  // Scope words
  if (
    /\b(program.?wide|whole program|all sessions?|every session|across (all|the)|throughout (the )?program)\b/i.test(
      lower
    )
  )
    return true;

  // "This/that" session/day/one
  if (
    /\b(this|that)\s+(one|session|day|workout|block|phase)\b/i.test(lower)
  )
    return true;

  // Body-part session labels (answering "which session?")
  if (
    /\b(upper|lower|push|pull|legs?)\s+(day|session|body)\b/i.test(lower)
  )
    return true;

  // Yes/confirmation
  if (
    /^\s*(yes|yeah|yep|sure|correct|that.s right|sounds good|exactly|go for it|do it|go ahead|please|yep go ahead)\s*$/i.test(
      lower
    )
  )
    return true;

  return false;
}

/**
 * Build the reconstructed edit request by merging the original request
 * with the user's clarification answer.
 *
 * This combined string is fed back into the vibe edit pipeline as if
 * the user had written it as a single message originally.
 */
export function buildReconstructedRequest(
  originalRequest: string,
  userReply: string,
  pendingAspect: string
): string {
  const trimmedReply = userReply.trim();

  switch (pendingAspect) {
    case "scope": {
      if (
        /\b(program.?wide|whole program|all sessions?|every session|across|throughout)\b/i.test(
          trimmedReply
        )
      ) {
        return `${originalRequest} — apply this change across the entire program (program-wide, all sessions)`;
      }
      if (/\b(day\s*\d+|session\s*\d+)\b/i.test(trimmedReply)) {
        return `${originalRequest} — apply this change specifically to ${trimmedReply}`;
      }
      if (/\b(block|phase|this block|this phase|current block)\b/i.test(trimmedReply)) {
        return `${originalRequest} — apply this change to the current block or phase`;
      }
      return `${originalRequest} — apply this change to: ${trimmedReply}`;
    }

    case "target_day":
      return `${originalRequest} — target day/session: ${trimmedReply}`;

    case "target_session":
      return `${originalRequest} — session: ${trimmedReply}`;

    case "target_exercise":
      return `${originalRequest} — exercise target: ${trimmedReply}`;

    case "phase_or_block":
      return `${originalRequest} — scope: ${trimmedReply}`;

    case "confirmation":
      return originalRequest;

    default:
      return `${originalRequest} — clarification: ${trimmedReply}`;
  }
}
