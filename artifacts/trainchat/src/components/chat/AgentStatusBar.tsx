import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { BuildStage, StreamPhase } from "@/hooks/useStreamMessage";

// ─── Label mapping — tied to real pipeline stages ────────────────────────────

function getStageLabel(stage: BuildStage | null, actionType?: string): string {
  if (!stage) return "Working…";

  const isModify =
    actionType === "DIRECT_MUTATION" || actionType === "SESSION_ADJUSTMENT";
  const isRebuild = actionType === "STRUCTURAL_REBUILD";

  switch (stage) {
    case "understanding":
      return "Understanding your request…";
    case "loading":
      return "Loading your current program…";
    case "classifying":
      return "Classifying your request…";
    case "planning":
      return isModify
        ? "Planning your modifications…"
        : isRebuild
        ? "Redesigning your training structure…"
        : "Structuring your training split…";
    case "applying":
      return isModify
        ? "Applying updates…"
        : "Selecting and placing exercises…";
    case "validating":
      return "Validating your training structure…";
    case "saving":
      return "Saving your program…";
    case "complete":
      return "Done";
    default:
      return "Working…";
  }
}

// ─── Internal display state ───────────────────────────────────────────────────

type DisplayState = "hidden" | "working" | "done" | "error";

interface Props {
  phase: StreamPhase;
  buildStage: BuildStage | null;
  actionType?: string;
  error?: string | null;
}

export default function AgentStatusBar({
  phase,
  buildStage,
  actionType,
  error,
}: Props) {
  const [displayState, setDisplayState] = useState<DisplayState>("hidden");
  const [elapsed, setElapsed] = useState(0);
  const [frozenElapsed, setFrozenElapsed] = useState(0);
  const [label, setLabel] = useState("Working…");

  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const collapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Timer helpers ──────────────────────────────────────────────────────────

  function startTimer() {
    startRef.current = Date.now();
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setFrozenElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
  }

  // ─── Phase → display state transitions ─────────────────────────────────────

  useEffect(() => {
    if (collapseRef.current) clearTimeout(collapseRef.current);

    if (phase === "acknowledged" || phase === "building") {
      if (displayState === "hidden") {
        startTimer();
      }
      setDisplayState("working");
      setLabel(getStageLabel(buildStage, actionType));

    } else if (phase === "complete") {
      stopTimer();
      setDisplayState("done");
      // Collapse after 2 seconds
      collapseRef.current = setTimeout(() => setDisplayState("hidden"), 2000);

    } else if (phase === "error") {
      stopTimer();
      setDisplayState("error");
      // Collapse after 4 seconds
      collapseRef.current = setTimeout(() => setDisplayState("hidden"), 4000);

    } else if (phase === "idle") {
      // Only hide if we're not in the done/error wind-down
      if (displayState === "working") {
        setDisplayState("hidden");
      }
    }

    return () => {
      if (collapseRef.current) clearTimeout(collapseRef.current);
    };
  }, [phase]);

  // Update label as stages progress (no flicker — only update when stage changes)
  useEffect(() => {
    if (phase === "building" && buildStage) {
      setLabel(getStageLabel(buildStage, actionType));
    }
  }, [buildStage, actionType, phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (collapseRef.current) clearTimeout(collapseRef.current);
    };
  }, []);

  if (displayState === "hidden") return null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  const isWorking = displayState === "working";
  const isDone = displayState === "done";
  const isError = displayState === "error";

  const currentElapsed = isWorking ? elapsed : frozenElapsed;
  const showTimer = currentElapsed > 0;

  return (
    <div
      className={`flex-shrink-0 px-4 py-2 flex justify-center transition-all duration-300 ${
        (displayState as string) !== "hidden" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div
        className={`flex items-center gap-2.5 px-4 py-2 rounded-full border transition-all duration-300 ${
          isDone
            ? "bg-green-500/8 border-green-500/20"
            : isError
            ? "bg-red-500/8 border-red-500/20"
            : "bg-primary/8 border-primary/20"
        }`}
      >
        {/* Indicator */}
        {isWorking && (
          <span className="flex gap-[3px] items-center flex-shrink-0">
            <span
              className="w-1 h-1 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "0ms", animationDuration: "900ms" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "150ms", animationDuration: "900ms" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "300ms", animationDuration: "900ms" }}
            />
          </span>
        )}
        {isDone && (
          <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
        )}
        {isError && (
          <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
        )}

        {/* Label */}
        <span
          className={`text-[11px] font-medium tracking-tight transition-colors ${
            isDone
              ? "text-green-400"
              : isError
              ? "text-red-400"
              : "text-primary/90"
          }`}
        >
          {isDone
            ? "Done. Your program is ready."
            : isError
            ? (error ? "Something went wrong." : "I hit a problem — try again.")
            : label}
        </span>

        {/* Timer */}
        {showTimer && isWorking && (
          <span className="text-[10px] text-primary/40 tabular-nums flex-shrink-0">
            {currentElapsed}s
          </span>
        )}
        {showTimer && (isDone || isError) && currentElapsed > 1 && (
          <span
            className={`text-[10px] tabular-nums flex-shrink-0 ${
              isDone ? "text-green-400/40" : "text-red-400/40"
            }`}
          >
            {currentElapsed}s
          </span>
        )}
      </div>
    </div>
  );
}
