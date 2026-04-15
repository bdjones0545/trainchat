/**
 * EditDrawer — Phase A: Collaborative Decision Layer
 *
 * For exercise targets, shows a "Log Performance" section first:
 *   1. Last session data
 *   2. Per-set weight/reps inputs with quick +/- controls
 *   3. Feedback buttons (Too Easy / Challenging / Too Hard)
 *   4. "Complete Exercise" save action
 *
 * Then the existing AI edit flow:
 *   5. Quick Actions
 *   6. Custom Request (AI)
 */

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import {
  X,
  Dumbbell,
  Calendar,
  Layers,
  BarChart3,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Clock,
  MessageCircle,
  TrendingUp,
  Plus,
  Minus,
  Check,
  Copy,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { ProgressionTarget, SetLog } from "./ExerciseLogInline";
import { inferLoggingMode, getModeConfig, type LoggingMode } from "@/lib/loggingMode";
import {
  evaluateLiveSetPerformance,
  type LiveRecommendation,
  type LiveAdjustment,
} from "@/lib/midSessionEngine";
import CoachInsightCard from "./CoachInsightCard";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditTargetType = "exercise" | "session" | "week" | "phase" | "system";

export interface EditTarget {
  type: EditTargetType;
  id: number;
  label: string;
  parentLabel?: string;
}

export interface ChangedIds {
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}

export interface ChangeTarget {
  type: "exercise_swap" | "exercise_update" | "exercise_added";
  originalExercise?: string;
  newExercise: string;
  exerciseId: number;
  changeDetail?: string;
}

export interface EditResult {
  intent: string;
  scope: string;
  changeSummary: string;
  appliedCount: number;
  skippedCount: number;
  changedIds: ChangedIds;
  changeTargets?: ChangeTarget[];
  updatedData: { today: any; week: any; block: any };
  changeLogId?: number;
}

export interface DirectionOption {
  id: string;
  label: string;
  whatWillChange: string;
  whyItMatters: string;
  editRequest: string;
}

export interface DirectionsResponse {
  shouldSkipDirections: boolean;
  coachMessage?: string;
  directions?: DirectionOption[];
  directEditRequest?: string;
  memoryCallout?: string;
  continuityPrompt?: string;
}

/** Extra context provided when the drawer is opened for an exercise target */
export interface ExerciseContext {
  prescribedSets?: number;
  savedProgramId?: number;
  dayNumber?: number;
  trainingGoal?: string;
  category?: string;
}

interface EditDrawerProps {
  target: EditTarget;
  onClose: () => void;
  onEditComplete: (result: EditResult) => void;
  prefillRequest?: string;
  exerciseContext?: ExerciseContext;
  uiContext?: Record<string, unknown>;
}

type DrawerPhase = "input" | "directions" | "executing" | "success" | "error";
type FeedbackTag = "too_easy" | "challenging" | "too_hard";

// ─── Contextual Suggestions ───────────────────────────────────────────────────

const SUGGESTIONS: Record<EditTargetType, string[]> = {
  exercise: [
    "Swap this exercise",
    "Easier variation",
    "Harder variation",
    "Change the rep range",
    "Add a set",
    "Remove a set",
    "Make it shoulder-friendly",
    "Add explosive cue",
  ],
  session: [
    "Shorten this session",
    "Lower the volume",
    "Recovery emphasis",
    "Equipment-friendly version",
    "More explosive work",
    "More athletic emphasis",
    "Reduce fatigue on this day",
  ],
  week: [
    "Make this a deload week",
    "Increase intensity",
    "Reduce overall fatigue",
    "Travel / minimal equipment mode",
    "Add more volume",
    "Less volume this week",
  ],
  phase: [
    "More power-focused",
    "Shift toward hypertrophy",
    "Field-sport emphasis",
    "General fitness bias",
    "More variety",
    "Shorter block",
  ],
  system: [
    "Reduce overall volume",
    "Increase training intensity",
    "Make it a deload week",
    "Modify for injury",
    "Swap all heavy compound lifts",
    "Simplify the schedule",
  ],
};

// ─── Target header config ─────────────────────────────────────────────────────

const TARGET_CONFIG: Record<
  EditTargetType,
  { icon: React.ElementType; label: string; color: string; bg: string; border: string }
> = {
  exercise: {
    icon: Dumbbell,
    label: "Exercise",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
  },
  session: {
    icon: Layers,
    label: "Session",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  week: {
    icon: Calendar,
    label: "Week",
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
  },
  phase: {
    icon: BarChart3,
    label: "Block",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/20",
  },
  system: {
    icon: Sparkles,
    label: "System",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
};

// Direction card colors (cycle through)
const DIRECTION_COLORS = [
  { accent: "text-primary", bg: "bg-primary/8", border: "border-primary/25", hover: "hover:border-primary/60 hover:bg-primary/12" },
  { accent: "text-orange-400", bg: "bg-orange-400/8", border: "border-orange-400/25", hover: "hover:border-orange-400/60 hover:bg-orange-400/12" },
  { accent: "text-green-400", bg: "bg-green-400/8", border: "border-green-400/25", hover: "hover:border-green-400/60 hover:bg-green-400/12" },
  { accent: "text-purple-400", bg: "bg-purple-400/8", border: "border-purple-400/25", hover: "hover:border-purple-400/60 hover:bg-purple-400/12" },
];

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchDirections(
  request: string,
  target: EditTarget
): Promise<DirectionsResponse> {
  return customFetch<DirectionsResponse>("/api/training-system/directions", {
    method: "POST",
    body: JSON.stringify({
      request,
      targetContext: {
        type: target.type,
        id: target.id,
        label: target.label,
        parentLabel: target.parentLabel,
      },
    }),
  });
}

async function submitTargetedEdit(
  request: string,
  target: EditTarget,
  uiContext?: Record<string, unknown>
): Promise<EditResult> {
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify({
      request,
      targetContext: {
        type: target.type,
        id: target.id,
        label: target.label,
        parentLabel: target.parentLabel,
      },
      ...(uiContext ? { uiContext } : {}),
    }),
  });
}

// ─── Performance logging helpers ──────────────────────────────────────────────

function buildSets(count: number, lastLoad: number | null, lastReps: number | null): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    weight: lastLoad,
    reps: lastReps,
    completed: false,
  }));
}

function clampWeight(v: number) {
  return Math.max(0, Math.min(2000, Math.round(v * 4) / 4));
}

function clampReps(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ─── Inline set row ───────────────────────────────────────────────────────────

function SetRow({ set, mode, onChange, onSave }: {
  set: SetLog;
  mode: LoggingMode;
  onChange: (patch: Partial<SetLog>) => void;
  onSave: () => void;
}) {
  const cfg = getModeConfig(mode);

  function adjPrimary(d: number) {
    const step = Math.abs(d) < 2 ? 1 : cfg.primaryDelta;
    const next = (set.weight ?? 0) + (d > 0 ? step : -step);
    onChange({ weight: Math.max(0, Math.round(next * 10) / 10) });
  }
  function adjSecondary(d: number) {
    onChange({ reps: clampReps((set.reps ?? 0) + d) });
  }
  function toggle() {
    const next = !set.completed;
    onChange({ completed: next });
    if (next) onSave();
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
        set.completed
          ? "bg-green-500/8 border border-green-500/20"
          : "bg-muted/20 border border-border/40"
      }`}
    >
      {/* Set label */}
      <span className="text-[10px] font-bold text-muted-foreground/50 w-6 flex-shrink-0">
        S{set.setNumber}
      </span>

      {/* Primary field (weight / distance / height / time) */}
      {cfg.showPrimary && (
        <div className="flex items-center gap-1 bg-background/60 border border-border/60 rounded-lg px-2 py-1">
          <button onClick={() => adjPrimary(-1)} type="button" className="text-muted-foreground/60 hover:text-foreground">
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={set.weight ?? ""}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChange({ weight: isNaN(n) ? null : Math.max(0, n) });
            }}
            placeholder={cfg.primaryPlaceholder}
            className="w-12 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none tabular-nums text-center"
            step={cfg.primaryStep}
          />
          <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{cfg.primaryLabel}</span>
          <button onClick={() => adjPrimary(1)} type="button" className="text-muted-foreground/60 hover:text-foreground">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Quick +5/+10 — load_reps only */}
      {cfg.showQuickJumps && (
        <div className="flex gap-0.5">
          {[5, 10].map((d) => (
            <button
              key={d}
              onClick={() => onChange({ weight: clampWeight((set.weight ?? 0) + d) })}
              type="button"
              className="text-[9px] font-bold text-muted-foreground/50 hover:text-primary px-1.5 py-1 rounded-md bg-muted/10 hover:bg-primary/10 transition-colors"
            >
              +{d}
            </button>
          ))}
        </div>
      )}

      {/* Secondary field (reps / time) */}
      {cfg.showSecondary && (
        <div className="flex items-center gap-1 bg-background/60 border border-border/60 rounded-lg px-2 py-1">
          <button onClick={() => adjSecondary(-1)} type="button" className="text-muted-foreground/60 hover:text-foreground">
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={set.reps ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange({ reps: isNaN(n) ? null : clampReps(n) });
            }}
            placeholder={cfg.secondaryPlaceholder}
            className="w-10 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none tabular-nums text-center"
          />
          <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{cfg.secondaryLabel}</span>
          <button onClick={() => adjSecondary(1)} type="button" className="text-muted-foreground/60 hover:text-foreground">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Completed toggle */}
      <button
        onClick={toggle}
        type="button"
        className={`ml-auto w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          set.completed
            ? "bg-green-500 border-green-500"
            : "border-border/60 hover:border-green-500/60"
        }`}
      >
        {set.completed && <Check className="w-3 h-3 text-white" />}
      </button>
    </div>
  );
}

// ─── Performance logging section ──────────────────────────────────────────────

function ExerciseLogSection({
  exerciseName,
  exerciseContext,
  onLogComplete,
}: {
  exerciseName: string;
  exerciseContext: ExerciseContext;
  onLogComplete: (tag: FeedbackTag | null) => void;
}) {
  const mode = inferLoggingMode(exerciseName, exerciseContext.category);
  const isMobilityFlow = mode === "mobility_flow";
  const prescribedSets = isMobilityFlow ? 1 : (exerciseContext.prescribedSets ?? 3);

  // Fetch last session data / progression target
  const { data: targetData } = useQuery<{ targets: ProgressionTarget[] }>({
    queryKey: ["progressionTarget", exerciseName, exerciseContext.savedProgramId, exerciseContext.trainingGoal],
    queryFn: async () => {
      const params = new URLSearchParams({ exerciseNames: exerciseName });
      if (exerciseContext.savedProgramId) params.set("programId", String(exerciseContext.savedProgramId));
      if (exerciseContext.trainingGoal) params.set("goal", exerciseContext.trainingGoal);
      return customFetch<{ targets: ProgressionTarget[] }>(`/api/exercise-logs/targets?${params.toString()}`);
    },
    staleTime: 30000,
  });

  const target = targetData?.targets?.[0] ?? null;
  const lastLoad = target?.lastLoad ?? null;
  const lastReps = target?.lastReps ?? null;
  const hasHistory = lastLoad !== null || lastReps !== null;

  const [sets, setSets] = useState<SetLog[]>(() => buildSets(prescribedSets, lastLoad, lastReps));
  const [feedbackTag, setFeedbackTag] = useState<FeedbackTag | null>(null);
  const [painLevel, setPainLevel] = useState<"none" | "mild" | "moderate" | "significant" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [progressionMsg, setProgressionMsg] = useState<string | null>(null);

  // Mid-session coaching state
  const [coachInsight, setCoachInsight] = useState<LiveRecommendation | null>(null);
  const [liveAdjustments, setLiveAdjustments] = useState<LiveAdjustment[]>([]);
  const [lastInsightSetIndex, setLastInsightSetIndex] = useState<number | null>(null);

  // Re-init when target loads
  useEffect(() => {
    if (lastLoad !== null || lastReps !== null) {
      setSets((prev) => {
        const blank = prev.every((s) => s.weight === null && s.reps === null && !s.completed);
        return blank ? buildSets(prescribedSets, lastLoad, lastReps) : prev;
      });
    }
  }, [lastLoad, lastReps, prescribedSets]);

  function updateSet(i: number, patch: Partial<SetLog>) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function autoSaveSet(i: number) {
    const s = sets[i];
    try {
      await customFetch("/api/exercise-logs", {
        method: "POST",
        body: JSON.stringify({
          exerciseName,
          programId: exerciseContext.savedProgramId,
          dayNumber: exerciseContext.dayNumber,
          orderIndex: s.setNumber - 1,
          completionStatus: "solid",
          loadUsed: s.weight ?? undefined,
          repsCompleted: s.reps ?? undefined,
          setsCompleted: 1,
        }),
      });
    } catch {
      // best-effort
    }

    // Run mid-session evaluation after saving (non-blocking)
    // Use a tiny delay so the UI reflects the completed set state first
    setTimeout(() => {
      const currentSets = sets.map((set, idx) => ({
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        completed: idx === i ? true : set.completed,
      }));

      const rec = evaluateLiveSetPerformance({
        exerciseName,
        category: exerciseContext.category,
        currentSetIndex: i,
        allSets: currentSets,
        totalPrescribedSets: prescribedSets,
        targetLoad: target?.targetLoad ?? null,
        targetReps: target?.targetReps ?? null,
        lastSessionLoad: lastLoad,
        lastSessionReps: lastReps,
        perceivedDifficulty: feedbackTag === "too_easy" ? "too_easy" : feedbackTag === "too_hard" ? "too_hard" : feedbackTag === "challenging" ? "just_right" : null,
        painLevel: painLevel ?? "none",
      });

      // Only surface non-trivial insights (skip on_track for first set unless there's something interesting)
      const isFirstSet = i === 0;
      if (!isFirstSet || rec.status !== "on_track") {
        setCoachInsight(rec);
        setLastInsightSetIndex(i);
      }
    }, 120);
  }

  function applyRecommendation(rec: LiveRecommendation) {
    const setIndex = lastInsightSetIndex ?? 0;
    const remaining = sets.filter((_, i) => i > setIndex && !sets[i].completed);

    if (rec.status === "stop_exercise") {
      // Remove remaining uncompleted sets — keep only completed
      setSets((prev) => prev.filter((_, i) => i <= setIndex || prev[i].completed));
      setLiveAdjustments((prev) => [
        ...prev,
        {
          exerciseName,
          changeType: "volume_reduction",
          oldValue: `${sets.length} sets`,
          newValue: `${setIndex + 1} sets (stopped early)`,
          reason: rec.reason,
          setAppliedAt: setIndex + 1,
          acceptedByUser: true,
        },
      ]);
    } else if (rec.status === "adjust_load" && rec.adjustedLoad !== null) {
      const newLoad = rec.adjustedLoad;
      setSets((prev) =>
        prev.map((s, i) =>
          i > setIndex && !s.completed ? { ...s, weight: newLoad } : s,
        ),
      );
      const oldLoad = sets[setIndex]?.weight ?? null;
      setLiveAdjustments((prev) => [
        ...prev,
        {
          exerciseName,
          changeType: rec.adjustedLoad! > (oldLoad ?? 0) ? "load_increase" : "load_reduction",
          oldValue: oldLoad,
          newValue: newLoad,
          reason: rec.reason,
          setAppliedAt: setIndex + 1,
          acceptedByUser: true,
        },
      ]);
    } else if (rec.status === "adjust_volume" && remaining.length > 0) {
      // Remove last remaining set
      const lastRemainingIndex = sets.map((s, i) => (!s.completed && i > setIndex ? i : -1)).filter((x) => x >= 0).pop();
      if (lastRemainingIndex !== undefined) {
        setSets((prev) => prev.filter((_, i) => i !== lastRemainingIndex));
        setLiveAdjustments((prev) => [
          ...prev,
          {
            exerciseName,
            changeType: "volume_reduction",
            oldValue: `${sets.length} sets`,
            newValue: `${sets.length - 1} sets`,
            reason: rec.reason,
            setAppliedAt: setIndex + 1,
            acceptedByUser: true,
          },
        ]);
      }
    } else if (rec.status === "adjust_rest") {
      setLiveAdjustments((prev) => [
        ...prev,
        {
          exerciseName,
          changeType: "rest_increase",
          oldValue: null,
          newValue: rec.extraRestSec ? `+${rec.extraRestSec}s rest` : "extended rest",
          reason: rec.reason,
          setAppliedAt: setIndex + 1,
          acceptedByUser: true,
        },
      ]);
    }

    setCoachInsight(null);
  }

  function fillFromLast() {
    setSets((prev) => prev.map((s) => ({ ...s, weight: lastLoad, reps: lastReps })));
  }

  async function handleComplete() {
    if (saving || saved) return;
    setSaving(true);

    const completedSets = sets.filter((s) => s.completed);

    try {
      const result = await customFetch<{ progressions: string[] }>("/api/session-logs/complete", {
        method: "POST",
        body: JSON.stringify({
          savedProgramId: exerciseContext.savedProgramId,
          dayNumber: exerciseContext.dayNumber,
          goal: exerciseContext.trainingGoal ?? "general_fitness",
          perceivedDifficulty:
            feedbackTag === "too_easy" ? "too_easy" :
            feedbackTag === "too_hard" ? "too_hard" :
            feedbackTag === "challenging" ? "just_right" :
            undefined,
          painLevel: painLevel ?? undefined,
          exercises: [{
            exerciseName,
            category: exerciseContext.category,
            sets,
          }],
          liveAdjustments: liveAdjustments.length > 0 ? liveAdjustments : undefined,
        }),
      });

      const progression = result.progressions?.[0] ?? null;
      setProgressionMsg(progression);
      setSaved(true);
      setTimeout(() => onLogComplete(feedbackTag), 1200);
    } catch {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="px-5 py-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-green-400">Exercise logged!</span>
        </div>
        {progressionMsg && (
          <div className="flex items-start gap-2 bg-primary/8 border border-primary/20 rounded-xl px-3 py-2.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-primary/80 leading-relaxed">{progressionMsg}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Mobility / warm-up flow — simple "Done" UI ────────────────────────────
  if (isMobilityFlow) {
    const done = sets[0]?.completed ?? false;
    return (
      <div className="px-5 pt-4 pb-2 space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Warm-Up / Prep
        </p>
        <button
          onClick={async () => {
            updateSet(0, { completed: true });
            await autoSaveSet(0);
            await handleComplete();
          }}
          disabled={saving || done}
          type="button"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:border-green-500/40 hover:text-green-400 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><span className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" /> Saving…</>
          ) : done ? (
            <><CheckCircle2 className="w-4 h-4 text-green-400" /> Done</>
          ) : (
            <><Check className="w-4 h-4" /> Mark as Done</>
          )}
        </button>
      </div>
    );
  }

  const completedCount = sets.filter((s) => s.completed).length;
  const stateLabel = target?.progressionState === "ready_to_progress"
    ? { text: "↑ Progress", cls: "text-green-400 bg-green-500/10 border-green-500/20" }
    : target?.progressionState === "regress"
    ? { text: "↓ Reduce", cls: "text-red-400 bg-red-500/10 border-red-500/20" }
    : target?.progressionState === "review"
    ? { text: "⚑ Review", cls: "text-red-400 bg-red-500/10 border-red-500/20" }
    : target?.progressionState === "hold"
    ? { text: "→ Hold", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" }
    : null;

  const cfg = getModeConfig(mode);

  // Progression type label for display hint
  const progressionHints: Record<string, string> = {
    distance_reps: "Track distance (ft) — quality drives progression",
    height_reps: "Track height (in) — clean landings before raising the bar",
    throws_reps: "Track reps — max explosiveness every rep",
    time_only: "Track hold time — position before duration",
    distance_time: "Track distance + time — full rest between reps",
    reps_only: "Track reps — add reps before adding load",
    mobility_flow: "Completion-based — control and quality count most",
  };
  const progressionHint = progressionHints[mode] ?? null;

  function formatLastSession() {
    if (!hasHistory) return null;
    const parts: string[] = [];
    if (lastLoad !== null) {
      const label = cfg.primaryLabel || "units";
      parts.push(`${lastLoad} ${label}`);
    }
    if (lastReps !== null) {
      const label = cfg.secondaryLabel === "s" ? "sec" : "reps";
      parts.push(`${lastReps} ${label}`);
    }
    return parts.join(" × ");
  }

  return (
    <div className="px-5 pt-4 pb-2 space-y-3">
      {/* Section title */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Log Performance
        </p>
        {stateLabel && (
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${stateLabel.cls}`}>
            {stateLabel.text}
          </span>
        )}
      </div>

      {/* Progression type hint */}
      {progressionHint && (
        <p className="text-[10px] text-muted-foreground/50 -mt-1">{progressionHint}</p>
      )}

      {/* Last session data */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasHistory ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Last session:</span>
              <span className="font-semibold text-foreground">{formatLastSession()}</span>
            </div>
            {mode === "load_reps" && target?.targetLoad !== null && target?.targetLoad !== lastLoad && (
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="w-3 h-3 text-primary/60" />
                <span className="text-primary font-semibold">
                  Target: {target?.targetLoad} lbs
                </span>
              </div>
            )}
            <button
              onClick={fillFromLast}
              type="button"
              className="flex items-center gap-1 text-[10px] font-semibold text-primary/60 hover:text-primary transition-colors ml-auto"
            >
              <Copy className="w-3 h-3" /> Same as last
            </button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">First time performing this exercise</p>
        )}
      </div>

      {/* Per-set rows with inline coach insight */}
      <div className="space-y-1.5">
        {sets.map((set, i) => {
          const isLastCompleted = set.completed && (i === sets.length - 1 || !sets[i + 1]?.completed);
          return (
            <div key={set.setNumber}>
              <SetRow
                set={set}
                mode={mode}
                onChange={(patch) => updateSet(i, patch)}
                onSave={() => autoSaveSet(i)}
              />
              {/* Coach insight appears right after the last completed set */}
              {isLastCompleted && coachInsight && lastInsightSetIndex === i && (
                <div className="mt-2">
                  <CoachInsightCard
                    recommendation={coachInsight}
                    onApply={applyRecommendation}
                    onDismiss={() => setCoachInsight(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {completedCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500/70 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / sets.length) * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-bold text-muted-foreground/60">
            {completedCount}/{sets.length}
          </span>
        </div>
      )}

      {/* Feedback tags */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          How did it feel?
        </p>
        <div className="flex gap-2">
          {([
            { value: "too_easy",    label: "Too Easy",    cls: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
            { value: "challenging", label: "Challenging", cls: "text-green-400 border-green-500/30 bg-green-500/10" },
            { value: "too_hard",    label: "Too Hard",    cls: "text-red-400 border-red-500/30 bg-red-500/10" },
          ] as { value: FeedbackTag; label: string; cls: string }[]).map((fb) => (
            <button
              key={fb.value}
              onClick={() => setFeedbackTag((v) => v === fb.value ? null : fb.value)}
              type="button"
              className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-all duration-150 ${
                feedbackTag === fb.value
                  ? fb.cls
                  : "bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pain level selector */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Any pain or discomfort?
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { value: "none",         label: "None" },
            { value: "mild",         label: "Mild" },
            { value: "moderate",     label: "Moderate" },
            { value: "significant",  label: "Significant" },
          ] as { value: "none" | "mild" | "moderate" | "significant"; label: string }[]).map((p) => (
            <button
              key={p.value}
              onClick={() => setPainLevel((v) => v === p.value ? null : p.value)}
              type="button"
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all duration-150 ${
                painLevel === p.value
                  ? p.value === "none" || p.value === "mild"
                    ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : p.value === "moderate"
                    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    : "text-red-400 border-red-500/30 bg-red-500/10"
                  : "bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Complete Exercise button */}
      <button
        onClick={handleComplete}
        disabled={saving || completedCount === 0}
        type="button"
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? (
          <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Saving…</>
        ) : (
          <><CheckCircle2 className="w-4 h-4" /> Complete Exercise</>
        )}
      </button>
      {completedCount === 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center -mt-1">
          Mark at least one set complete to save
        </p>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function EditDrawer({ target, onClose, onEditComplete, prefillRequest, exerciseContext, uiContext }: EditDrawerProps) {
  const [input, setInput] = useState(prefillRequest ?? "");
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<DrawerPhase>("input");
  const [directions, setDirections] = useState<DirectionsResponse | null>(null);
  const [editResult, setEditResult] = useState<EditResult | null>(null);
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loggedFeedback, setLoggedFeedback] = useState<FeedbackTag | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const config = TARGET_CONFIG[target.type];
  const Icon = config.icon;
  const suggestions = SUGGESTIONS[target.type];
  const isExercise = target.type === "exercise";

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Focus textarea when in input phase (only when logging section is not shown)
  useEffect(() => {
    if (visible && phase === "input" && !isExercise) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [visible, phase, isExercise]);

  // ── Directions fetch mutation ──
  const directionsMutation = useMutation({
    mutationFn: (request: string) => fetchDirections(request, target),
    onSuccess: (data) => {
      if (data.shouldSkipDirections) {
        setPhase("executing");
        editMutation.mutate(data.directEditRequest ?? input.trim());
      } else {
        setDirections(data);
        setPhase("directions");
      }
    },
    onError: () => {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase("error");
    },
  });

  // ── Edit execution mutation ──
  const editMutation = useMutation({
    mutationFn: (request: string) => submitTargetedEdit(request, target, uiContext),
    onSuccess: (data) => {
      setEditResult(data);
      setPhase("success");
      setTimeout(() => onEditComplete(data), 800);
    },
    onError: () => {
      setErrorMsg("The edit could not be applied. Please try again.");
      setPhase("error");
    },
  });

  function animateClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) animateClose();
  }

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || directionsMutation.isPending) return;
    setErrorMsg(null);
    setPhase("executing");
    directionsMutation.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") animateClose();
  }

  function handleSuggestion(text: string) {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleSelectDirection(direction: DirectionOption) {
    setSelectedDirectionId(direction.id);
    setPhase("executing");
    editMutation.mutate(direction.editRequest);
  }

  function handleBackToInput() {
    setPhase("input");
    setDirections(null);
    setSelectedDirectionId(null);
    setErrorMsg(null);
  }

  function handleLogComplete(tag: FeedbackTag | null) {
    setLoggedFeedback(tag);
    // If user marked "too easy" or "too hard" auto-fill the AI request
    if (tag === "too_easy") {
      setInput("Increase weight — I rated this too easy");
    } else if (tag === "too_hard") {
      setInput("Reduce load — I rated this too hard");
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
        transition: "background 0.3s ease",
      }}
    >
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "92vh",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {phase === "directions" && (
                <button
                  onClick={handleBackToInput}
                  className="w-10 h-10 rounded-xl bg-muted/60 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {phase !== "directions" && (
                <div className={`w-10 h-10 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {phase === "directions" ? "Choose Direction" : isExercise ? "Log + Edit" : "Edit with Coach"}
                  </span>
                </div>
                <h3 className="font-bold text-base text-foreground leading-tight truncate">
                  {target.label}
                </h3>
                {target.parentLabel && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    in {target.parentLabel}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={animateClose}
              className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Phase: Input ────────────────────────────────────────── */}
        {phase === "input" && (
          <div className="flex-1 flex flex-col overflow-y-auto">

            {/* ── Performance logging section (exercise only) ──────── */}
            {isExercise && exerciseContext && (
              <>
                <ExerciseLogSection
                  exerciseName={target.label}
                  exerciseContext={exerciseContext}
                  onLogComplete={handleLogComplete}
                />
                <div className="mx-5 border-t border-border" />
              </>
            )}

            {/* ── Quick Actions ──── */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                Quick Actions
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="flex-shrink-0 text-xs bg-muted/50 text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-5 border-t border-border flex-shrink-0" />

            {/* ── Custom Request ──── */}
            <div className="px-5 pt-4 pb-6 flex-shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                Custom Request
              </p>
              {loggedFeedback && (
                <div className="mb-3 flex items-center gap-2 text-[10px] text-primary/70 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
                  <Sparkles className="w-3 h-3 flex-shrink-0" />
                  <span>Performance logged — coach suggestion pre-filled below</span>
                </div>
              )}
              <div className="flex gap-2.5 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Tell your coach what to change about this ${target.type}…`}
                  rows={3}
                  className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-all duration-150"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: Directions ───────────────────────────────────── */}
        {phase === "directions" && directions && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {directions.memoryCallout && (
              <div className="mx-5 mt-4 mb-0 flex items-start gap-2.5 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                <Clock className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-primary/80 leading-relaxed italic">
                  {directions.memoryCallout}
                </p>
              </div>
            )}

            {directions.coachMessage && (
              <div className="px-5 pt-4 pb-3 flex-shrink-0">
                <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                  {directions.coachMessage}
                </p>
              </div>
            )}

            <div className="px-5 pb-4 flex flex-col gap-3">
              {(directions.directions ?? []).map((dir, i) => {
                const colors = DIRECTION_COLORS[i % DIRECTION_COLORS.length];
                return (
                  <button
                    key={dir.id}
                    onClick={() => handleSelectDirection(dir)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 active:scale-[0.98] ${colors.border} ${colors.bg} ${colors.hover}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <span className={`text-xs font-bold ${colors.accent}`}>{dir.id}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold mb-1 ${colors.accent}`}>{dir.label}</p>
                          <p className="text-xs text-foreground/80 leading-relaxed mb-1.5">
                            {dir.whatWillChange}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {dir.whyItMatters}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${colors.accent} opacity-60`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {directions.continuityPrompt && (
              <div className="mx-5 mb-6 mt-1">
                <div className="flex items-start gap-2.5 bg-muted/40 border border-border rounded-xl px-4 py-3">
                  <MessageCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {directions.continuityPrompt}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Phase: Executing ────────────────────────────────────── */}
        {phase === "executing" && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-5">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground text-base mb-1.5">
                {directionsMutation.isPending
                  ? "Thinking through the best directions…"
                  : "Applying your choice…"}
              </p>
              <p className="text-sm text-muted-foreground">
                {directionsMutation.isPending
                  ? "Let's figure out what makes the most sense here"
                  : "Your coach is making the update now"}
              </p>
            </div>
          </div>
        )}

        {/* ── Phase: Success ──────────────────────────────────────── */}
        {phase === "success" && editResult && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>

            {/* Exact mutation badges */}
            {editResult.changeTargets && editResult.changeTargets.length > 0 && (
              <div className="w-full space-y-2">
                {editResult.changeTargets.map((ct, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-2 bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-2.5"
                  >
                    {ct.type === "exercise_swap" ? (
                      <>
                        <span className="text-xs font-semibold text-foreground/80 truncate max-w-[120px]">{ct.originalExercise}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-green-400 truncate max-w-[120px]">{ct.newExercise}</span>
                      </>
                    ) : ct.type === "exercise_added" ? (
                      <>
                        <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Added</span>
                        <span className="text-xs font-semibold text-green-400 truncate max-w-[160px]">{ct.newExercise}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider flex-shrink-0">Updated</span>
                        <span className="text-xs font-semibold text-foreground/80 truncate max-w-[100px]">{ct.newExercise}</span>
                        {ct.changeDetail && (
                          <span className="text-[10px] text-primary/60 font-mono truncate max-w-[100px]">({ct.changeDetail})</span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {editResult.changeSummary}
            </p>
          </div>
        )}

        {/* ── Phase: Error ────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-foreground text-base mb-2">Something went wrong</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                {errorMsg ?? "Please try again."}
              </p>
            </div>
            <button
              onClick={handleBackToInput}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
