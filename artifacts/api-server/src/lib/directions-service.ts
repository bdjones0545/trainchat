/**
 * Directions Service — Phase A + Phase B + Phase D (Command Priority System)
 *
 * Interprets a user's edit intent and returns either:
 * - 2–4 intelligent direction options for the user to choose from, OR
 * - A signal to skip directions and execute directly (for highly specific requests)
 *
 * Phase B: Injects decision memory + long-term memories into the AI prompt so
 * generated directions reference past decisions naturally. Also returns a
 * continuityPrompt for the UI to surface check-in questions.
 *
 * Phase C: Expanded direct-command detection — named exercise requests and
 * common coaching shorthand are now recognised as highly specific and skip
 * the chooser modal entirely.
 *
 * Phase D (Command Priority System): Global isDirectUserCommand() enforced
 * before ANY chooser modal is triggered. Direct commands ALWAYS win — they
 * bypass the chooser, bypass the AI fallback, and never open a modal.
 * If a direct command cannot be applied, a coaching message is returned
 * instead of a chooser. Full debug logging added at every routing decision.
 */

import { logger } from "./logger";
import { OPENAI_MODELS } from "./openai-models";
import { serializeSystemForPrompt, type TargetContext } from "./edit-intent-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirectionOption {
  id: string;
  label: string;
  whatWillChange: string;
  whyItMatters: string;
  editRequest: string;
}

export interface DirectionsResponse {
  shouldSkipDirections: boolean;
  coachMessage?: string;
  directions?: DirectionOption[];
  directEditRequest?: string;
  continuityPrompt?: string | null;
  memoryCallout?: string | null;
}

// ─── Common Exercise Aliases / Shorthand ──────────────────────────────────────
// Maps common abbreviations and coaching shorthand to canonical exercise names.
// Used so the edit engine receives a recognisable name even when the user
// types shorthand.

const EXERCISE_ALIASES: Record<string, string> = {
  "rfess": "Rear Foot Elevated Split Squat",
  "rear foot elevated split squat": "Rear Foot Elevated Split Squat",
  "rdl": "Romanian Deadlift",
  "trap bar deadlift": "Trap Bar Deadlift",
  "hex bar deadlift": "Trap Bar Deadlift",
  "ssb squat": "Safety Bar Squat",
  "safety squat": "Safety Bar Squat",
  "cgbp": "Close-Grip Bench Press",
  "close grip bench": "Close-Grip Bench Press",
  "db bench": "Dumbbell Bench Press",
  "db press": "Dumbbell Bench Press",
  "db row": "Dumbbell Row",
  "db rdl": "Dumbbell Romanian Deadlift",
  "db split squat": "Dumbbell Split Squat",
  "kb swing": "Kettlebell Swing",
  "kb goblet": "Kettlebell Goblet Squat",
  "pause squat": "Pause Back Squat",
  "pause bench": "Pause Bench Press",
  "pause deadlift": "Pause Deadlift",
  "tempo squat": "Tempo Back Squat",
  "tempo deadlift": "Tempo Deadlift",
  "pin squat": "Pin Squat",
  "box squat": "Box Squat",
  "front squat": "Front Squat",
  "goblet squat": "Goblet Squat",
  "split squat": "Split Squat",
  "bulgarian split squat": "Rear Foot Elevated Split Squat",
  "single leg rdl": "Single-Leg Romanian Deadlift",
  "sl rdl": "Single-Leg Romanian Deadlift",
  "hip thrust": "Barbell Hip Thrust",
  "glute bridge": "Glute Bridge",
  "nordic curl": "Nordic Hamstring Curl",
  "nordic": "Nordic Hamstring Curl",
  "ghr": "Glute Ham Raise",
  "broad jump": "Broad Jump",
  "triple broad jump": "Triple Broad Jump",
  "box jump": "Box Jump",
  "depth jump": "Depth Jump",
  "hurdle jump": "Hurdle Jump",
  "lateral bound": "Lateral Bound",
  "med ball throw": "Medicine Ball Rotational Throw",
  "rotational throw": "Medicine Ball Rotational Throw",
  "rotational med ball throw": "Medicine Ball Rotational Throw",
  "med ball rotational throw": "Medicine Ball Rotational Throw",
  "pallof press": "Pallof Press",
  "cable chop": "Cable Chop",
  "half kneeling chop": "Half-Kneeling Cable Chop",
  "landmine press": "Landmine Press",
  "landmine row": "Landmine Row",
  "landmine rotation": "Landmine Rotation",
  "chest-supported row": "Chest-Supported Row",
  "chest supported row": "Chest-Supported Row",
  "incline row": "Chest-Supported Row",
  "pendlay row": "Pendlay Row",
  "ring row": "Ring Row",
  "trx row": "TRX Row",
  "face pull": "Face Pull",
  "band pull apart": "Band Pull Apart",
};

/**
 * Normalise a user-typed exercise name: resolve aliases, title-case common shorthand.
 */
function resolveAlias(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return EXERCISE_ALIASES[lower] ?? raw.trim();
}

// ─── Direct Command Detection ──────────────────────────────────────────────────
// Returns the resolved exercise name if the request is a direct command,
// otherwise returns null.

// Words that are NOT exercise names — prevent false positives in "make this harder/easier/better"
const EXCLUDED_INTENT_WORDS = new Set([
  "harder", "easier", "heavier", "lighter", "simpler", "better", "worse",
  "harder variation", "easier variation", "different", "something else",
  "more challenging", "less challenging", "more difficult", "less difficult",
  "shoulder-friendly", "shoulder friendly", "a variation", "an alternative",
  "a progression", "a regression", "explosive", "powerful",
]);

/**
 * Detect requests where the user explicitly names a target exercise.
 * Covers patterns like:
 *  - "substitute with X"
 *  - "replace with X" / "replace this with X" / "replace [name] with X"
 *  - "swap [this] for X" / "swap [this] to X"
 *  - "change [this] to X" / "change to X"
 *  - "switch to X" / "switch [this] for X"
 *  - "make this a X" / "make it a X" / "make this [into] X"
 *  - "use X instead" / "do X instead"
 *  - "convert to X" / "convert [this] to X"
 */
function detectNamedExerciseCommand(request: string): { verb: string; targetExercise: string } | null {
  const r = request.trim();

  const patterns: Array<{ re: RegExp; verbGroup: number; nameGroup: number }> = [
    // "substitute [this/it] with X" / "substitute with X"
    { re: /^substitute(?:\s+(?:this|it))?\s+with\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "sub [this] with X" / "sub with X"
    { re: /^sub(?:\s+(?:this|it))?\s+with\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "replace [this/it/name] with X"
    { re: /^replace(?:\s+\S+)?\s+with\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "swap [this/it] for X" / "swap [this/it] with X" / "swap [this/it] to X"
    { re: /^swap(?:\s+(?:this|it|out))?\s+(?:for|with|to)\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "swap X for Y" (naming both — already handled but capture Y)
    { re: /^swap\s+.+\s+for\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "change [this] to X" / "change to X"
    { re: /^change(?:\s+(?:this|it|the\s+exercise))?\s+to\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "switch [this] to X" / "switch [this] for X"
    { re: /^switch(?:\s+(?:this|it|out))?\s+(?:to|for|with)\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "make this a X" / "make it a X" / "make this into X"
    { re: /^make\s+(?:this|it)\s+(?:a|an|into|a\s+)?(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "use X instead" / "do X instead"
    { re: /^(?:use|do)\s+(.+?)\s+instead$/i, verbGroup: -1, nameGroup: 1 },
    // "convert [this] to X" / "convert to X"
    { re: /^convert(?:\s+(?:this|it))?\s+to\s+(.+)$/i, verbGroup: -1, nameGroup: 1 },
    // "try X" / "try X instead"
    { re: /^try\s+(.+?)(?:\s+instead)?$/i, verbGroup: -1, nameGroup: 1 },
  ];

  for (const { re, nameGroup } of patterns) {
    const match = r.match(re);
    if (match) {
      const rawName = match[nameGroup]?.trim();
      if (rawName && rawName.length >= 3 && rawName.length <= 80) {
        // Reject common intent adjectives that are NOT exercise names
        if (EXCLUDED_INTENT_WORDS.has(rawName.toLowerCase())) continue;
        const resolved = resolveAlias(rawName);
        return { verb: "swap", targetExercise: resolved };
      }
    }
  }

  return null;
}

/**
 * Detect direct prescription changes — any request that names a specific
 * field (reps, sets, rest, load, duration, distance, tempo) together with
 * a concrete value.  These should bypass the chooser modal entirely.
 */
function isDirectPrescriptionChange(request: string): boolean {
  const lower = request.toLowerCase();

  // Any mention of a number + a prescription field keyword = direct command
  const hasNumber = /\d/.test(lower);

  if (hasNumber) {
    const fieldKeywords = [
      /\breps?(\s+each\s+side|\s+per\s+side|\s+each\s+(leg|arm))?\b/i,
      /\bsets?\b/i,
      /\brest\b/i,
      /\b(seconds?|sec|minutes?|min)\b/i,
      /\b(lbs?|pounds?|kg)\b/i,
      /\b(feet|ft|meters?)\b/i,
      /\b(inches?|in)\b/i,
      /\btempo\b/i,
      /\bpause\b/i,
      /\bhold\b/i,
      /\bduration\b/i,
      /\bdistance\b/i,
      /\bheight\b/i,
      /\beach\s+side\b/i,
      /\bper\s+side\b/i,
    ];
    if (fieldKeywords.some((p) => p.test(lower))) return true;
  }

  // Tempo pattern like "3-1-X-0"
  if (/\d[-]\d[-][Xx\d][-]\d/.test(request)) return true;

  // Explicit set/rep delta words (no number required)
  return [
    /\badd\s+a?\s+set\b/i,
    /\b(remove|drop|cut)\s+a?\s+set\b/i,
    /\bone\s+more\s+set\b/i,
    /\bmore\s+sets?\b/i,
    /\bfewer\s+sets?\b/i,
    /\bmake\s+it\s+shoulder.?friendly\b/i,
    /\badd\s+explosive\s+cue\b/i,
    /\bremove\s+(the\s+)?(exercise|this)\b/i,
    /\bdelete\s+(the\s+)?(exercise|this)\b/i,
    /\bshorten(er)?\s+(the\s+)?rest\b/i,
    /\bmore\s+rest\b/i,
    /\bless\s+rest\b/i,
  ].some((p) => p.test(lower));
}

// ─── Global Command Priority Detector ────────────────────────────────────────
//
// isDirectUserCommand() is the single global gate that must be checked BEFORE
// any chooser modal is triggered — at every entry point in the system.
//
// Returns true when the input is specific, actionable, and maps to a known
// field mutation or block operation. Direct commands ALWAYS win over choosers.
//
// Covers BOTH:
//   - exercise-level edits (reps, sets, rest, load, swap, harder/easier)
//   - block-level edits (power, hypertrophy, strength, volume, intensity)

export function isDirectUserCommand(request: string): boolean {
  // 1. Direct prescription change (number + field keyword) — exercise level
  if (isDirectPrescriptionChange(request)) return true;

  // 2. Named exercise command (substitute/replace/swap X with Y)
  if (detectNamedExerciseCommand(request)) return true;

  // 3. Block-level intent patterns — run unconditionally (not gated on targetContext)
  //    These are always specific enough to bypass the chooser.
  const lower = request.toLowerCase();
  for (const { patterns } of BLOCK_INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) return true;
    }
  }

  // 4. Clear verb + known training concept combinations
  const directCommandPatterns = [
    // "increase/reduce/add/cut X to/by N"
    /\b(increase|decrease|add|remove|reduce|lower|raise|boost|cut|drop)\s+(reps?|sets?|rest|load|volume|intensity|frequency|weight)\b/i,
    // "focus/bias/shift toward X"
    /\b(focus|bias|shift|move|lean)\s+(more\s+)?(on|toward|to|into)\s+(power|strength|hypertrophy|speed|conditioning|athletic|explosive)/i,
    // "more X" where X is a clear training quality
    /\bmore\s+(power|strength|hypertrophy|speed|explosive|conditioning|athletic|volume|intensity)\b/i,
    // "X bias/focus/emphasis" where X is a clear quality
    /\b(power|strength|hypertrophy|speed|explosive|athletic|conditioning)\s+(bias|focus|emphasis|work)\b/i,
    // "reduce/less X body volume/work/emphasis"
    /\b(reduce|less|cut|lower|drop)\s+(lower|upper)[- ]body\s+(volume|work|emphasis|focus|stress)\b/i,
    // "make this N weeks" / "shorten to N weeks" etc.
    /\b(make|shorten|cut|reduce|extend|lengthen|add)\s+.{0,20}\d+\s*weeks?\b/i,
    // "I want to focus on X" / "I want more X"
    /\bi\s+want\s+(to\s+)?(focus\s+on|more)\s+(power|strength|hypertrophy|speed|conditioning|volume)\b/i,
    // "substitute with X" (mid-sentence, not just start-anchored)
    /\bsubstitute\s+(this\s+)?with\s+\w+/i,
    // "swap this for X" / "replace this with X" (mid-sentence)
    /\b(swap|replace|switch)\s+(this|it|the\s+exercise)\s+(for|with|to)\s+\w+/i,
  ];

  return directCommandPatterns.some((p) => p.test(lower));
}

// ─── Structured Command Priority Log ─────────────────────────────────────────
// Emits a consistent log entry at every routing decision point.
// Format: { input, isDirect, context, routedTo, reason }

function logCommandRouting(
  input: string,
  isDirect: boolean,
  context: "exercise" | "block" | "session" | "week" | "unknown",
  routedTo: "parser" | "chooser" | "ai" | "coaching_message",
  reason: string
): void {
  logger.info(
    { input, isDirect, context, routedTo, reason },
    "[CommandPriority]"
  );
}

// ─── Block-Level Intent Parser ────────────────────────────────────────────────
// Detects specific block-level mutation commands when the target is a phase.
// Returns a structured directEditRequest for the edit engine, bypassing the chooser.

interface BlockIntentMatch {
  intent: string;
  directEditRequest: string;
}

/**
 * Maps of known block-level intents with their detection patterns and
 * the structured edit request to send to the edit engine.
 */
const BLOCK_INTENT_PATTERNS: Array<{
  intent: string;
  patterns: RegExp[];
  buildRequest: (blockLabel: string, match?: RegExpMatchArray) => string;
}> = [
  // ── Power bias ─────────────────────────────────────────────────────────────
  {
    intent: "increase_power_bias",
    patterns: [
      /\bmore\s+power\b/i,
      /\bfocus\s+(more\s+)?on\s+power\b/i,
      /\bpower.focused\b/i,
      /\bpower\s+bias\b/i,
      /\bshift\s+(toward|to|into)\s+power\b/i,
      /\bmore\s+(explosive|reactive|force\s*express)/i,
      /\bexplosive\s+(focus|emphasis|bias|work)\b/i,
      /\bstrength[\s-]power\b/i,
    ],
    buildRequest: (label) =>
      `Increase power bias for the ${label}: add more explosive/reactive work (jumps, throws, force-expression) across the week, reduce nonessential hypertrophy or general accessory density, bias session intents toward elastic and force-expression work while maintaining enough strength work to support power output`,
  },
  // ── Hypertrophy bias ───────────────────────────────────────────────────────
  {
    intent: "increase_hypertrophy_bias",
    patterns: [
      /\bhypertrophy.focused\b/i,
      /\bmore\s+hypertrophy\b/i,
      /\bshift\s+(toward|to|into)\s+hypertrophy\b/i,
      /\bhypertrophy\s+bias\b/i,
      /\bmore\s+(muscle|size|volume)\b/i,
      /\bmuscle[\s-]building\s+(bias|focus|emphasis)\b/i,
    ],
    buildRequest: (label) =>
      `Shift ${label} toward hypertrophy: increase rep ranges to 8-12+ on compound movements, add accessory volume targeting key muscle groups, extend time under tension where appropriate, reduce low-rep max strength work unless it supports hypertrophy goals`,
  },
  // ── Strength bias ──────────────────────────────────────────────────────────
  {
    intent: "increase_strength_bias",
    patterns: [
      /\bmore\s+strength\b/i,
      /\bstrength.focused\b/i,
      /\bstrength\s+bias\b/i,
      /\bshift\s+(toward|to|into)\s+strength\b/i,
      /\blow.rep\s+(focus|emphasis|bias)\b/i,
      /\bmaximal\s+strength\b/i,
    ],
    buildRequest: (label) =>
      `Shift ${label} toward maximal strength: move primary lifts into 3-6 rep zones, increase rest periods to 3-5 min on compound work, reduce accessory volume and prioritize primary movement quality and intensity`,
  },
  // ── Speed / acceleration bias ──────────────────────────────────────────────
  {
    intent: "increase_speed_bias",
    patterns: [
      /\bmore\s+speed\b/i,
      /\bspeed.focused\b/i,
      /\bspeed\s+bias\b/i,
      /\bacceleration\s+(focus|emphasis|bias|work)\b/i,
      /\bshift\s+(toward|to|into)\s+speed\b/i,
      /\bvelocity.based\b/i,
    ],
    buildRequest: (label) =>
      `Increase speed and acceleration emphasis in ${label}: add sprint-based or velocity-based work, prioritize acceleration mechanics, reduce slow-tempo hypertrophy work, ensure power development is sequenced before fatigue-heavy volume`,
  },
  // ── Sport specificity ──────────────────────────────────────────────────────
  {
    intent: "increase_sport_specificity",
    patterns: [
      /\bmore\s+sport.specific\b/i,
      /\bsport.specific\s+(emphasis|focus|bias|work)\b/i,
      /\bhockey.specific\b/i,
      /\bmake\s+this\s+more\s+hockey\b/i,
      /\bfootball.specific\b/i,
      /\bbasketball.specific\b/i,
      /\bsoccer.specific\b/i,
      /\bbaseball.specific\b/i,
      /\brugby.specific\b/i,
      /\blacrosse.specific\b/i,
      /\bfield.sport\s+(emphasis|focus|bias)\b/i,
      /\bcourt.sport\s+(emphasis|focus|bias)\b/i,
      /\bmore\s+(?:hockey|football|basketball|soccer|baseball|rugby|lacrosse|sport)\b.*\bspecific\b/i,
    ],
    buildRequest: (label) =>
      `Increase sport specificity in ${label}: bias exercise selection toward movements that transfer directly to sport demands (lateral power, rotational strength, acceleration, deceleration, multi-directional loading), reduce non-transferable isolation work, add rotational and reactive elements to sessions`,
  },
  // ── Reduce volume ──────────────────────────────────────────────────────────
  {
    intent: "reduce_volume",
    patterns: [
      /\breduce\s+(overall\s+)?volume\b/i,
      /\bless\s+(overall\s+)?volume\b/i,
      /\blower\s+(the\s+)?volume\b/i,
      /\bcut\s+(?:back\s+)?(?:on\s+)?volume\b/i,
      /\bpull\s+back\s+(the\s+)?volume\b/i,
      /\bdial\s+back\s+(the\s+)?volume\b/i,
    ],
    buildRequest: (label) =>
      `Reduce overall training volume in ${label}: pull back accessory sets first, trim finishers where appropriate, reduce secondary compound volume while protecting primary lift integrity. Redistribute stress more manageably across the week`,
  },
  // ── Increase volume ────────────────────────────────────────────────────────
  {
    intent: "increase_volume",
    patterns: [
      /\bmore\s+(overall\s+)?volume\b/i,
      /\bincrease\s+(overall\s+)?volume\b/i,
      /\badd\s+(more\s+)?volume\b/i,
      /\bmore\s+total\s+work\b/i,
    ],
    buildRequest: (label) =>
      `Increase total training volume in ${label}: add accessory sets to existing sessions, extend session density where recovery allows, progressively build weekly volume while maintaining movement quality and session structure`,
  },
  // ── Reduce intensity ───────────────────────────────────────────────────────
  {
    intent: "reduce_intensity",
    patterns: [
      /\breduce\s+(overall\s+)?intensity\b/i,
      /\blower\s+(the\s+)?intensity\b/i,
      /\bless\s+intensity\b/i,
      /\bback\s+off\s+(the\s+)?intensity\b/i,
      /\bdial\s+back\s+(the\s+)?intensity\b/i,
      /\bless\s+heavy\b/i,
      /\blighter\s+loads?\b/i,
    ],
    buildRequest: (label) =>
      `Reduce intensity in ${label}: shift primary lifts to higher rep ranges with lighter loads, increase RIR targets, reduce heavy loading days, prioritize technique and volume quality over maximum intensity`,
  },
  // ── Increase intensity ─────────────────────────────────────────────────────
  {
    intent: "increase_intensity",
    patterns: [
      /\bincrease\s+(overall\s+)?intensity\b/i,
      /\bmore\s+intensity\b/i,
      /\bheavier\s+loads?\b/i,
      /\bmore\s+challenging\b/i,
      /\bmore\s+demanding\b/i,
      /\bpush\s+(the\s+)?intensity\b/i,
    ],
    buildRequest: (label) =>
      `Increase intensity in ${label}: move primary lifts toward lower rep zones, increase load targets, tighten RIR, ensure high-effort sets on compound work. Maintain recovery structure to support increased loading`,
  },
  // ── Shorten block ──────────────────────────────────────────────────────────
  {
    intent: "shorten_block",
    patterns: [
      /\bshorten\s+(this\s+)?(block|phase)\b/i,
      /\bshorter\s+(block|phase)\b/i,
      /\b(\d+)[- ]weeks?\s+(long|only|total)\b/i,
      /\breduce\s+(to\s+)?(\d+)\s+weeks?\b/i,
      /\bshorten\s+(to\s+)?(\d+)\s+weeks?\b/i,
      /\bmake\s+(it\s+)?(\d+)\s+weeks?\b/i,
      /\bcut\s+(it\s+)?to\s+(\d+)\s+weeks?\b/i,
    ],
    buildRequest: (label, match?) => {
      const weekMatch = match?.[0]?.match(/(\d+)\s*weeks?/i);
      const weekCount = weekMatch ? weekMatch[1] : null;
      return weekCount
        ? `Shorten ${label} to ${weekCount} weeks: redistribute the weekly progression to fit ${weekCount} weeks, compress volume and intensity progression proportionally, ensure the block still builds meaningfully toward its goal`
        : `Shorten ${label}: reduce the number of weeks and redistribute weekly progression proportionally. Compress volume and intensity buildup to complete the block's goal in fewer weeks`;
    },
  },
  // ── Lengthen block ─────────────────────────────────────────────────────────
  {
    intent: "lengthen_block",
    patterns: [
      /\blengthen\s+(this\s+)?(block|phase)\b/i,
      /\blonger\s+(block|phase)\b/i,
      /\bextend\s+(this\s+)?(block|phase)\b/i,
      /\badd\s+(more\s+)?weeks?\b/i,
      /\bmore\s+weeks?\b/i,
    ],
    buildRequest: (label) =>
      `Extend ${label}: add weeks to allow more gradual progression, spread volume and intensity buildup across additional weeks, ensure each added week builds logically from the previous`,
  },
  // ── Reduce lower-body volume / emphasis ───────────────────────────────────
  {
    intent: "adjust_lower_body_emphasis",
    patterns: [
      /\breduce\s+lower.body\s+(volume|work|emphasis|focus|stress)\b/i,
      /\bless\s+lower.body\s+(volume|work|emphasis|focus)\b/i,
      /\bcut\s+(back\s+)?lower.body\b/i,
      /\blow\s+lower.body\s+(volume|work|emphasis)\b/i,
      /\bdeload\s+lower.body\b/i,
    ],
    buildRequest: (label) =>
      `Reduce lower-body volume in ${label}: decrease sets on squat and hinge patterns, replace high-demand lower sessions with lighter technical work or upper-body emphasis, protect sport-specific lower body needs while reducing total stress`,
  },
  // ── Reduce upper-body volume / emphasis ───────────────────────────────────
  {
    intent: "adjust_upper_body_emphasis",
    patterns: [
      /\breduce\s+upper.body\s+(volume|work|emphasis|focus|stress)\b/i,
      /\bless\s+upper.body\s+(volume|work|emphasis|focus)\b/i,
      /\bcut\s+(back\s+)?upper.body\b/i,
    ],
    buildRequest: (label) =>
      `Reduce upper-body volume in ${label}: decrease pressing and pulling volume, trim accessory upper work, shift session emphasis toward lower body or full-body integration`,
  },
  // ── Simplify sessions ──────────────────────────────────────────────────────
  {
    intent: "simplify_sessions",
    patterns: [
      /\bsimplify\b/i,
      /\bsimpler\b/i,
      /\bless\s+complex\b/i,
      /\bfewer\s+exercises?\b/i,
      /\bstreamline\b/i,
    ],
    buildRequest: (label) =>
      `Simplify ${label}: reduce exercise variety, focus on fewer high-quality movements per session, eliminate lower-priority accessories, keep the core movement patterns and remove complexity that isn't driving the primary goal`,
  },
];

/**
 * Detects specific block-level mutation commands when the target is a phase.
 * Returns a structured directEditRequest when the intent is clear and specific.
 */
function checkBlockSpecificity(
  request: string,
  targetContext: TargetContext
): BlockIntentMatch | null {
  const blockLabel = targetContext.label ?? "this block";

  for (const { patterns, intent, buildRequest } of BLOCK_INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = request.match(pattern);
      if (match) {
        const directEditRequest = buildRequest(blockLabel, match);
        logger.info(
          { original: request, intent, blockLabel, directEditRequest },
          "Block-level intent detected — skipping directions chooser"
        );
        return { intent, directEditRequest };
      }
    }
  }

  return null;
}

// ─── Specificity Check (combined) ────────────────────────────────────────────

/**
 * Returns { isSpecific, directEditRequest } when the request should skip
 * the directions chooser and go straight to the edit engine.
 *
 * Priority order (Command Priority System — Phase D):
 * 1. Global isDirectUserCommand() gate — if true, ALWAYS bypass chooser
 * 2. Block-level target context with matched block intent
 * 3. Direct prescription change (number + field)
 * 4. Named exercise command
 *
 * Direct commands NEVER lose to chooser modals.
 */
function checkSpecificity(
  request: string,
  targetContext?: TargetContext
): { isSpecific: true; directEditRequest: string } | { isSpecific: false } {
  const context = targetContext?.type ?? "unknown";

  // ── PRIORITY 0: Global Command Priority Gate ───────────────────────────────
  // isDirectUserCommand() is checked FIRST, unconditionally, regardless of
  // target context. This is the single source of truth for "is this a direct
  // command?" — it covers exercise-level and block-level commands.
  if (isDirectUserCommand(request)) {
    // ── Block-level targets (phase or week): generate structured block edit ───
    // Phase and week targets share the same block-intent builder because both
    // operate at a "multi-session" scope. The builder produces language like
    // "add more explosive work across the week" which is accurate for both.
    if (targetContext?.type === "phase" || targetContext?.type === "week") {
      // Use a phase-typed context so checkBlockSpecificity patterns fire correctly,
      // but preserve the real label so the generated request names the right thing.
      const blockCtx: TargetContext = { ...targetContext, type: "phase" };
      const blockMatch = checkBlockSpecificity(request, blockCtx);
      if (blockMatch) {
        logCommandRouting(request, true, targetContext.type === "week" ? "block" : "block", "parser", `block intent: ${blockMatch.intent}`);
        return { isSpecific: true, directEditRequest: blockMatch.directEditRequest };
      }
      // Direct command + block target but no specific pattern matched — pass through
      logCommandRouting(request, true, "block", "parser", "direct block command — no pattern match, passing through");
      return { isSpecific: true, directEditRequest: request };
    }

    // ── Session / exercise target with a direct command ──────────────────────
    // Do NOT reframe using block-level language. Block builders produce text like
    // "across the week" that confuses the edit engine when the target is a single
    // session, producing wrong results (e.g. converting to recovery when the user
    // asked for more explosive work). Pass the original request through — the edit
    // engine receives the targetContext separately and scopes the change correctly.
    if (targetContext?.type === "session" || targetContext?.type === "exercise") {
      logCommandRouting(request, true, targetContext.type, "parser", "direct command on session/exercise — passing original request through");
      return { isSpecific: true, directEditRequest: request };
    }

    // ── Named exercise command ───────────────────────────────────────────────
    const namedCommand = detectNamedExerciseCommand(request);
    if (namedCommand) {
      const exerciseName = targetContext?.label ?? "this exercise";
      const editRequest = `Replace ${exerciseName} with ${namedCommand.targetExercise}`;
      logCommandRouting(request, true, "exercise", "parser", `named exercise swap: ${namedCommand.targetExercise}`);
      return { isSpecific: true, directEditRequest: editRequest };
    }

    // ── Direct prescription change ───────────────────────────────────────────
    if (isDirectPrescriptionChange(request)) {
      logCommandRouting(request, true, context as any, "parser", "direct prescription command");
      return { isSpecific: true, directEditRequest: request };
    }

    // ── Direct command caught by general patterns ────────────────────────────
    // isDirectUserCommand() returned true but no sub-check claimed it —
    // route to edit engine as-is (general direct command).
    logCommandRouting(request, true, context as any, "parser", "direct command — general pattern match");
    return { isSpecific: true, directEditRequest: request };
  }

  // ── Not a direct command — allow AI to decide ────────────────────────────
  logCommandRouting(request, false, context as any, "ai", "no direct command pattern matched — routing to AI");
  return { isSpecific: false };
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildDirectionsSystemPrompt(
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string
): string {
  const targetFocus = targetContext
    ? `\nEDIT FOCUS:\nThe user is specifically targeting: ${targetContext.type.toUpperCase()} "${targetContext.label ?? ""}"${targetContext.parentLabel ? ` in ${targetContext.parentLabel}` : ""}.\n`
    : "";

  const adaptationSection = adaptationContext
    ? `\nATHLETE STATE:\n${adaptationContext}\n`
    : "";

  const decisionMemorySection = decisionMemoryContext
    ? `\n${decisionMemoryContext}\n`
    : "";

  return `You are an elite performance coach helping a user decide how to evolve their training system.

You know this athlete. You have worked with them before and remember the decisions you've made together.
${targetFocus}${adaptationSection}${decisionMemorySection}
Your job is to interpret their edit request and either:
1. Recognize it as highly specific → execute directly (shouldSkipDirections: true)
2. Recognize it as open-ended → generate 2-4 direction options (shouldSkipDirections: false)

DECISION RULES — HIGHLY SPECIFIC (always skip directions):

For EXERCISE targets:
- Request names a specific exercise to swap TO: "use X", "try X instead", "swap to X", "change to X"
- Request names BOTH exercises: "swap bench for dumbbell press"
- Request specifies a clear variation: "make this a pause squat", "add a 2-second pause"
- Request specifies an exact prescription: "change to 5 reps", "add a set", "shorten rest to 90s"
- Request names a known exercise abbreviation: RFESS, RDL, SSB, etc.
- Any request where the TARGET of the change is unambiguous — even if only one exercise is named

For BLOCK / PHASE targets — these are ALWAYS highly specific and must skip directions:
- Training quality bias: "more power", "focus on power", "power-focused", "shift toward hypertrophy", "hypertrophy bias", "more strength", "strength-focused", "more speed", "velocity-based"
- Sport specificity: "more hockey-specific", "more sport-specific", "football-specific", "field sport emphasis" — any request naming a specific sport or sport quality
- Volume changes: "reduce volume", "more volume", "less volume", "increase volume", "cut volume"
- Intensity changes: "reduce intensity", "more intensity", "heavier loads", "lighter loads"
- Block length: "shorten this block", "shorten to 3 weeks", "longer block", "extend this phase", "X weeks only"
- Lower/upper body emphasis: "reduce lower-body volume", "less upper body work"
- Structural simplification: "simplify sessions", "fewer exercises", "less complex"

DECISION RULES — OPEN-ENDED (show directions):
- User states a vague goal: "make this better", "I don't like this", "change this", "something else"
- User asks for a direction without naming a specific change: "more variety", "can we try something new"
- For blocks: "adjust this block", "make a change here", "something different", "not sure about this"
- Request is ambiguous and multiple interpretations are plausible with NO clear training quality named

IMPORTANT:
- For exercise targets: err toward shouldSkipDirections: true when ANY specific exercise name, variation, or prescription detail appears.
- For block/phase targets: err toward shouldSkipDirections: true when ANY specific training quality, bias, emphasis, duration, or structural change is named. Block requests are almost always specific.

FOR OPEN-ENDED REQUESTS:
Generate 2-4 meaningful directions. Each must:
- Be genuinely different from the others
- Be grounded in the user's goal, current system structure, athlete state, and decision history
- Feel like options a smart coach who KNOWS this athlete would actually offer
- If past decisions are relevant, reference them in whyItMatters (e.g. "We've been pulling back load — this continues that recovery arc")
- Include a concrete editRequest string (sent to the edit engine if selected)

COACH MESSAGE (coachMessage):
- 1-2 sentences, collaborative tone: "we", "let's", "based on what we've built"
- If past decisions are relevant, acknowledge them briefly (e.g. "Based on what we've been doing...")
- Warm and direct — never say "here is your new program"

MEMORY CALLOUT (memoryCallout):
- Optional: 1 short sentence referencing a specific past decision that's directly relevant NOW
- Use natural coach language: "Earlier we reduced your lower body load..." or "You've been consistent, so..."
- Return null if no past decisions are directly relevant to this request
- Never fabricate history — only reference what you know from the decision history provided

OUTPUT FORMAT — return ONLY valid JSON:

For open-ended requests:
{
  "shouldSkipDirections": false,
  "coachMessage": "string — 1-2 sentences, collaborative tone",
  "memoryCallout": "string or null — brief reference to a specific past decision",
  "directions": [
    {
      "id": "A",
      "label": "Short label (2-4 words)",
      "whatWillChange": "1 sentence describing what will actually change",
      "whyItMatters": "1 sentence on the coaching rationale — may reference past decisions",
      "editRequest": "The specific, concrete edit request string to send to the edit engine"
    }
  ]
}

For highly specific requests:
{
  "shouldSkipDirections": true,
  "directEditRequest": "the user's request, cleaned up if needed — preserve the specific exercise name or detail"
}

CURRENT TRAINING SYSTEM:
${systemContext}`;
}

// ─── AI Call ──────────────────────────────────────────────────────────────────

async function callDirectionsAI(
  userRequest: string,
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string
): Promise<DirectionsResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildDirectionsSystemPrompt(
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.DIRECTIONS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest },
        ],
        max_tokens: 900,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "OpenAI directions API error");
      return null;
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as DirectionsResponse;

    // Field-level validation: a valid response must either skip directions
    // (shouldSkipDirections + directEditRequest) or provide a non-empty
    // directions array. If neither holds, fall back rather than passing
    // undefined fields downstream.
    const isSkip = parsed?.shouldSkipDirections === true && typeof parsed.directEditRequest === "string" && parsed.directEditRequest.trim().length > 0;
    const hasDirections = Array.isArray(parsed?.directions) && parsed.directions.length > 0;
    if (!isSkip && !hasDirections) {
      logger.warn("[Directions] AI response missing required fields — using fallback");
      return buildFallbackDirections(userRequest, targetContext);
    }

    return parsed;
  } catch (err) {
    logger.error({ err }, "Failed to generate directions with AI");
    return null;
  }
}

// ─── Fallback Directions ──────────────────────────────────────────────────────

function buildFallbackDirections(
  request: string,
  targetContext?: TargetContext
): DirectionsResponse {
  const type = targetContext?.type ?? "session";
  const label = targetContext?.label ?? "this";

  if (type === "exercise") {
    return {
      shouldSkipDirections: false,
      coachMessage: `Let's figure out the best way to adjust ${label}. Here are a few directions we can go:`,
      directions: [
        {
          id: "A",
          label: "Easier Variation",
          whatWillChange: "Regression applied — lighter load guidance or simpler variation",
          whyItMatters: "Builds movement quality without accumulating unnecessary fatigue",
          editRequest: `Make ${label} an easier variation`,
        },
        {
          id: "B",
          label: "Harder Progression",
          whatWillChange: "Harder variation or tempo prescription applied",
          whyItMatters: "Pushes adaptation when the current stimulus is no longer challenging",
          editRequest: `Make ${label} a harder variation`,
        },
        {
          id: "C",
          label: "Swap Exercise",
          whatWillChange: "Replace with a different movement in the same pattern",
          whyItMatters: "Variety reduces staleness and targets the pattern from a new angle",
          editRequest: `Swap ${label} for a suitable alternative`,
        },
      ],
    };
  }

  if (type === "session") {
    return {
      shouldSkipDirections: false,
      coachMessage: `Based on what we've built, let's look at a few directions for ${label}:`,
      directions: [
        {
          id: "A",
          label: "Reduce Fatigue",
          whatWillChange: "Volume pulled back, accessories trimmed",
          whyItMatters: "Protects recovery without skipping the session",
          editRequest: `Reduce volume and fatigue on ${label}`,
        },
        {
          id: "B",
          label: "Increase Intensity",
          whatWillChange: "Load targets elevated, intensity cues added",
          whyItMatters: "Drives strength adaptation when readiness is high",
          editRequest: `Increase intensity on ${label}`,
        },
        {
          id: "C",
          label: "Shift to Recovery",
          whatWillChange: "Session type changed, exercises lightened",
          whyItMatters: "Sometimes the best training decision is to move well, not hard",
          editRequest: `Convert ${label} to an active recovery session`,
        },
      ],
    };
  }

  // Phase / block fallback — show block-appropriate options
  if (type === "phase") {
    return {
      shouldSkipDirections: false,
      coachMessage: `Let's figure out the best direction for ${label}. Here are a few ways we can evolve this block:`,
      directions: [
        {
          id: "A",
          label: "More Power Focus",
          whatWillChange: "Add explosive/reactive work, reduce non-essential accessory density",
          whyItMatters: "Increases force-expression capacity and athletic transfer",
          editRequest: `Increase power bias for ${label}: add more explosive and reactive work, bias session architecture toward force-expression`,
        },
        {
          id: "B",
          label: "Shift to Hypertrophy",
          whatWillChange: "Rep ranges pushed to 8-12+, more accessory volume added",
          whyItMatters: "Builds muscle base that underpins long-term strength and power gains",
          editRequest: `Shift ${label} toward hypertrophy: increase rep ranges, add accessory volume, extend time under tension`,
        },
        {
          id: "C",
          label: "Reduce Overall Load",
          whatWillChange: "Volume and intensity pulled back, accessory work trimmed",
          whyItMatters: "Prevents overreaching and allows better recovery and long-term progress",
          editRequest: `Reduce overall volume and intensity in ${label}: pull back accessory sets, lower intensity targets`,
        },
        {
          id: "D",
          label: "Simplify the Block",
          whatWillChange: "Fewer exercises per session, cleaner movement focus",
          whyItMatters: "Reduces complexity and keeps training sustainable over the full block",
          editRequest: `Simplify ${label}: reduce exercise variety, focus on fewer high-quality movements per session`,
        },
      ],
    };
  }

  return {
    shouldSkipDirections: false,
    coachMessage: "Let's look at a few directions we can take this:",
    directions: [
      {
        id: "A",
        label: "Reduce Load",
        whatWillChange: "Volume and intensity pulled back",
        whyItMatters: "Prevents overreaching and keeps long-term progress on track",
        editRequest: `Reduce volume and intensity: ${request}`,
      },
      {
        id: "B",
        label: "Push Forward",
        whatWillChange: "Intensity and volume targets elevated",
        whyItMatters: "Capitalizes on high readiness to drive adaptation",
        editRequest: `Increase intensity: ${request}`,
      },
    ],
  };
}

// ─── Coaching Fail-Safe Messages ─────────────────────────────────────────────
// When a direct command is detected but cannot be routed to a specific engine,
// return a coaching message instead of a chooser modal.

function buildCoachingFailSafe(
  request: string,
  targetContext?: TargetContext
): DirectionsResponse {
  const label = targetContext?.label ?? "this exercise";
  const lower = request.toLowerCase();

  // Explosive/plyometric constraint
  if (/\b(depth jump|hurdle jump|box jump|broad jump)\b/i.test(label) && /\b(reps?|increase)\b/.test(lower) && /\d/.test(lower)) {
    return {
      shouldSkipDirections: true,
      directEditRequest: request,
      coachMessage: `${label} typically stays under 5 reps to maintain explosiveness and protect landing mechanics. Want to increase height or distance instead?`,
    };
  }

  // Generic coaching fallback for direct commands that can't be parsed further
  return {
    shouldSkipDirections: true,
    directEditRequest: request,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateDirections(
  userRequest: string,
  fullSystem: any,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string,
  continuityPrompt?: string | null
): Promise<DirectionsResponse> {
  const contextType = (targetContext?.type ?? "unknown") as "exercise" | "block" | "session" | "week" | "unknown";

  // ── COMMAND PRIORITY SYSTEM — Phase D ─────────────────────────────────────
  // isDirectUserCommand() is checked FIRST, before any AI call or fallback.
  // If true: the request bypasses ALL chooser modals, period.
  // The AI and fallback are NOT allowed to override this.
  const isDirect = isDirectUserCommand(userRequest);

  // Fast path: rule-based specificity check
  const specificity = checkSpecificity(userRequest, targetContext);
  if (specificity.isSpecific) {
    logCommandRouting(userRequest, true, contextType, "parser", "checkSpecificity returned isSpecific — fast path bypass");
    return {
      shouldSkipDirections: true,
      directEditRequest: specificity.directEditRequest,
    };
  }

  // If direct command detected but not caught by specificity rules,
  // still bypass chooser — send to edit engine directly.
  if (isDirect) {
    logCommandRouting(userRequest, true, contextType, "parser", "isDirectUserCommand=true but specificity=false — forcing bypass");
    return {
      shouldSkipDirections: true,
      directEditRequest: userRequest,
    };
  }

  // Not a direct command — try AI
  logCommandRouting(userRequest, false, contextType, "ai", "non-direct command — calling AI for directions");

  const systemContext = serializeSystemForPrompt(fullSystem);

  const aiResult = await callDirectionsAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext
  );

  if (!aiResult) {
    // ── FAIL SAFE: AI unavailable ─────────────────────────────────────────
    // If the command was direct but specificity missed it (edge case),
    // return coaching message — NEVER show chooser for a direct command.
    if (isDirect) {
      logCommandRouting(userRequest, true, contextType, "coaching_message", "AI unavailable, direct command — coaching fail-safe");
      return { ...buildCoachingFailSafe(userRequest, targetContext), continuityPrompt: continuityPrompt ?? null };
    }
    // Genuinely non-direct command with no AI — show fallback chooser
    logCommandRouting(userRequest, false, contextType, "chooser", "AI unavailable, non-direct — showing fallback chooser");
    const fallback = buildFallbackDirections(userRequest, targetContext);
    return { ...fallback, continuityPrompt: continuityPrompt ?? null };
  }

  // ── AI returned: guard against AI overriding direct commands ──────────────
  // The AI prompt already instructs shouldSkipDirections: true for direct
  // commands, but we enforce it here as a hard guardrail.
  if (aiResult.shouldSkipDirections) {
    // Prefer alias-resolved named exercise command if available
    const namedCommand = detectNamedExerciseCommand(userRequest);
    if (namedCommand && targetContext?.label) {
      const editRequest = `Replace ${targetContext.label} with ${namedCommand.targetExercise}`;
      logCommandRouting(userRequest, true, contextType, "parser", `AI skipped + named exercise resolved: ${namedCommand.targetExercise}`);
      return {
        shouldSkipDirections: true,
        directEditRequest: editRequest,
        continuityPrompt: continuityPrompt ?? null,
      };
    }
    logCommandRouting(userRequest, true, contextType, "parser", "AI returned shouldSkipDirections=true");
    return {
      ...aiResult,
      continuityPrompt: continuityPrompt ?? null,
    };
  }

  // ── CRITICAL GUARDRAIL: AI returned chooser for a direct command ──────────
  // This must NEVER happen. If isDirectUserCommand is true and AI still
  // returned directions, we override and bypass the chooser.
  if (isDirect) {
    logCommandRouting(
      userRequest, true, contextType, "parser",
      "GUARDRAIL: AI returned directions for direct command — overriding to bypass chooser"
    );
    return {
      shouldSkipDirections: true,
      directEditRequest: aiResult.directEditRequest ?? userRequest,
      continuityPrompt: continuityPrompt ?? null,
    };
  }

  // Non-direct command, AI returned valid directions — show chooser
  logCommandRouting(userRequest, false, contextType, "chooser", "AI returned directions for non-direct command");
  return {
    ...aiResult,
    continuityPrompt: continuityPrompt ?? null,
  };
}
