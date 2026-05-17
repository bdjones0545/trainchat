/**
 * rippleQueue — module-level message bus between DOM pointer events
 * and the R3F render loop inside NeuralTerrainR3F.
 *
 * Usage:
 *   DOM side:   addRipple(nx, ny)  — nx/ny are 0-1 normalized coords
 *               of the click within the empty-state container div.
 *   R3F side:   drain rippleQueue with shift() each frame, set startTime.
 *
 * No React state, no props, no re-renders.
 * Safe for single-page apps with one terrain instance.
 */

export interface Ripple {
  /** Terrain local X  (approx −11 … 11) */
  x: number;
  /** Terrain local Y  (approx −10 … 10; −10 = foreground, +10 = horizon) */
  y: number;
  /**
   * R3F clock time when the ripple was dequeued.
   * Filled in by NeuralMesh on first encounter; set to −1 here.
   */
  startTime: number;
  /** Lifetime in R3F clock-seconds (1.4 – 2.4 s) */
  duration: number;
  /** Peak deformation / color strength 0–1 */
  intensity: number;
}

const MAX_CONCURRENT = 6;

/** Pending ripples waiting to be consumed by the R3F render loop. */
export const rippleQueue: Ripple[] = [];

/**
 * Add a ripple originating from a pointer event on the empty-state container.
 *
 * @param nx  0 = left edge,  1 = right edge of the container div
 * @param ny  0 = top edge,   1 = bottom edge of the container div
 */
export function addRipple(nx: number, ny: number): void {
  // Map normalized screen coords → approximate terrain local XY.
  //
  // Terrain: PlaneGeometry(26, 20) with group rotation -51° on X
  //          and position [0, -1.9, 0].  Camera at [0, 0, 7].
  //
  // After the perspective tilt:
  //   bottom of visible area  → terrainY ≈ −10  (foreground, near)
  //   centre of visible area  → terrainY ≈   0  (mid terrain)
  //   top of terrain area     → terrainY ≈ +10  (horizon, far)
  //
  // The terrain canvas occupies the lower ~72% of the container.
  // Empirical mapping tuned so a tap "feels" like it lands at the right depth.
  const x = (nx - 0.5) * 22;
  const y = Math.max(-10, Math.min(10, (0.62 - ny) * 30));

  rippleQueue.push({
    x,
    y,
    startTime: -1,
    duration:  1.4 + Math.random() * 0.8,
    intensity: 0.50 + Math.random() * 0.30,
  });

  // Prevent unbounded buildup during rapid tapping
  if (rippleQueue.length > MAX_CONCURRENT) {
    rippleQueue.splice(0, rippleQueue.length - MAX_CONCURRENT);
  }
}
