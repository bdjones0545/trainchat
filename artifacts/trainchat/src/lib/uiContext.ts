/**
 * UIContext — describes where the user is in the product and what they are looking at.
 *
 * Sent with every AI message (chat stream) and every system edit (training-system/edit)
 * so the agent can resolve spatial references like "this", "here", "that session"
 * without ambiguity.
 *
 * All fields are optional — callers populate only what they know.
 */

export interface UIContext {
  page?: "/chat" | "/system" | "/billing" | string;

  /** Current active focus mode — routes the edit to the correct training system. */
  focusMode?: "strength" | "speed" | "mobility" | string | null;

  activeProgramId?: number | null;
  activeProgramName?: string | null;

  selectedWeek?: number | null;

  selectedSessionId?: number | null;
  selectedSessionName?: string | null;

  selectedExerciseId?: number | null;
  selectedExerciseName?: string | null;

  panelState?: "chat" | "program" | "history" | "insights" | string | null;
}

/**
 * Builds a plain-text summary of the UIContext for injection into the system prompt.
 * Returns null when no meaningful context is present.
 */
export function buildUIContextPrompt(ctx: UIContext | null | undefined): string | null {
  if (!ctx) return null;

  const lines: string[] = [];

  if (ctx.page) lines.push(`Current page: ${ctx.page}`);
  if (ctx.focusMode) lines.push(`Active training focus: ${ctx.focusMode}`);
  if (ctx.activeProgramName) lines.push(`Active program: "${ctx.activeProgramName}"`);
  if (ctx.selectedWeek != null) lines.push(`User is viewing Week ${ctx.selectedWeek}`);
  if (ctx.selectedSessionName) lines.push(`Selected session: "${ctx.selectedSessionName}"`);
  if (ctx.selectedExerciseName) lines.push(`Selected exercise: "${ctx.selectedExerciseName}"`);
  if (ctx.panelState) lines.push(`Panel: ${ctx.panelState}`);

  if (lines.length === 0) return null;

  return [
    "## CURRENT USER CONTEXT",
    "The user is currently looking at:",
    ...lines.map((l) => `- ${l}`),
    "",
    "When the user says 'this', 'here', 'that', or refers to something without naming it explicitly,",
    "resolve the reference using the above context before responding.",
  ].join("\n");
}
