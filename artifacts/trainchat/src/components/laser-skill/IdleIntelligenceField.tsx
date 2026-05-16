/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1  Full-screen CSS flat grid (masked to mid-section; canvas is hero at bottom)
 *  L2  Readability dark gradient
 *  L3  Ambient floating glow blobs (CSS-animated)
 *  L4  NeuralTerrainR3F — Three.js / R3F perspective mesh (lower 72%)
 *        True 3D wireframe PlaneGeometry with sine-wave vertex displacement,
 *        rendered via WebGL with GPU anti-aliasing and additive node glow.
 *  L5  Horizontal cyan sweep lines (two levels, staggered)
 *
 * prefers-reduced-motion: canvas is drawn once (static); CSS anims stripped.
 */

import { NeuralTerrainR3F } from "./NeuralTerrainR3F";

// ── Ambient glow blobs (L3) ─────────────────────────────────────────────────
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 280, opacity: 0.042, dur: 22, delay: 0  },
  { x: 80, y: 10, size: 220, opacity: 0.034, dur: 28, delay: 5  },
  { x: 50, y: 52, size: 340, opacity: 0.048, dur: 18, delay: 9  },
  { x: 88, y: 68, size: 240, opacity: 0.038, dur: 24, delay: 2  },
  { x: 18, y: 80, size: 200, opacity: 0.044, dur: 26, delay: 7  },
  { x: 62, y: 88, size: 300, opacity: 0.052, dur: 20, delay: 13 },
];

// ── Component ───────────────────────────────────────────────────────────────

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

export function IdleIntelligenceField({ isTyping = false }: IdleIntelligenceFieldProps) {
  return (
    <div
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity:    isTyping ? 0.20 : 1,
        transition: "opacity 1.4s ease",
        zIndex:     0,
      }}
      aria-hidden="true"
    >

      {/* ── L1: Full-screen flat grid ─────────────────────────────────────────
          Very subtle CSS background-image grid visible only in the mid-section
          (where neither the readability gradient nor the canvas mesh dominates).
          Keeps the upper portion of the screen feeling "part of the neural field"
          without competing with the heading text or the 3D terrain below. ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.032) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.032) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.24) 40%, rgba(0,0,0,0.08) 60%, transparent 70%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.24) 40%, rgba(0,0,0,0.08) 60%, transparent 70%)",
          animation: "ii-full-grid-breathe 14s ease-in-out infinite, ii-grid-drift 22s ease-in-out infinite",
        }}
      />

      {/* ── L2: Readability gradient ──────────────────────────────────────────
          Strong dark veil at the heading zone (top ~15%), dissolves through the
          middle breathing space, returns lightly at the very bottom to give the
          input bar a sense of depth. ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(",
            "  to bottom,",
            "  hsl(var(--background) / 0.92) 0%,",
            "  hsl(var(--background) / 0.58) 14%,",
            "  hsl(var(--background) / 0.08) 34%,",
            "  transparent 50%,",
            "  hsl(var(--background) / 0.26) 84%,",
            "  hsl(var(--background) / 0.58) 100%",
            ")",
          ].join(""),
        }}
      />

      {/* ── L3: Ambient floating glow blobs ──────────────────────────────────
          Large, extremely transparent radial-gradient blobs that drift slowly
          across the canvas, suggesting a field of neural "heat." ─────────── */}
      {AMBIENT_BLOBS.map((blob, i) => (
        <div
          key={i}
          className="absolute"
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
        </div>
      ))}

      {/* ── L4: Three.js / R3F perspective neural terrain ────────────────────
          A true 3D wireframe PlaneGeometry tilted −50° on X so it reads as a
          ground plane receding toward a vanishing point. Vertex Z-displacement
          via two crossing sine waves creates the soft terrain undulation.

          The container div fades the terrain upward into darkness so it blends
          smoothly with the readability gradient and heading text above. ────── */}
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
        <NeuralTerrainR3F />
      </div>

      {/* ── L5a: Primary cyan sweep at terrain horizon ────────────────────── */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "55%",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.28) 20%, rgba(147,197,253,0.62) 50%, rgba(96,165,250,0.28) 80%, transparent 100%)",
          filter:    "blur(0.6px)",
          animation: "ii-sweep 16s ease-in-out 0.5s infinite",
        }}
      />

      {/* ── L5b: Secondary sweep at upper content zone ───────────────────── */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "30%",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.12) 30%, rgba(147,197,253,0.28) 50%, rgba(96,165,250,0.12) 70%, transparent 100%)",
          filter:    "blur(0.6px)",
          animation: "ii-sweep 24s ease-in-out 9.5s infinite",
        }}
      />

    </div>
  );
}
