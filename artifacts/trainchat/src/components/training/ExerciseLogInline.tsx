/**
 * ExerciseLogInline
 *
 * Per-exercise logging UI inside each exercise row.
 *
 * Two modes:
 *  - IDLE (sessionActive=false):   Shows last/target context + quick-feedback chips.
 *  - SESSION (sessionActive=true): Shows per-set grid with weight/reps/completed,
 *                                  "Same as last" auto-fill, and +5/+10 increment buttons.
 *
 * Auto-saves each completed set immediately so data is never lost.
 */

import { useState, useEffect } from "react";
import { Check, TrendingUp, Plus, Minus, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { inferLoggingMode, getModeConfig } from "@/lib/loggingMode";

// ─── Types ────────────────────────────────────────────────────────────────────

type CompletionStatus = "easy" | "solid" | "hard" | "failed";
type ExerciseRole = "power" | "compound" | "unilateral" | "accessory" | "prep" | "trunk";

export interface ProgressionTarget {
  exerciseName: string;
  progressionState: "ready_to_progress" | "hold" | "regress";
  targetLoad: number | null;
  targetReps: number | null;
  lastLoad: number | null;
  lastReps: number | null;
  reasoning: string;
  coachNote: string;
}

export interface SetLog {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

interface ExerciseLogInlineProps {
  exerciseName: string;
  exerciseRole?: ExerciseRole;
  programId?: number;
  dayNumber?: number;
  orderIndex?: number;
  prescribedSets?: number;
  target?: ProgressionTarget;
  sessionActive?: boolean;
  onLogged?: () => void;
  onSetsChange?: (sets: SetLog[]) => void;
}

// ─── Status chips config ──────────────────────────────────────────────────────

const STATUS_CHIPS: {
  value: CompletionStatus;
  label: string;
  activeClass: string;
}[] = [
  { value: "easy",   label: "Easy",   activeClass: "bg-sky-500/15 border-sky-500/40 text-sky-400" },
  { value: "solid",  label: "Solid",  activeClass: "bg-green-500/15 border-green-500/40 text-green-400" },
  { value: "hard",   label: "Hard",   activeClass: "bg-amber-500/15 border-amber-500/40 text-amber-400" },
  { value: "failed", label: "Failed", activeClass: "bg-red-500/15 border-red-500/40 text-reded-400" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateChip(state: ProgressionTarget["progressionState"]) {
  switch (state) {
    case "ready_to_progress":
      return { label: "↑ Progress", cls: "text-green-400 bg-green-500/10 border-green-500/25" };
    case "regress":
      return { label: "↓ Reduce", cls: "text-red-400 bg-red-500/10 border-red-500/25" };
    default:
      return { label: "→ Hold", cls: "text-amber-400 bg-amber-500/10 border-amber-500/25" };
  }
}

function clampWeight(v: number) {
  return Math.max(0, Math.min(2000, Math.round(v * 4) / 4));
}

function clampReps(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function buildDefaultSets(count: number, lastLoad: number | null, lastReps: number | null): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    weight: lastLoad,
    reps: lastReps,
    completed: false,
  }));
}

// ─── NumInput ─────────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  placeholder,
  step = 1,
  wide = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  step?: number;
  wide?: boolean;
}) {
  const [raw, setRaw] = useState(value !== null ? String(value) : "");

  useEffect(() => {
    setRaw(value !== null ? String(value) : "");
  }, [value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(isNaN(n) ? null : n);
      }}
      onBlur={() => {
        if (value !== null) setRaw(String(value));
        else setRaw("");
      }}
      step={step}
      min={0}
      className={`bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none tabular-nums ${wide ? "w-14" : "w-10"}`}
    />
  );
}

// ─── SetRow ───────────────────────────────────────────────────────────────────

function SetRow({
  set,
  mode,
  onChange,
  onAutoSave,
}: {
  set: SetLog;
  mode: ReturnType<typeof getModeConfig>["mode"];
  onChange: (patch: Partial<SetLog>) => void;
  onAutoSave: () => void;
}) {
  const cfg = getModeConfig(mode);

  function adjustPrimary(delta: number) {
    const step = cfg.primaryDelta;
    const next = Math.max(0, (set.weight ?? 0) + delta * step);
    onChange({ weight: Math.round(next * 10) / 10 });
  }

  function adjustSecondary(delta: number) {
    const base = set.reps ?? 0;
    onChange({ reps: clampReps(base + delta) });
  }

  function toggleCompleted() {
    const next = !set.completed;
    onChange({ completed: next });
    if (next) onAutoSave();
  }

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
        set.completed
          ? "bg-green-500/8 border border-green-500/20"
          : "bg-muted/15 border border-border/30"
      }`}
    >
      {/* Set badge */}
      <span className="text-[9px] font-bold text-muted-foreground/50 w-8 flex-shrink-0">
        S{set.setNumber}
      </span>

      {/* Primary field (weight / distance / height / time) */}
      {cfg.showPrimary && (
        <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-md px-1.5 py-0.5">
          <button
            onClick={() => adjustPrimary(-1)}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            type="button"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <NumInput
            value={set.weight}
            onChange={(v) => onChange({ weight: v !== null ? Math.max(0, v) : null })}
            placeholder={cfg.primaryPlaceholder}
            step={cfg.primaryStep}
            wide
          />
          <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{cfg.primaryLabel}</span>
          <button
            onClick={() => adjustPrimary(1)}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            type="button"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Quick +5/+10 — load_reps only */}
      {cfg.showQuickJumps && (
        <div className="flex gap-0.5">
          <button
            onClick={() => onChange({ weight: clampWeight((set.weight ?? 0) + 5) })}
            className="text-[8px] font-bold text-muted-foreground/50 hover:text-primary transition-colors px-1 py-0.5 rounded bg-muted/10 hover:bg-primary/10"
            type="button"
          >
            +5
          </button>
          <button
            onClick={() => onChange({ weight: clampWeight((set.weight ?? 0) + 10) })}
            className="text-[8px] font-bold text-muted-foreground/50 hover:text-primary transition-colors px-1 py-0.5 rounded bg-muted/10 hover:bg-primary/10"
            type="button"
          >
            +10
          </button>
        </div>
      )}

      {/* Secondary field (reps / time) */}
      {cfg.showSecondary && (
        <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-md px-1.5 py-0.5">
          <button
            onClick={() => adjustSecondary(-1)}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            type="button"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <NumInput
            value={set.reps}
            onChange={(v) => onChange({ reps: v !== null ? clampReps(v) : null })}
            placeholder={cfg.secondaryPlaceholder}
          />
          <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{cfg.secondaryLabel}</span>
          <button
            onClick={() => adjustSecondary(1)}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            type="button"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Completed checkbox */}
      <button
        onClick={toggleCompleted}
        className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          set.completed
            ? "bg-green-500 border-green-500"
            : "border-border/60 hover:border-green-500/60"
        }`}
        type="button"
      >
        {set.completed && <Check className="w-2.5 h-2.5 text-white" />}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExerciseLogInline({
  exerciseName,
  exerciseRole = "compound",
  programId,
  dayNumber,
  orderIndex,
  prescribedSets = 3,
  target,
  sessionActive = false,
  onLogged,
  onSetsChange,
}: ExerciseLogInlineProps) {
  const lastLoad = target?.lastLoad ?? null;
  const lastReps = target?.lastReps ?? null;

  const [sets, setSets] = useState<SetLog[]>(() =>
    buildDefaultSets(prescribedSets, lastLoad, lastReps)
  );

  // Re-initialize sets when target loads in (first time we get real last data)
  useEffect(() => {
    if (lastLoad !== null || lastReps !== null) {
      setSets((prev) => {
        const allBlank = prev.every((s) => s.weight === null && s.reps === null && !s.completed);
        if (!allBlank) return prev;
        return buildDefaultSets(prescribedSets, lastLoad, lastReps);
      });
    }
  }, [lastLoad, lastReps, prescribedSets]);

  // Notify parent whenever sets change
  useEffect(() => {
    onSetsChange?.(sets);
  }, [sets]);

  // ── Quick-log state (idle mode) ─────────────────────────────────────────────
  const [quickStatus, setQuickStatus] = useState<CompletionStatus | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickSubmitted, setQuickSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [load, setLoad] = useState("");
  const [reps, setReps] = useState("");

  // ── Session mode helpers ────────────────────────────────────────────────────

  function updateSet(index: number, patch: Partial<SetLog>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function fillFromLast() {
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        weight: lastLoad,
        reps: lastReps,
      }))
    );
  }

  async function autoSaveSet(index: number) {
    const s = sets[index];
    if (!s) return;
    try {
      await customFetch("/api/exercise-logs", {
        method: "POST",
        body: JSON.stringify({
          exerciseName,
          exerciseRole,
          programId,
          dayNumber,
          orderIndex,
          completionStatus: "solid",
          loadUsed: s.weight ?? undefined,
          repsCompleted: s.reps ?? undefined,
          setsCompleted: 1,
        }),
      });
      onLogged?.();
    } catch {
      // best-effort
    }
  }

  // ── Quick-log (idle mode) ───────────────────────────────────────────────────

  async function handleQuickLog(overrideStatus?: CompletionStatus) {
    const finalStatus = overrideStatus ?? quickStatus;
    if (!finalStatus || quickSubmitting || quickSubmitted) return;

    setQuickSubmitting(true);
    try {
      await customFetch("/api/exercise-logs", {
        method: "POST",
        body: JSON.stringify({
          exerciseName,
          exerciseRole,
          programId,
          dayNumber,
          orderIndex,
          completionStatus: finalStatus,
          loadUsed: load ? parseFloat(load) : undefined,
          repsCompleted: reps ? parseInt(reps, 10) : undefined,
        }),
      });
      setQuickSubmitted(true);
      onLogged?.();
    } catch {
      // silent
    } finally {
      setQuickSubmitting(false);
    }
  }

  function handleStatusClick(s: CompletionStatus) {
    if (quickSubmitted) return;
    setQuickStatus(s);
    if (!expanded) handleQuickLog(s);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MODE UI
  // ═══════════════════════════════════════════════════════════════════════════

  const mode = inferLoggingMode(exerciseName, exerciseRole);

  if (sessionActive) {
    const completedCount = sets.filter((s) => s.completed).length;
    const allDone = completedCount === sets.length;

    const chip = target ? stateChip(target.progressionState) : null;
    const hasLast = lastLoad !== null || lastReps !== null;
    const hasTarget = target && (target.targetLoad !== null || target.targetReps !== null);

    return (
      <div className="mt-2 space-y-2">
        {/* Previous + target context */}
        {(hasLast || hasTarget) && (
          <div className="flex items-center gap-2 flex-wrap">
            {chip && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${chip.cls}`}>
                {chip.label}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {hasLast && (
                <span>
                  Last:{" "}
                  <span className="text-foreground font-semibold">
                    {lastLoad !== null ? `${lastLoad} lbs` : ""}
                    {lastLoad !== null && lastReps !== null ? " × " : ""}
                    {lastReps !== null ? `${lastReps}` : ""}
                  </span>
                </span>
              )}
              {hasLast && hasTarget && <span className="text-muted-foreground/30">→</span>}
              {hasTarget && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5 text-primary/60" />
                  <span>
                    Target:{" "}
                    <span className="text-primary font-semibold">
                      {target!.targetLoad !== null ? `${target!.targetLoad} lbs` : ""}
                      {target!.targetLoad !== null && target!.targetReps !== null ? " × " : ""}
                      {target!.targetReps !== null ? `${target!.targetReps}` : ""}
                    </span>
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* "Same as last" quick-fill */}
        {hasLast && (
          <button
            onClick={fillFromLast}
            className="flex items-center gap-1 text-[9px] font-semibold text-primary/60 hover:text-primary transition-colors"
            type="button"
          >
            <Copy className="w-2.5 h-2.5" /> Same as last session
          </button>
        )}

        {/* Per-set rows */}
        <div className="space-y-1.5">
          {sets.map((set, i) => (
            <SetRow
              key={set.setNumber}
              set={set}
              mode={mode}
              onChange={(patch) => updateSet(i, patch)}
              onAutoSave={() => autoSaveSet(i)}
            />
          ))}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500/70 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / sets.length) * 100}%` }}
            />
          </div>
          <span className={`text-[9px] font-bold ${allDone ? "text-green-400" : "text-muted-foreground/60"}`}>
            {completedCount}/{sets.length}
            {allDone && " ✓"}
          </span>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IDLE MODE UI (compact chips)
  // ═══════════════════════════════════════════════════════════════════════════

  if (quickSubmitted) {
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
        <span className="text-[10px] text-green-400 font-medium">Logged</span>
        {quickStatus && (
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
              STATUS_CHIPS.find((c) => c.value === quickStatus)?.activeClass ?? ""
            }`}
          >
            {quickStatus}
          </span>
        )}
      </div>
    );
  }

  const chip = target ? stateChip(target.progressionState) : null;
  const hasTarget = target && (target.targetLoad !== null || target.targetReps !== null);
  const hasLast = target && (target.lastLoad !== null || target.lastReps !== null);

  return (
    <div className="mt-2 space-y-1.5">
      {/* Progression context row */}
      {target && (hasTarget || hasLast) && (
        <div className="flex items-center gap-2 flex-wrap">
          {chip && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${chip.cls}`}>
              {chip.label}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {hasLast && (
              <span>
                Last:{" "}
                <span className="text-foreground font-medium">
                  {target.lastLoad !== null ? `${target.lastLoad} lbs` : ""}
                  {target.lastLoad !== null && target.lastReps !== null ? " × " : ""}
                  {target.lastReps !== null ? `${target.lastReps}` : ""}
                </span>
              </span>
            )}
            {hasLast && hasTarget && <span className="text-muted-foreground/40">→</span>}
            {hasTarget && (
              <span className="flex items-center gap-1">
                <TrendingUp className="w-2.5 h-2.5 text-primary/60" />
                <span>
                  Target:{" "}
                  <span className="text-primary font-semibold">
                    {target.targetLoad !== null ? `${target.targetLoad} lbs` : ""}
                    {target.targetLoad !== null && target.targetReps !== null ? " × " : ""}
                    {target.targetReps !== null ? `${target.targetReps}` : ""}
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quick-log row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.value}
            onClick={() => handleStatusClick(c.value)}
            disabled={quickSubmitting}
            className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all duration-150 ${
              quickStatus === c.value
                ? c.activeClass
                : "bg-muted/20 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[9px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-0.5 transition-colors"
        >
          {expanded ? (
            <>less <ChevronUp className="w-2.5 h-2.5" /></>
          ) : (
            <>+ weight/reps <ChevronDown className="w-2.5 h-2.5" /></>
          )}
        </button>
      </div>

      {/* Expanded weight / reps inputs */}
      {expanded && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-lg px-2 py-1">
            <input
              type="number"
              placeholder="lbs"
              value={load}
              onChange={(e) => setLoad(e.target.value)}
              className="w-12 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              min={0}
              max={2000}
              step={2.5}
            />
            <span className="text-[9px] text-muted-foreground/60">lbs</span>
          </div>
          <Minus className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
          <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-lg px-2 py-1">
            <input
              type="number"
              placeholder="reps"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-10 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              min={0}
              max={100}
            />
            <span className="text-[9px] text-muted-foreground/60">reps</span>
          </div>
          {quickStatus && (
            <button
              onClick={() => handleQuickLog()}
              disabled={quickSubmitting}
              className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
            >
              {quickSubmitting ? "Saving…" : "Log it"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
