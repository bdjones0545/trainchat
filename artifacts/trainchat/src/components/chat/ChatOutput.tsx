import { Dumbbell, ChevronDown, ChevronUp } from "lucide-react";
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
  exercises: Exercise[];
  notes?: string;
}

interface ProgramStructure {
  programName: string;
  description: string;
  days: ProgramDay[];
}

interface Props {
  program: ProgramStructure | null;
}

export default function ChatOutput({ program }: Props) {
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  if (!program) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
          <Dumbbell className="w-6 h-6 text-primary/60" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Training Output</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your program will appear here once the agent builds it. Ask me to create a program to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Dumbbell className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">Program</span>
        </div>
        <h3 className="text-sm font-semibold text-foreground">{program.programName}</h3>
        {program.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{program.description}</p>
        )}
      </div>

      {/* Days */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {program.days.map((day, idx) => (
          <div key={idx} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Day header */}
            <button
              onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/50 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                    Day {day.dayNumber}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground mt-1">{day.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {day.exercises.length} exercises
                </p>
              </div>
              {expandedDay === idx ? (
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {/* Exercises */}
            {expandedDay === idx && (
              <div className="border-t border-border divide-y divide-border">
                {day.exercises.map((ex, exIdx) => (
                  <div key={exIdx} className="px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">{ex.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      {ex.sets && (
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
                        <span className="text-[10px] text-muted-foreground">
                          Rest <span className="font-semibold text-foreground">{ex.rest}</span>
                        </span>
                      )}
                    </div>
                    {ex.notes && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1.5 italic">{ex.notes}</p>
                    )}
                  </div>
                ))}
                {day.notes && (
                  <div className="px-3 py-2.5 bg-accent/30">
                    <p className="text-[10px] text-muted-foreground italic">{day.notes}</p>
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
