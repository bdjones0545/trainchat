/**
 * Focus Mode Configuration
 *
 * Per-mode visual identity, suggestion chips, empty-state copy, and
 * quick-action commands. This is the single place to change what each
 * mode looks and feels like — the shell itself stays constant.
 */

import type React from "react";
import type { FocusMode } from "./focusMode";

// ─── Visual Identity ──────────────────────────────────────────────────────────

export interface FocusModeTheme {
  /** Tailwind CSS variable name suffix for the primary accent (used in inline styles) */
  accentHsl: string;
  /** Hex primary color for this focus mode */
  primaryColor: string;
  /** rgba glow color at 0.35 opacity for this focus mode */
  glowColor: string;
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
  /** Filled pill active background for the mode switcher */
  pillActiveClass: string;
  /** Inline glow style for active pill */
  pillGlow: React.CSSProperties;
  /** Badge background class for active focus badge */
  badgeClass: string;
  /** Inline style for the "mode active" confirmation badge */
  badgeStyle: React.CSSProperties;
  /** Inline style for the hero outer radial glow halo */
  heroGlowOuter: React.CSSProperties;
  /** Inline style for the hero inner logo container */
  heroGlowInner: React.CSSProperties;
  /** Inline style for the full-area atmospheric background overlay */
  atmosphereStyle: React.CSSProperties;
  /** Label for the "X mode active" confirmation */
  confirmLabel: string;
  /** Lucide icon name to show in the switcher */
  iconName: "Dumbbell" | "Zap" | "Leaf";
  /** Inactive icon + label class */
  inactiveClass: string;
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

// ─── Atlas Messages ────────────────────────────────────────────────────────────

export interface AtlasMessages {
  /** Shown when no training system exists yet */
  noSystem: string[];
  /** Shown when a training system is active */
  withSystem: string[];
}

// ─── Full Mode Config ─────────────────────────────────────────────────────────

export interface FocusModeConfig {
  id: FocusMode;
  label: string;
  shortLabel: string;
  description: string;
  emptyStateHeadline: string;
  emptyStateSubline: string;
  /** Short explanation shown in the info popover */
  focusExplanation: string;
  theme: FocusModeTheme;
  suggestionChips: SuggestionChip[];
  quickActions: QuickAction[];
  /** Keywords that signal this mode (used for wrong-focus nudge) */
  keywords: string[];
  /** Conversational Atlas messages for the empty state */
  atlasMessages: AtlasMessages;
}

// ─── Configs ──────────────────────────────────────────────────────────────────

const STRENGTH_CONFIG: FocusModeConfig = {
  id: "strength",
  label: "Strength",
  shortLabel: "Strength",
  description: "Lifting, hypertrophy, power-strength, and structural development",
  emptyStateHeadline: "Build your strength system",
  emptyStateSubline: "Describe your goal, constraints, or sport — I'll build it live.",
  focusExplanation: "Builds lifting, hypertrophy, power-strength, and structural development programs",
  theme: {
    accentHsl: "var(--primary)",
    primaryColor: "#3B82F6",
    glowColor: "rgba(59, 130, 246, 0.35)",
    bgTintClass: "",
    tabActiveClass: "text-foreground",
    tabUnderlineClass: "bg-primary",
    iconColorClass: "text-primary",
    chipHighlightClass: "text-primary border border-primary/50 bg-primary/10 hover:bg-primary/20 hover:border-primary/70",
    pillActiveClass: "bg-primary text-white",
    pillGlow: { boxShadow: "0 0 14px rgba(59, 130, 246, 0.55)" },
    badgeClass: "bg-primary/15 text-primary border border-primary/30",
    badgeStyle: { color: "#3B82F6", borderColor: "#3B82F6", backgroundColor: "rgba(59, 130, 246, 0.1)" },
    heroGlowOuter: {
      background: "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.45) 0%, transparent 65%)",
      filter: "blur(14px)",
      transition: "background 250ms ease, filter 250ms ease",
    },
    heroGlowInner: {
      width: 80,
      height: 80,
      borderRadius: 22,
      background: "radial-gradient(ellipse at 40% 35%, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0.07) 100%)",
      border: "1px solid rgba(59, 130, 246, 0.32)",
      boxShadow: "0 0 24px rgba(59, 130, 246, 0.32), inset 0 1px 1px rgba(59, 130, 246, 0.20)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
    },
    atmosphereStyle: {
      background: "radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.07) 0%, transparent 60%)",
      transition: "background 250ms ease",
    },
    confirmLabel: "Strength mode active",
    iconName: "Dumbbell",
    inactiveClass: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
  },
  keywords: ["squat", "deadlift", "bench", "barbell", "dumbbell", "hypertrophy", "lift", "1rm", "strength", "powerlifting", "bodybuilding", "muscle"],
  atlasMessages: {
    noSystem: [
      "I'm Atlas. Tell me your goal — I'll architect the system around you.",
      "No training system yet. Describe your sport, schedule, or starting point and I'll build it.",
      "Ready to build your foundation. What are we training for?",
      "Every system starts with a conversation. Tell me what you want to achieve.",
    ],
    withSystem: [
      "Your strength system is live. Want to push harder, load differently, or adapt for today?",
      "I've been looking at your program. Ready to refine, intensify, or adjust the week?",
      "System active. Tell me what you want to change, add, or challenge.",
      "Your foundation is built. Where do we take it from here?",
    ],
  },
  suggestionChips: [
    { label: "Build a 3-day strength program", prompt: "Build me a 3-day strength program", highlight: true },
    { label: "Build a 4-day muscle program", prompt: "Build a 4-day muscle building program", highlight: true },
    { label: "Adjust for fat loss", prompt: "Build a fat-loss training plan for me", highlight: false },
    { label: "Work around knee pain", prompt: "Build a training program around knee pain", highlight: false },
    { label: "Dumbbells only", prompt: "Build a program using dumbbells only", highlight: false },
    { label: "Build a home gym program", prompt: "Build a strength program for a home gym", highlight: false },
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
  focusExplanation: "Builds sprint, acceleration, deceleration, agility, and footwork programs",
  theme: {
    accentHsl: "var(--primary)",
    primaryColor: "#06B6D4",
    glowColor: "rgba(6, 182, 212, 0.35)",
    bgTintClass: "bg-[hsl(200,60%,98%)] dark:bg-[hsl(200,30%,8%)]",
    tabActiveClass: "text-sky-500 dark:text-sky-400",
    tabUnderlineClass: "bg-sky-500",
    iconColorClass: "text-sky-500 dark:text-sky-400",
    chipHighlightClass: "text-sky-600 dark:text-sky-400 border border-sky-500/50 bg-sky-500/10 hover:bg-sky-500/20 hover:border-sky-500/70",
    pillActiveClass: "bg-sky-500 text-white",
    pillGlow: { boxShadow: "0 0 14px rgba(6, 182, 212, 0.55)" },
    badgeClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30",
    badgeStyle: { color: "#06B6D4", borderColor: "#06B6D4", backgroundColor: "rgba(6, 182, 212, 0.1)" },
    heroGlowOuter: {
      background: "radial-gradient(ellipse at center, rgba(6, 182, 212, 0.45) 0%, transparent 68%)",
      filter: "blur(16px)",
      transition: "background 250ms ease, filter 250ms ease",
    },
    heroGlowInner: {
      width: 80,
      height: 80,
      borderRadius: 22,
      background: "radial-gradient(ellipse at 40% 35%, rgba(6, 182, 212, 0.20) 0%, rgba(6, 182, 212, 0.06) 100%)",
      border: "1px solid rgba(6, 182, 212, 0.30)",
      boxShadow: "0 0 22px rgba(6, 182, 212, 0.32), inset 0 1px 1px rgba(6, 182, 212, 0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
    },
    atmosphereStyle: {
      background: "radial-gradient(ellipse at 50% 0%, rgba(6, 182, 212, 0.07) 0%, transparent 60%)",
      transition: "background 250ms ease",
    },
    confirmLabel: "Speed / Footwork mode active",
    iconName: "Zap",
    inactiveClass: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
  },
  keywords: ["sprint", "speed", "agility", "footwork", "acceleration", "deceleration", "change of direction", "reactive", "ladder", "cone", "fast feet"],
  atlasMessages: {
    noSystem: [
      "I'm Atlas. Speed is built in layers. Tell me your sport or movement goal.",
      "Acceleration starts with a system. What position, sport, or output are we optimizing?",
      "Fast athletes aren't born — they're engineered. Tell me what you're chasing.",
      "Let's build your speed foundation. What sport or performance target are we working toward?",
    ],
    withSystem: [
      "Your speed system is running. Want to push the acceleration ceiling or refine footwork quality?",
      "I've reviewed your program. Ready to dial in intensity, add reactive work, or adjust the load?",
      "You're building real speed. Tell me what you want to sharpen next.",
      "System active. Where do we push today — output, rhythm, or recovery?",
    ],
  },
  suggestionChips: [
    { label: "Build a football speed program", prompt: "Build a football speed program", highlight: true },
    { label: "Build a speed & acceleration program", prompt: "Build a speed and acceleration training program for me", highlight: true },
    { label: "Sharpen change of direction", prompt: "Build a program to improve my change of direction and agility", highlight: false },
    { label: "Work around knee pain", prompt: "Build a speed program around knee pain", highlight: false },
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
  focusExplanation: "Builds range-of-motion, joint control, and recovery-focused programs",
  theme: {
    accentHsl: "var(--primary)",
    primaryColor: "#10B981",
    glowColor: "rgba(16, 185, 129, 0.35)",
    bgTintClass: "bg-[hsl(160,30%,98%)] dark:bg-[hsl(160,20%,8%)]",
    tabActiveClass: "text-emerald-600 dark:text-emerald-400",
    tabUnderlineClass: "bg-emerald-500",
    iconColorClass: "text-emerald-600 dark:text-emerald-400",
    chipHighlightClass: "text-emerald-700 dark:text-emerald-400 border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/70",
    pillActiveClass: "bg-emerald-500 text-white",
    pillGlow: { boxShadow: "0 0 14px rgba(16, 185, 129, 0.55)" },
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
    badgeStyle: { color: "#10B981", borderColor: "#10B981", backgroundColor: "rgba(16, 185, 129, 0.1)" },
    heroGlowOuter: {
      background: "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.28) 0%, transparent 72%)",
      filter: "blur(24px)",
      transition: "background 250ms ease, filter 250ms ease",
    },
    heroGlowInner: {
      width: 80,
      height: 80,
      borderRadius: 22,
      background: "radial-gradient(ellipse at 40% 35%, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.04) 100%)",
      border: "1px solid rgba(16, 185, 129, 0.22)",
      boxShadow: "0 0 20px rgba(16, 185, 129, 0.16), inset 0 1px 1px rgba(16, 185, 129, 0.10)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
    },
    atmosphereStyle: {
      background: "radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.07) 0%, transparent 60%)",
      transition: "background 250ms ease",
    },
    confirmLabel: "Mobility mode active",
    iconName: "Leaf",
    inactiveClass: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
  },
  keywords: ["mobility", "flexibility", "range of motion", "hip", "shoulder mobility", "joint", "stretch", "restore", "recovery", "fascia", "tissue", "stiffness", "yoga"],
  atlasMessages: {
    noSystem: [
      "I'm Atlas. Your body has a story. Tell me what needs unlocking or restoring.",
      "Mobility work begins with honest assessment. What's tight, restricted, or holding you back?",
      "Recovery and range work is precise work. Tell me where you want to start.",
      "Let's build your mobility system. What are we restoring — hips, shoulders, or something deeper?",
    ],
    withSystem: [
      "Your mobility system is active. Want to deepen range, shift recovery focus, or address something specific?",
      "I've been tracking your program. Ready to progress the work or add a new target area?",
      "Restoration is a process. Tell me what's improved and where we go next.",
      "System active. Want to layer in more range work, or adjust today's focus?",
    ],
  },
  suggestionChips: [
    { label: "Restore hip mobility", prompt: "Design a hip mobility and range of motion restoration program for me", highlight: true },
    { label: "Unlock shoulder range", prompt: "I want to improve my shoulder range of motion and control", highlight: false },
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

/**
 * Detect if a message text contains strong signals for a different focus mode.
 * Returns the suggested mode or null if no mismatch detected.
 */
export function detectFocusMismatch(
  currentMode: FocusMode,
  text: string
): FocusMode | null {
  const lower = text.toLowerCase();
  const modes: FocusMode[] = ["strength", "speed", "mobility"];
  for (const mode of modes) {
    if (mode === currentMode) continue;
    const cfg = FOCUS_MODE_CONFIGS[mode];
    const matchCount = cfg.keywords.filter((kw) => lower.includes(kw)).length;
    if (matchCount >= 2) return mode;
  }
  return null;
}
