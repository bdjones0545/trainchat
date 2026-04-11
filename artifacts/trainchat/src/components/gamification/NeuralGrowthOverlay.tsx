/**
 * Training Feedback Overlay
 *
 * Post-session coaching interpretation card.
 * Reads like a coach analyzing your session — not a game reward screen.
 *
 * Shows: neural output, movement efficiency, force production metrics
 * with direction indicators, system update bullets, and connections added.
 *
 * Tone: scientific, performance-driven. No XP, no levels, no arcade language.
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

export interface NeuralAwardResult {
  neuralConnectionsAdded: number;
  newlyUnlockedMilestones: Milestone[];
  neuralFeedback: NeuralFeedback;
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
  if (direction === "up") {
    return <span className="text-emerald-400 font-bold text-sm leading-none">↑</span>;
  }
  if (direction === "down") {
    return <span className="text-red-400 font-bold text-sm leading-none">↓</span>;
  }
  if (direction === "challenged") {
    return <span className="text-amber-400 font-bold text-sm leading-none">⟳</span>;
  }
  return <span className="text-muted-foreground font-bold text-sm leading-none">→</span>;
}

function directionColor(direction: NeuralMetric["direction"]) {
  if (direction === "up") return "text-emerald-400";
  if (direction === "down") return "text-red-400";
  if (direction === "challenged") return "text-amber-400";
  return "text-muted-foreground";
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

  const { neuralFeedback: feedback, neuralConnectionsAdded, profile } = result;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none"
      style={{ isolation: "isolate" }}
    >
      {/* Dim backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={handleDismiss}
        style={{
          background: "rgba(0,0,0,0.4)",
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
          {/* Top accent */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Activity className="w-3 h-3 text-primary" />
                </div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-[0.18em]">
                  Training Feedback
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground/50">tap to dismiss</span>
            </div>

            {/* Metrics */}
            <div className="space-y-2.5 mb-4">
              {feedback.metrics.map((metric, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <DirectionArrow direction={metric.direction} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-foreground">{metric.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">— {metric.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-border/30 mb-3" />

            {/* System updates */}
            <div className="mb-4">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-2">
                System Update
              </p>
              <div className="space-y-1">
                {feedback.systemUpdates.slice(0, 3).map((update, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary/50 flex-shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{update}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer data row */}
            <div className="flex items-center justify-between pt-3 border-t border-border/20">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] text-muted-foreground">
                  <span className="text-primary/80 font-medium">+{neuralConnectionsAdded}</span> connections
                  {" "}· {profile.neuralConnections} total
                </span>
              </div>
              {streakDays !== undefined && streakDays >= 3 && (
                <span className="text-[9px] text-muted-foreground">
                  {streakDays} session streak
                </span>
              )}
            </div>

            {/* Summary */}
            <p className="text-[10px] text-muted-foreground/50 italic mt-2.5">
              {feedback.summary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
