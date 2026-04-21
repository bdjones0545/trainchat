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
  ChevronLeft,
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
  UserPlus,
  Trash2,
  AlertTriangle,
  Moon,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { useLogout } from "@workspace/api-client-react";
import { customFetch, getListMessagesQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { clearAuthState } from "@/lib/routing";
import { useFocusMode } from "@/hooks/useFocusMode";
import { FOCUS_MODE_CONFIGS, type FocusModeConfig } from "@/lib/focusModeConfig";
import type { FocusMode } from "@/lib/focusMode";
import { getQuickCommands, recordQuickCommandSelection } from "@/lib/quickCommands";
import TopNav from "@/components/layout/TopNav";
import MobileSlideLayout, { type SlidePanel } from "@/components/layout/MobileSlideLayout";
import BlockStatusCard from "@/components/training/BlockStatusCard";
import CoachMemoryInsights from "@/components/training/CoachMemoryInsights";
import EditDrawer, {
  type EditTarget,
  type EditResult,
  type EditDiff,
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

async function fetchActiveSystem(focusMode?: FocusMode) {
  const url = focusMode
    ? `/api/training-system/active?focus=${encodeURIComponent(focusMode)}`
    : "/api/training-system/active";
  return customFetch<any>(url).catch(() => null);
}
async function fetchSubscription() {
  try { return await customFetch<any>("/api/subscription"); } catch { return null; }
}
async function fetchBlockSummary(focusMode?: string) {
  const url = focusMode
    ? `/api/training-system/block?focus=${encodeURIComponent(focusMode)}`
    : "/api/training-system/block";
  return customFetch<any>(url);
}
async function fetchCurrentWeek(weekNumber?: number, focusMode?: string) {
  const params = new URLSearchParams();
  if (weekNumber != null) params.set("weekNumber", String(weekNumber));
  if (focusMode) params.set("focus", focusMode);
  const qs = params.toString();
  return customFetch<any>(qs ? `/api/training-system/week?${qs}` : "/api/training-system/week");
}
async function fetchWeeksList(focusMode?: string) {
  const url = focusMode
    ? `/api/training-system/weeks?focus=${encodeURIComponent(focusMode)}`
    : "/api/training-system/weeks";
  return customFetch<any>(url);
}
async function fetchToday(focusMode?: string) {
  const url = focusMode
    ? `/api/training-system/today?focus=${encodeURIComponent(focusMode)}`
    : "/api/training-system/today";
  return customFetch<any>(url);
}
async function initializeSystem() {
  return customFetch<any>("/api/training-system/initialize", { method: "POST" });
}
// ─── Command Intent Registry ──────────────────────────────────────────────────
// Quick actions that have a structured intent bypass NLP on the server and
// execute deterministic logic. Always produces a real diff.
export const COMMAND_INTENTS = {
  shorten_session:      { scopeDefault: "today" },
  reduce_volume:        { scopeDefault: "week" },
  increase_power:       { scopeDefault: "block" },
  recovery_focus:       { scopeDefault: "week" },
  convert_to_rest_day:  { scopeDefault: "today" },
  travel_mode:          { scopeDefault: "today" },
} as const;

export type CommandIntentKey = keyof typeof COMMAND_INTENTS;

interface StructuredEditPayload {
  intent: CommandIntentKey;
  scope?: string;
  source?: string;
}

async function submitGlobalEdit(payload: string | StructuredEditPayload, focusMode?: string) {
  const body =
    typeof payload === "string"
      ? { request: payload, ...(focusMode ? { focusMode } : {}) }
      : { intent: payload.intent, request: "", source: payload.source ?? "quick_action", ...(focusMode ? { focusMode } : {}) };
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function submitQuickEdit(
  payload: string | StructuredEditPayload,
  targetContext?: { type: string; id: number; label: string; parentLabel?: string },
  focusMode?: string
) {
  const body =
    typeof payload === "string"
      ? { request: payload, targetContext, ...(focusMode ? { focusMode } : {}) }
      : { intent: payload.intent, request: "", source: payload.source ?? "quick_action", targetContext, ...(focusMode ? { focusMode } : {}) };
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
async function fetchBlockCompletion(focusMode?: string) {
  const url = focusMode
    ? `/api/training-system/block-completion?focus=${encodeURIComponent(focusMode)}`
    : "/api/training-system/block-completion";
  return customFetch<any>(url);
}
async function markBlockCompleteFn(focusMode?: string) {
  return customFetch<any>("/api/training-system/mark-block-complete", {
    method: "POST",
    body: JSON.stringify({ focusMode }),
    headers: { "Content-Type": "application/json" },
  });
}
async function continueBlockFn(options: { mode: "next" | "repeat"; adjustments?: string[]; blockTypeOverride?: string; focusMode?: string }) {
  return customFetch<any>("/api/training-system/continue-block", {
    method: "POST",
    body: JSON.stringify(options),
  });
}
async function advanceWeekFn(focusMode?: string) {
  return customFetch<any>("/api/training-system/advance-week", {
    method: "POST",
    body: JSON.stringify({ focusMode }),
    headers: { "Content-Type": "application/json" },
  });
}
async function restoreChange(changeLogId: number) {
  return customFetch<any>(`/api/training-system/restore/${changeLogId}`, { method: "POST" });
}
async function fetchHistory() {
  return customFetch<{ history: any[]; trainingSystemId: number }>("/api/training-system/history");
}
async function fetchAgentMemory() {
  return customFetch<{ agentMemory: AgentMemory | null }>("/api/training-system/agent-memory");
}
async function patchAgentMemory(agentMemory: Partial<AgentMemory>) {
  return customFetch<{ ok: boolean; agentMemory: AgentMemory }>("/api/training-system/agent-memory", {
    method: "PATCH",
    body: JSON.stringify({ agentMemory }),
  });
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface AgentMemory {
  activeEmphases: string[];
  activeConstraints: string[];
  activeBiases: string[];
  lastModifiers: Array<{ label: string; scope: string; appliedAt: string }>;
}

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
  const { focusMode: exerciseCardFocusMode } = useFocusMode();
  const highlight = useHighlightClass(exercise.id, highlightedIds);
  const [showActions, setShowActions] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // Swap picker state
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<any[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState(false);

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
      return submitQuickEdit(req, { type: "exercise", id: exercise.id, label: exercise.name, parentLabel: sessionLabel }, exerciseCardFocusMode);
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
    setSwapError(false);
    try {
      const url = `/api/exercises/swap/${encodeURIComponent(exercise.name)}`;
      if (import.meta.env.DEV) console.log("[swap] fetching", url, "exercise.name=", exercise.name);
      const result = await customFetch<any>(url);
      if (import.meta.env.DEV) console.log("[swap] result count=", result?.data?.length, "data=", result?.data);
      setSwapCandidates(result.data ?? []);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[swap] error", err);
      setSwapError(true);
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
    { label: "Easier", icon: TrendingDown, req: `Make ${exercise.name} easier` },
    { label: "Harder", icon: Flame, req: `Make ${exercise.name} harder` },
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
            onClick={() => { setShowActions((v) => !v); setSwapOpen(false); setSwapError(false); }}
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
                  onClick={swapOpen ? () => { setSwapOpen(false); setSwapError(false); } : handleSwapOpen}
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
                    ) : swapError ? (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-red-400">Couldn't load alternatives. Try again.</p>
                        <button
                          onClick={handleSwapOpen}
                          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 flex-shrink-0"
                        >
                          Retry
                        </button>
                      </div>
                    ) : swapCandidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No alternatives found. Use Full Edit to swap manually.</p>
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
            onClick={() => { setShowActions((v) => !v); setSwapOpen(false); setSwapError(false); }}
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
  onLogSession?: () => void;
  onCheckIn?: () => void;
  onStartSession?: () => void;
  sessionLoggedToday?: boolean;
  sessionInProgress?: boolean;
  checkedInToday?: boolean;
}

function coachingNotesToBullets(notes: string, max = 3): string[] {
  if (!notes || !notes.trim()) return [];
  const parts = notes
    .split(/\.\s+|;\s*|\n+/)
    .map((s) => s.trim().replace(/\.+$/, "").trim())
    .filter((s) => s.length > 10);
  return parts.slice(0, max);
}

function TodayView({ highlightedIds, onEditExercise, onEditSession, onQuickEditComplete, onLogSession, onCheckIn, onStartSession, sessionLoggedToday, sessionInProgress, checkedInToday }: TodayViewProps) {
  const { focusMode } = useFocusMode();
  const { data: today, isLoading, error } = useQuery({
    queryKey: ["training-system-today", focusMode],
    queryFn: () => fetchToday(focusMode),
    retry: false,
  });

  // Dev logging: ActiveProgramSource — pairs with [LiveProgramSidebarSource] in chat.tsx
  // to make sidebar/Today divergence immediately visible in the browser console.
  useEffect(() => {
    if (!import.meta.env.DEV || !today) return;
    console.log("[ActiveProgramSource]", {
      source: "db_active_program",
      sessionId: today.id ?? null,
      sessionLabel: today.label ?? null,
      day1Exercises: (today.exercises ?? []).map((e: { name: string }) => e.name),
    });
  }, [today]);

  if (isLoading) return <ViewSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Activity className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">Couldn't load today's session. Try refreshing.</p>
      </div>
    );
  }
  if (!today) {
    const dayOfWeekLabel = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-muted/40 via-muted/20 to-transparent border border-border p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-muted/60 border border-border flex items-center justify-center mx-auto mb-4">
            <Moon className="w-7 h-7 text-muted-foreground/60" />
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{dayOfWeekLabel}</p>
          <h2 className="text-xl font-bold text-foreground mb-2">Rest Day</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            No training scheduled today. Rest is part of the plan — your body adapts and gets stronger during recovery.
          </p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <p className="text-xs font-bold text-foreground uppercase tracking-wider">Recovery Priorities</p>
          <ul className="space-y-2.5">
            {[
              "Stay well hydrated throughout the day",
              "Aim for 7–9 hours of sleep tonight",
              "Light walking or stretching is fine if you feel the urge to move",
              "Eat enough protein to support muscle repair",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />
                <span className="text-sm text-muted-foreground leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
        {!checkedInToday && onCheckIn && (
          <button
            onClick={onCheckIn}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
          >
            <Activity className="w-4 h-4" />
            Log a readiness check-in
          </button>
        )}
      </div>
    );
  }

  const dayOfWeekLabel = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const sessionHighlight = highlightedIds.sessions.has(today.id) ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background" : "";

  const sessionFocusBullets = coachingNotesToBullets(today.coachingNotes ?? "");

  return (
    <div className="space-y-4">
      {/* Session hero — action-first */}
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

        {/* Metadata chips */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
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

        {/* Primary CTAs — inline in hero so they're visible immediately */}
        <div className="flex gap-2">
          {sessionLoggedToday ? (
            <div className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-bold text-green-400">Session logged</span>
            </div>
          ) : sessionInProgress ? (
            <button
              onClick={onLogSession}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground/80 animate-pulse flex-shrink-0" />
              Resume Session
            </button>
          ) : (
            <button
              onClick={onStartSession}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              Start Session
            </button>
          )}
          {!checkedInToday && (
            <button
              onClick={onCheckIn}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex-shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              Check In
            </button>
          )}
        </div>
      </div>

      {/* Session Focus — coaching notes as bullets, visible before exercises */}
      {sessionFocusBullets.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Info className="w-3 h-3 text-amber-400" />
            </div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Session Focus</span>
          </div>
          <ul className="space-y-2">
            {sessionFocusBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 mt-1.5 flex-shrink-0" />
                <span className="text-sm text-muted-foreground leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {/* Finish session nudge — always visible after exercises */}
          {!sessionLoggedToday && (
            <div className="px-5 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Done with today's session?</p>
              <button
                onClick={onLogSession}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-lg px-3 py-1.5 transition-all"
              >
                <CheckCircle2 className="w-3 h-3" />
                Log it
              </button>
            </div>
          )}
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

const WEEK_PHASE_NAMES: Record<number, string> = {
  1: "Establish",
  2: "Build",
  3: "Intensify",
  4: "Deload",
};

const WEEK_PHASE_DESCRIPTIONS: Record<number, string> = {
  1: "Establish baseline loads and movement quality",
  2: "Increase volume and training density",
  3: "Intensify force output and top-end loading",
  4: "Reduce fatigue and consolidate adaptation",
};

function WeekView({ highlightedIds, onEditExercise, onEditSession, onEditWeek, isPremium = false, onUpgrade }: WeekViewProps) {
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number | null>(null);
  const [showRefineActions, setShowRefineActions] = useState(false);
  const [refineActiveChip, setRefineActiveChip] = useState<string | null>(null);

  const { focusMode } = useFocusMode();
  const queryClient = useQueryClient();

  const { data: weeksList, isLoading: weeksListLoading } = useQuery({
    queryKey: ["training-system-weeks", focusMode],
    queryFn: () => fetchWeeksList(focusMode),
    retry: false,
  });

  const currentWeekNumber = weeksList?.currentWeekNumber ?? 1;
  const activeWeekNumber = selectedWeekNumber ?? currentWeekNumber;

  const { data: week, isLoading: weekLoading } = useQuery({
    queryKey: ["training-system-week", activeWeekNumber, focusMode],
    queryFn: () => fetchCurrentWeek(activeWeekNumber, focusMode),
    retry: false,
    enabled: !weeksListLoading,
  });

  function toggleCard(sessionId: number) {
    setExpandedCards((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  }

  const refineWeekMutation = useMutation({
    mutationFn: ({ req, chip, intent }: { req?: string; chip: string; intent?: CommandIntentKey }) => {
      setRefineActiveChip(chip);
      const payload = intent ? { intent, scope: "week", source: "quick_action" } : (req ?? chip);
      return submitQuickEdit(payload, { type: "week", id: week?.id ?? 0, label: week?.label ?? `Week ${activeWeekNumber}`, parentLabel: week?.phase?.name }, focusMode);
    },
    onSuccess: (data) => {
      setRefineActiveChip(null);
      setShowRefineActions(false);
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    },
    onError: () => setRefineActiveChip(null),
  });

  const advanceWeekMutation = useMutation({
    mutationFn: () => advanceWeekFn(focusMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block-completion", focusMode] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
    },
  });

  const isLoading = weeksListLoading || weekLoading;

  if (isLoading && !weeksList) return <ViewSkeleton />;
  if (!weeksList && !week) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Calendar className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">No week data available.</p>
      </div>
    );
  }

  const totalWeeks = weeksList?.phase?.weekCount ?? weeksList?.weeks?.length ?? 4;
  const phaseName = weeksList?.phase?.name ?? week?.phase?.name ?? "Current Block";
  const weeksArr = weeksList?.weeks ?? [];

  const volumeColors: Record<string, string> = {
    low: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    moderate: "text-green-400 bg-green-400/10 border-green-400/20",
    high: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    deload: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDow = new Date().getDay();

  const weekStatus = week?.status;
  const isCompletedWeek = weekStatus === "completed";
  const isUpcomingWeek = weekStatus === "upcoming";
  const isCurrentWeek = weekStatus === "current" || activeWeekNumber === currentWeekNumber;

  const trainingSessions = week?.sessions?.filter((s: any) => !s.isRestDay) ?? [];
  const totalSessions = trainingSessions.length;
  const weekHighlight = week && highlightedIds.weeks.has(week.id) ? "ring-2 ring-green-400/50 ring-offset-1 ring-offset-background" : "";

  const weekPhaseLabel = WEEK_PHASE_NAMES[activeWeekNumber] ?? null;
  const weekPhaseDescription = WEEK_PHASE_DESCRIPTIONS[activeWeekNumber] ?? null;

  const REFINE_CHIPS_BY_FOCUS: Record<FocusMode, Array<{ label: string; req?: string; intent?: CommandIntentKey }>> = {
    strength: [
      { label: "More explosive",   req: `Make Week ${activeWeekNumber} more explosive and power-focused` },
      { label: "Reduce fatigue",   intent: "recovery_focus" },
      { label: "Add conditioning", req: `Add more conditioning work to Week ${activeWeekNumber}` },
      { label: "Shorten sessions", intent: "shorten_session" },
    ],
    speed: [
      { label: "More acceleration", req: `Shift Week ${activeWeekNumber} toward acceleration and drive phase work` },
      { label: "More reactive",     req: `Make Week ${activeWeekNumber} more reactive and elastic` },
      { label: "Reduce fatigue",    intent: "recovery_focus" },
      { label: "Shorten sessions",  intent: "shorten_session" },
    ],
    mobility: [
      { label: "More hip focus",    req: `Shift Week ${activeWeekNumber} toward hip mobility and end-range control` },
      { label: "More recovery flow",req: `Make Week ${activeWeekNumber} more recovery and restoration focused` },
      { label: "Lower intensity",   req: `Lower the intensity of Week ${activeWeekNumber}` },
      { label: "Shorten sessions",  intent: "shorten_session" },
    ],
  };
  const REFINE_CHIPS = REFINE_CHIPS_BY_FOCUS[focusMode] ?? REFINE_CHIPS_BY_FOCUS.strength;

  return (
    <div className="space-y-4">
      {/* Block intelligence — compact */}
      <BlockStatusCard compact />

      {/* ── Hierarchy breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium px-1">
        <span className="text-muted-foreground/80">{phaseName}</span>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <span className={isCurrentWeek ? "text-primary font-semibold" : "text-muted-foreground/80"}>
          Week {activeWeekNumber}
        </span>
        <ChevronRight className="w-3 h-3 flex-shrink-0" />
        <span>{totalSessions} Sessions</span>
      </div>

      {/* ── Week selector ── */}
      {weeksArr.length > 0 && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedWeekNumber(Math.max(1, activeWeekNumber - 1))}
            disabled={activeWeekNumber <= 1}
            className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-none">
            {weeksArr.map((w: any) => {
              const isActive = w.weekNumber === activeWeekNumber;
              const isCurrent = w.weekNumber === currentWeekNumber;
              const isCompleted = w.status === "completed";
              return (
                <button
                  key={w.weekNumber}
                  onClick={() => setSelectedWeekNumber(w.weekNumber)}
                  className={`flex-1 min-w-0 py-2 px-2 rounded-xl border text-[11px] font-semibold transition-all duration-150 whitespace-nowrap relative ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                      : isCompleted
                      ? "bg-green-500/8 border-green-500/20 text-green-400/80 hover:bg-green-500/12"
                      : isCurrent
                      ? "bg-primary/10 border-primary/30 text-primary/80 hover:bg-primary/15"
                      : "bg-card border-border text-muted-foreground/60 hover:bg-muted/40 hover:text-muted-foreground"
                  }`}
                >
                  <span className="block truncate">W{w.weekNumber}</span>
                  {isCompleted && !isActive && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-400" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setSelectedWeekNumber(Math.min(totalWeeks, activeWeekNumber + 1))}
            disabled={activeWeekNumber >= totalWeeks}
            className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Week loading skeleton ── */}
      {weekLoading && <ViewSkeleton />}

      {!weekLoading && week && (
        <>
          {/* ── Week status header ── */}
          <div className={`rounded-2xl border p-5 transition-all duration-500 ${
            isCompletedWeek
              ? "bg-gradient-to-br from-green-500/8 via-green-500/4 to-transparent border-green-500/20"
              : isCurrentWeek
              ? "bg-gradient-to-br from-card to-muted/30 border-border"
              : "bg-gradient-to-br from-card/80 to-muted/20 border-border/50"
          } ${weekHighlight}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                {/* Status pill */}
                <div className="flex items-center gap-2 mb-1.5">
                  {isCurrentWeek && !isCompletedWeek && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                      Active
                    </span>
                  )}
                  {isCompletedWeek && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Complete
                    </span>
                  )}
                  {isUpcomingWeek && !isCurrentWeek && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border">
                      Upcoming
                    </span>
                  )}
                </div>

                {/* Week title + phase name */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground leading-tight">
                    Week {activeWeekNumber} of {totalWeeks}
                  </h2>
                  {weekPhaseLabel && (
                    <span className="text-sm font-semibold text-muted-foreground">— {weekPhaseLabel}</span>
                  )}
                </div>

                {/* Week description */}
                {weekPhaseDescription && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{weekPhaseDescription}</p>
                )}
                {!weekPhaseDescription && week.focus && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{week.focus}</p>
                )}

                {highlightedIds.weeks.has(week.id) && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                    <CheckCircle2 className="w-3 h-3" /> Updated
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {week.volumeLevel && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${volumeColors[week.volumeLevel] ?? volumeColors.moderate}`}>
                    {week.volumeLevel}
                  </span>
                )}
              </div>
            </div>

            {/* Session progress */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
                <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{totalSessions} sessions</span>
              </div>
              <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Week {activeWeekNumber} of {totalWeeks}</span>
              </div>
            </div>
          </div>

          {/* ── Week Complete Banner ── */}
          {isCompletedWeek && activeWeekNumber < totalWeeks && (
            <div className="rounded-2xl border border-green-500/25 bg-gradient-to-br from-green-500/8 to-transparent p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground mb-0.5">
                    Week {activeWeekNumber} Complete
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    {weekPhaseDescription ?? "Great work — you've finished this week's training."}
                    {" "}Next up: Week {activeWeekNumber + 1}
                    {WEEK_PHASE_NAMES[activeWeekNumber + 1] ? ` — ${WEEK_PHASE_NAMES[activeWeekNumber + 1]} Phase` : ""}.
                  </p>
                  <button
                    onClick={() => setSelectedWeekNumber(activeWeekNumber + 1)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    Start Week {activeWeekNumber + 1}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Complete This Week ── */}
          {isCurrentWeek && !isCompletedWeek && activeWeekNumber < totalWeeks && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Finished Week {activeWeekNumber}?</p>
                    <p className="text-[10px] text-muted-foreground">Mark complete and move to Week {activeWeekNumber + 1}</p>
                  </div>
                </div>
                <button
                  onClick={() => advanceWeekMutation.mutate()}
                  disabled={advanceWeekMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
                >
                  {advanceWeekMutation.isPending ? "Advancing…" : `Start Week ${activeWeekNumber + 1}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Refine This Week ── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowRefineActions((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Refine This Week</p>
                  <p className="text-[10px] text-muted-foreground">Adjust Week {activeWeekNumber} with AI</p>
                </div>
              </div>
              {showRefineActions
                ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
            </button>

            {showRefineActions && (
              <div className="border-t border-border px-4 py-3.5 space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {REFINE_CHIPS.map(({ label, req, intent }) => (
                    <button
                      key={label}
                      onClick={() => refineWeekMutation.mutate({ req, chip: label, intent })}
                      disabled={refineWeekMutation.isPending}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150 ${
                        refineActiveChip === label
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-muted/50 border-border text-muted-foreground hover:bg-primary/8 hover:border-primary/30 hover:text-foreground"
                      } disabled:opacity-50`}
                    >
                      {refineActiveChip === label
                        ? <RotateCcw className="w-3 h-3 animate-spin" />
                        : <Zap className="w-3 h-3" />
                      }
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setShowRefineActions(false); onEditWeek(week); }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary/70 hover:text-primary transition-colors"
                >
                  <PenLine className="w-3 h-3" />
                  Custom instruction
                </button>
              </div>
            )}
          </div>

          {/* ── Session cards ── */}
          <div className="space-y-3">
            {(() => {
              let trainingSessionCount = 0;
              return week.sessions?.map((session: any, idx: number) => {
                const isRestDay = session.isRestDay;
                if (!isRestDay) trainingSessionCount++;
                const isLocked = !isPremium && !isRestDay && trainingSessionCount > 1;
                const isToday = isCurrentWeek && session.dayOfWeek === todayDow;
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
                    className={`rounded-xl border overflow-hidden transition-all duration-500 ${
                      isToday
                        ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
                        : isUpcomingWeek
                        ? "border-border/50 bg-card/50"
                        : "border-border bg-card"
                    } ${sessionHighlight}`}
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
                            <span className={`font-semibold text-sm truncate ${isUpcomingWeek ? "text-foreground/70" : "text-foreground"}`}>{session.label}</span>
                            {isToday && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex-shrink-0">Today</span>
                            )}
                            {highlightedIds.sessions.has(session.id) && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20 flex-shrink-0">Updated</span>
                            )}
                          </div>
                          {session.emphasis && <p className={`text-xs truncate mt-0.5 ${isUpcomingWeek ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{session.emphasis}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {session.exercises?.length > 0 && <span className="text-xs text-muted-foreground">{session.exercises.length} ex</span>}
                        <button
                          onClick={() => onEditSession(session, week.label ?? `Week ${activeWeekNumber}`)}
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
                              <span className={`text-xs flex-1 truncate ${isUpcomingWeek ? "text-foreground/60" : "text-foreground/80"}`}>{ex.name}</span>
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
                                <><ChevronUp className="w-3 h-3" /><span>Show less</span></>
                              ) : (
                                <><ChevronDown className="w-3 h-3" /><span>+{session.exercises.length - 3} more exercises</span></>
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

          {/* ── Upgrade CTA for non-premium ── */}
          {!isPremium && totalSessions > 1 && (
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
        </>
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

// Modify-Next-Block adjustment options — focus-aware
const FOCUS_MODIFY_OPTIONS: Record<FocusMode, Array<{ id: string; label: string; blockType?: string }>> = {
  strength: [
    { id: "power",      label: "Shift focus toward power",          blockType: "POWER_ELASTIC_CONVERSION" },
    { id: "strength",   label: "Increase strength emphasis",         blockType: "INTENSIFICATION_STRENGTH" },
    { id: "recovery",   label: "Extended recovery focus",            blockType: "REBUILD_DELOAD" },
    { id: "foundation", label: "Re-establish the foundation",        blockType: "FOUNDATION_ACCUMULATION" },
  ],
  speed: [
    { id: "acceleration",  label: "Shift toward acceleration phase",   blockType: "SPEED_ACCELERATION" },
    { id: "max_velocity",  label: "Shift toward max velocity",         blockType: "SPEED_MAX_VELOCITY" },
    { id: "reactive_cod",  label: "Shift toward reactive / COD",       blockType: "SPEED_REACTIVE" },
    { id: "recovery",      label: "Return-to-speed recovery focus",    blockType: "REBUILD_DELOAD" },
  ],
  mobility: [
    { id: "hip_mobility",  label: "Shift toward hip mobility",         blockType: "MOBILITY_HIP" },
    { id: "thoracic_spine",label: "Shift toward thoracic / spine",     blockType: "MOBILITY_THORACIC" },
    { id: "recovery_flow", label: "Shift toward recovery flow",        blockType: "MOBILITY_RECOVERY" },
    { id: "end_range",     label: "Shift toward end-range control",    blockType: "MOBILITY_END_RANGE" },
  ],
};

const FOCUS_REPEAT_OPTIONS: Record<FocusMode, Array<{ id: string; label: string }>> = {
  strength: [
    { id: "more_volume",       label: "Add more volume" },
    { id: "heavier",           label: "Push heavier loads" },
    { id: "less_fatigue",      label: "Reduce fatigue load" },
    { id: "more_conditioning", label: "Add conditioning" },
  ],
  speed: [
    { id: "more_acceleration", label: "More acceleration emphasis" },
    { id: "more_reactive",     label: "More reactive / elastic work" },
    { id: "less_impact",       label: "Reduce impact load" },
    { id: "more_deceleration", label: "Add deceleration / COD" },
  ],
  mobility: [
    { id: "more_hip",       label: "More hip focus" },
    { id: "more_thoracic",  label: "More thoracic / spine work" },
    { id: "lower_intensity",label: "Lower intensity" },
    { id: "more_recovery",  label: "More recovery emphasis" },
  ],
};

function ProgrammingLogicCard({ phase }: { phase: any }) {
  const [expanded, setExpanded] = useState(false);
  const bullets: string[] = [];
  if (phase?.emphasis) bullets.push(phase.emphasis);
  if (phase?.goal && phase.goal !== phase.emphasis) bullets.push(phase.goal);
  if (phase?.notes) bullets.push(phase.notes);
  if (bullets.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full gap-2"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Programming Logic</span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <ul className="mt-2.5 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-primary/50 flex-shrink-0 mt-1.5" />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockView({ highlightedIds, onEditPhase, onEditWeek }: BlockViewProps) {
  const queryClient = useQueryClient();
  const { focusMode } = useFocusMode();

  const { data: block, isLoading, error } = useQuery({
    queryKey: ["training-system-block", focusMode],
    queryFn: () => fetchBlockSummary(focusMode),
    retry: false,
  });

  const { data: completion, isLoading: completionLoading } = useQuery({
    queryKey: ["training-system-block-completion", focusMode],
    queryFn: () => fetchBlockCompletion(focusMode),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [showModifySheet, setShowModifySheet] = useState(false);
  const [showRepeatSheet, setShowRepeatSheet] = useState(false);
  const [selectedModifyOption, setSelectedModifyOption] = useState<string | null>(null);
  const [selectedRepeatOptions, setSelectedRepeatOptions] = useState<string[]>([]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-block-completion", focusMode] });
    queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
  }

  const markCompleteMutation = useMutation({
    mutationFn: () => markBlockCompleteFn(focusMode),
    onSuccess: () => invalidateAll(),
  });

  const continueBlockMutation = useMutation({
    mutationFn: (opts: { mode: "next" | "repeat"; adjustments?: string[]; blockTypeOverride?: string }) =>
      continueBlockFn({ ...opts, focusMode }),
    onSuccess: () => {
      invalidateAll();
      setShowModifySheet(false);
      setShowRepeatSheet(false);
      setSelectedModifyOption(null);
      setSelectedRepeatOptions([]);
    },
  });

  function handleStartNextBlock() {
    continueBlockMutation.mutate({ mode: "next" });
  }

  const MODIFY_OPTIONS = FOCUS_MODIFY_OPTIONS[focusMode] ?? FOCUS_MODIFY_OPTIONS.strength;
  const REPEAT_OPTIONS = FOCUS_REPEAT_OPTIONS[focusMode] ?? FOCUS_REPEAT_OPTIONS.strength;

  function handleConfirmModify() {
    const chosen = MODIFY_OPTIONS.find((o) => o.id === selectedModifyOption);
    continueBlockMutation.mutate({
      mode: "next",
      blockTypeOverride: chosen?.blockType,
      adjustments: chosen ? [chosen.label] : [],
    });
  }

  function handleConfirmRepeat() {
    continueBlockMutation.mutate({
      mode: "repeat",
      adjustments: selectedRepeatOptions
        .map((id) => REPEAT_OPTIONS.find((o) => o.id === id)?.label)
        .filter(Boolean) as string[],
    });
  }

  const { data: blockMemory } = useQuery({
    queryKey: ["agent-memory"],
    queryFn: fetchAgentMemory,
    retry: false,
    staleTime: 60_000,
  });
  const agentMem = blockMemory?.agentMemory;

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

  // Derive active modifier chips from agent memory
  const activeModifiers: Array<{ label: string; color: string }> = [
    ...(agentMem?.activeEmphases ?? []).map((v) => ({
      label: v,
      color: "text-primary bg-primary/10 border-primary/20",
    })),
    ...(agentMem?.activeConstraints ?? []).map((v) => ({
      label: v,
      color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    })),
    ...(agentMem?.activeBiases ?? []).map((v) => ({
      label: v,
      color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    })),
  ];
  const isBlockComplete = completion?.isComplete === true;
  const completedPhaseName = completion?.completedPhase?.name ?? currentPhase?.name ?? "Your Block";
  const nextRec = completion?.nextRecommendation;
  const blockChainIndex = completion?.blockChainIndex ?? 0;
  const isContinuing = continueBlockMutation.isPending;
  const blockPct = currentPhase ? Math.round(((currentWeekNumber - 1) / currentPhase.weekCount) * 100) : 0;
  const hasFuturePhases = phases.some((p: any) => p.status === "future");

  return (
    <div className="space-y-4">

      {/* ── Block Complete Card ── (shown when block is finished) */}
      {isBlockComplete && nextRec && (
        <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-500/8 via-green-500/3 to-transparent p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-green-500/15 border border-green-500/25 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-widest text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">Block Complete</span>
                {blockChainIndex > 1 && (
                  <span className="text-[9px] font-semibold text-muted-foreground/60">Block {blockChainIndex} of your progression</span>
                )}
              </div>
              <h2 className="text-base font-bold text-foreground leading-tight">{completedPhaseName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">4-week block complete</p>
            </div>
          </div>
          {nextRec.whatBuilt?.length > 0 && (
            <div className="bg-background/50 rounded-xl border border-border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">What this block built</p>
              <ul className="space-y-1.5">
                {nextRec.whatBuilt.map((item: string) => (
                  <li key={item} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                    <span className="text-xs text-foreground/80 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="bg-background/40 rounded-xl border border-primary/20 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-1">Next recommended phase</p>
            <p className="text-sm font-bold text-foreground mb-1">{nextRec.displayName}</p>
            <p className="text-xs text-muted-foreground leading-relaxed italic">"{nextRec.rationale}"</p>
          </div>
          <div className="space-y-2.5">
            <button onClick={handleStartNextBlock} disabled={isContinuing} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
              {isContinuing ? <><RotateCcw className="w-4 h-4 animate-spin" />Building your next block...</> : <><ChevronRight className="w-4 h-4" />Start Next Block</>}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowModifySheet(true)} disabled={isContinuing} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted/40 hover:border-primary/30 active:scale-[0.98] transition-all disabled:opacity-40">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />Modify Next Block
              </button>
              <button onClick={() => setShowRepeatSheet(true)} disabled={isContinuing} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted/40 hover:border-primary/30 active:scale-[0.98] transition-all disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />Repeat With Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Complete prompt ── */}
      {!isBlockComplete && !completionLoading && currentPhase && currentWeekNumber === 4 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Finished the block?</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Mark it complete to unlock your next phase.</p>
            </div>
            <button onClick={() => markCompleteMutation.mutate()} disabled={markCompleteMutation.isPending} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted/40 transition-all disabled:opacity-50 flex-shrink-0">
              {markCompleteMutation.isPending ? <RotateCcw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
              Mark Complete
            </button>
          </div>
        </div>
      )}

      {/* ── Block Intelligence ── */}
      <BlockStatusCard />

      {/* ── Current Block Hero (redesigned) ── */}
      {currentPhase && !isBlockComplete && (
        <div className={`rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-4 transition-all duration-500 ${highlightedIds.phases.has(currentPhase.id) ? "ring-2 ring-purple-400/50 ring-offset-1 ring-offset-background" : ""}`}>
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Current Block</p>
                {blockChainIndex > 0 && (
                  <span className="text-[9px] font-medium text-muted-foreground/50">· Block {blockChainIndex + 1}</span>
                )}
              </div>
              <h2 className="text-lg font-bold text-foreground leading-tight">{currentPhase.name}</h2>
              {highlightedIds.phases.has(currentPhase.id) && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20">
                  <CheckCircle2 className="w-3 h-3" /> Updated
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <button onClick={() => onEditPhase(currentPhase)} className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline">
                <SlidersHorizontal className="w-3 h-3" />Refocus
              </button>
            </div>
          </div>

          {/* Metadata chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {currentPhase.emphasis && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-primary/15 border border-primary/25 text-primary px-2.5 py-1 rounded-full">
                <Zap className="w-3 h-3" />{currentPhase.emphasis}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-semibold bg-muted border border-border text-muted-foreground px-2.5 py-1 rounded-full">
              <Calendar className="w-3 h-3" />Week {currentWeekNumber} / {currentPhase.weekCount}
            </span>
            {system.weeklyFrequency && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-muted border border-border text-muted-foreground px-2.5 py-1 rounded-full">
                <Clock className="w-3 h-3" />{system.weeklyFrequency}×/wk
              </span>
            )}
            {system.equipmentAccess && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-muted border border-border text-muted-foreground px-2.5 py-1 rounded-full capitalize">
                <Dumbbell className="w-3 h-3" />{system.equipmentAccess}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Block progress</span>
              <span className="font-bold text-foreground">{blockPct}%</span>
            </div>
            <div className="h-2.5 bg-background/60 rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${blockPct}%` }}
              />
            </div>
            <div className="flex justify-between px-0.5">
              {Array.from({ length: currentPhase.weekCount }, (_, i) => {
                const wk = i + 1;
                const isActive = wk === currentWeekNumber;
                const isDone = wk < currentWeekNumber;
                return (
                  <span key={wk} className={`text-[9px] font-semibold transition-colors ${isActive ? "text-primary" : isDone ? "text-primary/40" : "text-muted-foreground/30"}`}>
                    W{wk}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Phase goal */}
          {currentPhase.goal && (
            <div className="mt-3 bg-background/50 rounded-lg px-3 py-2 border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Phase Goal</p>
              <p className="text-xs text-foreground leading-relaxed">{currentPhase.goal}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Block Adjustments — active modifiers from agent memory ── */}
      {activeModifiers.length > 0 && (
        <div className="rounded-xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Modifiers</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeModifiers.map((mod, i) => (
              <span key={i} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${mod.color}`}>
                {mod.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Progression Chain — timeline style ── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Progression Chain</h3>
        </div>
        <div className="px-4 pt-4 pb-3">
          {phases.map((phase: any, idx: number) => {
            const isCurrent = phase.status === "current";
            const isCompleted = phase.status === "completed";
            const isFuture = phase.status === "future";
            const phaseHL = highlightedIds.phases.has(phase.id);
            return (
              <div key={phase.id} className="relative">
                {idx < phases.length - 1 && (
                  <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border z-0" />
                )}
                <div className={`relative z-10 flex items-start gap-3 pb-4 transition-all duration-500`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border ${
                    isCurrent ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20" :
                    isCompleted ? "bg-green-500/15 text-green-400 border-green-500/30" :
                    "bg-muted/60 text-muted-foreground/40 border-border"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-sm font-semibold leading-tight ${
                        isCurrent ? "text-foreground" :
                        isCompleted ? "text-foreground/60" :
                        "text-muted-foreground/40"
                      }`}>{phase.name}</span>
                      {isCurrent && <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">Active</span>}
                      {isCompleted && <span className="text-[9px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full border border-green-400/20">Done</span>}
                      {phaseHL && <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full border border-purple-400/20">Updated</span>}
                    </div>
                    <p className={`text-[11px] leading-snug ${isCompleted || isFuture ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                      {phase.weekCount}wk · {phase.goal}
                    </p>
                  </div>
                  {isCurrent && (
                    <button onClick={() => onEditPhase(phase)} className="w-7 h-7 rounded-lg bg-muted/50 border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all duration-150 flex-shrink-0" title="Refocus this block">
                      <PenLine className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Ghost "next block" — always shown when active (no future phases) */}
          {!isBlockComplete && !hasFuturePhases && (
            <div className="relative">
              <div className="flex items-start gap-3 opacity-35">
                <div className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center flex-shrink-0">
                  <Plus className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-xs font-semibold text-muted-foreground">Next recommended block</p>
                  <p className="text-[10px] text-muted-foreground/50">Unlocks when this block completes</p>
                </div>
              </div>
            </div>
          )}

          {/* Next block label — shown when complete and recommendation exists */}
          {isBlockComplete && nextRec && (
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-dashed border-primary/40 flex items-center justify-center flex-shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-xs font-semibold text-primary">Next: {nextRec.displayName}</p>
                  <p className="text-[10px] text-muted-foreground italic leading-relaxed">{nextRec.rationale}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── System Overview — compact icon chips + programming logic ── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Overview</h3>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {[
            { Icon: Target,   label: "Goal",      value: system.overarchingGoal },
            { Icon: Calendar, label: "Frequency", value: `${system.weeklyFrequency} days/week` },
            { Icon: Layers,   label: "Style",     value: system.trainingStyle },
            { Icon: Dumbbell, label: "Equipment", value: system.equipmentAccess },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="bg-muted/40 rounded-xl p-3 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-md bg-background border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-xs font-semibold text-foreground leading-snug mt-0.5 capitalize">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Programming Logic — expandable */}
        {(currentPhase?.emphasis || currentPhase?.goal) && (
          <ProgrammingLogicCard phase={currentPhase} />
        )}

        {/* Constraints */}
        {system.constraints && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Active Constraints</p>
            </div>
            <p className="text-xs text-muted-foreground">{system.constraints}</p>
          </div>
        )}
      </div>

      {/* ── Coach Memory Insights ── */}
      <CoachMemoryInsights />

      {/* ── Modify Next Block Sheet ── */}
      {showModifySheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModifySheet(false)} />
          <div className="relative w-full max-w-lg mx-auto bg-card border border-border rounded-t-3xl sm:rounded-2xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5 sm:hidden" />
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Modify Next Block</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Choose a focus shift for your next training phase</p>
              </div>
              <button onClick={() => setShowModifySheet(false)} className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 mb-5">
              {MODIFY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedModifyOption(selectedModifyOption === opt.id ? null : opt.id)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${selectedModifyOption === opt.id ? "bg-primary/10 border-primary/40 text-foreground" : "bg-muted/30 border-border text-foreground/80 hover:bg-muted/50 hover:border-border/80"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {selectedModifyOption === opt.id && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={handleConfirmModify}
              disabled={isContinuing}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isContinuing ? (
                <><RotateCcw className="w-4 h-4 animate-spin" />Building your next block...</>
              ) : (
                <><ChevronRight className="w-4 h-4" />Start Next Block{selectedModifyOption ? " with this focus" : ""}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Repeat With Changes Sheet ── */}
      {showRepeatSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRepeatSheet(false)} />
          <div className="relative w-full max-w-lg mx-auto bg-card border border-border rounded-t-3xl sm:rounded-2xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5 sm:hidden" />
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Repeat With Changes</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Run the same block type with small adjustments</p>
              </div>
              <button onClick={() => setShowRepeatSheet(false)} className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              This starts another 4-week block of similar emphasis — useful if you want to keep building the same quality before moving to the next phase.
            </p>
            <div className="space-y-2 mb-5">
              {REPEAT_OPTIONS.map((opt) => {
                const isSelected = selectedRepeatOptions.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedRepeatOptions((prev) => isSelected ? prev.filter((id) => id !== opt.id) : [...prev, opt.id])}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${isSelected ? "bg-primary/10 border-primary/40 text-foreground" : "bg-muted/30 border-border text-foreground/80 hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{opt.label}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleConfirmRepeat}
              disabled={isContinuing}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isContinuing ? (
                <><RotateCcw className="w-4 h-4 animate-spin" />Building your next block...</>
              ) : (
                <><RotateCcw className="w-4 h-4" />Repeat This Block</>
              )}
            </button>
          </div>
        </div>
      )}

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

type VibeChip = { label: string; req?: string; intent?: CommandIntentKey; kind?: "chip" };

const FOCUS_VIBE_CHIPS: Record<FocusMode, VibeChip[]> = {
  strength: [
    { label: "More intense",   req: "Increase the overall intensity for this strength session" },
    { label: "Less volume",    intent: "reduce_volume" },
    { label: "Rest day",       intent: "convert_to_rest_day" },
    { label: "Shorter session",intent: "shorten_session" },
    { label: "Travel mode",    intent: "travel_mode" },
    { label: "More explosive", req: "Add explosive emphasis to today's strength training" },
  ],
  speed: [
    { label: "More acceleration", req: "Add acceleration focus to today's speed session" },
    { label: "More reactive",     req: "Make today's speed session more reactive and elastic" },
    { label: "Rest day",          intent: "convert_to_rest_day" },
    { label: "Shorter session",   intent: "shorten_session" },
    { label: "Travel mode",       intent: "travel_mode" },
    { label: "Less impact",       req: "Reduce the impact load in today's speed session" },
  ],
  mobility: [
    { label: "More hip focus",   req: "Shift today's mobility session toward hip mobility and end-range control" },
    { label: "More recovery",    req: "Make today's mobility session more recovery-focused" },
    { label: "Rest day",         intent: "convert_to_rest_day" },
    { label: "Shorter session",  intent: "shorten_session" },
    { label: "Lower intensity",  req: "Lower the intensity of today's mobility session" },
    { label: "More end-range",   req: "Emphasize end-range control in today's mobility session" },
  ],
};

interface VibeMutation {
  payload: string | StructuredEditPayload;
  kind?: "chip" | "typed" | "refine";
}

interface VibeBarProps {
  onEditComplete: (result: EditResult) => void;
  onUndone?: (changedIds: any) => void;
}

function VibeBar({ onEditComplete, onUndone }: VibeBarProps) {
  const { focusMode: vibeBarFocusMode } = useFocusMode();
  const VIBE_CHIPS = FOCUS_VIBE_CHIPS[vibeBarFocusMode] ?? FOCUS_VIBE_CHIPS.strength;
  const [input, setInput] = useState("");
  const [vibeState, setVibeState] = useState<VibeState>("idle");
  const [lastResult, setLastResult] = useState<EditResult | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const editMutation = useMutation({
    mutationFn: ({ payload }: VibeMutation) => submitGlobalEdit(payload, vibeBarFocusMode),
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

  function fire(payload: string | StructuredEditPayload) {
    if (editMutation.isPending || undoMutation.isPending) return;
    setInput("");
    setSubmitError(false);
    setVibeState("submitting");
    editMutation.mutate({ payload });
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
          {VIBE_CHIPS.map(({ label, req, intent }) => (
            <button
              key={label}
              onClick={() => fire(intent ? { intent, source: "quick_action" } : (req ?? label))}
              disabled={isWorking}
              className="flex-shrink-0 text-[11px] font-semibold bg-muted/50 text-muted-foreground border border-border rounded-full px-3 py-1 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Input row — idle / submitting */}
        {vibeState !== "result" && (
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 border border-border/80 px-3.5 py-3 focus-within:border-primary/60 focus-within:bg-muted/50 focus-within:shadow-[0_0_0_1px_rgba(var(--primary-rgb,99,102,241),0.15)] transition-all duration-150">
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
              placeholder={isWorking ? "Applying…" : "Command the system… e.g. protect my knee but keep intensity high"}
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

// ─── AgentPanel — Mobile bottom-sheet command surface ────────────────────────

type AgentScope = "today" | "week" | "block";
type AgentPanelPhase = "idle" | "preview" | "thinking" | "result";
type CommandTier = "primary" | "secondary" | "critical";
type CommandStrength = "subtle" | "moderate" | "aggressive";

const AGENT_SCOPE_LABELS: Record<AgentScope, string> = {
  today: "Today",
  week: "This Week",
  block: "Full Block",
};

interface AgentCommand {
  label: string;
  req: string;
  intent?: CommandIntentKey;
  tier: CommandTier;
  followUps?: Array<{ label: string; req: string }>;
}

const AGENT_COMMANDS: Record<AgentScope, AgentCommand[]> = {
  today: [
    {
      label: "More explosive",
      req: "Add explosive emphasis to today's training",
      tier: "primary",
      followUps: [
        { label: "Reduce volume to balance?", req: "Reduce volume in today's session to balance the explosive work" },
        { label: "Apply to next week too?", req: "Apply explosive focus to next week's sessions as well" },
      ],
    },
    {
      label: "More intense",
      req: "Increase the intensity for today's session",
      tier: "primary",
      followUps: [
        { label: "Reduce volume to compensate?", req: "Reduce volume in today's session to offset the higher intensity" },
      ],
    },
    {
      label: "Less volume",
      req: "Reduce the volume in today's session",
      intent: "reduce_volume" as CommandIntentKey,
      tier: "secondary",
      followUps: [
        { label: "Make tomorrow harder?", req: "Increase intensity in the next session to compensate" },
      ],
    },
    {
      label: "Shorter",
      req: "Shorten today's session — I'm pressed for time",
      intent: "shorten_session" as CommandIntentKey,
      tier: "secondary",
    },
    {
      label: "Travel mode",
      req: "I only have dumbbells — adapt today's session accordingly",
      intent: "travel_mode" as CommandIntentKey,
      tier: "secondary",
    },
    {
      label: "Rest day",
      req: "Convert today into a full recovery day",
      intent: "convert_to_rest_day" as CommandIntentKey,
      tier: "critical",
    },
  ],
  week: [
    {
      label: "More explosive",
      req: "Shift this week toward explosive focus",
      tier: "primary",
      followUps: [
        { label: "Reduce volume to match?", req: "Reduce total volume this week to balance the explosive focus" },
        { label: "Apply to next week?", req: "Apply explosive focus to next week as well" },
      ],
    },
    {
      label: "Recovery focus",
      req: "Shift this week toward recovery and reduce fatigue",
      intent: "recovery_focus" as CommandIntentKey,
      tier: "primary",
      followUps: [
        { label: "Also reduce intensity?", req: "Reduce intensity across this week's sessions" },
      ],
    },
    {
      label: "More intense",
      req: "Increase the overall intensity for this week",
      tier: "primary",
    },
    {
      label: "Less volume",
      req: "Reduce the total volume this week",
      intent: "reduce_volume" as CommandIntentKey,
      tier: "secondary",
    },
    {
      label: "Deload week",
      req: "Convert this into a deload week",
      tier: "secondary",
      followUps: [
        { label: "Extend deload next week?", req: "Extend the deload into next week as well" },
      ],
    },
    {
      label: "Travel mode",
      req: "I only have dumbbells this week — adapt accordingly",
      intent: "travel_mode" as CommandIntentKey,
      tier: "secondary",
    },
  ],
  block: [
    {
      label: "More power",
      req: "Shift this block toward power development",
      intent: "increase_power" as CommandIntentKey,
      tier: "primary",
      followUps: [
        { label: "Add field sport emphasis?", req: "Add field sport specificity on top of the power focus" },
      ],
    },
    {
      label: "Hypertrophy",
      req: "Shift this block toward hypertrophy",
      tier: "primary",
      followUps: [
        { label: "Increase volume to support it?", req: "Increase total volume across this block to support hypertrophy" },
      ],
    },
    {
      label: "Recovery bias",
      req: "Shift this block toward recovery and regeneration",
      intent: "recovery_focus" as CommandIntentKey,
      tier: "primary",
    },
    {
      label: "Less volume",
      req: "Reduce the overall volume across this block",
      intent: "reduce_volume" as CommandIntentKey,
      tier: "secondary",
    },
    {
      label: "Field sport",
      req: "Adapt this block for field sport specificity",
      tier: "secondary",
    },
    {
      label: "More variety",
      req: "Add more exercise variety across this block",
      tier: "secondary",
    },
  ],
};

const DEFAULT_THINKING = [
  "Reading your command…",
  "Analyzing movement patterns…",
  "Applying changes across your program…",
  "Calculating training impact…",
  "Rebuilding session structure…",
  "Syncing with your training system…",
];

const CONTEXTUAL_THINKING: Record<string, string[]> = {
  "More explosive": [
    "Shifting emphasis toward power output…",
    "Rebalancing speed and strength…",
    "Adjusting explosive progression across your program…",
  ],
  "More intense": [
    "Analyzing current load profile…",
    "Recalibrating intensity targets…",
    "Adjusting session difficulty…",
  ],
  "Recovery focus": [
    "Reducing fatigue load…",
    "Rebuilding this week for recovery…",
    "Protecting progression while lowering stress…",
  ],
  "Travel mode": [
    "Adapting your sessions for limited equipment…",
    "Replacing gym-dependent movements…",
    "Preserving intent with simpler tools…",
  ],
  "Less volume": [
    "Recalculating total load…",
    "Trimming excess volume…",
    "Preserving quality while reducing quantity…",
  ],
  "Rest day": [
    "Converting today to active recovery…",
    "Protecting your energy for the week ahead…",
    "Building in proper rest…",
  ],
  "Deload week": [
    "Restructuring this week for regeneration…",
    "Softening volume and intensity targets…",
    "Building your recovery week plan…",
  ],
  "More power": [
    "Shifting this block toward power development…",
    "Restructuring training emphasis…",
    "Adjusting exercise selection for power output…",
  ],
  "Hypertrophy": [
    "Shifting this block toward muscle development…",
    "Increasing time under tension targets…",
    "Restructuring rep ranges and volume…",
  ],
  "Recovery bias": [
    "Reducing accumulated fatigue across this block…",
    "Rebuilding for long-term recovery…",
    "Protecting future performance…",
  ],
  "Field sport": [
    "Adapting movements for field sport demand…",
    "Shifting emphasis to sport-specific patterns…",
    "Restructuring session intent…",
  ],
  "Shorter": [
    "Compressing today's session…",
    "Prioritizing the highest-value work…",
    "Cutting without losing the core intent…",
  ],
};

const MODIFIER_TO_MEMORY: Record<string, { type: "emphasis" | "constraint" | "bias"; value: string }> = {
  "More explosive": { type: "emphasis", value: "Explosive Focus" },
  "More intense": { type: "emphasis", value: "Intensity Focus" },
  "More power": { type: "emphasis", value: "Power Focus" },
  "Hypertrophy": { type: "emphasis", value: "Hypertrophy Focus" },
  "Field sport": { type: "emphasis", value: "Field Sport" },
  "Less volume": { type: "bias", value: "Volume Reduction" },
  "Recovery focus": { type: "bias", value: "Recovery Focus" },
  "Recovery bias": { type: "bias", value: "Recovery Bias" },
  "Deload week": { type: "bias", value: "Deload" },
  "Rest day": { type: "bias", value: "Rest Day" },
  "More variety": { type: "bias", value: "Variety Preference" },
  "Shorter": { type: "constraint", value: "Time Constraint" },
  "Travel mode": { type: "constraint", value: "Limited Equipment" },
};

const MEMORY_TAG_COLORS = {
  emphasis: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  constraint: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  bias: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

const VIBE_EXAMPLES = [
  "protect my knee but keep intensity high",
  "make this week more explosive",
  "shorten Friday to 30 min",
  "shift this block toward recovery",
];

function getImpactPreview(scope: AgentScope, label: string): { sessionsAffected: string; changes: string[] } {
  if (scope === "today") {
    if (label === "Rest day") {
      return {
        sessionsAffected: "Today's session",
        changes: [
          "Today will be converted to a full recovery day",
          "All exercises replaced with mobility and regeneration work",
        ],
      };
    }
    if (label === "Travel mode") {
      return {
        sessionsAffected: "Today's session",
        changes: [
          "Equipment-dependent exercises will be swapped",
          "Session rebuilt around bodyweight and dumbbells only",
        ],
      };
    }
    return {
      sessionsAffected: "Today's session",
      changes: [
        "Exercise selection and loading will be adjusted",
        "Session intent and targets will be updated",
      ],
    };
  }
  if (scope === "week") {
    if (label === "Deload week") {
      return {
        sessionsAffected: "All sessions this week",
        changes: [
          "Volume reduced by ~40% across all sessions",
          "Intensity targets softened for full recovery",
        ],
      };
    }
    if (label === "Travel mode") {
      return {
        sessionsAffected: "All sessions this week",
        changes: [
          "Equipment-dependent exercises swapped across all days",
          "Full week rebuilt around minimal equipment",
        ],
      };
    }
    return {
      sessionsAffected: "This week (3–5 sessions)",
      changes: [
        "Session targets and exercise selection will shift",
        "Weekly load distribution will be recalculated",
      ],
    };
  }
  return {
    sessionsAffected: "Full training block",
    changes: [
      "Phase structure and session targets will be restructured",
      "Progression curves adjusted across all weeks",
    ],
  };
}

interface AgentPanelProps {
  onEditComplete: (result: EditResult) => void;
  onUndone: (changedIds: any) => void;
}

function AgentPanel({ onEditComplete, onUndone }: AgentPanelProps) {
  const { focusMode: agentPanelFocusMode } = useFocusMode();
  const queryClient = useQueryClient();
  const [selectedScope, setSelectedScope] = useState<AgentScope>("today");
  const [phase, setPhase] = useState<AgentPanelPhase>("idle");
  const [pendingCommand, setPendingCommand] = useState<AgentCommand | null>(null);
  const [selectedStrength, setSelectedStrength] = useState<CommandStrength>("moderate");
  const [lastResult, setLastResult] = useState<EditResult | null>(null);
  const [lastCommand, setLastCommand] = useState<AgentCommand | null>(null);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [thinkingMessages, setThinkingMessages] = useState<string[]>(DEFAULT_THINKING);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const thinkingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: memoryData, refetch: refetchMemory } = useQuery({
    queryKey: ["agent-memory"],
    queryFn: fetchAgentMemory,
    staleTime: 30000,
    retry: false,
  });
  const agentMemory = memoryData?.agentMemory;

  const memoryMutation = useMutation({
    mutationFn: patchAgentMemory,
    onSuccess: () => { refetchMemory(); },
  });

  // Contextual thinking rotation
  useEffect(() => {
    if (phase === "thinking") {
      const msgs = pendingCommand ? (CONTEXTUAL_THINKING[pendingCommand.label] ?? DEFAULT_THINKING) : DEFAULT_THINKING;
      setThinkingMessages(msgs);
      setThinkingIdx(0);
      thinkingTimer.current = setInterval(() => {
        setThinkingIdx((i) => (i + 1) % msgs.length);
      }, 1800);
    } else {
      if (thinkingTimer.current) { clearInterval(thinkingTimer.current); thinkingTimer.current = null; }
    }
    return () => { if (thinkingTimer.current) clearInterval(thinkingTimer.current); };
  }, [phase, pendingCommand]);

  // Rotating input example
  useEffect(() => {
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % VIBE_EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  function buildTargetContext(scope: AgentScope): { type: string; id: number; label: string; parentLabel?: string } | undefined {
    if (scope === "block") {
      const block: any = queryClient.getQueryData(["training-system-block"]);
      const phase = block?.currentPhase;
      if (phase?.id) return { type: "phase", id: phase.id, label: phase.name ?? "Current Block" };
    }
    if (scope === "week") {
      const weeks: any = queryClient.getQueryData(["training-system-weeks"]);
      const weekNum = weeks?.currentWeekNumber ?? 1;
      const week: any = queryClient.getQueryData(["training-system-week", weekNum]);
      if (week?.id) return { type: "week", id: week.id, label: week.label ?? `Week ${weekNum}`, parentLabel: week.phase?.name };
    }
    if (scope === "today") {
      const today: any = queryClient.getQueryData(["training-system-today"]);
      if (today?.id) return { type: "session", id: today.id, label: today.label ?? "Today" };
    }
    return undefined;
  }

  const commandMutation = useMutation({
    mutationFn: ({ req, scope, intent }: { req: string; scope: AgentScope; intent?: CommandIntentKey }) =>
      submitQuickEdit(
        intent ? { intent, scope, source: "quick_action" } : req,
        buildTargetContext(scope),
        agentPanelFocusMode
      ),
    onSuccess: (data) => {
      setLastResult(data);
      setLastCommand(pendingCommand);
      setPhase("result");
      // Persist modifier to agent memory
      if (pendingCommand) {
        const memMapping = MODIFIER_TO_MEMORY[pendingCommand.label];
        if (memMapping) {
          const cur = agentMemory ?? { activeEmphases: [], activeConstraints: [], activeBiases: [], lastModifiers: [] };
          const newMod = { label: pendingCommand.label, scope: selectedScope, appliedAt: new Date().toISOString() };
          const lastModifiers = [newMod, ...(cur.lastModifiers ?? []).filter((m) => m.label !== pendingCommand.label)].slice(0, 5);
          const patch: Partial<AgentMemory> = { lastModifiers };
          if (memMapping.type === "emphasis") patch.activeEmphases = [...new Set([...(cur.activeEmphases ?? []), memMapping.value])];
          else if (memMapping.type === "constraint") patch.activeConstraints = [...new Set([...(cur.activeConstraints ?? []), memMapping.value])];
          else patch.activeBiases = [...new Set([...(cur.activeBiases ?? []), memMapping.value])];
          memoryMutation.mutate(patch);
        }
      }
      onEditComplete(data);
    },
    onError: () => { setPhase("idle"); setPendingCommand(null); },
  });

  const undoMutation = useMutation({
    mutationFn: (changeLogId: number) => restoreChange(changeLogId),
    onSuccess: (data) => {
      setUndoResult(data.changeSummary ?? "Your last change was reversed.");
      setIsUndoing(false);
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      if (data.changedIds) onUndone(data.changedIds);
      refetchMemory();
    },
    onError: () => setIsUndoing(false),
  });

  function handleCommandTap(cmd: AgentCommand) {
    if (commandMutation.isPending) return;
    setPendingCommand(cmd);
    setSelectedStrength("moderate");
    setPhase("preview");
  }

  function handleConfirm() {
    if (!pendingCommand) return;
    const strengthSuffix = selectedStrength === "moderate" ? "" : ` — ${selectedStrength} adjustment`;
    setPhase("thinking");
    commandMutation.mutate({
      req: pendingCommand.req + strengthSuffix,
      scope: selectedScope,
      intent: pendingCommand.intent,
    });
  }

  function handleCancel() { setPendingCommand(null); setPhase("idle"); }

  function handleFollowUp(req: string) {
    if (commandMutation.isPending) return;
    setLastResult(null); setLastCommand(null); setPendingCommand(null); setUndoResult(null);
    setPhase("thinking");
    commandMutation.mutate({ req, scope: selectedScope });
  }

  function handleUndo() {
    if (!lastResult?.changeLogId || isUndoing || undoMutation.isPending) return;
    setIsUndoing(true);
    undoMutation.mutate(lastResult.changeLogId);
  }

  function handleBackToIdle() {
    setPhase("idle"); setLastResult(null); setLastCommand(null);
    setPendingCommand(null); setUndoResult(null); setIsUndoing(false);
  }

  function handleScopeChange(scope: AgentScope) {
    setSelectedScope(scope);
    if (phase !== "thinking") {
      setPhase("idle"); setLastResult(null); setLastCommand(null);
      setPendingCommand(null); setUndoResult(null);
    }
  }

  function removeFromMemory(type: "emphasis" | "constraint" | "bias", value: string) {
    const cur = agentMemory ?? { activeEmphases: [], activeConstraints: [], activeBiases: [], lastModifiers: [] };
    const patch: Partial<AgentMemory> = {};
    if (type === "emphasis") patch.activeEmphases = (cur.activeEmphases ?? []).filter((e) => e !== value);
    else if (type === "constraint") patch.activeConstraints = (cur.activeConstraints ?? []).filter((e) => e !== value);
    else patch.activeBiases = (cur.activeBiases ?? []).filter((e) => e !== value);
    memoryMutation.mutate(patch);
  }

  const commands = AGENT_COMMANDS[selectedScope];
  const primaryCmds = commands.filter((c) => c.tier === "primary");
  const secondaryCmds = commands.filter((c) => c.tier === "secondary");
  const criticalCmds = commands.filter((c) => c.tier === "critical");
  const preview = pendingCommand ? getImpactPreview(selectedScope, pendingCommand.label) : null;

  const allMemoryTags = [
    ...(agentMemory?.activeEmphases ?? []).map((v) => ({ type: "emphasis" as const, value: v })),
    ...(agentMemory?.activeConstraints ?? []).map((v) => ({ type: "constraint" as const, value: v })),
    ...(agentMemory?.activeBiases ?? []).map((v) => ({ type: "bias" as const, value: v })),
  ];

  return (
    <div className="flex flex-col h-full">

      {/* ── System Memory HUD — persisted from DB ─────────────── */}
      {allMemoryTags.length > 0 && (
        <div className="px-4 pt-3 flex-shrink-0 space-y-1.5">
          {allMemoryTags.map((tag, i) => (
            <div key={i} className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-xl border ${MEMORY_TAG_COLORS[tag.type]}`}>
              <Zap className="w-3 h-3 flex-shrink-0" />
              <span className="truncate flex-1">{tag.value} Active</span>
              <button
                onClick={() => removeFromMemory(tag.type, tag.value)}
                disabled={memoryMutation.isPending}
                className="opacity-40 hover:opacity-80 transition-opacity flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Scope selector ──────────────────────────────────── */}
      {phase !== "thinking" && (
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 bg-muted/30 border border-border/40 rounded-xl p-1">
            {(["today", "week", "block"] as AgentScope[]).map((scope) => (
              <button
                key={scope}
                onClick={() => handleScopeChange(scope)}
                disabled={commandMutation.isPending}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all duration-150 disabled:cursor-not-allowed ${
                  selectedScope === scope
                    ? "bg-background text-foreground border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                }`}
              >
                {AGENT_SCOPE_LABELS[scope]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Phase: Idle — command list ───────────────────────── */}
      {phase === "idle" && (
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider pt-1 pb-2">
            Quick Commands
          </p>
          <div className="space-y-2">
            {primaryCmds.map((cmd) => (
              <button key={cmd.label} onClick={() => handleCommandTap(cmd)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 border border-primary/20 hover:bg-primary/15 hover:border-primary/40 active:scale-[0.99] transition-all duration-150">
                <Zap className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground flex-1 text-left">{cmd.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-primary/30 flex-shrink-0" />
              </button>
            ))}
          </div>
          {secondaryCmds.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {secondaryCmds.map((cmd) => (
                <button key={cmd.label} onClick={() => handleCommandTap(cmd)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99] transition-all duration-150">
                  <span className="text-sm font-medium text-foreground/80 flex-1 text-left">{cmd.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
          {criticalCmds.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {criticalCmds.map((cmd) => (
                <button key={cmd.label} onClick={() => handleCommandTap(cmd)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:border-red-500/40 hover:bg-red-500/8 active:scale-[0.99] transition-all duration-150">
                  <span className="text-sm font-medium text-red-400 flex-1 text-left">{cmd.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-red-400/30 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Phase: Preview — impact + strength selector ───────── */}
      {phase === "preview" && pendingCommand && preview && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3 pt-1">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">Impact Preview</p>

          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{pendingCommand.label}</p>
                <p className="text-[10px] text-muted-foreground">Apply to: {AGENT_SCOPE_LABELS[selectedScope]}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 border-t border-border/40 pt-2.5">
              <Target className="w-3 h-3 flex-shrink-0" />
              <span>{preview.sessionsAffected}</span>
            </div>
            <div className="space-y-1.5">
              {preview.changes.map((change, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground/80">
                  <span className="text-primary/60 font-bold flex-shrink-0 mt-px">•</span>
                  <span>{change}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Adjustment level */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">Adjustment Level</p>
            <div className="flex gap-1.5">
              {(["subtle", "moderate", "aggressive"] as CommandStrength[]).map((s) => (
                <button key={s} onClick={() => setSelectedStrength(s)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-semibold capitalize border transition-all duration-150 ${
                    selectedStrength === s
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-auto">
            <button onClick={handleCancel}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-all">
              Cancel
            </button>
            <button onClick={handleConfirm}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all">
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Thinking — contextual messages ─────────────── */}
      {phase === "thinking" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-sm font-bold text-foreground">{thinkingMessages[thinkingIdx]}</p>
            <p className="text-xs text-muted-foreground/60">Agent is adjusting your program…</p>
          </div>
        </div>
      )}

      {/* ── Phase: Result — diff + undo ─────────────────────── */}
      {phase === "result" && lastResult && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3 pt-2">
          {!undoResult ? (
            <>
              {/* Success header */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Applied</p>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed mt-0.5">{lastResult.changeSummary}</p>
                </div>
              </div>

              {/* Real diff card — built from actual mutation result */}
              {lastResult.diff && (() => {
                const d = lastResult.diff;
                const hasItems = d.changedExercises.length > 0 || d.changedSetsRepsRest.length > 0 || d.changedSessions > 0 || d.changedWeeks > 0;
                if (!hasItems) return null;
                return (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">What changed</p>
                    {d.changedExercises.slice(0, 4).map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] flex-wrap">
                        <span className="text-muted-foreground/40 flex-shrink-0">→</span>
                        <span className="text-muted-foreground/60 line-through">{e.from}</span>
                        <span className="text-foreground/80 font-medium">{e.to}</span>
                      </div>
                    ))}
                    {d.changedSetsRepsRest.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] flex-wrap">
                        <span className="text-muted-foreground/40 flex-shrink-0">→</span>
                        <span className="text-muted-foreground/60 truncate max-w-[5rem]">{p.label}:</span>
                        <span className="text-muted-foreground/50 line-through">{p.from}</span>
                        <span className="text-foreground/80 font-medium">{p.to}</span>
                      </div>
                    ))}
                    {d.changedSessions > 0 && (
                      <p className="text-[11px] text-muted-foreground/60">{d.changedSessions} session{d.changedSessions !== 1 ? "s" : ""} updated</p>
                    )}
                    {d.changedWeeks > 0 && (
                      <p className="text-[11px] text-muted-foreground/60">{d.changedWeeks} week{d.changedWeeks !== 1 ? "s" : ""} updated</p>
                    )}
                  </div>
                );
              })()}

              {/* Follow-up suggestions */}
              {lastCommand?.followUps && lastCommand.followUps.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">Next actions</p>
                  {lastCommand.followUps.map((fu) => (
                    <button key={fu.label} onClick={() => handleFollowUp(fu.req)}
                      disabled={commandMutation.isPending}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-40 text-left">
                      <ChevronRight className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
                      <span className="text-sm text-foreground/80">{fu.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Back + Undo */}
              <div className="flex items-center justify-between mt-auto pt-1">
                <button onClick={handleBackToIdle}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <ChevronLeft className="w-3 h-3" />
                  Back
                </button>
                {lastResult.changeLogId && (
                  <button onClick={handleUndo}
                    disabled={isUndoing || undoMutation.isPending}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-red-400 border border-border hover:border-red-400/30 hover:bg-red-400/5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40">
                    <RotateCcw className={`w-3 h-3 ${isUndoing ? "animate-spin" : ""}`} />
                    {isUndoing ? "Undoing…" : "Undo last action"}
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Undo success */
            <>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <RotateCcw className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Reverted</p>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed mt-0.5">{undoResult}</p>
                </div>
              </div>
              <button onClick={handleBackToIdle}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-auto">
                <ChevronLeft className="w-3 h-3" />
                Back to commands
              </button>
            </>
          )}
        </div>
      )}

      {/* ── VibeBar — primary control surface ────────────────── */}
      {phase !== "thinking" && (
        <div className="flex-shrink-0 border-t border-border bg-background/98">
          <VibeBar
            onEditComplete={(result) => {
              setLastResult(result);
              setLastCommand(null);
              setPendingCommand(null);
              setUndoResult(null);
              setPhase("result");
              onEditComplete(result);
            }}
            onUndone={onUndone}
          />
          <div className="pb-3 px-4">
            <p className="text-[10px] text-muted-foreground/35 text-center leading-relaxed">
              e.g. "{VIBE_EXAMPLES[exampleIdx]}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySystemState({
  onInitialize,
  isLoading,
  headline,
  subline,
  chatCtaLabel,
}: {
  onInitialize: () => void;
  isLoading: boolean;
  headline?: string;
  subline?: string;
  chatCtaLabel?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <Target className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-3">
        {headline ?? "No Training System Yet"}
      </h2>
      <p className="text-sm text-muted-foreground mb-2 max-w-xs leading-relaxed">
        {subline ?? (
          <>Ask your coach to build a program in Chat, then tap <strong>Save to My System</strong> to activate it here.</>
        )}
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
        {chatCtaLabel ?? "Build in Chat"}
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
  ai_edit: "Agent", quick_action: "Quick Command",
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

// ─── Session Controls Panel ────────────────────────────────────────────────────

interface SessionControlsPanelProps {
  readinessToday: any;
  sessionLoggedToday: boolean;
  sessionInProgress: boolean;
  userId?: string | number | null;
  onLogSession: () => void;
  onCheckIn: () => void;
  onStartSession: () => void;
  onEditComplete: (result: EditResult) => void;
}

type SessionStatus = "not_started" | "in_progress" | "completed";

function sessionStatusLabel(status: SessionStatus) {
  if (status === "completed") return { text: "Completed", color: "text-green-400", dot: "bg-green-400" };
  if (status === "in_progress") return { text: "In Progress", color: "text-amber-400", dot: "bg-amber-400" };
  return { text: "Not Started", color: "text-muted-foreground", dot: "bg-muted-foreground/40" };
}

function readinessDots(score: number | undefined, max = 5) {
  if (!score) return null;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < score ? "bg-primary/70" : "bg-muted-foreground/20"}`} />
      ))}
    </div>
  );
}

function energyLabel(score: number | undefined): string {
  if (!score) return "—";
  if (score <= 1) return "Empty";
  if (score <= 2) return "Low";
  if (score <= 3) return "Moderate";
  if (score <= 4) return "High";
  return "Peak";
}
function sorenessLabel(score: number | undefined): string {
  if (!score) return "—";
  if (score <= 1) return "None";
  if (score <= 2) return "Mild";
  if (score <= 3) return "Moderate";
  if (score <= 4) return "Significant";
  return "Severe";
}
function cnsLabel(energy: number | undefined, sleep: number | undefined): string {
  if (!energy && !sleep) return "—";
  const avg = ((energy ?? 3) + (sleep ?? 3)) / 2;
  if (avg >= 4.5) return "Peak";
  if (avg >= 3.5) return "Good";
  if (avg >= 2.5) return "Moderate";
  if (avg >= 1.5) return "Low";
  return "Very low";
}
function cnsScore(energy: number | undefined, sleep: number | undefined): number {
  if (!energy && !sleep) return 3;
  return Math.round(((energy ?? 3) + (sleep ?? 3)) / 2);
}
function suggestedAdjustment(soreness: number | undefined, energy: number | undefined, stress: number | undefined): string | null {
  if (!soreness && !energy && !stress) return null;
  const s = soreness ?? 1;
  const e = energy ?? 3;
  const st = stress ?? 1;
  if (s >= 4 || e <= 2) return "Consider reducing session volume today";
  if (st >= 4) return "Mental load is high — keep intensity manageable";
  if (s >= 3 && e <= 3) return "Moderate fatigue — focus on technique over load";
  if (e >= 5) return "Energy is peak — push intensity if programming allows";
  return null;
}

function modifierColor(type: "emphasis" | "constraint" | "bias") {
  if (type === "emphasis") return "bg-primary/10 border-primary/20 text-primary";
  if (type === "constraint") return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-blue-500/10 border-blue-500/20 text-blue-400";
}

function SessionControlsPanel({
  readinessToday,
  sessionLoggedToday,
  sessionInProgress,
  userId,
  onLogSession,
  onCheckIn,
  onStartSession,
  onEditComplete,
}: SessionControlsPanelProps) {
  const { focusMode: sessionControlsFocusMode } = useFocusMode();
  const queryClient = useQueryClient();
  const [cmdInput, setCmdInput] = useState("");
  const [cmdState, setCmdState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [cmdResult, setCmdResult] = useState<string | null>(null);

  const { data: today } = useQuery({
    queryKey: ["training-system-today", sessionControlsFocusMode],
    queryFn: () => fetchToday(sessionControlsFocusMode),
    retry: false,
    staleTime: 30000,
  });

  const { data: memData } = useQuery({
    queryKey: ["agent-memory"],
    queryFn: fetchAgentMemory,
    retry: false,
    staleTime: 30000,
  });
  const agentMemory = memData?.agentMemory;

  const editMutation = useMutation({
    mutationFn: (req: string) => submitGlobalEdit(req, sessionControlsFocusMode),
    onSuccess: (data) => {
      setCmdState("done");
      const first = data.changeSummary?.split(/\.\s/)[0]?.replace(/\.$/, "") ?? "Changes applied";
      setCmdResult(first);
      onEditComplete(data);
      queryClient.invalidateQueries({ queryKey: ["agent-memory"] });
    },
    onError: () => {
      setCmdState("error");
      setCmdResult("Something went wrong. Try again.");
    },
  });

  const sessionIntent = [today?.sessionType, today?.label, today?.emphasis].filter(Boolean).join(" ");

  function fireCmd(req: string, source: "quick" | "typed" = "typed") {
    if (!req.trim() || editMutation.isPending) return;
    if (source === "quick") {
      recordQuickCommandSelection({
        focusMode: sessionControlsFocusMode,
        commandLabel: req.trim(),
        blockType: "session",
        sessionIntent,
        userId,
      });
    }
    setCmdInput("");
    setCmdState("submitting");
    setCmdResult(null);
    editMutation.mutate(req.trim());
  }

  const sessionStatus: SessionStatus = sessionLoggedToday
    ? "completed"
    : sessionInProgress
    ? "in_progress"
    : "not_started";

  const statusInfo = sessionStatusLabel(sessionStatus);

  const allModifiers = [
    ...(agentMemory?.activeEmphases ?? []).map((v) => ({ type: "emphasis" as const, value: v })),
    ...(agentMemory?.activeConstraints ?? []).map((v) => ({ type: "constraint" as const, value: v })),
    ...(agentMemory?.activeBiases ?? []).map((v) => ({ type: "bias" as const, value: v })),
    ...(agentMemory?.lastModifiers ?? []).slice(0, 2).map((m) => ({ type: "bias" as const, value: m.label })),
  ].filter((m, i, arr) => arr.findIndex((x) => x.value === m.value) === i).slice(0, 6);

  const energyScore = readinessToday?.energyScore;
  const sleepScore = readinessToday?.sleepScore;
  const sorenessScore = readinessToday?.sorenessScore;
  const stressScore = readinessToday?.stressScore;
  const hasReadiness = !!(energyScore || sleepScore || sorenessScore);
  const adjustment = suggestedAdjustment(sorenessScore, energyScore, stressScore);
  const quickCommands = getQuickCommands({
    focusMode: sessionControlsFocusMode,
    blockType: "session",
    sessionIntent,
    currentContext: [
      today?.name,
      today?.title,
      today?.description,
      adjustment,
      sorenessScore ? `soreness ${sorenessLabel(sorenessScore)}` : "",
      energyScore ? `energy ${energyLabel(energyScore)}` : "",
      stressScore ? `stress ${stressScore}` : "",
    ].filter(Boolean).join(" "),
    activeModifiers: allModifiers.map((modifier) => modifier.value),
    userId,
    limit: 6,
  });

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Session Controls</p>

      {/* ── Session State Header ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate capitalize">
              {today?.sessionType ? `${today.sessionType} Session` : "Today's Session"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
            <span className={`text-[11px] font-semibold ${statusInfo.color}`}>{statusInfo.text}</span>
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          {/* Primary CTA */}
          {sessionStatus === "completed" ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <span className="text-xs font-bold text-green-400">Session logged today</span>
            </div>
          ) : sessionStatus === "in_progress" ? (
            <button
              onClick={onLogSession}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Log Session
            </button>
          ) : (
            <button
              onClick={onStartSession}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              Start Session
            </button>
          )}
          {/* Secondary CTAs */}
          <div className="flex gap-2">
            {sessionStatus === "in_progress" && (
              <button
                onClick={onLogSession}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
              >
                <CheckCircle2 className="w-3 h-3" />
                Log Session
              </button>
            )}
            <button
              onClick={onCheckIn}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-all ${
                readinessToday
                  ? "text-green-400 border-green-500/20 bg-green-500/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Activity className="w-3 h-3" />
              {readinessToday ? "Check-In ✓" : "Daily Check-In"}
            </button>
          </div>
        </div>
      </div>

      {/* ── System Status ── */}
      {hasReadiness && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">System Status</p>
          </div>
          <div className="px-4 py-3 space-y-2.5">
            {energyScore && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">Energy</span>
                {readinessDots(energyScore)}
                <span className="text-[11px] font-semibold text-foreground text-right flex-shrink-0">{energyLabel(energyScore)}</span>
              </div>
            )}
            {sorenessScore && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">Soreness</span>
                {readinessDots(sorenessScore)}
                <span className="text-[11px] font-semibold text-foreground text-right flex-shrink-0">{sorenessLabel(sorenessScore)}</span>
              </div>
            )}
            {(energyScore || sleepScore) && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground w-20 flex-shrink-0">CNS Ready</span>
                {readinessDots(cnsScore(energyScore, sleepScore))}
                <span className="text-[11px] font-semibold text-foreground text-right flex-shrink-0">{cnsLabel(energyScore, sleepScore)}</span>
              </div>
            )}
            {adjustment && (
              <div className="mt-1 pt-2.5 border-t border-border/60">
                <div className="flex items-start gap-2">
                  <Info className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400/90 leading-snug">{adjustment}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active Modifiers ── */}
      {allModifiers.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Modifiers</p>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-1.5">
            {allModifiers.map((m, i) => (
              <span
                key={i}
                className={`inline-flex items-center text-[11px] font-semibold rounded-full border px-2.5 py-1 ${modifierColor(m.type)}`}
              >
                {m.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Command Input ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Command Agent</p>
        </div>
        <div className="px-4 py-3 space-y-2">
          {/* Quick command chips */}
          <div className="flex flex-wrap gap-1.5">
            {quickCommands.map((q) => (
              <button
                key={q}
                onClick={() => fireCmd(q, "quick")}
                disabled={editMutation.isPending}
                className="text-[10px] font-semibold bg-muted/50 text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
          {/* Free-text input */}
          <div className="flex gap-2">
            <input
              value={cmdInput}
              onChange={(e) => { setCmdInput(e.target.value); if (cmdState !== "idle") setCmdState("idle"); }}
              onKeyDown={(e) => e.key === "Enter" && fireCmd(cmdInput)}
              placeholder="Adjust today's session..."
              disabled={editMutation.isPending}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all disabled:opacity-50"
            />
            <button
              onClick={() => fireCmd(cmdInput)}
              disabled={!cmdInput.trim() || editMutation.isPending}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
            >
              {editMutation.isPending ? (
                <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
            </button>
          </div>
          {/* Feedback message */}
          {cmdState === "done" && cmdResult && (
            <div className="flex items-start gap-2 rounded-lg bg-green-500/8 border border-green-500/15 px-3 py-2">
              <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-green-400 leading-snug">{cmdResult}</p>
            </div>
          )}
          {cmdState === "error" && cmdResult && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/8 border border-red-500/15 px-3 py-2">
              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400 leading-snug">{cmdResult}</p>
            </div>
          )}
        </div>
      </div>
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [, setLocation] = useLocation();
  const logout = useLogout();

  // ── Focus mode — context-provided single source of truth ──────────────────
  // MUST be declared before activeSystem (which depends on focusMode for its query key)
  const { focusMode, setFocusMode } = useFocusMode();
  const focusConfig: FocusModeConfig = FOCUS_MODE_CONFIGS[focusMode];

  // ── Active system — focus-aware, must be declared BEFORE any hook that reads it ──
  // Previously this was declared AFTER activeSessionData, causing a TDZ crash:
  // "Cannot access 'activeSystem' before initialization"
  const { data: activeSystem, isLoading: systemLoading } = useQuery({
    queryKey: ["training-system-active", focusMode],
    queryFn: () => fetchActiveSystem(focusMode),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Safe focus-aware selector — single shared lookup, never duplicated inline
  const activeSystemResolved = activeSystem ?? null;

  // Audit log: emitted after activeSystem resolves so values are trustworthy
  console.log("[FocusProgramInitAudit]", {
    currentFocus: focusMode,
    activeProgramByFocusReady: !systemLoading,
    activeSystemResolved: !!activeSystemResolved,
    activeSystemId: activeSystemResolved?.id ?? null,
    emptyStateShown: !systemLoading && !activeSystemResolved,
  });

  // ── Real session lifecycle — server-backed active session ─────────────────
  // activeSystem is now declared above — safe to reference in `enabled`
  interface ActiveSessionData {
    id?: number;
    status: "not_started" | "in_progress" | "completed";
    startedAt?: string;
    completedAt?: string;
  }

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery<ActiveSessionData>({
    queryKey: ["active-session", focusMode],
    queryFn: () => customFetch<ActiveSessionData>(`/api/active-session?focus=${encodeURIComponent(focusMode)}`),
    enabled: !!activeSystemResolved,
    staleTime: 0,
  });

  const serverSessionStatus = activeSessionData?.status ?? "not_started";
  const sessionLoggedToday = serverSessionStatus === "completed";
  const sessionInProgress = serverSessionStatus === "in_progress";

  // ── Unified start-session handler: persists to backend ───────────────────
  async function handleStartSession() {
    try {
      await customFetch("/api/active-session/start", {
        method: "POST",
        body: JSON.stringify({ focusMode }),
        headers: { "Content-Type": "application/json" },
      });
      refetchActiveSession();
      queryClient.invalidateQueries({ queryKey: ["active-session", focusMode] });
    } catch {
      // Non-fatal — UI still usable
    }
    // Fire-and-forget: backend posts session-start ack to chat
    customFetch("/api/training-system/session-start", { method: "POST" }).catch(() => {});
  }

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
      await queryClient.refetchQueries({ queryKey: ["training-system-active", focusMode] });
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

  async function handleDeleteProgram(id: number) {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await customFetch<{ success: boolean; wasActive: boolean; newActiveSystemId: number | null }>(
        `/api/training-system/${id}`,
        { method: "DELETE" }
      );
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    } catch (err) {
      console.error("[DeleteProgram] Failed:", err);
      if (deleteErrorTimeoutRef.current) clearTimeout(deleteErrorTimeoutRef.current);
      setDeleteError("Couldn't delete that program. Please try again.");
      deleteErrorTimeoutRef.current = setTimeout(() => setDeleteError(null), 5000);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
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
    enabled: !!activeSystemResolved,
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

    // 4b. Invalidate the chat conversation that received the edit acknowledgment
    //     so it loads immediately when the user switches back to Coach.
    if (result.chatConversationId) {
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(result.chatConversationId) });
    }

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
  const rawName = me?.name ?? "Athlete";
  const isAnonymousUser = !!(me as any)?.isAnonymous || rawName === "Anonymous";
  const userName = isAnonymousUser
    ? (activeSystem?.name ? activeSystem.name.split(" ").slice(0, 4).join(" ") : "Your Workspace")
    : rawName;
  const initials = isAnonymousUser ? "TC" : rawName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

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
          onClick={() => {
            const nextOpen = !showProgramLibrary;
            console.log("[FocusSidebarNavAudit]", {
              clickedItem: "saved_programs",
              currentFocus: focusMode,
              targetProgramFound: !!activeSystemResolved,
              activeProgramId: activeSystemResolved?.id ?? null,
              savedProgramCount: programLibrary.length,
              safeRouteUsed: true,
            });
            setShowProgramLibrary(nextOpen);
          }}
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
            <p className="text-[11px] text-muted-foreground/60">
              No {focusConfig.shortLabel} programs saved yet
            </p>
          </div>
        )}
        {showProgramLibrary && programLibrary.length > 0 && (
          <div className="ml-2 space-y-0.5 mb-1">
            {(programLibrary as any[]).map((prog) => (
              <div key={prog.id} className="group relative">
                <button
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
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 pr-8 rounded-lg text-left transition-all ${
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
                {/* Delete icon — visible on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm({ id: prog.id, name: prog.name });
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-destructive hover:bg-destructive/10 transition-all"
                  title="Delete program"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!isAnonymousUser && (
          <>
            <div className="my-3 h-px bg-border" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Account</p>
            <button
              onClick={() => { setLocation("/billing"); setMobilePanel(null); }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
            >
              <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span>Settings</span>
            </button>
          </>
        )}
      </div>

      {/* Account actions */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        {isAnonymousUser ? (
          <>
            <button
              onClick={() => { setLocation("/register"); setMobilePanel(null); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-primary hover:bg-primary/5 active:bg-primary/10 transition-all text-left"
            >
              <UserPlus className="w-4 h-4 flex-shrink-0" />
              <span>Create Account</span>
            </button>
            <button
              onClick={() => {
                logout.mutate(undefined, {
                  onSuccess: () => {
                    queryClient.clear();
                    clearAuthState();
                    setLocation("/chat");
                  },
                });
              }}
              disabled={logout.isPending}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all text-left"
            >
              <RotateCcw className="w-4 h-4 flex-shrink-0" />
              <span>Start Fresh</span>
            </button>
          </>
        ) : (
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        )}
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
      <div className="h-px bg-border my-2" />
      <SessionControlsPanel
        readinessToday={readinessToday}
        sessionLoggedToday={sessionLoggedToday}
        sessionInProgress={sessionInProgress}
        userId={me?.id}
        onLogSession={() => { setFeedbackSessionLabel(undefined); setShowSessionFeedback(true); setMobilePanel(null); }}
        onCheckIn={() => { setShowReadinessCheckIn(true); setMobilePanel(null); }}
        onStartSession={handleStartSession}
        onEditComplete={(result) => { handleGlobalEditComplete(result); setMobilePanel(null); }}
      />
    </div>
  );

  const bottomPanelContent = hasSystem ? (
    <AgentPanel
      onEditComplete={(result) => { handleGlobalEditComplete(result); setMobilePanel(null); }}
      onUndone={handleRestored}
    />
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
        <TopNav userName={userName} isAnonymous={isAnonymousUser} />
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
              ? `${activeSystem?.name ?? "Your Program"} — Structured training, built for you`
              : "Your personalized training operating system"}
          </p>

          {/* Focus Selector */}
          <div className="mt-4 flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
            {(["strength", "speed", "mobility"] as FocusMode[]).map((mode) => {
              const cfg = FOCUS_MODE_CONFIGS[mode];
              const isActive = focusMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setFocusMode(mode)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cfg.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Mobile focus selector (mobile only) ─── */}
      <div className="md:hidden flex-shrink-0 border-b border-border bg-background px-3 py-2.5">
        <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {(["strength", "speed", "mobility"] as FocusMode[]).map((mode) => {
            const cfg = FOCUS_MODE_CONFIGS[mode];
            const isActive = focusMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setFocusMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cfg.shortLabel}
              </button>
            );
          })}
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
              headline={focusConfig.emptyStateHeadline}
              subline={focusConfig.emptyStateSubline}
              chatCtaLabel={`Build ${focusConfig.shortLabel} Program`}
            />
          ) : (
            <>
              {activeTab === "today" && (
                <div className="space-y-4">
                  {/* Readiness logged today — compact status badge */}
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

                  {/* Today's session — action-first, with inline CTAs */}
                  <TodayView
                    highlightedIds={highlightedIds}
                    onEditExercise={openExerciseEdit}
                    onEditSession={openSessionEdit}
                    onQuickEditComplete={handleEditComplete}
                    onLogSession={() => { setFeedbackSessionLabel(undefined); setShowSessionFeedback(true); }}
                    onCheckIn={() => setShowReadinessCheckIn(true)}
                    onStartSession={handleStartSession}
                    sessionLoggedToday={sessionLoggedToday}
                    sessionInProgress={sessionInProgress}
                    checkedInToday={!!readinessToday}
                  />
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

      {/* ─── Session Action Bar (Today tab only — persistent CTA above agent bar) ─── */}
      {hasSystem && activeTab === "today" && (
        <div className="flex-shrink-0 border-t border-border bg-background/98 backdrop-blur-sm px-4 py-3 flex items-center gap-2.5">
          {/* Check In — only show if not yet done today */}
          {!readinessToday && (
            <button
              onClick={() => setShowReadinessCheckIn(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex-shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              Check In
            </button>
          )}
          {/* Primary session CTA — state-driven: not_started → in_progress → completed */}
          {sessionLoggedToday ? (
            <div className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-bold text-green-400">Session logged today</span>
            </div>
          ) : sessionInProgress ? (
            <button
              onClick={() => { setFeedbackSessionLabel(undefined); setShowSessionFeedback(true); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground/80 animate-pulse flex-shrink-0" />
              Resume / Log Session
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              Start Session
            </button>
          )}
        </div>
      )}

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
              <span className="flex-1 text-left text-sm text-muted-foreground/60">Command the agent…</span>
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

      {/* ─── Delete Confirmation Modal ─── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteConfirm(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-[#0c1220] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/40 to-transparent rounded-t-2xl" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Delete program?</h3>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  <span className="font-medium text-foreground/80">"{deleteConfirm.name}"</span>
                  {" "}and all its versions will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-[11px] text-destructive mb-3">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:bg-muted/40 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProgram(deleteConfirm.id)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-destructive/90 text-white hover:bg-destructive active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Contextual edit drawer ─── */}
      {editTarget && (
        <EditDrawer
          target={editTarget}
          prefillRequest={editPrefill}
          exerciseContext={editTarget.type === "exercise" ? editExerciseContext : undefined}
          focusMode={focusMode}
          userId={me?.id}
          uiContext={{
            page: "system",
            focusMode,
            activeProgramId: activeSystem?.id ?? null,
            activeProgramName: activeSystem?.name ?? null,
            selectedExerciseName: editTarget.type === "exercise" ? editTarget.label : undefined,
            selectedSessionName: editTarget.type === "session" ? editTarget.label : undefined,
          }}
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
          onViewProgram={(exerciseIds) => {
            setHighlightedIds({
              exercises: new Set(exerciseIds),
              sessions: new Set(),
              weeks: new Set(),
              phases: new Set(),
            });
            setChangeDetailId(null);
            setActiveTab("today");
            setTimeout(() => {
              setHighlightedIds({ exercises: new Set(), sessions: new Set(), weeks: new Set(), phases: new Set() });
            }, 3000);
          }}
        />
      )}

      {/* ─── Daily readiness check-in modal ─── */}
      {showReadinessCheckIn && (
        <ReadinessCheckIn
          onClose={() => setShowReadinessCheckIn(false)}
          onSubmitted={(adaptation) => {
            refetchReadiness();
            // Always invalidate all system queries — readiness affects today's plan regardless
            queryClient.invalidateQueries({ queryKey: ["insights"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
            queryClient.invalidateQueries({ queryKey: ["agent-memory"] });
          }}
        />
      )}

      {/* ─── Post-session feedback modal ─── */}
      {showSessionFeedback && (
        <SessionFeedback
          sessionLabel={feedbackSessionLabel}
          onClose={() => setShowSessionFeedback(false)}
          onSubmitted={() => {
            // Mark session as completed on the server, then refresh all related queries
            customFetch("/api/active-session/complete", {
              method: "POST",
              body: JSON.stringify({ focusMode }),
              headers: { "Content-Type": "application/json" },
            })
              .then(() => queryClient.invalidateQueries({ queryKey: ["active-session", focusMode] }))
              .catch(() => {});
            queryClient.invalidateQueries({ queryKey: ["insights"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-weeks"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
            queryClient.invalidateQueries({ queryKey: ["training-system-block-completion", focusMode] });
            queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
            queryClient.invalidateQueries({ queryKey: ["agent-memory"] });
            // Delayed re-invalidation: allows server-side auto-advance to complete first
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-weeks"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-block-completion", focusMode] });
              queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
            }, 2500);
          }}
        />
      )}
    </MobileSlideLayout>
  );
}
