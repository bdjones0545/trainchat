/**
 * OpenAI Model Configuration — Single Source of Truth
 *
 * All OpenAI model IDs used anywhere in the API server are declared here.
 * To migrate a model, change it in this file only — never hardcode model
 * strings elsewhere in the codebase.
 */

export const OPENAI_MODELS = {
  /**
   * Primary model for the core AI chat/generation loop (lib/ai.ts).
   * Upgraded to gpt-4.1 in Step 3 — highest-value generation surface.
   * Edit and fallback services remain on gpt-4o pending later validation.
   */
  CORE: "gpt-4.1",

  /**
   * Lightweight routing/intent detection for guest chat.
   * Intentionally isolated for fast, low-cost intent detection — this role
   * was migrated first as the safest, lowest-risk test path for model upgrades.
   */
  ROUTING: "gpt-4.1-mini",

  /**
   * Full response generation inside guest chat.
   * Upgraded to gpt-4.1 in Step 3 — highest-value generation surface.
   * Edit and fallback services remain on gpt-4o pending later validation.
   */
  GUEST_RESPONSE: "gpt-4.1",

  /**
   * Program generation for guest (unauthenticated) users.
   * Upgraded to gpt-4.1 in Step 3 — highest-value generation surface.
   * Edit and fallback services remain on gpt-4o pending later validation.
   */
  PROGRAM_GENERATION: "gpt-4.1",

  /**
   * Applies structured edit plans to the training system.
   * Upgraded to gpt-4.1 in Step 4 — part of the structured edit layer.
   * Fallback and backstop services remain on gpt-4o pending Step 5.
   */
  EDIT_ENGINE: "gpt-4.1",

  /**
   * Classifies natural-language edit intent into a machine-readable plan.
   * Upgraded to gpt-4.1 in Step 4 — part of the structured edit layer.
   * Fallback and backstop services remain on gpt-4o pending Step 5.
   */
  EDIT_INTENT: "gpt-4.1",

  /**
   * Generates exercise directions / coaching cues.
   * Upgraded to gpt-4.1 in Step 4 — part of the structured edit layer.
   * Fallback and backstop services remain on gpt-4o pending Step 5.
   */
  DIRECTIONS: "gpt-4.1",

  /** Fallback resolver for harder/easier progressions */
  EXERCISE_FALLBACK: "gpt-4o",

  /** Last-resort exercise swap when the local graph has no match */
  SWAP_BACKSTOP: "gpt-4o",

  /** Generates captions and summaries for share moments */
  SHARE_MOMENTS: "gpt-4o",
} as const;

export type OpenAIModelKey = keyof typeof OPENAI_MODELS;
export type OpenAIModelValue = (typeof OPENAI_MODELS)[OpenAIModelKey];
