/**
 * StreamingResponseService — Phase 2 extraction
 *
 * Centralises SSE event payload construction for the conversations SSE route.
 * This module is a pure payload builder — it NEVER writes to res directly.
 * Streaming responsibility (calling res.write / res.end) remains in the route.
 *
 * Responsibilities:
 *   - buildCompleteEvent   — assembles the typed "complete" SSE object
 *   - buildSseErrorPayload — structured error payload (emitted before stream close)
 *
 * Future extraction target:
 *   Wrap in a class that receives (emit, done, res) and exposes emitStage(),
 *   emitError(), emitComplete() — eliminating direct res manipulation from
 *   conversations.ts entirely.
 */

// ── Minimal shared message shape ──────────────────────────────────────────────

export interface SseMessageShape {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
  structuredData: string | null;
}

// ── buildCompleteEvent ────────────────────────────────────────────────────────
// Extracted verbatim from the inline function defined inside the SSE handler.
// Accepts the same opts shape — callers need no changes beyond the import swap.

export interface BuildCompleteEventOpts {
  userMsg: SseMessageShape;
  assistantMsg: SseMessageShape;
  planInfoVal: { plan: string; messagesRemaining: number | null } | null | undefined;
  intentResultVal: { type: string; confidence: string | number; editSubtype?: string | null };
  systemSavedVal: boolean;
  systemIdVal?: number;
  systemEditVal?: { applied: boolean; changeSummary?: string; systemId?: number };
  changeLogIdVal?: number;
  outcomeTypeVal?: "mutation_applied" | "clarification_needed" | "conversation_only" | "true_failure";
  auditReceiptVal?: unknown;
  /** Global mutation outcome from finalizeMutationOutcome() — present on shouldMutate=true paths. */
  mutationOutcomeVal?: unknown | null;
  /**
   * The saved program payload from the DB-write path.
   * Present when systemSavedVal=true so the panel can update immediately
   * without a separate refetch round-trip.
   */
  savedProgramVal?: unknown | null;
}

export function buildCompleteEvent(opts: BuildCompleteEventOpts) {
  const outcomeType: "mutation_applied" | "clarification_needed" | "conversation_only" | "true_failure" =
    opts.outcomeTypeVal ?? "conversation_only";
  return {
    type: "complete" as const,
    outcomeType,
    userMessage: {
      id: opts.userMsg.id,
      conversationId: opts.userMsg.conversationId,
      role: opts.userMsg.role,
      content: opts.userMsg.content,
      createdAt: opts.userMsg.createdAt.toISOString(),
      structuredData: null,
    },
    assistantMessage: {
      id: opts.assistantMsg.id,
      conversationId: opts.assistantMsg.conversationId,
      role: opts.assistantMsg.role,
      content: opts.assistantMsg.content,
      createdAt: opts.assistantMsg.createdAt.toISOString(),
      structuredData: opts.assistantMsg.structuredData ?? null,
    },
    planInfo: opts.planInfoVal
      ? { plan: opts.planInfoVal.plan, messagesRemaining: opts.planInfoVal.messagesRemaining }
      : null,
    intentDebug: {
      type: opts.intentResultVal.type,
      confidence: opts.intentResultVal.confidence,
      editSubtype: opts.intentResultVal.editSubtype ?? null,
    },
    systemSaved: opts.systemSavedVal,
    systemId: opts.systemIdVal,
    systemEdit: opts.systemEditVal,
    changeLogId: opts.changeLogIdVal,
    auditReceipt: opts.auditReceiptVal ?? null,
    mutationOutcome: opts.mutationOutcomeVal ?? null,
    savedProgram: opts.savedProgramVal ?? null,
  };
}

// ── buildSseErrorPayload ──────────────────────────────────────────────────────
// Structured error emitted before closing the SSE stream on fatal failures.
// The frontend StreamErrorEvent handler reads these fields.

export interface SseErrorPayload {
  type: "error";
  message: string;
  code: string;
  status?: number;
  isAnonymous?: boolean;
}

export function buildSseErrorPayload(
  message: string,
  code: string,
  status?: number,
  isAnonymous?: boolean,
): SseErrorPayload {
  const payload: SseErrorPayload = { type: "error", message, code };
  if (status !== undefined) payload.status = status;
  if (isAnonymous !== undefined) payload.isAnonymous = isAnonymous;
  return payload;
}
