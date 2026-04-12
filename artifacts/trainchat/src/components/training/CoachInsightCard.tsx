/**
 * CoachInsightCard
 *
 * Compact inline coaching recommendation shown after each completed set.
 * Appears between the last logged set and the next set row.
 * Non-intrusive: dismissable, small, action-optional.
 *
 * States:
 *  - on_track → soft green, no action button
 *  - adjust_load → amber, "Apply" adjusts remaining set weights
 *  - adjust_volume → red/amber, "Apply" reduces prescribed set count
 *  - adjust_rest → sky, informational only
 *  - review_form → amber, informational only
 *  - stop_exercise → red, "Stop exercise" action
 */

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  Clock,
  ShieldAlert,
  ChevronRight,
  X,
  Zap,
} from "lucide-react";
import type { LiveRecommendation, RecommendationStatus } from "@/lib/midSessionEngine";

interface CoachInsightCardProps {
  recommendation: LiveRecommendation;
  onApply?: (rec: LiveRecommendation) => void;
  onDismiss?: () => void;
  /** Don't animate in — render flat (for re-renders) */
  noAnimation?: boolean;
}

type CardTheme = {
  container: string;
  icon: string;
  badge: string;
  badgeLabel: string;
  Icon: React.ElementType;
};

function getTheme(status: RecommendationStatus): CardTheme {
  switch (status) {
    case "on_track":
      return {
        container: "border-green-500/20 bg-green-500/5",
        icon: "text-green-400",
        badge: "text-green-400 bg-green-500/10",
        badgeLabel: "On track",
        Icon: CheckCircle2,
      };
    case "adjust_load":
      return {
        container: "border-amber-500/25 bg-amber-500/6",
        icon: "text-amber-400",
        badge: "text-amber-400 bg-amber-500/10",
        badgeLabel: "Adjust load",
        Icon: TrendingDown,
      };
    case "adjust_volume":
      return {
        container: "border-red-500/25 bg-red-500/6",
        icon: "text-red-400",
        badge: "text-red-400 bg-red-500/10",
        badgeLabel: "Reduce volume",
        Icon: AlertTriangle,
      };
    case "adjust_rest":
      return {
        container: "border-sky-500/25 bg-sky-500/5",
        icon: "text-sky-400",
        badge: "text-sky-400 bg-sky-500/10",
        badgeLabel: "Rest more",
        Icon: Clock,
      };
    case "review_form":
      return {
        container: "border-amber-500/25 bg-amber-500/6",
        icon: "text-amber-400",
        badge: "text-amber-400 bg-amber-500/10",
        badgeLabel: "Check form",
        Icon: Zap,
      };
    case "stop_exercise":
      return {
        container: "border-red-500/30 bg-red-500/8",
        icon: "text-red-400",
        badge: "text-red-400 bg-red-500/10",
        badgeLabel: "Stop exercise",
        Icon: ShieldAlert,
      };
    default:
      return {
        container: "border-border bg-muted/10",
        icon: "text-muted-foreground",
        badge: "text-muted-foreground bg-muted/20",
        badgeLabel: "Coach",
        Icon: CheckCircle2,
      };
  }
}

export default function CoachInsightCard({
  recommendation,
  onApply,
  onDismiss,
  noAnimation = false,
}: CoachInsightCardProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!noAnimation) {
      const t = setTimeout(() => setVisible(true), 60);
      return () => clearTimeout(t);
    }
    setVisible(true);
    return undefined;
  }, [noAnimation]);

  if (dismissed) return null;

  const theme = getTheme(recommendation.status);
  const { Icon } = theme;
  const showApplyButton = recommendation.isActionable && !!onApply && recommendation.status !== "on_track";
  const showDismiss = recommendation.status === "on_track" || !showApplyButton;

  function handleApply() {
    onApply?.(recommendation);
    setDismissed(true);
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div
      className={`
        rounded-xl border px-3 py-2.5 transition-all duration-300
        ${theme.container}
        ${visible && !noAnimation ? "opacity-100 translate-y-0" : !noAnimation ? "opacity-0 translate-y-1" : "opacity-100"}
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3 h-3 flex-shrink-0 ${theme.icon}`} />
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${theme.badge}`}>
            {theme.badgeLabel}
          </span>
        </div>
        {showDismiss && (
          <button
            onClick={handleDismiss}
            type="button"
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Message */}
      <p className="text-[11px] text-foreground leading-relaxed">{recommendation.message}</p>

      {/* Extra rest indicator */}
      {recommendation.extraRestSec !== null && (
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          ↳ Rest {recommendation.extraRestSec >= 60
            ? `${Math.round(recommendation.extraRestSec / 60)} min`
            : `${recommendation.extraRestSec} sec`} before the next set
        </p>
      )}

      {/* Action buttons */}
      {showApplyButton && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleApply}
            type="button"
            className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
              recommendation.status === "stop_exercise"
                ? "text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/15"
                : "text-foreground border-border/60 bg-muted/30 hover:bg-muted/50"
            }`}
          >
            {recommendation.action} <ChevronRight className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={handleDismiss}
            type="button"
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-2"
          >
            Keep plan
          </button>
        </div>
      )}
    </div>
  );
}
