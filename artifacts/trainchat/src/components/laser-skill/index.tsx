/**
 * Laser Skill — Premium UI animation system for TrainChat.
 *
 * Communicates intelligent, real-time program construction without distracting
 * from readability. Every animation uses CSS transform + opacity only (GPU).
 * Respects prefers-reduced-motion via CSS media query on the class names.
 *
 * Components:
 *  LaserScanLine        — 1px horizontal sweep across a block during generation
 *  PrecisionGlowLine    — thin beam inserted under an exercise row when added
 *  EdgeTraceCard        — clockwise border trace on a card that just appeared
 *  VerificationSweep    — single-pass confirmation sweep (green)
 *  ArchitectPlanningDot — pulsing indicator for architect planning stages
 */

import { useEffect, useRef, useState } from "react";

// ─── Laser Scan Line ──────────────────────────────────────────────────────────
// Continuous vertical sweep across a block during AI generation phases.
// Drop inside any `position: relative; overflow: hidden` container.

interface LaserScanLineProps {
  active: boolean;
  /** Stage hint — faster scan for applying, slower for planning */
  stage?: string | null;
  /** Height of the container so the line travels the full block */
  containerHeight?: number;
}

export function LaserScanLine({
  active,
  stage,
  containerHeight = 200,
}: LaserScanLineProps) {
  if (!active) return null;

  const duration =
    stage === "applying"   ? "1.55s" :
    stage === "validating" ? "1.9s"  :
    stage === "planning"   ? "2.3s"  :
    "2s";

  return (
    <div
      className="ls-scan pointer-events-none absolute inset-x-0 top-0 z-10"
      style={{
        height: "1px",
        background:
          "linear-gradient(to right, transparent 4%, hsl(var(--primary) / 0.18) 28%, hsl(var(--primary) / 0.32) 50%, hsl(var(--primary) / 0.18) 72%, transparent 96%)",
        animation: `ls-scan ${duration} ease-in-out infinite`,
        "--ls-scan-h": `${containerHeight}px`,
      } as React.CSSProperties}
    />
  );
}

// ─── Laser Scan Block ─────────────────────────────────────────────────────────
// Convenience wrapper that auto-measures height and renders a scan line.

interface LaserScanBlockProps {
  active: boolean;
  stage?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function LaserScanBlock({
  active,
  stage,
  children,
  className,
}: LaserScanBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    if (active && ref.current) {
      setHeight(ref.current.offsetHeight + 4);
    }
  }, [active]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className ?? ""}`}>
      {children}
      <LaserScanLine active={active} stage={stage} containerHeight={height} />
    </div>
  );
}

// ─── Precision Glow Line ──────────────────────────────────────────────────────
// A 1px horizontal beam that sweeps in from the left when an exercise is
// inserted. Complements the existing ex-added background flash.

interface PrecisionGlowLineProps {
  active: boolean;
  color?: "primary" | "green";
}

export function PrecisionGlowLine({
  active,
  color = "primary",
}: PrecisionGlowLineProps) {
  if (!active) return null;

  const bg =
    color === "green"
      ? "linear-gradient(to right, transparent 4%, rgba(34,197,94,0.45) 28%, rgba(34,197,94,0.7) 50%, rgba(34,197,94,0.45) 72%, transparent 96%)"
      : "linear-gradient(to right, transparent 4%, hsl(var(--primary) / 0.4) 28%, hsl(var(--primary) / 0.65) 50%, hsl(var(--primary) / 0.4) 72%, transparent 96%)";

  return (
    <div
      className="ls-insert pointer-events-none"
      style={{
        height: "1px",
        background: bg,
        transformOrigin: "left center",
        animation: "ls-insert 0.65s ease-out forwards",
        marginTop: "1px",
      }}
    />
  );
}

// ─── Edge Trace Card ──────────────────────────────────────────────────────────
// Wraps a card. On mount (or when `trigger` increments), traces the card border
// clockwise with four thin beams, then they dissolve.

interface EdgeTraceCardProps {
  children: React.ReactNode;
  className?: string;
  /** Pass any truthy value / increment to re-trigger the trace */
  trigger?: boolean | number;
  borderRadius?: string;
}

export function EdgeTraceCard({
  children,
  className,
  trigger,
  borderRadius = "0.75rem",
}: EdgeTraceCardProps) {
  const [key, setKey] = useState(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setKey((k) => k + 1);
      return;
    }
    if (trigger) setKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const traceColor = "hsl(var(--primary) / 0.5)";
  const traceGrad = (dir: "h" | "v") =>
    dir === "h"
      ? `linear-gradient(to right, transparent 4%, ${traceColor} 28%, hsl(var(--primary) / 0.75) 50%, ${traceColor} 72%, transparent 96%)`
      : `linear-gradient(to bottom, transparent 4%, ${traceColor} 28%, hsl(var(--primary) / 0.75) 50%, ${traceColor} 72%, transparent 96%)`;

  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      {key > 0 && (
        <div
          key={key}
          className="pointer-events-none absolute inset-0 z-20"
          style={{ borderRadius }}
        >
          {/* Top → */}
          <span
            className="ls-edge-t absolute top-0 left-0 right-0"
            style={{
              height: "1px",
              background: traceGrad("h"),
              transformOrigin: "left center",
              animation: "ls-trace-h 0.2s ease-out forwards",
            }}
          />
          {/* Right ↓ */}
          <span
            className="ls-edge-r absolute top-0 right-0 bottom-0"
            style={{
              width: "1px",
              background: traceGrad("v"),
              transformOrigin: "top center",
              opacity: 0,
              animation: "ls-trace-v 0.2s ease-out 0.18s forwards",
            }}
          />
          {/* Bottom ← */}
          <span
            className="ls-edge-b absolute bottom-0 left-0 right-0"
            style={{
              height: "1px",
              background: traceGrad("h"),
              transformOrigin: "right center",
              opacity: 0,
              animation: "ls-trace-h 0.2s ease-out 0.35s forwards",
            }}
          />
          {/* Left ↑ */}
          <span
            className="ls-edge-l absolute top-0 left-0 bottom-0"
            style={{
              width: "1px",
              background: traceGrad("v"),
              transformOrigin: "bottom center",
              opacity: 0,
              animation: "ls-trace-v 0.2s ease-out 0.52s forwards",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Verification Sweep ───────────────────────────────────────────────────────
// Single-pass green beam — fires once when verification is confirmed.

interface VerificationSweepProps {
  active: boolean;
  containerHeight?: number;
}

export function VerificationSweep({
  active,
  containerHeight = 120,
}: VerificationSweepProps) {
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (active && !played) {
      const t = setTimeout(() => setPlayed(false), 1200);
      setPlayed(true);
      return () => clearTimeout(t);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active || played) return null;

  return (
    <div
      className="ls-sweep pointer-events-none absolute inset-x-0 top-0 z-10"
      style={{
        height: "1px",
        background:
          "linear-gradient(to right, transparent 4%, rgba(34,197,94,0.5) 28%, rgba(34,197,94,0.75) 50%, rgba(34,197,94,0.5) 72%, transparent 96%)",
        animation: "ls-sweep 0.75s ease-in-out forwards",
        "--ls-sweep-h": `${containerHeight}px`,
      } as React.CSSProperties}
    />
  );
}

// ─── Architect Planning Dot ───────────────────────────────────────────────────
// A small pulsing beam indicator shown during "planning" and "applying" stages
// to suggest the architect layer is actively structuring the program.

interface ArchitectPlanningDotProps {
  stage: string | null;
}

export function ArchitectPlanningDot({ stage }: ArchitectPlanningDotProps) {
  const isActive = stage === "planning" || stage === "applying" || stage === "validating";
  if (!isActive) return null;

  const label =
    stage === "planning"   ? "Structuring" :
    stage === "applying"   ? "Selecting"   :
    stage === "validating" ? "Verifying"   :
    "";

  return (
    <div
      className="inline-flex items-center gap-1.5"
      style={{ animation: "ls-architect-in 0.2s ease-out both" }}
    >
      <span
        className="inline-block w-1 h-1 rounded-full bg-primary"
        style={{ animation: "ls-architect-pulse 1.1s ease-in-out infinite" }}
      />
      <span className="text-[9px] font-semibold text-primary/70 uppercase tracking-[0.1em]">
        {label}
      </span>
    </div>
  );
}
