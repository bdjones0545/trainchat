import {
  TrendingUp,
  AlertCircle,
  Zap,
  Activity,
  Calendar,
  Moon,
  Watch,
  Brain,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

// ─── Types (mirrored from API) ─────────────────────────────────────────────────

export interface TrainingInsight {
  type: string;
  title: string;
  body: string;
  priority: number;
  triggerSource: string;
}

export interface UserMemory {
  id: number;
  type: string;
  subject: string;
  sentiment: string;
  confidence: number;
  detail: string;
}

interface Props {
  insights: TrainingInsight[];
  memories: UserMemory[];
  isLoading?: boolean;
}

// ─── Insight icon + color map ─────────────────────────────────────────────────

function insightConfig(type: string): {
  Icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
} {
  switch (type) {
    case "deload_suggestion":
      return { Icon: Moon, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" };
    case "progression_ready":
      return { Icon: TrendingUp, color: "text-primary", bg: "bg-primary/10 border-primary/20" };
    case "pain_warning":
      return { Icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" };
    case "consistency_positive":
      return { Icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" };
    case "schedule_review":
      return { Icon: Calendar, color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" };
    case "sleep_impact":
      return { Icon: Moon, color: "text-indigo-400", bg: "bg-indigo-400/10 border-indigo-400/20" };
    case "recovery_strength":
      return { Icon: Zap, color: "text-primary", bg: "bg-primary/10 border-primary/20" };
    case "tolerance_building":
      return { Icon: Activity, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" };
    case "program_evolution":
      return { Icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-400/10 border-violet-400/20" };
    default:
      return { Icon: Brain, color: "text-muted-foreground", bg: "bg-accent border-border" };
  }
}

// ─── Memory type label ────────────────────────────────────────────────────────

function memoryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    pain_pattern: "Pain",
    exercise_preference: "Pref",
    volume_response: "Volume",
    recovery_pattern: "Recovery",
    session_preference: "Session",
    split_preference: "Split",
    adherence_pattern: "Adherence",
  };
  return labels[type] ?? type;
}

function memoryChipColor(sentiment: string): string {
  if (sentiment === "negative") return "bg-red-400/10 border-red-400/25 text-red-400";
  if (sentiment === "positive") return "bg-primary/10 border-primary/25 text-primary";
  return "bg-accent border-border text-muted-foreground";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InsightsPanel({ insights, memories, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-accent/40 border border-border" />
        ))}
      </div>
    );
  }

  // Key memories to highlight — pain patterns first, then preferences, top 5
  const keyMemories = [
    ...memories.filter((m) => m.type === "pain_pattern" && m.confidence >= 3),
    ...memories.filter((m) => m.type !== "pain_pattern" && m.confidence >= 3),
  ].slice(0, 5);

  // Show top-priority insights (cap at 3)
  const topInsights = [...insights]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const hasContent = topInsights.length > 0 || keyMemories.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center">
          <Brain className="w-5 h-5 text-primary/40" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-1.5">Performance Intelligence</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[170px]">
            Log readiness check-ins and session feedback to unlock personalized insights.
          </p>
        </div>
        {/* Wearable placeholder */}
        <button className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[10px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all duration-150">
          <Watch className="w-3 h-3" />
          Connect wearable
          <ChevronRight className="w-2.5 h-2.5 opacity-50" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">

      {/* Insights */}
      {topInsights.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
              Agent Insights
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {topInsights.map((insight, idx) => {
              const { Icon, color, bg } = insightConfig(insight.type);
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 ${bg}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="min-w-0">
                      <p className={`text-[10px] font-semibold leading-tight mb-1 ${color}`}>
                        {insight.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {insight.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Memory highlights */}
      {keyMemories.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
              What I Know About You
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keyMemories.map((mem, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-semibold ${memoryChipColor(mem.sentiment)}`}
                title={mem.detail}
              >
                <span className="opacity-60">{memoryTypeLabel(mem.type)}:</span>
                <span className="truncate max-w-[110px]">{mem.subject}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wearable placeholder — subtle, at the bottom */}
      <div className="mt-1 pt-3 border-t border-border">
        <button className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg border border-border text-[10px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all duration-150 group">
          <div className="flex items-center gap-1.5">
            <Watch className="w-3 h-3" />
            <span>Connect wearable</span>
          </div>
          <ChevronRight className="w-3 h-3 opacity-40 group-hover:opacity-70 transition-opacity" />
        </button>
      </div>
    </div>
  );
}
