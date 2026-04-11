/**
 * BrainView — Neural Network Visualization
 *
 * A clean, scientific SVG visualization of the user's "training brain."
 * Nodes represent training domains. Connections represent behavioral consistency.
 * Active connections glow and pulse based on real performance data.
 *
 * Tone: elite sports science dashboard, not a video game.
 */

import { useEffect, useState } from "react";
import { X, TrendingUp, Zap, Activity, Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─── Node layout ──────────────────────────────────────────────────────────────
// 16 nodes arranged in an oval brain-like cluster

const NODES = [
  { id: 0,  x: 200, y: 60,  label: "Power" },
  { id: 1,  x: 280, y: 90,  label: "Speed" },
  { id: 2,  x: 330, y: 150, label: "Force" },
  { id: 3,  x: 310, y: 220, label: "Load" },
  { id: 4,  x: 250, y: 280, label: "Volume" },
  { id: 5,  x: 170, y: 300, label: "Recovery" },
  { id: 6,  x: 90,  y: 270, label: "Mobility" },
  { id: 7,  x: 50,  y: 200, label: "Trunk" },
  { id: 8,  x: 70,  y: 130, label: "Unilateral" },
  { id: 9,  x: 130, y: 75,  label: "Prep" },
  { id: 10, x: 200, y: 160, label: "Consistency" },
  { id: 11, x: 150, y: 200, label: "Readiness" },
  { id: 12, x: 250, y: 180, label: "Progression" },
  { id: 13, x: 175, y: 125, label: "Strength" },
  { id: 14, x: 230, y: 230, label: "Endurance" },
  { id: 15, x: 130, y: 240, label: "Adaptation" },
];

// All possible connections (edges)
const ALL_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0],
  [0, 13], [1, 12], [2, 12], [3, 14], [4, 15], [5, 11], [6, 15], [7, 11], [8, 13], [9, 13],
  [10, 11], [10, 12], [10, 13], [11, 15], [12, 14], [13, 0], [13, 9], [14, 4], [15, 5],
  [10, 0], [10, 2], [10, 5], [11, 7], [12, 1], [12, 3], [15, 8], [14, 3],
  [0, 9], [1, 13], [2, 14], [3, 12],
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface NeuralProfileData {
  level: number;
  xp: number;
  xpProgressPercent: number;
  xpToNextLevel: number;
  consistencyScore: number;
  progressionScore: number;
  recoveryScore: number;
  totalSessionsCompleted: number;
  neuralConnections: number;
  unlockedMilestones: string[];
  levelLabel: string;
}

interface Props {
  onClose: () => void;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        <span className="text-[10px] font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Neural SVG ───────────────────────────────────────────────────────────────

function NeuralSVG({ connections, consistencyScore }: { connections: number; consistencyScore: number }) {
  const [pulse, setPulse] = useState(0);
  const activeEdgeCount = Math.min(connections, ALL_EDGES.length);
  const activeEdges = ALL_EDGES.slice(0, activeEdgeCount);
  const activeNodeIds = new Set(activeEdges.flat());

  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => p + 1), 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <svg viewBox="0 30 380 290" className="w-full" style={{ maxHeight: 260 }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-strong">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Inactive edges (dormant) */}
      {ALL_EDGES.slice(activeEdgeCount).map(([a, b], i) => {
        const na = NODES[a], nb = NODES[b];
        return (
          <line
            key={`inactive-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="rgba(99,102,241,0.06)"
            strokeWidth="0.8"
          />
        );
      })}

      {/* Active edges */}
      {activeEdges.map(([a, b], i) => {
        const na = NODES[a], nb = NODES[b];
        const isPulsing = pulse % 3 === i % 3;
        return (
          <line
            key={`active-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={isPulsing ? "rgba(99,102,241,0.7)" : "rgba(99,102,241,0.3)"}
            strokeWidth={isPulsing ? 1.5 : 1}
            filter={isPulsing ? "url(#glow)" : undefined}
            style={{ transition: "stroke-opacity 1s ease, stroke-width 0.5s ease" }}
          />
        );
      })}

      {/* Nodes */}
      {NODES.map((node) => {
        const isActive = activeNodeIds.has(node.id);
        return (
          <g key={node.id}>
            {isActive && (
              <circle
                cx={node.x} cy={node.y} r={8}
                fill="rgba(99,102,241,0.12)"
                filter="url(#glow)"
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={isActive ? 4 : 2.5}
              fill={isActive ? "#6366f1" : "rgba(99,102,241,0.2)"}
              filter={isActive ? "url(#glow)" : undefined}
            />
          </g>
        );
      })}

      {/* Central hub label */}
      {connections >= 10 && (
        <text
          x="200" y="168"
          textAnchor="middle"
          fill="rgba(99,102,241,0.5)"
          fontSize="8"
          fontWeight="700"
          letterSpacing="0.1em"
        >
          NEURAL CORE
        </text>
      )}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BrainView({ onClose }: Props) {
  const { data, isLoading } = useQuery<NeuralProfileData>({
    queryKey: ["neural-profile"],
    queryFn: () => customFetch<NeuralProfileData>("/api/neural-profile"),
  });

  const profile = data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#0d1117] border border-primary/25 rounded-2xl overflow-hidden shadow-2xl">
        {/* Glowing top edge */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold text-primary uppercase tracking-[0.15em]">
              Neural Profile
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-12 flex flex-col items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-[10px] text-muted-foreground">Loading neural data…</span>
          </div>
        ) : profile ? (
          <div className="px-4 pb-4">
            {/* Level + XP */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-xl font-black text-primary leading-none">{profile.level}</span>
                <span className="text-[8px] text-primary/60 font-bold uppercase">LVL</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-foreground">{profile.levelLabel}</p>
                <p className="text-[9px] text-muted-foreground mb-1.5">{profile.xpToNextLevel} XP to next level</p>
                <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: `${profile.xpProgressPercent}%`,
                      boxShadow: "0 0 6px rgba(99,102,241,0.5)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Neural SVG */}
            <div className="bg-muted/5 rounded-xl border border-primary/10 mb-3 overflow-hidden">
              <NeuralSVG connections={profile.neuralConnections} consistencyScore={profile.consistencyScore} />
            </div>

            {/* Neural connections count */}
            <div className="flex items-center justify-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-muted-foreground">
                <span className="text-primary font-bold">{profile.neuralConnections}</span> neural connections active
              </span>
            </div>

            {/* Score bars */}
            <div className="space-y-2.5 mb-3">
              <ScoreBar label="Consistency" value={profile.consistencyScore} color="#6366f1" />
              <ScoreBar label="Progression" value={profile.progressionScore} color="#22c55e" />
              <ScoreBar label="Recovery" value={profile.recoveryScore} color="#f59e0b" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/15 border border-border/30 rounded-xl p-2.5 text-center">
                <p className="text-base font-black text-foreground">{profile.totalSessionsCompleted}</p>
                <p className="text-[9px] text-muted-foreground">Sessions Logged</p>
              </div>
              <div className="bg-muted/15 border border-border/30 rounded-xl p-2.5 text-center">
                <p className="text-base font-black text-foreground">{profile.unlockedMilestones.length}</p>
                <p className="text-[9px] text-muted-foreground">Milestones</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[11px] text-muted-foreground">
            Log sessions to begin building your neural profile.
          </p>
        )}
      </div>
    </div>
  );
}
