/**
 * Your System — Phase 3 + Phase 4
 *
 * Full interactive training workspace. Every entity (exercise, session, week,
 * phase) has contextual "Edit with AI" entry points that pass explicit object
 * context to the editing engine. Changes are highlighted in-place, recorded in
 * the persistent change log (Phase 4), and viewable in the History tab with
 * full before/after detail and restore capability.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Target,
  Calendar,
  BarChart3,
  Dumbbell,
  Clock,
  Zap,
  Layers,
  TrendingUp,
  Activity,
  RotateCcw,
  Info,
  Send,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PenLine,
  SlidersHorizontal,
  History,
  GitBranch,
  Milestone,
  AlertCircle,
  X,
  ChevronRight,
  Minus,
  Plus,
  Shuffle,
  TrendingDown,
  Flame,
  Youtube,
  Menu,
  MessageSquare,
  Settings,
  CreditCard,
  LogOut,
  Lock,
  Library,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { useLogout } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import TopNav from "@/components/layout/TopNav";
import MobileSlideLayout, { type SlidePanel } from "@/components/layout/MobileSlideLayout";
import BlockStatusCard from "@/components/training/BlockStatusCard";
import CoachMemoryInsights from "@/components/training/CoachMemoryInsights";
import EditDrawer, {
  type EditTarget,
  type EditResult,
  type ChangedIds,
  type ExerciseContext,
} from "@/components/training/EditDrawer";
import ChangeDetailDrawer from "@/components/training/ChangeDetailDrawer";
import ReadinessCheckIn from "@/components/training/ReadinessCheckIn";
import SessionFeedback from "@/components/training/SessionFeedback";
import InsightsPanel from "@/components/training/InsightsPanel";
import TrainingProfileCard from "@/components/training/TrainingProfileCard";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchActiveSystem() {
  return customFetch<any>("/api/training-system/active");
}
async function fetchSubscription() {
  try { return await customFetch<any>("/api/subscription"); } catch { return null; }
}
async function fetchBlockSummary() {
  return customFetch<any>("/api/training-system/block");
}
async function fetchCurrentWeek() {
  return customFetch<any>("/api/training-system/week");
}
async function fetchToday() {
  return customFetch<any>("/api/training-system/today");
}
async function initializeSystem() {
  return customFetch<any>("/api/training-system/initialize", { method: "POST" });
}
async function submitGlobalEdit(request: string) {
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify({ request }),
  });
}
async function submitQuickEdit(
  request: string,
  targetContext?: { type: string; id: number; label: string; parentLabel?: string }
) {
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify({ request, targetContext }),
  });
}
async function restoreChange(changeLogId: number) {
  return customFetch<any>(`/api/training-system/restore/${changeLogId}`, { method: "POST" });
}
async function fetchHistory() {
  return customFetch<{ history: any[]; trainingSystemId: number }>("/api/training-system/history");
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface HighlightedIds {
  exercises: Set<number>;
  sessions: Set<number>;
  weeks: Set<number>;
  phases: Set<number>;
}

export interface EditRecord {
  id: string;
  timestamp: Date;
  summary: string;
  scope: string;
  targetLabel: string;
  appliedCount: number;
}

// ─── View Skeleton ────────────────────────────────────────────────────────────

function ViewSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 rounded-2xl bg-muted/50" />
      <div className="h-24 rounded-xl bg-muted/40" />
      <div className="h-40 rounded-xl bg-muted/30" />
      <div className="h-24 rounded-xl bg-muted/20" />
    </div>
  );
}

// ─── Highlight ring helper ────────────────────────────────────────────────────

function useHighlightClass(id: number, ids: Set<number>): string {
  const isHighlighted = ids.has(id);
  return isHighlighted
    ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background"
    : "";
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: any;
  index: number;
  sessionLabel: string;
  highlightedIds: Set<number>;
  onEdit: (exercise: any, sessionLabel: string) => void;
  onQuickEditComplete: (result: EditResult) => void;
}

function ExerciseCard({ exercise, index, sessionLabel, highlightedIds, onEdit, onQuickEditComplete }: ExerciseCardProps) {
  const highlight = useHighlightClass(exercise.id, highlightedIds);
  const [showActions, setShowActions] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // Swap picker state
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<any[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);

  const categoryColors: Record<string, string> = {
    warmup:      "bg-sky-500/10 text-sky-400 border-sky-500/20",
    activation:  "bg-teal-500/10 text-teal-400 border-teal-500/20",
    power:       "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    primary:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
    secondary:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    accessory:   "bg-purple-500/10 text-purple-400 border-purple-500/20",
    trunk:       "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    conditioning:"bg-green-500/10 text-green-400 border-green-500/20",
    recovery:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
    finisher:    "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const categoryLabel: Record<string, string> = {
    warmup:       "Warm-Up",
    activation:   "Activation",
    power:        "Power",
    primary:      "Primary",
    secondary:    "Secondary",
    accessory:    "Accessory",
    trunk:        "Trunk",
    conditioning: "Conditioning",
    recovery:     "Recovery",
    finisher:     "Finisher",
  };
  const colorClass = categoryColors[exercise.category] ?? categoryColors.accessory;

  const quickMutation = useMutation({
    mutationFn: ({ req, chip }: { req: string; chip: string }) => {
      setActiveChip(chip);
      return submitQuickEdit(req, { type: "exercise", id: exercise.id, label: exercise.name, parentLabel: sessionLabel });
    },
    onSuccess: (data) => {
      setActiveChip(null);
      setShowActions(false);
      setSwapOpen(false);
      onQuickEditComplete(data);
    },
    onError: () => setActiveChip(null),
  });

  async function handleSwapOpen() {
    setSwapOpen(true);
    setSwapLoading(true);
    setSwapCandidates([]);
    try {
      const result = await customFetch<any>(`/api/exercises/swap/${encodeURIComponent(exercise.name)}`);
      setSwapCandidates(result.data ?? []);
    } catch {
      setSwapCandidates([]);
    } finally {
      setSwapLoading(false);
    }
  }

  function handleSwapSelect(candidate: any) {
    quickMutation.mutate({
      req: `Swap ${exercise.name} with ${candidate.name} in ${sessionLabel}`,
      chip: "Swap",
    });
  }

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name + " exercise tutorial")}`;

  const QUICK_ACTIONS = [
    { label: "+Set", icon: Plus, req: `Add one set to ${exercise.name}` },
    { label: "-Set", icon: Minus, req: `Remove one set from ${exercise.name}` },
    { label: "Easier", icon: TrendingDown, req: `Replace ${exercise.name} with an easier variation` },
    { label: "Harder", icon: Flame, req: `Replace ${exercise.name} with a harder variation` },
  ];

  const difficultyColor: Record<string, string> = {
    beginner: "text-green-400",
    intermediate: "text-yellow-400",
    advanced: "text-orange-400",
    elite: "text-red-400",
  };

  return (
    <div
      className={`py-4 border-b border-border last:border-0 rounded-lg transition-all duration-500 ${highlight}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => { setShowActions((v) => !v); setSwapOpen(false); }}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="font-semibold text-sm text-foreground">{exercise.name}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
                {categoryLabel[exercise.category] ?? exercise.category}
              </span>
              {highlightedIds.has(exercise.id) && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex-shrink-0 animate-pulse">
                  Updated
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {exercise.sets && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Sets</span>
                  <span className="text-xs font-bold text-foreground">{exercise.sets}</span>
                </div>
              )}
              {exercise.reps && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Reps</span>
                  <span className="text-xs font-bold text-foreground">{exercise.reps}</span>
                </div>
              )}
              {exercise.rest && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">{exercise.rest}</span>
                </div>
              )}
              {exercise.tempo && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Tempo</span>
                  <span className="text-xs font-bold text-foreground">{exercise.tempo}</span>
                </div>
              )}
            </div>
            {exercise.notes && (
              <p className="text-xs text-muted-foreground mt-1.5 italic leading-relaxed">{exercise.notes}</p>
            )}
          </button>

          {/* Inline quick actions — revealed on tap */}
          {showActions && (
            <div className="mt-2.5 pt-2 border-t border-border/50 space-y-2.5">

              {/* Swap picker */}
              <div>
                <button
                  onClick={swapOpen ? () => setSwapOpen(false) : handleSwapOpen}
                  disabled={quickMutation.isPending}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-150 ${
                    swapOpen || activeChip === "Swap"
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:bg-primary/8 hover:border-primary/30 hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  {activeChip === "Swap"
                    ? <RotateCcw className="w-3 h-3 animate-spin" />
                    : <Shuffle className="w-3 h-3" />
                  }
                  Swap
                </button>

                {swapOpen && (
                  <div className="mt-2 rounded-xl border border-border bg-muted/20 p-3">
                    {swapLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RotateCcw className="w-3 h-3 animate-spin" />
                        Finding alternatives…
                      </div>
                    ) : swapCandidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No cluster alternatives found. Use Full Edit to swap manually.</p>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Pick a replacement
                        </p>
                        {swapCandidates.map((c) => (
                          <button
                            key={c.name}
                            onClick={() => handleSwapSelect(c)}
                            disabled={quickMutation.isPending}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-background/60 border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
                          >
                            <span className="text-xs font-semibold text-foreground">{c.name}</span>
                            <span className={`text-[10px] font-bold capitalize flex-shrink-0 ${difficultyColor[c.difficultyLevel] ?? "text-muted-foreground"}`}>
                              {c.difficultyLevel}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Other quick action chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {QUICK_ACTIONS.map(({ label, icon: Icon, req }) => (
                  <button
                    key={label}
                    onClick={() => quickMutation.mutate({ req, chip: label })}
                    disabled={quickMutation.isPending}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-150 ${
                      activeChip === label
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-muted/50 border-border text-muted-foreground hover:bg-primary/8 hover:border-primary/30 hover:text-foreground"
                    } disabled:opacity-50`}
                  >
                    {activeChip === label
                      ? <RotateCcw className="w-3 h-3 animate-spin" />
                      : <Icon className="w-3 h-3" />
                    }
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => { setShowActions(false); onEdit(exercise, sessionLabel); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-all"
                >
                  <PenLine className="w-3 h-3" />
                  Full edit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* YouTube + Expand/collapse */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Watch ${exercise.name} on YouTube`}
            className="w-7 h-7 rounded-lg border border-border bg-muted/40 flex items-center justify-center text-red-500/70 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-150"
          >
            <Youtube className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => { setShowActions((v) => !v); setSwapOpen(false); }}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all duration-150 ${
              showActions
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/40 border-border text-muted-foreground/60 hover:bg-muted/70 hover:text-muted-foreground"
            }`}
            title={showActions ? "Close actions" : `Quick actions for ${exercise.name}`}
          >
            {showActions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Today View ───────────────────────────────────────────────────────────────

interface TodayViewProps {
  highlightedIds: HighlightedIds;
  onEditExercise: (exercise: any, sessionLabel: string) => void;
  onEditSession: (session: any, weekLabel?: string) => void;
  onQuickEditComplete: (result: EditResult) => void;
}

function TodayView({ highlightedIds, onEditExercise, onEditSession, onQuickEditComplete }: TodayViewProps) {
  const { data: today, isLoading, error } = useQuery({
    queryKey: ["training-system-today"],
    queryFn: fetchToday,
    retry: false,
  });

  if (isLoading) return <ViewSkeleton />;
  if (error || !today) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Activity className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">No session data available for today.</p>
      </div>
    );
  }

  const dayOfWeekLabel = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const sessionHighlight = highlightedIds.sessions.has(today.id) ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background" : "";

  return (
    <div className="space-y-5">
      {/* Session hero */}
      <div className={`rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5 transition-all duration-500 ${sessionHighlight}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">{dayOfWeekLabel}'s Session</p>
            <h2 className="text-xl font-bold text-foreground leading-tight">{today.label}</h2>
            {today.emphasis && <p className="text-sm text-muted-foreground mt-1">{today.emphasis}</p>}
            {highlightedIds.sessions.has(today.id) && (
              <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                <CheckCircle2 className="w-3 h-3" /> Updated
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-5 h-5 text-primary" />
            </div>
            <button
              onClick={() => onEditSession(today, today.currentWeek?.label)}
              className="text-[11px] font-semibold text-primary flex items-center gap-1.5 hover:underline"
            >
              <SlidersHorizontal className="w-3 h-3" />
              Adjust
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground capitalize">{today.sessionType}</span>
          </div>
          {today.exercises?.length > 0 && (
            <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{today.exercises.length} exercises</span>
            </div>
          )}
          {today.currentWeek && (
            <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Week {today.currentWeek.weekNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* Warmup */}
      {today.warmupNotes && (
        <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center">
              <Activity className="w-3 h-3 text-blue-400" />
            </div>
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Warm-Up Protocol</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{today.warmupNotes}</p>
        </div>
      )}

      {/* Exercise plan */}
      {today.exercises?.length > 0 && (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Exercise Plan</h3>
            <span className="text-xs text-muted-foreground">Tap any exercise for quick actions</span>
          </div>
          <div className="px-5">
            {today.exercises.map((exercise: any, index: number) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={index}
                sessionLabel={today.label}
                highlightedIds={highlightedIds.exercises}
                onEdit={onEditExercise}
                onQuickEditComplete={onQuickEditComplete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Coach notes */}
      {today.coachingNotes && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Info className="w-3 h-3 text-amber-400" />
            </div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Coach Notes</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{today.coachingNotes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  highlightedIds: HighlightedIds;
  onEditExercise: (exercise: any, sessionLabel: string) => void;
  onEditSession: (session: any, weekLabel?: string) => void;
  onEditWeek: (week: any) => void;
  isPremium?: boolean;
  onUpgrade?: () => void;
}

function WeekView({ highlightedIds, onEditExercise, onEditSession, onEditWeek, isPremium = false, onUpgrade }: WeekViewProps) {
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  function toggleCard(sessionId: number) {
    setExpandedCards((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  }

  const { data: week, isLoading, error } = useQuery({
    queryKey: ["training-system-week"],
    queryFn: fetchCurrentWeek,
    retry: false,
  });

  if (isLoading) return <ViewSkeleton />;
  if (error || !week) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Calendar className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">No week data available.</p>
      </div>
    );
  }

  const volumeColors: Record<string, string> = {
    low: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    moderate: "text-green-400 bg-green-400/10 border-green-400/20",
    high: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    deload: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };
  const volumeColor = volumeColors[week.volumeLevel] ?? volumeColors.moderate;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDow = new Date().getDay();
  const weekHighlight = highlightedIds.weeks.has(week.id) ? "ring-2 ring-green-400/50 ring-offset-1 ring-offset-background" : "";

  return (
    <div className="space-y-5">
      {/* Block intelligence — compact in week view */}
      <BlockStatusCard compact />

      {/* Week summary card */}
      <div className={`rounded-2xl bg-gradient-to-br from-card to-muted/30 border border-border p-5 transition-all duration-500 ${weekHighlight}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {week.phase?.name ?? "Current Block"}
            </p>
            <h2 className="text-lg font-bold text-foreground">{week.label ?? `Week ${week.weekNumber}`}</h2>
            {week.focus && <p className="text-sm text-muted-foreground mt-1">{week.focus}</p>}
            {highlightedIds.weeks.has(week.id) && (
              <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                <CheckCircle2 className="w-3 h-3" /> Updated
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${volumeColor}`}>
              {week.volumeLevel}
            </span>
            <button
              onClick={() => onEditWeek(week)}
              className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 hover:text-foreground"
            >
              <SlidersHorizontal className="w-3 h-3" />
              Modify week
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Week {week.weekNumber} of {week.phase?.weekCount ?? 4}</span>
          </div>
          {week.sessions?.length > 0 && (
            <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
              <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{week.sessions.filter((s: any) => !s.isRestDay).length} sessions</span>
            </div>
          )}
        </div>
      </div>

      {/* Session cards */}
      <div className="space-y-3">
        {(() => {
          let trainingSessionCount = 0;
          return week.sessions?.map((session: any, idx: number) => {
          const isRestDay = session.isRestDay;
          if (!isRestDay) trainingSessionCount++;
          const isLocked = !isPremium && !isRestDay && trainingSessionCount > 1;
          const isToday = session.dayOfWeek === todayDow;
          const sessionHighlight = highlightedIds.sessions.has(session.id)
            ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
            : "";

          if (isLocked) {
            return (
              <div
                key={session.id}
                className="rounded-xl border border-border/30 bg-card/50 overflow-hidden opacity-50"
              >
                <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Lock className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-muted-foreground/70 truncate block">{session.label}</span>
                      {session.emphasis && <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{session.emphasis}</p>}
                    </div>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0" />
                </div>
              </div>
            );
          }

          return (
            <div
              key={session.id}
              className={`rounded-xl border overflow-hidden transition-all duration-500 ${isToday ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10" : "border-border bg-card"} ${sessionHighlight}`}
            >
              <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <span className="text-[9px] font-bold uppercase leading-none">
                      {session.dayOfWeek != null ? dayNames[session.dayOfWeek] : `D${idx + 1}`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{session.label}</span>
                      {isToday && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex-shrink-0">Today</span>
                      )}
                      {highlightedIds.sessions.has(session.id) && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20 flex-shrink-0">Updated</span>
                      )}
                    </div>
                    {session.emphasis && <p className="text-xs text-muted-foreground truncate mt-0.5">{session.emphasis}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {session.exercises?.length > 0 && <span className="text-xs text-muted-foreground">{session.exercises.length} ex</span>}
                  <button
                    onClick={() => onEditSession(session, week.label ?? `Week ${week.weekNumber}`)}
                    className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all duration-150"
                    title="Adjust this session with AI"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {session.exercises?.length > 0 && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <div className="space-y-2">
                    {(expandedCards[session.id] ? session.exercises : session.exercises.slice(0, 3)).map((ex: any, exIdx: number) => (
                      <div key={ex.id} className={`flex items-center gap-3 rounded-md px-1 py-0.5 transition-all duration-500 ${highlightedIds.exercises.has(ex.id) ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">{exIdx + 1}</div>
                        <span className="text-xs text-foreground/80 flex-1 truncate">{ex.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.reps ?? ""}</span>
                        {highlightedIds.exercises.has(ex.id) && (
                          <span className="text-[9px] font-bold text-primary">✓</span>
                        )}
                        <button
                          onClick={() => onEditExercise(ex, session.label)}
                          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                          title={`Edit ${ex.name}`}
                        >
                          <PenLine className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {session.exercises.length > 3 && (
                      <button
                        onClick={() => toggleCard(session.id)}
                        className="flex items-center gap-1.5 pl-8 pt-1 text-xs text-primary/70 hover:text-primary transition-colors"
                      >
                        {expandedCards[session.id] ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            <span>Show less</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            <span>+{session.exercises.length - 3} more exercises</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
          });
        })()}
      </div>

      {/* Upgrade CTA for non-premium after locked sessions */}
      {!isPremium && week.sessions?.filter((s: any) => !s.isRestDay).length > 1 && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 mx-auto">
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-sm font-bold text-foreground mb-1">
            Unlock the rest of your training week
          </h4>
          <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
            See all training days, block progression, and live adaptations.
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
    </div>
  );
}

// ─── Block View ───────────────────────────────────────────────────────────────

interface BlockViewProps {
  highlightedIds: HighlightedIds;
  onEditPhase: (phase: any) => void;
  onEditWeek: (week: any, phaseName?: string) => void;
}

function BlockView({ highlightedIds, onEditPhase, onEditWeek }: BlockViewProps) {
  const { data: block, isLoading, error } = useQuery({
    queryKey: ["training-system-block"],
    queryFn: fetchBlockSummary,
    retry: false,
  });

  if (isLoading) return <ViewSkeleton />;
  if (error || !block) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">No block data available.</p>
      </div>
    );
  }

  const { system, phases, currentPhase, currentWeekNumber } = block;
  const phaseHighlight = currentPhase && highlightedIds.phases.has(currentPhase.id)
    ? "ring-2 ring-purple-400/50 ring-offset-1 ring-offset-background"
    : "";

  return (
    <div className="space-y-5">
      {/* Block intelligence — full view in block tab */}
      <BlockStatusCard />

      {/* Coach memory insights — what your coach has learned about you */}
      <CoachMemoryInsights />

      {/* Current block hero */}
      {currentPhase && (
        <div className={`rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5 transition-all duration-500 ${phaseHighlight}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Current Block</p>
              <h2 className="text-lg font-bold text-foreground leading-tight">{currentPhase.name}</h2>
              {currentPhase.goal && <p className="text-sm text-muted-foreground mt-1">{currentPhase.goal}</p>}
              {highlightedIds.phases.has(currentPhase.id) && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20">
                  <CheckCircle2 className="w-3 h-3" /> Updated
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <button
                onClick={() => onEditPhase(currentPhase)}
                className="text-[11px] font-semibold text-primary flex items-center gap-1.5 hover:underline"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Refocus block
              </button>
            </div>
          </div>

          {currentPhase.emphasis && (
            <div className="bg-background/60 rounded-lg px-4 py-3 border border-border mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Emphasis</p>
              <p className="text-sm text-foreground">{currentPhase.emphasis}</p>
            </div>
          )}

          <div className="flex items-center gap-4 mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Week</p>
              <p className="text-lg font-bold text-foreground">
                {currentWeekNumber} <span className="text-sm font-normal text-muted-foreground">of {currentPhase.weekCount}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Block Progress</p>
              <p className="text-lg font-bold text-foreground">
                {Math.round(((currentWeekNumber - 1) / currentPhase.weekCount) * 100)}%
              </p>
            </div>
          </div>
          <div className="h-2 bg-background/60 rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${Math.round(((currentWeekNumber - 1) / currentPhase.weekCount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Program roadmap */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Program Roadmap</h3>
        </div>
        <div className="divide-y divide-border">
          {phases.map((phase: any, idx: number) => {
            const isCurrent = phase.status === "current";
            const isCompleted = phase.status === "completed";
            const phaseHL = highlightedIds.phases.has(phase.id);

            return (
              <div key={phase.id} className={`px-5 py-4 transition-all duration-500 ${isCurrent ? "bg-primary/3" : ""} ${phaseHL ? "bg-purple-400/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 border ${isCurrent ? "bg-primary text-primary-foreground border-primary" : isCompleted ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`font-semibold text-sm ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>{phase.name}</span>
                      {isCurrent && <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Active</span>}
                      {phaseHL && <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20">Updated</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{phase.weekCount} weeks — {phase.goal}</p>
                  </div>
                  {isCurrent && (
                    <button
                      onClick={() => onEditPhase(phase)}
                      className="w-7 h-7 rounded-lg bg-muted/50 border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all duration-150 flex-shrink-0 mt-0.5"
                      title="Refocus this block"
                    >
                      <PenLine className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* System overview */}
      <div className="rounded-xl bg-card border border-border p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">System Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Overarching Goal</p>
            <p className="text-sm font-semibold text-foreground">{system.overarchingGoal}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Weekly Frequency</p>
            <p className="text-sm font-semibold text-foreground">{system.weeklyFrequency} days / week</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Training Style</p>
            <p className="text-sm font-semibold text-foreground capitalize">{system.trainingStyle}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Equipment</p>
            <p className="text-sm font-semibold text-foreground capitalize">{system.equipmentAccess}</p>
          </div>
        </div>
        {system.constraints && (
          <div className="mt-3 bg-amber-500/5 border border-amber-500/15 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-400 mb-1">Constraints / Notes</p>
            <p className="text-xs text-muted-foreground">{system.constraints}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent Edits ─────────────────────────────────────────────────────────────

function RecentEditsBar({ edits }: { edits: EditRecord[] }) {
  const [expanded, setExpanded] = useState(false);

  if (edits.length === 0) return null;

  function formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const scopeIcon: Record<string, string> = {
    exercise: "🏋️",
    session: "📋",
    week: "📅",
    block: "📊",
    system: "🔧",
  };

  return (
    <div className="border-b border-border bg-background/80 backdrop-blur-sm flex-shrink-0">
      <div className="max-w-2xl mx-auto px-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full py-2.5 text-left"
        >
          <div className="w-5 h-5 rounded bg-muted/60 flex items-center justify-center flex-shrink-0">
            <History className="w-3 h-3 text-muted-foreground" />
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground flex-1">
            {edits.length} edit{edits.length !== 1 ? "s" : ""} this session
          </span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>

        {expanded && (
          <div className="pb-3 space-y-2">
            {edits.map((edit) => (
              <div key={edit.id} className="flex items-start gap-2.5 bg-muted/20 rounded-lg px-3 py-2.5">
                <span className="text-sm flex-shrink-0 mt-px">{scopeIcon[edit.scope] ?? "✏️"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground/80 leading-relaxed">{edit.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{formatTime(edit.timestamp)}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{edit.appliedCount} change{edit.appliedCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VibeBar — Phase C: Fast Iteration Loop ───────────────────────────────────

type VibeState = "idle" | "submitting" | "result";

const VIBE_CHIPS = [
  { label: "More intense", req: "Increase the overall intensity for this session" },
  { label: "Less volume", req: "Reduce the total volume this week" },
  { label: "Rest day", req: "Convert today into a full recovery day" },
  { label: "Shorter session", req: "Shorten today's session — I'm pressed for time" },
  { label: "Travel mode", req: "I only have dumbbells — adapt accordingly" },
  { label: "More explosive", req: "Add explosive emphasis to today's training" },
];

interface VibeMutation {
  req: string;
  kind?: "chip" | "typed" | "refine";
}

interface VibeBarProps {
  onEditComplete: (result: EditResult) => void;
  onUndone?: (changedIds: any) => void;
}

function VibeBar({ onEditComplete, onUndone }: VibeBarProps) {
  const [input, setInput] = useState("");
  const [vibeState, setVibeState] = useState<VibeState>("idle");
  const [lastResult, setLastResult] = useState<EditResult | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const editMutation = useMutation({
    mutationFn: ({ req }: VibeMutation) => submitGlobalEdit(req),
    onSuccess: (data) => {
      setLastResult(data);
      setVibeState("result");
      setSubmitError(false);
      onEditComplete(data);
    },
    onError: () => {
      setVibeState("idle");
      setSubmitError(true);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (changeLogId: number) => restoreChange(changeLogId),
    onSuccess: (data) => {
      setVibeState("idle");
      setLastResult(null);
      onUndone?.(data.changedIds ?? { exercises: [], sessions: [], weeks: [], phases: [] });
    },
    onError: () => setVibeState("result"),
  });

  function fire(req: string) {
    if (editMutation.isPending || undoMutation.isPending) return;
    setInput("");
    setSubmitError(false);
    setVibeState("submitting");
    editMutation.mutate({ req });
  }

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    fire(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  function handleInputChange(val: string) {
    setInput(val);
    // Typing resets result state so they can immediately iterate
    if (vibeState === "result") setVibeState("idle");
    setSubmitError(false);
  }

  const isWorking = vibeState === "submitting" || undoMutation.isPending;
  const firstSentence = lastResult
    ? lastResult.changeSummary.split(/\.\s/)[0].trim().replace(/\.$/, "")
    : "";

  return (
    <div className="border-t border-border bg-background/98 backdrop-blur-sm flex-shrink-0">
      <div className="max-w-2xl mx-auto px-4 pt-2.5 pb-3 space-y-2">

        {/* Quick-fire chips */}
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {VIBE_CHIPS.map(({ label, req }) => (
            <button
              key={label}
              onClick={() => fire(req)}
              disabled={isWorking}
              className="flex-shrink-0 text-[11px] font-semibold bg-muted/50 text-muted-foreground border border-border rounded-full px-3 py-1 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Input row — idle / submitting */}
        {vibeState !== "result" && (
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 border border-border px-3.5 py-2.5 focus-within:border-primary/40 focus-within:bg-muted/50 transition-all duration-150">
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              {isWorking
                ? <RotateCcw className="w-3.5 h-3.5 text-primary animate-spin" />
                : <Sparkles className="w-3.5 h-3.5 text-primary/70" />
              }
            </div>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isWorking ? "Applying…" : 'Quick command… e.g. "swap bench" or "more sets"'}
              disabled={isWorking}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none disabled:opacity-60 min-w-0"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isWorking}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Result rail — inline after edit */}
        {vibeState === "result" && lastResult && (
          <div className="flex items-center gap-2 rounded-xl bg-green-500/5 border border-green-500/20 px-3.5 py-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <p className="text-xs text-foreground/80 flex-1 truncate min-w-0">
              {firstSentence || lastResult.changeSummary}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Refinement chips */}
              <button
                onClick={() => fire("That was too much — pull it back a little")}
                disabled={isWorking}
                className="text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2.5 py-0.5 hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-40"
              >
                Too much
              </button>
              <button
                onClick={() => fire("Good direction — push it a bit further")}
                disabled={isWorking}
                className="text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2.5 py-0.5 hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-40"
              >
                More
              </button>
              {lastResult.changeLogId && (
                <button
                  onClick={() => {
                    setVibeState("submitting");
                    undoMutation.mutate(lastResult.changeLogId!);
                  }}
                  disabled={isWorking}
                  className="text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2.5 py-0.5 hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {undoMutation.isPending ? <RotateCcw className="w-3 h-3 animate-spin inline" /> : "Undo"}
                </button>
              )}
              {/* Type to refine (reset to idle) */}
              <button
                onClick={() => { setVibeState("idle"); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="text-[11px] font-semibold text-primary border border-primary/30 bg-primary/5 rounded-full px-2.5 py-0.5 hover:bg-primary/10 transition-colors"
              >
                Refine ↩
              </button>
              <button
                onClick={() => { setVibeState("idle"); setLastResult(null); }}
                className="w-5 h-5 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {submitError && (
          <p className="text-[11px] text-red-400 pl-1">Something went wrong — try again.</p>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySystemState({ onInitialize, isLoading }: { onInitialize: () => void; isLoading: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <Target className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-3">No Training System Yet</h2>
      <p className="text-sm text-muted-foreground mb-2 max-w-xs leading-relaxed">
        Ask your coach to build a program in Chat, then tap <strong>Save to My System</strong> to activate it here.
      </p>
      <p className="text-xs text-muted-foreground/70 mb-8 max-w-xs leading-relaxed">
        Or generate one automatically from your profile below.
      </p>

      {/* Primary CTA — go to chat and build */}
      <button
        onClick={() => setLocation("/chat")}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all duration-150 shadow-lg shadow-primary/20 mb-3 w-full max-w-xs justify-center"
      >
        <MessageSquare className="w-4 h-4" />
        Build in Chat
      </button>

      {/* Secondary CTA — auto-generate from profile */}
      <button
        onClick={onInitialize}
        disabled={isLoading}
        className="inline-flex items-center gap-2 border border-border bg-card text-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed w-full max-w-xs justify-center"
      >
        {isLoading ? (
          <><RotateCcw className="w-4 h-4 animate-spin" />Building your system…</>
        ) : (
          <><Zap className="w-4 h-4" />Auto-Generate from Profile</>
        )}
      </button>
    </div>
  );
}

// ─── History View — Phase 4 ───────────────────────────────────────────────────

interface HistoryViewProps {
  onOpenDetail: (changeId: number) => void;
  onRestored: (changedIds: any) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  ai_edit: "AI Coach", quick_action: "Quick Action",
  restore: "Restore", initialize: "Program Init", auto_adjust: "Auto Adjust",
};
const SOURCE_COLORS: Record<string, string> = {
  ai_edit: "text-primary bg-primary/10 border-primary/20",
  quick_action: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  restore: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  initialize: "text-green-400 bg-green-400/10 border-green-400/20",
  auto_adjust: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};
const SCOPE_LABELS: Record<string, string> = {
  exercise: "Exercise", session: "Session", week: "Week", block: "Block", system: "Program",
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HistoryView({ onOpenDetail, onRestored }: HistoryViewProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["training-system-history"],
    queryFn: fetchHistory,
    retry: false,
    staleTime: 10000,
  });

  if (isLoading) return <ViewSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <AlertCircle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Failed to load history.</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  const history = data?.history ?? [];

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
          <History className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">No history yet</p>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Every AI edit, quick action, and system change will appear here with full before/after detail and restore capability.
          </p>
        </div>
      </div>
    );
  }

  // Group by date
  const grouped: { date: string; entries: any[] }[] = [];
  for (const entry of history) {
    const dateLabel = new Date(entry.createdAt).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const existing = grouped.find((g) => g.date === dateLabel);
    if (existing) existing.entries.push(entry);
    else grouped.push({ date: dateLabel, entries: [entry] });
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ date, entries }) => (
        <div key={date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex-shrink-0">{date}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-2">
            {entries.map((entry: any) => {
              const isMajor = entry.isMajorVersion;
              const sourceColor = SOURCE_COLORS[entry.source] ?? SOURCE_COLORS.ai_edit;

              return (
                <button
                  key={entry.id}
                  onClick={() => onOpenDetail(entry.id)}
                  className={`w-full text-left rounded-xl border overflow-hidden transition-all duration-150 hover:border-primary/30 hover:shadow-sm ${isMajor ? "border-amber-400/25 bg-amber-400/3" : "border-border bg-card"}`}
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${isMajor ? "bg-amber-400" : "bg-muted-foreground/40"}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sourceColor}`}>
                            {SOURCE_LABELS[entry.source] ?? entry.source}
                          </span>
                          <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border">
                            {SCOPE_LABELS[entry.scope] ?? entry.scope}
                          </span>
                          {isMajor && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 flex items-center gap-1">
                              <Milestone className="w-2.5 h-2.5" /> Milestone
                            </span>
                          )}
                          {entry.restoredFromId && (
                            <span className="text-[10px] text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20">
                              ↩ Restored
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-foreground leading-tight mb-1">
                          {entry.versionLabel ?? intentToHistoryLabel(entry.intent)}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {entry.changeSummary}
                        </p>

                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-muted-foreground/60">{formatRelativeTime(entry.createdAt)}</span>
                          {entry.appliedCount > 0 && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-[10px] text-muted-foreground/60">{entry.appliedCount} change{entry.appliedCount !== 1 ? "s" : ""}</span>
                            </>
                          )}
                          {entry.targetLabel && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-[10px] text-muted-foreground/60 truncate">"{entry.targetLabel}"</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-primary/60 font-semibold flex-shrink-0 mt-1">Details →</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function intentToHistoryLabel(intent: string): string {
  const map: Record<string, string> = {
    swap_exercise: "Exercise Swap",
    replace_exercise: "Exercise Replacement",
    update_exercise: "Exercise Update",
    easier_variation: "Easier Variation",
    harder_variation: "Harder Variation",
    increase_sets: "Set Added",
    reduce_sets: "Set Removed",
    change_rep_range: "Rep Range Change",
    injury_modification: "Injury Modification",
    add_explosive_emphasis: "Explosive Emphasis Added",
    change_session_type: "Session Type Change",
    shorten_session: "Session Shortened",
    athletic_emphasis: "Athletic Emphasis",
    equipment_constraint: "Equipment Adaptation",
    reduce_session_volume: "Session Volume Reduced",
    deload_week: "Deload Week",
    travel_mode: "Travel Mode",
    increase_intensity: "Intensity Increase",
    reduce_weekly_volume: "Weekly Volume Reduced",
    increase_weekly_volume: "Volume Accumulation",
    refocus_block_power: "Power Block Refocus",
    refocus_block_hypertrophy: "Hypertrophy Block Refocus",
    refocus_block_athletic: "Athletic Block Refocus",
    reduce_volume: "Volume Reduced",
    restore: "State Restored",
    initialize: "Program Initialized",
    exercise_note: "Exercise Note",
    session_note: "Session Note",
  };
  return map[intent] ?? intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Preview-only locked state ────────────────────────────────────────────────

function PreviewLockedView({
  title,
  description,
  onUpgrade,
}: {
  title: string;
  description: string;
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-2 max-w-xs leading-relaxed">{description}</p>
      <p className="text-xs text-muted-foreground/60 mb-6 max-w-xs">
        Upgrade to unlock the rest of your program.
      </p>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <Zap className="w-4 h-4" /> Unlock Full Program
        </button>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "today", label: "Today", icon: Zap },
  { id: "week", label: "This Week", icon: Calendar },
  { id: "block", label: "Block", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);
  const [editExerciseContext, setEditExerciseContext] = useState<ExerciseContext | undefined>(undefined);
  const [recentEdits, setRecentEdits] = useState<EditRecord[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<HighlightedIds>({
    exercises: new Set(),
    sessions: new Set(),
    weeks: new Set(),
    phases: new Set(),
  });
  const [mobilePanel, setMobilePanel] = useState<SlidePanel>(null);

  // Phase 4: change log detail viewer
  const [changeDetailId, setChangeDetailId] = useState<number | null>(null);

  // Phase 5: readiness check-in + session feedback modals
  const [showReadinessCheckIn, setShowReadinessCheckIn] = useState(false);
  const [showSessionFeedback, setShowSessionFeedback] = useState(false);
  const [feedbackSessionLabel, setFeedbackSessionLabel] = useState<string | undefined>(undefined);
  const [showProgramLibrary, setShowProgramLibrary] = useState(false);
  const [isSwitchingProgram, setIsSwitchingProgram] = useState(false);

  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [, setLocation] = useLocation();
  const logout = useLogout();

  const { data: activeSystem, isLoading: systemLoading } = useQuery({
    queryKey: ["training-system-active"],
    queryFn: fetchActiveSystem,
    retry: false,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    enabled: !!me,
    staleTime: 60000,
  });

  const isPremium = subscription?.plan === "pro" || subscription?.plan === "elite";

  const { data: programLibrary = [] } = useQuery({
    queryKey: ["training-system-library"],
    queryFn: () => customFetch<any[]>("/api/training-system/library").catch(() => []),
    enabled: !!me,
    staleTime: 30000,
  });

  async function handleSwitchProgramInSystem(systemId: number) {
    if (isSwitchingProgram) return;
    setIsSwitchingProgram(true);
    try {
      await customFetch<any>(`/api/training-system/set-active/${systemId}`, { method: "POST" });
      setShowProgramLibrary(false);
      setMobilePanel(null);
      await queryClient.refetchQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
    } catch (err) {
      console.error("[SwitchProgram] Failed:", err);
    } finally {
      setIsSwitchingProgram(false);
    }
  }

  function handleUpgrade() {
    setLocation("/billing");
  }

  // Phase 5: fetch today's readiness entry (to show check-in prompt if missing)
  const { data: readinessToday, refetch: refetchReadiness } = useQuery({
    queryKey: ["readiness-today"],
    queryFn: async () => {
      const entries = await customFetch<any[]>("/api/readiness?limit=1");
      if (!entries || entries.length === 0) return null;
      const latest = entries[0];
      const latestDate = new Date(latest.createdAt);
      const today = new Date();
      const sameDay = latestDate.toDateString() === today.toDateString();
      return sameDay ? latest : null;
    },
    enabled: !!activeSystem,
    retry: false,
  });

  const initialize = useMutation({
    mutationFn: initializeSystem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    },
  });

  // ── Open edit drawer ──
  function openExerciseEdit(exercise: any, sessionLabel: string) {
    setEditTarget({ type: "exercise", id: exercise.id, label: exercise.name, parentLabel: sessionLabel });
    setEditPrefill(undefined);
    setEditExerciseContext({
      prescribedSets: exercise.sets ? parseInt(String(exercise.sets), 10) || 3 : 3,
      savedProgramId: activeSystem?.savedProgramId ?? undefined,
      trainingGoal: activeSystem?.trainingGoal ?? activeSystem?.goal ?? undefined,
      category: exercise.category ?? undefined,
    });
  }

  function openSessionEdit(session: any, weekLabel?: string) {
    setEditTarget({ type: "session", id: session.id, label: session.label, parentLabel: weekLabel });
    setEditPrefill(undefined);
  }

  function openWeekEdit(week: any, phaseName?: string) {
    setEditTarget({ type: "week", id: week.id, label: week.label ?? `Week ${week.weekNumber}`, parentLabel: phaseName });
    setEditPrefill(undefined);
  }

  function openPhaseEdit(phase: any) {
    setEditTarget({ type: "phase", id: phase.id, label: phase.name });
    setEditPrefill(undefined);
  }

  // ── Process edit completion ──
  const handleEditComplete = useCallback((result: EditResult) => {
    // 1. Add to session edit history
    const record: EditRecord = {
      id: `${Date.now()}`,
      timestamp: new Date(),
      summary: result.changeSummary,
      scope: result.scope,
      targetLabel: editTarget?.label ?? "",
      appliedCount: result.appliedCount,
    };
    setRecentEdits((prev) => [record, ...prev].slice(0, 8));

    // 2. Apply highlights for changed entities
    const ids = result.changedIds ?? { exercises: [], sessions: [], weeks: [], phases: [] };
    setHighlightedIds({
      exercises: new Set(ids.exercises),
      sessions: new Set(ids.sessions),
      weeks: new Set(ids.weeks),
      phases: new Set(ids.phases),
    });

    // 3. Clear highlights after 8 seconds
    setTimeout(() => {
      setHighlightedIds({ exercises: new Set(), sessions: new Set(), weeks: new Set(), phases: new Set() });
    }, 8000);

    // 4. Refresh data
    queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-history"] });

    // 5. Switch to most relevant tab
    const scope = result.scope;
    if (scope === "exercise" || scope === "session") setActiveTab("today");
    else if (scope === "week") setActiveTab("week");
    else if (scope === "block") setActiveTab("block");
  }, [editTarget, queryClient]);

  // ── Global edit panel completion ──
  function handleGlobalEditComplete(result: EditResult) {
    handleEditComplete(result);
  }

  // ── Phase 4: restore completion (from ChangeDetailDrawer or VibeBar undo) ──
  function handleRestored(changedIds: any) {
    const ids = changedIds ?? { exercises: [], sessions: [], weeks: [], phases: [] };
    setHighlightedIds({
      exercises: new Set(ids.exercises),
      sessions: new Set(ids.sessions),
      weeks: new Set(ids.weeks),
      phases: new Set(ids.phases),
    });
    setTimeout(() => {
      setHighlightedIds({ exercises: new Set(), sessions: new Set(), weeks: new Set(), phases: new Set() });
    }, 8000);
    queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
  }

  // ── Phase 5: insight apply completion ──
  function handleInsightApplied(result: any) {
    const ids = result.changedIds ?? { exercises: [], sessions: [], weeks: [], phases: [] };
    setHighlightedIds({
      exercises: new Set(ids.exercises),
      sessions: new Set(ids.sessions),
      weeks: new Set(ids.weeks),
      phases: new Set(ids.phases),
    });
    setTimeout(() => {
      setHighlightedIds({ exercises: new Set(), sessions: new Set(), weeks: new Set(), phases: new Set() });
    }, 8000);
    setRecentEdits((prev) => [
      {
        id: `insight-${Date.now()}`,
        timestamp: new Date(),
        summary: result.changeSummary,
        scope: result.scope,
        targetLabel: "Coach Insight",
        appliedCount: result.appliedCount,
      },
      ...prev,
    ].slice(0, 8));
    queryClient.invalidateQueries({ queryKey: ["insights"] });
  }

  // ── Phase 5: open EditDrawer from InsightsPanel "Modify" action ──
  function handleInsightModify(prefill: string) {
    setEditTarget({ type: "system", id: 0, label: "Training System" });
    setEditPrefill(prefill);
  }

  const hasSystem = !!activeSystem;
  const userName = me?.name ?? "Athlete";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  }

  const leftPanelContent = (
    <div className="flex flex-col h-full">
      {/* User identity */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
            <p className="text-[11px] text-muted-foreground">Performance Athlete</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* App navigation */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Navigate</p>
        <button
          onClick={() => { setLocation("/chat"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Coach Chat</span>
        </button>
        <button
          onClick={() => { setLocation("/system"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-semibold bg-primary/10 text-primary transition-all text-left"
        >
          <Target className="w-4 h-4 flex-shrink-0" />
          <span>Your System</span>
        </button>

        {/* System tabs */}
        {hasSystem && (
          <>
            <div className="my-3 h-px bg-border" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Your System</p>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setMobilePanel(null); }}
                className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/60 active:bg-muted/80"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </>
        )}

        <div className="my-3 h-px bg-border" />
        <button
          type="button"
          style={{ touchAction: "manipulation" }}
          onClick={() => setShowProgramLibrary((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Library className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Saved Programs</span>
          {programLibrary.length > 0 && (
            <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground flex-shrink-0">
              {programLibrary.length}
            </span>
          )}
          {showProgramLibrary ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </button>
        {showProgramLibrary && programLibrary.length === 0 && (
          <div className="ml-2 px-3 py-2">
            <p className="text-[11px] text-muted-foreground/60">No saved programs yet</p>
          </div>
        )}
        {showProgramLibrary && programLibrary.length > 0 && (
          <div className="ml-2 space-y-0.5 mb-1">
            {(programLibrary as any[]).map((prog) => (
              <button
                key={prog.id}
                type="button"
                style={{ touchAction: "manipulation" }}
                onClick={() => {
                  if (prog.status === "active") {
                    setShowProgramLibrary(false);
                    setMobilePanel(null);
                  } else if (!isSwitchingProgram) {
                    handleSwitchProgramInSystem(prog.id);
                  }
                }}
                disabled={isSwitchingProgram && prog.status !== "active"}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${
                  prog.status === "active"
                    ? "bg-primary/8 border border-primary/20 cursor-default"
                    : isSwitchingProgram
                    ? "opacity-50 cursor-default"
                    : "hover:bg-muted/60 active:bg-muted/80 cursor-pointer"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-semibold text-foreground truncate">{prog.name}</p>
                    {prog.status === "active" && (
                      <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                    {[prog.weeklyFrequency ? `${prog.weeklyFrequency}x/week` : null, prog.trainingStyle].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {new Date(prog.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </p>
                </div>
                {prog.status === "active" ? (
                  <span className="text-[9px] text-green-400/80 flex-shrink-0 mt-0.5">Active</span>
                ) : !isSwitchingProgram ? (
                  <span className="text-[9px] text-primary/70 flex-shrink-0 mt-0.5">Load</span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        <div className="my-3 h-px bg-border" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Account</p>
        <button
          onClick={() => { setLocation("/billing"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Settings</span>
        </button>
        <button
          onClick={() => { setLocation("/billing"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Billing &amp; Plans</span>
        </button>
      </div>

      {/* Logout */}
      <div className="border-t border-border px-3 py-3">
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all text-left"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  const rightPanelContent = (
    <div className="px-4 py-4 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Coach Insights</p>
      <InsightsPanel
        onApplied={(result) => { handleInsightApplied(result); setMobilePanel(null); }}
        onModify={(prefill) => { handleInsightModify(prefill); setMobilePanel(null); }}
      />
      <TrainingProfileCard />
      <div className="h-px bg-border my-4" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Quick Actions</p>
      <div className="space-y-2">
        <button
          onClick={() => { setShowReadinessCheckIn(true); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
        >
          <Activity className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Daily Check-In</p>
            <p className="text-[11px] text-muted-foreground">Log how you're feeling today</p>
          </div>
        </button>
        <button
          onClick={() => { setFeedbackSessionLabel(undefined); setShowSessionFeedback(true); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
        >
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Log Session</p>
            <p className="text-[11px] text-muted-foreground">Mark today's workout complete</p>
          </div>
        </button>
      </div>
    </div>
  );

  const bottomPanelContent = hasSystem ? (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground text-center">Your AI coach is ready to adapt your plan</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="space-y-2">
          {[
            { label: "More intense", req: "Increase the overall intensity for this session" },
            { label: "Less volume", req: "Reduce the total volume this week" },
            { label: "Rest day today", req: "Convert today into a full recovery day" },
            { label: "Shorter session", req: "Shorten today's session — I'm pressed for time" },
            { label: "Travel mode", req: "I only have dumbbells — adapt accordingly" },
            { label: "More explosive", req: "Add explosive emphasis to today's training" },
          ].map(({ label, req }) => (
            <button
              key={label}
              className="w-full text-left px-4 py-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all"
              onClick={() => {
                setMobilePanel(null);
              }}
            >
              <p className="text-sm font-semibold text-foreground">{label}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 border-t border-border bg-background/98">
        <VibeBar
          onEditComplete={(result) => { handleGlobalEditComplete(result); setMobilePanel(null); }}
          onUndone={handleRestored}
        />
      </div>
    </div>
  ) : undefined;

  return (
    <MobileSlideLayout
      activePanel={mobilePanel}
      onPanelClose={() => setMobilePanel(null)}
      leftPanel={leftPanelContent}
      rightPanel={rightPanelContent}
      bottomPanel={bottomPanelContent}
    >
      {/* ─── Mobile header (mobile only) ─── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0 z-10">
        <button
          onClick={() => setMobilePanel("left")}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button
          onClick={() => { setMobilePanel(null); setLocation("/chat"); }}
          aria-label="Return to TrainChat agent"
          className="flex items-center justify-center rounded-xl px-2 py-1 transition-all duration-150 active:scale-95 active:opacity-70"
        >
          <img src={trainChatLogo} alt="TrainChat" className="h-6 object-contain" />
        </button>
        <button
          onClick={() => setMobilePanel("right")}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all"
          aria-label="Advanced tools"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Desktop TopNav (desktop only) ─── */}
      <div className="hidden md:block">
        <TopNav userName={userName} />
      </div>

      {/* ─── Desktop page header (desktop only) ─── */}
      <div className="hidden md:block px-4 pt-5 pb-4 border-b border-border bg-background flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Your System</h1>
          </div>
          <p className="text-xs text-muted-foreground pl-11">
            {hasSystem
              ? `${activeSystem.name} — Structured training, built for you`
              : "Your personalized training operating system"}
          </p>
        </div>
      </div>

      {/* ─── Mobile tab bar (mobile only, horizontal scroll) ─── */}
      {hasSystem && (
        <div className="md:hidden flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-sm overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
          <div className="flex px-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-all duration-150 ${
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Desktop tabs (desktop only) ─── */}
      {hasSystem && (
        <div className="hidden md:block flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex gap-0">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-all duration-150 ${
                    activeTab === id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Session edit history — hidden on History tab */}
      {hasSystem && recentEdits.length > 0 && activeTab !== "history" && (
        <RecentEditsBar edits={recentEdits} />
      )}

      {/* ─── Content area ─── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-5">
          {systemLoading ? (
            <ViewSkeleton />
          ) : !hasSystem ? (
            <EmptySystemState
              onInitialize={() => initialize.mutate()}
              isLoading={initialize.isPending}
            />
          ) : (
            <>
              {activeTab === "today" && (
                <div className="space-y-5">
                  {/* Readiness check-in prompt */}
                  {readinessToday === null && (
                    <button
                      onClick={() => setShowReadinessCheckIn(true)}
                      className="w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/8 px-4 py-3 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-primary">How are you feeling today?</p>
                        <p className="text-[11px] text-muted-foreground">Quick check-in helps your coach adapt your plan</p>
                      </div>
                      <span className="text-[11px] font-semibold text-primary border border-primary/30 bg-primary/10 rounded-lg px-3 py-1.5 flex-shrink-0">
                        Check in →
                      </span>
                    </button>
                  )}

                  {/* Readiness logged today */}
                  {readinessToday && (
                    <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <p className="text-xs text-green-400 font-semibold flex-1">Check-in logged today</p>
                      <button
                        onClick={() => setShowReadinessCheckIn(true)}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Update
                      </button>
                    </div>
                  )}

                  {/* Coach Insights — desktop only (mobile: in right panel) */}
                  <div className="hidden md:block space-y-3">
                    <InsightsPanel
                      onApplied={handleInsightApplied}
                      onModify={handleInsightModify}
                    />
                    <TrainingProfileCard />
                  </div>

                  {/* Today's session */}
                  <TodayView
                    highlightedIds={highlightedIds}
                    onEditExercise={openExerciseEdit}
                    onEditSession={openSessionEdit}
                    onQuickEditComplete={handleEditComplete}
                  />

                  {/* Log session button */}
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={() => {
                        setFeedbackSessionLabel(undefined);
                        setShowSessionFeedback(true);
                      }}
                      className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-xl px-4 py-2.5 hover:bg-muted/40 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Log completed session
                    </button>
                  </div>
                </div>
              )}
              {activeTab === "week" && (
                <WeekView
                  highlightedIds={highlightedIds}
                  onEditExercise={openExerciseEdit}
                  onEditSession={openSessionEdit}
                  onEditWeek={openWeekEdit}
                  isPremium={isPremium}
                  onUpgrade={handleUpgrade}
                />
              )}
              {activeTab === "block" && (
                !isPremium ? (
                  <PreviewLockedView
                    title="Block progression is a Pro feature"
                    description="See your full training block roadmap, phase structure, and week-by-week progression plan."
                    onUpgrade={handleUpgrade}
                  />
                ) : (
                  <BlockView
                    highlightedIds={highlightedIds}
                    onEditPhase={openPhaseEdit}
                    onEditWeek={openWeekEdit}
                  />
                )
              )}
              {activeTab === "history" && (
                !isPremium ? (
                  <PreviewLockedView
                    title="Change history is a Pro feature"
                    description="Track every AI edit, view before/after comparisons, and restore any previous version of your program."
                    onUpgrade={handleUpgrade}
                  />
                ) : (
                  <HistoryView
                    onOpenDetail={setChangeDetailId}
                    onRestored={handleRestored}
                  />
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Desktop VibeBar (desktop only) ─── */}
      {hasSystem && activeTab !== "history" && (
        isPremium ? (
          <div className="hidden md:block">
            <VibeBar
              onEditComplete={handleGlobalEditComplete}
              onUndone={handleRestored}
            />
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-3 px-4 py-3 border-t border-border bg-background/98">
            <div className="flex-1 flex items-center gap-3 bg-card border border-border/40 rounded-2xl px-4 py-3 opacity-50 cursor-not-allowed">
              <Lock className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              <span className="flex-1 text-left text-sm text-muted-foreground/40">AI program edits require Pro</span>
            </div>
            <button
              onClick={handleUpgrade}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold whitespace-nowrap hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <Zap className="w-3.5 h-3.5" /> Upgrade
            </button>
          </div>
        )
      )}

      {/* ─── Mobile coach bar (mobile only) ─── */}
      {hasSystem && activeTab !== "history" && (
        <div className="md:hidden border-t border-border bg-background/98 backdrop-blur-sm flex-shrink-0 px-4 py-3 safe-area-bottom">
          {isPremium ? (
            <button
              onClick={() => setMobilePanel("bottom")}
              className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 hover:border-primary/40 active:scale-[0.98] transition-all duration-150"
            >
              <Sparkles className="w-4 h-4 text-primary/70 flex-shrink-0" />
              <span className="flex-1 text-left text-sm text-muted-foreground/60">Ask your coach or give a command…</span>
              <ChevronUp className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              className="w-full flex items-center gap-3 bg-card border border-primary/20 rounded-2xl px-4 py-3.5 hover:border-primary/40 active:scale-[0.98] transition-all duration-150"
            >
              <Lock className="w-4 h-4 text-primary/70 flex-shrink-0" />
              <span className="flex-1 text-left text-sm text-muted-foreground/60">Unlock AI coaching edits</span>
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Pro</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Contextual edit drawer ─── */}
      {editTarget && (
        <EditDrawer
          target={editTarget}
          prefillRequest={editPrefill}
          exerciseContext={editTarget.type === "exercise" ? editExerciseContext : undefined}
          onClose={() => { setEditTarget(null); setEditExerciseContext(undefined); }}
          onEditComplete={handleEditComplete}
        />
      )}

      {/* ─── Change detail drawer ─── */}
      {changeDetailId !== null && (
        <ChangeDetailDrawer
          changeId={changeDetailId}
          onClose={() => setChangeDetailId(null)}
          onRestored={(changedIds) => {
            handleRestored(changedIds);
            setChangeDetailId(null);
            setActiveTab("today");
          }}
        />
      )}

      {/* ─── Daily readiness check-in modal ─── */}
      {showReadinessCheckIn && (
        <ReadinessCheckIn
          onClose={() => setShowReadinessCheckIn(false)}
          onSubmitted={(adaptation) => {
            refetchReadiness();
            queryClient.invalidateQueries({ queryKey: ["insights"] });
            if (adaptation && adaptation.changesApplied > 0) {
              queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
            }
          }}
        />
      )}

      {/* ─── Post-session feedback modal ─── */}
      {showSessionFeedback && (
        <SessionFeedback
          sessionLabel={feedbackSessionLabel}
          onClose={() => setShowSessionFeedback(false)}
          onSubmitted={() => {
            queryClient.invalidateQueries({ queryKey: ["insights"] });
          }}
        />
      )}
    </MobileSlideLayout>
  );
}
