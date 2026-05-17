/**
 * AtlasGlobalContextResolver
 *
 * Resolves user-LEVEL training identity before the empty state renders.
 *
 * Resolution priority:
 *   1. High-confidence Atlas coaching memory  (injury → constraint/equipment → schedule
 *                                              → goal/preference → sport_context)
 *   2. Active program system matching current focusMode
 *   3. Any active program system
 *   4. Most recently updated system (archived)
 *   5. Has conversations but no systems
 *   6. Truly new user (no history at all)
 *
 * Pure function — call inside useMemo.
 *
 * DEV: pass the returned _debug field to console to see what influenced the hero copy.
 */

import type { FocusMode } from "./focusMode";
import type { AtlasChip } from "./AtlasContextBuilder";

// ── External types ──────────────────────────────────────────────────────────────

export interface ProgramLibraryItem {
  id: number;
  name: string;
  overarchingGoal: string | null;
  trainingStyle: string | null;
  status: string;
  focusMode: string;
  currentPhaseName: string | null;
  currentPhaseGoal: string | null;
  currentWeekNumber: number | null;
  currentVolumeLevel: string | null;
  lastAdjustmentTitle: string | null;
  updatedAt: string;
}

/** Lightweight coaching memory shape — matches GET /api/atlas/memories response */
export interface AtlasCoachingMemory {
  id: number;
  category: string;
  summary: string;
  normalizedKey: string;
  confidence: number;
  importance: number;
  lastSeenAt: string;
}

// ── Output ─────────────────────────────────────────────────────────────────────

export interface UserGlobalContext {
  isReturningUser: boolean;
  heroMessage: string;
  chips: AtlasChip[];
  _debug?: {
    memoriesLoaded: number;
    influencedByMemory: boolean;
    topMemory?: {
      category: string;
      normalizedKey: string;
      confidence: number;
      importance: number;
    };
    fallbackReason?: string;
  };
}

// ── Memory: priority category weights ──────────────────────────────────────────

const CATEGORY_PRIORITY: Record<string, number> = {
  injury: 10,
  constraint: 8,
  equipment: 7,
  schedule: 6,
  goal: 5,
  sport_context: 4,
  preference: 3,
  disliked_exercise: 2,
  recovery_pattern: 1,
  successful_refinement: 1,
  recurring_request: 1,
};

/**
 * Selects the single most impactful qualifying memory.
 * Priority: category weight → importance × confidence.
 */
function selectTopMemory(memories: AtlasCoachingMemory[]): AtlasCoachingMemory | null {
  const qualifying = memories.filter((m) => m.importance >= 3 && m.confidence >= 2);
  const pool = qualifying.length > 0
    ? qualifying
    : memories.filter((m) => m.importance >= 2 && m.confidence >= 2);

  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    const ap = CATEGORY_PRIORITY[a.category] ?? 0;
    const bp = CATEGORY_PRIORITY[b.category] ?? 0;
    if (bp !== ap) return bp - ap;
    return b.importance * b.confidence - a.importance * a.confidence;
  })[0] ?? null;
}

// ── Memory: key signal extraction ──────────────────────────────────────────────

const SKIP_WORDS = new Set(["no", "without", "lack", "limited", "the", "a", "an", "only"]);

/**
 * Derives a short readable label from a normalizedKey subject slug.
 * "injury:knee_deep_squats" → "knee limitation"
 * "equipment:no_barbell"    → "barbell setup"
 * "preference:athletic_performance_focus" → "athletic performance focus"
 */
function extractSignalLabel(normalizedKey: string, category: string): string {
  const subject = normalizedKey.split(":")[1] ?? "";
  const tokens = subject.split("_").filter(Boolean);
  const meaningful = tokens.filter((t) => !SKIP_WORDS.has(t));
  const words = meaningful.length > 0 ? meaningful : tokens;

  switch (category) {
    case "injury":
      return `${words[0] ?? "physical"} limitation`;
    case "equipment":
      return `${words.slice(0, 2).join(" ")} setup`;
    case "schedule":
      return "schedule constraint";
    case "preference":
      return words.slice(0, 3).join(" ") || "training preference";
    case "sport_context":
      return `${words.slice(0, 2).join(" ")} context`;
    case "goal":
      return words.slice(0, 3).join(" ") || "training goal";
    case "disliked_exercise":
      return `${words.slice(0, 2).join(" ")} avoidance`;
    case "constraint":
      return `${words.slice(0, 2).join(" ")} constraint`;
    default:
      return words.slice(0, 2).join(" ") || "training signal";
  }
}

// ── Memory: hero message generation ────────────────────────────────────────────

function buildMemoryHeroMessage(memory: AtlasCoachingMemory): string {
  const signal = extractSignalLabel(memory.normalizedKey, memory.category);

  switch (memory.category) {
    case "injury":
      return `I'm still accounting for your ${signal}. How has movement quality felt?`;
    case "constraint":
      return `I have your ${signal} on record. What are we building today?`;
    case "equipment":
      return `I have your ${signal} on record. What are we building today?`;
    case "schedule":
      return `I have your ${signal} in mind. Tell me what you want to train.`;
    case "preference":
      return `You've been leaning toward ${signal}. What are we building today?`;
    case "sport_context":
      return `I've been building around your ${signal}. What needs adjusting?`;
    case "goal":
      return `You've been working toward your ${signal}. Continue progressing or shift focus?`;
    case "disliked_exercise":
      return "I know what movements you want to avoid. What are we building today?";
    case "recovery_pattern":
      return "I've been tracking your recovery patterns. What are we targeting today?";
    case "successful_refinement":
      return "I remember what's worked for you. What do you want to push next?";
    case "recurring_request":
      return "I know what you keep coming back to. What are we building today?";
    default:
      return "I have your training history on record. What are we building today?";
  }
}

// ── Memory: chip generation ─────────────────────────────────────────────────────

function memoryToChip(memory: AtlasCoachingMemory): AtlasChip | null {
  const signal = extractSignalLabel(memory.normalizedKey, memory.category);

  switch (memory.category) {
    case "injury":
      return {
        label: `Build around ${signal.replace(" limitation", "")}`,
        prompt: `Build my program accounting for my ${signal}`,
        highlight: true,
      };
    case "equipment":
      return {
        label: "Work within my equipment",
        prompt: `Build my program within my equipment constraints: ${memory.summary}`,
        highlight: false,
      };
    case "schedule":
      return {
        label: "Respect my schedule",
        prompt: `Build my program within my schedule constraints: ${memory.summary}`,
        highlight: false,
      };
    case "disliked_exercise":
      return {
        label: "Replace unwanted movements",
        prompt: `Remove or replace movements I dislike from my program: ${memory.summary}`,
        highlight: false,
      };
    case "goal":
      return {
        label: `Progress toward ${signal}`,
        prompt: `Continue progressing toward my goal: ${memory.summary}`,
        highlight: true,
      };
    case "preference":
      return {
        label: "Match my training style",
        prompt: `Build in line with my training preferences: ${memory.summary}`,
        highlight: false,
      };
    case "sport_context":
      return {
        label: "Build for my sport",
        prompt: `Build my program around my sport context: ${memory.summary}`,
        highlight: true,
      };
    case "constraint":
      return {
        label: `Account for ${signal}`,
        prompt: `Build my program accounting for: ${memory.summary}`,
        highlight: false,
      };
    default:
      return null;
  }
}

// ── Returning-user chip pools (system-based, used when no memories available) ──

const RETURNING_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Increase intensity", prompt: "Increase the intensity and loading in my program this week", highlight: true },
    { label: "Add a deload week", prompt: "Add a deload week to my current program", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my program to account for accumulated fatigue", highlight: false },
    { label: "Shift toward power", prompt: "Shift my program toward power and neural output", highlight: false },
  ],
  speed: [
    { label: "Increase acceleration work", prompt: "Increase the acceleration and drive phase work in my program", highlight: true },
    { label: "Add reactive drills", prompt: "Add more reactive and change-of-direction work to my program", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my speed program to account for accumulated fatigue", highlight: false },
    { label: "Improve movement quality", prompt: "Add work to improve my movement quality and mechanics", highlight: false },
  ],
  mobility: [
    { label: "Progress range work", prompt: "Progress the range of motion work in my mobility program", highlight: true },
    { label: "Shift to restoration", prompt: "Shift my program toward restoration and recovery focus", highlight: false },
    { label: "Adjust around fatigue", prompt: "Adjust my program around current fatigue and recovery state", highlight: false },
    { label: "Add joint preparation", prompt: "Add more joint preparation and tissue tolerance work", highlight: false },
  ],
};

// ── Memory: combined chip set (memory-first + context fill) ────────────────────

function buildMemoryChips(
  memories: AtlasCoachingMemory[],
  focusMode: FocusMode,
): AtlasChip[] {
  const topMemories = memories
    .filter((m) => m.importance >= 3 && m.confidence >= 2)
    .slice(0, 2);

  const memChips = topMemories
    .map(memoryToChip)
    .filter((c): c is AtlasChip => c !== null);

  // Fill remaining slots with context chips (no duplicates)
  const contextFill = RETURNING_CHIPS[focusMode].filter(
    (c) => !memChips.some((mc) => mc.label === c.label),
  );

  return [...memChips, ...contextFill].slice(0, 4);
}

// ── Utility ─────────────────────────────────────────────────────────────────────

function clean(s: string | null | undefined, maxLen = 64): string | null {
  if (!s || s.trim().length === 0 || s.length > maxLen) return null;
  return s.replace(/\.\s*$/, "").trim();
}

// ── System-based message (fallback when no qualifying memories) ─────────────────

function buildSystemMessage(system: ProgramLibraryItem, currentFocusMode: FocusMode): string {
  const matchesFocus = system.focusMode === currentFocusMode;
  const phaseName = clean(system.currentPhaseName);
  const systemName = clean(system.name, 48);
  const hasRecentAdjustment = !!system.lastAdjustmentTitle;
  const isActive = system.status === "active";

  if (matchesFocus && isActive) {
    if (phaseName) {
      return hasRecentAdjustment
        ? `We're in your ${phaseName} and I've been tracking recent adjustments. What are we refining today?`
        : `We're in your ${phaseName}. What do you want to push or change?`;
    }
    if (systemName) return `I have your ${systemName} loaded. Tell me what to adjust or progress.`;
    return "Your system is active. Tell me what to push or change.";
  }

  if (!matchesFocus && isActive) {
    if (systemName)
      return `I have your ${systemName} on record. What are we building in ${currentFocusMode} today?`;
    return `I have your ${system.focusMode} system on record. What are we working on today?`;
  }

  if (systemName)
    return `I have your previous work on ${systemName}. Ready to continue or build something new?`;
  return "I have your training history on record. What are we building today?";
}

// ── Main resolver ───────────────────────────────────────────────────────────────

export function resolveUserGlobalContext(
  programLibrary: ProgramLibraryItem[],
  conversationCount: number,
  focusMode: FocusMode,
  atlasMemories: AtlasCoachingMemory[] = [],
): UserGlobalContext {
  const hasAnyHistory =
    programLibrary.length > 0 || conversationCount > 0 || atlasMemories.length > 0;

  // Truly new user — no systems, no conversations, no memories
  if (!hasAnyHistory) {
    return {
      isReturningUser: false,
      heroMessage: "",
      chips: [],
      _debug: { memoriesLoaded: 0, influencedByMemory: false, fallbackReason: "new_user" },
    };
  }

  // ── Priority 1: Memory-enriched message ──
  if (atlasMemories.length > 0) {
    const topMemory = selectTopMemory(atlasMemories);
    if (topMemory) {
      if (import.meta.env.DEV) {
        console.group("[AtlasGlobalContextResolver] Memory influence active");
        console.log(`Memories loaded: ${atlasMemories.length}`);
        console.log(`Top memory: [${topMemory.category}] conf=${topMemory.confidence} imp=${topMemory.importance}`);
        console.log(`Key: ${topMemory.normalizedKey}`);
        console.log(`Summary: ${topMemory.summary}`);
        console.groupEnd();
      }
      return {
        isReturningUser: true,
        heroMessage: buildMemoryHeroMessage(topMemory),
        chips: buildMemoryChips(atlasMemories, focusMode),
        _debug: {
          memoriesLoaded: atlasMemories.length,
          influencedByMemory: true,
          topMemory: {
            category: topMemory.category,
            normalizedKey: topMemory.normalizedKey,
            confidence: topMemory.confidence,
            importance: topMemory.importance,
          },
        },
      };
    }
  }

  // ── Priority 2: System-based message ──
  if (programLibrary.length > 0) {
    const activeMatch = programLibrary.find(
      (s) => s.status === "active" && s.focusMode === focusMode,
    );
    const anyActive = programLibrary.find((s) => s.status === "active");
    const bestSystem = activeMatch ?? anyActive ?? programLibrary[0]!;

    if (import.meta.env.DEV) {
      console.group("[AtlasGlobalContextResolver] System-based (no qualifying memories)");
      console.log(`Memories loaded: ${atlasMemories.length} (none qualified)`);
      console.log(`System used: ${bestSystem.name} [${bestSystem.status}]`);
      console.groupEnd();
    }

    return {
      isReturningUser: true,
      heroMessage: buildSystemMessage(bestSystem, focusMode),
      chips: RETURNING_CHIPS[focusMode].slice(0, 3),
      _debug: {
        memoriesLoaded: atlasMemories.length,
        influencedByMemory: false,
        fallbackReason: "no_qualifying_memory",
      },
    };
  }

  // ── Priority 3: Has conversations but no systems ──
  if (import.meta.env.DEV) {
    console.log("[AtlasGlobalContextResolver] Returning user — conversations only, no systems");
  }
  return {
    isReturningUser: true,
    heroMessage: "You've started conversations before. What are we building today?",
    chips: RETURNING_CHIPS[focusMode].slice(0, 3),
    _debug: {
      memoriesLoaded: atlasMemories.length,
      influencedByMemory: false,
      fallbackReason: "conversations_only",
    },
  };
}
