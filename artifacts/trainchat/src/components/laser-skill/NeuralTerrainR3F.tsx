/**
 * NeuralTerrainR3F v3 — cinematic vertex-colored neural terrain.
 *
 * COLOR SYSTEM (per-vertex, computed every frame):
 *   Depth gradient  foreground → electric blue (#4f7dff)
 *                   mid       → cyan (#66e3ff)
 *                   horizon   → deep indigo (#4b4dff) → soft violet (#7a5cff)
 *   Wave peaks      tint additional violet
 *   Drift wash      slow animated cyan brightening sweep
 *   Energy pulse    narrow illumination band travels slowly across terrain
 *   Node variance   position-hash micro-shift per vertex (subtle, elegant)
 *
 *   All color math is raw float arithmetic (no THREE.Color in the hot loop).
 *   AdditiveBlending: lines brighten at intersections naturally.
 *
 * STATE:
 *   isThinking → 1.55× wave speed, stronger pulse, faster violet drift.
 *
 * GRACEFUL DEGRADATION:
 *   No WebGL → null. Any runtime R3F error → null via CanvasErrorBoundary.
 *   prefers-reduced-motion → draw static, skip frame updates.
 *   Mobile → 18×13 segments, no AA, 1.5× max DPR.
 */

import { Component, type ReactNode, useEffect, useRef, useMemo, memo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ── Module-level constants ──────────────────────────────────────────────────

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof window !== "undefined" && window.innerWidth < 768;

const SEG_X = IS_MOBILE ? 18 : 30;
const SEG_Y = IS_MOBILE ? 13 : 22;

// Wave parameters
const W_AMP_X    = 0.38;
const W_AMP_Y    = 0.26;
const W_AMP_DIAG = 0.11;
const W_FREQ_X   = 0.55;
const W_FREQ_Y   = 0.90;
const W_FREQ_D   = 0.29;
const W_SPD_X    = 0.28;
const W_SPD_Y    = 0.19;
const W_SPD_D    = 0.13;

// Color palette as [r, g, b] tuples (linear RGB, no gamma) for hot-loop efficiency.
// All pre-extracted from hex so no THREE.Color allocations per frame.
//   #4f7dff  electric blue
//   #66e3ff  cyan
//   #4b4dff  deep indigo
//   #7a5cff  soft violet
//   #88f0ff  pulse highlight (bright cyan)
const C_ELEC  = [79 / 255,  125 / 255, 255 / 255] as const;
const C_CYAN  = [102 / 255, 227 / 255, 255 / 255] as const;
const C_INDIGO= [75 / 255,   77 / 255, 255 / 255] as const;
const C_VIOLET= [122 / 255,  92 / 255, 255 / 255] as const;
const C_PULSE = [136 / 255, 240 / 255, 255 / 255] as const;

// Inline lerp — avoids function-call overhead in a 700-vertex loop
function lp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── WebGL check ─────────────────────────────────────────────────────────────

function canUseWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch { return false; }
}
const WEBGL_OK = canUseWebGL();

// ── Error boundary ──────────────────────────────────────────────────────────

class CanvasErrorBoundary extends Component<
  { children: ReactNode }, { crashed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? null : this.props.children; }
}

// ── Clear scene to transparent ──────────────────────────────────────────────

function ClearBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(new THREE.Color(0, 0, 0), 0);
  }, [scene, gl]);
  return null;
}

// ── Neural mesh ─────────────────────────────────────────────────────────────

interface NeuralMeshProps { isThinking: boolean }

function NeuralMesh({ isThinking }: NeuralMeshProps) {
  const ptsRef  = useRef<THREE.PointsMaterial>(null!);
  const thinkRef = useRef(isThinking);
  useEffect(() => { thinkRef.current = isThinking; }, [isThinking]);

  // Geometry: PlaneGeometry in default XY orientation.
  // origX/origY stored once; only Z (displacement) written each frame.
  // color BufferAttribute for per-vertex coloration.
  // nodeVariance: position-hash 0–1 per vertex for subtle hue micro-shift.
  const { geo, origX, origY, nodeVariance } = useMemo(() => {
    const g   = new THREE.PlaneGeometry(26, 20, SEG_X, SEG_Y);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n   = pos.count;

    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    const nv = new Float32Array(n);
    const col = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      ox[i] = pos.getX(i);
      oy[i] = pos.getY(i);
      // Deterministic pseudo-random from position: drives per-node hue offset
      nv[i] = Math.sin(ox[i] * 7.391 + oy[i] * 13.117) * 0.5 + 0.5;
      // Initial colors (electric blue default, overwritten each frame)
      col[i * 3    ] = C_ELEC[0];
      col[i * 3 + 1] = C_ELEC[1];
      col[i * 3 + 2] = C_ELEC[2];
    }

    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return { geo: g, origX: ox, origY: oy, nodeVariance: nv };
  }, []);

  useFrame(({ clock }) => {
    if (REDUCED) return;

    const t     = clock.getElapsedTime();
    const think = thinkRef.current;
    const spd   = think ? 1.55 : 1.0;

    const pos      = geo.attributes.position as THREE.BufferAttribute;
    const colorAttr= geo.attributes.color    as THREE.BufferAttribute;
    const n        = pos.count;

    // Drift: slow animated "wash" cycling across the field (~18 s full cycle)
    const driftT = t * 0.055 * spd;

    // Energy pulse front — oscillates 0→1 along depth axis (~14 s cycle)
    const pulsePos  = Math.sin(t * 0.09 * spd) * 0.5 + 0.5;
    const pulseIntensity = think ? 0.32 : 0.20;

    // Node opacity breathing
    if (ptsRef.current) {
      const base = think ? 0.90 : 0.76;
      const beat = think ? 2.10 : 1.05;
      ptsRef.current.opacity = base + Math.sin(t * beat) * 0.10;
    }

    for (let i = 0; i < n; i++) {
      const x = origX[i];
      const y = origY[i];

      // ── Wave displacement ───────────────────────────────────────────────
      const dz =
        Math.sin(x * W_FREQ_X + t * W_SPD_X * spd) * W_AMP_X +
        Math.sin(y * W_FREQ_Y - t * W_SPD_Y * spd) * W_AMP_Y +
        Math.sin((x + y) * W_FREQ_D + t * W_SPD_D * spd) * W_AMP_DIAG;
      pos.setZ(i, dz);

      // ── Color ───────────────────────────────────────────────────────────

      // Depth: 0 = foreground (near), 1 = horizon (far)
      const depth_t = (y + 10) / 20;

      // Wave height: 0 = valley, 0.5 = neutral, 1 = peak
      const height_t = Math.max(0, Math.min(1, (dz + 0.55) / 1.10));

      // Drift wash: slow spatial sine — blends cyan brightening across field
      const drift = Math.sin(x * 0.19 + y * 0.13 + driftT) * 0.5 + 0.5;

      // Energy pulse: bell-curve brightness at the pulse front
      const pulseDist = Math.abs(depth_t - pulsePos);
      const pulseAmt  = Math.max(0, 1 - pulseDist * 5.5) * pulseIntensity;

      // Per-vertex randomisation: subtle hue micro-shift (0–1, stable)
      const rand = nodeVariance[i];

      // ── Base depth color (4 gradient zones) ────────────────────────────
      let r: number, g: number, b: number;
      if (depth_t < 0.35) {
        // Foreground: electric blue → cyan
        const tl = depth_t / 0.35;
        r = lp(C_ELEC[0], C_CYAN[0], tl);
        g = lp(C_ELEC[1], C_CYAN[1], tl);
        b = lp(C_ELEC[2], C_CYAN[2], tl);
      } else if (depth_t < 0.65) {
        // Mid: cyan → deep indigo
        const tl = (depth_t - 0.35) / 0.30;
        r = lp(C_CYAN[0], C_INDIGO[0], tl);
        g = lp(C_CYAN[1], C_INDIGO[1], tl);
        b = lp(C_CYAN[2], C_INDIGO[2], tl);
      } else if (depth_t < 0.85) {
        // Upper mid: deep indigo → soft violet
        const tl = (depth_t - 0.65) / 0.20;
        r = lp(C_INDIGO[0], C_VIOLET[0], tl);
        g = lp(C_INDIGO[1], C_VIOLET[1], tl);
        b = lp(C_INDIGO[2], C_VIOLET[2], tl);
      } else {
        // Horizon: soft violet (held)
        r = C_VIOLET[0]; g = C_VIOLET[1]; b = C_VIOLET[2];
      }

      // ── Drift wash: brightens with slow cyan sweep ──────────────────────
      const driftAmt = drift * 0.24;
      r = lp(r, C_CYAN[0], driftAmt);
      g = lp(g, C_CYAN[1], driftAmt);
      b = lp(b, C_CYAN[2], driftAmt);

      // ── Wave peaks: tint toward violet (subtle) ─────────────────────────
      const peakAmt = height_t * (think ? 0.26 : 0.16);
      r = lp(r, C_VIOLET[0], peakAmt);
      g = lp(g, C_VIOLET[1], peakAmt);
      b = lp(b, C_VIOLET[2], peakAmt);

      // ── Per-node variance: half lean violet, half lean electric blue ────
      const varAmt = rand * 0.10;
      const vr = rand > 0.5 ? C_VIOLET[0] : C_ELEC[0];
      const vg = rand > 0.5 ? C_VIOLET[1] : C_ELEC[1];
      const vb = rand > 0.5 ? C_VIOLET[2] : C_ELEC[2];
      r = lp(r, vr, varAmt);
      g = lp(g, vg, varAmt);
      b = lp(b, vb, varAmt);

      // ── Energy pulse: soft illumination band ───────────────────────────
      r = lp(r, C_PULSE[0], pulseAmt);
      g = lp(g, C_PULSE[1], pulseAmt);
      b = lp(b, C_PULSE[2], pulseAmt);

      colorAttr.setXYZ(i, r, g, b);
    }

    pos.needsUpdate      = true;
    colorAttr.needsUpdate = true;
  });

  return (
    // Group: −51° X tilt → bottom leans toward viewer, top recedes to horizon
    <group rotation={[-Math.PI * 0.285, 0, 0]} position={[0, -1.9, 0]}>

      {/* Wireframe with vertex colors — edges interpolate smoothly between nodes */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          vertexColors
          wireframe
          transparent
          opacity={0.21}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Glowing nodes — same geometry (auto-synced); vertex colors drive hue */}
      <points geometry={geo}>
        <pointsMaterial
          ref={ptsRef}
          vertexColors
          size={0.076}
          sizeAttenuation
          transparent
          opacity={0.80}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

    </group>
  );
}

// ── Public component ────────────────────────────────────────────────────────

interface NeuralTerrainR3FProps { isThinking?: boolean }

export const NeuralTerrainR3F = memo(function NeuralTerrainR3F({
  isThinking = false,
}: NeuralTerrainR3FProps) {
  if (!WEBGL_OK) return null;

  return (
    <CanvasErrorBoundary>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 60, near: 0.1, far: 100 }}
        gl={{
          alpha:           true,
          antialias:       !IS_MOBILE,
          powerPreference: "low-power",
        }}
        dpr={[1, IS_MOBILE ? 1.5 : 2]}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <ClearBackground />

        <NeuralMesh isThinking={isThinking} />

        {/* Atmospheric data particles — very subtle, just above the terrain */}
        <Sparkles
          count={IS_MOBILE ? 12 : 24}
          scale={[22, 9, 14]}
          size={0.80}
          speed={0.10}
          opacity={0.12}
          color="#66e3ff"
          noise={0.55}
        />

        {/* Soft bloom — halos the brightest vertex clusters (intersections, peaks) */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.55}
            luminanceSmoothing={0.90}
            intensity={0.26}
          />
        </EffectComposer>

      </Canvas>
    </CanvasErrorBoundary>
  );
});
