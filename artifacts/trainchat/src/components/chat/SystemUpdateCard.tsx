import { CheckCircle2, ArrowRight, Zap } from "lucide-react";
import { useLocation } from "wouter";

interface ChangedIds {
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}

interface SystemEditData {
  _type: "system_edit";
  changeSummary: string;
  changedIds: ChangedIds;
  systemId: number;
  changeLogId: number;
}

interface Props {
  data: SystemEditData;
}

export default function SystemUpdateCard({ data }: Props) {
  const [, setLocation] = useLocation();

  const totalChanged =
    data.changedIds.exercises.length +
    data.changedIds.sessions.length +
    data.changedIds.weeks.length +
    data.changedIds.phases.length;

  function buildChangeLabel(): string {
    const parts: string[] = [];
    if (data.changedIds.exercises.length > 0) {
      parts.push(`${data.changedIds.exercises.length} exercise${data.changedIds.exercises.length > 1 ? "s" : ""}`);
    }
    if (data.changedIds.sessions.length > 0) {
      parts.push(`${data.changedIds.sessions.length} session${data.changedIds.sessions.length > 1 ? "s" : ""}`);
    }
    if (data.changedIds.weeks.length > 0) {
      parts.push(`${data.changedIds.weeks.length} week${data.changedIds.weeks.length > 1 ? "s" : ""}`);
    }
    if (data.changedIds.phases.length > 0) {
      parts.push(`${data.changedIds.phases.length} phase${data.changedIds.phases.length > 1 ? "s" : ""}`);
    }
    return parts.join(", ") || "system";
  }

  return (
    <div className="mt-3 rounded-xl border border-green-500/25 bg-green-500/8 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-green-500/15">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-green-400 uppercase tracking-widest">
          Training System Updated
        </span>
        {totalChanged > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400/60">
            <Zap className="w-2.5 h-2.5" />
            {buildChangeLabel()} modified
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {data.changeSummary}
        </p>
      </div>

      <button
        onClick={() => setLocation("/system")}
        className="w-full flex items-center justify-between px-3 py-2 border-t border-green-500/15 text-[11px] font-semibold text-green-400 hover:bg-green-500/10 transition-colors duration-150"
      >
        <span>View in Training System</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
