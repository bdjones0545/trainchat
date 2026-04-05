import { getGuestSession, updateGuestSession } from "./guestService";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GuestChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildGuestChatSystemPrompt(): string {
  return `You are TrainChat — an elite AI performance architect and strength coach. You operate at the intersection of PhD-level exercise science, professional strength & conditioning, and world-class coaching.

## YOUR ROLE
You are building a personalized training program WITH the user in real time — through conversation. You do not ask all your questions at once. You gather information naturally and progressively, like a real coach would on a first call.

## CONVERSATION FLOW
Start by understanding their core goal. Then progressively collect the context you need to build a great program:
- What they want to achieve (goal)
- Training experience level
- Available equipment and training environment
- Schedule / days per week they can train
- Any injuries, limitations, or pain points
- Training style preferences (powerlifting, bodybuilding, athletic, etc.)
- Sport or performance focus if relevant

Do NOT dump all these questions at once. Ask 1-2 naturally based on what they've shared. When you have enough context, start building their program conversationally — either as part of the chat or by offering to generate it.

## PERSONALITY
- Expert, collaborative, high-performance
- Warm confidence — you're a trusted coach, not a robot
- Concise and direct — never wordy or generic
- Conversational, not like a form or questionnaire
- Motivating but grounded
- Honest about what works

## RESPONSE FORMAT
- Keep responses focused and scannable
- Use line breaks for readability
- When describing exercises or programs, be specific and structured
- Use markdown formatting: **bold** for exercise names, headings for day structure
- Do NOT use filler phrases like "Great question!" or "Certainly!"

## WHAT YOU CAN DO IN CHAT
- Ask smart follow-up questions to profile the user
- Offer training advice and education
- Design full programs (structured with days, exercises, sets/reps/rest)
- Adjust programs based on feedback
- Answer questions about training science, exercise mechanics, nutrition, recovery
- Build custom protocols for specific goals

## NSCA STANDARDS (apply to any program you design)
Exercise order within sessions:
1. Plyometric/Explosive movements first (CNS must be fresh)
2. Olympic lifts / High-skill power work
3. Primary strength compounds (squat, deadlift, bench, press, row)
4. Secondary compounds
5. Accessory / Isolation
6. Conditioning last

Rep zones:
- Strength: 1–6 reps | 3–6 sets | 2–5 min rest
- Hypertrophy: 6–12 reps | 2–4 sets | 60–90 sec rest
- Endurance/Metabolic: 12+ reps | 2–3 sets | 30–60 sec rest

## OPENING CONTEXT
The user has just arrived. Your first message should get them started immediately — not onboard them through a form. Get them excited about what you can build together.`;
}

// ─── OpenAI Call (conversational, non-JSON) ───────────────────────────────────

async function callOpenAIChat(
  messages: GuestChatMessage[],
  maxTokens = 600
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
        { role: "system", content: buildGuestChatSystemPrompt() },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
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

// ─── Fallback responses ───────────────────────────────────────────────────────

function buildFallbackResponse(
  userMessage: string,
  history: GuestChatMessage[]
): string {
  const lower = userMessage.toLowerCase();
  const isFirst = history.length <= 1;

  if (isFirst) {
    return `I can build you a fully personalized training program — and adapt it as you grow.\n\nTo get started, what's your primary goal right now? Build muscle, get stronger, lose fat, improve performance, or something else?`;
  }

  if (lower.match(/muscle|hypertrophy|size|big/)) {
    return `Muscle building is one of the best long-term investments you can make.\n\nA few quick questions to make this specific to you:\n- How long have you been training seriously?\n- What equipment do you have access to?`;
  }

  if (lower.match(/strength|strong|power|lift/)) {
    return `Strength is the foundation of everything. Let's build something that moves the needle.\n\nTo design your program:\n- How many days per week can you train?\n- Any injuries or limitations I should know about?`;
  }

  if (lower.match(/fat|weight|lean|cut|lose/)) {
    return `Body composition comes down to training hard, preserving muscle, and managing energy.\n\nTell me more:\n- What's your training experience level?\n- Do you have access to a gym or training at home?`;
  }

  if (lower.match(/beginner|new|start|just started/)) {
    return `Starting is the hardest part — and you're here. Let's build something sustainable.\n\nFor a beginner program, I need to know:\n- How many days per week are you committing to?\n- What equipment do you have? (Full gym, home setup, bodyweight only?)`;
  }

  if (lower.match(/3 day|4 day|5 day|days?.?week|per week/)) {
    return `Good. Frequency matters. Now let's dial in the details:\n- What's your primary goal — strength, muscle, fat loss, or performance?\n- Any injuries, limitations, or movements to avoid?`;
  }

  return `Understood. To build this out properly:\n- What does your training history look like? Beginner, intermediate, or advanced?\n- What equipment do you have access to?`;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export const GUEST_CHAT_LIMIT = 5; // free messages before paywall

export interface GuestChatResult {
  response: string;
  messageCount: number;
  limitReached: boolean;
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

  // Limit check — user has already used all free messages
  if (currentCount >= GUEST_CHAT_LIMIT) {
    return {
      response: "",
      messageCount: currentCount,
      limitReached: true,
    };
  }

  // Build conversation for OpenAI (include history + new message)
  const fullHistory: GuestChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  let response: string;
  try {
    response = await callOpenAIChat(fullHistory);
    if (!response.trim()) throw new Error("Empty response");
  } catch (err: any) {
    if (err.message !== "NO_API_KEY") {
      logger.warn({ err: err.message, deviceId }, "Guest chat OpenAI failed — using fallback");
    }
    response = buildFallbackResponse(userMessage, fullHistory);
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
    { deviceId, messageCount: newCount, limitReached },
    "Guest chat message processed"
  );

  return {
    response,
    messageCount: newCount,
    limitReached,
  };
}
