import {
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  TrendingUp,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import { useState } from "react";

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

interface ProgramDay {
  dayNumber: number;
  name: string;
  focus?: string;
  exercises: Exercise[];
  notes?: string;
}

export interface ProgramStructure {
  programName: string;
  description: string;
  progressionStrategy?: string;
  splitType?: string;
  days: ProgramDay[];
}

interface Props {
  program: ProgramStructure | null;
  onSave?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
}

export default function ChatOutput({ program, onSave, isSaving, isSaved }: Props) {
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  if (!program) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-5">
          <Dumbbell className="w-5 h-5 text-primary/50" />
        </div>
        <h3 className="text-xs font-semibold text-foreground mb-2">Training Output</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[160px]">
          Your program will appear here as the agent builds it.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        {/* Program label */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[9px] font-bold text-primary uppercase tracking-[0.12em]">
            Active Program
          </span>
        </div>

        {/* Name */}
        <h3 className="text-sm font-semibold text-foreground leading-snug mb-1">
          {program.programName}
        </h3>

        {/* Meta row */}
        {(program.splitType || program.days.length > 0) && (
          <div className="flex items-center gap-3 mb-2">
            {program.splitType && (
              <div className="flex items-center gap-1">
                <LayoutGrid className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{program.splitType}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Dumbbell className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{program.days.length} days</span>
            </div>
          </div>
        )}

        {/* Description */}
        {program.description && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            {program.description}
          </p>
        )}

        {/* Save button */}
        {onSave && (
          <button
            onClick={onSave}
            disabled={isSaving || isSaved}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
              isSaved
                ? "bg-green-500/15 border border-green-500/30 text-green-400 cursor-default"
                : isSaving
                ? "bg-primary/10 border border-primary/20 text-primary/60 cursor-not-allowed"
                : "bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 active:scale-[0.98]"
            }`}
          >
            {isSaved ? (
              <>
                <CheckCircle className="w-3 h-3" />
                Program saved
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                Save program
              </>
            )}
          </button>
        )}
      </div>

      {/* Progression strategy */}
      {program.progressionStrategy && (
        <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-primary/5">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.1em] mb-0.5">
                Progression
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {program.progressionStrategy}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Days */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {program.days.map((day, idx) => (
          <div
            key={idx}
            className={`bg-card border rounded-xl overflow-hidden transition-colors duration-150 ${
              expandedDay === idx ? "border-primary/30" : "border-border"
            }`}
          >
            {/* Day header */}
            <button
              onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                      expandedDay === idx
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    Day {day.dayNumber}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-foreground truncate">{day.name}</p>
                {day.focus && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{day.focus}</p>
                )}
                {!day.focus && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {day.exercises.length} exercises
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 ml-2">
                {expandedDay === idx ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Exercises */}
            {expandedDay === idx && (
              <div className="border-t border-border divide-y divide-border/60">
                {day.exercises.map((ex, exIdx) => (
                  <div key={exIdx} className="px-3 py-2.5">
                    <p className="text-[11px] font-medium text-foreground leading-snug">{ex.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                      {ex.sets > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          <span className="font-semibold text-foreground">{ex.sets}</span> sets
                        </span>
                      )}
                      {ex.reps && (
                        <span className="text-[10px] text-muted-foreground">
                          <span className="font-semibold text-foreground">{ex.reps}</span> reps
                        </span>
                      )}
                      {ex.rest && (
                        <span className="text-[10px] bg-accent/60 px-1.5 py-0.5 rounded text-muted-foreground">
                          {ex.rest}
                        </span>
                      )}
                    </div>
                    {ex.notes && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1.5 italic leading-relaxed">
                        {ex.notes}
                      </p>
                    )}
                  </div>
                ))}
                {day.notes && (
                  <div className="px-3 py-2.5 bg-accent/20">
                    <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                      {day.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
