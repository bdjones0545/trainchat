import { getGuestSession, updateGuestSession } from "./guestService";
import { logger } from "./logger";
import { OPENAI_MODELS } from "./openai-models";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GuestChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Structured program extracted from a chat response — same shape as ChatProgram */
export interface GuestChatProgram {
  programName: string;
  description?: string;
  splitType?: string;
  progressionStrategy?: string;
  days: Array<{
    dayNumber: number;
    name: string;
    focus?: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: string;
      rest: string;
      notes?: string;
    }>;
    notes?: string;
  }>;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildGuestChatSystemPrompt(turnNumber: number): string {
  return `You are TrainChat — an elite AI performance architect. You build personalized training systems through conversation. You feel less like a chatbot and more like an intelligent system that is actively constructing something for the user in real time.

## YOUR IDENTITY
You are fast, precise, and confident. You do not ask unnecessary questions. You make intelligent inferences from minimal input and start building immediately. You reveal your work progressively — structure first, then details, then refinements.

## PRODUCT RULE — NON-NEGOTIABLE
BUILD FIRST. REFINE SECOND. ALWAYS.

The user should never feel interrogated. They should feel like they said something and immediately something was built for them.

## BUILD-FIRST PROTOCOL

### When the user's message contains: days + goal OR days + sport OR sport + goal
→ SKIP ALL QUESTIONS. Show the FULL WEEKLY STRUCTURE immediately. No preamble. Just build.
→ Confirm in 1 line what you built ("3-day strength program with soccer focus — here's your split:"), then show the program.
→ After showing structure, ask ONE refinement question at the end.

### When the user's message is missing only ONE piece of info (e.g., days not stated)
→ Use smart defaults for everything missing (full gym, intermediate, 60min, 3 days)
→ Echo what you understood, SHOW partial structure, then ask ONE targeted question.

### NEVER:
- Ask multiple questions in one response
- Delay showing structure until you have "complete" information
- Say "I need a few things first" or run an intake form
- Ask about equipment, experience, AND days all at once

## SMART DEFAULTS (always apply when info is missing)
- Experience not stated → intermediate
- Equipment not stated → full gym
- Days not stated → ask ONCE how many days per week; if no answer, default to 3 days
- Goal is vague → athletic performance + strength
- Sport detected → athletic performance bias + sport-specific exercises

## LANGUAGE STYLE
- Short, punchy sentences
- No filler: never say "Great!", "Sure!", "Of course!", "Absolutely!"
- Signal momentum: "Building your split...", "Here's your structure...", "Program is live..."
- Sound like a confident coach who already knows what to do
- Use "your" language: "your split", "your system", "your Day 1"

## RESPONSE FORMAT
- Use **bold** for day headers
- List exercises clearly with sets×reps
- Max 2 sentences of prose before showing program content
- Always end with ONE refinement question

## NSCA STANDARDS (always apply)
Exercise order within sessions:
1. Plyometric/Explosive (CNS fresh)
2. Olympic lifts / High-skill power
3. Primary compounds (squat, deadlift, bench, press, row)
4. Secondary compounds
5. Accessory / Isolation
6. Conditioning last

Rep zones:
- Strength: 1–6 reps | 3–6 sets | 2–5 min rest
- Hypertrophy: 6–12 reps | 3–4 sets | 60–90 sec rest
- Endurance: 12+ reps | 2–3 sets | 30–60 sec rest

## CURRENT TURN: ${turnNumber}
${turnNumber === 1
  ? `TURN 1 — BUILD-FIRST RULES:
If the user stated days + goal/sport → SHOW THE FULL SPLIT NOW. No questions first.
Format: 1 confirmation line → full weekly split with exercises → 1 refinement question.
If days NOT stated → echo goal/sport, show Day 1 structure as a preview, ask ONE question (days per week).
NEVER ask about equipment, experience, AND days in the same message.`
  : turnNumber === 2
  ? "TURN 2 — Show the COMPLETE WEEKLY SPLIT if not already shown. Include all days with exercises, sets×reps. This is the 'wow' moment. End with one refinement question."
  : "TURN 3+ — Expand and refine. Add progression detail, adjust based on feedback. The system is real — make it great."}`;
}

// ─── Program structure extraction ────────────────────────────────────────────

/** Returns true if the assistant message looks like it contains a training program */
function looksLikeProgram(content: string): boolean {
  return (
    /Day\s+\d|Upper\s|Lower\s|Push\s|Pull\s|Legs\s|Full Body/.test(content) &&
    /×|\bsets?\b|\breps?\b|4×|3×|2×/.test(content)
  );
}

/** Call OpenAI to extract a structured program JSON from assistant text */
async function extractProgramJSON(
  assistantText: string,
  apiKey: string
): Promise<GuestChatProgram | null> {
  const extractionPrompt = `Extract the training program from the following assistant message and return ONLY valid JSON matching this exact structure. No markdown, no explanation — pure JSON only.

Structure:
{
  "programName": "string (e.g. '4-Day Upper/Lower Split')",
  "splitType": "string (e.g. 'Upper/Lower', 'Full Body', 'Push/Pull/Legs')",
  "progressionStrategy": "string (brief, optional)",
  "days": [
    {
      "dayNumber": 1,
      "name": "string (e.g. 'Upper Strength')",
      "focus": "string (e.g. 'Strength')",
      "exercises": [
        {
          "name": "string",
          "sets": 4,
          "reps": "4-6",
          "rest": "3 min",
          "notes": "optional string"
        }
      ],
      "notes": "optional string"
    }
  ]
}

If the message does not contain a full program, return: {"error": "no_program"}

Assistant message to extract from:
${assistantText.slice(0, 2000)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODELS.ROUTING,
        messages: [{ role: "user", content: extractionPrompt }],
        max_tokens: 1200,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content?.trim() ?? "";

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);

    if (parsed.error || !parsed.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      return null;
    }

    return parsed as GuestChatProgram;
  } catch {
    return null;
  }
}

// ─── OpenAI Call (conversational, non-JSON) ───────────────────────────────────

async function callOpenAIChat(
  messages: GuestChatMessage[],
  turnNumber: number,
  maxTokens = 700
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODELS.GUEST_RESPONSE,
      messages: [
        { role: "system", content: buildGuestChatSystemPrompt(turnNumber) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: maxTokens,
      temperature: 0.65,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return data.choices[0]?.message?.content ?? "";
}

// ─── Fallback responses (used when OpenAI is unavailable) ─────────────────────

function extractDaysFromMessage(lower: string): number | null {
  const patterns = [
    /\b(\d)\s*[\-–]?\s*day(?:s)?\s*(?:a|per)\s*week\b/i,
    /\b(\d)\s*[\-–]?\s*day\s+(?:program|split|routine|plan|strength|training)\b/i,
    /\b(\d)\s*[\-–]?\s*day\s+\w+\s+(?:program|split|routine|plan|training)\b/i,
    /\b(\d)\s+times?\s*(?:a|per)\s*week\b/i,
    /\btrain(?:ing)?\s+(\d)\s+days?\b/i,
    /\bgive\s+me\s+a\s+(\d)\s*[\-–]?\s*day\b/i,
    /\b(\d)\s*[\-–]?\s*days?\s+(?:a\s+week|per\s+week|weekly)?\b/i,
  ];
  for (const pat of patterns) {
    const m = lower.match(pat);
    if (m) {
      const raw = parseInt(m[1], 10);
      if (raw >= 1 && raw <= 7) return raw;
    }
  }
  return null;
}

function buildFallbackStructure(days: number, sport: string | null, goal: string): string {
  const sportLine = sport ? ` with ${sport} performance focus` : "";

  if (days <= 3) {
    return `**Your ${days}-Day Full Body Split${sportLine}**\n\n**Day 1 — Full Body A**\nBox Jump 3×5, Squat 4×4-6, Romanian Deadlift 3×6, Barbell Row 3×6, Nordic Curl 3×8, Copenhagen Plank 3×20s\n\n**Day 2 — Full Body B**\nDeadlift 4×3-5, Incline Press 3×6, Pull-Up 3×6, Bulgarian Split Squat 3×8, Lateral Raise 3×12, Core Circuit\n\n**Day 3 — Full Body C**\nPower Clean 4×3, Front Squat 3×5, Bench Press 3×5, Cable Row 3×8, Hip Thrust 3×10, Calf Raise 3×15\n\nThis is your foundation. Want me to add sets, reps, and progressions?`;
  }

  if (days === 4) {
    return `**Your 4-Day Upper/Lower Split${sportLine}**\n\n**Day 1 — Upper Strength**\nBench Press 4×4, Barbell Row 4×4, Overhead Press 3×5, Weighted Pull-Up 3×5\n\n**Day 2 — Lower Strength**\nSquat 4×4, Romanian Deadlift 3×6, Leg Press 3×8, Nordic Curl 3×8\n\n**Day 3 — Upper Hypertrophy**\nIncline DB Press 4×10, Cable Row 4×10, DB Shoulder Press 3×12, Lat Pulldown 3×12\n\n**Day 4 — Lower Hypertrophy**\nFront Squat 4×8, Leg Curl 4×10, Bulgarian Split Squat 3×12, Calf Raise 4×15\n\nThis is your system. Want me to add progressions and weekly structure?`;
  }

  return `**Your 5-Day Push/Pull/Legs Split${sportLine}**\n\n**Day 1 — Push**\nBench Press 4×4, Overhead Press 3×5, Incline DB Press 3×10, Lateral Raise 3×12\n\n**Day 2 — Pull**\nDeadlift 4×3, Barbell Row 4×5, Pull-Up 3×6, Face Pull 3×15\n\n**Day 3 — Legs**\nSquat 4×4, Romanian Deadlift 3×6, Leg Press 3×10, Nordic Curl 3×8\n\n**Day 4 — Push (Volume)**\nIncline Barbell Press 4×8, DB Press 3×12, Tricep Work 3×12, Shoulder Circuit\n\n**Day 5 — Pull (Volume)**\nTrap Bar Deadlift 3×8, Cable Row 4×10, Lat Pulldown 3×12, Bicep Work 3×12\n\nFull structure is ready. Want sets/reps breakdowns and progression?`;
}

function buildFallbackResponse(
  userMessage: string,
  turnNumber: number
): string {
  const lower = userMessage.toLowerCase();

  const detectedDays = extractDaysFromMessage(lower);
  const hasSport = /soccer|basketball|baseball|tennis|hockey|rugby|mma|wrestling|volleyball|lacrosse|track|sprint|swimming|cycling|golf|football|futbol/.test(lower);
  const sportName = hasSport
    ? (lower.match(/soccer|futbol|football/) ? "soccer"
      : lower.match(/basketball/) ? "basketball"
      : lower.match(/baseball/) ? "baseball"
      : lower.match(/tennis/) ? "tennis"
      : lower.match(/hockey/) ? "hockey"
      : lower.match(/mma|wrestling|jiu.?jitsu|boxing/) ? "combat sports"
      : lower.match(/track|sprint/) ? "track"
      : lower.match(/swimming/) ? "swimming"
      : lower.match(/volleyball/) ? "volleyball"
      : "sport")
    : null;
  const goalStr = lower.match(/strength|strong|power/) ? "strength"
    : lower.match(/muscle|hypertrophy|size|bulk/) ? "hypertrophy"
    : lower.match(/fat|lean|cut|shred/) ? "fat loss"
    : hasSport ? "athletic performance"
    : "strength";

  if (turnNumber === 1) {
    if (detectedDays !== null) {
      const structure = buildFallbackStructure(detectedDays, sportName, goalStr);
      const goalLabel = hasSport ? `${sportName} performance + ${goalStr}` : goalStr;
      return `Got it — ${detectedDays}-day ${goalLabel} program. Building your split now.\n\n${structure}`;
    }

    if (hasSport) {
      return `${sportName ? sportName.charAt(0).toUpperCase() + sportName.slice(1) : "Sport"} performance + strength. I'm already mapping a sport-specific protocol.\n\nOne question: how many training days per week do you have?`;
    }
    if (lower.match(/muscle|hypertrophy|size|bulk/)) {
      return `Hypertrophy focus — I'm mapping your split now.\n\nHow many days per week can you commit to?`;
    }
    if (lower.match(/strength|strong|power|lift/)) {
      return `Strength focus. Already structuring your progression model.\n\nHow many days per week are you training?`;
    }
    if (lower.match(/fat|weight|lean|cut|lose|shred/)) {
      return `Body recomposition — building your plan now.\n\nHow many days per week do you have?`;
    }
    return `Understood. Building your structure now.\n\nOne thing: how many days per week are you training?`;
  }

  if (turnNumber === 2) {
    const days = detectedDays ?? 3;
    return buildFallbackStructure(days, sportName, goalStr);
  }

  return `Building on that now. The structure is locked in — let me refine the details for you.`;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export const GUEST_CHAT_LIMIT = 8;

export interface GuestChatResult {
  response: string;
  messageCount: number;
  limitReached: boolean;
  turnNumber: number;
  /** Structured program JSON if this response contained a full program — used for the program panel and conversion */
  guestProgram?: GuestChatProgram;
}

export async function processGuestChat(
  deviceId: string,
  userMessage: string,
  history: GuestChatMessage[]
): Promise<GuestChatResult> {
  const session = await getGuestSession(deviceId);
  if (!session) throw new Error("Guest session not found");
  if (session.status === "blocked") throw new Error("Device blocked");

  const currentCount = session.teaserUsesCount ?? 0;

  if (currentCount >= GUEST_CHAT_LIMIT) {
    return {
      response: "",
      messageCount: currentCount,
      limitReached: true,
      turnNumber: currentCount,
    };
  }

  const turnNumber = currentCount + 1;

  const fullHistory: GuestChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  let response: string;
  try {
    response = await callOpenAIChat(fullHistory, turnNumber);
    if (!response.trim()) throw new Error("Empty response");
  } catch (err: any) {
    if (err.message !== "NO_API_KEY") {
      logger.warn({ err: err.message, deviceId }, "Guest chat OpenAI failed — using fallback");
    }
    response = buildFallbackResponse(userMessage, turnNumber);
  }

  const newCount = currentCount + 1;
  const limitReached = newCount >= GUEST_CHAT_LIMIT;

  // Persist conversation history and update count
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const existingHistory = Array.isArray(meta.chatHistory)
    ? (meta.chatHistory as GuestChatMessage[])
    : [];

  const updatedHistory: GuestChatMessage[] = [
    ...existingHistory,
    { role: "user", content: userMessage },
    { role: "assistant", content: response },
  ];

  // Phase 3: If the response looks like a program, extract structured JSON in the background
  // Only attempt on turns 1–3 when programs are first built, and only if no program exists yet
  let guestProgram: GuestChatProgram | undefined;
  const existingProgram = meta.chatProgramJSON as GuestChatProgram | undefined;
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && looksLikeProgram(response) && turnNumber <= 4) {
    try {
      const extracted = await extractProgramJSON(response, apiKey);
      if (extracted) {
        guestProgram = extracted;
        logger.info(
          { deviceId, turnNumber, programName: extracted.programName, days: extracted.days.length },
          "[GuestChat] Structured program extracted from response"
        );
      }
    } catch (err: any) {
      logger.warn({ err: err.message, deviceId }, "[GuestChat] Program extraction failed — ignoring");
    }
  } else if (existingProgram) {
    // Return the existing stored program on subsequent turns so the panel stays visible
    guestProgram = existingProgram;
  }

  await updateGuestSession(deviceId, {
    teaserUsesCount: newCount,
    firstProgramGeneratedAt: session.firstProgramGeneratedAt ?? new Date(),
    metadata: {
      ...meta,
      chatHistory: updatedHistory,
      // Store the latest extracted program (or keep existing if no new one was found)
      ...(guestProgram ? { chatProgramJSON: guestProgram } : {}),
      ...(limitReached ? { paywallTriggeredAt: new Date().toISOString() } : {}),
    },
  });

  logger.info(
    { deviceId, messageCount: newCount, turnNumber, limitReached, hasProgramJSON: !!guestProgram },
    "Guest chat message processed"
  );

  return {
    response,
    messageCount: newCount,
    limitReached,
    turnNumber,
    ...(guestProgram ? { guestProgram } : {}),
  };
}
