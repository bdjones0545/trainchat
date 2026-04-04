// ─── TrainChat Response Template & Communication Layer ────────────────────────
//
// Sits AFTER the decision tree, mutation engine, and transformation engine.
// Standardizes how the agent communicates based on the type of action taken.
//
// Four response modes:
//   EXECUTION_RESPONSE   — a program change was made (mutation or transformation)
//   CLARIFICATION_RESPONSE — ambiguity that materially affects the output
//   COACHING_RESPONSE    — conceptual or guidance-based question, no program change
//   ADAPTIVE_RESPONSE    — readiness, fatigue, or pain-driven session adjustment
//
// Usage:
//   1. selectResponseMode(actionType) → ResponseMode
//   2. buildResponseModePrompt(mode, ctx) → injected into system prompt before AI call
//   3. formatShortCircuitResponse(mode, ctx) → used when no AI call is made

import { type ActionType } from "./decision";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseMode =
  | "EXECUTION_RESPONSE"
  | "CLARIFICATION_RESPONSE"
  | "COACHING_RESPONSE"
  | "ADAPTIVE_RESPONSE";

export interface ResponseModeContext {
  // What action was taken (used to pick the right template)
  actionType: ActionType;
  mode: ResponseMode;

  // Optional rich context for better template generation
  targetDescription?: string;      // from ActionDecision.targetDescription
  inferenceRationale?: string;      // from ActionDecision.inferenceRationale
  clarifyingQuestion?: string;      // from ActionDecision.clarifyingQuestion
  transformSummary?: string;        // from TransformationLog (what changed)
  hasActiveProgram?: boolean;
  userMessage?: string;
}

// ─── Mode Selection ────────────────────────────────────────────────────────────
//
// Maps ActionType → ResponseMode.
// Every action type maps to exactly one mode.

const ACTION_TO_MODE: Record<ActionType, ResponseMode> = {
  DIRECT_MUTATION:          "EXECUTION_RESPONSE",
  STRUCTURAL_REBUILD:       "EXECUTION_RESPONSE",
  PROGRAM_GENERATION:       "EXECUTION_RESPONSE",
  PROGRAM_RETRIEVAL:        "EXECUTION_RESPONSE",
  PROGRAM_SAVE:             "EXECUTION_RESPONSE",
  SESSION_ADJUSTMENT:       "ADAPTIVE_RESPONSE",
  ASK_CLARIFYING_QUESTION:  "CLARIFICATION_RESPONSE",
  GUIDANCE_ONLY:            "COACHING_RESPONSE",
};

export function selectResponseMode(actionType: ActionType): ResponseMode {
  const mode = ACTION_TO_MODE[actionType] ?? "COACHING_RESPONSE";
  logger.debug({ actionType, mode }, "[ResponseTemplates] Mode selected");
  return mode;
}

// ─── System Prompt Injection ───────────────────────────────────────────────────
//
// Injected as the final section of the system prompt, immediately before the
// AI generates its response. This overrides the general communication style
// with mode-specific, precise formatting requirements.
//
// These are instructions FOR the AI, not the final response itself.

export function buildResponseModePrompt(ctx: ResponseModeContext): string {
  switch (ctx.mode) {

    // ──────────────────────────────────────────────────────────────────────────
    // EXECUTION_RESPONSE
    // Used whenever a program change was made — generation, mutation, or rebuild.
    // Format: brief acknowledgment → what changed → why (1 sentence max) →
    //         "Updated plan is in the right panel."
    // ──────────────────────────────────────────────────────────────────────────
    case "EXECUTION_RESPONSE": {
      const isGeneration = ctx.actionType === "PROGRAM_GENERATION";
      const isStructural = ctx.actionType === "STRUCTURAL_REBUILD";
      const isMutation = ctx.actionType === "DIRECT_MUTATION";
      const isSave = ctx.actionType === "PROGRAM_SAVE";
      const isRetrieval = ctx.actionType === "PROGRAM_RETRIEVAL";

      if (isRetrieval) {
        return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Output exactly 1-2 sentences. No lists, no headers, no program text.
Confirm the program is ready in the right panel. Nothing more.
Example: "Your program is ready in the right panel whenever you need it."
DO NOT repeat the program structure in chat.`;
      }

      if (isSave) {
        return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Output exactly 1 sentence confirming the save. No lists, no headers.
Example: "Done — program saved and ready in the right panel."`;
      }

      if (isGeneration) {
        return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Use this exact structure — no headers, no extra sections:

Line 1: One sentence confirming what type of program was built and for whom.
Line 2: One sentence on the key structural decision (split, frequency, goal alignment).
Line 3: "Updated plan is in the right panel."

Total: 3 lines, 3 sentences maximum.
Do NOT: list exercises in chat, repeat information from the JSON, use bullet points, add preamble.
DO: be direct, confident, and concise.

Example:
"Built a 4-day upper/lower program focused on hypertrophy with your equipment in mind.
The split gives each muscle group twice-weekly contact at manageable volume — the most proven structure for your goal.
Updated plan is in the right panel."`;
      }

      if (isStructural) {
        return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Use this exact structure — no headers, no extra sections:

Line 1: One sentence stating what structural change was made (e.g., "Converted this to a full-body structure").
Line 2: One sentence on what was preserved and what changed (key compound lifts kept, volume redistributed, etc.).
Line 3: "Updated plan is in the right panel."

Total: 3 lines, 3 sentences maximum.
Do NOT: describe every exercise, use bullet points, overexplain the reasoning.
DO: be direct, confident — you made the decision already, just confirm it.

Example:
"Converted this to a push/pull/legs structure across 3 days.
Main compound lifts are preserved — volume is redistributed so each pattern hits twice per week with proper recovery.
Updated plan is in the right panel."`;
      }

      if (isMutation) {
        return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Use this exact structure — no headers, no extra sections:

Line 1: One sentence stating what was changed (be specific — the exercise, the day, the volume).
Line 2 (optional): One sentence on why — only include if it adds real value. Skip if obvious.
Final line: "Updated plan is in the right panel."

Total: 2-3 lines maximum.
Do NOT: list exercises, use bullet points, write paragraphs.
DO: be surgical and specific — one change, clearly stated.

Examples:
"Swapped incline barbell press for landmine press — better shoulder-safe alternative with the same horizontal push stimulus.
Updated plan is in the right panel."

"Added calf raises to both lower-body sessions as a finisher.
Updated plan is in the right panel."

"Trimmed accessory volume across the week to keep sessions under 60 minutes. Primary and secondary compound work is untouched.
Updated plan is in the right panel."`;
      }

      // Generic execution fallback
      return `## RESPONSE FORMAT — THIS MESSAGE ONLY
3 sentences maximum. State what changed, why (briefly), and confirm the plan is updated.
End with: "Updated plan is in the right panel."
No bullet points. No headers. No lists. No program repetition in chat.`;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CLARIFICATION_RESPONSE
    // Used only when ambiguity materially affects the outcome.
    // Format: exactly 1 question, options offered when possible.
    // ──────────────────────────────────────────────────────────────────────────
    case "CLARIFICATION_RESPONSE":
      return `## RESPONSE FORMAT — THIS MESSAGE ONLY
Ask exactly ONE clarifying question. That's it — nothing else.
Rules:
- One question, one sentence.
- Offer 2-3 concrete options when possible (makes answering faster for the user).
- Do NOT explain why you're asking.
- Do NOT start with "Sure," "Of course," "Great question," or any filler phrase.
- Do NOT add any other content — just the question.

Examples of good clarification:
"Should I keep this at 4 days or move to a tighter 3-day setup?"
"Are you adjusting for today only, or do you want to make this the permanent structure?"
"Do you want to replace it with something similar, or would you prefer a lower-fatigue option?"

Deliver the question directly. No preamble.`;

    // ──────────────────────────────────────────────────────────────────────────
    // COACHING_RESPONSE
    // Used for conceptual or guidance questions — no program change.
    // Format: direct answer, educational, concise, no fluff.
    // ──────────────────────────────────────────────────────────────────────────
    case "COACHING_RESPONSE":
      return `## RESPONSE FORMAT — THIS MESSAGE ONLY
This is a coaching/guidance response — no program change.
Rules:
- Answer in 2-4 sentences.
- Be direct and confident. State your recommendation clearly.
- Educational when it adds value — explain the *why* briefly.
- No bullet lists unless comparing 2-3 specific options.
- No preamble, no filler, no hedging.
- Do NOT start with "Great question," "Absolutely," or any filler phrase.
- Do NOT offer to "build a program now" unless the user asks.

Style: calm authority. You are the expert — act like it.

Examples:
"A full-body structure gives you better frequency and recovery balance at 3 days per week. Upper/lower becomes more efficient at 4+ days where you can afford more volume per session."

"Upper/lower at 4 days is the most validated structure for hypertrophy — twice-weekly contact per muscle group with enough intra-session volume. Full body at 4 days dilutes per-muscle stimulus."

"Romanian deadlifts are a better option for hamstring hypertrophy than leg curls in most programs — they load the hamstring through a longer range and have stronger evidence for long-head growth."`;

    // ──────────────────────────────────────────────────────────────────────────
    // ADAPTIVE_RESPONSE
    // Used when adjusting for readiness, fatigue, or pain.
    // Format: acknowledge state → explain adjustment → reinforce control.
    // ──────────────────────────────────────────────────────────────────────────
    case "ADAPTIVE_RESPONSE":
      return `## RESPONSE FORMAT — THIS MESSAGE ONLY
This is an adaptive response for readiness, fatigue, or pain adjustment.
Use this exact structure:

Line 1: Acknowledge what the user reported (fatigue, pain, poor sleep, low readiness). 1 sentence, empathetic but not dramatic.
Line 2: State what was adjusted and what was kept. Be specific — "reduced accessory volume" not "made it easier."
Line 3 (optional): Reinforce their control — 1 sentence. Only include if it adds real value.
Final line: "Updated plan is in the right panel." — include only if the program was actually changed.

Total: 2-4 lines maximum. No bullet points. No headers.
Do NOT: overexplain, be overly empathetic, lecture about recovery.
DO: be direct, supportive, and specific about the adjustment.

Examples:
"Since recovery is low today, I reduced session density while keeping your main compound work intact.
Accessory volume is cut back — the primary stimulus is still there.
Updated plan is in the right panel."

"For the shoulder issue, I've replaced pressing volume with shoulder-safe alternatives and kept your pulling work unchanged.
Updated plan is in the right panel."

"With limited sleep last night, cutting down to the primary lifts only makes sense — skip the accessory volume today and make it up later in the week."`;
  }
}

// ─── Short-Circuit Response Formatter ─────────────────────────────────────────
//
// Generates pre-formed response text for paths where no AI call is made.
// Used for: ASK_CLARIFYING_QUESTION, RETRIEVE_CURRENT_PROGRAM, SAVE_PROGRAM.
//
// These responses must be consistent with the templates above.

export interface ShortCircuitContext {
  mode: ResponseMode;
  hasActiveProgram: boolean;
  clarifyingQuestion?: string;
  userMessage?: string;
}

export function formatShortCircuitResponse(ctx: ShortCircuitContext): string {
  switch (ctx.mode) {

    case "CLARIFICATION_RESPONSE":
      // The decision tree already formed the question — return it as-is.
      // The question is already in the correct format (sharp, 1 question, options).
      return ctx.clarifyingQuestion ?? "Can you give me a bit more detail on what you'd like to change?";

    case "EXECUTION_RESPONSE":
      // RETRIEVE or SAVE short-circuits
      if (ctx.hasActiveProgram) {
        return "Your program is ready in the right panel whenever you need it.";
      }
      return "There's no active program yet. Let's build one — what are your training goals and how many days per week do you have?";

    case "COACHING_RESPONSE":
    case "ADAPTIVE_RESPONSE":
      // These modes don't short-circuit — they always go through AI.
      // This fallback should never be reached in practice.
      return "Let me think through that for you.";
  }
}

// ─── Response Mode Logging ────────────────────────────────────────────────────

export function logResponseMode(ctx: ResponseModeContext): void {
  logger.info(
    {
      actionType: ctx.actionType,
      responseMode: ctx.mode,
      targetDescription: ctx.targetDescription,
    },
    "[ResponseTemplates] Response mode active"
  );
}
