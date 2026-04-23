/**
 * program-enrichment.ts — Pass 2 of the lean two-pass generation architecture.
 *
 * Pass 1 (skeleton): compact JSON with minimal notes (in ai.ts buildSkeletonCompactInstruction)
 * Pass 2 (enrichment): optional per-session enrichment that adds coaching cues,
 *   movement rationale, and share-ready session copy WITHOUT re-running the full
 *   program build. Invoked on demand after the skeleton is stored.
 *
 * This module is intentionally lightweight — it has no side effects on the stored
 * program and returns enrichment data as a plain object that callers can merge.
 */

import { OPENAI_MODELS } from "./openai-models";
import { logger } from "./logger";
import type { ProgramStructure, ProgramDay, Exercise } from "./ai";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EnrichmentOptions {
  coaching?: boolean;
  rationale?: boolean;
  shareText?: boolean;
}

export interface EnrichedExercise extends Exercise {
  coachingCue?: string;
  rationale?: string;
}

export interface EnrichedDay {
  dayNumber: number;
  name: string;
  focus?: string;
  exercises: EnrichedExercise[];
  shareText?: string;
}

export interface EnrichmentResult {
  dayNumber: number;
  enriched: EnrichedDay | null;
  error?: string;
  enrichmentMs: number;
}

// ── Token budget (per-session enrichment only) ────────────────────────────
// ~60 tokens per exercise (cue + rationale) × 6 exercises + 80 for shareText
const ENRICHMENT_MAX_TOKENS = 600;

// ── Internal helpers ───────────────────────────────────────────────────────

function buildEnrichmentSystemPrompt(): string {
  return `You are TrainChat — an elite coaching system. You will receive a training session skeleton (exercise list with sets/reps/rest) and must enrich it with coaching detail.

OUTPUT FORMAT: Return valid JSON only. Start with \`\`\`json, end with \`\`\`. No other text.

The JSON shape is:
{
  "dayNumber": number,
  "name": string,
  "focus": string,
  "exercises": [
    {
      "name": string,
      "coachingCue": string (≤12 words — single most important technical cue),
      "rationale": string (≤10 words — why this exercise is in this position)
    }
  ],
  "shareText": string (optional — 1–2 sentence session summary for social sharing, ≤25 words)
}

Rules:
- coachingCue: most impactful single technical directive. No paragraphs.
- rationale: position/pairing rationale. "Primary CNS lift — max intensity window." style.
- shareText: exciting, athlete-facing language. No trainer-speak.
- Do not repeat the exercise name in the coachingCue.
- Total output must stay within the token budget. Be brief.`;
}

function buildEnrichmentUserMessage(day: ProgramDay, options: EnrichmentOptions): string {
  const exList = day.exercises
    .map((ex, i) =>
      `${i + 1}. ${ex.name} (${ex.classification ?? "unknown"}) — ${ex.sets}×${ex.reps} @ ${ex.rest} rest`
    )
    .join("\n");

  const requestedFields = [
    options.coaching !== false && "coachingCue",
    options.rationale !== false && "rationale",
    options.shareText !== false && "shareText",
  ]
    .filter(Boolean)
    .join(", ");

  return `Session: ${day.name}${day.focus ? ` (${day.focus})` : ""}

Exercises:
${exList}

Enrich with: ${requestedFields}
Return JSON only.`;
}

async function callEnrichmentAPI(
  systemPrompt: string,
  userMessage: string
): Promise<{ content: string; ms: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const t0 = Date.now();
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODELS.PROGRAM_GENERATION,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: ENRICHMENT_MAX_TOKENS,
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Enrichment API error ${resp.status}: ${errText}`);
  }

  const data = (await resp.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content ?? "";
  return { content, ms: Date.now() - t0 };
}

function parseEnrichmentJSON(raw: string): EnrichedDay | null {
  try {
    const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1] : raw.trim();
    return JSON.parse(jsonStr) as EnrichedDay;
  } catch {
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as EnrichedDay;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Enrich a single training day with coaching cues, rationale, and share copy.
 * This is the core Pass 2 primitive — call once per session as needed.
 *
 * @param program  The full skeleton program (used for context metadata).
 * @param dayIndex Zero-based index of the session to enrich.
 * @param options  Flags controlling which enrichment fields to generate.
 */
export async function enrichProgramSession(
  program: ProgramStructure,
  dayIndex: number,
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult> {
  const day = program.days[dayIndex];
  if (!day) {
    return {
      dayNumber: dayIndex + 1,
      enriched: null,
      error: `Day index ${dayIndex} not found in program (${program.days.length} days total)`,
      enrichmentMs: 0,
    };
  }

  const t0 = Date.now();
  try {
    const systemPrompt = buildEnrichmentSystemPrompt();
    const userMessage = buildEnrichmentUserMessage(day, options);
    const { content, ms } = await callEnrichmentAPI(systemPrompt, userMessage);

    const parsed = parseEnrichmentJSON(content);

    if (process.env.NODE_ENV !== "production") {
      console.log("[EnrichmentAudit]", JSON.stringify({
        dayNumber: day.dayNumber,
        dayName: day.name,
        enrichmentMs: ms,
        parseSucceeded: parsed !== null,
        outputChars: content.length,
        exercisesEnriched: parsed?.exercises?.length ?? 0,
        hasShareText: !!(parsed?.shareText),
      }));
    }

    if (!parsed) {
      logger.warn({ dayIndex, rawLength: content.length }, "[enrichProgramSession] Failed to parse enrichment JSON");
      return {
        dayNumber: day.dayNumber,
        enriched: null,
        error: "Parse failure",
        enrichmentMs: Date.now() - t0,
      };
    }

    return {
      dayNumber: day.dayNumber,
      enriched: parsed,
      enrichmentMs: Date.now() - t0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ dayIndex, error: message }, "[enrichProgramSession] Enrichment call failed");
    return {
      dayNumber: day.dayNumber,
      enriched: null,
      error: message,
      enrichmentMs: Date.now() - t0,
    };
  }
}

/**
 * Enrich all sessions in a program. Returns results indexed by day number.
 * Sessions with failures are returned with enriched: null so the skeleton
 * is always the fallback.
 *
 * @param program   The full skeleton program.
 * @param options   Enrichment field flags.
 * @param parallel  Whether to fire all sessions concurrently (default: false — sequential to respect rate limits).
 */
export async function enrichAllSessions(
  program: ProgramStructure,
  options: EnrichmentOptions = {},
  parallel = false
): Promise<Map<number, EnrichmentResult>> {
  const results = new Map<number, EnrichmentResult>();

  if (parallel) {
    const settled = await Promise.all(
      program.days.map((_, i) => enrichProgramSession(program, i, options))
    );
    settled.forEach((r) => results.set(r.dayNumber, r));
  } else {
    for (let i = 0; i < program.days.length; i++) {
      const result = await enrichProgramSession(program, i, options);
      results.set(result.dayNumber, result);
    }
  }

  return results;
}
