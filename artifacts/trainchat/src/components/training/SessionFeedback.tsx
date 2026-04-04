/**
 * SessionFeedback — Phase 5
 *
 * Post-session quick rating sheet. 3 dimensions + optional notes.
 * Submits to POST /api/session-feedback.
 */

import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

// ─── Rating configs ────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = [
  { value: 1, emoji: "😴", label: "Too easy" },
  { value: 2, emoji: "😊", label: "Easy" },
  { value: 3, emoji: "💪", label: "Right level" },
  { value: 4, emoji: "😅", label: "Hard" },
  { value: 5, emoji: "🥵", label: "Too hard" },
];

const PAIN_OPTIONS = [
  { value: 1, emoji: "✅", label: "None" },
  { value: 2, emoji: "😌", label: "Mild" },
  { value: 3, emoji: "😬", label: "Moderate" },
  { value: 4, emoji: "😣", label: "Significant" },
  { value: 5, emoji: "🚨", label: "Severe" },
];

const ENERGY_OPTIONS = [
  { value: 1, emoji: "🪫", label: "Drained" },
  { value: 2, emoji: "😔", label: "Tired" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "😊", label: "Good" },
  { value: 5, emoji: "⚡", label: "Energized" },
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface SessionFeedbackProps {
  sessionLabel?: string;
  onClose: () => void;
  onSubmitted: () => void;
}

// ─── Shared row ────────────────────────────────────────────────────────────

function RatingRow({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: { value: number; emoji: string; label: string }[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-foreground mb-2">{question}</p>
      <div className="flex gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
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
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function SessionFeedback({ sessionLabel, onClose, onSubmitted }: SessionFeedbackProps) {
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = difficulty !== null && pain !== null && energy !== null;

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      await customFetch("/api/session-feedback", {
        method: "POST",
        body: JSON.stringify({
          difficultyScore: difficulty,
          painResponseScore: pain,
          energyResponseScore: energy,
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-background rounded-t-2xl border-t border-border overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Session Feedback</h2>
            {sessionLabel && <p className="text-xs text-muted-foreground">{sessionLabel}</p>}
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
              <p className="text-sm font-bold text-foreground">Feedback logged</p>
              <p className="text-xs text-muted-foreground text-center">Your coach will use this to optimize upcoming sessions.</p>
            </div>
          ) : (
            <>
              <RatingRow
                question="How difficult was this session?"
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={setDifficulty}
              />
              <RatingRow
                question="Any pain or discomfort during the session?"
                options={PAIN_OPTIONS}
                value={pain}
                onChange={setPain}
              />
              <RatingRow
                question="How do you feel after finishing?"
                options={ENERGY_OPTIONS}
                value={energy}
                onChange={setEnergy}
              />

              <div>
                <p className="text-xs font-bold text-foreground mb-2">Anything else? (optional)</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pain location, exercise substitutions, performance notes..."
                  className="w-full h-20 px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  maxLength={500}
                />
              </div>
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
              {submitting ? "Saving feedback..." : "Submit Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
