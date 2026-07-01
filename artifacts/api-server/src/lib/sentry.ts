/**
 * Sentry error-tracking integration.
 *
 * This module MUST be imported before any other application module in index.ts.
 * Sentry v8 uses OpenTelemetry instrumentation that patches Node.js module
 * loading — initialization before Express and other dependencies ensures
 * automatic HTTP/DB instrumentation works correctly.
 *
 * When SENTRY_DSN is absent the module is a complete no-op: all exported
 * functions return immediately, Sentry.init() is never called, and no
 * performance overhead is incurred.
 */

import * as Sentry from "@sentry/node";
import { randomUUID } from "node:crypto";

// ─── Sensitive field redaction ────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "stripe-signature",
  "x-api-key",
  "x-session-token",
  "x-admin-secret",
  "x-openai-key",
]);

// Substring match — any key containing one of these strings is redacted
const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "sessionid",
  "session_id",
  "private",
  "credential",
  "authorization",
  "stripe",
  "openai",
  "sendgrid",
];

export function scrubObject(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  if (Array.isArray(data)) return (data as unknown[]).map(scrubObject);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lk = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_SUBSTRINGS.some((s) => lk.includes(s));
    result[key] = isSensitive ? "[Filtered]" : scrubObject(value);
  }
  return result;
}

export function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
  const e: Record<string, unknown> = { ...event };

  const request = e["request"] as Record<string, unknown> | undefined;
  if (request) {
    const updated: Record<string, unknown> = { ...request };

    const headers = request["headers"] as Record<string, string> | undefined;
    if (headers) {
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        safe[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "[Filtered]" : v;
      }
      updated["headers"] = safe;
    }

    if (request["data"] !== undefined && request["data"] !== null) {
      updated["data"] = scrubObject(request["data"]);
    }

    e["request"] = updated;
  }

  return e;
}

// ─── Initialization ───────────────────────────────────────────────────────────

const dsn = process.env.SENTRY_DSN?.trim();

// Do not run Sentry during automated test runs.
export const sentryEnabled: boolean =
  Boolean(dsn) && process.env.NODE_ENV !== "test";

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    // Performance monitoring off by default — this integration is error-tracking only.
    // Enable by setting SENTRY_TRACES_SAMPLE_RATE in the environment.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    // Strip sensitive data before any event leaves the process.
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
    },
  });
}

export { Sentry };

// ─── Request IDs ─────────────────────────────────────────────────────────────

/** Generate a unique request ID to correlate Sentry events with logs. */
export function generateRequestId(): string {
  return randomUUID();
}

// ─── Scoped capture helpers ───────────────────────────────────────────────────

export type SentryTags = Record<string, string>;

/**
 * Capture an exception with additional structured tags.
 * No-op when Sentry is not enabled.
 */
export function captureWithTags(err: unknown, tags: SentryTags): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
    Sentry.captureException(err);
  });
}

/**
 * Set the authenticated user on the current Sentry scope.
 * Safe to call with undefined — clears the user context.
 */
export function setSentryUser(userId: number | string | undefined): void {
  if (!sentryEnabled) return;
  if (userId !== undefined) {
    Sentry.setUser({ id: String(userId) });
  } else {
    Sentry.setUser(null);
  }
}
