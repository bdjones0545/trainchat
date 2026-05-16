/**
 * NeuralTerrainR3F — Three.js / React Three Fiber neural terrain.
 *
 * A tilted PlaneGeometry with sine-wave Z-displacement animating each frame.
 * A single geometry object is shared between the wireframe <mesh> and glowing
 * <points>, so vertex updates propagate to both simultaneously.
 *
 * Graceful degradation:
 *   – If WebGL is not available (headless, old GPU, sandbox): returns null.
 *   – Wrapped in a React error boundary: any R3F/Three.js runtime error is
 *     silently swallowed; the caller (IdleIntelligenceField) falls back to
 *     its CSS-only layers which already provide atmosphere.
 *
 * prefers-reduced-motion: geometry drawn once (RAF runs but skips updates).
 * Mobile: lower segment count + capped DPR.
 */

import { Component, type ReactNode, useEffect, useMemo, memo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── Module-level constants ──────────────────────────────────────────────────

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof window !== "undefined" && window.innerWidth < 768;

// Fewer segments on mobile for performance
const SEG_X = IS_MOBILE ? 18 : 30;
const SEG_Y = IS_MOBILE ? 13 : 22;

// Wave: two-direction sine produces natural terrain interference
const W_AMP_X  = 0.40;
const W_AMP_Y  = 0.28;
const W_FREQ_X = 0.55;
const W_FREQ_Y = 0.90;
const W_SPD_X  = 0.30;
const W_SPD_Y  = 0.20;

// ── WebGL availability check ────────────────────────────────────────────────

function canUseWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

const WEBGL_OK = canUseWebGL();

// ── Error boundary ──────────────────────────────────────────────────────────

interface EBState { crashed: boolean }

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  EBState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

// ── Scene components ────────────────────────────────────────────────────────

function ClearBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(new THREE.Color(0, 0, 0), 0);
  }, [scene, gl]);
  return null;
}

/**
 * The neural terrain.
 *
 * PlaneGeometry in its default XY orientation (Z perpendicular to plane).
 * Group rotation of −0.285π (≈ −51°) on X tilts the bottom toward the camera
 * and the top toward the horizon, creating the ground-plane perspective.
 *
 * Z-displacement each frame makes the surface undulate; since we only write to
 * Z (not X/Y), origX/origY remain stable and are safe to reference forever.
 */
function NeuralMesh() {
  const { geo, origX, origY } = useMemo(() => {
    const g   = new THREE.PlaneGeometry(26, 20, SEG_X, SEG_Y);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n   = pos.count;
    const ox  = new Float32Array(n);
    const oy  = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ox[i] = pos.getX(i);
      oy[i] = pos.getY(i);
    }
    return { geo: g, origX: ox, origY: oy };
  }, []);

  useFrame(({ clock }) => {
    if (REDUCED) return;
    const t   = clock.getElapsedTime();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x  = origX[i];
      const y  = origY[i];
      pos.setZ(
        i,
        Math.sin(x * W_FREQ_X + t * W_SPD_X) * W_AMP_X +
        Math.sin(y * W_FREQ_Y - t * W_SPD_Y) * W_AMP_Y,
      );
    }
    pos.needsUpdate = true;
  });

  return (
    // −51° tilt: bottom edge leans toward camera, top recedes to horizon
    <group rotation={[-Math.PI * 0.285, 0, 0]} position={[0, -1.9, 0]}>

      {/* Cyan triangulated wireframe — includes diagonal edges from PlaneGeometry */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          color="#60a5fa"
          wireframe
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>

      {/* Glowing intersection nodes — same geometry = auto-synced on update.
          AdditiveBlending brightens where points overlap (natural node glow). */}
      <points geometry={geo}>
        <pointsMaterial
          color="#93c5fd"
          size={0.074}
          sizeAttenuation
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

    </group>
  );
}

// ── Public component ────────────────────────────────────────────────────────

export const NeuralTerrainR3F = memo(function NeuralTerrainR3F() {
  // Bail early if WebGL is unavailable — CSS layers in IdleIntelligenceField
  // already provide atmospheric depth without the 3D terrain.
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
        <NeuralMesh />
      </Canvas>
    </CanvasErrorBoundary>
  );
});
