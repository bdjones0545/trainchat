/**
 * IdleIntelligenceField — full-screen living neural atmosphere.
 *
 * Six-layer composited background system:
 *  L1  Full-screen orthogonal grid lines (masked: invisible at top → visible at bottom)
 *  L2  Readability dark gradient (strongest at heading zone, clears in middle)
 *  L3  Ambient floating glow blobs (large, transparent, drift slowly)
 *  L4  Wave-field neural floor (lower 58%):
 *        – wavy horizontal paths (amplitude increases toward viewer)
 *        – straight vertical lines
 *        – nodes with diagonal wave-sweep pulse timing
 *        – slow perspective + rotation oscillation (undulating terrain)
 *  L5  Horizontal cyan sweep lines (two levels, staggered)
 *
 * Respects prefers-reduced-motion (CSS, no JS check needed).
 */

// ── Ambient glow blobs ──────────────────────────────────────────────────────
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 260, opacity: 0.038, dur: 22, delay: 0  },
  { x: 80, y: 10, size: 200, opacity: 0.030, dur: 28, delay: 5  },
  { x: 50, y: 50, size: 320, opacity: 0.042, dur: 18, delay: 9  },
  { x: 88, y: 68, size: 220, opacity: 0.033, dur: 24, delay: 2  },
  { x: 18, y: 80, size: 180, opacity: 0.040, dur: 26, delay: 7  },
  { x: 62, y: 88, size: 280, opacity: 0.046, dur: 20, delay: 13 },
];

// ── Wave floor grid geometry ────────────────────────────────────────────────
// 11 columns × 7 rows, viewBox 0 0 140 80
const P_COLS = [0, 14, 28, 42, 56, 70, 84, 98, 112, 126, 140];
const P_ROWS = [0, 13, 26, 39, 52, 65, 80];

// Wave amplitude per row: increases toward viewer (bottom of perspective plane)
// so the undulation is subtle near the horizon and richer near the viewer.
const ROW_AMP = [0.35, 0.55, 0.80, 1.05, 1.35, 1.65, 1.90];

/**
 * Returns a cubic-bezier SVG path that forms a gentle sine-like wave
 * at nominal y-coordinate `y`, with the given amplitude per half-period.
 */
function waveLinePath(y: number, amplitude: number): string {
  const period = 28; // SVG units per full wave cycle
  let d = `M 0,${y}`;
  for (let x = 0; x < 140; x += period) {
    const ex  = Math.min(x + period, 140);
    const cp1 = x + period * 0.25;
    const cp2 = x + period * 0.75;
    // One S-curve segment: dip below then rise above y
    d += ` C ${cp1},${y - amplitude} ${cp2},${y + amplitude} ${ex},${y}`;
  }
  return d;
}

// Precompute wave paths so they're not regenerated each render.
const WAVE_PATHS = P_ROWS.map((y, ri) => ({
  y,
  d: waveLinePath(y, ROW_AMP[ri]),
}));

// Nodes with diagonal wave-sweep timing:
//   delay = f(colIndex + rowIndex) → pulses propagate diagonally across the field
//   giving the impression of a signal or wave passing through the neural terrain.
const WAVE_NODES = P_ROWS.flatMap((y, ri) =>
  P_COLS.map((x, ci) => ({
    x,
    y,
    r:      0.52 + ri * 0.11,
    outerR: 1.50 + ri * 0.28,
    // Pulse duration: organic variation per node
    dur:   (2.8 + ((ci * 0.13 + ri * 0.09) % 1.4)).toFixed(1),
    // Diagonal wave-sweep delay — signal propagates from top-left to bottom-right
    delay: (((ci + ri) * 0.14) % 3.0).toFixed(2),
  })),
);

// ── Component ───────────────────────────────────────────────────────────────

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

export function IdleIntelligenceField({ isTyping = false }: IdleIntelligenceFieldProps) {
  return (
    <div
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity:    isTyping ? 0.22 : 1,
        transition: "opacity 1.4s ease",
        zIndex: 0,
      }}
      aria-hidden="true"
    >

      {/* ── L1: Full-screen orthogonal grid lines ─────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.058) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.058) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.18) 18%, rgba(0,0,0,0.48) 42%, rgba(0,0,0,0.78) 68%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.18) 18%, rgba(0,0,0,0.48) 42%, rgba(0,0,0,0.78) 68%, black 100%)",
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
            "  hsl(var(--background) / 0.86) 0%,",
            "  hsl(var(--background) / 0.52) 16%,",
            "  hsl(var(--background) / 0.12) 38%,",
            "  transparent 55%,",
            "  hsl(var(--background) / 0.18) 80%,",
            "  hsl(var(--background) / 0.52) 100%",
            ")",
          ].join(""),
        }}
      />

      {/* ── L3: Ambient floating glow blobs ──────────────────────────────── */}
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

      {/* ── L4: Wave-field neural floor ───────────────────────────────────────
          The signature 3-D grid in the lower ~58 % of the canvas.

          Structure:
          ┌─ clip container (mask fades toward top)
          │  └─ perspective + wave-oscillation wrapper
          │     └─ SVG: wavy horizontal paths + straight verticals + nodes

          The wavy horizontal paths simulate organic terrain — each row has
          progressively higher amplitude so undulation is more visible near
          the viewer and barely perceptible at the horizon.

          The wrapper animates ii-floor-wave: a slow oscillation of both
          perspective distance (280–320 px) and rotateX (50.5°–53.5°),
          giving the impression of an adaptive field gently breathing.

          Node pulse timing uses a diagonal delay formula so pulses appear
          to propagate as a wave across the field, suggesting signal flow.
      ──────────────────────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height:          "58%",
          maskImage:       "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.36) 52%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.36) 52%, transparent 100%)",
          overflow:        "hidden",
        }}
      >
        {/* Perspective + undulation wrapper */}
        <div
          style={{
            position:        "absolute",
            inset:           0,
            transformOrigin: "50% 100%",
            animation:       "ii-floor-wave 20s ease-in-out infinite",
          }}
        >
          <svg
            viewBox="0 0 140 80"
            preserveAspectRatio="xMidYMid slice"
            style={{ width: "100%", height: "100%", overflow: "visible" }}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Wavy horizontal lines — organic terrain effect */}
            {WAVE_PATHS.map(({ y, d }) => (
              <path
                key={`wh${y}`}
                d={d}
                stroke="rgba(96,165,250,0.14)"
                strokeWidth="0.28"
                fill="none"
                strokeLinecap="round"
              />
            ))}

            {/* Straight vertical lines — slightly dimmer for visual hierarchy */}
            {P_COLS.map((x) => (
              <line
                key={`v${x}`}
                x1={x} y1="0"
                x2={x} y2="80"
                stroke="rgba(96,165,250,0.09)"
                strokeWidth="0.22"
              />
            ))}

            {/* Intersection nodes — diagonal wave-sweep pulse timing */}
            {WAVE_NODES.map((n, i) => (
              <g key={i}>
                {/* Outer soft halo */}
                <circle
                  cx={n.x} cy={n.y} r={n.outerR}
                  fill="rgba(96,165,250,0.09)"
                  style={{
                    animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite`,
                  }}
                />
                {/* Inner bright core */}
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill="rgba(147,197,253,0.80)"
                  style={{
                    animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite`,
                  }}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* ── L5a: Primary cyan sweep — floor horizon ───────────────────────── */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "58%",
          background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.22) 20%, rgba(147,197,253,0.52) 50%, rgba(96,165,250,0.22) 80%, transparent 100%)",
          filter:     "blur(0.6px)",
          animation:  "ii-sweep 16s ease-in-out 0.5s infinite",
        }}
      />

      {/* ── L5b: Secondary sweep — upper content zone ─────────────────────── */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "30%",
          background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.10) 30%, rgba(147,197,253,0.22) 50%, rgba(96,165,250,0.10) 70%, transparent 100%)",
          filter:     "blur(0.6px)",
          animation:  "ii-sweep 24s ease-in-out 9.5s infinite",
        }}
      />

    </div>
  );
}
