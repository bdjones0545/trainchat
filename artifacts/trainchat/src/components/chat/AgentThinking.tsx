import { useEffect, useState } from "react";
import { Dumbbell, Check } from "lucide-react";
import type { BuildStage } from "@/hooks/useStreamMessage";
import { getMilestoneStages } from "@/hooks/useStreamMessage";

/**
 * AgentThinking — Multi-step agent execution display.
 *
 * Each build or update shows progressive message bubbles:
 *   1. Acknowledgment bubble (instant, from server)
 *   2. Committed milestone bubbles (locked in as each stage completes)
 *   3. Active milestone bubble (animated dots while running)
 *
 * Which stages appear as milestone bubbles is determined by actionType:
 *   PROGRAM_GENERATION  → planning, applying, validating, saving  (full build)
 *   STRUCTURAL_REBUILD  → planning, applying, saving              (medium)
 *   DIRECT_MUTATION     → applying, saving                        (fast)
 *   SESSION_ADJUSTMENT  → applying, saving                        (fast)
 */

interface Props {
  acknowledgment?: string;
  buildStage: BuildStage | null;
  stageLabel: string;
  stageHistory: string[];
  actionType?: string;
}

export default function AgentThinking({
  acknowledgment,
  buildStage,
  stageLabel,
  stageHistory,
  actionType,
}: Props) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 420);
    return () => clearInterval(id);
  }, []);

  const dots = ".".repeat(dotCount);

  const milestones = getMilestoneStages(actionType);
  const isActiveMilestone = buildStage !== null && milestones.has(buildStage);

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
