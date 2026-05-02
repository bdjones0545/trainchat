import type { ButtonActionPayload } from "@/hooks/useStreamMessage";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Infer semantic actionType from free-text button label. */
function inferActionType(text: string): ButtonActionPayload["actionType"] {
  const lower = text.toLowerCase();
  if (lower.includes("harder") || lower.includes("intense")) return "make_harder";
  if (lower.includes("easier") || lower.includes("simple")) return "make_easier";
  return "refine_program";
}

/**
 * Infer ActionScope routing hint from a try-saying chip prompt.
 *
 * "architecture" — block/phase level directional change → hierarchical engine
 * "program"      — global constraint/equipment change → mutation pipeline (all sessions)
 * "session"      — day-specific change → session mutation pipeline
 * undefined      — let the server resolve via pattern matching
 */
function inferTrySayingScope(prompt: string): ButtonActionPayload["scope"] {
  const lower = prompt.toLowerCase();
  // Architecture: global directional/periodization changes → Performance Architect
  if (/make this (more |a bit )?(athletic|explosive|powerful|strong)/i.test(lower)) return "architecture";
  if (/progress this (for )?\d+[ -]?weeks?/i.test(lower)) return "architecture";
  if (/add more explosive/i.test(lower)) return "architecture";
  if (/make this (a |an )?(re[\-\s]?entry|power|strength|hypertrophy)/i.test(lower)) return "architecture";
  // Program: global constraint/equipment changes → mutation pipeline (all sessions)
  if (/remove all/i.test(lower)) return "program";
  if (/replace.*equipment|no barbell|dumbbell.only|no gym/i.test(lower)) return "program";
  if (/make this.*joint.friendly|knee.friendly|shoulder.friendly/i.test(lower)) return "program";
  // Session-scope: day-specific or exercise-specific
  if (/\bday \d/i.test(lower)) return "session";
  // Default: let the server decide
  return undefined;
}

// ── Factories ─────────────────────────────────────────────────────────────────

/** CTA button inside a conversational card (ReturnSessionHook, etc.) */
export function makeCtaRefinePayload(
  displayText: string,
  submittedText: string,
  programId?: number | null,
): ButtonActionPayload {
  return {
    source: "system_cta",
    actionType: "refine_program",
    displayText,
    submittedText,
    ...(programId != null ? { programId } : {}),
  };
}

/** Empty-state suggestion chip that starts a new build. */
export function makeStarterChipPayload(
  label: string,
  prompt: string,
): ButtonActionPayload {
  return {
    source: "starter_prompt",
    actionType: "build_program",
    displayText: label,
    submittedText: prompt,
  };
}

/**
 * In-chat button action (FirstValueOverlay, etc.).
 * actionType is inferred from the button text via keyword matching.
 */
export function makeChatButtonPayload(
  text: string,
  programId?: number | null,
): ButtonActionPayload {
  return {
    source: "chat_button",
    actionType: inferActionType(text),
    displayText: text,
    submittedText: text,
    ...(programId != null ? { programId } : {}),
  };
}

/** "Try saying" chip shown below the input bar when a program is active. */
export function makeTrySayingPayload(
  prompt: string,
  programId?: number | null,
): ButtonActionPayload {
  const scope = inferTrySayingScope(prompt);
  return {
    source: "try_saying",
    actionType: "refine_program",
    displayText: prompt,
    submittedText: prompt,
    ...(scope !== undefined ? { scope } : {}),
    ...(programId != null ? { programId } : {}),
  };
}

/** Retry payload — clones the original and overrides source to "retry". */
export function makeRetryPayload(
  original: ButtonActionPayload,
): ButtonActionPayload {
  return { ...original, source: "retry" };
}
