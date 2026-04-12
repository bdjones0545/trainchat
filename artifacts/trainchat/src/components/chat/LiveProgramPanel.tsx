import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell, Save, CheckCircle, Loader2, Lock, Zap, PlayCircle,
  MessageSquare, ChevronDown, ChevronUp, TrendingUp, LayoutGrid,
  Calendar, Clock, RotateCcw, GitBranch, Activity, Layers,
  AlertCircle, RefreshCw,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { ProgramStructure } from "./ChatOutput";
import type { BuildStage } from "@/hooks/useStreamMessage";
import ExerciseLogInline, { type ProgressionTarget } from "@/components/training/ExerciseLogInline";
import CoachForecast from "./CoachForecast";

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
  /** Callback to send a pre-written coaching message from the Forecast tab */
  onSendMessage?: (message: string) => void;
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

// ─── Full skeleton build state (new program) ───────────────────────────────────

function BuildingFromScratch({ stage }: { stage: BuildStage | null }) {
  const phase = getBuildPhase(stage);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Panel header — mirrors the real header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: "1s" }} />
          <span className="text-[9px] font-bold text-primary uppercase tracking-[0.12em]">Building Program</span>
        </div>

        {phase === "init" ? (
          <div className="space-y-2 mt-1">
            <div className="h-3.5 bg-primary/12 rounded-full animate-pulse w-44" />
            <div className="h-2.5 bg-muted/25 rounded-full animate-pulse w-28" />
          </div>
        ) : (
          <div className="space-y-1.5 mt-1">
            <div className="h-3.5 bg-primary/20 rounded-full w-44" />
            <div className="h-2.5 bg-muted/35 rounded-full w-24" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {phase === "init" ? (
          <div className="flex flex-col items-center justify-center h-28 gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
            <span className="text-[10px] text-muted-foreground">Initializing your program…</span>
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

      {/* Save confirmation strip */}
      {phase === "save" && (
        <div
          className="flex-shrink-0 border-t border-green-500/20 bg-green-500/5 px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ animation: "fadeSlideIn 0.2s ease both" }}
        >
          <CheckCircle className="w-3.5 h-3.5 text-green-400 animate-pulse" style={{ animationDuration: "1.2s" }} />
          <span className="text-[11px] font-semibold text-green-400">Saving your program…</span>
        </div>
      )}
    </div>
  );
}

// ─── Updating overlay (existing program being modified) ────────────────────────

function UpdatingBadge({ phase }: { phase: BuildPhase }) {
  return (
    <div
      className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-card/90 border border-primary/25 backdrop-blur-sm rounded-full px-2.5 py-1"
      style={{ animation: "fadeSlideIn 0.2s ease both" }}
    >
      {phase === "save" ? (
        <>
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-[10px] font-semibold text-green-400">Saving…</span>
        </>
      ) : (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
          <span className="text-[10px] font-semibold text-primary">Updating…</span>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyProgramState() {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      <style>{`
        @keyframes emptyPulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.12em]">
            Live Program
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          Your training system will appear here as you build with the agent.
        </p>
      </div>

      <div className="space-y-2">
        {/* Weekly Split skeleton */}
        <div className="bg-card/50 border border-border/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <LayoutGrid className="w-3 h-3 text-muted-foreground/25" />
            <span className="text-[10px] font-semibold text-muted-foreground/35">Weekly Split</span>
          </div>
          <div className="flex gap-1.5">
            {["M", "T", "W", "T", "F"].map((d, i) => (
              <div
                key={i}
                className="flex-1 h-7 bg-muted/15 rounded-lg flex items-center justify-center"
                style={{ animation: `emptyPulse 2.5s ease-in-out ${i * 120}ms infinite` }}
              >
                <span className="text-[9px] text-muted-foreground/25 font-semibold">{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Session skeleton */}
        <div className="bg-card/50 border border-border/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <PlayCircle className="w-3 h-3 text-muted-foreground/25" />
            <span className="text-[10px] font-semibold text-muted-foreground/35">Today's Session</span>
          </div>
          <div className="space-y-2">
            {[72, 56, 64].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="h-2 bg-muted/20 rounded-full"
                  style={{ width: `${w}%`, animation: `emptyPulse 2.5s ease-in-out ${i * 200}ms infinite` }}
                />
                <div className="h-2 bg-muted/12 rounded-full w-12 ml-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Exercise Blocks skeleton */}
        <div className="bg-card/50 border border-border/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Layers className="w-3 h-3 text-muted-foreground/25" />
            <span className="text-[10px] font-semibold text-muted-foreground/35">Exercise Blocks</span>
          </div>
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-1 h-1 rounded-full bg-muted/30 flex-shrink-0" />
                <div
                  className="h-1.5 bg-muted/18 rounded-full flex-1"
                  style={{ animation: `emptyPulse 2.5s ease-in-out ${i * 180}ms infinite` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Progression Strategy skeleton */}
        <div className="bg-card/50 border border-border/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3 h-3 text-muted-foreground/25" />
            <span className="text-[10px] font-semibold text-muted-foreground/35">Progression Strategy</span>
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 bg-muted/18 rounded-full w-4/5" style={{ animation: "emptyPulse 2.5s ease-in-out 0ms infinite" }} />
            <div className="h-1.5 bg-muted/12 rounded-full w-3/5" style={{ animation: "emptyPulse 2.5s ease-in-out 300ms infinite" }} />
          </div>
        </div>

        {/* Agent Change Log skeleton */}
        <div className="bg-card/50 border border-border/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Activity className="w-3 h-3 text-muted-foreground/25" />
            <span className="text-[10px] font-semibold text-muted-foreground/35">Agent Change Log</span>
          </div>
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-muted/25 flex-shrink-0" />
                <div
                  className="h-1.5 bg-muted/15 rounded-full flex-1"
                  style={{ animation: `emptyPulse 2.5s ease-in-out ${i * 220}ms infinite` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramTab({
  program,
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
}: Omit<Props, "hasActiveSystem">) {
  const queryClient = useQueryClient();
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const prevProgramRef = useRef<ProgramStructure | null>(null);
  const [animatedKeys, setAnimatedKeys] = useState<Map<string, DiffType>>(new Map());
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }, 3500);

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

  if (!program) return <EmptyProgramState />;

  const days = program.days ?? [];
  const lockedDayCount = isPremium ? 0 : Math.max(0, days.length - 1);
  const showPaywall = !isPremium && days.length > 1;

  const isUpdating = buildingState?.isBuilding && !!program;
  const updatePhase = isUpdating ? getBuildPhase(buildingState!.stage) : null;

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
      {isUpdating && updatePhase && <UpdatingBadge phase={updatePhase} />}

      {/* "Updating..." feedback banner — shown while AI is modifying the program */}
      {isUpdating && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-primary/8 border-b border-primary/15"
          style={{ animation: "fadeSlideIn 0.2s ease both" }}
        >
          <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />
          <span className="text-[10px] font-semibold text-primary">
            Updating your program based on your input…
          </span>
        </div>
      )}

      {/* Program header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        {(program.weekNumber || program.blockLabel) && (
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3 h-3 text-primary/60" />
            <span className="text-[10px] text-primary/70 font-medium">
              {program.weekNumber && `Week ${program.weekNumber}`}
              {program.weekNumber && program.blockLabel && " · "}
              {program.blockLabel}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: "2s" }} />
          <span className="text-[9px] font-bold text-primary uppercase tracking-[0.12em]">
            Live Program (Auto-Updating)
          </span>
          {!isPremium && (
            <span className="ml-auto text-[9px] font-semibold text-amber-400/70 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Preview
            </span>
          )}
        </div>

        <h3 className="text-sm font-semibold text-foreground leading-snug mb-2">
          {program.programName}
        </h3>

        {(program.splitType || days.length > 0) && (
          <div className="flex items-center gap-3 mb-2">
            {program.splitType && (
              <div className="flex items-center gap-1">
                <LayoutGrid className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{program.splitType}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Dumbbell className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{days.length} days/week</span>
            </div>
          </div>
        )}

        {program.description && (
          <p className="text-[11px] text-foreground/70 leading-relaxed mb-3 font-medium">
            {program.description}
          </p>
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

      {/* What Changed / Why Changed */}
      {(program.whatChanged || program.whyChanged) && (
        <div className="px-4 py-2.5 border-b border-border flex-shrink-0 bg-amber-400/5">
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
        <div className="px-4 py-2.5 border-b border-border flex-shrink-0 bg-primary/5">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.1em] mb-0.5">Progression</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{program.progressionStrategy}</p>
            </div>
          </div>
        </div>
      )}

      {/* Days */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {days.map((day, idx) => {
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
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
                        }`}>
                          Day {day.dayNumber}
                        </span>
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
                            className="px-3 py-2.5"
                            style={rowAnim ? { animation: rowAnim } : undefined}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className="text-[11px] font-medium text-foreground"
                                style={isHighlighted ? { animation: "ex-name-fadein 0.4s ease forwards" } : undefined}
                              >
                                {ex.name}
                              </p>
                              {isHighlighted && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0"
                                  style={{ animation: "badge-pop 3.5s ease forwards" }}
                                >
                                  Updated
                                </span>
                              )}
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
                            {isPremium && isSaved && (
                              <ExerciseLogInline
                                exerciseName={ex.name}
                                programId={savedProgramId}
                                dayNumber={day.dayNumber}
                                orderIndex={exIdx}
                                target={targetsMap.get(ex.name)}
                                onLogged={handleExerciseLogged}
                              />
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
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("program");
  const [hasUnseenChange, setHasUnseenChange] = useState(false);
  const [showBuildSuccess, setShowBuildSuccess] = useState(false);
  const prevChangeSignalRef = useRef(0);
  const prevProgramSignalRef = useRef(0);
  const buildSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return <BuildingFromScratch stage={buildingState.stage} />;
  }

  const tabs: { id: Tab; label: string; subtitle: string; icon: React.ElementType }[] = [
    { id: "program", label: "Program", subtitle: "Current build · live", icon: Dumbbell },
    { id: "changes", label: "Changes", subtitle: "What changed & why", icon: Activity },
    { id: "history", label: "History", subtitle: "How it evolved", icon: GitBranch },
    { id: "forecast", label: "Forecast", subtitle: "What's coming next", icon: Zap },
  ];

  const activeTabMeta = tabs.find((t) => t.id === activeTab);

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
            {activeTabMeta.subtitle}
          </span>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "program" && (
          <ProgramTab
            program={program}
            buildingState={buildingState}
            onSave={onSave}
            onFeedback={onFeedback}
            onLogSession={onLogSession}
            onUpgrade={onUpgrade}
            isSaving={isSaving}
            isSaved={isSaved}
            isPremium={isPremium}
            savedProgramId={savedProgramId}
            trainingGoal={trainingGoal}
            changeTargets={changeTargets}
            newChangeSignal={newChangeSignal}
          />
        )}
        {activeTab === "changes" && (
          <ChangesTab
            hasActiveSystem={hasActiveSystem}
            newChangeSignal={newChangeSignal}
          />
        )}
        {activeTab === "history" && <HistoryTab hasActiveSystem={hasActiveSystem} />}
        {activeTab === "forecast" && <CoachForecast onSendMessage={onSendMessage} />}
      </div>
    </div>
  );
}
