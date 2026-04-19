/**
 * useFocusMode — React hook for global focus mode state
 *
 * Reads from and writes to localStorage.
 * Exposes the current mode and a setter used by the tab switcher.
 */

import { useState, useCallback } from "react";
import { type FocusMode, readFocusMode, writeFocusMode } from "@/lib/focusMode";

export function useFocusMode() {
  const [focusMode, setFocusModeState] = useState<FocusMode>(readFocusMode);

  const setFocusMode = useCallback((mode: FocusMode) => {
    writeFocusMode(mode);
    setFocusModeState(mode);
    console.log("[FocusModeAudit] modeChanged", { newMode: mode });
  }, []);

  return { focusMode, setFocusMode };
}
