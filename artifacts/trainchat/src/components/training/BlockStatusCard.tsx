/**
 * BlockStatusCard
 *
 * Compact coaching summary card showing the current block intelligence state.
 * Surfaces in the "This Week" and "Block" tabs in the System page.
 *
 * States:
 *   progressing      → Green   "Progressing"
 *   stable           → Slate   "On Track"
 *   fatigued         → Amber   "Fatigue Rising"
 *   underrecovered   → Orange  "Under-Recovered"
 *   inconsistent     → Yellow  "Inconsistent"
 *   needs_deload     → Red     "Deload Needed"
 *   needs_review     → Red     "Needs Review"
 */

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  TrendingUp,
  AlertTriangle,
  Battery,
  Target,
  Brain,
  ShieldAlert,
  Minus,
  ChevronRight,
} from "lucide-react";

type BlockStatus =
  | "progressing"
  | "stable"
  | "fatigued"
  | "underrecovered"
  | "inconsistent"
  | "needs_deload"
  | "needs_review";

interface BlockMetrics {
  weeklyComplianceScore: number;
  weeklyFatigueScore: number;
  painRiskScore: number;
  progressMomentumScore: number;
  blockReadinessScore: number;
  sessionCount: number;
  hardSessionStreak: number;
  skippedCount: number;
  liveAdjustmentCount: number;
}

interface BlockRecommendation {
  type: string;
  scope: string;
  priority: "low" | "medium" | "high";
  reason: string;
  specifics: string;
}

interface BlockIntelligenceData {
  status: BlockStatus;
  statusLabel: string;
  summary: string;
  coachInsight: string;
  confidence: "low" | "medium" | "high";
  recommendations: BlockRecommendation[];
  metrics: BlockMetrics;
}

type CardTheme = {
  container: string;
  statusBadge: string;
  icon: string;
  Icon: React.ElementType;
};

function getTheme(status: BlockStatus): CardTheme {
  switch (status) {
    case "progressing":
      return {
        container: "border-green-500/20 bg-green-500/5",
        statusBadge: "text-green-400 bg-green-500/10 border-green-500/20",
        icon: "text-green-400",
        Icon: TrendingUp,
      };
    case "stable":
      return {
        container: "border-border/60 bg-muted/10",
        statusBadge: "text-muted-foreground bg-muted/30 border-border/40",
        icon: "text-muted-foreground",
        Icon: Minus,
      };
    case "fatigued":
      return {
        container: "border-amber-500/25 bg-amber-500/5",
        statusBadge: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        icon: "text-amber-400",
        Icon: Battery,
      };
    case "underrecovered":
      return {
        container: "border-orange-500/25 bg-orange-500/5",
        statusBadge: "text-orange-400 bg-orange-500/10 border-orange-500/20",
        icon: "text-orange-400",
        Icon: Battery,
      };
    case "inconsistent":
      return {
        container: "border-yellow-500/25 bg-yellow-500/5",
        statusBadge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
        icon: "text-yellow-400",
        Icon: Target,
      };
    case "needs_deload":
      return {
        container: "border-red-500/25 bg-red-500/5",
        statusBadge: "text-red-400 bg-red-500/10 border-red-500/20",
        icon: "text-red-400",
        Icon: AlertTriangle,
      };
    case "needs_review":
      return {
        container: "border-red-500/30 bg-red-500/8",
        statusBadge: "text-red-400 bg-red-500/10 border-red-500/20",
        icon: "text-red-400",
        Icon: ShieldAlert,
      };
    default:
      return {
        container: "border-border/60 bg-muted/10",
        statusBadge: "text-muted-foreground bg-muted/20 border-border/40",
        icon: "text-muted-foreground",
        Icon: Brain,
      };
  }
}

function MetricPill({
  label,
  value,
  good,
}: {
  label: string;
  value: number;
  good: "high" | "low";
}) {
  const isGood = good === "high" ? value >= 60 : value <= 40;
  const isNeutral = value >= 40 && value <= 60;
  const color = isGood
    ? "text-green-400"
    : isNeutral
    ? "text-muted-foreground"
    : "text-red-400";

  return (
    <div className="flex items-center gap-1.5">
      <div className={`text-[9px] font-bold uppercase tracking-wider ${color}`}>
        {label}
      </div>
      <div className={`text-[9px] font-semibold ${color}`}>{value}</div>
    </div>
  );
}

interface BlockStatusCardProps {
  /** If true, shows a compact single-line version */
  compact?: boolean;
}

export default function BlockStatusCard({ compact = false }: BlockStatusCardProps) {
  const { data, isLoading, error } = useQuery<BlockIntelligenceData>({
    queryKey: ["block-intelligence"],
    queryFn: () => customFetch<BlockIntelligenceData>("/api/block-intelligence/status"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/40 bg-muted/10 p-4 animate-pulse">
        <div className="h-4 w-24 bg-muted/30 rounded mb-2" />
        <div className="h-3 w-48 bg-muted/20 rounded" />
      </div>
    );
  }

  if (error || !data || data.metrics.sessionCount < 2) {
    return null; // Not enough data — don't show the card
  }

  const theme = getTheme(data.status);
  const { Icon } = theme;
  const topRec = data.recommendations[0];

  if (compact) {
    return (
      <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${theme.container}`}>
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${theme.icon}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${theme.statusBadge}`}>
            {data.statusLabel}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{data.summary}</p>
        </div>
        {data.confidence !== "low" && (
          <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${theme.container}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${theme.statusBadge}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
              Block Intelligence
            </p>
            <span className={`text-xs font-bold ${theme.icon}`}>{data.statusLabel}</span>
          </div>
        </div>
        {data.confidence !== "low" && (
          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
            {data.confidence} confidence
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-[12px] text-foreground leading-relaxed">{data.summary}</p>

      {/* Coach insight */}
      <div className="bg-background/50 rounded-xl px-3 py-2.5 border border-border/40">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
          Coach
        </p>
        <p className="text-[11px] text-foreground/80 leading-relaxed">{data.coachInsight}</p>
      </div>

      {/* Top recommendation */}
      {topRec && topRec.priority !== "low" && (
        <div className={`rounded-xl px-3 py-2 border ${theme.statusBadge}`}>
          <p className="text-[10px] font-semibold leading-relaxed">{topRec.specifics}</p>
        </div>
      )}

      {/* Metric pills */}
      <div className="flex items-center gap-4 pt-1 flex-wrap">
        <MetricPill label="Compliance" value={data.metrics.weeklyComplianceScore} good="high" />
        <MetricPill label="Fatigue" value={data.metrics.weeklyFatigueScore} good="low" />
        <MetricPill label="Readiness" value={data.metrics.blockReadinessScore} good="high" />
        <MetricPill label="Momentum" value={data.metrics.progressMomentumScore} good="high" />
      </div>
    </div>
  );
}
