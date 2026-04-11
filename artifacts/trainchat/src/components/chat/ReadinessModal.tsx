import { useState } from "react";
import { X, Moon, Zap, Activity, Brain, Flame, AlertTriangle } from "lucide-react";
import { useCreateReadinessEntry } from "@workspace/api-client-react";
import AdaptationSummaryCard, { type AdaptationResult } from "./AdaptationSummaryCard";

interface ReadinessModalProps {
  onClose: () => void;
  onSubmit?: (adaptation: AdaptationResult | null) => void;
}

interface ReadinessScores {
  sleepScore: number;
  energyScore: number;
  sorenessScore: number;
  stressScore: number;
  motivationScore: number;
  painScore: number;
}

const METRICS = [
  {
    key: "sleepScore" as const,
    label: "Sleep",
    icon: Moon,
    lowLabel: "Terrible",
    highLabel: "Excellent",
    invertedColor: false,
  },
  {
    key: "energyScore" as const,
    label: "Energy",
    icon: Zap,
    lowLabel: "Depleted",
    highLabel: "High",
    invertedColor: false,
  },
  {
    key: "motivationScore" as const,
    label: "Motivation",
    icon: Flame,
    lowLabel: "None",
    highLabel: "High",
    invertedColor: false,
  },
  {
    key: "sorenessScore" as const,
    label: "Soreness",
    icon: Activity,
    lowLabel: "None",
    highLabel: "Severe",
    invertedColor: true,
  },
  {
    key: "stressScore" as const,
    label: "Stress",
    icon: Brain,
    lowLabel: "Low",
    highLabel: "Very High",
    invertedColor: true,
  },
  {
    key: "painScore" as const,
    label: "Pain",
    icon: AlertTriangle,
    lowLabel: "None",
    highLabel: "Significant",
    invertedColor: true,
  },
] as const;

function getScoreColor(score: number, inverted: boolean) {
  const effectiveScore = inverted ? 6 - score : score;
  if (effectiveScore >= 4) return "text-green-400";
  if (effectiveScore >= 3) return "text-yellow-400";
  return "text-red-400";
}

function getScoreLabel(score: number, inverted: boolean) {
  const level = inverted ? 6 - score : score;
  if (level >= 5) return "5";
  if (level >= 4) return "4";
  if (level >= 3) return "3";
  if (level >= 2) return "2";
  return "1";
}

export default function ReadinessModal({ onClose, onSubmit }: ReadinessModalProps) {
  const [scores, setScores] = useState<ReadinessScores>({
    sleepScore: 3,
    energyScore: 3,
    sorenessScore: 2,
    stressScore: 2,
    motivationScore: 3,
    painScore: 1,
  });
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [adaptation, setAdaptation] = useState<AdaptationResult | null>(null);

  const createReadiness = useCreateReadinessEntry();

  function handleScore(key: keyof ReadinessScores, value: number) {
    setScores((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit() {
    createReadiness.mutate(
      { data: { ...scores, notes: notes.trim() || undefined } },
      {
        onSuccess: (data: any) => {
          setAdaptation(data?.adaptation ?? null);
          setSubmitted(true);
        },
      }
    );
  }

  function handleDismiss() {
    onSubmit?.(adaptation);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
              Daily Check-In
            </p>
            <h2 className="text-base font-semibold text-foreground">How are you feeling?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metrics */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {METRICS.map(({ key, label, icon: Icon, lowLabel, highLabel, invertedColor }) => {
            const score = scores[key];
            const colorClass = getScoreColor(score, invertedColor);

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${colorClass}`}>
                    {score}/5
                  </span>
                </div>

                {/* Dot selector */}
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      onClick={() => handleScore(key, val)}
                      className={`flex-1 h-8 rounded-lg border text-xs font-semibold transition-all duration-100 ${
                        score === val
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{lowLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{highLabel}</span>
                </div>
              </div>
            );
          })}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth mentioning — a specific area, a tough week, etc."
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-all"
            />
          </div>
        </div>

        {/* Footer / Adaptation result */}
        <div className="px-5 pb-5 pt-3 border-t border-border">
          {submitted ? (
            adaptation ? (
              <AdaptationSummaryCard adaptation={adaptation} onDismiss={handleDismiss} />
            ) : (
              <div className="flex items-center justify-center gap-2 py-2.5">
                <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-medium text-green-400">Logged — your agent has it.</span>
              </div>
            )
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createReadiness.isPending}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
            >
              {createReadiness.isPending ? "Logging..." : "Log Check-In"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
