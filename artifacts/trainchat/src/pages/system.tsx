import { useState } from "react";
import { useLocation } from "wouter";
import {
  Target,
  Calendar,
  BarChart3,
  Dumbbell,
  ChevronRight,
  Clock,
  Zap,
  Layers,
  TrendingUp,
  Activity,
  RotateCcw,
  Info,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import TopNav from "@/components/layout/TopNav";

// ─── API fetch helpers ───────────────────────────────────────────────────────

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

// ─── Sub-components ──────────────────────────────────────────────────────────

function ExerciseCard({ exercise, index }: { exercise: any; index: number }) {
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
    <div className="flex items-start gap-4 py-4 border-b border-border last:border-0">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0 mt-0.5">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="font-semibold text-sm text-foreground">{exercise.name}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
            {categoryLabel[exercise.category] ?? exercise.category}
          </span>
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
          <p className="text-xs text-muted-foreground mt-1.5 italic">{exercise.notes}</p>
        )}
      </div>
    </div>
  );
}

function TodayView() {
  const { data: today, isLoading, error } = useQuery({
    queryKey: ["training-system-today"],
    queryFn: fetchToday,
    retry: false,
  });

  if (isLoading) {
    return <ViewSkeleton />;
  }

  if (error || !today) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Activity className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm">No session data available for today.</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Initialize your system to get started.</p>
      </div>
    );
  }

  const dayOfWeekLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const primaryExercises = today.exercises?.filter((e: any) => e.category === "primary") ?? [];
  const otherExercises = today.exercises?.filter((e: any) => e.category !== "primary") ?? [];

  return (
    <div className="space-y-5">
      {/* Session Header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">{dayOfWeekLabel}'s Session</p>
            <h2 className="text-xl font-bold text-foreground leading-tight">{today.label}</h2>
            {today.emphasis && (
              <p className="text-sm text-muted-foreground mt-1">{today.emphasis}</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-5 h-5 text-primary" />
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

      {/* Warm-up */}
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

      {/* Exercises */}
      {today.exercises?.length > 0 && (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <h3 className="text-sm font-bold text-foreground">Exercise Plan</h3>
          </div>
          <div className="px-5">
            {today.exercises.map((exercise: any, index: number) => (
              <ExerciseCard key={exercise.id} exercise={exercise} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Coaching notes */}
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

function WeekView() {
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

  return (
    <div className="space-y-5">
      {/* Week header */}
      <div className="rounded-2xl bg-gradient-to-br from-card to-muted/30 border border-border p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {week.phase?.name ?? "Current Block"}
            </p>
            <h2 className="text-lg font-bold text-foreground">{week.label ?? `Week ${week.weekNumber}`}</h2>
            {week.focus && <p className="text-sm text-muted-foreground mt-1">{week.focus}</p>}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${volumeColor}`}>
            {week.volumeLevel}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Week {week.weekNumber} of {week.phase?.weekCount ?? 4}</span>
          </div>
          {week.sessions?.length > 0 && (
            <div className="flex items-center gap-1.5 bg-background/60 rounded-lg px-3 py-1.5 border border-border">
              <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{week.sessions.filter((s: any) => !s.isRestDay).length} training sessions</span>
            </div>
          )}
        </div>
      </div>

      {/* Session cards */}
      <div className="space-y-3">
        {week.sessions?.map((session: any, idx: number) => {
          const isToday = session.dayOfWeek === todayDow;
          return (
            <div
              key={session.id}
              className={`rounded-xl border overflow-hidden transition-all ${
                isToday
                  ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${
                    isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    <span className="text-[9px] font-bold uppercase leading-none">
                      {session.dayOfWeek != null ? dayNames[session.dayOfWeek] : `D${idx + 1}`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{session.label}</span>
                      {isToday && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex-shrink-0">
                          Today
                        </span>
                      )}
                    </div>
                    {session.emphasis && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{session.emphasis}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {session.exercises?.length > 0 && (
                    <span className="text-xs text-muted-foreground">{session.exercises.length} ex</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                </div>
              </div>

              {/* Exercise preview */}
              {session.exercises?.length > 0 && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <div className="space-y-2">
                    {session.exercises.slice(0, 3).map((ex: any, exIdx: number) => (
                      <div key={ex.id} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                          {exIdx + 1}
                        </div>
                        <span className="text-xs text-foreground/80 flex-1 truncate">{ex.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.reps ?? ""}
                        </span>
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

function BlockView() {
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

  const totalWeeks = phases.reduce((sum: number, p: any) => sum + p.weekCount, 0);
  const completedWeeks = phases
    .filter((p: any) => p.status === "completed")
    .reduce((sum: number, p: any) => sum + p.weekCount, 0)
    + (currentPhase?.status === "current" ? currentWeekNumber - 1 : 0);

  const progressPercent = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Current block card */}
      {currentPhase && (
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Current Block</p>
              <h2 className="text-lg font-bold text-foreground leading-tight">{currentPhase.name}</h2>
              {currentPhase.goal && (
                <p className="text-sm text-muted-foreground mt-1">{currentPhase.goal}</p>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
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
              <p className="text-lg font-bold text-foreground">{currentWeekNumber} <span className="text-sm font-normal text-muted-foreground">of {currentPhase.weekCount}</span></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Block Progress</p>
              <p className="text-lg font-bold text-foreground">{Math.round(((currentWeekNumber - 1) / currentPhase.weekCount) * 100)}%</p>
            </div>
          </div>

          <div className="h-2 bg-background/60 rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.round(((currentWeekNumber - 1) / currentPhase.weekCount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* All phases */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <h3 className="text-sm font-bold text-foreground">Program Roadmap</h3>
        </div>
        <div className="divide-y divide-border">
          {phases.map((phase: any, idx: number) => {
            const isCurrent = phase.status === "current";
            const isCompleted = phase.status === "completed";
            return (
              <div key={phase.id} className={`px-5 py-4 ${isCurrent ? "bg-primary/3" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 border ${
                    isCurrent
                      ? "bg-primary text-primary-foreground border-primary"
                      : isCompleted
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`font-semibold text-sm ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                        {phase.name}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{phase.weekCount} weeks — {phase.goal}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* System summary */}
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

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptySystemState({ onInitialize, isLoading }: { onInitialize: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <Target className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-3">No Training System Yet</h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs leading-relaxed">
        Generate your personalized training system based on your profile. It will be structured, persistent, and ready to evolve with you.
      </p>
      <button
        onClick={onInitialize}
        disabled={isLoading}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
      >
        {isLoading ? (
          <>
            <RotateCcw className="w-4 h-4 animate-spin" />
            Building your system...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Build My Training System
          </>
        )}
      </button>
    </div>
  );
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "today", label: "Today", icon: Zap },
  { id: "week", label: "This Week", icon: Calendar },
  { id: "block", label: "Block", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SystemPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();

  const { data: activeSystem, isLoading: systemLoading, error: systemError } = useQuery({
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

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
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
              {activeTab === "today" && <TodayView />}
              {activeTab === "week" && <WeekView />}
              {activeTab === "block" && <BlockView />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
