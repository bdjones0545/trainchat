// ─── Exercise Variation Engine ────────────────────────────────────────────────
//
// Slot-based exercise selection system that pre-selects specific exercises
// for each movement slot BEFORE the AI generates the program.
//
// Problem solved:
//   Without this layer, the AI defaults to the same 4-5 exercises every build
//   (Broad Jump, Back Squat, Conventional Deadlift, Bulgarian Split Squat,
//   Pallof Press) because the Architecture Brief listed options and the AI
//   always picked the first listed option.
//
// How it works:
//   1. Each movement slot maps to a candidate pool of valid exercises.
//   2. A seeded selection function picks one exercise per slot using the
//      build's variation seed — deterministic within a build, varied across builds.
//   3. Sport-specific filtering removes exercises inappropriate for the sport.
//   4. The selected exercises are injected directly into the Architecture Brief
//      as prescriptions ("Use X") rather than choices ("Choose from X, Y, Z").
//
// Key guarantee: Coaching correctness is NEVER sacrificed for novelty.
//   Every candidate in every pool is valid for that slot.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotExerciseSelection {
  lower_power: string;
  bilateral_squat_strength: string;
  bilateral_hinge_strength: string;
  unilateral_lower: string;
  unilateral_lower_alt: string;
  trunk_anti_rotation: string;
  trunk_anti_extension: string;
  upper_push_primary: string;
  upper_push_secondary: string;
  upper_pull_primary: string;
  upper_pull_secondary: string;
  rotational_power: string;
  conditioning_finisher: string;
  block_template_index: number;
}

// ─── Candidate Pools ──────────────────────────────────────────────────────────
// Each pool contains valid, coach-approved options for that slot.
// Ordered from most to least common — ensures first option is already used,
// so rotation naturally pushes toward less-used options.

const LOWER_POWER_POOL = [
  "Box Jump",
  "Broad Jump",
  "Vertical Jump (countermovement)",
  "Hurdle Hop",
  "Depth Jump",
  "Trap Bar Jump (loaded)",
  "Single-Leg Box Jump",
  "Reactive Broad Jump (stick landing)",
  "Seated Box Jump",
];

const LOWER_POWER_POOL_ATHLETIC = [
  "Box Jump",
  "Broad Jump",
  "Hurdle Hop",
  "Depth Jump",
  "Trap Bar Jump",
  "Reactive Bound to Box",
  "Vertical Jump",
  "Approach Jump",
];

const BILATERAL_SQUAT_POOL = [
  "Back Squat",
  "Front Squat",
  "Trap Bar Deadlift (squat-mode, low handles)",
  "Safety Bar Squat",
  "Box Squat",
  "Pause Back Squat",
  "Heel-Elevated Back Squat",
  "Cambered Bar Squat",
];

const BILATERAL_SQUAT_POOL_JOINT_FRIENDLY = [
  "Trap Bar Deadlift (low handles)",
  "Goblet Squat (heavy)",
  "Front Squat",
  "Safety Bar Squat",
  "Box Squat",
  "Heel-Elevated Goblet Squat",
];

const BILATERAL_HINGE_POOL = [
  "Conventional Deadlift",
  "Romanian Deadlift",
  "Trap Bar Deadlift",
  "Sumo Deadlift",
  "Rack Pull (from knee)",
  "Dumbbell Romanian Deadlift",
  "Hex Bar RDL",
  "Good Morning",
  "Snatch-Grip Deadlift",
];

const BILATERAL_HINGE_POOL_MODERATE = [
  "Romanian Deadlift",
  "Trap Bar Deadlift",
  "Dumbbell Romanian Deadlift",
  "Rack Pull (from knee)",
  "Hex Bar Deadlift",
  "Good Morning",
  "Kettlebell Deadlift",
];

const UNILATERAL_LOWER_POOL = [
  "Bulgarian Split Squat",
  "Rear-Foot Elevated Split Squat (RFESS)",
  "Lateral Step-Up",
  "Single-Leg Squat to Box",
  "Reverse Lunge",
  "Lateral Lunge",
  "Walking Lunge (weighted)",
  "Cossack Squat",
  "Deficit Reverse Lunge",
];

const UNILATERAL_LOWER_POOL_HINGE = [
  "Single-Leg Romanian Deadlift",
  "Single-Leg Hip Thrust",
  "Single-Leg Deadlift (KB)",
  "Hip Hinge to Single-Leg RDL",
  "Kickstand RDL",
  "Single-Leg Good Morning",
];

const TRUNK_ANTI_ROTATION_POOL = [
  "Pallof Press",
  "Half-Kneeling Cable Chop",
  "Landmine Anti-Rotation",
  "Copenhagen Plank",
  "Suitcase Carry",
  "Offset Farmer Carry",
  "Band Pallof Press",
  "Half-Kneeling Band Chop",
  "Cable Woodchop (low to high)",
];

const TRUNK_ANTI_EXTENSION_POOL = [
  "Dead Bug",
  "Ab Wheel Rollout",
  "Hollow Body Hold",
  "RKC Plank",
  "TRX Fallout",
  "Stir the Pot (Swiss ball)",
  "Long-Lever Plank",
  "Barbell Rollout",
  "Hanging Knee Raise (controlled)",
];

const UPPER_PUSH_PRIMARY_POOL = [
  "Barbell Bench Press",
  "Incline Barbell Press",
  "Dumbbell Bench Press",
  "Incline Dumbbell Press",
  "Overhead Press (barbell)",
  "Push Press",
  "Landmine Press",
  "Close-Grip Bench Press",
];

const UPPER_PUSH_PRIMARY_POOL_ATHLETIC = [
  "Dumbbell Bench Press",
  "Incline Dumbbell Press",
  "Landmine Press",
  "Push Press",
  "Overhead Press (barbell)",
  "Barbell Bench Press",
  "Single-Arm Dumbbell Press",
];

const UPPER_PUSH_SECONDARY_POOL = [
  "Incline Dumbbell Press",
  "Dumbbell Shoulder Press",
  "Landmine Press",
  "Single-Arm Dumbbell Press",
  "Cable Chest Press",
  "Push-Up (weighted)",
  "Ring Dip",
];

const UPPER_PULL_PRIMARY_POOL = [
  "Weighted Pull-Up",
  "Barbell Bent-Over Row",
  "Weighted Chin-Up",
  "Seated Cable Row",
  "Pendlay Row",
  "Single-Arm Dumbbell Row",
  "T-Bar Row",
  "Chest-Supported Dumbbell Row",
];

const UPPER_PULL_SECONDARY_POOL = [
  "Lat Pulldown",
  "Cable Row (neutral grip)",
  "Incline Dumbbell Row",
  "Band Pull-Apart",
  "Face Pull",
  "Half-Kneeling Cable Row",
  "Single-Arm Cable Row",
  "Inverted Row",
];

const ROTATIONAL_POWER_POOL = [
  "Med Ball Rotational Throw (against wall)",
  "Med Ball Scoop Toss (rotational)",
  "Med Ball Overhead Backward Slam",
  "Med Ball Chest Throw",
  "Med Ball Side Slam",
  "Med Ball Rotational Pass (partner or wall)",
  "Landmine Rotation (loaded)",
  "Cable Rotational Throw",
];

const CONDITIONING_FINISHER_POOL = [
  "Farmer Carry complex (30m × 3)",
  "Kettlebell Swing (4 × 15)",
  "Sled Push (20m × 5)",
  "Assault Bike (6 × 30 sec all-out / 90 sec rest)",
  "Battle Rope (8 × 20 sec / 40 sec rest)",
  "Rowing Intervals (6 × 250m / 90 sec rest)",
  "Rower Sprint (5 × 300m / 2 min rest)",
  "Trap Bar Carry (30m × 3)",
];

// ─── Sport-specific pool overrides ───────────────────────────────────────────

function getLowerPowerPool(sport: string | null, neuralDemand: "high" | "moderate" | "low"): string[] {
  const s = sport?.toLowerCase() ?? "";
  if (neuralDemand === "low") {
    return [
      "Box Jump (sub-maximal, technique focus)",
      "Broad Jump (approach, stick landing)",
      "Vertical Jump (reset between reps)",
      "Medicine Ball Slam (explosive, low reactive demand)",
    ];
  }
  if (s.includes("soccer") || s.includes("football") || s.includes("rugby") || s.includes("lacrosse")) {
    return [
      "Box Jump",
      "Broad Jump",
      "Hurdle Hop",
      "Depth Jump",
      "Lateral Bound",
      "Reactive Broad Jump",
      "Approach Jump to Box",
    ];
  }
  if (s.includes("basketball") || s.includes("volleyball")) {
    return [
      "Box Jump",
      "Depth Jump",
      "Vertical Jump (max height)",
      "Lateral Bound",
      "Reactive Countermovement Jump",
      "Approach Jump",
      "Single-Leg Box Jump",
    ];
  }
  if (s.includes("hockey")) {
    return [
      "Lateral Bound",
      "Box Jump",
      "Broad Jump",
      "Lateral Hurdle Hop",
      "Skater Bound",
      "Depth Jump to Lateral",
      "Vertical Jump",
    ];
  }
  if (s.includes("baseball") || s.includes("softball")) {
    return ROTATIONAL_POWER_POOL;
  }
  if (s.includes("track") || s.includes("sprint")) {
    return [
      "Broad Jump",
      "Hurdle Hop",
      "Triple Bound",
      "Box Jump",
      "Altitude Drop",
      "Reactive Single-Leg Bound",
    ];
  }
  return LOWER_POWER_POOL_ATHLETIC.length > 0 ? LOWER_POWER_POOL_ATHLETIC : LOWER_POWER_POOL;
}

function getBilateralSquatPool(sport: string | null, goal: string | null): string[] {
  const s = sport?.toLowerCase() ?? "";
  const g = goal?.toLowerCase() ?? "";
  if (s.includes("basketball") || s.includes("volleyball")) {
    return BILATERAL_SQUAT_POOL_JOINT_FRIENDLY;
  }
  if (g.includes("strength")) {
    return [
      "Back Squat",
      "Front Squat",
      "Pause Back Squat",
      "Safety Bar Squat",
      "Cambered Bar Squat",
      "Box Squat",
      "Low-Bar Back Squat",
    ];
  }
  if (g.includes("hypertrophy")) {
    return [
      "Back Squat",
      "Front Squat",
      "Safety Bar Squat",
      "Heel-Elevated Back Squat",
      "Leg Press (as primary)",
      "Hack Squat",
      "Trap Bar Deadlift (squat-mode)",
    ];
  }
  return BILATERAL_SQUAT_POOL;
}

function getBilateralHingePool(sport: string | null, goal: string | null, fatigueConstraint: "high" | "moderate" | "low" = "moderate"): string[] {
  const g = goal?.toLowerCase() ?? "";
  if (fatigueConstraint === "low") {
    return BILATERAL_HINGE_POOL_MODERATE;
  }
  if (g.includes("strength")) {
    return [
      "Conventional Deadlift",
      "Sumo Deadlift",
      "Trap Bar Deadlift",
      "Rack Pull (from knee)",
      "Snatch-Grip Deadlift",
      "Romanian Deadlift (heavy)",
    ];
  }
  return BILATERAL_HINGE_POOL;
}

// ─── Seeded selection ─────────────────────────────────────────────────────────
//
// Given a seed in [0, 1) and a pool, deterministically selects one item.
// Different multipliers for each slot spread selections across pools
// so consecutive slots don't all land on the same index.

function pick<T>(pool: T[], seed: number, multiplier: number = 1): T {
  const index = Math.floor(((seed * multiplier * 2654435761) % 1 + 1) % 1 * pool.length);
  return pool[Math.abs(index) % pool.length];
}

// ─── Main selection function ──────────────────────────────────────────────────

export function selectSlotExercises(
  seed: number,
  sport: string | null,
  goal: string | null,
  neuralDemand: "high" | "moderate" | "low" = "high",
): SlotExerciseSelection {
  const lowerPowerPool = getLowerPowerPool(sport, neuralDemand);
  const bilateralSquatPool = getBilateralSquatPool(sport, goal);
  const bilateralHingePool = getBilateralHingePool(sport, goal);
  const bilateralHingeModeratePool = getBilateralHingePool(sport, goal, "low");

  // Each slot uses a different prime multiplier to ensure spread
  const lower_power = pick(lowerPowerPool, seed, 1.0);
  const bilateral_squat_strength = pick(bilateralSquatPool, seed, 1.3);
  const bilateral_hinge_strength = pick(bilateralHingePool, seed, 1.7);
  const unilateral_lower = pick(UNILATERAL_LOWER_POOL, seed, 2.1);
  const unilateral_lower_alt = pick(UNILATERAL_LOWER_POOL_HINGE, seed, 2.5);
  const trunk_anti_rotation = pick(TRUNK_ANTI_ROTATION_POOL, seed, 3.1);
  const trunk_anti_extension = pick(TRUNK_ANTI_EXTENSION_POOL, seed, 3.7);

  const s = sport?.toLowerCase() ?? "";
  const isAthletic = !!(sport);
  const upper_push_pool = isAthletic ? UPPER_PUSH_PRIMARY_POOL_ATHLETIC : UPPER_PUSH_PRIMARY_POOL;
  const upper_push_primary = pick(upper_push_pool, seed, 4.3);
  const upper_push_secondary = pick(UPPER_PUSH_SECONDARY_POOL, seed, 4.9);
  const upper_pull_primary = pick(UPPER_PULL_PRIMARY_POOL, seed, 5.3);
  const upper_pull_secondary = pick(UPPER_PULL_SECONDARY_POOL, seed, 5.9);
  const rotational_power = pick(ROTATIONAL_POWER_POOL, seed, 6.7);
  const conditioning_finisher = pick(CONDITIONING_FINISHER_POOL, seed, 7.3);

  // Block template index: 0, 1, or 2 depending on seed range
  const block_template_index = Math.floor(seed * 3);

  return {
    lower_power,
    bilateral_squat_strength,
    bilateral_hinge_strength,
    unilateral_lower,
    unilateral_lower_alt,
    trunk_anti_rotation,
    trunk_anti_extension,
    upper_push_primary,
    upper_push_secondary,
    upper_pull_primary,
    upper_pull_secondary,
    rotational_power,
    conditioning_finisher,
    block_template_index,
  };
}

// ─── CNS Flow description builders ───────────────────────────────────────────
// These replace the generic "choose from X, Y, Z" descriptions with
// prescriptive "use X" descriptions using the pre-selected exercises.

export function buildLowerPowerDescription(sel: SlotExerciseSelection, neuralDemand: "high" | "moderate" | "low"): string {
  if (neuralDemand === "low") {
    return `Power primer (sub-maximal): ${sel.lower_power} (3 × 3, technique focus — not max effort today)`;
  }
  return `Vertical/horizontal power: ${sel.lower_power} (3–5 sets × 3–5 reps — maximum intent, full reset between reps)`;
}

export function buildSquatPrimaryDescription(sel: SlotExerciseSelection): string {
  return `Primary squat pattern: ${sel.bilateral_squat_strength} — bilateral lower force production (3–5 sets × 3–6 reps for strength / 4 × 6–10 for performance)`;
}

export function buildHingePrimaryDescription(sel: SlotExerciseSelection): string {
  return `Primary hinge pattern: ${sel.bilateral_hinge_strength} — posterior chain force production (4–5 sets, load per goal)`;
}

export function buildHingeSecondaryDescription(sel: SlotExerciseSelection): string {
  return `Hinge complement: ${sel.bilateral_hinge_strength} as secondary anchor + posterior chain support (3 × 8–10)`;
}

export function buildUnilateralDescription(sel: SlotExerciseSelection, isHingeDay: boolean = false): string {
  const exercise = isHingeDay ? sel.unilateral_lower_alt : sel.unilateral_lower;
  return `Unilateral lower-body: ${exercise} — single-leg positional control and asymmetry exposure (3 × 8–10 each side)`;
}

export function buildTrunkDescription(sel: SlotExerciseSelection, hasRotational: boolean = false): string {
  if (hasRotational) {
    return `Rotational trunk integrity: ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} — anti-rotation and anti-extension pairing (2–3 sets each)`;
  }
  return `Trunk integrity: ${sel.trunk_anti_extension} (anti-extension) + ${sel.trunk_anti_rotation} (anti-rotation) — paired for session integrity (2–3 sets each)`;
}

export function buildUpperPushDescription(sel: SlotExerciseSelection, isPrimary: boolean = true): string {
  if (isPrimary) {
    return `Primary press: ${sel.upper_push_primary} — horizontal or vertical force production (4–5 sets × 3–6 reps for strength / 4 × 8–10 for performance)`;
  }
  return `Press complement: ${sel.upper_push_secondary} — volume accumulation and structural balance (3 × 8–12)`;
}

export function buildUpperPullDescription(sel: SlotExerciseSelection, isPrimary: boolean = true): string {
  if (isPrimary) {
    return `Primary pull: ${sel.upper_pull_primary} — vertical or horizontal pull for scapular strength and structural balance (4–5 sets × 3–6 reps strength / 4 × 6–10 performance)`;
  }
  return `Pull complement: ${sel.upper_pull_secondary} — volume and scapular integrity (3 × 10–12)`;
}

export function buildRotationalPowerDescription(sel: SlotExerciseSelection): string {
  return `Rotational power: ${sel.rotational_power} (4 × 5–6 each side — hip-driven, maximum rotational intent)`;
}

// ─── Repeat avoidance mandate ─────────────────────────────────────────────────
// Generates a brief section for the Architecture Brief that tells the AI
// which specific exercises ARE already selected and must be honored.

export function buildVariationMandate(sel: SlotExerciseSelection, sport: string | null): string {
  const s = sport?.toLowerCase() ?? "";
  const isRotationalSport = s.includes("baseball") || s.includes("softball") || s.includes("tennis") || s.includes("golf");
  const isAthletic = !!sport;

  const lines = [
    `## EXERCISE VARIATION MANDATE — ENFORCE THESE SPECIFIC SELECTIONS`,
    ``,
    `The following exercises have been pre-selected for this build. Use them exactly.`,
    `Do NOT substitute with Back Squat, Conventional Deadlift, Broad Jump, Bulgarian Split Squat,`,
    `or Pallof Press unless those exercises ARE the pre-selected option below.`,
    ``,
    `### PRE-SELECTED EXERCISES BY SLOT`,
    ``,
    `- **Power / Explosive slot**: ${sel.lower_power}`,
    `- **Bilateral squat strength**: ${sel.bilateral_squat_strength}`,
    `- **Bilateral hinge strength**: ${sel.bilateral_hinge_strength}`,
    `- **Unilateral lower (squat-pattern days)**: ${sel.unilateral_lower}`,
    `- **Unilateral lower (hinge-pattern days)**: ${sel.unilateral_lower_alt}`,
    `- **Trunk anti-rotation**: ${sel.trunk_anti_rotation}`,
    `- **Trunk anti-extension**: ${sel.trunk_anti_extension}`,
    `- **Upper push primary**: ${sel.upper_push_primary}`,
    `- **Upper push secondary**: ${sel.upper_push_secondary}`,
    `- **Upper pull primary**: ${sel.upper_pull_primary}`,
    `- **Upper pull secondary**: ${sel.upper_pull_secondary}`,
    isRotationalSport ? `- **Rotational power**: ${sel.rotational_power}` : null,
    ``,
    `### REPEAT AVOIDANCE RULES`,
    ``,
    `1. No single exercise should appear as a primary lift in more than one session.`,
    `2. If a slot exercise appears twice in the program, use its variation:`,
    `   - ${sel.bilateral_squat_strength} appears twice → second session uses a tempo or pause variant`,
    `   - ${sel.bilateral_hinge_strength} appears twice → second session uses a different load scheme or unilateral version`,
    `3. Power slots across sessions must differ — if Day 1 uses ${sel.lower_power}, Day 3 uses a different power modality.`,
    `4. Accessory exercises (unilateral, trunk) can repeat across sessions — they are not anchors.`,
    ``,
    `### VARIATION ENFORCEMENT`,
    ``,
    `If the final program has Back Squat in more than one session, it FAILS this check.`,
    `If the final program has Broad Jump in more than one session, it FAILS this check.`,
    `If the final program has Conventional Deadlift in more than one session, it FAILS this check.`,
    `If the final program has Pallof Press as the ONLY trunk exercise across all sessions, it FAILS this check.`,
  ].filter(line => line !== null);

  return lines.join("\n");
}

// ─── Block template variants ──────────────────────────────────────────────────
// Returns description text for the block ordering variant to use.
// This supplements the existing 2-variant (odd/even) system with a 3rd variant.

export type BlockVariant = "squat_first" | "hinge_first" | "power_first";

export function getBlockVariantForLowerDay(templateIndex: number): BlockVariant {
  const variants: BlockVariant[] = ["squat_first", "hinge_first", "power_first"];
  return variants[templateIndex % variants.length];
}

export function describeBlockVariant(variant: BlockVariant, sel: SlotExerciseSelection): string {
  switch (variant) {
    case "squat_first":
      return `Block order: prep → ${sel.lower_power} (power) → ${sel.bilateral_squat_strength} (primary) → ${sel.bilateral_hinge_strength} complement (secondary) → ${sel.unilateral_lower} (unilateral) → ${sel.trunk_anti_extension} + ${sel.trunk_anti_rotation} (trunk)`;
    case "hinge_first":
      return `Block order: prep → ${sel.lower_power} (power) → ${sel.bilateral_hinge_strength} (primary) → ${sel.bilateral_squat_strength} support (secondary) → ${sel.unilateral_lower_alt} (unilateral) → ${sel.trunk_anti_rotation} + ${sel.trunk_anti_extension} (trunk)`;
    case "power_first":
      return `Block order: prep → ${sel.lower_power} (power, extended block) → ${sel.bilateral_squat_strength} or ${sel.bilateral_hinge_strength} as loaded post-activation (primary) → ${sel.unilateral_lower} (unilateral) → ${sel.trunk_anti_rotation} (trunk)`;
  }
}
