import type { ProgramStructure } from "@/components/chat/ChatOutput";

export type ProgramSource = "live" | "draft" | "none";

export interface ResolvedProgramState {
  source: ProgramSource;
  program: ProgramStructure | null;
}

/**
 * Single, authoritative resolver for what the right-panel program sidebar should display.
 *
 * Rules (in priority order):
 *  1. If activeSystem is provided (truthy), the DB is canonical — show it as "live".
 *  2. If latestProgram exists AND its messageId matches sessionDraftMsgId, it is a
 *     session-owned draft — show it as "draft".
 *  3. Otherwise show nothing ("none").
 *
 * @param activeSystem  The already-derived ProgramStructure for the live DB system,
 *                      or null when there is no active system / a new build is starting.
 * @param latestProgram The draft ProgramStructure built in this browser session, or null.
 * @param sessionDraftMsgId  The message ID registered in sessionDraftMsgIdRef.current —
 *                           the only message whose data may populate the draft panel.
 *
 * IMPORTANT: All display-path code MUST call this function. Never compute source/program
 * inline — that is what introduced the ghost-program bug this resolver is designed to prevent.
 */
export function resolveProgramState({
  activeSystem,
  latestProgram,
  sessionDraftMsgId,
}: {
  activeSystem: ProgramStructure | null;
  latestProgram: ProgramStructure | null;
  sessionDraftMsgId: number | null;
}): ResolvedProgramState {
  if (activeSystem) {
    return { source: "live", program: activeSystem };
  }

  if (latestProgram && latestProgram.messageId === sessionDraftMsgId) {
    return { source: "draft", program: latestProgram };
  }

  return { source: "none", program: null };
}
