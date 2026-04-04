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
1. Recognize it as highly specific (e.g. "swap bench for dumbbell press") → execute directly
2. Recognize it as open-ended (e.g. "make this better", "reduce fatigue") → generate 2-4 direction options

DECISION RULES:
- "Highly specific" means the request names EXACTLY what to change AND exactly how (swap X for Y, change reps to Z, remove exercise X).
- "Open-ended" means the user states a goal or direction without specifying exact changes.
- When in doubt, offer directions — collaboration > automation.

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
  adaptationContext?: string,
  decisionMemoryContext?: string,
  continuityPrompt?: string | null
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
    adaptationContext,
    decisionMemoryContext
  );

  if (!aiResult) {
    const fallback = buildFallbackDirections(userRequest, targetContext);
    return { ...fallback, continuityPrompt: continuityPrompt ?? null };
  }

  // Attach the rule-based continuity prompt from decision memory
  // (only if AI didn't already embed it in the coach message)
  return {
    ...aiResult,
    continuityPrompt: continuityPrompt ?? null,
  };
}
