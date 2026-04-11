/**
 * TrainingProfileCard — UserTrainingResponseProfile
 *
 * Shows a compact summary of the user's real training behavior patterns,
 * aggregated from session_logs history.
 *
 * Data source: GET /api/session-logs/summary
 */

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Activity, CheckCircle2, SkipForward, XCircle } from "lucide-react";

interface ResponseProfile {
  totalSessions: number;
  completed: number;
  partial: number;
  skipped: number;
  completionRate: number;
  avgDifficulty: number | null;
  avgPain: number | null;
  avgEnergy: number | null;
  avgEnjoyment: number | null;
  avgActualDuration: number | null;
  frequentPainAreas: { area: string; count: number }[];
  updatedAt: string;
}

const AREA_LABELS: Record<string, string> = {
  knee:       "Knee",
  lower_back: "Lower back",
  shoulder:   "Shoulder",
  hip:        "Hip",
  elbow:      "Elbow",
  wrist:      "Wrist",
  ankle:      "Ankle",
  neck:       "Neck",
  upper_back: "Upper back",
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center min-w-0">
      <span className="text-base font-bold text-foreground leading-none">{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight font-medium">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground/60 leading-tight">{sub}</span>}
    </div>
  );
}

export default function TrainingProfileCard() {
  const { data: profile, isLoading } = useQuery<ResponseProfile>({
    queryKey: ["session-logs-summary"],
    queryFn: () => customFetch<ResponseProfile>("/api/session-logs/summary"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || !profile || profile.totalSessions === 0) return null;

  const diffLabel = !profile.avgDifficulty
    ? "—"
    : profile.avgDifficulty <= 2 ? "Easy"
    : profile.avgDifficulty <= 3.5 ? "Moderate"
    : "Hard";

  const enjoyLabel = !profile.avgEnjoyment
    ? "—"
    : profile.avgEnjoyment <= 2 ? "Low"
    : profile.avgEnjoyment <= 3.5 ? "Okay"
    : "High";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Activity className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground leading-tight">Training Profile</p>
          <p className="text-[10px] text-muted-foreground">Based on {profile.totalSessions} logged session{profile.totalSessions !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Adherence row */}
      <div className="px-4 py-3 flex items-center gap-4 border-b border-border/60">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          <span className="font-semibold text-foreground">{profile.completed}</span>
          <span>completed</span>
        </div>
        {profile.partial > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SkipForward className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-semibold text-foreground">{profile.partial}</span>
            <span>partial</span>
          </div>
        )}
        {profile.skipped > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{profile.skipped}</span>
            <span>skipped</span>
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <div
            className="h-1.5 rounded-full bg-green-500"
            style={{ width: `${Math.max(4, profile.completionRate * 0.6)}px` }}
          />
          <span className="text-[10px] font-bold text-muted-foreground">{profile.completionRate}% complete</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-0 divide-x divide-border/60 px-1 py-3">
        <Stat label="Avg difficulty" value={diffLabel} />
        <Stat label="Avg enjoyment" value={enjoyLabel} />
        {profile.avgActualDuration ? (
          <Stat label="Avg duration" value={`${Math.round(profile.avgActualDuration)}m`} />
        ) : (
          <Stat label="Sessions" value={profile.totalSessions} />
        )}
        <Stat
          label="Pain sessions"
          value={profile.frequentPainAreas.length > 0 ? `${profile.frequentPainAreas.reduce((a, b) => a + b.count, 0)}` : "0"}
          sub="flagged"
        />
      </div>

      {/* Frequent pain areas */}
      {profile.frequentPainAreas.length > 0 && (
        <div className="px-4 pb-3.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Recurring discomfort</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.frequentPainAreas.map(({ area, count }) => (
              <span
                key={area}
                className="text-[10px] font-semibold px-2 py-1 rounded-full bg-red-500/8 border border-red-500/20 text-red-400"
              >
                {AREA_LABELS[area] ?? area} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
