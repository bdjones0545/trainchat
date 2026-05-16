// ─── Session Adaptation Fingerprint ──────────────────────────────────────────
//
// Converts goal/blockType/adaptation text into a weighted adaptation target map.
// This fingerprint is the "theme identity" of a program: it tells the exercise
// selection engine what the session is actually trying to accomplish at the
// tissue and adaptation level — not just the movement pattern level.
//
// Example: a Hamstring + Adductor Resilience session produces:
//   { hamstring_resilience: 0.35, adductor_resilience: 0.25, hip_strength: 0.25, injury_prevention: 0.15 }
//
// The fingerprint is consumed by:
//   1. themeCoherenceFit in scoreCandidate() — steers exercise selection
//   2. compositionConstraintPenalty — enforces session composition rules
//   3. post-selection CoherenceAudit — validates and logs the final session
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationDimension =
  | "hamstring_resilience"
  | "adductor_resilience"
  | "hip_strength"
  | "glute_development"
  | "injury_prevention"
  | "posterior_chain_strength"
  | "quad_dominant"
  | "bilateral_strength"
  | "unilateral_balance"
  | "trunk_stability"
  | "rotational_power"
  | "elastic_reactivity"
  | "eccentric_loading"
  | "isometric_loading"
  | "frontal_plane"
  | "upper_push_strength"
  | "upper_pull_strength"
  | "shoulder_health"
  | "deceleration"
  | "general_conditioning";

export type SessionAdaptationFingerprint = Partial<Record<AdaptationDimension, number>>;

// ─── Keyword → dimension mappings ─────────────────────────────────────────────
// Each entry fires when any of its keywords appears in the combined context
// string (goal + primaryAdaptation + secondaryAdaptation + sport). The weight
// is additive and then normalized to a [0, 1] per-dimension scale.

interface KeywordEntry {
  keywords: string[];
  dimension: AdaptationDimension;
  weight: number;
}

const KEYWORD_MAP: KeywordEntry[] = [
  // ── Hamstring ──────────────────────────────────────────────────────────────
  { keywords: ["hamstring resilience", "hamstring tendon", "nordic", "glute-ham"], dimension: "hamstring_resilience", weight: 0.40 },
  { keywords: ["hamstring", "posterior chain eccentric"], dimension: "hamstring_resilience", weight: 0.28 },

  // ── Adductor / groin ──────────────────────────────────────────────────────
  { keywords: ["adductor resilience", "groin resilience", "groin health"], dimension: "adductor_resilience", weight: 0.38 },
  { keywords: ["adductor", "groin", "copenhagen", "frontal plane"], dimension: "adductor_resilience", weight: 0.26 },

  // ── Hip strength ──────────────────────────────────────────────────────────
  { keywords: ["hip strength", "hip dominant", "hip extension force"], dimension: "hip_strength", weight: 0.30 },
  { keywords: ["hip"], dimension: "hip_strength", weight: 0.15 },

  // ── Glute development ─────────────────────────────────────────────────────
  { keywords: ["glute development", "glute strength", "glute hypertrophy"], dimension: "glute_development", weight: 0.35 },
  { keywords: ["glute"], dimension: "glute_development", weight: 0.20 },

  // ── Injury prevention ─────────────────────────────────────────────────────
  { keywords: ["injury prevention", "prehab", "tissue quality", "tendon health", "structural resilience"], dimension: "injury_prevention", weight: 0.30 },
  { keywords: ["resilience", "injury", "tendon", "prehabilitation"], dimension: "injury_prevention", weight: 0.18 },

  // ── Posterior chain ───────────────────────────────────────────────────────
  { keywords: ["posterior chain strength", "hinge dominant", "deadlift strength"], dimension: "posterior_chain_strength", weight: 0.30 },
  { keywords: ["posterior chain", "hinge"], dimension: "posterior_chain_strength", weight: 0.18 },

  // ── Quad dominant ─────────────────────────────────────────────────────────
  { keywords: ["quad dominant", "squat dominant", "knee dominant", "quad strength", "patellar"], dimension: "quad_dominant", weight: 0.30 },
  { keywords: ["quad", "squat"], dimension: "quad_dominant", weight: 0.16 },

  // ── Bilateral strength ────────────────────────────────────────────────────
  { keywords: ["bilateral strength", "absolute strength", "maximal strength", "heavy compound", "neuromuscular efficiency"], dimension: "bilateral_strength", weight: 0.35 },
  { keywords: ["compound strength", "strength accumulation"], dimension: "bilateral_strength", weight: 0.22 },

  // ── Unilateral balance ────────────────────────────────────────────────────
  { keywords: ["unilateral balance", "single-leg balance", "asymmetry correction", "single leg balance"], dimension: "unilateral_balance", weight: 0.30 },
  { keywords: ["unilateral", "single-leg", "single leg", "asymmetry"], dimension: "unilateral_balance", weight: 0.20 },

  // ── Trunk stability ───────────────────────────────────────────────────────
  { keywords: ["trunk stability", "core stability", "anti-rotation", "anti-extension", "bracing"], dimension: "trunk_stability", weight: 0.28 },
  { keywords: ["trunk", "core"], dimension: "trunk_stability", weight: 0.15 },

  // ── Rotational power ──────────────────────────────────────────────────────
  { keywords: ["rotational power", "rotation power", "med ball throw", "rotational force"], dimension: "rotational_power", weight: 0.35 },
  { keywords: ["rotational", "rotation", "throw"], dimension: "rotational_power", weight: 0.20 },

  // ── Elastic / reactive ────────────────────────────────────────────────────
  { keywords: ["rate of force development", "elastic stiffness", "stretch-shortening", "plyometric"], dimension: "elastic_reactivity", weight: 0.35 },
  { keywords: ["elastic", "reactive", "power conversion", "explosive output"], dimension: "elastic_reactivity", weight: 0.22 },

  // ── Eccentric loading ─────────────────────────────────────────────────────
  { keywords: ["eccentric", "slow eccentric", "yield strength", "eccentric loading", "tempo"], dimension: "eccentric_loading", weight: 0.32 },

  // ── Isometric loading ─────────────────────────────────────────────────────
  { keywords: ["isometric", "positional holds", "isometric strength", "static holds"], dimension: "isometric_loading", weight: 0.30 },

  // ── Frontal plane ─────────────────────────────────────────────────────────
  { keywords: ["frontal plane", "lateral stability", "abduction", "adduction", "side-to-side", "mediolateral"], dimension: "frontal_plane", weight: 0.28 },
  { keywords: ["lateral", "frontal"], dimension: "frontal_plane", weight: 0.14 },

  // ── Upper push ────────────────────────────────────────────────────────────
  { keywords: ["upper push strength", "pressing strength", "horizontal push", "vertical push", "bench press", "overhead press"], dimension: "upper_push_strength", weight: 0.35 },
  { keywords: ["push", "pressing"], dimension: "upper_push_strength", weight: 0.18 },

  // ── Upper pull ────────────────────────────────────────────────────────────
  { keywords: ["upper pull strength", "pulling strength", "back strength", "row strength", "chin-up", "pull-up"], dimension: "upper_pull_strength", weight: 0.35 },
  { keywords: ["pull", "row"], dimension: "upper_pull_strength", weight: 0.18 },

  // ── Shoulder health ───────────────────────────────────────────────────────
  { keywords: ["shoulder health", "shoulder stability", "rotator cuff", "scapular", "shoulder structural"], dimension: "shoulder_health", weight: 0.30 },

  // ── Deceleration ──────────────────────────────────────────────────────────
  { keywords: ["deceleration", "landing mechanics", "acl", "decel", "shock absorption"], dimension: "deceleration", weight: 0.32 },

  // ── General conditioning ──────────────────────────────────────────────────
  { keywords: ["work capacity", "conditioning", "aerobic base", "lactate threshold", "anaerobic capacity"], dimension: "general_conditioning", weight: 0.35 },
  { keywords: ["endurance", "aerobic", "conditioning"], dimension: "general_conditioning", weight: 0.20 },
];

// ─── Block type → baseline fingerprint ────────────────────────────────────────
// When no specific goal keywords match, the block type provides a structural
// baseline that captures the program's broad adaptation intent.

const BLOCK_TYPE_FINGERPRINTS: Record<string, SessionAdaptationFingerprint> = {
  re_entry_resilience: {
    injury_prevention: 0.30,
    hamstring_resilience: 0.20,
    unilateral_balance: 0.20,
    eccentric_loading: 0.15,
    trunk_stability: 0.15,
  },
  resilience_block: {
    injury_prevention: 0.35,
    hamstring_resilience: 0.25,
    adductor_resilience: 0.20,
    eccentric_loading: 0.12,
    trunk_stability: 0.08,
  },
  control_block: {
    trunk_stability: 0.35,
    injury_prevention: 0.30,
    eccentric_loading: 0.20,
    unilateral_balance: 0.15,
  },
  re_entry_block: {
    injury_prevention: 0.30,
    eccentric_loading: 0.25,
    isometric_loading: 0.25,
    unilateral_balance: 0.20,
  },
  low_impact_strength: {
    injury_prevention: 0.25,
    unilateral_balance: 0.25,
    bilateral_strength: 0.25,
    eccentric_loading: 0.15,
    trunk_stability: 0.10,
  },
  power_conversion: {
    elastic_reactivity: 0.45,
    bilateral_strength: 0.25,
    hip_strength: 0.18,
    glute_development: 0.12,
  },
  intensification: {
    bilateral_strength: 0.40,
    posterior_chain_strength: 0.30,
    quad_dominant: 0.20,
    hip_strength: 0.10,
  },
  strength_emphasis: {
    bilateral_strength: 0.35,
    posterior_chain_strength: 0.30,
    quad_dominant: 0.25,
    hip_strength: 0.10,
  },
  accumulation: {
    bilateral_strength: 0.25,
    posterior_chain_strength: 0.25,
    unilateral_balance: 0.25,
    trunk_stability: 0.25,
  },
  hypertrophy_support: {
    glute_development: 0.30,
    unilateral_balance: 0.30,
    bilateral_strength: 0.20,
    posterior_chain_strength: 0.20,
  },
  work_capacity: {
    general_conditioning: 0.40,
    bilateral_strength: 0.25,
    trunk_stability: 0.20,
    unilateral_balance: 0.15,
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a session adaptation fingerprint from all available context signals.
 *
 * Combines block-type baseline with keyword matches from:
 *   - goal string
 *   - monthlyPlan primaryAdaptation + secondaryAdaptation text
 *   - sport context
 *
 * Returns null when no meaningful theme signals are detected (no steering applied).
 */
export function parseSessionFingerprint(
  goal: string | null,
  blockType: string,
  primaryAdaptation: string,
  secondaryAdaptation: string,
  sport: string | null,
): SessionAdaptationFingerprint | null {
  const raw: Record<string, number> = {};

  const blockBase = BLOCK_TYPE_FINGERPRINTS[blockType];
  if (blockBase) {
    for (const [dim, w] of Object.entries(blockBase)) {
      raw[dim] = (raw[dim] ?? 0) + (w as number);
    }
  }

  const combined = [
    (goal ?? "").toLowerCase(),
    primaryAdaptation.toLowerCase(),
    secondaryAdaptation.toLowerCase(),
    (sport ?? "").toLowerCase(),
  ].join(" ");

  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (combined.includes(kw)) {
        raw[entry.dimension] = Math.min(1.5, (raw[entry.dimension] ?? 0) + entry.weight);
        break;
      }
    }
  }

  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const fp: SessionAdaptationFingerprint = {};
  for (const [dim, w] of Object.entries(raw)) {
    fp[dim as AdaptationDimension] = w / total;
  }
  return fp;
}

/**
 * True when the fingerprint is "resilience-focused" — enough injury-prevention
 * / eccentric / adductor / hamstring weight that composition rules should fire.
 * Threshold: combined resilience dimensions > 35% of the total fingerprint weight.
 */
export function isResilienceFocused(fp: SessionAdaptationFingerprint): boolean {
  const resScore =
    (fp.hamstring_resilience ?? 0) +
    (fp.adductor_resilience ?? 0) +
    (fp.injury_prevention ?? 0) +
    (fp.eccentric_loading ?? 0) +
    (fp.isometric_loading ?? 0);
  return resScore > 0.35;
}

/** Returns the single highest-weighted adaptation dimension name. */
export function getDominantTheme(fp: SessionAdaptationFingerprint): string {
  const sorted = (Object.entries(fp) as [string, number][]).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] ?? "none";
}
