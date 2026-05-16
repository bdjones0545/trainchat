/**
 * IdleIntelligenceField — Premium empty-state ambient animation system.
 *
 * Creates a living "precision intelligence" feeling behind the idle chat screen.
 * Features a cinematic neural grid floor (perspective plane) plus SVG neural net.
 * All animations are GPU-accelerated (transform + opacity only). Respects
 * prefers-reduced-motion via CSS class. Mouse parallax via Framer Motion springs.
 *
 * Props:
 *   isTyping  — dims the field when the user is actively typing
 */

import { useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

interface NodeDef {
  x: number;
  y: number;
  r: number;
  delay: number;
}

interface PathDef {
  points: [number, number][];
  delay: number;
  dur?: number;
}

// Neural network nodes in viewBox 0-100 coordinate space.
// Positioned to converge loosely around the logo focal point (~50, 35).
const NODES: NodeDef[] = [
  { x: 50,  y: 35,  r: 1.5, delay: 0   },   // center anchor (logo)
  { x: 31,  y: 22,  r: 1.0, delay: 0.8 },
  { x: 70,  y: 20,  r: 1.0, delay: 1.4 },
  { x: 28,  y: 46,  r: 0.9, delay: 0.4 },
  { x: 73,  y: 43,  r: 0.9, delay: 1.8 },
  { x: 40,  y: 59,  r: 0.8, delay: 2.1 },
  { x: 62,  y: 57,  r: 0.8, delay: 0.6 },
  { x: 10,  y: 11,  r: 0.6, delay: 3.2 },
  { x: 85,  y: 9,   r: 0.6, delay: 1.1 },
  { x: 5,   y: 53,  r: 0.6, delay: 2.5 },
  { x: 92,  y: 48,  r: 0.6, delay: 0.2 },
  { x: 17,  y: 80,  r: 0.5, delay: 1.7 },
  { x: 81,  y: 77,  r: 0.5, delay: 2.9 },
];

// Polyline paths connecting outer nodes → inner ring → center.
const PATHS: PathDef[] = [
  { points: [[10, 11], [31, 22], [50, 35]], delay: 0 },
  { points: [[85, 9],  [70, 20], [50, 35]], delay: 1.5 },
  { points: [[5,  53], [28, 46], [50, 35]], delay: 0.8 },
  { points: [[92, 48], [73, 43], [50, 35]], delay: 2.2 },
  { points: [[17, 80], [40, 59], [50, 35]], delay: 3.1 },
  { points: [[81, 77], [62, 57], [50, 35]], delay: 1.2 },
  { points: [[31, 22], [70, 20]],           delay: 4.0, dur: 11 },
  { points: [[28, 46], [73, 43]],           delay: 2.8, dur: 13 },
];

// Horizontal sweep lines that fire occasionally across the field.
const SWEEPS = [
  { y: 22, delay: "2s",  dur: "16s" },
  { y: 50, delay: "9s",  dur: "22s" },
  { y: 72, delay: "15s", dur: "19s" },
];

export function IdleIntelligenceField({
  isTyping = false,
}: IdleIntelligenceFieldProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Soft spring config — very damped so the parallax feels like weight, not jitter.
  const springX = useSpring(mouseX, { stiffness: 22, damping: 45 });
  const springY = useSpring(mouseY, { stiffness: 22, damping: 45 });

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      mouseX.set((e.clientX - (rect.left + rect.width / 2)) * 0.016);
      mouseY.set((e.clientY - (rect.top  + rect.height / 2)) * 0.011);
    },
    [mouseX, mouseY],
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div
      ref={containerRef}
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity: isTyping ? 0.28 : 1,
        transition: "opacity 1.2s ease",
      }}
      aria-hidden="true"
    >
      {/* ── Deep space background radial — darkens edges */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, hsl(222 47% 4% / 0.6) 100%)",
        }}
      />

      {/* ── Perspective neural grid floor — the sci-fi ground plane */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "58%",
          maskImage: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)",
        }}
      >
        <div
          className="neural-floor-grid absolute inset-0"
          style={{
            transform: "perspective(480px) rotateX(62deg) translateY(10%)",
            transformOrigin: "50% 100%",
            backgroundImage: `
              linear-gradient(hsl(var(--primary) / 0.10) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary) / 0.10) 1px, transparent 1px)
            `,
            backgroundSize: "52px 52px",
          }}
        />
      </div>

      {/* ── Horizon glow — where floor meets background */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          bottom: "38%",
          height: "60px",
          background: "linear-gradient(to top, transparent, hsl(var(--primary) / 0.05) 40%, hsl(var(--primary) / 0.03) 70%, transparent)",
          filter: "blur(8px)",
          animation: "ii-ambient-breathe 7s ease-in-out infinite",
        }}
      />

      {/* Dot grid — very faint, drifts slowly */}
      <div
        className="ii-grid absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--primary) / 0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Center ambient glow — radial haze behind the logo */}
      <div
        className="ii-ambient absolute pointer-events-none"
        style={{
          left: "50%",
          top: "34%",
          transform: "translate(-50%, -50%)",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, hsl(var(--primary) / 0.10) 0%, hsl(var(--primary) / 0.045) 40%, transparent 68%)",
        }}
      />

      {/* Secondary deep cyan glow — slightly lower, creates depth */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 200,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
          animation: "ii-ambient-breathe 9s ease-in-out 1.5s infinite",
        }}
      />

      {/* Parallax SVG layer — shifts subtly with cursor */}
      <motion.div
        className="absolute inset-0"
        style={{ x: springX, y: springY }}
      >
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Neural connection paths */}
          {PATHS.map((path, i) => {
            const d = path.points.reduce<string>(
              (acc, [x, y], j) => acc + (j === 0 ? `M ${x},${y}` : ` L ${x},${y}`),
              "",
            );
            const dur = path.dur ?? (8 + (i * 1.9) % 9);
            return (
              <path
                key={i}
                d={d}
                stroke="hsl(var(--primary))"
                strokeWidth="0.16"
                strokeLinecap="round"
                opacity="0"
                style={{
                  animation: `ii-path-breathe ${dur}s ease-in-out ${path.delay}s infinite`,
                }}
              />
            );
          })}

          {/* Performance nodes */}
          {NODES.map((node, i) => (
            <circle
              key={i}
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill="hsl(var(--primary))"
              opacity="0"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `ii-node-pulse ${4.5 + (i * 0.62) % 4}s ease-in-out ${node.delay}s infinite`,
              }}
            />
          ))}

          {/* Precision sweep lines — occasional horizontal flash */}
          {SWEEPS.map((sweep, i) => (
            <line
              key={i}
              x1="0"
              y1={sweep.y}
              x2="100"
              y2={sweep.y}
              stroke="hsl(var(--primary))"
              strokeWidth="0.07"
              opacity="0"
              style={{
                animation: `ii-sweep ${sweep.dur} linear ${sweep.delay} infinite`,
              }}
            />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
