/**
 * loggingMode — exercise-aware logging type inference
 *
 * Determines which fields to show in the exercise logger based on
 * exercise name and category. Never defaults to load_reps for jumps,
 * throws, timed work, or mobility flows.
 */

export type LoggingMode =
  | "load_reps"       // squat, deadlift, bench — weight + reps
  | "reps_only"       // pull-ups, jumps, bodyweight — reps only
  | "distance_reps"   // broad jump, bounding — distance + reps
  | "height_reps"     // box jump, hurdle — height + reps
  | "throws_reps"     // med ball slam, throw — ball weight (optional) + reps
  | "time_only"       // plank, isometric hold — duration only
  | "distance_time"   // sprint, carry — distance + time
  | "mobility_flow";  // warm-up, mobility drill — mark done only

export interface LoggingModeConfig {
  mode: LoggingMode;
  primaryLabel: string;    // e.g. "lb", "ft", "sec"
  primaryPlaceholder: string;
  primaryStep: number;
  primaryDelta: number;    // button increment
  showPrimary: boolean;
  secondaryLabel: string;  // e.g. "rp", "sec"
  secondaryPlaceholder: string;
  showSecondary: boolean;
  showQuickJumps: boolean; // +5/+10 lb buttons only for load_reps
}

const MODE_CONFIGS: Record<LoggingMode, LoggingModeConfig> = {
  load_reps: {
    mode: "load_reps", primaryLabel: "lb", primaryPlaceholder: "lbs",
    primaryStep: 2.5, primaryDelta: 2.5, showPrimary: true,
    secondaryLabel: "rp", secondaryPlaceholder: "reps", showSecondary: true,
    showQuickJumps: true,
  },
  reps_only: {
    mode: "reps_only", primaryLabel: "", primaryPlaceholder: "",
    primaryStep: 1, primaryDelta: 1, showPrimary: false,
    secondaryLabel: "rp", secondaryPlaceholder: "reps", showSecondary: true,
    showQuickJumps: false,
  },
  distance_reps: {
    mode: "distance_reps", primaryLabel: "ft", primaryPlaceholder: "dist",
    primaryStep: 1, primaryDelta: 1, showPrimary: true,
    secondaryLabel: "rp", secondaryPlaceholder: "reps", showSecondary: true,
    showQuickJumps: false,
  },
  height_reps: {
    mode: "height_reps", primaryLabel: "in", primaryPlaceholder: "ht",
    primaryStep: 1, primaryDelta: 1, showPrimary: true,
    secondaryLabel: "rp", secondaryPlaceholder: "reps", showSecondary: true,
    showQuickJumps: false,
  },
  throws_reps: {
    mode: "throws_reps", primaryLabel: "lb", primaryPlaceholder: "ball",
    primaryStep: 2, primaryDelta: 2, showPrimary: true,
    secondaryLabel: "rp", secondaryPlaceholder: "reps", showSecondary: true,
    showQuickJumps: false,
  },
  time_only: {
    mode: "time_only", primaryLabel: "s", primaryPlaceholder: "sec",
    primaryStep: 5, primaryDelta: 5, showPrimary: true,
    secondaryLabel: "", secondaryPlaceholder: "", showSecondary: false,
    showQuickJumps: false,
  },
  distance_time: {
    mode: "distance_time", primaryLabel: "ft", primaryPlaceholder: "dist",
    primaryStep: 5, primaryDelta: 5, showPrimary: true,
    secondaryLabel: "s", secondaryPlaceholder: "time", showSecondary: true,
    showQuickJumps: false,
  },
  mobility_flow: {
    mode: "mobility_flow", primaryLabel: "", primaryPlaceholder: "",
    primaryStep: 1, primaryDelta: 1, showPrimary: false,
    secondaryLabel: "", secondaryPlaceholder: "", showSecondary: false,
    showQuickJumps: false,
  },
};

export function getModeConfig(mode: LoggingMode): LoggingModeConfig {
  return MODE_CONFIGS[mode];
}

/**
 * Infer the correct logging mode from exercise name and optional DB category.
 * Priority: specific name patterns > category > sensible default.
 */
export function inferLoggingMode(name: string, category?: string): LoggingMode {
  const n = name.toLowerCase();

  // ── Mobility / warm-up flows ─────────────────────────────────────────────
  // Accepts both DB category values and legacy exerciseRole values ("prep")
  if (category === "warmup" || category === "activation" || category === "recovery" || category === "prep") {
    return "mobility_flow";
  }
  if (
    n.includes("swing") || n.includes("hip circle") || n.includes("ankle circle") ||
    n.includes("arm circle") || n.includes("leg swing") || n.includes("inchworm") ||
    n.includes("wall slide") || n.includes("pull-apart") || n.includes("band pull") ||
    n.includes("shoulder cars") || n.includes("thoracic rotation") || n.includes("t-spine") ||
    n.includes("pogo hop") || n.includes("a-skip") || n.includes("b-skip") ||
    n.includes("snap-down") || n.includes("snap down") || n.includes("mobility flow") ||
    n.includes("dynamic prep") || n.includes("lateral band walk") || n.includes("monster walk") ||
    n.includes("push-up plus") || n.includes("dead hang") || n.includes("scapular pull") ||
    n.includes("cat-cow") || n.includes("bird dog") || n.includes("90-90") ||
    n.includes("hip flexor stretch") || n.includes("thoracic") || n.includes("pec stretch") ||
    (n.includes("glute bridge") && !n.includes("loaded") && !n.includes("barbell"))
  ) {
    return "mobility_flow";
  }

  // ── Specific Olympic / loaded power lifts ────────────────────────────────
  if (
    n.includes("power clean") || n.includes("hang clean") || n.includes("clean pull") ||
    n.includes("hang snatch") || n.includes("power snatch") || n.includes("high pull") ||
    n.includes("push press") || n.includes("push jerk") || n.includes("split jerk")
  ) {
    return "load_reps";
  }

  // ── Distance + reps — named horizontal jumps ─────────────────────────────
  if (n.includes("broad jump") || n.includes("long jump") || n.includes("bounding") || n.includes("bound")) {
    return "distance_reps";
  }

  // ── Height + reps — box / hurdle jumps ──────────────────────────────────
  if (
    n.includes("box jump") || n.includes("hurdle jump") || n.includes("hurdle hop") ||
    n.includes("depth jump") || n.includes("reactive box")
  ) {
    return "height_reps";
  }

  // ── Other jumps / hops — reps only ──────────────────────────────────────
  if (n.includes("jump") || n.includes("hop") || n.includes("plyometric") || n.includes("reactive")) {
    return "reps_only";
  }

  // ── Throws / med ball ────────────────────────────────────────────────────
  if (
    n.includes("med ball") || n.includes("medicine ball") || n.includes("slam") ||
    n.includes("rotational throw") || n.includes("chest pass") || n.includes("overhead throw") ||
    n.includes("scoop throw") || n.includes("shot put")
  ) {
    return "throws_reps";
  }

  // ── Timed holds / isometrics ─────────────────────────────────────────────
  if (
    n.includes("plank") || n.includes("isometric") || n.includes("wall sit") ||
    n.includes("l-sit") || n.includes("hollow hold") || n.includes("boat hold") ||
    n.includes("dead bug")
  ) {
    return "time_only";
  }

  // ── Carries — distance + time ────────────────────────────────────────────
  if (n.includes("carry") || n.includes("farmer") || n.includes("suitcase carry") || n.includes("yoke")) {
    return "distance_time";
  }

  // ── Sprints / runs ───────────────────────────────────────────────────────
  if (
    n.includes("sprint") || n.includes("10m") || n.includes("20m") || n.includes("30m") ||
    (n.includes("flying") && n.includes("run"))
  ) {
    return "distance_time";
  }

  // ── Bodyweight classics — no load ────────────────────────────────────────
  if (
    n.includes("pull-up") || n.includes("pullup") || n.includes("chin-up") || n.includes("chinup") ||
    n.includes("push-up") || n.includes("pushup") || n.includes("dip") ||
    (n.includes("bodyweight") && !n.includes("squat"))
  ) {
    return "reps_only";
  }

  // ── Category fallbacks ───────────────────────────────────────────────────
  if (category === "trunk") return "reps_only";
  if (category === "power") return "reps_only";
  if (category === "conditioning") return "time_only";

  // ── Default: loaded strength lift ────────────────────────────────────────
  return "load_reps";
}
