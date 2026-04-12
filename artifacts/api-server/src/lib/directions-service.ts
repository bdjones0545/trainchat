/**
 * Directions Service — Phase A + Phase B
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
 */

import { logger } from "./logger";
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
 * Detect direct prescription changes (e.g. "add a set", "change reps to 5").
 */
function isDirectPrescriptionChange(request: string): boolean {
  const lower = request.toLowerCase();
  return [
    /\badd\s+a?\s+set\b/i,
    /\b(remove|drop|cut)\s+a?\s+set\b/i,
    /\bmore\s+sets?\b/i,
    /\bfewer\s+sets?\b/i,
    /\bone\s+more\s+set\b/i,
    /\bchange\s+(the\s+)?reps?\s+(range\s+)?to\s+\d/i,
    /\bchange\s+(the\s+)?sets?\s+to\s+\d/i,
    /\bchange\s+(the\s+)?rest\s+to\b/i,
    /\bmake\s+it\s+shoulder.?friendly\b/i,
    /\badd\s+explosive\s+cue\b/i,
    /\bremove\s+(the\s+)?(exercise|this)\b/i,
    /\bdelete\s+(the\s+)?(exercise|this)\b/i,
    /\bshorten(er)?\s+(the\s+)?rest\b/i,
    /\bmore\s+rest\b/i,
    /\bless\s+rest\b/i,
  ].some((p) => p.test(lower));
}

// ─── Specificity Check (combined) ────────────────────────────────────────────

/**
 * Returns { isSpecific, directEditRequest } when the request should skip
 * the directions chooser and go straight to the edit engine.
 */
function checkSpecificity(
  request: string,
  targetContext?: TargetContext
): { isSpecific: true; directEditRequest: string } | { isSpecific: false } {
  // 1. Direct prescription change patterns
  if (isDirectPrescriptionChange(request)) {
    return { isSpecific: true, directEditRequest: request };
  }

  // 2. Named exercise command (most common source of false positives before this fix)
  const namedCommand = detectNamedExerciseCommand(request);
  if (namedCommand) {
    const exerciseName = targetContext?.label ?? "this exercise";
    // Build a clean, unambiguous edit request so the edit engine gets full context
    const editRequest = `Replace ${exerciseName} with ${namedCommand.targetExercise}`;
    logger.info(
      { original: request, resolved: namedCommand.targetExercise, editRequest },
      "Direct named-exercise command detected — skipping directions"
    );
    return { isSpecific: true, directEditRequest: editRequest };
  }

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
- Request names a specific exercise to swap TO: "use X", "try X instead", "swap to X", "change to X"
- Request names BOTH exercises: "swap bench for dumbbell press"
- Request specifies a clear variation: "make this a pause squat", "add a 2-second pause"
- Request specifies an exact prescription: "change to 5 reps", "add a set", "shorten rest to 90s"
- Request names a known exercise abbreviation: RFESS, RDL, SSB, etc.
- Any request where the TARGET of the change is unambiguous — even if only one exercise is named

DECISION RULES — OPEN-ENDED (show directions):
- User states a vague goal: "make this better", "I don't like this", "change this", "something else"
- User asks for a direction without naming a specific change: "more variety", "can we try something new"
- Request is ambiguous and multiple interpretations are plausible

IMPORTANT: err toward shouldSkipDirections: true when ANY specific exercise name, variation, or prescription detail appears. Only show directions when the request contains NO specific target.

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
        model: "gpt-4o",
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
    return JSON.parse(raw) as DirectionsResponse;
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

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateDirections(
  userRequest: string,
  fullSystem: any,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string,
  continuityPrompt?: string | null
): Promise<DirectionsResponse> {
  // Fast path: rule-based specificity check (expanded Phase C)
  const specificity = checkSpecificity(userRequest, targetContext);
  if (specificity.isSpecific) {
    return {
      shouldSkipDirections: true,
      directEditRequest: specificity.directEditRequest,
    };
  }

  const systemContext = serializeSystemForPrompt(fullSystem);

  const aiResult = await callDirectionsAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext
  );

  if (!aiResult) {
    const fallback = buildFallbackDirections(userRequest, targetContext);
    return { ...fallback, continuityPrompt: continuityPrompt ?? null };
  }

  // Guard: if AI says skip AND includes a directEditRequest, trust it directly
  // If AI says skip but the original request contained a named exercise,
  // prefer our resolved version (alias-expanded).
  if (aiResult.shouldSkipDirections) {
    const namedCommand = detectNamedExerciseCommand(userRequest);
    if (namedCommand && targetContext?.label) {
      const editRequest = `Replace ${targetContext.label} with ${namedCommand.targetExercise}`;
      return {
        shouldSkipDirections: true,
        directEditRequest: editRequest,
        continuityPrompt: continuityPrompt ?? null,
      };
    }
    return {
      ...aiResult,
      continuityPrompt: continuityPrompt ?? null,
    };
  }

  // Attach the rule-based continuity prompt from decision memory
  return {
    ...aiResult,
    continuityPrompt: continuityPrompt ?? null,
  };
}
