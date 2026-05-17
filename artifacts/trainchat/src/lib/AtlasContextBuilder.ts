/**
 * AtlasContextBuilder
 *
 * Generates context-aware Atlas presence for the empty-state screen.
 * Consumes cached system state (no extra fetches) and returns a hero message
 * + contextual chips that reflect the athlete's actual training situation.
 *
 * Designed to be called inside a useMemo — pure, synchronous, no side effects.
 */

import type { FocusMode } from "./focusMode";
import type { ProgramStructure } from "../components/chat/ChatOutput";
import { getFocusModeConfig } from "./focusModeConfig";
import type { UserGlobalContext } from "./AtlasGlobalContextResolver";

// ── Public types ───────────────────────────────────────────────────────────────

export interface AtlasChip {
  label: string;
  prompt: string;
  highlight?: boolean;
}

export interface AtlasContextInput {
  focusMode: FocusMode;
  /** Resolved program state from resolveProgramState() */
  displayProgramSource: "live" | "draft" | "none";
  /** The resolved program (dbSystemProgram or latestProgram) */
  program: ProgramStructure | null;
  /** Name of the active TrainingSystem DB record */
  systemName: string | null;
  /** Whether the user has any prior conversation history */
  hasConversationHistory: boolean;
  /**
   * User-level context resolved from programLibrary — provides returning-user
   * awareness when displayProgramSource === "none" (new conversation, no linked system yet).
   */
  userGlobalContext?: UserGlobalContext | null;
  /**
   * Stable seed for message pool selection — use a value that doesn't change
   * on every render (e.g. derived from system ID or fixed to 0 for sessions).
   */
  seed?: number;
}

export interface AtlasContextOutput {
  heroMessage: string;
  chips: AtlasChip[];
}

// ── Utility ────────────────────────────────────────────────────────────────────

/** Normalize an AI-generated string for safe use in a hero message */
function cleanPhrase(s: string | undefined, maxLen = 70): string | null {
  if (!s || s.trim().length === 0 || s.length > maxLen) return null;
  return s.replace(/\.\s*$/, "").trim();
}

function pick<T>(pool: T[], seed: number): T {
  return pool[Math.abs(seed) % pool.length];
}

// ── Message pools: NO SYSTEM ───────────────────────────────────────────────────

const NO_SYSTEM_MESSAGES: Record<FocusMode, string[]> = {
  strength: [
    "I'm Atlas. Tell me what you're training for and I'll build around it.",
    "Tell me your objective. I'll engineer the progression.",
    "I'm Atlas. Describe your goals, constraints, or sport.",
    "Your system starts here. Tell me what we're optimizing for.",
  ],
  speed: [
    "I'm Atlas. Tell me your sport, position, or movement priority.",
    "Tell me what fast means for your performance. I'll build the system.",
    "I'm Atlas. Describe your speed goal or training phase.",
    "Let's build around how you accelerate, decelerate, and react.",
  ],
  mobility: [
    "I'm Atlas. Tell me what's restricted, tight, or needs unlocking.",
    "Tell me what you want to restore or protect. I'll build the system.",
    "I'm Atlas. Describe where your movement breaks down.",
    "Let's build around how you move, recover, and restore.",
  ],
};

// ── Message pools: DRAFT ───────────────────────────────────────────────────────

const DRAFT_MESSAGES: Record<FocusMode, string[]> = {
  strength: [
    "Strength block is built. What do we load or adjust before saving?",
    "Program's assembled. What do we change before we lock it in?",
    "Structure is ready. What needs adjusting before we progress?",
  ],
  speed: [
    "Speed program's ready. What do we sharpen before saving?",
    "Acceleration structure is built. What do we refine?",
    "Movement system is designed. What do we adjust before locking in?",
  ],
  mobility: [
    "Mobility structure is built. What do we open up or change?",
    "Restoration program is ready. What do we refine before finalizing?",
    "Movement work is assembled. What needs adjusting?",
  ],
};

// ── Message pools: LIVE fallback (when intelligenceStatus is sparse) ───────────

const LIVE_FALLBACK_MESSAGES: Record<FocusMode, string[]> = {
  strength: [
    "Strength system's running. What do we push or adjust?",
    "System active. What are we loading today?",
    "I have your program loaded. What do we push or change?",
  ],
  speed: [
    "Speed system's live. What do we sharpen?",
    "System active. What output are we targeting?",
    "I have your field-speed work loaded. What do we accelerate?",
  ],
  mobility: [
    "Mobility system's running. What do we restore or progress?",
    "System active. What restriction are we addressing?",
    "I have your recovery work loaded. What do we open up?",
  ],
};

// ── Mode-specific live message pools ───────────────────────────────────────────
//
// Each mode has independent sentence structures with distinct vocabulary and
// coaching intent. No shared templates. No noun substitution.

type NamedTemplate = (name: string) => string;
type PhaseTemplate = (phase: string) => string;

// When we have a named program/system — mode shapes the framing entirely
const MODE_LIVE_NAMED: Record<FocusMode, NamedTemplate[]> = {
  strength: [
    (n) => `I have your ${n} loaded. Are we pushing force or managing fatigue today?`,
    (n) => `Your ${n} is active. Do we increase output or clean up recovery?`,
    (n) => `I have your ${n} ready. What do we load or progress today?`,
  ],
  speed: [
    (n) => `I have your ${n} loaded. What are we sharpening today?`,
    (n) => `Your ${n} is active. Are we building explosiveness or reactive movement?`,
    (n) => `I have your ${n} ready. What needs to feel faster or sharper?`,
  ],
  mobility: [
    (n) => `I have your ${n} loaded. What feels restricted or stiff today?`,
    (n) => `Your ${n} is active. What are we opening up today?`,
    (n) => `I'm tracking your ${n}. What needs restoring today?`,
  ],
};

// When we have a named periodization phase
const MODE_LIVE_PHASE: Record<FocusMode, PhaseTemplate[]> = {
  strength: [
    (p) => `We're tracking your ${p} progression. What needs adjusting?`,
    (p) => `Your ${p} is active. Do we push intensity or manage load today?`,
    (p) => `We're building through your ${p}. What do we load or refine?`,
  ],
  speed: [
    (p) => `We're in your ${p}. What do we sharpen or accelerate?`,
    (p) => `Your ${p} is active. Building explosiveness or reactive work today?`,
    (p) => `I'm tracking your ${p}. What needs to feel faster or sharper?`,
  ],
  mobility: [
    (p) => `We're in your ${p}. What do we open up or restore?`,
    (p) => `Your ${p} is active. What feels restricted or needs more range?`,
    (p) => `I'm tracking your ${p} progress. What needs restoring?`,
  ],
};

// When a recovery / fatigue signal is present
const MODE_LIVE_RECOVERY: Record<FocusMode, string[]> = {
  strength: [
    "I'm tracking your workload. Do we push output or pull back today?",
    "Fatigue is in the system. Do we push through or manage recovery?",
  ],
  speed: [
    "I'm tracking your movement load. Do we push elasticity or pull back today?",
    "Speed load is building. Do we sharpen or restore today?",
  ],
  mobility: [
    "Your recovery load is tracked. Do we restore or progress range today?",
    "I'm watching your movement quality. Do we open up or recover today?",
  ],
};

// When a recent structural change exists
const MODE_LIVE_REFINEMENT: Record<FocusMode, string[]> = {
  strength: [
    "We recently refined your strength structure. What do we load or progress next?",
    "Your strength block's been adjusted. What needs the next push?",
  ],
  speed: [
    "We recently refined your speed work. What needs to feel sharper?",
    "Your movement structure's been adjusted. What do we accelerate next?",
  ],
  mobility: [
    "We recently refined your mobility structure. What needs more range?",
    "Your movement work's been adjusted. What do we restore next?",
  ],
};

// ── Chip pools ─────────────────────────────────────────────────────────────────

const NO_SYSTEM_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Build a 3-day strength program", prompt: "Build me a 3-day strength program", highlight: true },
    { label: "Build a 4-day muscle program", prompt: "Build a 4-day muscle building program", highlight: true },
    { label: "Build a speed and strength plan", prompt: "Build a speed and strength training plan for me", highlight: false },
  ],
  speed: [
    { label: "Build a football speed program", prompt: "Build a football speed program", highlight: true },
    { label: "Build a speed & acceleration program", prompt: "Build a speed and acceleration training program for me", highlight: true },
    { label: "Sharpen change of direction", prompt: "Build a program to improve my change of direction and agility", highlight: false },
  ],
  mobility: [
    { label: "Restore hip mobility", prompt: "Design a hip mobility and range of motion restoration program for me", highlight: true },
    { label: "Unlock shoulder range", prompt: "I want to improve my shoulder range of motion and control", highlight: false },
    { label: "Recovery & restoration flow", prompt: "Design a recovery and restoration mobility program for me", highlight: false },
  ],
};

const DRAFT_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Adjust the frequency", prompt: "Adjust the training frequency of my program", highlight: true },
    { label: "Change the split structure", prompt: "Change the training split structure of my program", highlight: false },
    { label: "Add a recovery day", prompt: "Add a dedicated recovery or deload day to my program", highlight: false },
  ],
  speed: [
    { label: "Adjust training days", prompt: "Adjust the number of training days in my speed program", highlight: true },
    { label: "Add warm-up protocols", prompt: "Add specific warm-up and activation protocols to my program", highlight: false },
    { label: "More sport-specific work", prompt: "Make this program more specific to my sport and position", highlight: false },
  ],
  mobility: [
    { label: "Adjust session length", prompt: "Adjust the length of the sessions in my mobility program", highlight: true },
    { label: "Change the focus area", prompt: "Change the primary focus area of my mobility program", highlight: false },
    { label: "Add progressive loading", prompt: "Add progressive loading and tissue tolerance work to my program", highlight: false },
  ],
};

const LIVE_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Increase intensity", prompt: "Increase the intensity and loading demand in my program this week", highlight: true },
    { label: "Add strength volume", prompt: "Add more volume to my strength program this week", highlight: false },
    { label: "Reduce fatigue", prompt: "Reduce training fatigue by adjusting volume or intensity in my program", highlight: false },
    { label: "Rebuild weekly split", prompt: "Rebuild the weekly split structure of my strength program", highlight: false },
    { label: "Push lower-body output", prompt: "Increase lower-body strength output and intensity in my program", highlight: false },
    { label: "Add explosive strength", prompt: "Add explosive strength and power work to my program", highlight: false },
  ],
  speed: [
    { label: "Improve first-step acceleration", prompt: "Add more first-step acceleration and drive phase work to my program", highlight: true },
    { label: "Add reactive drills", prompt: "Add more reactive and change-of-direction drills to my program", highlight: false },
    { label: "Increase elastic work", prompt: "Increase plyometric and elastic strength work in my program", highlight: false },
    { label: "Build game-speed conditioning", prompt: "Add game-speed conditioning and repeat sprint capacity to my program", highlight: false },
    { label: "Improve change of direction", prompt: "Improve change of direction and agility in my program", highlight: false },
    { label: "Increase foot speed", prompt: "Add footwork rhythm and foot speed drills to my program", highlight: false },
  ],
  mobility: [
    { label: "Open hip mobility", prompt: "Add more hip range of motion and end-range control work to my program", highlight: true },
    { label: "Improve ankle range", prompt: "Add ankle mobility and dorsiflexion range work to my program", highlight: false },
    { label: "Reduce stiffness", prompt: "Add tissue quality and stiffness reduction work to my program", highlight: false },
    { label: "Shift toward recovery", prompt: "Shift my program toward restoration and recovery focus", highlight: false },
    { label: "Improve thoracic rotation", prompt: "Add thoracic spine rotation and mobility work to my program", highlight: false },
    { label: "Restore movement quality", prompt: "Focus on restoring overall movement quality and tissue health in my program", highlight: false },
  ],
};

// ── Hero message: LIVE system ──────────────────────────────────────────────────

function buildLiveHeroMessage(
  program: ProgramStructure | null,
  systemName: string | null,
  focusMode: FocusMode,
  seed: number,
): string {
  if (!program) {
    const name = systemName;
    if (name) return pick(MODE_LIVE_NAMED[focusMode], seed)(name);
    return pick(LIVE_FALLBACK_MESSAGES[focusMode], seed);
  }

  const phase = cleanPhrase(program.intelligenceStatus?.periodizationPhase);
  const directive = cleanPhrase(program.intelligenceStatus?.adaptationDirective, 80);
  const recovery = cleanPhrase(program.intelligenceStatus?.recoveryStatus);
  const hasRecentChange = !!program.whatChanged;

  // Priority 1: Phase + directive — AI directive is already mode-appropriate content
  if (phase && directive) {
    return `We're in your ${phase}. ${directive}. What are we adjusting?`;
  }

  // Priority 2: Phase alone — mode-specific framing
  if (phase) {
    return pick(MODE_LIVE_PHASE[focusMode], seed)(phase);
  }

  // Priority 3: Recovery/fatigue signal — mode-specific vocabulary
  if (recovery) {
    const lower = recovery.toLowerCase();
    if (lower.includes("fatigue") || lower.includes("recovery") || lower.includes("deload")) {
      return pick(MODE_LIVE_RECOVERY[focusMode], seed);
    }
  }

  // Priority 4: Recent structural refinement — mode-specific
  if (hasRecentChange) {
    return pick(MODE_LIVE_REFINEMENT[focusMode], seed);
  }

  // Priority 5: Program name — mode shapes the framing
  const name = program.programName || systemName;
  if (name) {
    return pick(MODE_LIVE_NAMED[focusMode], seed)(name);
  }

  // Fallback
  return pick(LIVE_FALLBACK_MESSAGES[focusMode], seed);
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildAtlasContext(input: AtlasContextInput): AtlasContextOutput {
  const { focusMode, displayProgramSource, program, systemName, userGlobalContext, seed = 0 } = input;

  // ── No conversation-linked system ──
  // This fires for new chats even when the user has a full training history, because
  // the by-conversation endpoint never auto-links to a global system.
  // Use userGlobalContext to show returning-user awareness instead of generic onboarding.
  if (displayProgramSource === "none") {
    if (userGlobalContext?.isReturningUser) {
      return {
        heroMessage: userGlobalContext.heroMessage,
        chips: userGlobalContext.chips,
      };
    }
    // Genuinely new user
    const messages = NO_SYSTEM_MESSAGES[focusMode];
    return {
      heroMessage: pick(messages, seed),
      chips: NO_SYSTEM_CHIPS[focusMode],
    };
  }

  // ── Draft — program just built in session, not yet saved ──
  if (displayProgramSource === "draft") {
    return {
      heroMessage: pick(DRAFT_MESSAGES[focusMode], seed),
      chips: DRAFT_CHIPS[focusMode],
    };
  }

  // ── Live system — full context awareness ──
  return {
    heroMessage: buildLiveHeroMessage(program, systemName, focusMode, seed),
    chips: LIVE_CHIPS[focusMode].slice(0, 3),
  };
}

/**
 * Derive a stable seed from available identifiers so the message doesn't
 * thrash on re-renders but still varies across users / systems.
 */
export function deriveAtlasSeed(systemId: number | null | undefined, focusMode: FocusMode): number {
  const focusOffset = focusMode === "strength" ? 0 : focusMode === "speed" ? 7 : 13;
  return (systemId ?? 0) + focusOffset;
}
