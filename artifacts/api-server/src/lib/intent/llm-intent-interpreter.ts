// ─── LLM Intent Interpreter ───────────────────────────────────────────────────
//
// Lightweight AI router that runs BEFORE the deterministic execution planner.
// Converts natural-language user messages into structured StructuredIntent JSON,
// reducing dependency on regex patches for conversational edge cases.
//
// INVARIANTS:
//   - The interpreter NEVER writes to the database.
//   - The interpreter NEVER mutates the training program directly.
//   - The interpreter only classifies and rewrites the user message.
//   - If the API call fails or times out, the function returns null and the
//     deterministic planner continues unchanged (graceful degradation).
//
// Integration thresholds (enforced by the planner, not here):
//   confidence ≥ 0.75 + isActionable → planner may use plan built from output
//   confidence 0.45–0.74 + isActionable → rewrite message, run deterministic planner
//   confidence < 0.45 → deterministic planner runs on original message unchanged

import { OPENAI_MODELS } from "../openai-models";
import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMActionType =
  | "create_program"
  | "modify_program"
  | "answer_question"
  | "clarify"
  | "safety";

export type LLMContextType =
  | "sport"
  | "goal"
  | "equipment"
  | "duration"
  | "phase"
  | "pain"
  | "fatigue"
  | "style"
  | "exercise"
  | "session"
  | "program"
  | "unknown";

export type LLMScope =
  | "full_program"
  | "day"
  | "session"
  | "exercise"
  | "unknown";

export interface LLMIntentInput {
  rawMessage: string;
  activeProgramExists: boolean;
  pendingClarification: {
    pendingAspect: string;
    clarificationQuestion?: string;
  } | null;
  currentProgramSummary: string | null;
  conversationContext: string | null;
  recentReferences: string | null;
  focusMode?: string | null;
}

export interface LLMIntentResult {
  isActionable: boolean;
  actionType: LLMActionType;
  intentFamily: string;
  contextType: LLMContextType;
  value: string | null;
  scope: LLMScope;
  targetType: "program" | "day" | "session" | "exercise" | null;
  targetLabel: string | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  interpretedCommand: string;
  defaultScopeUsed: boolean;
  safetyConcern: string | null;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a training intent interpreter for TrainChat, an AI fitness coaching app.

Your ONLY job: convert user messages into structured JSON that describes intent.
You NEVER write code, NEVER modify programs, NEVER make training decisions.

## SCOPE DEFAULTS (critical — get these right)
Default scope to "full_program" for ANY of these context types:
- sport (football, hockey, soccer, basketball…)
- goal (weight loss, fat loss, build muscle, performance…)
- equipment (full gym, dumbbells, bodyweight, home gym…)
- duration (45 min, shorter sessions, too long…)
- phase (in season, off season, preseason, deload…)
- fatigue (tired, exhausted, wiped, cooked, drained, sore…)
- pain (knees hurt, bad back, shoulder pain, hip tight…)
- style (more athletic, explosive, functional, less intense…)
- intensity (make it harder, easier, dial it back…)

ONLY use "exercise" scope when the user explicitly names a specific exercise OR uses "this exercise", "that exercise", "exercise 2", etc.
ONLY use "day" or "session" scope when user says "day 2", "this day", "session 3", etc.

## PENDING CLARIFICATION HANDLING
If pendingClarification is set (e.g., "Which exercise did you mean?") and the new message is a CONTEXT COMMAND (sport/goal/equipment/fatigue/pain/duration/phase/style), treat it as a NEW full-program intent — NOT as an answer to the clarification.
If the message clearly answers the pending clarification (e.g., "bench press" when asked which exercise), treat it as a clarification answer with low confidence so the deterministic planner handles it.

## EXAMPLE MAPPINGS
- "football" → modify_program, sport, full_program, confidence: 0.97
- "make it for hockey" → modify_program, sport, full_program, confidence: 0.97
- "weight loss" → modify_program, goal, full_program, confidence: 0.95
- "too long" → modify_program, duration, full_program, interpretedCommand: "Shorten the current program sessions.", confidence: 0.93
- "I'm cooked" / "I'm wiped" / "exhausted" / "drained" → modify_program, fatigue, full_program, confidence: 0.92
- "knees hurt" / "bad knee" / "knee pain" → modify_program, pain, full_program, confidence: 0.94
- "more athletic" → modify_program, style, full_program, confidence: 0.93
- "full gym" / "dumbbells only" → modify_program, equipment, full_program, confidence: 0.95
- "in season" / "off season" → modify_program, phase, full_program, confidence: 0.95
- "replace that" (no recentReferences) → clarify, exercise, unknown, needsClarification: true, confidence: 0.85
- "what does this do?" → answer_question, program, full_program, confidence: 0.90
- "build me a 4-day program" → create_program, program, full_program, confidence: 0.95

## CONFIDENCE GUIDE
- 0.90–1.0: Unambiguous single-context command
- 0.75–0.89: Clear intent, minor ambiguity in scope or value
- 0.45–0.74: Likely intent, better to rewrite message and use deterministic planner
- 0.0–0.44: Ambiguous — deterministic planner should handle without rewrite

## intentFamily VALUES (use exact strings)
conditioning_focus, athletic_performance_focus, injury_modification, readiness_low,
reduce_time, increase_time, strength_focus, hypertrophy_focus, endurance_focus,
power_explosive_focus, speed_focus, fatigue_management, sport_context_update,
equipment_constraint, increase_difficulty, decrease_difficulty, increase_volume,
decrease_volume, new_program_request, exercise_swap, coaching_question, clarification_required

Return ONLY valid JSON — no explanation, no markdown, no text outside the JSON object.`;

// ─── Interpreter ──────────────────────────────────────────────────────────────

const TIMEOUT_MS = 2500;

export async function runLLMIntentInterpreter(
  input: LLMIntentInput
): Promise<LLMIntentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_API_KEY
    ? "https://api.openai.com/v1"
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");

  const userContent = buildUserContent(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.INTENT_INTERPRETER,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 400,
        temperature: 0.0,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(
        { status: response.status, rawMessage: input.rawMessage.slice(0, 80) },
        "[LLMIntentInterpreter] API call failed — falling through to deterministic planner"
      );
      return null;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<LLMIntentResult>;
    return validateAndNormalize(parsed, input.rawMessage);

  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.warn(
      { isTimeout, rawMessage: input.rawMessage.slice(0, 80) },
      "[LLMIntentInterpreter] Call failed or timed out — falling through to deterministic planner"
    );
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserContent(input: LLMIntentInput): string {
  const parts: string[] = [`User message: "${input.rawMessage}"`];

  parts.push(`activeProgramExists: ${input.activeProgramExists}`);

  if (input.focusMode) {
    parts.push(`focusMode: ${input.focusMode}`);
  }

  if (input.currentProgramSummary) {
    parts.push(`currentProgram: ${input.currentProgramSummary}`);
  }

  if (input.pendingClarification) {
    parts.push(
      `pendingClarification: { pendingAspect: "${input.pendingClarification.pendingAspect}"` +
      (input.pendingClarification.clarificationQuestion
        ? `, question: "${input.pendingClarification.clarificationQuestion}"`
        : "") +
      ` }`
    );
  }

  if (input.recentReferences) {
    parts.push(`recentReferences: ${input.recentReferences}`);
  }

  if (input.conversationContext) {
    parts.push(`conversationContext: ${input.conversationContext}`);
  }

  return parts.join("\n");
}

function validateAndNormalize(
  parsed: Partial<LLMIntentResult>,
  rawMessage: string
): LLMIntentResult | null {
  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;

  const actionType = isValidActionType(parsed.actionType) ? parsed.actionType : "clarify";
  const contextType = isValidContextType(parsed.contextType) ? parsed.contextType : "unknown";
  const scope = isValidScope(parsed.scope) ? parsed.scope : "unknown";

  const interpretedCommand =
    typeof parsed.interpretedCommand === "string" && parsed.interpretedCommand.trim().length > 0
      ? parsed.interpretedCommand.trim()
      : rawMessage;

  return {
    isActionable: parsed.isActionable === true,
    actionType,
    intentFamily: typeof parsed.intentFamily === "string" ? parsed.intentFamily : "clarification_required",
    contextType,
    value: typeof parsed.value === "string" ? parsed.value : null,
    scope,
    targetType: parsed.targetType ?? null,
    targetLabel: typeof parsed.targetLabel === "string" ? parsed.targetLabel : null,
    confidence,
    needsClarification: parsed.needsClarification === true,
    clarificationQuestion: typeof parsed.clarificationQuestion === "string" ? parsed.clarificationQuestion : null,
    interpretedCommand,
    defaultScopeUsed: parsed.defaultScopeUsed === true,
    safetyConcern: typeof parsed.safetyConcern === "string" ? parsed.safetyConcern : null,
  };
}

const VALID_ACTION_TYPES = new Set<LLMActionType>([
  "create_program", "modify_program", "answer_question", "clarify", "safety",
]);
const VALID_CONTEXT_TYPES = new Set<LLMContextType>([
  "sport", "goal", "equipment", "duration", "phase", "pain", "fatigue",
  "style", "exercise", "session", "program", "unknown",
]);
const VALID_SCOPES = new Set<LLMScope>([
  "full_program", "day", "session", "exercise", "unknown",
]);

function isValidActionType(v: unknown): v is LLMActionType {
  return typeof v === "string" && VALID_ACTION_TYPES.has(v as LLMActionType);
}
function isValidContextType(v: unknown): v is LLMContextType {
  return typeof v === "string" && VALID_CONTEXT_TYPES.has(v as LLMContextType);
}
function isValidScope(v: unknown): v is LLMScope {
  return typeof v === "string" && VALID_SCOPES.has(v as LLMScope);
}
