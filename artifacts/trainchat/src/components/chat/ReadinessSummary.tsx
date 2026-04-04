import { Moon, Zap, Activity, AlertTriangle } from "lucide-react";
import { useListReadiness } from "@workspace/api-client-react";
import type { ReadinessEntry } from "@workspace/api-client-react";

function dot(score: number, inverted = false) {
  const eff = inverted ? 6 - score : score;
  if (eff >= 4) return "bg-green-400";
  if (eff >= 3) return "bg-yellow-400";
  return "bg-red-400";
}

function timeAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const h = Math.round(ms / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function ReadinessBadge({ entry }: { entry: ReadinessEntry }) {
  const composite =
    (entry.sleepScore + entry.energyScore + entry.motivationScore +
      (6 - entry.sorenessScore) + (6 - entry.stressScore)) / 5;

  const label =
    composite >= 4 ? "High" : composite >= 2.8 ? "Moderate" : "Low";

  const color =
    composite >= 4 ? "text-green-400 bg-green-400/10 border-green-400/20"
    : composite >= 2.8 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
    : "text-red-400 bg-red-400/10 border-red-400/20";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

export default function ReadinessSummary() {
  const { data: entries = [], isLoading } = useListReadiness({ limit: 1 });

  if (isLoading || entries.length === 0) return null;

  const latest = entries[0];

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Last Check-In
        </span>
        <div className="flex items-center gap-2">
          <ReadinessBadge entry={latest} />
          <span className="text-[10px] text-muted-foreground">{timeAgo(latest.createdAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { icon: Moon, score: latest.sleepScore, label: "Sleep", inverted: false },
          { icon: Zap, score: latest.energyScore, label: "Energy", inverted: false },
          { icon: Activity, score: latest.sorenessScore, label: "Soreness", inverted: true },
          { icon: AlertTriangle, score: latest.painScore, label: "Pain", inverted: true },
        ].map(({ icon: Icon, score, label, inverted }) => (
          <div key={label} className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg bg-accent/30">
            <Icon className={`w-3 h-3 text-muted-foreground`} />
            <div className={`w-1.5 h-1.5 rounded-full ${dot(score, inverted)}`} />
            <span className="text-[9px] text-muted-foreground leading-none">{label}</span>
          </div>
        ))}
      </div>

      {latest.notes && (
        <p className="mt-2 text-[10px] text-muted-foreground/70 italic line-clamp-2">
          "{latest.notes}"
        </p>
      )}
    </div>
  );
}
