import { useEffect, useState } from "react";
import { Dumbbell, Check } from "lucide-react";
import type { BuildStage } from "@/hooks/useStreamMessage";

/**
 * AgentThinking — Multi-step agent response display.
 *
 * Renders the agent's progress as a sequence of progressive message bubbles,
 * one per completed milestone stage, with the current stage showing as an
 * animated "typing" bubble. This gives the feel of a live system executing
 * steps rather than a chatbot waiting and then replying.
 *
 * Stage sequence (from build-pipeline.ts):
 *   understanding → loading → classifying → planning → applying →
 *   validating → saving → [complete → component unmounts]
 *
 * Only milestone stages (planning, applying, validating, saving) appear as
 * separate committed bubbles. Earlier stages update silently in the background.
 */

interface Props {
  acknowledgment?: string;
  buildStage: BuildStage | null;
  stageLabel: string;
  stageHistory: string[];
}

export default function AgentThinking({
  acknowledgment,
  buildStage,
  stageLabel,
  stageHistory,
}: Props) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 420);
    return () => clearInterval(id);
  }, []);

  const dots = ".".repeat(dotCount);

  const isActiveMilestone =
    buildStage !== null &&
    ["planning", "applying", "validating", "saving"].includes(buildStage);

  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
        <Dumbbell className="w-3.5 h-3.5 text-primary" />
      </div>

      <div className="flex flex-col gap-2 max-w-xs">
        {acknowledgment && (
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <p className="text-sm text-foreground leading-relaxed">{acknowledgment}</p>
          </div>
        )}

        {stageHistory.map((label, i) => (
          <div
            key={i}
            className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-2 animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <div className="flex items-center gap-2">
              <Check className="w-3 h-3 text-primary/60 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {label.replace(/…$/, "")}
              </p>
            </div>
          </div>
        ))}

        {isActiveMilestone && stageLabel && (
          <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {stageLabel.replace(/…$/, "")}{dots}
            </p>
          </div>
        )}

        {!isActiveMilestone && !stageHistory.length && !acknowledgment && (
          <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-2.5">
            <p className="text-xs text-muted-foreground">{dots}</p>
          </div>
        )}
      </div>
    </div>
  );
}
