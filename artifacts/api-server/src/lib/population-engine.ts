/**
 * TrainChat Population Engine
 *
 * Detects which of 6 user populations applies to the current request and exposes
 * a profile that downstream engines (program builders, validators, prompt assembler)
 * use to adjust exercise selection, volume, intensity, and complexity.
 *
 * DESIGN RULES:
 * - Population MODIFIES programs — it NEVER replaces mode logic.
 * - Special considerations OVERRIDE population (medical > population).
 * - Detection is fully deterministic (no AI classification).
 * - Default is GENERAL_ADULT when no signal matches.
 * - Token expansion: population prompt injection is capped at 3–5 lines.
 */

import { logger } from "./logger";
import type { ExtractedConstraints } from "./intent";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PopulationType =
  | "ACTIVE_OLDER_ADULT"
  | "BEGINNER"
  | "GENERAL_ADULT"
  | "ATHLETIC"
  | "JOINT_SENSITIVE"
  | "DETRAINED";

export interface PopulationContext {
  type: PopulationType;
  confidence: number;
  signals: string[];
}

export interface PopulationProfile {
  exerciseBias: string[];
  volumeTarget: [number, number];
  intensityCap?: string;
  fatigueTolerance: "low" | "low-moderate" | "moderate" | "high";
  complexity: "low" | "low-moderate" | "moderate" | "high";
  progressionRate: "slow" | "moderate" | "fast";
  notes: string[];
}

// ─── Population Profiles ──────────────────────────────────────────────────────

export const POPULATION_PROFILES: Record<PopulationType, PopulationProfile> = {
  ACTIVE_OLDER_ADULT: {
    exerciseBias: ["joint-friendly compound", "unilateral", "machine-supported"],
    volumeTarget: [5, 6],
    intensityCap: "RPE 6-7",
    fatigueTolerance: "moderate",
    complexity: "moderate",
    progressionRate: "slow",
    notes: [
      "preserve full movement balance (push/pull/hinge/squat/unilateral/trunk)",
      "no explosive work, no max effort",
      "joint-friendly selections (goblet squat, trap bar, cable row, step-up)",
    ],
  },

  BEGINNER: {
    exerciseBias: ["goblet squat", "hinge", "push", "pull", "bodyweight"],
    volumeTarget: [4, 5],
    fatigueTolerance: "low",
    complexity: "low",
    progressionRate: "slow",
    notes: [
      "prioritize technique over load",
      "avoid overload complexity — no Olympic lifts or plyometrics",
    ],
  },

  GENERAL_ADULT: {
    exerciseBias: ["balanced compound + accessory"],
    volumeTarget: [5, 7],
    fatigueTolerance: "moderate",
    complexity: "moderate",
    progressionRate: "moderate",
    notes: [],
  },

  ATHLETIC: {
    exerciseBias: ["compound", "power", "unilateral", "elastic"],
    volumeTarget: [6, 8],
    fatigueTolerance: "high",
    complexity: "high",
    progressionRate: "fast",
    notes: [
      "allow power/speed integration",
      "higher neural demand allowed",
    ],
  },

  JOINT_SENSITIVE: {
    exerciseBias: ["trap bar", "dumbbells", "cables", "machine"],
    volumeTarget: [4, 6],
    fatigueTolerance: "moderate",
    complexity: "moderate",
    progressionRate: "slow",
    notes: [
      "avoid aggravating positions",
      "maintain training effect without pain provocation",
    ],
  },

  DETRAINED: {
    exerciseBias: ["general compound patterns", "moderate simplicity"],
    volumeTarget: [4, 5],
    fatigueTolerance: "low-moderate",
    complexity: "low-moderate",
    progressionRate: "slow",
    notes: [
      "rebuild tolerance",
      "avoid early fatigue spikes",
    ],
  },
};

// ─── Detection Patterns ───────────────────────────────────────────────────────

// Frailty / fall risk / neurological — exclude ACTIVE_OLDER_ADULT when present
const FRAILTY_EXCLUDE_PATTERNS = [
  /\b(frail|very\s+weak|can[''']?t\s+stand\s+long|need\s+a?\s*walker|wheelchair|bed.?rest)\b/i,
  /\b(fall\s+risk|afraid\s+of\s+falling|has\s+fallen\s+recently|balance\s+disorder)\b/i,
  /\b(parkinson|multiple\s+sclerosis|ms\b|post.?stroke|had\s+a\s+stroke|neurological\s+(condition|disorder))\b/i,
];

// Active older adult — must be CURRENT STATE signals only, NOT aspirational goals
const ACTIVE_OLDER_ADULT_PATTERNS = [
  /\b(i[''']?m\s+active|i\s+am\s+active|currently\s+active|still\s+active|stay\s+active)\b/i,
  /\b(i\s+train|i[''']?m\s+training|i\s+(work\s+out|workout)\s+regularly|i\s+go\s+to\s+the\s+gym)\b/i,
  /\b(still\s+(lifting|training|working\s+out|active)|still\s+hit\s+the\s+gym)\b/i,
  /\b(i\s+(play|do|practice)\s+(golf|tennis|pickleball|swimming|cycling|yoga|hiking|running|softball|volleyball|pickle\s*ball))\b/i,
  /\b(been\s+(lifting|training|working\s+out)\s+for\s+\d)/i,
  /\b(active\s+lifestyle|physically\s+active|keep\s+(me|myself)\s+fit)\b/i,
  /\b(i\s+lift\s+(weights)?|i\s+do\s+weights|i\s+use\s+the\s+gym|i\s+hit\s+the\s+gym)\b/i,
];

const BEGINNER_PATTERNS = [
  /\b(new\s+to\s+(training|the\s+gym|lifting|working\s+out)|never\s+(trained|lifted|worked\s+out))\b/i,
  /\b(just\s+start(ing)?|complete\s+beginner|total\s+beginner|i[''']?m\s+a\s+beginner)\b/i,
  /\b(don[''']?t\s+know\s+where\s+to\s+start|no\s+experience\s+(with\s+)?(training|lifting|the\s+gym))\b/i,
];

const DETRAINED_PATTERNS = [
  /\b(getting\s+back\s+into|haven[''']?t\s+trained\s+in|returning\s+to\s+(the\s+gym|training|lifting|working\s+out))\b/i,
  /\b(been\s+out\s+for\s+\d|took\s+a\s+(long\s+)break|long\s+break\s+from|time\s+off\s+from|away\s+from\s+the\s+gym)\b/i,
  /\b(out\s+of\s+shape\s+and\s+(want|trying|looking)\s+to\s+(get\s+back|start))\b/i,
];

const ATHLETIC_PATTERNS = [
  /\b(athlete|competitive\s+athlete|sport\s+performance|sport-specific)\b/i,
  /\b(i\s+play\s+(football|basketball|soccer|baseball|volleyball|wrestling|hockey|lacrosse|rugby|tennis|track))\b/i,
  /\b(training\s+for\s+(a\s+)?(sport|season|competition|race|event|combine|draft|tournament))\b/i,
  /\b(in.?season|pre.?season|off.?season\s+training|athlete\s+performance)\b/i,
];

const JOINT_SENSITIVE_PATTERNS = [
  /\b(bad\s+knee|knee\s+pain|knee\s+issues?|knee\s+problems?|knees?\s+hurt)\b/i,
  /\b(back\s+pain|bad\s+back|lower\s+back\s+(pain|issues?))\b/i,
  /\b(shoulder\s+(pain|issues?|problems?)|bad\s+shoulder|rotator\s+cuff)\b/i,
  /\b(joint\s+pain|achy\s+joints?|arthritis|arthritic|joint\s+issues?)\b/i,
  /\b(hip\s+pain|hip\s+issues?|bad\s+hip|hip\s+replacement)\b/i,
  /\b(wrist\s+pain|elbow\s+pain|ankle\s+pain)\b/i,
];

// Severe medical patterns — if present, JOINT_SENSITIVE is NOT applied (falls to spec-considerations engine)
const SEVERE_MEDICAL_PATTERNS = [
  /\b(cancer|chemotherapy|dialysis|heart\s+(failure|attack|condition|disease)|pacemaker|defibrillator)\b/i,
  /\b(seizure|epilepsy|parkinson|multiple\s+sclerosis|stroke\s+history|neurological\s+(disorder|condition))\b/i,
  /\b(osteoporosis|bone\s+density|fracture\s+risk|uncontrolled\s+(diabetes|hypertension))\b/i,
];

// ─── Older Adult Detector ─────────────────────────────────────────────────────

function isOlderAdultByText(lower: string): boolean {
  if (/\b(senior|older\s+adult|in\s+my\s+(60|70|80)s)\b/i.test(lower)) return true;
  // Age patterns: "I'm 62", "I am 71", "65 year old", "65-year-old"
  const ageMatch = lower.match(/\b(?:i[''']?m|i\s+am|i'm|age|aged?)\s+(\d{2})\b/) ??
                   lower.match(/\b(\d{2})[-\s]?year[-\s]?old\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 60) return true;
  }
  return false;
}

// ─── Core Detector ────────────────────────────────────────────────────────────

export function detectPopulation(
  message: string,
  constraints: ExtractedConstraints | null,
): PopulationContext {
  const lower = message.toLowerCase();
  const age = constraints?.userAge ?? null;
  const hasSevereMedical = SEVERE_MEDICAL_PATTERNS.some((p) => p.test(lower));
  const hasFrailty = FRAILTY_EXCLUDE_PATTERNS.some((p) => p.test(lower));

  // ── 1. ACTIVE_OLDER_ADULT ─────────────────────────────────────────────────
  // Requires: age ≥ 60 (by number or text) + activity signal + no frailty or medical block
  if (!hasFrailty && !hasSevereMedical) {
    const olderByAge = age !== null && age >= 60;
    const olderByText = isOlderAdultByText(lower);
    if (olderByAge || olderByText) {
      const activeSignals = ACTIVE_OLDER_ADULT_PATTERNS
        .filter((p) => p.test(lower))
        .map((p) => p.source.slice(0, 40));
      if (activeSignals.length > 0) {
        logger.info(
          { type: "ACTIVE_OLDER_ADULT", confidence: 0.9, signals: activeSignals, age },
          "[PopulationEngine] ACTIVE_OLDER_ADULT detected"
        );
        return { type: "ACTIVE_OLDER_ADULT", confidence: 0.9, signals: activeSignals };
      }
    }
  }

  // ── 2. BEGINNER ───────────────────────────────────────────────────────────
  const beginnerSignals = BEGINNER_PATTERNS.filter((p) => p.test(lower)).map((p) => p.source.slice(0, 40));
  if (beginnerSignals.length > 0) {
    logger.info({ type: "BEGINNER", confidence: 0.85, signals: beginnerSignals }, "[PopulationEngine] BEGINNER detected");
    return { type: "BEGINNER", confidence: 0.85, signals: beginnerSignals };
  }

  // ── 3. DETRAINED ──────────────────────────────────────────────────────────
  const detrainedSignals = DETRAINED_PATTERNS.filter((p) => p.test(lower)).map((p) => p.source.slice(0, 40));
  if (detrainedSignals.length > 0) {
    logger.info({ type: "DETRAINED", confidence: 0.8, signals: detrainedSignals }, "[PopulationEngine] DETRAINED detected");
    return { type: "DETRAINED", confidence: 0.8, signals: detrainedSignals };
  }

  // ── 4. ATHLETIC ───────────────────────────────────────────────────────────
  const athleticSignals = ATHLETIC_PATTERNS.filter((p) => p.test(lower)).map((p) => p.source.slice(0, 40));
  if (athleticSignals.length > 0) {
    logger.info({ type: "ATHLETIC", confidence: 0.8, signals: athleticSignals }, "[PopulationEngine] ATHLETIC detected");
    return { type: "ATHLETIC", confidence: 0.8, signals: athleticSignals };
  }

  // ── 5. JOINT_SENSITIVE (only if no severe medical override) ───────────────
  if (!hasSevereMedical) {
    const jointSignals = JOINT_SENSITIVE_PATTERNS.filter((p) => p.test(lower)).map((p) => p.source.slice(0, 40));
    if (jointSignals.length > 0) {
      logger.info({ type: "JOINT_SENSITIVE", confidence: 0.75, signals: jointSignals }, "[PopulationEngine] JOINT_SENSITIVE detected");
      return { type: "JOINT_SENSITIVE", confidence: 0.75, signals: jointSignals };
    }
  }

  // ── 6. GENERAL_ADULT (default) ────────────────────────────────────────────
  logger.info({ type: "GENERAL_ADULT", confidence: 1.0 }, "[PopulationEngine] GENERAL_ADULT (default)");
  return { type: "GENERAL_ADULT", confidence: 1.0, signals: [] };
}

// ─── Prompt Section Builder ───────────────────────────────────────────────────
// Compact: 3–5 lines maximum. GENERAL_ADULT returns empty string (no injection).

export function buildPopulationPromptSection(ctx: PopulationContext): string {
  if (ctx.type === "GENERAL_ADULT") return "";

  const profile = POPULATION_PROFILES[ctx.type];
  const volStr = `${profile.volumeTarget[0]}–${profile.volumeTarget[1]} exercises`;
  const intStr = profile.intensityCap ? ` | intensity cap: ${profile.intensityCap}` : "";

  const lines: string[] = [
    `\n## POPULATION_CONTEXT`,
    `type: ${ctx.type} | confidence: ${ctx.confidence}`,
    `volume: ${volStr}${intStr} | complexity: ${profile.complexity} | progression: ${profile.progressionRate}`,
  ];
  if (profile.notes.length > 0) {
    lines.push(`constraints: ${profile.notes.join("; ")}`);
  }
  lines.push(`This MUST shape exercise selection, volume, and intensity. Special considerations (if active) take priority over this population context.`);

  return lines.join("\n");
}

// ─── Validator ────────────────────────────────────────────────────────────────

export interface PopulationValidationResult {
  passed: boolean;
  isWarning: boolean;
  reason: string | null;
}

export function validatePopulationOutput(
  population: PopulationContext,
  exercises: { name: string }[],
): PopulationValidationResult {
  const count = exercises.length;

  if (population.type === "ACTIVE_OLDER_ADULT") {
    if (count < 4) {
      return {
        passed: false,
        isWarning: false,
        reason: `ACTIVE_OLDER_ADULT session has only ${count} exercises — minimum is 4. This is too sparse for an active adult.`,
      };
    }
    if (count > 7) {
      return {
        passed: true,
        isWarning: true,
        reason: `ACTIVE_OLDER_ADULT session has ${count} exercises — consider capping at 6–7 for this population.`,
      };
    }
    return { passed: true, isWarning: false, reason: null };
  }

  if (population.type === "BEGINNER") {
    const COMPLEX_EXERCISE_PATTERN = /\b(power\s*clean|hang\s*clean|snatch|clean\s*and\s*jerk|box\s*jump|depth\s*jump|broad\s*jump|plyometric|olympic)\b/i;
    const complexFound = exercises.find((e) => COMPLEX_EXERCISE_PATTERN.test(e.name));
    if (complexFound) {
      return {
        passed: true,
        isWarning: true,
        reason: `BEGINNER session contains complex exercise "${complexFound.name}" — consider a simpler alternative.`,
      };
    }
    return { passed: true, isWarning: false, reason: null };
  }

  if (population.type === "ATHLETIC") {
    if (count < 4) {
      return {
        passed: true,
        isWarning: true,
        reason: `ATHLETIC session has only ${count} exercises — may be too minimal for this population.`,
      };
    }
    return { passed: true, isWarning: false, reason: null };
  }

  return { passed: true, isWarning: false, reason: null };
}
