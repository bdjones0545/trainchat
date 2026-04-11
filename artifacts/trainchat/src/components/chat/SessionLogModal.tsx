import { X, CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";

type SessionStatus = "completed" | "partial" | "skipped";

interface Props {
  programName?: string;
  dayNumber?: number;
  savedProgramId?: number;
  onClose: () => void;
  onSubmit: (data: {
    savedProgramId?: number;
    dayNumber?: number;
    sessionStatus?: SessionStatus;
    difficultyScore?: number;
    painScore?: number;
    energyScore?: number;
    notes?: string;
  }) => void;
  isSubmitting?: boolean;
}

const SCORES = [1, 2, 3, 4, 5];

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Too easy",
  2: "Light",
  3: "Just right",
  4: "Challenging",
  5: "Very hard",
};

const PAIN_LABELS: Record<number, string> = {
  1: "No pain",
  2: "Minimal",
  3: "Moderate",
  4: "Significant",
  5: "High pain",
};

const ENERGY_LABELS: Record<number, string> = {
  1: "Exhausted",
  2: "Low",
  3: "Normal",
  4: "Good",
  5: "Great",
};

function ScoreSelector({
  label,
  value,
  onChange,
  getLabel,
  highlightColor = "bg-primary text-primary-foreground",
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  getLabel: (v: number) => string;
  highlightColor?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {value && (
          <span className="text-[11px] text-muted-foreground">{getLabel(value)}</span>
        )}
      </div>
      <div className="flex gap-2">
        {SCORES.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
              value === s
                ? highlightColor
                : "border-border bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const STATUS_CHIPS: { value: SessionStatus; label: string; emoji: string }[] = [
  { value: "completed", label: "Completed", emoji: "✅" },
  { value: "partial",   label: "Partial",   emoji: "⏭️" },
  { value: "skipped",   label: "Skipped",   emoji: "⏸️" },
];

export default function SessionLogModal({
  programName,
  dayNumber,
  savedProgramId,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const isSkipped = sessionStatus === "skipped";

  function handleSubmit() {
    onSubmit({
      savedProgramId,
      dayNumber,
      sessionStatus: sessionStatus ?? undefined,
      difficultyScore: isSkipped ? undefined : (difficulty ?? undefined),
      painScore: isSkipped ? undefined : (pain ?? undefined),
      energyScore: isSkipped ? undefined : (energy ?? undefined),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-[#0c1220] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-400/40 to-transparent" />

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-foreground">Log Completed Session</h3>
              {(programName || dayNumber) && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {programName && <span>{programName}</span>}
                  {dayNumber && <span> · Day {dayNumber}</span>}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Session status */}
            <div>
              <span className="block text-xs font-semibold text-foreground mb-2">How did it go?</span>
              <div className="flex gap-2">
                {STATUS_CHIPS.map((chip) => {
                  const selected = sessionStatus === chip.value;
                  return (
                    <button
                      key={chip.value}
                      onClick={() => setSessionStatus(chip.value)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all text-xs font-semibold ${
                        selected
                          ? "bg-primary/15 border-primary/50 text-primary ring-1 ring-primary/30"
                          : "border-border/60 bg-white/4 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <span className="text-base">{chip.emoji}</span>
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isSkipped && (<>
              <ScoreSelector
                label="How difficult was it?"
                value={difficulty}
                onChange={setDifficulty}
                getLabel={(v) => DIFFICULTY_LABELS[v]}
                highlightColor="bg-primary text-primary-foreground border-primary"
              />
              <ScoreSelector
                label="Any pain or discomfort?"
                value={pain}
                onChange={setPain}
                getLabel={(v) => PAIN_LABELS[v]}
                highlightColor={`${pain && pain >= 4 ? "bg-red-500 text-white border-red-500" : "bg-amber-500 text-white border-amber-500"}`}
              />
              <ScoreSelector
                label="Energy level after?"
                value={energy}
                onChange={setEnergy}
                getLabel={(v) => ENERGY_LABELS[v]}
                highlightColor="bg-green-600 text-white border-green-600"
              />
            </>)}

            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it feel? Anything to flag..."
                rows={2}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-500 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Log Session Complete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
