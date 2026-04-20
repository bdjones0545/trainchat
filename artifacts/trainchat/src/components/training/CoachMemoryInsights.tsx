/**
 * CoachMemoryInsights — surfaces high-confidence learned patterns to the user
 * in plain coach language. Appears in the Block tab.
 *
 * Focus-aware: insights relevant to the current focus mode surface first.
 * Only shows when there are ≥1 insight with confidence ≥3.
 * Fades in when the data arrives — silent when empty.
 */

import { useQuery } from "@tanstack/react-query";
import { Brain, TrendingUp, TrendingDown, Clock, Calendar, Dumbbell, Zap, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusMode } from "@/hooks/useFocusMode";
import type { FocusMode } from "@/lib/focusMode";

interface MemoryInsight {
  id: number;
  type: string;
  subject: string;
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  confidenceLabel: "emerging" | "clear" | "strong";
  coachMessage: string;
  updatedAt: string;
}

interface InsightsResponse {
  insights: MemoryInsight[];
  total: number;
}

async function fetchMemoryInsights(): Promise<InsightsResponse> {
  const res = await fetch("/api/memories/insights", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch memory insights");
  return res.json();
}

const FOCUS_KEYWORDS: Record<FocusMode, string[]> = {
  strength: ["strength", "hypertrophy", "power", "load", "lifting", "compound", "neural"],
  speed: ["speed", "acceleration", "reactive", "footwork", "sprint", "lateral", "change of direction", "cod", "velocity"],
  mobility: ["mobility", "hip", "thoracic", "end-range", "range of motion", "flexibility", "joint", "restoration"],
};

function scoreInsightForFocus(insight: MemoryInsight, focus: FocusMode): number {
  const keywords = FOCUS_KEYWORDS[focus] ?? [];
  const text = `${insight.subject} ${insight.coachMessage}`.toLowerCase();
  return keywords.reduce((score, kw) => score + (text.includes(kw) ? 1 : 0), 0);
}

function iconForType(type: string, sentiment: string) {
  const cls = "w-3.5 h-3.5 shrink-0";
  if (type === "session_preference") return <Clock className={cls} />;
  if (type === "split_preference") return <Calendar className={cls} />;
  if (type === "exercise_preference") return <Dumbbell className={cls} />;
  if (type === "volume_response") return sentiment === "positive" ? <TrendingUp className={cls} /> : <TrendingDown className={cls} />;
  if (type === "recovery_pattern") return <Zap className={cls} />;
  if (type === "adherence_pattern") return <Activity className={cls} />;
  if (type === "pain_pattern") return <Activity className={cls} />;
  return <Brain className={cls} />;
}

function sentimentColor(sentiment: string): string {
  if (sentiment === "positive") return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50";
  if (sentiment === "negative") return "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50";
  return "text-muted-foreground bg-muted/40 border-border";
}

export default function CoachMemoryInsights() {
  const { focusMode } = useFocusMode();
  const { data, isLoading, isError } = useQuery<InsightsResponse>({
    queryKey: ["memory-insights"],
    queryFn: fetchMemoryInsights,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || isError || !data || data.insights.length === 0) return null;

  const sortedInsights = [...data.insights].sort((a, b) => {
    const aScore = scoreInsightForFocus(a, focusMode);
    const bScore = scoreInsightForFocus(b, focusMode);
    if (bScore !== aScore) return bScore - aScore;
    return b.confidence - a.confidence;
  });

  console.log(`[CoachMemoryInsights][FocusMode=${focusMode}] Rendering ${sortedInsights.length} insights, top subject: "${sortedInsights[0]?.subject}"`);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Brain className="w-3.5 h-3.5 text-primary/70" />
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
          What your coach has learned
        </span>
      </div>

      <div className="space-y-1.5">
        {sortedInsights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
              sentimentColor(insight.sentiment),
            )}
          >
            <span className="mt-0.5">
              {iconForType(insight.type, insight.sentiment)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-relaxed font-medium">
                {insight.coachMessage}
              </p>
            </div>
            {insight.confidence >= 4 && (
              <span className="shrink-0 mt-0.5 text-[10px] font-semibold opacity-60 uppercase tracking-wide">
                {insight.confidenceLabel}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
