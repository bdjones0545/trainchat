/**
 * AdaptationSummaryCard
 *
 * Shown immediately after a daily check-in saves.
 * Displays a single coaching recommendation and gives the user
 * two choices: adjust today's plan, or keep it as-is.
 *
 * After confirmation, shows a specific breakdown of what changed
 * in concrete terms (exercise names, set counts, etc.)
 *
 * Plan changes are NEVER applied automatically — always user-confirmed.
 */

import { useState } from "react";
import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Activity, ChevronRight, Loader2, ArrowRight } from "lucide-react";
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

export interface ChangeDetail {
  exerciseName: string;
  change: string;
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
  /** Specific structural changes made — shown after user confirmation */
  changesDetail?: ChangeDetail[] | null;
  /** Pain score == 3 but a non-pain mode fired — worth flagging */
  hasPainWarning?: boolean;
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
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }
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
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [appliedResult, setAppliedResult] = useState<AdaptationResult | null>(null);

  const needsAdjust = adaptation.mode !== "TRAIN_AS_PLANNED" && adaptation.hasActiveProgram !== false;
  const coachMsg = adaptation.coachMessage ?? adaptation.adjustmentSummary;

  async function handleAdjust() {
    if (adjusting || appliedResult) return;
    if (!adaptation.readinessEntryId || !adaptation.scores) {
      setAdjustError("Missing data to apply adjustment.");
      return;
    }
    setAdjusting(true);
    setAdjustError(null);
    try {
      const result = await customFetch<AdaptationResult>("/api/readiness/apply-adjustment", {
        method: "POST",
        body: JSON.stringify({
          readinessEntryId: adaptation.readinessEntryId,
          scores: adaptation.scores,
          mode: adaptation.mode,
        }),
      });
      setAppliedResult(result ?? { ...adaptation, changesApplied: 0 });
    } catch {
      setAdjustError("Couldn't apply adjustment. Try again.");
    } finally {
      setAdjusting(false);
    }
  }

  // Post-confirmation view — shows specific changes made
  if (appliedResult) {
    const detail = appliedResult.changesDetail ?? adaptation.changesDetail;
    const appliedCount = appliedResult.changesApplied ?? 0;

    return (
      <div className={`rounded-2xl border ${config.border} ${config.bg} overflow-hidden`}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0`}>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-0.5">
              Plan adjusted
            </p>
            <p className="text-sm font-semibold text-foreground leading-tight">
              Today's session updated
            </p>
          </div>
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {adaptation.coachExplanation}
          </p>
        </div>

        {/* Specific changes made */}
        {detail && detail.length > 0 && (
          <div className="mx-4 mb-3 rounded-xl bg-background/60 border border-border/60 overflow-hidden">
            <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              What changed
            </p>
            <div className="divide-y divide-border/40">
              {detail.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 gap-3">
                  <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">
                    {item.exerciseName}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] font-semibold ${config.color}`}>
                      {item.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {appliedCount > 0 && (
              <p className="px-3 py-2 text-[10px] text-muted-foreground/50 border-t border-border/40">
                {appliedCount} update{appliedCount === 1 ? "" : "s"} applied to your program
              </p>
            )}
          </div>
        )}

        {adaptation.hasPainWarning && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <p className="text-[11px] text-orange-400 font-medium">
              Moderate pain flagged — scale back or skip any exercise that aggravates it during the session.
            </p>
          </div>
        )}

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

      {/* Pain warning — pain score 3 in non-pain mode */}
      {adaptation.hasPainWarning && (
        <div className="px-4 pb-3">
          <div className="px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <p className="text-[11px] text-orange-400 font-medium">
              Moderate pain flagged — if anything aggravates it during the session, scale back or skip that exercise.
            </p>
          </div>
        </div>
      )}

      {/* Preview of what will change — shown before user confirms */}
      {needsAdjust && adaptation.changesDetail && adaptation.changesDetail.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl bg-background/40 border border-border/50 overflow-hidden">
            <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
              What will change
            </p>
            <div className="divide-y divide-border/30">
              {adaptation.changesDetail.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                    {item.exerciseName}
                  </span>
                  <span className={`text-[10px] font-semibold ${config.color} flex-shrink-0`}>
                    {item.change}
                  </span>
                </div>
              ))}
              {adaptation.changesDetail.length > 4 && (
                <div className="px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground/50">
                    +{adaptation.changesDetail.length - 4} more
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                Adjusting plan…
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
