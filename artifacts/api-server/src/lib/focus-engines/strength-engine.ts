/**
 * Strength Focus Engine
 *
 * The reference implementation for focus mode engines.
 * Covers: lifting, hypertrophy, power-strength, and structural development.
 *
 * This is NOT a new system — it wraps and extends the existing strength
 * logic into the focus engine interface so the shell can route through it
 * consistently.
 */

import type {
  FocusEngineInterface,
  BlockArchetypeDescriptor,
  MovementFamilyDescriptor,
  SessionGrammarDescriptor,
  ContinuationRuleDescriptor,
  QuickCommandDescriptor,
  MemoryNamespaceDescriptor,
} from "./engine-interface";

// ─── Block Archetypes ─────────────────────────────────────────────────────────

const STRENGTH_BLOCK_ARCHETYPES: BlockArchetypeDescriptor[] = [
  {
    id: "FOUNDATION_ACCUMULATION",
    label: "Foundation & Accumulation",
    description: "Volume-driven base building. Higher rep ranges, moderate intensity, movement variety. Develops structural capacity before intensification.",
    phase: "establish",
    neuralDemand: "moderate",
    fatigueProfile: "high",
  },
  {
    id: "INTENSIFICATION_STRENGTH",
    label: "Intensification — Strength",
    description: "Heavy bilateral compound focus. 80–92% 1RM, low reps (2–5), extended rest. Pure force production emphasis.",
    phase: "intensify",
    neuralDemand: "high",
    fatigueProfile: "high",
  },
  {
    id: "POWER_ELASTIC_CONVERSION",
    label: "Power & Elastic Conversion",
    description: "Converts strength base into rate-of-force development. Contrast pairing, jump work, moderate-to-high intensity at intent velocity.",
    phase: "realize",
    neuralDemand: "high",
    fatigueProfile: "moderate",
  },
  {
    id: "REBUILD_DELOAD",
    label: "Rebuild / Deload",
    description: "Systemic recovery while maintaining movement patterns. Reduced volume (40–60%), submaximal intensity, emphasis on tissue quality.",
    phase: "deload",
    neuralDemand: "low",
    fatigueProfile: "low",
  },
];

// ─── Movement Families ────────────────────────────────────────────────────────

const STRENGTH_MOVEMENT_FAMILIES: MovementFamilyDescriptor[] = [
  {
    id: "bilateral_hinge",
    label: "Bilateral Hinge",
    examples: ["Deadlift", "Romanian Deadlift", "Trap Bar Deadlift", "Good Morning"],
    primaryAdaptation: "posterior chain strength, hip hinge patterning",
  },
  {
    id: "bilateral_squat",
    label: "Bilateral Squat",
    examples: ["Back Squat", "Front Squat", "Goblet Squat", "Leg Press"],
    primaryAdaptation: "quad-dominant lower body strength",
  },
  {
    id: "horizontal_push",
    label: "Horizontal Push",
    examples: ["Bench Press", "Dumbbell Press", "Push-Up Variations"],
    primaryAdaptation: "chest, anterior delt, tricep strength",
  },
  {
    id: "vertical_push",
    label: "Vertical Push",
    examples: ["Overhead Press", "Z-Press", "Landmine Press"],
    primaryAdaptation: "shoulder and overhead pressing strength",
  },
  {
    id: "horizontal_pull",
    label: "Horizontal Pull",
    examples: ["Barbell Row", "Cable Row", "Dumbbell Row", "Chest-Supported Row"],
    primaryAdaptation: "mid-back, rhomboids, rear delt strength",
  },
  {
    id: "vertical_pull",
    label: "Vertical Pull",
    examples: ["Pull-Up", "Lat Pulldown", "Chin-Up"],
    primaryAdaptation: "lat width, bicep, upper back",
  },
  {
    id: "unilateral_lower",
    label: "Unilateral Lower",
    examples: ["Bulgarian Split Squat", "Single-Leg Deadlift", "Reverse Lunge", "Step-Up"],
    primaryAdaptation: "single-leg stability, hip abductor integration",
  },
  {
    id: "carry_loaded",
    label: "Loaded Carries",
    examples: ["Farmer Carry", "Suitcase Carry", "Bottoms-Up Carry"],
    primaryAdaptation: "anti-lateral flexion, grip strength, full-body stiffness",
  },
];

// ─── Session Grammar ──────────────────────────────────────────────────────────

const STRENGTH_SESSION_GRAMMAR: SessionGrammarDescriptor = {
  primarySlotCount: 2,
  secondarySlotCount: 4,
  repRangeGuidance: "Primary: 2–6 reps (strength emphasis) or 6–12 reps (hypertrophy). Secondary: 8–15 reps for accessory volume.",
  restGuidance: "Primary compounds: 3–5 min. Secondary accessory: 60–90s. Supersets allowed for accessories.",
  intensityGuidance: "Primary lifts at 70–92% of 1RM. Accessories at RPE 7–8. Deload weeks at 50–60% reduced volume.",
  specialNotes: "Lead with bilateral compound movements. Structural balance (push/pull ratio). Reserve explosive/velocity work for Power archetypes.",
};

// ─── Continuation Rules ───────────────────────────────────────────────────────

const STRENGTH_CONTINUATION_RULES: ContinuationRuleDescriptor = {
  nextBlockOptions: [
    "FOUNDATION_ACCUMULATION → INTENSIFICATION_STRENGTH",
    "INTENSIFICATION_STRENGTH → POWER_ELASTIC_CONVERSION",
    "POWER_ELASTIC_CONVERSION → REBUILD_DELOAD",
    "REBUILD_DELOAD → FOUNDATION_ACCUMULATION (new cycle)",
  ],
  progressionDirection: "Volume → Intensity → Power → Deload → New cycle. Progressive overload: +5–10 lbs on primary lifts when sets complete at RPE ≤ 8.",
  deescalationTriggers: ["Pain reports > 5/10", "Readiness < 50 for 3+ sessions", "3+ consecutive incomplete sessions"],
  adaptationCues: ["Easy/solid sessions → add load", "Hard/failed sessions → hold load", "Fatigue trend → deload block"],
};

// ─── Quick Commands ───────────────────────────────────────────────────────────

const STRENGTH_QUICK_COMMANDS: QuickCommandDescriptor[] = [
  { label: "More explosive", intentMapping: "increase_power_emphasis", engineBias: "POWER_ELASTIC_CONVERSION" },
  { label: "Less volume", intentMapping: "reduce_volume", engineBias: "REBUILD_DELOAD" },
  { label: "Recovery focus", intentMapping: "shift_recovery", engineBias: "REBUILD_DELOAD" },
  { label: "More hypertrophy", intentMapping: "increase_hypertrophy_bias", engineBias: "FOUNDATION_ACCUMULATION" },
  { label: "More intense", intentMapping: "increase_intensity", engineBias: "INTENSIFICATION_STRENGTH" },
];

// ─── Memory Namespace ─────────────────────────────────────────────────────────

const STRENGTH_MEMORY_NAMESPACE: MemoryNamespaceDescriptor = {
  namespace: "strength",
  exampleKeys: ["explosive_emphasis", "volume_bias", "hypertrophy_preference", "compound_lift_priority", "strength_training_age"],
  sharedWithGlobal: false,
};

// ─── Prompt Context ───────────────────────────────────────────────────────────

function buildStrengthPromptContext(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  const emphasisHints: string[] = [];
  if (/explosive|power|jump|sprint|fast/.test(lower)) {
    emphasisHints.push("User message suggests power/explosive intent — bias toward POWER_ELASTIC_CONVERSION archetype and contrast work.");
  }
  if (/hypertrophy|muscle|size|bulk|aesthetics/.test(lower)) {
    emphasisHints.push("User message suggests hypertrophy intent — bias toward volume accumulation, 8–12 rep ranges, metabolic stress.");
  }
  if (/heavy|strength|strong|1rm|max/.test(lower)) {
    emphasisHints.push("User message suggests pure strength intent — bias toward INTENSIFICATION_STRENGTH, low reps, compound bilateral focus.");
  }

  return `
[FOCUS MODE: STRENGTH]
Active training focus: Strength — covering lifting, hypertrophy, power-strength, and structural development.

BLOCK ARCHETYPES available in this mode:
- Foundation & Accumulation: volume-driven base building, moderate intensity
- Intensification — Strength: heavy compound focus, 80–92% 1RM, low reps
- Power & Elastic Conversion: contrast pairs, RFD development, velocity work
- Rebuild / Deload: systemic recovery, 40–60% volume reduction

MOVEMENT GRAMMAR for this mode:
- Lead with bilateral compound movements (squat, hinge, press, row)
- Support with unilateral work and loaded carries
- Accessories address structural balance (push/pull ratio)
- Reserve elastic/reactive work for Power archetypes

SESSION STRUCTURE:
- 2 primary compound movements (2–6 or 6–12 reps by phase)
- 3–5 accessory movements (8–15 reps)
- Rest: 3–5 min for primaries, 60–90s for accessories

AGENT BEHAVIOR in Strength mode:
- Responses and examples bias toward lifting, load, volume, periodization, and hypertrophy/power-strength logic
- Coaching language references strength qualities: load, tension, mechanical stress, structural adaptation
- Avoid conditioning-first or mobility-first language unless explicitly requested
${emphasisHints.length > 0 ? "\nLIVE MESSAGE SIGNALS:\n" + emphasisHints.join("\n") : ""}
`.trim();
}

// ─── Adaptation Heuristics ────────────────────────────────────────────────────

function getStrengthAdaptationHeuristics(): string {
  return `
STRENGTH ENGINE — Adaptation Heuristics:
- If user logs "easy" or "solid" on primary lifts for 2+ sessions: increase difficulty — add reps, tighten tempo, or use a harder variation (progress resistance only when a logged baseline exists)
- If user reports "hard" or "failed": hold load, check form/recovery
- Volume response: if readiness trends <60 over 7 days, reduce volume 20–30%
- Block transition: move to next archetype after 3–4 weeks of successful sessions
- Power conversion: schedule after 2 blocks of accumulation/intensification
`.trim();
}

// ─── Engine Export ────────────────────────────────────────────────────────────

export const strengthEngine: FocusEngineInterface = {
  focusMode: "strength",
  label: "Strength",

  getBlockArchetypes: () => STRENGTH_BLOCK_ARCHETYPES,
  getMovementFamilies: () => STRENGTH_MOVEMENT_FAMILIES,
  getSessionGrammar: () => STRENGTH_SESSION_GRAMMAR,
  getContinuationRules: () => STRENGTH_CONTINUATION_RULES,
  getQuickCommandSemantics: () => STRENGTH_QUICK_COMMANDS,
  getMemoryNamespace: () => STRENGTH_MEMORY_NAMESPACE,

  buildPromptContext: buildStrengthPromptContext,
  getAdaptationHeuristics: getStrengthAdaptationHeuristics,
};
