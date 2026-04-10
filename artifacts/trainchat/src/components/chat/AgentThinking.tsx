import { useEffect, useState } from "react";
import { Dumbbell } from "lucide-react";
import type { BuildStage } from "@/hooks/useStreamMessage";

/**
 * AgentThinking — Phase 2.3 (Real Build Pipeline)
 *
 * Every stage shown here corresponds to a real step in the build pipeline on
 * the server. There is NO fake auto-advancement — this component only updates
 * when a stage event arrives from the SSE stream.
 *
 * Stage sequence (mirroring build-pipeline.ts):
 *   understanding → loading → classifying → planning → applying →
 *   validating → saving → [complete → component unmounts]
 */

interface Props {
  acknowledgment?: string;
  buildStage: BuildStage | null;
  stageLabel: string;
}

/** Progress fraction for each stage — used to drive the progress bar. */
const STAGE_PROGRESS: Record<BuildStage, number> = {
  understanding: 12,
  loading:       25,
  classifying:   38,
  planning:      52,
  applying:      68,
  validating:    82,
  saving:        93,
  complete:      100,
};

export default function AgentThinking({ acknowledgment, buildStage, stageLabel }: Props) {
  const [dotCount, setDotCount] = useState(1);
  const [prevLabel, setPrevLabel] = useState(stageLabel);
  const [fading, setFading] = useState(false);

  // Animated trailing dots — always live
  useEffect(() => {
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 480);
    return () => clearInterval(id);
  }, []);

  // Smooth label transition when stage advances
  useEffect(() => {
    if (stageLabel && stageLabel !== prevLabel) {
      setFading(true);
      const id = setTimeout(() => {
        setPrevLabel(stageLabel);
        setFading(false);
      }, 160);
      return () => clearTimeout(id);
    }
  }, [stageLabel, prevLabel]);

  const progress = buildStage ? STAGE_PROGRESS[buildStage] : 8;
  const displayLabel = prevLabel || stageLabel || "Starting up…";
  const dots = ".".repeat(dotCount);

  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Agent avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
        <Dumbbell className="w-3.5 h-3.5 text-primary" />
      </div>

      <div className="flex flex-col gap-1.5 max-w-xs">
        {/* Acknowledgment bubble — static once shown */}
        {acknowledgment && (
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
            <p className="text-sm text-foreground leading-relaxed">{acknowledgment}</p>
          </div>
        )}

        {/* Active stage bubble */}
        <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3">
          {/* Stage label */}
          <p
            className="text-xs text-muted-foreground leading-relaxed mb-2.5 transition-opacity duration-150"
            style={{ opacity: fading ? 0 : 1 }}
          >
            {displayLabel}
          </p>

          {/* Progress bar — driven by real stage progress fraction */}
          <div className="relative h-0.5 rounded-full bg-border overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-primary/50 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
            {/* Animated shimmer overlay on the leading edge */}
            <div
              className="absolute inset-y-0 rounded-full animate-pulse bg-primary/30"
              style={{
                left: `${Math.max(0, progress - 12)}%`,
                width: "12%",
                animationDuration: "1.4s",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
