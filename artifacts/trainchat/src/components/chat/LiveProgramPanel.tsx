import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell, Save, CheckCircle, Loader2, Lock, Zap, PlayCircle,
  MessageSquare, ChevronDown, ChevronUp, TrendingUp, TrendingDown, LayoutGrid,
  Calendar, Clock, RotateCcw, GitBranch, Activity, Layers,
  AlertCircle, RefreshCw, Send, Leaf, CheckCircle2, Share2, Wrench, HelpCircle, Brain,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";
import { customFetch } from "@workspace/api-client-react";
import type { ProgramStructure } from "./ChatOutput";
import BlockStatusCard from "@/components/training/BlockStatusCard";
import type { BuildStage, ButtonActionPayload } from "@/hooks/useStreamMessage";
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
import SystemAdjustmentsPanel from "./SystemAdjustmentsPanel";
import ProgramShareModal from "@/components/share/ProgramShareModal";
import { handleTrainingSystemMutationResult } from "@/lib/trainingMutationHelper";
import { ProgramVoiceTextInput } from "@/components/ui/ProgramVoiceTextInput";
import { LaserScanLine, PrecisionGlowLine } from "@/components/laser-skill";

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
  /** Training system ID — used for program-scoped session isolation */
  trainingSystemId?: number;
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
  /** Internal callback — called by ProgramTab after a successful sidebar mutation (add/remove exercise) */
  onSidebarMutation?: () => void;
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
  /** Conversation ID — used for dev logging of sidebar refine submits */
  conversationId?: number | null;
  /** Open the Athlete Intelligence Profile modal */
  onOpenAthleteProfile?: () => void;
}

type Tab = "program" | "changes" | "history" | "forecast" | "adapted";

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
      className="bg-card border border-border/60 rounded-xl overflow-hidden relative"
      style={{
        animation: `fadeSlideIn 0.25s ease both`,
        animationDelay: `${delayMs}ms`,
      }}
    >
      {shimmer && (
        <LaserScanLine active={true} stage="applying" containerHeight={showExercises ? 120 : 52} />
      )}
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
      <div className="p-4 border-b border-border flex-shrink-0 bg-primary/3 relative overflow-hidden">
        {(phase === "content" || phase === "refine") && (
          <LaserScanLine active={true} stage={stage} containerHeight={72} />
        )}
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

interface ExerciseAction {
  label: string;
  Icon: LucideIcon;
  buildMessage: (name: string) => string;
  direct?: "easier" | "harder" | "swap" | "equipment";
}

const EXERCISE_ACTIONS: ExerciseAction[] = [
  {
    label: "Swap",
    Icon: RefreshCw,
    buildMessage: (n) => `Replace ${n} with a similar alternative while preserving the training intent`,
    direct: "swap",
  },
  {
    label: "Easier",
    Icon: TrendingDown,
    buildMessage: (n) => `Make ${n} easier while preserving the training goal`,
    direct: "easier",
  },
  {
    label: "Harder",
    Icon: TrendingUp,
    buildMessage: (n) => `Increase the difficulty of ${n} appropriately`,
    direct: "harder",
  },
  {
    label: "Equipment",
    Icon: Wrench,
    buildMessage: (n) => `Replace ${n} with an equivalent exercise that fits my available equipment`,
    direct: "equipment",
  },
  {
    label: "Explain",
    Icon: HelpCircle,
    buildMessage: (n) => `Explain why ${n} is included in this program and what it is training`,
  },
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
  trainingSystemId,
  savedProgramId,
  trainingGoal,
  changeTargets,
  newChangeSignal,
  newProgramSignal = 0,
  pendingChangeHint,
  lastChangeSummary,
  onSendMessage,
  onClose,
  blockMetadata,
  onSidebarMutation,
  conversationId,
}: Omit<Props, "hasActiveSystem">) {
  const queryClient = useQueryClient();
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const prevProgramRef = useRef<ProgramStructure | null>(null);
  const pinnedProgramKey = useRef<string | null>(null);
  /** Set to true when a brand-new build just fired — forces Day 1 on next pin. */
  const newBuildPendingRef = useRef(false);
  const prevNewProgramSignalRef = useRef(0);
  /**
   * Tracks the programSource value from the previous render.
   * Used to detect the "draft → live" transition after a new build is saved
   * and weekData finishes loading, so we can re-pin to the DB-canonical first session.
   */
  const prevProgramSourceRef = useRef<string>(programSource);
  /**
   * Set to true when a new-build pin was made against a draft (latestProgram).
   * When the program source transitions draft→live, we reset pinnedProgramKey
   * so the pin effect re-runs with the DB-canonical (orderIndex-sorted) first session.
   */
  const newBuildPinnedFromDraftRef = useRef(false);
  const [animatedKeys, setAnimatedKeys] = useState<Map<string, DiffType>>(new Map());
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refinement state ─────────────────────────────────────────────────────
  const [pendingRefinement, setPendingRefinement] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState("");

  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successOverlayFading, setSuccessOverlayFading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Updated");
  const [panelEditError, setPanelEditError] = useState<string | null>(null);

  /**
   * Tracks which session-pill button is currently executing a direct panel
   * mutation (i.e. via POST /api/training-system/mutate rather than chat).
   * Keyed by `day-${idx}-${action.label}` — same key as pendingRefinement —
   * so the existing loading-state UI in the pill render can reuse the same
   * `isLoading` check.
   */
  const [panelMutating, setPanelMutating] = useState<string | null>(null);

  // ── Share program modal ───────────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false);

  // ── Inline program name editing ───────────────────────────────────────────
  const [localProgramName, setLocalProgramName] = useState(() =>
    generateProgramName(program?.programName ?? "", program?.days.length ?? 0, program?.splitType, trainingGoal)
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync when program changes (new build or save)
  useEffect(() => {
    if (!isEditingName) {
      setLocalProgramName(
        generateProgramName(program?.programName ?? "", program?.days.length ?? 0, program?.splitType, trainingGoal)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programName, program?.days.length]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // ── Week selector state ──────────────────────────────────────────────────
  const currentWeekNum = program?.weekNumber ?? null;
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeekNum ?? 1);

  useEffect(() => {
    if (currentWeekNum !== null) setSelectedWeek(currentWeekNum);
  }, [currentWeekNum]);

  // ── Week advancement banner ───────────────────────────────────────────────
  const prevWeekNumRef = useRef<number | null>(null);
  const [weekAdvancedTo, setWeekAdvancedTo] = useState<number | null>(null);
  const weekAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevWeekNumRef.current;
    if (
      prev !== null &&
      currentWeekNum !== null &&
      currentWeekNum > prev
    ) {
      setWeekAdvancedTo(currentWeekNum);
      if (weekAdvanceTimerRef.current) clearTimeout(weekAdvanceTimerRef.current);
      weekAdvanceTimerRef.current = setTimeout(() => setWeekAdvancedTo(null), 6000);
    }
    prevWeekNumRef.current = currentWeekNum;
    return () => {
      if (weekAdvanceTimerRef.current) clearTimeout(weekAdvanceTimerRef.current);
    };
  }, [currentWeekNum]);

  const { focusMode: panelFocusMode } = useFocusMode();

  const { data: altWeekData, isLoading: altWeekLoading } = useQuery({
    // Key includes trainingSystemId to prevent stale cross-conversation cache leakage.
    queryKey: ["week-view-select", selectedWeek, trainingSystemId ?? panelFocusMode],
    queryFn: () => {
      const params = new URLSearchParams({ weekNumber: String(selectedWeek) });
      if (trainingSystemId) {
        params.set("systemId", String(trainingSystemId));
      } else if (panelFocusMode) {
        params.set("focus", panelFocusMode);
      }
      return customFetch<any>(`/api/training-system/week?${params.toString()}`);
    },
    // Gate: only fire when both the system ID and currentWeekNum are fully resolved.
    // Without this, a fresh auto-created system may double-fetch week-1 before hydration.
    enabled: !!isSaved && trainingSystemId != null && currentWeekNum !== null && currentWeekNum !== undefined && selectedWeek !== currentWeekNum,
    staleTime: 30_000,
  });

  // ── Today's readiness check-in status ─────────────────────────────────────
  // Fetches whether today has a check-in and what adaptation mode was triggered.
  // Used to show a readiness adaptation banner on today's session card.
  const { data: todayReadinessStatus } = useQuery<{
    hasCheckInToday: boolean;
    mode: string | null;
    composite: number | null;
    readinessLevel: string | null;
    checkedInAt?: string;
  }>({
    queryKey: ["readiness-today-status"],
    queryFn: () => customFetch<any>("/api/readiness/today-status"),
    enabled: !!isSaved,
    staleTime: 5 * 60 * 1000, // 5 min — re-check after new check-ins
    refetchOnWindowFocus: true,
  });

  // ── Current-week DB data for exercise ID lookup (needed for direct edits) ──
  const { data: currentWeekDbData, isFetching: isWeekSyncing } = useQuery({
    // Key includes trainingSystemId so each conversation's system gets its own cache entry.
    queryKey: ["live-panel-week-ids", trainingSystemId ?? savedProgramId, panelFocusMode],
    queryFn: () => {
      if (trainingSystemId) {
        return customFetch<any>(`/api/training-system/week?systemId=${trainingSystemId}`);
      }
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
  const successFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBuildingRef = useRef(false);
  const processingMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [showContentReveal, setShowContentReveal] = useState(false);
  const contentRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade out then unmount the success overlay — safe to call from anywhere.
  function dismissSuccessOverlay() {
    if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
    if (successFadeTimerRef.current) clearTimeout(successFadeTimerRef.current);
    setSuccessOverlayFading(true);
    successFadeTimerRef.current = setTimeout(() => {
      setShowSuccessOverlay(false);
      setSuccessOverlayFading(false);
    }, 200);
  }

  // Helper: show the success overlay and schedule its auto-dismiss.
  function triggerSuccessOverlay(message = "Updated") {
    setSuccessMessage(message);
    setShowSuccessOverlay(true);
    setSuccessOverlayFading(false);
    if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
    programUpdatedTimerRef.current = setTimeout(() => dismissSuccessOverlay(), 1900);
  }

  // Clear loading state + flash "Program Updated" when stream completes.
  // Enforces a minimum 300ms visual processing phase so fast updates never snap instantly.
  useEffect(() => {
    const isBuilding = !!buildingState?.isBuilding;
    if (prevBuildingRef.current && !isBuilding && pendingRefinement) {
      const elapsed = processingStartTime !== null ? Date.now() - processingStartTime : 999;
      const MIN_MS = 300;
      const remaining = Math.max(0, MIN_MS - elapsed);

      if (processingMinTimerRef.current) clearTimeout(processingMinTimerRef.current);
      processingMinTimerRef.current = setTimeout(() => {
        setPendingRefinement(null);
        setProcessingStartTime(null);
        triggerSuccessOverlay();
        // Trigger a brief content fade-in after reveal
        setShowContentReveal(true);
        if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
        contentRevealTimerRef.current = setTimeout(() => setShowContentReveal(false), 350);
      }, remaining);
    }
    prevBuildingRef.current = isBuilding;
    return () => {
      if (programUpdatedTimerRef.current) clearTimeout(programUpdatedTimerRef.current);
      if (successFadeTimerRef.current) clearTimeout(successFadeTimerRef.current);
      if (processingMinTimerRef.current) clearTimeout(processingMinTimerRef.current);
      if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingState?.isBuilding, pendingRefinement, processingStartTime]);

  function sendRefinement(
    message: string,
    key: string,
    options?: Record<string, unknown>,
    buttonPayload?: ButtonActionPayload,
  ) {
    if (!onSendMessage || buildingState?.isBuilding) return;
    setPanelEditError(null);
    setPendingRefinement(key);
    setProcessingStartTime(Date.now());
    const payload: Record<string, unknown> = { source: "right_panel", ...options };
    if (buttonPayload) payload.buttonPayload = buttonPayload;
    if (import.meta.env.DEV) {
      console.log("[ActionRoutingAudit]", {
        source: buttonPayload?.source ?? "program_panel",
        actionType: buttonPayload?.actionType ?? null,
        scope: buttonPayload?.scope ?? null,
        displayText: buttonPayload?.displayText ?? key,
        submittedText: message,
        dayIndex: buttonPayload?.dayIndex ?? null,
        exerciseIndex: buttonPayload?.exerciseIndex ?? null,
        exerciseName: buttonPayload?.exerciseName ?? null,
        structuredIntent: options?.structuredIntent ?? null,
        expectedRoute: buttonPayload?.scope === "exercise" ? "mutation_pipeline/exercise"
          : buttonPayload?.scope === "session" ? "mutation_pipeline/session"
          : buttonPayload?.scope === "program" ? "mutation_pipeline/program"
          : buttonPayload?.scope === "architecture" ? "hierarchical_engine"
          : "auto_resolved_by_server",
      });
      console.log("[SidebarEditExecutionAudit]", {
        buttonPressed: key,
        focusMode: panelFocusMode,
        commandSent: message,
        structuredIntent: options?.structuredIntent ?? null,
        interactionType: options?.interactionType ?? null,
        payload,
      });
    }
    onSendMessage(message, payload);
    onClose?.();
  }

  // ── Voice refine lifecycle ────────────────────────────────────────────────

  function handleRefineSubmit(msg: string) {
    const normalized = msg.trim().replace(/\s{2,}/g, " ");
    if (!normalized || !onSendMessage || buildingState?.isBuilding || !!pendingRefinement) return;
    sendRefinement(normalized, "refine-input", { interactionType: "freeform_refine" }, {
      source: "program_panel",
      actionType: "freeform_refine",
      displayText: "Refine input",
      submittedText: normalized,
    });
  }

  // ── Shared Changes-cache helper — optimistic insert + invalidate/refetch ──
  function updateChangesCache(entry: ChangeLogEntry | null) {
    const changesQueryKey = ["training-system-history", "changes"] as const;
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey.some(
          (k) => typeof k === "string" && (k.includes("history") || k.includes("change"))
        ),
    });
    queryClient.invalidateQueries({ queryKey: ["training-system-history", "versions"] });
    if (entry) {
      const prevData = queryClient.getQueryData<{ history: ChangeLogEntry[] }>(changesQueryKey);
      queryClient.setQueryData(changesQueryKey, {
        history: [entry, ...(prevData?.history ?? [])],
      });
      if (import.meta.env.DEV) {
        console.log("[LiveProgramPanel:ChangesCacheUpdated]", { entry, source: entry.source });
      }
    }
    queryClient.refetchQueries({ queryKey: changesQueryKey }).catch(() => {});
  }

  // ── Shared post-mutation cache refresh ───────────────────────────────────
  // Uses refetchQueries (not invalidateQueries) so the fetch is forced
  // immediately, guaranteeing the panel re-renders with fresh DB data in the
  // same event loop cycle rather than relying on a scheduled background refetch.
  async function refetchProgramData() {
    await Promise.all([
      // conversationId drives activeSystem → weekData enablement in chat.tsx
      ...(conversationId != null
        ? [queryClient.refetchQueries({ queryKey: ["training-system-conv", conversationId] })]
        : [queryClient.invalidateQueries({ queryKey: ["training-system-conv"] })]),
      // Primary rendering source for the current week
      queryClient.refetchQueries({ queryKey: ["training-system-week"] }),
      // Exercise-ID map for the next direct edit
      queryClient.refetchQueries({ queryKey: ["live-panel-week-ids"] }),
      // Alt-week view (non-current weeks)
      queryClient.refetchQueries({ queryKey: ["week-view-select"] }),
    ]);
    // Secondary caches — background invalidation is sufficient
    queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
  }

  // ── Direct block-level refine — bypasses chat, targets selected block ──────
  async function handleDirectBlockRefine(chip: GlobalChip, key: string) {
    if (trainingSystemId == null || buildingState?.isBuilding || !!pendingRefinement) return;
    setPanelEditError(null);
    setPendingRefinement(key);
    const start = Date.now();
    try {
      const result = await customFetch<{ changeLogEntry: ChangeLogEntry | null; changeSummary?: string }>(
        "/api/training-system/edit",
        {
          method: "POST",
          body: JSON.stringify({
            request: chip.message,
            focusMode: panelFocusMode,
            source: "quick_action",
            postToChat: false,
            refineSource: "program_refine_panel",
            structuredIntent: chip.structuredIntent,
            weekNumber: selectedWeek ?? 1,
            scopeOverride: "week",
          }),
        },
      );
      const elapsed = Date.now() - start;
      if (elapsed < 300) await new Promise<void>((r) => setTimeout(r, 300 - elapsed));

      await refetchProgramData();
      updateChangesCache(result.changeLogEntry ?? null);

      setPendingRefinement(null);
      triggerSuccessOverlay(chip.label);
      setShowContentReveal(true);
      if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
      contentRevealTimerRef.current = setTimeout(() => setShowContentReveal(false), 350);

      onSidebarMutation?.();
      toast({ title: "Program updated", description: chip.label, duration: 2500 });

      if (import.meta.env.DEV) {
        console.log("[LiveProgramPanel:DirectBlockRefine:Receipt]", {
          label: chip.label,
          mutationSource: "live_program_block_refine",
          changeLogEntry: result.changeLogEntry,
        });
      }
    } catch (error) {
      setPendingRefinement(null);
      setPanelEditError("That change didn't apply — try again or describe it in the chat.");
      if (import.meta.env.DEV) {
        console.error("[LiveProgramPanel:DirectBlockRefine:Error]", { chip: chip.label, error });
      }
    }
  }

  // ── Direct session-level refine — bypasses chat, targets exact day/session ─
  async function handleDirectSessionRefine(
    action: SessionAction,
    dayIdx: number,
    day: { dayNumber?: number; name?: string; sessionId?: number },
    key: string,
  ) {
    if (!isSaved || buildingState?.isBuilding || !!panelMutating) return;
    setPanelEditError(null);
    setPanelMutating(key);
    const dayNum = day.dayNumber ?? dayIdx + 1;
    const start = Date.now();
    try {
      const result = await customFetch<{ changeLogEntry: ChangeLogEntry | null; changeSummary?: string }>(
        "/api/training-system/edit",
        {
          method: "POST",
          body: JSON.stringify({
            request: action.buildMessage(dayNum),
            focusMode: panelFocusMode,
            source: "quick_action",
            postToChat: false,
            ...(day.sessionId
              ? { targetContext: { type: "session", id: day.sessionId, label: day.name ?? undefined } }
              : {}),
          }),
        },
      );
      const elapsed = Date.now() - start;
      if (elapsed < 300) await new Promise<void>((r) => setTimeout(r, 300 - elapsed));

      await refetchProgramData();
      updateChangesCache(result.changeLogEntry ?? null);

      setPanelMutating(null);
      triggerSuccessOverlay(`${action.label}${day.name ? ` — ${day.name}` : ` — Day ${dayNum}`}`);
      setShowContentReveal(true);
      if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
      contentRevealTimerRef.current = setTimeout(() => setShowContentReveal(false), 350);

      onSidebarMutation?.();
      toast({
        title: "Session updated",
        description: `${action.label} — ${day.name ?? `Day ${dayNum}`}`,
        duration: 2500,
      });

      if (import.meta.env.DEV) {
        console.log("[LiveProgramPanel:DirectSessionRefine:Receipt]", {
          action: action.label,
          dayNum,
          mutationSource: "live_program_session_refine",
          changeLogEntry: result.changeLogEntry,
        });
      }
    } catch (error) {
      setPanelMutating(null);
      setPanelEditError("That change didn't apply — try again or describe it in the chat.");
      if (import.meta.env.DEV) {
        console.error("[LiveProgramPanel:DirectSessionRefine:Error]", { action: action.label, dayIdx, error });
      }
    }
  }

  // ── Undo a change by restoring to the previous state via change log ID ──────
  const handleUndoChange = useCallback(async (changeLogId: number) => {
    try {
      const result = await customFetch<any>(
        `/api/training-system/restore/${changeLogId}?focus=${encodeURIComponent(panelFocusMode)}`,
        { method: "POST" }
      );
      handleTrainingSystemMutationResult(result, queryClient, panelFocusMode);
      triggerSuccessOverlay("Change undone");
      toast({ title: "Undone", description: "Your previous program has been restored.", duration: 2500 });
    } catch {
      toast({
        title: "Couldn't undo",
        description: "Try using the History tab to restore a previous version.",
        variant: "destructive",
        duration: 3500,
      });
    }
  }, [panelFocusMode, queryClient]);

  // ── Direct exercise edit — bypasses chat, calls edit API deterministically ─
  async function handleDirectExerciseEdit(
    exerciseName: string,
    action: "easier" | "harder" | "swap" | "equipment",
    actionKey: string,
    exerciseIdHint?: number,
  ) {
    if (buildingState?.isBuilding) return;
    setPanelEditError(null);
    const isSwapLike = action === "swap" || action === "equipment";
    const request =
      action === "easier" ? `Make ${exerciseName} easier`
      : action === "harder" ? `Make ${exerciseName} harder`
      : action === "equipment" ? `Replace ${exerciseName} with an equivalent exercise that fits my available equipment`
      : `Swap ${exerciseName} with something similar`;

    const exerciseId = exerciseIdHint ?? exerciseIdMap.get(exerciseName.toLowerCase());

    setPendingRefinement(actionKey);
    const directEditStart = Date.now();
    try {
      const editResult = await customFetch<{
        changeLogEntry?: ChangeLogEntry | null;
        changeSummary?: string;
        appliedCount?: number;
        swapContract?: {
          actionType: string;
          confirmed: boolean;
          originalExercise: string | null;
          replacementExercise: string | null;
          updatedExercise: Record<string, unknown> | null;
          changeEntry: Record<string, unknown> | null;
          invalidationKeys: string[];
        } | null;
      }>(
        "/api/training-system/edit",
        {
          method: "POST",
          body: JSON.stringify({
            request,
            focusMode: panelFocusMode,
            source: "quick_action",
            postToChat: false,
            ...(exerciseId
              ? {
                  targetContext: {
                    type: "exercise",
                    id: exerciseId,
                    label: exerciseName,
                  },
                }
              : {}),
          }),
        },
      );
      // Enforce minimum 300ms visual processing phase — prevents instant snap
      const directEditElapsed = Date.now() - directEditStart;
      if (directEditElapsed < 300) {
        await new Promise<void>((r) => setTimeout(r, 300 - directEditElapsed));
      }
      await refetchProgramData();
      updateChangesCache(editResult?.changeLogEntry ?? null);
      queryClient.refetchQueries({ queryKey: ["training-system-history", "changes"] });
      onSidebarMutation?.();
      setPendingRefinement(null);

      if ((editResult?.appliedCount ?? 1) === 0) {
        setPanelEditError("No safe change found — try describing what you want in chat.");
        toast({
          title: "No change applied",
          description: "No safe modification was found for that action. Describe what you want in the chat for a custom edit.",
          duration: 4000,
        });
        return;
      }

      triggerSuccessOverlay(
        isSwapLike ? "Exercise swapped"
        : action === "easier" ? "Made easier"
        : "Made harder"
      );
      // Trigger content fade-in reveal
      setShowContentReveal(true);
      if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
      contentRevealTimerRef.current = setTimeout(() => setShowContentReveal(false), 350);

      // Swap contract validation — only show "confirmed swap" label when the backend
      // verified a real replace_exercise landed. If the contract is absent or unconfirmed
      // (e.g. the mutation was misclassified), fall back to a neutral label and log a warning.
      const swapContract = editResult?.swapContract ?? null;
      const swapConfirmed =
        isSwapLike &&
        swapContract?.actionType === "replace_exercise" &&
        swapContract.confirmed === true &&
        swapContract.updatedExercise != null;

      if (isSwapLike && !swapConfirmed) {
        console.warn("[LiveProgramPanel:SwapContractViolation]", {
          exerciseName,
          action,
          swapContract,
          reason: !swapContract
            ? "no_contract_in_response"
            : !swapContract.confirmed
            ? "contract_unconfirmed"
            : "updated_exercise_missing",
        });
      }

      // Highlight + scroll to the edited exercise
      const replacementName = swapConfirmed ? swapContract!.replacementExercise ?? exerciseName : exerciseName;
      const label =
        isSwapLike && swapConfirmed
          ? `${exerciseName} → ${replacementName}`
          : action === "easier" ? "Made easier"
          : action === "harder" ? "Made harder"
          : isSwapLike ? "Swap requested"
          : "Updated";
      // Highlight the replacement exercise name (which may differ from the original after a swap)
      const highlightName = isSwapLike && swapConfirmed ? replacementName : exerciseName;
      setHighlightedNames(new Set([highlightName]));
      setInlineLabels(new Map([[highlightName, label]]));
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedNames(new Set());
        setInlineLabels(new Map());
      }, 30000);
      pendingScrollName.current = exerciseName;
      if (program) {
        const dayIdx = program.days.findIndex((d) =>
          (d.exercises ?? []).some((e) => e.name === exerciseName)
        );
        if (dayIdx !== -1) setExpandedDay(dayIdx);
      }

      toast({
        title: "Program updated",
        description: label,
        duration: 8000,
        action: editResult?.changeLogEntry?.id != null
          ? <ToastAction altText="Undo this change" onClick={() => handleUndoChange(editResult!.changeLogEntry!.id!)}>Undo</ToastAction>
          : undefined,
      });

      if (import.meta.env.DEV) {
        const dayIdx = program
          ? program.days.findIndex((d) => (d.exercises ?? []).some((e) => e.name === exerciseName))
          : null;
        const receiptId = `panel-direct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.log("[RightSidebarReceiptReconciliation]", {
          actionType: action === "easier" ? "make_easier" : action === "harder" ? "make_harder" : "swap_exercise",
          dayIndex: dayIdx ?? null,
          exerciseIndex: null,
          previousExercise: exerciseName,
          newExercise: null,
          backendStatus: "direct_api_success",
          programChanged: true,
          failureSuppressed: false,
        });
        console.log("[DirectExerciseEditReceipt]", {
          success: true,
          source: "program_panel",
          actionType: action === "easier" ? "make_easier" : action === "harder" ? "make_harder" : "swap_exercise",
          programChanged: true,
          receiptId,
          target: {
            dayIndex: dayIdx ?? undefined,
            exerciseName,
          },
          userMessage: "Program updated",
        });
      }
    } catch (error) {
      console.error("[SidebarEditExecutionAudit] direct exercise edit failed", {
        action,
        exerciseName,
        exerciseId: exerciseId ?? null,
        focusMode: panelFocusMode,
        error,
      });
      setPendingRefinement(null);
      setPanelEditError("That change didn't apply — try again or describe it in the chat.");
    }
  }

  // ── Direct panel "Add Exercise" — bypasses chat stream entirely ──────────
  /**
   * Calls POST /api/training-system/mutate with operation="add_exercise".
   * Never creates a chat message or shows a chat failure bubble.
   * On success: immediately invalidates all relevant React Query caches and
   * flashes the "Program Updated" banner.
   * On error: shows a local error toast only.
   */
  async function handlePanelAddExercise(dayIndex: number, dayNumber: number, buttonKey: string) {
    if (panelMutating || buildingState?.isBuilding) return;
    setPanelMutating(buttonKey);
    setPanelEditError(null);
    const start = Date.now();

    try {
      const result = await customFetch<{
        success: boolean;
        verified: boolean;
        operation: string;
        sessionId: number;
        exerciseId: number | null;
        exerciseName: string;
        updatedSession: unknown;
        receipt: { success: boolean; exerciseName?: string; message?: string };
        changeLogEntry: ChangeLogEntry | null;
        message: string;
      }>("/api/training-system/mutate", {
        method: "POST",
        body: JSON.stringify({
          mutationSource: "live_program_panel",
          operation: "add_exercise",
          dayIndex,
          focusMode: panelFocusMode || undefined,
        }),
      });

      // Enforce minimum 300ms visual processing phase (matches direct edit pattern)
      const elapsed = Date.now() - start;
      if (elapsed < 300) {
        await new Promise<void>((r) => setTimeout(r, 300 - elapsed));
      }

      // Forced refetch of all primary rendering queries
      await refetchProgramData();

      // Phase 5: Predicate-based invalidation to catch any key variant + exact key
      const changesQueryKey = ["training-system-history", "changes"] as const;
      if (import.meta.env.DEV) {
        console.log("[LiveProgramPanel:ChangesQueryKey]", changesQueryKey);
      }
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.some(
            (k) => typeof k === "string" && (k.includes("history") || k.includes("change"))
          ),
      });
      queryClient.invalidateQueries({ queryKey: ["training-system-history", "versions"] });

      // Phase 6: Optimistic insert — add the new change log entry directly into
      // the Changes tab cache so it appears instantly before the refetch returns.
      if (result.changeLogEntry) {
        const prevData = queryClient.getQueryData<{ history: ChangeLogEntry[] }>(changesQueryKey);
        const updatedHistory = {
          history: [result.changeLogEntry, ...(prevData?.history ?? [])],
        };
        queryClient.setQueryData(changesQueryKey, updatedHistory);
        if (import.meta.env.DEV) {
          console.log("[LiveProgramPanel:ChangesCacheUpdated]", {
            changeLogEntry: result.changeLogEntry,
            prevHistoryLength: prevData?.history?.length ?? 0,
            newHistoryLength: updatedHistory.history.length,
          });
        }
      }

      // Trigger an explicit refetch of the Changes tab query to confirm from DB
      queryClient.refetchQueries({ queryKey: changesQueryKey }).then(() => {
        if (import.meta.env.DEV) {
          console.log("[LiveProgramPanel:ChangesRefetched] Changes tab query refetched after add_exercise mutation");
        }
      });

      // Signal the outer LiveProgramPanel to trigger ChangesTab animate-newest effect
      onSidebarMutation?.();

      // Flash success banner
      triggerSuccessOverlay("Exercise added");
      setShowContentReveal(true);
      if (contentRevealTimerRef.current) clearTimeout(contentRevealTimerRef.current);
      contentRevealTimerRef.current = setTimeout(() => setShowContentReveal(false), 350);

      // Expand the mutated day so the new exercise is visible
      setExpandedDay(dayIndex);

      // Phase 2: Use DB-verified name from receipt (source of truth), not planned name
      const verifiedName = result.receipt?.exerciseName ?? result.exerciseName;
      const label = result.message ?? `Added ${verifiedName} to Day ${dayNumber}.`;
      toast({
        title: "Exercise added",
        description: label,
        duration: 8000,
        action: result.changeLogEntry?.id != null
          ? <ToastAction altText="Undo this addition" onClick={() => handleUndoChange(result.changeLogEntry!.id!)}>Undo</ToastAction>
          : undefined,
      });

      if (import.meta.env.DEV) {
        const plannedName = result.exerciseName;
        if (verifiedName && plannedName && verifiedName !== plannedName) {
          console.warn("[LiveProgramMutate:NameReconciliation] Planned name differs from verified DB name", {
            plannedName,
            verifiedName,
            exerciseId: result.exerciseId,
            sessionId: result.sessionId,
          });
        }
        console.log("[LiveProgramMutate:Receipt]", {
          success: result.success,
          verified: result.verified,
          plannedExerciseName: result.exerciseName,
          verifiedExerciseName: verifiedName,
          exerciseId: result.exerciseId,
          sessionId: result.sessionId,
          changeLogEntry: result.changeLogEntry,
          dayIndex,
          dayNumber,
          mutationSource: "live_program_panel",
          operation: "add_exercise",
          message: result.message,
        });
      }
    } catch (error) {
      console.error("[LiveProgramMutate:Error] handlePanelAddExercise failed", {
        dayIndex,
        dayNumber,
        focusMode: panelFocusMode,
        error,
      });
      toast({
        title: "Couldn't add exercise",
        description: "Nothing changed — try again or use the chat.",
        variant: "destructive",
        duration: 3500,
      });
    } finally {
      setPanelMutating(null);
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
    queryKey: ["active-session", panelFocusMode, trainingSystemId ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ focus: panelFocusMode });
      if (trainingSystemId != null) params.set("trainingSystemId", String(trainingSystemId));
      return customFetch<ActiveSessionData>(`/api/active-session?${params.toString()}`);
    },
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

  // Derived 4-state mode for the session banner UI.
  // IMPORTANT: serverStatus is scoped to the specific expanded day — we compare
  // activeSessionData.dayNumber to the expanded day's dayNumber so that completing
  // Day 1 never marks Day 2, Day 3, etc. as "Session logged!".
  type SessionMode = "idle" | "resume" | "active" | "completed";
  function getSessionMode(): SessionMode {
    const serverDayNum = activeSessionData?.dayNumber ?? null;
    const expandedDayNum =
      expandedDay !== null
        ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1)
        : null;
    // Server status only applies to this exact day — null dayNumber means no
    // specific day was recorded (legacy rows), so we allow it through.
    const serverMatchesDay =
      serverDayNum === null || expandedDayNum === null || serverDayNum === expandedDayNum;

    // localMode: always scoped to the currently expanded day (reset on day switch)
    if (localMode === "completed") return "completed";
    if (serverStatus === "completed" && serverMatchesDay) return "completed";
    if (localMode === "active") return "active";
    if (serverStatus === "in_progress" && serverMatchesDay) return "resume";
    return "idle";
  }
  const sessionMode = getSessionMode();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[SessionLogRenderAudit]", {
      focusMode: panelFocusMode,
      expandedDay,
      expandedDayNum: expandedDay !== null ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1) : null,
      serverStatus,
      serverDayNum: activeSessionData?.dayNumber ?? null,
      localMode,
      resolvedSessionMode: sessionMode,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelFocusMode, expandedDay, serverStatus, activeSessionData?.dayNumber, localMode, sessionMode]);

  const startSessionMutation = useMutation({
    mutationFn: (data: { trainingSystemId?: number; savedProgramId?: number; dayNumber?: number; focusMode?: string }) =>
      customFetch<ActiveSessionData>("/api/active-session/start", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setLocalMode("active");
      queryClient.invalidateQueries({ queryKey: ["active-session", panelFocusMode, trainingSystemId ?? null] });
    },
  });

  function handleStartOrResume() {
    const dayNum = expandedDay !== null
      ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1)
      : undefined;

    if (serverStatus === "not_started") {
      startSessionMutation.mutate({
        trainingSystemId: trainingSystemId ?? undefined,
        savedProgramId: savedProgramId ?? undefined,
        dayNumber: dayNum,
        focusMode: panelFocusMode,
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

      // Persist completed status to server — include focusMode so the correct
      // focus-lane session is marked complete (not always "strength").
      const completedDayNum = expandedDay !== null
        ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1)
        : null;
      if (import.meta.env.DEV) {
        console.log("[SessionLogWriteAudit]", {
          focusMode: panelFocusMode,
          completedDayNum,
          savedProgramId: savedProgramId ?? null,
        });
        console.log("[SessionProgramWriteAudit]", {
          focusMode: panelFocusMode,
          trainingSystemId: trainingSystemId ?? null,
          completedDayNum,
          writeSucceeded: true,
        });
      }
      customFetch("/api/active-session/complete", {
        method: "POST",
        body: JSON.stringify({
          focusMode: panelFocusMode,
          ...(trainingSystemId != null ? { trainingSystemId } : {}),
        }),
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["active-session", panelFocusMode, trainingSystemId ?? null] });
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
  const [highlightedDayIndices, setHighlightedDayIndices] = useState<Set<number>>(new Set());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollName = useRef<string | null>(null);
  const exerciseRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevChangeSignalRef2 = useRef(0);

  // When a new change signal fires, set up highlights and find the day to expand
  useEffect(() => {
    if (!newChangeSignal || newChangeSignal === prevChangeSignalRef2.current) return;
    prevChangeSignalRef2.current = newChangeSignal;

    if (changeTargets?.length) {
      // ── Exercise-level highlights (exercise swap / add) ──────────────────
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
      }, 30000);

      // Find the day containing the first target and expand it
      const firstTarget = changeTargets[0];
      pendingScrollName.current = firstTarget.newExercise;

      if (program) {
        const dayIdx = program.days.findIndex((d) =>
          (d.exercises ?? []).some((e) => e.name === firstTarget.newExercise)
        );
        if (dayIdx !== -1) setExpandedDay(dayIdx);
      }
    } else {
      // ── Day/session-level highlight (no specific exercise target) ─────────
      // Briefly ring the currently expanded day card so the user sees what moved
      const currentDay = expandedDay ?? 0;
      setHighlightedDayIndices(new Set([currentDay]));
      if (dayHighlightTimerRef.current) clearTimeout(dayHighlightTimerRef.current);
      dayHighlightTimerRef.current = setTimeout(() => setHighlightedDayIndices(new Set()), 3200);
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

  // Detect "draft → live" transition for new builds.
  // When a new program is saved, the panel initially shows `latestProgram` (AI stream order)
  // while weekData loads from the DB. Once weekData arrives, `programSource` switches
  // from "draft" → "live". If we previously pinned from a draft, reset the pin key so
  // the pin effect re-runs and locks on the DB-canonical (orderIndex-sorted) first session —
  // which is the same session the Today view resolves via forceDay1/sessions[0].
  useEffect(() => {
    const prev = prevProgramSourceRef.current;
    prevProgramSourceRef.current = programSource;
    if (prev === "draft" && programSource === "live" && newBuildPinnedFromDraftRef.current) {
      newBuildPinnedFromDraftRef.current = false;
      // Reset pin key AND re-arm newBuild flag so the pin effect runs again
      // with the DB-canonical (orderIndex-sorted) program instead of the AI draft.
      pinnedProgramKey.current = null;
      newBuildPendingRef.current = true;
      if (import.meta.env.DEV) {
        console.log("[CanonicalDay1]", JSON.stringify({
          event: "draft_to_live_repin",
          trainingSystemId: trainingSystemId ?? null,
          note: "draft→live transition for new build — re-arming pin to DB-canonical Day 1",
        }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programSource]);

  // When a brand-new program build is confirmed (newProgramSignal fires), mark a
  // pending-new-build flag and invalidate the pin so the next effect run always
  // lands on Day 1 instead of the current weekday session.
  useEffect(() => {
    if (newProgramSignal > 0 && newProgramSignal !== prevNewProgramSignalRef.current) {
      const prevSignal = prevNewProgramSignalRef.current;
      prevNewProgramSignalRef.current = newProgramSignal;
      newBuildPendingRef.current = true;
      // Invalidate the pin so the pinning effect below re-runs for the new program.
      pinnedProgramKey.current = null;
      if (import.meta.env.DEV) {
        console.log("[ProgramActivation]", JSON.stringify({
          event: "newProgramSignal",
          programId: trainingSystemId ?? null,
          programName: program?.programName ?? null,
          isNewBuild: true,
          selectedDayBefore: expandedDay,
          prevSignal,
          nextSignal: newProgramSignal,
          note: "new build detected — will force Day 1 on next pin",
        }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProgramSignal]);

  // Pin expanded day to the current session on initial program load and after each program change.
  // Uses session-history (completedCount) instead of calendar/weekday matching.
  // EXCEPTION: brand-new builds always start at Day 1 (completedCount=0 naturally handles this).
  useEffect(() => {
    if (!program) return;
    const key = `${trainingSystemId ?? ""}::${program.programName}::${program.days?.length ?? 0}`;
    if (pinnedProgramKey.current === key) return;
    pinnedProgramKey.current = key;

    const isNewBuild = newBuildPendingRef.current;
    newBuildPendingRef.current = false;

    let selectedIdx: number;
    let selectionSource: string;

    if (isNewBuild) {
      // Brand-new program — always open on the canonical Day 1.
      // Sort by dayNumber ascending to find the true first training day, regardless
      // of the order the AI streamed sessions or how the array is arranged.
      // This matches the backend getTodaySession forceDay1 logic (sessions[0] by orderIndex).
      const days = program.days ?? [];
      const sortedByDayNumber = [...days].sort((a, b) => (a.dayNumber ?? 999) - (b.dayNumber ?? 999));
      const canonicalFirst = sortedByDayNumber[0];
      const canonicalIdx = canonicalFirst ? days.indexOf(canonicalFirst) : 0;
      selectedIdx = canonicalIdx >= 0 ? canonicalIdx : 0;
      selectionSource = "day1_canonical";

      // If currently showing a draft (latestProgram / AI stream order), mark that
      // we pinned from a draft so the draft→live transition can re-pin to the DB
      // canonical order when weekData finishes loading.
      if (programSource === "draft") {
        newBuildPinnedFromDraftRef.current = true;
      }

      if (import.meta.env.DEV) {
        console.log("[CanonicalDay1]", JSON.stringify({
          caller: "LiveProgramPanel",
          event: "new_build_pin",
          trainingSystemId: trainingSystemId ?? null,
          chosenSessionId: null,
          chosenSessionName: days[selectedIdx]?.name ?? null,
          dayNumber: days[selectedIdx]?.dayNumber ?? null,
          selectedIdx,
          programSource,
          totalDays: days.length,
          dayOrder: days.map((d) => ({ name: d.name, dayNumber: d.dayNumber })),
        }));
      }
    } else {
      // Existing program — use session-history index (from cached today API response).
      // completedCount → currentSessionIndex drives the position, not the calendar weekday.
      // Falls back to Day 1 (index 0) when no cache is available yet.
      const todayCacheEntries = queryClient.getQueriesData<any>({ queryKey: ["training-system-today"] });
      const cachedToday = todayCacheEntries
        .map(([, data]) => data)
        .find((d) => d?.currentSessionIndex != null);
      const historyIdx = cachedToday?.currentSessionIndex ?? 0;
      const days = program.days ?? [];
      selectedIdx = Math.min(historyIdx, Math.max(0, days.length - 1));
      selectionSource = "session_history";

      if (import.meta.env.DEV) {
        console.log("[Program Progression]", {
          programId: trainingSystemId ?? null,
          completedCount: historyIdx,
          currentSessionIndex: selectedIdx,
          currentSessionTitle: days[selectedIdx]?.name ?? null,
          reason: "session-history-based",
        });
      }
    }

    if (import.meta.env.DEV) {
      console.log("[ProgramActivation]", JSON.stringify({
        event: "pinDay",
        programId: trainingSystemId ?? null,
        programName: program.programName,
        isNewBuild,
        selectedDayBefore: expandedDay,
        selectedDayAfter: selectedIdx,
        selectionSource,
      }));
    }

    setExpandedDay(selectedIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programName, program?.days?.length, trainingSystemId, programSource]);

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
            id: typeof ex.id === "number" ? ex.id : undefined,
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
          8%   { opacity: 1; transform: scale(1.05); }
          15%  { transform: scale(1); }
          85%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes label-fade {
          0%,75% { opacity: 1; }
          100%   { opacity: 0; }
        }
        @keyframes week-advance-in {
          0%   { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes week-advance-out {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes program-content-fade {
          from { opacity: 0.55; transform: translateY(3px); }
          to   { opacity: 1;    transform: translateY(0); }
        }
        @keyframes chip-active-pulse {
          0%,100% { box-shadow: 0 0 0 2px hsl(var(--primary)/0.15); }
          50%      { box-shadow: 0 0 0 3px hsl(var(--primary)/0.28); }
        }
        @keyframes updating-label-in {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shimmer-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
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

      {/* Panel sync shimmer — shows when week data is quietly refreshing in background */}
      {isWeekSyncing && !isUpdating && (
        <div className="h-0.5 w-full flex-shrink-0 overflow-hidden bg-muted/20">
          <div
            className="h-full bg-primary/40 rounded-full"
            style={{ animation: "shimmer-slide 1.6s ease-in-out infinite", width: "40%" }}
          />
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
        <div className="flex items-start gap-2 mb-1">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={localProgramName}
              onChange={(e) => setLocalProgramName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setIsEditingName(false);
              }}
              className="flex-1 text-[15px] font-bold text-foreground leading-snug tracking-tight bg-muted/40 border border-primary/30 rounded-md px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/40"
              maxLength={60}
            />
          ) : (
            <h3
              className="text-[15px] font-bold text-foreground leading-snug tracking-tight flex-1 cursor-pointer hover:text-primary transition-colors group flex items-center gap-1.5"
              onClick={() => setIsEditingName(true)}
              title="Click to rename"
            >
              {localProgramName}
              <span className="opacity-0 group-hover:opacity-40 transition-opacity text-[10px] font-normal text-muted-foreground">✎</span>
            </h3>
          )}
          {programSource === "draft" && (
            <span className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-[9px] font-semibold text-amber-400 uppercase tracking-wider" title="Still being built — save to lock in your program">
              ✎ Draft
            </span>
          )}
        </div>

        {/* Progression tease */}
        <p className="text-[10px] text-muted-foreground/50 font-medium mb-2 leading-snug">
          {program.weekNumber
            ? `Week ${program.weekNumber} of 4 · Progression built in`
            : "This system adapts as you train"}
        </p>

        {/* Block philosophy banner — surfaces the training intent behind this block */}
        {blockMetadata?.missionStatement && (
          <div className="flex items-start gap-2 mb-2.5 px-2.5 py-2 rounded-lg bg-muted/20 border border-border/40">
            <span className="text-[9px] mt-0.5 flex-shrink-0">🎯</span>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed italic">
              {blockMetadata.missionStatement}
            </p>
          </div>
        )}

        {/* Safety chip — persistent reassurance that all changes are reversible */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/35 font-medium">
            <RotateCcw className="w-2.5 h-2.5" />
            All changes are reversible
          </span>
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

        {/* Intelligence status badges — surfaces active engines to users */}
        {(program.intelligenceStatus?.progressionModel || program.intelligenceStatus?.periodizationPhase || program.intelligenceStatus?.adaptationDirective || program.intelligenceStatus?.recoveryStatus) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {program.intelligenceStatus.periodizationPhase && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/8 border border-primary/15 text-[9.5px] text-primary/65 font-medium" title="Periodization phase">
                <Activity className="w-2.5 h-2.5 opacity-70" />
                {program.intelligenceStatus.periodizationPhase}
              </span>
            )}
            {program.intelligenceStatus.progressionModel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/40 border border-border/50 text-[9.5px] text-muted-foreground/65 font-medium" title="Progression model">
                <TrendingUp className="w-2.5 h-2.5 opacity-60" />
                {program.intelligenceStatus.progressionModel}
              </span>
            )}
            {program.intelligenceStatus.adaptationDirective && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/8 border border-amber-500/20 text-[9.5px] text-amber-600/70 dark:text-amber-400/70 font-medium" title="Adaptation directive">
                <AlertCircle className="w-2.5 h-2.5 opacity-70" />
                {program.intelligenceStatus.adaptationDirective}
              </span>
            )}
            {program.intelligenceStatus.recoveryStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/8 border border-emerald-500/20 text-[9.5px] text-emerald-600/70 dark:text-emerald-400/70 font-medium" title="Recovery status">
                <Activity className="w-2.5 h-2.5 opacity-70" />
                {program.intelligenceStatus.recoveryStatus}
              </span>
            )}
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

        {/* Week Advancement Banner — shown when week number increases */}
        {weekAdvancedTo !== null && (
          <div
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20"
            style={{ animation: "week-advance-in 0.3s ease both" }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-primary">
                Now in Week {weekAdvancedTo}
              </span>
              {weekAdvancedTo && WEEK_ROLES[weekAdvancedTo] && (
                <span className="text-[10px] text-primary/60 ml-1.5">
                  · {WEEK_ROLES[weekAdvancedTo]}
                </span>
              )}
            </div>
            <button
              onClick={() => setWeekAdvancedTo(null)}
              className="text-primary/40 hover:text-primary/70 transition-colors flex-shrink-0 text-[10px] font-semibold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Program Updated flash */}
        {showSuccessOverlay && (
          <div
            role="status"
            onClick={dismissSuccessOverlay}
            className="flex items-center justify-between gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 cursor-pointer select-none"
            style={{
              animation: "fadeSlideIn 0.2s ease both",
              opacity: successOverlayFading ? 0 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-green-400">{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismissSuccessOverlay(); }}
              className="text-[10px] font-bold text-green-400/60 hover:text-green-300 transition-colors flex-shrink-0"
            >
              Done
            </button>
          </div>
        )}
        {panelEditError && (
          <div
            className="flex items-center justify-between gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
            style={{ animation: "fadeSlideIn 0.2s ease both" }}
          >
            <span className="text-[10px] font-semibold text-red-300">{panelEditError}</span>
            <button
              type="button"
              onClick={() => setPanelEditError(null)}
              className="text-[10px] font-bold text-red-300/70 hover:text-red-200"
            >
              Dismiss
            </button>
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
                <><Save className="w-3 h-3" /> Save My System</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-semibold bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-200 active:scale-[0.98] flex-shrink-0"
          >
            <Share2 className="w-3 h-3" />
            Share
          </button>
        </div>
      </div>

      {/* ── Program Share Modal ─────────────────────────────────────────────── */}
      {showShareModal && (
        <ProgramShareModal
          program={{
            programName: program.programName,
            daysPerWeek: days.length,
            blockLengthWeeks: 4,
            blockPhases: null,
            day1: {
              dayNumber: days[0]?.dayNumber ?? 1,
              name: days[0]?.name ?? "Day 1",
              exercises: (days[0]?.exercises ?? []).map((e) => ({
                name: e.name,
                sets: e.sets ?? null,
                reps: e.reps ?? null,
              })),
            },
            focusMode: panelFocusMode ?? "strength",
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

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
              const isDisabled = !!buildingState?.isBuilding || !!pendingRefinement;
              return (
                <button
                  key={chip.label}
                  onClick={() => {
                    if (isDisabled || isLoading) return;
                    if (import.meta.env.DEV) {
                      console.log("[ProgramActionRoute]", {
                        source: "program_refine_panel",
                        label: chip.label,
                        direct: "block_refine",
                        systemId: trainingSystemId ?? null,
                        conversationId: conversationId ?? null,
                        route: trainingSystemId != null ? "direct" : "none",
                      });
                    }
                    // refineSource is always "program_refine_panel" — never fall back to chat.
                    // If trainingSystemId is missing, fail fast rather than routing through NLP.
                    if (trainingSystemId != null) {
                      handleDirectBlockRefine(chip, key);
                    }
                  }}
                  disabled={isDisabled}
                  className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-[11px] font-semibold border transition-all duration-200 select-none ${
                    isLoading
                      ? "bg-primary/20 border-primary/60 text-primary scale-[0.97]"
                      : "bg-muted/30 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent/60 active:scale-95"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  style={isLoading ? { animation: "chip-active-pulse 1.2s ease-in-out infinite" } : undefined}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                      <span style={{ animation: "updating-label-in 0.15s ease both" }}>Updating program…</span>
                    </>
                  ) : chip.label}
                </button>
              );
            })}
          </div>

          {/* Freeform refine input */}
          <div>
            <ProgramVoiceTextInput
              value={refineInput}
              onChange={setRefineInput}
              onSubmit={handleRefineSubmit}
              placeholder="Refine this program…"
              disabled={!!buildingState?.isBuilding || !!pendingRefinement}
              isSubmitting={pendingRefinement === "refine-input"}
              trainingSystemId={trainingSystemId ?? undefined}
              conversationId={conversationId ?? undefined}
              submitSource="sidebar_refine"
              inputContext="program_refine"
              releaseLabel="Release to refine"
              listeningLabel="Listening…"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground/45 leading-relaxed px-1">
              Tap mic to dictate · Hold mic for push-to-talk
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

      {/* Why this plan works */}
      {(program.progressionStrategy || program.description) && (
        <div className="px-4 py-3 border-b border-border bg-primary/3">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.12em] mb-1.5">Why this plan works</p>
              {program.progressionStrategy && (
                <p className="text-[10px] text-muted-foreground leading-relaxed mb-1">
                  {program.progressionStrategy}
                </p>
              )}
              {!program.progressionStrategy && program.description && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {program.description}
                </p>
              )}
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

      {/* Readiness adaptation banner — shown when today's check-in triggered a session modification */}
      {todayReadinessStatus?.hasCheckInToday &&
        todayReadinessStatus.mode &&
        todayReadinessStatus.mode !== "TRAIN_AS_PLANNED" && isSaved && (() => {
          const mode = todayReadinessStatus.mode as string;
          const bannerConfig: Record<string, { dot: string; text: string; border: string }> = {
            LIGHT_MODIFICATION: {
              dot: "bg-yellow-400",
              text: "Volume trimmed · Accessory sets reduced for recovery today",
              border: "border-yellow-500/20 bg-yellow-500/5",
            },
            PAIN_MODIFICATION: {
              dot: "bg-orange-400",
              text: "Pain flagged · Conservative loading applied to today's session",
              border: "border-orange-500/20 bg-orange-500/5",
            },
            RECOVERY_DELOAD: {
              dot: "bg-red-400",
              text: "Recovery lower · Load reduced across today's session",
              border: "border-red-500/20 bg-red-500/5",
            },
            GREEN_LIGHT_PROGRESSION: {
              dot: "bg-primary",
              text: "All signals solid · Progression notes added to primary lifts",
              border: "border-primary/20 bg-primary/5",
            },
          };
          const cfg = bannerConfig[mode];
          if (!cfg) return null;
          return (
            <div className={`mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border ${cfg.border}`}>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${cfg.dot}`} />
              <p className="text-[10px] text-muted-foreground/80 leading-snug">{cfg.text}</p>
            </div>
          );
        })()}

      {/* Days */}
      <div
        className="p-3 space-y-2"
        style={showContentReveal ? { animation: "program-content-fade 0.22s ease both" } : undefined}
      >
        {altWeekLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
          </div>
        )}
        {!altWeekLoading && viewDays.map((day: any, idx: number) => {
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

              {/* Day card — full for Day 1, readable-but-locked for Days 2+ */}
              {isLocked ? (
                <div
                  className="bg-card border border-border/30 rounded-xl overflow-hidden"
                  style={dayDiff === "newday" ? { animation: "day-new 1.8s ease forwards" } : undefined}
                >
                  <div className="flex items-center justify-between p-3 pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/40 text-muted-foreground/60">
                          Day {day.dayNumber}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-foreground/70 truncate">
                        {day.name}
                      </p>
                      {day.focus && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">{day.focus}</p>
                      )}
                    </div>
                    <Lock className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 ml-2" />
                  </div>
                  {/* Exercise names visible but non-interactive */}
                  {day.exercises && day.exercises.length > 0 && (
                    <div className="px-3 pb-3 space-y-1">
                      {(day.exercises as Array<{ name: string; sets?: number; reps?: string }>).map((ex, exIdx) => (
                        <div key={exIdx} className="flex items-center gap-2 opacity-50">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          <span className="text-[10px] text-muted-foreground truncate">{ex.name}</span>
                          {ex.sets && ex.reps && (
                            <span className="text-[9px] text-muted-foreground/40 ml-auto flex-shrink-0">{ex.sets}×{ex.reps}</span>
                          )}
                        </div>
                      ))}
                      <p className="text-[9px] text-muted-foreground/40 mt-2 pt-1 border-t border-border/20">
                        Upgrade to edit &amp; adapt all days
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`bg-card border rounded-xl overflow-hidden transition-all duration-300 ${
                    isExpanded ? "border-primary/30" : "border-border"
                  }${highlightedDayIndices.has(idx) ? " ring-1 ring-primary/50 shadow-[0_0_0_2px_rgba(99,102,241,0.12)]" : ""}`}
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
                      {/* Coaching intent banner — surfaces training purpose for this day */}
                      {day.notes && (
                        <div className="px-3 py-2 flex items-start gap-2 bg-muted/10">
                          <span className="text-[9px] flex-shrink-0 mt-0.5 text-muted-foreground/40">💬</span>
                          <p className="text-[10px] text-muted-foreground/55 leading-relaxed italic">{day.notes}</p>
                        </div>
                      )}
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
                                onClick={() => {
                                  const dayNum =
                                    expandedDay !== null
                                      ? (program?.days[expandedDay]?.dayNumber ?? expandedDay + 1)
                                      : undefined;

                                  if (import.meta.env.DEV) {
                                    console.log("[RightPanelLogModalAudit]", {
                                      focusMode: panelFocusMode,
                                      trainingSystemId: savedProgramId ?? null,
                                      weekNumber: program?.weekNumber ?? null,
                                      sessionId: null,
                                      dayNumber: dayNum ?? null,
                                      modalOpened: true,
                                      directCompletionBlocked: true,
                                    });
                                  }

                                  // Save exercise progression data immediately so it is
                                  // captured even if the user cancels the feedback modal.
                                  // Completion (active-session/complete) is deferred until
                                  // the user actually submits the session log form.
                                  if (sessionLogs.size > 0) {
                                    const exercises = Array.from(sessionLogs.entries()).map(
                                      ([exerciseName, sets]) => ({ exerciseName, sets })
                                    );
                                    customFetch("/api/session-logs/complete", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        savedProgramId: savedProgramId ?? undefined,
                                        dayNumber: dayNum,
                                        exercises,
                                        goal: trainingGoal ?? "general_fitness",
                                      }),
                                    })
                                      .then(() => {
                                        setTimeout(() => refetchTargets(), 600);
                                        queryClient.invalidateQueries({ queryKey: ["training-system-history", "changes"] });
                                      })
                                      .catch(() => {});
                                  }

                                  // Open the session log feedback modal — session is only
                                  // marked complete after the user submits that form.
                                  onLogSession?.();
                                }}
                                disabled={sessionCompleting}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-[11px] font-semibold hover:bg-green-500/25 transition-all disabled:opacity-50"
                              >
                                <CheckCircle className="w-3 h-3" /> Log Session
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
                            // isLoading covers both chat-routed (pendingRefinement) and
                            // direct-mutate (panelMutating) paths for this button.
                            const isLoading = pendingRefinement === key || panelMutating === key;
                            // Disable all session pills while ANY direct mutation is in flight
                            // (in addition to while the chat stream is building).
                            const isDisabled = !!buildingState?.isBuilding || !!panelMutating;
                            return (
                              <button
                                key={action.label}
                                onClick={() => {
                                  if (import.meta.env.DEV) {
                                    console.log("[ProgramActionRoute]", {
                                      source: "session_action",
                                      label: action.label,
                                      button: action.button ?? null,
                                      isSaved,
                                      systemId: trainingSystemId ?? null,
                                      conversationId: conversationId ?? null,
                                      route: isSaved ? "direct" : "chat",
                                    });
                                  }
                                  // "Add Exercise" on a saved program → dedicated direct-mutate
                                  // endpoint (no chat message, no chat failure bubble, immediate
                                  // cache invalidation on success).
                                  if (action.button === "add_exercise" && isSaved) {
                                    handlePanelAddExercise(idx, day.dayNumber, key);
                                    return;
                                  }
                                  // Saved program — use direct session refine (no chat)
                                  if (isSaved) {
                                    handleDirectSessionRefine(action, idx, day, key);
                                    return;
                                  }
                                  // Unsaved / preview — fall back to chat stream
                                  const sessionActionType: ButtonActionPayload["actionType"] =
                                    action.button === "day_regression" ? "make_easier" :
                                    action.button === "day_progression" ? "make_harder" :
                                    action.button === "add_exercise" ? "add_exercise" :
                                    action.label.toLowerCase().includes("shorter") ? "shorten_session" :
                                    "refine_program";
                                  sendRefinement(action.buildMessage(day.dayNumber), key, {
                                    dayIndex: idx,
                                    interactionType: "session_action",
                                    structuredIntent: action.structuredIntent,
                                    focusMode: panelFocusMode,
                                    ...(action.button ? { button: action.button } : {}),
                                  }, {
                                    source: "program_panel",
                                    scope: "session",
                                    actionType: sessionActionType,
                                    displayText: action.label,
                                    submittedText: action.buildMessage(day.dayNumber),
                                    dayIndex: idx,
                                    dayName: day.name,
                                  });
                                }}
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
                      {(day.exercises ?? []).map((ex: any, exIdx: number) => {
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
                          <div key={exIdx}>
                          <div
                            ref={(el) => {
                              if (el) exerciseRefs.current.set(ex.name, el);
                              else exerciseRefs.current.delete(ex.name);
                            }}
                            onClick={() => {
                              const exAny = ex as Record<string, unknown>;
                              const exData = buildLearnExerciseData(ex.name, {
                                exerciseNotes: ex.notes,
                                classification: exAny.classification as string | undefined,
                                dbCategory: exAny.category as string | undefined,
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
                                  style={{ animation: "badge-pop 30s ease forwards" }}
                                >
                                  Updated
                                </span>
                              )}
                              {/* Learn Exercise trigger */}
                              <ExerciseLearnButton
                                onClick={() => {
                                  const exAny2 = ex as Record<string, unknown>;
                                  const exData = buildLearnExerciseData(ex.name, {
                                    exerciseNotes: ex.notes,
                                    classification: exAny2.classification as string | undefined,
                                    dbCategory: exAny2.category as string | undefined,
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
                                style={{ animation: "label-fade 30s ease forwards" }}
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
                            {/* Exercise action row — Swap / Easier / Harder / Equipment / Explain */}
                            {onSendMessage && (
                              <div
                                className="flex flex-wrap gap-1 mt-2 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity sm:duration-150"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {EXERCISE_ACTIONS.map((action) => {
                                  const exActionKey = `ex-${idx}-${exIdx}-${action.label}`;
                                  const isLoading = pendingRefinement === exActionKey;
                                  const { Icon } = action;
                                  return (
                                    <button
                                      key={action.label}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const exPayload: ButtonActionPayload = {
                                          source: "program_panel",
                                          scope: "exercise",
                                          actionType:
                                            action.direct === "easier" ? "make_easier" :
                                            action.direct === "harder" ? "make_harder" :
                                            action.direct === "swap" ? "swap_exercise" :
                                            action.label === "Equipment" ? "replace_equipment" :
                                            action.label === "Explain" ? "explain_exercise" :
                                            "refine_program",
                                          displayText: action.label,
                                          submittedText: action.buildMessage(ex.name),
                                          dayIndex: idx,
                                          exerciseIndex: exIdx,
                                          exerciseName: ex.name,
                                          dayName: day.name,
                                          currentExerciseData: {
                                            sets: typeof ex.sets === "number" ? ex.sets : undefined,
                                            reps: ex.reps ?? undefined,
                                            rest: ex.rest ?? undefined,
                                            notes: ex.notes ?? undefined,
                                            category: (ex as any).category ?? undefined,
                                          },
                                        };
                                        if (import.meta.env.DEV) {
                                          console.log("[ProgramActionRoute]", {
                                            source: "exercise_action",
                                            label: action.label,
                                            direct: action.direct ?? null,
                                            isSaved,
                                            systemId: trainingSystemId ?? null,
                                            conversationId: conversationId ?? null,
                                            route: action.direct && isSaved ? "direct" : "chat",
                                          });
                                        }
                                        if (action.direct && isSaved) {
                                          handleDirectExerciseEdit(ex.name, action.direct, exActionKey, ex.id);
                                        } else {
                                          sendRefinement(action.buildMessage(ex.name), exActionKey, {
                                            dayIndex: idx,
                                            exerciseId: ex.name,
                                            interactionType: "exercise_action",
                                            focusMode: panelFocusMode,
                                          }, exPayload);
                                        }
                                      }}
                                      disabled={!!buildingState?.isBuilding || !!pendingRefinement}
                                      title={action.buildMessage(ex.name)}
                                      className={`h-7 inline-flex items-center gap-1 px-2 rounded-full text-[10px] font-medium border transition-all duration-150 active:scale-95 select-none ${
                                        isLoading
                                          ? "bg-primary/12 border-primary/35 text-primary"
                                          : "bg-transparent border-border/50 text-muted-foreground/70 hover:border-primary/25 hover:text-foreground hover:bg-accent/40"
                                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                                    >
                                      {isLoading ? (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
                                      ) : (
                                        <Icon className="w-2.5 h-2.5 flex-shrink-0" />
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
                          <PrecisionGlowLine
                            active={exDiff === "added" || exDiff === "swapped"}
                            color={exDiff === "added" ? "primary" : "primary"}
                          />
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
          const coachExplanation = entry.decisionMetadata?.coachExplanation as string | undefined;
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
                {(coachExplanation || whyChanged) && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed italic">↳ {coachExplanation ?? whyChanged}</p>
                )}
              </div>
            );
          }

          // Confirmed is driven exclusively by swapContract.confirmed === true (persisted
          // to decisionMetadata.confirmed). Never by verificationStatus, appliedCount > 0,
          // assistant wording, or outcomeType.
          const confirmed = entry.decisionMetadata?.confirmed === true;
          const verificationStatus = entry.decisionMetadata?.verificationStatus as string | undefined;
          const verificationBadge =
            confirmed
              ? { label: "✓ confirmed", cls: "text-emerald-400 bg-emerald-400/10" }
              : verificationStatus === "partial"
              ? { label: "⚡ partial", cls: "text-amber-400 bg-amber-400/10" }
              : verificationStatus === "failed"
              ? { label: "✗ unconfirmed", cls: "text-red-400 bg-red-400/10" }
              : null;

          return (
            <div
              key={entry.id}
              className="bg-card border border-border rounded-xl p-3"
              style={isNewest && animateNewest ? { animation: "change-entry-in 1.4s ease forwards" } : undefined}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${scopeColor(entry.scope)}`}>
                    {entry.isMajorVersion && entry.versionLabel ? entry.versionLabel : entry.scope}
                  </span>
                  {verificationBadge && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${verificationBadge.cls}`}>
                      {verificationBadge.label}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
              </div>
              <p className="text-[11px] text-foreground leading-relaxed">{entry.changeSummary}</p>
              {(coachExplanation || whyChanged) && (
                <p className="text-[10px] text-primary/55 mt-1.5 leading-relaxed italic">↳ {coachExplanation ?? whyChanged}</p>
              )}
              {!(coachExplanation || whyChanged) && entry.intent && entry.intent !== entry.changeSummary && (
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

function HistoryTab({ hasActiveSystem, focusMode }: { hasActiveSystem?: boolean; focusMode: string }) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const historyUrl = `/api/training-system/history?limit=50&focus=${encodeURIComponent(focusMode)}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-system-history", "versions", focusMode],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>(historyUrl),
    enabled: !!hasActiveSystem,
    staleTime: 0,
  });

  const restoreMutation = useMutation({
    mutationFn: (changeId: number) =>
      customFetch<any>(`/api/training-system/restore/${changeId}?focus=${encodeURIComponent(focusMode)}`, { method: "POST" }),
    onSuccess: (result) => {
      // Use the shared helper so restore invalidates the same key set as any other mutation.
      handleTrainingSystemMutationResult(result, queryClient, focusMode);
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

// ─── Free Changes Preview (non-premium — last 3 entries, no restore) ──────────

function FreeChangesPreview({ hasActiveSystem, newChangeSignal, onUpgrade }: {
  hasActiveSystem?: boolean;
  newChangeSignal?: number;
  onUpgrade?: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["training-system-history", "changes"],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>("/api/training-system/history?limit=3"),
    enabled: !!hasActiveSystem,
    staleTime: 0,
  });

  const history = (data?.history ?? []).slice(0, 3);

  if (!hasActiveSystem || (isLoading && history.length === 0)) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Activity className="w-5 h-5 text-muted-foreground/30 mb-3" />
        <p className="text-[11px] text-muted-foreground">Changes will appear here after your first edit.</p>
      </div>
    );
  }

  if (history.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Activity className="w-5 h-5 text-muted-foreground/30 mb-3" />
        <p className="text-xs font-semibold text-foreground mb-1">No changes yet</p>
        <p className="text-[11px] text-muted-foreground">Every time the AI edits your program, it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full flex flex-col">
      <div className="p-3 space-y-2 flex-1">
        {history.map((entry) => (
          <div key={entry.id} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${scopeColor(entry.scope)}`}>
                {entry.scope}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
            </div>
            <p className="text-[11px] text-foreground leading-relaxed">{entry.changeSummary}</p>
          </div>
        ))}
      </div>
      {onUpgrade && (
        <div className="p-3 border-t border-border/40 bg-muted/10">
          <p className="text-[10px] text-muted-foreground mb-2">Upgrade for full history, diffs, and version restore.</p>
          <button
            onClick={onUpgrade}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
          >
            <Zap className="w-3 h-3" /> Upgrade to Pro
          </button>
        </div>
      )}
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

// ─── Program name generator ───────────────────────────────────────────────────

function generateProgramName(
  backendName: string,
  daysPerWeek: number,
  splitType?: string,
  trainingGoal?: string,
): string {
  const isGeneric =
    !backendName ||
    backendName === "Workout Plan" ||
    backendName === "Training Plan" ||
    backendName === "My Program";
  if (!isGeneric) return backendName;

  const dayStr = daysPerWeek > 0 ? `${daysPerWeek}-Day` : "";
  const goalMap: Record<string, string> = {
    strength: "Strength",
    "fat loss": "Fat Loss",
    "fat-loss": "Fat Loss",
    hypertrophy: "Muscle Hypertrophy",
    endurance: "Endurance",
    speed: "Speed & Acceleration",
    mobility: "Mobility",
    athletic: "Athletic Performance",
    general: "General Fitness",
    football: "Football Performance",
    basketball: "Basketball Performance",
    soccer: "Soccer Performance",
  };
  const goalLabel = trainingGoal
    ? (goalMap[trainingGoal.toLowerCase()] ?? trainingGoal)
    : null;

  if (goalLabel && dayStr) return `${dayStr} ${goalLabel} System`;
  if (goalLabel) return `${goalLabel} System`;
  if (splitType && dayStr) return `${dayStr} ${splitType} Program`;
  if (dayStr) return `${dayStr} Training Program`;
  return "Training Program";
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
  trainingSystemId,
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
  conversationId,
  onOpenAthleteProfile,
}: Props) {
  const { focusMode } = useFocusMode();

  // ── Sidebar-local focus selection ─────────────────────────────────────────
  // The sidebar maintains its OWN selectedFocus so the user can browse any
  // focus lane (Strength / Speed / Mobility) without being locked to the global
  // focusMode.  It initialises from the global focus but can diverge freely.
  const [sidebarFocus, setSidebarFocus] = useState<FocusMode>(focusMode);

  // Keep sidebarFocus in sync when the global focus changes from OUTSIDE the
  // sidebar (e.g. user switches via the top bar or onboarding).
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[SidebarFocus] global focusMode changed →", focusMode, "| syncing sidebarFocus from", sidebarFocus);
    }
    setSidebarFocus(focusMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode]);

  const [activeTab, setActiveTab] = useState<Tab>("program");
  const [unseenChangeCount, setUnseenChangeCount] = useState(0);
  /** Incremented by ProgramTab after each successful sidebar mutation (add/remove exercise) */
  const [sidebarChangeSignal, setSidebarChangeSignal] = useState(0);

  // Check for new system adjustment events to show badge on Adapted tab
  const { data: adaptedNewCount } = useQuery<number>({
    queryKey: ["system-adjustments-new-count", focusMode],
    queryFn: async () => {
      const events = await customFetch<Array<{ id: number; isNew: boolean }>>(
        `/api/system-adjustments?focus=${encodeURIComponent(focusMode)}&limit=20`
      );
      return events.filter((e) => e.isNew).length;
    },
    enabled: !!hasActiveSystem,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const hasUnseenAdaptation = (adaptedNewCount ?? 0) > 0 && activeTab !== "adapted";

  // Latest change entry — used in the summary card to show last-updated info
  const { data: latestChangeData } = useQuery({
    queryKey: ["training-system-history", "changes"],
    queryFn: () => customFetch<{ history: Array<{ id: number; changeSummary: string; createdAt: string; scope: string }> }>("/api/training-system/history?limit=1"),
    enabled: !!hasActiveSystem,
    staleTime: 30_000,
  });
  const latestChange = (latestChangeData as any)?.history?.[0] ?? null;

  const [ownershipBannerType, setOwnershipBannerType] = useState<"active" | "saved" | null>(null);
  const [panelSwitchConfirm, setPanelSwitchConfirm] = useState<string | null>(null);
  const prevChangeSignalRef = useRef(0);
  const prevProgramSignalRef = useRef(0);
  const prevIsSavedRef = useRef(isSaved);
  const ownershipBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownOwnershipActiveRef = useRef(false);
  const panelSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showOwnershipBanner(type: "active" | "saved") {
    setOwnershipBannerType(type);
    if (ownershipBannerTimerRef.current) clearTimeout(ownershipBannerTimerRef.current);
    ownershipBannerTimerRef.current = setTimeout(() => setOwnershipBannerType(null), 6500);
  }

  // New program built → switch to Program tab, reset ownership tracking, show banner
  useEffect(() => {
    if (newProgramSignal > 0 && newProgramSignal !== prevProgramSignalRef.current) {
      prevProgramSignalRef.current = newProgramSignal;
      setActiveTab("program");
      setUnseenChangeCount((c) => c + 1);
      hasShownOwnershipActiveRef.current = false;
      showOwnershipBanner("active");
      hasShownOwnershipActiveRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProgramSignal]);

  // Program edited → switch to Program tab and highlight the change
  // Show ownership banner once per session (first edit only)
  useEffect(() => {
    if (newChangeSignal > 0 && newChangeSignal !== prevChangeSignalRef.current) {
      prevChangeSignalRef.current = newChangeSignal;
      setActiveTab("program");
      setUnseenChangeCount((c) => c + 1);
      if (!hasShownOwnershipActiveRef.current) {
        showOwnershipBanner("active");
        hasShownOwnershipActiveRef.current = true;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChangeSignal]);

  // isSaved transition → show "saved" banner
  useEffect(() => {
    if (isSaved && !prevIsSavedRef.current) {
      showOwnershipBanner("saved");
    }
    prevIsSavedRef.current = isSaved;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaved]);

  // Clear count when user views Changes tab
  useEffect(() => {
    if (activeTab === "changes") {
      setUnseenChangeCount(0);
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
    { id: "adapted", label: "Adapted", subtitle: "What your system changed", icon: RefreshCw },
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
      {/* Ownership banner — transient, appears after build / edit / save */}
      {ownershipBannerType && (
        <div
          className="flex items-start gap-2.5 px-3 py-2 bg-primary/10 border-b border-primary/20 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-300"
          style={{ animation: "fadeSlideIn 0.25s ease both" }}
        >
          <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {ownershipBannerType === "saved" ? (
              <>
                <p className="text-[11px] font-semibold text-primary leading-snug">Saved to your account</p>
                <p className="text-[10px] text-primary/60 leading-snug">Your system is ready anytime.</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold text-primary leading-snug">Your system is active</p>
                <p className="text-[10px] text-primary/60 leading-snug">You can edit this anytime.</p>
              </>
            )}
          </div>
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
              // ── Use LOCAL sidebarFocus (not global focusMode) for isActive ──
              const isActive = sidebarFocus === mode;
              const hasProgram = activeFocusModes[mode];
              return (
                <button
                  key={mode}
                  onClick={() => {
                    // All three pills are always clickable — no hasProgram guard.
                    if (import.meta.env.DEV) {
                      console.log(
                        "[SidebarFocus] pill clicked:", mode,
                        "| global focusMode:", focusMode,
                        "| prev sidebarFocus:", sidebarFocus,
                        "| hasProgram:", hasProgram,
                        "| resulting displayed focus →", mode,
                        "| content filtered by focus:", hasProgram ? "yes (program exists)" : "no program yet"
                      );
                    }
                    setSidebarFocus(mode);
                    if (onFocusModeChange) onFocusModeChange(mode);
                    setPanelSwitchConfirm(cfg.theme.confirmLabel);
                    if (panelSwitchTimerRef.current) clearTimeout(panelSwitchTimerRef.current);
                    panelSwitchTimerRef.current = setTimeout(() => setPanelSwitchConfirm(null), 2200);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-200 select-none ${
                    isActive
                      ? `${cfg.theme.pillActiveClass} shadow-sm`
                      : hasProgram
                      ? `${cfg.theme.inactiveClass} bg-muted/30`
                      : "text-muted-foreground/30 bg-muted/10 hover:text-muted-foreground/50 hover:bg-muted/20"
                  }`}
                  style={isActive ? cfg.theme.pillGlow : undefined}
                  title={hasProgram ? `Switch to ${cfg.label}` : `${cfg.label} — no program yet`}
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

          {/* Active mode banner — uses sidebarFocus so it reflects the pill
               the user clicked, not just the global focusMode */}
          {(() => {
            const activeCfg = getFocusModeConfig(sidebarFocus);
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
                  <FocusIcon mode={sidebarFocus} className={`w-3 h-3 ${activeCfg.theme.iconColorClass}`} />
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

      {/* Active Program Summary Card — program identity at a glance */}
      {hasActiveSystem && program && (
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-border/40 bg-muted/5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground/35 mb-1">Current System</p>
              <p className="text-[12px] font-semibold text-foreground leading-snug truncate">
                {program.programName && program.programName !== "Workout Plan"
                  ? program.programName
                  : `${program.days.length}-Day ${getFocusModeConfig(sidebarFocus).label} Program`}
              </p>
            </div>
            {onOpenAthleteProfile && (
              <button
                onClick={onOpenAthleteProfile}
                title="Athlete Intelligence Profile"
                className="flex-shrink-0 mt-0.5 p-1 rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Brain className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${getFocusModeConfig(sidebarFocus).theme.badgeClass}`}>
              <FocusIcon mode={sidebarFocus} className="w-2.5 h-2.5" />
              {getFocusModeConfig(sidebarFocus).shortLabel}
            </span>
            {program.weekNumber && (
              <span className="text-[10px] text-muted-foreground/60">Week {program.weekNumber}</span>
            )}
            {latestChange && (
              <>
                <span className="text-muted-foreground/25 text-[9px]">·</span>
                <span className="text-[10px] text-muted-foreground/40">{formatRelative(latestChange.createdAt)}</span>
              </>
            )}
          </div>
          {(latestChange?.changeSummary || lastChangeSummary) && (
            <p className="text-[10px] text-muted-foreground/45 mt-1 leading-snug line-clamp-1">
              {(() => {
                const s = latestChange?.changeSummary ?? lastChangeSummary ?? "";
                return s.length > 72 ? s.slice(0, 72) + "…" : s;
              })()}
            </p>
          )}
        </div>
      )}

      {/* Tab bar — horizontally scrollable on narrow viewports */}
      <div className="flex items-center gap-0 border-b border-border flex-shrink-0 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showChangeBadge = tab.id === "changes" && unseenChangeCount > 0;
          const showAdaptedBadge = tab.id === "adapted" && hasUnseenAdaptation;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-shrink-0 items-center gap-1 px-2.5 py-2.5 text-[11px] font-semibold border-b-2 transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
              {showChangeBadge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-black flex items-center justify-center leading-none">
                  {unseenChangeCount > 9 ? "9+" : unseenChangeCount}
                </span>
              )}
              {showAdaptedBadge && (
                <span className="absolute top-1.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
            trainingSystemId={trainingSystemId}
            savedProgramId={savedProgramId}
            trainingGoal={trainingGoal}
            changeTargets={changeTargets}
            newChangeSignal={newChangeSignal}
            newProgramSignal={newProgramSignal}
            pendingChangeHint={pendingChangeHint}
            lastChangeSummary={lastChangeSummary}
            blockMetadata={blockMetadata}
            conversationId={conversationId}
            onSidebarMutation={() => setSidebarChangeSignal((s) => s + 1)}
          />
        )}
        {activeTab === "adapted" && (
          <SystemAdjustmentsPanel hasActiveSystem={hasActiveSystem} />
        )}
        {activeTab === "changes" && (
          !isPremium ? (
            <FreeChangesPreview
              hasActiveSystem={hasActiveSystem}
              newChangeSignal={newChangeSignal + sidebarChangeSignal}
              onUpgrade={onUpgrade}
            />
          ) : (
            <ChangesTab
              hasActiveSystem={hasActiveSystem}
              newChangeSignal={newChangeSignal + sidebarChangeSignal}
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
            <HistoryTab hasActiveSystem={hasActiveSystem} focusMode={focusMode} />
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
