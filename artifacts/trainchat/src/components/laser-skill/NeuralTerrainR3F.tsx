/**
 * NeuralTerrainR3F — premium Three.js / R3F neural terrain background.
 *
 * Visual upgrades over v1:
 *   – Additive blending on wireframe: lines brighten at intersections naturally
 *   – Slow animated color shift: cyan ↔ soft violet (~30 s full cycle)
 *   – isThinking mode: faster wave + accelerated color oscillation
 *   – Tertiary wave harmonic: cross-diagonal interference for organic motion
 *   – Node opacity breathing: subtle sine pulse on point visibility
 *   – @react-three/drei Sparkles: atmospheric floating data particles
 *   – @react-three/postprocessing Bloom: soft halo on bright areas
 *
 * Graceful degradation: no WebGL → returns null; runtime R3F error → null.
 * prefers-reduced-motion: geometry static (no frame updates).
 * Mobile: reduced segment count + 1.5× DPR cap + no AA.
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

// Wave — two primary + one cross harmonic for natural interference
const W_AMP_X    = 0.38;
const W_AMP_Y    = 0.26;
const W_AMP_DIAG = 0.11;   // tertiary diagonal harmonic
const W_FREQ_X   = 0.55;
const W_FREQ_Y   = 0.90;
const W_FREQ_D   = 0.29;   // diagonal cross-freq
const W_SPD_X    = 0.28;
const W_SPD_Y    = 0.19;
const W_SPD_D    = 0.13;

// Color palette — allocated once, reused in lerp each frame
const C_WIRE_CYAN   = new THREE.Color("#60a5fa");
const C_WIRE_VIOLET = new THREE.Color("#818cf8");
const C_PTS_CYAN    = new THREE.Color("#93c5fd");
const C_PTS_VIOLET  = new THREE.Color("#a78bfa");

// ── WebGL availability ──────────────────────────────────────────────────────

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

class CanvasErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? null : this.props.children; }
}

// ── Scene setup ─────────────────────────────────────────────────────────────

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
  const wireRef = useRef<THREE.MeshBasicMaterial>(null!);
  const ptsRef  = useRef<THREE.PointsMaterial>(null!);

  // isThinking via ref so useFrame reads it without re-subscribe
  const thinkRef = useRef(isThinking);
  useEffect(() => { thinkRef.current = isThinking; }, [isThinking]);

  // Single geometry shared by wireframe mesh + points.
  // origX/origY are the stable grid positions; only Z changes per frame.
  const { geo, origX, origY } = useMemo(() => {
    const g   = new THREE.PlaneGeometry(26, 20, SEG_X, SEG_Y);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n   = pos.count;
    const ox  = new Float32Array(n);
    const oy  = new Float32Array(n);
    for (let i = 0; i < n; i++) { ox[i] = pos.getX(i); oy[i] = pos.getY(i); }
    return { geo: g, origX: ox, origY: oy };
  }, []);

  useFrame(({ clock }) => {
    if (REDUCED) return;

    const t     = clock.getElapsedTime();
    const think = thinkRef.current;

    // ── Speed: 1.0× idle, 1.55× while AI is thinking ──────────────────────
    const spd = think ? 1.55 : 1.0;

    // ── Animated color: slow cyan ↔ soft violet breathing ─────────────────
    // Idle: 28 s full cycle, shifts 0–35% toward violet.
    // Thinking: 8 s cycle, shifts 0–52% toward violet.
    const colorPhase =
      (Math.sin(t * (think ? 0.40 : 0.18)) * 0.5 + 0.5) *
      (think ? 0.52 : 0.35);

    if (wireRef.current)
      wireRef.current.color.lerpColors(C_WIRE_CYAN, C_WIRE_VIOLET, colorPhase);
    if (ptsRef.current)
      ptsRef.current.color.lerpColors(C_PTS_CYAN, C_PTS_VIOLET, colorPhase * 0.70);

    // ── Node opacity: subtle breathing pulse ───────────────────────────────
    if (ptsRef.current) {
      const base = think ? 0.92 : 0.80;
      const beat = think ? 2.20 : 1.10;
      ptsRef.current.opacity = base + Math.sin(t * beat) * 0.10;
    }

    // ── Wave terrain displacement (Z-axis) ─────────────────────────────────
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = origX[i];
      const y = origY[i];
      pos.setZ(
        i,
        Math.sin(x * W_FREQ_X + t * W_SPD_X * spd) * W_AMP_X +
        Math.sin(y * W_FREQ_Y - t * W_SPD_Y * spd) * W_AMP_Y +
        Math.sin((x + y) * W_FREQ_D + t * W_SPD_D * spd) * W_AMP_DIAG,
      );
    }
    pos.needsUpdate = true;
  });

  return (
    // −51° tilt on X: bottom leans toward viewer, top recedes to horizon
    <group rotation={[-Math.PI * 0.285, 0, 0]} position={[0, -1.9, 0]}>

      {/* Cyan wireframe with additive blending — lines brighten at intersections */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          ref={wireRef}
          color="#60a5fa"
          wireframe
          transparent
          opacity={0.20}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Glowing nodes — same geometry, auto-synced; additive brightens clusters */}
      <points geometry={geo}>
        <pointsMaterial
          ref={ptsRef}
          color="#93c5fd"
          size={0.074}
          sizeAttenuation
          transparent
          opacity={0.82}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

    </group>
  );
}

// ── Public component ────────────────────────────────────────────────────────

interface NeuralTerrainR3FProps {
  isThinking?: boolean;
}

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

        {/* Neural terrain mesh */}
        <NeuralMesh isThinking={isThinking} />

        {/* Atmospheric data particles — floating subtly above the terrain */}
        <Sparkles
          count={IS_MOBILE ? 14 : 28}
          scale={[22, 9, 14]}
          size={0.85}
          speed={0.11}
          opacity={0.13}
          color="#93c5fd"
          noise={0.55}
        />

        {/* Very subtle bloom — softens bright wireframe intersection points.
            Low intensity + high threshold = premium glow, not cyberpunk. */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.58}
            luminanceSmoothing={0.88}
            intensity={0.28}
          />
        </EffectComposer>

      </Canvas>
    </CanvasErrorBoundary>
  );
});
