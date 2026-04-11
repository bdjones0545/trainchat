import { getGuestSession, updateGuestSession } from "./guestService";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GuestChatMessage {
  role: "user" | "assistant";
  content: string;
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
→ Use smart defaults for everything missing (full gym, intermediate, 60min, 4 days)
→ Echo what you understood, SHOW partial structure, then ask ONE targeted question.

### NEVER:
- Ask multiple questions in one response
- Delay showing structure until you have "complete" information
- Say "I need a few things first" or run an intake form
- Ask about equipment, experience, AND days all at once

## SMART DEFAULTS (always apply when info is missing)
- Experience not stated → intermediate
- Equipment not stated → full gym
- Days not stated → 4 days (or ask ONCE and default to 4 if no answer)
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
      model: "gpt-4o",
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
    /\b(\d)\s+times?\s*(?:a|per)\s*week\b/i,
    /\btrain(?:ing)?\s+(\d)\s+days?\b/i,
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

  // Detect if key context is already in the message
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
    // If we already have enough context, build immediately — never ask blocking questions
    if (detectedDays !== null) {
      // Days stated — build structure immediately (turn 2 behavior)
      const structure = buildFallbackStructure(detectedDays, sportName, goalStr);
      const goalLabel = hasSport ? `${sportName} performance + ${goalStr}` : goalStr;
      return `Got it — ${detectedDays}-day ${goalLabel} program. Building your split now.\n\n${structure}`;
    }

    // No days stated — echo goal, signal building, ask ONE question
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
    // Check current message AND use detectedDays from it
    const days = detectedDays ?? 4;
    return buildFallbackStructure(days, sportName, goalStr);
  }

  return `Building on that now. The structure is locked in — let me refine the details for you.`;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export const GUEST_CHAT_LIMIT = 5;

export interface GuestChatResult {
  response: string;
  messageCount: number;
  limitReached: boolean;
  turnNumber: number;
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

  // Limit check
  if (currentCount >= GUEST_CHAT_LIMIT) {
    return {
      response: "",
      messageCount: currentCount,
      limitReached: true,
      turnNumber: currentCount,
    };
  }

  // Turn number = which user message this is (1-indexed)
  const turnNumber = currentCount + 1;

  // Build conversation for OpenAI
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

  await updateGuestSession(deviceId, {
    teaserUsesCount: newCount,
    firstProgramGeneratedAt: session.firstProgramGeneratedAt ?? new Date(),
    metadata: {
      ...meta,
      chatHistory: updatedHistory,
      ...(limitReached ? { paywallTriggeredAt: new Date().toISOString() } : {}),
    },
  });

  logger.info(
    { deviceId, messageCount: newCount, turnNumber, limitReached },
    "Guest chat message processed"
  );

  return {
    response,
    messageCount: newCount,
    limitReached,
    turnNumber,
  };
}
