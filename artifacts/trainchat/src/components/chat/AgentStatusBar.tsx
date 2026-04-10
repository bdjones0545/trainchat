import { useEffect, useRef, useState } from "react";
import type { BuildStage } from "@/hooks/useStreamMessage";

const STAGE_LABELS: Record<BuildStage | "idle", string> = {
  idle: "Working…",
  understanding: "Analyzing request…",
  loading: "Loading context…",
  classifying: "Classifying intent…",
  planning: "Building your structure…",
  applying: "Selecting exercises…",
  validating: "Validating program…",
  saving: "Saving…",
  complete: "Done",
};

interface Props {
  isActive: boolean;
  buildStage: BuildStage | null;
  actionType?: string;
}

export default function AgentStatusBar({ isActive, buildStage, actionType }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      setElapsed(0);
      setVisible(true);
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const timeout = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timeout);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  if (!visible) return null;

  const label = buildStage ? STAGE_LABELS[buildStage] : STAGE_LABELS.idle;

  return (
    <div
      className={`flex-shrink-0 px-4 py-2 flex justify-center transition-all duration-300 ${
        isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      }`}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2 bg-primary/8 border border-primary/20 rounded-full">
        <span className="flex gap-[3px] items-center">
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms", animationDuration: "900ms" }} />
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms", animationDuration: "900ms" }} />
          <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms", animationDuration: "900ms" }} />
        </span>
        <span className="text-[11px] font-medium text-primary/90 tracking-tight">
          {label}
        </span>
        {elapsed > 0 && (
          <span className="text-[10px] text-primary/50 tabular-nums">
            {elapsed}s
          </span>
        )}
      </div>
    </div>
  );
}
