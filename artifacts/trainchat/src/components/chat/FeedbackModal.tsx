import { useState } from "react";
import { X, Dumbbell, AlertTriangle, Battery } from "lucide-react";
import { useCreateSessionFeedback } from "@workspace/api-client-react";

interface FeedbackModalProps {
  programId?: number;
  onClose: () => void;
  onSubmit?: () => void;
}

const DIFFICULTY_LABELS = ["", "Way too easy", "Manageable", "About right", "Challenging", "Too hard"];
const PAIN_LABELS = ["", "None", "Minor", "Moderate", "Significant", "Severe"];
const ENERGY_LABELS = ["", "Drained", "Low", "Moderate", "Good", "Energized"];

function ScoreRow({
  label,
  icon: Icon,
  score,
  setScore,
  labels,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  score: number;
  setScore: (v: number) => void;
  labels: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-medium text-foreground">{label}</span>
        {score > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{labels[score]}</span>
        )}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((val) => (
          <button
            key={val}
            onClick={() => setScore(val)}
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
    </div>
  );
}

export default function FeedbackModal({ programId, onClose, onSubmit }: FeedbackModalProps) {
  const [difficultyScore, setDifficulty] = useState(0);
  const [painResponseScore, setPain] = useState(0);
  const [energyResponseScore, setEnergy] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const createFeedback = useCreateSessionFeedback();

  const isValid = difficultyScore > 0 && painResponseScore > 0 && energyResponseScore > 0;

  function handleSubmit() {
    if (!isValid) return;
    createFeedback.mutate(
      {
        data: {
          savedProgramId: programId ?? undefined,
          difficultyScore,
          painResponseScore,
          energyResponseScore,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          setTimeout(() => {
            onSubmit?.();
            onClose();
          }, 1200);
        },
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
              Post-Session
            </p>
            <h2 className="text-base font-semibold text-foreground">How did that session go?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scores */}
        <div className="px-5 py-5 space-y-5">
          <ScoreRow
            label="Session Difficulty"
            icon={Dumbbell}
            score={difficultyScore}
            setScore={setDifficulty}
            labels={DIFFICULTY_LABELS}
          />
          <ScoreRow
            label="Pain Response"
            icon={AlertTriangle}
            score={painResponseScore}
            setScore={setPain}
            labels={PAIN_LABELS}
          />
          <ScoreRow
            label="Energy After Session"
            icon={Battery}
            score={energyResponseScore}
            setScore={setEnergy}
            labels={ENERGY_LABELS}
          />

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What felt good, what was off, any specific notes..."
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 border-t border-border">
          {submitted ? (
            <div className="flex items-center justify-center gap-2 py-2.5">
              <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <span className="text-sm font-medium text-green-400">Feedback saved — your agent will adapt.</span>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isValid || createFeedback.isPending}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98]"
            >
              {createFeedback.isPending ? "Saving..." : "Save Feedback"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
