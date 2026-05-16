/**
 * NeuralTerrainR3F — cinematic GPU neural terrain v4.
 *
 * Refinements vs v3:
 *   – Camera pulled back (z 7 → 10) + FoV 62°: terrain 40% smaller on screen,
 *     infinite-landscape feel, edges bleed past viewport naturally.
 *   – Group scaled × 0.80, tilted less steeply (-46.4°), shifted lower (-2.4y):
 *     horizon sits in the lower-middle of the viewport, leaving atmospheric
 *     space above the wave field for headline breathing room.
 *   – Wave frequencies LOWER (wider waves), speeds SLOWER, amplitudes SOFTER:
 *     removes the mechanical feel, creates fluid ambient terrain movement.
 *   – Color drift speed halved → gentle cyan / blue / indigo pulse over ~90s.
 *   – All opacity values reduced: grid 0.27→0.18, diagonals 0.17→0.11, nodes 0.95→0.78.
 *   – Bloom threshold raised, intensity trimmed: present but never dominant.
 *
 * No CPU vertex loop. Only uTime (3 floats/frame) updated from JS.
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

// ── Constants ────────────────────────────────────────────────────────────────

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof window !== "undefined" && window.innerWidth < 768;

const SEG_X = IS_MOBILE ? 18 : 36;
const SEG_Y = IS_MOBILE ? 12 : 24;

const PLANE_W = 30;   // world units wide
const PLANE_H = 22;   // world units deep (y: +11 = far/horizon, −11 = near)
const HALF_H  = PLANE_H / 2;

// ── Geometry builders ─────────────────────────────────────────────────────────

const gx = (col: number) => (col / SEG_X - 0.5) * PLANE_W;
const gy = (row: number) => (0.5 - row / SEG_Y) * PLANE_H;  // +HALF_H far, -HALF_H near

function buildGridLines(): THREE.BufferGeometry {
  const horz = SEG_X * (SEG_Y + 1);
  const vert = (SEG_X + 1) * SEG_Y;
  const buf  = new Float32Array((horz + vert) * 2 * 3);
  let i = 0;
  const p = (x: number, y: number) => { buf[i++]=x; buf[i++]=y; buf[i++]=0; };
  for (let r = 0; r <= SEG_Y; r++)
    for (let c = 0;  c <  SEG_X; c++) { p(gx(c), gy(r)); p(gx(c+1), gy(r)); }
  for (let r = 0;  r <  SEG_Y; r++)
    for (let c = 0; c <= SEG_X; c++) { p(gx(c), gy(r)); p(gx(c), gy(r+1)); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

function buildDiagLines(): THREE.BufferGeometry {
  const buf = new Float32Array(SEG_X * SEG_Y * 2 * 3);
  let i = 0;
  const p = (x: number, y: number) => { buf[i++]=x; buf[i++]=y; buf[i++]=0; };
  for (let r = 0; r < SEG_Y; r++)
    for (let c = 0; c < SEG_X; c++) {
      p(gx(c+1), gy(r));    // top-right
      p(gx(c),   gy(r+1));  // bottom-left
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

function buildNodes(): THREE.BufferGeometry {
  const buf = new Float32Array((SEG_X + 1) * (SEG_Y + 1) * 3);
  let i = 0;
  for (let r = 0; r <= SEG_Y; r++)
    for (let c = 0; c <= SEG_X; c++) { buf[i++]=gx(c); buf[i++]=gy(r); buf[i++]=0; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf, 3));
  return geo;
}

// ── GLSL ──────────────────────────────────────────────────────────────────────
//
// Lower frequencies (0.36, 0.58) → wider wave crests = smoother, more organic.
// Lower speeds (0.15, 0.10, 0.06) → ambient drift, not pulsing energy.
// Depth formula: vDepth 0 = near (py = -HALF_H), 1 = horizon (py = +HALF_H).

const WAVE_VERT = /* glsl */`
uniform float uTime;
varying float vDepth;
varying vec2  vGridPos;

void main() {
  float px = position.x;
  float py = position.y;

  // Wide, slow, organic three-harmonic wave
  float dz =
    sin(px * 0.36 + uTime * 0.15) * 0.36 +
    sin(py * 0.58 - uTime * 0.10) * 0.25 +
    sin((px * 0.76 + py * 0.44) * 0.19 + uTime * 0.06) * 0.12;

  vDepth   = (py + ${HALF_H}.0) / ${PLANE_H}.0;
  vGridPos = vec2(px, py);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, dz, 1.0);
}
`;

// Grid lines: deep blue → cyan drift, restrained opacity
const GRID_FRAG = /* glsl */`
uniform float uTime;
varying float vDepth;
varying vec2  vGridPos;

void main() {
  // Diagonal color wave — very slow ~94 s full cycle
  float wave = sin((vGridPos.x * 0.24 - vGridPos.y * 0.14) + uTime * 0.08) * 0.5 + 0.5;

  vec3 cyan   = vec3(0.376, 0.647, 0.980);  // #60a5fa
  vec3 blue   = vec3(0.255, 0.455, 0.910);  // #4174E8
  vec3 col    = mix(blue, cyan, wave * 0.68);

  // Soft violet near the bottom (near region) — subtle depth accent
  vec3 violet = vec3(0.490, 0.330, 0.910);
  col = mix(col, violet, max(0.0, 1.0 - vDepth * 4.2) * 0.18);

  float fade    = 1.0 - smoothstep(0.12, 0.88, vDepth);
  float opacity = fade * 0.18;
  if (opacity < 0.005) discard;
  gl_FragColor = vec4(col, opacity);
}
`;

// Diagonal lines: indigo → soft violet, even softer opacity
const DIAG_FRAG = /* glsl */`
uniform float uTime;
varying float vDepth;
varying vec2  vGridPos;

void main() {
  float wave = sin((vGridPos.x * 0.24 - vGridPos.y * 0.14) + uTime * 0.08) * 0.5 + 0.5;

  vec3 violet = vec3(0.545, 0.361, 0.965);
  vec3 indigo = vec3(0.365, 0.270, 0.800);
  vec3 col    = mix(indigo, violet, wave * 0.55);

  float fade    = 1.0 - smoothstep(0.10, 0.86, vDepth);
  float opacity = fade * 0.11;
  if (opacity < 0.004) discard;
  gl_FragColor = vec4(col, opacity);
}
`;

// Nodes: circular soft glow, perspective-attenuated size
const NODE_VERT = /* glsl */`
uniform float uTime;
varying float vDepth;
varying vec2  vGridPos;

void main() {
  float px = position.x;
  float py = position.y;

  float dz =
    sin(px * 0.36 + uTime * 0.15) * 0.36 +
    sin(py * 0.58 - uTime * 0.10) * 0.25 +
    sin((px * 0.76 + py * 0.44) * 0.19 + uTime * 0.06) * 0.12;

  vec4 mvPos = modelViewMatrix * vec4(px, py, dz, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float depth01   = (py + ${HALF_H}.0) / ${PLANE_H}.0;
  vDepth          = depth01;
  vGridPos        = vec2(px, py);

  float sizeScale = 1.0 - depth01 * 0.74;
  gl_PointSize    = sizeScale * 19.0 / max(-mvPos.z, 0.5);
}
`;

const NODE_FRAG = /* glsl */`
uniform float uTime;
varying float vDepth;
varying vec2  vGridPos;

void main() {
  vec2  cxy  = gl_PointCoord * 2.0 - 1.0;
  float r    = dot(cxy, cxy);
  if (r > 1.0) discard;

  float glow  = pow(1.0 - sqrt(r), 1.8);

  float wave     = sin((vGridPos.x * 0.24 - vGridPos.y * 0.14) + uTime * 0.08) * 0.5 + 0.5;
  vec3  cyanW    = vec3(0.580, 0.790, 0.998);
  vec3  violetW  = vec3(0.635, 0.430, 0.985);
  vec3  nodeCol  = mix(cyanW, violetW, wave * 0.25);

  float fade     = 1.0 - smoothstep(0.10, 0.84, vDepth);
  gl_FragColor   = vec4(nodeCol, glow * fade * 0.78);
}
`;

// ── WebGL guard ───────────────────────────────────────────────────────────────

function canUseWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}
const WEBGL_OK = canUseWebGL();

class CanvasEB extends Component<{ children: ReactNode }, { err: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? null : this.props.children; }
}

function ClearBg() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(new THREE.Color(0, 0, 0), 0);
  }, [scene, gl]);
  return null;
}

// ── Neural mesh ───────────────────────────────────────────────────────────────

function NeuralMesh({ isThinking }: { isThinking: boolean }) {
  const thinkRef = useRef(isThinking);
  const prevT    = useRef(0);
  const effT     = useRef(0);

  useEffect(() => { thinkRef.current = isThinking; }, [isThinking]);

  const { objs, mats } = useMemo(() => {
    const mkLineMat = (frag: string) => new THREE.ShaderMaterial({
      vertexShader: WAVE_VERT, fragmentShader: frag,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
    });
    const gridMat = mkLineMat(GRID_FRAG);
    const diagMat = mkLineMat(DIAG_FRAG);
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
    });
    return {
      objs: {
        grid: new THREE.LineSegments(buildGridLines(), gridMat),
        diag: new THREE.LineSegments(buildDiagLines(), diagMat),
        node: new THREE.Points(buildNodes(), nodeMat),
      },
      mats: { gridMat, diagMat, nodeMat },
    };
  }, []);

  useEffect(() => () => {
    objs.grid.geometry.dispose(); objs.diag.geometry.dispose(); objs.node.geometry.dispose();
    mats.gridMat.dispose(); mats.diagMat.dispose(); mats.nodeMat.dispose();
  }, [objs, mats]);

  useFrame(({ clock }) => {
    if (REDUCED) return;
    const t  = clock.getElapsedTime();
    const dt = t - prevT.current;
    prevT.current = t;
    effT.current += dt * (thinkRef.current ? 1.5 : 1.0);
    const e = effT.current;
    mats.gridMat.uniforms.uTime.value = e;
    mats.diagMat.uniforms.uTime.value = e;
    mats.nodeMat.uniforms.uTime.value = e;
  });

  return (
    // Tilt −46.4° on X. scale 0.80 shrinks geometry ~20%.
    // With camera at z=10 (vs prior z=7), combined apparent reduction ≈ 40%.
    // Position y=−2.4 brings the convergence point to the lower-middle viewport.
    <group
      rotation={[-Math.PI * 0.258, 0, 0]}
      position={[0, -2.4, 0]}
      scale={[0.80, 0.80, 0.80]}
    >
      <primitive object={objs.grid} />
      <primitive object={objs.diag} />
      <primitive object={objs.node} />
    </group>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface Props { isThinking?: boolean }

export const NeuralTerrainR3F = memo(function NeuralTerrainR3F({ isThinking = false }: Props) {
  if (!WEBGL_OK) return null;

  return (
    <CanvasEB>
      <Canvas
        // Pulled back from z=7 → z=10: terrain appears ~40% smaller = expansive landscape
        camera={{ position: [0, 0, 10], fov: 62, near: 0.1, far: 100 }}
        gl={{ alpha: true, antialias: !IS_MOBILE, powerPreference: "low-power" }}
        dpr={[1, IS_MOBILE ? 1.5 : 2]}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <ClearBg />
        <NeuralMesh isThinking={isThinking} />

        {/* Fewer, quieter sparkles — atmospheric data field hint */}
        <Sparkles
          count={IS_MOBILE ? 10 : 18}
          scale={[26, 10, 18]}
          size={0.65}
          speed={0.08}
          opacity={0.08}
          color="#7dd3fc"
          noise={0.5}
        />

        {/* Bloom: raised threshold = only the brightest node cores glow */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.62}
            luminanceSmoothing={0.92}
            intensity={0.22}
          />
        </EffectComposer>
      </Canvas>
    </CanvasEB>
  );
});
