/**
 * SessionFeedback — Workout Completion + Feedback Loop
 *
 * Post-session quick feedback sheet.
 * Captures: completion status, difficulty, pain, energy, enjoyment, pain areas.
 * Submits to POST /api/session-logs (unified workout completion endpoint).
 * Returns and displays a coach-style session recap.
 */

import { useState } from "react";
import { X, CheckCircle2, ChevronRight } from "lucide-react";
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

const ENJOYMENT_OPTIONS = [
  { value: 1, emoji: "😩", label: "Didn't enjoy" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🔥", label: "Loved it" },
];

const PAIN_AREAS = [
  { key: "knee",       label: "Knee" },
  { key: "lower_back", label: "Lower back" },
  { key: "shoulder",   label: "Shoulder" },
  { key: "hip",        label: "Hip" },
  { key: "elbow",      label: "Elbow" },
  { key: "wrist",      label: "Wrist" },
  { key: "ankle",      label: "Ankle" },
  { key: "neck",       label: "Neck" },
  { key: "upper_back", label: "Upper back" },
];

const DURATION_CHIPS = [
  { value: 20,  label: "20 min" },
  { value: 30,  label: "30 min" },
  { value: 45,  label: "45 min" },
  { value: 60,  label: "60 min" },
  { value: 75,  label: "75 min" },
  { value: 90,  label: "90+ min" },
];

type SessionStatus = "completed" | "partial" | "skipped";

const STATUS_OPTIONS: { value: SessionStatus; label: string; emoji: string; color: string; selected: string }[] = [
  { value: "completed", label: "Completed",  emoji: "✅", color: "border-border bg-muted/30",         selected: "bg-green-500/10 border-green-500/40 ring-2 ring-green-500/20" },
  { value: "partial",   label: "Partial",    emoji: "⏭️", color: "border-border bg-muted/30",         selected: "bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20" },
  { value: "skipped",   label: "Skipped",    emoji: "⏸️", color: "border-border bg-muted/30",         selected: "bg-blue-500/10 border-blue-500/40 ring-2 ring-blue-500/20" },
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface SessionFeedbackProps {
  sessionLabel?: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface SessionRecap {
  headline: string;
  message: string;
  flags: { type: string; detail: string }[];
}

// ─── Shared components ─────────────────────────────────────────────────────

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
      <div className="flex gap-1.5">
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

// ─── Session Recap Card ────────────────────────────────────────────────────

function SessionRecapCard({ recap, onClose }: { recap: SessionRecap; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-6 px-1">
      <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-7 h-7 text-green-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-foreground">{recap.headline}</p>
      </div>
      <div className="bg-muted/40 border border-border rounded-xl px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{recap.message}</p>
      </div>
      {recap.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recap.flags.map((flag, i) => (
            <span
              key={i}
              className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
                flag.type === "pain_trigger"
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : flag.type === "overload"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : flag.type === "progression_candidate"
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {flag.detail}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full mt-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
      >
        Got it
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function SessionFeedback({ sessionLabel, onClose, onSubmitted }: SessionFeedbackProps) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  const [selectedPainAreas, setSelectedPainAreas] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recap, setRecap] = useState<SessionRecap | null>(null);

  const isSkipped = sessionStatus === "skipped";
  const showPainAreas = (pain ?? 0) >= 3;

  // Status-only submission is enough for skipped
  const canSubmit = isSkipped
    ? sessionStatus !== null
    : sessionStatus !== null && difficulty !== null && pain !== null && energy !== null;

  function togglePainArea(key: string) {
    setSelectedPainAreas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const result = await customFetch<{ recap: SessionRecap }>("/api/session-logs", {
        method: "POST",
        body: JSON.stringify({
          sessionStatus,
          actualDuration: actualDuration ?? undefined,
          difficultyScore: difficulty ?? undefined,
          painScore: pain ?? undefined,
          energyScore: energy ?? undefined,
          enjoymentScore: enjoyment ?? undefined,
          painAreas: selectedPainAreas.size > 0 ? Array.from(selectedPainAreas) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      setRecap(result.recap ?? null);
      onSubmitted();
    } catch {
      setSubmitting(false);
    }
  }

  function handleClose() {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      <div className="relative w-full max-w-lg bg-background rounded-t-2xl border-t border-border overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Session Feedback</h2>
            {sessionLabel && <p className="text-xs text-muted-foreground">{sessionLabel}</p>}
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {recap ? (
            <SessionRecapCard recap={recap} onClose={handleClose} />
          ) : (
            <>
              {/* Session status */}
              <div>
                <p className="text-xs font-bold text-foreground mb-2">How did this session go?</p>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const selected = sessionStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSessionStatus(opt.value)}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all duration-150 ${
                          selected ? opt.selected : opt.color
                        }`}
                      >
                        <span className="text-2xl leading-none">{opt.emoji}</span>
                        <span className={`text-[11px] font-bold leading-tight ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration — shown for completed/partial */}
              {!isSkipped && (
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">How long did it take?</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DURATION_CHIPS.map((chip) => {
                      const selected = actualDuration === chip.value;
                      return (
                        <button
                          key={chip.value}
                          onClick={() => setActualDuration(selected ? null : chip.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-150 ${
                            selected
                              ? "bg-primary/10 border-primary/40 text-primary ring-1 ring-primary/20"
                              : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rating rows — hidden for skipped */}
              {!isSkipped && (
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

                  {/* Pain areas — shown when pain is moderate+ */}
                  {showPainAreas && (
                    <div>
                      <p className="text-xs font-bold text-foreground mb-2">Where? (tap all that apply)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PAIN_AREAS.map((area) => {
                          const active = selectedPainAreas.has(area.key);
                          return (
                            <button
                              key={area.key}
                              onClick={() => togglePainArea(area.key)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                                active
                                  ? "bg-red-500/10 border-red-500/40 text-red-400"
                                  : "bg-muted/30 border-border text-muted-foreground hover:border-border hover:text-foreground"
                              }`}
                            >
                              {area.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <RatingRow
                    question="How do you feel after finishing?"
                    options={ENERGY_OPTIONS}
                    value={energy}
                    onChange={setEnergy}
                  />
                  <RatingRow
                    question="How much did you enjoy this session?"
                    options={ENJOYMENT_OPTIONS}
                    value={enjoyment}
                    onChange={setEnjoyment}
                  />
                </>
              )}

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
        {!recap && (
          <div className="px-5 py-4 border-t border-border flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                canSubmit && !submitting
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {submitting ? "Saving..." : "Submit Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
