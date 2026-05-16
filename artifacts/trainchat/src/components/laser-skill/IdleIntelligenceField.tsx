/**
 * IdleIntelligenceField — ultra-minimal ambient background.
 *
 * Acts as pure atmosphere, never competing with content.
 * Very faint radial gradient + near-invisible SVG neural paths.
 * All animations are GPU-accelerated (transform/opacity only).
 */

import { useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

const NODES = [
  { x: 50,  y: 38,  r: 1.2, delay: 0   },
  { x: 30,  y: 24,  r: 0.7, delay: 1.2 },
  { x: 71,  y: 22,  r: 0.7, delay: 2.0 },
  { x: 26,  y: 48,  r: 0.6, delay: 0.6 },
  { x: 74,  y: 45,  r: 0.6, delay: 1.8 },
  { x: 42,  y: 60,  r: 0.5, delay: 2.8 },
  { x: 60,  y: 58,  r: 0.5, delay: 0.4 },
];

const PATHS = [
  { points: [[30, 24], [50, 38]] as [number,number][], delay: 0 },
  { points: [[71, 22], [50, 38]] as [number,number][], delay: 1.8 },
  { points: [[26, 48], [50, 38]] as [number,number][], delay: 0.9 },
  { points: [[74, 45], [50, 38]] as [number,number][], delay: 2.4 },
  { points: [[42, 60], [50, 38]] as [number,number][], delay: 3.5 },
  { points: [[60, 58], [50, 38]] as [number,number][], delay: 1.1 },
];

export function IdleIntelligenceField({ isTyping = false }: IdleIntelligenceFieldProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 18, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 18, damping: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseX.set((e.clientX - (rect.left + rect.width / 2)) * 0.010);
    mouseY.set((e.clientY - (rect.top  + rect.height / 2)) * 0.007);
  }, [mouseX, mouseY]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div
      ref={containerRef}
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity: isTyping ? 0.15 : 1,
        transition: "opacity 1.4s ease",
      }}
      aria-hidden="true"
    >
      {/* Single very faint radial ambient — just enough to feel alive */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle at center, hsl(var(--primary) / 0.055) 0%, hsl(var(--primary) / 0.02) 45%, transparent 70%)",
          animation: "ii-ambient-breathe 8s ease-in-out infinite",
        }}
      />

      {/* Neural paths — parallax layer, barely visible */}
      <motion.div
        className="absolute inset-0"
        style={{ x: springX, y: springY }}
      >
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          {PATHS.map((path, i) => {
            const d = path.points.reduce<string>(
              (acc, [x, y], j) => acc + (j === 0 ? `M ${x},${y}` : ` L ${x},${y}`),
              "",
            );
            return (
              <path
                key={i}
                d={d}
                stroke="hsl(var(--primary))"
                strokeWidth="0.12"
                strokeLinecap="round"
                opacity="0"
                style={{
                  animation: `ii-path-breathe ${9 + (i * 2.1) % 6}s ease-in-out ${path.delay}s infinite`,
                }}
              />
            );
          })}

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
                animation: `ii-node-pulse ${6 + (i * 0.8) % 4}s ease-in-out ${node.delay}s infinite`,
              }}
            />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
