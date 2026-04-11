/**
 * ExerciseLogInline
 *
 * Compact per-exercise performance logging UI rendered inside each exercise row.
 * Two-part UX:
 *   1. Quick feedback chips (Easy / Solid / Hard / Failed) — always visible
 *   2. Optional expandable section for weight + reps input
 *
 * Shows progression context when available:
 *   "Last: 185 × 5  →  Target: 190 × 5"
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Minus, Check } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

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

interface ExerciseLogInlineProps {
  exerciseName: string;
  exerciseRole?: ExerciseRole;
  programId?: number;
  dayNumber?: number;
  orderIndex?: number;
  target?: ProgressionTarget;
  onLogged?: () => void;
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
  { value: "failed", label: "Failed", activeClass: "bg-red-500/15 border-red-500/40 text-red-400" },
];

// ─── Progression state color ──────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExerciseLogInline({
  exerciseName,
  exerciseRole = "compound",
  programId,
  dayNumber,
  orderIndex,
  target,
  onLogged,
}: ExerciseLogInlineProps) {
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [load, setLoad] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleLog(overrideStatus?: CompletionStatus) {
    const finalStatus = overrideStatus ?? status;
    if (!finalStatus || submitting || submitted) return;

    setSubmitting(true);
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
      setSubmitted(true);
      onLogged?.();
    } catch {
      // Silent — log is best-effort
    } finally {
      setSubmitting(false);
    }
  }

  function handleStatusClick(s: CompletionStatus) {
    if (submitted) return;
    setStatus(s);
    if (!expanded) {
      handleLog(s);
    }
  }

  if (submitted) {
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
        <span className="text-[10px] text-green-400 font-medium">Logged</span>
        {status && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
            STATUS_CHIPS.find((c) => c.value === status)?.activeClass ?? ""
          }`}>
            {status}
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
            {hasLast && hasTarget && (
              <span className="text-muted-foreground/40">→</span>
            )}
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
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => handleStatusClick(chip.value)}
            disabled={submitting}
            className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all duration-150 ${
              status === chip.value
                ? chip.activeClass
                : "bg-muted/20 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}

        {/* Expand for weight/reps */}
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
          {status && (
            <button
              onClick={() => handleLog()}
              disabled={submitting}
              className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all"
            >
              {submitting ? "Saving…" : "Log it"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
