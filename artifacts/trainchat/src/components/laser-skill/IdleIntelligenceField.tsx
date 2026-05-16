/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1  Full-screen CSS flat grid (visible mid-section only; canvas is the hero at bottom)
 *  L2  Readability dark gradient
 *  L3  Ambient floating glow blobs
 *  L4  Canvas perspective mesh — hero layer (lower 72%).
 *        True 3D perspective projection of a wave-displaced ground plane.
 *        – horizontal + vertical + diagonal (cyan + violet alternating) edges
 *        – proximity-scaled node glow with diagonal wave-sweep pulse
 *        – requestAnimationFrame animation loop
 *  L5  Horizontal cyan sweep lines (two levels, staggered)
 *
 * prefers-reduced-motion: canvas drawn once (static); CSS anims stripped.
 */

import { useEffect, useRef } from "react";

// ── Ambient glow blobs (L3) ─────────────────────────────────────────────────
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 280, opacity: 0.042, dur: 22, delay: 0  },
  { x: 80, y: 10, size: 220, opacity: 0.034, dur: 28, delay: 5  },
  { x: 50, y: 52, size: 340, opacity: 0.048, dur: 18, delay: 9  },
  { x: 88, y: 68, size: 240, opacity: 0.038, dur: 24, delay: 2  },
  { x: 18, y: 80, size: 200, opacity: 0.044, dur: 26, delay: 7  },
  { x: 62, y: 88, size: 300, opacity: 0.052, dur: 20, delay: 13 },
];

// ── Canvas mesh parameters ──────────────────────────────────────────────────

const COLS        = 11;
const ROWS        = 9;
const CAM_H       = 1.0;   // camera height above ground plane
const FOCAL       = 0.60;  // field-of-view scale
const WORLD_X     = 1.0;   // ground plane half-width
const WORLD_NEAR  = 0.8;   // z of nearest row
const WORLD_FAR   = 5.0;   // z of farthest row (horizon)

// Wave — two-direction sine produces organic terrain interference
const AMP_X  = 0.055;
const AMP_Z  = 0.042;
const FX     = 1.4;
const FZ     = 2.0;
const SPD_X  = 0.42;
const SPD_Z  = 0.28;
const ANIM_DT = 0.0044; // t increment per frame

// Precomputed base grid: stable (wx, wz) per point; only wy changes each frame.
// A small fixed z-noise breaks the grid's parallelism for an organic feel.
const BASE = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => {
    const wx     = (c / (COLS - 1) - 0.5) * 2 * WORLD_X;
    const wz     = WORLD_NEAR + (r / (ROWS - 1)) * (WORLD_FAR - WORLD_NEAR);
    const zNoise = Math.sin(c * 1.97 + r * 2.33) * 0.12;
    return { wx, wz: wz + zNoise };
  }),
);

// ── Canvas draw function ────────────────────────────────────────────────────

function drawMesh(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  ctx.clearRect(0, 0, W, H);

  const vpX = W * 0.50;
  const vpY = H * 0.03; // vanishing point near canvas top

  function proj(wx: number, wy: number, wz: number): [number, number] {
    const inv = 1 / wz;
    return [
      vpX + wx  * FOCAL * inv * W,
      vpY + (CAM_H - wy) * FOCAL * inv * H,
    ];
  }

  // Project all grid points for this frame
  const pts = BASE.map(row =>
    row.map(({ wx, wz }) => {
      const wy = Math.sin(wx * FX + t * SPD_X) * AMP_X
               + Math.sin(wz * FZ - t * SPD_Z) * AMP_Z;
      const [sx, sy] = proj(wx, wy, wz);
      const depth = 1 - (wz - WORLD_NEAR) / (WORLD_FAR - WORLD_NEAR);
      return { sx, sy, depth };
    }),
  );

  // ── Horizontal lines (back → front, painter's order) ─────────────────────
  for (let r = ROWS - 1; r >= 0; r--) {
    const d  = pts[r][0].depth;
    // Near rows: clearly visible. Horizon rows: very faint.
    const a  = 0.10 + d * 0.22;
    const lw = 0.45 + d * 0.65;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(96,165,250,${a.toFixed(3)})`;
    ctx.lineWidth = lw;
    for (let c = 0; c < COLS; c++) {
      const { sx, sy } = pts[r][c];
      c === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // ── Vertical lines ────────────────────────────────────────────────────────
  for (let c = 0; c < COLS; c++) {
    const cf = 1 - Math.abs((c / (COLS - 1)) - 0.5) * 0.45; // centre brighter
    ctx.beginPath();
    ctx.strokeStyle = `rgba(96,165,250,${(0.065 * cf).toFixed(3)})`;
    ctx.lineWidth = 0.32;
    for (let r = 0; r < ROWS; r++) {
      const { sx, sy } = pts[r][c];
      r === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // ── Diagonal edges — triangular mesh topology (alternating cyan / violet) ─
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      if ((r + c) % 2 !== 0) continue; // every other cell
      const d = (pts[r][c].depth + pts[r + 1][c + 1].depth) * 0.5;
      if (d < 0.08) continue;
      const a   = 0.035 + d * 0.09;
      const col = (r + c) % 4 === 0
        ? `rgba(139,92,246,${a.toFixed(3)})`   // soft violet
        : `rgba(147,197,253,${a.toFixed(3)})`; // soft cyan
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.28;
      ctx.moveTo(pts[r    ][c    ].sx, pts[r    ][c    ].sy);
      ctx.lineTo(pts[r + 1][c + 1].sx, pts[r + 1][c + 1].sy);
      ctx.stroke();
    }
  }

  // ── Intersection nodes — diagonal wave-sweep pulse ────────────────────────
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { sx, sy, depth: d } = pts[r][c];
      if (d < 0.06) continue;

      const phase  = t * 1.6 + (r + c) * 0.28;
      const pulse  = 0.55 + Math.sin(phase) * 0.45; // 0.10 → 1.00

      const rOuter = (1.3 + d * 3.2) * pulse;
      const rInner = (0.6 + d * 1.7) * pulse;

      // Outer soft halo
      if (rOuter > 0.5) {
        const a = (0.08 + d * 0.20) * pulse;
        ctx.beginPath();
        ctx.arc(sx, sy, rOuter, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,165,250,${a.toFixed(3)})`;
        ctx.fill();
      }

      // Inner bright core
      const ac = (0.42 + d * 0.58) * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(147,197,253,${ac.toFixed(3)})`;
      ctx.fill();
    }
  }

  // ── Energy sweep — faint gradient traverses canvas periodically ───────────
  const sweepCycle = (t * 0.07) % 1;
  if (sweepCycle < 0.14) {
    const progress   = sweepCycle / 0.14;
    const sweepX     = -W * 0.1 + progress * W * 1.2;
    const sweepAlpha = Math.sin(progress * Math.PI) * 0.13;
    const grd = ctx.createLinearGradient(sweepX - 90, 0, sweepX + 90, 0);
    grd.addColorStop(0,   "rgba(96,165,250,0)");
    grd.addColorStop(0.5, `rgba(147,197,253,${sweepAlpha.toFixed(3)})`);
    grd.addColorStop(1,   "rgba(96,165,250,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface IdleIntelligenceFieldProps {
  isTyping?: boolean;
}

export function IdleIntelligenceField({ isTyping = false }: IdleIntelligenceFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const tRef      = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr     = Math.min(window.devicePixelRatio ?? 1, 2);

    let logW = 0;
    let logH = 0;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      logW = r.width;
      logH = r.height;
      canvas!.width  = logW * dpr;
      canvas!.height = logH * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    function frame() {
      drawMesh(ctx!, logW, logH, tRef.current);
      if (!reduced) {
        tRef.current += ANIM_DT;
        rafRef.current = requestAnimationFrame(frame);
      }
    }

    if (reduced) {
      drawMesh(ctx, logW, logH, 0);
    } else {
      rafRef.current = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

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

      {/* L1 — Full-screen flat grid: visible only in mid-section, not at top or bottom
          (canvas mesh is the hero at the bottom; dark gradient is the hero at the top) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.035) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.035) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.12) 18%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.10) 62%, transparent 72%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.12) 18%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.10) 62%, transparent 72%)",
          animation: "ii-full-grid-breathe 14s ease-in-out infinite, ii-grid-drift 22s ease-in-out infinite",
        }}
      />

      {/* L2 — Readability gradient: strong at the heading zone, clears mid-screen */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(",
            "  to bottom,",
            "  hsl(var(--background) / 0.92) 0%,",
            "  hsl(var(--background) / 0.60) 14%,",
            "  hsl(var(--background) / 0.08) 34%,",
            "  transparent 50%,",
            "  hsl(var(--background) / 0.28) 84%,",
            "  hsl(var(--background) / 0.60) 100%",
            ")",
          ].join(""),
        }}
      />

      {/* L3 — Ambient floating glow blobs */}
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

      {/* L4 — Canvas perspective mesh (hero — lower 72%) */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height:          "72%",
          // Fade: black (fully visible) from bottom through mid-canvas, dissolving to transparent at top
          maskImage:       "linear-gradient(to top, black 0%, black 40%, rgba(0,0,0,0.55) 65%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, black 40%, rgba(0,0,0,0.55) 65%, transparent 100%)",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>

      {/* L5a — Primary cyan sweep at mesh horizon */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "55%",
          background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.28) 20%, rgba(147,197,253,0.62) 50%, rgba(96,165,250,0.28) 80%, transparent 100%)",
          filter:     "blur(0.6px)",
          animation:  "ii-sweep 16s ease-in-out 0.5s infinite",
        }}
      />

      {/* L5b — Secondary sweep at upper zone */}
      <div
        className="absolute left-0 right-0 ii-sweep-line"
        style={{
          height:     "1px",
          top:        "30%",
          background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.12) 30%, rgba(147,197,253,0.28) 50%, rgba(96,165,250,0.12) 70%, transparent 100%)",
          filter:     "blur(0.6px)",
          animation:  "ii-sweep 24s ease-in-out 9.5s infinite",
        }}
      />

    </div>
  );
}
