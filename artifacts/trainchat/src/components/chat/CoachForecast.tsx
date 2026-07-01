/**
 * Coach Forecast
 *
 * Surfaces 1-3 active prediction signals derived from real training data.
 * Each signal has a severity, one-line explanation, detailed evidence, and a direct action.
 *
 * "Show Why" expands the evidence inline — building trust in the prediction.
 * Action buttons dispatch a pre-written coaching message to the AI.
 *
 * FORECAST STATES:
 *   no_data    → New user, zero real data. Shows "No Forecast Yet" empty state.
 *   warming_up → Some data but below active threshold. Shows "Forecast Warming Up".
 *   active     → Sufficient data. Shows real prediction cards.
 *
 * Tone: anticipatory, coach-like, never alarming or robotic.
 * Design: minimal, clear, performance-oriented.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  TrendingDown, TrendingUp, Zap, AlertTriangle, ChevronDown, ChevronUp,
  ArrowRight, ClipboardList, BarChart2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PredictionType =
  | "FATIGUE_RISK"
  | "MISSED_SESSION_RISK"
  | "PLATEAU_RISK"
  | "PROGRESSION_OPPORTUNITY"
  | "RECOVERY_DIP_RISK";

type PredictionSeverity = "low" | "medium" | "high";

type ForecastStatus = "no_data" | "warming_up" | "active";

type ForecastConfidence = "none" | "low" | "medium" | "high";

interface PredictionSignal {
  id: string;
  type: PredictionType;
  severity: PredictionSeverity;
  confidence: number;
  title: string;
  explanation: string;
  evidence: string;
  suggestedAction: string;
  actionPrompt: string;
}

interface PredictionResult {
  status: ForecastStatus;
  confidence: ForecastConfidence;
  message: string;
  predictions: PredictionSignal[];
  generatedAt: string;
  _debug?: {
    completedWorkouts: number;
    checkIns: number;
    trainingHistoryCount: number;
    confidenceLevel: ForecastConfidence;
    forecastStatus: ForecastStatus;
  };
}

interface Props {
  onSendMessage?: (message: string) => void;
}

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<PredictionType, {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  FATIGUE_RISK: {
    icon: TrendingDown,
    iconColor: "text-red-400",
    bgColor: "bg-red-500/6",
    borderColor: "border-red-500/20",
    label: "Fatigue Risk",
  },
  MISSED_SESSION_RISK: {
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    bgColor: "bg-amber-500/6",
    borderColor: "border-amber-500/20",
    label: "Consistency Risk",
  },
  PLATEAU_RISK: {
    icon: AlertTriangle,
    iconColor: "text-orange-400",
    bgColor: "bg-orange-500/6",
    borderColor: "border-orange-500/20",
    label: "Plateau Risk",
  },
  PROGRESSION_OPPORTUNITY: {
    icon: TrendingUp,
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/6",
    borderColor: "border-emerald-500/20",
    label: "Opportunity",
  },
  RECOVERY_DIP_RISK: {
    icon: TrendingDown,
    iconColor: "text-violet-400",
    bgColor: "bg-violet-500/6",
    borderColor: "border-violet-500/20",
    label: "Recovery Dip",
  },
};

const SEVERITY_BADGE: Record<PredictionSeverity, { label: string; color: string }> = {
  high:   { label: "High",   color: "bg-red-500/15 text-red-400" },
  medium: { label: "Medium", color: "bg-amber-500/15 text-amber-400" },
  low:    { label: "Low",    color: "bg-muted/30 text-muted-foreground" },
};

const CONFIDENCE_BADGE: Record<ForecastConfidence, { label: string; color: string } | null> = {
  none:   null,
  low:    { label: "Low Confidence",    color: "bg-amber-500/12 text-amber-400/80 border border-amber-500/20" },
  medium: { label: "Medium Confidence", color: "bg-primary/10 text-primary/70 border border-primary/20" },
  high:   { label: "High Confidence",   color: "bg-emerald-500/12 text-emerald-400/80 border border-emerald-500/20" },
};

// ─── Prediction card ──────────────────────────────────────────────────────────

function PredictionCard({
  signal,
  onAction,
}: {
  signal: PredictionSignal;
  onAction: (prompt: string) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const cfg = TYPE_CONFIG[signal.type];
  const severity = SEVERITY_BADGE[signal.severity];
  const Icon = cfg.icon;
  const isPositive = signal.type === "PROGRESSION_OPPORTUNITY";

  return (
    <div className={`rounded-xl border ${cfg.borderColor} ${cfg.bgColor} overflow-hidden`}>
      {/* Card header */}
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-start gap-2.5">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bgColor} border ${cfg.borderColor}`}>
            <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-bold text-foreground">{signal.title}</span>
              {signal.type !== "PROGRESSION_OPPORTUNITY" && (
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${severity.color}`}>
                  {severity.label}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{signal.explanation}</p>
          </div>
        </div>

        {/* Suggested action */}
        <div className="mt-2.5 pl-8">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-1">
            {isPositive ? "Recommended Action" : "Suggested Action"}
          </p>
          <p className="text-[10px] text-foreground/80 leading-relaxed">{signal.suggestedAction}</p>
        </div>
      </div>

      {/* "Show Why" expand */}
      {showWhy && (
        <div className="px-3.5 py-2.5 border-t border-border/30 bg-muted/10">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1.5">Why I flagged this</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{signal.evidence}</p>
        </div>
      )}

      {/* Actions */}
      <div className={`flex items-center gap-0 border-t ${cfg.borderColor}/60 divide-x divide-border/30`}>
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-1 justify-center"
        >
          {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showWhy ? "Hide" : "Show why"}
        </button>
        <button
          onClick={() => onAction(signal.actionPrompt)}
          className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold transition-colors flex-1 justify-center ${
            isPositive
              ? "text-emerald-400 hover:text-emerald-300"
              : "text-primary hover:text-primary/80"
          }`}
        >
          {isPositive ? "Let's progress" : "Let's address this"}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── No Data state ────────────────────────────────────────────────────────────

function NoDataState({ onSendMessage }: { onSendMessage?: (msg: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-muted/12 border border-border/25 flex items-center justify-center mb-3">
        <BarChart2 className="w-4 h-4 text-muted-foreground/25" />
      </div>
      <p className="text-[11px] font-bold text-foreground mb-1.5">I haven't seen you train yet</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[220px] mb-4">
        Once you log your first session and check-in, I'll start tracking your recovery trends, fatigue patterns, and progression signals — before they become problems.
      </p>
      {onSendMessage && (
        <button
          onClick={() => onSendMessage("I'd like to log my first training session.")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary hover:bg-primary/15 transition-colors"
        >
          <ClipboardList className="w-3 h-3" />
          Log First Session
        </button>
      )}
      <p className="text-[9px] text-muted-foreground/40 mt-3 max-w-[200px]">
        I need real training data before I can generate meaningful coaching signals.
      </p>
    </div>
  );
}

// ─── Warming Up state ─────────────────────────────────────────────────────────

function WarmingUpState({ onSendMessage }: { onSendMessage?: (msg: string) => void }) {
  const badge = CONFIDENCE_BADGE["low"]!;

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-amber-500/8 border border-amber-500/15 flex items-center justify-center mb-3">
        <Zap className="w-4 h-4 text-amber-400/50" />
      </div>
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <p className="text-[11px] font-bold text-foreground">I'm starting to see patterns</p>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[220px] mb-4">
        I've been watching your sessions. Log a few more workouts and check-ins and I'll be able to give you higher-confidence coaching intelligence.
      </p>
      {onSendMessage && (
        <button
          onClick={() => onSendMessage("I'd like to complete a readiness check-in.")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/15 transition-colors"
        >
          <ClipboardList className="w-3 h-3" />
          Log Another Session
        </button>
      )}
    </div>
  );
}

// ─── All clear state ──────────────────────────────────────────────────────────

function AllClearState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-primary/8 border border-primary/15 flex items-center justify-center mb-3">
        <Zap className="w-4 h-4 text-primary/40" />
      </div>
      <p className="text-[11px] font-semibold text-foreground mb-1">All clear — you're on track</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px]">
        I'm not seeing any significant risk signals right now. Keep training consistently and I'll flag anything worth acting on.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CoachForecast({ onSendMessage }: Props) {
  const { data, isLoading, error } = useQuery<PredictionResult>({
    queryKey: ["predictions"],
    queryFn: () => customFetch<PredictionResult>("/api/predictions"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const handleAction = (prompt: string) => {
    if (onSendMessage) {
      onSendMessage(prompt);
    }
  };

  // Determine what to render based on forecast status
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/10 border border-border/20 animate-pulse" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <p className="text-[10px] text-muted-foreground text-center py-8">
          Unable to load forecast right now.
        </p>
      );
    }

    if (!data) {
      return <NoDataState onSendMessage={onSendMessage} />;
    }

    // Gate rendering on forecast status — never show cards unless status is "active"
    if (data.status === "no_data") {
      return <NoDataState onSendMessage={onSendMessage} />;
    }

    if (data.status === "warming_up") {
      return <WarmingUpState onSendMessage={onSendMessage} />;
    }

    // Active state — show real predictions
    if (data.predictions.length === 0) {
      return <AllClearState />;
    }

    const confidenceBadge = data.confidence ? CONFIDENCE_BADGE[data.confidence] : null;

    return (
      <>
        {data.predictions.map((signal) => (
          <PredictionCard
            key={signal.id}
            signal={signal}
            onAction={handleAction}
          />
        ))}
        <div className="flex items-center justify-center gap-2 pt-1">
          {confidenceBadge && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${confidenceBadge.color}`}>
              {confidenceBadge.label}
            </span>
          )}
          <p className="text-[9px] text-muted-foreground/40">
            Forecast updates as you train and log check-ins
          </p>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-[11px] font-bold text-primary uppercase tracking-[0.15em]">Coach Forecast</h3>
        </div>
        <p className="text-[10px] text-muted-foreground">
          I'm watching your patterns. Here's what I'm seeing — before it becomes a problem.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-4 space-y-2.5">
        {renderContent()}
      </div>
    </div>
  );
}
