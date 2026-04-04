/**
 * Directions Service — Phase A: Collaborative Decision Layer
 *
 * Interprets a user's edit intent and returns either:
 * - 2–4 intelligent direction options for the user to choose from, OR
 * - A signal to skip directions and execute directly (for highly specific requests)
 *
 * This sits BEFORE the edit engine in the flow:
 *   User intent → directions → user chooses → edit engine executes
 */

import { logger } from "./logger";
import { serializeSystemForPrompt, type TargetContext } from "./edit-intent-service";
import { buildAdaptationContext } from "./adaptation";

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
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildDirectionsSystemPrompt(
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string
): string {
  const targetFocus = targetContext
    ? `\nEDIT FOCUS:\nThe user is specifically targeting: ${targetContext.type.toUpperCase()} "${targetContext.label ?? ""}"${targetContext.parentLabel ? ` in ${targetContext.parentLabel}` : ""}.\n`
    : "";

  const adaptationSection = adaptationContext
    ? `\nATHLETE STATE:\n${adaptationContext}\n`
    : "";

  return `You are an elite performance coach helping a user decide how to evolve their training system.

Your job is to interpret their edit request and either:
1. Recognize it as highly specific (e.g. "swap bench for dumbbell press") → execute directly
2. Recognize it as open-ended (e.g. "make this better", "reduce fatigue") → generate 2-4 direction options
${targetFocus}${adaptationSection}
DECISION RULES:
- "Highly specific" means the request names EXACTLY what to change AND exactly how (swap X for Y, change reps to Z, remove exercise X).
- "Open-ended" means the user states a goal or direction without specifying exact changes.
- When in doubt, offer directions — collaboration > automation.

FOR OPEN-ENDED REQUESTS:
Generate 2-4 meaningful directions the user could take. Each direction should:
- Be genuinely different from the others (not just variations of the same thing)
- Be grounded in the user's goal, current system structure, and athlete state if available
- Feel like options a smart coach would actually offer
- Include a concrete editRequest string (the specific request that will be sent to the edit engine if this direction is chosen)

COACH MESSAGE:
Write a brief, collaborative intro (1-2 sentences). Use "we", "let's", "based on what we've built".
Keep it warm and direct. Never say "here is your new program".

OUTPUT FORMAT — return ONLY valid JSON:

For open-ended requests:
{
  "shouldSkipDirections": false,
  "coachMessage": "string — 1-2 sentences, collaborative tone",
  "directions": [
    {
      "id": "A",
      "label": "Short label (2-4 words)",
      "whatWillChange": "1 sentence describing what will actually change",
      "whyItMatters": "1 sentence on the coaching rationale",
      "editRequest": "The specific, concrete edit request string to send to the edit engine"
    }
  ]
}

For highly specific requests:
{
  "shouldSkipDirections": true,
  "directEditRequest": "the user's request, cleaned up if needed"
}

CURRENT TRAINING SYSTEM:
${systemContext}`;
}

// ─── AI Call ──────────────────────────────────────────────────────────────────

async function callDirectionsAI(
  userRequest: string,
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string
): Promise<DirectionsResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildDirectionsSystemPrompt(systemContext, targetContext, adaptationContext);

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
        max_tokens: 800,
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

// ─── Rule-Based Specificity Check ─────────────────────────────────────────────

function isHighlySpecific(request: string): boolean {
  const lower = request.toLowerCase();
  const specificPatterns = [
    /swap .+ for .+/i,
    /replace .+ with .+/i,
    /change .+ to .+/i,
    /add a set/i,
    /remove a set/i,
    /remove .+ exercise/i,
    /delete .+ exercise/i,
    /change (the )?reps? (range )?to \d/i,
    /change (the )?sets? to \d/i,
    /make it shoulder.?friendly/i,
    /add explosive cue/i,
  ];
  return specificPatterns.some((p) => p.test(lower));
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
          whatWillChange: "Regression cue added, lighter load guidance",
          whyItMatters: "Builds movement quality without accumulating unnecessary fatigue",
          editRequest: `Make ${label} an easier variation`,
        },
        {
          id: "B",
          label: "Harder Progression",
          whatWillChange: "Progression trigger added, intensity cue updated",
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
  adaptationContext?: string
): Promise<DirectionsResponse> {
  // Fast path: rule-based specificity check
  if (isHighlySpecific(userRequest)) {
    return { shouldSkipDirections: true, directEditRequest: userRequest };
  }

  const systemContext = serializeSystemForPrompt(fullSystem);

  const aiResult = await callDirectionsAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext
  );

  if (!aiResult) {
    return buildFallbackDirections(userRequest, targetContext);
  }

  return aiResult;
}
