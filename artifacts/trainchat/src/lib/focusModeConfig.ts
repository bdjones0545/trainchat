/**
 * Focus Mode Configuration
 *
 * Per-mode visual identity, suggestion chips, empty-state copy, and
 * quick-action commands. This is the single place to change what each
 * mode looks and feels like — the shell itself stays constant.
 */

import type { FocusMode } from "./focusMode";

// ─── Visual Identity ──────────────────────────────────────────────────────────

export interface FocusModeTheme {
  /** Tailwind CSS variable name suffix for the primary accent (used in inline styles) */
  accentHsl: string;
  /** Background tint class applied to the main chat area */
  bgTintClass: string;
  /** Tab active text + ring color classes */
  tabActiveClass: string;
  /** Tab active border underline color class */
  tabUnderlineClass: string;
  /** Icon color used in the mode indicator */
  iconColorClass: string;
  /** Chip highlight classes for primary/active chips */
  chipHighlightClass: string;
}

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

export interface SuggestionChip {
  label: string;
  prompt: string;
  highlight: boolean;
}

// ─── Quick Actions (Agent Panel) ──────────────────────────────────────────────

export interface QuickAction {
  label: string;
  prompt: string;
}

// ─── Full Mode Config ─────────────────────────────────────────────────────────

export interface FocusModeConfig {
  id: FocusMode;
  label: string;
  shortLabel: string;
  description: string;
  emptyStateHeadline: string;
  emptyStateSubline: string;
  theme: FocusModeTheme;
  suggestionChips: SuggestionChip[];
  quickActions: QuickAction[];
}

// ─── Configs ──────────────────────────────────────────────────────────────────

const STRENGTH_CONFIG: FocusModeConfig = {
  id: "strength",
  label: "Strength",
  shortLabel: "Strength",
  description: "Lifting, hypertrophy, power-strength, and structural development",
  emptyStateHeadline: "Build your strength system",
  emptyStateSubline: "Describe your goal, constraints, or sport — I'll build it live.",
  theme: {
    accentHsl: "var(--primary)",
    bgTintClass: "",
    tabActiveClass: "text-foreground",
    tabUnderlineClass: "bg-primary",
    iconColorClass: "text-primary",
    chipHighlightClass: "text-primary border border-primary/50 bg-primary/10 hover:bg-primary/20 hover:border-primary/70",
  },
  suggestionChips: [
    { label: "Build a 4-day strength system", prompt: "Design a 4-day strength training system for me", highlight: true },
    { label: "Work around pain or injury", prompt: "Help me train around an injury or pain", highlight: false },
    { label: "More explosive power", prompt: "Add explosive power and strength to my program", highlight: false },
    { label: "Home gym program", prompt: "Build a strength program using only home gym equipment", highlight: false },
  ],
  quickActions: [
    { label: "More explosive", prompt: "Make this program more explosive and power-focused" },
    { label: "Less volume", prompt: "Reduce the overall volume in this program" },
    { label: "Recovery focus", prompt: "Shift this program toward recovery and tissue restoration" },
    { label: "More hypertrophy", prompt: "Bias this program toward hypertrophy and muscle building" },
    { label: "More intense", prompt: "Increase the intensity and load demands of this program" },
  ],
};

const SPEED_CONFIG: FocusModeConfig = {
  id: "speed",
  label: "Speed / Footwork",
  shortLabel: "Speed",
  description: "Acceleration, reactive output, change of direction, and footwork",
  emptyStateHeadline: "Build your speed system",
  emptyStateSubline: "Tell me your sport, position, or speed goal — I'll design it.",
  theme: {
    accentHsl: "var(--primary)",
    bgTintClass: "bg-[hsl(200,60%,98%)] dark:bg-[hsl(200,30%,8%)]",
    tabActiveClass: "text-sky-500 dark:text-sky-400",
    tabUnderlineClass: "bg-sky-500",
    iconColorClass: "text-sky-500 dark:text-sky-400",
    chipHighlightClass: "text-sky-600 dark:text-sky-400 border border-sky-500/50 bg-sky-500/10 hover:bg-sky-500/20 hover:border-sky-500/70",
  },
  suggestionChips: [
    { label: "Build a speed & acceleration program", prompt: "Design a speed and acceleration training program for me", highlight: true },
    { label: "Improve change of direction", prompt: "I need to improve my change of direction and agility", highlight: false },
    { label: "Add footwork & rhythm", prompt: "Build footwork, rhythm, and reactive drills into my program", highlight: false },
    { label: "In-season speed maintenance", prompt: "Design an in-season speed maintenance program for my sport", highlight: false },
  ],
  quickActions: [
    { label: "More acceleration", prompt: "Increase acceleration and drive phase development in this program" },
    { label: "More reactive", prompt: "Add more reactive and elastic output work to this program" },
    { label: "Reduce tendon load", prompt: "Reduce tendon and tissue stress load in this program" },
    { label: "More footwork", prompt: "Add more footwork rhythm and timing work to this program" },
    { label: "Recovery focus", prompt: "Shift this program toward recovery and return-to-speed preparation" },
  ],
};

const MOBILITY_CONFIG: FocusModeConfig = {
  id: "mobility",
  label: "Mobility",
  shortLabel: "Mobility",
  description: "Range of motion, joint control, positional quality, and restoration",
  emptyStateHeadline: "Build your mobility system",
  emptyStateSubline: "Tell me what you need to restore or unlock — I'll design the system.",
  theme: {
    accentHsl: "var(--primary)",
    bgTintClass: "bg-[hsl(160,30%,98%)] dark:bg-[hsl(160,20%,8%)]",
    tabActiveClass: "text-emerald-600 dark:text-emerald-400",
    tabUnderlineClass: "bg-emerald-500",
    iconColorClass: "text-emerald-600 dark:text-emerald-400",
    chipHighlightClass: "text-emerald-700 dark:text-emerald-400 border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/70",
  },
  suggestionChips: [
    { label: "Restore hip mobility", prompt: "Design a hip mobility and range of motion restoration program for me", highlight: true },
    { label: "Improve shoulder range", prompt: "I want to improve my shoulder range of motion and control", highlight: false },
    { label: "Joint prep for training", prompt: "Build a joint prep and movement quality routine for my training", highlight: false },
    { label: "Recovery & restoration flow", prompt: "Design a recovery and restoration mobility program for me", highlight: false },
  ],
  quickActions: [
    { label: "Open hips", prompt: "Add more hip mobility and end-range control work to this program" },
    { label: "Reduce stiffness", prompt: "Reduce tissue stiffness and add more tissue tolerance work" },
    { label: "More recovery", prompt: "Shift this program toward recovery and restoration" },
    { label: "Joint-friendly", prompt: "Make this program more joint-friendly and lower load" },
    { label: "Restore range", prompt: "Focus this program on restoring full range of motion" },
  ],
};

export const FOCUS_MODE_CONFIGS: Record<FocusMode, FocusModeConfig> = {
  strength: STRENGTH_CONFIG,
  speed: SPEED_CONFIG,
  mobility: MOBILITY_CONFIG,
};

export function getFocusModeConfig(mode: FocusMode): FocusModeConfig {
  return FOCUS_MODE_CONFIGS[mode];
}

