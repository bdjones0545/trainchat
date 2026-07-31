// ─── Kevin Payload Sanitizer ──────────────────────────────────────────────────
//
// Shared sanitation foundation for everything TrainChat exports to Kevin
// (event payloads, outcome summaries). Fixes H5: the previous per-service
// scrubbers were top-level *denylists* — they only removed a fixed set of key
// names at the top level, so PII under an unlisted key, or nested inside an
// object/array, was forwarded verbatim, and the event/outcome lists had drifted
// apart.
//
// This replaces them with a single recursive, depth-limited ALLOWLIST walker:
//   - Only keys present in the per-payload allowlist survive, AT EVERY DEPTH.
//   - Nested objects and arrays are walked recursively (allowlist re-applied).
//   - Anything past maxDepth is dropped (prevents deeply-nested smuggling and
//     pathological recursion).
//   - Strings are length-capped; arrays are length-capped.
//   - Only JSON-safe primitives pass (string | finite number | boolean | null);
//     functions, symbols, bigint, Date, undefined, etc. are dropped.
//   - Dropped keys are reported via onDropped so drift (a new legitimate field
//     not yet added to the allowlist) is observable in logs rather than silent.
//
// Events and outcomes share THIS function; each supplies its own allowlist
// ("payload-specific schemas where necessary").

export interface KevinSanitizeOptions {
  /** Keys permitted at every level of the payload. Everything else is dropped. */
  allow: ReadonlySet<string>;
  /** Maximum object/array nesting depth to retain. Default 4. */
  maxDepth?: number;
  /** Max retained string length (longer strings are truncated). Default 1000. */
  maxStringLength?: number;
  /** Max retained array length (extra elements are dropped). Default 100. */
  maxArrayLength?: number;
  /** Called for each dropped key so allowlist drift is observable. */
  onDropped?: (key: string, reason: string) => void;
}

const DEFAULTS = {
  maxDepth: 4,
  maxStringLength: 1000,
  maxArrayLength: 100,
} as const;

interface ResolvedOptions {
  allow: ReadonlySet<string>;
  maxDepth: number;
  maxStringLength: number;
  maxArrayLength: number;
  onDropped: (key: string, reason: string) => void;
}

const OMIT = Symbol("omit");

/** A JSON-safe scalar, or OMIT to signal "drop this value entirely". */
type SanitizedLeaf = string | number | boolean | null | typeof OMIT;

function sanitizeScalar(value: unknown, opts: ResolvedOptions): SanitizedLeaf {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
      return value.length > opts.maxStringLength
        ? value.slice(0, opts.maxStringLength)
        : value;
    case "number":
      return Number.isFinite(value) ? value : OMIT; // drop NaN/Infinity (not JSON-safe)
    case "boolean":
      return value;
    default:
      return OMIT; // undefined, bigint, symbol, function, Date, etc.
  }
}

// `depth` is the nesting level of `value` itself (the root object is depth 0,
// its members depth 1, and so on). A container deeper than maxDepth is dropped.
function sanitizeValue(
  value: unknown,
  depth: number,
  opts: ResolvedOptions,
): unknown | typeof OMIT {
  if (Array.isArray(value)) {
    if (depth > opts.maxDepth) return OMIT;
    const out: unknown[] = [];
    for (const el of value) {
      if (out.length >= opts.maxArrayLength) break;
      const s = sanitizeValue(el, depth + 1, opts);
      if (s !== OMIT) out.push(s);
    }
    return out;
  }

  if (value !== null && typeof value === "object") {
    if (depth > opts.maxDepth) return OMIT;
    return sanitizeObject(value as Record<string, unknown>, depth, opts);
  }

  return sanitizeScalar(value, opts);
}

function sanitizeObject(
  input: Record<string, unknown>,
  depth: number,
  opts: ResolvedOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!opts.allow.has(key)) {
      opts.onDropped(key, "not_in_allowlist");
      continue;
    }
    const sanitized = sanitizeValue(raw, depth + 1, opts);
    if (sanitized === OMIT) {
      opts.onDropped(key, "unsupported_value_or_depth");
      continue;
    }
    out[key] = sanitized;
  }
  return out;
}

/**
 * Sanitizes an outbound Kevin payload against an allowlist, recursively.
 * Always returns a fresh plain object safe to forward to Kevin.
 */
export function sanitizeKevinPayload(
  payload: Record<string, unknown>,
  options: KevinSanitizeOptions,
): Record<string, unknown> {
  const opts: ResolvedOptions = {
    allow: options.allow,
    maxDepth: options.maxDepth ?? DEFAULTS.maxDepth,
    maxStringLength: options.maxStringLength ?? DEFAULTS.maxStringLength,
    maxArrayLength: options.maxArrayLength ?? DEFAULTS.maxArrayLength,
    onDropped: options.onDropped ?? (() => {}),
  };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return sanitizeObject(payload, 0, opts);
}
