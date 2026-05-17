/**
 * AtlasGlobalContextResolver
 *
 * Resolves user-LEVEL training identity before the empty state renders.
 * Reads from the already-cached `programLibrary` (user-wide, not conversation-scoped)
 * so a returning user opening a new chat never sees generic onboarding copy.
 *
 * Priority order:
 *   1. Active system matching current focusMode
 *   2. Any active system (different focusMode)
 *   3. Most recently updated system (archived)
 *   4. No systems → new user
 *
 * Pure function — call inside useMemo with [programLibrary, focusMode] deps.
 */

import type { FocusMode } from "./focusMode";
import type { AtlasChip } from "./AtlasContextBuilder";

// ── Library item shape (mirrors /api/training-system/library response) ─────────

export interface ProgramLibraryItem {
  id: number;
  name: string;
  overarchingGoal: string | null;
  trainingStyle: string | null;
  status: string; // "active" | "archived"
  focusMode: string; // "strength" | "speed" | "mobility"
  currentPhaseName: string | null;
  currentPhaseGoal: string | null;
  currentWeekNumber: number | null;
  currentVolumeLevel: string | null;
  lastAdjustmentTitle: string | null;
  updatedAt: string; // ISO date string
}

// ── Output ─────────────────────────────────────────────────────────────────────

export interface UserGlobalContext {
  /** True when the user has any prior training systems or conversation history */
  isReturningUser: boolean;
  /** Pre-built hero message for this user's state */
  heroMessage: string;
  /** Context-aware quick-action chips */
  chips: AtlasChip[];
}

// ── Utility ────────────────────────────────────────────────────────────────────

function clean(s: string | null | undefined, maxLen = 64): string | null {
  if (!s || s.trim().length === 0 || s.length > maxLen) return null;
  return s.replace(/\.\s*$/, "").trim();
}

// ── Chip pools for returning users ─────────────────────────────────────────────

const RETURNING_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Increase intensity", prompt: "Increase the intensity and loading in my program this week", highlight: true },
    { label: "Add a deload week", prompt: "Add a deload week to my current program", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my program to account for accumulated fatigue", highlight: false },
    { label: "Shift toward power", prompt: "Shift my program toward power and neural output", highlight: false },
    { label: "Modify this week", prompt: "Make changes to my training this week", highlight: false },
  ],
  speed: [
    { label: "Increase acceleration work", prompt: "Increase the acceleration and drive phase work in my program", highlight: true },
    { label: "Add reactive drills", prompt: "Add more reactive and change-of-direction work to my program", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my speed program to account for accumulated fatigue", highlight: false },
    { label: "Improve movement quality", prompt: "Add work to improve my movement quality and mechanics", highlight: false },
    { label: "Modify this week", prompt: "Make changes to my training this week", highlight: false },
  ],
  mobility: [
    { label: "Progress range work", prompt: "Progress the range of motion work in my mobility program", highlight: true },
    { label: "Shift to restoration", prompt: "Shift my program toward restoration and recovery focus", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my program around current fatigue and recovery state", highlight: false },
    { label: "Add joint preparation", prompt: "Add more joint preparation and tissue tolerance work", highlight: false },
    { label: "Modify this week", prompt: "Make changes to my training this week", highlight: false },
  ],
};

// ── Message generation ─────────────────────────────────────────────────────────

function buildMessage(
  system: ProgramLibraryItem,
  currentFocusMode: FocusMode,
): string {
  const matchesFocus = system.focusMode === currentFocusMode;
  const phaseName = clean(system.currentPhaseName);
  const systemName = clean(system.name, 48);
  const hasRecentAdjustment = !!system.lastAdjustmentTitle;
  const isActive = system.status === "active";

  // ── Active system, matching focus ──
  if (matchesFocus && isActive) {
    if (phaseName) {
      return hasRecentAdjustment
        ? `We're in your ${phaseName} and I've been tracking recent adjustments. What are we refining today?`
        : `We're in your ${phaseName}. What do you want to push or change?`;
    }
    if (systemName) {
      return `I have your ${systemName} loaded. Tell me what to adjust or progress.`;
    }
    return "Your system is active. Tell me what to push or change.";
  }

  // ── Active system, different focus ──
  if (!matchesFocus && isActive) {
    const focusLabel =
      system.focusMode === "speed"
        ? "speed"
        : system.focusMode === "mobility"
          ? "mobility"
          : "strength";
    if (systemName) {
      return `I have your ${systemName} on record. What are we building in ${currentFocusMode} today?`;
    }
    return `I have your ${focusLabel} system on record. What are we working on today?`;
  }

  // ── Archived / historical only ──
  if (systemName) {
    return `I have your previous work on ${systemName}. Ready to continue or build something new?`;
  }
  return "I have your training history on record. What are we building today?";
}

// ── Main resolver ──────────────────────────────────────────────────────────────

export function resolveUserGlobalContext(
  programLibrary: ProgramLibraryItem[],
  conversationCount: number,
  focusMode: FocusMode,
): UserGlobalContext {
  // Truly new user — no systems, no prior conversations
  if (programLibrary.length === 0 && conversationCount === 0) {
    return { isReturningUser: false, heroMessage: "", chips: [] };
  }

  // Has conversations but no systems yet — still returning, use generic returning message
  if (programLibrary.length === 0) {
    return {
      isReturningUser: true,
      heroMessage: "You've started conversations before. What are we building today?",
      chips: RETURNING_CHIPS[focusMode].slice(0, 3),
    };
  }

  // Library is sorted by updatedAt desc from the API
  // Priority 1: active + matching focus
  const activeMatch = programLibrary.find(
    (s) => s.status === "active" && s.focusMode === focusMode,
  );
  // Priority 2: any active system
  const anyActive = programLibrary.find((s) => s.status === "active");
  // Priority 3: most recently updated (programLibrary[0] — already sorted)
  const bestSystem = activeMatch ?? anyActive ?? programLibrary[0];

  return {
    isReturningUser: true,
    heroMessage: buildMessage(bestSystem, focusMode),
    chips: RETURNING_CHIPS[focusMode].slice(0, 3),
  };
}
