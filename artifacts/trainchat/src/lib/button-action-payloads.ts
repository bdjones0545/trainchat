import type { ButtonActionPayload } from "@/hooks/useStreamMessage";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Infer semantic actionType from free-text button label. */
function inferActionType(text: string): ButtonActionPayload["actionType"] {
  const lower = text.toLowerCase();
  if (lower.includes("harder") || lower.includes("intense")) return "make_harder";
  if (lower.includes("easier") || lower.includes("simple")) return "make_easier";
  return "refine_program";
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
  return {
    source: "try_saying",
    actionType: "refine_program",
    displayText: prompt,
    submittedText: prompt,
    ...(programId != null ? { programId } : {}),
  };
}

/** Retry payload — clones the original and overrides source to "retry". */
export function makeRetryPayload(
  original: ButtonActionPayload,
): ButtonActionPayload {
  return { ...original, source: "retry" };
}
