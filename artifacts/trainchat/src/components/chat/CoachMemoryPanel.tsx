/**
 * Coach Memory Panel
 *
 * Lightweight "What TrainChat knows about you" surface.
 * Shows the active coaching memories derived from conversations, readiness,
 * session feedback, and onboarding — grouped by category.
 *
 * Accessible via the brain/memory button in the TopNav area.
 * Trust-building: shows exactly what the system is using to coach the user.
 * Clean and minimal. Not a settings panel. Not an audit log.
 *
 * Tone: transparent and direct. No jargon. Plain coaching language.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { X, Brain, CheckCircle, Clock, Activity, Dumbbell, Heart, Star, Trash2 } from "lucide-react";

// ─── Types (mirror server) ────────────────────────────────────────────────────

interface MemoryEntry {
  id: number;
  type: string;
  subject: string;
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  source: string;
  detail: string;
  updatedAt: string;
}

interface Props {
  onClose: () => void;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
}> = {
  sport_context: {
    label: "Sport & Athletic Context",
    icon: Activity,
    color: "text-blue-400",
    description: "Your sporting background",
  },
  pain_pattern: {
    label: "Limitations & Pain Patterns",
    icon: Heart,
    color: "text-red-400",
    description: "Recurring discomfort or limitations",
  },
  exercise_preference: {
    label: "Exercise & Equipment",
    icon: Dumbbell,
    color: "text-primary",
    description: "Equipment access and exercise history",
  },
  training_preference: {
    label: "Training Emphasis",
    icon: Star,
    color: "text-amber-400",
    description: "Preferred programming approach",
  },
  time_constraint: {
    label: "Session Time",
    icon: Clock,
    color: "text-violet-400",
    description: "Available training window",
  },
  session_preference: {
    label: "Session Preferences",
    icon: CheckCircle,
    color: "text-emerald-400",
    description: "Format and structure preferences",
  },
  volume_response: {
    label: "Volume & Intensity Response",
    icon: Activity,
    color: "text-orange-400",
    description: "How you respond to training load",
  },
  recovery_pattern: {
    label: "Recovery Patterns",
    icon: Heart,
    color: "text-sky-400",
    description: "Sleep and recovery tendencies",
  },
  split_preference: {
    label: "Schedule & Structure",
    icon: CheckCircle,
    color: "text-teal-400",
    description: "Training frequency and split preference",
  },
  adherence_pattern: {
    label: "Consistency",
    icon: Activity,
    color: "text-indigo-400",
    description: "Training adherence patterns",
  },
  communication_preference: {
    label: "Coaching Style",
    icon: Brain,
    color: "text-fuchsia-400",
    description: "Preferred communication tone",
  },
};

const DISPLAY_ORDER = [
  "sport_context",
  "pain_pattern",
  "exercise_preference",
  "training_preference",
  "time_constraint",
  "volume_response",
  "recovery_pattern",
  "session_preference",
  "split_preference",
  "adherence_pattern",
  "communication_preference",
];

// ─── Source badge ─────────────────────────────────────────────────────────────

function sourceBadge(source: string): string {
  switch (source) {
    case "onboarding": return "Setup";
    case "feedback": return "Session feedback";
    case "readiness": return "Check-ins";
    case "conversation": return "Conversation";
    case "inferred": return "Observed";
    default: return source;
  }
}

// ─── Sentiment to label ────────────────────────────────────────────────────────

function sentimentNote(sentiment: string, type: string): string | null {
  if (type === "pain_pattern" && sentiment === "negative") return "Active limitation";
  if (type === "volume_response" && sentiment === "negative") return "Below current capacity";
  if (type === "volume_response" && sentiment === "positive") return "Handling load well";
  if (type === "recovery_pattern" && sentiment === "negative") return "Recovery under pressure";
  if (type === "recovery_pattern" && sentiment === "positive") return "Recovery strong";
  return null;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyMemory() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/10 border border-border/30 flex items-center justify-center mb-3">
        <Brain className="w-5 h-5 text-muted-foreground/30" />
      </div>
      <p className="text-[11px] font-semibold text-foreground mb-1">Building your coaching profile</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[220px]">
        Memory grows as you train, check in, and have more conversations. Log sessions and readiness to activate this.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CoachMemoryPanel({ onClose }: Props) {
  const queryClient = useQueryClient();

  const { data: memories, isLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["memories"],
    queryFn: () => customFetch<MemoryEntry[]>("/api/memories"),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: number) =>
      customFetch<{ deleted: boolean }>(`/api/memories/${memoryId}`, {
        method: "DELETE",
      }),
    onMutate: async (memoryId) => {
      await queryClient.cancelQueries({ queryKey: ["memories"] });
      const previous = queryClient.getQueryData<MemoryEntry[]>(["memories"]);
      queryClient.setQueryData<MemoryEntry[]>(["memories"], (old) =>
        (old ?? []).filter((m) => m.id !== memoryId)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  // Group by type, filter confidence >= 2
  const grouped = new Map<string, MemoryEntry[]>();
  (memories ?? []).filter((m) => m.confidence >= 2).forEach((m) => {
    const existing = grouped.get(m.type) ?? [];
    existing.push(m);
    grouped.set(m.type, existing);
  });

  const hasMemories = grouped.size > 0;

  function summarize(detail: string): string {
    return detail;
  }

  return (
    <div className="flex flex-col h-full max-h-[90vh] w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <div>
            <p className="text-[11px] font-bold text-foreground">Coaching Memory</p>
            <p className="text-[9px] text-muted-foreground">What the system knows about your training</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading && (
          <div className="flex flex-col gap-2.5 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/10 animate-pulse border border-border/20" />
            ))}
          </div>
        )}

        {!isLoading && !hasMemories && <EmptyMemory />}

        {!isLoading && hasMemories && DISPLAY_ORDER.map((type) => {
          const entries = grouped.get(type);
          if (!entries || entries.length === 0) return null;
          const config = CATEGORY_CONFIG[type] ?? {
            label: type.replace(/_/g, " "),
            icon: Brain,
            color: "text-primary",
            description: "",
          };
          const Icon = config.icon;

          return (
            <div key={type}>
              {/* Category header */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`w-3 h-3 ${config.color} flex-shrink-0`} />
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{config.label}</span>
              </div>

              {/* Entries */}
              <div className="space-y-1.5 pl-4">
                {entries.map((entry) => {
                  const note = sentimentNote(entry.sentiment, entry.type);
                  const isDeleting = deleteMutation.isPending && deleteMutation.variables === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`group rounded-lg border border-border/30 bg-muted/5 px-3 py-2 transition-opacity ${isDeleting ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] text-foreground/85 leading-relaxed flex-1">{summarize(entry.detail)}</p>
                        <button
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={isDeleting || deleteMutation.isPending}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-400/70 hover:bg-red-400/10 transition-all mt-0.5"
                          title="Remove this memory"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8.5px] text-muted-foreground/50">{sourceBadge(entry.source)}</span>
                        {entry.confidence >= 4 && (
                          <span className="text-[8.5px] text-primary/60 font-medium">High confidence</span>
                        )}
                        {note && (
                          <span className={`text-[8.5px] font-medium ${entry.sentiment === "negative" ? "text-amber-400/70" : "text-emerald-400/70"}`}>
                            {note}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer note */}
        {hasMemories && (
          <div className="pt-2 pb-1">
            <p className="text-[9px] text-muted-foreground/40 text-center leading-relaxed">
              Memory grows as you train and check in.
              <br />
              Hover any item to remove it if it's incorrect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
