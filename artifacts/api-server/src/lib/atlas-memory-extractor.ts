/**
 * AtlasMemoryExtractor
 *
 * Calls OpenAI with a focused extraction prompt to pull durable coaching
 * signals from a conversation transcript.
 *
 * Called asynchronously via setImmediate — never blocks the chat SSE path.
 * Returns an array of raw extracted memories ready for upsert via AtlasMemoryStore.
 */

import { OPENAI_MODELS } from "./openai-models";
import { logger } from "./logger";

export interface ExtractedMemory {
  category: string;
  summary: string;
  normalizedKey: string;
  confidence: number;
  importance: number;
}

export interface ConversationMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are Atlas, an AI performance coach. Extract durable coaching memories from the conversation transcript.

RULES:
- Only extract training-relevant information that would still matter in a future conversation.
- Be conservative: fewer, higher-quality memories beat many weak ones.
- Do NOT store: one-off casual comments, temporary moods (unless training-relevant), exact timestamps, overly personal non-training details.
- DO store: injuries, physical constraints, equipment availability, schedule limits, training preferences, disliked exercises, sport context, recovery patterns, clear goals, and successful refinements.

MEMORY CATEGORIES:
- goal: Training goal or objective ("wants to improve 40-yard dash time")
- constraint: Physical limitation affecting programming ("limited hip mobility affects squat depth")
- injury: Pain or injury requiring management ("reports knee pain during deep squats")
- preference: Training style or method preference ("prefers athletic performance over bodybuilding")
- disliked_exercise: Exercise the user dislikes or wants to avoid ("dislikes burpees and box jumps")
- equipment: Equipment availability or limitation ("has dumbbells only, no barbell access")
- schedule: Schedule or time constraint ("can only train 3 days per week, under 45 minutes per session")
- sport_context: Sport, activity, or performance context ("plays football, wide receiver position")
- recovery_pattern: How the user recovers or responds to load ("needs more recovery between heavy lower body sessions")
- successful_refinement: A change that worked well ("responded well to reducing squat frequency to 2x per week")
- recurring_request: Something the user consistently asks for ("consistently asks to increase upper body volume")

FOR EACH MEMORY:
- summary: 1 concise sentence written as a coaching note, third person (e.g. "User reports knee discomfort during deep squats.")
- normalizedKey: lowercase dedup slug, format "category:subject_slug" (e.g. "injury:knee_deep_squats", "equipment:no_barbell", "preference:athletic_performance_focus")
- confidence: 1–5 (1=mentioned once casually, 3=stated clearly, 5=confirmed repeatedly or highly specific)
- importance: 1–5 (1=minor preference, 3=moderately affects programming, 5=safety-critical or shapes all programming)

OUTPUT (valid JSON only, no other text):
{
  "memories": [
    {
      "category": "injury",
      "summary": "User reports knee discomfort during deep squats and split squats.",
      "normalizedKey": "injury:knee_deep_squats",
      "confidence": 3,
      "importance": 4
    }
  ]
}

If no durable coaching memories are present, return: { "memories": [] }`;

/** Maximum number of recent messages to include in the extraction transcript */
const MAX_MESSAGES = 40;

/** Maximum memories returned per extraction pass */
const MAX_MEMORIES_PER_PASS = 12;

export async function extractMemoriesFromConversation(
  conversationId: number,
  messages: ConversationMessage[],
): Promise<ExtractedMemory[]> {
  const relevant = messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-MAX_MESSAGES);

  if (relevant.length < 2) {
    return [];
  }

  const transcript = relevant
    .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content.trim()}`)
    .join("\n\n");

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_API_KEY
    ? "https://api.openai.com/v1"
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");

  if (!apiKey) {
    logger.warn({ conversationId }, "[AtlasMemoryExtractor] No API key — skipping extraction");
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.MEMORY_EXTRACTOR,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Extract coaching memories from this conversation:\n\n---\n${transcript}\n---`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      logger.warn(
        { conversationId, status: resp.status },
        "[AtlasMemoryExtractor] OpenAI returned non-200",
      );
      return [];
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data?.choices?.[0]?.message?.content ?? "";

    let parsed: { memories?: unknown[] };
    try {
      parsed = JSON.parse(content) as { memories?: unknown[] };
    } catch {
      logger.warn({ conversationId, content }, "[AtlasMemoryExtractor] Failed to parse JSON");
      return [];
    }

    if (!Array.isArray(parsed?.memories)) {
      return [];
    }

    return (parsed.memories as unknown[])
      .filter((m): m is ExtractedMemory => {
        if (typeof m !== "object" || m === null) return false;
        const obj = m as Record<string, unknown>;
        return (
          typeof obj["category"] === "string" &&
          typeof obj["summary"] === "string" &&
          typeof obj["normalizedKey"] === "string" &&
          typeof obj["confidence"] === "number" &&
          typeof obj["importance"] === "number" &&
          (obj["summary"] as string).length > 5 &&
          (obj["normalizedKey"] as string).length > 3
        );
      })
      .slice(0, MAX_MEMORIES_PER_PASS);
  } catch (err) {
    clearTimeout(timeout);
    logger.warn(
      { conversationId, err: err instanceof Error ? err.message : String(err) },
      "[AtlasMemoryExtractor] Extraction failed",
    );
    return [];
  }
}
