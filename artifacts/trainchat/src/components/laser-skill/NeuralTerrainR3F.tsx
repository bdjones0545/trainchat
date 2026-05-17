/**
 * NeuralTerrainR3F — cinematic vertex-colored neural terrain with
 * interactive pointer ripples.
 *
 * COLOR SYSTEM (per vertex, every frame):
 *   Depth (Y)    foreground → electric blue (#4f7dff)
 *                mid        → cyan (#66e3ff)
 *                horizon    → deep indigo (#4b4dff) → soft violet (#7a5cff)
 *   Wave peaks   tint → violet
 *   Drift wash   slow animated cyan brightening
 *   Energy pulse narrow illumination band travels depth-axis
 *   Node variance position-hash micro-hue-shift per vertex
 *
 * RIPPLE SYSTEM:
 *   Consumes from rippleQueue (imported module-level bus).
 *   Each ripple: expanding ring deformation + bright-cyan color bloom.
 *   Up to 6 concurrent. 1.4 – 2.2 s lifetime. Smooth fade in/out envelope.
 *   prefers-reduced-motion: Z deformation disabled; gentle opacity swell only.
 *
 * GRACEFUL DEGRADATION:
 *   No WebGL → null. R3F error → null via CanvasErrorBoundary.
 *   Mobile: 18×13 grid, no AA, 1.5× DPR cap.
 */

import { Component, type ReactNode, useEffect, useRef, useMemo, memo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { type Ripple, rippleQueue } from "./rippleQueue";

// ── Constants ───────────────────────────────────────────────────────────────

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof window !== "undefined" && window.innerWidth < 768;

const SEG_X = IS_MOBILE ? 18 : 30;
const SEG_Y = IS_MOBILE ? 13 : 22;

// Wave
const W_AMP_X    = 0.38;
const W_AMP_Y    = 0.26;
const W_AMP_DIAG = 0.11;
const W_FREQ_X   = 0.55;
const W_FREQ_Y   = 0.90;
const W_FREQ_D   = 0.29;
const W_SPD_X    = 0.28;
const W_SPD_Y    = 0.19;
const W_SPD_D    = 0.13;

// Ripple
const MAX_RIPPLE_R = 11;   // terrain units — max expansion radius
const RIPPLE_BAND  = 2.8;  // terrain units — ring width (wider = more vertices affected)

// Color palette — [r, g, b] in 0-1 linear range (pre-divided from hex)
const C_ELEC  = [79 / 255,  125 / 255, 255 / 255] as const; // #4f7dff electric blue
const C_CYAN  = [102 / 255, 227 / 255, 255 / 255] as const; // #66e3ff cyan
const C_INDIGO= [75 / 255,   77 / 255, 255 / 255] as const; // #4b4dff deep indigo
const C_VIOLET= [122 / 255,  92 / 255, 255 / 255] as const; // #7a5cff soft violet
const C_PULSE = [136 / 255, 240 / 255, 255 / 255] as const; // #88f0ff bright cyan

// Inline lerp — avoids call overhead in the 700-vertex / 6-ripple hot loop
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

// ── Clear to transparent ────────────────────────────────────────────────────

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
  const ptsRef      = useRef<THREE.PointsMaterial>(null!);
  const thinkRef    = useRef(isThinking);
  const activeRipples = useRef<Ripple[]>([]);

  useEffect(() => { thinkRef.current = isThinking; }, [isThinking]);

  // Build geometry + stable per-vertex data once
  const { geo, origX, origY, nodeVariance } = useMemo(() => {
    const g   = new THREE.PlaneGeometry(26, 20, SEG_X, SEG_Y);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n   = pos.count;

    const ox  = new Float32Array(n);
    const oy  = new Float32Array(n);
    const nv  = new Float32Array(n);
    const col = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      ox[i] = pos.getX(i);
      oy[i] = pos.getY(i);
      // Stable pseudo-random per vertex: drives hue micro-variation
      nv[i] = Math.sin(ox[i] * 7.391 + oy[i] * 13.117) * 0.5 + 0.5;
      col[i * 3    ] = C_ELEC[0];
      col[i * 3 + 1] = C_ELEC[1];
      col[i * 3 + 2] = C_ELEC[2];
    }

    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return { geo: g, origX: ox, origY: oy, nodeVariance: nv };
  }, []);

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime();
    const think = thinkRef.current;

    // ── Drain ripple queue — stamp clock time on arrival ─────────────────
    while (rippleQueue.length > 0) {
      const r = rippleQueue.shift()!;
      r.startTime = t;
      activeRipples.current.push(r);
    }

    // ── Expire finished ripples ───────────────────────────────────────────
    for (let j = activeRipples.current.length - 1; j >= 0; j--) {
      if (t - activeRipples.current[j].startTime >= activeRipples.current[j].duration) {
        activeRipples.current.splice(j, 1);
      }
    }
    const hasRipples = activeRipples.current.length > 0;

    // ── prefers-reduced-motion: gentle opacity swell only ─────────────────
    if (REDUCED) {
      if (hasRipples && ptsRef.current) {
        let maxEnv = 0;
        for (const rip of activeRipples.current) {
          const progress = (t - rip.startTime) / rip.duration;
          const env = Math.min(1, progress * 5) * (1 - progress) * rip.intensity;
          if (env > maxEnv) maxEnv = env;
        }
        ptsRef.current.opacity = 0.76 + maxEnv * 0.18;
      }
      return; // No Z deformation in reduced-motion mode
    }

    // ── Full animation ────────────────────────────────────────────────────
    const spd = think ? 1.55 : 1.0;

    const pos       = geo.attributes.position as THREE.BufferAttribute;
    const colorAttr = geo.attributes.color    as THREE.BufferAttribute;
    const n         = pos.count;

    const driftT         = t * 0.055 * spd;
    const pulsePos       = Math.sin(t * 0.09 * spd) * 0.5 + 0.5;
    const pulseIntensity = think ? 0.32 : 0.20;

    // Node opacity breathing (points material — overall alpha oscillates)
    if (ptsRef.current) {
      const base = think ? 0.90 : 0.76;
      const beat = think ? 2.10 : 1.05;
      ptsRef.current.opacity = base + Math.sin(t * beat) * 0.10;
    }

    for (let i = 0; i < n; i++) {
      const x = origX[i];
      const y = origY[i];

      // ── Base wave displacement ──────────────────────────────────────────
      const dz =
        Math.sin(x * W_FREQ_X + t * W_SPD_X * spd) * W_AMP_X +
        Math.sin(y * W_FREQ_Y - t * W_SPD_Y * spd) * W_AMP_Y +
        Math.sin((x + y) * W_FREQ_D + t * W_SPD_D * spd) * W_AMP_DIAG;

      // ── Ripple contributions ────────────────────────────────────────────
      let rippleZ        = 0;
      let rippleColorAmt = 0;

      if (hasRipples) {
        for (let j = 0; j < activeRipples.current.length; j++) {
          const rip = activeRipples.current[j];
          const age      = t - rip.startTime;
          const progress = age / rip.duration;       // 0 → 1
          const fadeIn   = Math.min(1, progress * 5); // fast rise (0 → 1 in first 0.2)
          const fadeOut  = 1 - progress;              // slow decay (1 → 0)
          const env      = fadeIn * fadeOut * rip.intensity;

          const dx   = x - rip.x;
          const dy   = y - rip.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Expanding ring: brightest where dist ≈ waveRadius
          const waveR = progress * MAX_RIPPLE_R;
          const ring  = Math.max(0, 1 - Math.abs(dist - waveR) / RIPPLE_BAND);

          // Initial centre glow — decays over first half of lifetime.
          // Wider radius (4.0) so more vertices near the tap origin are lit.
          const centre = Math.max(0, 1 - dist / 4.0) *
                         Math.max(0, 1 - progress * 2.0);

          // Z deformation: ring 65%, centre 90% contribution
          rippleZ       += (ring * 0.65 + centre * 0.90) * env * 0.55;

          // Color: max of all ripple influences (prevents overexposure with many ripples)
          const c        = (ring * 0.75 + centre) * env;
          if (c > rippleColorAmt) rippleColorAmt = c;
        }
      }

      pos.setZ(i, dz + rippleZ);

      // ── Depth gradient (4 zones) ────────────────────────────────────────
      const depth_t  = (y + 10) / 20;                               // 0=foreground, 1=horizon
      const height_t = Math.max(0, Math.min(1, (dz + rippleZ + 0.55) / 1.10)); // wave height 0-1

      let r: number, g: number, b: number;
      if (depth_t < 0.35) {
        const tl = depth_t / 0.35;
        r = lp(C_ELEC[0], C_CYAN[0], tl);
        g = lp(C_ELEC[1], C_CYAN[1], tl);
        b = lp(C_ELEC[2], C_CYAN[2], tl);
      } else if (depth_t < 0.65) {
        const tl = (depth_t - 0.35) / 0.30;
        r = lp(C_CYAN[0], C_INDIGO[0], tl);
        g = lp(C_CYAN[1], C_INDIGO[1], tl);
        b = lp(C_CYAN[2], C_INDIGO[2], tl);
      } else if (depth_t < 0.85) {
        const tl = (depth_t - 0.65) / 0.20;
        r = lp(C_INDIGO[0], C_VIOLET[0], tl);
        g = lp(C_INDIGO[1], C_VIOLET[1], tl);
        b = lp(C_INDIGO[2], C_VIOLET[2], tl);
      } else {
        r = C_VIOLET[0]; g = C_VIOLET[1]; b = C_VIOLET[2];
      }

      // Drift wash: slow animated cyan brightening sweep
      const drift    = Math.sin(x * 0.19 + y * 0.13 + driftT) * 0.5 + 0.5;
      const driftAmt = drift * 0.24;
      r = lp(r, C_CYAN[0], driftAmt);
      g = lp(g, C_CYAN[1], driftAmt);
      b = lp(b, C_CYAN[2], driftAmt);

      // Wave peaks → violet tint
      const peakAmt = height_t * (think ? 0.26 : 0.16);
      r = lp(r, C_VIOLET[0], peakAmt);
      g = lp(g, C_VIOLET[1], peakAmt);
      b = lp(b, C_VIOLET[2], peakAmt);

      // Per-node hue micro-variation
      const rand   = nodeVariance[i];
      const varAmt = rand * 0.10;
      const vr = rand > 0.5 ? C_VIOLET[0] : C_ELEC[0];
      const vg = rand > 0.5 ? C_VIOLET[1] : C_ELEC[1];
      const vb = rand > 0.5 ? C_VIOLET[2] : C_ELEC[2];
      r = lp(r, vr, varAmt);
      g = lp(g, vg, varAmt);
      b = lp(b, vb, varAmt);

      // Ambient energy pulse (slow depth-axis illumination band)
      const pulseDist = Math.abs(depth_t - pulsePos);
      const pulseAmt  = Math.max(0, 1 - pulseDist * 5.5) * pulseIntensity;
      r = lp(r, C_PULSE[0], pulseAmt);
      g = lp(g, C_PULSE[1], pulseAmt);
      b = lp(b, C_PULSE[2], pulseAmt);

      // Ripple colour bloom — capped at 0.55 strength to keep it calm
      if (rippleColorAmt > 0) {
        const rca = Math.min(rippleColorAmt, 1) * 0.55;
        r = lp(r, C_PULSE[0], rca);
        g = lp(g, C_PULSE[1], rca);
        b = lp(b, C_PULSE[2], rca);
      }

      colorAttr.setXYZ(i, r, g, b);
    }

    pos.needsUpdate       = true;
    colorAttr.needsUpdate = true;
  });

  return (
    // −51° X tilt: bottom leans toward viewer, top recedes to horizon
    <group rotation={[-Math.PI * 0.285, 0, 0]} position={[0, -1.9, 0]}>

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

        {/* Atmospheric floating particles */}
        <Sparkles
          count={IS_MOBILE ? 12 : 24}
          scale={[22, 9, 14]}
          size={0.80}
          speed={0.10}
          opacity={0.12}
          color="#66e3ff"
          noise={0.55}
        />

        {/* Soft bloom — halos the brightest vertex clusters */}
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
