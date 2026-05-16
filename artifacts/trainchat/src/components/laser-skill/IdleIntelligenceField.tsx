/**
 * IdleIntelligenceField — full-screen living neural atmosphere.
 *
 * Six-layer composited background system that covers the entire chat canvas:
 *
 *  L1  Full-screen orthogonal grid lines (masked: invisible at top → visible at bottom)
 *  L2  Readability dark gradient (strongest at heading zone, clears in middle)
 *  L3  Ambient floating glow blobs (large, transparent, drift slowly)
 *  L4  Perspective neural floor (lower 58%, glowing node intersections)
 *  L5  Horizontal cyan sweep lines (two levels, staggered, infrequent)
 *
 * Respects prefers-reduced-motion: all animation is disabled via CSS.
 * Designed to feel alive but never distracting — a backdrop, not a feature.
 */

// ── Ambient glow blobs ──────────────────────────────────────────────────────
// Large, extremely transparent radial gradients scattered across the screen.
// They drift slowly to suggest the field is breathing.
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 260, opacity: 0.038, dur: 22, delay: 0   },
  { x: 80, y: 10, size: 200, opacity: 0.030, dur: 28, delay: 5   },
  { x: 50, y: 50, size: 320, opacity: 0.042, dur: 18, delay: 9   },
  { x: 88, y: 68, size: 220, opacity: 0.033, dur: 24, delay: 2   },
  { x: 18, y: 80, size: 180, opacity: 0.040, dur: 26, delay: 7   },
  { x: 62, y: 88, size: 280, opacity: 0.046, dur: 20, delay: 13  },
];

// ── Perspective floor grid geometry ────────────────────────────────────────
// 11 columns × 7 rows = 77 glowing intersection nodes on the perspective plane.
const P_COLS = [0, 14, 28, 42, 56, 70, 84, 98, 112, 126, 140];
const P_ROWS = [0, 13, 26, 39, 52, 65, 80];

const FLOOR_NODES = P_ROWS.flatMap((y, ri) =>
  P_COLS.map((x, ci) => ({
    x,
    y,
    r:      0.55 + ri * 0.12,
    outerR: 1.60 + ri * 0.30,
    dur:    (2.6  + ((ci + ri) * 0.11) % 1.6).toFixed(1),
    delay:  ((ci  * 0.18 + ri * 0.27)  % 2.8).toFixed(2),
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

      {/* ── L1: Full-screen orthogonal grid lines ─────────────────────────────
          Very faint cyan grid that spans the entire chat canvas.
          Masked gradient makes it invisible at the top (where the heading
          lives) and gradually more visible toward the bottom, where it
          merges with the perspective floor.  Slow drift + breathe. ──────── */}
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

      {/* ── L2: Readability gradient ──────────────────────────────────────────
          Dark veil composited above the grid. Strongest at the top third
          of the screen — where the heading text sits — then fades to near-
          transparent in the middle zone where the grid provides depth, then
          returns slightly at the very bottom to frame the input bar. ─────── */}
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

      {/* ── L3: Ambient floating glow blobs ──────────────────────────────────
          Very large, extremely transparent radial-gradient circles placed
          at strategic points across the canvas.  They drift at different
          rates via the ii-node-drift keyframe to suggest a slow neural
          "breathing."  Two-div structure: outer drifts, inner centres. ──── */}
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
              background:   `radial-gradient(circle, rgba(96,165,250,${blob.opacity}) 0%, rgba(99,102,241,${blob.opacity * 0.4}) 45%, transparent 70%)`,
            }}
          />
        </div>
      ))}

      {/* ── L4: Perspective neural floor ─────────────────────────────────────
          The signature 3-D grid occupying the lower ~58 % of the canvas.
          An SVG carrying both the grid lines and the node circles is placed
          inside a CSS-perspective wrapper so that both elements transform
          together — no mis-alignment possible.  Nodes pulse asynchronously
          via grid-node-pulse to give the impression of active signal flow. ─ */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height:            "58%",
          maskImage:         "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 50%, transparent 100%)",
          WebkitMaskImage:   "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 50%, transparent 100%)",
          overflow:          "hidden",
        }}
      >
        <div
          style={{
            position:        "absolute",
            inset:           0,
            transform:       "perspective(300px) rotateX(52deg)",
            transformOrigin: "50% 100%",
          }}
        >
          <svg
            viewBox="0 0 140 80"
            preserveAspectRatio="xMidYMid slice"
            style={{ width: "100%", height: "100%", overflow: "visible" }}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Horizontal lines */}
            {P_ROWS.map((y) => (
              <line
                key={`h${y}`}
                x1="0" y1={y} x2="140" y2={y}
                stroke="rgba(96,165,250,0.14)"
                strokeWidth="0.28"
              />
            ))}
            {/* Vertical lines */}
            {P_COLS.map((x) => (
              <line
                key={`v${x}`}
                x1={x} y1="0" x2={x} y2="80"
                stroke="rgba(96,165,250,0.14)"
                strokeWidth="0.28"
              />
            ))}
            {/* Intersection nodes */}
            {FLOOR_NODES.map((n, i) => (
              <g key={i}>
                <circle
                  cx={n.x} cy={n.y} r={n.outerR}
                  fill="rgba(96,165,250,0.10)"
                  style={{ animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite` }}
                />
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill="rgba(147,197,253,0.82)"
                  style={{ animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite` }}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* ── L5a: Primary cyan sweep — mid-screen ─────────────────────────────
          A 1-px horizontal line of soft cyan light that appears briefly
          then vanishes, repeating every 16 s.  Positioned at 58 % — the
          horizon of the perspective floor.  Gives the impression of a data
          scan sweeping across Atlas's neural field. ──────────────────────── */}
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

      {/* ── L5b: Secondary sweep — upper screen ──────────────────────────────
          A dimmer sweep higher up (30 %), staggered 9 s behind the primary
          so they never coincide.  Creates continuity between the heading
          zone and the neural floor below. ───────────────────────────────── */}
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
