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
    "Your program is built. Tell me what to adjust before we lock it in.",
    "I've assembled your structure. Tell me what to change or refine.",
  ],
  speed: [
    "Your speed program is ready. Tell me what to refine before we save it.",
    "I've designed your system. Tell me what to adjust.",
  ],
  mobility: [
    "Your mobility program is built. Tell me what to change before we finalize.",
    "I've designed your system. Tell me what to refine.",
  ],
};

// ── Message pools: LIVE fallback (when intelligenceStatus is sparse) ───────────

const LIVE_FALLBACK_MESSAGES: Record<FocusMode, string[]> = {
  strength: [
    "I have your program loaded. Tell me what to push or change.",
    "Your strength system is running. Tell me what to adjust or progress.",
    "System active. Tell me what we're targeting today.",
  ],
  speed: [
    "Your speed system is live. Tell me what to sharpen.",
    "System active. Tell me what output we're targeting.",
    "I have your program loaded. Tell me what to adjust.",
  ],
  mobility: [
    "Your mobility system is running. Tell me what to progress.",
    "System active. Tell me what restriction we're addressing.",
    "I have your program loaded. Tell me what to refine.",
  ],
};

// ── Chip pools ─────────────────────────────────────────────────────────────────

const NO_SYSTEM_CHIPS: Record<FocusMode, AtlasChip[]> = {
  strength: [
    { label: "Build a 3-day strength program", prompt: "Build me a 3-day strength program", highlight: true },
    { label: "Build a 4-day muscle program", prompt: "Build a 4-day muscle building program", highlight: true },
    { label: "Adjust for fat loss", prompt: "Build a fat-loss training plan for me", highlight: false },
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
    { label: "Add a deload week", prompt: "Add a deload week to my current program", highlight: false },
    { label: "Shift to power emphasis", prompt: "Shift my program toward power and neural output", highlight: false },
    { label: "Reduce volume temporarily", prompt: "Reduce the overall training volume in my program temporarily", highlight: false },
    { label: "Add posterior chain work", prompt: "Add more posterior chain and hip hinge work to my program", highlight: false },
  ],
  speed: [
    { label: "Increase acceleration work", prompt: "Increase the acceleration and drive phase work in my program", highlight: true },
    { label: "Add reactive drills", prompt: "Add more reactive and change-of-direction work to my program", highlight: false },
    { label: "Shift to speed endurance", prompt: "Shift my program toward speed endurance and repeat sprint capacity", highlight: false },
    { label: "Reduce impact load", prompt: "Reduce the overall impact and ground contact load in my program", highlight: false },
    { label: "Improve footwork quality", prompt: "Add more footwork rhythm and timing quality work to my program", highlight: false },
  ],
  mobility: [
    { label: "Progress hip range work", prompt: "Progress the hip range of motion and end-range control work in my program", highlight: true },
    { label: "Add joint preparation", prompt: "Add more joint preparation and tissue tolerance work to my program", highlight: false },
    { label: "Shift to restoration focus", prompt: "Shift my program toward restoration and recovery focus", highlight: false },
    { label: "Reduce session intensity", prompt: "Reduce the intensity of my current mobility sessions", highlight: false },
    { label: "Target a new restriction", prompt: "Identify and add work to address a new movement restriction", highlight: false },
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
    if (name) return `I have your ${name} loaded. Tell me what to push or change.`;
    return pick(LIVE_FALLBACK_MESSAGES[focusMode], seed);
  }

  const phase = cleanPhrase(program.intelligenceStatus?.periodizationPhase);
  const directive = cleanPhrase(program.intelligenceStatus?.adaptationDirective, 80);
  const recovery = cleanPhrase(program.intelligenceStatus?.recoveryStatus);
  const hasRecentChange = !!program.whatChanged;

  // Priority 1: Phase + directive — most informative combination
  if (phase && directive) {
    return `We're in your ${phase}. ${directive}. What are we adjusting?`;
  }

  // Priority 2: Phase alone
  if (phase) {
    return `We're building through your ${phase}. Tell me what to push or change.`;
  }

  // Priority 3: Recovery/fatigue signal
  if (recovery) {
    const lower = recovery.toLowerCase();
    if (lower.includes("fatigue") || lower.includes("recovery") || lower.includes("deload")) {
      return "I'm tracking your recovery load. Pushing forward or pulling back today?";
    }
  }

  // Priority 4: Recent refinement
  if (hasRecentChange) {
    return "We recently refined your program. Tell me what to target next.";
  }

  // Priority 5: Program name
  const name = program.programName || systemName;
  if (name) {
    return `I have your ${name} loaded. Tell me what to push or change.`;
  }

  // Fallback
  return pick(LIVE_FALLBACK_MESSAGES[focusMode], seed);
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildAtlasContext(input: AtlasContextInput): AtlasContextOutput {
  const { focusMode, displayProgramSource, program, systemName, seed = 0 } = input;

  // ── No system ──
  if (displayProgramSource === "none") {
    const messages = NO_SYSTEM_MESSAGES[focusMode];
    // Defer to focusModeConfig chips via the pre-built NO_SYSTEM_CHIPS pool
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
