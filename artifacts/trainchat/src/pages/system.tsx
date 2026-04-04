/**
 * Your System — Phase 3
 *
 * Full interactive training workspace. Every entity (exercise, session, week,
 * phase) has contextual "Edit with AI" entry points that pass explicit object
 * context to the Phase 2 editing engine. Changes are highlighted in-place and
 * a lightweight session edit history is maintained.
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
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import TopNav from "@/components/layout/TopNav";
import EditDrawer, {
  type EditTarget,
  type EditResult,
  type ChangedIds,
} from "@/components/training/EditDrawer";

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchActiveSystem() {
  return customFetch<any>("/api/training-system/active");
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
}

function ExerciseCard({ exercise, index, sessionLabel, highlightedIds, onEdit }: ExerciseCardProps) {
  const highlight = useHighlightClass(exercise.id, highlightedIds);
  const categoryColors: Record<string, string> = {
    warmup: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    primary: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    accessory: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    conditioning: "bg-green-500/10 text-green-400 border-green-500/20",
    finisher: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const categoryLabel: Record<string, string> = {
    warmup: "Warm-up",
    primary: "Primary",
    accessory: "Accessory",
    conditioning: "Conditioning",
    finisher: "Finisher",
  };
  const colorClass = categoryColors[exercise.category] ?? categoryColors.primary;

  return (
    <div
      className={`group flex items-start gap-4 py-4 border-b border-border last:border-0 rounded-lg transition-all duration-500 ${highlight}`}
    >
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0 mt-0.5">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
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
      </div>
      {/* Edit button */}
      <button
        onClick={() => onEdit(exercise, sessionLabel)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 w-8 h-8 rounded-lg bg-muted/60 border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all duration-150 mt-0.5"
        title={`Edit ${exercise.name} with AI`}
      >
        <PenLine className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Today View ───────────────────────────────────────────────────────────────

interface TodayViewProps {
  highlightedIds: HighlightedIds;
  onEditExercise: (exercise: any, sessionLabel: string) => void;
  onEditSession: (session: any, weekLabel?: string) => void;
}

function TodayView({ highlightedIds, onEditExercise, onEditSession }: TodayViewProps) {
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
            <span className="text-xs text-muted-foreground">Tap pencil to edit any exercise</span>
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
}

function WeekView({ highlightedIds, onEditExercise, onEditSession, onEditWeek }: WeekViewProps) {
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
        {week.sessions?.map((session: any, idx: number) => {
          const isToday = session.dayOfWeek === todayDow;
          const sessionHighlight = highlightedIds.sessions.has(session.id)
            ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
            : "";

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
                    {session.exercises.slice(0, 3).map((ex: any, exIdx: number) => (
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
                      <p className="text-xs text-muted-foreground pl-8">+{session.exercises.length - 3} more exercises</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
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

// ─── Change Summary Banner ────────────────────────────────────────────────────

interface ChangeSummaryBannerProps {
  result: { changeSummary: string; scope: string; appliedCount: number };
  onDismiss: () => void;
}

function ChangeSummaryBanner({ result, onDismiss }: ChangeSummaryBannerProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 10000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const scopeLabel: Record<string, string> = {
    exercise: "Exercise", session: "Session", week: "This Week", block: "Block", system: "Program",
  };

  return (
    <div className="flex-shrink-0 border-b border-green-500/20 bg-green-500/5 px-4 py-3">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider">System Updated</span>
              <span className="text-[10px] font-semibold text-green-400/70 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                {scopeLabel[result.scope] ?? result.scope}
              </span>
              {result.appliedCount > 0 && (
                <span className="text-[10px] text-green-400/60">{result.appliedCount} change{result.appliedCount !== 1 ? "s" : ""} applied</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.changeSummary}</p>
          </div>
          <button onClick={onDismiss} className="text-muted-foreground/40 hover:text-muted-foreground text-xs flex-shrink-0 ml-1">✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── Global Edit Panel ────────────────────────────────────────────────────────

const GLOBAL_SUGGESTIONS = [
  "Reduce volume this week — I'm beat up",
  "Swap barbell bench for dumbbell bench",
  "Make today a recovery day",
  "I only have dumbbells this week",
  "Make this block more explosive",
  "Lower the intensity overall",
];

interface GlobalEditPanelProps {
  onEditComplete: (result: EditResult) => void;
}

function GlobalEditPanel({ onEditComplete }: GlobalEditPanelProps) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editMutation = useMutation({
    mutationFn: (req: string) => submitGlobalEdit(req),
    onSuccess: (data) => {
      onEditComplete(data);
      setInput("");
      setIsExpanded(false);
    },
  });

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || editMutation.isPending) return;
    editMutation.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur-sm flex-shrink-0">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <button
          onClick={() => { setIsExpanded(!isExpanded); setTimeout(() => textareaRef.current?.focus(), 100); }}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground flex-1">
            Ask your coach to edit your system
          </span>
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>

        {isExpanded && (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {GLOBAL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 50); }}
                  className="flex-shrink-0 text-xs bg-muted/60 text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:text-foreground hover:border-primary/40 transition-all duration-150"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='e.g. "Swap barbell bench for dumbbell bench" or "Reduce volume this week"'
                rows={2}
                disabled={editMutation.isPending}
                className="flex-1 bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:border-primary/50 focus:bg-muted/60 transition-all duration-150 disabled:opacity-50"
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || editMutation.isPending}
                className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed self-end"
              >
                {editMutation.isPending ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {editMutation.isError && <p className="text-xs text-red-400">Something went wrong. Please try again.</p>}
          </div>
        )}

        {!isExpanded && (
          <div className="flex items-center gap-2 cursor-text" onClick={() => setIsExpanded(true)}>
            <div className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-2.5 text-xs text-muted-foreground/50">
              e.g. "Reduce volume this week" or "Swap bench for dumbbells"…
            </div>
            <div className="w-9 h-9 rounded-xl bg-muted/40 border border-border flex items-center justify-center flex-shrink-0">
              <Send className="w-3.5 h-3.5 text-muted-foreground/50" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySystemState({ onInitialize, isLoading }: { onInitialize: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <Target className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-3">No Training System Yet</h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs leading-relaxed">
        Build your personalized training system based on your profile. Structured, persistent, and ready to evolve with you.
      </p>
      <button
        onClick={onInitialize}
        disabled={isLoading}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
      >
        {isLoading ? (
          <><RotateCcw className="w-4 h-4 animate-spin" />Building your system…</>
        ) : (
          <><Zap className="w-4 h-4" />Build My Training System</>
        )}
      </button>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "today", label: "Today", icon: Zap },
  { id: "week", label: "This Week", icon: Calendar },
  { id: "block", label: "Block", icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);
  const [recentEdits, setRecentEdits] = useState<EditRecord[]>([]);
  const [lastEditResult, setLastEditResult] = useState<{ changeSummary: string; scope: string; appliedCount: number } | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<HighlightedIds>({
    exercises: new Set(),
    sessions: new Set(),
    weeks: new Set(),
    phases: new Set(),
  });

  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const { data: activeSystem, isLoading: systemLoading } = useQuery({
    queryKey: ["training-system-active"],
    queryFn: fetchActiveSystem,
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

    // 2. Set change summary banner
    setLastEditResult({
      changeSummary: result.changeSummary,
      scope: result.scope,
      appliedCount: result.appliedCount,
    });

    // 3. Apply highlights for changed entities
    const ids = result.changedIds ?? { exercises: [], sessions: [], weeks: [], phases: [] };
    setHighlightedIds({
      exercises: new Set(ids.exercises),
      sessions: new Set(ids.sessions),
      weeks: new Set(ids.weeks),
      phases: new Set(ids.phases),
    });

    // 4. Clear highlights after 5 seconds
    setTimeout(() => {
      setHighlightedIds({ exercises: new Set(), sessions: new Set(), weeks: new Set(), phases: new Set() });
    }, 5000);

    // 5. Refresh data
    queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    queryClient.invalidateQueries({ queryKey: ["training-system-block"] });

    // 6. Switch to most relevant tab
    const scope = result.scope;
    if (scope === "exercise" || scope === "session") setActiveTab("today");
    else if (scope === "week") setActiveTab("week");
    else if (scope === "block") setActiveTab("block");
  }, [editTarget, queryClient]);

  // ── Global edit panel completion ──
  function handleGlobalEditComplete(result: EditResult) {
    handleEditComplete(result);
  }

  const hasSystem = !!activeSystem;
  const userName = me?.name ?? "Athlete";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopNav userName={userName} />

      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-border bg-background flex-shrink-0">
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

      {/* Change summary banner */}
      {lastEditResult && (
        <ChangeSummaryBanner
          result={lastEditResult}
          onDismiss={() => setLastEditResult(null)}
        />
      )}

      {/* Tabs */}
      {hasSystem && (
        <div className="flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-sm">
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

      {/* Session edit history */}
      {hasSystem && recentEdits.length > 0 && (
        <RecentEditsBar edits={recentEdits} />
      )}

      {/* Content area */}
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
                <TodayView
                  highlightedIds={highlightedIds}
                  onEditExercise={openExerciseEdit}
                  onEditSession={openSessionEdit}
                />
              )}
              {activeTab === "week" && (
                <WeekView
                  highlightedIds={highlightedIds}
                  onEditExercise={openExerciseEdit}
                  onEditSession={openSessionEdit}
                  onEditWeek={openWeekEdit}
                />
              )}
              {activeTab === "block" && (
                <BlockView
                  highlightedIds={highlightedIds}
                  onEditPhase={openPhaseEdit}
                  onEditWeek={openWeekEdit}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Global edit panel */}
      {hasSystem && (
        <GlobalEditPanel onEditComplete={handleGlobalEditComplete} />
      )}

      {/* Contextual edit drawer */}
      {editTarget && (
        <EditDrawer
          target={editTarget}
          prefillRequest={editPrefill}
          onClose={() => setEditTarget(null)}
          onEditComplete={handleEditComplete}
        />
      )}
    </div>
  );
}
