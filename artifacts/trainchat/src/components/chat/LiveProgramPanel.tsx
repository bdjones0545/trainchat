import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell, Save, CheckCircle, Loader2, Lock, Zap, PlayCircle,
  MessageSquare, ChevronDown, ChevronUp, TrendingUp, LayoutGrid,
  Calendar, Clock, RotateCcw, GitBranch, Activity, Layers,
  AlertCircle, RefreshCw,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { ProgramStructure } from "./ChatOutput";

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

interface Props {
  program: ProgramStructure | null;
  onSave?: () => void;
  onFeedback?: () => void;
  onLogSession?: () => void;
  onUpgrade?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
  isPremium?: boolean;
  hasActiveSystem?: boolean;
}

type Tab = "program" | "changes" | "history";

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyProgramState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-5">
        <Dumbbell className="w-5 h-5 text-primary/40" />
      </div>
      <h3 className="text-xs font-semibold text-foreground mb-2">No program built yet</h3>
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[180px]">
        Your workout system will appear here once you start building with the agent.
      </p>
    </div>
  );
}

function ProgramTab({
  program,
  onSave,
  onFeedback,
  onLogSession,
  onUpgrade,
  isSaving,
  isSaved,
  isPremium,
}: Omit<Props, "hasActiveSystem">) {
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  if (!program) return <EmptyProgramState />;

  const days = program.days ?? [];
  const lockedDayCount = isPremium ? 0 : Math.max(0, days.length - 1);
  const showPaywall = !isPremium && days.length > 1;

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDuration: "3s" }} />
          <span className="text-[9px] font-bold text-primary uppercase tracking-[0.12em]">
            Live Program
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
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
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
      <div className="flex-1 overflow-y-auto p-3 space-y-2 relative">
        {days.map((day, idx) => {
          const isLocked = !isPremium && idx > 0;
          const isExpanded = expandedDay === idx;

          return (
            <div
              key={idx}
              className={`bg-card border rounded-xl overflow-hidden transition-all duration-150 ${
                isLocked ? "border-border/40 opacity-60" : isExpanded ? "border-primary/30" : "border-border"
              }`}
            >
              <button
                onClick={() => !isLocked && setExpandedDay(isExpanded ? null : idx)}
                className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                  isLocked ? "cursor-not-allowed" : "hover:bg-accent/30"
                }`}
                disabled={isLocked}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isLocked ? "bg-accent/40 text-muted-foreground/60"
                      : isExpanded ? "bg-primary text-primary-foreground"
                      : "bg-primary/15 text-primary"
                    }`}>
                      Day {day.dayNumber}
                    </span>
                    {isLocked && <Lock className="w-3 h-3 text-muted-foreground/50" />}
                  </div>
                  <p className={`text-[11px] font-semibold truncate ${isLocked ? "text-muted-foreground/50" : "text-foreground"}`}>
                    {day.name}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isLocked ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                    {isLocked ? "Locked — upgrade to view" : day.focus || `${day.exercises?.length ?? 0} exercises`}
                  </p>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
                  ) : isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {!isLocked && isExpanded && (
                <div className="border-t border-border divide-y divide-border/50">
                  {(day.exercises ?? []).map((ex, exIdx) => (
                    <div key={exIdx} className="px-3 py-2.5">
                      <p className="text-[11px] font-medium text-foreground">{ex.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                        {ex.sets > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{ex.sets}</span> sets
                          </span>
                        )}
                        {ex.reps && (
                          <span className="text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{ex.reps}</span> reps
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
                    </div>
                  ))}
                  {day.notes && (
                    <div className="px-3 py-2.5 bg-accent/15">
                      <p className="text-[10px] text-muted-foreground italic leading-relaxed">{day.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {showPaywall && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-[#080e18] via-[#080e18]/90 to-transparent pointer-events-none" />
            <div className="relative bg-[#0c1220]/95 border border-primary/20 rounded-xl p-5 text-center backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 mx-auto">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <h4 className="text-sm font-bold text-foreground mb-1">
                {lockedDayCount} more day{lockedDayCount === 1 ? "" : "s"} locked
              </h4>
              <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
                Unlock your full program and all future AI edits.
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
          </div>
        )}
      </div>
    </div>
  );
}

function ChangesTab({ hasActiveSystem }: { hasActiveSystem?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["training-system-history"],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>("/api/training-system/history?limit=20"),
    enabled: !!hasActiveSystem,
    staleTime: 30000,
  });

  if (!hasActiveSystem) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Activity className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs font-semibold text-foreground mb-1">No changes yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
          Build a program and every modification the AI makes will be logged here automatically.
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
    <div className="overflow-y-auto h-full">
      <div className="p-3 space-y-2">
        {history.map((entry) => {
          const whyChanged = entry.decisionMetadata?.whyChanged as string | undefined;
          return (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-3">
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
    queryKey: ["training-system-history"],
    queryFn: () => customFetch<{ history: ChangeLogEntry[] }>("/api/training-system/history?limit=30"),
    enabled: !!hasActiveSystem,
    staleTime: 30000,
  });

  const restoreMutation = useMutation({
    mutationFn: (changeId: number) =>
      customFetch<any>(`/api/training-system/restore/${changeId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
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
                    — {label}
                  </span>
                  {isCurrentVersion && (
                    <span className="text-[9px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">LIVE</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(entry.createdAt)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2">{entry.changeSummary}</p>
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
  onSave,
  onFeedback,
  onLogSession,
  onUpgrade,
  isSaving,
  isSaved,
  isPremium = false,
  hasActiveSystem = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("program");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "program", label: "Program", icon: Dumbbell },
    { id: "changes", label: "Changes", icon: Activity },
    { id: "history", label: "History", icon: GitBranch },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border flex-shrink-0 px-2 pt-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold border-b-2 transition-all duration-150 ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "program" && (
          <ProgramTab
            program={program}
            onSave={onSave}
            onFeedback={onFeedback}
            onLogSession={onLogSession}
            onUpgrade={onUpgrade}
            isSaving={isSaving}
            isSaved={isSaved}
            isPremium={isPremium}
          />
        )}
        {activeTab === "changes" && <ChangesTab hasActiveSystem={hasActiveSystem} />}
        {activeTab === "history" && <HistoryTab hasActiveSystem={hasActiveSystem} />}
      </div>
    </div>
  );
}
