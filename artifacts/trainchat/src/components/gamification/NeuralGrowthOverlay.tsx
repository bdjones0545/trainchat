/**
 * NeuralGrowthOverlay
 *
 * Post-session reward overlay. Appears after a session is logged.
 * Shows: XP gained, level progress, streak, newly unlocked milestones.
 *
 * Tone: scientific, performance-driven. No gimmicks.
 * Auto-dismisses after 5 seconds or on tap.
 */

import { useEffect, useState, useRef } from "react";
import { Zap, TrendingUp, Activity, Award } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  label: string;
  description: string;
  xpReward: number;
}

export interface NeuralAwardResult {
  xpGained: number;
  newXp: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
  newlyUnlockedMilestones: Milestone[];
  neuralConnectionsAdded: number;
  profile: {
    level: number;
    xp: number;
    xpProgressPercent: number;
    xpToNextLevel: number;
    consistencyScore: number;
    progressionScore: number;
    totalSessionsCompleted: number;
    neuralConnections: number;
    levelLabel: string;
  };
}

interface Props {
  result: NeuralAwardResult;
  streakDays?: number;
  onDismiss: () => void;
}

// ─── XP Counter ───────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NeuralGrowthOverlay({ result, streakDays, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xpDisplay = useCountUp(result.xpGained, 1000);

  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 50);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 5000);
    return () => {
      clearTimeout(enter);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleDismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDismiss, 350);
  }

  const { profile } = result;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none"
      style={{ isolation: "isolate" }}
    >
      {/* Backdrop — very subtle */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={handleDismiss}
        style={{
          background: "rgba(0,0,0,0.35)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Card */}
      <div
        className="relative pointer-events-auto w-full max-w-md mx-auto"
        style={{
          transform: visible ? "translateY(0)" : "translateY(110%)",
          transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div className="m-3 rounded-2xl bg-[#0d1117] border border-primary/30 overflow-hidden shadow-2xl">
          {/* Glowing top bar */}
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />

          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">
                  Neural Update
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground">tap to dismiss</span>
            </div>

            {/* XP earned */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black text-foreground tabular-nums tracking-tight">
                    +{xpDisplay}
                  </span>
                  <span className="text-base font-bold text-primary">XP</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {result.leveledUp
                    ? `Level up! You're now ${profile.levelLabel}`
                    : `${profile.xpToNextLevel} XP until Level ${profile.level + 1}`}
                </p>
              </div>
              {result.leveledUp && (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <span className="text-lg font-black text-primary">{profile.level}</span>
                  </div>
                  <span className="text-[9px] text-primary font-bold uppercase tracking-wide">Level Up</span>
                </div>
              )}
            </div>

            {/* XP Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] text-muted-foreground font-medium">
                  Level {profile.level}
                </span>
                <span className="text-[9px] text-muted-foreground font-medium">
                  Level {profile.level + 1}
                </span>
              </div>
              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${profile.xpProgressPercent}%`,
                    transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: "0 0 8px rgba(99,102,241,0.6)",
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {streakDays !== undefined && streakDays > 0 && (
                <div className="bg-muted/20 border border-border/40 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-black text-foreground">{streakDays}</p>
                  <p className="text-[9px] text-muted-foreground font-medium">Day Streak</p>
                </div>
              )}
              <div className="bg-muted/20 border border-border/40 rounded-xl p-2.5 text-center">
                <p className="text-lg font-black text-foreground">{profile.totalSessionsCompleted}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Sessions</p>
              </div>
              <div className="bg-muted/20 border border-border/40 rounded-xl p-2.5 text-center">
                <p className="text-lg font-black text-primary">+{result.neuralConnectionsAdded}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Connections</p>
              </div>
            </div>

            {/* Milestones */}
            {result.newlyUnlockedMilestones.length > 0 && (
              <div className="space-y-1.5">
                {result.newlyUnlockedMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl px-3 py-2"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-amber-300">{m.label}</p>
                      <p className="text-[9px] text-muted-foreground">{m.description}</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-400 flex-shrink-0">+{m.xpReward} XP</span>
                  </div>
                ))}
              </div>
            )}

            {/* Neural message */}
            <p className="text-[10px] text-muted-foreground/60 text-center mt-3 italic">
              {profile.consistencyScore >= 70
                ? "Neural efficiency improving. Your training patterns are strengthening."
                : "Each session builds the network. Keep showing up."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
