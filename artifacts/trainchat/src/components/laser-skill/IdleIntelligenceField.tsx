/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1  Full-screen CSS flat grid (masked to mid-section only)
 *  L2  Readability dark gradient
 *  L3  Ambient glow blobs — varied color palette matching terrain
 *        electric blue / cyan / deep indigo / soft violet
 *  L4  NeuralTerrainR3F — WebGL vertex-colored mesh
 *  L5  Sweep lines (staggered entrance, framer-motion)
 *
 * Props:
 *  isTyping   — reduces field opacity while user is composing
 *  isThinking — passed to terrain; triggers faster wave + violet drift
 */

import { motion } from "framer-motion";
import { NeuralTerrainR3F } from "./NeuralTerrainR3F";

// Ambient blobs — each carries its own color from the terrain palette.
// Using inline rgba tuples so the gradient matches the vertex color system.
//   Electric blue: 79,125,255   Cyan: 102,227,255
//   Deep indigo:   75,77,255    Soft violet: 122,92,255
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 290, dur: 22, delay: 0,  op: 0.038, core: "79,125,255",  outer: "75,77,255"   },
  { x: 80, y: 12, size: 230, dur: 28, delay: 5,  op: 0.030, core: "102,227,255", outer: "79,125,255"  },
  { x: 50, y: 50, size: 350, dur: 18, delay: 9,  op: 0.042, core: "79,125,255",  outer: "75,77,255"   },
  { x: 88, y: 66, size: 245, dur: 24, delay: 2,  op: 0.034, core: "122,92,255",  outer: "75,77,255"   },
  { x: 18, y: 78, size: 210, dur: 26, delay: 7,  op: 0.040, core: "102,227,255", outer: "79,125,255"  },
  { x: 62, y: 86, size: 310, dur: 20, delay: 13, op: 0.048, core: "79,125,255",  outer: "122,92,255"  },
  // Indigo haze near horizon (background depth cue)
  { x: 50, y: 6,  size: 400, dur: 32, delay: 4,  op: 0.022, core: "75,77,255",   outer: "122,92,255"  },
];

const SWEEP_LINES = [
  {
    top:        "55%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(79,125,255,0.22) 15%, rgba(102,227,255,0.55) 50%, rgba(79,125,255,0.22) 85%, transparent 100%)",
    animation:  "ii-sweep 16s ease-in-out 0.5s infinite",
    enterDelay: 0.6,
  },
  {
    top:        "30%",
    gradient:   "linear-gradient(90deg, transparent 0%, rgba(75,77,255,0.08) 25%, rgba(102,227,255,0.20) 50%, rgba(75,77,255,0.08) 75%, transparent 100%)",
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
            "linear-gradient(rgba(79,125,255,0.028) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(79,125,255,0.028) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.09) 18%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.06) 60%, transparent 70%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.09) 18%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.06) 60%, transparent 70%)",
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
            "  hsl(var(--background) / 0.55) 14%,",
            "  hsl(var(--background) / 0.06) 34%,",
            "  transparent 50%,",
            "  hsl(var(--background) / 0.22) 84%,",
            "  hsl(var(--background) / 0.55) 100%",
            ")",
          ].join(""),
        }}
      />

      {/* ── L3: Atmospheric glow blobs (terrain color palette) ───────────── */}
      {AMBIENT_BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.2, delay: i * 0.14 }}
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
              background:   `radial-gradient(circle, rgba(${blob.core},${blob.op}) 0%, rgba(${blob.outer},${(blob.op * 0.38).toFixed(3)}) 45%, transparent 70%)`,
            }}
          />
        </motion.div>
      ))}

      {/* ── L4: WebGL vertex-colored neural terrain ───────────────────────── */}
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

      {/* ── L5: Sweep lines ───────────────────────────────────────────────── */}
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
