/**
 * ChangeDetailDrawer — Phase 5
 *
 * Bottom-sheet (70vh max) showing a structured, summary-first breakdown of a
 * single change log entry. Fully dismissible, never traps the user.
 *
 * UX design:
 * - Summary card first: total changes + 2-3 bullet highlights derived from diff
 * - [View Changes] expands grouped before/after detail
 * - Exercises grouped by name so duplicates don't repeat
 * - High-level coach insight bullets derived from real diff data
 * - [View Updated Program] CTA scrolls + highlights affected exercises
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
  ListChecks,
  ArrowRight,
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
  onViewProgram?: (exerciseIds: number[]) => void;
}

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  ai_edit:      { label: "AI Coach",     icon: Sparkles,     color: "text-primary",      bg: "bg-primary/10",      border: "border-primary/20"      },
  quick_action: { label: "Quick Action", icon: Zap,          color: "text-orange-400",   bg: "bg-orange-400/10",   border: "border-orange-400/20"   },
  restore:      { label: "Restore",      icon: History,      color: "text-purple-400",   bg: "bg-purple-400/10",   border: "border-purple-400/20"   },
  initialize:   { label: "Program Init", icon: CheckCircle2, color: "text-green-400",    bg: "bg-green-400/10",    border: "border-green-400/20"    },
  auto_adjust:  { label: "Auto Adjust",  icon: Sparkles,     color: "text-blue-400",     bg: "bg-blue-400/10",     border: "border-blue-400/20"     },
};

const SCOPE_ICON: Record<string, React.ElementType> = {
  exercise: Dumbbell,
  session:  Layers,
  week:     Calendar,
  block:    BarChart3,
  system:   Shield,
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

// ─── Diff utilities ────────────────────────────────────────────────────────────

/** Returns which fields actually changed between two records. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return allKeys.filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
}

/**
 * Derive 2–3 high-level coaching insight bullets from all exercise diffs.
 * Maps low-level field changes to human-readable coaching language.
 */
function deriveCoachBullets(
  beforeEx: Record<string, Record<string, unknown>>,
  afterEx: Record<string, Record<string, unknown>>,
): string[] {
  const repsUp: string[] = [], repsDown: string[] = [];
  let tempoChanged = false, setsUp = false, setsDown = false;
  let restUp = false, restDown = false, rpeUp = false, rpeDown = false;

  const ids = Array.from(new Set([...Object.keys(beforeEx), ...Object.keys(afterEx)]));
  for (const id of ids) {
    const b = beforeEx[id] ?? {};
    const a = afterEx[id] ?? {};
    const fields = changedFields(b, a);

    if (fields.includes("reps")) {
      const bReps = parseInt(String(b.reps ?? "0"), 10);
      const aReps = parseInt(String(a.reps ?? "0"), 10);
      if (!isNaN(bReps) && !isNaN(aReps)) {
        if (aReps > bReps) repsUp.push(id); else repsDown.push(id);
      }
    }
    if (fields.includes("tempo")) tempoChanged = true;
    if (fields.includes("sets")) {
      const bSets = parseInt(String(b.sets ?? "0"), 10);
      const aSets = parseInt(String(a.sets ?? "0"), 10);
      if (!isNaN(bSets) && !isNaN(aSets)) {
        if (aSets > bSets) setsUp = true; else setsDown = true;
      }
    }
    if (fields.includes("rest")) {
      const bRest = parseInt(String(b.rest ?? "0"), 10);
      const aRest = parseInt(String(a.rest ?? "0"), 10);
      if (!isNaN(bRest) && !isNaN(aRest)) {
        if (aRest > bRest) restUp = true; else restDown = true;
      }
    }
    if (fields.includes("rpe")) {
      const bRpe = parseFloat(String(b.rpe ?? "0"));
      const aRpe = parseFloat(String(a.rpe ?? "0"));
      if (!isNaN(bRpe) && !isNaN(aRpe)) {
        if (aRpe > bRpe) rpeUp = true; else rpeDown = true;
      }
    }
  }

  const bullets: string[] = [];
  if (repsUp.length > repsDown.length)    bullets.push("Higher rep ranges for more time under tension");
  else if (repsDown.length > repsUp.length) bullets.push("Lower rep ranges for strength focus");
  if (tempoChanged)                        bullets.push("Tempo adjustments for controlled movement");
  if (setsUp)                              bullets.push("Additional sets to increase volume");
  else if (setsDown)                       bullets.push("Reduced sets to decrease volume");
  if (restUp)                              bullets.push("Longer rest periods for recovery");
  else if (restDown)                       bullets.push("Shorter rest periods for conditioning");
  if (rpeUp)                               bullets.push("Higher intensity targets");
  else if (rpeDown)                        bullets.push("Lower intensity for recovery focus");

  return bullets.slice(0, 3);
}

/**
 * Group exercise IDs by their name (before or after), returning an array of
 * groups: { name, ids, changedFieldSet }.
 */
function groupExercisesByName(
  beforeEx: Record<string, Record<string, unknown>>,
  afterEx: Record<string, Record<string, unknown>>,
): Array<{ name: string; ids: string[]; changedFieldSet: Set<string> }> {
  const nameToGroup: Map<string, { ids: string[]; changedFieldSet: Set<string> }> = new Map();

  const allIds = Array.from(new Set([...Object.keys(beforeEx), ...Object.keys(afterEx)]));
  for (const id of allIds) {
    const b = beforeEx[id] ?? {};
    const a = afterEx[id] ?? {};
    const name = String(b.name ?? a.name ?? `ID ${id}`);
    const fields = new Set(changedFields(b, a));

    if (!nameToGroup.has(name)) {
      nameToGroup.set(name, { ids: [], changedFieldSet: new Set() });
    }
    const group = nameToGroup.get(name)!;
    group.ids.push(id);
    for (const f of fields) group.changedFieldSet.add(f);
  }

  return Array.from(nameToGroup.entries()).map(([name, g]) => ({ name, ...g }));
}

/** Human-readable bullet for a changed field key. */
function fieldChangeBullet(field: string): string {
  const map: Record<string, string> = {
    reps:    "reps adjusted",
    sets:    "sets changed",
    tempo:   "tempo adjusted",
    rest:    "rest period updated",
    rpe:     "intensity (RPE) updated",
    notes:   "coaching notes updated",
    name:    "exercise swapped",
    category:"type changed",
  };
  return map[field] ?? `${field} updated`;
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
      <div className={`${changed ? "text-red-400/80 line-through" : "text-foreground"} leading-relaxed break-words`}>{fmt(before)}</div>
      <div className={`${changed ? "text-green-400 font-medium" : "text-foreground"} leading-relaxed break-words`}>{fmt(after)}</div>
    </div>
  );
}

/** Grouped exercise card: shows name + update count + bullet list of what changed. */
function GroupedExerciseCard({
  name,
  ids,
  changedFieldSet,
  beforeEx,
  afterEx,
}: {
  name: string;
  ids: string[];
  changedFieldSet: Set<string>;
  beforeEx: Record<string, Record<string, unknown>>;
  afterEx: Record<string, Record<string, unknown>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const relevantFields = Array.from(changedFieldSet).filter((f) => EXERCISE_LABELS[f]);
  const updateCount = ids.reduce((acc, id) => {
    return acc + changedFields(beforeEx[id] ?? {}, afterEx[id] ?? {}).length;
  }, 0);

  return (
    <div className="rounded-lg border border-border overflow-hidden mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-3 bg-muted/30 text-left hover:bg-muted/50 transition-colors"
      >
        <Dumbbell className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 truncate">{name}</span>
        {updateCount > 0 && (
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 mr-1 flex-shrink-0">
            {updateCount} update{updateCount !== 1 ? "s" : ""}
          </span>
        )}
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {/* Bullet summary (always shown when card is open) */}
      {relevantFields.length > 0 && (
        <div className="px-4 pt-2.5 pb-1">
          <ul className="space-y-1">
            {relevantFields.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1 h-1 rounded-full bg-primary/60 flex-shrink-0 mt-0.5" />
                {fieldChangeBullet(f)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detailed before/after table — only when expanded */}
      {expanded && (
        <div className="px-4 pb-1 pt-2 border-t border-border mt-2">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 py-2 border-b border-border mb-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Field</div>
            <div className="text-[10px] font-bold text-red-400/70 uppercase tracking-wider">Before</div>
            <div className="text-[10px] font-bold text-green-400/70 uppercase tracking-wider">After</div>
          </div>
          {ids.map((id) => {
            const b = beforeEx[id] ?? {};
            const a = afterEx[id] ?? {};
            return Object.keys(EXERCISE_LABELS).map((key) => (
              <FieldRow key={`${id}-${key}`} label={EXERCISE_LABELS[key]} before={b[key]} after={a[key]} />
            ));
          })}
        </div>
      )}
    </div>
  );
}

/** Non-exercise entity diff card (sessions, weeks, phases) */
function EntityDiff({
  entityType,
  entityId,
  before,
  after,
}: {
  entityType: "sessions" | "weeks" | "phases";
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const labels = fieldLabels(entityType);
  const allKeys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const ScopeIcon = SCOPE_ICON[entityType.replace("s", "") as keyof typeof SCOPE_ICON] ?? Layers;
  const name = (before?.name ?? before?.label ?? after?.name ?? after?.label ?? `ID ${entityId}`) as string;
  const numChanged = changedFields(before, after).length;

  return (
    <div className="rounded-lg border border-border overflow-hidden mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 bg-muted/30 text-left hover:bg-muted/50 transition-colors"
      >
        <ScopeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 truncate">{name}</span>
        {numChanged > 0 && (
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 mr-1 flex-shrink-0">
            {numChanged} update{numChanged !== 1 ? "s" : ""}
          </span>
        )}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-1">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 py-2 border-b border-border mb-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Field</div>
            <div className="text-[10px] font-bold text-red-400/70 uppercase tracking-wider">Before</div>
            <div className="text-[10px] font-bold text-green-400/70 uppercase tracking-wider">After</div>
          </div>
          {allKeys.map((key) =>
            labels[key] ? (
              <FieldRow key={key} label={labels[key]} before={before?.[key]} after={after?.[key]} />
            ) : null
          )}
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

export default function ChangeDetailDrawer({ changeId, onClose, onRestored, onViewProgram }: ChangeDetailDrawerProps) {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState<ChangeDetailEntry | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

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

  // ── Swipe-to-dismiss ──────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      dragCurrentY.current = delta;
      if (drawerRef.current) {
        drawerRef.current.style.transform = `translateY(${delta}px)`;
      }
    }
  }

  function onTouchEnd() {
    if (dragCurrentY.current > 80) {
      animateClose();
    } else {
      if (drawerRef.current) {
        drawerRef.current.style.transform = "translateY(0)";
      }
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const beforeEx = detail?.beforeSnapshot?.exercises ?? {};
  const afterEx  = detail?.afterSnapshot?.exercises  ?? {};
  const beforeSe = detail?.beforeSnapshot?.sessions  ?? {};
  const afterSe  = detail?.afterSnapshot?.sessions   ?? {};
  const beforeWk = detail?.beforeSnapshot?.weeks     ?? {};
  const afterWk  = detail?.afterSnapshot?.weeks      ?? {};
  const beforePh = detail?.beforeSnapshot?.phases    ?? {};
  const afterPh  = detail?.afterSnapshot?.phases     ?? {};

  const allExerciseIds = Array.from(new Set([...Object.keys(beforeEx), ...Object.keys(afterEx)])).map(Number).filter(Boolean);
  const exerciseGroups = detail ? groupExercisesByName(beforeEx, afterEx) : [];
  const totalExerciseChanges = exerciseGroups.reduce((acc, g) => acc + g.ids.length, 0);
  const totalSessionChanges  = Array.from(new Set([...Object.keys(beforeSe), ...Object.keys(afterSe)])).length;
  const totalChanges = totalExerciseChanges + totalSessionChanges +
    Object.keys(beforeWk).length + Object.keys(afterWk).length +
    Object.keys(beforePh).length + Object.keys(afterPh).length;

  const coachBullets = detail ? deriveCoachBullets(beforeEx, afterEx) : [];

  const hasSnapshot = detail && (
    Object.keys(beforeEx).length > 0 ||
    Object.keys(beforeSe).length > 0 ||
    Object.keys(beforeWk).length > 0 ||
    Object.keys(beforePh).length > 0
  );

  const isRestoreEntry = detail?.source === "restore";
  const sourceConfig = detail ? (SOURCE_CONFIG[detail.source] ?? SOURCE_CONFIG.ai_edit) : null;
  const SourceIcon = sourceConfig?.icon ?? Sparkles;


  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)", transition: "background 0.3s ease" }}
    >
      <div
        ref={drawerRef}
        className="w-full max-w-2xl bg-background border border-border rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "70vh",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing">
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
            <button
              onClick={animateClose}
              className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
              aria-label="Close"
            >
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
            <div className="px-5 py-5 space-y-5">

              {/* ── Coach summary ─────────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">What Changed</p>
                <p className="text-sm text-foreground leading-relaxed">{detail.changeSummary}</p>
                {coachBullets.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {coachBullets.map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 flex-shrink-0 mt-1" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Original request ──────────────────────────────────────── */}
              {detail.requestText && !isRestoreEntry && (
                <div className="bg-muted/30 rounded-lg px-4 py-3 border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Original Request</p>
                  <p className="text-sm text-foreground/80 italic">"{detail.requestText}"</p>
                </div>
              )}

              {/* ── Target context ────────────────────────────────────────── */}
              {detail.targetLabel && detail.targetType && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Applied to:</span>
                  <span className="text-xs font-semibold text-foreground capitalize">{detail.targetType}</span>
                  <span className="text-xs text-muted-foreground">"{detail.targetLabel}"</span>
                </div>
              )}

              {/* ── Summary card + [View Changes] ─────────────────────────── */}
              {hasSnapshot && (
                <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                  {/* Summary row */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <ListChecks className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Block Updated</p>
                      {totalChanges > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {totalExerciseChanges > 0 && `${totalExerciseChanges} exercise${totalExerciseChanges !== 1 ? "s" : ""}`}
                          {totalExerciseChanges > 0 && totalSessionChanges > 0 && " · "}
                          {totalSessionChanges > 0 && `${totalSessionChanges} session${totalSessionChanges !== 1 ? "s" : ""}`}
                          {" "}updated
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setChangesExpanded(!changesExpanded)}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                    >
                      {changesExpanded ? "Hide" : "View Changes"}
                      {changesExpanded
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {changesExpanded && (
                    <div className="px-4 pt-4 pb-3">
                      {/* Column headers */}
                      {(exerciseGroups.length > 0 || Object.keys(beforeSe).length > 0) && (
                        <div className="grid grid-cols-[120px_1fr_1fr] gap-2 pb-2 mb-3 border-b border-border">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Item</div>
                          <div className="text-[10px] font-bold text-red-400/70 uppercase tracking-wider">Before</div>
                          <div className="text-[10px] font-bold text-green-400/70 uppercase tracking-wider">After</div>
                        </div>
                      )}

                      {/* Grouped exercises */}
                      {exerciseGroups.map((group) => (
                        <GroupedExerciseCard
                          key={group.name}
                          name={group.name}
                          ids={group.ids}
                          changedFieldSet={group.changedFieldSet}
                          beforeEx={beforeEx}
                          afterEx={afterEx}
                        />
                      ))}

                      {/* Sessions */}
                      {Array.from(new Set([...Object.keys(beforeSe), ...Object.keys(afterSe)])).map((id) => (
                        <EntityDiff
                          key={`session-${id}`}
                          entityType="sessions"
                          entityId={id}
                          before={beforeSe[id] ?? {}}
                          after={afterSe[id] ?? {}}
                        />
                      ))}

                      {/* Weeks */}
                      {Array.from(new Set([...Object.keys(beforeWk), ...Object.keys(afterWk)])).map((id) => (
                        <EntityDiff
                          key={`week-${id}`}
                          entityType="weeks"
                          entityId={id}
                          before={beforeWk[id] ?? {}}
                          after={afterWk[id] ?? {}}
                        />
                      ))}

                      {/* Phases */}
                      {Array.from(new Set([...Object.keys(beforePh), ...Object.keys(afterPh)])).map((id) => (
                        <EntityDiff
                          key={`phase-${id}`}
                          entityType="phases"
                          entityId={id}
                          before={beforePh[id] ?? {}}
                          after={afterPh[id] ?? {}}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── View Updated Program CTA ──────────────────────────────── */}
              {hasSnapshot && !isRestoreEntry && allExerciseIds.length > 0 && onViewProgram && (
                <button
                  onClick={() => {
                    onViewProgram(allExerciseIds);
                    animateClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-semibold py-3 rounded-xl hover:bg-primary/15 transition-all duration-150"
                >
                  View Updated Program
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* ── Restore section ───────────────────────────────────────── */}
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

              {/* ── Restore entry notice ──────────────────────────────────── */}
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
    swap_exercise:           "Exercise Swap",
    replace_exercise:        "Exercise Replacement",
    update_exercise:         "Exercise Update",
    easier_variation:        "Easier Variation",
    harder_variation:        "Harder Variation",
    increase_sets:           "Set Added",
    reduce_sets:             "Set Removed",
    change_rep_range:        "Rep Range Change",
    injury_modification:     "Injury Modification",
    add_explosive_emphasis:  "Explosive Emphasis Added",
    change_session_type:     "Session Type Change",
    shorten_session:         "Session Shortened",
    athletic_emphasis:       "Athletic Emphasis",
    equipment_constraint:    "Equipment Adaptation",
    reduce_session_volume:   "Session Volume Reduced",
    deload_week:             "Deload Week",
    travel_mode:             "Travel Mode",
    increase_intensity:      "Intensity Increase",
    reduce_weekly_volume:    "Weekly Volume Reduced",
    increase_weekly_volume:  "Weekly Volume Increased",
    refocus_block_power:     "Power Block",
    refocus_block_hypertrophy: "Hypertrophy Block",
    refocus_block_athletic:  "Athletic Block",
    reduce_volume:           "Volume Reduced",
    restore:                 "State Restored",
    initialize:              "Program Initialized",
    exercise_note:           "Exercise Note",
    session_note:            "Session Note",
  };
  return map[intent] ?? intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
