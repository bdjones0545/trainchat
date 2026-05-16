/**
 * IdleIntelligenceField — cinematic neural grid atmosphere.
 *
 * Renders the perspective wireframe grid from the reference image:
 * a 3D floor of glowing interconnected nodes that fills the lower half
 * of the empty state, creating an AI-native spatial depth effect.
 *
 * The grid is purely atmospheric — it sits behind all content and fades
 * toward the horizon so it never competes with text or chips.
 */

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

// Grid geometry — viewBox 0 0 140 80
// 11 columns × 7 rows = 77 intersection nodes
const COLS = [0, 14, 28, 42, 56, 70, 84, 98, 112, 126, 140];
const ROWS = [0, 13, 26, 39, 52, 65, 80];

// Precompute node list with staggered animation params
const NODES = ROWS.flatMap((y, ri) =>
  COLS.map((x, ci) => ({
    x,
    y,
    // Nodes deeper in the "floor" (higher row index = closer to viewer = bottom of screen)
    // are brighter and larger
    baseOpacity: 0.15 + ri * 0.07,
    maxOpacity:  0.30 + ri * 0.12,
    r:           0.55 + ri * 0.12,
    outerR:      1.6  + ri * 0.3,
    delay:       ((ci * 0.18 + ri * 0.27) % 2.8).toFixed(2),
    dur:         (2.6 + ((ci + ri) * 0.11) % 1.6).toFixed(1),
  })),
);

export function IdleIntelligenceField({ isTyping = false }: IdleIntelligenceFieldProps) {
  return (
    <div
      className="ii-field absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        opacity: isTyping ? 0.20 : 1,
        transition: "opacity 1.2s ease",
      }}
      aria-hidden="true"
    >
      {/* Deep ambient radial — faint cyan haze centered behind the heading */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "30%",
          transform: "translate(-50%, -50%)",
          width: 520,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, hsl(var(--primary) / 0.06) 0%, hsl(var(--primary) / 0.02) 50%, transparent 70%)",
          animation: "ii-ambient-breathe 9s ease-in-out infinite",
        }}
      />

      {/* ── Perspective neural floor ───────────────────────────────────────────
          The container sits in the lower 58% of the screen and masks the SVG
          so the grid fades toward the horizon. The SVG carries both the grid
          lines and the glow nodes in the same coordinate space, then the whole
          element is rotated on its X-axis via CSS perspective to fake 3D depth.
      ─────────────────────────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "58%",
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 52%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 52%, transparent 100%)",
          overflow: "hidden",
        }}
      >
        {/* Perspective wrapper — applied to SVG parent so nodes + lines transform together */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "perspective(300px) rotateX(52deg)",
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
            {/* Grid lines — horizontal */}
            {ROWS.map((y) => (
              <line
                key={`h-${y}`}
                x1="0" y1={y} x2="140" y2={y}
                stroke="rgba(96,165,250,0.12)"
                strokeWidth="0.28"
              />
            ))}

            {/* Grid lines — vertical */}
            {COLS.map((x) => (
              <line
                key={`v-${x}`}
                x1={x} y1="0" x2={x} y2="80"
                stroke="rgba(96,165,250,0.12)"
                strokeWidth="0.28"
              />
            ))}

            {/* Glow nodes at every intersection */}
            {NODES.map((n, i) => (
              <g key={i}>
                {/* Outer soft halo */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.outerR}
                  fill="rgba(96,165,250,0.10)"
                  style={{
                    animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite`,
                  }}
                />
                {/* Inner bright core */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill="rgba(147,197,253,0.75)"
                  style={{
                    animation: `grid-node-pulse ${n.dur}s ease-in-out ${n.delay}s infinite`,
                  }}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
