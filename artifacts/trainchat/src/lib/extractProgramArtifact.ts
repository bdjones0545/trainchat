/**
 * Shared program-artifact extraction contract.
 *
 * Used by:
 *   - MessageBubble.tsx  — message-level render suppression
 *   - chat.tsx           — immediate commit (handleSend) + messages-effect restore
 *   - guest-start.tsx    — guest AssistantMessage suppression + localStorage cleanup
 *
 * One contract, one set of patterns, no drift between call sites.
 *
 * Failure modes handled:
 *   A. Valid, parseable program JSON (fenced or bare) — full extraction + panel display
 *   B. Complete fence but malformed/truncated JSON inside — suppression only
 *   C. Truncated/missing closing fence — suppression only
 */

export interface ProgramData {
  programName?: string;
  days: unknown[];
  _type?: string;
  _buildMeta?: unknown;
  [key: string]: unknown;
}

/**
 * Core guard: is this a structurally valid program data object?
 * Excludes system control tokens so they are never mis-treated as programs.
 */
function isValidProgramData(data: unknown): data is ProgramData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (
    d._type === "system_edit" ||
    d._type === "fail_safe" ||
    d._type === "block_completed" ||
    d._type === "week_advanced" ||
    d._type === "session_logged"
  ) {
    return false;
  }
  return Array.isArray(d.days) && (d.days as unknown[]).length > 0;
}

/**
 * Normalize line endings consistently before any regex or split operation.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Heuristic: does this text fragment contain program-like keys?
 * Used to detect truncated/malformed JSON that cannot be fully parsed.
 * Requires at least two distinct program-specific keys to avoid false positives.
 */
function looksLikeProgramContent(fragment: string): boolean {
  const keys = [
    '"programName"',
    '"days"',
    '"exercises"',
    '"sets"',
    '"reps"',
    '"dayNumber"',
    '"splitType"',
    '"progressionStrategy"',
  ];
  let hits = 0;
  for (const key of keys) {
    if (fragment.includes(key)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

/**
 * Detect whether a closing fence (``` on its own line) exists AFTER the
 * opening fence position. Used to distinguish complete vs. truncated fences.
 *
 * A closing fence is: newline + optional whitespace + ``` + optional whitespace
 * + (newline or end-of-string). This intentionally does NOT match the opening
 * ```json line itself (which has "json" or other text after ```).
 */
function hasClosingFenceAfter(n: string, afterIdx: number): boolean {
  const rest = n.slice(afterIdx);
  return /\n\s*```\s*(\n|$)/.test(rest);
}

/**
 * Detect a program artifact in truncated or malformed JSON fences.
 * Returns true when we can identify this as "definitely program JSON"
 * even though the JSON itself can't be fully parsed.
 *
 * This covers backend failure modes:
 *   - Token-limit truncation (opening fence, no closing fence)
 *   - Valid fence structure but JSON.parse fails (malformed mid-response)
 */
export function isProgramFragment(content: string): boolean {
  const n = normalize(content);

  // Case B+C: opening ```json fence present
  const jsonFenceIdx = n.search(/```\s*json\s*\n/i);
  if (jsonFenceIdx !== -1) {
    const openEnd = n.indexOf("\n", jsonFenceIdx) + 1;
    const hasClose = hasClosingFenceAfter(n, openEnd);
    const fragment = hasClose
      ? n.slice(openEnd, n.indexOf("\n```", openEnd))
      : n.slice(openEnd);
    return looksLikeProgramContent(fragment);
  }

  // Case B+C: opening bare ``` fence present (no language tag)
  const bareFenceIdx = n.search(/```\n/);
  if (bareFenceIdx !== -1) {
    const openEnd = bareFenceIdx + 4; // skip "```\n"
    const hasClose = hasClosingFenceAfter(n, openEnd);
    const fragment = hasClose
      ? n.slice(openEnd, n.indexOf("\n```", openEnd))
      : n.slice(openEnd);
    return looksLikeProgramContent(fragment);
  }

  return false;
}

/**
 * Extract the raw program data object from a message's structuredData and/or
 * content string.  Returns the first valid match, null if none found.
 *
 * Attempt order:
 *   1. structuredData  (pre-extracted by backend — fastest path)
 *   2. content — fenced ```json ... ``` block  (case-insensitive)
 *   3. content — fenced ``` ... ``` block  (no language tag)
 *   4. content — bare JSON object ending the content  (no fence at all)
 *
 * Note: truncated/malformed fences (failure modes B+C) are NOT returned here
 * because the JSON cannot be safely parsed into a ProgramData object.
 * Use isProgramFragment() to detect those and suppress rendering only.
 */
export function extractProgramData(
  structuredData: string | null | undefined,
  content: string
): ProgramData | null {
  // ── 1. structuredData ────────────────────────────────────────────────────
  if (structuredData) {
    try {
      const data: unknown = JSON.parse(structuredData);
      if (isValidProgramData(data)) return data;
    } catch {
      /* fall through */
    }
  }

  // ── 2–4. content ─────────────────────────────────────────────────────────
  const n = normalize(content);

  // 2. Fenced ```json (case-insensitive, optional whitespace after ```)
  const fenceJsonMatch = n.match(/```\s*json\s*\n([\s\S]*?)\n\s*```/i);
  if (fenceJsonMatch) {
    try {
      const data: unknown = JSON.parse(fenceJsonMatch[1]);
      if (isValidProgramData(data)) return data;
    } catch {
      /* fall through */
    }
  }

  // 3. Fenced ``` (no language tag)
  const fenceBareMatch = n.match(/```\n([\s\S]*?)\n\s*```/);
  if (fenceBareMatch) {
    try {
      const data: unknown = JSON.parse(fenceBareMatch[1]);
      if (isValidProgramData(data)) return data;
    } catch {
      /* fall through */
    }
  }

  // 4. Bare JSON object — largest {...} block terminating the content
  //    (minimum 50 chars to avoid accidentally matching small inline objects)
  const bareMatch = n.match(/(\{[\s\S]{50,}\})\s*$/);
  if (bareMatch) {
    try {
      const data: unknown = JSON.parse(bareMatch[1]);
      if (isValidProgramData(data)) return data;
    } catch {
      /* fall through */
    }
  }

  return null;
}

/** Convenience boolean: does this message contain a valid program artifact? */
export function isProgramArtifact(
  structuredData: string | null | undefined,
  content: string
): boolean {
  return extractProgramData(structuredData, content) !== null;
}

/**
 * Return the content string with the program JSON blob removed.
 * Leaves surrounding conversational text intact so it can still render.
 *
 * Handles all patterns in order, including truncated/malformed fences
 * (failure modes B+C) that extractProgramData cannot fully parse.
 *
 * Pattern order:
 *   2a. Truncated ```json fence (opening fence, no closing fence)
 *   2b. Complete ```json fence (valid or malformed JSON inside)
 *   3a. Truncated bare ``` fence
 *   3b. Complete bare ``` fence
 *   4.  Bare JSON object at end of content
 */
export function stripProgramJson(content: string): string {
  const n = normalize(content);

  // ── 2a. Truncated ```json fence (no closing ```) ─────────────────────────
  // Strip from the opening fence to end of content.
  // Detection: has ```json opening BUT no closing fence on its own line.
  const hasJsonOpen = /```\s*json\s*\n/i.test(n);
  if (hasJsonOpen) {
    const jsonFenceIdx = n.search(/```\s*json\s*\n/i);
    const openEnd = n.indexOf("\n", jsonFenceIdx) + 1;
    if (!hasClosingFenceAfter(n, openEnd)) {
      const fragment = n.slice(openEnd);
      if (looksLikeProgramContent(fragment)) {
        return n.slice(0, jsonFenceIdx).trim();
      }
    }
  }

  // ── 2b. Complete ```json fence (strips even if JSON is malformed) ────────
  if (hasJsonOpen && /```\s*json\s*\n[\s\S]*?\n\s*```/i.test(n)) {
    return n.replace(/```\s*json\s*\n[\s\S]*?\n\s*```/gi, "").trim();
  }

  // ── 3a. Truncated bare ``` fence (no closing ```) ────────────────────────
  const hasBareOpen = /```\n/.test(n);
  if (hasBareOpen) {
    const bareFenceIdx = n.search(/```\n/);
    const openEnd = bareFenceIdx + 4;
    if (!hasClosingFenceAfter(n, openEnd)) {
      const fragment = n.slice(openEnd);
      if (looksLikeProgramContent(fragment)) {
        return n.slice(0, bareFenceIdx).trim();
      }
    }
  }

  // ── 3b. Complete bare ``` fence ──────────────────────────────────────────
  if (hasBareOpen && /```\n[\s\S]*?\n\s*```/.test(n)) {
    return n.replace(/```\n[\s\S]*?\n\s*```/g, "").trim();
  }

  // ── 4. Bare JSON — try to verify it's a program before stripping ─────────
  const bareMatch = n.match(/(\{[\s\S]{50,}\})\s*$/);
  if (bareMatch) {
    try {
      const data: unknown = JSON.parse(bareMatch[1]);
      if (isValidProgramData(data)) {
        return n.slice(0, n.lastIndexOf(bareMatch[1])).trim();
      }
    } catch {
      /* not valid JSON — leave untouched */
    }
  }

  return n.trim();
}
