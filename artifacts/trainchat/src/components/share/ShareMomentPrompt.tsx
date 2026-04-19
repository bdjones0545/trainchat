import { Share2, X } from "lucide-react";
import type { ShareMoment } from "@/types/share-moments";

interface Props {
  moment: ShareMoment;
  onShare: () => void;
  onDismiss: () => void;
}

const PROMPT_COPY: Record<string, string> = {
  PROGRAM_GENERATED: "Share your new program",
  AGENT_ADJUSTMENT: "Share this coaching moment",
  BLOCK_COMPLETE: "Share your block completion",
  NEXT_BLOCK_READY: "Share your next phase",
  SESSION_LOG_ADAPTATION: "Share what changed",
  PROGRESS_MILESTONE: "Share this milestone",
};

export default function ShareMomentPrompt({ moment, onShare, onDismiss }: Props) {
  const label = PROMPT_COPY[moment.type] ?? "Share this moment";

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 mx-4 mb-3 rounded-xl bg-card border border-border/60 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
        <Share2 size={11} className="text-primary" />
      </div>
      <button
        onClick={onShare}
        className="flex-1 text-left text-[12px] font-medium text-foreground hover:text-primary transition-colors"
      >
        {label}
      </button>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
      >
        <X size={12} />
      </button>
    </div>
  );
}
