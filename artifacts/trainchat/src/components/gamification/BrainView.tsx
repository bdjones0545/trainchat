/**
 * BrainView — Neural System Graph
 *
 * Renders the user's training system as a live adaptive graph.
 * 8 named nodes represent training qualities.
 * 16 connections between them strengthen with each training behavior.
 *
 * Visual encoding:
 *   - Connection strength  → line thickness + brightness
 *   - Node activation level → radius + glow intensity
 *   - Dormant connections → barely visible, thin
 *   - Active connections → bright, animated pulse
 *
 * Tap any node → insight overlay explaining what drives it.
 *
 * Tone: scientific, coaching-focused. No XP, no levels.
 */

import { useEffect, useRef, useState } from "react";
import { X, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─── Node layout ──────────────────────────────────────────────────────────────
// Consistency at center. 7 peripheral nodes in an oval ring.
// Viewbox: 0 0 380 340

const NODE_LAYOUT: Record<string, { x: number; y: number; label: string }> = {
  consistency:      { x: 190, y: 170, label: "Consistency" },
  strength:         { x: 285, y: 110, label: "Strength" },
  power:            { x: 190, y:  48, label: "Power" },
  movement_quality: { x:  95, y: 110, label: "Movement" },
  recovery:         { x:  70, y: 205, label: "Recovery" },
  lower_body:       { x: 135, y: 295, label: "Lower Body" },
  trunk:            { x: 245, y: 295, label: "Trunk" },
  upper_body:       { x: 310, y: 205, label: "Upper Body" },
};

// All 16 connections matching the service definition
const ALL_CONNECTIONS: Array<[string, string]> = [
  ["consistency", "strength"],
  ["consistency", "recovery"],
  ["consistency", "trunk"],
  ["consistency", "lower_body"],
  ["consistency", "upper_body"],
  ["strength",    "power"],
  ["strength",    "lower_body"],
  ["strength",    "upper_body"],
  ["strength",    "movement_quality"],
  ["power",       "lower_body"],
  ["power",       "movement_quality"],
  ["movement_quality", "trunk"],
  ["movement_quality", "recovery"],
  ["recovery",    "strength"],
  ["lower_body",  "trunk"],
  ["upper_body",  "trunk"],
];

// ─── Insight copy per node ────────────────────────────────────────────────────

const NODE_INSIGHTS: Record<string, { headline: string; detail: string }> = {
  consistency: {
    headline: "Consistency",
    detail: "The master signal. Every completed session strengthens this node and propagates energy through the entire network.",
  },
  strength: {
    headline: "Strength",
    detail: "Force application capacity. Reinforced through progressive loading and full session completion.",
  },
  power: {
    headline: "Power",
    detail: "Rate of force development. Built on strength foundations and activated when progressions succeed.",
  },
  movement_quality: {
    headline: "Movement Quality",
    detail: "Pattern efficiency under load. Improves when sessions are completed at appropriate intensity with good technique.",
  },
  recovery: {
    headline: "Recovery",
    detail: "Adaptation and readiness capacity. Reflects your readiness logging behavior and recovery between sessions.",
  },
  lower_body: {
    headline: "Lower Body Output",
    detail: "Force and capacity in the lower kinetic chain. Driven by consistent lower-body training and progression.",
  },
  upper_body: {
    headline: "Upper Body Output",
    detail: "Push and pull capacity. Built through upper-chain training volume and progressive resistance.",
  },
  trunk: {
    headline: "Trunk Stability",
    detail: "The anchor of all movement quality. Reinforced every time a full session is completed with proper positioning.",
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  activationLevel: number;
}

interface GraphConnection {
  from: string;
  to: string;
  strength: number;
  lastReinforced: string;
}

interface GraphState {
  nodes: GraphNode[];
  connections: GraphConnection[];
  version: number;
}

interface NeuralProfileData {
  maturityLabel: string;
  maturityProgress: number;
  consistencyScore: number;
  progressionScore: number;
  recoveryScore: number;
  totalSessionsCompleted: number;
  neuralConnections: number;
  unlockedMilestones: string[];
  graphState: GraphState;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-[10px] text-foreground font-semibold">{label}</span>
          <span className="text-[9px] text-muted-foreground ml-1.5">{subtitle}</span>
        </div>
        <span className="text-[10px] font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1 bg-muted/15 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 5px ${color}50` }} />
      </div>
    </div>
  );
}

// ─── Node insight overlay ─────────────────────────────────────────────────────

function NodeInsight({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const insight = NODE_INSIGHTS[nodeId];
  if (!insight) return null;
  return (
    <div className="absolute inset-x-3 bottom-3 bg-[#0d1117] border border-primary/30 rounded-xl p-3 shadow-xl"
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold text-foreground">{insight.headline}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{insight.detail}</p>
    </div>
  );
}

// ─── Neural graph SVG ─────────────────────────────────────────────────────────

function NeuralGraphSVG({
  graphState,
  onNodeTap,
}: {
  graphState: GraphState;
  onNodeTap: (nodeId: string) => void;
}) {
  const [pulse, setPulse] = useState(0);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => (p + 1) % 16), 1800);
    return () => clearInterval(timer);
  }, []);

  // Build lookups from real graph state
  const strengthMap = new Map<string, number>();
  const activationMap = new Map<string, number>();

  graphState.connections.forEach((c) => {
    const key = [c.from, c.to].sort().join(":");
    strengthMap.set(key, c.strength);
  });
  graphState.nodes.forEach((n) => {
    activationMap.set(n.id, n.activationLevel);
  });

  return (
    <svg viewBox="0 0 380 340" className="w-full" style={{ maxHeight: 240 }}>
      <defs>
        <filter id="ng-glow-soft">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="ng-glow-strong">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="ng-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Connections */}
      {ALL_CONNECTIONS.map(([a, b], i) => {
        const na = NODE_LAYOUT[a];
        const nb = NODE_LAYOUT[b];
        if (!na || !nb) return null;
        const key = [a, b].sort().join(":");
        const strength = strengthMap.get(key) ?? 0;
        const isPulsing = pulse === i % 16;
        const strokeWidth = 0.8 + strength * 3.5;
        const opacity = strength < 0.01 ? 0.05 : 0.15 + strength * 0.75;
        const isHighlighted = highlightedNode === a || highlightedNode === b;

        return (
          <line
            key={`conn-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={strength > 0.3 ? "#818cf8" : "#6366f1"}
            strokeWidth={isHighlighted ? strokeWidth + 1 : strokeWidth}
            opacity={isHighlighted ? Math.min(1, opacity + 0.3) : isPulsing && strength > 0.05 ? opacity + 0.15 : opacity}
            filter={strength > 0.5 && isPulsing ? "url(#ng-glow-soft)" : undefined}
            style={{ transition: "stroke-width 0.5s ease, opacity 0.6s ease" }}
          />
        );
      })}

      {/* Nodes */}
      {Object.entries(NODE_LAYOUT).map(([nodeId, pos]) => {
        const activation = activationMap.get(nodeId) ?? 0;
        const isCentral = nodeId === "consistency";
        const baseRadius = isCentral ? 14 : 10;
        const radius = baseRadius + activation * (isCentral ? 8 : 6);
        const glowRadius = radius + 10 + activation * 15;
        const isHighlighted = highlightedNode === nodeId;
        const hasActivity = activation > 0.05;

        return (
          <g
            key={nodeId}
            onClick={(e) => { e.stopPropagation(); onNodeTap(nodeId); setHighlightedNode(isHighlighted ? null : nodeId); }}
            style={{ cursor: "pointer" }}
          >
            {/* Glow halo */}
            {hasActivity && (
              <circle cx={pos.x} cy={pos.y} r={glowRadius}
                fill="url(#ng-node-glow)"
                opacity={0.1 + activation * 0.4}
                style={{ transition: "r 1s ease, opacity 1s ease" }}
              />
            )}

            {/* Outer ring */}
            {isHighlighted && (
              <circle cx={pos.x} cy={pos.y} r={radius + 5}
                fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth="1"
                filter="url(#ng-glow-soft)"
              />
            )}

            {/* Core node */}
            <circle
              cx={pos.x} cy={pos.y} r={radius}
              fill={hasActivity
                ? `rgba(99,102,241,${0.15 + activation * 0.45})`
                : "rgba(99,102,241,0.06)"}
              stroke={hasActivity ? `rgba(129,140,248,${0.4 + activation * 0.5})` : "rgba(99,102,241,0.15)"}
              strokeWidth={hasActivity ? 1.2 : 0.8}
              filter={activation > 0.5 ? "url(#ng-glow-soft)" : undefined}
              style={{ transition: "r 1s ease, fill 1s ease, stroke 1s ease" }}
            />

            {/* Center dot */}
            {hasActivity && (
              <circle cx={pos.x} cy={pos.y} r={3}
                fill={`rgba(165,180,252,${0.5 + activation * 0.5})`}
                filter="url(#ng-glow-soft)"
              />
            )}

            {/* Label */}
            <text
              x={pos.x}
              y={pos.y + radius + 13}
              textAnchor="middle"
              fill={hasActivity ? "rgba(165,180,252,0.85)" : "rgba(99,102,241,0.3)"}
              fontSize={isCentral ? "9" : "8"}
              fontWeight={isCentral ? "700" : "500"}
              letterSpacing="0.03em"
              style={{ userSelect: "none" }}
            >
              {pos.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BrainView({ onClose }: { onClose: () => void }) {
  const [tappedNode, setTappedNode] = useState<string | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<NeuralProfileData>({
    queryKey: ["neural-profile"],
    queryFn: () => customFetch<NeuralProfileData>("/api/neural-profile"),
  });

  const defaultGraph: GraphState = {
    nodes: Object.keys(NODE_LAYOUT).map((id) => ({ id, activationLevel: 0 })),
    connections: ALL_CONNECTIONS.map(([from, to]) => ({ from, to, strength: 0, lastReinforced: "" })),
    version: 1,
  };

  const graphState = data?.graphState ?? defaultGraph;
  const profile = data;

  const activeConnectionCount = graphState.connections.filter((c) => c.strength > 0.01).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setTappedNode(null); onClose(); }} />
      <div className="relative w-full max-w-sm bg-[#0d1117] border border-primary/20 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.16em]">Neural System</span>
          </div>
          <button onClick={onClose}
            className="w-6 h-6 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 flex flex-col items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-[9px] text-muted-foreground">Loading adaptation data…</span>
          </div>
        ) : (
          <div className="px-4 pb-4">
            {/* Maturity stage */}
            {profile && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-foreground">{profile.maturityLabel}</p>
                  <span className="text-[9px] text-muted-foreground">{profile.maturityProgress}% to next stage</span>
                </div>
                <div className="h-0.5 bg-muted/15 rounded-full overflow-hidden">
                  <div className="h-full bg-primary/50 rounded-full"
                    style={{ width: `${profile.maturityProgress}%` }} />
                </div>
              </div>
            )}

            {/* Graph — primary visual */}
            <div
              ref={svgRef}
              className="relative bg-muted/5 rounded-xl border border-primary/8 mb-2 overflow-hidden"
              onClick={() => setTappedNode(null)}
            >
              <NeuralGraphSVG
                graphState={graphState}
                onNodeTap={(nodeId) => setTappedNode(tappedNode === nodeId ? null : nodeId)}
              />
              {tappedNode && (
                <NodeInsight nodeId={tappedNode} onClose={() => setTappedNode(null)} />
              )}
            </div>

            {/* Tap hint */}
            <p className="text-[8px] text-muted-foreground/40 text-center mb-3">
              tap any node to see what drives it
            </p>

            {/* Connection count */}
            <div className="flex items-center justify-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[9px] text-muted-foreground">
                <span className="text-primary/80 font-semibold">{activeConnectionCount}</span> of {ALL_CONNECTIONS.length} pathways active
              </span>
            </div>

            {/* Score bars */}
            {profile && (
              <div className="space-y-2.5 mb-3">
                <ScoreBar label="Consistency" value={profile.consistencyScore} color="#6366f1" subtitle="vs target frequency" />
                <ScoreBar label="Progression" value={profile.progressionScore} color="#22c55e" subtitle="quality execution" />
                <ScoreBar label="Recovery"    value={profile.recoveryScore}    color="#f59e0b" subtitle="readiness index" />
              </div>
            )}

            {/* Stats */}
            {profile && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/10 border border-border/20 rounded-xl p-2.5 text-center">
                  <p className="text-base font-black text-foreground">{profile.totalSessionsCompleted}</p>
                  <p className="text-[9px] text-muted-foreground">Sessions Logged</p>
                </div>
                <div className="bg-muted/10 border border-border/20 rounded-xl p-2.5 text-center">
                  <p className="text-base font-black text-foreground">{activeConnectionCount}</p>
                  <p className="text-[9px] text-muted-foreground">Active Pathways</p>
                </div>
              </div>
            )}

            {!profile && (
              <p className="py-6 text-center text-[10px] text-muted-foreground">
                Begin logging sessions to activate your neural graph.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
