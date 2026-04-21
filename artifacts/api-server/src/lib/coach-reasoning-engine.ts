/**
 * Coach Reasoning Engine — Deterministic, Zero-Cost
 *
 * Generates a short, sharp 1-2 sentence coaching insight after builds,
 * edits, and check-in adaptations. Purely template-driven — no AI call,
 * no added latency, no JSON contract interference.
 *
 * Output is meant to explain *why* a decision was made, not what happened.
 * Tone: sharp coach. Not a therapist, not a motivational speaker.
 */

import { logger } from "./logger";

export type FocusMode = "strength" | "speed" | "mobility";
export type ActionType = "build" | "edit" | "checkin";

export interface CoachReasoningContext {
  focusMode: FocusMode;
  actionType: ActionType;
  intent?: string;
  scope?: string;
  adaptationMode?: string;
  goal?: string;
  frequency?: number;
  changesApplied?: number;
}

// ─── Build templates ──────────────────────────────────────────────────────────
// Indexed by focus mode. Multiple entries for variety — seeded deterministically.

const BUILD_TEMPLATES: Record<FocusMode, string[]> = {
  strength: [
    "Built around force production and structural balance, with session sequencing designed to keep output quality high under accumulating load.",
    "Structured to drive compound strength — volume is distributed to maximize work on primary patterns before fatigue compounds.",
    "Progressive loading scheme sequenced to build raw strength capacity, with sessions ordered to manage fatigue between primary movements.",
    "Designed around neural demand and structural loading, with each session sequenced to earn progression by managing the dose of stress.",
  ],
  speed: [
    "Built to develop reactive output and mechanical precision — sessions are ordered to keep movement quality high before fatigue accumulates.",
    "Sequenced for acceleration and projection mechanics, with rest-to-work ratios calibrated to preserve explosive output across the week.",
    "Designed around movement efficiency and reactive demand, with fatigue managed so speed qualities can express fully each session.",
    "Built around sharp mechanics and force projection — session order protects neuromuscular freshness so quality stays high.",
  ],
  mobility: [
    "Built around positional ownership and range restoration — session order prioritizes decompression before loading end positions.",
    "Structured to develop active end-range control and movement quality, with sessions designed to avoid compressive loading on fatigued tissues.",
    "Progression sequenced to earn range before loading it — decompression first, active control second, positional demand third.",
    "Built to restore and own range through controlled exposure — each session builds on the last without forcing end positions before they're ready.",
  ],
};

// ─── Edit templates ───────────────────────────────────────────────────────────
// Indexed by focus mode → intent key.

const EDIT_TEMPLATES: Record<FocusMode, Record<string, string>> = {
  strength: {
    swap_exercise:
      "I shifted to a movement that keeps the loading stimulus intact while addressing the mechanical constraint.",
    replace_exercise:
      "I shifted to a movement that keeps the loading stimulus intact while addressing the mechanical constraint.",
    load_reduction:
      "I pulled back loading slightly to protect output quality — fatigue management now, more capacity later.",
    volume_increase:
      "Added training volume to the primary patterns — structural stress is what drives the adaptation.",
    harder:
      "Increased the demand across the primary patterns — progressive overload is the mechanism here.",
    easier:
      "I reduced the intensity slightly to preserve movement quality and protect against unnecessary fatigue.",
    rest_reduction:
      "Shorter rest intervals increase metabolic demand while keeping the structural loading intact.",
    rest_increase:
      "More rest between sets protects neuromuscular output — quality of work matters more than density here.",
    sets_reps:
      "Adjusted the prescription to match the intended strength stimulus more precisely.",
    pain_modification:
      "Loading is conservative this session — smart movement under constraint protects long-term structural capacity.",
    recovery_deload:
      "Pulled back loading this week to protect against overreaching — training quality matters more than hitting the numbers.",
    progression:
      "Conditions are right to push primary lifts — all signals point toward structural adaptation today.",
    default:
      "This now emphasizes structural loading and movement quality on the primary patterns.",
  },
  speed: {
    swap_exercise:
      "I shifted to a movement that better develops reactive mechanics and projection without adding unnecessary fatigue.",
    replace_exercise:
      "I shifted to a movement that better develops reactive mechanics and projection without adding unnecessary fatigue.",
    load_reduction:
      "I pulled back the load so the session can develop movement quality — speed is about mechanics, not mass.",
    volume_increase:
      "Added reactive work volume — more exposure to the movement patterns that drive speed development.",
    harder:
      "Increased reactive demand — higher-quality output on explosive patterns drives the adaptation.",
    easier:
      "I reduced the volume slightly to protect movement quality and keep output sharp.",
    rest_reduction:
      "Less recovery between sets keeps the neurological system engaged — reactive quality under mild fatigue.",
    rest_increase:
      "More rest protects the quality of each explosive rep — speed work lives and dies on freshness.",
    sets_reps:
      "Adjusted the prescription to better match the reactive demand of this training phase.",
    pain_modification:
      "I've pulled back the reactive demand to respect the pain signal — acute discomfort is a boundary worth respecting.",
    recovery_deload:
      "I reduced the reactive demand this week so your system can reset — output quality will return when recovery does.",
    progression:
      "All signals are green — this is the kind of session where reactive output can set a new ceiling.",
    default:
      "This now emphasizes projection mechanics and output quality across the reactive patterns.",
  },
  mobility: {
    swap_exercise:
      "I shifted to a movement that earns the same range with better positional control.",
    replace_exercise:
      "I shifted to a movement that earns the same range with better positional control.",
    load_reduction:
      "I reduced positional demand so you can restore range without forcing end positions.",
    volume_increase:
      "Added range exposure — more controlled time in the positions that build active ownership.",
    harder:
      "Increased positional demand — the range is there, now the goal is to own it actively.",
    easier:
      "I reduced the positional load slightly to keep quality high and avoid forcing range.",
    rest_reduction:
      "Shorter rest keeps tissue warm and responsive — range work responds well to sustained exposure.",
    rest_increase:
      "More rest between sets allows the nervous system to reset and approach each position cleanly.",
    sets_reps:
      "Adjusted the volume to better match the tissue tolerance and recovery demands of mobility work.",
    pain_modification:
      "Modified the positional demands to avoid loading tissue that's signaling discomfort — range without pain is the goal.",
    recovery_deload:
      "I shifted toward decompression and restoration this session — range work under accumulated fatigue compounds poorly.",
    progression:
      "Your readiness is excellent — this is the day to explore your end range actively and build ownership.",
    default:
      "This now emphasizes active control and positional quality across the range you're building.",
  },
};

// ─── Check-in templates ───────────────────────────────────────────────────────

const CHECKIN_TEMPLATES: Record<string, Record<FocusMode, string>> = {
  RECOVERY_DELOAD: {
    strength:
      "Pulled back the loading this week to protect against overreaching — training quality matters more than hitting the numbers.",
    speed:
      "I reduced the reactive demand this week so your system can reset — output quality will return when recovery does.",
    mobility:
      "I shifted toward decompression and restoration — range work under accumulated fatigue compounds poorly.",
  },
  LIGHT_MODIFICATION: {
    strength:
      "Reduced accessory volume slightly so you can maintain output on the primary patterns without compounding fatigue.",
    speed:
      "I trimmed the volume so you can keep movement quality high — a slightly shorter session beats a degraded one.",
    mobility:
      "Reduced positional demand slightly — quality of range work matters more than completing everything as written.",
  },
  PAIN_MODIFICATION: {
    strength:
      "Loading is conservative this session — smart movement under constraint protects long-term structural capacity.",
    speed:
      "I've pulled back the reactive demand to respect the pain signal — acute discomfort is a boundary worth respecting.",
    mobility:
      "Modified the positional demands to avoid loading tissue that's signaling discomfort — range without pain is the goal.",
  },
  GREEN_LIGHT_PROGRESSION: {
    strength:
      "Conditions are right to push your primary lifts — your body is primed for structural adaptation today.",
    speed:
      "All signals are green — this is the kind of session where reactive output can set a new ceiling.",
    mobility:
      "Your readiness is excellent — this is the day to explore your end range actively and build ownership.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickTemplate(arr: string[], seed: number): string {
  return arr[Math.abs(seed) % arr.length];
}

function inferIntentKey(intent?: string): string {
  if (!intent) return "default";
  const i = intent.toLowerCase();
  if (i.includes("swap") || i.includes("replace")) return "swap_exercise";
  if (i.includes("load") && (i.includes("reduc") || i.includes("cut") || i.includes("drop"))) return "load_reduction";
  if (i.includes("pain") || i.includes("pain_modif")) return "pain_modification";
  if (i.includes("recover") || i.includes("deload")) return "recovery_deload";
  if (i.includes("progress") && !i.includes("reduc")) return "progression";
  if (i.includes("green_light") || i.includes("green light")) return "progression";
  if (i.includes("harder") || i.includes("increase") || i.includes("progress")) return "harder";
  if (i.includes("easier") || i.includes("reduc") || i.includes("light")) return "easier";
  if (i.includes("rest") && i.includes("less")) return "rest_reduction";
  if (i.includes("rest") && i.includes("more")) return "rest_increase";
  if (i.includes("volume") && i.includes("increas")) return "volume_increase";
  if (i.includes("set") || i.includes("rep")) return "sets_reps";
  return "default";
}

function normalizeFocusMode(raw?: string | null): FocusMode {
  if (raw === "speed" || raw === "mobility") return raw;
  return "strength";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateCoachReasoning(context: CoachReasoningContext): string | null {
  try {
    const fm = normalizeFocusMode(context.focusMode);
    const { actionType, intent, adaptationMode, goal, frequency } = context;

    let reasoning: string | null = null;

    if (actionType === "build") {
      const templates = BUILD_TEMPLATES[fm];
      const seed = (goal?.charCodeAt(0) ?? 0) + (frequency ?? 3);
      reasoning = pickTemplate(templates, seed);
    } else if (actionType === "edit") {
      const intentKey = inferIntentKey(intent);
      const templates = EDIT_TEMPLATES[fm];
      reasoning = templates[intentKey] ?? templates["default"];
    } else if (actionType === "checkin") {
      if (!adaptationMode || adaptationMode === "TRAIN_AS_PLANNED") return null;
      const modeTemplates = CHECKIN_TEMPLATES[adaptationMode];
      reasoning = modeTemplates?.[fm] ?? null;
    }

    logger.info(
      {
        "[CoachReasoningAudit]": true,
        focusMode: fm,
        actionType,
        intent: intent ?? null,
        adaptationMode: adaptationMode ?? null,
        reasoningGenerated: !!reasoning,
        reasoningText: reasoning,
        sourceSignals: { goal, frequency, adaptationMode },
      },
      "[CoachReasoningAudit]"
    );

    return reasoning;
  } catch {
    return null;
  }
}

/** Maps primaryGoal (from extractedConstraints) to a FocusMode */
export function goalToFocusMode(primaryGoal?: string | null): FocusMode {
  if (!primaryGoal) return "strength";
  const g = primaryGoal.toLowerCase();
  if (g === "strength" || g === "hypertrophy") return "strength";
  if (g === "athletic_performance" || g === "speed") return "speed";
  if (g === "mobility" || g === "flexibility" || g === "recovery") return "mobility";
  return "strength";
}
