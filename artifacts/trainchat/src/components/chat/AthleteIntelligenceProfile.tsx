/**
 * Athlete Intelligence Profile (T008)
 *
 * Visible surface for the athlete's intelligence model.
 * Accessible from: Program Panel, Settings, "Teach Atlas About You" done screen.
 *
 * Shows: Precision Score, DNA dimensions, Coaching Precision history,
 * Behavioral profile, and Longitudinal intelligence timeline (simplified).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Brain, Activity, ShieldCheck, Zap, TrendingUp, TrendingDown,
  Target, BarChart3, Clock, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AtlasDNA {
  recoveryIdentity: string;
  fatigueIdentity: string;
  progressionIdentity: string;
  coachingIdentity: string;
  adherenceIdentity: string;
  adaptationResponsiveness: string;
  generatedAt: string;
}

interface PrecisionHistoryEntry {
  score: number;
  tier: string;
  generatedAt: string;
  trigger: string;
}

interface ProfileData {
  coachingPrecisionScore?: number;
  calibrationScore?: number;
  athleteDNA?: AtlasDNA;
  coachingPrecisionHistory?: PrecisionHistoryEntry[];
  experienceLevel?: string;
  yearsTraining?: number;
  trainingGoal?: string;
  scheduleConsistency?: string;
  recoveryConsistency?: string;
  trainingAggression?: string;
  autoregulationComfort?: string;
  motivationStyle?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  equipmentAccess?: string;
  injuries?: string;
  sportFocus?: string;
}

interface Props {
  onClose: () => void;
  onRecalibrate?: () => void;
}

// ─── Precision tier helper ────────────────────────────────────────────────────

function getPrecisionTier(score: number) {
  if (score >= 76)
    return { label: "Performance Intelligence", color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/30", barColor: "bg-green-400" };
  if (score >= 51)
    return { label: "Adaptive Coaching", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", barColor: "bg-primary" };
  if (score >= 26)
    return { label: "Context-Aware Coaching", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/30", barColor: "bg-amber-400" };
  return { label: "Basic Coaching", color: "text-muted-foreground", bg: "bg-muted/20", border: "border-border", barColor: "bg-muted-foreground" };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Section component ────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
  collapsible = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        className={`w-full flex items-center justify-between px-4 py-3 bg-card ${
          collapsible ? "hover:bg-muted/30 transition-colors" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
        </div>
        {collapsible && (
          open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </button>
      {(!collapsible || open) && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ─── DNA row ─────────────────────────────────────────────────────────────────

function DNARow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-xs text-foreground leading-relaxed mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AthleteIntelligenceProfile({ onClose, onRecalibrate }: Props) {
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: () => customFetch<ProfileData>("/api/profile").catch(() => null as any),
    staleTime: 30000,
  });

  const score = profile?.coachingPrecisionScore ?? profile?.calibrationScore ?? 0;
  const tier = getPrecisionTier(score);
  const dna = profile?.athleteDNA;
  const history = profile?.coachingPrecisionHistory ?? [];

  // Precision trend from history
  const lastTwo = history.slice(-2);
  const trend =
    lastTwo.length === 2
      ? lastTwo[1].score - lastTwo[0].score
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${tier.bg} border ${tier.border} flex items-center justify-center`}>
              <Brain className={`w-4 h-4 ${tier.color}`} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Athlete Intelligence Profile</h2>
              <p className="text-[10px] text-muted-foreground">How Atlas understands you</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              {/* Precision Score Card */}
              <div className={`px-4 py-4 rounded-xl ${tier.bg} border ${tier.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                      Coaching Precision
                    </p>
                    <p className={`text-sm font-bold ${tier.color}`}>{tier.label}</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className={`text-3xl font-black ${tier.color}`}>{score}</span>
                    {trend !== 0 && (
                      <div className="flex items-center gap-0.5 mb-1">
                        {trend > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className={`text-[10px] font-bold ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                          {trend > 0 ? "+" : ""}{trend}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Precision bar */}
                <div className="h-1.5 bg-black/20 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${tier.barColor}`}
                    style={{ width: `${score}%` }}
                  />
                </div>

                {/* Tier scale */}
                <div className="flex items-center justify-between">
                  {[
                    { label: "Basic", score: 0, color: "text-muted-foreground/50" },
                    { label: "Context-Aware", score: 26, color: "text-amber-400/60" },
                    { label: "Adaptive", score: 51, color: "text-primary/60" },
                    { label: "Performance", score: 76, color: "text-green-400/60" },
                  ].map((t) => (
                    <div key={t.label} className="text-center">
                      <div className={`text-[8px] font-bold ${score >= t.score + 1 ? t.color.replace("/60", "").replace("/50", "") : "text-muted-foreground/30"}`}>
                        {t.label}
                      </div>
                      <div className={`text-[8px] ${score >= t.score + 1 ? "text-muted-foreground/50" : "text-muted-foreground/25"}`}>
                        {t.score || "0"}+
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Precision History */}
              {history.length > 1 && (
                <Section title="Precision History" icon={BarChart3} collapsible>
                  <div className="flex items-end gap-1.5 h-16 mt-2">
                    {history.slice(-12).map((entry, i) => {
                      const t = getPrecisionTier(entry.score);
                      const height = Math.max(8, (entry.score / 100) * 52);
                      return (
                        <div key={i} className="flex flex-col items-center gap-1 flex-1">
                          <div
                            className={`w-full rounded-sm ${t.barColor} opacity-80`}
                            style={{ height: `${height}px` }}
                            title={`${entry.score} — ${formatDate(entry.generatedAt)}`}
                          />
                          <span className="text-[8px] text-muted-foreground/40">{formatDate(entry.generatedAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Athlete DNA */}
              {dna && (
                <Section title="Athlete Identity (DNA)" icon={Sparkles}>
                  <div className="mt-1">
                    <DNARow icon={Activity} label="Progression" value={dna.progressionIdentity} />
                    <DNARow icon={ShieldCheck} label="Recovery" value={dna.recoveryIdentity} />
                    <DNARow icon={Zap} label="Fatigue" value={dna.fatigueIdentity} />
                    <DNARow icon={Target} label="Coaching Style" value={dna.coachingIdentity} />
                    <DNARow icon={Clock} label="Adherence" value={dna.adherenceIdentity} />
                    <DNARow icon={TrendingUp} label="Adaptation" value={dna.adaptationResponsiveness} />
                  </div>
                </Section>
              )}

              {/* Behavioral Profile */}
              {(profile?.scheduleConsistency || profile?.recoveryConsistency || profile?.trainingAggression) && (
                <Section title="Behavioral Profile" icon={Activity} collapsible>
                  <div className="space-y-2 mt-2">
                    {profile?.scheduleConsistency && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Schedule</span>
                        <span className="text-xs font-semibold text-foreground">{profile.scheduleConsistency}</span>
                      </div>
                    )}
                    {profile?.recoveryConsistency && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Recovery</span>
                        <span className="text-xs font-semibold text-foreground">{profile.recoveryConsistency}</span>
                      </div>
                    )}
                    {profile?.trainingAggression && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Intensity style</span>
                        <span className="text-xs font-semibold text-foreground">{profile.trainingAggression}</span>
                      </div>
                    )}
                    {profile?.autoregulationComfort && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Autoregulation</span>
                        <span className="text-xs font-semibold text-foreground">{profile.autoregulationComfort}</span>
                      </div>
                    )}
                    {profile?.motivationStyle && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Motivation</span>
                        <span className="text-xs font-semibold text-foreground">{profile.motivationStyle}</span>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Training Context */}
              <Section title="Training Context" icon={Target} collapsible>
                <div className="space-y-2 mt-2">
                  {profile?.experienceLevel && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Level</span>
                      <span className="text-xs font-semibold text-foreground capitalize">{profile.experienceLevel}</span>
                    </div>
                  )}
                  {profile?.yearsTraining != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Experience</span>
                      <span className="text-xs font-semibold text-foreground">{profile.yearsTraining} yr{profile.yearsTraining !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  {profile?.trainingGoal && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Goal</span>
                      <span className="text-xs font-semibold text-foreground">{profile.trainingGoal}</span>
                    </div>
                  )}
                  {profile?.daysPerWeek != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Schedule</span>
                      <span className="text-xs font-semibold text-foreground">{profile.daysPerWeek} days · {profile.sessionDuration} min</span>
                    </div>
                  )}
                  {profile?.equipmentAccess && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Equipment</span>
                      <span className="text-xs font-semibold text-foreground">{profile.equipmentAccess}</span>
                    </div>
                  )}
                  {profile?.sportFocus && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Sport focus</span>
                      <span className="text-xs font-semibold text-foreground">{profile.sportFocus}</span>
                    </div>
                  )}
                  {profile?.injuries && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-xs text-muted-foreground flex-shrink-0">Constraints</span>
                      <span className="text-xs font-semibold text-red-400 text-right">{profile.injuries}</span>
                    </div>
                  )}
                </div>
              </Section>

              {/* No data state */}
              {!dna && score === 0 && (
                <div className="text-center py-6">
                  <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground mb-1">Atlas doesn't know you yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    Complete the calibration to build your athlete intelligence profile.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <button
            onClick={() => { onClose(); onRecalibrate?.(); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 bg-primary/8 hover:bg-primary/12 text-xs font-semibold text-primary active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Teach Atlas More About You
          </button>
        </div>
      </div>
    </div>
  );
}
