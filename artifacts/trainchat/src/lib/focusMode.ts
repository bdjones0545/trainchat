/**
 * Focus Mode — Core Types and Persistence
 *
 * Defines the three training focus modes and handles localStorage persistence.
 * This is the single source of truth for the active mode.
 */

export type FocusMode = "strength" | "speed" | "mobility";

const STORAGE_KEY = "trainchat_focus_mode";

export function readFocusMode(): FocusMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "strength" || stored === "speed" || stored === "mobility") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "strength";
}

export function writeFocusMode(mode: FocusMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

/**
 * getActiveSystemForFocus — safe focus-aware program selector.
 *
 * This is the SINGLE shared way to retrieve the active system for a given
 * focus. Never duplicate this lookup inline. Returns null when:
 * - activeProgramByFocus is not yet loaded (null/undefined)
 * - there is no active program for the current focus
 *
 * Usage:
 *   const system = getActiveSystemForFocus(focusMode, { strength: myProgram, speed: null, mobility: null });
 */
export function getActiveSystemForFocus(
  currentFocus: FocusMode,
  activeProgramByFocus: Partial<Record<FocusMode, any | null>> | null | undefined
): any | null {
  if (!activeProgramByFocus || !currentFocus) return null;
  return activeProgramByFocus[currentFocus] ?? null;
}

/**
 * Safe default shape for activeProgramByFocus.
 * Use this as the initial value to prevent undefined lookups on first render.
 */
export const EMPTY_ACTIVE_PROGRAM_BY_FOCUS: Record<FocusMode, null> = {
  strength: null,
  speed: null,
  mobility: null,
};
