import { describe, it, expect, vi } from "vitest";
import { sanitizeKevinPayload } from "../kevin-payload-sanitizer";

const allow = new Set([
  "goal_category",
  "exercise_count",
  "movement_categories",
  "kevin_context_used",
  "nested",
  "items",
  "note",
]);

describe("sanitizeKevinPayload (H5 recursive allowlist)", () => {
  it("preserves a valid flat payload verbatim", () => {
    const out = sanitizeKevinPayload(
      { goal_category: "strength", exercise_count: 7, kevin_context_used: true },
      { allow },
    );
    expect(out).toEqual({ goal_category: "strength", exercise_count: 7, kevin_context_used: true });
  });

  it("drops unexpected top-level keys (allowlist, not denylist)", () => {
    const out = sanitizeKevinPayload(
      { goal_category: "strength", user_email: "a@b.com", comment: "call me", free_text: "x" },
      { allow },
    );
    expect(out).toEqual({ goal_category: "strength" });
  });

  it("drops explicitly-forbidden keys even though they are not named in the allowlist", () => {
    const out = sanitizeKevinPayload(
      { email: "a@b.com", injury: "torn ACL", full_program: { days: [] }, ssn: "1" },
      { allow },
    );
    expect(out).toEqual({});
  });

  it("recurses into nested objects and drops forbidden nested keys (the core denylist bug)", () => {
    const out = sanitizeKevinPayload(
      {
        nested: { kevin_context_used: true, email: "a@b.com", injury: "acl" },
        goal_category: "speed",
      },
      { allow },
    );
    expect(out).toEqual({ nested: { kevin_context_used: true }, goal_category: "speed" });
  });

  it("recurses into arrays, keeping allowed primitives and filtering array-of-objects", () => {
    const out = sanitizeKevinPayload(
      {
        movement_categories: ["squat", "push", "pull"],
        items: [
          { exercise_count: 3, email: "a@b.com" },
          { goal_category: "strength" },
        ],
      },
      { allow },
    );
    expect(out).toEqual({
      movement_categories: ["squat", "push", "pull"],
      items: [{ exercise_count: 3 }, { goal_category: "strength" }],
    });
  });

  it("drops values nested deeper than maxDepth", () => {
    const deep = { nested: { nested: { nested: { nested: { goal_category: "x" } } } } };
    const out = sanitizeKevinPayload(deep, { allow, maxDepth: 2 });
    // At depth 2 the further-nested object is dropped entirely.
    expect(out).toEqual({ nested: { nested: {} } });
  });

  it("truncates over-long strings and caps array length", () => {
    const out = sanitizeKevinPayload(
      { note: "a".repeat(5000), movement_categories: Array.from({ length: 500 }, () => "x") },
      { allow, maxStringLength: 100, maxArrayLength: 50 },
    );
    expect((out.note as string).length).toBe(100);
    expect((out.movement_categories as unknown[]).length).toBe(50);
  });

  it("drops non-JSON-safe values (functions, bigint, NaN, undefined, Date)", () => {
    const out = sanitizeKevinPayload(
      {
        goal_category: "ok",
        exercise_count: NaN,
        note: (() => "fn") as unknown as string,
        kevin_context_used: undefined as unknown as boolean,
      },
      { allow },
    );
    expect(out).toEqual({ goal_category: "ok" });
  });

  it("reports dropped keys via onDropped for observability", () => {
    const dropped: string[] = [];
    sanitizeKevinPayload(
      { goal_category: "ok", email: "a@b.com", nested: { injury: "acl" } },
      { allow, onDropped: (k) => dropped.push(k) },
    );
    expect(dropped).toContain("email");
    expect(dropped).toContain("injury");
  });

  it("returns {} for non-object input", () => {
    expect(sanitizeKevinPayload(null as unknown as Record<string, unknown>, { allow })).toEqual({});
    expect(sanitizeKevinPayload([1, 2] as unknown as Record<string, unknown>, { allow })).toEqual({});
  });
});
