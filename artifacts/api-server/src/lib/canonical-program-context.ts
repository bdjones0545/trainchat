/**
 * Canonical Program Context Resolver — Phase 2
 *
 * Provides a single authoritative function for resolving "what program does this
 * user currently have?" across all call sites in the API layer.
 *
 * ── Resolution order (most to least authoritative) ───────────────────────────
 *   1. DB active system  — getActiveTrainingSystem() / getFullTrainingSystem()
 *      → the single source of truth for any saved program
 *   2. Message-history JSON — last assistantMessage with valid structuredData.days
 *      → only valid on first-build turns (no system exists yet) or legacy data
 *
 * ── Why this matters ─────────────────────────────────────────────────────────
 *   conversations.ts used to fall back to message-history JSON on mutation paths
 *   even when a DB system existed.  This caused stale JSON to win over the live
 *   DB state, silently applying edits to a ghost copy of the program.
 *
 *   The rule is:
 *     • edit/mutation paths MUST load from DB if a system exists
 *     • message-history JSON is ONLY for first-build turns or read-only display
 *
 * TODO (Phase 3): Replace all direct calls to resolveCurrentProgram() in
 * conversations.ts with resolveCanonicalProgramContext() so that every path
 * carries a canonical source label and the ghost-program risk is eliminated.
 */

import { getActiveTrainingSystem, getFullTrainingSystem, dbSystemToProgramStructure } from "./training-system-service";
import type { ProgramStructure } from "./ai";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProgramContextSource = "db_active_system" | "message_history" | "none";

export interface CanonicalProgramContext {
  /** The resolved program, or null when no program exists. */
  program: ProgramStructure | null;
  /** Where the program came from — important for logging and validation decisions. */
  source: ProgramContextSource;
  /** The active system ID if a DB system was found. */
  activeSystemId: number | null;
}

// ── resolveCanonicalProgramContext ────────────────────────────────────────────

/**
 * Resolve the canonical program context for a user/conversation turn.
 *
 * @param userId       — authenticated user ID
 * @param focusMode    — active focus lane (e.g. "strength", "speed")
 * @param historyFallback — message history array for the message-history fallback.
 *                          Pass null to skip fallback entirely (e.g. mutation paths).
 */
export async function resolveCanonicalProgramContext(
  userId: number,
  focusMode?: string,
  historyFallback?: Array<{ role: string; structuredData?: string | null }> | null,
): Promise<CanonicalProgramContext> {
  // Priority 1: DB active system
  const activeSystem = await getActiveTrainingSystem(userId, focusMode).catch(() => null);
  if (activeSystem) {
    const fullSystem = await getFullTrainingSystem(activeSystem.id).catch(() => null);
    if (fullSystem) {
      const program = dbSystemToProgramStructure(fullSystem) as ProgramStructure | null;
      return { program, source: "db_active_system", activeSystemId: activeSystem.id };
    }
    // System row exists but full hydration failed — still signal DB source with null program
    return { program: null, source: "db_active_system", activeSystemId: activeSystem.id };
  }

  // Priority 2: Message-history fallback (first-build / legacy only)
  if (historyFallback) {
    const assistantMessages = [...historyFallback]
      .reverse()
      .filter((m) => m.role === "assistant" && m.structuredData);

    for (const msg of assistantMessages) {
      if (!msg.structuredData) continue;
      try {
        const data =
          typeof msg.structuredData === "string"
            ? JSON.parse(msg.structuredData)
            : msg.structuredData;
        if (data?._type === "system_edit") continue;
        if (data?.days && Array.isArray(data.days) && data.days.length > 0) {
          return { program: data as ProgramStructure, source: "message_history", activeSystemId: null };
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }

  return { program: null, source: "none", activeSystemId: null };
}
