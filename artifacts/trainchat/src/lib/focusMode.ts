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
