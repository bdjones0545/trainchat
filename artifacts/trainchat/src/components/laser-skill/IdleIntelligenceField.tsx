/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1   Full-screen CSS flat grid (masked to mid-section only)
 *  L2   Readability dark gradient — stronger at top for headline breathing room
 *  L3   Ambient floating glow blobs
 *  L3.5 Atmospheric horizon glow — soft blue radial above the convergence point
 *  L4   NeuralTerrainR3F (WebGL perspective mesh) — occupies lower 80%
 *  L4.5 Neural energy sweeps — 3 slow diagonal light bands
 *  L5   Horizontal sweep accent lines
 *
 * Props:
 *  isTyping    — reduces field opacity while user is composing
 *  isThinking  — triggers 1.5× wave speed + faster color drift in terrain
 */

import { motion } from "framer-motion";
import { NeuralTerrainR3F } from "./NeuralTerrainR3F";

const AMBIENT_BLOBS = [
  { x: 14, y: 22, size: 260, opacity: 0.036, dur: 24, delay: 0  },
  { x: 80, y: 12, size: 200, opacity: 0.028, dur: 30, delay: 5  },
  { x: 50, y: 55, size: 310, opacity: 0.040, dur: 20, delay: 9  },
  { x: 88, y: 70, size: 220, opacity: 0.032, dur: 26, delay: 2  },
  { x: 18, y: 82, size: 180, opacity: 0.038, dur: 28, delay: 7  },
  { x: 62, y: 90, size: 280, opacity: 0.044, dur: 22, delay: 13 },
];

// Horizontal accent lines — subtle, staggered entrance
const SWEEP_LINES = [
  {
    top:        "52%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.20) 22%, rgba(147,197,253,0.48) 50%, rgba(96,165,250,0.20) 78%, transparent 100%)",
    animation:  "ii-sweep 18s ease-in-out 0.5s infinite",
    enterDelay: 0.7,
  },
  {
    top:        "28%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.07) 32%, rgba(147,197,253,0.16) 50%, rgba(96,165,250,0.07) 68%, transparent 100%)",
    animation:  "ii-sweep 26s ease-in-out 10s infinite",
    enterDelay: 1.1,
  },
];

interface IdleIntelligenceFieldProps {
  isTyping?:   boolean;
  isThinking?: boolean;
}

export function IdleIntelligenceField({
  isTyping   = false,
  isThinking = false,
}: IdleIntelligenceFieldProps) {
  return (
    <motion.div
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      animate={{ opacity: isTyping ? 0.18 : 1 }}
      transition={{ duration: 1.6, ease: "easeOut" }}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >

      {/* ── L1: Flat CSS grid ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.024) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.024) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "64px 64px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 20%, rgba(0,0,0,0.16) 42%, rgba(0,0,0,0.05) 62%, transparent 72%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 20%, rgba(0,0,0,0.16) 42%, rgba(0,0,0,0.05) 62%, transparent 72%)",
          animation: "ii-full-grid-breathe 16s ease-in-out infinite, ii-grid-drift 26s ease-in-out infinite",
        }}
      />

      {/* ── L2: Readability gradient — heavier at top for headline clarity ── */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(",
            "  to bottom,",
            "  hsl(var(--background) / 0.94) 0%,",
            "  hsl(var(--background) / 0.62) 12%,",
            "  hsl(var(--background) / 0.10) 32%,",
            "  transparent 48%,",
            "  hsl(var(--background) / 0.20) 82%,",
            "  hsl(var(--background) / 0.52) 100%",
            ")",
          ].join(""),
        }}
      />

      {/* ── L3: Ambient glow blobs ────────────────────────────────────────── */}
      {AMBIENT_BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.2, delay: blob.delay * 0.10 }}
          style={{
            left:      `${blob.x}%`,
            top:       `${blob.y}%`,
            animation: `ii-node-drift ${blob.dur}s ease-in-out ${blob.delay}s infinite alternate`,
          }}
        >
          <div
            style={{
              width:        blob.size,
              height:       blob.size,
              transform:    "translate(-50%, -50%)",
              borderRadius: "50%",
              background:   `radial-gradient(circle, rgba(96,165,250,${blob.opacity}) 0%, rgba(79,70,229,${(blob.opacity * 0.35).toFixed(3)}) 45%, transparent 72%)`,
            }}
          />
        </motion.div>
      ))}

      {/* ── L3.5: Atmospheric horizon glow ───────────────────────────────── */}
      {/* Soft blue radial above the terrain's convergence point.
          Creates dimensional depth — the "sky" behind the neural field. */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom:    "30%",
          left:      "50%",
          transform: "translateX(-50%)",
          width:     "90%",
          height:    "160px",
          background: "radial-gradient(ellipse 90% 55% at center, rgba(29,78,216,0.042) 0%, rgba(55,48,163,0.018) 55%, transparent 80%)",
          filter:    "blur(32px)",
        }}
      />

      {/* ── L4: WebGL perspective neural terrain ─────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: "80%",
          // Mask: full visibility in lower portion, gradual fade toward horizon
          maskImage:
            "linear-gradient(to top, black 0%, black 30%, rgba(0,0,0,0.45) 58%, rgba(0,0,0,0.10) 82%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, black 30%, rgba(0,0,0,0.45) 58%, rgba(0,0,0,0.10) 82%, transparent 100%)",
          pointerEvents: "none",
        }}
      >
        <NeuralTerrainR3F isThinking={isThinking} />
      </div>

      {/* ── L4.5: Neural energy sweeps ────────────────────────────────────── */}
      {/* Slow diagonal light bands — suggest neural activity flowing through
          the field. 3 bands at different vertical positions + staggered timing.
          Contained in overflow:hidden so they don't bleed outside the field. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="ii-energy-sweep-a" />
        <div className="ii-energy-sweep-b" />
        <div className="ii-energy-sweep-c" />
      </div>

      {/* ── L5: Horizontal sweep accent lines ────────────────────────────── */}
      {SWEEP_LINES.map((line, i) => (
        <motion.div
          key={i}
          className="absolute left-0 right-0 ii-sweep-line"
          initial={{ opacity: 0, scaleX: 0.5 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.6, delay: line.enterDelay, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height:     "1px",
            top:        line.top,
            background: line.gradient,
            filter:     "blur(0.5px)",
            animation:  line.animation,
          }}
        />
      ))}

    </motion.div>
  );
}
