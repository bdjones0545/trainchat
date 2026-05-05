/**
 * Refinement Scope Resolver
 *
 * Classifies a user refinement request into the correct hierarchy layer:
 *   block_scope  — targets the monthly block (adaptation target, block type, phase direction)
 *   week_scope   — targets the current week (fatigue, emphasis, density for that week)
 *   session_scope — targets a specific day / session / exercise (default)
 *
 * No LLM call — fast pattern matching only. Falls back to session_scope when ambiguous.
 */

import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RefinementScope = "session_scope" | "week_scope" | "block_scope";

export interface ScopeResolution {
  scope: RefinementScope;
  confidence: "high" | "medium" | "low";
  targetDayIndex?: number;
  targetWeekNumber?: number;
  derivedTransformation?: string;
  reasoning: string;
}

// ─── Pattern Dictionaries ──────────────────────────────────────────────────────

const BLOCK_SCOPE_PATTERNS: RegExp[] = [
  /\bthis (phase|block|cycle|mesocycle)\b/i,
  /\bthe (whole )?(block|phase|cycle)\b/i,
  /\bshift (this |the )?(block|phase|program) (toward|to|into)\b/i,
  /\bmake this (a |an |more |a bit )?(re[\-\s]?entry|power|strength|hypertrophy|work capacity|resilience|accumulation|intensification|athletic|explosive|powerful)\b/i,
  /\b(re[\-\s]?entry|resilience) (block|phase)\b/i,
  /\bchange (the )?(block|phase) (to|into|toward)\b/i,
  /\bshift (toward|to|into) (power|strength|hypertrophy|endurance|conditioning|athleticism|explosiveness)\b/i,
  /\bmore (explosive|powerful|athletic|strong|conditioning|endurance) overall\b/i,
  /\bprogress this (for )?\d+[ -]?weeks?\b/i,
  /\bprogram direction\b/i,
  /\bblock focus\b/i,
  /\bphase focus\b/i,
  /\bcoming back from (pain|injury|surgery)\b/i,
  /\breturn (to|from) (training|injury|pain)\b/i,
  /\bchange (my )?(training )?(focus|direction|goal)\b/i,
];

const WEEK_SCOPE_PATTERNS: RegExp[] = [
  /\bthis week\b/i,
  /\bthe week\b/i,
  /\bweek('?s)? (sessions|emphasis|focus|workouts|is|was|feels?|too|are)\b/i,
  /\btoo (fatiguing|much|heavy|intense|hard|draining) (this week|for this week)\b/i,
  /\bthis week (is|feels?|seems?|was) too (much|hard|heavy|fatiguing|intense|long)\b/i,
  /\blower (fatigue|volume|intensity) (this|for this) week\b/i,
  /\bweek (1|2|3|4|one|two|three|four) (emphasis|focus|is|should|needs?)\b/i,
  /\bfor (the|this) week\b/i,
  /\b(reduce|lower|cut|dial back) (the )?(fatigue|volume|intensity|sessions?|workload) (this week|for the week|this week)\b/i,
  /\bmake (this |the )?week (more|less|shorter|longer|easier|harder)\b/i,
  /\b(more|less) (explosive|endurance|strength|power|conditioning) (this week|for this week|this week's)\b/i,
  /\bshorter sessions? (this|for this) week\b/i,
  /\bweek (too|is) (fatiguing|heavy|draining|much|intense)\b/i,
];

const SESSION_SCOPE_HINT_PATTERNS: RegExp[] = [
  /\bday (\d+|one|two|three|four|five|six|seven)\b/i,
  /\bsession (\d+|one|two|three|four)\b/i,
  /\bthis (exercise|movement|lift|set)\b/i,
  /\bswap\b/i,
  /\badd (an? )?(exercise|movement|set|finisher)\b/i,
  /\b(make|make it) (harder|easier|heavier|lighter|shorter|longer)\b/i,
  /\bprogress(ion)?\b/i,
  /\bregress(ion)?\b/i,
];

// ─── Transformation Inference ─────────────────────────────────────────────────
//
// Maps user language to the transformation type used by applyTransformationToExercise
// and BLOCK_TO_TRANSFORM in hierarchical-refine-engine.

const WEEK_TRANSFORMATION_PATTERNS: Array<{ pattern: RegExp; transformation: string }> = [
  { pattern: /\btoo (fatiguing|much|heavy|draining|intense)\b/i,   transformation: "recovery" },
  { pattern: /\blower (fatigue|volume|intensity|effort)\b/i,        transformation: "recovery" },
  { pattern: /\b(reduce|cut|dial back) (fatigue|volume|intensity)\b/i, transformation: "recovery" },
  { pattern: /\beasier\b/i,                                          transformation: "recovery" },
  { pattern: /\bdeload\b/i,                                          transformation: "recovery" },
  { pattern: /\bmore explosive\b/i,                                  transformation: "power" },
  { pattern: /\b(power|explosive|speed|fast)\b/i,                   transformation: "power" },
  { pattern: /\bmore strength\b/i,                                   transformation: "strength" },
  { pattern: /\bstronger\b/i,                                        transformation: "strength" },
  { pattern: /\b(strength|heavy|load|heavier)\b/i,                  transformation: "strength" },
  { pattern: /\b(more )?endurance\b/i,                              transformation: "endurance" },
  { pattern: /\b(conditioning|cardio|aerobic|capacity)\b/i,         transformation: "endurance" },
  { pattern: /\b(shorter sessions?|less time)\b/i,                  transformation: "reduce_time" },
  { pattern: /\bhypertrophy\b/i,                                    transformation: "hypertrophy" },
  { pattern: /\bhypertrophy emphasis\b/i,                           transformation: "hypertrophy" },
  { pattern: /\b(more muscle|muscle growth|build muscle|muscle mass|grow muscle)\b/i, transformation: "muscle_growth" },
  { pattern: /\b(volume|more sets?|more reps?)\b/i,                 transformation: "hypertrophy" },
];

const BLOCK_TYPE_PATTERNS: Array<{ pattern: RegExp; blockType: string }> = [
  { pattern: /\bpower conversion\b/i,     blockType: "power_conversion" },
  { pattern: /\bstrength emphasis\b/i,    blockType: "strength_emphasis" },
  { pattern: /\bhypertrophy\b/i,          blockType: "hypertrophy_support" },
  { pattern: /\bwork capacity\b/i,        blockType: "work_capacity" },
  { pattern: /\bre[\-\s]?entry\b/i,       blockType: "re_entry_resilience" },
  { pattern: /\bresilience\b/i,           blockType: "re_entry_resilience" },
  { pattern: /\baccumulation\b/i,         blockType: "accumulation" },
  { pattern: /\bintensification\b/i,      blockType: "intensification" },
  { pattern: /\bcoming back from (pain|injury)\b/i, blockType: "re_entry_resilience" },
  { pattern: /\breturn (from|to) (injury|pain|training)\b/i, blockType: "re_entry_resilience" },
  // Goal-based shifts
  { pattern: /\b(more |shift to )?power\b/i,         blockType: "power_conversion" },
  { pattern: /\b(more |shift to )?explosive\b/i,     blockType: "power_conversion" },
  { pattern: /\b(more |shift to )?athletic\b/i,      blockType: "power_conversion" },
  { pattern: /\b(more |shift to )?strength\b/i,      blockType: "strength_emphasis" },
  { pattern: /\b(more |shift to )?strong\b/i,        blockType: "strength_emphasis" },
  { pattern: /\b(more |shift to )?conditioning\b/i,  blockType: "work_capacity" },
  { pattern: /\b(more |shift to )?endurance\b/i,     blockType: "work_capacity" },
];

// ─── Day Index Extraction ─────────────────────────────────────────────────────

function extractDayIndex(message: string): number | undefined {
  const match = message.match(/\bday (\d+)\b/i);
  if (match) return parseInt(match[1], 10) - 1;
  const words: Record<string, number> = {
    one: 0, two: 1, three: 2, four: 3, five: 4, six: 5, seven: 6,
  };
  const wordMatch = message.match(/\bday (one|two|three|four|five|six|seven)\b/i);
  if (wordMatch) return words[wordMatch[1].toLowerCase()];
  return undefined;
}

function extractWeekNumber(message: string): number | undefined {
  const match = message.match(/\bweek (\d+)\b/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function resolveRefinementScope(
  message: string,
  context?: { currentWeekNumber?: number },
): ScopeResolution {
  const msg = message.trim();

  // ── 1. Check for strong block_scope signals ─────────────────────────────────
  for (const pattern of BLOCK_SCOPE_PATTERNS) {
    if (pattern.test(msg)) {
      const blockType = BLOCK_TYPE_PATTERNS.find((b) => b.pattern.test(msg))?.blockType;

      logger.info(
        { scope: "block_scope", message: msg.slice(0, 80), matchedPattern: pattern.toString() },
        "[RefinementScope] Classified as block_scope"
      );

      return {
        scope: "block_scope",
        confidence: "high",
        derivedTransformation: blockType,
        reasoning: `Block-scope language detected (pattern: ${pattern.toString()})`,
      };
    }
  }

  // ── 2. Check for strong week_scope signals ──────────────────────────────────
  // But ONLY if there are no session-specific signals that outweigh them
  const hasSessionHint = SESSION_SCOPE_HINT_PATTERNS.some((p) => p.test(msg));

  for (const pattern of WEEK_SCOPE_PATTERNS) {
    if (pattern.test(msg) && !hasSessionHint) {
      const weekNumber = extractWeekNumber(msg) ?? context?.currentWeekNumber;
      const transformation = WEEK_TRANSFORMATION_PATTERNS.find((t) => t.pattern.test(msg))?.transformation;

      logger.info(
        { scope: "week_scope", message: msg.slice(0, 80), weekNumber, transformation },
        "[RefinementScope] Classified as week_scope"
      );

      return {
        scope: "week_scope",
        confidence: "high",
        targetWeekNumber: weekNumber,
        derivedTransformation: transformation,
        reasoning: `Week-scope language detected (pattern: ${pattern.toString()})`,
      };
    }
  }

  // ── 3. Default: session_scope ────────────────────────────────────────────────
  const dayIndex = extractDayIndex(msg);

  logger.info(
    { scope: "session_scope", message: msg.slice(0, 80), dayIndex },
    "[RefinementScope] Classified as session_scope (default)"
  );

  return {
    scope: "session_scope",
    confidence: hasSessionHint ? "high" : "medium",
    targetDayIndex: dayIndex,
    reasoning: "No block or week scope signals detected — defaulting to session scope",
  };
}

/**
 * Helper: infer the transformation type from a free-text message.
 * Useful for week-scope mutations where we need to know the direction of change.
 */
export function inferTransformationFromMessage(message: string): string {
  const msg = message.toLowerCase();
  for (const { pattern, transformation } of WEEK_TRANSFORMATION_PATTERNS) {
    if (pattern.test(msg)) return transformation;
  }
  return "recovery"; // safe default for unrecognized week requests
}

/**
 * Helper: infer the target block type from a free-text message.
 * Returns null if no block type can be inferred.
 */
export function inferBlockTypeFromMessage(message: string): string | null {
  const msg = message.toLowerCase();
  for (const { pattern, blockType } of BLOCK_TYPE_PATTERNS) {
    if (pattern.test(msg)) return blockType;
  }
  return null;
}
