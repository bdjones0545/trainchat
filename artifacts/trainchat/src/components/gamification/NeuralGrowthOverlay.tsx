/**
 * Training Feedback Overlay
 *
 * Post-session coaching interpretation. Slides up from the bottom after session close.
 * Shows: performance metrics with directional signals, system updates, and specific
 * pathways that were reinforced in this session.
 *
 * Tone: scientific, performance-driven. No XP, no levels, no arcade language.
 * Auto-dismisses after 6 seconds or on tap.
 */

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NeuralMetric {
  label: string;
  direction: "up" | "stable" | "down" | "challenged";
  detail: string;
}

export interface NeuralFeedback {
  metrics: NeuralMetric[];
  systemUpdates: string[];
  summary: string;
}

export interface Milestone {
  id: string;
  label: string;
  description: string;
}

export interface ReinforcedConnection {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

export interface NeuralAwardResult {
  neuralConnectionsAdded: number;
  newlyUnlockedMilestones: Milestone[];
  neuralFeedback: NeuralFeedback;
  recentlyReinforced: ReinforcedConnection[];
  profile: {
    maturityLabel: string;
    maturityProgress: number;
    consistencyScore: number;
    progressionScore: number;
    recoveryScore: number;
    totalSessionsCompleted: number;
    neuralConnections: number;
    unlockedMilestones: string[];
  };
}

interface Props {
  result: NeuralAwardResult;
  streakDays?: number;
  onDismiss: () => void;
}

// ─── Direction indicator ──────────────────────────────────────────────────────

function DirectionArrow({ direction }: { direction: NeuralMetric["direction"] }) {
  const cls = "font-bold text-[13px] leading-none w-4 flex-shrink-0 mt-0.5";
  if (direction === "up") return <span className={`${cls} text-emerald-400`}>↑</span>;
  if (direction === "down") return <span className={`${cls} text-red-400`}>↓</span>;
  if (direction === "challenged") return <span className={`${cls} text-amber-400`}>⟳</span>;
  return <span className={`${cls} text-muted-foreground`}>→</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NeuralGrowthOverlay({ result, streakDays, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 50);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 6000);
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

  const { neuralFeedback: feedback, recentlyReinforced, neuralConnectionsAdded, profile } = result;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none"
      style={{ isolation: "isolate" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={handleDismiss}
        style={{
          background: "rgba(0,0,0,0.45)",
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
        <div className="m-3 rounded-2xl bg-[#0d1117] border border-primary/25 overflow-hidden shadow-2xl">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary/12 border border-primary/25 flex items-center justify-center">
                  <Activity className="w-3 h-3 text-primary" />
                </div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-[0.18em]">
                  Training Feedback
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground/40">tap to dismiss</span>
            </div>

            {/* Performance metrics */}
            <div className="space-y-2.5 mb-4">
              {feedback.metrics.map((metric, i) => (
                <div key={i} className="flex items-start gap-2">
                  <DirectionArrow direction={metric.direction} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-foreground">{metric.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 leading-relaxed">— {metric.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-border/25 mb-3" />

            {/* System updates */}
            <div className="mb-3">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                System Update
              </p>
              <div className="space-y-1">
                {feedback.systemUpdates.slice(0, 3).map((update, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary/40 flex-shrink-0" />
                    <span className="text-[10px] text-muted-foreground">{update}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reinforced pathways — the key new piece */}
            {recentlyReinforced && recentlyReinforced.length > 0 && (
              <>
                <div className="border-t border-border/25 mb-3" />
                <div>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Pathways Reinforced
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentlyReinforced.slice(0, 4).map((conn, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/8 border border-primary/20"
                      >
                        <div className="w-1 h-1 rounded-full bg-primary/60" />
                        <span className="text-[9px] text-primary/80 font-medium">
                          {conn.fromLabel} ↔ {conn.toLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/20">
              <span className="text-[9px] text-muted-foreground/50">{feedback.summary}</span>
              {streakDays !== undefined && streakDays >= 3 && (
                <span className="text-[9px] text-muted-foreground/50 flex-shrink-0 ml-2">
                  {streakDays}-session run
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
