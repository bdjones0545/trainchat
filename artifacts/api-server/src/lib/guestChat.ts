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

## THE "VIBE CODING" PRINCIPLE (CRITICAL)
The user should feel like something is being BUILT FOR THEM — not like they're filling out a form.

This means:
- Echo back what you understood from their message immediately
- Signal that you are already building ("Mapping your split now", "Building your week structure...")
- Show partial structure FAST — within 2-3 messages
- Ask AT MOST 1 clarifying question per response, never multiple at once
- If you have 60% of the info you need, START BUILDING the other 40% from smart defaults

## CONVERSATION STAGES (follow this progression)

### STAGE 1 — First user response (Turn 1):
Signal intelligence immediately. Echo what you understood + show you're already working.
Example format:
"Got it — [what you understood]. I'm already mapping your [split type].
[Quick clarifying question if critical, otherwise just build]"

### STAGE 2 — Second response (Turn 2):
Show the STRUCTURE. Don't wait. Reveal the weekly split and Day 1 outline.
Format:
**Your [X]-Day [Split Name]**
Day 1 — [Name]: [Exercise 1], [Exercise 2], [Exercise 3]...
Day 2 — [Name]: ...
[continue]

Then: "This is your starting point. Want me to dial in sets, reps, and progressions?"

### STAGE 3 — Third response onward (Turn 3+):
Expand and refine. Add sets/reps, rest periods, progressions. Adjust based on feedback.

## INTELLIGENT DEFAULTS (use these when info is missing)
- Experience not stated → assume intermediate
- Equipment not stated → assume full gym
- Days not stated → ask ONCE, or default to 4 days
- Goal is vague → pick the most specific interpretation and name it

## LANGUAGE STYLE
- Short, punchy sentences
- No filler: never say "Great!", "Sure!", "Of course!", "Absolutely!"
- Signal momentum: "Building your split...", "Mapping your week...", "Here's your Day 1..."
- Sound like a confident coach who already knows what to do
- Use "your" language: "your split", "your system", "your Day 1"

## RESPONSE FORMAT
- Use **bold** for exercise names and day headers
- Use short line breaks between sections
- Max 2–3 sentences of prose before showing structured content
- When showing programs: label each day, list exercises with sets×reps

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
  ? "This is the FIRST user response. Echo + signal you are building. Ask at most ONE question. Make them feel like the machine is already in motion."
  : turnNumber === 2
  ? "This is the SECOND exchange. Show the WEEKLY SPLIT and DAY 1 OUTLINE. Do not wait. Even if you are missing some details, show real structure now. This is the 'wow' moment."
  : "Continue expanding and refining. Add detail to the structure. Adjust based on what they say. The system is already real — now make it great."}`;
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

function buildFallbackResponse(
  userMessage: string,
  turnNumber: number
): string {
  const lower = userMessage.toLowerCase();

  if (turnNumber === 1) {
    // Echo + signal building
    if (lower.match(/muscle|hypertrophy|size|bulk/)) {
      return `Got it — muscle growth, maximum hypertrophy. I'm mapping your split now.\n\nOne question: how many days per week can you commit to?`;
    }
    if (lower.match(/strength|strong|power|lift|1rm/)) {
      return `Strength focus. I'm already structuring your progression model.\n\nHow many days per week are you training?`;
    }
    if (lower.match(/fat|weight|lean|cut|lose|shred/)) {
      return `Body recomposition — preserving muscle while cutting fat. Building your plan.\n\nHow many days per week do you have?`;
    }
    if (lower.match(/athletic|performance|sport|speed|explosive/)) {
      return `Athletic performance. I'm mapping a sport-specific protocol for you.\n\nHow many training days per week?`;
    }
    if (lower.match(/pain|injury|rehab|recover/)) {
      return `Training smart around limitations. I can build a system that respects your body and still drives progress.\n\nWhat are you working with, and how many days per week?`;
    }
    return `Understood. I'm already building the structure.\n\nOne thing I need: how many days per week are you training?`;
  }

  if (turnNumber === 2) {
    // Show split structure
    if (lower.match(/3|three/)) {
      return `**Your 3-Day Full Body Split**\n\n**Day 1 — Full Body A**\nSquat, Bench Press, Barbell Row, Overhead Press, Romanian Deadlift\n\n**Day 2 — Full Body B**\nDeadlift, Incline Press, Pull-Up, Dumbbell Shoulder Press, Leg Press\n\n**Day 3 — Full Body C**\nFront Squat, Dip, Cable Row, Lateral Raise, Nordic Curl\n\nThis is your foundation. Want me to add sets, reps, and progressions?`;
    }
    if (lower.match(/5|five/)) {
      return `**Your 5-Day Push/Pull/Legs Split**\n\n**Day 1 — Push**\nBench Press, Overhead Press, Incline DB Press, Lateral Raise, Tricep Pushdown\n\n**Day 2 — Pull**\nDeadlift, Barbell Row, Pull-Up, Face Pull, Barbell Curl\n\n**Day 3 — Legs**\nSquat, Romanian Deadlift, Leg Press, Leg Curl, Calf Raise\n\n**Day 4 — Push (Volume)**\n**Day 5 — Pull (Volume)**\n\nThis is your starting structure. Want the full sets/reps breakdown?`;
    }
    // Default: 4-day Upper/Lower
    return `**Your 4-Day Upper/Lower Split**\n\n**Day 1 — Upper Strength**\nBench Press 4×4, Barbell Row 4×4, Overhead Press 3×5, Pull-Up 3×5\n\n**Day 2 — Lower Strength**\nSquat 4×4, Romanian Deadlift 3×6, Leg Press 3×8, Nordic Curl 3×8\n\n**Day 3 — Upper Hypertrophy**\nIncline DB Press 4×10, Cable Row 4×10, DB Shoulder Press 3×12, Lat Pulldown 3×12\n\n**Day 4 — Lower Hypertrophy**\nFront Squat 4×8, Leg Curl 4×10, Bulgarian Split Squat 3×12, Calf Raise 4×15\n\nThis is your system. Want me to add progressions and weekly structure?`;
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
