/**
 * Sentry integration tests
 *
 * Verifies:
 * - scrubSentryEvent removes sensitive headers and body fields
 * - scrubObject redacts sensitive keys at any depth
 * - captureWithTags is safe to call when Sentry is not initialized
 * - the module can be imported without SENTRY_DSN without throwing
 * - existing error handling is unchanged (captureWithTags is a no-op without DSN)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/node before importing our sentry module so init() is never
// called during tests (and no real HTTP connections are made).
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn().mockImplementation((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setContext: vi.fn() })
  ),
  setUser: vi.fn(),
  setupExpressErrorHandler: vi.fn((app: unknown) => app),
}));

// Import after mock is registered
import { scrubObject, scrubSentryEvent, captureWithTags, sentryEnabled, generateRequestId } from "../sentry";
import * as SentryMod from "@sentry/node";

// ─── scrubObject ─────────────────────────────────────────────────────────────

describe("scrubObject", () => {
  it("passes through non-sensitive keys unchanged", () => {
    expect(scrubObject({ name: "Alice", age: 30 })).toEqual({ name: "Alice", age: 30 });
  });

  it("filters keys containing 'password'", () => {
    const result = scrubObject({ username: "alice", password: "hunter2" }) as Record<string, unknown>;
    expect(result["username"]).toBe("alice");
    expect(result["password"]).toBe("[Filtered]");
  });

  it("filters keys containing 'secret'", () => {
    const result = scrubObject({ clientSecret: "abc123" }) as Record<string, unknown>;
    expect(result["clientSecret"]).toBe("[Filtered]");
  });

  it("filters keys containing 'token'", () => {
    const result = scrubObject({ accessToken: "tok_xyz", data: "safe" }) as Record<string, unknown>;
    expect(result["accessToken"]).toBe("[Filtered]");
    expect(result["data"]).toBe("safe");
  });

  it("filters keys containing 'apikey' (case-insensitive)", () => {
    const result = scrubObject({ ApiKey: "sk-test", apiKey: "sk-live" }) as Record<string, unknown>;
    expect(result["ApiKey"]).toBe("[Filtered]");
    expect(result["apiKey"]).toBe("[Filtered]");
  });

  it("filters keys containing 'stripe'", () => {
    const result = scrubObject({ stripeWebhookSecret: "whsec_xxx" }) as Record<string, unknown>;
    expect(result["stripeWebhookSecret"]).toBe("[Filtered]");
  });

  it("filters keys containing 'openai'", () => {
    const result = scrubObject({ openaiApiKey: "sk-abc" }) as Record<string, unknown>;
    expect(result["openaiApiKey"]).toBe("[Filtered]");
  });

  it("recursively scrubs nested objects", () => {
    const result = scrubObject({
      user: { email: "test@example.com", password: "secret123" },
    }) as Record<string, unknown>;
    const user = result["user"] as Record<string, unknown>;
    expect(user["email"]).toBe("test@example.com");
    expect(user["password"]).toBe("[Filtered]");
  });

  it("handles arrays by scrubbing each element", () => {
    const result = scrubObject([{ password: "bad" }, { name: "ok" }]) as Array<Record<string, unknown>>;
    expect(result[0]?.["password"]).toBe("[Filtered]");
    expect(result[1]?.["name"]).toBe("ok");
  });

  it("returns non-objects as-is", () => {
    expect(scrubObject("plain string")).toBe("plain string");
    expect(scrubObject(42)).toBe(42);
    expect(scrubObject(null)).toBeNull();
  });
});

// ─── scrubSentryEvent ────────────────────────────────────────────────────────

describe("scrubSentryEvent", () => {
  it("removes authorization header", () => {
    const event = {
      request: {
        headers: { authorization: "Bearer tok_secret", "content-type": "application/json" },
      },
    };
    const result = scrubSentryEvent(event) as typeof event;
    expect(result.request.headers["authorization"]).toBe("[Filtered]");
    expect(result.request.headers["content-type"]).toBe("application/json");
  });

  it("removes cookie header", () => {
    const event = {
      request: { headers: { cookie: "session=abc123", host: "api.example.com" } },
    };
    const result = scrubSentryEvent(event) as typeof event;
    expect(result.request.headers["cookie"]).toBe("[Filtered]");
    expect(result.request.headers["host"]).toBe("api.example.com");
  });

  it("removes stripe-signature header", () => {
    const event = {
      request: { headers: { "stripe-signature": "t=1234,v1=abc" } },
    };
    const result = scrubSentryEvent(event) as typeof event;
    expect((result.request.headers as Record<string, string>)["stripe-signature"]).toBe("[Filtered]");
  });

  it("removes x-api-key header", () => {
    const event = {
      request: { headers: { "x-api-key": "tc_live_abc" } },
    };
    const result = scrubSentryEvent(event) as typeof event;
    expect((result.request.headers as Record<string, string>)["x-api-key"]).toBe("[Filtered]");
  });

  it("scrubs sensitive fields from request body", () => {
    const event = {
      request: {
        headers: { "content-type": "application/json" },
        data: { username: "bob", password: "hunter2", email: "bob@example.com" },
      },
    };
    const result = scrubSentryEvent(event) as any;
    expect(result.request.data.username).toBe("bob");
    expect(result.request.data.password).toBe("[Filtered]");
    expect(result.request.data.email).toBe("bob@example.com");
  });

  it("returns event unchanged when no request property", () => {
    const event = { level: "error", message: "something broke" };
    const result = scrubSentryEvent(event);
    expect(result).toEqual(event);
  });

  it("is header-key case-insensitive", () => {
    const event = {
      request: {
        headers: { Authorization: "Bearer token", COOKIE: "s=x" },
      },
    };
    const result = scrubSentryEvent(event) as any;
    expect(result.request.headers["Authorization"]).toBe("[Filtered]");
    expect(result.request.headers["COOKIE"]).toBe("[Filtered]");
  });
});

// ─── captureWithTags ─────────────────────────────────────────────────────────

describe("captureWithTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call Sentry.captureException when sentryEnabled is false", () => {
    // sentryEnabled is false in tests (NODE_ENV=test or no SENTRY_DSN)
    const err = new Error("test error");
    captureWithTags(err, { subsystem: "ai" });
    expect(SentryMod.captureException).not.toHaveBeenCalled();
  });

  it("does not throw when called with any error type", () => {
    expect(() => captureWithTags(new Error("oops"), { subsystem: "test" })).not.toThrow();
    expect(() => captureWithTags("string error", { subsystem: "test" })).not.toThrow();
    expect(() => captureWithTags(null, { subsystem: "test" })).not.toThrow();
    expect(() => captureWithTags(undefined, { subsystem: "test" })).not.toThrow();
  });
});

// ─── sentryEnabled flag ───────────────────────────────────────────────────────

describe("sentryEnabled", () => {
  it("is false in test environment (NODE_ENV=test or no SENTRY_DSN)", () => {
    // The test environment should never send real events.
    // Either NODE_ENV=test or SENTRY_DSN is absent keeps this false.
    expect(sentryEnabled).toBe(false);
  });
});

// ─── generateRequestId ────────────────────────────────────────────────────────

describe("generateRequestId", () => {
  it("returns a UUID-format string", () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns a unique ID on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, generateRequestId));
    expect(ids.size).toBe(20);
  });
});
