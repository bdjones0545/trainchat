/**
 * InsightsPanel — Phase 5
 *
 * Proactive coach insights panel. Fetches GET /api/insights and renders up to 3
 * actionable insight cards. Each card offers: Apply (auto-execute), Modify (prefill
 * EditDrawer), and Dismiss (local state only).
 *
 * Non-intrusive: collapses to nothing when there are no insights. Each panel is
 * dismissible without spamming the user.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Moon,
  Heart,
  Zap,
  RefreshCcw,
  Loader2,
  X,
  ChevronRight,
  Sparkles,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

export type InsightType =
  | "deload_suggestion"
  | "progression_ready"
  | "pain_warning"
  | "consistency_positive"
  | "schedule_review"
  | "sleep_impact"
  | "recovery_strength"
  | "tolerance_building"
  | "program_evolution";

export interface TrainingInsight {
  type: InsightType;
  title: string;
  body: string;
  priority: number;
  triggerSource: string;
}

interface InsightApplyResult {
  intent: string;
  scope: string;
  changeSummary: string;
  appliedCount: number;
  changedIds: {
    exercises: number[];
    sessions: number[];
    weeks: number[];
    phases: number[];
  };
  changeLogId?: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const INSIGHT_CONFIG: Record<InsightType, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badgeColor: string;
  dotColor: string;
}> = {
  deload_suggestion:   { icon: TrendingDown, color: "text-amber-500",  badgeColor: "bg-amber-500/10 text-amber-500 border-amber-500/20",  dotColor: "bg-amber-500" },
  progression_ready:   { icon: TrendingUp,   color: "text-green-500",  badgeColor: "bg-green-500/10 text-green-500 border-green-500/20",  dotColor: "bg-green-500" },
  pain_warning:        { icon: AlertTriangle, color: "text-red-500",   badgeColor: "bg-red-500/10 text-red-500 border-red-500/20",        dotColor: "bg-red-500" },
  consistency_positive:{ icon: CheckCircle2, color: "text-green-400",  badgeColor: "bg-green-500/10 text-green-400 border-green-500/20",  dotColor: "bg-green-400" },
  schedule_review:     { icon: Calendar,     color: "text-blue-400",   badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",     dotColor: "bg-blue-400" },
  sleep_impact:        { icon: Moon,         color: "text-violet-400", badgeColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",dotColor: "bg-violet-400" },
  recovery_strength:   { icon: Heart,        color: "text-green-500",  badgeColor: "bg-green-500/10 text-green-500 border-green-500/20",  dotColor: "bg-green-500" },
  tolerance_building:  { icon: Zap,          color: "text-primary",    badgeColor: "bg-primary/10 text-primary border-primary/20",        dotColor: "bg-primary" },
  program_evolution:   { icon: RefreshCcw,   color: "text-orange-400", badgeColor: "bg-orange-500/10 text-orange-400 border-orange-500/20",dotColor: "bg-orange-400" },
};

// ─── Apply state per insight ──────────────────────────────────────────────

type InsightState = "idle" | "applying" | "applied" | "error";

// ─── InsightCard ───────────────────────────────────────────────────────────

interface InsightCardProps {
  insight: TrainingInsight;
  onDismiss: () => void;
  onApply: (insight: TrainingInsight) => Promise<InsightApplyResult>;
  onModify: (prefill: string) => void;
  onApplied: (result: InsightApplyResult) => void;
}


function InsightCard({ insight, onDismiss, onApply, onModify, onApplied }: InsightCardProps) {
  const [state, setState] = useState<InsightState>("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const config = INSIGHT_CONFIG[insight.type] ?? INSIGHT_CONFIG.tolerance_building;
  const Icon = config.icon;

  async function handleApply() {
    setState("applying");
    try {
      const result = await onApply(insight);
      setSummary(result.changeSummary);
      setState("applied");
      onApplied(result);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`w-9 h-9 rounded-xl ${config.badgeColor} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon className={`w-4.5 h-4.5 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <p className="text-sm font-bold text-foreground leading-tight flex-1">{insight.title}</p>
            {insight.priority >= 4 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">
                Priority
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.body}</p>
        </div>
        <button
          onClick={onDismiss}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Success state */}
      {state === "applied" && summary && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 bg-green-500/8 border border-green-500/20 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-green-400 leading-relaxed">{summary}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="px-4 pb-3">
          <p className="text-xs text-red-400">Failed to apply — please try again or use Modify.</p>
        </div>
      )}

      {/* Action row */}
      {state === "idle" && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3 h-3" />
            Apply
          </button>
          <button
            onClick={() => onModify(`${insight.title}: ${insight.body}`)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted/80 transition-colors"
          >
            Modify
            <ChevronRight className="w-3 h-3" />
          </button>
          <span className="flex-1" />
          <span className={`w-2 h-2 rounded-full ${config.dotColor} flex-shrink-0`} />
        </div>
      )}

      {state === "applying" && (
        <div className="px-4 pb-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <span className="text-xs text-muted-foreground">Applying suggestion...</span>
        </div>
      )}

      {state === "applied" && (
        <div className="px-4 pb-4 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-400 font-semibold">Applied to your system</span>
        </div>
      )}
    </div>
  );
}

// ─── Main InsightsPanel ────────────────────────────────────────────────────

interface InsightsPanelProps {
  onApplied: (result: InsightApplyResult) => void;
  onModify: (prefill: string) => void;
}

export default function InsightsPanel({ onApplied, onModify }: InsightsPanelProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<InsightType>>(new Set());

  const { data: insights, isLoading } = useQuery<TrainingInsight[]>({
    queryKey: ["insights"],
    queryFn: () => customFetch<TrainingInsight[]>("/api/insights"),
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: false,
  });

  const visible = (insights ?? []).filter((i) => !dismissed.has(i.type)).slice(0, 3);

  async function applyInsight(insight: TrainingInsight): Promise<InsightApplyResult> {
    const result = await customFetch<InsightApplyResult>("/api/insights/apply", {
      method: "POST",
      body: JSON.stringify({ insightType: insight.type, insightTitle: insight.title }),
    });
    // Invalidate all training queries after apply
    await queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
    await queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
    await queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
    await queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
    return result;
  }

  function handleModify(prefill: string) {
    onModify(prefill);
  }

  if (isLoading) return null; // silent while loading
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
          <Brain className="w-3 h-3 text-primary" />
        </div>
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Coach Insights</span>
        <span className="text-xs text-muted-foreground">
          {visible.length} suggestion{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {visible.map((insight) => (
        <InsightCard
          key={insight.type}
          insight={insight}
          onDismiss={() => setDismissed((s) => new Set([...s, insight.type]))}
          onApply={applyInsight}
          onModify={handleModify}
          onApplied={onApplied}
        />
      ))}
    </div>
  );
}
