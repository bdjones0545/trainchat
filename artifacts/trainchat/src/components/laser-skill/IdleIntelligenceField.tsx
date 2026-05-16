/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1  Full-screen CSS flat grid (masked to mid-section only)
 *  L2  Readability dark gradient
 *  L3  Ambient floating glow blobs (framer-motion drift entrance)
 *  L4  NeuralTerrainR3F — WebGL perspective mesh with bloom + sparkles
 *  L5  Sweep lines (framer-motion entrance, staggered)
 *
 * Props:
 *  isTyping    — reduces field opacity while user is composing
 *  isThinking  — triggers faster wave + violet color shift in terrain
 */

import { motion } from "framer-motion";
import { NeuralTerrainR3F } from "./NeuralTerrainR3F";

const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 280, opacity: 0.042, dur: 22, delay: 0  },
  { x: 80, y: 10, size: 220, opacity: 0.034, dur: 28, delay: 5  },
  { x: 50, y: 52, size: 340, opacity: 0.048, dur: 18, delay: 9  },
  { x: 88, y: 68, size: 240, opacity: 0.038, dur: 24, delay: 2  },
  { x: 18, y: 80, size: 200, opacity: 0.044, dur: 26, delay: 7  },
  { x: 62, y: 88, size: 300, opacity: 0.052, dur: 20, delay: 13 },
];

const SWEEP_LINES = [
  {
    top:        "55%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.28) 20%, rgba(147,197,253,0.62) 50%, rgba(96,165,250,0.28) 80%, transparent 100%)",
    animation:  "ii-sweep 16s ease-in-out 0.5s infinite",
    enterDelay: 0.6,
  },
  {
    top:        "30%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.10) 30%, rgba(147,197,253,0.24) 50%, rgba(96,165,250,0.10) 70%, transparent 100%)",
    animation:  "ii-sweep 24s ease-in-out 9.5s infinite",
    enterDelay: 1.0,
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
      animate={{ opacity: isTyping ? 0.20 : 1 }}
      transition={{ duration: 1.4, ease: "easeOut" }}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >

      {/* ── L1: Flat CSS grid ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.030) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.030) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.22) 40%, rgba(0,0,0,0.07) 60%, transparent 70%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.22) 40%, rgba(0,0,0,0.07) 60%, transparent 70%)",
          animation: "ii-full-grid-breathe 14s ease-in-out infinite, ii-grid-drift 22s ease-in-out infinite",
        }}
      />

      {/* ── L2: Readability gradient ──────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(",
            "  to bottom,",
            "  hsl(var(--background) / 0.92) 0%,",
            "  hsl(var(--background) / 0.56) 14%,",
            "  hsl(var(--background) / 0.07) 34%,",
            "  transparent 50%,",
            "  hsl(var(--background) / 0.24) 84%,",
            "  hsl(var(--background) / 0.56) 100%",
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
          transition={{ duration: 1.8, delay: blob.delay * 0.12 }}
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
              background:   `radial-gradient(circle, rgba(96,165,250,${blob.opacity}) 0%, rgba(99,102,241,${(blob.opacity * 0.4).toFixed(3)}) 45%, transparent 70%)`,
            }}
          />
        </motion.div>
      ))}

      {/* ── L4: WebGL perspective neural terrain ─────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height:          "72%",
          maskImage:
            "linear-gradient(to top, black 0%, black 38%, rgba(0,0,0,0.50) 65%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, black 38%, rgba(0,0,0,0.50) 65%, transparent 100%)",
          pointerEvents: "none",
        }}
      >
        <NeuralTerrainR3F isThinking={isThinking} />
      </div>

      {/* ── L5: Horizontal sweep lines ────────────────────────────────────── */}
      {SWEEP_LINES.map((line, i) => (
        <motion.div
          key={i}
          className="absolute left-0 right-0 ii-sweep-line"
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.4, delay: line.enterDelay, ease: [0.22, 1, 0.36, 1] }}
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
