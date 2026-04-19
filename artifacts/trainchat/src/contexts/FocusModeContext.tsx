/**
 * FocusModeContext — single source of truth for the active training focus.
 *
 * All surfaces (right sidebar, Active Programs, chat agent, nav tabs) read
 * from this context. Switching focus in one place propagates everywhere.
 *
 * Persistence: localStorage via focusMode.ts helpers.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { type FocusMode, readFocusMode, writeFocusMode } from "@/lib/focusMode";

interface FocusModeContextValue {
  focusMode: FocusMode;
  setFocusMode: (mode: FocusMode) => void;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusModeState] = useState<FocusMode>(readFocusMode);

  const setFocusMode = useCallback((mode: FocusMode) => {
    const previous = readFocusMode();
    writeFocusMode(mode);
    setFocusModeState(mode);
    console.log("[FocusSwitchAudit]", {
      previousFocus: previous,
      nextFocus: mode,
      stateSyncedAcrossUI: true,
    });
  }, []);

  return (
    <FocusModeContext.Provider value={{ focusMode, setFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusModeContext(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) {
    throw new Error("useFocusModeContext must be used inside <FocusModeProvider>");
  }
  return ctx;
}
