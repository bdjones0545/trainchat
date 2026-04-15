import { CheckCircle2, ArrowRight, Zap, AlertTriangle, Info } from "lucide-react";
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
  verificationStatus?: "verified" | "partial" | "unclear";
}

interface Props {
  data: SystemEditData;
}

interface StatusConfig {
  borderColor: string;
  bgColor: string;
  headerBorder: string;
  iconColor: string;
  accentColor: string;
  footerHover: string;
  footerBorder: string;
  label: string;
  Icon: React.ElementType;
  subNote?: string;
}

function getStatusConfig(status: SystemEditData["verificationStatus"]): StatusConfig {
  switch (status) {
    case "partial":
      return {
        borderColor: "border-amber-500/25",
        bgColor: "bg-amber-500/8",
        headerBorder: "border-amber-500/15",
        iconColor: "text-amber-400",
        accentColor: "text-amber-400",
        footerHover: "hover:bg-amber-500/10",
        footerBorder: "border-amber-500/15",
        label: "Partially Updated",
        Icon: AlertTriangle,
        subNote: "Some changes may need review",
      };
    case "unclear":
      return {
        borderColor: "border-blue-500/25",
        bgColor: "bg-blue-500/5",
        headerBorder: "border-blue-500/15",
        iconColor: "text-blue-400",
        accentColor: "text-blue-400",
        footerHover: "hover:bg-blue-500/10",
        footerBorder: "border-blue-500/15",
        label: "Updated — Verify Changes",
        Icon: Info,
        subNote: "Could not fully confirm all changes",
      };
    default:
      return {
        borderColor: "border-green-500/25",
        bgColor: "bg-green-500/8",
        headerBorder: "border-green-500/15",
        iconColor: "text-green-400",
        accentColor: "text-green-400",
        footerHover: "hover:bg-green-500/10",
        footerBorder: "border-green-500/15",
        label: "Training System Updated",
        Icon: CheckCircle2,
      };
  }
}

export default function SystemUpdateCard({ data }: Props) {
  const [, setLocation] = useLocation();
  const config = getStatusConfig(data.verificationStatus);
  const { Icon } = config;

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
    <div className={`mt-3 rounded-xl border ${config.borderColor} ${config.bgColor} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${config.headerBorder}`}>
        <Icon className={`w-3.5 h-3.5 ${config.iconColor} flex-shrink-0`} />
        <span className={`text-[11px] font-semibold ${config.accentColor} uppercase tracking-widest`}>
          {config.label}
        </span>
        {totalChanged > 0 && (
          <span className={`ml-auto flex items-center gap-1 text-[10px] ${config.accentColor}/60`}>
            <Zap className="w-2.5 h-2.5" />
            {buildChangeLabel()} modified
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {data.changeSummary}
        </p>
        {config.subNote && (
          <p className={`text-[11px] ${config.accentColor}/70 mt-1.5 leading-relaxed`}>
            {config.subNote}
          </p>
        )}
      </div>

      <button
        onClick={() => setLocation("/system")}
        className={`w-full flex items-center justify-between px-3 py-2 border-t ${config.footerBorder} text-[11px] font-semibold ${config.accentColor} ${config.footerHover} transition-colors duration-150`}
      >
        <span>View in Training System</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
