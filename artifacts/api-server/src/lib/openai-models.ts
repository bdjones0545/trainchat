/**
 * OpenAI Model Configuration — Single Source of Truth
 *
 * All OpenAI model IDs used anywhere in the API server are declared here.
 * To migrate a model, change it in this file only — never hardcode model
 * strings elsewhere in the codebase.
 */

export const OPENAI_MODELS = {
  /** Primary model for the core AI chat/generation loop (lib/ai.ts) */
  CORE: "gpt-4o",

  /** Lightweight routing/intent detection for guest chat */
  ROUTING: "gpt-4o-mini",

  /** Full response generation inside guest chat */
  GUEST_RESPONSE: "gpt-4o",

  /** Program generation for guest (unauthenticated) users */
  PROGRAM_GENERATION: "gpt-4o",

  /** Applies structured edit plans to the training system */
  EDIT_ENGINE: "gpt-4o",

  /** Classifies natural-language edit intent into a machine-readable plan */
  EDIT_INTENT: "gpt-4o",

  /** Generates exercise directions / coaching cues */
  DIRECTIONS: "gpt-4o",

  /** Fallback resolver for harder/easier progressions */
  EXERCISE_FALLBACK: "gpt-4o",

  /** Last-resort exercise swap when the local graph has no match */
  SWAP_BACKSTOP: "gpt-4o",

  /** Generates captions and summaries for share moments */
  SHARE_MOMENTS: "gpt-4o",
} as const;

export type OpenAIModelKey = keyof typeof OPENAI_MODELS;
export type OpenAIModelValue = (typeof OPENAI_MODELS)[OpenAIModelKey];
