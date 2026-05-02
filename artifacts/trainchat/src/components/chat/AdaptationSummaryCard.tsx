/**
 * AdaptationSummaryCard
 *
 * Shown immediately after a daily check-in saves.
 * Displays a single coaching recommendation and gives the user
 * two choices: adjust today's plan, or keep it as-is.
 *
 * Plan changes are NEVER applied automatically — always user-confirmed.
 */

import { useState } from "react";
import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Activity, ChevronRight, Loader2 } from "lucide-react";
import CoachReasoningCallout from "./CoachReasoningCallout";
import { customFetch } from "@workspace/api-client-react";

export type AdaptationMode =
  | "TRAIN_AS_PLANNED"
  | "LIGHT_MODIFICATION"
  | "PAIN_MODIFICATION"
  | "RECOVERY_DELOAD"
  | "GREEN_LIGHT_PROGRESSION";

export interface ReadinessScore {
  sleep: number;
  energy: number;
  motivation: number;
  soreness: number;
  stress: number;
  composite: number;
  readinessLevel: "high" | "moderate" | "low";
  fatigueRisk: "low" | "moderate" | "high";
}

export interface AdaptationResult {
  mode: AdaptationMode;
  readiness?: ReadinessScore | null;
  adjustmentSummary: string;
  coachMessage?: string;
  coachExplanation: string;
  coachReasoning?: string | null;
  hasActiveProgram?: boolean;
  todaySessionId?: number | null;
  changesApplied: number;
  changeLogId: number | null;
  // scores for apply-adjustment call
  scores?: {
    sleepScore: number;
    energyScore: number;
    sorenessScore: number;
    stressScore: number;
    motivationScore: number;
    painScore: number;
  };
  readinessEntryId?: number;
}

interface AdaptationSummaryCardProps {
  adaptation: AdaptationResult;
  onDismiss: (applied?: boolean) => void;
}

const MODE_CONFIG: Record<
  AdaptationMode,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  TRAIN_AS_PLANNED: {
    label: "Ready to Train",
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  LIGHT_MODIFICATION: {
    label: "Recovery a Little Lower",
    icon: Activity,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  PAIN_MODIFICATION: {
    label: "Pain Flagged",
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  RECOVERY_DELOAD: {
    label: "Recovery Lower Today",
    icon: TrendingDown,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  GREEN_LIGHT_PROGRESSION: {
    label: "All Signals Solid",
    icon: TrendingUp,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
};

const READINESS_LEVEL_COLOR: Record<string, string> = {
  high: "text-green-400",
  moderate: "text-yellow-400",
  low: "text-red-400",
};

const FATIGUE_RISK_COLOR: Record<string, string> = {
  low: "text-green-400",
  moderate: "text-yellow-400",
  high: "text-red-400",
};

export default function AdaptationSummaryCard({ adaptation, onDismiss }: AdaptationSummaryCardProps) {
  const config = MODE_CONFIG[adaptation.mode];
  const Icon = config.icon;
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const needsAdjust = adaptation.mode !== "TRAIN_AS_PLANNED" && adaptation.hasActiveProgram !== false;
  const coachMsg = adaptation.coachMessage ?? adaptation.adjustmentSummary;

  async function handleAdjust() {
    if (adjusting || adjusted) return;
    if (!adaptation.readinessEntryId || !adaptation.scores) {
      setAdjustError("Missing data to apply adjustment.");
      return;
    }
    setAdjusting(true);
    setAdjustError(null);
    try {
      await customFetch("/api/readiness/apply-adjustment", {
        method: "POST",
        body: JSON.stringify({
          readinessEntryId: adaptation.readinessEntryId,
          scores: adaptation.scores,
          mode: adaptation.mode,
        }),
      });
      setAdjusted(true);
    } catch {
      setAdjustError("Couldn't apply adjustment. Try again.");
    } finally {
      setAdjusting(false);
    }
  }

  if (adjusted) {
    return (
      <div className={`rounded-2xl border ${config.border} ${config.bg} overflow-hidden`}>
        <div className="px-4 py-5 flex flex-col items-center gap-2 text-center">
          <div className={`w-10 h-10 rounded-full ${config.bg} border ${config.border} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <p className="text-sm font-semibold text-foreground">Today's plan adjusted</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {adaptation.coachExplanation}
          </p>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={() => onDismiss(true)}
            className="w-full py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
          >
            Got it
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${config.color} mb-0.5`}>
            Check-in saved
          </p>
          <p className="text-sm font-semibold text-foreground leading-tight">{config.label}</p>
        </div>
      </div>

      {/* Readiness indicators */}
      {adaptation.readiness && (
        <div className="px-4 pb-3 pt-1 flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            Readiness:{" "}
            <span className={`font-semibold ${READINESS_LEVEL_COLOR[adaptation.readiness.readinessLevel] ?? "text-foreground"}`}>
              {adaptation.readiness.readinessLevel.charAt(0).toUpperCase() + adaptation.readiness.readinessLevel.slice(1)}
            </span>
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-[11px] text-muted-foreground">
            Fatigue risk:{" "}
            <span className={`font-semibold ${FATIGUE_RISK_COLOR[adaptation.readiness.fatigueRisk] ?? "text-foreground"}`}>
              {adaptation.readiness.fatigueRisk.charAt(0).toUpperCase() + adaptation.readiness.fatigueRisk.slice(1)}
            </span>
          </span>
        </div>
      )}

      {/* Coach message — one clear recommendation */}
      <div className="px-4 pb-3">
        <p className="text-sm text-foreground font-medium leading-snug">{coachMsg}</p>
      </div>

      {/* Coach explanation */}
      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{adaptation.coachExplanation}</p>
      </div>

      {/* Coach reasoning */}
      {adaptation.coachReasoning && adaptation.mode !== "TRAIN_AS_PLANNED" && (
        <div className="px-4 pb-3">
          <CoachReasoningCallout reasoning={adaptation.coachReasoning} variant="checkin" />
        </div>
      )}

      {adjustError && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-400">{adjustError}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className={`px-4 pb-4 pt-2 border-t ${config.border} space-y-2`}>
        {needsAdjust && (
          <button
            onClick={handleAdjust}
            disabled={adjusting}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
              adjusting
                ? "bg-primary/50 text-primary-foreground/60 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
            }`}
          >
            {adjusting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Adjusting plan...
              </>
            ) : (
              "Adjust today's plan"
            )}
          </button>
        )}
        <button
          onClick={() => onDismiss(false)}
          className="w-full py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
        >
          {needsAdjust ? "Keep plan as-is" : "Got it"}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
