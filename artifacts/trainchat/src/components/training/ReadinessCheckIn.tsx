/**
 * ReadinessCheckIn — Phase 5
 *
 * Daily check-in bottom sheet. 6 emoji-scored dimensions (1-5).
 * Fast to complete (<10 seconds), mobile-first, non-intrusive.
 */

import { useState } from "react";
import { X, CheckCircle2, ChevronDown } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

// ─── Score configs ─────────────────────────────────────────────────────────

interface ScoreDimension {
  key: string;
  label: string;
  description: string;
  options: { value: number; emoji: string; label: string }[];
}

const DIMENSIONS: ScoreDimension[] = [
  {
    key: "sleepScore",
    label: "Sleep",
    description: "How did you sleep?",
    options: [
      { value: 1, emoji: "😫", label: "Very poor" },
      { value: 2, emoji: "😔", label: "Poor" },
      { value: 3, emoji: "😐", label: "Fair" },
      { value: 4, emoji: "😊", label: "Good" },
      { value: 5, emoji: "😴", label: "Excellent" },
    ],
  },
  {
    key: "energyScore",
    label: "Energy",
    description: "Energy level right now?",
    options: [
      { value: 1, emoji: "🪫", label: "Empty" },
      { value: 2, emoji: "😩", label: "Low" },
      { value: 3, emoji: "⚡", label: "Moderate" },
      { value: 4, emoji: "🔋", label: "High" },
      { value: 5, emoji: "🚀", label: "Peak" },
    ],
  },
  {
    key: "sorenessScore",
    label: "Soreness",
    description: "Muscle soreness today?",
    options: [
      { value: 1, emoji: "✅", label: "None" },
      { value: 2, emoji: "😌", label: "Mild" },
      { value: 3, emoji: "😬", label: "Moderate" },
      { value: 4, emoji: "😣", label: "Significant" },
      { value: 5, emoji: "🔥", label: "Severe" },
    ],
  },
  {
    key: "stressScore",
    label: "Stress",
    description: "Life stress / mental load?",
    options: [
      { value: 1, emoji: "🧘", label: "Very low" },
      { value: 2, emoji: "😊", label: "Low" },
      { value: 3, emoji: "😤", label: "Moderate" },
      { value: 4, emoji: "😰", label: "High" },
      { value: 5, emoji: "🤯", label: "Very high" },
    ],
  },
  {
    key: "motivationScore",
    label: "Motivation",
    description: "Drive to train today?",
    options: [
      { value: 1, emoji: "😴", label: "None" },
      { value: 2, emoji: "😔", label: "Low" },
      { value: 3, emoji: "😐", label: "Okay" },
      { value: 4, emoji: "💪", label: "Ready" },
      { value: 5, emoji: "🔥", label: "Pumped" },
    ],
  },
  {
    key: "painScore",
    label: "Pain / Discomfort",
    description: "Any pain or injury today?",
    options: [
      { value: 1, emoji: "✅", label: "None" },
      { value: 2, emoji: "😌", label: "Mild" },
      { value: 3, emoji: "😬", label: "Moderate" },
      { value: 4, emoji: "😣", label: "Significant" },
      { value: 5, emoji: "🚨", label: "Severe" },
    ],
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────

type Scores = Record<string, number>;

interface ReadinessCheckInProps {
  onClose: () => void;
  onSubmitted: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ReadinessCheckIn({ onClose, onSubmitted }: ReadinessCheckInProps) {
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = DIMENSIONS.every((d) => scores[d.key] !== undefined);

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      await customFetch("/api/readiness", {
        method: "POST",
        body: JSON.stringify({
          sleepScore: scores.sleepScore,
          energyScore: scores.energyScore,
          sorenessScore: scores.sorenessScore,
          stressScore: scores.stressScore,
          motivationScore: scores.motivationScore,
          painScore: scores.painScore,
          notes: notes.trim() || null,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1200);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-background rounded-t-2xl border-t border-border overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Daily Check-In</h2>
            <p className="text-xs text-muted-foreground">
              {allAnswered ? "All done — ready to submit" : `${Object.keys(scores).length} of ${DIMENSIONS.length} answered`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <p className="text-sm font-bold text-foreground">Check-in logged</p>
              <p className="text-xs text-muted-foreground text-center">Your coach is now aware of how you're feeling today.</p>
            </div>
          ) : (
            <>
              {DIMENSIONS.map((dim) => (
                <div key={dim.key}>
                  <p className="text-xs font-bold text-foreground mb-2">{dim.description}</p>
                  <div className="flex gap-2">
                    {dim.options.map((opt) => {
                      const selected = scores[dim.key] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setScores((s) => ({ ...s, [dim.key]: opt.value }))}
                          className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all duration-150 ${
                            selected
                              ? "bg-primary/10 border-primary/40 ring-2 ring-primary/30"
                              : "bg-muted/30 border-border hover:bg-muted/60"
                          }`}
                        >
                          <span className="text-xl leading-none">{opt.emoji}</span>
                          <span className={`text-[10px] font-semibold leading-tight ${selected ? "text-primary" : "text-muted-foreground"}`}>
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Notes toggle */}
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showNotes ? "rotate-180" : ""}`} />
                Add a note (optional)
              </button>
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any context for your coach... (pain location, sleep issues, life stress, etc.)"
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
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {submitting ? "Logging check-in..." : "Log Check-In"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
