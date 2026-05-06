/**
 * Conversation Context Resolver
 *
 * Lightweight in-memory layer that tracks short-lived conversational references
 * across turns, enabling natural follow-up messages like:
 *   - "change that exercise"
 *   - "do the same for Day 2"
 *   - "apply that to the full program"
 *   - "undo that"
 *
 * References expire after 2 turns or 5 minutes (whichever comes first).
 * Ambiguous or missing references produce a clarification question rather than
 * a silent guess.
 *
 * This module is intentionally DB-free. Context is ephemeral and lives only
 * for the duration of a short follow-up exchange within one training session.
 */

import { logger } from "./logger";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 2;
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Reference Types ──────────────────────────────────────────────────────────

export interface ExerciseReference {
  exerciseName: string;
  exerciseId: number | null;
  sessionId: number | null;
  dayIndex: number | null;
  /** "ai_response" | "user_mention" | "mutation_target" */
  source: string;
  turnsRemaining: number;
  createdAt: Date;
}

export interface SessionReference {
  sessionId: number | null;
  dayIndex: number | null;
  /** human label like "Day 1", "Upper Body", etc. */
  sessionLabel: string;
  weekNumber: number | null;
  /** "ai_response" | "user_mention" | "mutation_target" */
  source: string;
  turnsRemaining: number;
  createdAt: Date;
}

export interface MutationReference {
  /** e.g. "swap", "harder", "shorter", "remove" */
  mutationType: string;
  /** intent family string, e.g. "exercise_swap" */
  intentFamily: string | null;
  /** "exercise" | "session" | "program" */
  scope: string;
  affectedExerciseIds: number[];
  affectedSessionIds: number[];
  changeLogId: number | null;
  /** the raw user request text that produced this mutation */
  userRequest: string;
  /** human-readable summary of what was changed */
  changeSummary: string;
  turnsRemaining: number;
  createdAt: Date;
}

export interface ConversationContextState {
  lastExerciseReference: ExerciseReference | null;
  lastSessionReference: SessionReference | null;
  lastMutationReference: MutationReference | null;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const store = new Map<string, ConversationContextState>();

function getOrCreate(conversationId: string): ConversationContextState {
  if (!store.has(conversationId)) {
    store.set(conversationId, {
      lastExerciseReference: null,
      lastSessionReference: null,
      lastMutationReference: null,
    });
  }
  return store.get(conversationId)!;
}

function isExpired(ref: { turnsRemaining: number; createdAt: Date }): boolean {
  if (ref.turnsRemaining <= 0) return true;
  const ageMs = Date.now() - ref.createdAt.getTime();
  return ageMs > MAX_AGE_MS;
}

function pruneExpired(state: ConversationContextState): void {
  if (state.lastExerciseReference && isExpired(state.lastExerciseReference)) {
    logger.info(
      { exerciseName: state.lastExerciseReference.exerciseName },
      "[ConversationContext] expired — lastExerciseReference pruned"
    );
    state.lastExerciseReference = null;
  }
  if (state.lastSessionReference && isExpired(state.lastSessionReference)) {
    logger.info(
      { sessionLabel: state.lastSessionReference.sessionLabel },
      "[ConversationContext] expired — lastSessionReference pruned"
    );
    state.lastSessionReference = null;
  }
  if (state.lastMutationReference && isExpired(state.lastMutationReference)) {
    logger.info(
      { mutationType: state.lastMutationReference.mutationType },
      "[ConversationContext] expired — lastMutationReference pruned"
    );
    state.lastMutationReference = null;
  }
}

// ─── Deictic Phrase Patterns ──────────────────────────────────────────────────

/**
 * Detects whether the message contains a deictic exercise reference.
 * "that exercise", "this exercise", "it", "that movement", "this movement"
 */
function hasExerciseDeictic(lower: string): boolean {
  return /\b(that|this)\s+(exercise|movement|lift|drill|one)\b/.test(lower)
    || /\bit\b/.test(lower);
}

/**
 * Detects whether the message contains a deictic session reference.
 * "that day", "this day", "that session", "this session", "there"
 */
function hasSessionDeictic(lower: string): boolean {
  return /\b(that|this)\s+(day|session|workout|block)\b/.test(lower)
    || /\bthere\b/.test(lower);
}

/**
 * Detects whether the message contains a mutation carryover phrase.
 * "do the same", "apply that", "same thing", "undo that",
 * "make the rest like that", "apply it to the full program"
 */
function hasMutationDeictic(lower: string): boolean {
  return /\bdo\s+the\s+same\b/.test(lower)
    || /\bapply\s+(that|it)\b/.test(lower)
    || /\bsame\s+(thing|change|edit|modification|adjustment)\b/.test(lower)
    || /\bundo\s+(that|it|the\s+last)\b/.test(lower)
    || /\bmake\s+the\s+rest\s+like\s+that\b/.test(lower)
    || /\bapply\s+it\s+to\s+(the\s+)?(full|whole|entire|all)\s+(program|sessions?)\b/.test(lower);
}

/**
 * Check if message is asking about undo specifically.
 */
function isUndoRequest(lower: string): boolean {
  return /\bundo\s+(that|it|the\s+last|the\s+change)\b/.test(lower)
    || /\brevert\s+(that|it|the\s+last|the\s+change)\b/.test(lower);
}

/**
 * Check if message is asking to apply mutation to full program.
 */
function isApplyProgramWideRequest(lower: string): boolean {
  return /\bapply\s+(that|it)\s+to\s+(the\s+)?(full|whole|entire|all)\s+(program|sessions?)\b/.test(lower)
    || /\bmake\s+(the\s+)?(rest|all|everything)\s+(like\s+that|the\s+same)\b/.test(lower)
    || /\bdo\s+(the\s+)?same\s+for\s+(the\s+)?(whole|full|entire|all)\s+(program|sessions?)\b/.test(lower);
}

/**
 * Check if message is asking to apply the same thing to a different target (day/exercise).
 */
function isDoSameForTargetRequest(lower: string): boolean {
  return /\b(do\s+the\s+same|apply\s+that|same\s+(thing|change))\s+(for|to|on)\s+/i.test(lower);
}

/**
 * Extract a target day/session from a "do the same for Day X" style message.
 * Returns the raw target string or null.
 */
function extractTargetFromDoSame(lower: string): string | null {
  // "do the same for day 2" / "apply that to day 3"
  const match = lower.match(
    /(?:do\s+the\s+same|apply\s+that|same\s+(?:thing|change))\s+(?:for|to|on)\s+(.+)/
  );
  if (match) return match[1].trim();
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called at the start of each conversation turn to decrement turn counters
 * and prune expired references.
 */
export function tickConversationTurn(conversationId: string): void {
  const state = store.get(conversationId);
  if (!state) return;

  if (state.lastExerciseReference) state.lastExerciseReference.turnsRemaining -= 1;
  if (state.lastSessionReference) state.lastSessionReference.turnsRemaining -= 1;
  if (state.lastMutationReference) state.lastMutationReference.turnsRemaining -= 1;

  pruneExpired(state);
}

/**
 * Store a resolved exercise reference after a turn that mentioned or mutated an exercise.
 */
export function storeExerciseReference(
  conversationId: string,
  ref: Omit<ExerciseReference, "turnsRemaining" | "createdAt">
): void {
  const state = getOrCreate(conversationId);
  state.lastExerciseReference = {
    ...ref,
    turnsRemaining: MAX_TURNS,
    createdAt: new Date(),
  };
  logger.info(
    { conversationId, exerciseName: ref.exerciseName, source: ref.source },
    "[ConversationContext] stored — lastExerciseReference"
  );
}

/**
 * Store a resolved session reference after a turn that mentioned or mutated a session.
 */
export function storeSessionReference(
  conversationId: string,
  ref: Omit<SessionReference, "turnsRemaining" | "createdAt">
): void {
  const state = getOrCreate(conversationId);
  state.lastSessionReference = {
    ...ref,
    turnsRemaining: MAX_TURNS,
    createdAt: new Date(),
  };
  logger.info(
    { conversationId, sessionLabel: ref.sessionLabel, source: ref.source },
    "[ConversationContext] stored — lastSessionReference"
  );
}

/**
 * Store a mutation reference after a successful mutation turn.
 */
export function storeMutationReference(
  conversationId: string,
  ref: Omit<MutationReference, "turnsRemaining" | "createdAt">
): void {
  const state = getOrCreate(conversationId);
  state.lastMutationReference = {
    ...ref,
    turnsRemaining: MAX_TURNS,
    createdAt: new Date(),
  };
  logger.info(
    {
      conversationId,
      mutationType: ref.mutationType,
      scope: ref.scope,
      changeLogId: ref.changeLogId,
    },
    "[ConversationContext] stored — lastMutationReference"
  );
}

/**
 * Returns the current context state without mutation. Useful for testing/inspection.
 */
export function getConversationContext(conversationId: string): ConversationContextState | null {
  const state = store.get(conversationId);
  if (!state) return null;
  pruneExpired(state);
  return state;
}

/**
 * Clear all context for a conversation. Call when a new build session starts.
 */
export function clearConversationContext(conversationId: string): void {
  store.delete(conversationId);
  logger.info({ conversationId }, "[ConversationContext] cleared — new build session");
}

// ─── Resolution Result ────────────────────────────────────────────────────────

export type ContextResolutionResult =
  | { resolved: true; resolvedMessage: string; resolution: string }
  | { resolved: false; ambiguous: true; clarificationQuestion: string; resolution: string }
  | { resolved: false; ambiguous: false; resolution: string };

/**
 * Attempt to resolve deictic references in a user message using stored context.
 *
 * If a reference is found and unambiguous, returns a rewritten message.
 * If the reference is ambiguous or missing, returns a clarification question.
 * If no deictic references are present, returns resolved: false, ambiguous: false.
 *
 * @param conversationId - the active conversation
 * @param message - the raw user message
 * @param activeSystemId - optional: the active training system ID (used to validate context belongs to same system)
 */
export function resolveContextualMessage(
  conversationId: string,
  message: string,
  activeSystemId?: number | null
): ContextResolutionResult {
  const lower = message.toLowerCase().trim();
  const state = store.get(conversationId);

  if (state) pruneExpired(state);

  const hasMutation = hasMutationDeictic(lower);
  const hasExercise = hasExerciseDeictic(lower);
  const hasSession = hasSessionDeictic(lower);

  // If no deictic phrases at all, pass through unchanged
  if (!hasMutation && !hasExercise && !hasSession) {
    return { resolved: false, ambiguous: false, resolution: "no_deictic_phrase" };
  }

  // ── Mutation carryover resolution (highest priority) ──────────────────────

  if (hasMutation) {
    const mutRef = state?.lastMutationReference ?? null;

    // Undo request
    if (isUndoRequest(lower)) {
      if (!mutRef) {
        logger.info({ conversationId }, "[ConversationContext] ambiguous — undo requested but no mutation reference");
        return {
          resolved: false,
          ambiguous: true,
          clarificationQuestion: "Which change would you like to undo? I don't have a recent edit on record — could you describe what you'd like reverted?",
          resolution: "undo_no_mutation_ref",
        };
      }

      const resolvedMessage = `Undo the last change and restore the program to its previous state. The last change was: "${mutRef.changeSummary}". Restore from changeLogId ${mutRef.changeLogId ?? "last"}.`;
      logger.info(
        { conversationId, changeLogId: mutRef.changeLogId, changeSummary: mutRef.changeSummary },
        "[ConversationContext] resolved — undo rewritten from lastMutationReference"
      );
      return { resolved: true, resolvedMessage, resolution: "undo_from_mutation_ref" };
    }

    // Apply to full program
    if (isApplyProgramWideRequest(lower)) {
      if (!mutRef) {
        logger.info({ conversationId }, "[ConversationContext] ambiguous — apply program-wide but no mutation reference");
        return {
          resolved: false,
          ambiguous: true,
          clarificationQuestion: "Which change would you like applied to the full program? Could you describe it again so I can apply it everywhere?",
          resolution: "apply_programwide_no_mutation_ref",
        };
      }

      const resolvedMessage = `${mutRef.userRequest} — apply this change across the entire program (all sessions, all days, program-wide)`;
      logger.info(
        { conversationId, originalRequest: mutRef.userRequest },
        "[ConversationContext] resolved — apply program-wide rewritten from lastMutationReference"
      );
      return { resolved: true, resolvedMessage, resolution: "apply_programwide_from_mutation_ref" };
    }

    // Do the same for a specific target (e.g. "do the same for Day 2")
    if (isDoSameForTargetRequest(lower)) {
      if (!mutRef) {
        logger.info({ conversationId }, "[ConversationContext] ambiguous — do same for target but no mutation reference");
        return {
          resolved: false,
          ambiguous: true,
          clarificationQuestion: "What change would you like me to repeat? I don't have a recent edit on record — could you describe it again?",
          resolution: "do_same_no_mutation_ref",
        };
      }

      let target = extractTargetFromDoSame(lower);
      if (!target) {
        return {
          resolved: false,
          ambiguous: true,
          clarificationQuestion: "Which day or session would you like me to apply the same change to?",
          resolution: "do_same_no_target",
        };
      }

      // If the extracted target itself contains a session deictic, resolve it using the stored ref.
      // e.g. "apply that to this session too" → target="this session too" → resolve to "Day 2"
      const sessionRef = state?.lastSessionReference ?? null;
      if (sessionRef && /\b(this|that)\s+(session|day|workout)\b/i.test(target)) {
        target = target.replace(/\b(this|that)\s+(session|day|workout)\b/gi, sessionRef.sessionLabel);
      }

      // Rewrite: replace the session reference in the original request with the new target
      // Strategy: if the original request has a day/session mention, swap it; otherwise append
      const originalReq = mutRef.userRequest;
      const dayPattern = /\b(day\s*\d+|session\s*\d+|week\s*\d+|the\s+\w+\s+session)\b/i;
      const resolvedMessage = dayPattern.test(originalReq)
        ? originalReq.replace(dayPattern, target)
        : `${originalReq} — apply this to ${target}`;

      logger.info(
        { conversationId, originalRequest: originalReq, target, resolvedMessage },
        "[ConversationContext] resolved — do same for target rewritten from lastMutationReference"
      );
      return { resolved: true, resolvedMessage, resolution: "do_same_for_target" };
    }

    // Generic "apply that" / "same thing" without a clear direction
    if (/\b(apply\s+that|same\s+(thing|change|edit|modification))\b/.test(lower) && !isDoSameForTargetRequest(lower)) {
      // Check if there's a session reference in the CURRENT message
      const sessionRef = state?.lastSessionReference ?? null;
      const exerciseRef = state?.lastExerciseReference ?? null;

      if (!mutRef) {
        logger.info({ conversationId }, "[ConversationContext] ambiguous — generic apply that but no mutation reference");
        return {
          resolved: false,
          ambiguous: true,
          clarificationQuestion: "Which change would you like me to apply? Could you describe it again, or tell me what you'd like changed?",
          resolution: "apply_that_no_mutation_ref",
        };
      }

      // Derive scope from what we know
      if (sessionRef) {
        const resolvedMessage = `${mutRef.userRequest} — apply this to ${sessionRef.sessionLabel}`;
        logger.info(
          { conversationId, originalRequest: mutRef.userRequest, target: sessionRef.sessionLabel },
          "[ConversationContext] resolved — apply that to last session reference"
        );
        return { resolved: true, resolvedMessage, resolution: "apply_that_to_session_ref" };
      }

      if (exerciseRef) {
        const resolvedMessage = `${mutRef.userRequest} — apply this to ${exerciseRef.exerciseName}`;
        logger.info(
          { conversationId, originalRequest: mutRef.userRequest, target: exerciseRef.exerciseName },
          "[ConversationContext] resolved — apply that to last exercise reference"
        );
        return { resolved: true, resolvedMessage, resolution: "apply_that_to_exercise_ref" };
      }

      // No context to resolve against
      logger.info({ conversationId }, "[ConversationContext] ambiguous — apply that with no session or exercise reference");
      return {
        resolved: false,
        ambiguous: true,
        clarificationQuestion: "Apply that to which day or exercise? You can say something like 'Day 2' or 'the squats on Day 1'.",
        resolution: "apply_that_ambiguous_target",
      };
    }
  }

  // ── Exercise deictic resolution ───────────────────────────────────────────

  if (hasExercise && !hasMutation) {
    const exerciseRef = state?.lastExerciseReference ?? null;

    // "it" alone is too ambiguous — only resolve when we have high confidence
    const isItOnly = /^\s*(change|swap|replace|remove|make)\s+(it)\b/i.test(lower)
      && !/(that|this)\s+(exercise|movement|lift)/.test(lower);

    if (isItOnly && !exerciseRef) {
      logger.info({ conversationId }, "[ConversationContext] ambiguous — 'it' with no exercise reference");
      return {
        resolved: false,
        ambiguous: true,
        clarificationQuestion: "Which exercise did you mean? You can name it directly or say something like 'the first exercise on Day 1'.",
        resolution: "it_no_exercise_ref",
      };
    }

    if (!exerciseRef) {
      // No reference stored — pass through (intent system will handle it)
      return { resolved: false, ambiguous: false, resolution: "no_exercise_ref" };
    }

    // Rewrite: replace "that exercise", "this exercise", "that movement", "this movement"
    // and isolated "it" (when after a verb) with the actual exercise name.
    let resolvedMessage = message
      .replace(/\b(that|this)\s+(exercise|movement|lift|drill)\b/gi, exerciseRef.exerciseName)
      .replace(/\b(change|swap|replace|remove|make|adjust)\s+it\b/gi, `$1 ${exerciseRef.exerciseName}`);

    if (resolvedMessage === message) {
      // Nothing changed — the deictic phrase wasn't in a form we could substitute
      return { resolved: false, ambiguous: false, resolution: "exercise_deictic_unmatched" };
    }

    // Append session context if we know which day this exercise is on
    if (exerciseRef.sessionId && !resolvedMessage.toLowerCase().includes("day")) {
      if (exerciseRef.dayIndex != null) {
        resolvedMessage += ` (on Day ${exerciseRef.dayIndex + 1})`;
      }
    }

    logger.info(
      {
        conversationId,
        original: message.slice(0, 80),
        resolved: resolvedMessage.slice(0, 80),
        exerciseName: exerciseRef.exerciseName,
      },
      "[ConversationContext] resolved — exercise deictic rewritten"
    );
    return { resolved: true, resolvedMessage, resolution: "exercise_deictic" };
  }

  // ── Session deictic resolution ─────────────────────────────────────────────

  if (hasSession && !hasMutation && !hasExercise) {
    const sessionRef = state?.lastSessionReference ?? null;

    if (!sessionRef) {
      // No reference stored — pass through
      return { resolved: false, ambiguous: false, resolution: "no_session_ref" };
    }

    // Rewrite: replace "that day", "this day", "that session", "this session"
    let resolvedMessage = message
      .replace(/\b(that|this)\s+(day|session|workout|block)\b/gi, sessionRef.sessionLabel);

    if (resolvedMessage === message) {
      return { resolved: false, ambiguous: false, resolution: "session_deictic_unmatched" };
    }

    logger.info(
      {
        conversationId,
        original: message.slice(0, 80),
        resolved: resolvedMessage.slice(0, 80),
        sessionLabel: sessionRef.sessionLabel,
      },
      "[ConversationContext] resolved — session deictic rewritten"
    );
    return { resolved: true, resolvedMessage, resolution: "session_deictic" };
  }

  // ── Fallback: has deictic but could not resolve ────────────────────────────
  return { resolved: false, ambiguous: false, resolution: "no_ref_available" };
}

/**
 * Infer an exercise reference from a successful mutation result.
 * Extracts the most relevant exercise touched by the mutation.
 */
export function inferExerciseReferenceFromMutation(opts: {
  conversationId: string;
  userRequest: string;
  changeTargets: Array<{ type: string; originalExercise?: string | null; newExercise?: string | null; exerciseId?: number | null; sessionId?: number | null }>;
  intentFamily: string | null;
}): void {
  const { changeTargets, conversationId, intentFamily } = opts;

  // Prefer swap targets — they have the clearest exercise identity
  const swapTarget = changeTargets.find((t) => t.type === "exercise_swap");
  const firstTarget = changeTargets[0];
  const target = swapTarget ?? firstTarget;

  if (!target) return;

  const exerciseName = target.newExercise ?? target.originalExercise;
  if (!exerciseName) return;

  storeExerciseReference(conversationId, {
    exerciseName,
    exerciseId: target.exerciseId ?? null,
    sessionId: target.sessionId ?? null,
    dayIndex: null,
    source: "mutation_target",
  });
}

/**
 * Infer a session reference from a resolved edit scope.
 */
export function inferSessionReferenceFromMutation(opts: {
  conversationId: string;
  sessionId: number | null;
  dayIndex: number | null;
  sessionLabel: string;
  weekNumber: number | null;
}): void {
  const { conversationId, ...ref } = opts;
  storeSessionReference(conversationId, {
    ...ref,
    source: "mutation_target",
  });
}
