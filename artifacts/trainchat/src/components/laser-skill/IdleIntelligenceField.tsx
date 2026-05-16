/**
 * IdleIntelligenceField — living neural atmosphere.
 *
 * Layer stack (bottom → top):
 *  L1  Full-screen CSS flat grid (masked, barely visible at top)
 *  L2  Readability dark gradient
 *  L3  Ambient floating glow blobs
 *  L4  Canvas perspective mesh — the hero layer.
 *        A proper 3D perspective projection of a ground plane with:
 *        - travelling sine-wave height displacement (neural terrain)
 *        - horizontal + vertical + diagonal edge connections
 *        - proximity-scaled node glow
 *        - animated via requestAnimationFrame
 *  L5  Horizontal cyan sweep lines (two levels, staggered)
 *
 * prefers-reduced-motion: canvas is drawn once (static) and all CSS
 *   animations are stripped via the .ii-field rule in index.css.
 */

import { useEffect, useRef } from "react";

// ── Ambient glow blobs (L3) ─────────────────────────────────────────────────
const AMBIENT_BLOBS = [
  { x: 14, y: 20, size: 260, opacity: 0.038, dur: 22, delay: 0  },
  { x: 80, y: 10, size: 200, opacity: 0.030, dur: 28, delay: 5  },
  { x: 50, y: 50, size: 320, opacity: 0.042, dur: 18, delay: 9  },
  { x: 88, y: 68, size: 220, opacity: 0.033, dur: 24, delay: 2  },
  { x: 18, y: 80, size: 180, opacity: 0.040, dur: 26, delay: 7  },
  { x: 62, y: 88, size: 280, opacity: 0.046, dur: 20, delay: 13 },
];

// ── Canvas mesh parameters ──────────────────────────────────────────────────

// Grid resolution
const COLS = 11;
const ROWS = 9;

// Camera: positioned above a flat ground plane, looking forward.
// The ground plane lies at world-y = 0. Camera is at (0, CAM_H, 0)
// looking toward +z.
const CAM_H   = 1.0;  // camera height above ground
const FOCAL   = 0.60; // field-of-view scale factor (unitless)

// World-space bounds
const WORLD_X  = 1.0;   // half-width: x from -WORLD_X to +WORLD_X
const WORLD_NEAR = 0.8; // z of nearest row (closest to viewer)
const WORLD_FAR  = 5.0; // z of farthest row (horizon)

// Wave: two-direction travelling sine giving soft terrain
const AMP_X  = 0.055;  // height amplitude driven by x position
const AMP_Z  = 0.040;  // height amplitude driven by z position
const FX     = 1.4;    // spatial frequency in x
const FZ     = 2.0;    // spatial frequency in z
const SPD_X  = 0.42;   // temporal speed of x-wave (world units / s at 60fps * dt)
const SPD_Z  = 0.28;   // temporal speed of z-wave (opposite direction)
const ANIM_DT = 0.0042; // t increment per animation frame (~0.25 world units / s)

// Precompute stable base (wx, wz) for every grid point — only wy changes each frame.
// A tiny fixed z-jitter per point adds organic irregularity.
const BASE = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => {
    const wx  = (c / (COLS - 1) - 0.5) * 2 * WORLD_X;
    const wz  = WORLD_NEAR + (r / (ROWS - 1)) * (WORLD_FAR - WORLD_NEAR);
    // Subtle fixed z-noise so rows aren't perfectly parallel (organic feel)
    const zNoise = Math.sin(c * 1.97 + r * 2.33) * 0.12;
    return { wx, wz: wz + zNoise };
  }),
);

// ── Canvas draw function ────────────────────────────────────────────────────

function drawMesh(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
) {
  ctx.clearRect(0, 0, W, H);

  // Vanishing point in screen space
  const vpX = W * 0.50;
  const vpY = H * 0.03;

  // Perspective project a world point to screen coordinates.
  // Points at lower z (closer) map to lower y (bottom of canvas) — correct
  // because (CAM_H - 0) / small_z is large, pushing screenY down.
  function proj(wx: number, wy: number, wz: number): [number, number] {
    const invZ = 1 / wz;
    const sx   = vpX + wx  * FOCAL * invZ * W;
    const sy   = vpY + (CAM_H - wy) * FOCAL * invZ * H;
    return [sx, sy];
  }

  // Compute all projected screen points for this frame
  const pts: Array<Array<{ sx: number; sy: number; depth: number }>> =
    BASE.map(row =>
      row.map(({ wx, wz }) => {
        const wy = Math.sin(wx * FX + t * SPD_X) * AMP_X
                 + Math.sin(wz * FZ - t * SPD_Z) * AMP_Z;
        const [sx, sy] = proj(wx, wy, wz);
        // depth: 0 = at horizon, 1 = closest to viewer
        const depth = 1 - (wz - WORLD_NEAR) / (WORLD_FAR - WORLD_NEAR);
        return { sx, sy, depth };
      }),
    );

  // ── Horizontal lines (row sweep, back to front for painter's algorithm) ──
  for (let r = ROWS - 1; r >= 0; r--) {
    const { depth } = pts[r][0];
    const alpha = 0.045 + depth * 0.14;
    const lw    = 0.35 + depth * 0.55;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(96,165,250,${alpha.toFixed(3)})`;
    ctx.lineWidth = lw;
    for (let c = 0; c < COLS; c++) {
      const { sx, sy } = pts[r][c];
      c === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // ── Vertical lines (column lines, back to front) ──────────────────────────
  for (let c = 0; c < COLS; c++) {
    // Center columns slightly brighter (natural vignette)
    const cf    = 1 - Math.abs((c / (COLS - 1)) - 0.5) * 0.5;
    const alpha = 0.038 * cf;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(96,165,250,${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.28;
    for (let r = 0; r < ROWS; r++) {
      const { sx, sy } = pts[r][c];
      r === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // ── Diagonal edges — creates triangular mesh topology like the reference ──
  // Draw every other diagonal (checkerboard) to avoid visual noise.
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      if ((r + c) % 2 !== 0) continue;
      const depth = (pts[r][c].depth + pts[r + 1][c + 1].depth) * 0.5;
      if (depth < 0.08) continue; // skip near-horizon diagonals
      const alpha = 0.022 + depth * 0.055;
      // Alternate between cyan and subtle violet for organic colour variation
      const col = (r + c) % 4 === 0
        ? `rgba(139,92,246,${alpha.toFixed(3)})`   // soft violet
        : `rgba(147,197,253,${alpha.toFixed(3)})`; // soft cyan
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.25;
      ctx.moveTo(pts[r    ][c    ].sx, pts[r    ][c    ].sy);
      ctx.lineTo(pts[r + 1][c + 1].sx, pts[r + 1][c + 1].sy);
      ctx.stroke();
    }
  }

  // ── Nodes at every intersection ───────────────────────────────────────────
  // Pulse: each node oscillates at a unique frequency driven by (r+c) —
  // this creates the diagonal wave-sweep effect where brightness propagates
  // across the field rather than all nodes pulsing simultaneously.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { sx, sy, depth } = pts[r][c];
      if (depth < 0.06) continue; // skip invisible horizon nodes

      const phase  = t * 1.6 + (r + c) * 0.28; // diagonal wave-sweep
      const pulse  = 0.55 + Math.sin(phase) * 0.45; // 0.10 → 1.00

      const rOuter = (0.9  + depth * 2.2) * pulse;
      const rInner = (0.45 + depth * 1.2) * pulse;

      // Outer soft halo
      if (rOuter > 0.4) {
        const a = (0.05 + depth * 0.13) * pulse;
        ctx.beginPath();
        ctx.arc(sx, sy, rOuter, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,165,250,${a.toFixed(3)})`;
        ctx.fill();
      }

      // Inner bright core
      const ac = (0.30 + depth * 0.50) * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(147,197,253,${ac.toFixed(3)})`;
      ctx.fill();
    }
  }

  // ── Energy sweep — a faint gradient that traverses the canvas periodically ─
  const sweepCycle = (t * 0.07) % 1;
  if (sweepCycle < 0.14) {
    const progress  = sweepCycle / 0.14;                     // 0 → 1 within sweep
    const sweepX    = -W * 0.1 + progress * W * 1.2;        // travels left → right
    const sweepAlpha = Math.sin(progress * Math.PI) * 0.07;  // fade in/out
    const grd = ctx.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
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
    const dpr     = Math.min(window.devicePixelRatio ?? 1, 2); // cap at 2× for perf

    let logW = 0;
    let logH = 0;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      logW = rect.width;
      logH = rect.height;
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
      drawMesh(ctx, logW, logH, 0); // draw once, static
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
        opacity:    isTyping ? 0.22 : 1,
        transition: "opacity 1.4s ease",
        zIndex:     0,
      }}
      aria-hidden="true"
    >

      {/* L1 — Full-screen flat grid (masked, very subtle above the mesh) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(96,165,250,0.045) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(96,165,250,0.045) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.14) 20%, rgba(0,0,0,0.32) 45%, transparent 65%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.14) 20%, rgba(0,0,0,0.32) 45%, transparent 65%)",
          animation: "ii-full-grid-breathe 14s ease-in-out infinite, ii-grid-drift 22s ease-in-out infinite",
        }}
      />

      {/* L2 — Readability gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(",
            "  to bottom,",
            "  hsl(var(--background) / 0.88) 0%,",
            "  hsl(var(--background) / 0.54) 15%,",
            "  hsl(var(--background) / 0.10) 36%,",
            "  transparent 52%,",
            "  hsl(var(--background) / 0.22) 82%,",
            "  hsl(var(--background) / 0.58) 100%",
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

      {/* L4 — Canvas perspective mesh (the hero — lower ~65%) */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height:          "65%",
          maskImage:       "linear-gradient(to top, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, black 55%, transparent 100%)",
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
          top:        "57%",
          background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.22) 20%, rgba(147,197,253,0.52) 50%, rgba(96,165,250,0.22) 80%, transparent 100%)",
          filter:     "blur(0.6px)",
          animation:  "ii-sweep 16s ease-in-out 0.5s infinite",
        }}
      />

      {/* L5b — Secondary sweep at upper content zone */}
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
