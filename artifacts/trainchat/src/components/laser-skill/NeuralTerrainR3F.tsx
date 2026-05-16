/**
 * NeuralTerrainR3F — cinematic GPU neural terrain v3.
 *
 * Architecture:
 *   THREE separate geometries → three render passes, all GPU-driven.
 *
 *   1. gridLines  (LineSegments) — horizontal + vertical edges
 *                                  cyan → blue color wave
 *   2. diagLines  (LineSegments) — triangulation diagonals
 *                                  soft violet → indigo, lower opacity
 *   3. nodes      (Points)       — custom soft-glow circular shader
 *                                  cyan-white, perspective-attenuated
 *
 * ALL animation (wave displacement, color gradient, depth fade) runs in
 * GLSL vertex/fragment shaders. Only `uTime` uniform is written each frame
 * from JS — zero CPU vertex-update loop, zero jitter, true GPU smoothness.
 *
 * Color design (matches reference):
 *   – Grid lines: #4A80FA (deep blue) → #60a5fa (cyan) — diagonal wave
 *   – Diagonal lines: #5B3EC8 (indigo) → #8B5CF6 (violet) — same wave
 *   – Nodes: soft cyan-white with circular glow falloff
 *   – Depth fade: bright near camera → invisible at horizon (smoothstep)
 *   – Violet near-bottom highlight replicates reference's purple lower zone
 *
 * isThinking mode: 1.55× wave speed via accumulated delta-time (no jump).
 * prefers-reduced-motion: static draw — no uniform updates.
 * Mobile: half segment count, no AA, 1.5× DPR cap.
 * WebGL unavailable → returns null, CSS atmosphere layers carry the visual.
 */

import {
  Component,
  type ReactNode,
  useRef,
  useMemo,
  useEffect,
  memo,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ── Constants ───────────────────────────────────────────────────────────────

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof window !== "undefined" && window.innerWidth < 768;

// Segment count: higher = smoother waves, more geometry
const SEG_X = IS_MOBILE ? 20 : 38;
const SEG_Y = IS_MOBILE ? 14 : 26;

const PLANE_W = 28;   // world-space width
const PLANE_H = 20;   // world-space depth (y: +10 = far/horizon, -10 = near)

// ── Geometry builders ───────────────────────────────────────────────────────

/** (col/segX - 0.5) * width — x from -W/2 to +W/2 */
function vx(col: number, segX: number, w: number) {
  return (col / segX - 0.5) * w;
}
/** (0.5 - row/segY) * height — y from +H/2 (far/top) to -H/2 (near/bottom) */
function vy(row: number, segY: number, h: number) {
  return (0.5 - row / segY) * h;
}

/**
 * Horizontal + vertical grid edges.
 * Stored as consecutive (x,y,0) pairs: each pair is one line segment.
 */
function buildGridLines(sx: number, sy: number): THREE.BufferGeometry {
  const horzEdges = sx * (sy + 1);
  const vertEdges = (sx + 1) * sy;
  const buf = new Float32Array((horzEdges + vertEdges) * 2 * 3);
  let i = 0;
  const push = (x: number, y: number) => {
    buf[i++] = x; buf[i++] = y; buf[i++] = 0;
  };
  // Horizontal rows
  for (let row = 0; row <= sy; row++) {
    for (let col = 0; col < sx; col++) {
      push(vx(col, sx, PLANE_W),     vy(row, sy, PLANE_H));
      push(vx(col + 1, sx, PLANE_W), vy(row, sy, PLANE_H));
    }
  }
  // Vertical columns
  for (let row = 0; row < sy; row++) {
    for (let col = 0; col <= sx; col++) {
      push(vx(col, sx, PLANE_W), vy(row,     sy, PLANE_H));
      push(vx(col, sx, PLANE_W), vy(row + 1, sy, PLANE_H));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

/**
 * Diagonal triangulation edges (top-right → bottom-left per quad,
 * matching Three.js PlaneGeometry's triangulation direction).
 */
function buildDiagLines(sx: number, sy: number): THREE.BufferGeometry {
  const buf = new Float32Array(sx * sy * 2 * 3);
  let i = 0;
  const push = (x: number, y: number) => {
    buf[i++] = x; buf[i++] = y; buf[i++] = 0;
  };
  for (let row = 0; row < sy; row++) {
    for (let col = 0; col < sx; col++) {
      push(vx(col + 1, sx, PLANE_W), vy(row,     sy, PLANE_H)); // top-right
      push(vx(col,     sx, PLANE_W), vy(row + 1, sy, PLANE_H)); // bottom-left
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

/**
 * One point per grid intersection — used for the glowing node shader.
 */
function buildNodePoints(sx: number, sy: number): THREE.BufferGeometry {
  const buf = new Float32Array((sx + 1) * (sy + 1) * 3);
  let i = 0;
  for (let row = 0; row <= sy; row++) {
    for (let col = 0; col <= sx; col++) {
      buf[i++] = vx(col, sx, PLANE_W);
      buf[i++] = vy(row, sy, PLANE_H);
      buf[i++] = 0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

// ── GLSL shaders ─────────────────────────────────────────────────────────────
//
// All three geometry types share the same wave displacement formula so they
// stay perfectly in sync. Only the fragment shader and point-size logic differ.

const WAVE_VERT = /* glsl */ `
  uniform float uTime;
  varying float vDepth;
  varying vec2  vGridPos;

  void main() {
    float px = position.x;
    float py = position.y;

    // Three-component smooth wave — slow, organic interference
    float dz =
      sin(px * 0.54 + uTime * 0.28) * 0.46 +
      sin(py * 0.88 - uTime * 0.19) * 0.32 +
      sin((px + py) * 0.27 + uTime * 0.12) * 0.16;

    // Depth: 0 = near (py = -PLANE_H/2), 1 = horizon (py = +PLANE_H/2)
    vDepth   = (py + 10.0) / 20.0;
    vGridPos = vec2(px, py);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, dz, 1.0);
  }
`;

/** Grid lines: cyan → deep blue, diagonal color wave */
const GRID_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vDepth;
  varying vec2  vGridPos;

  void main() {
    // Diagonal wave travelling bottom-right to upper-left (~20 s cycle)
    float wave = sin((vGridPos.x * 0.30 - vGridPos.y * 0.18) + uTime * 0.14) * 0.5 + 0.5;

    vec3 cyan = vec3(0.376, 0.647, 0.980);   // #60a5fa
    vec3 blue = vec3(0.255, 0.455, 0.910);   // #4174E8
    vec3 col  = mix(blue, cyan, wave * 0.70);

    // Subtle violet glow in the near/low region (matches reference lower purple)
    vec3 violet = vec3(0.510, 0.349, 0.937);
    float nearPurple = max(0.0, 1.0 - vDepth * 3.8);
    col = mix(col, violet, nearPurple * 0.22);

    float fade    = 1.0 - smoothstep(0.14, 0.90, vDepth);
    float opacity = fade * 0.27;
    if (opacity < 0.006) discard;
    gl_FragColor = vec4(col, opacity);
  }
`;

/** Diagonal lines: soft violet → indigo, same wave, lower opacity */
const DIAG_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vDepth;
  varying vec2  vGridPos;

  void main() {
    float wave = sin((vGridPos.x * 0.30 - vGridPos.y * 0.18) + uTime * 0.14) * 0.5 + 0.5;

    vec3 violet = vec3(0.545, 0.361, 0.965);  // #8B5CF6
    vec3 indigo = vec3(0.380, 0.278, 0.820);  // #6147D1
    vec3 col    = mix(indigo, violet, wave * 0.58);

    float fade    = 1.0 - smoothstep(0.10, 0.88, vDepth);
    float opacity = fade * 0.17;
    if (opacity < 0.005) discard;
    gl_FragColor = vec4(col, opacity);
  }
`;

/** Node points: custom gl_PointSize + soft circular glow in fragment */
const NODE_VERT = /* glsl */ `
  uniform float uTime;
  varying float vDepth;
  varying vec2  vGridPos;

  void main() {
    float px = position.x;
    float py = position.y;

    // Same wave as lines — nodes stay perfectly at mesh intersections
    float dz =
      sin(px * 0.54 + uTime * 0.28) * 0.46 +
      sin(py * 0.88 - uTime * 0.19) * 0.32 +
      sin((px + py) * 0.27 + uTime * 0.12) * 0.16;

    vec4 mvPos = modelViewMatrix * vec4(px, py, dz, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float depth01 = (py + 10.0) / 20.0;
    vDepth   = depth01;
    vGridPos = vec2(px, py);

    // Perspective-correct point size: larger near viewer, tiny at horizon
    float sizeScale = 1.0 - depth01 * 0.72;
    gl_PointSize = sizeScale * 24.0 / max(-mvPos.z, 0.5);
  }
`;

/** Node fragments: soft circular glow with falloff */
const NODE_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vDepth;
  varying vec2  vGridPos;

  void main() {
    vec2  cxy = gl_PointCoord * 2.0 - 1.0;
    float r   = dot(cxy, cxy);
    if (r > 1.0) discard;

    // Smooth glow: bright center, soft edge
    float glow = pow(1.0 - sqrt(r), 1.7);

    // Subtle color wave — matches line palette
    float wave     = sin((vGridPos.x * 0.30 - vGridPos.y * 0.18) + uTime * 0.14) * 0.5 + 0.5;
    vec3  cyanW    = vec3(0.600, 0.800, 0.998);
    vec3  violetW  = vec3(0.650, 0.430, 0.988);
    vec3  nodeColor = mix(cyanW, violetW, wave * 0.28);

    float fade = 1.0 - smoothstep(0.10, 0.86, vDepth);
    gl_FragColor = vec4(nodeColor, glow * fade * 0.95);
  }
`;

// ── WebGL guard + error boundary ────────────────────────────────────────────

function canUseWebGL() {
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

class CanvasEB extends Component<{ children: ReactNode }, { err: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { err: false };
  }
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? null : this.props.children; }
}

// ── Scene background ─────────────────────────────────────────────────────────

function ClearBg() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(new THREE.Color(0, 0, 0), 0);
  }, [scene, gl]);
  return null;
}

// ── Neural mesh ──────────────────────────────────────────────────────────────

function NeuralMesh({ isThinking }: { isThinking: boolean }) {
  const thinkRef    = useRef(isThinking);
  const prevTRef    = useRef(0);
  const effTRef     = useRef(0);

  useEffect(() => { thinkRef.current = isThinking; }, [isThinking]);

  // All geometries + materials created once — never recreated.
  const { objs, mats } = useMemo(() => {
    const gridGeo = buildGridLines(SEG_X, SEG_Y);
    const diagGeo = buildDiagLines(SEG_X, SEG_Y);
    const nodeGeo = buildNodePoints(SEG_X, SEG_Y);

    const mkMat = (frag: string) =>
      new THREE.ShaderMaterial({
        vertexShader:   WAVE_VERT,
        fragmentShader: frag,
        transparent:    true,
        depthWrite:     false,
        blending:       THREE.AdditiveBlending,
        uniforms:       { uTime: { value: 0 } },
      });

    const gridMat = mkMat(GRID_FRAG);
    const diagMat = mkMat(DIAG_FRAG);
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader:   NODE_VERT,
      fragmentShader: NODE_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms:       { uTime: { value: 0 } },
    });

    return {
      objs: {
        grid: new THREE.LineSegments(gridGeo, gridMat),
        diag: new THREE.LineSegments(diagGeo, diagMat),
        node: new THREE.Points(nodeGeo, nodeMat),
      },
      mats: { gridMat, diagMat, nodeMat },
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    objs.grid.geometry.dispose();
    objs.diag.geometry.dispose();
    objs.node.geometry.dispose();
    mats.gridMat.dispose();
    mats.diagMat.dispose();
    mats.nodeMat.dispose();
  }, [objs, mats]);

  useFrame(({ clock }) => {
    if (REDUCED) return;

    // Accumulated time with smooth speed scaling — no jump on state change
    const t  = clock.getElapsedTime();
    const dt = t - prevTRef.current;
    prevTRef.current = t;
    effTRef.current += dt * (thinkRef.current ? 1.55 : 1.0);

    const eff = effTRef.current;
    mats.gridMat.uniforms.uTime.value = eff;
    mats.diagMat.uniforms.uTime.value = eff;
    mats.nodeMat.uniforms.uTime.value = eff;
  });

  return (
    // −51.3° tilt on X: local bottom (y = −10) leans toward viewer,
    // local top (y = +10) recedes to horizon — creates the perspective grid look.
    <group rotation={[-Math.PI * 0.285, 0, 0]} position={[0, -1.8, 0]}>
      <primitive object={objs.grid} />
      <primitive object={objs.diag} />
      <primitive object={objs.node} />
    </group>
  );
}

// ── Exported component ──────────────────────────────────────────────────────

interface Props { isThinking?: boolean }

export const NeuralTerrainR3F = memo(function NeuralTerrainR3F({ isThinking = false }: Props) {
  if (!WEBGL_OK) return null;

  return (
    <CanvasEB>
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
        <ClearBg />

        <NeuralMesh isThinking={isThinking} />

        {/* Atmospheric particles — light data-field suggestion */}
        <Sparkles
          count={IS_MOBILE ? 12 : 22}
          scale={[24, 10, 16]}
          size={0.75}
          speed={0.09}
          opacity={0.10}
          color="#93c5fd"
          noise={0.5}
        />

        {/* Restrained bloom — softens wire intersections only */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.52}
            luminanceSmoothing={0.90}
            intensity={0.30}
          />
        </EffectComposer>
      </Canvas>
    </CanvasEB>
  );
});
