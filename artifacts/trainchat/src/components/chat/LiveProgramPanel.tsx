import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell, Save, CheckCircle, Loader2, Lock, Zap, PlayCircle,
  MessageSquare, ChevronDown, ChevronUp, TrendingUp, LayoutGrid,
  Calendar, Clock, RotateCcw, GitBranch, Activity, Layers,
  AlertCircle, RefreshCw, Send, Leaf, CheckCircle2,
} from "lucide-react";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";
import { customFetch } from "@workspace/api-client-react";
import type { ProgramStructure } from "./ChatOutput";
import BlockStatusCard from "@/components/training/BlockStatusCard";
import type { BuildStage } from "@/hooks/useStreamMessage";
import ExerciseLogInline, { type ProgressionTarget, type SetLog } from "@/components/training/ExerciseLogInline";
import CoachForecast from "./CoachForecast";
import LearnExerciseModal from "./LearnExerciseModal";
import ExerciseLearnButton from "./ExerciseLearnButton";
import {
  buildLearnExerciseData,
  type LearnExerciseData,
  type LearnExerciseContext,
} from "@/lib/learn-exercise";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FOCUS_MODE_CONFIGS, getFocusModeConfig } from "@/lib/focusModeConfig";
import type { FocusMode } from "@/lib/focusMode";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangeLogEntry {
  id: number;
  source: string;
  intent: string;
  scope: string;
  changeSummary: string;
  requestText?: string | null;
  isMajorVersion: boolean;
  versionLabel?: string | null;
  appliedCount: number;
  skippedCount: number;
  decisionMetadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BuildingState {
  isBuilding: boolean;
  stage: BuildStage | null;
  actionType?: string;
}

export interface ChangeTarget {
  type: "exercise_swap" | "exercise_update" | "exercise_added";
  originalExercise?: string;
  newExercise: string;
  exerciseId: number;
}

interface BlockMetadata {
  blockType?: string;
  blockDisplayName?: string;
  missionStatement?: string;
  weekProgressionArc?: string;
  primaryAdaptation?: string;
  volumeProfile?: string;
  intensityProfile?: string;
}

interface Props {
  program: ProgramStructure | null;
  buildingState?: BuildingState;
  onSave?: () => void;
  onFeedback?: () => void;
  onLogSession?: () => void;
  onUpgrade?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
  isPremium?: boolean;
  hasActiveSystem?: boolean;
  /** Saved program ID — used for progression tracking */
  savedProgramId?: number;
  /** Training goal — used for goal-differentiated progression */
  trainingGoal?: string;
  /** Increment when a program edit occurs — auto-navigates to Program tab and highlights change */
  newChangeSignal?: number;
  /** Increment when a new program is built — auto-switches to Program tab */
  newProgramSignal?: number;
  /** Change targets from the latest edit — used for highlighting and scrolling */
  changeTargets?: ChangeTarget[];
  /** Callback to send a coaching message — optionally with extra context (source, dayIndex, etc.) */
  onSendMessage?: (message: string, options?: Record<string, unknown>) => void;
  /** Callback to close the right panel — called automatically when a conversational action is dispatched */
  onClose?: () => void;
  /** Hint from the acknowledged intent during an active DIRECT_MUTATION stream */
  pendingChangeHint?: string;
  /** Summary of the last applied change — shown as a continuity chip in the panel header */
  lastChangeSummary?: string;
  /**
   * Identifies the source of the displayed program so the panel can label it correctly.
   *  "live"  — canonical DB-backed active training system
   *  "draft" — unsaved program generated in this browser session (not yet in DB)
   *  "none"  — no program to display
   */
  programSource?: "live" | "draft" | "none";
  /** Block phase metadata from the hierarchical planning system */
  blockMetadata?: BlockMetadata | null;
  /** Which focus lanes currently have an active program (used for focus tab indicators) */
  activeFocusModes?: { strength: boolean; speed: boolean; mobility: boolean };
  /** Called when the user clicks a focus tab in the sidebar to switch lanes */
  onFocusModeChange?: (mode: FocusMode) => void;
  /**
   * True while the weekly program data is being fetched from the DB (e.g. right
   * after a new program is saved). When true and program is null, the panel shows
   * a loading state instead of the "Ready to build" empty state.
   */
  isWeekDataLoading?: boolean;
}

type Tab = "program" | "changes" | "history" | "forecast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scopeColor(scope: string) {
  switch (scope) {
    case "exercise": return "text-blue-400 bg-blue-400/10";
    case "session": return "text-purple-400 bg-purple-400/10";
    case "week": return "text-amber-400 bg-amber-400/10";
    case "block": return "text-orange-400 bg-orange-400/10";
    case "system": return "text-primary bg-primary/10";
    default: return "text-muted-foreground bg-muted/30";
  }
}

// ─── Focus Badge — shows the active focus mode in the live program header ─────

function FocusBadge() {
  const { focusMode } = useFocusMode();
  const cfg = getFocusModeConfig(focusMode);
  const Icon = cfg.theme.iconName === "Dumbbell" ? Dumbbell : cfg.theme.iconName === "Zap" ? Zap : Leaf;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${cfg.theme.badgeClass}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.shortLabel}
    </span>
  );
}

// ─── Focus Mode Icon helper ───────────────────────────────────────────────────

function FocusIcon({ mode, className }: { mode: FocusMode; className?: string }) {
  const cfg = getFocusModeConfig(mode);
  const Icon = cfg.theme.iconName === "Dumbbell" ? Dumbbell : cfg.theme.iconName === "Zap" ? Zap : Leaf;
  return <Icon className={className ?? "w-3 h-3"} />;
}

// ─── Build phase helpers ───────────────────────────────────────────────────────

type BuildPhase = "init" | "structure" | "content" | "refine" | "save";

function getBuildPhase(stage: BuildStage | null): BuildPhase {
  if (!stage || stage === "understanding" || stage === "loading" || stage === "classifying") return "init";
  if (stage === "planning") return "structure";
  if (stage === "applying") return "content";
  if (stage === "validating") return "refine";
  return "save";
}

// ─── Program diff / edit-animation helpers ────────────────────────────────────

type DiffType = "added" | "swapped" | "volume" | "newday";

function computeProgramDiff(
  prev: ProgramStructure | null,
  next: ProgramStructure,
): Map<string, DiffType> {
  const diffs = new Map<string, DiffType>();

  // Initial load — mark all exercises as "added" for a reveal animation
  if (!prev) {
    next.days.forEach((day, dIdx) => {
      diffs.set(`d${dIdx}`, "newday");
      (day.exercises ?? []).forEach((_, eIdx) => {
        diffs.set(`d${dIdx}-e${eIdx}`, "added");
      });
    });
    return diffs;
  }

  next.days.forEach((nextDay, dIdx) => {
    const prevDay = prev.days[dIdx];

    if (!prevDay) {
      diffs.set(`d${dIdx}`, "newday");
      (nextDay.exercises ?? []).forEach((_, eIdx) => {
        diffs.set(`d${dIdx}-e${eIdx}`, "added");
      });
      return;
    }

    (nextDay.exercises ?? []).forEach((ex, eIdx) => {
      const prevEx = (prevDay.exercises ?? [])[eIdx];
      const key = `d${dIdx}-e${eIdx}`;
      if (!prevEx) {
        diffs.set(key, "added");
      } else if (prevEx.name !== ex.name) {
        diffs.set(key, "swapped");
      } else if (String(prevEx.sets) !== String(ex.sets) || prevEx.reps !== ex.reps) {
        diffs.set(key, "volume");
      }
    });
  });

  return diffs;
}

// ─── Day skeleton for building state ──────────────────────────────────────────

function DaySkeleton({ dayNum, showExercises, delayMs, shimmer }: {
  dayNum: number;
  showExercises: boolean;
  delayMs: number;
  shimmer?: boolean;
}) {
  const widths = ["w-28", "w-24", "w-32", "w-20"];
  const exWidths = [["w-32", "w-28", "w-24"], ["w-24", "w-28", "w-20"]];
  const exW = exWidths[dayNum % 2];

  return (
    <div
      className="bg-card border border-border/60 rounded-xl overflow-hidden"
      style={{
        animation: `fadeSlideIn 0.25s ease both`,
        animationDelay: `${delayMs}ms`,
      }}
    >
      <div className="flex items-center justify-between p-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
              Day {dayNum}
            </span>
          </div>
          <div
            className={`h-2.5 bg-muted/40 rounded-full ${shimmer ? "animate-pulse" : ""} ${widths[(dayNum - 1) % widths.length]}`}
          />
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/20" />
      </div>
      {showExercises && dayNum === 1 && (
        <div className="border-t border-border/40 divide-y divide-border/20">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="px-3 py-2.5"
              style={{
                animation: `fadeSlideIn 0.2s ease both`,
                animationDelay: `${i * 80}ms`,
              }}
            >
              <div className={`h-2.5 bg-muted/50 rounded-full animate-pulse mb-1.5 ${exW[i]}`} />
              <div className="flex gap-2">
                <div className="h-2 bg-muted/25 rounded-full animate-pulse w-14" />
                <div className="h-2 bg-muted/25 rounded-full animate-pulse w-14" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stage → sidebar status label ────────────────────────────────────────────

const SIDEBAR_STAGE_LABELS: Partial<Record<BuildStage, string>> = {
  understanding: "Reading your goal",
  loading:       "Setting up your build",
  classifying:   "Selecting block type",
  planning:      "Mapping weekly structure",
  applying:      "Assigning sessions & exercises",
  validating:    "Validating your system",
  saving:        "Finalizing your program",
};

function getSidebarLabel(stage: BuildStage | null, actionType?: string): string {
  if (!stage) return "Initializing…";
  if (actionType === "DIRECT_MUTATION" || actionType === "SESSION_ADJUSTMENT") {
    if (stage === "applying") return "Applying the change";
    if (stage === "saving") return "Saving your program";
  }
  return SIDEBAR_STAGE_LABELS[stage] ?? "Working…";
}

// ─── Full skeleton build state (new program) ───────────────────────────────────

function BuildingFromScratch({ stage, actionType }: { stage: BuildStage | null; actionType?: string }) {
  const phase = getBuildPhase(stage);
  const statusLabel = getSidebarLabel(stage, actionType);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sidebar-logo-breathe {
          0%, 100% { opacity: 0.7; filter: brightness(1); }
          50%       { opacity: 1;   filter: brightness(1.2); }
        }
      `}</style>

      {/* Panel header — premium build state */}
      <div className="p-4 border-b border-border flex-shrink-0 bg-primary/3">
        {/* Status indicator row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-shrink-0">
            <div
              className="absolute inset-0 rounded-full bg-primary/25 blur-[3px]"
              style={{ animation: "sidebar-logo-breathe 1.8s ease-in-out infinite" }}
            />
            <img
              src={trainChatLogo}
              alt=""
              className="relative w-4 h-4 object-contain"
              style={{ animation: "sidebar-logo-breathe 2s ease-in-out infinite" }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDuration: "1s" }} />
            <span className="text-[9px] font-bold text-primary uppercase tracking-[0.12em]">Building your system</span>
          </div>
        </div>

        {/* Current stage label */}
        <div className="px-2.5 py-1.5 bg-primary/8 border border-primary/15 rounded-lg">
          <p className="text-[11px] text-primary/80 font-medium leading-snug">{statusLabel}</p>
        </div>
      </div>

      {/* Skeleton body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {phase === "init" ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-card border border-border/40 rounded-xl h-12 animate-pulse"
                style={{ animationDelay: `${n * 80}ms` }}
              />
            ))}
          </div>
        ) : (
          [1, 2, 3, 4].map((n) => (
            <DaySkeleton
              key={n}
              dayNum={n}
              showExercises={phase === "content" || phase === "refine" || phase === "save"}
              delayMs={(n - 1) * 70}
              shimmer={phase === "refine"}
            />
          ))
        )}
      </div>

      {/* Save strip */}
      {phase === "save" && (
        <div
          className="flex-shrink-0 border-t border-green-500/20 bg-green-500/5 px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ animation: "fadeSlideIn 0.2s ease both" }}
        >
          <CheckCircle className="w-3.5 h-3.5 text-green-400 animate-pulse" style={{ animationDuration: "1.2s" }} />
          <span className="text-[11px] font-semibold text-green-400">Finalizing your program…</span>
        </div>
      )}
    </div>
  );
}

// ─── Updating overlay (existing program being modified) ────────────────────────

function UpdatingBadge({ phase, stage, actionType }: { phase: BuildPhase; stage: BuildStage | null; actionType?: string }) {
  const label = getSidebarLabel(stage, actionType);
  return (
    <div
      className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-card/92 border border-primary/20 backdrop-blur-sm rounded-full px-2.5 py-1"
      style={{ animation: "fadeSlideIn 0.2s ease both" }}
    >
      {phase === "save" ? (
        <>
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-[10px] font-semibold text-green-400">Saving…</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
          <span className="text-[10px] font-semibold text-primary max-w-[140px] truncate">{label}</span>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyProgramState({ buildingState }: { buildingState?: BuildingState }) {
  const isBuilding = !!buildingState?.isBuilding;
  const stageLabelText = isBuilding
    ? getSidebarLabel(buildingState?.stage ?? null, buildingState?.actionType)
    : null;

  const bullets = [
    "Builds in real time as you describe your goal",
    "Adapts instantly when you refine it",
    "Every change is tracked with a full history",
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative w-7 h-7 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {isBuilding && (
            <div className="absolute inset-0 bg-primary/10 animate-pulse rounded-xl" style={{ animationDuration: "1.6s" }} />
          )}
          <img src={trainChatLogo} alt="" className="relative w-4 h-4 object-contain" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-foreground tracking-wide">Live System</p>
          <p className="text-[10px] text-muted-foreground">Your training system builds here in real time</p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border/40 mb-4" />

      {/* Status line */}
      <div
        className={[
          "flex items-center gap-2.5 mb-4 px-3 py-2 rounded-lg border transition-all duration-300",
          isBuilding
            ? "bg-primary/8 border-primary/25"
            : "bg-muted/30 border-border/30",
        ].join(" ")}
      >
        <span
          className={[
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            isBuilding ? "bg-primary animate-pulse" : "bg-emerald-400/80",
          ].join(" ")}
        />
        <div className="min-w-0">
          <p
            className={[
              "text-[11px] font-semibold leading-none",
              isBuilding ? "text-primary" : "text-foreground/80",
            ].join(" ")}
          >
            {isBuilding ? "Building your system" : "Ready to build"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {isBuilding && stageLabelText
              ? stageLabelText
              : "Describe your goal to generate your program"}
          </p>
        </div>
      </div>

      {/* Bullets — hidden while building to reduce noise */}
      {!isBuilding && (
        <div className="space-y-2">
          {bullets.map((text, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-primary/40 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Focus-aware refinement chip definitions ──────────────────────────────────

interface GlobalChip {
  label: string;
  message: string;
  structuredIntent: string;
}

const FOCUS_GLOBAL_CHIPS: Record<FocusMode, GlobalChip[]> = {
  strength: [
    { label: "More Explosive",   message: "Make this strength program more explosive and power-focused",          structuredIntent: "strength_more_explosive" },
    { label: "More Strength",    message: "Make this program more strength focused",                               structuredIntent: "strength_more_strength" },
    { label: "More Endurance",   message: "Add more endurance work to this strength program",                     structuredIntent: "strength_more_endurance" },
    { label: "Shorter Sessions", message: "Shorten all strength sessions",                                        structuredIntent: "strength_shorten_sessions" },
    { label: "Lower Impact",     message: "Make this strength program lower impact",                              structuredIntent: "strength_lower_impact" },
    { label: "Home Gym Version", message: "Convert this strength program for a home gym",                        structuredIntent: "strength_home_gym" },
  ],
  speed: [
    { label: "More Acceleration",      message: "Shift this speed program toward acceleration and drive phase development", structuredIntent: "speed_more_acceleration" },
    { label: "More Max Velocity",      message: "Shift this speed program toward max velocity development",                structuredIntent: "speed_more_max_velocity" },
    { label: "More Reactive",          message: "Make this speed block more reactive and elastic",                        structuredIntent: "speed_more_reactive" },
    { label: "More Deceleration",      message: "Add more deceleration and change of direction work to this speed program", structuredIntent: "speed_more_deceleration" },
    { label: "Shorter Sessions",       message: "Shorten all speed sessions",                                             structuredIntent: "speed_shorten_sessions" },
    { label: "Lower Impact",           message: "Reduce impact but keep speed intent in this program",                    structuredIntent: "speed_lower_impact" },
    { label: "Home / Limited Space",   message: "Adapt this speed program for limited space training",                    structuredIntent: "speed_limited_space" },
  ],
  mobility: [
    { label: "More Hip Focus",          message: "Shift this mobility program toward hip mobility and end-range control",  structuredIntent: "mobility_more_hip_focus" },
    { label: "More Recovery Flow",      message: "Make this mobility program more recovery and restoration focused",        structuredIntent: "mobility_more_recovery_flow" },
    { label: "More End-Range Control",  message: "Increase end-range control emphasis in this mobility program",           structuredIntent: "mobility_end_range_control" },
    { label: "More Thoracic / Spine",   message: "Add more thoracic mobility and spine work to this program",             structuredIntent: "mobility_thoracic_spine" },
    { label: "Shorter Sessions",        message: "Shorten these mobility sessions",                                        structuredIntent: "mobility_shorten_sessions" },
    { label: "Lower Intensity",         message: "Lower the intensity of this mobility program",                          structuredIntent: "mobility_lower_intensity" },
    { label: "Desk Reset Version",      message: "Create a desk reset version of this mobility program",                  structuredIntent: "mobility_desk_reset" },
  ],
};

// ─── Focus-aware session action definitions ────────────────────────────────────

interface SessionAction {
  label: string;
  button?: string;
  structuredIntent: string;
  buildMessage: (dayNum: number) => string;
}

const FOCUS_SESSION_ACTIONS: Record<FocusMode, SessionAction[]> = {
  strength: [
    { label: "More Explosive", structuredIntent: "strength_day_more_explosive", buildMessage: (d) => `Make Day ${d} of this strength program more explosive` },
    { label: "Easier",         structuredIntent: "strength_day_easier",         button: "day_regression", buildMessage: (d) => `Make Day ${d} easier` },
    { label: "Harder",         structuredIntent: "strength_day_harder",         button: "day_progression", buildMessage: (d) => `Make Day ${d} harder` },
    { label: "Shorter",        structuredIntent: "strength_day_shorter",        buildMessage: (d) => `Make Day ${d} shorter` },
    { label: "Add Exercise",   structuredIntent: "strength_day_add_exercise",   button: "add_exercise", buildMessage: (d) => `Add a new exercise to Day ${d}` },
  ],
  speed: [
    { label: "More Acceleration", structuredIntent: "speed_day_more_acceleration", buildMessage: (d) => `Shift Day ${d} of this speed program toward acceleration` },
    { label: "More Reactive",     structuredIntent: "speed_day_more_reactive",     buildMessage: (d) => `Make Day ${d} of this speed block more reactive` },
    { label: "Easier",            structuredIntent: "speed_day_easier",            button: "day_regression", buildMessage: (d) => `Make Day ${d} easier` },
    { label: "Harder",            structuredIntent: "speed_day_harder",            button: "day_progression", buildMessage: (d) => `Make Day ${d} harder` },
    { label: "Shorter",           structuredIntent: "speed_day_shorter",           buildMessage: (d) => `Shorten Day ${d} of this speed program` },
    { label: "Add Drill",         structuredIntent: "speed_day_add_drill",         button: "add_exercise", buildMessage: (d) => `Add a new speed drill to Day ${d}` },
  ],
  mobility: [
    { label: "More Hip Focus",  structuredIntent: "mobility_day_more_hip_focus",  buildMessage: (d) => `Shift Day ${d} of this mobility program toward hip mobility` },
    { label: "More Recovery",   structuredIntent: "mobility_day_more_recovery",   buildMessage: (d) => `Make Day ${d} of this mobility program more recovery focused` },
    { label: "Easier",          structuredIntent: "mobility_day_easier",          button: "day_regression", buildMessage: (d) => `Make Day ${d} easier` },
    { label: "Harder",          structuredIntent: "mobility_day_harder",          button: "day_progression", buildMessage: (d) => `Make Day ${d} harder` },
    { label: "Shorter",         structuredIntent: "mobility_day_shorter",         buildMessage: (d) => `Shorten Day ${d} of this mobility program` },
    { label: "Add Movement",    structuredIntent: "mobility_day_add_movement",    button: "add_exercise", buildMessage: (d) => `Add a new mobility movement to Day ${d}` },
  ],
};

const EXERCISE_ACTIONS: { label: string; buildMessage: (name: string) => string }[] = [
  { label: "Swap", buildMessage: (n) => `Swap ${n} with something similar` },
  { label: "Easier", buildMessage: (n) => `Make ${n} easier` },
  { label: "Harder", buildMessage: (n) => `Make ${n} harder` },
];


const WEEK_ROLES: Record<number, string> = {
  1: "Establish",
  2: "Build",
  3: "Intensify",
  4: "Deload",
};

const WEEK_ROLE_COPY: Record<string, string> = {
  Establish: "Locking in movement quality and baseline volume.",
  Build:     "Higher volume and progressive overload this week.",
  Intensify: "Peak loading and force expression this week.",
  Deload:    "Reduced fatigue and recovery emphasis this week.",
};

function getWeekRole(weekNumber?: number | null): string | null {
  if (!weekNumber) return null;
  return WEEK_ROLES[weekNumber] ?? null;
}

function ProgramTab({
  program,
  programSource = "none",
  buildingState,
  onSave,
  onFeedback,
  onLogSession,
  onUpgrade,
  isSaving,
  isSaved,
  isPremium,
  savedProgramId,
  trainingGoal,
  changeTargets,
  newChangeSignal,
  pendingChangeHint,
  lastChangeSummary,
  onSendMessage,
  onClose,
  blockMetadata,
}: Omit<Props, "hasActiveSystem">) {
  const queryClient = useQueryClient();
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const prevProgramRef = useRef<ProgramStructure | null>(null);
  const pinnedProgramKey = useRef<string | null>(null);
  const [animatedKeys, setAnimatedKeys] = useState<Map<string, DiffType>>(new Map());
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refinement state ─────────────────────────────────────────────────────
  const [pendingRefinement, setPendingRefinement] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [showProgramUpdated, setShowProgramUpdated] = useState(false);

  // ── Week selector state ──────────────────────────────────────────────────
  const currentWeekNum = program?.weekNumber ?? null;
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeekNum ?? 1);

  useEffect(() => {
    if (currentWeekNum !== null) setSelectedWeek(currentWeekNum);
  }, [currentWeekNum]);

  const { data: altWeekData, isLoading: altWeekLoading } = useQuery({
    queryKey: ["week-view-select", selectedWeek],
    queryFn: () => customFetch<any>(`/api/training-system/week?weekNumber=${selectedWeek}`),
    enabled: !!isSaved && currentWeekNum !== null && selectedWeek !== currentWeekNum,
    staleTime: 30_000,
  });

  // ── Current-week DB data for exercise ID lookup (needed for direct edits) ──
  const { focusMode: panelFocusMode } = useFocusMode();
  const { data: currentWeekDbData } = useQuery({
    queryKey: ["live-panel-week-ids", savedProgramId, panelFocusMode],
    queryFn: () => {
      const url = panelFocusMode
        ? `/api/training-system/week?focus=${encodeURIComponent(panelFocusMode)}`
        : "/api/training-system/week";
      return customFetch<any>(url);
    },
    enabled: !!isSaved,
    staleTime: 60_000,
  });

  const exerciseIdMap = useMemo(() => {
    const map = new Map<string, number>();
    const sessions = (currentWeekDbData as any)?.sessions ?? [];
    for (const session of sessions) {
      for (const ex of (session.exercises ?? []) as Array<{ id?: number; name?: string }>) {
        if (typeof ex.id === "number" && ex.name) {
          map.set(ex.name.toLowerCase(), ex.id);
        }
      }
    }
    return map;
  }, [currentWeekDbData]);

  // ── Learn Exercise modal state (centralized) ─────────────────────────────
  const [learnModalOpen, setLearnModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<LearnExerciseData | null>(null);
  const [selectedContext, setSelectedContext] = useState<LearnExerciseContext | null>(null);

  function handleOpenLearnExercise(
    exercise: LearnExerciseData,
    context: LearnExerciseContext,
  ) {
    setSelectedExercise(exercise);
    setSelectedContext(context);
    setLearnModalOpen(true);
  }

  function handleCloseLearnExercise() {
    setLearnModalOpen(false);
  }
  const programUpdatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBuildingRef = useRef(false);

  // Clear loading state + flash "Program Updated" when stream completes
  useEffect(() => {
    const isBuilding = !!buildingState?.isBuilding;
    if (prevBuildingRef.current && !isBuilding && pendingRefinement) {
      setPendingRefinement(null);
      setShowProgramUpdated(true);
      if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
      programUpdatedTimerRef.current = setTimeout(() => setShowProgramUpdated(false), 3000);
    }
    prevBuildingRef.current = isBuilding;
    return () => {
      if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
    };
  }, [buildingState?.isBuilding, pendingRefinement]);

  function sendRefinement(
    message: string,
    key: string,
    options?: Record<string, unknown>,
  ) {
    if (!onSendMessage || buildingState?.isBuilding) return;
    setPendingRefinement(key);
    const payload = { source: "right_panel", ...options };
    console.log("[SidebarEditExecutionAudit]", {
      buttonPressed: key,
      focusMode: panelFocusMode,
      commandSent: message,
      structuredIntent: options?.structuredIntent ?? null,
      interactionType: options?.interactionType ?? null,
      payload,
    });
    onSendMessage(message, payload);
    onClose?.();
  }

  function handleRefineSubmit() {
    const msg = refineInput.trim();
    if (!msg || !onSendMessage || buildingState?.isBuilding) return;
    setRefineInput("");
    sendRefinement(msg, "refine-input", { interactionType: "freeform_refine" });
  }

  // ── Direct exercise edit — bypasses chat, calls edit API deterministically ─
  async function handleDirectExerciseEdit(
    exerciseName: string,
    action: "easier" | "harder" | "swap",
    actionKey: string,
  ) {
    if (buildingState?.isBuilding) return;
    const request =
      action === "easier" ? `Make ${exerciseName} easier`
      : action === "harder" ? `Make ${exerciseName} harder`
      : `Swap ${exerciseName} with something similar`;

    const exerciseId = exerciseIdMap.get(exerciseName.toLowerCase());
    if (!exerciseId) {
      sendRefinement(request, actionKey, {
        exerciseId: exerciseName,
        interactionType: "exercise_action",
      });
      return;
    }

    setPendingRefinement(actionKey);
    try {
      await customFetch<any>("/api/training-system/edit", {
        method: "POST",
        body: JSON.stringify({
          request,
          source: "quick_action",
          targetContext: {
            type: "exercise",
            id: exerciseId,
            label: exerciseName,
          },
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["live-panel-week-ids"] });
      setPendingRefinement(null);
      setShowProgramUpdated(true);
      if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
      programUpdatedTimerRef.current = setTimeout(() => setShowProgramUpdated(false), 3000);
    } catch {
      setPendingRefinement(null);
      sendRefinement(request, actionKey, {
        exerciseId: exerciseName,
        interactionType: "exercise_action",
      });
    }
  }

  // ── Active session state (server-backed) ─────────────────────────────────

  type ServerSessionStatus = "not_started" | "in_progress" | "completed";
  interface ActiveSessionData {
    id?: number;
    status: ServerSessionStatus;
    startedAt?: string;
    completedAt?: string;
    savedProgramId?: number;
    dayNumber?: number;
  }

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery<ActiveSessionData>({
    queryKey: ["active-session"],
    queryFn: () => customFetch<ActiveSessionData>("/api/active-session"),
    enabled: !!isPremium && !!isSaved,
    staleTime: 0,
  });

  const serverStatus: ServerSessionStatus = activeSessionData?.status ?? "not_started";

  // Local mode for this browser visit: controls inline exercise logging UI
  type LocalMode = "idle" | "active" | "completed";
  const [localMode, setLocalMode] = useState<LocalMode>("idle");
  const [sessionLogs, setSessionLogs] = useState<Map<string, SetLog[]>>(new Map());
  const [sessionCompleting, setSessionCompleting] = useState(false);
  const [sessionResult, setSessionResult] = useState<{ progressions: string[] } | null>(null);

  // Derived 4-state mode for the session banner UI
  type SessionMode = "idle" | "resume" | "active" | "completed";
  function getSessionMode(): SessionMode {
    if (localMode === "completed" || serverStatus === "completed") return "completed";
    if (localMode === "active") return "active";
    if (serverStatus === "in_progress") return "resume";
    return "idle";
  }
  const sessionMode = getSessionMode();

  const startSessionMutation = useMutation({
    mutationFn: (data: { savedProgramId?: number; dayNumber?: number }) =>
      customFetch<ActiveSessionData>("/api/active-session/start", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setLocalMode("active");
      queryClient.invalidateQueries({ queryKey: ["active-session"] });
    },
  });

  function handleStartOrResume() {
    const dayNum = expandedDay !== null
      ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1)
      : undefined;

    if (serverStatus === "not_started") {
      startSessionMutation.mutate({
        savedProgramId: savedProgramId ?? undefined,
        dayNumber: dayNum,
      });
    } else {
      // Already in_progress on the server — just transition local mode
      setLocalMode("active");
    }
  }

  function handleSetsChange(exerciseName: string, sets: SetLog[]) {
    setSessionLogs((prev) => {
      const next = new Map(prev);
      next.set(exerciseName, sets);
      return next;
    });
  }

  async function completeSession() {
    if (sessionCompleting) return;
    setSessionCompleting(true);

    const exercises = Array.from(sessionLogs.entries()).map(([exerciseName, sets]) => ({
      exerciseName,
      sets,
    }));

    try {
      const result = await customFetch<{ progressions: string[] }>("/api/session-logs/complete", {
        method: "POST",
        body: JSON.stringify({
          savedProgramId: savedProgramId ?? undefined,
          dayNumber: expandedDay !== null ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1) : undefined,
          exercises,
          goal: trainingGoal ?? "general_fitness",
        }),
      });
      setSessionResult(result);
      setLocalMode("completed");

      // Persist completed status to server
      customFetch("/api/active-session/complete", { method: "POST" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["active-session"] });
        })
        .catch(() => {});

      setTimeout(() => refetchTargets(), 600);
      queryClient.invalidateQueries({ queryKey: ["training-system-history", "changes"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    } catch {
      setSessionCompleting(false);
    } finally {
      setSessionCompleting(false);
    }
  }

  function resetSession() {
    setLocalMode("idle");
    setSessionLogs(new Map());
    setSessionResult(null);
    refetchActiveSession();
  }

  // ── Progression targets ───────────────────────────────────────────────────
  const allExerciseNames = (program?.days ?? [])
    .flatMap((d) => d.exercises ?? [])
    .map((e) => e.name)
    .filter(Boolean);

  const { data: targetsData, refetch: refetchTargets } = useQuery<{ targets: ProgressionTarget[] }>({
    queryKey: ["progressionTargets", savedProgramId, allExerciseNames.join(","), trainingGoal],
    enabled: !!isPremium && !!isSaved && allExerciseNames.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({
        exerciseNames: allExerciseNames.join(","),
        ...(savedProgramId ? { programId: String(savedProgramId) } : {}),
        ...(trainingGoal ? { goal: trainingGoal } : {}),
      });
      return customFetch<{ targets: ProgressionTarget[] }>(`/api/exercise-logs/targets?${params.toString()}`);
    },
    staleTime: 30000,
  });

  const targetsMap = new Map<string, ProgressionTarget>(
    (targetsData?.targets ?? []).map((t) => [t.exerciseName, t]),
  );

  const handleExerciseLogged = useCallback(() => {
    setTimeout(() => refetchTargets(), 400);
  }, [refetchTargets]);

  // ── Change-highlight state ────────────────────────────────────────────────
  const [highlightedNames, setHighlightedNames] = useState<Set<string>>(new Set());
  const [inlineLabels, setInlineLabels] = useState<Map<string, string>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollName = useRef<string | null>(null);
  const exerciseRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevChangeSignalRef2 = useRef(0);

  // When a new change signal fires, set up highlights and find the day to expand
  useEffect(() => {
    if (!newChangeSignal || newChangeSignal === prevChangeSignalRef2.current) return;
    if (!changeTargets?.length) return;
    prevChangeSignalRef2.current = newChangeSignal;

    const names = new Set<string>();
    const labels = new Map<string, string>();

    for (const target of changeTargets) {
      names.add(target.newExercise);
      if (target.type === "exercise_swap" && target.originalExercise) {
        labels.set(target.newExercise, `${target.originalExercise} → ${target.newExercise}`);
      } else if (target.type === "exercise_added") {
        labels.set(target.newExercise, `Added: ${target.newExercise}`);
      }
    }

    setHighlightedNames(names);
    setInlineLabels(labels);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedNames(new Set());
      setInlineLabels(new Map());
    }, 8000);

    // Find the day containing the first target and expand it
    const firstTarget = changeTargets[0];
    pendingScrollName.current = firstTarget.newExercise;

    if (program) {
      const dayIdx = program.days.findIndex((d) =>
        (d.exercises ?? []).some((e) => e.name === firstTarget.newExercise)
      );
      if (dayIdx !== -1) {
        setExpandedDay(dayIdx);
      }
    }
  }, [newChangeSignal]);

  // After expandedDay changes and pendingScrollName is set, scroll to the exercise
  useEffect(() => {
    if (!pendingScrollName.current) return;
    const name = pendingScrollName.current;
    const timer = setTimeout(() => {
      const el = exerciseRefs.current.get(name);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        pendingScrollName.current = null;
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [expandedDay]);

  // When program updates (after query invalidation), try pending scroll again
  useEffect(() => {
    if (!pendingScrollName.current || !program) return;
    const name = pendingScrollName.current;
    // Find the day in the new program data
    const dayIdx = program.days.findIndex((d) =>
      (d.exercises ?? []).some((e) => e.name === name)
    );
    if (dayIdx !== -1) {
      setExpandedDay(dayIdx);
    }
  }, [program]);

  // Reset local session mode when user switches to a different day
  // Server status is preserved — the CTA will correctly show "Resume Session"
  const prevExpandedDay = useRef<number | null>(null);
  useEffect(() => {
    if (expandedDay !== prevExpandedDay.current) {
      prevExpandedDay.current = expandedDay;
      if (localMode !== "idle") {
        setLocalMode("idle");
        setSessionLogs(new Map());
        setSessionResult(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDay]);

  // Pin expanded day to today's session on initial program load and after each new build.
  // Uses dayOfWeek preserved in the ProgramDay by transformSystemToProgram.
  // Falls back to Day 1 (index 0) when today has no scheduled session.
  useEffect(() => {
    if (!program) return;
    const key = `${program.programName}::${program.days?.length ?? 0}`;
    if (pinnedProgramKey.current === key) return;
    pinnedProgramKey.current = key;
    const todayDow = new Date().getDay();
    const idx = (program.days ?? []).findIndex((d) => d.dayOfWeek === todayDow);
    setExpandedDay(idx >= 0 ? idx : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programName, program?.days?.length]);

  useEffect(() => {
    const prev = prevProgramRef.current;
    if (program && prev !== program) {
      const diffs = computeProgramDiff(prev, program);
      if (diffs.size > 0) {
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        setAnimatedKeys(diffs);
        animTimerRef.current = setTimeout(() => setAnimatedKeys(new Map()), 2000);
      }
    }
    prevProgramRef.current = program ?? null;
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [program]);

  if (!program) return <EmptyProgramState buildingState={buildingState} />;

  const days = program.days ?? [];
  const lockedDayCount = isPremium ? 0 : Math.max(0, days.length - 1);
  const showPaywall = !isPremium && days.length > 1;

  // When a different week is selected, transform that week's API response into
  // the same shape as program.days so the rendering layer is identical.
  const viewingAltWeek = !!altWeekData && selectedWeek !== currentWeekNum;
  const viewDays = viewingAltWeek
    ? (altWeekData.sessions ?? [])
        .filter((s: any) => !s.isRestDay)
        .map((s: any, idx: number) => ({
          dayNumber: idx + 1,
          name: s.label,
          focus: s.emphasis ?? undefined,
          dayOfWeek: s.dayOfWeek ?? undefined,
          exercises: (s.exercises ?? []).map((ex: any) => ({
            name: ex.name,
            sets: typeof ex.sets === "number" ? ex.sets : 3,
            reps: ex.reps ?? "10",
            rest: ex.rest ?? "60s",
            notes: ex.notes ?? undefined,
          })),
          notes: s.coachingNotes ?? undefined,
        }))
    : days;

  const isUpdating = buildingState?.isBuilding && !!program;
  const updatePhase = isUpdating ? getBuildPhase(buildingState!.stage) : null;

  const weekRole = getWeekRole(program.weekNumber);
  const blockName = blockMetadata?.blockDisplayName ?? null;
  const hierarchyParts = [
    blockName,
    program.weekNumber ? `Week ${program.weekNumber} of 4` : null,
    weekRole,
  ].filter(Boolean) as string[];

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <style>{`
        @keyframes ex-added {
          0%   { background: rgba(34,197,94,0.18); box-shadow: 0 0 0 1px rgba(34,197,94,0.45) inset; }
          55%  { background: rgba(34,197,94,0.08); box-shadow: 0 0 0 1px rgba(34,197,94,0.2) inset; }
          100% { background: transparent; box-shadow: none; }
        }
        @keyframes ex-swapped {
          0%   { background: rgba(59,130,246,0.18); box-shadow: 0 0 0 1px rgba(59,130,246,0.45) inset; }
          55%  { background: rgba(59,130,246,0.08); box-shadow: 0 0 0 1px rgba(59,130,246,0.2) inset; }
          100% { background: transparent; box-shadow: none; }
        }
        @keyframes day-new {
          0%   { background: rgba(34,197,94,0.12); box-shadow: 0 0 0 1px rgba(34,197,94,0.35) inset; opacity: 0; transform: translateY(8px); }
          25%  { opacity: 1; transform: translateY(0); }
          70%  { background: rgba(34,197,94,0.05); box-shadow: 0 0 0 1px rgba(34,197,94,0.15) inset; }
          100% { background: transparent; box-shadow: none; }
        }
        @keyframes vol-flash {
          0%,20% { color: rgb(251,191,36); }
          100%   { color: inherit; }
        }
        @keyframes ex-highlight-glow {
          0%   { background: rgba(99,102,241,0.22); box-shadow: 0 0 0 1.5px rgba(99,102,241,0.55) inset, 0 0 12px rgba(99,102,241,0.2); }
          40%  { background: rgba(99,102,241,0.12); box-shadow: 0 0 0 1px rgba(99,102,241,0.3) inset; }
          100% { background: transparent; box-shadow: none; }
        }
        @keyframes ex-name-fadein {
          0%   { opacity: 0; transform: translateY(-3px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes badge-pop {
          0%   { opacity: 0; transform: scale(0.7); }
          40%  { opacity: 1; transform: scale(1.05); }
          60%  { transform: scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes label-fade {
          0%,60% { opacity: 1; }
          100%   { opacity: 0; }
        }
      `}</style>
      {isUpdating && updatePhase && (
        <UpdatingBadge phase={updatePhase} stage={buildingState!.stage} actionType={buildingState?.actionType} />
      )}

      {/* Stream preview banner — shown while AI is modifying the program */}
      {isUpdating && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-primary/8 border-b border-primary/15"
          style={{ animation: "fadeSlideIn 0.2s ease both" }}
        >
          <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />
          <span className="text-[10px] font-semibold text-primary truncate">
            {pendingChangeHint
              ? `Applying: ${pendingChangeHint}`
              : "Updating your program…"}
          </span>
        </div>
      )}

      {/* ─── Scrollable content body ──────────────────────────────────────────
           flex-1 + min-h-0 ensure this expands to fill the remaining panel
           height. overflow-y-auto + -webkit-overflow-scrolling:touch give
           smooth momentum scrolling on mobile Safari / WKWebView.           */}
      <div
        ref={scrollAreaRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >

      {/* ── Program Summary Card ───────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        {/* Live status row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" style={{ animationDuration: "2s" }} />
            <span className="text-[9px] font-bold text-primary uppercase tracking-[0.14em] truncate">
              Live Program
            </span>
          </div>
          <FocusBadge />
          {!isPremium && (
            <span className="ml-auto text-[9px] font-semibold text-amber-400/80 flex items-center gap-1 flex-shrink-0">
              <Lock className="w-2.5 h-2.5" /> Preview
            </span>
          )}
        </div>

        {/* Program title + draft label */}
        <div className="flex items-start gap-2 mb-2.5">
          <h3 className="text-[15px] font-bold text-foreground leading-snug tracking-tight flex-1">
            {program.programName}
          </h3>
          {programSource === "draft" && (
            <span className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-[9px] font-semibold text-amber-400 uppercase tracking-wider">
              Draft — not saved
            </span>
          )}
        </div>

        {/* Hierarchy breadcrumb — block phase · week number · week role */}
        {hierarchyParts.length > 0 && (
          <div className="mb-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground/70 tracking-wide leading-snug">
              {hierarchyParts.join(" · ")}
            </p>
            {weekRole && WEEK_ROLE_COPY[weekRole] && (
              <p className="text-[10px] text-muted-foreground/48 leading-relaxed mt-0.5">
                {WEEK_ROLE_COPY[weekRole]}
              </p>
            )}
          </div>
        )}

        {/* Week selector — W1-W4 tabs, shown when program is DB-backed and has a weekNumber */}
        {isSaved && currentWeekNum && (
          <div className="flex items-center gap-1 mb-2.5">
            {[1, 2, 3, 4].map((wk) => {
              const isSelected = selectedWeek === wk;
              const isCurrent = wk === currentWeekNum;
              return (
                <button
                  key={wk}
                  onClick={() => setSelectedWeek(wk)}
                  className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    isSelected
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground/55 hover:text-muted-foreground border border-transparent hover:border-border/40 hover:bg-muted/30"
                  }`}
                >
                  W{wk}
                  {isCurrent && (
                    <span className="ml-0.5 text-[7px] text-primary/60 align-middle">●</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Meta chips */}
        {(program.splitType || days.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            {program.splitType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 border border-border/60 text-[10px] text-muted-foreground font-medium">
                <LayoutGrid className="w-3 h-3 opacity-60" />
                {program.splitType}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 border border-border/60 text-[10px] text-muted-foreground font-medium">
              <Dumbbell className="w-3 h-3 opacity-60" />
              {days.length} days/week
            </span>
          </div>
        )}

        {/* Description — clamped to 3 lines */}
        {program.description && (
          <p
            className="text-[11px] text-foreground/65 leading-relaxed mb-3"
            style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {program.description}
          </p>
        )}

        {/* Last change continuity */}
        {!isUpdating && lastChangeSummary && (
          <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400/70 flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground/70 truncate leading-snug">
              Last change: {lastChangeSummary}
            </span>
          </div>
        )}

        {/* Program Updated flash */}
        {showProgramUpdated && (
          <div
            className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20"
            style={{ animation: "fadeSlideIn 0.2s ease both" }}
          >
            <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-green-400">Program Updated</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving || isSaved}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                isSaved
                  ? "bg-green-500/15 border border-green-500/30 text-green-400 cursor-default"
                  : isSaving
                  ? "bg-primary/10 border border-primary/20 text-primary/60 cursor-not-allowed"
                  : "bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 active:scale-[0.98]"
              }`}
            >
              {isSaved ? (
                <><CheckCircle className="w-3 h-3" /> Saved to System</>
              ) : isSaving ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-3 h-3" /> Save to My System</>
              )}
            </button>
          )}
          {onLogSession && isSaved && isPremium && (
            <button
              onClick={onLogSession}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-semibold border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-all duration-150"
            >
              <PlayCircle className="w-3 h-3" /> Log
            </button>
          )}
          {onFeedback && isSaved && (
            <button
              onClick={onFeedback}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Refinement Section: Chips + Freeform Input ─────────────────────── */}
      {onSendMessage && (
        <div className="px-4 py-3.5 border-b border-border space-y-3">
          {/* Section label */}
          <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.14em]">
            Refine this program
          </p>

          {/* Global chips — 36px height, focus-aware */}
          <div className="flex flex-wrap gap-2">
            {(FOCUS_GLOBAL_CHIPS[panelFocusMode] ?? FOCUS_GLOBAL_CHIPS.strength).map((chip) => {
              const key = `global-${chip.label}`;
              const isLoading = pendingRefinement === key;
              const isDisabled = !!buildingState?.isBuilding;
              return (
                <button
                  key={chip.label}
                  onClick={() => sendRefinement(chip.message, key, {
                    interactionType: "global_chip",
                    structuredIntent: chip.structuredIntent,
                    focusMode: panelFocusMode,
                  })}
                  disabled={isDisabled}
                  className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-[11px] font-semibold border transition-all duration-150 active:scale-95 select-none ${
                    isLoading
                      ? "bg-primary/15 border-primary/50 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent/60"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  )}
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Freeform refine input */}
          <div>
            <div
              className={`flex items-center gap-2 rounded-xl border bg-muted/20 px-3 transition-colors ${
                buildingState?.isBuilding ? "opacity-50" : "border-border focus-within:border-primary/40 focus-within:bg-muted/30"
              }`}
              style={{ minHeight: 48 }}
            >
              <input
                type="text"
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefineSubmit(); } }}
                disabled={!!buildingState?.isBuilding}
                placeholder="Refine this program…"
                className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none py-2.5 min-w-0"
              />
              <button
                onClick={handleRefineSubmit}
                disabled={!refineInput.trim() || !!buildingState?.isBuilding}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {pendingRefinement === "refine-input" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/45 leading-relaxed px-1">
              Try: "add more jumps to day 1" or "make day 2 shorter"
            </p>
          </div>
        </div>
      )}

      {/* What Changed / Why Changed */}
      {(program.whatChanged || program.whyChanged) && (
        <div className="px-4 py-2.5 border-b border-border bg-amber-400/5">
          <div className="flex items-start gap-2">
            <Activity className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1.5 min-w-0">
              {program.whatChanged && (
                <div>
                  <p className="text-[9px] font-bold text-amber-400 uppercase tracking-[0.1em] mb-0.5">What Changed</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{program.whatChanged}</p>
                </div>
              )}
              {program.whyChanged && (
                <div>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-0.5">Why</p>
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed italic">{program.whyChanged}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progression strategy */}
      {program.progressionStrategy && (
        <div className="px-4 py-2.5 border-b border-border bg-primary/5">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.1em] mb-0.5">Progression</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{program.progressionStrategy}</p>
            </div>
          </div>
        </div>
      )}

      {/* Week role notice — shown only for Deload and Intensify weeks where context adds clarity */}
      {(weekRole === "Deload" || weekRole === "Intensify") && (
        <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
          <div className={`w-1 h-3 rounded-full flex-shrink-0 ${weekRole === "Deload" ? "bg-amber-400/60" : "bg-blue-400/70"}`} />
          <p className="text-[10px] text-muted-foreground/65 leading-snug">
            {weekRole === "Deload" ? "Deload week — reduced fatigue" : "Intensify week — peak loading"}
          </p>
        </div>
      )}

      {/* Days */}
      <div className="p-3 space-y-2">
        {altWeekLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
          </div>
        )}
        {!altWeekLoading && viewDays.map((day, idx) => {
          const isLocked = !isPremium && idx > 0;
          const isExpanded = expandedDay === idx;
          const dayDiff = animatedKeys.get(`d${idx}`);

          return (
            <div key={idx}>
              {/* Inline paywall — sits between Day 1 and Day 2, inside the scroll flow */}
              {showPaywall && idx === 1 && (
                <div className="rounded-xl border border-primary/20 bg-card p-5 text-center mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 mx-auto">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="text-sm font-bold text-foreground mb-1">
                    Unlock your full {days.length}-day program
                  </h4>
                  <p className="text-[11px] text-muted-foreground mb-1 leading-relaxed">
                    Continue building your system with the AI — all future edits included.
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mb-4">
                    {lockedDayCount} more day{lockedDayCount === 1 ? "" : "s"} below
                  </p>
                  {onUpgrade && (
                    <button
                      onClick={onUpgrade}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
                    >
                      <Zap className="w-3.5 h-3.5" /> Unlock Full Program
                    </button>
                  )}
                </div>
              )}

              {/* Day card — full for Day 1, teaser header only for locked days */}
              {isLocked ? (
                <div
                  className="bg-card border border-border/30 rounded-xl overflow-hidden opacity-40"
                  style={dayDiff === "newday" ? { animation: "day-new 1.8s ease forwards" } : undefined}
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/40 text-muted-foreground/60">
                          Day {day.dayNumber}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-muted-foreground/70 truncate">
                        {day.name}
                      </p>
                      {day.focus && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">{day.focus}</p>
                      )}
                    </div>
                    <Lock className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 ml-2" />
                  </div>
                </div>
              ) : (
                <div
                  className={`bg-card border rounded-xl overflow-hidden transition-colors duration-300 ${
                    isExpanded ? "border-primary/30" : "border-border"
                  }`}
                  style={dayDiff === "newday" ? { animation: "day-new 1.8s ease forwards" } : undefined}
                >
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : idx)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        {/* Mode-aware session type badge */}
                        {(() => {
                          const sessionCfg = getFocusModeConfig(panelFocusMode);
                          const sessionTypeLabel = panelFocusMode === "strength" ? "Lifting" : panelFocusMode === "speed" ? "Speed Session" : "Mobility Flow";
                          return (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              isExpanded ? `${sessionCfg.theme.pillActiveClass}` : `${sessionCfg.theme.badgeClass}`
                            }`}>
                              <FocusIcon mode={panelFocusMode} className="w-2.5 h-2.5" />
                              {sessionTypeLabel}
                            </span>
                          );
                        })()}
                        <span className="text-[9px] text-muted-foreground/40 font-medium">Day {day.dayNumber}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-foreground truncate">
                        {day.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {day.focus || `${day.exercises?.length ?? 0} exercises`}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {/* Session banner — Start / Resume / Active / Completed */}
                      {isPremium && isSaved && (
                        <div className="px-3 py-2.5">
                          {sessionMode === "idle" && (
                            <button
                              onClick={handleStartOrResume}
                              disabled={startSessionMutation.isPending}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-green-500/30 text-green-400 text-[11px] font-semibold hover:bg-green-500/10 transition-all duration-150 disabled:opacity-60"
                            >
                              {startSessionMutation.isPending ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
                              ) : (
                                <><PlayCircle className="w-3.5 h-3.5" /> Start Session</>
                              )}
                            </button>
                          )}
                          {sessionMode === "resume" && (
                            <button
                              onClick={handleStartOrResume}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-amber-500/40 bg-amber-500/8 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/15 transition-all duration-150"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                              Resume Session
                            </button>
                          )}
                          {sessionMode === "active" && (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] font-semibold text-green-400">Session active</span>
                              </div>
                              <button
                                onClick={completeSession}
                                disabled={sessionCompleting}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-[11px] font-semibold hover:bg-green-500/25 transition-all disabled:opacity-50"
                              >
                                {sessionCompleting ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                                ) : (
                                  <><CheckCircle className="w-3 h-3" /> Log Session</>
                                )}
                              </button>
                            </div>
                          )}
                          {sessionMode === "completed" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                                <span className="text-[11px] font-semibold text-green-400">Session logged!</span>
                              </div>
                              {sessionResult && sessionResult.progressions.length > 0 && (
                                <div className="space-y-1">
                                  {sessionResult.progressions.map((p, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <TrendingUp className="w-2.5 h-2.5 text-primary/60 mt-0.5 flex-shrink-0" />
                                      <p className="text-[10px] text-primary/80 leading-relaxed">{p}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Session refine actions — 32px pills, focus-aware */}
                      {onSendMessage && (
                        <div className="px-3 py-2.5 flex flex-wrap gap-1.5 border-b border-border/30">
                          {(FOCUS_SESSION_ACTIONS[panelFocusMode] ?? FOCUS_SESSION_ACTIONS.strength).map((action) => {
                            const key = `day-${idx}-${action.label}`;
                            const isLoading = pendingRefinement === key;
                            const isDisabled = !!buildingState?.isBuilding;
                            return (
                              <button
                                key={action.label}
                                onClick={() =>
                                  sendRefinement(action.buildMessage(day.dayNumber), key, {
                                    dayIndex: idx,
                                    interactionType: "session_action",
                                    structuredIntent: action.structuredIntent,
                                    focusMode: panelFocusMode,
                                    ...(action.button ? { button: action.button } : {}),
                                  })
                                }
                                disabled={isDisabled}
                                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-[10px] font-semibold border transition-all duration-150 active:scale-95 select-none ${
                                  isLoading
                                    ? "bg-primary/15 border-primary/40 text-primary"
                                    : "bg-muted/20 border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-accent/50"
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                {isLoading && (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
                                )}
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Exercise rows */}
                      {(day.exercises ?? []).map((ex, exIdx) => {
                        const exKey = `d${idx}-e${exIdx}`;
                        const exDiff = animatedKeys.get(exKey);
                        const isHighlighted = highlightedNames.has(ex.name);
                        const inlineLabel = inlineLabels.get(ex.name);
                        const rowAnim =
                          isHighlighted ? "ex-highlight-glow 3.5s ease forwards" :
                          exDiff === "added"   ? "ex-added 1.8s ease forwards" :
                          exDiff === "swapped" ? "ex-swapped 1.8s ease forwards" :
                          undefined;
                        const volAnim = exDiff === "volume" ? "vol-flash 1.6s ease forwards" : undefined;
                        return (
                          <div
                            key={exIdx}
                            ref={(el) => {
                              if (el) exerciseRefs.current.set(ex.name, el);
                              else exerciseRefs.current.delete(ex.name);
                            }}
                            onClick={() => {
                              const exData = buildLearnExerciseData(ex.name, {
                                exerciseNotes: ex.notes,
                                classification: (ex as Record<string, unknown>).classification as string | undefined,
                                dayFocus: day.focus,
                                programGoal: trainingGoal ?? undefined,
                                context: {
                                  dayIndex: idx,
                                  dayTitle: day.name,
                                  sessionIdentity: day.focus,
                                  programTitle: program.programName,
                                  goal: trainingGoal ?? undefined,
                                },
                              });
                              handleOpenLearnExercise(exData, {
                                dayIndex: idx,
                                dayTitle: day.name,
                                sessionIdentity: day.focus,
                                programTitle: program.programName,
                                goal: trainingGoal ?? undefined,
                              });
                            }}
                            className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-accent/30 active:bg-accent/50 transition-colors duration-150 group"
                            style={rowAnim ? { animation: rowAnim } : undefined}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex flex-col min-w-0">
                                <p
                                  className="text-[11px] font-medium text-foreground"
                                  style={isHighlighted ? { animation: "ex-name-fadein 0.4s ease forwards" } : undefined}
                                >
                                  {ex.name}
                                </p>
                                <p className="text-[9px] text-muted-foreground/40 group-hover:text-primary/60 transition-colors duration-150">
                                  Tap to learn why + how
                                </p>
                              </div>
                              {isHighlighted && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0"
                                  style={{ animation: "badge-pop 3.5s ease forwards" }}
                                >
                                  Updated
                                </span>
                              )}
                              {/* Learn Exercise trigger */}
                              <ExerciseLearnButton
                                onClick={() => {
                                  const exData = buildLearnExerciseData(ex.name, {
                                    exerciseNotes: ex.notes,
                                    classification: (ex as Record<string, unknown>).classification as string | undefined,
                                    dayFocus: day.focus,
                                    programGoal: trainingGoal ?? undefined,
                                    context: {
                                      dayIndex: idx,
                                      dayTitle: day.name,
                                      sessionIdentity: day.focus,
                                      programTitle: program.programName,
                                      goal: trainingGoal ?? undefined,
                                    },
                                  });
                                  handleOpenLearnExercise(exData, {
                                    dayIndex: idx,
                                    dayTitle: day.name,
                                    sessionIdentity: day.focus,
                                    programTitle: program.programName,
                                    goal: trainingGoal ?? undefined,
                                  });
                                }}
                              />
                            </div>
                            {isHighlighted && inlineLabel && (
                              <p
                                className="text-[10px] text-indigo-400/80 mt-0.5 font-medium"
                                style={{ animation: "label-fade 3.5s ease forwards" }}
                              >
                                {inlineLabel}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                              {ex.sets > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  <span
                                    className="font-semibold text-foreground"
                                    style={volAnim ? { animation: volAnim } : undefined}
                                  >{ex.sets}</span> sets
                                </span>
                              )}
                              {ex.reps && (
                                <span className="text-[10px] text-muted-foreground">
                                  <span
                                    className="font-semibold text-foreground"
                                    style={volAnim ? { animation: volAnim } : undefined}
                                  >{ex.reps}</span> reps
                                </span>
                              )}
                              {ex.rest && (
                                <span className="text-[10px] bg-accent/60 px-1.5 py-0.5 rounded text-muted-foreground">
                                  {ex.rest}
                                </span>
                              )}
                            </div>
                            {ex.notes && (
                              <p className="text-[10px] text-muted-foreground/70 mt-1.5 italic leading-relaxed">{ex.notes}</p>
                            )}
                            {/* Exercise action row — Swap / Easier / Harder */}
                            {onSendMessage && (
                              <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                                {EXERCISE_ACTIONS.map((action) => {
                                  const exActionKey = `ex-${idx}-${exIdx}-${action.label}`;
                                  const isLoading = pendingRefinement === exActionKey;
                                  return (
                                    <button
                                      key={action.label}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isSaved) {
                                          const dir =
                                            action.label === "Easier" ? "easier" as const
                                            : action.label === "Harder" ? "harder" as const
                                            : "swap" as const;
                                          handleDirectExerciseEdit(ex.name, dir, exActionKey);
                                        } else {
                                          sendRefinement(action.buildMessage(ex.name), exActionKey, {
                                            dayIndex: idx,
                                            exerciseId: ex.name,
                                            interactionType: "exercise_action",
                                            focusMode: panelFocusMode,
                                          });
                                        }
                                      }}
                                      disabled={!!buildingState?.isBuilding || !!pendingRefinement}
                                      className={`h-7 inline-flex items-center gap-1 px-2.5 rounded-full text-[10px] font-medium border transition-all duration-150 active:scale-95 select-none ${
                                        isLoading
                                          ? "bg-primary/12 border-primary/35 text-primary"
                                          : "bg-transparent border-border/50 text-muted-foreground/70 hover:border-primary/25 hover:text-foreground hover:bg-accent/40"
                                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                                    >
                                      {isLoading && (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
                                      )}
                                      {action.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {isPremium && isSaved && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <ExerciseLogInline
                                  exerciseName={ex.name}
                                  programId={savedProgramId}
                                  dayNumber={day.dayNumber}
                                  orderIndex={exIdx}
                                  prescribedSets={ex.sets > 0 ? ex.sets : 3}
                                  target={targetsMap.get(ex.name)}
                                  sessionActive={sessionMode === "active"}
                                  onLogged={handleExerciseLogged}
                                  onSetsChange={(sets) => handleSetsChange(ex.name, sets)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {day.notes && (
                        <div className="px-3 py-2.5 bg-accent/15">
                          <p className="text-[10px] text-muted-foreground italic leading-relaxed">{day.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      </div>{/* end scrollable content body */}

      {/* ── Learn Exercise Modal ──────────────────────────────────────────── */}
      <LearnExerciseModal
        open={learnModalOpen}
        exercise={selectedExercise}
        context={selectedContext}
        onClose={handleCloseLearnExercise}
        onAskCoach={(msg) => {
          if (onSendMessage) {
            onSendMessage(msg, {
              source: "right_panel",
              interactionType: "learn_ask_coach",
              exerciseId: selectedExercise?.exerciseName,
            });
            onClose?.();
          }
        }}
      />
    </div>
  );
}

function InitialBuildCard({ entry, animate }: { entry: ChangeLogEntry; animate: boolean }) {
  const meta = entry.decisionMetadata ?? {};
  const bullets: string[] = [];

  const goal = meta.programGoal as string | null;
  const sport = meta.programSport as string | null;
  const days = meta.programDays as number | null;
  const constraints = meta.extractedConstraints as Record<string, unknown> | null;

  bullets.push("Created new training program");
  if (goal) bullets.push(`Goal set to ${goal.replace(/_/g, " ")}`);
  if (days) bullets.push(`Frequency set to ${days} day${days !== 1 ? "s" : ""}/week`);
  if (sport) bullets.push(`Applied ${sport} performance context`);
  if (constraints?.equipment) bullets.push(`Equipment: ${constraints.equipment}`);
  if (constraints?.experienceLevel) bullets.push(`Experience: ${constraints.experienceLevel}`);
  if (constraints?.sessionDuration) bullets.push(`Session length: ${constraints.sessionDuration} min`);

  if (bullets.length === 1 && entry.changeSummary) {
    const parts = entry.changeSummary.split(" · ").filter(Boolean);
    if (parts.length > 1) {
      bullets.length = 0;
      parts.forEach((p) => bullets.push(p));
    }
  }

  return (
    <div
      className="bg-card border border-primary/25 rounded-xl p-3 bg-primary/5"
      style={animate ? { animation: "change-entry-in 1.4s ease forwards" } : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
            {entry.versionLabel ?? "V1 Initial Build"}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
      </div>
      <ul className="space-y-1.5">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 flex-shrink-0" />
            <span className="text-[11px] text-foreground leading-relaxed">{bullet}</span>
          </li>
        ))}
      </ul>
      {entry.requestText && (
        <p className="text-[10px] text-muted-foreground/50 mt-2 italic line-clamp-2">"{entry.requestText}"</p>
      )}
    </div>
  );
}

function ChangesTab({ hasActiveSystem, newChangeSignal }: { hasActiveSystem?: boolean; newChangeSignal?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animateNewest, setAnimateNewest] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-system-history", "changes"],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>("/api/training-system/history?limit=20"),
    enabled: !!hasActiveSystem,
    staleTime: 0,
  });

  useEffect(() => {
    if (!newChangeSignal || newChangeSignal === 0) return;
    const t1 = setTimeout(() => {
      setAnimateNewest(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimateNewest(false), 2200);
    }, 600);
    return () => {
      clearTimeout(t1);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [newChangeSignal]);

  if (!hasActiveSystem) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Activity className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-semibold text-foreground mb-1">No changes yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
          Your program changes will appear here after your first build.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3 p-6 text-center">
        <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
        <p className="text-[11px] text-muted-foreground">Failed to load changes.</p>
        <button onClick={() => refetch()} className="text-[11px] text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Try again
        </button>
      </div>
    );
  }

  const history = data?.history ?? [];

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Activity className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-semibold text-foreground mb-1">No changes yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
          Every time the AI modifies your program, the change will be logged here automatically.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-y-auto h-full">
      {/* Block status — compact row at top of changes */}
      <div className="px-3 pt-3">
        <BlockStatusCard compact />
      </div>
      <style>{`
        @keyframes change-entry-in {
          0%   { opacity: 0; transform: translateY(-6px); box-shadow: 0 0 0 1px rgba(99,102,241,0.4) inset; background: rgba(99,102,241,0.08); }
          30%  { opacity: 1; transform: translateY(0); }
          70%  { box-shadow: 0 0 0 1px rgba(99,102,241,0.15) inset; background: rgba(99,102,241,0.04); }
          100% { box-shadow: none; background: transparent; }
        }
      `}</style>
      <div className="p-3 space-y-2">
        {history.map((entry, idx) => {
          const isNewest = idx === 0;
          const isInitialBuild = entry.source === "initialize";

          if (isInitialBuild) {
            return (
              <InitialBuildCard
                key={entry.id}
                entry={entry}
                animate={isNewest && animateNewest}
              />
            );
          }

          const whyChanged = entry.decisionMetadata?.whyChanged as string | undefined;
          const isProgression = entry.source === "workout_feedback";
          const progressionStatus = entry.decisionMetadata?.status as string | undefined;
          const flagForReview = entry.decisionMetadata?.flagForReview as boolean | undefined;

          // Progression entries get a distinct green/amber/red card
          if (isProgression) {
            const badgeColor =
              flagForReview ? "text-red-400 bg-red-400/10" :
              progressionStatus === "progress" ? "text-emerald-400 bg-emerald-400/10" :
              progressionStatus === "regress" ? "text-amber-400 bg-amber-400/10" :
              progressionStatus === "review" ? "text-red-400 bg-red-400/10" :
              "text-sky-400 bg-sky-400/10";

            const badgeLabel =
              flagForReview ? "Flagged" :
              progressionStatus === "progress" ? "Progressed" :
              progressionStatus === "regress" ? "Reduced" :
              progressionStatus === "review" ? "Flagged" :
              entry.intent === "deload_signal" ? "Deload Signal" :
              "Auto-Adjust";

            return (
              <div
                key={entry.id}
                className="bg-card border border-border rounded-xl p-3"
                style={isNewest && animateNewest ? { animation: "change-entry-in 1.4s ease forwards" } : undefined}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColor}`}>
                      {badgeLabel}
                    </span>
                    <span className="text-[9px] text-muted-foreground/50 font-medium uppercase tracking-wider">from workout</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
                </div>
                <p className="text-[11px] text-foreground leading-relaxed font-medium">{entry.changeSummary}</p>
                {whyChanged && (
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">↳ {whyChanged}</p>
                )}
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              className="bg-card border border-border rounded-xl p-3"
              style={isNewest && animateNewest ? { animation: "change-entry-in 1.4s ease forwards" } : undefined}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${scopeColor(entry.scope)}`}>
                  {entry.isMajorVersion && entry.versionLabel ? entry.versionLabel : entry.scope}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
              </div>
              <p className="text-[11px] text-foreground leading-relaxed">{entry.changeSummary}</p>
              {whyChanged && (
                <p className="text-[10px] text-primary/60 mt-1.5 leading-relaxed">↳ {whyChanged}</p>
              )}
              {!whyChanged && entry.intent && entry.intent !== entry.changeSummary && (
                <p className="text-[10px] text-muted-foreground/50 mt-1 font-medium">{entry.intent.replace(/_/g, " ")}</p>
              )}
              {entry.requestText && (
                <p className="text-[10px] text-muted-foreground/50 mt-1 italic line-clamp-2">"{entry.requestText}"</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTab({ hasActiveSystem }: { hasActiveSystem?: boolean }) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-system-history", "versions"],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>("/api/training-system/history?limit=50"),
    enabled: !!hasActiveSystem,
    staleTime: 0,
  });

  const restoreMutation = useMutation({
    mutationFn: (changeId: number) =>
      customFetch<any>(`/api/training-system/restore/${changeId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-system-history", "changes"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history", "versions"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-full"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      setRestoringId(null);
    },
    onError: () => setRestoringId(null),
  });

  if (!hasActiveSystem) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <GitBranch className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-semibold text-foreground mb-1">No history yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
          Save and evolve a program to build version history you can restore.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3 p-6 text-center">
        <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
        <p className="text-[11px] text-muted-foreground">Failed to load history.</p>
        <button onClick={() => refetch()} className="text-[11px] text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  const history = (data?.history ?? []).filter((e) => e.isMajorVersion || e.source === "initialize");

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Layers className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-semibold text-foreground mb-1">No major versions yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
          Significant program changes will create saved versions you can restore here.
        </p>
      </div>
    );
  }

  const total = history.length;

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-3 space-y-2">
        {history.map((entry, idx) => {
          const versionNum = total - idx;
          const isCurrentVersion = idx === 0;
          const label = entry.versionLabel ?? (isCurrentVersion ? "Current Version" : `Version ${versionNum}`);
          const meta = entry.decisionMetadata ?? {};
          const goal = meta.programGoal as string | null;
          const sport = meta.programSport as string | null;
          const days = meta.programDays as number | null;
          const isInitial = entry.source === "initialize";

          const metaTags: string[] = [];
          if (goal) metaTags.push(goal.replace(/_/g, " "));
          if (days) metaTags.push(`${days}d/wk`);
          if (sport) metaTags.push(sport);

          return (
            <div
              key={entry.id}
              className={`bg-card border rounded-xl p-3 ${
                isCurrentVersion ? "border-primary/30 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-black tabular-nums ${isCurrentVersion ? "text-primary" : "text-muted-foreground/70"}`}>
                    V{versionNum}
                  </span>
                  <span className={`text-[10px] font-medium ${isCurrentVersion ? "text-foreground" : "text-muted-foreground"}`}>
                    — {isInitial ? (entry.versionLabel ?? "Initial Build") : label}
                  </span>
                  {isCurrentVersion && (
                    <span className="text-[9px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">LIVE</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
              </div>

              {metaTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {metaTags.map((tag, i) => (
                    <span key={i} className="text-[9px] font-semibold bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded capitalize">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2">
                {isInitial
                  ? (entry.changeSummary.split(" · ")[0] ?? entry.changeSummary)
                  : entry.changeSummary}
              </p>

              {!isCurrentVersion && (
                <button
                  onClick={() => {
                    setRestoringId(entry.id);
                    restoreMutation.mutate(entry.id);
                  }}
                  disabled={restoringId === entry.id}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  {restoringId === entry.id ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Restoring…</>
                  ) : (
                    <><RotateCcw className="w-3 h-3" /> Restore this version</>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab locked state (preview-only users) ────────────────────────────────────

function TabLockedView({ message, onUpgrade }: { message: string; onUpgrade?: () => void }) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 mx-auto">
        <Lock className="w-6 h-6 text-primary" />
      </div>
      <h4 className="text-sm font-bold text-foreground mb-2">Pro feature</h4>
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-5 max-w-[180px]">
        {message}
      </p>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <Zap className="w-3.5 h-3.5" /> Upgrade to Pro
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveProgramPanel({
  program,
  buildingState,
  onSave,
  onFeedback,
  onLogSession,
  onUpgrade,
  isSaving,
  isSaved,
  isPremium = false,
  hasActiveSystem = false,
  savedProgramId,
  trainingGoal,
  newChangeSignal = 0,
  newProgramSignal = 0,
  changeTargets = [],
  onSendMessage,
  onClose,
  pendingChangeHint,
  lastChangeSummary,
  programSource = "none" as const,
  blockMetadata,
  activeFocusModes,
  onFocusModeChange,
  isWeekDataLoading = false,
}: Props) {
  const { focusMode } = useFocusMode();
  const [activeTab, setActiveTab] = useState<Tab>("program");
  const [hasUnseenChange, setHasUnseenChange] = useState(false);
  const [showBuildSuccess, setShowBuildSuccess] = useState(false);
  const [panelSwitchConfirm, setPanelSwitchConfirm] = useState<string | null>(null);
  const prevChangeSignalRef = useRef(0);
  const prevProgramSignalRef = useRef(0);
  const buildSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New program built → switch to Program tab so user sees the result
  useEffect(() => {
    if (newProgramSignal > 0 && newProgramSignal !== prevProgramSignalRef.current) {
      prevProgramSignalRef.current = newProgramSignal;
      setActiveTab("program");
      setHasUnseenChange(true); // badge on Changes tab so user knows it populated
      // Show the "Training system created" success indicator briefly
      setShowBuildSuccess(true);
      if (buildSuccessTimerRef.current) clearTimeout(buildSuccessTimerRef.current);
      buildSuccessTimerRef.current = setTimeout(() => setShowBuildSuccess(false), 4000);
    }
  }, [newProgramSignal]);

  // Program edited → switch to Program tab and highlight the change
  // (Changes tab gets an unseen badge so user can still see it)
  useEffect(() => {
    if (newChangeSignal > 0 && newChangeSignal !== prevChangeSignalRef.current) {
      prevChangeSignalRef.current = newChangeSignal;
      setActiveTab("program");
      setHasUnseenChange(true);
    }
  }, [newChangeSignal]);

  // Clear badge when user views Changes tab
  useEffect(() => {
    if (activeTab === "changes") {
      setHasUnseenChange(false);
    }
  }, [activeTab]);

  // New-program skeleton: show full build animation when no program exists yet
  if (buildingState?.isBuilding && !program) {
    return <BuildingFromScratch stage={buildingState.stage} actionType={buildingState.actionType} />;
  }

  // Week data loading: program was just saved but the weekly structure is still
  // fetching from the DB. Show a lightweight pulse skeleton so the sidebar doesn't
  // flash "Ready to build" between save and weekData load.
  if (isWeekDataLoading && !program) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border flex-shrink-0 bg-primary/3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: "1s" }} />
            <span className="text-[11px] font-semibold text-primary/80">Loading your program…</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-card border border-border/40 rounded-xl h-14 animate-pulse" style={{ animationDelay: `${n * 80}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; subtitle: string; icon: React.ElementType }[] = [
    { id: "program", label: "Program", subtitle: "Current build · live", icon: Dumbbell },
    { id: "changes", label: "Changes", subtitle: "What changed & why", icon: Activity },
    { id: "history", label: "History", subtitle: "How it evolved", icon: GitBranch },
    { id: "forecast", label: "Forecast", subtitle: "What's coming next", icon: Zap },
  ];

  const activeTabMeta = tabs.find((t) => t.id === activeTab);

  const outerWeekRole = getWeekRole(program?.weekNumber);
  const outerBlockName = blockMetadata?.blockDisplayName ?? null;
  const phaseContextLine = (() => {
    if (activeTab !== "program") return null;
    const parts = [
      outerBlockName,
      program?.weekNumber ? `Week ${program.weekNumber}` : null,
      outerWeekRole,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Training system created — transient success indicator */}
      {showBuildSuccess && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/20 flex-shrink-0">
          <CheckCircle className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="text-[11px] font-semibold text-primary">Training system created</span>
          <span className="ml-auto text-[10px] text-primary/50">{program?.splitType ?? ""}</span>
        </div>
      )}

      {/* ── Focus Mode Switcher (Active Program Panel) ─────────────────────── */}
      {onFocusModeChange && activeFocusModes && (
        <div className="flex-shrink-0 border-b border-border/60 bg-background/95">
          {/* Section label */}
          <div className="flex items-center justify-center pt-2 pb-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 select-none">Training Focus</span>
          </div>

          {/* Pill switcher */}
          <div className="flex items-center justify-center gap-1.5 pb-2 px-3">
            {(["strength", "speed", "mobility"] as const).map((mode) => {
              const cfg = getFocusModeConfig(mode);
              const isActive = focusMode === mode;
              const hasProgram = activeFocusModes[mode];
              return (
                <button
                  key={mode}
                  onClick={() => {
                    if (!hasProgram) return;
                    onFocusModeChange(mode);
                    setPanelSwitchConfirm(cfg.theme.confirmLabel);
                    if (panelSwitchTimerRef.current) clearTimeout(panelSwitchTimerRef.current);
                    panelSwitchTimerRef.current = setTimeout(() => setPanelSwitchConfirm(null), 2200);
                  }}
                  disabled={!hasProgram}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-200 select-none ${
                    isActive
                      ? `${cfg.theme.pillActiveClass} shadow-sm`
                      : hasProgram
                      ? `${cfg.theme.inactiveClass} bg-muted/30`
                      : "text-muted-foreground/30 bg-transparent cursor-default"
                  }`}
                  style={isActive ? cfg.theme.pillGlow : undefined}
                  title={hasProgram ? `Switch to ${cfg.label}` : `No ${cfg.label} program yet`}
                >
                  <FocusIcon mode={mode} className="w-3 h-3 flex-shrink-0" />
                  <span>{cfg.shortLabel === "Speed" ? "Speed" : cfg.label}</span>
                  {hasProgram && !isActive && (
                    <span className="w-1 h-1 rounded-full bg-current opacity-50 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active mode banner */}
          {(() => {
            const activeCfg = getFocusModeConfig(focusMode);
            return panelSwitchConfirm ? (
              <div className="flex items-center justify-center pb-2 animate-in fade-in duration-200">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold ${activeCfg.theme.badgeClass}`}>
                  <CheckCircle2 className="w-3 h-3" />
                  {panelSwitchConfirm}
                </span>
              </div>
            ) : (
              <div className={`flex items-start gap-2 px-4 py-2.5 border-t border-border/30 ${activeCfg.theme.bgTintClass}`}>
                <span className={`mt-0.5 flex-shrink-0 p-1.5 rounded-lg bg-current/10`}>
                  <FocusIcon mode={focusMode} className={`w-3 h-3 ${activeCfg.theme.iconColorClass}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-wide leading-none ${activeCfg.theme.iconColorClass}`}>
                    {activeCfg.label} Mode Active
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{activeCfg.description}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border flex-shrink-0 px-2 pt-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "changes" && hasUnseenChange;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold border-b-2 transition-all duration-150 ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
              {showBadge && (
                <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab context strip */}
      {activeTabMeta && (
        <div className="flex-shrink-0 px-3 py-1 bg-muted/20 border-b border-border/40">
          <span className="text-[9px] text-muted-foreground/50 font-medium tracking-wide">
            {phaseContextLine ?? activeTabMeta.subtitle}
          </span>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "program" && (
          <ProgramTab
            program={program}
            programSource={programSource}
            buildingState={buildingState}
            onSave={onSave}
            onFeedback={onFeedback}
            onLogSession={onLogSession}
            onUpgrade={onUpgrade}
            onSendMessage={onSendMessage}
            onClose={onClose}
            isSaving={isSaving}
            isSaved={isSaved}
            isPremium={isPremium}
            savedProgramId={savedProgramId}
            trainingGoal={trainingGoal}
            changeTargets={changeTargets}
            newChangeSignal={newChangeSignal}
            pendingChangeHint={pendingChangeHint}
            lastChangeSummary={lastChangeSummary}
            blockMetadata={blockMetadata}
          />
        )}
        {activeTab === "changes" && (
          !isPremium ? (
            <TabLockedView
              message="Track every AI edit and adaptation in your program's live change log."
              onUpgrade={onUpgrade}
            />
          ) : (
            <ChangesTab
              hasActiveSystem={hasActiveSystem}
              newChangeSignal={newChangeSignal}
            />
          )
        )}
        {activeTab === "history" && (
          !isPremium ? (
            <TabLockedView
              message="View and restore any previous version of your training program."
              onUpgrade={onUpgrade}
            />
          ) : (
            <HistoryTab hasActiveSystem={hasActiveSystem} />
          )
        )}
        {activeTab === "forecast" && (
          !isPremium ? (
            <TabLockedView
              message="See upcoming sessions, predicted progressions, and adaptation timelines."
              onUpgrade={onUpgrade}
            />
          ) : (
            <CoachForecast onSendMessage={onSendMessage} />
          )
        )}
      </div>
    </div>
  );
}
