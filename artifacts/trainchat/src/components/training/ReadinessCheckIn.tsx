/**
 * ReadinessCheckIn — Daily check-in bottom sheet.
 * 6 emoji-scored dimensions (1-5). Mobile-first, coach-like, non-intrusive.
 * Dimensions ordered by coaching priority: Sleep → Energy → Soreness → Pain → Stress → Motivation
 * Check-in saves and evaluates readiness — plan changes only happen on user confirmation.
 */

import { useState } from "react";
import { X, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import AdaptationSummaryCard, { type AdaptationResult } from "@/components/chat/AdaptationSummaryCard";

// ─── Score configs ─────────────────────────────────────────────────────────

interface ScoreDimension {
  key: string;
  label: string;
  description: string;
  options: { value: number; emoji: string; label: string }[];
}

const DIMENSIONS: ScoreDimension[] = [
  {
    key: "sleepScore", label: "Sleep", description: "How did you sleep last night?",
    options: [
      { value: 1, emoji: "😫", label: "Very poor" },
      { value: 2, emoji: "😔", label: "Poor" },
      { value: 3, emoji: "😐", label: "Fair" },
      { value: 4, emoji: "😊", label: "Good" },
      { value: 5, emoji: "😴", label: "Excellent" },
    ],
  },
  {
    key: "energyScore", label: "Energy", description: "How's your energy right now?",
    options: [
      { value: 1, emoji: "🪫", label: "Empty" },
      { value: 2, emoji: "😩", label: "Low" },
      { value: 3, emoji: "⚡", label: "Moderate" },
      { value: 4, emoji: "🔋", label: "High" },
      { value: 5, emoji: "🚀", label: "Peak" },
    ],
  },
  {
    key: "sorenessScore", label: "Soreness", description: "How's the body holding up?",
    options: [
      { value: 1, emoji: "✅", label: "None" },
      { value: 2, emoji: "😌", label: "Mild" },
      { value: 3, emoji: "😬", label: "Moderate" },
      { value: 4, emoji: "😣", label: "Significant" },
      { value: 5, emoji: "🔥", label: "Severe" },
    ],
  },
  {
    key: "painScore", label: "Pain", description: "Any pain or injury today?",
    options: [
      { value: 1, emoji: "✅", label: "None" },
      { value: 2, emoji: "😌", label: "Mild" },
      { value: 3, emoji: "😬", label: "Moderate" },
      { value: 4, emoji: "😣", label: "Significant" },
      { value: 5, emoji: "🚨", label: "Severe" },
    ],
  },
  {
    key: "stressScore", label: "Stress", description: "Mental load today?",
    options: [
      { value: 1, emoji: "🧘", label: "Very low" },
      { value: 2, emoji: "😊", label: "Low" },
      { value: 3, emoji: "😤", label: "Moderate" },
      { value: 4, emoji: "😰", label: "High" },
      { value: 5, emoji: "🤯", label: "Very high" },
    ],
  },
  {
    key: "motivationScore", label: "Motivation", description: "Drive to train today?",
    options: [
      { value: 1, emoji: "😴", label: "None" },
      { value: 2, emoji: "😔", label: "Low" },
      { value: 3, emoji: "😐", label: "Okay" },
      { value: 4, emoji: "💪", label: "Ready" },
      { value: 5, emoji: "🔥", label: "Pumped" },
    ],
  },
];

type Scores = Record<string, number>;

interface ReadinessCheckInProps {
  onClose: () => void;
  onSubmitted: (adaptation: AdaptationResult | null) => void;
}

export default function ReadinessCheckIn({ onClose, onSubmitted }: ReadinessCheckInProps) {
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adaptation, setAdaptation] = useState<AdaptationResult | null>(null);

  const answeredCount = Object.keys(scores).length;
  const totalCount = DIMENSIONS.length;
  const allAnswered = answeredCount === totalCount;
  const progressPct = Math.round((answeredCount / totalCount) * 100);

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const scorePayload = {
        sleepScore: scores.sleepScore,
        energyScore: scores.energyScore,
        sorenessScore: scores.sorenessScore,
        stressScore: scores.stressScore,
        motivationScore: scores.motivationScore,
        painScore: scores.painScore,
      };
      const data = await customFetch<any>("/api/readiness", {
        method: "POST",
        body: JSON.stringify({ ...scorePayload, notes: notes.trim() || null }),
      });
      const raw = data?.adaptation ?? null;
      if (raw) {
        const enriched: AdaptationResult = {
          ...raw,
          readinessEntryId: data?.id,
          scores: scorePayload,
        };
        setAdaptation(enriched);
      } else {
        setAdaptation(null);
      }
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  }

  function handleDismiss(_applied?: boolean) {
    onSubmitted(adaptation);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-background rounded-t-2xl border-t border-border overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Daily Check-In</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {submitted
                ? "Check-in logged"
                : allAnswered
                ? "All done — ready to submit"
                : `${answeredCount} of ${totalCount} answered`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center hover:bg-muted text-muted-foreground ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        {!submitted && (
          <div className="h-0.5 bg-border flex-shrink-0">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {submitted ? (
            adaptation ? (
              <AdaptationSummaryCard adaptation={adaptation} onDismiss={handleDismiss} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-sm font-bold text-foreground">Check-in saved</p>
                <p className="text-xs text-muted-foreground text-center max-w-[240px]">
                  Your coach has been updated. Signals are good — train as planned.
                </p>
                <button
                  onClick={() => handleDismiss()}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Close
                </button>
              </div>
            )
          ) : (
            <>
              {DIMENSIONS.map((dim) => {
                const selected = scores[dim.key];
                const isAnswered = selected !== undefined;
                return (
                  <div key={dim.key}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-foreground">{dim.description}</p>
                      {isAnswered && (
                        <span className="text-[10px] font-semibold text-primary">
                          {dim.options.find((o) => o.value === selected)?.label}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {dim.options.map((opt) => {
                        const isSelected = selected === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setScores((s) => ({ ...s, [dim.key]: opt.value }))}
                            className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all duration-150 active:scale-95 ${
                              isSelected
                                ? "bg-primary/10 border-primary/40 ring-2 ring-primary/30 scale-[1.03]"
                                : "bg-muted/30 border-border hover:bg-muted/60"
                            }`}
                          >
                            <span className="text-xl leading-none">{opt.emoji}</span>
                            <span
                              className={`text-[10px] font-semibold leading-tight ${
                                isSelected ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Notes toggle */}
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNotes ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                Add a note for your coach (optional)
              </button>
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any context… pain location, bad night's sleep, life stress, travel, etc."
                  className="w-full h-20 px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  maxLength={500}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!submitted && (
          <div className="px-5 py-4 border-t border-border flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                allAnswered && !submitting
                  ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {submitting ? "Updating your coach..." : "Update My Coach"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
