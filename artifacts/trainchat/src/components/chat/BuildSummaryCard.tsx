import { Dumbbell, Calendar, Target, Zap, ArrowRight } from "lucide-react";
import CoachReasoningCallout from "./CoachReasoningCallout";
import { EdgeTraceCard } from "@/components/laser-skill";

interface BuildMeta {
  frequency: number;
  goal: string | null;
  sport: string | null;
  sessionDuration: number | null;
  _coachReasoning?: string | null;
}

interface BuildSummaryData {
  programName: string;
  description?: string;
  splitType?: string;
  days: Array<{ name: string }>;
  _buildMeta: BuildMeta;
}

interface Props {
  data: BuildSummaryData;
  onViewProgram?: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  athletic_performance: "Athletic Performance",
  fat_loss: "Fat Loss",
  general_fitness: "General Fitness",
};

const SPORT_LABELS: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  baseball: "Baseball",
  tennis: "Tennis",
  track: "Track / Sprinting",
  swimming: "Swimming",
  combat: "Combat Sports",
  mma: "MMA",
  golf: "Golf",
  volleyball: "Volleyball",
};

function formatGoalLabel(goal: string | null): string {
  if (!goal) return "General Training";
  return GOAL_LABELS[goal] ?? goal.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSportLabel(sport: string | null): string | null {
  if (!sport) return null;
  return SPORT_LABELS[sport] ?? sport.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "45–60 min";
  return `${minutes} min`;
}

export default function BuildSummaryCard({ data, onViewProgram }: Props) {
  const meta = data._buildMeta;
  const goal = formatGoalLabel(meta.goal);
  const sport = formatSportLabel(meta.sport);
  const duration = formatDuration(meta.sessionDuration);
  const frequency = meta.frequency;

  return (
    <EdgeTraceCard borderRadius="0.75rem">
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Dumbbell className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
          Program Built
        </span>
        <span className="ml-auto text-[10px] text-primary/50 font-medium truncate max-w-[140px]">
          {data.programName}
        </span>
      </div>

      <div className="px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-primary/50 flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{frequency}</span> days/week
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-primary/50 flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{duration}</span> per session
          </span>
        </div>

        <div className="flex items-center gap-1.5 col-span-2">
          <Target className="w-3 h-3 text-primary/50 flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{goal}</span>
            {sport && (
              <span className="text-primary/60"> · {sport}</span>
            )}
          </span>
        </div>

        {data.splitType && (
          <div className="col-span-2">
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {data.splitType}
            </span>
          </div>
        )}
      </div>

      {meta._coachReasoning && (
        <div className="px-3 pb-2">
          <CoachReasoningCallout reasoning={meta._coachReasoning} variant="build" />
        </div>
      )}

      <button
        onClick={onViewProgram}
        className="w-full flex items-center justify-between px-3 py-2 border-t border-primary/10 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors duration-150"
      >
        <span>Open Program Tab</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
    </EdgeTraceCard>
  );
}
