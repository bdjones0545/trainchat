/**
 * AdaptationSummaryCard
 *
 * Shown immediately after a daily check-in completes when the system
 * has an active training program. Displays what the adaptive engine
 * decided and why — making the intelligence visible.
 */

import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Activity, ChevronRight } from "lucide-react";

export type AdaptationMode =
  | "TRAIN_AS_PLANNED"
  | "LIGHT_MODIFICATION"
  | "PAIN_MODIFICATION"
  | "RECOVERY_DELOAD"
  | "GREEN_LIGHT_PROGRESSION";

export interface AdaptationResult {
  mode: AdaptationMode;
  adjustmentSummary: string;
  coachExplanation: string;
  changesApplied: number;
  changeLogId: number | null;
}

interface AdaptationSummaryCardProps {
  adaptation: AdaptationResult;
  onDismiss: () => void;
}

const MODE_CONFIG: Record<
  AdaptationMode,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  TRAIN_AS_PLANNED: {
    label: "Train as Planned",
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  LIGHT_MODIFICATION: {
    label: "Light Modification",
    icon: Activity,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  PAIN_MODIFICATION: {
    label: "Pain-Modified Session",
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  RECOVERY_DELOAD: {
    label: "Auto-Deload Activated",
    icon: TrendingDown,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  GREEN_LIGHT_PROGRESSION: {
    label: "Green Light — Push Today",
    icon: TrendingUp,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
};

export default function AdaptationSummaryCard({ adaptation, onDismiss }: AdaptationSummaryCardProps) {
  const config = MODE_CONFIG[adaptation.mode];
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} overflow-hidden`}>
      {/* Mode badge */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${config.color}`} style={{ width: "1.125rem", height: "1.125rem" }} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${config.color} mb-0.5`}>
            Today's Adjustment
          </p>
          <p className="text-sm font-semibold text-foreground leading-tight">{config.label}</p>
        </div>
      </div>

      {/* Summary line */}
      <div className="px-4 pb-3">
        <p className="text-sm text-foreground font-medium leading-snug">{adaptation.adjustmentSummary}</p>
      </div>

      {/* Coach explanation */}
      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{adaptation.coachExplanation}</p>
      </div>

      {/* Changes applied indicator */}
      {adaptation.changesApplied > 0 && (
        <div className={`px-4 py-2.5 border-t ${config.border} flex items-center justify-between`}>
          <span className="text-[11px] text-muted-foreground">
            {adaptation.changesApplied} session update{adaptation.changesApplied !== 1 ? "s" : ""} applied to your program
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
            Live
          </span>
        </div>
      )}

      {/* Dismiss */}
      <div className="px-4 pb-4 pt-3">
        <button
          onClick={onDismiss}
          className="w-full py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
        >
          Got it
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
