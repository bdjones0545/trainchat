/**
 * useFocusMode — React hook for global focus mode state.
 *
 * Reads from the FocusModeContext (single source of truth).
 * Components anywhere in the tree get the same live value.
 */

export { useFocusModeContext as useFocusMode } from "@/contexts/FocusModeContext";
