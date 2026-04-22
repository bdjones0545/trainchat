/**
 * Shared program-artifact extraction contract.
 *
 * Used by:
 *   - MessageBubble.tsx  — message-level render suppression
 *   - chat.tsx           — immediate commit (handleSend) + messages-effect restore
 *
 * One contract, one set of patterns, no drift between call sites.
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
 * Extract the raw program data object from a message's structuredData and/or
 * content string.  Returns the first valid match, null if none found.
 *
 * Attempt order:
 *   1. structuredData  (pre-extracted by backend — fastest path)
 *   2. content — fenced ```json ... ``` block  (case-insensitive)
 *   3. content — fenced ``` ... ``` block  (no language tag)
 *   4. content — bare JSON object ending the content  (no fence at all)
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
 * Handles all four extraction patterns in the same order as extractProgramData.
 * If no program JSON is found, returns the original content unchanged.
 */
export function stripProgramJson(content: string): string {
  const n = normalize(content);

  // 2. Fenced ```json
  if (/```\s*json\s*\n[\s\S]*?\n\s*```/i.test(n)) {
    return n.replace(/```\s*json\s*\n[\s\S]*?\n\s*```/gi, "").trim();
  }

  // 3. Fenced ``` (no language)
  if (/```\n[\s\S]*?\n\s*```/.test(n)) {
    return n.replace(/```\n[\s\S]*?\n\s*```/g, "").trim();
  }

  // 4. Bare JSON — try to verify it's a program before stripping
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
