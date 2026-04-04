/**
 * ChangeDetailDrawer — Phase 4
 *
 * Bottom-sheet showing a full breakdown of a single change log entry:
 * - Source badge, intent label, timestamp
 * - Coach-written summary and explanation
 * - Before / After comparison table for affected entities
 * - "Restore Prior State" action with confirmation guard
 *
 * Design principle: reads like a coaching debrief, not a developer git diff.
 */

import { useState, useEffect, useRef } from "react";
import {
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Shield,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Calendar,
  Layers,
  BarChart3,
  Zap,
  History,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChangeDetailEntry {
  id: number;
  source: string;
  intent: string;
  scope: string;
  changeSummary: string;
  requestText: string | null;
  isMajorVersion: boolean;
  versionLabel: string | null;
  targetType: string | null;
  targetId: number | null;
  targetLabel: string | null;
  appliedCount: number;
  skippedCount: number;
  restoredFromId: number | null;
  createdAt: string;
  beforeSnapshot: {
    exercises: Record<string, Record<string, unknown>>;
    sessions: Record<string, Record<string, unknown>>;
    weeks: Record<string, Record<string, unknown>>;
    phases: Record<string, Record<string, unknown>>;
  } | null;
  afterSnapshot: {
    exercises: Record<string, Record<string, unknown>>;
    sessions: Record<string, Record<string, unknown>>;
    weeks: Record<string, Record<string, unknown>>;
    phases: Record<string, Record<string, unknown>>;
  } | null;
}

interface ChangeDetailDrawerProps {
  changeId: number;
  onClose: () => void;
  onRestored: (changedIds: any) => void;
}

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  ai_edit: { label: "AI Coach", icon: Sparkles, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
  quick_action: { label: "Quick Action", icon: Zap, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  restore: { label: "Restore", icon: History, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  initialize: { label: "Program Init", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20" },
  auto_adjust: { label: "Auto Adjust", icon: Sparkles, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
};

const SCOPE_ICON: Record<string, React.ElementType> = {
  exercise: Dumbbell,
  session: Layers,
  week: Calendar,
  block: BarChart3,
  system: Shield,
};

// ─── Field label maps ──────────────────────────────────────────────────────────

const EXERCISE_LABELS: Record<string, string> = {
  name: "Exercise", category: "Type", sets: "Sets", reps: "Reps",
  rest: "Rest", tempo: "Tempo", rpe: "RPE", notes: "Notes",
};
const SESSION_LABELS: Record<string, string> = {
  label: "Name", sessionType: "Type", emphasis: "Emphasis",
  warmupNotes: "Warm-Up", coachingNotes: "Coaching Notes", isRestDay: "Rest Day",
};
const WEEK_LABELS: Record<string, string> = {
  label: "Label", focus: "Focus", volumeLevel: "Volume", notes: "Notes",
};
const PHASE_LABELS: Record<string, string> = {
  name: "Name", goal: "Goal", emphasis: "Emphasis", notes: "Notes",
};

function fieldLabels(entityType: "exercises" | "sessions" | "weeks" | "phases"): Record<string, string> {
  return { exercises: EXERCISE_LABELS, sessions: SESSION_LABELS, weeks: WEEK_LABELS, phases: PHASE_LABELS }[entityType];
}

// ─── Before/After comparison row ─────────────────────────────────────────────

function FieldRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const changed = String(before ?? "") !== String(after ?? "");
  if (!changed && !before && !after) return null;

  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground/40 italic">—</span>;
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };

  return (
    <div className={`grid grid-cols-[120px_1fr_1fr] gap-2 py-2.5 border-b border-border last:border-0 text-xs ${changed ? "bg-amber-500/3" : ""}`}>
      <div className="text-muted-foreground font-medium truncate pr-2">{label}</div>
      <div className={`${changed ? "text-red-400/80 line-through" : "text-foreground"} leading-relaxed break-words`}>
        {fmt(before)}
      </div>
      <div className={`${changed ? "text-green-400 font-medium" : "text-foreground"} leading-relaxed break-words`}>
        {fmt(after)}
      </div>
    </div>
  );
}

function EntityDiff({
  entityType,
  entityId,
  before,
  after,
}: {
  entityType: "exercises" | "sessions" | "weeks" | "phases";
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(true);
  const labels = fieldLabels(entityType);
  const allKeys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const ScopeIcon = SCOPE_ICON[entityType.replace("s", "") as keyof typeof SCOPE_ICON] ?? Dumbbell;
  const name = (before?.name ?? before?.label ?? after?.name ?? after?.label ?? `ID ${entityId}`) as string;

  return (
    <div className="rounded-lg border border-border overflow-hidden mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 bg-muted/30 text-left hover:bg-muted/50 transition-colors"
      >
        <ScopeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 truncate">{name}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-1">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 py-2 border-b border-border mb-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Field</div>
            <div className="text-[10px] font-bold text-red-400/70 uppercase tracking-wider">Before</div>
            <div className="text-[10px] font-bold text-green-400/70 uppercase tracking-wider">After</div>
          </div>
          {allKeys.map((key) => (
            labels[key] ? (
              <FieldRow key={key} label={labels[key]} before={before?.[key]} after={after?.[key]} />
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchChangeDetail(changeId: number): Promise<ChangeDetailEntry> {
  return customFetch<ChangeDetailEntry>(`/api/training-system/history/${changeId}`);
}

async function restoreChange(changeId: number): Promise<any> {
  return customFetch<any>(`/api/training-system/restore/${changeId}`, { method: "POST" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChangeDetailDrawer({ changeId, onClose, onRestored }: ChangeDetailDrawerProps) {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState<ChangeDetailEntry | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    fetchChangeDetail(changeId)
      .then(setDetail)
      .catch(() => setLoadError(true));
    return () => cancelAnimationFrame(t);
  }, [changeId]);

  const restoreMutation = useMutation({
    mutationFn: () => restoreChange(changeId),
    onSuccess: (data) => {
      onRestored(data.changedIds);
      animateClose();
    },
  });

  function animateClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) animateClose();
  }

  const sourceConfig = detail ? (SOURCE_CONFIG[detail.source] ?? SOURCE_CONFIG.ai_edit) : null;
  const SourceIcon = sourceConfig?.icon ?? Sparkles;

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  const hasSnapshot = detail && (
    Object.keys(detail.beforeSnapshot?.exercises ?? {}).length > 0 ||
    Object.keys(detail.beforeSnapshot?.sessions ?? {}).length > 0 ||
    Object.keys(detail.beforeSnapshot?.weeks ?? {}).length > 0 ||
    Object.keys(detail.beforeSnapshot?.phases ?? {}).length > 0
  );

  const isRestoreEntry = detail?.source === "restore";

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)", transition: "background 0.3s ease" }}
    >
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "90vh",
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
              {sourceConfig && (
                <div className={`w-10 h-10 rounded-xl ${sourceConfig.bg} border ${sourceConfig.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <SourceIcon className={`w-5 h-5 ${sourceConfig.color}`} />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  {sourceConfig && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sourceConfig.bg} ${sourceConfig.border} ${sourceConfig.color}`}>
                      {sourceConfig.label}
                    </span>
                  )}
                  {detail?.isMajorVersion && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                      Version Milestone
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground leading-tight">
                  {detail?.versionLabel ?? (detail ? intentToLabel(detail.intent) : "Loading…")}
                </h3>
                {detail && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatDate(detail.createdAt)}</span>
                    {detail.appliedCount > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{detail.appliedCount} change{detail.appliedCount !== 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button onClick={animateClose} className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Failed to load change details.</p>
            </div>
          ) : !detail ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <div className="px-5 py-5 space-y-6">
              {/* Coach summary */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">What Changed</p>
                <p className="text-sm text-foreground leading-relaxed">{detail.changeSummary}</p>
              </div>

              {/* Request text */}
              {detail.requestText && !isRestoreEntry && (
                <div className="bg-muted/30 rounded-lg px-4 py-3 border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Original Request</p>
                  <p className="text-sm text-foreground/80 italic">"{detail.requestText}"</p>
                </div>
              )}

              {/* Target context */}
              {detail.targetLabel && detail.targetType && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Applied to:</span>
                  <span className="text-xs font-semibold text-foreground capitalize">{detail.targetType}</span>
                  <span className="text-xs text-muted-foreground">"{detail.targetLabel}"</span>
                </div>
              )}

              {/* Before / After comparison */}
              {hasSnapshot && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Before → After</p>

                  {(["exercises", "sessions", "weeks", "phases"] as const).map((entityType) => {
                    const beforeMap = detail.beforeSnapshot?.[entityType] ?? {};
                    const afterMap = detail.afterSnapshot?.[entityType] ?? {};
                    const ids = Array.from(new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]));

                    return ids.map((id) => (
                      <EntityDiff
                        key={`${entityType}-${id}`}
                        entityType={entityType}
                        entityId={id}
                        before={beforeMap[id] ?? {}}
                        after={afterMap[id] ?? {}}
                      />
                    ));
                  })}
                </div>
              )}

              {/* Restore section */}
              {!isRestoreEntry && hasSnapshot && (
                <div className="border-t border-border pt-5">
                  {restoreMutation.isSuccess ? (
                    <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                      <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <p className="text-sm text-foreground">Prior state restored successfully.</p>
                    </div>
                  ) : confirmingRestore ? (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-4 space-y-3">
                      <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Confirm Restore</p>
                      <p className="text-sm text-foreground leading-relaxed">
                        This will undo the changes shown above and revert the affected items to their previous state.
                        A new history entry will be created so you can undo this restore too.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => restoreMutation.mutate()}
                          disabled={restoreMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-black font-semibold text-sm py-2.5 rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-60"
                        >
                          {restoreMutation.isPending ? (
                            <><RotateCcw className="w-4 h-4 animate-spin" /> Restoring…</>
                          ) : (
                            <><RotateCcw className="w-4 h-4" /> Yes, restore</>
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmingRestore(false)}
                          disabled={restoreMutation.isPending}
                          className="flex-1 bg-muted text-muted-foreground text-sm py-2.5 rounded-lg hover:text-foreground transition-colors disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                      {restoreMutation.isError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs mt-2">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Restore failed. Please try again.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingRestore(true)}
                      className="w-full flex items-center justify-center gap-2 bg-muted/60 border border-border text-muted-foreground text-sm font-semibold py-3 rounded-xl hover:text-foreground hover:border-amber-400/40 hover:bg-amber-400/5 transition-all duration-150"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore Prior State
                    </button>
                  )}
                </div>
              )}

              {/* Restore entry notice */}
              {isRestoreEntry && (
                <div className="bg-purple-400/5 border border-purple-400/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <History className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Restore Entry</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This entry records a restore action. The original change has been undone and the system reverted to a prior state.
                    You can restore this change too if needed — it will simply re-apply the changes that were originally undone.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Intent labels ────────────────────────────────────────────────────────────

function intentToLabel(intent: string): string {
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
    increase_weekly_volume: "Weekly Volume Increased",
    refocus_block_power: "Power Block",
    refocus_block_hypertrophy: "Hypertrophy Block",
    refocus_block_athletic: "Athletic Block",
    reduce_volume: "Volume Reduced",
    restore: "State Restored",
    initialize: "Program Initialized",
    exercise_note: "Exercise Note",
    session_note: "Session Note",
  };
  return map[intent] ?? intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
